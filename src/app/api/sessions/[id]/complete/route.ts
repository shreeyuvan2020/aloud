import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { loadOwnedSession, parseJson } from "@/lib/sessionAccess";
import { gradeSession, type EssayAnalysis, type Question, type Turn } from "@/lib/analysis";

const EMPTY_ANALYSIS: EssayAnalysis = {
  thesis: "",
  claims: [],
  keyDetails: [],
  signatureDetails: [],
  weakSpots: [],
};

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  const session = await loadOwnedSession(id, req.headers.get("x-session-key"));
  if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });

  if (session.status === "complete") {
    const existing = parseJson<null>(session.grading, null);
    if (existing) return NextResponse.json({ grading: existing });
    return NextResponse.json({ error: "Grading is missing for this session." }, { status: 500 });
  }

  const transcript = parseJson<Turn[]>(session.transcript, []);
  if (transcript.filter((t) => t.role === "student").length === 0) {
    return NextResponse.json({ error: "Nothing to assess yet" }, { status: 400 });
  }

  try {
    const assignment = await prisma.assignment.findUniqueOrThrow({
      where: { id: session.assignmentId },
    });

    const grading = await gradeSession(
      parseJson<EssayAnalysis>(assignment.analysis, EMPTY_ANALYSIS),
      parseJson<Question[]>(assignment.questions, []),
      transcript,
    );

    // Write the transcript back from the *current* row, not the snapshot taken
    // before ~30s of grading — a turn that landed during that window would be
    // silently erased by an unconditional write here.
    await prisma.$transaction(async (tx) => {
      const fresh = await tx.session.findUniqueOrThrow({ where: { id } });
      const current = parseJson<Turn[]>(fresh.transcript, []);
      await tx.session.update({
        where: { id },
        data: {
          status: "complete",
          transcript: JSON.stringify(current),
          grading: JSON.stringify(grading),
          completedAt: new Date(),
        },
      });
    });

    return NextResponse.json({ grading });
  } catch (err) {
    console.error("[complete] grading failed", err);
    return NextResponse.json({ error: "Failed to grade session" }, { status: 502 });
  }
}
