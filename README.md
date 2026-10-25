# Aloud

An AI tutor that talks a student through the essay they just wrote.

Paste an essay in and it gets read closely. The questions come from what that student
actually argued — their thesis, their evidence, the choices they made — not from a generic
study guide. The student answers out loud. You get a transcript, a comprehension score, and
a signal worth a second look.

## The design constraint

The student is **never accused of anything**. There is no "cheating check" framing shown to
them, and the tutor never asks "did you write this?".

Instead the questioning simply gets more specific. A student who wrote the essay can answer
questions grounded in its particulars; someone who didn't will drift to generalities, and
the tutor will press toward a concrete detail each time. That drift is the signal — and
because the questions are indistinguishable from an ordinary oral test, a student who is
merely struggling doesn't get flagged as a cheater.

Poor answers alone lower **comprehension** but must not crush **ownership confidence**.
Only genuinely inconsistent answers with the essay move that number.

## Running it

```bash
npm install
cp .env.example .env      # add your Hack Club AI key and a MongoDB DATABASE_URL
npx prisma db push       # creates the collections and indexes
npm run dev
```

Open http://localhost:3000.

Get an API key at https://ai.hackclub.com (sign in with Hack Club). It goes in `.env` as
`HACK_CLUB_AI_API_KEY` and must never be committed.

## Flow

0. Teachers sign in with Google (name and email only). Sessions and results are owned by
   that account, so only the teacher who set a session up can see its scores. Students need
   no account.
1. **/teacher/import** — connect Google Classroom, pick an assignment, and the essays come
   in on their own. Or **/teacher/new** — paste a title, optional prompt, and the essay.
2. The app extracts a thesis, claims, key details, *signature details* (the unusual
   choices that reveal authorship), and *weak spots* — then drafts six questions across
   thesis / evidence / reasoning / choice / counterargument / weak-spot.
3. You get a **student link** to send out. Results show up under "Your results" when you
   are signed in.
4. **/s/[token]** — the student enters their name, then holds to talk. Audio is
   transcribed, the tutor asks an adaptive follow-up, and reads it aloud.
5. **/t/[token]** — (owner only) transcripts, comprehension score, authorship signal, per-question notes.

The student link can be opened more than once; each visit starts a fresh session.

## Models

Everything runs through Hack Club AI (`https://ai.hackclub.com/proxy/v1`), which is
OpenAI-compatible.

| Role | Model | Why |
|---|---|---|
| LLM | `qwen/qwen3-32b` | ~3.7s per conversational turn |
| STT | `qwen/qwen3.8-omni-flash` | accepts audio input, ~4s |
| TTS | `resemble-ai/chatterbox-pro` | ~2s, natural delivery |

`HCAI_LLM_MODEL` and `HCAI_STT_MODEL` are separate on purpose. The omni model works as an
LLM too but measured ~11s per turn against ~3.7s, and that gap is dead air for a student
waiting to be re-questioned. End-to-end turn time is roughly 12s
(transcribe → generate → synthesise).

Provider constraints worth knowing:

- **TTS goes through the Replicate proxy**, not chat completions, and chatterbox's text
  field is named `prompt`, not `text`.
- **Audio must be a data URI.** The proxy will not fetch third-party URLs; a remote audio
  URL returns 404.
- **The transcription model is not `incredibly-fast-whisper`**, despite it appearing
  allowlisted — every prediction call 404s. `qwen3.8-omni-flash` replaces it and runs
  through the normal endpoint.
- There is no streaming speech-to-speech model available, so the loop is push-to-talk by
  design rather than full duplex.

## Layout

```
src/lib/hackclub.ts   provider client: chat, chatJson, transcribe, speak
src/lib/analysis.ts   essay analysis, question generation, adaptive turn logic, grading
src/lib/audio.ts      MediaRecorder webm → 16 kHz mono WAV data URI
src/lib/db.ts         Prisma client
src/lib/google.ts     OAuth URLs, code exchange, scope list
src/lib/classroom.ts  Classroom API calls, Docs text extraction
src/lib/session.ts    signed teacher session cookie
src/lib/account.ts    token resolution and shared error responses
src/app/api/          assignments, sessions, turns, grading
src/app/api/google/   connect, callback, courses, coursework, submissions, import, disconnect
src/app/teacher/new   paste an essay
src/app/teacher/import  Google Classroom import wizard
src/app/s/[token]     student start
src/app/s/session/[id]  the voice test itself
src/app/t/[token]     teacher results
```

## Google Classroom import

`/teacher/import` pulls a whole assignment at once: you pick a course, pick a written
assignment, tick the students you want, and it creates an `Assignment` row per essay with
the same student links you'd get from pasting, all owned by you. Nothing downstream changes.

**Students must attach a Google Doc.** A submission that is a short typed answer
(`note`) is used only as a fallback, and a Doc the student *created themselves* rather than
attached is private to them — that import fails with an explanation. To get a full class
through cleanly, the assignment has to ask students to attach a Doc.

### One-time console setup

All of this lives in Google Cloud, not in this repo. Nothing works until it is done.

1. [Cloud console](https://console.cloud.google.com) → create a project.
2. Enable the **Classroom API** and the **Docs API**.
3. Configure the OAuth consent screen. While it is in **Testing**, Google issues refresh
   tokens that expire after **7 days** — a connected teacher has to reconnect every week.
   To ship to a real school, set it to External / In production and complete verification
   (privacy policy + demo video, a few business days).
4. Credentials → OAuth client ID → **Web application**. Add
   `https://yourdomain.com/api/google/callback` as an authorized redirect URI. No
   fragments, no wildcards.
5. Put the client ID, secret, redirect URI, and a `G_SESSION_SECRET` in `.env`:

   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```

There is no cost. Every scope used here is read-only, and the Classroom and Docs APIs are
free tiers.

### Why these scopes

```ts
classroom.courses.readonly
classroom.coursework.students.readonly
classroom.student-submissions.students.readonly
documents.readonly
```

`documents.readonly` rather than the more obvious `drive.readonly` is deliberate.
`drive.readonly` is on Google's **restricted** list, which drags the whole app into the
CASA security assessment regime — annual third-party audits, years of paperwork, a
guarantee an unpaid classroom tool won't need. `documents.readonly` is not restricted, and
the Docs API is enough to read an attached document by id, which is the only thing we do
with it. Never widen this list without checking Google's restricted-scope table first.

### Not exercised against real Google

The parser was tested against a fixture covering bold-split runs, empty paragraphs, page
breaks, horizontal rules, and nested tables. The auth gate was tested for rejection
(401 unsigned, 401 forged, 401 signed-but-unknown). But no OAuth client has ever been
created, so **no code path here has run against the live API**. Set it up and try one
assignment with one student before trusting a class.

Imports run in batches of three (`maxDuration = 300`); each essay costs a Docs fetch plus
two LLM calls, about a minute. The browser loops over the batches and keeps partial
results, so a timeout loses five essays rather than thirty.

## Audio capture is untested in a real browser

The recording path was validated by running real speech through the exact resample-and-encode
code in `src/lib/audio.ts` and confirming the transcription model returned it verbatim, and
every page renders. What has *not* been exercised is an actual `getUserMedia` +
`MediaRecorder` round trip. Test that in a browser before relying on it.