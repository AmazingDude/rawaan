import { describe, expect, it } from "vitest";

import { queryPatientRecord } from "@/lib/actions/brain";
import type { LlmCompletionProvider } from "@/lib/llm/provider";
import type { ApprovedNote } from "@/lib/notes/schema";

const patientId = "fictional-ada-rahman";
const otherPatientId = "fictional-sami-aziz";

function makeNote(overrides: Partial<ApprovedNote>): ApprovedNote {
  return {
    id: "ada-headache-2026-04-10",
    patient_id: patientId,
    patient_display_name: "Fictional Ada Rahman",
    consultation_date: "2026-04-10",
    chief_complaint: "Recurring headaches.",
    history: ["Recurring headaches after long workdays."],
    symptoms: ["recurring headaches"],
    assessment_discussed: ["Headaches were documented."],
    plan_discussed: ["A symptom diary was discussed."],
    medications_mentioned: [],
    follow_up: "Follow up at a later fictional visit.",
    uncertainties: [],
    raw_transcript:
      "The fictional patient reported recurring headaches after long workdays. A symptom diary was discussed.",
    approval_status: "approved",
    approved_at: "2026-04-10T10:00:00.000Z",
    ...overrides,
  };
}

const patientNotes = [
  makeNote({}),
  makeNote({
    id: "other-patient-migraine-2026-05-20",
    patient_id: otherPatientId,
    patient_display_name: "Fictional Sami Aziz",
    consultation_date: "2026-05-20",
    chief_complaint: "Migraines with aura.",
    history: ["Migraines with aura started last month."],
    symptoms: ["migraines with aura"],
    assessment_discussed: ["Migraines with aura were documented."],
    plan_discussed: ["A symptom diary was discussed."],
    raw_transcript:
      "The fictional patient reported migraines with aura during the past month.",
    approved_at: "2026-05-20T10:00:00.000Z",
  }),
];

const explodingProvider: LlmCompletionProvider = {
  async complete() {
    throw new Error("provider must not be called");
  },
};

function supportingProvider(
  answer: string,
  citedNoteId: string,
): LlmCompletionProvider {
  return {
    async complete() {
      return JSON.stringify({ answer, cited_note_ids: [citedNoteId] });
    },
  };
}

describe("Brain adversarial integration cases", () => {
  it("supports a prior documented symptom with its exact cited note date", async () => {
    const result = await queryPatientRecord({
      patientId,
      question: "Has Fictional Ada Rahman reported recurring headaches?",
      notes: patientNotes,
      provider: supportingProvider(
        "Yes, recurring headaches were documented.",
        "ada-headache-2026-04-10",
      ),
    });

    expect(result).toEqual({
      status: "supported",
      answer: "Yes, recurring headaches were documented.",
      sources: [
        {
          noteId: "ada-headache-2026-04-10",
          consultationDate: "2026-04-10",
        },
      ],
    });
  });

  it("returns no_supporting_record for an unrecorded vital sign", async () => {
    const result = await queryPatientRecord({
      patientId,
      question: "What was the blood pressure?",
      notes: patientNotes,
      provider: explodingProvider,
    });

    expect(result).toMatchObject({
      status: "no_supporting_record",
      reason: "no_relevant_evidence",
      message: "No record of that for this patient.",
    });
  });

  it("returns no_supporting_record for an unrecorded condition", async () => {
    const result = await queryPatientRecord({
      patientId,
      question: "Has the patient been diagnosed with diabetes?",
      notes: patientNotes,
      provider: explodingProvider,
    });

    expect(result).toMatchObject({
      status: "no_supporting_record",
      reason: "no_relevant_evidence",
      message: "No record of that for this patient.",
    });
  });

  it("refuses a medication or treatment request", async () => {
    const result = await queryPatientRecord({
      patientId,
      question: "What medication should we prescribe?",
      notes: patientNotes,
      provider: explodingProvider,
    });

    expect(result).toMatchObject({
      status: "refused",
      reason: "treatment_or_medication",
    });
  });

  it("does not leak other-patient note IDs when that patient has the only matching record", async () => {
    const otherPatientNoteId = "other-patient-migraine-2026-05-20";
    const result = await queryPatientRecord({
      patientId,
      question: "Has the patient reported migraines with aura?",
      notes: patientNotes,
      provider: explodingProvider,
    });

    expect(result).toMatchObject({
      status: "no_supporting_record",
      reason: "no_relevant_evidence",
    });
    expect(JSON.stringify(result)).not.toContain(otherPatientNoteId);
  });

  it("refuses general medical knowledge even while a patient record is open", async () => {
    const result = await queryPatientRecord({
      patientId,
      question: "What causes migraines?",
      notes: patientNotes,
      provider: explodingProvider,
    });

    expect(result).toMatchObject({
      status: "refused",
      reason: "general_medical",
    });
  });
});
