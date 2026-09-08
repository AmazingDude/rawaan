# Supabase-only storage

Patients, approved clinical notes, and display-only Brain chats use Supabase exclusively. The application never reads or writes `data/notes.json`, `data/patients.json`, or `data/chats.json`. Browser session storage is used only for draft recovery. Brain answers contain verbatim excerpts selected from approved notes and cite those same notes; they do not use a personal Groq key or generate answer prose. Any unused Groq key saved by an earlier version is removed when the workspace loads.

## Setup

1. Run the entire `supabase/schema.sql` file in the project's SQL Editor. The idempotent transaction preserves existing rows, removes historical clinical-table policies, revokes browser grants, enables RLS, and adds Clerk user ownership plus composite patient/owner constraints. It also adds the per-user `app_users.clinic_name` setting. Re-run it when upgrading an existing project. It does not insert fixtures or assign an owner to existing shared records.
2. Set `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` in `.env.local` or the server deployment environment. A newer `SUPABASE_SECRET_KEY` is also supported and takes precedence. `NEXT_PUBLIC_SUPABASE_URL` remains compatible, but anon/public keys are not used for backend storage. Keep both elevated key names free of the `NEXT_PUBLIC_` prefix and out of browser code. The storage client is marked `server-only`.
3. Configure Clerk as described in [authentication setup](CLERK-AUTH.md). Use Node 22.19 or newer. Run `npm ci`, `npm run build`, and `npm run start`, or `docker compose --env-file .env.local up --build`. The command supplies the Clerk publishable key at build time; Docker reads server credentials from `.env.local` at runtime. It has no data volume, and secrets/backups are excluded from the image build context.

Missing configuration, missing schema, rejected requests, and malformed database records fail clearly. A saved message requires a validated successful Supabase response. Failed approval keeps the draft editable. Failed reads are not represented as empty records or as “No record of that”. Genuine successful empty reads still produce the normal empty state.

Leave RLS enabled. The server credential uses the service role and bypasses RLS without adding public anon policies. It still needs table grants for the operations it performs. An anon SELECT request can return no rows when RLS hides them, so anon credentials cannot reliably establish which records already exist during migration. The app and CLI require the elevated server credential rather than falling back to anon. The CLI reports safe Supabase error codes without dumping backend messages or clinical rows.

The owner superseded the single-clinic demo scope on 6 October 2026. Workspace access now requires Clerk; each user has separate patients, notes, and chats. Middleware registers the verified Clerk ID in Supabase. The backend service role bypasses RLS, so every application query additionally scopes that identity. See [Clerk setup and ownership](CLERK-AUTH.md).

Notes retain original transcripts, approval time, reviewed content, optional identity snapshots, and session metadata. Patient-scoped retrieval filters approved notes in the database. Existing registered patient contact details are not blanked when creating a note. Creating a missing patient before note insertion can leave a patient without notes if insertion fails; the approval still reports failure.

## Preserve and import legacy records

The current workspace's legacy stores were moved to ignored `data/legacy-json/`. Keep that backup until the records have been reconciled and verified in Supabase. A fresh checkout has no legacy backup. To use another directory, pass `--from=absolute-or-relative-directory`.

```sh
npm run storage:import -- --owner=user_your_clerk_id
npm run storage:import -- --owner=user_your_clerk_id --write
```

The default command validates every local patient, approved note, and chat, then compares IDs with Supabase without writing. Identical rows are skipped. A different existing record with the same ID stops the import before writes. Resolve such conflicts deliberately in a separate reviewed migration input; do not delete cloud records to force the import. The CLI does not infer approval or invent missing transcript provenance.

`--write` repeats preflight and inserts missing patients, then notes, then chats. A database failure stops the import; earlier confirmed inserts may remain. Rerun the dry-run before retrying. Plain inserts reject IDs created after preflight rather than overwriting them. The source files are never changed or deleted by the CLI.

## Explicit demo data

```sh
npm run seed:demo -- --owner=user_test_account --dry-run
npm run seed:demo -- --owner=user_test_account
npm run seed:reset -- --owner=user_test_account
```

The canonical fictional fixture remains under `data/seed/`. Seeding rejects conflicting IDs instead of replacing live records. Reset deletes only fixture note IDs for their matching patient IDs, preserving patients, chats, and unrelated notes. The application never inserts fixtures implicitly.

## Verification

Run `npx tsc --noEmit`, `npm run lint`, `npm test`, and `npm run build`. The storage tests use the installed Supabase SDK with an isolated HTTP transport, covering successful persistence, rejected requests, malformed rows, patient filters, provenance, and pagination. Browser storage tests use a controlled local PostgREST endpoint; they do not prove hosted permissions or network readiness. Hosted deployment additionally requires the schema update and successful reads/writes against the intended project.

After building, run `npm run test:storage:e2e`. It starts an isolated local PostgREST endpoint and production app, verifies server-side Clerk authentication and owner-scoped record reads, and exercises seed/import dry runs, retries, ownership conflicts and reset boundaries. External fetches are blocked in the app and CLI processes; no hosted data is read or written. It cleans up both local servers and its fictional scratch files. Browser flows are checked separately with `node tests/e2e-agent-ui.mjs` and `npm run tutorials:capture`; those render actual components with mocked backend boundaries.

## Conversational assistant storage

The schema also stores owner-scoped general conversations in `general_chats`, clinician-entered patient context in `patients.clinical_context`, and separately reviewed plans in `clinical_plans`. Approved notes remain the evidence for Records only mode; generated chat and plan content is never added as note evidence. See [Rawaan AI setup](RAWAAN-AI.md).
