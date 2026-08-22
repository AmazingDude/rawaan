# Architecture Decisions

## 2026-08-22 — Start with a Next.js App Router + TypeScript monolith

**Decision:** Build the initial Scribe and Brain application as a single **Next.js App Router + TypeScript** project. Keep API routes, domain validation, persistence, and the clinician-facing UI in the same repository and deployment unit.

**Why:** `AGENTS.md` is the repository’s standing engineering governance and specifies Next.js App Router with strict TypeScript. The first Scribe vertical slice accepts a scripted or manually entered transcript, so neither live ASR nor Python orchestration is on the critical path. This keeps the earliest acceptance test small and deployable: transcript → schema-valid note draft → clinician edit/approval → persisted approved note.

**Boundary for later ASR:** If live ASR later requires a Python-only or materially stronger Python implementation, introduce it as a small, standalone service behind a narrow API boundary. Do not restructure the Next.js application merely to add ASR.

**Non-goals preserved:** The application does not diagnose, recommend treatment, answer from general medical knowledge, support multi-patient analytics, integrate with an EHR, or process real patient data.
