import { describe, expect, it } from "vitest";

import type { LlmCompletionProvider } from "@/lib/llm/provider";
import { translateNoteToUrdu } from "@/lib/llm/translate-note-urdu";
import type { NoteDraft } from "@/lib/notes/schema";

const mockNote: NoteDraft = {
  patient_id: "patient-aashir-aslam-001",
  patient_display_name: "Fictional Patient",
  consultation_date: "2026-08-28",
  chief_complaint: "Abdominal pain present for several days",
  summary: "The patient presented with abdominal pain.",
  history: ["Abdominal pain present for several days"],
  symptoms: ["Abdominal pain", "Fever"],
  assessment_discussed: ["Evaluate for abdominal cause"],
  plan_discussed: ["Rest and hydration"],
  medications_mentioned: ["Paracetamol"],
  follow_up: "Follow up in 2 weeks",
  uncertainties: ["Specific location of pain was not specified"],
  approval_status: "draft",
  raw_transcript: "Patient reports abdominal pain and fever.",
};

function completeTranslation(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    summary: "\u062e\u0644\u0627\u0635\u06c1",
    chief_complaint: "\u062f\u0631\u062f",
    history: ["\u062a\u0627\u0631\u06cc\u062e"],
    symptoms: ["\u062f\u0631\u062f", "\u0628\u062e\u0627\u0631"],
    assessment_discussed: ["\u062c\u0627\u0626\u0632\u06c1"],
    plan_discussed: ["\u0622\u0631\u0627\u0645"],
    medications_mentioned: ["\u067e\u06cc\u0631\u0627\u0633\u06cc\u0679\u0627\u0645\u0648\u0644"],
    follow_up: "\u062f\u0648\u0628\u0627\u0631\u06c1 \u0645\u0639\u0627\u0626\u0646\u06c1",
    uncertainties: ["\u0648\u0627\u0636\u062d \u0646\u06c1\u06cc\u06ba"],
    ...overrides,
  });
}

describe("translateNoteToUrdu", () => {
  it("returns an explicit unavailable result and leaves content unchanged without a provider", async () => {
    const result = await translateNoteToUrdu(mockNote);

    expect(result.status).toBe("unavailable");
    expect(result.note).toEqual(mockNote);
    if (result.status === "unavailable") {
      expect(result.message).toMatch(/original note was left unchanged/i);
    }
  });

  it("returns translated content when provider output preserves every field", async () => {
    const provider: LlmCompletionProvider = {
      async complete() {
        return completeTranslation();
      },
    };

    const result = await translateNoteToUrdu(mockNote, provider);

    expect(result.status).toBe("translated");
    if (result.status !== "translated") throw new Error("Expected translated result");
    expect(result.note.patient_display_name).toBe(mockNote.patient_display_name);
    expect(result.note.summary).toBe("\u062e\u0644\u0627\u0635\u06c1");
    expect(result.note.approval_status).toBe("draft");
  });

  it("preserves approved identifiers and status after a successful translation", async () => {
    const approvedNote = {
      ...mockNote,
      id: "note-123",
      approval_status: "approved" as const,
      approved_at: "2026-08-28T12:00:00.000Z",
    };
    const result = await translateNoteToUrdu(approvedNote, {
      async complete() {
        return completeTranslation();
      },
    });

    expect(result.status).toBe("translated");
    if (result.status !== "translated") throw new Error("Expected translated result");
    expect(result.note.id).toBe("note-123");
    expect(result.note.approval_status).toBe("approved");
    expect(result.note.approved_at).toBe("2026-08-28T12:00:00.000Z");
  });

  it("rejects provider output that fills previously empty clinical fields", async () => {
    const incompleteNote: NoteDraft = {
      ...mockNote,
      chief_complaint: "",
      summary: "",
      follow_up: "",
      symptoms: [],
      plan_discussed: [],
      uncertainties: [],
    };
    const result = await translateNoteToUrdu(incompleteNote, {
      async complete() {
        return completeTranslation({
          summary: "\u062a\u0641\u0635\u06cc\u0644\u06cc \u0637\u0628\u06cc \u062c\u0627\u0626\u0632\u06c1",
          chief_complaint: "\u0637\u0628\u06cc \u0645\u0639\u0627\u0626\u0646\u06c1",
          symptoms: ["\u0628\u062e\u0627\u0631"],
          plan_discussed: ["\u0636\u0631\u0648\u0631\u062a \u06a9\u06d2 \u0645\u0637\u0627\u0628\u0642"],
          follow_up: "\u0636\u0631\u0648\u0631\u062a \u06a9\u06d2 \u0645\u0637\u0627\u0628\u0642",
          uncertainties: [],
        });
      },
    });

    expect(result.status).toBe("unavailable");
    expect(result.note).toEqual(incompleteNote);
  });

  it("keeps blank source fields exactly blank when provider returns whitespace", async () => {
    const blankFields: NoteDraft = {
      ...mockNote,
      chief_complaint: "",
      summary: "",
      follow_up: "",
    };
    const result = await translateNoteToUrdu(blankFields, {
      async complete() {
        return completeTranslation({
          chief_complaint: " ",
          summary: "   ",
          follow_up: "\t",
        });
      },
    });

    expect(result.status).toBe("translated");
    if (result.status !== "translated") throw new Error("Expected translated result");
    expect(result.note.chief_complaint).toBe("");
    expect(result.note.summary).toBe("");
    expect(result.note.follow_up).toBe("");
  });

  it("returns original content as unavailable when provider output is incomplete", async () => {
    const result = await translateNoteToUrdu(mockNote, {
      async complete() {
        return JSON.stringify({ summary: "\u062e\u0644\u0627\u0635\u06c1" });
      },
    });

    expect(result.status).toBe("unavailable");
    expect(result.note).toEqual(mockNote);
  });

  it("returns original content as unavailable when provider throws", async () => {
    const result = await translateNoteToUrdu(mockNote, {
      async complete() {
        throw new Error("provider unavailable");
      },
    });

    expect(result.status).toBe("unavailable");
    expect(result.note).toEqual(mockNote);
  });
});
