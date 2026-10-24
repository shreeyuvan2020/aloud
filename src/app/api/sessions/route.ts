import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { parseJson } from "@/lib/sessionAccess";
import { nextTurn, type EssayAnalysis, type Question, type Turn } from "@/lib/analysis";
import { NotConfigured } from "@/lib/hackclub";

const Body = z.object({
  studentToken: z.string().min(1),
  studentName: z.string().max(120).optional().default(""),
});

/** Opens a session for a student link and returns the first question, already voiced. */
export async function POST(req: Request) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = Body.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const assignment = await prisma.assignment.findUnique({
    where: { studentToken: parsed.data.studentToken },
  });
  if (!assignment) return NextResponse.json({ error: "Link not found" }, { status: 404 });

  const analysis = parseJson<EssayAnalysis>(assignment.analysis, {
    thesis: "",
    claims: [],
    keyDetails: [],
    signatureDetails: [],
    weakSpots: [],
  });
  const questions = parseJson<Question[]>(assignment.questions, []);

  try {
    // Every visit is a fresh session. Resuming by assignmentId alone handed the
    // *previous* student's transcript to whoever opened the link next, merging
    // two people's answers into one grading record — and the README promises
    // the opposite ("each visit starts a fresh session").
    const opener = await nextTurn(analysis, questions, []);
    if (!opener.text.trim()) {
      return NextResponse.json(
        { error: "This essay couldn't be turned into questions. Ask your teacher to set it up again." },
        { status: 502 },
      );
    }

    const sessionKey = randomBytes(32).toString("hex");
    const session = await prisma.session.create({
      data: {
        assignmentId: assignment.id,
        studentName: parsed.data.studentName.trim() || null,
        transcript: JSON.stringify([
          { role: "ai", text: opener.text, ts: new Date().toISOString() } as Turn,
        ]),
        sessionKey,
      },
    });

    return NextResponse.json({
      sessionId: session.id,
      sessionKey,
      title: assignment.title,
      transcript: [{ role: "ai", text: opener.text, ts: new Date().toISOString() } as Turn],
      question: opener.text,
      resumed: false,
    });
  } catch (err) {
    if (err instanceof NotConfigured) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    console.error("[sessions] open failed", err);
    return NextResponse.json({ error: "Failed to open session" }, { status: 502 });
  }
}
