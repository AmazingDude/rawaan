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

Apply `supabase/schema.sql` and configure the intended Supabase project first. The first command validates and imports the fixture into Supabase without overwriting different existing rows. Use `npm run seed:demo -- --dry-run` to preview it. The second deletes only canonical fixture note IDs from Supabase; patients, chats, and other notes remain. Confirm the configured project before running reset. Neither command writes a local runtime store. `demo-questions.md` documents the fictional patient list, deliberately absent facts, and expected rehearsal outcomes.

## Tutorial fixture

`tutorial-session.json` is a fictional training conversation used only by the
isolated visual-guide capture harness. It is never imported into a user's account
or loaded by the running app. Tutorial media explicitly labels the example as
fictional.
