# Rawaan — Patient Context Engine

Rawaan is a clinician-facing **documentation support** prototype for the AI Hackathon Pakistan 2026 Healthcare Track. The initial Scribe slice turns a fictional, manually entered consultation transcript into an editable structured note and saves it only after explicit clinician approval.

> This demo uses **fictional data only**. It does not diagnose, recommend treatment, provide general medical advice, connect to an EHR, or support real patient use.

## Current vertical slice

The implemented flow is deliberately narrow:

1. Enter a fictional patient identifier, display name, date, and scripted/manual transcript.
2. Create a structured **draft** note with transcript provenance.
3. Review and edit every field.
4. Approve and save the note to the demo-only JSON store.

The current generator is explicitly labeled **Local demo parser**. It extracts only labelled content from the transcript and does not claim to be an LLM response. The versioned grounded-note prompt is prepared under `lib/llm/prompts/` for a future configured provider.

## Local development

| Command | Purpose |
|---|---|
| `npm install` | Install the project dependencies. |
| `npm run dev` | Start the Next.js development server. |
| `npm run typecheck` | Run strict TypeScript validation. |
| `npm run lint` | Lint application-owned code and tests. |
| `npm run test` | Run schema, persistence, generator, and approval-flow unit tests. |
| `npm run build` | Produce and validate the production build. |

Open the local URL printed by `npm run dev`, typically `http://localhost:3000`.

## Architecture and data boundaries

The project starts as a single **Next.js App Router + TypeScript** application. The decision and future Python-ASR boundary are documented in [`DECISIONS.md`](./DECISIONS.md). The application enforces the following safety boundaries:

- A raw transcript is retained with each note as provenance.
- Only notes with `approval_status: "approved"` can be persisted.
- The persisted demo store is `data/notes.json`, initially empty and never seeded by business logic.
- LLM prompts live in `lib/llm/prompts/`, while generator integration lives in `lib/llm/`.

The next product slice is patient-specific Brain retrieval over **approved** notes, with strict patient isolation and a `no_supporting_record` result when the history does not support the question.
