import { requireTeacher, ReauthRequired, Unauthenticated } from "./session";
import { accessTokenFor } from "./google";
import { HttpError } from "./classroom";
import { NextResponse } from "next/server";

export async function requireToken(): Promise<string> {
  const account = await requireTeacher();
  if (!account.refreshToken) {
    throw new ReauthRequired("Connect Google Classroom to import essays.");
  }
  try {
    return await accessTokenFor(account.refreshToken);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "";
    if (msg.includes("invalid_grant") || msg.includes("Token revoked")) {
      throw new ReauthRequired();
    }
    throw err;
  }
}

/**
 * Map auth failures to a status the UI can act on, rather than surfacing raw
 * provider text. A Google 4xx is the caller's problem and passes through as the
 * same 4xx; a Google 5xx is a gateway failure and becomes 502.
 */
export function googleErrorResponse(err: unknown) {
  if (err instanceof Unauthenticated) {
    return NextResponse.json({ error: err.message, code: "unauthenticated" }, { status: 401 });
  }
  if (err instanceof ReauthRequired) {
    return NextResponse.json({ error: err.message, code: "reauth" }, { status: 401 });
  }
  if (err instanceof HttpError) {
    const status = err.status >= 500 ? 502 : err.status;
    return NextResponse.json({ error: "Google rejected the request.", code: "upstream" }, { status });
  }
  const msg = err instanceof Error ? err.message : "Google request failed";
  return NextResponse.json({ error: msg }, { status: 502 });
}