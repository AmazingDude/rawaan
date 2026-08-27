# Seed / Demo Data (SYNTHETIC ONLY)

Everything in this folder is **fictional, team-authored demo data** per PRD §6.3 and §8.

Rules:
- Only synthetic "past visit" notes for fictional patients. Never real patient data.
- Business logic must never import from here except through an explicit seed script.
- If a file here is wrong, fix the data — never work around it in code.

## Demo fixture workflow

`demo-patients.json` contains the synthetic approved-note fixture used for Brain rehearsals. It remains separate from the empty-by-default live store until explicitly loaded.

```bash
npm run seed:demo
npm run seed:reset
```

The first command copies the fixture to `data/notes.json`; the second restores that file to exactly `[]`. Run the reset command immediately after every demo or local test. `demo-questions.md` documents the fictional patient list, deliberately absent facts, and expected rehearsal outcomes.
