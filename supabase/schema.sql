-- Rawaan Patient Context Engine: schema and idempotent migration only.
-- Run this entire file in the Supabase SQL Editor before starting the app.
-- Clerk ownership and RLS: apply the entire migration before deploying the app.
-- This script does not load demo data or delete rows.
begin;

-- Registered automatically on the first authenticated workspace request.
create table if not exists public.app_users (
  id text primary key check (length(trim(id)) > 0),
  clinic_name text not null default '',
  created_at timestamptz not null default now()
);
alter table public.app_users add column if not exists clinic_name text not null default '';
alter table public.app_users enable row level security;
revoke all on public.app_users from anon, authenticated;
grant select, insert, update on public.app_users to service_role;

create table if not exists public.patients (
  id text primary key,
  first_name text default '',
  last_name text default '',
  display_name text not null,
  email text default '',
  mobile_number text default '',
  created_at timestamptz default now() not null
);

create table if not exists public.notes (
  id text primary key,
  patient_id text not null references public.patients(id) on delete cascade,
  patient_display_name text not null,
  consultation_date text not null,
  chief_complaint text default '',
  summary text default '',
  history text[] default array[]::text[],
  symptoms text[] default array[]::text[],
  assessment_discussed text[] default array[]::text[],
  plan_discussed text[] default array[]::text[],
  medications_mentioned text[] default array[]::text[],
  follow_up text default '',
  uncertainties text[] default array[]::text[],
  raw_transcript text not null,
  approval_status text not null default 'approved',
  approved_at timestamptz not null,
  created_at timestamptz default now() not null
);

-- Historical note snapshots retain optional identity and recording provenance.
alter table public.patients
  add column if not exists first_name text default '',
  add column if not exists last_name text default '',
  add column if not exists email text default '',
  add column if not exists mobile_number text default '';

alter table public.notes
  add column if not exists summary text default '',
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists email text,
  add column if not exists mobile_number text,
  add column if not exists session_info jsonb;

create table if not exists public.chats (
  id text primary key,
  patient_id text not null references public.patients(id) on delete cascade,
  thread_id text not null,
  question text not null,
  response jsonb not null,
  timestamp text not null,
  created_at timestamptz default now() not null
);

create index if not exists idx_notes_patient_id on public.notes (patient_id);
create index if not exists idx_notes_consultation_date on public.notes (consultation_date desc);
create index if not exists idx_chats_patient_id on public.chats (patient_id);
create index if not exists idx_chats_thread_id on public.chats (thread_id);

-- Existing shared rows remain NULL-owned and invisible to signed-in users.
-- Never assign legacy records to the first person who signs up.
alter table public.patients add column if not exists owner_user_id text;
alter table public.notes add column if not exists owner_user_id text;
alter table public.chats add column if not exists owner_user_id text;

-- NOT VALID preserves pre-migration rows, while enforcing every future write.
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'patients_owner_required' and conrelid = 'public.patients'::regclass) then
    alter table public.patients add constraint patients_owner_required check (owner_user_id is not null and length(trim(owner_user_id)) > 0) not valid;
    alter table public.notes add constraint notes_owner_required check (owner_user_id is not null and length(trim(owner_user_id)) > 0) not valid;
    alter table public.chats add constraint chats_owner_required check (owner_user_id is not null and length(trim(owner_user_id)) > 0) not valid;
  end if;
end $$;
create unique index if not exists patients_id_owner_unique on public.patients(id, owner_user_id);
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'patients_user_fk' and conrelid = 'public.patients'::regclass) then
    alter table public.patients add constraint patients_user_fk foreign key (owner_user_id) references public.app_users(id) not valid;
  end if;
end $$;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'notes_patient_owner_fk' and conrelid = 'public.notes'::regclass) then
    alter table public.notes add constraint notes_patient_owner_fk foreign key (patient_id, owner_user_id) references public.patients(id, owner_user_id) on delete cascade not valid;
    alter table public.chats add constraint chats_patient_owner_fk foreign key (patient_id, owner_user_id) references public.patients(id, owner_user_id) on delete cascade not valid;
  end if;
end $$;
create index if not exists patients_owner_idx on public.patients(owner_user_id, id);
create index if not exists notes_owner_patient_idx on public.notes(owner_user_id, patient_id, consultation_date desc);
create index if not exists chats_owner_patient_idx on public.chats(owner_user_id, patient_id, timestamp, id);

-- Backend storage uses a server-only credential; no public anon policies are added.
alter table public.patients enable row level security;
alter table public.notes enable row level security;
alter table public.chats enable row level security;

-- Replace every old policy on these app-owned tables. Permissive policies are
-- combined with OR, so preserving a historical allow-all defeats isolation.
do $$ declare p record; begin
  for p in select schemaname, tablename, policyname from pg_policies
    where schemaname = 'public' and tablename in ('patients', 'notes', 'chats')
  loop execute format('drop policy %I on %I.%I', p.policyname, p.schemaname, p.tablename); end loop;
end $$;
revoke all on public.patients, public.notes, public.chats from anon, authenticated;
-- No browser role can access these tables. Clerk is verified by the backend;
-- the backend's service credential bypasses RLS, so every app query MUST scope
-- owner_user_id from the verified session. Composite FKs prohibit cross-owner
-- patient references even for service-role writes.
grant select, insert, update on table public.patients to service_role;
grant select, insert, update, delete on table public.notes to service_role;
grant select, insert on table public.chats to service_role;

-- Conversational assistant: no fabricated patient is needed for general chat.
alter table public.patients add column if not exists clinical_context jsonb not null default '{}'::jsonb;
create table if not exists public.general_chats (
  id text primary key,
  owner_user_id text not null references public.app_users(id),
  thread_id text not null check (length(trim(thread_id)) > 0),
  question text not null check (length(trim(question)) > 0),
  response jsonb not null,
  timestamp timestamptz not null default now()
);
create index if not exists general_chats_owner_thread_idx on public.general_chats(owner_user_id, thread_id, timestamp, id);

-- Generated drafts remain in chat history; only an explicit clinician review
-- writes this separate plan record. Approved consultation notes are unchanged.
create table if not exists public.clinical_plans (
  id text primary key,
  owner_user_id text not null references public.app_users(id),
  patient_id text not null,
  title text not null check (length(trim(title)) > 0),
  reviewed_content text not null check (length(trim(reviewed_content)) > 0),
  generated_plan jsonb not null,
  sources jsonb not null default '[]'::jsonb,
  reviewed_at timestamptz not null default now(),
  constraint clinical_plans_patient_owner_fk foreign key (patient_id, owner_user_id)
    references public.patients(id, owner_user_id) on delete cascade
);
create index if not exists clinical_plans_owner_patient_idx on public.clinical_plans(owner_user_id, patient_id, reviewed_at desc);
alter table public.general_chats enable row level security;
alter table public.clinical_plans enable row level security;
do $$ declare p record; begin
  for p in select schemaname, tablename, policyname from pg_policies
    where schemaname = 'public' and tablename in ('general_chats', 'clinical_plans')
  loop execute format('drop policy %I on %I.%I', p.policyname, p.schemaname, p.tablename); end loop;
end $$;
revoke all on public.general_chats, public.clinical_plans from anon, authenticated;
grant select, insert on public.general_chats, public.clinical_plans to service_role;

-- Client handoff migration. Run after the existing schema, or run schema.sql.
-- Idempotent; does not transfer or claim any existing clinical records.

create table if not exists public.client_shares (
  id uuid primary key default gen_random_uuid(),
  owner_user_id text not null references public.app_users(id),
  patient_id text not null,
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  patient_display_name text not null,
  source_clinic_name text not null,
  snapshot jsonb,
  note_count integer not null check (note_count >= 0),
  plan_count integer not null check (plan_count >= 0),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  revoked_at timestamptz,
  imported_by text references public.app_users(id),
  imported_patient_id text,
  imported_at timestamptz,
  constraint client_shares_source_fk foreign key (patient_id, owner_user_id)
    references public.patients(id, owner_user_id) on delete cascade,
  constraint client_shares_recipient_fk foreign key (imported_patient_id, imported_by)
    references public.patients(id, owner_user_id),
  constraint client_shares_claim_complete check (
    (imported_by is null and imported_patient_id is null and imported_at is null) or
    (imported_by is not null and imported_patient_id is not null and imported_at is not null)
  ),
  constraint client_shares_other_recipient check (imported_by is null or imported_by <> owner_user_id)
);
create index if not exists client_shares_owner_patient_idx on public.client_shares(owner_user_id, patient_id, created_at desc, id);

create table if not exists public.client_imports (
  id uuid primary key,
  owner_user_id text not null references public.app_users(id),
  patient_id text not null,
  source_clinic_name text not null,
  shared_at timestamptz not null,
  imported_at timestamptz not null default now(),
  note_ids text[] not null default array[]::text[],
  plan_ids text[] not null default array[]::text[],
  constraint client_imports_patient_fk foreign key (patient_id, owner_user_id)
    references public.patients(id, owner_user_id) on delete cascade
);
create index if not exists client_imports_owner_patient_idx on public.client_imports(owner_user_id, patient_id, imported_at desc, id);
alter table public.client_shares enable row level security;
alter table public.client_imports enable row level security;
revoke all on public.client_shares, public.client_imports from public, anon, authenticated;
grant select, insert, update on public.client_shares to service_role;
grant select, insert on public.client_imports to service_role;

create or replace function public.create_client_share(p_owner_id text, p_patient_id text, p_token_hash text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_patient public.patients%rowtype;
  v_snapshot jsonb;
  v_share public.client_shares%rowtype;
  v_clinic text;
begin
  select * into v_patient from public.patients
    where id = p_patient_id and owner_user_id = p_owner_id for share;
  if not found then raise exception 'share_client_unavailable'; end if;
  select coalesce(nullif(trim(clinic_name), ''), 'Clinic') into v_clinic
    from public.app_users where id = p_owner_id;

  -- Explicit column lists: a future private column is not shared implicitly.
  select jsonb_build_object(
    'patient', jsonb_build_object('display_name', v_patient.display_name,
      'first_name', v_patient.first_name, 'last_name', v_patient.last_name,
      'email', v_patient.email, 'mobile_number', v_patient.mobile_number,
      'clinical_context', v_patient.clinical_context),
    'notes', coalesce((select jsonb_agg(to_jsonb(n) order by n.id) from (
      select id, patient_display_name, first_name, last_name, email, mobile_number,
        consultation_date, chief_complaint, summary, history, symptoms,
        assessment_discussed, plan_discussed, medications_mentioned, follow_up,
        uncertainties, raw_transcript, session_info, approval_status, approved_at
      from public.notes where owner_user_id = p_owner_id and patient_id = p_patient_id
        and approval_status = 'approved'
    ) n), '[]'::jsonb),
    'plans', coalesce((select jsonb_agg(to_jsonb(p) order by p.id) from (
      select id, title, reviewed_content, generated_plan, sources, reviewed_at
      from public.clinical_plans where owner_user_id = p_owner_id and patient_id = p_patient_id
    ) p), '[]'::jsonb)
  ) into v_snapshot;

  if octet_length(v_snapshot::text) > 10485760 then raise exception 'share_too_large'; end if;
  if exists (
    select 1 from jsonb_array_elements(v_snapshot->'plans') plan,
      jsonb_array_elements(plan->'sources') source
    where source->>'kind' = 'note' and not exists (
      select 1 from jsonb_array_elements(v_snapshot->'notes') note where note->>'id' = source->>'noteId'
    )
  ) then raise exception 'share_source_unavailable'; end if;

  insert into public.client_shares(owner_user_id, patient_id, token_hash,
    patient_display_name, source_clinic_name, snapshot, note_count, plan_count)
  values (p_owner_id, p_patient_id, p_token_hash, v_patient.display_name, v_clinic,
    v_snapshot, jsonb_array_length(v_snapshot->'notes'), jsonb_array_length(v_snapshot->'plans'))
  returning * into v_share;
  return jsonb_build_object('id', v_share.id, 'created_at', v_share.created_at,
    'expires_at', v_share.expires_at, 'note_count', v_share.note_count, 'plan_count', v_share.plan_count);
end;
$$;

create or replace function public.preview_client_share(p_token_hash text, p_recipient_id text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare v_share public.client_shares%rowtype;
begin
  if not exists(select 1 from public.app_users where id = p_recipient_id) then raise exception 'share_unavailable'; end if;
  select * into v_share from public.client_shares where token_hash = p_token_hash;
  if not found then raise exception 'share_unavailable'; end if;
  if v_share.owner_user_id = p_recipient_id then raise exception 'share_self'; end if;
  if v_share.imported_by is distinct from p_recipient_id and
    (v_share.imported_by is not null or v_share.revoked_at is not null or v_share.expires_at <= now())
    then raise exception 'share_unavailable'; end if;
  return jsonb_build_object('display_name', v_share.patient_display_name,
    'source_clinic_name', v_share.source_clinic_name, 'note_count', v_share.note_count,
    'plan_count', v_share.plan_count, 'created_at', v_share.created_at,
    'expires_at', v_share.expires_at,
    'imported_patient_id', case when v_share.imported_by = p_recipient_id then v_share.imported_patient_id end);
end;
$$;

create or replace function public.import_client_share(p_token_hash text, p_recipient_id text)
returns jsonb language plpgsql security invoker set search_path = '' as $$
declare
  v_share public.client_shares%rowtype;
  v_patient_id text := 'patient-' || gen_random_uuid()::text;
  v_note_id text;
  v_plan_id text;
  v_item jsonb;
  v_sources jsonb;
  v_map jsonb := '{}'::jsonb;
  v_note_ids text[] := array[]::text[];
  v_plan_ids text[] := array[]::text[];
begin
  if not exists(select 1 from public.app_users where id = p_recipient_id) then raise exception 'share_unavailable'; end if;
  select * into v_share from public.client_shares where token_hash = p_token_hash for update;
  if not found then raise exception 'share_unavailable'; end if;
  if v_share.owner_user_id = p_recipient_id then raise exception 'share_self'; end if;
  if v_share.imported_by = p_recipient_id then
    return jsonb_build_object('patient_id', v_share.imported_patient_id, 'note_count', v_share.note_count,
      'plan_count', v_share.plan_count, 'already_imported', true);
  end if;
  if v_share.imported_by is not null or v_share.revoked_at is not null or
    v_share.expires_at <= now() or v_share.snapshot is null then raise exception 'share_unavailable'; end if;

  insert into public.patients(id, owner_user_id, display_name, first_name, last_name, email, mobile_number, clinical_context)
  select v_patient_id, p_recipient_id, p.display_name, p.first_name, p.last_name,
    p.email, p.mobile_number, p.clinical_context
    from jsonb_populate_record(null::public.patients, v_share.snapshot->'patient') p;

  for v_item in select value from jsonb_array_elements(v_share.snapshot->'notes') loop
    v_note_id := gen_random_uuid()::text;
    v_map := v_map || jsonb_build_object(v_item->>'id', v_note_id);
    v_note_ids := array_append(v_note_ids, v_note_id);
    insert into public.notes(id, owner_user_id, patient_id, patient_display_name,
      first_name, last_name, email, mobile_number, consultation_date, chief_complaint,
      summary, history, symptoms, assessment_discussed, plan_discussed,
      medications_mentioned, follow_up, uncertainties, raw_transcript, session_info, approval_status, approved_at)
    select v_note_id, p_recipient_id, v_patient_id, n.patient_display_name,
      n.first_name, n.last_name, n.email, n.mobile_number, n.consultation_date, n.chief_complaint,
      n.summary, n.history, n.symptoms, n.assessment_discussed, n.plan_discussed,
      n.medications_mentioned, n.follow_up, n.uncertainties, n.raw_transcript, n.session_info, n.approval_status, n.approved_at
      from jsonb_populate_record(null::public.notes, v_item) n;
  end loop;
  for v_item in select value from jsonb_array_elements(v_share.snapshot->'plans') loop
    if exists (select 1 from jsonb_array_elements(v_item->'sources') source
      where source->>'kind' = 'note' and not (v_map ? (source->>'noteId')))
      then raise exception 'share_source_unavailable'; end if;
    select coalesce(jsonb_agg(case when source->>'kind' = 'note'
      then jsonb_set(source, '{noteId}', to_jsonb(v_map->>(source->>'noteId'))) else source end order by position), '[]'::jsonb)
      into v_sources from jsonb_array_elements(v_item->'sources') with ordinality as entry(source, position);
    v_plan_id := gen_random_uuid()::text;
    v_plan_ids := array_append(v_plan_ids, v_plan_id);
    insert into public.clinical_plans(id, owner_user_id, patient_id, title, reviewed_content, generated_plan, sources, reviewed_at)
    values (v_plan_id, p_recipient_id, v_patient_id, v_item->>'title', v_item->>'reviewed_content',
      v_item->'generated_plan', v_sources, (v_item->>'reviewed_at')::timestamptz);
  end loop;
  insert into public.client_imports(id, owner_user_id, patient_id, source_clinic_name, shared_at, note_ids, plan_ids)
    values (v_share.id, p_recipient_id, v_patient_id, v_share.source_clinic_name, v_share.created_at, v_note_ids, v_plan_ids);
  update public.client_shares set imported_by = p_recipient_id, imported_patient_id = v_patient_id,
    imported_at = now(), snapshot = null where id = v_share.id;
  return jsonb_build_object('patient_id', v_patient_id, 'note_count', v_share.note_count,
    'plan_count', v_share.plan_count, 'already_imported', false);
end;
$$;

create or replace function public.revoke_client_share(p_owner_id text, p_share_id uuid)
returns boolean language plpgsql security invoker set search_path = '' as $$
begin
  update public.client_shares set revoked_at = coalesce(revoked_at, now()), snapshot = null
    where id = p_share_id and owner_user_id = p_owner_id and imported_by is null;
  return found;
end;
$$;

revoke all on function public.create_client_share(text, text, text),
  public.preview_client_share(text, text), public.import_client_share(text, text),
  public.revoke_client_share(text, uuid) from public, anon, authenticated;
grant execute on function public.create_client_share(text, text, text),
  public.preview_client_share(text, text), public.import_client_share(text, text),
  public.revoke_client_share(text, uuid) to service_role;

commit;
