"use client";

import { useState } from "react";
import { CheckIcon, LinkIcon } from "@/components/icons";

type Created = { teacherToken: string; studentToken: string; questionCount: number };

const MIN_ESSAY = 80;

function CopyButton({ text, children }: { text: string; children?: React.ReactNode }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard is a nice-to-have; the URL is on screen either way.
    }
  }

  return (
    <button className="ghost" onClick={copy} aria-live="polite">
      <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
        {copied ? <CheckIcon size={15} /> : <LinkIcon size={15} />}
        {copied ? "Copied" : (children ?? "Copy link")}
      </span>
    </button>
  );
}

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
    const teacherUrl = `${origin}/t/${created.teacherToken}`;

    return (
      <main className="wrap narrow">
        <div className="page-head">
          <span className="badge">
            <CheckIcon size={13} />
            Ready
          </span>
          <h1 style={{ marginTop: 16 }}>{title}</h1>
          <p className="sub" style={{ marginBottom: 0 }}>
            {created.questionCount} questions were drafted from this essay. Send the student link
            &mdash; it creates a new session each time it&rsquo;s opened.
          </p>
        </div>

        <div className="card">
          <h3>Student link</h3>
          <p className="muted" style={{ marginTop: 0 }}>
            Send this to the student. It works for every student, and starts a fresh session each
            time.
          </p>
          <p className="token-field">{studentUrl}</p>
          <div className="row">
            <CopyButton text={studentUrl} />
            <a href={`/s/${created.studentToken}`}>
              <button className="ghost">Open it</button>
            </a>
          </div>
        </div>

        <div className="card">
          <h3>Your results link</h3>
          <p className="muted" style={{ marginTop: 0 }}>
            Keep this private. It&rsquo;s how you see transcripts and scores later.
          </p>
          <p className="token-field">{teacherUrl}</p>
          <div className="row">
            <CopyButton text={teacherUrl} />
            <a href={`/t/${created.teacherToken}`}>
              <button className="ghost">Go to results</button>
            </a>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="wrap narrow">
      <div className="page-head">
        <span className="badge">Step 1 of 2</span>
        <h1 style={{ marginTop: 16 }}>Set up a session</h1>
        <p className="sub" style={{ marginBottom: 0 }}>
          Paste the essay exactly as the student submitted it. You&rsquo;ll get a link to send back
          in about a minute.
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
