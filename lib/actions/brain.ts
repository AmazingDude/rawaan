import { generateGroundedAnswer } from "@/lib/brain/answer-generation";
import { classifyQuerySafety } from "@/lib/brain/query-safety";
import { retrieveApprovedEvidence } from "@/lib/brain/retrieval";
import type { BrainResponse } from "@/lib/brain/types";
import type { ApprovedNote } from "@/lib/notes/schema";

type QueryPatientRecordInput = {
  patientId: string;
  question: string;
  notes?: ApprovedNote[];
};

export async function queryPatientRecord({
  patientId,
  question,
  notes = [],
}: QueryPatientRecordInput): Promise<BrainResponse> {
  const safety = classifyQuerySafety(question);
  if (safety.kind === "refused") {
    return {
      status: "refused",
      reason: safety.reason,
      message: safety.message,
    };
  }

  const retrieval = retrieveApprovedEvidence({
    patientId,
    question: safety.normalizedQuestion,
    notes,
  });
  if (retrieval.kind === "no_supporting_record") {
    return {
      status: "no_supporting_record",
      reason: retrieval.reason,
      message: retrieval.message,
    };
  }

  return generateGroundedAnswer(retrieval);
}
