-- Rawaan Patient Context Engine - Supabase Schema
-- Run this in your Supabase SQL Editor (https://app.supabase.com)

-- 1. Patients Table
create table if not exists public.patients (
  id text primary key,
  first_name text default '',
  last_name text default '',
  display_name text not null,
  email text default '',
  mobile_number text default '',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. Approved Clinical Notes Table
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
  approved_at timestamp with time zone not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 3. Indexes for retrieval & Brain search
create index if not exists idx_notes_patient_id on public.notes (patient_id);
create index if not exists idx_notes_consultation_date on public.notes (consultation_date desc);

-- 4. Initial Seed Data (Amina Khan, Tariq Mahmood, Gloria)
insert into public.patients (id, first_name, last_name, display_name, email, mobile_number)
values 
  ('patient-amina-001', 'Amina', 'Khan', 'Amina Khan', 'amina.khan@example.com', '+92 300 1234567'),
  ('patient-tariq-002', 'Tariq', 'Mahmood', 'Tariq Mahmood', 'tariq.mahmood@example.com', '+92 321 7654321'),
  ('patient-gloria-001', 'Gloria', 'Rogers', 'Gloria', 'gloria@example.com', '+1 555 0192834')
on conflict (id) do nothing;

insert into public.notes (
  id,
  patient_id,
  patient_display_name,
  consultation_date,
  chief_complaint,
  history,
  symptoms,
  assessment_discussed,
  plan_discussed,
  medications_mentioned,
  follow_up,
  uncertainties,
  raw_transcript,
  approval_status,
  approved_at
)
values 
  (
    'note-amina-001',
    'patient-amina-001',
    'Amina Khan',
    '2026-08-20',
    'Tension headache and exertion chest discomfort',
    array['Headaches recurring over past 3 weeks', 'Mild chest tightness climbing stairs'],
    array['Frontal head throbbing', 'Light sensitivity', 'Exertion fatigue'],
    array['Tension headache likely stress-induced', 'ECG recommended to rule out cardiac origin'],
    array['Maintain symptom diary for two weeks', 'Schedule baseline ECG test', 'Avoid late-night screen exposure'],
    array['Paracetamol as needed', 'Hydration therapy'],
    'Review ECG results and symptom diary in two weeks',
    array['Exact duration and frequency of exertion chest tightness not tracked'],
    'Chief complaint: Tension headache and exertion chest discomfort\nHistory: Headaches recurring over past 3 weeks; mild chest tightness climbing stairs\nSymptoms: Frontal throbbing; light sensitivity\nAssessment discussed: Stress-related tension headache; ECG recommended\nPlan discussed: Keep symptom diary; get ECG; reduce late screen time\nMedications mentioned: Paracetamol as needed\nFollow up: Review ECG and diary in 2 weeks\nUncertainties: Frequency of exertion tightness not tracked',
    'approved',
    '2026-08-20T11:30:00.000Z'
  ),
  (
    'note-tariq-002',
    'patient-tariq-002',
    'Tariq Mahmood',
    '2026-07-02',
    'Type 2 Diabetes routine follow-up',
    array['Diagnosed 4 years ago', 'Recent peripheral tingling in feet'],
    array['Fatigue in afternoons', 'Mild bilateral foot tingling'],
    array['HbA1c target progress reviewed', 'Early signs of mild peripheral neuropathy'],
    array['30-minute daily brisk walking routine', 'Reduce high glycemic evening snacks', 'Podiatric inspection'],
    array['Metformin 500mg BD', 'Vitamin B12 supplement'],
    'Check fasting blood glucose and HbA1c in 3 months',
    array['Compliance with dietary carbohydrate limits'],
    'Chief complaint: Type 2 Diabetes routine follow-up\nHistory: Diagnosed 4 years ago; recent foot tingling\nSymptoms: Afternoon fatigue; bilateral foot tingling\nAssessment discussed: HbA1c reviewed; early neuropathy signs\nPlan discussed: 30 min daily walk; reduce high sugar snacks\nMedications mentioned: Metformin 500mg; Vitamin B12\nFollow up: Check fasting glucose in 3 months\nUncertainties: Diet compliance not quantified',
    'approved',
    '2026-07-02T14:15:00.000Z'
  ),
  (
    'note-gloria-003',
    'patient-gloria-001',
    'Gloria',
    '2026-08-27',
    'Therapy session exploring personal congruence and independence',
    array['Feeling tension between maternal obligations and personal identity'],
    array['Emotional conflict', 'Mild anxiety regarding personal decisions'],
    array['Therapist applied unconditional positive regard and reflective exploration'],
    array['Weekly reflective journaling on authentic personal choices', 'Continue exploratory therapy'],
    array[]::text[],
    'Next therapy session in one week',
    array['Early childhood antecedents to independence anxiety not yet explored'],
    'Chief complaint: Therapy session on congruence and independence\nHistory: Tension between motherhood and personal identity\nSymptoms: Emotional conflict; mild anxiety\nAssessment discussed: Reflective exploration of internal standards\nPlan discussed: Weekly journaling; continue therapy\nMedications mentioned: None mentioned\nFollow up: Next session in one week\nUncertainties: Childhood roots not yet explored',
    'approved',
    '2026-08-27T18:20:00.000Z'
  )
on conflict (id) do nothing;
