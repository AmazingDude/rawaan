import { describe, expect, it } from "vitest";

import { queryPatientRecord } from "@/lib/actions/brain";
import type { ApprovedNote } from "@/lib/notes/schema";

function makeNote(overrides: Partial<ApprovedNote>): ApprovedNote {
  return {
    id: "note-1",
    patient_id: "p1",
    patient_display_name: "Amina Khan",
    consultation_date: "2026-06-01",
    chief_complaint: "",
    history: [],
    symptoms: [],
    assessment_discussed: [],
    plan_discussed: [],
    medications_mentioned: [],
    follow_up: "",
    uncertainties: [],
    raw_transcript: "",
    approval_status: "approved",
    approved_at: "2026-06-01T10:00:00.000Z",
    ...overrides,
  };
}

describe("queryPatientRecord", () => {
  it("refuses treatment requests before retrieval", async () => {
    const result = await queryPatientRecord({
      patientId: "p1",
      question: "What medication should we prescribe?",
      notes: [makeNote({ symptoms: ["chest pain"] })],
    });

    expect(result).toEqual({
      status: "refused",
      reason: "treatment_or_medication",
      message:
        "This tool only retrieves documented patient history and does not provide general medical or treatment advice.",
    });
  });

  it("returns no_supporting_record for unrecorded questions", async () => {
    const result = await queryPatientRecord({
      patientId: "p1",
      question: "What was her blood pressure in March?",
      notes: [
        makeNote({
          symptoms: ["knee swelling"],
          raw_transcript: "Patient reported knee swelling after a long walk.",
        }),
      ],
    });

    expect(result).toEqual({
      status: "no_supporting_record",
      reason: "no_relevant_evidence",
      message: "No record of that for this patient.",
    });
  });

  it("returns the retrieved excerpts verbatim with their source dates", async () => {
    const result = await queryPatientRecord({
      patientId: "p1",
      question: "Has this patient mentioned chest pain before?",
      notes: [
        makeNote({
          id: "note-chest",
          symptoms: ["chest pain"],
          raw_transcript: "Patient reported chest pain when climbing stairs.",
        }),
      ],
    });

    expect(result).toEqual({
      status: "supported",
      answer: "Symptoms: chest pain\nPatient reported chest pain when climbing stairs.",
      sources: [{ noteId: "note-chest", consultationDate: "2026-06-01" }],
    });
  });
});
