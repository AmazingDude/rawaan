# Rawaan — Patient Context Engine

Rawaan is a clinician-facing **documentation support** prototype for the AI Hackathon Pakistan 2026 Healthcare Track. The Scribe slice turns a fictional consultation transcript—typed or pasted manually, or produced from an optional consent-gated batch recording—into an editable structured note and saves it only after explicit clinician approval.

> This demo uses **fictional data only**. It does not diagnose, recommend treatment, provide general medical advice, connect to an EHR, or support real patient use.

## Current vertical slice

The implemented flow is deliberately narrow:

1. Enter a fictional patient identifier, display name, date, and a scripted/manual transcript, or optionally check the UI-only demo consent box and record one complete fictional consultation.
2. After **Stop**, the optional batch recorder sends one completed audio file to the same-origin transcription route; it never streams partial text or retains audio.
3. Review or edit the ordinary transcript textarea, then create a structured **draft** note with transcript provenance.
4. Review and edit every field.
5. Approve and save the note to the demo-only JSON store.

### Transcription and note-structuring boundary

**Audio-to-text is configured separately from note structuring.** When `GROQ_API_KEY` is configured locally, `POST /api/transcribe` calls Groq's OpenAI-compatible Whisper endpoint with `whisper-large-v3-turbo` after one recording is stopped. The browser sends the completed file only to the same-origin route; the key remains server-only and audio is not persisted. This rehearsed demo path targets Chrome desktop's `audio/webm` capture output and is not a universal browser-support guarantee.

The structured-note generator remains explicitly labeled **Local demo parser**. It extracts only labelled content from the editable transcript and does not claim to be an LLM response. The versioned grounded-note prompt is prepared under `lib/llm/prompts/` for a future configured provider.

The recording consent checkbox is a **UI-only demo gate**, not stored consent evidence or a legal-compliance workflow. If recording is unsupported, microphone permission is denied, the browser is offline, or transcription fails, Rawaan keeps the manual textarea available and tells the clinician to type or paste the transcript instead.

## Local development

| Command | Purpose |
|---|---|
| `npm install` | Install the project dependencies. |
| `npm run dev` | Start the Next.js development server. |
| `npm run typecheck` | Run strict TypeScript validation. |
| `npm run lint` | Lint application-owned code and tests. |
| `npm run test` | Run schema, persistence, generator, and approval-flow unit tests. |
| `npm run build` | Produce and validate the production build. |

Open the local URL printed by `npm run dev`, typically `http://localhost:3000`. The root route is the Rawaan landing page; select **Try the Demo** or open `http://localhost:3000/record` directly to access the sidebar workspace (Record, Clients, Rawaan AI, and Learn Rawaan).

### Local transcription setup

Create an ignored `.env.local` file in the repository root and add the Groq server credential locally:

```dotenv
GROQ_API_KEY=your-local-groq-key
```

Do not commit `.env.local`, do not use a `NEXT_PUBLIC_` variable, and do not paste a key into browser tests or logs. The automated and browser E2E suites mock media and `/api/transcribe`, so they do not contact Groq or require this key. For production-browser rehearsal on this Windows machine, run `npm run build`, then `npm run start`, before running the browser scripts.

## Architecture and data boundaries

The project starts as a single **Next.js App Router + TypeScript** application. The decision and future Python-ASR boundary are documented in [`DECISIONS.md`](./DECISIONS.md). The application enforces the following safety boundaries:

- A raw transcript is retained with each note as provenance.
- Only notes with `approval_status: "approved"` can be persisted.
- The persisted demo store is `data/notes.json`, initially empty and never seeded by business logic.
- LLM prompts live in `lib/llm/prompts/`, while generator integration lives in `lib/llm/`.

The next product slice is patient-specific Brain retrieval over **approved** notes, with strict patient isolation and a `no_supporting_record` result when the history does not support the question.
