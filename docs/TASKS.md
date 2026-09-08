# Team Tasks

## Rehan + Aashir — Brain feature

Building the part that answers questions about a patient using their approved notes.

- Rehan: retrieval side — make sure it only ever looks at the correct patient's notes (filter by patient ID before anything else), find the relevant notes for a question.
- Aashir: answer side — take the notes Rehan's part finds and turn them into an actual answer, with the note dates cited as sources. Must say "no record of that" (not guess) when there's nothing relevant. Must refuse general medical/treatment questions, not just patient-specific ones.
- Both: write a short plan doc together first (`plans/<date>-brain-retrieval.md`, same format as the existing Scribe plan) before writing code.

## Dev1 — Seed data

- Make fake/synthetic patient histories and notes for demo purposes.
- Make some test questions where the correct answer is "no record of that" (nothing relevant exists).
- Only touch `data/seed/**`, don't touch anything else in the repo.

## Dev2 — UI + demo flow

- Work on the note review screen and the question/answer screen.
- Help polish the overall demo flow once Brain has something working to connect to.

## Rules for everyone

- Read `AGENTS.md` before touching anything. It's short and it's the rulebook — if you're using an AI tool (Claude, Manus, whatever), point it at `AGENTS.md` too.
- Work directly on `main`; do not create a branch or pull request for a task.
- Before each direct commit: make sure typecheck, lint, build, and tests all pass, and actually try the feature yourself (don't just assume it works).
- Update `docs/HANDOFF.md` with what you did and what's next before you stop working for the day.
