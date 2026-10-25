import { OAuth2Client } from "google-auth-library";

/**
 * Scope choice is load-bearing.
 *
 * Reading a student's essay requires reading a Google Doc the *student* owns.
 * The obvious scope, `drive.readonly`, is on Google's RESTRICTED list
 * (support.google.com/cloud/answer/13464325), which forces OAuth verification
 * AND an annual CASA security assessment for Workspace distribution.
 *
 * `documents.readonly` (Docs API) is NOT on the restricted list, and reads the
 * same file with the same authority model — the authorized user's access, gated
 * by the file's own ACL. We accept the structural-parsing cost to stay out of
 * the CASA regime entirely.
 *
 * All `classroom.*` scopes are non-restricted too.
 */
export const SCOPES = [
  "openid",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
  "https://www.googleapis.com/auth/classroom.courses.readonly",
  "https://www.googleapis.com/auth/classroom.coursework.students.readonly",
  "https://www.googleapis.com/auth/classroom.student-submissions.students.readonly",
  "https://www.googleapis.com/auth/documents.readonly",
];

/** Sign-in only: identifies the teacher, reads nothing else. */
export const LOGIN_SCOPES = [
  "openid",
  "https://www.googleapis.com/auth/userinfo.email",
  "https://www.googleapis.com/auth/userinfo.profile",
];

function clientConfig() {
  const id = process.env.GOOGLE_CLIENT_ID;
  const secret = process.env.GOOGLE_CLIENT_SECRET;
  const redirect = process.env.GOOGLE_REDIRECT_URI;
  if (!id || !secret || !redirect) {
    throw new Error(
      "GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and GOOGLE_REDIRECT_URI must be set in .env",
    );
  }
  return { clientId: id, clientSecret: secret, redirectUri: redirect };
}

export function oauthClient() {
  const { clientId, clientSecret, redirectUri } = clientConfig();
  return new OAuth2Client(clientId, clientSecret, redirectUri);
}

export function authUrl(state: string, opts: { forceConsent?: boolean } = {}) {
  return oauthClient().generateAuthUrl({
    access_type: "offline",
    // Forces the consent screen so Google always returns a refresh token.
    // Note this does NOT extend the 7-day expiry that Testing-mode apps incur.
    prompt: opts.forceConsent ? "consent" : undefined,
    scope: SCOPES,
    state,
    include_granted_scopes: true,
  });
}

/** Plain sign-in: Google returns an access token only, with no refresh token to store. */
export function loginUrl(state: string) {
  return oauthClient().generateAuthUrl({
    access_type: "online",
    scope: LOGIN_SCOPES,
    state,
  });
}

export async function exchangeLoginCode(code: string) {
  const { tokens } = await oauthClient().getToken(code);
  if (!tokens.access_token) throw new Error("Google did not return an access token");
  return tokens.access_token;
}

export async function exchangeCode(code: string) {
  const { tokens } = await oauthClient().getToken(code);
  if (!tokens.refresh_token) {
    throw new Error(
      "Google did not return a refresh token. Reconnect and accept the consent screen again.",
    );
  }
  return tokens.refresh_token;
}

/** Short-lived access token, minted just-in-time from the stored refresh token. */
export async function accessTokenFor(refreshToken: string): Promise<string> {
  const client = oauthClient();
  client.setCredentials({ refresh_token: refreshToken });
  const { token } = await client.getAccessToken();
  if (!token) throw new Error("Could not mint an access token");
  return token;
}

export type GoogleProfile = { id: string; email: string; name: string | null };

/** Identify the teacher who just authorized. Uses the signed-in user's own profile. */
export async function fetchProfile(accessToken: string): Promise<GoogleProfile> {
  const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new Error(`userinfo ${res.status}`);
  const data = await res.json();
  if (!data.sub) throw new Error("Google did not return a user id");
  return { id: data.sub, email: data.email ?? "", name: data.name ?? null };
}