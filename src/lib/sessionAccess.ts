import { prisma } from "./db";

export type Session = {
  id: string;
  assignmentId: string;
  studentName: string | null;
  transcript: string;
  status: string;
  grading: string | null;
  sessionKey: string | null;
};

/**
 * Load a session and prove the caller holds its key.
 *
 * A session id is a cuid — an identifier, not a secret. Without this check,
 * knowing one cuid is enough to read a transcript, submit forged answers that
 * drive the question flow, or force grading and permanently mark a session
 * complete. The key is minted once at creation and lives only in the student's
 * own sessionStorage.
 *
 * Rows written before `sessionKey` existed have a null key and are
 * intentionally unreachable: that is the bug they predate.
 */
export async function loadOwnedSession(id: string, key: unknown): Promise<Session | null> {
  if (typeof key !== "string" || key.length !== 64) return null;

  const session = await prisma.session.findUnique({ where: { id } });
  if (!session || !session.sessionKey) return null;
  if (session.sessionKey !== key) return null;

  return session;
}

/** Parse a stored JSON column without letting a bad row take the page down. */
export function parseJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    const value = JSON.parse(raw);
    if (Array.isArray(fallback)) {
      return (Array.isArray(value) ? value : fallback) as T;
    }
    return (value && typeof value === "object" && !Array.isArray(value) ? value : fallback) as T;
  } catch {
    console.error("[parseJson] corrupt stored JSON", { preview: raw.slice(0, 80) });
    return fallback;
  }
}
