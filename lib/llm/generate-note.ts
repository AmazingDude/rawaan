import { z } from "zod";

import { noteDraftSchema, type NoteDraft } from "@/lib/notes/schema";

export const generateNoteInputSchema = z.object({
  patient_id: z.string().trim().min(1),
  patient_display_name: z.string().trim().min(1),
  consultation_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
  transcript: z.string().trim().min(1),
});

type GenerateNoteInput = z.infer<typeof generateNoteInputSchema>;

export type GeneratedDraft = {
  draft: NoteDraft;
  source: "local-demo";
};

type LabeledField =
  | "chief_complaint"
  | "history"
  | "symptoms"
  | "assessment_discussed"
  | "plan_discussed"
  | "medications_mentioned"
  | "follow_up"
  | "uncertainties";

const labels: Record<LabeledField, string> = {
  chief_complaint: "chief complaint",
  history: "history",
  symptoms: "symptoms",
  assessment_discussed: "assessment discussed",
  plan_discussed: "plan discussed",
  medications_mentioned: "medications mentioned",
  follow_up: "follow up",
  uncertainties: "uncertainties",
};

function readLabeledValue(lines: string[], label: string): string | undefined {
  const prefix = `${label.toLowerCase()}:`;
  const matchingLine = lines.find((line) =>
    line.toLowerCase().startsWith(prefix),
  );

  return matchingLine?.slice(prefix.length).trim();
}

function listFromValue(value: string | undefined): string[] {
  if (
    value === undefined ||
    value.length === 0 ||
    /^(none|none mentioned|not mentioned|n\/a)$/i.test(value)
  ) {
    return [];
  }

  return value
    .split(/\s*;\s*/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function createLocalDemoDraft(input: GenerateNoteInput): NoteDraft {
  const transcript = input.transcript.trim();
  const lines = transcript.split(/\r?\n/).map((line) => line.trim());
  const values = Object.fromEntries(
    (Object.entries(labels) as [LabeledField, string][]).map(([field, label]) => [
      field,
      readLabeledValue(lines, label),
    ]),
  ) as Record<LabeledField, string | undefined>;
  const hasStructuredLabels = Object.values(values).some(
    (value) => value !== undefined,
  );

  return noteDraftSchema.parse({
    patient_id: input.patient_id,
    patient_display_name: input.patient_display_name,
    consultation_date: input.consultation_date,
    chief_complaint: values.chief_complaint ?? "",
    history: hasStructuredLabels
      ? listFromValue(values.history)
      : [transcript],
    symptoms: listFromValue(values.symptoms),
    assessment_discussed: listFromValue(values.assessment_discussed),
    plan_discussed: listFromValue(values.plan_discussed),
    medications_mentioned: listFromValue(values.medications_mentioned),
    follow_up: values.follow_up ?? "",
    uncertainties: listFromValue(values.uncertainties),
    approval_status: "draft",
    raw_transcript: transcript,
  });
}

/**
 * Create a reviewable note draft. Until a configured provider is added, this
 * deliberately uses the local parser and identifies its source as local-demo.
 * It never represents this fallback as an LLM result.
 */
export async function generateNoteDraft(
  candidate: unknown,
): Promise<GeneratedDraft> {
  const input = generateNoteInputSchema.parse(candidate);

  return {
    draft: createLocalDemoDraft(input),
    source: "local-demo",
  };
}
