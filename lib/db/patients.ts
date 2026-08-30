import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

import { getSupabaseClient } from "@/lib/db/supabase";

/** Row shape matching `public.patients` in `supabase/schema.sql`. */
export type PatientRecord = {
  id: string;
  first_name: string;
  last_name: string;
  display_name: string;
  email: string;
  mobile_number: string;
};

const patientsStoragePath = join(process.cwd(), "data", "patients.json");

async function readLocalPatients(): Promise<PatientRecord[]> {
  try {
    const raw = await readFile(patientsStoragePath, "utf8");
    return JSON.parse(raw) as PatientRecord[];
  } catch (error) {
    if (isMissingFileError(error)) return [];
    throw error;
  }
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

async function writeLocalPatients(patients: PatientRecord[]): Promise<void> {
  await mkdir(dirname(patientsStoragePath), { recursive: true });
  await writeFile(patientsStoragePath, JSON.stringify(patients, null, 2));
}

/**
 * Lists every registered patient. Supabase is the primary store when
 * configured; local JSON patients are merged in so anything created while
 * offline is never lost.
 */
export async function listPatients(): Promise<PatientRecord[]> {
  const local = await readLocalPatients();
  const client = getSupabaseClient();

  if (!client) return local;

  try {
    const { data, error } = await client
      .from("patients")
      .select("id, first_name, last_name, display_name, email, mobile_number");

    if (!error) {
      const remote = (data ?? []) as PatientRecord[];
      const remoteIds = new Set(remote.map((p) => p.id));
      return [...remote, ...local.filter((p) => !remoteIds.has(p.id))];
    }

    // Pre-migration deployments may lack the PII columns; retry with only the
    // base columns and treat the missing ones as empty.
    const fallback = await client.from("patients").select("id, display_name");
    if (fallback.error) return local;

    const remote = (fallback.data ?? []).map((row) => ({
      id: String(row.id),
      first_name: "",
      last_name: "",
      display_name: String(row.display_name ?? ""),
      email: "",
      mobile_number: "",
    })) as PatientRecord[];

    const remoteIds = new Set(remote.map((p) => p.id));
    return [...remote, ...local.filter((p) => !remoteIds.has(p.id))];
  } catch {
    return local;
  }
}

/**
 * Upserts a patient row into Supabase only (no local write). Never throws —
 * used to satisfy the notes table foreign key before a note sync.
 */
export async function upsertPatientToSupabase(
  patient: PatientRecord,
): Promise<void> {
  const client = getSupabaseClient();
  if (!client) return;

  try {
    // Only send fields with values so partial rows cannot blank existing
    // columns in the patients table.
    const row: Record<string, string> = {
      id: patient.id,
      display_name: patient.display_name,
    };
    if (patient.first_name) row.first_name = patient.first_name;
    if (patient.last_name) row.last_name = patient.last_name;
    if (patient.email) row.email = patient.email;
    if (patient.mobile_number) row.mobile_number = patient.mobile_number;

    const { error } = await client.from("patients").upsert(row, {
      onConflict: "id",
    });
    if (error) {
      console.warn("Supabase patient sync failed:", error.message);
    }
  } catch (error) {
    console.warn("Supabase patient sync failed:", error);
  }
}

/**
 * Persists a patient record. Writes to local JSON first so the write always
 * lands somewhere, then syncs the row up to Supabase when configured.
 */
export async function savePatient(patient: PatientRecord): Promise<PatientRecord> {
  const local = await readLocalPatients();
  const withoutDuplicate = local.filter((p) => p.id !== patient.id);
  await writeLocalPatients([...withoutDuplicate, patient]);

  await upsertPatientToSupabase(patient);
  return patient;
}

