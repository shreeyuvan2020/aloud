import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { analyzeEssay, generateQuestions } from "@/lib/analysis";
import { NotConfigured } from "@/lib/hackclub";
import { getTeacher } from "@/lib/session";

const Body = z.object({
  title: z.string().min(1).max(200),
  prompt: z.string().max(4000).optional().default(""),
  essayText: z.string().min(80).max(60000),
  // Optional: lets that student sign in with Google and find this assignment.
  studentEmail: z.union([z.literal(""), z.string().email().max(254)]).optional().default(""),
});

export async function POST(req: Request) {
  // Also keeps strangers from spending the LLM budget on arbitrary essays.
  const teacher = await getTeacher();
  if (!teacher) {
    return NextResponse.json(
      { error: "Sign in with Google to set up a session.", code: "unauthenticated" },
      { status: 401 },
    );
  }

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
  const { title, prompt, essayText } = parsed.data;
  const studentEmail = parsed.data.studentEmail.trim().toLowerCase() || null;

  try {
    const analysis = await analyzeEssay(essayText);
    const questions = await generateQuestions(analysis, essayText);

    // A zero-question bank is a model failure, not a result. Writing it means
    // the student's first prompt is the goodbye, so stop here instead.
    if (questions.length < 3) {
      console.error("[assignments] model returned too few questions", { count: questions.length });
      return NextResponse.json(
        { error: "The model couldn't draft enough usable questions. Try again." },
        { status: 502 },
      );
    }

    const assignment = await prisma.assignment.create({
      data: {
        title,
        prompt,
        essayText,
        analysis: JSON.stringify(analysis),
        questions: JSON.stringify(questions),
        ownerId: teacher.id,
        studentEmail,
        teacherToken: randomBytes(16).toString("hex"),
        studentToken: randomBytes(16).toString("hex"),
      },
    });

    return NextResponse.json({
      teacherToken: assignment.teacherToken,
      studentToken: assignment.studentToken,
      questionCount: questions.length,
    });
  } catch (err) {
    if (err instanceof NotConfigured) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    if (err instanceof Error && err.name === "TimeoutError") {
      return NextResponse.json({ error: "The AI service timed out. Try again." }, { status: 504 });
    }
    console.error("[assignments] failed", err);
    return NextResponse.json({ error: "Failed to analyse essay" }, { status: 502 });
  }
}