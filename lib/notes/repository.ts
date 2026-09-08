import {
  readAllRows, storageOperation, StorageError,
  type SupabaseClientFactory,
} from "@/lib/db/supabase";
import { noteSchema, noteToRow, parseStoredNote, type ApprovedNote } from "@/lib/notes/schema";

const columns = "id, patient_id, patient_display_name, first_name, last_name, email, mobile_number, consultation_date, chief_complaint, summary, history, symptoms, assessment_discussed, plan_discussed, medications_mentioned, follow_up, uncertainties, raw_transcript, session_info, approval_status, approved_at";

export function createNoteRepository(ownerId: string, getClient: SupabaseClientFactory) {
  if (!ownerId.trim()) throw new StorageError();
  async function list(patientId?: string): Promise<ApprovedNote[]> {
    return storageOperation(async () => {
      const client = getClient();
      const rows = await readAllRows(() => {
        let query = client.from("notes").select(columns).eq("owner_user_id", ownerId).eq("approval_status", "approved");
        if (patientId !== undefined) query = query.eq("patient_id", patientId);
        return query.order("id");
      });
      return rows.map(parseStoredNote);
    });
  }
  return {
    listAll: () => list(),
    listByPatient: (patientId: string) => list(patientId),
    async save(candidate: unknown): Promise<ApprovedNote> {
      if (typeof candidate === "object" && candidate !== null && "approval_status" in candidate && candidate.approval_status !== "approved") {
        throw new Error("Only approved notes can be persisted");
      }
      const note = noteSchema.parse(candidate);
      return storageOperation(async () => {
        const client = getClient();
        // Existing registered contact details are authoritative; do not blank them.
        const patientResult = await client.from("patients").upsert({
          owner_user_id: ownerId,
          id: note.patient_id, display_name: note.patient_display_name,
          first_name: note.first_name ?? "", last_name: note.last_name ?? "",
          email: note.email ?? "", mobile_number: note.mobile_number ?? "",
        }, { onConflict: "id", ignoreDuplicates: true });
        if (patientResult.error) throw new StorageError();
        const ownedPatient = await client.from("patients").select("id").eq("id", note.patient_id).eq("owner_user_id", ownerId).maybeSingle();
        if (ownedPatient.error || !ownedPatient.data) throw new StorageError();
        const { data, error } = await client.from("notes")
          .upsert({ ...noteToRow(note), owner_user_id: ownerId }, { onConflict: "id", ignoreDuplicates: true })
          .select(columns)
          .maybeSingle();
        if (error) throw new StorageError();
        if (data) return parseStoredNote(data);

        // An ignored primary-key conflict is an idempotent retry only when it
        // carries the same reviewed content. Never overwrite another draft.
        const existingResult = await client.from("notes")
          .select(columns)
          .eq("owner_user_id", ownerId)
          .eq("id", note.id)
          .maybeSingle();
        if (existingResult.error || !existingResult.data) throw new StorageError();
        const existing = parseStoredNote(existingResult.data);
        const existingContent = { ...existing };
        const candidateContent = { ...note };
        Reflect.deleteProperty(existingContent, "approved_at");
        Reflect.deleteProperty(candidateContent, "approved_at");
        if (JSON.stringify(existingContent) !== JSON.stringify(candidateContent)) {
          throw new StorageError();
        }
        return existing;
      });
    },
  };
}
