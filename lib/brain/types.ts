export type QuerySafetyResult =
  | { kind: "record_query"; normalizedQuestion: string }
  | {
      kind: "refused";
      reason: "general_medical" | "treatment_or_medication";
      message: "This tool only retrieves documented patient history and does not provide general medical or treatment advice.";
    };

export type EvidenceNote = {
  noteId: string;
  patientId: string;
  consultationDate: string;
  excerpts: string[];
  relevanceScore: number;
};

export type RetrievalResult =
  | {
      kind: "evidence";
      patientId: string;
      question: string;
      evidence: EvidenceNote[];
    }
  | {
      kind: "no_supporting_record";
      patientId: string;
      message: "No record of that for this patient.";
      reason: "no_approved_notes" | "no_relevant_evidence";
    };

export type BrainResponse =
  | {
      status: "supported";
      answer: string;
      sources: Array<{ noteId: string; consultationDate: string }>;
    }
  | {
      status: "no_supporting_record";
      message: "No record of that for this patient.";
      reason: "no_approved_notes" | "no_relevant_evidence";
    }
  | {
      status: "refused";
      message: "This tool only retrieves documented patient history and does not provide general medical or treatment advice.";
      reason: "general_medical" | "treatment_or_medication";
    };
