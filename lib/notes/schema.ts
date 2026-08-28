import { z } from "zod";

const requiredText = z.string().trim().min(1);
const noteDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

const noteContentSchema = z.object({
  patient_id: requiredText,
  patient_display_name: requiredText,
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  email: z.string().optional(),
  mobile_number: z.string().optional(),
  consultation_date: noteDate,
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
});

export const noteDraftSchema = noteContentSchema.extend({
  approval_status: z.literal("draft"),
});

export const noteSchema = noteContentSchema.extend({
  id: requiredText,
  approval_status: z.literal("approved"),
  approved_at: z.string().datetime(),
});

export type NoteDraft = z.infer<typeof noteDraftSchema>;
export type ApprovedNote = z.infer<typeof noteSchema>;
