import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { googleErrorResponse, requireToken } from "@/lib/account";
import { requireTeacher } from "@/lib/session";
import { fetchDocText, HttpError } from "@/lib/classroom";
import { analyzeEssay, generateQuestions } from "@/lib/analysis";

/** Each item costs a Docs fetch plus two LLM calls. Clients send this many at a
 *  time so a 32-student class doesn't overrun the function timeout — see
 *  import/page.tsx, which loops over batches and keeps partial results. Kept at
 *  3 so a batch of ~1-minute essays stays under the 300s function limit. */
export const MAX_BATCH = 3;
export const maxDuration = 300;

const MAX_ESSAY_CHARS = 20_000;

const Body = z.object({
  // Later batches of one import run send back the token from the first, so the
  // whole class lands on a single results page.
  teacherToken: z.string().regex(/^[0-9a-f]{32}$/).optional(),
  courseWorkTitle: z.string().max(300).default("Classroom assignment"),
  items: z
    .array(
      z.object({
        userId: z.string().min(1).max(64),
        docId: z.string().min(1).optional(),
        note: z.string().max(40000).optional(),
      }),
    )
    .min(1)
    .max(MAX_BATCH),
});

type Outcome = {
  userId: string;
  ok: boolean;
  teacherToken?: string;
  studentToken?: string;
  title?: string;
  error?: string;
};

/** Narrow allowlist of upstream text that is both useful and safe to show a teacher. */
function safeImportError(err: unknown): string {
  if (err instanceof HttpError) {
    if (err.status === 403 || err.status === 404 || err.status === 401) {
      return "The student's document isn't shared with you. A student who created their own Doc instead of attaching one keeps it private to themselves.";
    }
    if (err.status === 429) return "Google rate-limited the request. Wait a minute and import again.";
    return "Google couldn't read that document.";
  }
  if (err instanceof Error && err.name === "TimeoutError") {
    return "The request timed out. Try importing that student again.";
  }
  if (err instanceof Error && err.message.startsWith("chat ")) {
    return "The analysis service was unavailable for this essay. Try that student again.";
  }
  return "Could not import this essay.";
}

export async function POST(req: Request) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = Body.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  }
  const { courseWorkTitle, items } = parsed.data;
  const teacherToken = parsed.data.teacherToken ?? randomBytes(16).toString("hex");

  let token: string;
  let ownerId: string;
  try {
    ownerId = (await requireTeacher()).id;
    token = await requireToken();
  } catch (err) {
    return googleErrorResponse(err);
  }

  const results: Outcome[] = [];

  // Sequential on purpose: firing every essay at the provider at once earns
  // 429s rather than finishing sooner, and the batch is small by design.
  for (const item of items) {
    const title = `${courseWorkTitle} — student ${item.userId}`;
    try {
      // Prefer the attached document. A submission can carry both an
      // attachment and a short answer, and the essay is the attachment.
      let essayText: string | undefined;
      if (item.docId) {
        essayText = await fetchDocText(token, item.docId);
      } else {
        essayText = item.note;
      }

      if (!essayText || essayText.trim().length < 80) {
        results.push({ userId: item.userId, ok: false, error: "No readable essay text." });
        continue;
      }
      if (essayText.length > MAX_ESSAY_CHARS) {
        essayText = essayText.slice(0, MAX_ESSAY_CHARS);
      }

      const analysis = await analyzeEssay(essayText);
      const questions = await generateQuestions(analysis, essayText);

      const assignment = await prisma.assignment.create({
        data: {
          title,
          prompt: null,
          essayText,
          analysis: JSON.stringify(analysis),
          questions: JSON.stringify(questions),
          ownerId,
          teacherToken,
          studentToken: randomBytes(16).toString("hex"),
        },
      });

      results.push({
        userId: item.userId,
        ok: true,
        title,
        teacherToken,
        studentToken: assignment.studentToken,
      });
    } catch (err) {
      const error = safeImportError(err);
      console.error(`[import] userId ${item.userId} failed`, err);
      results.push({ userId: item.userId, ok: false, error });
    }
  }

  return NextResponse.json({ results, teacherToken });
}