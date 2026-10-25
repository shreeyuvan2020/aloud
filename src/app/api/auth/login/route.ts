import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { loginUrl } from "@/lib/google";
import { safeNext } from "@/lib/safeNext";

export async function GET(req: Request) {
  const next = safeNext(new URL(req.url).searchParams.get("next"));
  const state = randomBytes(16).toString("hex");
  const res = NextResponse.redirect(loginUrl(state));
  const opts = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    maxAge: 600,
    path: "/",
  };
  res.cookies.set("g_state", state, opts);
  // Tells the shared OAuth callback this is a plain sign-in, not a Classroom connect.
  res.cookies.set("g_flow", `login:${next}`, opts);
  return res;
}
