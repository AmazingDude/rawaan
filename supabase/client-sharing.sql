-- Client handoff migration. Run after the existing schema, or run schema.sql.
-- Idempotent; does not transfer or claim any existing clinical records.
begin;

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
