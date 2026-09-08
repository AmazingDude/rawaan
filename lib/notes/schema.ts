import { z } from "zod";

const requiredText = z.string().trim().min(1);
export const consultationDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, "Use a real calendar date");

export const sessionInfoSchema = z.object({
  session_type: z.enum(["in-person", "telehealth", "summary", "upload", "manual"]),
  duration_seconds: z.number().optional(),
  recording_device: z.string().optional(),
  recorded_at: z.string().optional(),
  transcript_source: z.string(),
});

export type SessionInfo = z.infer<typeof sessionInfoSchema>;

const noteContentSchema = z.object({
  patient_id: requiredText,
  patient_display_name: requiredText,
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  email: z.string().optional(),
  mobile_number: z.string().optional(),
  consultation_date: consultationDateSchema,
  chief_complaint: z.string(),
  summary: z.string().optional(),
  history: z.array(z.string()),
  symptoms: z.array(z.string()),
  assessment_discussed: z.array(z.string()),
  plan_discussed: z.array(z.string()),
  medications_mentioned: z.array(z.string()),
  follow_up: z.string(),
  uncertainties: z.array(z.string()),
  raw_transcript: requiredText,
  session_info: sessionInfoSchema.optional(),
});

export const noteDraftSchema = noteContentSchema.extend({
  draft_id: requiredText.optional(),
  approval_status: z.literal("draft"),
});

export const noteSchema = noteContentSchema.extend({
  id: requiredText,
  approval_status: z.literal("approved"),
  approved_at: z.string().datetime(),
});

export type NoteDraft = z.infer<typeof noteDraftSchema>;
export type ApprovedNote = z.infer<typeof noteSchema>;

export function noteToRow(note: ApprovedNote) {
  return { ...note, first_name: note.first_name ?? null, last_name: note.last_name ?? null,
    email: note.email ?? null, mobile_number: note.mobile_number ?? null,
    summary: note.summary ?? null, session_info: note.session_info ?? null };
}

/** Normalize nullable optional columns and Postgres timestamptz offsets. */
export function parseStoredNote(row: unknown): ApprovedNote {
  if (typeof row !== "object" || row === null || Array.isArray(row)) return noteSchema.parse(row);
  const normalized = { ...row } as Record<string, unknown>;
  for (const field of ["first_name", "last_name", "email", "mobile_number", "summary", "session_info"]) {
    if (normalized[field] === null) delete normalized[field];
  }
  if (typeof normalized.approved_at === "string") {
    const date = new Date(normalized.approved_at);
    if (!Number.isNaN(date.getTime())) normalized.approved_at = date.toISOString();
  }
  return noteSchema.parse(normalized);
}
