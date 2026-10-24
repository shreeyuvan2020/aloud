import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { loadOwnedSession, parseJson } from "@/lib/sessionAccess";
import { speak, transcribe, NotConfigured } from "@/lib/hackclub";
import { nextTurn, type EssayAnalysis, type Question, type Turn } from "@/lib/analysis";

const Body = z.object({
  audio: z.string().max(12_000_000).optional(),
  text: z.string().max(4000).optional(),
});

/**
 * A WAV the client just encoded. Anything else means the payload isn't audio
 * and the provider would 4xx with a body we'd otherwise echo back at 502.
 */
const AUDIO_DATA_URI = /^data:audio\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/]+={0,2}$/;

/** Pull the student answer out of the request. Throws with a message safe to show. */
async function resolveAnswer(parsed: { audio?: string; text?: string }): Promise<string> {
  const typed = (parsed.text ?? "").trim();
  if (parsed.audio) {
    if (!AUDIO_DATA_URI.test(parsed.audio)) {
      throw new ShowAs("That recording couldn't be read. Try answering again.", 422);
    }
    const heard = await transcribe(parsed.audio);
    if (heard.trim()) return heard.trim();
  }
  if (typed) return typed;
  throw new ShowAs("I didn't catch that — hold the button and speak a bit louder.", 422);
}

class ShowAs extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = Body.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });
  if (!parsed.data.audio && !parsed.data.text) {
    return NextResponse.json({ error: "No audio or text provided" }, { status: 400 });
  }

  // Authorization: knowing the session id is not enough.
  const session = await loadOwnedSession(id, req.headers.get("x-session-key"));
  if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });
  if (session.status === "complete") {
    return NextResponse.json({ error: "Session already finished" }, { status: 409 });
  }

  const assignment = await prisma.assignment.findUniqueOrThrow({
    where: { id: session.assignmentId },
  });
  const analysis = parseJson<EssayAnalysis>(assignment.analysis, {
    thesis: "",
    claims: [],
    keyDetails: [],
    signatureDetails: [],
    weakSpots: [],
  });
  const questions = parseJson<Question[]>(assignment.questions, []);

  let answer: string;
  try {
    answer = await resolveAnswer(parsed.data);
  } catch (err) {
    if (err instanceof ShowAs) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    if (err instanceof NotConfigured) {
      return NextResponse.json({ error: err.message }, { status: 503 });
    }
    console.error("[turn] transcription failed", err);
    return NextResponse.json(
      { error: "The tutor couldn't hear that. Try answering again." },
      { status: 502 },
    );
  }

  // Persist the student turn before the model call. If nextTurn fails, the
  // answer is already on the record rather than lost with a 502. The
  // transaction returns the fresh transcript so nextTurn never reasons over a
  // stale snapshot when two turns are in flight.
  const studentTs = new Date().toISOString();
  let withAnswer: Turn[];
  await prisma.$transaction(async (tx) => {
    const fresh = await tx.session.findUniqueOrThrow({ where: { id } });
    const turns = parseJson<Turn[]>(fresh.transcript, []);
    turns.push({ role: "student", text: answer, ts: studentTs });
    withAnswer = turns;
    await tx.session.update({ where: { id }, data: { transcript: JSON.stringify(turns) } });
  });

  let move;  try {
    move = await nextTurn(analysis, questions, withAnswer!);
  } catch (err) {
    console.error("[turn] nextTurn failed", err);
    return NextResponse.json(
      { error: "The tutor had trouble thinking of the next question. Try answering again." },
      { status: 502 },
    );
  }

  // Second transaction: re-read so two overlapping turns can't overwrite each
  // other's turn the way a single read-modify-write does.
  const transcript = await prisma.$transaction(async (tx) => {
    const fresh = await tx.session.findUniqueOrThrow({ where: { id } });
    const turns = parseJson<Turn[]>(fresh.transcript, []);
    const aiTurn: Turn = { role: "ai", text: move.text, ts: new Date().toISOString() };
    if (move.note) aiTurn.note = move.note;
    if (move.questionId) aiTurn.questionId = move.questionId;
    turns.push(aiTurn);
    await tx.session.update({ where: { id }, data: { transcript: JSON.stringify(turns) } });
    return turns;
  });

  // Speech is an enhancement. A voice-enum 422 or a Replicate failure must not
  // cost the student their answer, but the client is told so it can recover.
  let audioUrl: string | null = null;
  let audioWarning: string | null = null;
  try {
    audioUrl = await speak(move.text);
  } catch (err) {
    console.error("[turn] TTS failed", err);
    audioWarning = "The question is on screen — read it and answer out loud.";
  }

  return NextResponse.json({
    transcript,
    question: move.text,
    audioUrl,
    audioWarning,
    shouldEnd: move.shouldEnd,
  });
}
