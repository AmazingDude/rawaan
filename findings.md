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
