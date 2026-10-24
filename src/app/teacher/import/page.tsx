"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { Course, CourseWork, Submission } from "@/lib/classroom";
import { CheckIcon, ClockIcon, ImportIcon } from "@/components/icons";

const BATCH = 3;

/** Thrown when Google auth is missing — the connect card says this already. */
const NOT_CONNECTED = "Connect your Google account to continue.";

/** Stable codes emitted by /api/google/callback. Never surface raw exceptions. */
const CALLBACK_ERRORS: Record<string, string> = {
  oauth_state: "The sign-in attempt didn't validate. Try connecting again.",
  no_refresh_token:
    "Google didn't return a refresh token. Remove the app under myaccount.google.com > Third-party access, then connect again.",
  profile_failed: "Google wouldn't share your profile. Try connecting again.",
  oauth_failed: "Google sign-in failed for an unknown reason. Try connecting again.",
};

type Outcome = {
  userId: string;
  ok: boolean;
  title?: string;
  teacherToken?: string;
  studentToken?: string;
  error?: string;
};

/** The Classroom API only gives us a userId — show the friendlier part of it. */
function shortName(userId: string) {
  const [handle] = userId.split("@");
  return handle || userId;
}

function ImportFromClassroom() {
  const [courses, setCourses] = useState<Course[] | null>(null);
  const [course, setCourse] = useState<Course | null>(null);
  const [courseWork, setCourseWork] = useState<CourseWork[] | null>(null);
  const [picked, setPicked] = useState<CourseWork | null>(null);
  const [subs, setSubs] = useState<Submission[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState("");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState("");
  const [needAuth, setNeedAuth] = useState(false);
  const [outcomes, setOutcomes] = useState<Outcome[] | null>(null);

  // Read from the hook, not `window` during render — the server renders this
  // path null, so a direct read is a hydration mismatch on the exact page the
  // OAuth callback redirects to.
  const urlError = useSearchParams().get("error");

  async function load<T>(path: string): Promise<T> {
    setError("");
    const res = await fetch(path);
    if (res.status === 401) {
      setNeedAuth(true);
      throw new Error(NOT_CONNECTED);
    }
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "Request failed");
    return data as T;
  }

  useEffect(() => {
    (async () => {
      try {
        const { courses } = await load<{ courses: Course[] }>("/api/google/courses");
        setCourses(courses);
        if (courses.length === 0) setError("No active courses found for this account.");
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Could not load courses";
        // A 401 on first load just means "not connected yet" — the connect
        // card already says that, so don't repeat it as an error.
        if (msg !== NOT_CONNECTED) setError(msg);
        setCourses([]);
      }
    })();
  }, []);

  async function pickCourse(c: Course) {
    setCourse(c);
    setCourseWork(null);
    setPicked(null);
    setSubs(null);
    setOutcomes(null);
    setBusy("Loading coursework…");
    try {
      const { courseWork } = await load<{ courseWork: CourseWork[] }>(
        `/api/google/coursework?courseId=${encodeURIComponent(c.id)}`,
      );
      setCourseWork(courseWork);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy("");
    }
  }

  async function pickWork(w: CourseWork) {
    setPicked(w);
    setSubs(null);
    setSelected(new Set());
    setOutcomes(null);
    setBusy("Loading submissions…");
    try {
      const { submissions } = await load<{ submissions: Submission[] }>(
        `/api/google/submissions?courseId=${encodeURIComponent(course!.id)}&courseWorkId=${encodeURIComponent(w.id)}`,
      );
      setSubs(submissions);
      setSelected(new Set(submissions.filter((s) => s.docId || s.note).map((s) => s.userId)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy("");
    }
  }

  /**
   * Batched because each essay costs a Docs fetch plus two LLM calls — roughly a
   * minute. Sending the whole class in one request would exceed the serverless
   * function timeout and lose every result. Batches also mean a single bad
   * document can't take the run down with it.
   */
  async function runImport() {
    if (!picked || !course) return;
    const items = (subs ?? [])
      .filter((s) => selected.has(s.userId))
      .map((s) => ({ userId: s.userId, docId: s.docId ?? undefined, note: s.note ?? undefined }));

    if (items.length === 0) return;

    setError("");
    setOutcomes(null);
    setProgress({ done: 0, total: items.length });

    const collected: Outcome[] = [];

    try {
      for (let i = 0; i < items.length; i += BATCH) {
        setBusy(
          `Importing ${Math.min(i + BATCH, items.length)} of ${items.length} — roughly a minute per essay. Keep this tab open.`,
        );
        const chunk = items.slice(i, i + BATCH);

        const res = await fetch("/api/google/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ courseWorkTitle: picked.title, items: chunk }),
        });

        if (res.status === 401) {
          setNeedAuth(true);
          throw new Error("Your Google connection expired. Reconnect and try again.");
        }
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Import failed");

        collected.push(...(data.results as Outcome[]));
        setOutcomes([...collected]);
        setProgress({ done: collected.length, total: items.length });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setBusy("");
      setProgress(null);
    }
  }

  const imported = (outcomes ?? []).filter((o) => o.ok).length;
  const failed = (outcomes ?? []).filter((o) => !o.ok).length;
  const usableCount = (subs ?? []).filter((s) => s.docId || s.note).length;

  return (
    <main className="wrap wide">
      <div className="page-head">
        <span className="badge">
          <ImportIcon size={13} />
          Google Classroom
        </span>
        <h1 style={{ marginTop: 16 }}>Import a class full of essays</h1>
        <p className="sub" style={{ marginBottom: 0 }}>
          Pull an assignment, read each student&rsquo;s essay, and set up an oral check for every
          one of them.
        </p>
      </div>

      {urlError && (
        <div className="error">
          {urlError === "consent_denied"
            ? "You declined the access request, so nothing was connected."
            : CALLBACK_ERRORS[urlError] ?? "Google sign-in didn't complete. Try connecting again."}
        </div>
      )}

      {needAuth && !outcomes && (
        <div className="card">
          <h3>Connect your Google account</h3>
          <p className="muted" style={{ marginTop: 0 }}>
            Requests read-only access to your courses, coursework, and the Docs your students
            attached. It can read nothing else.
          </p>
          {error && <div className="error">{error}</div>}
          <a href="/api/google/connect">
            <button className="lg">Connect Google</button>
          </a>
        </div>
      )}

      {courses !== null && !needAuth && (
        <>
          <div className="card">
            <h3>1. Pick a course</h3>
            {courses.length === 0 ? (
              <p className="muted" style={{ marginBottom: 0 }}>
                {error || "No active courses on this account."}
              </p>
            ) : (
              <>
                <select
                  value={course?.id ?? ""}
                  onChange={(e) => {
                    const c = courses.find((x) => x.id === e.target.value);
                    if (c) pickCourse(c);
                  }}
                >
                  <option value="">Choose a course…</option>
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.section ? ` — ${c.section}` : ""}
                    </option>
                  ))}
                </select>
                {course && (
                  <p className="hint">
                    {course.name}
                    {course.section ? ` · ${course.section}` : ""}
                  </p>
                )}
              </>
            )}
          </div>

          {courseWork !== null && (
            <div className="card">
              <h3>2. Pick an assignment</h3>
              <p className="muted" style={{ marginTop: 0 }}>
                Only written assignments are listed &mdash; quizzes and short-answer items have no
                essay to import.
              </p>
              {courseWork.length === 0 ? (
                <p className="muted" style={{ marginBottom: 0 }}>
                  No published written assignments in this course.
                </p>
              ) : (
                <select
                  value={picked?.id ?? ""}
                  onChange={(e) => {
                    const w = courseWork.find((x) => x.id === e.target.value);
                    if (w) pickWork(w);
                  }}
                >
                  <option value="">Choose an assignment…</option>
                  {courseWork.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.title}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          {subs !== null && (
            <div className="card">
              <h3>3. Choose students</h3>
              <p className="muted" style={{ marginTop: 0 }}>
                Students must attach a Google Doc for this to work. One they created themselves stays
                private, and that import will fail with an explanation &mdash; the teacher should
                have students attach a Doc rather than paste into a form.
              </p>

              {subs.length === 0 ? (
                <div className="empty">
                  <span className="icon">
                    <ClockIcon size={26} />
                  </span>
                  <p style={{ margin: 0 }}>Nothing turned in yet for this assignment.</p>
                </div>
              ) : (
                <>
                  <div className="row spread" style={{ marginBottom: 4 }}>
                    <span className="muted">
                      {selected.size} of {usableCount} selected
                    </span>
                    <button
                      className="quiet sm"
                      onClick={() =>
                        setSelected(
                          selected.size === usableCount
                            ? new Set()
                            : new Set(
                                subs.filter((s) => s.docId || s.note).map((s) => s.userId),
                              ),
                        )
                      }
                    >
                      {selected.size === usableCount ? "Select none" : "Select all"}
                    </button>
                  </div>

                  <div className="student-list">
                    {subs.map((s) => {
                      const usable = !!(s.docId || s.note);
                      return (
                        <label key={s.userId}>
                          <input
                            type="checkbox"
                            checked={selected.has(s.userId)}
                            disabled={!usable}
                            onChange={(e) => {
                              const next = new Set(selected);
                              if (e.target.checked) next.add(s.userId);
                              else next.delete(s.userId);
                              setSelected(next);
                            }}
                          />
                          <span style={{ fontWeight: 400 }}>
                            <span className="name">{usable ? shortName(s.userId) : s.userId}</span>
                            {s.docTitle && usable && (
                              <>
                                {" "}
                                <span className="muted">· {s.docTitle}</span>
                              </>
                            )}
                            {!usable && <span className="muted"> · no document attached</span>}
                            {s.late && <span className="muted"> · late</span>}
                            {s.state === "RETURNED" && (
                              <span className="muted"> · returned for revision</span>
                            )}
                          </span>
                        </label>
                      );
                    })}
                  </div>

                  <div className="row spread">
                    <button
                      onClick={runImport}
                      disabled={!!busy || selected.size === 0}
                      className="lg"
                    >
                      Import {selected.size} essay{selected.size === 1 ? "" : "s"}
                    </button>
                    <span className="muted">About a minute per essay.</span>
                  </div>

                  {progress && (
                    <div className="progress" aria-hidden="true">
                      <i style={{ width: `${(progress.done / progress.total) * 100}%` }} />
                    </div>
                  )}
                  {progress && (
                    <p className="hint">
                      {progress.done} of {progress.total} done
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          {outcomes && (
            <div className="card">
              <h3>
                Imported {imported}
                {failed > 0 && ` · ${failed} couldn't be read`}
              </h3>

              {outcomes.map((o) => (
                <div
                  key={o.userId}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    flexWrap: "wrap",
                    padding: "10px 0",
                    borderTop: "1px solid var(--line)",
                  }}
                >
                  {o.ok ? (
                    <>
                      <span className="row" style={{ gap: 9 }}>
                        <span style={{ color: "var(--accent)", display: "inline-flex" }}>
                          <CheckIcon size={16} />
                        </span>
                        <strong style={{ fontWeight: 600 }}>{o.title}</strong>
                        <code className="mono">/s/{o.studentToken}</code>
                      </span>
                      <a href={`/t/${o.teacherToken}`}>
                        <button className="ghost sm">Results</button>
                      </a>
                    </>
                  ) : (
                    <span className="row" style={{ gap: 9 }}>
                      <strong style={{ fontWeight: 600 }}>{shortName(o.userId)}</strong>
                      <span className="muted">{o.error}</span>
                    </span>
                  )}
                </div>
              ))}

              <div className="row" style={{ marginTop: 16 }}>
                <a href="/teacher/new">
                  <button className="ghost">Paste an essay instead</button>
                </a>
              </div>
            </div>
          )}
        </>
      )}

      {error && !needAuth && !outcomes && <div className="error">{error}</div>}
      {busy && <div className="status">{busy}</div>}
    </main>
  );
}

function ImportFallback() {
  return (
    <main className="wrap wide">
      <div className="page-head">
        <span className="badge">
          <ImportIcon size={13} />
          Google Classroom
        </span>
        <h1 style={{ marginTop: 16 }}>Import a class full of essays</h1>
        <p className="sub" style={{ marginBottom: 0 }}>
          Loading your courses…
        </p>
      </div>
    </main>
  );
}

// The page reads the OAuth error code out of the URL, so the URL-dependent part
// has to live inside a Suspense boundary for the route to prerender.
export default function ImportPage() {
  return (
    <Suspense fallback={<ImportFallback />}>
      <ImportFromClassroom />
    </Suspense>
  );
}
