# Scribe Vertical Slice Implementation Plan

**Goal:** Deliver a Next.js App Router + TypeScript Scribe flow that accepts a manual/scripted transcript, creates a schema-valid structured note draft, lets the clinician edit and approve it, and persists only the approved note.

**Architecture:** A single Next.js application will keep server-side actions, Zod validation, the draft-generation adapter, JSON-file persistence, and the clinician-facing UI together. The generator will live under `lib/llm/` with its prompt under `lib/llm/prompts/`, so a configured LLM provider can be used without moving AI logic into pages or API handlers. A local, clearly-labelled deterministic fallback will keep the scripted-demo path usable when no API key is configured; it must never be represented as an LLM response.

**Tech Stack:** Next.js App Router 16.3.2, React, TypeScript (strict), Zod, Vitest, ESLint, Node file-system persistence for the demo-only note store.

**Decision Record:** `DECISIONS.md`

## Global Constraints

- Follow `AGENTS.md`: strict TypeScript, no `any`, prompts only in `lib/llm/prompts/`, LLM calls only in `lib/llm/`, no diagnosis or treatment advice, and no unrelated changes.
- Accept scripted/manual transcript entry in this slice; exclude audio recording, live ASR, Brain retrieval, CRM, patient analytics, EHR integration, and real patient data.
- Persist only clinician-approved notes. Raw transcripts must remain attached to each persisted note as provenance.
- Store no seed/demo notes in application logic. Any future synthetic histories belong only under `data/seed/` and are loaded explicitly.
- Keep the LLM provider secret in `.env.local`, never in source control. An unconfigured provider must fail visibly or use the explicitly marked local-demo fallback; it must never silently claim an LLM response.

## File Map

| Path | Responsibility |
|---|---|
| `package.json` | Application scripts and verified dependencies. |
| `app/layout.tsx` | Metadata and root document. |
| `app/page.tsx` | Server-rendered page shell for the Scribe. |
| `app/actions.ts` | Server Actions for draft creation and approval. |
| `app/components/scribe-workspace.tsx` | Client-side transcript, draft review, edit, and approval interaction. |
| `app/globals.css` | Focused responsive styling for the Scribe workspace. |
| `lib/notes/schema.ts` | Fixed `Note` and draft validation schemas. |
| `lib/notes/repository.ts` | JSON-backed storage; rejects persistence of non-approved notes. |
| `lib/llm/prompts/note-generation.ts` | Versioned, grounded structured-note prompt. |
| `lib/llm/generate-note.ts` | Provider boundary and explicit local-demo fallback. |
| `lib/actions/scribe.ts` | Input validation and orchestration shared by Server Actions and tests. |
| `data/notes.json` | Empty demo-store file for locally approved notes; contains no seed data. |
| `tests/*.test.ts` | Schema, generator, orchestration, and persistence tests. |
| `.env.example` | Required LLM configuration names only. |

## Tasks

### Task 1: Scaffold the strict Next.js application and toolchain

**Files:** Create `package.json`, `tsconfig.json`, `next.config.ts`, `eslint.config.mjs`, `vitest.config.ts`, `app/layout.tsx`, `app/page.tsx`, and `app/globals.css`.

- [ ] Write the manifest with `dev`, `build`, `start`, `typecheck`, `lint`, and `test` commands.
- [ ] Install the declared dependencies and generate the lockfile.
- [ ] Add strict compiler and test configuration.
- [ ] Run `npm run typecheck`, `npm run lint`, and `npm run build`; record actual output.

### Task 2: Define and test the approved-note domain boundary

**Files:** Create `lib/notes/schema.ts`, `lib/notes/repository.ts`, `data/notes.json`, and tests for each.

- [ ] Write failing tests proving the fixed note schema accepts empty unknown fields but rejects incomplete note metadata.
- [ ] Write a failing test proving the repository rejects draft notes and persists approved notes with their raw transcript.
- [ ] Implement the minimal Zod schemas and JSON repository to make the tests pass.
- [ ] Run the focused tests.

### Task 3: Implement the grounded note draft generator

**Files:** Create `lib/llm/prompts/note-generation.ts`, `lib/llm/generate-note.ts`, and generator tests.

- [ ] Write failing tests for the local-demo generator: it must preserve only transcript-backed content, produce all fixed fields, and mark the response source honestly.
- [ ] Define the provider boundary and versioned system prompt that prohibits diagnosis, treatment recommendations, and gap-filling.
- [ ] Implement Zod validation of all provider output before returning a draft.
- [ ] Provide a clearly marked local-demo fallback when no provider configuration is present.
- [ ] Run the focused generator tests.

### Task 4: Connect draft generation and approval through Server Actions

**Files:** Create `lib/actions/scribe.ts`, `app/actions.ts`, and action tests.

- [ ] Write failing tests proving blank transcript or patient identifiers are rejected.
- [ ] Write a failing test proving draft generation creates a `draft` note and approval transitions it to `approved` before persistence.
- [ ] Implement the smallest orchestration layer to make the tests pass.
- [ ] Run action and repository tests together.

### Task 5: Build the clinician-facing Scribe workspace

**Files:** Create `app/components/scribe-workspace.tsx`; modify `app/page.tsx` and `app/globals.css`.

- [ ] Add explicit patient ID/display-name inputs and a textarea for a scripted/manual transcript.
- [ ] Add a generate-draft interaction, editable fields for every structured-note section, and a visible draft versus approved status.
- [ ] Add an approval interaction that reports the persisted note ID and time.
- [ ] Keep a persistent documentation-only disclaimer and label any local-demo draft source honestly.
- [ ] Exercise the full manual flow in a browser: transcript → draft → edit → approve → persisted confirmation.

### Task 6: Verify the slice and document its operating boundary

**Files:** Modify `README.md` and `.env.example` only if necessary to provide startup and provider-configuration instructions.

- [ ] Run `npm run typecheck`.
- [ ] Run `npm run lint`.
- [ ] Run `npm run test`.
- [ ] Run `npm run build`.
- [ ] Inspect `git diff --check` and `git status --short` to confirm the change set is limited to the Scribe slice and decision/plan documentation.
- [ ] Record the actual validation output before declaring completion.

## Rollback

Revert the Scribe application files and `package-lock.json` as one change. Retain `DECISIONS.md` and this plan unless the team explicitly reverses the Next.js decision.
