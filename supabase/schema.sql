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

commit;
