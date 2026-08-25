# Voice Input Scribe Implementation Plan

**Goal:** Add a consent-gated, batch voice-recording option to Step 1 that transcribes one completed recording into the existing editable transcript textarea while preserving the manual/scripted path and every downstream Scribe behavior unchanged.

**Architecture:** Keep the current `ScribeWorkspace` as the Step 1 owner. An additive client recording controller uses `getUserMedia` and `MediaRecorder` only after the clinician has checked the UI-only consent checkbox; it collects audio locally and sends one file to a server-side transcription endpoint after Stop. The endpoint delegates only to a provider adapter selected through an explicit approval gate. On success, the returned text becomes the existing `form.transcript` value, which follows the unchanged `generateDraftAction` → local-demo parser → clinician review → approval → persistence flow.

**Tech Stack:** Next.js App Router, React client components, TypeScript (strict), Zod, browser `MediaRecorder` and `navigator.mediaDevices.getUserMedia`, a future server-side transcription provider adapter, Vitest, Playwright.

**Scope source:** `pasted_content_3.txt`; current Step 1 implementation: `app/components/scribe-workspace.tsx`; current transcript-to-draft boundary: `lib/llm/generate-note.ts`.

**Decision Record:** The provider is approved in `DECISIONS.md`: Groq's OpenAI-compatible transcription endpoint, `https://api.groq.com/openai/v1/audio/transcriptions`, using `whisper-large-v3-turbo`. The server-only adapter reads `GROQ_API_KEY` from `.env.local`. This decision does not authorize Task 2 or implementation; it records the selected provider boundary only.

## Global Constraints

- This is a turn-based, **batch-only** recording feature. Recording starts on Record, ends on Stop, and sends exactly one completed audio file only after Stop. There is no streaming request, live partial transcript, background upload, or real-time field mapping.
- The existing manual/scripted textarea remains visible, editable, and usable as the immediate fallback throughout the feature. It is not replaced, hidden, or made dependent on microphone or provider availability.
- A successful transcription writes ordinary text to the existing `form.transcript` field. `generateDraftAction`, `lib/llm/generate-note.ts`, the note schema, review fields, approval flow, repository, and persistence format remain unchanged.
- The consent checkbox is a required **UI-only demo gate**. It enables Record but does not create backend consent records or claim legal compliance.
- The UI must state truthfully that audio-to-text is real transcription only after a provider is configured, while structured-note generation remains the existing **Local demo parser**. Do not imply that the local parser is an LLM or that transcription has been configured before it is.
- The first real external API integration must keep its secret in `.env.local` only. Never expose the key in client code, browser requests, logs, test fixtures, commits, or error messages.
- Permission denial, unsupported browser recording, offline state, upload failure, invalid provider response, and provider failure must preserve a usable textarea and show a clear inline fallback message. No state may leave the UI recording, transcribing, blocked, or silently failed.
- Audio is handled only for the active browser interaction. v1 does not persist audio, retain `Blob` URLs after use, add storage, or add a patient-record audio field.
- Groq accepts direct `webm` uploads, so the expected Chrome desktop `MediaRecorder` output (`audio/webm` with Opus) requires no conversion in v1. The supported demo environment is the rehearsed Chrome desktop browser/OS combination, not a universal cross-browser guarantee.
- Groq's published free-plan baseline for `whisper-large-v3-turbo` is 20 RPM, 2,000 RPD, 7,200 audio seconds per hour, and 28,800 audio seconds per day; direct uploads are capped at 25 MB. The active account's limits page remains authoritative.
- Follow `docs/DESIGN.md` and the existing Rawaan controls: no shadows, gradients, generic alert bars, or extra forward CTA treatment. The Record/Stop control is a stateful capture control, not a second product CTA.
- Do not touch `feat/brain-retrieval`, Brain files, `data/seed/**`, or any Brain UI. Do not implement the Future / v2 item in this plan.

## File Map

| Path | Responsibility |
|---|---|
| `DECISIONS.md` | Records the human-approved provider, server API approach, supported audio MIME policy, and key environment-variable name before implementation starts. |
| `app/components/scribe-workspace.tsx` | Preserves the manual transcript path and adds consent, record/stop, timer, transcription state, inline fallback messages, and safe insertion into `form.transcript`. |
| `app/api/transcribe/route.ts` | Future same-origin, server-only `POST` endpoint that validates a completed audio upload and returns a validated transcript or a stable safe error. |
| `lib/transcription/types.ts` | Shared strict contracts for client-visible transcription results, endpoint errors, and the server-only provider adapter. |
| `lib/transcription/groq-whisper.ts` | Future server-only Groq adapter using the approved OpenAI-compatible transcription request/response shape and `GROQ_API_KEY`. |
| `lib/transcription/validate-audio.ts` | Server-side size, MIME, and empty-file validation before the approved provider is called. |
| `app/globals.css` | Rawaan styling for the consent row, recording indicator/timer, transcribing state, and flat inline fallback message. |
| `tests/transcription-route.test.ts` | Endpoint validation, provider-success, and provider-failure tests with a fake provider; no live provider calls. |
| `tests/scribe-voice-state.test.ts` | Deterministic client-state tests for consent gating, recorder lifecycle, manual fallback, and safe transcript replacement behavior. |
| `tests/e2e-scribe-voice.mjs` | Production browser coverage using mocked media and transcription responses, plus the preserved manual-path flow. |
| `tests/e2e-scribe.mjs` | Existing manual transcript → draft → edit → approve → persist regression flow; it must remain unchanged and pass. |
| `README.md` | Updated only after implementation is verified, describing provider setup, demo-only consent, manual fallback, and the local demo parser boundary. |

## Interfaces and Fixed Flow

The future implementation must add no alternate downstream note shape. The external boundary is limited to the following contracts.

```ts
export type TranscriptionSuccess = {
  ok: true;
  transcript: string;
};

export type TranscriptionFailureCode =
  | "recording_not_supported"
  | "microphone_permission_denied"
  | "offline"
  | "invalid_audio"
  | "transcription_failed";

export type TranscriptionFailure = {
  ok: false;
  code: TranscriptionFailureCode;
  message: string;
};

export type TranscriptionResult =
  | TranscriptionSuccess
  | TranscriptionFailure;

export type TranscriptionProvider = {
  transcribe(input: {
    audio: File;
    signal?: AbortSignal;
  }): Promise<{ transcript: string }>;
};
```

The endpoint and UI use this fixed order:

```text
unchecked consent
  -> Record remains disabled; manual textarea remains available
checked consent + Record
  -> verify MediaRecorder/getUserMedia support
  -> request microphone permission
  -> recording state with visible timer and Stop control
Stop
  -> stop local tracks, build one completed audio File
  -> if offline: show manual-fallback message; do not call endpoint
  -> POST one FormData upload to /api/transcribe
  -> Transcribing… state; no partial transcript is shown
  -> validated final transcript
  -> populate existing form.transcript when it has not been manually edited since Stop
  -> existing Create structured draft action unchanged
  -> local-demo parser → review → clinician approval → approved-note persistence unchanged
```

If the clinician manually edits the textarea after Stop but before the transcription response returns, the response must never overwrite that fallback text. Instead, retain the clinician’s text and show an explicit non-destructive action such as **Use transcribed text**; only that explicit action may replace the textarea. If there has been no manual edit after Stop, the completed transcription directly populates the existing textarea as required.

## Tasks

### Task 1: Record the approved Groq Whisper transcription boundary before writing code

**Files:** Modify `DECISIONS.md` and this plan only. Do not create provider or UI code in this task.

- [x] Record Groq's OpenAI-compatible transcription endpoint, `https://api.groq.com/openai/v1/audio/transcriptions`, and model `whisper-large-v3-turbo` in `DECISIONS.md`.
- [x] Record `GROQ_API_KEY` as the `.env.local`-only server secret. Do not create, request, log, or commit a key.
- [x] Record direct-upload MIME support: FLAC, MP3, MP4, MPEG, MPGA, M4A, OGG, WAV, and WebM; record the 25 MB free-tier upload limit and the published free-plan baseline of 20 RPM / 2,000 RPD.
- [x] Confirm `audio/webm` is accepted directly by Groq, so Chrome desktop's expected `MediaRecorder` WebM/Opus output needs no v1 conversion step.
- [x] Record that browser support is scoped to the rehearsed demo browser/OS, expected to be Chrome desktop, rather than a universal cross-browser guarantee.
- [x] Confirm Groq transcription is the first real external integration while the existing note-generation result remains labelled `local-demo`.
- [x] Confirm the provider adapter remains server-only and the browser sends the completed audio only to same-origin `/api/transcribe`.
- [x] Commit only `DECISIONS.md` and this plan with `docs: approve Groq Whisper as Scribe transcription provider`, then stop for final human review before Task 2.

### Task 2: Define the strict transcription contracts and server validation boundary

**Files:** Create `lib/transcription/types.ts`, `lib/transcription/validate-audio.ts`, and `tests/transcription-route.test.ts`.

**Interfaces:**
- Produces the `TranscriptionResult`, `TranscriptionFailureCode`, and `TranscriptionProvider` contracts shown above.
- Consumes an uploaded `File` and the provider policy approved in Task 1.
- Does not import Scribe draft, approval, or repository modules.

- [ ] Write failing tests that reject an empty audio file as `{ ok: false, code: "invalid_audio" }` before any provider invocation.
- [ ] Write failing tests that reject a disallowed MIME type and an over-limit file before any provider invocation, using the exact approved policy from `DECISIONS.md`.
- [ ] Write a failing test where the fake provider returns blank or whitespace-only text and assert `invalid_audio` or `transcription_failed` is returned with the manual-fallback message, never a successful empty transcript.
- [ ] Define the shared contracts and `validateAudioUpload(audio: File): TranscriptionFailure | null` with no `any`, no browser globals, and no provider dependency.
- [ ] Run `npm run test -- tests/transcription-route.test.ts` and verify the tests fail before implementation exists.
- [ ] Implement only the validation module until all validation tests pass; do not add a live provider call yet.
- [ ] Commit the contract, validator, and tests with `test(transcription): define audio validation boundary`.

### Task 3: Add the approved server-side transcription endpoint and Groq adapter

**Files:** Create `app/api/transcribe/route.ts` and `lib/transcription/groq-whisper.ts`. Modify `tests/transcription-route.test.ts`.

**Interfaces:**
- `POST /api/transcribe` consumes a multipart `FormData` field named `audio` containing one completed recording.
- The route returns a JSON `TranscriptionResult` and never returns provider credential details or raw provider exceptions.
- The provider adapter implements `TranscriptionProvider` and is instantiated only on the server.

- [ ] Write a failing route test that submits one valid test `File`, injects a fake provider returning `{ transcript: "Chief complaint: Persistent headache" }`, and asserts the route returns `{ ok: true, transcript: "Chief complaint: Persistent headache" }`.
- [ ] Write a failing route test where the fake provider throws and assert `{ ok: false, code: "transcription_failed" }` plus a user-safe message that directs the clinician to type or paste the transcript manually.
- [ ] Write a failing route test proving that a validation failure does not call the fake provider.
- [ ] Implement the route to parse exactly one `audio` field, validate it, delegate to the provider, trim the result, and return only the shared result union.
- [ ] Implement the Groq adapter using the approved OpenAI-compatible transcription request/response shape and only Groq’s then-current official documented API. Read `GROQ_API_KEY` from `.env.local` through the server environment; do not export it, log it, or add it to a `NEXT_PUBLIC_` variable.
- [ ] Run `npm run test -- tests/transcription-route.test.ts` and confirm all tests pass with no live API key or network call.
- [ ] Commit route, adapter, and focused tests with `feat(scribe): add batch transcription endpoint`.

### Task 4: Add a consent-gated batch recorder without replacing manual entry

**Files:** Modify `app/components/scribe-workspace.tsx`, create `tests/scribe-voice-state.test.ts`, and modify `app/globals.css` only for the added Step 1 controls.

**Interfaces:**
- Consumes the existing `FormValues.transcript` state and writes no new note or persistence fields.
- Calls only `POST /api/transcribe` after `MediaRecorder.stop` has produced one non-empty completed `File`.
- Produces `idle`, `recording`, `transcribing`, or inline-fallback UI states; there is no streaming state or partial transcript state.

- [ ] Write a failing state test that verifies the Record control is disabled until `Patient consented to recording` is checked, while the existing manual textarea remains enabled.
- [ ] Write a failing state test that verifies Record requests audio only after consent, exposes `Recording 00:00`, increments a visible timer, and exposes Stop while the recorder is active.
- [ ] Write a failing state test that verifies Stop ends the recorder, stops every acquired media track, sends exactly one completed `File` to `/api/transcribe`, and renders `Transcribing…` until one final result resolves.
- [ ] Write failing state tests for `NotAllowedError`, an unsupported `MediaRecorder`/`getUserMedia`, `navigator.onLine === false`, and an endpoint failure. Each must show an inline manual-fallback message and leave the textarea usable.
- [ ] Write a failing state test where the clinician changes the textarea after Stop. Assert the delayed successful result does not overwrite that content and exposes the explicit **Use transcribed text** replacement action.
- [ ] Add local state for consent, recorder lifecycle, elapsed recording seconds, fallback status, and the transcript revision captured at Stop. Reset all voice-only state when `Start new consultation` runs.
- [ ] Render the consent checkbox, Record/Stop control, recording indicator/timer, `Transcribing…` state, and a flat inline fallback message using the existing Rawaan field and status styles. Keep the manual textarea visible in every state.
- [ ] On a successful final result, write it to `form.transcript` only if the transcript has not changed since Stop. If it has changed, preserve manual text and require the explicit replacement action.
- [ ] Run `npm run test -- tests/scribe-voice-state.test.ts` and confirm all recorder and fallback tests pass.
- [ ] Commit component, styles, and focused state tests with `feat(scribe): add consent-gated batch recording`.

### Task 5: Prove the existing Scribe pipeline is unchanged after voice input

**Files:** Create `tests/e2e-scribe-voice.mjs`; retain `tests/e2e-scribe.mjs` unchanged unless a stable selector is required for the new controls; update `README.md` only after the feature works.

**Interfaces:**
- The browser test mocks browser media and `/api/transcribe`; it does not require a microphone, an installed browser audio stack, an OpenAI key, or a real provider request.
- The existing manual E2E continues to submit the same textarea and inspect the same local-demo review and persistence states.

- [ ] Write a browser test that checks consent, starts a mocked recording, stops it, verifies no partial transcript is rendered, waits for `Transcribing…` to finish, and asserts the completed transcript appears in the existing Step 1 textarea.
- [ ] Continue that same browser flow through `Create structured draft`, clinician edit, approval, and persisted confirmation. Assert the existing local-demo parser disclosure remains visible.
- [ ] Write browser cases for denied permission and a failed transcription response. Assert each case gives an inline manual fallback and permits typing a transcript, then complete the unchanged draft → edit → approve flow through the manual path.
- [ ] Run the existing `node tests/e2e-scribe.mjs` to prove the unchanged manual route still works.
- [ ] Run `npm run typecheck`, `npm run lint`, `npm run test`, and `npm run build`.
- [ ] Run production browser tests only against `npm run build` plus `npm run start`, reset `data/notes.json` to `[]`, stop the temporary server, and remove test artifacts.
- [ ] Update `README.md` to distinguish configured real audio-to-text transcription from the still-local demo parser, to document `.env.local` setup without showing a secret, and to state the manual fallback and demo-only consent behavior.
- [ ] Commit integration tests and documentation with `test(scribe): cover batch voice transcript fallback`.

## Acceptance Criteria

- A scripted mock consultation recorded through the microphone produces one complete transcript that populates the existing Step 1 textarea after Stop and transcription completes.
- The manual typing/paste path remains completely usable and unchanged before, during fallback from, and after any recording attempt.
- The Record control cannot start until `Patient consented to recording` is checked; that gate is explicitly UI-only for the demo.
- No partial transcript, streaming request, background audio upload, live field mapping, or real-time ASR is shown or implemented.
- A visible recording indicator/timer appears only while recording; a visible `Transcribing…` state appears only after Stop while the single batch request is pending.
- Permission denial, unsupported browser recording, offline state, invalid audio, and provider failure produce a clear inline manual-fallback message without a stuck UI or lost textarea content.
- The clinician can edit the final transcript before generating a draft. Manual content entered after Stop is not overwritten by a delayed transcription result.
- The existing note schema, local demo parser, draft generation, review, approval, and approved-note persistence logic remain unchanged.
- The UI accurately distinguishes configured real audio-to-text transcription from the local demo parser used for note structuring.
- The full validation loop passes: focused tests, existing Scribe E2E, typecheck, lint, test, production build, production browser exercise, data reset, and temporary-artifact cleanup.

## Future / v2 — Not in Scope

A conversational voice agent that asks one structured question at a time and maps live spoken answers directly to individual note fields is intentionally excluded. It is a separate architectural feature requiring conversation state, turn-taking, audio interaction design, and live field mapping; it must receive its own specification, implementation plan, and approval before work begins.

## Rollback

Revert the voice-input commits as a group. The existing manual textarea and local-demo transcript-to-note flow remain the fallback baseline. If a defect risks exposing audio, mishandling consent, or making Step 1 unusable, disable the transcription endpoint and remove the recording controls rather than weakening the manual workflow or persisting audio.
