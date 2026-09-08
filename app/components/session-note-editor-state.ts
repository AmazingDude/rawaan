import type { ApprovedNote, NoteDraft } from "@/lib/notes/schema";

export const noteListFields = [
  "history",
  "symptoms",
  "assessment_discussed",
  "plan_discussed",
  "medications_mentioned",
  "uncertainties",
] as const;

export type NoteListField = (typeof noteListFields)[number];
export type NoteEditorText = Record<NoteListField, string>;

export function noteEditorTextFrom(note: NoteDraft | ApprovedNote): NoteEditorText {
  return {
    history: note.history.join("\n"),
    symptoms: note.symptoms.join("\n"),
    assessment_discussed: note.assessment_discussed.join("\n"),
    plan_discussed: note.plan_discussed.join("\n"),
    medications_mentioned: note.medications_mentioned.join("\n"),
    uncertainties: note.uncertainties.join("\n"),
  };
}

export function noteListFromText(value: string): string[] {
  return value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
}
