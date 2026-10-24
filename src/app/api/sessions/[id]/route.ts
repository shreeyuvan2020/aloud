import { NextResponse } from "next/server";
import { loadOwnedSession, parseJson } from "@/lib/sessionAccess";
import type { Turn } from "@/lib/analysis";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const key = req.headers.get("x-session-key");

  const session = await loadOwnedSession(id, key);
  if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });

  const transcript = parseJson<Turn[]>(session.transcript, []);

  return NextResponse.json({
    status: session.status,
    transcript,
    answerCount: transcript.filter((t) => t.role === "student").length,
  });
}
