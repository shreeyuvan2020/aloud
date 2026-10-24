import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { authUrl } from "@/lib/google";

export async function GET() {
  const state = randomBytes(16).toString("hex");
  const res = NextResponse.redirect(authUrl(state, { forceConsent: true }));
  res.cookies.set("g_state", state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 600,
    path: "/",
  });
  return res;
}