const BASE = process.env.HACK_CLUB_AI_BASE_URL ?? "https://ai.hackclub.com/proxy/v1";
const KEY = process.env.HACK_CLUB_AI_API_KEY;

export const LLM_MODEL = process.env.HCAI_LLM_MODEL ?? "qwen/qwen3-32b";
export const STT_MODEL = process.env.HCAI_STT_MODEL ?? "qwen/qwen3.8-omni-flash";
export const TTS_MODEL = process.env.HCAI_TTS_MODEL ?? "resemble-ai/chatterbox-pro";
export const TTS_VOICE = process.env.HCAI_TTS_VOICE ?? "Aurora";

function authHeaders() {
  if (!KEY) throw new NotConfigured("The speech service isn't configured.");
  return { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
}

/** A configuration problem — safe to show the user, and not their fault. */
export class NotConfigured extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotConfigured";
  }
}

export type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

/** OpenAI-compatible chat completion against Hack Club AI. */
export async function chat(messages: ChatMessage[], opts: { json?: boolean } = {}) {
  const res = await fetch(`${BASE}/chat/completions`, {
    method: "POST",
    headers: authHeaders(),
    signal: AbortSignal.timeout(120_000),
    body: JSON.stringify({
      model: LLM_MODEL,
      messages,
      ...(opts.json ? { response_format: { type: "json_object" } } : {}),
    }),
  });

  if (!res.ok) {
    throw new Error(`chat ${res.status}: ${(await res.text()).slice(0, 500)}`);
  }
  const data = await res.json();
  // Some providers return content as an array of parts rather than a string.
  const content = data?.choices?.[0]?.message?.content;
  const text: string =
    typeof content === "string"
      ? content
      : Array.isArray(content)
        ? content.map((p: { text?: string }) => p?.text ?? "").join("")
        : "";
  if (!text) throw new Error("chat returned empty content");
  return text;
}

/**
 * Ask for JSON and parse it, tolerating models that wrap JSON in prose or fences.
 *
 * A parse failure logs and returns the fallback, but callers are expected to
 * treat an all-empty result as a failure: silently returning an empty
 * `EssayAnalysis` produces a question bank of zero questions, which the rest of
 * the pipeline then treats as a completed exam.
 */
export async function chatJson<T>(messages: ChatMessage[], fallback: T): Promise<T> {
  const raw = await chat(
    [
      ...messages,
      { role: "assistant", content: "Respond with valid JSON only. No prose, no code fences." },
    ],
    { json: true },
  );
  const cleaned = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();

  // Try every candidate start position, not just the first `[`/`{`: prose that
  // mentions a list before the JSON would otherwise start the slice there.
  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (ch !== "{" && ch !== "[") continue;
    const slice = cleaned.slice(i);
    const end = Math.max(slice.lastIndexOf("}"), slice.lastIndexOf("]"));
    if (end <= 0) break;
    try {
      return JSON.parse(slice.slice(0, end + 1)) as T;
    } catch {}
  }

  console.error("[chatJson] unparseable model output", {
    tail: cleaned.slice(-400),
    length: cleaned.length,
  });
  return fallback;
}

/**
 * Transcribe student audio. Audio must be a data URI — the proxy will not
 * fetch third-party URLs (a remote URL returns 404).
 */
export async function transcribe(audioDataUri: string): Promise<string> {
  const res = await fetch(`${BASE}/chat/completions`, {
    method: "POST",
    headers: authHeaders(),
    signal: AbortSignal.timeout(90_000),
    body: JSON.stringify({
      model: STT_MODEL,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                "Transcribe this student's spoken answer verbatim. Do not summarise, " +
                "correct, or answer. Return only the words spoken. If there is no speech, return an empty string.",
            },
            { type: "input_audio", input_audio: { data: audioDataUri, format: "wav" } },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    throw new Error(`transcribe ${res.status}: ${(await res.text()).slice(0, 500)}`);
  }
  const data = await res.json();
  return (data?.choices?.[0]?.message?.content ?? "").trim();
}

/**
 * Synthesise speech via Replicate. NOTE: chatterbox-pro's text field is named
 * `prompt`, not `text`, and `voice` is a closed enum — a wrong value returns 422.
 */
export async function speak(text: string): Promise<string> {
  const res = await fetch(`${BASE}/replicate/models/${TTS_MODEL}/predictions`, {
    method: "POST",
    headers: { ...authHeaders(), Prefer: "wait" },
    signal: AbortSignal.timeout(120_000),
    body: JSON.stringify({ input: { prompt: text, voice: TTS_VOICE, exaggeration: 0.4 } }),
  });

  if (!res.ok) {
    throw new Error(`speak ${res.status}: ${(await res.text()).slice(0, 500)}`);
  }
  const data = await res.json();
  if (data?.status && data.status !== "succeeded") {
    throw new Error(`speak ${data.status}: ${data.error ?? "unknown"}`);
  }
  const url = typeof data?.output === "string" ? data.output : data?.output?.[0];
  if (!url) throw new Error("speak returned no audio url");
  return url;
}