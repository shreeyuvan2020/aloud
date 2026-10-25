import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db";
import { googleErrorResponse, requireToken } from "@/lib/account";
import { ReauthRequired, SESSION_COOKIE, verifySession } from "@/lib/session";

export async function POST() {
  try {
    const token = await requireToken();
    // Prove the token still works before destroying a working connection —
    // otherwise a transient failure looks like a successful sign-out.
    const check = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!check.ok) throw new ReauthRequired();

    const jar = await cookies();
    const raw = jar.get(SESSION_COOKIE)?.value;
    const accountId = raw ? verifySession(raw) : null;
    if (accountId) {
      const account = await prisma.googleAccount.findUnique({ where: { id: accountId } });
      // Drop only the Classroom grant. The account row stays: it owns the
      // teacher's results, and disconnecting Classroom must not sign them out.
      await prisma.googleAccount.update({
        where: { id: accountId },
        data: { refreshToken: null, scopes: "" },
      });
      if (account?.refreshToken) {
        // If the refresh token is already dead the revoke call just fails
        // silently, which is fine.
        await fetch("https://oauth2.googleapis.com/revoke", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ token: account.refreshToken }),
        }).catch(() => {});
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return googleErrorResponse(err);
  }
}