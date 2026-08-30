import type { ApprovedNote } from "@/lib/notes/schema";

import { getSupabaseClient } from "@/lib/db/supabase";
import { upsertPatientToSupabase } from "@/lib/db/patients";

/**
 * Notes are persisted locally as the durable source of truth and synced up to
 * Supabase on a best-effort basis. Everything in here is written so a
 * missing, stale-schema, or unreachable Supabase never fails a local write.
 */

/** The `public.notes` columns in `supabase/schema.sql` (no patient PII). */
type SupabaseNoteRow = Omit<
  ApprovedNote,
  "first_name" | "last_name" | "email" | "mobile_number"
>;

function toNoteRow(note: ApprovedNote): SupabaseNoteRow {
  return {
    approval_status: note.approval_status,
    approved_at: note.approved_at,
    assessment_discussed: note.assessment_discussed,
    chief_complaint: note.chief_complaint,
    consultation_date: note.consultation_date,
    follow_up: note.follow_up,
    history: note.history,
    id: note.id,
    medications_mentioned: note.medications_mentioned,
    patient_display_name: note.patient_display_name,
    patient_id: note.patient_id,
    plan_discussed: note.plan_discussed,
    raw_transcript: note.raw_transcript,
    summary: note.summary,
    symptoms: note.symptoms,
    uncertainties: note.uncertainties,
  };
}

function isApprovedNote(value: unknown): value is ApprovedNote {
  return (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    "patient_id" in value &&
    (value as { approval_status?: unknown }).approval_status === "approved"
  );
}

/** Upserts one approved note into Supabase. Never throws. */
export async function syncNoteToSupabase(note: ApprovedNote): Promise<void> {
  const client = getSupabaseClient();
  if (!client) return;

  try {
    // The notes table references patients, so the row must exist first.
    await upsertPatientToSupabase({
      id: note.patient_id,
      first_name: note.first_name ?? "",
      last_name: note.last_name ?? "",
      display_name: note.patient_display_name,
      email: note.email ?? "",
      mobile_number: note.mobile_number ?? "",
    });

    const { error } = await client
      .from("notes")
      .upsert(toNoteRow(note), { onConflict: "id" });

    if (error) {
      console.warn("Supabase note sync failed:", error.message);
    }
  } catch (error) {
    console.warn("Supabase note sync failed:", error);
  }
}

/**
 * Lists notes stored in Supabase. Returns null when Supabase is not
 * configured or unavailable, so callers can fall back to local JSON.
 */
export async function listSupabaseNotes(): Promise<ApprovedNote[] | null> {
  const client = getSupabaseClient();
  if (!client) return null;

  try {
    const { data, error } = await client.from("notes").select("*");
    if (error) return null;

    return (data ?? []).filter(isApprovedNote) as ApprovedNote[];
  } catch {
    return null;
  }
}

/**
 * Merges local (durable) and remote (Supabase) notes by id. Local rows win on
 * conflict; remote-only rows are appended so rows written elsewhere still show.
 */
export function mergeNotes(
  local: ApprovedNote[],
  remote: ApprovedNote[],
): ApprovedNote[] {
  const merged = new Map(local.map((note) => [note.id, note]));
  for (const note of remote) {
    if (!merged.has(note.id)) merged.set(note.id, note);
  }
  return [...merged.values()];
}

let backfillPromise: Promise<void> | null = null;

/**
 * Best-effort push of local notes that are missing from Supabase. Runs once
 * per process and resets on failure so the next request can retry.
 */
export function ensureLocalNotesSynced(localNotes: ApprovedNote[]): Promise<void> {
  const client = getSupabaseClient();
  if (!client || localNotes.length === 0) return Promise.resolve();

  if (!backfillPromise) {
    backfillPromise = (async () => {
      const remote = await listSupabaseNotes();
      if (!remote) throw new Error("Supabase unavailable for backfill");

      const remoteIds = new Set(remote.map((note) => note.id));
      const missing = localNotes.filter((note) => !remoteIds.has(note.id));
      for (const note of missing) {
        await syncNoteToSupabase(note);
      }
    })().catch(() => {
      backfillPromise = null;
    });
  }

  return backfillPromise;
}
