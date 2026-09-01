# Scribe Vertical Slice — Task Tracking

**Goal:** Build the first verified Scribe flow: manual transcript → structured draft → clinician edit/approval → persisted approved note.

**Detailed plan:** `plans/2026-08-22-scribe-vertical-slice.md`

## Current Phase

### Phase 1 — Planning and decision record

**Status:** complete

- [x] Inspect the documentation-only repository and verify the Node toolchain.
- [x] Record the approved Next.js App Router + TypeScript decision in `DECISIONS.md`.
- [x] Write the detailed Scribe implementation plan in `plans/2026-08-22-scribe-vertical-slice.md`.

### Phase 2 — Scaffold and domain boundary

**Status:** complete

- [x] Create the strict Next.js application scaffold.
- [x] Define the validated note schema and demo-only repository.
- [x] Write and run initial schema/persistence tests.

### Phase 3 — Draft generation and server orchestration

**Status:** complete

- [x] Implement the versioned grounded-note prompt and generator boundary.
- [x] Implement draft and approval Server Actions with validation.
- [x] Write and run focused unit tests.

### Phase 4 — Scribe UI and complete validation

**Status:** complete

- [x] Build the clinician-facing Scribe workspace.
- [x] Exercise the transcript → draft → edit → approval flow in a headless production-browser run.
- [x] Run typecheck, lint, tests, build, and diff checks.

## Landing Page — Task Tracking

**Goal:** Build the approved single-screen landing page at `/` and expose the existing Scribe flow at `/scribe`, while deferring the combined pull request until after user review.

**Detailed plan:** `plans/2026-08-23-landing-page.md`

### Phase 1 — Requirements and route inspection

**Status:** complete

- [x] Re-read `AGENTS.md`, `docs/PRD.md`, `docs/DESIGN.md`, `docs/no-slop.md`, and `docs/HANDOFF.md`.
- [x] Confirm `/` currently renders `ScribeWorkspace`, approval revalidation targets `/`, and E2E begins at `/`.
- [x] Write the scoped landing-page plan.

### Phase 2 — Landing composition and asset decision

**Status:** complete

- [x] Decide on the approved solid Canopy Green hero fallback instead of an optional decorative texture.
- [x] Define the component and responsive CSS composition.

### Phase 3 — Route split and implementation

**Status:** complete

- [x] Render the landing page at `/`.
- [x] Move the Scribe workspace route to `/scribe` and retarget revalidation/E2E.
- [x] Update route-aware metadata and documentation.

### Phase 4 — Validation and local delivery

**Status:** complete

- [x] Run typecheck, lint, tests, production build, and production-browser exercises for both routes.
- [x] Capture desktop and narrow screenshots and complete the anti-slop review.
- [x] Commit landing work locally and keep the combined PR deferred.

## Sidebar Architecture & 4 Feature Pages — Task Tracking

**Goal:** Implement the new sidebar navigation architecture and modern UI/UX with exactly four dedicated pages: Record/Scribe, Clients, Rawaan AI, and Learn Rawaan, matching the provided design.

**Detailed plan:** `plans/2026-08-28-sidebar-and-pages.md` / `implementation_plan.md`

### Phase 1 — Architecture, Routing & Sidebar Layout
**Status:** complete
- [x] Create persistent workspace layout at `app/(workspace)/layout.tsx` with sidebar navigation.
- [x] Build `app/components/workspace-sidebar.tsx` containing ONLY the 4 menu items: Record/Scribe (`/record`), Clients (`/clients`), Rawaan AI (`/rawaan-ai`), Learn Rawaan (`/learn-rawaan`).
- [x] Update landing page "Try the Demo" link to `/record` and redirect `/scribe` to `/record`.

### Phase 2 — Fully Functional Record / Scribe Page (`/record`)
**Status:** complete
- [x] Implement `app/(workspace)/record/page.tsx` and `app/components/scribe-dashboard.tsx`.
- [x] Implement top 3 action cards ("Record virtual session", "Record in-person", "Record a summary").
- [x] Implement search bar, "+ Create empty note", "Upload", and timeline session list.
- [x] Integrate full consultation scribe engine (form values, voice capture controller, draft generator, review fields, approval action).

### Phase 3 — Wireframe Pages for Clients, Rawaan AI, Learn Rawaan
**Status:** complete
- [x] Implement `app/(workspace)/clients/page.tsx` with clean wireframe layout.
- [x] Implement `app/(workspace)/rawaan-ai/page.tsx` with clean wireframe layout.
- [x] Implement `app/(workspace)/learn-rawaan/page.tsx` with clean wireframe layout.

### Phase 4 — Styling and Design System in `app/globals.css`
**Status:** complete
- [x] Add sidebar, dashboard action cards, search pill, session items, and wireframe styling.

### Phase 5 — Documentation Updates
**Status:** complete
- [x] Update `docs/PRD.md`, `PRD.md`, `docs/HANDOFF.md`, `README.md`.

### Phase 6 — Verification & E2E
**Status:** complete
- [x] Update `tests/e2e-scribe.mjs` and `tests/e2e-scribe-voice.mjs` to target `/record`.
- [x] Run full verification loop (`npm run typecheck`, `npm run lint`, `npm run test`, `npm run build`).

### Phase 7 — Record In-Person Modal, Live Mic Tester & Client Insights
**Status:** complete
- [x] Build `RecordSessionModal` component matching Image 1 (Selected client search, mic device dropdown, live animated mic checker visualizer, and previous session insights).
- [x] Add client creation inline flow ("+ Add new client") when no client is found.
- [x] Extract previous session insights (Summary, Action Items, Questions, Plan) from client's approved notes.
- [x] Remove the static bottom STEP 1 / STEP 2 section from `/record` page.
- [x] Add Supabase hybrid storage configuration with automatic local JSON fallback.
- [x] Run full verification loop (`typecheck`, `lint`, `test`, `build`).

### Phase 8 — Post-Recording Workflow: Assign Session & AI Note Workspace
**Status:** complete
- [x] Build `AssignSessionModal` (matching Picture 1) with recording badge, client selector, delete and next actions.
- [x] Build `Create A New Client` view (matching Picture 2) with First Name, Last Name, Email, and Client Mobile Number.
- [x] Build `SessionWorkspaceView` (matching Picture 3) with 7 top navigation tabs, formatted clinical note (Summary + Session Topics), and interactive AI Overview chat panel.
- [x] Implement note modification LLM action (`modifyNoteAction`) allowing real-time AI transformations (paragraph format, de-identification/remove names, summarize key clinical points).
- [x] Pass all verification gates (`typecheck`, `lint`, `test`, `build`).

### Phase 9 — Record Entry-Flow Correction
**Status:** in_progress
- [x] Replace the stale Scribe E2E with a failing dashboard-entry regression test.
- [ ] Route manual-summary capture through client assignment with summary provenance.
- [ ] Route blank manual notes through client assignment with direct structured editing and manual provenance.
- [ ] Run unit, static, production-build, and browser verification.

## Next Step

Implement the dedicated clinician-entered summary modal and explicitly typed pending session state.

## Decisions Made

| Decision | Rationale |
|---|---|
| Use Next.js App Router + TypeScript | This follows `AGENTS.md`, supports the manual-transcript first slice, and avoids premature Python service work. |
| Defer live ASR | The accepted slice needs manual/scripted transcript input; a Python service is an isolated future option if ASR demands it. |
| Persist only approved notes | The PRD requires a clinician approval gate before notes enter the searchable record. |

## Errors Encountered

| Error | Attempt | Resolution |
|---|---:|---|
| Existing project could not be opened in the hosted workspace because its project record was unavailable. | 1 | Continue on the user-attached repository and scaffold locally; do not delete or recreate the user repository. |
| `npm install` stopped with `ENOSPC` while writing `node_modules`. | 1 | The user freed disk space; `C:` now has approximately 2.38 GB available. Resume with the existing exact dependency manifest. |
| Typecheck reported that `GeneratedDraft` was used by the Scribe service but not exported by the generator module. | 1 | Exported the narrow result type from `lib/llm/generate-note.ts`; the subsequent typecheck passed. |
| ESLint crashed while loading `react/display-name`. | 1 | Dependency inspection showed ESLint 10.9.0 is outside the installed Next.js lint plugins’ declared peer ranges, which end at ESLint 9. Installed ESLint 9.39.5 and narrowed the lint scope to application-owned files; lint then passed cleanly. |
| The Windows Python environment does not have the `playwright` module required by the repository UI-test skill. | 1 | Added Playwright through the Node project toolchain. |
| Playwright browser setup ran out of disk space while downloading the optional headless-shell binary. | 1 | Use the successfully downloaded full Chromium executable at `C:\\Users\\Rehan\\AppData\\Local\\ms-playwright\\chromium-1234\\chrome-win64\\chrome.exe` as the explicit headless executable path; do not retry the failed download. |
| The end-to-end browser test timed out waiting for the draft-created message after clicking `Create structured draft`. | 1 | Preserve the failure and inspect the rendered page state, browser console, and server response before changing implementation code. |
| Browser diagnostics could not reach `networkidle` on the Next.js development server. | 1 | Next development keeps an HMR connection active, so use `domcontentloaded` followed by a visible page selector for the diagnostic script; this changes the test wait condition only. |
| Browser navigation also timed out at `domcontentloaded`; port 3000 was held by a non-responsive Node process started during the failed E2E attempts. | 1 | Stop only the identified orphan process (PID 9680), then restart one clean development server on port 3000 before retrying browser diagnostics. |
| The production browser run created a draft but failed while locating the editable chief-complaint field because the transcript placeholder also contained that phrase. | 1 | Made the Playwright locator exact so it targets only the structured-note field; no application behavior change is required. |
| The subsequent production browser run saved the note but found two elements containing `Approved note saved`. | 1 | Make the confirmation locator exact so it targets the approval-card heading, then rerun the flow. |

## Landing Page Errors Encountered

| Error | Attempt | Resolution |
|---|---:|---|
| Routed Scribe E2E timed out waiting for the draft-created message after the landing route split. | 1 | Diagnostics showed port 3000 was still served by a stale Next development process, while `next start` had failed with `EADDRINUSE`; stopped listener PID 5860, started a clean production server, and the unchanged routed E2E passed. |
