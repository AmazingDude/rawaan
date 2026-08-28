# Ranker Name-Exclusion Fix — Plan Addendum

> **Status: PROPOSAL ONLY — do not implement until reviewed.** This addendum follows the
> 2026-08-28 Brain chat/roster work and the 2026-08-29 seeded live-UI rehearsal, which exposed a
> grounding-critical false-positive in `lib/brain/ranking.ts`. It is held to the same standard as the
> original Task 3 isolation work: plan first, review, then implement with TDD and a full rehearsal re-run.

**Spec:** `docs/PRD.md` §5.5, §8.6, §10 (grounded answers; "unrecorded vital sign → `no_supporting_record`"
is one of the six §8.6 adversarial cases and is named in §11 as the proof-of-not-hallucinating moment).
**Affected code:** `lib/brain/ranking.ts` (`RELEVANCE_THRESHOLD`, `tokenize`, `noteText`, `rankNotes`).
**Consumers that must not regress:** `lib/brain/retrieval.ts`, `lib/actions/brain.ts`, and the tests in
`tests/brain-ranking.test.ts`, `tests/brain-retrieval.test.ts`, `tests/brain-adversarial.test.ts`,
`tests/brain-service.test.ts`.

---

## 1. Confirmed root cause

During the 2026-08-29 rehearsal (seed fixture loaded via `npm run seed:demo`, verified in the live UI),
two §8.6-style "absent vital" questions returned `supported` instead of `no_supporting_record`:

- "What was Amina's blood pressure?" → `supported` (expected `no_supporting_record`)
- "What was Hassan's weight?" → `supported` (expected `no_supporting_record`)

Mechanism (verified against `data/seed/demo-patients.json` and `lib/brain/ranking.ts`):

1. Realistic transcripts repeat the patient's first name, so name tokens (`amina`, `hassan`, `sara`)
   appear in `noteText(note)` via `raw_transcript`. (`noteText` does not include the name *fields*, but the
   name is dense in the transcript *content*.)
2. `tokenize` keeps those name tokens (they are not in `STOP_WORDS`), so they count as lexical relevance
   matches in `rankNotes`.
3. `rankNotes` scores `matched / questionTerms.size` against `RELEVANCE_THRESHOLD = 0.25`. A short question
   has few live terms, so a single name-match alone crosses the threshold:
   - "What was Hassan's weight?" → live terms `{hassan, weight}` (2); name-match 1 → 0.5 ≥ 0.25 → evidence.
   - "What was Amina's blood pressure?" → `{amina, blood, pressure}` (3); 1/3 ≈ 0.33 ≥ 0.25 → evidence.
   - By contrast "How many milligrams did Sara take?" → 5 live terms; 1/5 = 0.2 < 0.25 → correctly `no_supporting_record`.

So a patient's own name acts as a near-universal lexical match, and short absent-fact questions cross the
threshold on a name-only match, producing a `supported` answer with a citation to a note that does not
contain the asked fact. This is the same class as the Task 7 `reported` stop-word fix (filler/structural
tokens masquerading as relevance), but a new instance the original stop-word list and the hand-written
adversarial fixtures did not trigger (those fixtures do not repeat the patient name as densely as realistic
transcripts).

## 2. Proposed fix (direction; exact form to be confirmed in review)

Goal: a note must match on **non-name content** to count as evidence. Two candidate mechanisms, not equivalent:

- **Option A (stop-word-style name exclusion):** per note, compute `nameTokens = tokenize(patient_display_name) ∪ tokenize(patient_id)` (and `first_name`/`last_name` where present) and remove them from the note's token set before matching, so name occurrences in the transcript never contribute to `matched`.
- **Option B (require non-name content match):** keep scoring, but treat a note as evidence only if it has ≥ 1 matched term that is *not* a name token; equivalently, exclude name tokens from the *question* term set used for both the numerator and the denominator, and return no evidence when the remaining question term set is empty.

**Recommendation: implement B on top of A** — exclude patient-name/ID tokens from the matching sets (A) *and*
drop name-only questions to no-evidence by filtering name tokens out of `questionTerms` before the threshold
check (B). This makes a name-only probe return `no_supporting_record` and forces every retained match to rest
on clinical content. Option A alone would still let a question like "Amina headache" match on `amina`+`headache`
(correctly), but a question of only `amina` would yield an empty note-token intersection and already return no
evidence; B additionally guards the denominator so short name+absent-fact questions can't pass on the name term.

Sketch (illustrative, not final):

```ts
function nameTokens(note: ApprovedNote): Set<string> {
  return new Set([
    ...tokenize(note.patient_display_name),
    ...tokenize(note.patient_id),
  ]);
}

// in rankNotes:
const excluded = nameTokens(note);
const questionTerms = new Set(
  tokenize(question).filter((t) => !excluded.has(t)),
);
if (questionTerms.size === 0) return /* no evidence for this note */;
// match only on non-excluded note tokens
```

The exclusion must be per-note (a question mentioning "Amina" must not be stripped when scored against
*Hassan's* notes — cross-patient isolation already limits candidates to the selected patient, but the rule
should remain correct if reused).

## 3. New tests (write RED first)

`tests/brain-ranking.test.ts`:
- A note whose transcript densely repeats the patient's first name; question = name + unrecorded vital
  (e.g. "What was Amina's blood pressure?") → `rankNotes` returns **no** evidence for that note.
- Same note; question = name + a *recorded* content term (e.g. "Did Amina report chest pain?" where the
  transcript contains chest pain) → still returns evidence (no over-exclusion).

`tests/brain-adversarial.test.ts`:
- Add a §8.6 row: "short question containing only the patient's name plus an unrecorded fact →
  `no_supporting_record`", wired end-to-end through `retrieveApprovedEvidence` so the threshold path is
  exercised, not just `rankNotes` in isolation.
- Keep the existing cross-patient isolation case to confirm the per-note exclusion doesn't weaken isolation.

## 4. Verification gate (after implementation)

1. Focused: `tests/brain-ranking.test.ts`, `tests/brain-adversarial.test.ts`, `tests/brain-retrieval.test.ts`,
   `tests/brain-service.test.ts` all green.
2. Full loop: `npm run typecheck`, `npm run lint`, `npm run test`, `npm run build`.
3. **Re-run the entire 12-question rehearsal** (`data/seed/demo-questions.md`) against the live UI with
   `npm run seed:demo`, confirming all 12 now match (the 2 previously-failing absent-vital questions return
   `no_supporting_record`, and the 10 currently-correct outcomes — 3 supported-with-citation, 1 no-record,
   6 refusals — do not regress). Then `npm run seed:reset`.

## 5. Non-goals

- No change to `RELEVANCE_THRESHOLD` semantics beyond the name-token exclusion.
- No change to the safety classifier, retrieval isolation, or answer-generation citation validation.
- No edits to seed fixtures or the UI as part of this fix.
