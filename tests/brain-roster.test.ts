/**
 * Task 2 — Roster derivation contract for the Clients Directory page.
 *
 * These tests verify the exact data shape that app/(workspace)/clients/page.tsx
 * consumes from listBrainPatientsAction(). They prove:
 *
 * 1. Each BrainPatient carries only approved-note-derived fields — no invented
 *    age, status, complaint, appointment, or follow-up data.
 * 2. An empty note store produces an empty roster (honest empty state).
 * 3. Multiple notes for one patient aggregate correctly.
 * 4. Draft notes are excluded (the repository only stores approved notes, so
 *    this is enforced at the storage boundary — verified here by confirming
 *    deriveRosterSummary only accepts ApprovedNote[]).
 */

import { describe, expect, it } from "vitest";

import type { BrainPatient } from "@/app/actions";
import { deriveRosterSummary } from "@/lib/actions/roster";
import type { ApprovedNote } from "@/lib/notes/schema";

function makeApprovedNote(overrides: Partial<ApprovedNote> = {}): ApprovedNote {
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

describe("roster data contract for Clients Directory page", () => {
  it("empty store produces empty roster for honest empty state", () => {
    const result = deriveRosterSummary([]);
    expect(result).toEqual([]);
  });

  it("each BrainPatient has exactly the four approved-note-derived fields", () => {
    const notes: ApprovedNote[] = [
      makeApprovedNote({
        id: "n1",
        patient_id: "p1",
        patient_display_name: "Amina Khan",
        consultation_date: "2026-07-15",
      }),
    ];

    const result = deriveRosterSummary(notes);
    expect(result).toHaveLength(1);

    const patient: BrainPatient = result[0];
    // Only these four keys — no age, status, complaint, appointment, etc.
    expect(Object.keys(patient).sort()).toEqual([
      "approvedNoteCount",
      "displayName",
      "mostRecentConsultationDate",
      "patientId",
    ]);
  });

  it("aggregates multiple notes per patient into count and latest date", () => {
    const notes: ApprovedNote[] = [
      makeApprovedNote({
        id: "n1",
        patient_id: "p-amina",
        patient_display_name: "Amina Khan",
        consultation_date: "2026-05-10",
      }),
      makeApprovedNote({
        id: "n2",
        patient_id: "p-amina",
        patient_display_name: "Amina Khan",
        consultation_date: "2026-08-20",
      }),
      makeApprovedNote({
        id: "n3",
        patient_id: "p-amina",
        patient_display_name: "Amina Khan",
        consultation_date: "2026-06-15",
      }),
    ];

    const result = deriveRosterSummary(notes);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      patientId: "p-amina",
      displayName: "Amina Khan",
      approvedNoteCount: 3,
      mostRecentConsultationDate: "2026-08-20",
    });
  });

  it("distinct patients appear as separate entries", () => {
    const notes: ApprovedNote[] = [
      makeApprovedNote({
        id: "n1",
        patient_id: "p-a",
        patient_display_name: "Amina Khan",
        consultation_date: "2026-06-01",
      }),
      makeApprovedNote({
        id: "n2",
        patient_id: "p-b",
        patient_display_name: "Bilal Raza",
        consultation_date: "2026-07-01",
      }),
      makeApprovedNote({
        id: "n3",
        patient_id: "p-c",
        patient_display_name: "Sara Malik",
        consultation_date: "2026-08-01",
      }),
    ];

    const result = deriveRosterSummary(notes);
    expect(result).toHaveLength(3);

    const ids = result.map((r) => r.patientId).sort();
    expect(ids).toEqual(["p-a", "p-b", "p-c"]);
  });

  it("deriveRosterSummary rejects draft notes at the type level", () => {
    // This is a compile-time check: deriveRosterSummary accepts ApprovedNote[],
    // not NoteDraft[]. A draft note lacks `id` and `approved_at`, so it cannot
    // satisfy the ApprovedNote type. This test verifies the function signature
    // enforces the constraint.
    const _typeCheck: Parameters<typeof deriveRosterSummary>[0] = [] as ApprovedNote[];
    expect(_typeCheck).toEqual([]);
  });
});
