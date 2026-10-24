import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { exchangeCode, fetchProfile, oauthClient, SCOPES } from "@/lib/google";
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
  // Clear the CSRF cookie on every outcome, including failures, so it can't be replayed.
  const cleanup = (redirect: URL) => {
    const res = NextResponse.redirect(redirect);
    res.cookies.set("g_state", "", cookieOpts(0));
    return res;
  };

  if (denied) return cleanup(new URL("/teacher/import?error=consent_denied", req.url));

  if (!code || !state || !expected || state !== expected) {
    return cleanup(new URL("/teacher/import?error=oauth_state", req.url));
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