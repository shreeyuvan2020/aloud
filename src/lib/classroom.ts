const CLASSROOM = "https://classroom.googleapis.com/v1";
const DOCS = "https://docs.googleapis.com/v1";

/**
 * Classroom/Docs path identifiers are alphanumeric. Any other character is
 * rejected rather than interpolated: a value carrying `/` silently changes the
 * resource, and a value carrying `#` makes `new URL()` treat the rest as a
 * fragment — the request then goes to a path that supports different verbs.
 */
const ID = /^[A-Za-z0-9_-]+$/;

export function assertId(value: string, what: string): string {
  if (!ID.test(value)) throw new HttpError(400, `Invalid ${what}.`);
  return value;
}

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Google surfaces 429 *and* transient 5xx on both Classroom and Docs. */
const RETRYABLE = new Set([429, 500, 502, 503, 504]);

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function backoff(attempt: number): number {
  return 500 * 2 ** attempt + Math.random() * 250;
}

/** Honour `Retry-After` when present so we don't fire inside Google's stated window. */
function retryAfterMs(res: Response): number | null {
  const h = res.headers.get("Retry-After");
  if (!h) return null;
  const secs = Number(h);
  if (Number.isFinite(secs)) return Math.min(Math.max(secs * 1000, 0), 30_000);
  const when = Date.parse(h);
  if (Number.isFinite(when)) return Math.min(Math.max(when - Date.now(), 0), 30_000);
  return null;
}

async function get<T>(url: string, token: string, attempts = 4): Promise<T> {
  let lastError: unknown = new HttpError(429, "Google request failed after retries.");

  for (let attempt = 0; attempt <= attempts; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(30_000),
      });
    } catch (err) {
      // Network-level failure (DNS, TLS reset, connection reset) — worth a retry.
      lastError = err;
      if (attempt < attempts) await sleep(backoff(attempt));
      else throw err;
      continue;
    }

    if (RETRYABLE.has(res.status)) {
      const body = await res.text().catch(() => "");
      lastError = new HttpError(
        res.status,
        `${res.status} ${url.split("?")[0]}: ${body.slice(0, 300)}`,
      );
      if (attempt < attempts) {
        await sleep(retryAfterMs(res) ?? backoff(attempt));
        continue;
      }
      throw lastError;
    }

    const body = await res.text();
    if (!res.ok) {
      throw new HttpError(res.status, `${res.status} ${url.split("?")[0]}: ${body.slice(0, 300)}`);
    }
    return JSON.parse(body) as T;
  }

  throw lastError;
}

type Page = { nextPageToken?: string };

async function collectPages<T extends Page>(
  build: (pageToken?: string) => string,
  token: string,
  consume: (page: T) => void,
  maxPages = 100,
): Promise<void> {
  const seen = new Set<string>();
  let pageToken: string | undefined;

  for (let page = 0; page < maxPages; page++) {
    const data = await get<T>(build(pageToken), token);
    consume(data);

    const next = data.nextPageToken;
    // End of the collection. Without this the loop re-fetches the *first* page
    // another `maxPages - 1` times, and every course, assignment and submission
    // comes back duplicated — which is what fills the import wizard with 100
    // copies of each row.
    if (!next || next.length === 0) return;
    // A repeated token would loop forever; guard against a provider that hands
    // back the same cursor.
    if (seen.has(next)) return;
    seen.add(next);
    pageToken = next;
  }
}

export type Course = { id: string; name: string; section?: string };

export async function listCourses(token: string): Promise<Course[]> {
  const out: Course[] = [];

  await collectPages<{ courses?: Course[] } & Page>(
    (pageToken) => {
      const url = new URL(`${CLASSROOM}/courses`);
      url.searchParams.set("courseStates", "ACTIVE");
      url.searchParams.set("pageSize", "100");
      // teacherId=me — without this Classroom returns enrolled (student)
      // courses too, and opening one 403s on courseWork.list because
      // coursework.students.readonly is teacher-only.
      url.searchParams.set("teacherId", "me");
      if (pageToken) url.searchParams.set("pageToken", pageToken);
      return url.toString();
    },
    token,
    (page) => {
      for (const c of page.courses ?? []) out.push({ id: c.id, name: c.name, section: c.section });
    },
  );

  return out;
}

export type CourseWork = {
  id: string;
  title: string;
  maxPoints?: number;
  workType?: string;
};

export async function listCourseWork(token: string, courseId: string): Promise<CourseWork[]> {
  assertId(courseId, "courseId");
  const out: CourseWork[] = [];

  await collectPages<{ courseWork?: CourseWork[] } & Page>(
    (pageToken) => {
      const url = new URL(`${CLASSROOM}/courses/${courseId}/courseWork`);
      // PUBLISHED only — DRAFT coursework has no submissions and would render
      // as a wall of empty rows.
      url.searchParams.set("courseWorkStates", "PUBLISHED");
      url.searchParams.set("pageSize", "100");
      if (pageToken) url.searchParams.set("pageToken", pageToken);
      return url.toString();
    },
    token,
    (page) => {
      // Essays only arrive as assignmentSubmission attachments; short-answer and
      // multiple-choice items have nothing to import.
      for (const w of page.courseWork ?? []) {
        if (w.workType === "ASSIGNMENT") out.push(w);
      }
    },
  );

  return out;
}

/**
 * A typed short answer has to clear this bar to be treated as an essay at all.
 * `api/google/import` re-checks the same source with a lower floor, so the two
 * gates are not silently different filters on the same text.
 */
export const MIN_NOTE_CHARS = 200;

export type Submission = {
  userId: string;
  state: string;
  turnedIn: boolean;
  late: boolean;
  docId: string | null;
  docTitle: string | null;
  note: string | null;
};

/**
 * The essay lives at assignmentSubmission.attachments[].driveFile.id — a Drive
 * file ID, not a `driveId`. There is no "primary attachment" marker, so we take
 * the first driveFile; Attachments may be up to 20 and ordering is not meaningful.
 *
 * RETURNED is imported alongside TURNED_IN: it means the teacher sent it back
 * for revision and the content is still real work. A resubmission moves the row
 * back to TURNED_IN, and `state` is current-only, so we never read a stale doc.
 */
export async function listSubmissions(
  token: string,
  courseId: string,
  courseWorkId: string,
): Promise<Submission[]> {
  assertId(courseId, "courseId");
  assertId(courseWorkId, "courseWorkId");
  const out: Submission[] = [];

  await collectPages<{
    studentSubmissions?: {
      userId: string;
      state: string;
      late?: boolean;
      assignmentSubmission?: {
        attachments?: { driveFile?: { id?: string; title?: string } }[];
      };
      shortAnswerSubmission?: { answer?: string };
    }[];
  } & Page>(
    (pageToken) => {
      // Submissions are a sub-resource of courseWork, not of the course.
      // There is no /v1/courses/{id}/studentSubmissions endpoint — that 404s.
      const url = new URL(
        `${CLASSROOM}/courses/${courseId}/courseWork/${courseWorkId}/studentSubmissions`,
      );
      // `states` is a repeated query param, so it must be sent as
      // states=TURNED_IN&states=RETURNED. A comma-joined value is rejected as an
      // invalid enum member.
      url.searchParams.append("states", "TURNED_IN");
      url.searchParams.append("states", "RETURNED");
      url.searchParams.set("pageSize", "100");
      if (pageToken) url.searchParams.set("pageToken", pageToken);
      return url.toString();
    },
    token,
    (page) => {
      for (const s of page.studentSubmissions ?? []) {
        const driveFile = (s.assignmentSubmission?.attachments ?? []).find((a) => a.driveFile?.id)
          ?.driveFile;
        const shortAnswer = s.shortAnswerSubmission?.answer;

        out.push({
          userId: s.userId,
          state: s.state,
          turnedIn: s.state === "TURNED_IN",
          late: s.late ?? false,
          docId: driveFile?.id ?? null,
          docTitle: driveFile?.title ?? null,
          // Short answers are usually a sentence, not an essay; only surfaced as
          // a fallback and only when it is substantial.
          note: shortAnswer && shortAnswer.trim().length >= MIN_NOTE_CHARS
            ? shortAnswer.trim()
            : null,
        });
      }
    },
  );

  return out;
}

/**
 * Extract essay text from a Google Doc.
 *
 * Docs API returns a structural tree rather than plain text, so we walk it.
 * That is the cost of avoiding the restricted `drive.readonly` scope. No
 * `fields=` mask is used here: a mask cannot express the recursion that nested
 * tables require, and omitting content would silently lose parts of an essay.
 */
export async function fetchDocText(token: string, docId: string): Promise<string> {
  assertId(docId, "docId");
  const doc = await get<{
    title?: string;
    body?: { content?: unknown[] };
  }>(`${DOCS}/documents/${docId}`, token);

  const parts: string[] = [];
  walk(doc.body?.content ?? [], parts);

  const text = parts.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!text) throw new HttpError(422, "The document appears to be empty.");
  return text;
}

interface StructuralElement {
  paragraph?: { elements?: unknown[] };
  table?: { tableRows?: { tableCells?: { content?: unknown[] }[] }[] };
}

function walk(content: unknown[], out: string[]): void {
  for (const el of content as StructuralElement[]) {
    if (el.paragraph?.elements) {
      let line = "";
      for (const child of el.paragraph.elements as { textRun?: { content?: string } }[]) {
        line += child.textRun?.content ?? "";
      }
      // Only the final run of a paragraph carries \n, so a paragraph split
      // across several runs (a bold word mid-sentence, say) would otherwise
      // gain spurious line breaks. Collapse those before treating it as one line.
      const trimmed = line.replace(/\n+/g, " ").trim();
      if (trimmed) out.push(trimmed);
    } else if (el.table?.tableRows) {
      for (const row of el.table.tableRows) {
        for (const cell of row.tableCells ?? []) {
          walk(cell.content ?? [], out);
        }
      }
    }
  }
}