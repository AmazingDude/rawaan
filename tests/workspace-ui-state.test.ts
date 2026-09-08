import { describe, expect, it } from "vitest";

import {
  formatSessionDate,
  formatSessionTime,
  localConsultationDate,
} from "@/app/components/session-date";
import {
  restoreWorkspaceSnapshot,
  restorePendingSession,
  serializeWorkspaceSnapshot,
} from "@/app/components/workspace-draft-storage";
import { noteEditorTextFrom } from "@/app/components/session-note-editor-state";
import { formatClinicalNoteText } from "@/lib/notes/presentation";
import type { ApprovedNote, NoteDraft } from "@/lib/notes/schema";

const draft: NoteDraft = {
  approval_status: "draft",
  chief_complaint: "",
  assessment_discussed: [],
  consultation_date: "2026-10-06",
  follow_up: "",
  history: [],
  medications_mentioned: [],
  patient_display_name: "Client One",
  patient_id: "client-1",
  plan_discussed: [],
  raw_transcript: "Clinician-entered record.",
  summary: "",
  symptoms: [],
  uncertainties: [],
};

const approved: ApprovedNote = {
  ...draft,
  approval_status: "approved",
  approved_at: "2026-10-06T10:00:00.000Z",
  id: "note-1",
};

describe("workspace draft recovery", () => {
  it("retains an unassigned captured transcript and rejects malformed recovery state", () => {
    const pendingSession = {consultationDate: draft.consultation_date, sessionType: "summary", transcript: draft.raw_transcript, transcriptSource: "Clinician-entered session summary"};
    expect(restorePendingSession(JSON.stringify({pendingSession}))).toEqual(pendingSession);
    expect(restorePendingSession(JSON.stringify({pendingSession:{...pendingSession, transcript:""}}))).toBeNull();
    expect(restorePendingSession("invalid-json")).toBeNull();
    expect(restorePendingSession(serializeWorkspaceSnapshot(draft))).toBeNull();
  });
  it("upgrades a legacy unapproved draft with one stable token and retains raw editor text", () => {
    const editorText = {
      ...noteEditorTextFrom(draft),
      history: "  first line  \n\n second line",
    };
    const serialized = serializeWorkspaceSnapshot(draft, editorText);
    const restored = restoreWorkspaceSnapshot(serialized, () => "stable-token");

    expect(restored?.draft.approval_status).toBe("draft");
    expect((restored?.draft as NoteDraft).draft_id).toBe("stable-token");
    expect(restored?.editorText.history).toBe(editorText.history);
    expect(restoreWorkspaceSnapshot(serializeWorkspaceSnapshot(restored!.draft, restored!.editorText), () => "new-token")?.draft)
      .toEqual(restored?.draft);
  });

  it("does not change the identity or content of an approved record while restoring", () => {
    const restored = restoreWorkspaceSnapshot(JSON.stringify(approved), () => "must-not-be-used");
    expect(restored?.draft).toEqual(approved);
  });
});

describe("truthful note presentation", () => {
  it("shows missing fields as undocumented and does not imply clinical negatives", () => {
    const text = formatClinicalNoteText(draft, "English");
    expect(text.match(/Not documented/g)?.length).toBeGreaterThan(1);
    expect(text).not.toContain("No new pharmacological prescriptions");
    expect(text).not.toContain("Follow up as clinically indicated");
    expect(text).not.toContain("Patient ID:");
    expect(text).not.toContain(draft.patient_id);
    expect(text).toContain(draft.raw_transcript);
  });

  it("uses an Urdu equivalent for missing fields in Urdu exports", () => {
    const text = formatClinicalNoteText(draft, "Urdu (اردو)");
    expect(text).toContain("دستاویز میں درج نہیں");
    expect(text).not.toContain("Follow up as clinically indicated");
  });
});

describe("session timestamps", () => {
  it("labels UTC explicitly and reports missing or malformed values honestly", () => {
    expect(formatSessionTime("2026-10-06T17:18:00.000Z")).toBe("5:18 PM UTC");
    expect(formatSessionTime()).toBe("Time not recorded");
    expect(formatSessionTime("not-a-date")).toBe("Time not recorded");
    expect(formatSessionDate("2026-10-06")).toBe("October 6, 2026");
    expect(formatSessionDate("2026-99-06")).toBe("Date not recorded");
    expect(localConsultationDate(new Date(2026, 9, 6, 0, 15))).toBe("2026-10-06");
  });
});
