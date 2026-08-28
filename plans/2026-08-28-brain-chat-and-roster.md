# Brain Chat and Roster Implementation Plan

**Goal:** Extend Aashir’s merged workspace UI with a safe, reviewable Brain chat and lightweight patient roster. Every chat turn independently runs the existing `classify → retrieve → generate` pipeline for the selected patient, and the roster derives its summary from approved notes rather than hardcoded demo objects.

**Branch:** `feat/brain-chat-ui`

**Status:** Plan only. No implementation begins until the plan is reviewed.

**Spec:** `docs/PRD.md` §5.5, §7.2, §8.5, §8.6, §8.7, and §10; `docs/DESIGN.md`; the existing Brain contracts in `lib/brain/` and Server Actions in `app/actions.ts`.

---

## Prerequisite and dependency gate

The Brain pipeline is confirmed merged into `main` at `5effd93`, and the current workspace baseline is `e47f4a1`, which also includes Aashir’s sidebar and workspace routes. The following Brain interfaces are therefore available on `main` at the time this plan is written:

- `queryPatientRecordAction(patientId, question)` in `app/actions.ts`.
- `listBrainPatientsAction()` in `app/actions.ts`.
- `queryPatientRecord` in `lib/actions/brain.ts`.
- The deterministic safety classifier, patient-first approved-note retrieval, evidence-bound answer generation, and their tests in `lib/brain/` and `lib/llm/`.

This plan extends those interfaces; it does not redefine them. Any future change to the `queryPatientRecordAction` contract, `BrainResponse` union, or `listBrainPatientsAction` result requires re-review before this plan’s implementation depends on it. If a worker finds that the interface has changed or is not available on their checkout, they must stop immediately and resolve the dependency rather than implementing against an unreviewed branch or inventing a replacement API.

The earlier dependency was a hard blocker while Brain lived only on `feat/brain-retrieval`; that branch has now been merged and deleted. The blocker is cleared for planning and future implementation, but the contract re-review rule remains hard.

---

## Existing workspace structure this plan extends

Aashir’s merged PR #6 supplies the destinations and visual shell. This plan must extend those files rather than build parallel pages from scratch.

| Existing file | Current structure | Planned extension |
|---|---|---|
| `app/components/workspace-sidebar.tsx` | Client component with no props. It derives the current pathname through `usePathname()` and renders four fixed `Link` items: `/record`, `/clients`, `/rawaan-ai`, and `/learn-rawaan`. | Keep the shell and navigation contract unchanged. No Brain data or chat state belongs in the sidebar. |
| `app/(workspace)/clients/page.tsx` | Server page with a local `demoClients` array of `{ id, name, age, totalSessions, lastVisit, primaryComplaint, status }`. It renders a disabled search field, static filter pills, a wireframe notice, four cards, and links to `/record` and `/rawaan-ai`. | Remove the hardcoded roster presentation and replace it with approved-note-derived rows from `listBrainPatientsAction()`. Keep the existing workspace layout and adapt the cards to show only `patient_display_name`, `patient_id`, approved-note count, and most recent consultation date. Do not invent age, status, complaint, appointment, or follow-up data. |
| `app/(workspace)/rawaan-ai/page.tsx` | Server page containing static wireframe content: a disabled patient `<select>`, three non-interactive sample chips, a read-only textarea prefilled with a sample question, a disabled Ask button, and a static supported answer with two hardcoded citation tags and one excerpt. It imports only `Link` from `next/link`; it does not import `lib/brain` or `lib/actions`. | Preserve the page’s heading, safety label, and visual language, but replace static mockup content with an interactive client boundary. The patient selector, chat history, input, loading/error states, answer cards, citations, and quick-action chips must use the existing typed Server Actions and no Brain internals in the client. |
| `app/(workspace)/layout.tsx` | Wraps workspace routes in the persistent sidebar and main content area. | Leave unchanged unless a minimal composition change is necessary to host the interactive page. |

The current pages are therefore useful visual and routing scaffolding, not a live Brain UI. In particular, the static `demoClients` data and the Rawaan AI wireframe answer must not survive as sources of truth after implementation.

---

## Technology decisions

| Decision | Choice | Why |
|---|---|---|
| Chat execution | Each submitted message calls `queryPatientRecordAction(patientId, question)` independently. | Reuses the reviewed safety and grounding boundary and prevents prior conversation text from silently becoming retrieval evidence. |
| Chat state | Client memory only: `Array<{ question, response, timestamp }>` for the selected patient. | V1 needs a visible thread but no new persistence requirement. “New chat” clears this list; it does not alter notes or server storage. |
| Quick actions | Two or three fixed, reviewed retrieval-only question templates. | Preset buttons must recall documented facts, never generate suggestions or treatment advice. |
| Roster source | `listBrainPatientsAction()` backed by `repository.listAll()`, with the approved-note contract enforced server-side. | Uses the existing persistence boundary and avoids a new patient model. |
| UI framework | Existing Next.js App Router + strict TypeScript + React client components only where interaction requires them. | Fits the current application and keeps server-only provider and repository code out of the browser. |
| Styling | Existing `docs/DESIGN.md` tokens and workspace styles: flat surfaces, no shadows or gradients, Onest UI/body type, and the existing Sky Wash / Peach Wash result treatments. | Extends the merged design system without introducing a second visual language. |
| Persistence | None for chat threads in v1. | A later version may consider saved conversations only after privacy, retention, and patient-scoping decisions are reviewed. |

---

## Data and contract schema

The UI must consume the existing `BrainResponse` result without importing the classifier, ranker, repository, or provider. The Server Action result remains:

```ts
export type BrainActionResult =
  | { ok: true; response: BrainResponse }
  | { ok: false; message: string };
```

The new client-only state is intentionally small:

```ts
export type BrainChatEntry = {
  question: string;
  response: BrainResponse | { status: "error"; message: string };
  timestamp: string;
};

export type BrainChatState = {
  patientId: string;
  entries: BrainChatEntry[];
  draftQuestion: string;
  isSubmitting: boolean;
};
```

The roster action’s result is the existing typed shape:

```ts
export type BrainPatient = {
  patientId: string;
  displayName: string;
};
```

The roster UI may compute `approvedNoteCount` and `mostRecentConsultationDate` only from the server-provided approved-note-derived data. If the current action does not expose enough information for those two fields, stop and propose a reviewed action-contract extension before implementation; do not import the repository into a client component or recreate the data from hardcoded values.

Every chat entry stores the complete typed response for rendering, but the next turn sends only the currently selected `patientId` and the newly entered question. It never sends previous questions, previous answers, excerpts, citations, or timestamps to the pipeline.

---

## Global constraints

- **Hard stateless-per-turn rule:** every message, including a quick action, independently calls the complete `classify → retrieve → generate` pipeline. No previous-turn question, answer, excerpt, citation, or hidden context may be passed to retrieval or generation.
- An early `refused` or `no_supporting_record` response must not influence a later turn. A later supported response must be produced from its own question and the selected patient’s approved notes only.
- Quick actions are fixed, reviewed retrieval questions such as “What plan was discussed in the documented visits?” or “What symptoms were reported in the documented visits?” They must never be dynamically generated and must never ask what the clinician should do.
- The patient selector is required before sending a question. The selected patient ID is the sole patient scope sent to the Server Action.
- The UI never imports `lib/brain`, `lib/llm`, `lib/notes`, or provider code. It calls only typed Server Actions.
- `no_supporting_record`, `refused`, and action-level errors are distinct render states. Do not render a no-record result as a generic error or a refusal as an empty answer.
- Supported answers show only the citations and dates returned by the validated `BrainResponse`; the UI must not infer, rewrite, or add citations.
- Roster counts and dates must come from approved persisted notes. Draft notes and invented client metadata never appear.
- No diagnosis, treatment recommendation, appointment scheduling, EHR integration, or full CRM model is added. Full PRD §7.4 appointments/scheduling remains an explicit stretch goal outside this plan.
- “New chat” clears client memory only. It must not clear or modify `data/notes.json` or the note repository.
- Preserve the existing Scribe flow and workspace routes. Do not modify seed data in this workstream.
- Keep the existing safety disclosure and the visual rules in `docs/DESIGN.md`: flat pastel surfaces, no shadows or gradients, and existing color tokens.

---

## File map and ownership

This is a solo implementation plan unless Rehan, Aashir, Dev1, or Dev2 explicitly confirms a different assignment. The ownership column remains so the work can be split without changing the contracts.

| Path | Responsibility | Owner |
|---|---|---|
| `app/(workspace)/rawaan-ai/page.tsx` | Compose the Brain page and interactive client boundary while preserving the existing workspace structure. | Rehan / Dev2 |
| `app/components/brain-chat.tsx` | Client-only chat state, patient selection, message list, loading/error states, thread reset, and typed action calls. | Rehan / Dev2 |
| `app/components/brain-quick-actions.tsx` | Fixed retrieval-only chips and reviewed question templates. | Rehan / Dev2 |
| `app/(workspace)/clients/page.tsx` | Replace `demoClients` with the typed approved-note-derived roster. | Rehan / Dev2 |
| `app/components/brain-roster.tsx` | Optional presentational roster row/card component if the page needs a separate boundary. | Rehan / Dev2 |
| `app/actions.ts` | Only extend an existing Server Action contract after review if roster count/date data is insufficient; do not duplicate Brain logic. | Joint |
| `tests/brain-chat.test.tsx` or equivalent | Deterministic client-state and rendering tests with mocked Server Actions. | Joint |
| `tests/brain-roster.test.ts` | Roster derivation and approved-note exclusion tests, if a pure derivation helper is introduced. | Joint |
| `tests/e2e-brain.mjs` | Manual production-browser coverage after the UI is implemented. | Joint / Dev2 |
| `docs/HANDOFF.md` | Record each checkpoint and the review gate. | Whoever stops first |

No implementation file is created by this plan-only checkpoint.

---

## Task 1: Confirm action contracts and extract UI-safe boundaries

**Files:**

- Inspect: `app/actions.ts`, `lib/actions/brain.ts`, `lib/brain/types.ts`
- Create only if needed after review: a typed roster summary action extension and/or pure server-side derivation helper.
- Test: focused action/derivation tests.

**TDD order:**

1. Write failing tests that define the exact client-visible shapes for a supported response, no-record response, refusal, and safe action-level error.
2. Write a failing roster test proving three distinct patients, approved-note count, and latest consultation date are derived from approved notes only.
3. Verify failure before implementation.
4. Implement the smallest typed boundary. The existing Brain pipeline remains the only source of answer behavior.
5. Run focused tests and typecheck.

**Acceptance criteria:**

- No client component imports a server-only Brain or repository module.
- Missing provider configuration remains a safe action-level error only when evidence exists and generation is attempted.
- Refusal and no-record paths remain provider-free.
- The roster cannot display draft notes or hardcoded patient records.

---

## Task 2: Replace the Clients Directory wireframe with the approved-note roster

**Files:**

- Modify: `app/(workspace)/clients/page.tsx`
- Create if useful: `app/components/brain-roster.tsx`, a pure roster derivation helper.
- Test: `tests/brain-roster.test.ts` or an equivalent deterministic test.

**TDD order:**

1. Add failing tests for distinct patient grouping, approved-note counts, most recent consultation date, and exclusion of drafts.
2. Verify failure.
3. Implement the roster using the reviewed Server Action or a server-side derived result. Remove the exact `demoClients` array and its invented age/status/complaint fields.
4. Preserve links to `/record` and `/rawaan-ai`, updating patient context only through a reviewed route/action contract if needed.
5. Verify responsive layout and empty/loading/error states with the existing design system.

**Acceptance criteria:**

- With the seed fixture loaded intentionally, the roster displays only the three fictional patients from approved notes.
- Each row/card shows patient display name, patient ID, total approved-note count, and most recent consultation date.
- With an empty store, the page shows an honest empty state rather than placeholder clients.
- No invented ages, statuses, complaints, appointments, or follow-up tasks remain.

---

## Task 3: Build the stateless Brain chat into the existing Rawaan AI wireframe

**Files:**

- Modify: `app/(workspace)/rawaan-ai/page.tsx`
- Create: `app/components/brain-chat.tsx`
- Test: `tests/brain-chat.test.tsx` or the repository’s established component-test boundary.

**TDD order:**

1. Add failing tests for selecting a patient, submitting a question, appending a timestamped entry, loading state, safe action error, refusal rendering, no-record rendering, supported answer rendering, citation date rendering, and “New chat” clearing only client state.
2. Add the required isolation regression test: submit at least three messages where an early turn is `refused` or `no_supporting_record`, then a later independent question returns `supported`. Assert the later action receives only the later question and selected patient ID, and that earlier content is not passed as context.
3. Verify failure.
4. Replace only the static disabled controls and sample result with the interactive boundary. Keep the page-level heading, safety label, and workspace visual structure.
5. Verify focused tests, typecheck, and a production browser exercise.

**Acceptance criteria:**

- A clinician can select a patient, enter a question, submit it, and see a typed response in the message list.
- The selected patient remains visible for each turn, and changing patient prevents accidental reuse of the prior patient’s thread; the reset behavior is explicit and tested.
- Loading is visible, duplicate submissions are prevented, and action errors remain safe and non-technical.
- A supported card shows the answer plus exact returned source note IDs/dates. A no-record card says `No record of that for this patient.` A refusal card preserves the safety message and reason-specific state.
- “New chat” removes only the in-memory messages and leaves persisted notes unchanged.

---

## Task 4: Add fixed retrieval-only quick-action chips

**Files:**

- Create/modify: `app/components/brain-quick-actions.tsx` and `app/components/brain-chat.tsx`
- Test: extend `tests/brain-chat.test.tsx`.

**Approved v1 templates:**

```ts
export const BRAIN_QUICK_ACTIONS = [
  {
    id: "documented-plan",
    label: "Recall documented plan",
    question: "What plan was discussed in the documented visits?",
  },
  {
    id: "reported-symptoms",
    label: "Summarize reported symptoms",
    question: "What symptoms were reported in the documented visits?",
  },
  {
    id: "follow-up",
    label: "Recall follow-up",
    question: "What follow-up was documented for this patient?",
  },
] as const;
```

The exact final wording must be checked against the deterministic classifier and ranking behavior before implementation. If a template accidentally becomes a treatment/general-medical query or produces weak generic-token retrieval, revise the fixed template in the plan/review before coding; do not add dynamic filtering that silently changes its meaning.

**TDD order:**

1. Add failing tests proving each chip emits its exact reviewed question, calls the same action as manual submission, and cannot supply generated text.
2. Add a test proving a refusal/no-record response from a chip is rendered as that state and does not alter the next manual turn.
3. Verify failure, implement, and verify focused tests.

**Acceptance criteria:**

- Two or three chips appear above the input for the selected patient.
- Chips are retrieval/recall language only and never advice-seeking.
- There is no LLM call that generates or rewrites chip labels/questions.
- Chips and manual input share the same patient ID and action path.

---

## Task 5: Full integration, accessibility, and browser verification

**Files:**

- Modify the UI files above only.
- Create: `tests/e2e-brain.mjs`.
- Update: `README.md` only if the new demo workflow needs a concise usage note.
- Update: `docs/HANDOFF.md`.

**TDD and verification order:**

1. Run all focused Brain chat/roster tests.
2. Run the complete existing test suite.
3. Run `npm run typecheck`, `npm run lint`, and `npm run build`.
4. Run a production browser exercise against `npm run start` using only fictional seed notes: select a patient, ask a supported question, verify source date; ask a deliberately absent fact, verify no-record; ask a treatment and a general-medical question, verify distinct refusals; use “New chat”; then verify a later supported question is independent.
5. Reset `data/notes.json` to `[]` and remove temporary browser/server artifacts.
6. Update the handoff with exact test/build/browser outputs and the review gate.

**Acceptance criteria:**

- `main` remains untouched by this plan-only checkpoint.
- The UI works at desktop and mobile widths without horizontal overflow.
- Keyboard focus, labels, disabled/loading states, and live result updates are accessible.
- The existing Scribe manual and voice flows remain regression-free.
- Brain responses remain grounded, patient-isolated, approved-note-only, and explicit about refusals/no-record outcomes.
- A three-message thread proves no cross-turn leakage: an early refusal or no-record result cannot contaminate a later supported answer.
- The plan’s implementation may be opened for PR only after Rehan/Aashir cross-review plus one teammate review, with the full validation loop passing.

---

## Review gate

This branch contains the plan only. Do not implement Tasks 1–5, do not alter `main`, and do not add chat/roster UI until a reviewer confirms the scope, action contracts, fixed quick-action wording, and the hard stateless-per-turn rule.
