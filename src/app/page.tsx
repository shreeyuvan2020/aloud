import Link from "next/link";
import { GaugeIcon, ImportIcon, ShieldIcon, SpeechIcon } from "@/components/icons";

export default function Home() {
  return (
    <main className="wrap">
      <div className="page-head">
        <span className="badge">
          <SpeechIcon size={13} />
          Oral comprehension checks
        </span>
        <h1 style={{ marginTop: 16 }}>Talk a student through the essay they just wrote.</h1>
        <p className="sub">
          Paste an essay in. It gets read closely, and the questions come from what that student
          actually argued &mdash; not from a generic study guide. The student answers out loud.
        </p>
        <div className="row">
          <Link href="/teacher/new">
            <button className="lg">Set up a session</button>
          </Link>
          <Link href="/teacher/import">
            <button className="ghost lg">
              <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                <ImportIcon size={16} />
                Import from Google Classroom
              </span>
            </button>
          </Link>
        </div>
        <p className="hint" style={{ marginTop: 12 }}>
          Runs in the browser. Nothing to install, nothing to send the student ahead of time.
        </p>
      </div>

      <h2>How a session works</h2>
      <div className="card">
        <ol className="steps">
          <li>You paste an essay and its prompt.</li>
          <li>
            The app reads it and drafts questions tied to the actual thesis and evidence.
          </li>
          <li>You send one link to the student.</li>
          <li>They tap one button and answer out loud. The questions adapt to how they respond.</li>
          <li>You get a transcript, a comprehension score, and a signal worth a second look.</li>
        </ol>
      </div>

      <h2>What you get back</h2>
      <div className="feature-grid">
        <div className="feature">
          <span className="icon">
            <SpeechIcon size={20} />
          </span>
          <h3>The full conversation</h3>
          <p>
            Every question the tutor asked and everything the student said back, in order, so you
            can hear it the way it happened.
          </p>
        </div>
        <div className="feature">
          <span className="icon">
            <GaugeIcon size={20} />
          </span>
          <h3>A comprehension score</h3>
          <p>
            Not a grade on the essay &mdash; a read on whether they can explain the argument they
            wrote, question by question.
          </p>
        </div>
        <div className="feature">
          <span className="icon">
            <ShieldIcon size={20} />
          </span>
          <h3>A signal, not a verdict</h3>
          <p>
            Vague answers and invented specifics are surfaced for you. The questioning never accuses
            &mdash; you decide what the pattern means.
          </p>
        </div>
      </div>

      <div className="callout" style={{ marginTop: 26 }}>
        <p>
          The student is never accused of anything. The questioning simply gets more specific, and
          you decide what the pattern means.
        </p>
      </div>
    </main>
  );
}
