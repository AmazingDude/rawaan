# Scribe Vertical Slice — Findings

## Repository state

- The repository began as documentation and agent-skill setup only: no `package.json`, `app/`, `src/`, or tests were present.
- `AGENTS.md` governs implementation choices and requires Next.js App Router, strict TypeScript, versioned prompts in `lib/llm/prompts/`, LLM calls only in `lib/llm/`, and verification before completion.
- The build-ready root `PRD.md` is newer than `docs/PRD.md` and is the source of truth. It requires a structured note schema, raw-transcript provenance, an approval gate, and manual transcript entry as the mandatory ASR failure fallback.

## Selected approach

- The user approved Next.js App Router + TypeScript for UI and API.
- A Python ASR microservice is deferred until real ASR is required and justified by a stronger Python-only implementation.
- The first delivered flow remains constrained to: manual/scripted transcript → schema-valid structured draft → clinician edit/approval → persisted approved note.

## Technical verification

- Remote toolchain: Node `v25.9.0`, npm `11.12.1`.
- Registry check before scaffolding: Next.js latest `16.3.2`; TypeScript latest `7.0.2`.
- The hosted project-opening attempt did not locate a record for the attached project identifier, so implementation continues in the user-attached repository without deleting any existing content.

## Scope guardrails

- No diagnosis, treatment recommendation, real patient data, EHR integration, multi-patient analytics, live ASR, Brain retrieval, or CRM is part of this slice.
- Local demo fallback must be visibly labeled and must not claim to be an LLM response.

- The Record dashboard routes both `Record a summary` and `Create empty note` to the in-person microphone modal through one shared `isRecordModalOpen` state.
- The approved correction keeps the microphone modal exclusive to in-person capture, adds a clinician-entered summary path with `summary` provenance, and adds a client-assigned manual note with explicit `manual` provenance.
- A manual draft must remain empty until the clinician enters structured content and approves it; it must not invoke draft generation or persist before approval.
- Existing Scribe browser coverage targets removed legacy fields and must be replaced with public Record-dashboard entry-flow checks.
- The refreshed production E2E first required title-prefix button locators because each action button's accessible name includes its descriptive copy. It then failed as intended: after `Record a summary`, the expected `Record a Summary` heading never appeared because the dashboard opened the in-person recorder instead.
- The dashboard must discriminate three inputs at handoff: in-person audio (`in-person` / Whisper provenance), clinician-entered summary (`summary` / clinician-entered provenance), and a blank manual note (`manual` / clinician-created provenance). Only the manual route may bypass `generateDraftAction`; it opens a local draft and relies on existing approval persistence.
- The summary form can reuse the established solid-surface `.modal-backdrop` and modal entrance animation rather than introducing a separate modal framework.
- `SessionWorkspaceView` currently renders empty drafts with invented fallback prose and exposes AI rewrite controls, so manual entry needs a conditional structured editor that updates only local draft state until the existing approval action persists it.
- The manual editor conditional, `isManualEntry` prop, and provenance-aware Transcript display are implemented. Manual drafts preserve blank structured fields, withhold AI rewrite controls, and only persist through the existing approval action.
- The current committed routing separates all three paths: in-person retains its recorder and Whisper source; summary input opens `ManualSummaryModal`; and an empty manual note goes through client assignment into direct structured editing with AI controls withheld.
- Remaining gaps are presentation styles for the new summary/manual classes and an E2E path that creates a fictional client, edits a manual note, approves it, confirms the persisted session, and restores tracked local storage.