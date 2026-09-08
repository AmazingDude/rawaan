import { z } from "zod";
import { patientSchema } from "@/lib/db/schemas";
export { patientSchema } from "@/lib/db/schemas";
import {
  readAllRows, storageOperation, StorageError,
  type SupabaseClientFactory,
} from "@/lib/db/supabase";

export type PatientRecord = z.infer<typeof patientSchema>;
const columns = "id, first_name, last_name, display_name, email, mobile_number";

export async function listPatients(ownerId: string, getClient: SupabaseClientFactory): Promise<PatientRecord[]> {
  if (!ownerId.trim()) throw new StorageError();
  return storageOperation(async () => {
    const client = getClient();
    return patientSchema.array().parse(await readAllRows(() =>
      client.from("patients").select(columns).eq("owner_user_id", ownerId).order("id"),
    ));
  });
}

export async function savePatient(candidate: PatientRecord, ownerId: string, getClient: SupabaseClientFactory): Promise<PatientRecord> {
  if (!ownerId.trim()) throw new StorageError();
  const patient = patientSchema.parse(candidate);
  return storageOperation(async () => {
    const client = getClient();
    const inserted = await client.from("patients").upsert({ ...patient, owner_user_id: ownerId }, { onConflict: "id", ignoreDuplicates: true })
      .select(columns).maybeSingle();
    if (inserted.error) throw new StorageError();
    if (inserted.data) return patientSchema.parse(inserted.data);
    const updated = await client.from("patients").update(patient).eq("id", patient.id).eq("owner_user_id", ownerId).select(columns).maybeSingle();
    if (updated.error || !updated.data) throw new StorageError();
    return patientSchema.parse(updated.data);
  });
}
