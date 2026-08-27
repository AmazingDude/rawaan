import { describe, expect, it } from "vitest";
import { rankNotes } from "@/lib/brain/ranking";
import { retrieveApprovedEvidence } from "@/lib/brain/retrieval";
import type { ApprovedNote } from "@/lib/notes/schema";

function makeNote(overrides: Partial<ApprovedNote> = {}): ApprovedNote {
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
    raw_transcript: "Patient attended a follow-up consultation.",
    approval_status: "approved",
    approved_at: "2026-06-01T10:00:00.000Z",
    ...overrides,
  };
}

describe("retrieveApprovedEvidence", () => {
  it("shows the ranker only the selected patient's notes, proving pre-ranking isolation", () => {
    const seen: string[] = [];
    const rankSpy = (notes: ApprovedNote[]) => {
      seen.push(...notes.map((note) => note.id));
      return [];
    };

    retrieveApprovedEvidence({
      patientId: "p1",
      question: "chest pain?",
      notes: [
        makeNote({ id: "a", patient_id: "p1" }),
        makeNote({ id: "b", patient_id: "p2" }),
      ],
      rankNotes: rankSpy,
    });

    expect(seen).toEqual(["a"]);
  });

  it("never lets a draft reach the ranker or the evidence output", () => {
    const draft = {
      ...makeNote({ id: "d" }),
      approval_status: "draft",
    } as unknown as ApprovedNote;
    const seen: string[] = [];

    const result = retrieveApprovedEvidence({
      patientId: "p1",
      question: "q",
      notes: [draft],
      rankNotes: (notes) => {
        seen.push(...notes.map((note) => note.id));
        return [];
      },
    });

    expect(seen).not.toContain("d");
    expect(result).toMatchObject({
      kind: "no_supporting_record",
      reason: "no_approved_notes",
    });
  });

  it("returns no_approved_notes when the patient has zero approved notes", () => {
    const result = retrieveApprovedEvidence({
      patientId: "pX",
      question: "q",
      notes: [],
      rankNotes,
    });

    expect(result).toMatchObject({
      kind: "no_supporting_record",
      reason: "no_approved_notes",
      message: "No record of that for this patient.",
    });
  });

  it("returns no_relevant_evidence when nothing clears the threshold", () => {
    const result = retrieveApprovedEvidence({
      patientId: "p1",
      question: "completely unrelated zebra question",
      notes: [makeNote({ symptoms: ["knee swelling"] })],
      rankNotes,
    });

    expect(result).toMatchObject({
      kind: "no_supporting_record",
      reason: "no_relevant_evidence",
    });
  });
});
