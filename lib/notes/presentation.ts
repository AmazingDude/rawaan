import type { ApprovedNote, NoteDraft } from "@/lib/notes/schema";

function documented(value: string, missingText: string): string {
  return value.trim() || missingText;
}

function documentedList(values: string[], missingText: string): string {
  return values.length > 0 ? values.map((value) => `• ${value}`).join("\n") : `• ${missingText}`;
}

export function formatClinicalNoteText(
  note: NoteDraft | ApprovedNote,
  language: string,
): string {
  const missingText = language.toLowerCase().startsWith("urdu")
    ? "دستاویز میں درج نہیں"
    : "Not documented";
  return `RAWAAN CLINICAL ENCOUNTER RECORD
Patient: ${note.patient_display_name}
Date: ${note.consultation_date}
Language: ${language}
Status: ${note.approval_status.toUpperCase()}

SUMMARY:
${documented(note.summary ?? "", missingText)}

CHIEF COMPLAINT:
${documented(note.chief_complaint, missingText)}

HISTORY:
${documentedList(note.history, missingText)}

SYMPTOMS:
${documentedList(note.symptoms, missingText)}

ASSESSMENT DISCUSSED:
${documentedList(note.assessment_discussed, missingText)}

PLAN DISCUSSED:
${documentedList(note.plan_discussed, missingText)}

MEDICATIONS MENTIONED:
${documentedList(note.medications_mentioned, missingText)}

FOLLOW-UP DISCUSSED:
${documented(note.follow_up, missingText)}

UNCERTAINTIES / NOTES FOR REVIEW:
${documentedList(note.uncertainties, missingText)}

TRANSCRIPT PROVENANCE:
${note.raw_transcript}
`;
}
