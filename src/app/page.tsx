import Link from "next/link";
import { GaugeIcon, ImportIcon, ShieldIcon, SpeechIcon } from "@/components/icons";
import { MyResults } from "@/components/MyResults";

const SIGN_IN_ERRORS: Record<string, string> = {
  consent_denied: "You declined the Google sign-in, so nothing was connected.",
  oauth_state: "The sign-in attempt didn't validate. Try signing in again.",
  oauth_failed: "Google sign-in failed. Try again.",
};

export default async function Home({ searchParams }: PageProps<"/">) {
  const { signin_error } = await searchParams;
  const signInError = typeof signin_error === "string" ? SIGN_IN_ERRORS[signin_error] : undefined;

  return (
    <main className="wrap">
      {signInError && <div className="error">{signInError}</div>}
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

      <h2>See it in 50 seconds</h2>
      <div className="demo-video">
        <video
          controls
          preload="metadata"
          playsInline
          poster="/aloud-demo-poster.jpg"
          aria-label="Demo: a teacher pastes an essay, shares a link, the student answers aloud, and the teacher sees scores."
        >
          <source src="/aloud-demo.mp4" type="video/mp4" />
        </video>
      </div>

      <h2>How it works for you</h2>
      <div className="card">
        <ol className="steps">
          <li>
            <strong>Set it up (1 minute).</strong> Paste a student&rsquo;s essay, or import a whole
            Google Classroom assignment. The app reads it and drafts questions about what that
            student actually argued.
          </li>
          <li>
            <strong>Send the student a link.</strong> You&rsquo;ll get a link to post in Classroom, your LMS,
            or email. The student opens it, types their name, and answers out loud &mdash; about
            five minutes, on any device with a microphone. Nothing to install and no student
            accounts.
          </li>
          <li>
            <strong>See the scores.</strong> Sign in with Google and open &ldquo;Your
            results.&rdquo; Each student appears there when they finish, with a comprehension
            score, an authorship signal, and the full transcript &mdash; visible only to you.
            Reload the page to see new ones.
          </li>
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

      <MyResults />

      <div className="callout" style={{ marginTop: 26 }}>
        <p>
          The student is never accused of anything. The questioning simply gets more specific, and
          you decide what the pattern means.
        </p>
      </div>
    </main>
  );
}
