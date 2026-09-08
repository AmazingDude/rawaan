# Clerk authentication and per-user records

Rawaan uses Clerk for sign-in, sign-up, session verification and sign-out. The landing page and auth pages are public. Workspace pages and all data/model actions require an authenticated Clerk session; transcription rejects anonymous uploads before parsing audio. No password prompt or custom Basic Auth is used.

## Setup

1. Create/select a Clerk application. Put `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` from its API Keys page in ignored `.env.local`. Never share the secret in chat or give it a `NEXT_PUBLIC_` prefix. Use Clerk live keys and the intended production domain when deploying.
2. Run the complete [schema migration](../supabase/schema.sql) in Supabase's SQL Editor. Keep `SUPABASE_URL` and server-only `SUPABASE_SERVICE_ROLE_KEY` (or `SUPABASE_SECRET_KEY`) configured.
3. Run `npm run dev` locally. After changing Clerk keys, restart the server. For production run `npm run build` followed by `npm run start`; the publishable key is compiled into browser assets, so build with the intended key.
4. Docker: `docker compose --env-file .env.local up --build`. Only the publishable key is a build argument; the Clerk secret and Supabase admin key are runtime environment values excluded from the image build context.
5. Sign up/sign in. Middleware registers your verified Clerk user ID in `app_users` automatically. A new account starts with empty records. No Clerk/Supabase dashboard integration, Supabase Auth account, email allowlist, or browser Supabase credentials are needed.

## Ownership and authorization

`app_users.id` is the Clerk user ID. Patients, notes and chats have `owner_user_id`; the server derives it from Clerk rather than trusting submitted payloads. Every read includes an owner filter. Writes supply that owner, patient updates filter both ID and owner, and conflicting foreign record IDs cannot be overwritten or accepted as successful retries. Notes/chats use composite patient/owner foreign keys, preventing cross-owner references even with the backend credential.

RLS stays enabled and all direct `anon`/`authenticated` table permissions and historical policies on the clinical tables are removed. The backend's service role bypasses RLS; **application ownership checks are therefore the user authorization boundary**, reinforced by database relationship constraints. Never expose the service key, add public table policies, or introduce an unscoped repository. Independent user accounts do not share records.

The UI hides internal patient identifiers while retaining them as storage keys and route parameters. Citations show dates/source labels, with exact note IDs retained as internal provenance. Draft recovery is namespaced by user; signing out/switching accounts clears other snapshots and immediately hides the old workspace until refreshed with the current identity.

## Existing records

The migration preserves old rows with NULL ownership; they are invisible to every new account. It does not choose an owner, erase records, or turn fictional fixtures into real records. New writes require ownership. To assign legacy records, review the intended Clerk owner and patient set, back up the database, then perform an explicit administrative transaction assigning each patient and its related notes/chats to the same registered owner. Never automatically claim all records on signup.

Import and fictional seed commands now require `--owner=<registered Clerk ID>` and reject existing unowned/foreign IDs. Example dry run: `npm run storage:import -- --owner=user_your_clerk_id`. Do not seed a production user with fictional records. The seed tools remain opt-in testing utilities; they are not invoked by the app.

## Verification and release limits

Run typecheck, lint, unit tests, build, and the auth/browser test suite. Tests cover anonymous action denial, cross-user reads/writes and conflicting IDs, migration reruns, database foreign keys, and revoked browser grants. Isolated tests use synthetic identities and fictional fixtures without hosted writes.

Before deployment, exercise actual sign-in/sign-out with the configured Clerk instance and create separate accounts to confirm that each sees only its own records. Hosted schema/configuration checks are separate from local tests. Configure the production Clerk domain, desired authentication factors, hosting TLS, backups, retention and deletion processes, provider data handling, and record consent requirements before collecting real clinical data; implementing login and ownership does not itself certify those operational requirements.
