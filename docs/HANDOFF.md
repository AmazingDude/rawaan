# Handoff

## Current state

`main` contains the merged Rawaan design system, landing route split, typography update, and CI workflow. The active Scribe voice-input workstream is on `feat/voice-input-scribe`; Task 1 selected Groq's OpenAI-compatible `whisper-large-v3-turbo` transcription boundary, and Task 2 now contains only strict audio-validation contracts, a provider-agnostic validation module, and fake-provider unit tests. No `/api/transcribe` route, Groq adapter, secret, provider SDK, or live network call exists yet. The Brain retrieval plan remains a separate, review-only workstream.

| Area | Current direction |
|---|---|
| Scope | Preserve the existing transcript → draft → edit → approve → persist workflow; make presentation and layout changes only. |
| Visual change | Remove colored left-border accent bars from banners and callouts; use flat pastel fills instead. |
| Step 2 layout | Organize the existing note fields into Subjective, Assessment & Plan, and Follow-up & Notes sections, with dividers and responsive two-column field pairing. |
| Step 1 layout | Keep the transcript card sticky above the 900px breakpoint and stacked normally at narrower widths. Fixed-viewport live-scroll verification confirmed it pins at a 24px top offset after scrolling. |
| Third-round UX | Added explicit transcript-absence messaging, a visibly locked approved-note state, and a local-only “Start new consultation” reset action. |
| Documentation | `docs/DESIGN.md` is the canonical reference for the no-accent, section-grouped, sticky layout, approved/empty Scribe states, and the landing hero. |
| Landing route split | Root `/` remains a dark Canopy Green Rawaan hero with one Coral “Try the Demo” action to `/scribe`; the preserved Scribe flow remains otherwise unchanged. |
| Landing review round | Completed locally: wordmark/subtitle lockup plus safety-label pill, bounded left hero column with Leaf-emphasized headline word, and connected Cream Transcript → Clinician review → Approved note section. |
| Typography round | Completed locally: Onest replaces the UI/body system; OFL-licensed Thestral Neue is self-hosted and restricted to the one landing hero headline. |
| Voice-input Task 2 | `lib/transcription/types.ts` defines the strict result/provider contracts; `lib/transcription/validate-audio.ts` enforces empty-file, supported-MIME, 25 MB, and blank-transcript safeguards with no browser globals or provider access. |
| Branch process | `feat/voice-input-scribe` is published for review only. Task 3 is blocked pending explicit approval because it introduces the real server endpoint, provider adapter, `GROQ_API_KEY`, and potential network calls. |

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

Voice-input Task 2 passed focused validation (`tests/transcription-route.test.ts`: 6 tests), plus `npm run typecheck`, `npm run lint`, `npm run test` (4 files and 14 tests), and `npm run build`. The tests prove that empty files, unsupported MIME types, files above the 25 MB policy, and blank fake-provider text resolve safely before any real provider boundary. No endpoint, API key, network call, browser recording code, or Scribe draft/approval/persistence code was added.

## Next action

Await explicit approval before Task 3 of `plans/2026-08-25-voice-input-scribe.md`. Do not add `/api/transcribe`, `lib/transcription/groq-whisper.ts`, any `GROQ_API_KEY`, provider SDK, real provider request, browser recording UI, or Brain changes until that gate is granted.
