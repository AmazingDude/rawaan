import { rankNotes as defaultRankNotes } from "@/lib/brain/ranking";
import type { RetrievalResult } from "@/lib/brain/types";
import type { ApprovedNote } from "@/lib/notes/schema";

type RankFn = typeof defaultRankNotes;

export function retrieveApprovedEvidence(input: {
  patientId: string;
  question: string;
  notes: ApprovedNote[];
  rankNotes?: RankFn;
}): RetrievalResult {
  const { patientId, question, notes, rankNotes = defaultRankNotes } = input;

  const patientScoped = notes.filter((note) => note.patient_id === patientId);
  if (patientScoped.length === 0) {
    return {
      kind: "no_supporting_record",
      patientId,
      message: "No record of that for this patient.",
      reason: "no_approved_notes",
    };
  }

  const approvedOnly = patientScoped.filter(
    (note) => note.approval_status === "approved",
  );
  if (approvedOnly.length === 0) {
    return {
      kind: "no_supporting_record",
      patientId,
      message: "No record of that for this patient.",
      reason: "no_approved_notes",
    };
  }

  const evidence = rankNotes(approvedOnly, question);
  if (evidence.length === 0) {
    return {
      kind: "no_supporting_record",
      patientId,
      message: "No record of that for this patient.",
      reason: "no_relevant_evidence",
    };
  }

  return { kind: "evidence", patientId, question, evidence };
}
