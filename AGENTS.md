# AGENTS.md — Ground Rules for AI Agents

**Project:** Patient Context Engine ("Clinical Scribe + Brain") — AI Hackathon Pakistan 2026, Healthcare Track.

Read `docs/PRD.md` before writing any code. The PRD is the source of truth. If code and PRD disagree, the PRD wins — flag the conflict to the human, don't silently pick one.

## Hard rules (non-negotiable)

1. **Never invent APIs.** Before using any library/framework API, verify it exists in the installed version (check `package.json`, `node_modules`, or official docs). If unsure, say "I'm not sure" and check. A wrong import costs more time than a 30-second lookup.
2. **Never claim done without proof.** Before saying a task is complete, run the verification loop: typecheck (`npx tsc --noEmit`), lint, `npm run build`, and relevant tests. Report actual output. If a check fails, fix it or report the failure honestly — never say "should work".
3. **No hallucinated data — in the product AND in development.** Seed/demo data lives only in clearly-marked files under `data/seed/`. Never hardcode fake values inside business logic to "make it work".
4. **Grounded answers are a product requirement** (PRD §5.5, §8, §10). The Brain answers ONLY from retrieved notes and must explicitly say "no record of that" when nothing relevant is found. Any change that weakens grounding fails review, no matter what else it improves.
5. **Respect the Non-Goals** (PRD §3). No diagnosis features, no EHR integration, no multi-tenancy, no real-time streaming ASR. If a change drifts into these, stop and ask.
6. **Small diffs.** One logical change per edit. No drive-by refactors, no reformatting untouched code, no comment churn.
7. **No secrets in code.** API keys go in `.env.local` (gitignored). Never log keys, never commit them.
8. **Cite your sources — both directions.** In code reviews, point at file:line. In product answers, show source notes. Vague claims are treated as wrong until proven.

## Skills map — installed under `.agents/skills/`

Use the right skill instead of improvising:

| Situation | Skill |
|---|---|
| Starting any feature or ambiguous task | `brainstorming` |
| Multi-step work (anything > 1 file) | `writing-plans` + `planning-with-files` (keep plan in `plans/`) |
| Before claiming ANY task done | `verification-before-completion` |
| Any bug, test failure, or unexpected behavior | `systematic-debugging` (reproduce → isolate → fix → verify; NEVER "fix" by deleting a failing assertion or try/catch-swallowing) |
| Reviewing code (giving or receiving) | `code-review` + `requesting-code-review` |
| Next.js App Router work | `nextjs-app-router-patterns` |
| API route design | `api-design-principles` |
| Testing the web UI end-to-end | `webapp-testing` (Playwright) |

## Stack conventions

- Next.js (App Router) + TypeScript + React. Backend = Next.js API routes for the MVP.
- Strict TypeScript. No `any` unless justified with a comment explaining why.
- All LLM calls live in `lib/llm/` — never inline in components or route handlers.
- All LLM prompts live in `lib/llm/prompts/` as named exported constants, so prompts are reviewable and versioned like code.
- Storage: simple per-patient note store per PRD §7 (SQLite or JSON files are fine; no vector DB unless retrieval quality demands it — we have a handful of notes per patient).
- ASR via Whisper; keep the transcript attached to every generated note (provenance).

## Branching & workflow

- `main` always stays working — never push directly to it, never merge without typecheck/lint/build/tests all passing.
- One branch per task: `feat/brain-retrieval`, `feat/seed-data`, `feat/query-ui`.
- Before merging into `main`: run the full check (typecheck, lint, build, tests, and actually try the feature) — this is the same Definition of Done AGENTS.md already requires, just also applied before merging, not just before saying "done."
- Get a quick look from Rehan or Aashir before merging into `main`, even if you're confident it's fine — a broken main costs more time than a 5-minute review.

## Definition of done

A task is done when: typecheck passes, lint passes, build passes, the feature was actually exercised (manually or via a Playwright test), and the diff contains no unrelated changes.

## Hackathon context

- 6-day build (22–27 Aug). Speed matters, but a broken demo costs more than a missing feature. When in doubt: fewer features, all working.
- Demo day success criteria are in PRD §10 — especially the "system declines when asked about something not in any note" moment. That is the money shot. Protect it.
