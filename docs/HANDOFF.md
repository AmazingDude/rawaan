# Handoff

## Current state

`main` contains the merged Rawaan design system, landing route split, typography update, and CI workflow. The active Scribe voice-input workstream is on `feat/voice-input-scribe`; Tasks 1–4 added the approved Groq transcription boundary, server validation and endpoint, plus an additive consent-gated batch recorder beside the manual textarea. Task 5 now adds mocked production-browser coverage for the success and fallback-to-manual flows, confirms the unchanged manual E2E, and documents the configured Groq/local-parser boundary. `lib/transcription/voice-recorder.ts` isolates browser-independent lifecycle and transcript-race logic for mocked testing; the client component owns browser-only media access and posts a single completed recording to the typed route. The Brain retrieval plan remains a separate, review-only workstream.

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
| Recording Red | `--color-recording-red: #e5484d` is reserved exclusively for the active-recording solid Stop fill with white text and timer indicator dot. It is not a Coral replacement, general accent, or second CTA. |
| Voice-input Task 5 | `tests/e2e-scribe-voice.mjs` performs a mocked success flow through draft, edit, approval, and persistence plus permission-denied and endpoint-failure fallbacks that each complete the unchanged manual flow. `tests/e2e-scribe.mjs` remains unchanged and still passes. |
| Branch process | Task 5 is complete locally on `feat/voice-input-scribe`. The commit must remain local until the user has reviewed the Recording Red screenshot and explicitly authorizes a push or PR. |

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

Voice-input Task 5 passed `npm run typecheck`, `npm run lint`, `npm run test` (5 files and 26 tests), and `npm run build`. Production browser exercises ran only against `npm run start` with the local Playwright Chromium path. The new `tests/e2e-scribe-voice.mjs` passed with a mocked `MediaRecorder`, mocked `getUserMedia`, and intercepted `/api/transcribe`: a delayed completed transcript showed `Transcribing…` without partial text, then populated the existing textarea and completed draft → edit → approval → persistence; permission-denied and endpoint-failure cases each retained a usable textarea and completed the manual flow. The unchanged `tests/e2e-scribe.mjs` also passed. Browser-created fictional notes were reset by restoring `data/notes.json` to `[]`; temporary server/log artifacts were removed and port 3000 was cleared. The final Recording Red screenshot confirms the exact `#e5484d` solid Stop fill with white text and matching timer dot; it is retained outside the repository for review.

## Brain checkpoint

Tasks 2 and 3 add deterministic lexical ranking and patient-scoped, approved-only retrieval. The ranker is injected into retrieval tests so the patient-isolation boundary is verified before ranking, and the repository exposes `listAll()` for future read-only retrieval wiring. Task 4 adds the reviewed Groq Chat Completions provider boundary, and Task 5 adds the versioned evidence-only prompt plus citation-validating answer-generation boundary. Task 6 now joins these boundaries in the fixed order: deterministic safety classification, patient-first approved-only retrieval, then evidence-bound generation only for retrieved evidence.

On 2026-08-26, `feat/brain-retrieval` was rebased onto `origin/main` at `f6d73f9`, bringing in the merged voice-input Scribe work while retaining the two deterministic Brain commits. One `docs/HANDOFF.md` conflict was resolved by preserving both the voice-input validation record and this Brain checkpoint. Task 2 is now `23d7c0e` (`feat(brain): add lexical relevance ranking`); Task 3 retains the approved message `feat(brain): add patient-isolated approved-note retrieval` and includes this rebase record.

Post-rebase validation passed: `npm run typecheck`, `npm run lint`, `npm run test` (8 files, 39 tests), and `npm run build`, which emitted `/api/transcribe` as a dynamic route alongside `/` and `/scribe`. The focused Brain query-safety, ranking, and retrieval suites also passed together (3 files, 13 tests); `tests/brain-retrieval.test.ts` still passed all 4 cases, including the pre-ranking patient-isolation spy and draft exclusion.

Task 4 implements `lib/llm/provider.ts` with the typed `LlmCompletionProvider` interface, the server-only `createLlmProviderFromEnv` factory, and a Groq OpenAI-compatible Chat Completions adapter. It reads only `GROQ_API_KEY` with an optional `LLM_MODEL` override defaulting to `openai/gpt-oss-120b`, sends non-streaming requests with a 30-second abort signal, retries one network failure, and validates `choices[0].message.content`. `.env.example` contains commented placeholders only. `tests/llm-provider.test.ts` uses mocked fetch only and covers missing configuration, default request shape, explicit model override, timeout, and one retry; it makes no live provider call. Fresh Task 4 validation passed: `npm run typecheck`, `npm run lint`, `npm run test` (9 files, 43 tests), and `npm run build`.

This provider boundary is implemented pending Aashir's confirmation and is reviewable/handoff-ready, not a unilateral final decision on his Task 5 prompt and answer-generation ownership.

Task 5 adds `lib/llm/prompts/brain-answer.ts` with the exact versioned evidence-only system prompt and `lib/brain/answer-generation.ts` with `generateGroundedAnswer`. It serializes only the retrieved question plus `noteId`, consultation date, and excerpts; parses the provider response as JSON; validates `{ answer, cited_note_ids }` with Zod; rejects citations not present in the retrieved evidence; rejects citations paired with an empty answer; and maps valid citations to their exact evidence dates. `tests/brain-answer-generation.test.ts` uses provider doubles only and proves that a `no_supporting_record` branch is a compile-time type error, a made-up citation is rejected rather than returned, and supported sources map to exact retrieved dates. The optional Groq `response_format: { type: "json_object" }` enhancement was intentionally skipped: Task 4's established `LlmCompletionProvider.complete({ system, user })` interface does not expose per-call request options, and changing that interface would expand the already-committed provider contract. Task 5 retains the plan's prompt instruction, `JSON.parse`, Zod validation, and citation-rejection defence in depth.

Fresh Task 5 validation passed: `npm run typecheck`, `npm run lint`, `npm run test` (10 files, 46 tests), and `npm run build`. The focused answer-generation suite passed all 3 tests with no live Groq call.

Task 6 adds `lib/actions/brain.ts` and the narrowly scoped `app/actions.ts` Brain additions. `queryPatientRecord` first calls `classifyQuerySafety`, returns a refusal immediately when required, retrieves only patient-isolated approved evidence next, returns the existing no-supporting-record result before generation when evidence is absent, and invokes `generateGroundedAnswer` only on the evidence branch. `queryPatientRecordAction` reads persisted notes and provides an `LlmCompletionProvider` wrapper whose `complete()` constructs the configured provider only when generation is actually reached; this keeps both refusal and no-record paths independent of Groq configuration. Thrown provider/configuration/generation errors map to exactly `{ ok: false, message: "The Brain could not answer right now. Try again." }`. `listBrainPatientsAction` returns distinct patient ID/display-name pairs from `repository.listAll()`.

`tests/brain-service.test.ts` first failed RED because `@/lib/actions/brain` did not exist. It then passed all three focused cases: the treatment request “What medication should we prescribe?” returned `refused` while the exploding provider remained unreachable; the unrelated question “What was her blood pressure in March?” returned `no_supporting_record` with `no_relevant_evidence` while the exploding provider remained unreachable; and an evidence/provider double returned `supported` with source `{ noteId: "note-chest", consultationDate: "2026-06-01" }`.

Fresh Task 6 validation passed: `npm run typecheck`, `npm run lint`, `npm run test` (11 files, 49 tests), and `npm run build`. The full suite includes the Brain safety, ranking, retrieval, answer-generation, and service suites alongside the Scribe and voice-input suites.

One controlled live Groq smoke check called `queryPatientRecordAction` using only a temporary fictional approved note for “Fictional Mira Noor.” The question was “Was difficulty falling asleep documented?” The safe action result was `ok: true` with supported answer “Yes, difficulty falling asleep was documented.” and the exact source `{ noteId: "fictional-sleep-note-2026-05-12", consultationDate: "2026-05-12" }`. An initial no-network harness attempt used test-mode environment loading, which excludes `.env.local`; the corrected development-mode loader made the two permitted fictional calls without reading, printing, or committing the key. The temporary harness and derived output were removed, and `data/notes.json` was restored exactly to `[]`.

Task 7 is complete. `tests/brain-adversarial.test.ts` uses only fictional fixtures defined in the test, never `data/seed/`, and passes all six §8.6 integration cases: a documented prior symptom returns `supported` with its exact source date; an unrecorded vital and condition each return `no_supporting_record`; a medication request returns `refused` with `treatment_or_medication`; and a general medical knowledge question while a patient is open returns `refused` with the distinct `general_medical` reason. The different-patient probe supplies another patient’s only matching “migraines with aura” note, receives `no_supporting_record` with `no_relevant_evidence`, and explicitly asserts that `JSON.stringify(result)` does not contain the other patient’s note ID. The first focused run correctly exposed generic “reported” as a lexical match: although retrieval isolates patient notes first, an unrelated current-patient note contained that generic narrative verb. `reported` was added to the ranker stop-word set as the minimal correction; the unchanged cross-patient fixture then passed with no provider invocation or ID leakage.

Known limitation: this `reported` stop-word correction closes the observed instance only. Other clinical-narration filler words, including “stated,” “noted,” “described,” “documented,” and “discussed,” may create the same false-positive lexical relevance risk and have not been individually verified. This is flagged for follow-up rather than treated as a blocker because the current demo dataset is controlled.

Fresh Task 7 validation passed: `npm run typecheck`, `npm run lint`, `npm run test` (12 files, 55 tests), and `npm run build`. The full suite includes all Brain, Scribe, and consent-gated voice-input tests. Browser E2E for the Brain is still deferred exactly as planned until Dev2’s query UI lands on `feat/query-ui`; Task 7’s integration coverage is the current merge gate.

## Sidebar Architecture & 4-Page Redesign

The application now features a persistent sidebar workspace layout with exactly 4 navigation destinations matching the reference design:
- **Record / Scribe** (`/record`): Fully functional and connected to the backend. Features the top 3 action cards ("Record virtual session", "Record in-person", "Record a summary"), search pill, empty note / upload actions, timeline header, recent sessions list, and the integrated consultation scribe capture/review/approval engine.
- **Clients** (`/clients`): UI wireframe for patient rosters, status tags, and consultation history.
- **Rawaan AI** (`/rawaan-ai`): UI wireframe for patient-isolated queries, safety refusal states, and grounded citation cards.
- **Learn Rawaan** (`/learn-rawaan`): UI wireframe for clinical documentation guidelines and safety principles.
- The root landing page (`/`) "Try the Demo" button links directly to `/record`, and `/scribe` redirects to `/record`.

## Brain Chat UI — Task 1 checkpoint

Branch: `feat/brain-chat-ui`. Task 1 of `plans/2026-08-28-brain-chat-and-roster.md` is complete.

**What was done:**

Task 1 confirmed the existing action contracts (`queryPatientRecordAction`, `listBrainPatientsAction` in `app/actions.ts`; `queryPatientRecord` in `lib/actions/brain.ts`) and extracted the UI-safe boundaries following the plan's TDD order.

The roster investigation found that `listBrainPatientsAction` returned only `patientId` and `displayName` — insufficient for the Task 2 roster UI which requires `approvedNoteCount` and `mostRecentConsultationDate`. As directed by the plan ("stop and propose a reviewed action-contract extension before implementation"), this was addressed within Task 1 by:

1. Creating `lib/actions/roster.ts` with the pure `deriveRosterSummary(notes: ApprovedNote[]): RosterPatient[]` helper. It iterates approved notes once, accumulating count and lexicographically latest consultation date per patient. No imports from `lib/brain`, `lib/llm`, or any provider code.
2. Extending `BrainPatient` in `app/actions.ts` with `approvedNoteCount: number` and `mostRecentConsultationDate: string`.
3. Replacing the inline Map loop in `listBrainPatientsAction` with a `deriveRosterSummary` call — same approved-note source, now returning the full roster shape.

**Tests written RED first, then GREEN:**

`tests/brain-action-contracts.test.ts` — 14 tests covering:
- Supported `BrainActionResult` shape: `ok: true` with answer and typed sources array.
- No-record `BrainActionResult` shape: `ok: true` with `status: "no_supporting_record"`, exact message and reason.
- Refused (treatment): `ok: true` with `status: "refused"`, `reason: "treatment_or_medication"`, exact safety message.
- Refused (general_medical): distinct reason field is a distinct render state.
- Action-level error: `ok: false` with a safe non-technical message — asserts no provider/key/model info leaks.
- Provider isolation: refusal path and no-record path each assert the provider was never invoked.
- `deriveRosterSummary`: one entry per distinct patient, correct counts, latest date, displayName preservation, empty-array case, single-note case.
- `BrainPatient` compile-time shape: `approvedNoteCount` and `mostRecentConsultationDate` are now required fields.

**Validation output (2026-08-28):**

- Focused suite: 14/14 passed.
- Full suite: 13 files, 69 tests — all passed (up from 55 tests before Task 1).
- `npm run typecheck`: passed (no output).
- `npm run lint`: passed (exit 0, no output).
- `npm run build`: passed. Routes emitted: `/`, `/_not-found`, `/api/transcribe` (dynamic), `/clients`, `/learn-rawaan`, `/rawaan-ai`, `/record` (dynamic), `/scribe`.

No modifications to `lib/brain/`, `lib/llm/`, or `lib/notes/`.

## Brain Chat UI — Task 2 checkpoint

Branch: `feat/brain-chat-ui`. Task 2 of `plans/2026-08-28-brain-chat-and-roster.md` is complete.

**What was done:**

Replaced the hardcoded `demoClients` wireframe in `app/(workspace)/clients/page.tsx` with a live roster derived from `listBrainPatientsAction()`. The page is now an async server component that calls the typed Server Action directly.

Removed:
- The entire `demoClients` array (invented age, status, complaint, appointment data).
- The "WIREFRAME VIEW" badge.
- The "UI Wireframe Mode" notice banner.
- The disabled search input and hardcoded filter pills ("All Clients (4)", "Active (3)", "Follow-up (1)").
- The status badge (no invented "Active"/"Follow-up required" states).
- The "Recorded focus" complaint box (no invented primary complaint data).

Added:
- Honest empty state when no approved notes exist: cream-background card with link to `/record`.
- Each card shows only approved-note-derived fields: display name, patient ID, approved note count, most recent consultation date.
- Avatar initials derived from `displayName`.
- Links to `/record` ("Start Session") and `/rawaan-ai` ("Query with Brain") preserved on every card.

CSS: added `.roster-empty-state`, `.roster-empty-title`, `.roster-empty-body`, `.roster-empty-link` to `app/globals.css` using design system tokens (cream background, charcoal heading, slate body, canopy green link). No shadows, no new accent colors.

**Tests:**

`tests/brain-roster.test.ts` — 5 tests covering:
- Empty store produces empty roster.
- Each `BrainPatient` has exactly four approved-note-derived keys (no invented fields).
- Multiple notes per patient aggregate count and latest date correctly.
- Distinct patients appear as separate entries.
- Compile-time type check: `deriveRosterSummary` accepts only `ApprovedNote[]`.

**Dynamic-rendering fix (found during the production-browser exercise):**

The initial Task 2 implementation left `/clients` statically prerendered (`○ Static`), so the roster baked in whatever approved notes existed at build time and would not show a patient approved during a live demo session until a rebuild. This is a correctness defect for a live roster, not just a stylistic choice.

Fix: added `export const dynamic = "force-dynamic";` to `app/(workspace)/clients/page.tsx`. Per the Next 16 route-segment-config docs bundled in `node_modules/next/dist/docs/`, `force-dynamic` forces per-request rendering. `/clients` now builds as `ƒ (Dynamic)`.

Verified in a production browser (`npm run build` then `npm run start`): with an empty store `/clients` renders the honest empty state; after writing fictional approved notes to `data/notes.json` the same running server (no rebuild) immediately renders the roster with correct names, patient IDs, approved-note counts, and most-recent consultation dates. `data/notes.json` was then restored to `[]` and the temporary server/log artifacts removed.

**Validation output (2026-08-28):**

- Focused suite: 5/5 passed.
- Full suite: 14 files, 74 tests — all passed (up from 69 after Task 1).
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run build`: passed. `/clients` emitted as `ƒ (Dynamic)`.

No modifications to `lib/brain/`, `lib/llm/`, or `lib/notes/`.

## Mobile & UI polish checkpoint

Branch: `feat/brain-chat-ui`. A review pass over the workspace UI fixed the mobile and polish issues raised after Task 2:

- **Icon library instead of emoji:** installed `lucide-react` (verified the exact icons exist in the installed version before use). Replaced emoji/raw glyphs: Learn Rawaan module icons (🎙️🛡️ → Mic/Brain/ShieldCheck/Zap in pastel circles), Rawaan AI notice 🧠 → Brain and citation 📄 → FileText, Clients "Query with Brain ↗" → ArrowUpRight, and the Scribe dashboard ↗/▼/⋮ → ArrowUpRight/ChevronDown/MoreVertical.
- **No button underlines:** `.primary-button`/`.ghost-button`/`.secondary-button` now set `text-decoration: none` and are centered inline-flex containers, so anchor-rendered buttons no longer show the default underline.
- **Single-line buttons on phones:** buttons get `white-space: nowrap` and the `.wireframe-header` now wraps, so "+ New Consultation" drops to its own line instead of folding into two lines at phone width.
- **White scrollbar with reserved space:** `html` and `.workspace-content-pane` set `scrollbar-gutter: stable` plus a light `scrollbar-color`/`::-webkit-scrollbar` treatment (white track, frost-gray thumb) so content no longer shifts when the scrollbar appears.
- **No click focus ring on sidebar tabs:** anchors get `a:focus { outline: none }` while `a:focus-visible` retains the leaf ring, so mouse/touch clicks show no transient ring but keyboard focus stays accessible.
- **Notch safe-area:** root layout exports `viewport` with `viewportFit: "cover"`; `.workspace-shell` and `.landing-hero` add `padding-top: env(safe-area-inset-top)` so notched iPhones get top padding and the green hero extends under the notch.

Verified with production-browser captures at a 390×844 iPhone viewport across `/clients`, `/learn-rawaan`, `/rawaan-ai`, and `/record`: buttons render on one line with no underline, lucide icons replace all emoji, and each page stacks without horizontal overflow. Temporary captures, script, server, and logs were removed; `data/notes.json` remained `[]`.

Validation: `npm run typecheck`, `npm run lint`, `npm run test` (14 files, 74 tests), and `npm run build` all passed.

## Brain Chat UI — Task 3 checkpoint

Branch: `feat/brain-chat-ui`. Task 3 of `plans/2026-08-28-brain-chat-and-roster.md` is complete.

**What was done:**

Built the stateless Brain chat into the Rawaan AI page. The static wireframe mockup (disabled select, sample chips, hardcoded answer) was replaced with a live interactive boundary while preserving the page heading and the "Documentation support only" safety label.

- `app/components/brain-chat-state.ts` — pure, browser-independent state machine: `initialBrainChatState`, `brainChatReducer` (select-patient resets the thread, set-draft, submit-start, append-entry, new-chat clears only in-memory entries), and `runBrainChatQuery` which calls the injected Server Action with ONLY `(patientId, question)` and maps the result verbatim onto a timestamped entry. No React, no browser, no `lib/brain` runtime imports (type-only).
- `app/components/brain-chat.tsx` — client component. Loads patients via `listBrainPatientsAction()`, renders the patient selector, the dark Patient Context Header, the thread, and the input row. Calls only the typed Server Actions (`queryPatientRecordAction`, `listBrainPatientsAction`); never imports `lib/brain`/`lib/llm`/`lib/notes` runtime code. Distinct render states: supported (Sky Wash + citation chips), no-record (Peach Wash + border), refused (cream + teal border), action error (neutral). "New chat" clears client memory only.
- `app/(workspace)/rawaan-ai/page.tsx` — now composes `<BrainChat />` under the preserved heading/safety label.
- CSS — Brain chat styles using design tokens (flat pastel surfaces, no shadows).

**Tests (written RED first, then GREEN):** `tests/brain-chat.test.ts` — 11 tests: initial state, select-patient thread reset, set-draft, submit-start, append-entry, new-chat, and verbatim mapping of supported/no-record/refused/error; plus the isolation regression proving three sequential turns each pass only `(patientId, question)` with no prior-turn content.

**Production browser exercise (live Groq):** selected the fictional patient; treatment question → refused card; unrecorded vital → no-record card; documented symptom → supported card with the exact returned citation `2026-06-01 · fictional-note-amina-1`; "New chat" cleared 3 entries to 0. Screenshot review confirmed the three states are visually distinct. `data/notes.json` restored to `[]`; temp script/screenshots/server removed.

**Validation:** `npm run typecheck`, `npm run lint`, `npm run test` (15 files, 85 tests), `npm run build` all passed.

No modifications to `lib/brain/`, `lib/llm/`, or `lib/notes/`.

## Brain Chat UI — Task 4 checkpoint

Branch: `feat/brain-chat-ui`. Task 4 of `plans/2026-08-28-brain-chat-and-roster.md` is complete.

**What was done:**

Added fixed retrieval-only quick-action chips above the chat input.

- `app/components/brain-quick-actions.tsx` — exports `BRAIN_QUICK_ACTIONS` (`as const`, the three approved templates verbatim) and a presentational `BrainQuickActions` chip row. Chips are plain buttons that call `onAsk(action.question)`; there is no LLM that generates or rewrites labels/questions.
- `app/components/brain-chat.tsx` — refactored submission into a shared `submitQuestion(question)` used by both the manual form and the chips, so chips and manual input share the same patient ID and stateless action path. Chips render only when a patient is selected and are disabled while submitting.
- CSS — `.brain-quick-actions` / `.brain-quick-action-chip` mint-wash pills, no shadows.

**Pre-implementation wording check (required by the plan):** all three templates classify as `record_query` via `classifyQuerySafety` (no treatment/general-medical refusal). Ranker tokens `plan/discussed/documented/visits/symptoms/follow-up` are live (non-stop-word), so retrieval strength depends on note content; a chip honestly renders `no_supporting_record` when there is no lexical match. The approved wording was kept verbatim (the plan forbids unilateral dynamic filtering).

**Tests (RED first, then GREEN):** extended `tests/brain-chat.test.ts` with 4 quick-action tests: exact approved templates, every chip is a record query, a chip submits only its exact question through the same path, and a chip no-record result does not alter the next manual turn.

**Production browser exercise (live Groq):** three chips render; clicking "Recall follow-up" submitted the exact question and returned a supported answer "Follow-up in two weeks." with citation `2026-06-01 · fictional-note-amina-1`. `data/notes.json` restored to `[]`; temp script/screenshot/server removed.

**Validation:** `npm run typecheck`, `npm run lint`, `npm run test` (15 files, 89 tests), `npm run build` all passed.

No modifications to `lib/brain/`, `lib/llm/`, or `lib/notes/`.

## Brain Chat UI — Task 5 checkpoint

Branch: `feat/brain-chat-ui`. Task 5 of `plans/2026-08-28-brain-chat-and-roster.md` is complete.

**What was done:**

Created `tests/e2e-brain.mjs`, a production-browser E2E in the same style as `tests/e2e-scribe.mjs`. It seeds fictional approved notes (backing up and restoring `data/notes.json` in a `finally`), then against `npm run start` verifies the full demo matrix on `/rawaan-ai`:

1. Supported question → answer card whose citation chip contains the exact source date `2026-06-01`.
2. Deliberately absent fact → `no_supporting_record` card.
3. Treatment question → refused card.
4. General-medical question → a second, distinct refused card (2 refusal cards total).
5. "New chat" clears the in-memory thread (0 entries) without touching persisted notes.
6. A later supported question renders independently after the reset.

Run with `PLAYWRIGHT_CHROMIUM_EXECUTABLE` pointed at the local Chrome (bundled browser not installed). Output: `supported with source date: 2026-06-01 · fictional-note-amina-1`, `no-record: OK`, `treatment refused: OK`, `general-medical refused (distinct): OK`, `new chat cleared thread: OK`, `later supported independent: OK`, `Brain E2E flow passed.`

**Validation:** `npm run test` (15 files, 89 tests), `npm run typecheck`, `npm run lint` (0 errors / 0 warnings after removing an unused locator), and `npm run build` all passed. `data/notes.json` restored to `[]`; temporary server/logs removed.

**Design reference review:** the `inspo/` screenshots (Klarify/Ease Health) confirm the workspace pattern already implemented — sidebar + pastel action cards + pill buttons on desktop; top bar + stacked full-width actions on mobile. A hamburger-collapsed sidebar on mobile is a possible future enhancement and is intentionally out of scope for this plan. `inspo/` remains an untracked reference asset.

**Review gate:** Per the plan, this branch may open a PR only after Rehan/Aashir cross-review plus one teammate review, with the full validation loop passing. All five tasks are now implemented and validated; `main` is untouched.

## Next action

All five Brain chat/roster tasks are complete and pushed to `feat/brain-chat-ui`. Awaiting the plan's cross-review before opening a PR into `main`.
## Post-Recording Workflow & Interactive AI Overview (2026-08-28)

Implemented the 3-step post-recording workflow:
1. **Assign Session Modal (`app/components/assign-session-modal.tsx`):**
   - Displays recording card with waveform, title (`Rawaan-MM.DD.YY`), subtitle `In-Person Recording`, and green checkmark.
   - Searchable client dropdown with inline `+ Create New` trigger.
   - Actions: `Delete Recording` (red) and `Next` (dark teal, disabled until client selected).
2. **Create A New Client View:**
   - Client First Name, Client Last Name, Email (Optional), and Client Mobile Number (Optional - replacing pronouns).
   - Instant client creation and auto-selection via Server Action (`createClientAction`).
3. **Session Note Workspace (`app/components/session-workspace-view.tsx`):**
   - **7 Top Tabs:** `Notes` (active), `Client`, `Treatment Plan`, `Transcript`, `Session Information`, `Mindmap`, `Reflection Questions`.
   - **Clinical Document View (Left):** Sub-toolbar (`BASE ⌄`, `Detailed ⌄`, AI Polish, Copy, Export, UK Flag, Lock, `Share ⌄`, Plant icon 🌱), Narrative **Summary** with inline copy button, **Session Topics** (*Medical History Documentation* with structured bullet points), and Approve & Save bar.
   - **Interactive AI Overview Chat (Right):** Quick suggestion pills (`Change to paragraph format`, `Remove all names`, `Summarize key clinical points`), loaded context badge (`📄 [Patient] - Note (BASE)`), real-time chat input with Server Action `modifyNoteAction` that updates the note document in real time.
4. **Database & Schema Updates:**
   - Added `first_name`, `last_name`, `email`, `mobile_number` to `patients` table and `summary` to `notes` table.
   - Seed data in `data/notes.json` populated with narrative summaries and client contact details.
   - LLM generator in `lib/llm/generate-note.ts` updated with `modifyNoteWithAi` and prompt in `lib/llm/prompts/note-generation.ts`.

## Next action

All changes are validated with `typecheck` (`tsc --noEmit`), `lint` (`eslint .`), `test` (`vitest run` - 55 passed), and `build` (`next build`). Ready for PR review.

## Seed-data checkpoint

`feat/seed-data` adds `data/seed/demo-patients.json`: eight strictly fictional approved notes for three patients (two visits for `patient-amina-001`, three for `patient-hassan-002`, three for `patient-sara-003`). `data/seed/demo-questions.md` identifies deliberately absent facts and the expected supported, no-record, general-medical-refusal, and treatment-refusal rehearsal outcomes. `data/seed/load-demo-seed.mjs` is the only explicit loader; `npm run seed:demo` copies the JSON fixture to the live store on demand and `npm run seed:reset` restores it to exactly `[]`. Product code does not import the seed data.

The loader was exercised successfully, wrote eight notes, and reset cleanly. `tests/demo-seed.test.ts` validates the exact approved-note schema plus the three-patient/two-to-three-note distribution. Rebased onto current `main` and merged; full validation passed. Keep the live store empty except during an intentional demo rehearsal, then immediately run `npm run seed:reset`.

## Ranker name-exclusion fix checkpoint

The 2026-08-29 seeded live rehearsal exposed a grounding defect: a patient's own name (dense in realistic transcripts) counted as a lexical relevance match, so short absent-fact questions ("What was Amina's blood pressure?", "What was Hassan's weight?") crossed the 0.25 threshold on a name-only match and returned a false `supported` with a citation to a note lacking the fact. Approved plan addendum: `plans/2026-08-29-ranker-name-exclusion-fix.md`. Implemented as Option B-on-A on `feat/seed-data` (separate follow-up commit): `lib/brain/ranking.ts` now excludes per-note `patient_display_name` + `patient_id` tokens from both the note token set and the question term set, and a note whose remaining question-term set is empty yields no evidence.

RED first: `tests/brain-ranking.test.ts` gained a name-dense block (short name+unrecorded-vital → no evidence; name+recorded-content-term → still evidence, no over-exclusion; name-only → no evidence) and `tests/brain-adversarial.test.ts` gained an end-to-end §8.6-style row (name-dense note + "What was Ada's weight?" → `no_supporting_record` with an exploding provider that must never fire). All 3 were failing before the fix and pass after; the existing cross-patient isolation case still holds.

Post-fix live rehearsal (all 12 `demo-questions.md` questions, `npm run seed:demo`, production build): **ALL 12 MATCH** — the 2 previously-failing absent-vital questions now return `no_supporting_record`, the 3 supported answers cite the exact documented dates, and the 6 refusals are unchanged. `npm run seed:reset` run afterwards. Full loop: typecheck, lint, test (16 files, 95 tests), build all pass.

## UI polish round 2 (post-merge, on feat/brain-chat-ui)

Feedback-driven polish applied after the record-workspace merge:

- **Emoji → lucide icons:** replaced every remaining emoji glyph in `session-workspace-view.tsx`, `record-session-modal.tsx`, `assign-session-modal.tsx`, `review-approval-modal.tsx`, and `scribe-dashboard.tsx` (🌱 ✕ 🎙️  📋 📥 🇬🇧 🔒 ✉️ 📱 📄 ️ 📎 ✓ ↑) with lucide-react icons, preserving classNames and adding an alignment/accent CSS pass. The recording mic uses the Recording Red accent; the sprout uses Leaf.
- **Sidebar icon color variety:** each nav icon now has a design-token accent (Record = Coral, Clients = Leaf, Rawaan AI = Deep Teal, Learn = Canopy Green) instead of all-gray/all-green.
- **Focus ring:** sidebar links blur on pointer click (`event.detail > 0`) so the transient click ring no longer lingers; keyboard `:focus-visible` ring is retained.
- **Canvas:** workspace shell background darkened slightly (`#fcfcfd` → `#f6f7f8`) to reduce glare, matching the reference screenshots.

Validation: `typecheck`, `lint`, `test` (15 files, 89 tests), `build` all passed; production-browser capture confirmed colored sidebar icons, darker canvas, and lucide icons in the record dashboard. `inspo/` remains an untracked reference asset.
