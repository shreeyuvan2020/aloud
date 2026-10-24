"use client";

import { use, useCallback, useEffect, useRef, useState } from "react";
import { blobToWavDataUri } from "@/lib/audio";
import type { Turn } from "@/lib/analysis";
import { CheckIcon, MicIcon } from "@/components/icons";

type Phase = "loading" | "idle" | "recording" | "processing" | "playing" | "done";

/** Long enough to explain a point, short enough to keep the payload sane. */
const MAX_RECORDING_MS = 45_000;

function keyStorageKey(id: string) {
  return `oralcheck:session:${id}`;
}

export default function VoiceSession({ params }: PageProps<"/s/session/[id]">) {
  const { id } = use(params);

  const [phase, setPhase] = useState<Phase>("loading");
  const [transcript, setTranscript] = useState<Turn[]>([]);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [elapsed, setElapsed] = useState(0);
  const [keyMissing, setKeyMissing] = useState(false);

  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const audioEl = useRef<HTMLAudioElement | null>(null);
  const recordTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bottom = useRef<HTMLDivElement | null>(null);

  const answerCount = transcript.filter((t) => t.role === "student").length;
  const questionCount = transcript.filter((t) => t.role === "ai").length;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const key = sessionStorage.getItem(keyStorageKey(id));
      if (!key) {
        setKeyMissing(true);
        setPhase("idle");
        return;
      }
      try {
        const res = await fetch(`/api/sessions/${id}`, { headers: { "x-session-key": key } });
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) throw new Error(data.error ?? "Could not load this session");
        setTranscript(Array.isArray(data.transcript) ? data.transcript : []);
        // A finished session re-opened after the fact should not offer the mic.
        setPhase(data.status === "complete" ? "done" : "idle");
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Could not load");
          setPhase("idle");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [transcript, phase]);

  useEffect(() => {
    if (phase !== "recording") return;
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, [phase]);

  // Release the mic and stop any audio if the student navigates away mid-session.
  useEffect(
    () => () => {
      const rec = recorder.current;
      if (rec && rec.state !== "inactive") rec.stop();
      if (recordTimer.current) clearTimeout(recordTimer.current);
      audioEl.current?.pause();
    },
    [],
  );

  const playAudio = useCallback((url: string | null, onFailure?: () => void) => {
    if (!url) {
      // Always recover the phase. Returning without resetting strands the
      // student on a disabled "Thinking…" button forever.
      onFailure?.();
      return;
    }
    const el = new Audio(url);
    audioEl.current = el;
    el.onended = () => setPhase("idle");
    el.onerror = () => setPhase("idle");
    setPhase("playing");
    void el.play().catch(() => setPhase("idle"));
  }, []);

  async function startRecording() {
    setError("");
    setStatus("");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError("Couldn't access the microphone. Check your browser's permission and try again.");
      return;
    }

    try {
      const mime = MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "";
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunks.current = [];

      rec.ondataavailable = (e) => e.data.size > 0 && chunks.current.push(e.data);
      rec.onerror = () => {
        stream.getTracks().forEach((t) => t.stop());
        recorder.current = null;
        if (recordTimer.current) clearTimeout(recordTimer.current);
        setError("Recording failed. Try answering again.");
        setPhase("idle");
      };
      // Everything that can throw sits inside the try, so a decode failure or an
      // empty recording resets the phase instead of leaving the UI stuck.
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        if (recordTimer.current) clearTimeout(recordTimer.current);
        try {
          const blob = new Blob(chunks.current, { type: rec.mimeType || "audio/webm" });
          if (blob.size === 0) throw new Error("That recording was empty — hold a little longer.");
          await sendAnswer(await blobToWavDataUri(blob));
        } catch (err) {
          setError(err instanceof Error ? err.message : "Could not send that answer.");
          setPhase("idle");
        }
      };

      recorder.current = rec;
      rec.start();
      setElapsed(0);
      setPhase("recording");
      // Hard stop at the cap: otherwise a long answer sails past the payload
      // limit and the student loses work they already spent time speaking.
      recordTimer.current = setTimeout(() => recorder.current?.stop(), MAX_RECORDING_MS);
    } catch {
      stream.getTracks().forEach((t) => t.stop());
      setError("This browser couldn't start recording. Try again.");
      setPhase("idle");
    }
  }

  function stopRecording() {
    recorder.current?.stop();
    recorder.current = null;
    setPhase("processing");
    setStatus("Listening to your answer…");
  }

  async function sendAnswer(audio: string) {
    const key = sessionStorage.getItem(keyStorageKey(id));
    setStatus("Listening to your answer…");
    try {
      const res = await fetch(`/api/sessions/${id}/turn`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-session-key": key ?? "" },
        body: JSON.stringify({ audio }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");
      setTranscript(Array.isArray(data.transcript) ? data.transcript : []);
      setStatus("");
      playAudio(data.audioUrl, () => {
        setStatus(data.audioWarning ?? "Read the question on screen and answer out loud.");
      });
      if (data.shouldEnd) setPhase("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setPhase("idle");
    }
  }

  async function finish() {
    const key = sessionStorage.getItem(keyStorageKey(id));
    setPhase("processing");
    setStatus("Wrapping up…");
    try {
      const res = await fetch(`/api/sessions/${id}/complete`, {
        method: "POST",
        headers: { "x-session-key": key ?? "" },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");
      setPhase("done");
      setStatus("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setPhase("idle");
    }
  }

  const busy = phase === "loading" || phase === "processing" || phase === "playing";

  return (
    <main className="wrap narrow">
      <div className="row spread" style={{ marginBottom: 24 }}>
        <span className="eyebrow" style={{ margin: 0 }}>
          Question {Math.max(questionCount, 1)}
        </span>
        <span className="badge muted">
          {answerCount} answer{answerCount === 1 ? "" : "s"} so far
        </span>
      </div>

      <div>
        {transcript.map((t, i) => (
          <div key={i} className={`turn ${t.role}`}>
            <div className="who">{t.role === "ai" ? "Tutor" : "You"}</div>
            <div className="said">{t.text}</div>
          </div>
        ))}
        <div ref={bottom} />
      </div>

      {error && <div className="error">{error}</div>}

      {keyMissing && (
        <div className="panel" style={{ marginTop: 28 }}>
          <h2 style={{ marginTop: 0 }}>This session link expired</h2>
          <p className="sub" style={{ marginBottom: 0 }}>
            Answer links only work in the tab where you started. Go back to your link and press
            Begin again.
          </p>
        </div>
      )}

      {phase === "done" ? (
        <div className="panel" style={{ marginTop: 28, textAlign: "center" }}>
          <span
            className="icon"
            style={{
              display: "inline-grid",
              placeItems: "center",
              width: 46,
              height: 46,
              borderRadius: 999,
              background: "var(--accent-soft)",
              color: "var(--accent)",
            }}
          >
            <CheckIcon size={24} />
          </span>
          <h2 style={{ marginTop: 14 }}>That&rsquo;s a wrap</h2>
          <p className="sub" style={{ margin: "0 auto", maxWidth: "40ch" }}>
            Thanks for talking it through. Your tutor&rsquo;s notes have been sent to your teacher.
          </p>
        </div>
      ) : (
        !keyMissing && (
          <>
            <div className="talkbar">
              {phase === "recording" ? (
                <button className="mic recording" onClick={stopRecording} aria-label="Send answer">
                  <MicIcon size={38} />
                </button>
              ) : (
                <button
                  className="mic"
                  onClick={startRecording}
                  disabled={busy}
                  aria-label="Start answering"
                >
                  <MicIcon size={38} />
                </button>
              )}

              <div className="status">
                {phase === "recording" ? (
                  <>
                    Recording <span className="timer">{elapsed}s</span> &mdash; tap again to send
                  </>
                ) : phase === "processing" ? (
                  status || "Thinking…"
                ) : phase === "playing" ? (
                  "Listen to the question…"
                ) : busy ? (
                  "One moment…"
                ) : (
                  status || "Tap the button and answer in your own words."
                )}
              </div>

              {answerCount >= 3 && phase !== "recording" && (
                <button className="ghost sm" onClick={finish} disabled={busy}>
                  I&rsquo;m done
                </button>
              )}
            </div>
          </>
        )
      )}
    </main>
  );
}
