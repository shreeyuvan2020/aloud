import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { exchangeCode, exchangeLoginCode, fetchProfile, oauthClient, SCOPES } from "@/lib/google";
import { safeNext } from "@/lib/safeNext";
import { sessionCookie, SESSION_COOKIE } from "@/lib/session";

function cookieOpts(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const denied = url.searchParams.get("error");

  const jar = await cookies();
  const expected = jar.get("g_state")?.value;
  // Set by /api/auth/login; absent for the Classroom connect flow.
  const flow = jar.get("g_flow")?.value;
  const loginNext = flow?.startsWith("login:") ? safeNext(flow.slice("login:".length)) : null;
  // Clear the CSRF cookie on every outcome, including failures, so it can't be replayed.
  const cleanup = (redirect: URL) => {
    const res = NextResponse.redirect(redirect);
    res.cookies.set("g_state", "", cookieOpts(0));
    res.cookies.set("g_flow", "", cookieOpts(0));
    return res;
  };

  // Errors for a plain sign-in go back to the page the teacher came from.
  const failTo = (error: string) =>
    cleanup(new URL(loginNext ? `/?signin_error=${error}` : `/teacher/import?error=${error}`, req.url));

  if (denied) return failTo("consent_denied");

  if (!code || !state || !expected || state !== expected) return failTo("oauth_state");

  if (loginNext !== null) {
    try {
      const profile = await fetchProfile(await exchangeLoginCode(code));
      // Never touches refreshToken: signing in must not disconnect Classroom.
      const account = await prisma.googleAccount.upsert({
        where: { googleUserId: profile.id },
        create: { googleUserId: profile.id, email: profile.email, name: profile.name },
        update: { email: profile.email, name: profile.name },
      });
      const res = cleanup(new URL(loginNext, req.url));
      res.cookies.set(SESSION_COOKIE, sessionCookie(account.id), cookieOpts(60 * 60 * 24 * 30));
      return res;
    } catch (err) {
      console.error("[google/callback] sign-in", err);
      return failTo("oauth_failed");
    }
  }

  try {
    const refreshToken = await exchangeCode(code);

    const oauth = oauthClient();
    oauth.setCredentials({ refresh_token: refreshToken });
    const { token } = await oauth.getAccessToken();
    if (!token) throw new Error("Could not mint an access token after consent");
    const profile = await fetchProfile(token);

    const account = await prisma.googleAccount.upsert({
      where: { googleUserId: profile.id },
      create: {
        googleUserId: profile.id,
        email: profile.email,
        name: profile.name,
        refreshToken,
        scopes: SCOPES.join(" "),
      },
      update: { refreshToken, email: profile.email, name: profile.name, scopes: SCOPES.join(" ") },
    });

    const res = NextResponse.redirect(new URL("/teacher/import", req.url));
    res.cookies.set("g_state", "", cookieOpts(0));
    res.cookies.set(SESSION_COOKIE, sessionCookie(account.id), cookieOpts(60 * 60 * 24 * 30));
    return res;
  } catch (err) {
    // Stable codes only. The raw exception text goes into the redirect URL, so
    // anything logged-verbatim here becomes user-visible.
    const code =
      err instanceof Error && err.message.includes("refresh token")
        ? "no_refresh_token"
        : err instanceof Error && err.message.includes("userinfo")
          ? "profile_failed"
          : "oauth_failed";
    console.error("[google/callback]", err);
    return cleanup(new URL(`/teacher/import?error=${code}`, req.url));
  }
}