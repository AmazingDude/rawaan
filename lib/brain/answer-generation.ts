import type { BrainResponse, RetrievalResult } from "@/lib/brain/types";

type RetrievedEvidence = Extract<RetrievalResult, { kind: "evidence" }>;

export function generateGroundedAnswer(evidence: RetrievedEvidence): BrainResponse {
  const excerpts: string[] = [];
  const citedDates = new Map<string, string>();

  for (const note of evidence.evidence) {
    for (const excerpt of note.excerpts) {
      if (!excerpt.trim()) continue;
      excerpts.push(excerpt);
      citedDates.set(note.noteId, note.consultationDate);
    }
  }

  if (excerpts.length === 0) {
    return {
      status: "no_supporting_record",
      reason: "no_relevant_evidence",
      message: "No record of that for this patient.",
    };
  }

  return {
    status: "supported",
    answer: excerpts.join("\n"),
    sources: [...citedDates].map(([noteId, consultationDate]) => ({
      noteId,
      consultationDate,
    })),
  };
}
