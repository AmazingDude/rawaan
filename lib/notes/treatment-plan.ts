import type { ApprovedNote, NoteDraft } from "@/lib/notes/schema";

export type TreatmentPlanField = {
  label: string;
  values: string[];
};

export type TreatmentPlanProjection = {
  consultationDate: string;
  hasRecordedPlan: boolean;
  sourceNoteId: string | null;
  fields: TreatmentPlanField[];
};

export function projectTreatmentPlan(note: NoteDraft | ApprovedNote): TreatmentPlanProjection {
  const fields = [
    { label: "Assessment discussed", values: note.assessment_discussed },
    { label: "Plan / next steps discussed", values: note.plan_discussed },
    { label: "Medications mentioned", values: note.medications_mentioned },
    { label: "Follow-up discussed", values: note.follow_up ? [note.follow_up] : [] },
  ].map((field) => ({
    label: field.label,
    values: field.values.filter((value) => value.trim().length > 0),
  }));

  return {
    consultationDate: note.consultation_date,
    hasRecordedPlan: fields[1].values.length > 0 || fields[3].values.length > 0,
    sourceNoteId: "id" in note ? note.id : null,
    fields,
  };
}
