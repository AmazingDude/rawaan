/**
 * Task 1 — Confirm action contracts and extract UI-safe boundaries.
 *
 * These tests lock down the exact client-visible shapes of BrainActionResult
 * and the extended BrainPatient roster summary.  They were written RED first
 * (before the implementation) and must remain the merge gate for Task 1.
 *
 * Rules in play:
 *  - No import from lib/brain, lib/llm, or lib/notes inside a client component.
 *    These tests verify the SERVER ACTION boundary only — the client sees only
 *    BrainActionResult and BrainPatient.
 *  - Refusal and no-record paths must NOT reach the provider.
 *  - Safe action-level error maps to { ok: false, message: string }.
 *  - Roster counts and dates come from approved notes only.
 */

import { describe, expect, it } from "vitest";

import type {
  BrainActionResult,
  BrainPatient,
} from "@/app/actions";
import { queryPatientRecord } from "@/lib/actions/brain";
import type { LlmCompletionProvider } from "@/lib/llm/provider";
import type { ApprovedNote } from "@/lib/notes/schema";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeNote(overrides: Partial<ApprovedNote> = {}): ApprovedNote {
  return {
    id: "note-default",
    patient_id: "p-default",
    patient_display_name: "Default Patient",
    consultation_date: "2026-06-01",
    chief_complaint: "",
    history: [],
    symptoms: [],
    assessment_discussed: [],
    plan_discussed: [],
    medications_mentioned: [],
    follow_up: "",
    uncertainties: [],
    raw_transcript: "patient presented.",
    approval_status: "approved",
    approved_at: "2026-06-01T10:00:00.000Z",
    ...overrides,
  };
}

const explodingProvider: LlmCompletionProvider = {
  async complete() {
    throw new Error("provider must not be called on this path");
  },
};

// ---------------------------------------------------------------------------
// Section 1 — BrainActionResult shape contracts
//
// The Server Action wraps queryPatientRecord in a try/catch and maps results
// to { ok: true, response: BrainResponse } | { ok: false, message: string }.
// These tests verify the exact shapes the client component must handle.
// ---------------------------------------------------------------------------

describe("BrainActionResult shape contracts", () => {
  it("supported: ok true with answer and sources array", async () => {
    const provider: LlmCompletionProvider = {
      async complete() {
        return JSON.stringify({
          answer: "Chest pain was documented on exertion.",
          cited_note_ids: ["note-cp"],
        });
      },
    };

    const response = await queryPatientRecord({
      patientId: "p1",
      question: "Has this patient mentioned chest pain?",
      notes: [
        makeNote({
          id: "note-cp",
          patient_id: "p1",
          symptoms: ["chest pain"],
          raw_transcript: "Patient reported chest pain climbing stairs.",
          consultation_date: "2026-07-15",
        }),
      ],
      provider,
    });

    // This is the exact shape the client must render for the supported branch.
    const actionResult: BrainActionResult = { ok: true, response };
    expect(actionResult).toMatchObject({
      ok: true,
      response: {
        status: "supported",
        answer: expect.any(String),
        sources: expect.arrayContaining([
          { noteId: "note-cp", consultationDate: "2026-07-15" },
        ]),
      },
    });
  });

  it("no_supporting_record: ok true with status and message", async () => {
    const response = await queryPatientRecord({
      patientId: "p1",
      question: "What was her blood pressure last month?",
      notes: [
        makeNote({
          patient_id: "p1",
          symptoms: ["knee swelling"],
          raw_transcript: "Patient presented with knee swelling.",
        }),
      ],
      provider: explodingProvider,
    });

    const actionResult: BrainActionResult = { ok: true, response };
    expect(actionResult).toEqual({
      ok: true,
      response: {
        status: "no_supporting_record",
        reason: "no_relevant_evidence",
        message: "No record of that for this patient.",
      },
    });
  });

  it("refused: ok true with status, reason, and exact safety message", async () => {
    const response = await queryPatientRecord({
      patientId: "p1",
      question: "What medication should we prescribe?",
      notes: [makeNote({ patient_id: "p1" })],
      provider: explodingProvider,
    });

    const actionResult: BrainActionResult = { ok: true, response };
    expect(actionResult).toEqual({
      ok: true,
      response: {
        status: "refused",
        reason: "treatment_or_medication",
        message:
          "This tool only retrieves documented patient history and does not provide general medical or treatment advice.",
      },
    });
  });

  it("refused: general_medical reason is a distinct render state", async () => {
    const response = await queryPatientRecord({
      patientId: "p1",
      question: "What is the standard treatment for hypertension?",
      notes: [makeNote({ patient_id: "p1" })],
      provider: explodingProvider,
    });

    const actionResult: BrainActionResult = { ok: true, response };
    expect(actionResult).toMatchObject({
      ok: true,
      response: {
        status: "refused",
        reason: "general_medical",
      },
    });
  });

  it("action-level error: ok false with a safe non-technical message", () => {
    // The Server Action catch block maps all thrown errors to this exact shape.
    // The client must treat { ok: false } as a safe generic error — it must not
    // receive stack traces, provider messages, or configuration details.
    const safeError: BrainActionResult = {
      ok: false,
      message: "The Brain could not answer right now. Try again.",
    };

    expect(safeError.ok).toBe(false);
    if (!safeError.ok) {
      // TypeScript narrowing: message must be a plain string.
      const msg: string = safeError.message;
      expect(msg).toMatch(/try again/i);
      // Must NOT leak provider or config info.
      expect(msg).not.toMatch(/groq|api[_ ]key|provider|llm|model/i);
    }
  });
});

// ---------------------------------------------------------------------------
// Section 2 — Refusal and no-record paths are provider-free
//
// These tests prove the provider is never invoked on the two paths the client
// renders without an answer.  This is both a grounding requirement and a cost
// guard for the free-tier provider.
// ---------------------------------------------------------------------------

describe("provider isolation on non-answer paths", () => {
  it("treatment refusal does not invoke the provider", async () => {
    let providerCalled = false;
    const trackingProvider: LlmCompletionProvider = {
      async complete() {
        providerCalled = true;
        return "{}";
      },
    };

    await queryPatientRecord({
      patientId: "p1",
      question: "Which antibiotic should we prescribe?",
      notes: [makeNote({ patient_id: "p1" })],
      provider: trackingProvider,
    });

    expect(providerCalled).toBe(false);
  });

  it("no-record result does not invoke the provider", async () => {
    let providerCalled = false;
    const trackingProvider: LlmCompletionProvider = {
      async complete() {
        providerCalled = true;
        return "{}";
      },
    };

    await queryPatientRecord({
      patientId: "p1",
      question: "Did the patient report fever last week?",
      notes: [
        makeNote({
          patient_id: "p1",
          symptoms: ["knee pain"],
          raw_transcript: "Patient presented with knee pain.",
        }),
      ],
      provider: trackingProvider,
    });

    expect(providerCalled).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Section 3 — BrainPatient roster summary derivation
//
// listBrainPatientsAction must return, per distinct patient_id:
//   - patientId
//   - displayName
//   - approvedNoteCount  (number of approved notes for this patient)
//   - mostRecentConsultationDate  (YYYY-MM-DD of the latest consultation_date)
//
// This is a PURE DERIVATION from approved notes.  The tests below verify the
// contract against a pure helper so the logic is testable without touching the
// JSON filesystem or the Server Action boundary.
//
// The helper `deriveRosterSummary` is the function we are about to write in
// app/actions.ts or a co-located server-only helper.  These tests define its
// exact shape and will fail RED until the implementation exists.
// ---------------------------------------------------------------------------

import { deriveRosterSummary } from "@/lib/actions/roster";

describe("deriveRosterSummary — roster derivation from approved notes", () => {
  const notes: ApprovedNote[] = [
    makeNote({
      id: "n1",
      patient_id: "patient-a",
      patient_display_name: "Amina Khan",
      consultation_date: "2026-06-01",
    }),
    makeNote({
      id: "n2",
      patient_id: "patient-a",
      patient_display_name: "Amina Khan",
      consultation_date: "2026-07-20",
    }),
    makeNote({
      id: "n3",
      patient_id: "patient-b",
      patient_display_name: "Bilal Raza",
      consultation_date: "2026-05-10",
    }),
    makeNote({
      id: "n4",
      patient_id: "patient-c",
      patient_display_name: "Sara Malik",
      consultation_date: "2026-08-01",
    }),
  ];

  it("returns one entry per distinct patient", () => {
    const result = deriveRosterSummary(notes);
    expect(result).toHaveLength(3);
  });

  it("counts approved notes correctly per patient", () => {
    const result = deriveRosterSummary(notes);
    const aminaRow = result.find((r) => r.patientId === "patient-a");
    expect(aminaRow?.approvedNoteCount).toBe(2);

    const bilalRow = result.find((r) => r.patientId === "patient-b");
    expect(bilalRow?.approvedNoteCount).toBe(1);
  });

  it("picks the most recent consultation date per patient", () => {
    const result = deriveRosterSummary(notes);
    const aminaRow = result.find((r) => r.patientId === "patient-a");
    // patient-a has notes on 2026-06-01 and 2026-07-20; latest is 2026-07-20
    expect(aminaRow?.mostRecentConsultationDate).toBe("2026-07-20");

    const saraRow = result.find((r) => r.patientId === "patient-c");
    expect(saraRow?.mostRecentConsultationDate).toBe("2026-08-01");
  });

  it("preserves displayName from the first seen note for that patient", () => {
    const result = deriveRosterSummary(notes);
    const aminaRow = result.find((r) => r.patientId === "patient-a");
    expect(aminaRow?.displayName).toBe("Amina Khan");
  });

  it("returns an empty array when there are no notes", () => {
    expect(deriveRosterSummary([])).toEqual([]);
  });

  it("single note produces count 1 and its own consultation date", () => {
    const result = deriveRosterSummary([
      makeNote({
        id: "only-note",
        patient_id: "solo",
        patient_display_name: "Solo Patient",
        consultation_date: "2026-08-15",
      }),
    ]);
    expect(result).toEqual([
      {
        patientId: "solo",
        displayName: "Solo Patient",
        approvedNoteCount: 1,
        mostRecentConsultationDate: "2026-08-15",
      },
    ]);
  });
});

// ---------------------------------------------------------------------------
// Section 4 — Extended BrainPatient type shape
//
// The plan extends BrainPatient to carry roster summary fields so that
// listBrainPatientsAction can return them.  These compile-time checks verify
// the exported type has the required shape.
// ---------------------------------------------------------------------------

describe("BrainPatient type carries roster summary fields", () => {
  it("BrainPatient has patientId, displayName, approvedNoteCount, mostRecentConsultationDate", () => {
    // This test will fail to compile until BrainPatient is extended.
    const sample: BrainPatient = {
      patientId: "p1",
      displayName: "Test Patient",
      approvedNoteCount: 3,
      mostRecentConsultationDate: "2026-08-01",
    };
    expect(sample.approvedNoteCount).toBe(3);
    expect(sample.mostRecentConsultationDate).toBe("2026-08-01");
  });
});
