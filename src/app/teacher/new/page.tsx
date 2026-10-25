"use client";

import { useState } from "react";
import { CheckIcon } from "@/components/icons";
import { CopyButton } from "@/components/CopyButton";

type Created = { teacherToken: string; studentToken: string; questionCount: number };

const MIN_ESSAY = 80;

export default function NewAssignment() {
  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  const [essayText, setEssayText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<Created | null>(null);

  const tooShort = essayText.trim().length < MIN_ESSAY;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, prompt, essayText }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");
      setCreated(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  }

  if (created) {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const studentUrl = `${origin}/s/${created.studentToken}`;

    return (
      <main className="wrap narrow">
        <div className="page-head">
          <span className="badge">
            <CheckIcon size={13} />
            Step 2 of 3 &middot; Share it
          </span>
          <h1 style={{ marginTop: 16 }}>{title}</h1>
          <p className="sub" style={{ marginBottom: 0 }}>
            {created.questionCount} questions were drafted from this essay. Two links below: one
            for the student, one for you.
          </p>
        </div>

        <div className="card">
          <h3>1. Send the student link</h3>
          <p className="muted" style={{ marginTop: 0 }}>
            Paste it into Google Classroom, your LMS, or an email. Each student who opens it types
            their name and answers the questions out loud &mdash; about five minutes, on any device
            with a microphone. It starts a fresh session every time it&rsquo;s opened, so the same
            link works for a whole class.
          </p>
          <p className="token-field">{studentUrl}</p>
          <div className="row">
            <CopyButton text={studentUrl} />
            <a href={`/s/${created.studentToken}`} target="_blank" rel="noreferrer">
              <button className="ghost">Preview what students see</button>
            </a>
          </div>
        </div>

        <div className="card">
          <h3>2. Check scores later</h3>
          <p className="muted" style={{ marginTop: 0 }}>
            Results appear on your results page as students finish. They&rsquo;re tied to your
            Google account, so just sign in from any device and open &ldquo;Your results&rdquo;
            &mdash; no link to keep track of, and nobody else can see them.
          </p>
          <div className="row">
            <a href={`/t/${created.teacherToken}`}>
              <button>Go to results</button>
            </a>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="wrap narrow">
      <div className="page-head">
        <span className="badge">Step 1 of 3 &middot; Paste the essay</span>
        <h1 style={{ marginTop: 16 }}>Set up a session</h1>
        <p className="sub" style={{ marginBottom: 0 }}>
          Paste the essay exactly as the student submitted it. You&rsquo;ll get a link to send to the
          student in about a minute &mdash; then a private page where their scores show up.
        </p>
      </div>

      <div className="card">
        <form onSubmit={submit}>
          <label htmlFor="title">Assignment title</label>
          <input
            id="title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="DBQ: Was the American Revolution won on the battlefield?"
            required
          />

          <label htmlFor="prompt">The original prompt (optional)</label>
          <input
            id="prompt"
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Optional — helps the app judge what the student was asked to do"
          />

          <label htmlFor="essay">Student&rsquo;s essay</label>
          <textarea
            id="essay"
            value={essayText}
            onChange={(e) => setEssayText(e.target.value)}
            placeholder="Paste the full essay here…"
            required
          />
          <p className="hint">
            {essayText.length > 0
              ? `${essayText.trim().split(/\s+/).length} words`
              : "Plain text is fine — formatting isn't needed."}
          </p>

          {error && <div className="error">{error}</div>}

          <div style={{ marginTop: 20 }}>
            <button type="submit" disabled={busy || tooShort} className="lg block">
              {busy ? "Reading the essay closely… (up to a minute)" : "Generate questions"}
            </button>
          </div>
          {tooShort && (
            <p className="hint">
              At least {MIN_ESSAY} characters so there&rsquo;s something to ask about.
            </p>
          )}
        </form>
      </div>
    </main>
  );
}
