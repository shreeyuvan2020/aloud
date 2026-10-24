"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { MicIcon } from "@/components/icons";

export default function StudentStart({ params }: PageProps<"/s/[studentToken]">) {
  const { studentToken } = use(params);
  const router = useRouter();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function begin(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentToken, studentName: name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not start");
      // The key is what authorises every subsequent call for this session. It
      // lives in sessionStorage, so a copied URL or a second tab gets nothing.
      sessionStorage.setItem(`oralcheck:session:${data.sessionId}`, data.sessionKey);
      router.push(`/s/session/${data.sessionId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start");
      setBusy(false);
    }
  }

  return (
    <main className="wrap narrow">
      <div className="page-head">
        <span className="badge">
          <MicIcon size={13} />
          Aloud
        </span>
        <h1 style={{ marginTop: 16 }}>Let&rsquo;s talk about your essay.</h1>
        <p className="sub">
          Your tutor will ask you about what <em>you</em> wrote &mdash; your argument, the evidence
          you chose, and why you made the choices you did.
        </p>
      </div>

      <div className="card">
        <h3>How this works</h3>
        <ol className="steps">
          <li>Your tutor reads a question aloud.</li>
          <li>Tap the big button and answer out loud, in your own words.</li>
          <li>They ask a follow-up, based on what you actually said.</li>
        </ol>
        <div className="callout" style={{ marginTop: 18 }}>
          <p>
            Find a quiet room and allow microphone access when asked. There are no trick questions
            &mdash; it goes best when you answer the way you&rsquo;d explain it to a friend.
          </p>
        </div>
      </div>

      <form onSubmit={begin} style={{ marginTop: 20 }}>
        <label htmlFor="name">Your name</label>
        <input
          id="name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="First name is fine"
          required
        />
        <p className="hint">So your teacher knows whose session this is.</p>
        {error && <div className="error">{error}</div>}
        <div style={{ marginTop: 18 }}>
          <button type="submit" disabled={busy} className="lg block">
            {busy ? "Getting ready…" : "Begin"}
          </button>
        </div>
      </form>
    </main>
  );
}
