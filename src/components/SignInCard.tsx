import { ShieldIcon } from "@/components/icons";

/** Prompt shown wherever a signed-out visitor reaches a teacher-only page. */
export function SignInCard({ next, title }: { next: string; title?: string }) {
  return (
    <main className="wrap narrow">
      <div className="page-head">
        <span className="badge">
          <ShieldIcon size={13} />
          Teachers
        </span>
        <h1 style={{ marginTop: 16 }}>{title ?? "Sign in to continue"}</h1>
        <p className="sub" style={{ marginBottom: 0 }}>
          Your sessions and student scores are tied to your Google account, so only you can see
          them &mdash; from any device. Students never need an account.
        </p>
      </div>
      <div className="card">
        <p className="muted" style={{ marginTop: 0 }}>
          Aloud only asks for your name and email. It doesn&rsquo;t read your Drive, Gmail, or
          Classroom unless you choose to import from Classroom later.
        </p>
        <a href={`/api/auth/login?next=${encodeURIComponent(next)}`}>
          <button className="lg">Sign in with Google</button>
        </a>
      </div>
    </main>
  );
}
