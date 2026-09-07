# BYOK Option A Implementation Plan

**Goal:** Let Brain users supply a Groq key held only in browser localStorage while retaining server-side safety preparation and shared-key fallback.

**Constraints:** The key never enters a Server Action, persistence layer, log, or error text. Server-side safety classification, patient scoping, and approved-note filtering remain mandatory. Browser citation validation is advisory only.

## Tasks

1. Add a server action that runs safety classification and approved, patient-scoped retrieval, returning either an existing safe response or minimal evidence excerpts without accepting a key.
2. Add browser-only Groq completion and citation validation using the existing prompt, with generic errors and no shared-key import.
3. Add localStorage key helpers and a sidebar settings panel with the approved copy, clear action, and repository link.
4. Route Brain queries to direct Groq only when a local key exists; otherwise preserve `queryPatientRecordAction` unchanged.
5. Add focused tests, run typecheck/lint/test/build, inspect client bundles and network behavior, and reset demo data.

## Implementation status

- Completed: server-side preparation, direct browser Groq client, localStorage settings panel, shared-key fallback, focused unit tests, and full typecheck/lint/test/build validation.
- Confirmed: Groq's preflight response permits the direct browser request (`access-control-allow-origin: *`, including `authorization` and `content-type`).
- Pending external rehearsal: a separate active personal Groq key must be entered locally in Settings to test a real direct request and inspect the resulting browser network entry. The configured shared server key was not reused for that test.
