import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { parseJson } from "@/lib/sessionAccess";
import type { EssayAnalysis, Grading, Question, Turn } from "@/lib/analysis";
import { CheckIcon, ClockIcon, LinkIcon, SpeechIcon } from "@/components/icons";
import { CopyButton } from "@/components/CopyButton";
import { RememberResults } from "@/components/SavedResults";
import { getOrigin } from "@/lib/origin";

export const dynamic = "force-dynamic";

/** Below this, the authorship signal is flagged for a closer look. */
const LOW_SIGNAL = 50;

const EMPTY_ANALYSIS: EssayAnalysis = {
  thesis: "",
  claims: [],
  keyDetails: [],
  signatureDetails: [],
  weakSpots: [],
};

export default async function TeacherDashboard({ params }: PageProps<"/t/[teacherToken]">) {
  const { teacherToken } = await params;
  const assignments = await prisma.assignment.findMany({
    where: { teacherToken },
    include: { sessions: { orderBy: { createdAt: "desc" } } },
    orderBy: { createdAt: "desc" },
  });

  if (assignments.length === 0) notFound();

  const origin = await getOrigin();
  const resultsUrl = `${origin}/t/${teacherToken}`;

  return (
    <main className="wrap wide">
      <RememberResults token={teacherToken} titles={assignments.map((a) => a.title)} />
      <div className="page-head">
        <span className="badge">
          <SpeechIcon size={13} />
          Step 3 of 3 &middot; Results
        </span>
        <h1 style={{ marginTop: 16 }}>Your oral checks</h1>
        <p className="sub" style={{ marginBottom: 0 }}>
          Scores appear here as soon as each student finishes. Reload this page to see new ones.
        </p>
      </div>

      <div className="callout" style={{ marginBottom: 28 }}>
        <p style={{ margin: "0 0 10px" }}>
          <strong>This page is private to you.</strong> This link is the only way back to these
          results &mdash; there&rsquo;s no account to log in to. Bookmark it, or send it to yourself.
        </p>
        <div className="row">
          <CopyButton text={resultsUrl}>Copy results link</CopyButton>
          <a
            href={`mailto:?subject=${encodeURIComponent("My Aloud results link")}&body=${encodeURIComponent(resultsUrl)}`}
          >
            <button className="ghost">Email it to myself</button>
          </a>
        </div>
      </div>

      {assignments.map((a) => {
        // Parse defensively: one malformed row must not 500 the whole dashboard.
        const analysis = parseJson<EssayAnalysis>(a.analysis, EMPTY_ANALYSIS);
        const questions = parseJson<Question[]>(a.questions, []);
        const completed = a.sessions.filter((s) => s.status === "complete");
        const started = a.sessions.length - completed.length;
        const studentUrl = `${origin}/s/${a.studentToken}`;

        const rows = a.sessions.map((s) => ({
          id: s.id,
          name: s.studentName ?? "Unnamed student",
          status: s.status,
          answered: parseJson<Turn[]>(s.transcript, []).filter((t) => t.role === "student").length,
          grading: s.grading ? parseJson<Grading | null>(s.grading, null) : null,
        }));
        const scored = rows.filter((r) => r.grading && !r.grading.failed);
        const average = scored.length
          ? Math.round(scored.reduce((n, r) => n + r.grading!.comprehension, 0) / scored.length)
          : null;

        return (
          <section key={a.id} style={{ marginBottom: 44 }}>
            <div
              className="row spread"
              style={{ alignItems: "flex-end", margin: "0 0 12px", gap: 12 }}
            >
              <h2 style={{ margin: 0 }}>{a.title}</h2>
              <span className="muted" style={{ whiteSpace: "nowrap" }}>
                {questions.length} questions &middot; {completed.length} completed
                {started > 0 && ` · ${started} in progress`}
              </span>
            </div>

            <div className="card">
              <h3>Send this to students</h3>
              <ol className="steps">
                <li>
                  Copy the link below and post it wherever students already get work &mdash; Google
                  Classroom, your LMS, or email. The same link works for the whole class.
                </li>
                <li>
                  Each student opens it, types their name, and taps the mic to answer out loud. It
                  takes about five minutes and needs a quiet spot and microphone access.
                </li>
                <li>
                  Their score shows up in the table below when they finish. Reload this page to see
                  new ones.
                </li>
              </ol>
              <p className="token-field" style={{ marginTop: 16 }}>
                {studentUrl}
              </p>
              <div className="row">
                <CopyButton text={studentUrl}>Copy student link</CopyButton>
                <a href={`/s/${a.studentToken}`} target="_blank" rel="noreferrer">
                  <button className="ghost">
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                      <LinkIcon size={15} />
                      Preview what students see
                    </span>
                  </button>
                </a>
              </div>
            </div>

            {rows.length === 0 ? (
              <div className="card">
                <div className="empty" style={{ padding: "18px 0" }}>
                  <span className="icon">
                    <ClockIcon size={24} />
                  </span>
                  <p style={{ margin: 0 }}>
                    No student has started yet. Once you share the link above, each student shows
                    up here as soon as they begin.
                  </p>
                </div>
              </div>
            ) : (
              <div className="card">
                <div className="row spread" style={{ marginBottom: 10 }}>
                  <h3 style={{ margin: 0 }}>Scores at a glance</h3>
                  {average !== null && (
                    <span className="muted">Class average comprehension: {average}</span>
                  )}
                </div>
                <div className="table-scroll">
                  <table className="score-table">
                    <thead>
                      <tr>
                        <th>Student</th>
                        <th>Status</th>
                        <th>Comprehension</th>
                        <th>Authorship signal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => {
                        const g = r.grading && !r.grading.failed ? r.grading : null;
                        const low = g !== null && g.ownershipConfidence < LOW_SIGNAL;
                        return (
                          <tr key={r.id}>
                            <td>
                              <a href={`#session-${r.id}`}>{r.name}</a>
                            </td>
                            <td>
                              {r.status === "complete" ? (
                                "Done"
                              ) : (
                                <span className="muted">
                                  In progress ({r.answered} answer{r.answered === 1 ? "" : "s"})
                                </span>
                              )}
                            </td>
                            <td className="num">{g ? `${g.comprehension} / 100` : "—"}</td>
                            <td>
                              {g ? (
                                <span className={`badge${low ? " warn" : ""}`}>
                                  {low ? "Worth a closer look" : "Consistent"} &middot;{" "}
                                  {g.ownershipConfidence}
                                </span>
                              ) : (
                                "—"
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <details style={{ marginTop: 14 }}>
                  <summary className="muted">How to read these scores</summary>
                  <ul className="plain" style={{ marginTop: 10 }}>
                    <li>
                      <strong>Comprehension (0&ndash;100)</strong> &mdash; how well the student could
                      explain the argument and evidence in their own essay, question by question. It
                      isn&rsquo;t a grade on the writing.
                    </li>
                    <li>
                      <strong>Authorship signal (0&ndash;100)</strong> &mdash; whether their answers
                      fit someone who wrote this essay. Under {LOW_SIGNAL} is flagged. It&rsquo;s a
                      prompt to talk to the student, not proof of anything &mdash; nervous students
                      and bad microphones score low too.
                    </li>
                    <li>Click a name to jump to their full transcript and answer-by-answer notes.</li>
                  </ul>
                </details>
              </div>
            )}

            <details className="card" style={{ marginTop: 14 }}>
              <summary className="muted">What the app read from the essay</summary>
              <div style={{ marginTop: 14, minWidth: 0 }}>
                <p style={{ margin: "0 0 12px" }}>
                  <strong>Their claim:</strong> {analysis.thesis || "—"}
                </p>
                <DetailList title="Supporting claims" items={analysis.claims} />
                <DetailList
                  title="Details that reveal authorship"
                  items={analysis.signatureDetails}
                />
                <DetailList title="Where the writing is thinnest" items={analysis.weakSpots} />
              </div>
            </details>

            {a.sessions.map((s) => {
              const transcript = parseJson<Turn[]>(s.transcript, []);
              const grading = s.grading ? parseJson<Grading | null>(s.grading, null) : null;
              return (
                <SessionCard
                  key={s.id}
                  id={s.id}
                  name={s.studentName ?? "Unnamed student"}
                  status={s.status}
                  transcript={transcript}
                  grading={grading}
                />
              );
            })}
          </section>
        );
      })}

      <div className="row" style={{ marginTop: 8 }}>
        <Link href="/teacher/new">
          <button className="ghost">Set up another session</button>
        </Link>
        <Link href="/teacher/import">
          <button className="ghost">Import from Classroom</button>
        </Link>
      </div>
    </main>
  );
}

function DetailList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div style={{ marginTop: 12 }}>
      <div className="muted" style={{ marginBottom: 4 }}>
        {title}
      </div>
      <ul className="plain">
        {items.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
    </div>
  );
}

function SessionCard({
  id,
  name,
  status,
  transcript,
  grading,
}: {
  id: string;
  name: string;
  status: string;
  transcript: Turn[];
  grading: Grading | null;
}) {
  const answered = transcript.filter((t) => t.role === "student").length;
  const done = status === "complete";

  return (
    <div className="card" id={`session-${id}`} style={{ scrollMarginTop: 80 }}>
      <div className="row spread">
        <span className="row" style={{ gap: 9 }}>
          {done && (
            <span style={{ color: "var(--accent)", display: "inline-flex" }}>
              <CheckIcon size={16} />
            </span>
          )}
          <strong style={{ fontWeight: 650 }}>{name}</strong>
        </span>
        <span className={`badge${done ? "" : " muted"}`}>
          {done ? "Completed" : `In progress · ${answered} answer${answered === 1 ? "" : "s"}`}
        </span>
      </div>

      {grading ? (
        <>
          {grading.failed ? (
            <p className="error" style={{ marginTop: 0 }}>
              {grading.verdict}
            </p>
          ) : (
            <div className="metrics">
              <Metric
                value={grading.comprehension}
                label="Comprehension"
                scale="Can they explain the argument they wrote?"
              />
              <Metric
                value={grading.ownershipConfidence}
                label="Authorship signal"
                scale={
                  grading.ownershipConfidence < LOW_SIGNAL
                    ? "Low — worth a closer look"
                    : "Consistent with the author of this essay"
                }
                warn={grading.ownershipConfidence < LOW_SIGNAL}
              />
            </div>
          )}

          {!grading.failed && grading.verdict && <p style={{ marginTop: 0 }}>{grading.verdict}</p>}

          {grading.notes.length > 0 && (
            <>
              <div className="muted" style={{ marginBottom: 4 }}>
                What drove the score
              </div>
              <ul className="plain">
                {grading.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </>
          )}

          {grading.perQuestion.length > 0 && (
            <>
              <h3 style={{ marginTop: 22 }}>Answer by answer</h3>
              {grading.perQuestion.map((pq, i) => (
                <div key={i} style={{ marginBottom: 14 }}>
                  <div className="muted" style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                    <span>{pq.question}</span>
                    <span style={{ whiteSpace: "nowrap", fontVariantNumeric: "tabular-nums" }}>
                      {pq.score}/5
                    </span>
                  </div>
                  <div style={{ fontSize: "0.92rem" }}>{pq.note}</div>
                </div>
              ))}
            </>
          )}
        </>
      ) : (
        <p className="muted" style={{ margin: "14px 0 0" }}>
          Still in progress &mdash; {answered} answer{answered === 1 ? "" : "s"} recorded so far.
        </p>
      )}

      <details style={{ marginTop: 18 }}>
        <summary className="muted">Full transcript</summary>
        <div style={{ marginTop: 14 }}>
          {transcript.map((t, i) => (
            <div key={i} className={`turn ${t.role}`}>
              <div className="who">{t.role === "ai" ? "Tutor" : "Student"}</div>
              <div className="said">{t.text}</div>
            </div>
          ))}
        </div>
      </details>

      <p className="muted" style={{ margin: "14px 0 0" }}>
        Session {id.slice(-6)}
      </p>
    </div>
  );
}

function Metric({
  value,
  label,
  scale,
  warn,
}: {
  value: number;
  label: string;
  scale: string;
  warn?: boolean;
}) {
  return (
    <div className="metric">
      <div className="num">{value}</div>
      <div className="lbl">{label}</div>
      <div className="scale">{scale}</div>
      <div className={`scorebar${warn ? " warn" : ""}`}>
        <i style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}
