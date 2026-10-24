import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { parseJson } from "@/lib/sessionAccess";
import type { EssayAnalysis, Grading, Question, Turn } from "@/lib/analysis";
import { CheckIcon, ClockIcon, LinkIcon, SpeechIcon } from "@/components/icons";

export const dynamic = "force-dynamic";

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

  const origin = process.env.NEXT_PUBLIC_ORIGIN ?? "";

  return (
    <main className="wrap wide">
      <div className="page-head">
        <span className="badge">
          <SpeechIcon size={13} />
          Teacher results
        </span>
        <h1 style={{ marginTop: 16 }}>Your oral checks</h1>
        <p className="sub" style={{ marginBottom: 0 }}>
          {assignments.length} assignment{assignments.length === 1 ? "" : "s"} on this link. Bookmark
          it &mdash; it&rsquo;s how you come back to these results.
        </p>
      </div>

      {assignments.map((a) => {
        // Parse defensively: one malformed row must not 500 the whole dashboard.
        const analysis = parseJson<EssayAnalysis>(a.analysis, EMPTY_ANALYSIS);
        const questions = parseJson<Question[]>(a.questions, []);
        const completed = a.sessions.filter((s) => s.status === "complete");
        const started = a.sessions.length - completed.length;

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
              <div className="row spread" style={{ alignItems: "flex-start", gap: 16 }}>
                <div style={{ minWidth: 0 }}>
                  <div className="eyebrow">What the app read</div>
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
              </div>

              <div
                style={{
                  marginTop: 18,
                  paddingTop: 16,
                  borderTop: "1px solid var(--line)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  flexWrap: "wrap",
                }}
              >
                <code className="mono">
                  {origin}/s/{a.studentToken}
                </code>
                <a href={`/s/${a.studentToken}`}>
                  <button className="ghost sm">
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <LinkIcon size={14} />
                      Open student view
                    </span>
                  </button>
                </a>
              </div>
            </div>

            {a.sessions.length === 0 && (
              <div className="card">
                <div className="empty" style={{ padding: "18px 0" }}>
                  <span className="icon">
                    <ClockIcon size={24} />
                  </span>
                  <p style={{ margin: 0 }}>No one has opened the student link yet.</p>
                </div>
              </div>
            )}

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
    <div className="card">
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
                  grading.ownershipConfidence < 50
                    ? "Low — worth a closer look"
                    : "Consistent with the author of this essay"
                }
                warn={grading.ownershipConfidence < 50}
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
