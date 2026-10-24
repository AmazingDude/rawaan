# Medication Context Freshness Fix

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enforce the PRD's 24-hour clinical-context reconfirmation only for medication considerations.

**Architecture:** Derive one server-side eligibility flag from the explicit confirmation boolean and a valid timestamp no older than 24 hours and not in the future. Reuse it in the model prompt, clinical output guard, and final medication-option filtering.

**Tech Stack:** TypeScript, Vitest.

**Spec:** `docs/PRD.md`, 6 October 2026 product direction amendment.

## Global Constraints

- Preserve 8 October behavior allowing chat and discussion-plan drafting without reconfirmation.
- Medication options still require current cited references and remain clinician discussion options.
- No dependencies or API contracts change.

---

### Task 1: Enforce and cover the freshness rule

**Files:**
- Modify `lib/llm/rawaan-agent.ts`
- Test `tests/rawaan-agent.test.ts`

- [ ] Add a failing test for the 24-hour eligibility boundary and invalid/unconfirmed contexts.
- [ ] Implement the server-side freshness calculation and use it consistently for medication eligibility.
- [ ] Run focused tests, then typecheck, lint, build, and the full unit suite.
