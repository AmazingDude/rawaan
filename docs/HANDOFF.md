# Handoff

## Current state

`main` contains the merged Rawaan design system, landing route split, typography update, and CI workflow. The active Scribe voice-input workstream is on `feat/voice-input-scribe`; Task 1 selected Groq's OpenAI-compatible `whisper-large-v3-turbo` transcription boundary, Task 2 added strict validation contracts and tests, Task 3 added the server-only Groq adapter plus `POST /api/transcribe`, and Task 4 now adds an additive consent-gated batch recorder beside the manual textarea. `lib/transcription/voice-recorder.ts` isolates browser-independent lifecycle and transcript-race logic for mocked testing; the client component owns browser-only media access and posts a single completed recording to the typed route. The Brain retrieval plan remains a separate, review-only workstream.

| Area | Current direction |
|---|---|
| Scope | Preserve the existing transcript → draft → edit → approve → persist workflow and the always-usable manual transcript path; Task 4 adds only consent-gated batch recording beside it. |
| Visual change | Remove colored left-border accent bars from banners and callouts; use flat pastel fills instead. |
| Step 2 layout | Organize the existing note fields into Subjective, Assessment & Plan, and Follow-up & Notes sections, with dividers and responsive two-column field pairing. |
| Step 1 layout | Keep the transcript card sticky above the 900px breakpoint and stacked normally at narrower widths. Fixed-viewport live-scroll verification confirmed it pins at a 24px top offset after scrolling. |
| Third-round UX | Added explicit transcript-absence messaging, a visibly locked approved-note state, and a local-only “Start new consultation” reset action. |
| Documentation | `docs/DESIGN.md` is the canonical reference for the no-accent, section-grouped, sticky layout, approved/empty Scribe states, and the landing hero. |
| Landing route split | Root `/` remains a dark Canopy Green Rawaan hero with one Coral “Try the Demo” action to `/scribe`; the preserved Scribe flow remains otherwise unchanged. |
| Landing review round | Completed locally: wordmark/subtitle lockup plus safety-label pill, bounded left hero column with Leaf-emphasized headline word, and connected Cream Transcript → Clinician review → Approved note section. |
| Typography round | Completed locally: Onest replaces the UI/body system; OFL-licensed Thestral Neue is self-hosted and restricted to the one landing hero headline. |
| Voice-input Task 2 | `lib/transcription/types.ts` defines the strict result/provider contracts; `lib/transcription/validate-audio.ts` enforces empty-file, supported-MIME, 25 MB, and blank-transcript safeguards with no browser globals or provider access. |
| Voice-input Task 3 | `app/api/transcribe/route.ts` validates one multipart `audio` field before delegation; `lib/transcription/groq-whisper.ts` is the server-only Groq adapter using `GROQ_API_KEY`, the documented OpenAI-compatible endpoint, and `whisper-large-v3-turbo`. |
| Voice-input Task 4 | The Scribe client now has UI-only recording consent, a secondary Record/Stop control, visible recording timer and transcribing state, direct success population of the existing textarea, an explicit replacement action for a post-stop manual-edit race, and manual-friendly fallbacks. Browser APIs remain scoped to client code; one completed file is posted to `/api/transcribe` only after Stop. |
| Branch process | `feat/voice-input-scribe` is published for review only. Task 4 is complete and awaiting review; Task 5 remains blocked pending explicit approval. |

## Constraints

The labels, field names, schema, state management, Server Actions, accessibility roles, and test selectors must remain unchanged. The `inspo/` directory is an untracked reference asset and must remain untouched. The design system still prohibits shadows, decorative coral, unnecessary motion, and content hidden by animation.

## Validation and environment notes

The second-round implementation was validated with `npm run typecheck`, `npm run lint`, `npm run test` (3 files and 8 tests), and `npm run build`; every command passed. A production-browser capture exercised transcript → draft → edit → approve → persisted confirmation. It asserted that the desktop Step 1 card is sticky, the compliance and message callouts have no left border, and the 800px layout makes all grouped review fields full-width with Step 1 no longer sticky. The unchanged `tests/e2e-scribe.mjs` script also passed against the production build.

The third-round sticky verification used separate 1440×900 viewport screenshots at scroll positions 0, 400px, and 800px rather than a stitched full-page capture. At 400px and 800px, Step 1 measured `position: sticky` with a 24px viewport top offset and rendered correctly. The prior detached full-page placement is a known capture artifact for sticky elements, not a live layout defect; do not use a stitched full-page image to assess sticky positioning.

The third-round implementation passed `npm run typecheck`, `npm run lint`, `npm run test` (3 files and 8 tests), and `npm run build`. A production-browser exercise verified the explicit transcript-absence and parser-omission states, the locked approved-note controls, the approved status pill, the local-only reset to an empty consultation, and the fixed-scroll sticky measurements. The unchanged `tests/e2e-scribe.mjs` script also passed on the production build.

On this Windows machine, use `npm run build` followed by `npm run start` for browser exercises; the development server has previously served client chunks unreliably. The optional `PLAYWRIGHT_CHROMIUM_EXECUTABLE` variable can point to the installed local Chromium. Browser test data was reset to `data/notes.json` containing `[]`, and temporary servers and test artifacts were removed.

The initial landing route split passed `npm run typecheck`, `npm run lint`, `npm run test` (3 files and 8 tests), and `npm run build`, which emitted both `/` and `/scribe`. A production browser check verified the root page’s single `/scribe` CTA, solid Canopy Green surface, absence of shadow/gradient, and responsive desktop/mobile layout. The updated production Scribe E2E passed on `/scribe`. One initial routed E2E timeout was traced to a stale development listener on port 3000; after stopping it and restarting `next start`, the flow passed unchanged.

The reviewed landing refinement passed `npm run typecheck`, `npm run lint`, `npm run test` (3 files and 8 tests), and `npm run build`. A production browser assertion verified the unified navigation alignment, one-column hero alignment, 600–720px desktop hero height, Leaf headline emphasis, three workflow cards, one `/scribe` CTA, no mobile horizontal overflow, and the CTA navigation itself. The unchanged production Scribe E2E also passed. Desktop and mobile screenshot review found the requested navigation, hierarchy, and Cream workflow section rendered correctly. Test data was reset to `[]` and the temporary server was stopped.

The typography update passed a fresh `npm run typecheck`, `npm run lint`, `npm run test` (3 files and 8 tests), and `npm run build`. A clean-port production browser exercise verified that Onest loads across the landing and Scribe UI, Thestral Neue loads only for the root landing hero headline, `/scribe` contains no landing headline, the root CTA still routes to `/scribe`, and both pages have no mobile horizontal overflow. The full production Scribe transcript → draft → edit → approve → persisted-record E2E also passed after the font change. Four desktop/mobile captures were reviewed, `data/notes.json` was reset to `[]`, and the temporary server/artifacts were removed.

Voice-input Task 2 passed focused validation (`tests/transcription-route.test.ts`: 6 tests), plus `npm run typecheck`, `npm run lint`, `npm run test` (4 files and 14 tests), and `npm run build`. The tests prove that empty files, unsupported MIME types, files above the 25 MB policy, and blank fake-provider text resolve safely before any real provider boundary.

Voice-input Task 3 extended the focused route tests to 9 fake-provider cases. `npm run typecheck`, `npm run lint`, `npm run test` (4 files and 17 tests), and `npm run build` all passed; the build emitted dynamic `/api/transcribe`. One throwaway production smoke test sent a public non-clinical WAV through the deployed route using the user-supplied local `GROQ_API_KEY` and received a non-empty success transcript. The key and raw provider response were never read, logged, or committed. Temporary audio, response, server logs, test scripts, and the port-3000 process were removed afterward.

Voice-input Task 4 began with a deliberate RED test run because the focused recorder helper did not yet exist. The new `tests/scribe-voice-state.test.ts` uses only mocked media, timer, and network boundaries; it covers consent gating, timer/track-stop/single-file lifecycle, manual-edit-after-Stop race protection, reset discarding a delayed prior-consultation result, successful placement, permission denial, unsupported browser, offline, and endpoint failure. The focused suite passed 9 tests. The final full validation loop passed: `npm run typecheck`, `npm run lint`, `npm run test` (5 files and 26 tests), and `npm run build`.

A production-browser capture ran against `npm run start` with a mocked `MediaRecorder`, mocked `getUserMedia`, and an intercepted `/api/transcribe` response; it made exactly one mocked transcription request and no live Groq request. Reviewed screenshots show the required consent-unchecked/disabled Record, recording timer, Transcribing…, successful textarea population, and permission-denied fallback states. The manual textarea remained visible in every capture. Screenshot copies are retained outside the repository; the temporary server, `.test-logs`, and port-3000 listener were removed. No note was approved or persisted during this Task 4 capture.

## Next action

Await explicit approval before Task 5 of `plans/2026-08-25-voice-input-scribe.md`. Do not modify the existing E2E scripts, add voice E2E integration, update README documentation, or begin any Brain work until that gate is granted.
