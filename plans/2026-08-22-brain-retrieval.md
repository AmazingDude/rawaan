# Brain Retrieval Implementation Plan

**Goal:** Add a patient-isolated Brain that answers a selected patient's record questions from approved notes only, cites source-note dates, returns an explicit no-record result when evidence is absent, and refuses general-medical or treatment questions without using an LLM.

**Architecture:** The Brain is a small typed pipeline inside the existing Next.js + TypeScript app: deterministic request safety classification, deterministic patient-scoped retrieval, then grounded answer generation only when retrieval returns sufficient evidence. Retrieval and answer generation are separate modules with an explicit data contract: Rehan's retrieval code produces `RetrievalResult`; Aashir's answer code accepts only the evidence-bearing branch of that result. The UI never reads the note store directly and must render server-returned `BrainResponse` states.

**Tech Stack:** Next.js App Router, TypeScript (strict), Zod, existing JSON demo note store, existing `lib/llm/` boundary, Vitest, Playwright.

**Decision Record:** `DECISIONS.md`; team ownership and branch boundaries: `docs/TASKS.md`.

## Global Constraints

- Follow `AGENTS.md`: strict TypeScript, no `any`, no diagnosis or treatment advice, no multi-patient analytics, no real patient data, and no unrelated changes.
- Filter candidate notes by the selected `patient_id` **before any ranking, keyword scoring, semantic scoring, or LLM call**. Prompt text is never an acceptable substitute for this code-level isolation gate.
- Retrieve only notes whose runtime `approval_status` is exactly `"approved"`. Drafts are never passed to rankers, answer generators, or the UI as evidence.
- When no patient-scoped evidence clears the relevance threshold, return `no_supporting_record` directly. Do not call any LLM with weak or empty evidence.
- Treat general-medical questions and treatment/medication recommendation requests as a distinct `refused` result, not as `no_supporting_record`. This follows the current team assignment in `docs/TASKS.md` and the explicit reviewer requirement for this plan; it intentionally resolves the older root-PRD table wording that grouped a general-medical question under `no_supporting_record`.
- Every supported answer must expose source note IDs and consultation dates. A citation may refer only to a note in that response's retrieved evidence.
- Keep retrieval code independent from answer generation. Rehan owns retrieval; Aashir owns grounded answer generation. Dev2's query UI stays on `feat/query-ui`; this plan defines its stable server contract but does not take ownership of UI polish.
- Do not create or modify `data/seed/**` in this work. Dev1 owns synthetic histories and adversarial queries on `feat/seed-data`.
- No provider secret belongs in source control. Any configured provider uses `.env.local`, remains inside `lib/llm/`, and is not called for refusal or no-record states.

## File Map

| Path | Responsibility |
|---|---|
| `lib/brain/types.ts` | Shared, discriminated TypeScript contracts for query classification, retrieval, citations, and all Brain response states. |
| `lib/brain/query-safety.ts` | Deterministic classifier for record questions versus general-medical/treatment requests. |
| `lib/brain/retrieval.ts` | Rehan-owned patient-first filtering, approved-only gate, relevance ranking, and no-record result creation. |
| `lib/brain/answer-generation.ts` | Aashir-owned answer boundary; accepts only retrieved evidence and validates supported-answer citations. |
| `lib/llm/prompts/brain-answer.ts` | Versioned provider prompt constrained to the supplied evidence and citation schema. |
| `lib/actions/brain.ts` | Orchestration service that runs safety classification, retrieval, and generation in the only permitted order. |
| `app/actions.ts` | Server Action wrapper returning the typed `BrainResponse` contract for Dev2's UI. |
| `tests/brain-query-safety.test.ts` | Refusal-classification and no-LLM-call tests. |
| `tests/brain-retrieval.test.ts` | Patient-isolation, approved-only, relevance, and no-record retrieval tests. |
| `tests/brain-answer-generation.test.ts` | Citation validation and evidence-only answer-generation tests. |
| `tests/brain-service.test.ts` | Pipeline-order and integration tests with provider-call spies. |
| `tests/e2e-brain.mjs` | Dev2-owned or jointly maintained browser flow once the query UI is available. |
| `README.md` | Startup and Brain-state documentation, updated only after the implemented feature is verified. |

## Interface Contract

The implementation must use this boundary without adding alternate untyped shapes:

```ts
export type QuerySafetyResult =
  | { kind: "record_query"; normalizedQuestion: string }
  | {
      kind: "refused";
      reason: "general_medical" | "treatment_or_medication";
      message: "This tool only retrieves documented patient history and does not provide general medical or treatment advice.";
    };

export type EvidenceNote = {
  noteId: string;
  patientId: string;
  consultationDate: string;
  excerpts: string[];
  relevanceScore: number;
};

export type RetrievalResult =
  | {
      kind: "evidence";
      patientId: string;
      question: string;
      evidence: EvidenceNote[];
    }
  | {
      kind: "no_supporting_record";
      patientId: string;
      message: "No record of that for this patient.";
      reason: "no_approved_notes" | "no_relevant_evidence";
    };

export type BrainResponse =
  | {
      status: "supported";
      answer: string;
      sources: Array<{ noteId: string; consultationDate: string }>;
    }
  | {
      status: "no_supporting_record";
      message: "No record of that for this patient.";
      reason: "no_approved_notes" | "no_relevant_evidence";
    }
  | {
      status: "refused";
      message: "This tool only retrieves documented patient history and does not provide general medical or treatment advice.";
      reason: "general_medical" | "treatment_or_medication";
    };
```

Pipeline order is fixed:

```text
selected patient ID + question
  -> classifyQuerySafety(question)
  -> refused: return BrainResponse immediately; no retrieval; no LLM
  -> retrieveApprovedEvidence(patientId, question, allNotes)
       1. filter patient ID
       2. filter approval_status === "approved"
       3. rank only the remaining notes
  -> no_supporting_record: return BrainResponse immediately; no LLM
  -> generateGroundedAnswer(evidence branch only)
  -> supported BrainResponse with evidence-bound source dates
```

## Tasks

### Task 1: Define query, retrieval, and response contracts with a deterministic safety gate

**Files:** Create `lib/brain/types.ts`, `lib/brain/query-safety.ts`, and `tests/brain-query-safety.test.ts`.

- [ ] Write failing tests that classify `"What medication should we prescribe?"` as `treatment_or_medication` and `"What is the standard treatment for migraine?"` as `general_medical`.
- [ ] Write a failing test that classifies `"Has this patient mentioned chest pain before?"` as `record_query` and preserves a trimmed normalized question.
- [ ] Define `QuerySafetyResult`, `RetrievalResult`, `BrainResponse`, and `EvidenceNote` exactly as the interface contract above.
- [ ] Implement `classifyQuerySafety(question: string): QuerySafetyResult` with deterministic phrase checks for treatment/medication recommendations and general-medical knowledge requests. It must not inspect notes or invoke a provider.
- [ ] Run `npm run test -- tests/brain-query-safety.test.ts` and commit only the contract and safety-gate files with `test(brain): define query safety states`.

### Task 2: Implement Rehan's patient-first, approved-only retrieval boundary

**Files:** Create `lib/brain/retrieval.ts` and `tests/brain-retrieval.test.ts`; modify `lib/notes/repository.ts` only if it needs an explicit approved-note read method.

- [ ] Write a failing test with matching notes for two different fictional patient IDs. Inject a ranking function that records its input, call retrieval for one selected patient, and assert the ranker received only that patient's note IDs. This proves filtering happened before ranking.
- [ ] Write a failing test with one approved matching note and one draft matching note for the selected patient. Assert draft content cannot reach the ranking input or evidence output.
- [ ] Write failing tests for `no_approved_notes` and `no_relevant_evidence`, both returning the exact no-record message and an empty evidence list.
- [ ] Implement `retrieveApprovedEvidence({ patientId, question, notes, rankNotes })`. It must first runtime-filter `note.patient_id === patientId`, then runtime-filter `note.approval_status === "approved"`, then call `rankNotes` with only that filtered list. The relevance threshold belongs in this module and must return `no_relevant_evidence` before any generation boundary is reached.
- [ ] Return each selected `EvidenceNote` with `noteId`, `patientId`, `consultationDate`, transcript-backed excerpts, and a score. Do not return complete unrelated notes to the answer layer.
- [ ] Run `npm run test -- tests/brain-retrieval.test.ts` and commit only retrieval files plus any narrowly required repository method with `feat(brain): add patient-isolated approved-note retrieval`.

### Task 3: Implement Aashir's evidence-only answer-generation boundary and citation validation

**Files:** Create `lib/llm/prompts/brain-answer.ts`, `lib/brain/answer-generation.ts`, and `tests/brain-answer-generation.test.ts`.

- [ ] Write a failing test proving `generateGroundedAnswer` accepts only `Extract<RetrievalResult, { kind: "evidence" }>` and cannot be called with a no-record result.
- [ ] Write a failing test with a provider double that returns a citation for a note ID outside the supplied evidence. Assert the result is rejected rather than shown to the user.
- [ ] Write a failing test with valid evidence citations and assert the supported response contains the matching `consultationDate` values in `sources`.
- [ ] Define `BRAIN_ANSWER_SYSTEM_PROMPT` in `lib/llm/prompts/brain-answer.ts`. It must prohibit diagnosis, treatment advice, general medical knowledge, ungrounded claims, and citations outside the supplied evidence.
- [ ] Implement `generateGroundedAnswer(evidence: Extract<RetrievalResult, { kind: "evidence" }>, provider)` in `lib/brain/answer-generation.ts`. Parse provider output with Zod and reject any source note ID absent from `evidence.evidence`.
- [ ] Run `npm run test -- tests/brain-answer-generation.test.ts` and commit only generation/prompt/test files with `feat(brain): add evidence-bound answer generation`.

### Task 4: Compose the pipeline without allowing generation on refusal or no-record branches

**Files:** Create `lib/actions/brain.ts`, modify `app/actions.ts`, and create `tests/brain-service.test.ts`.

- [ ] Write a failing test where a provider double throws if called, submit a treatment request, and assert the service returns the exact `refused` `BrainResponse` without invoking retrieval or the provider.
- [ ] Write a failing test where a provider double throws if called, submit a record question with no approved or relevant evidence, and assert the service returns the exact `no_supporting_record` `BrainResponse` without invoking the provider.
- [ ] Write a failing test with patient-scoped evidence and a provider double returning valid citations. Assert the service returns `supported` with source dates matching the retrieval evidence.
- [ ] Implement `queryPatientRecord({ patientId, question, notes, rankNotes, provider }): Promise<BrainResponse>` in `lib/actions/brain.ts` using the fixed pipeline order in this plan.
- [ ] Add a Server Action in `app/actions.ts` that accepts a patient ID and question, calls `queryPatientRecord`, and returns `BrainResponse` unchanged to the UI. It must not expose raw cross-patient notes.
- [ ] Run `npm run test -- tests/brain-service.test.ts` and commit only orchestration/action/test files with `feat(brain): add guarded query orchestration`.

### Task 5: Integrate Dev2's query UI without moving Brain logic into components

**Files:** Dev2 modifies the query UI only on `feat/query-ui`; create or modify `tests/e2e-brain.mjs` jointly after integration.

- [ ] Dev2 consumes the typed Server Action return value as `BrainResponse`; it does not import `lib/brain/retrieval.ts`, the note repository, or provider code.
- [ ] Render `supported` answers with each source date visible, render `no_supporting_record` as the exact message, and render `refused` as the exact refusal message. Do not replace either state with generic error copy.
- [ ] Write a browser test for a supported patient question that displays a source date, a missing-record question that shows the no-record message, and a treatment/general-medical request that shows refusal.
- [ ] Run the full browser path using Dev1's synthetic notes only after Dev1 has merged or provided an explicit test-seed loader. Do not edit `data/seed/**` from this branch.
- [ ] Commit the UI work only on `feat/query-ui`; the Brain branch may update a typed action contract but must not absorb UI-polish changes.

### Task 6: Validate adversarial cases and prepare the review gate

**Files:** Modify `README.md` only after implementation is verified; add focused tests only where the previous tasks do not already cover the case.

- [ ] Run the adversarial cases from `PRD.md` §8.6: supported prior symptom, missing measurement, unrecorded condition, treatment recommendation, cross-patient query, and general-medical question.
- [ ] Verify all missing or weak-evidence cases return `no_supporting_record` without provider invocation, and all treatment/general-medical cases return `refused` without provider invocation.
- [ ] Run `npm run typecheck`, `npm run lint`, `npm run test`, and `npm run build`.
- [ ] Run the browser E2E test against `npm start`, confirm a new approved Scribe note can be queried only for its own patient, and confirm returned source dates match the cited note evidence.
- [ ] Inspect `git diff --check` and `git status --short`; keep the Brain change limited to the files in this plan and separately coordinated Dev2 UI work.
- [ ] Request human review of this plan and the patient-isolation tests before starting Task 1 implementation.

## Rollback

Revert Brain retrieval, answer-generation, action, and Brain-test commits as a group. Retain `docs/TASKS.md`, the Scribe slice, and this planning document. If an implementation defect risks cross-patient access, disable the query action and render no patient-record answer until the retrieval isolation tests pass again.
