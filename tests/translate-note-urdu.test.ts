import { describe, expect, it } from "vitest";

import type { LlmCompletionProvider } from "@/lib/llm/provider";
import { translateNoteToUrdu } from "@/lib/llm/translate-note-urdu";
import type { NoteDraft } from "@/lib/notes/schema";

const mockNote: NoteDraft = {
  patient_id: "patient-aashir-aslam-001",
  patient_display_name: "Aashir Aslam",
  consultation_date: "2026-08-28",
  chief_complaint: "Abdominal pain present for several days",
  summary: "The patient presented with abdominal pain and generalized body pain.",
  history: ["Abdominal pain present for several days", "Pain is exacerbated by movement"],
  symptoms: ["Abdominal pain", "Dull pain", "Sharp pain", "Generalized body pain"],
  assessment_discussed: ["Evaluate for acute abdominal etiology"],
  plan_discussed: ["Rest and hydration", "Follow up in 2 weeks"],
  medications_mentioned: ["Metformin", "Panadol"],
  follow_up: "Follow up in 2 weeks",
  uncertainties: ["Specific location of abdominal pain is not specified"],
  approval_status: "draft",
  raw_transcript: "Patient reports abdominal pain and fever.",
};

describe("translateNoteToUrdu", () => {
  it("translates note to Urdu using local fallback dictionary when no provider is given", async () => {
    const urduNote = await translateNoteToUrdu(mockNote);

    expect(urduNote.patient_display_name).toBe("Aashir Aslam");
    expect(urduNote.summary).toContain("مریض Aashir Aslam");
    expect(urduNote.symptoms.some((s) => s.includes("درد"))).toBe(true);
    expect(urduNote.medications_mentioned.some((m) => m.includes("میٹفارمین") || m.includes("پیناڈول"))).toBe(true);
    expect(urduNote.follow_up).toContain("دو ہفتوں بعد");
  });

  it("uses LLM provider when available to translate note to Urdu", async () => {
    const mockProvider: LlmCompletionProvider = {
      async complete() {
        return JSON.stringify({
          summary: "مریض پیٹ کے شدید درد کی شکایت کے ساتھ آیا۔",
          chief_complaint: "پیٹ میں درد",
          history: ["درد پچھلے کچھ دنوں سے جاری ہے"],
          symptoms: ["پیٹ میں درد", "بخار"],
          assessment_discussed: ["طبی معائنہ اور ٹیسٹ تجویز کیے گئے"],
          plan_discussed: ["آرام اور مناسب خوراک"],
          medications_mentioned: ["میٹفارمین"],
          follow_up: "ایک ہفتے بعد دوبارہ معائنہ",
          uncertainties: [],
        });
      },
    };

    const urduNote = await translateNoteToUrdu(mockNote, mockProvider);

    expect(urduNote.summary).toBe("مریض پیٹ کے شدید درد کی شکایت کے ساتھ آیا۔");
    expect(urduNote.chief_complaint).toBe("پیٹ میں درد");
    expect(urduNote.symptoms).toEqual(["پیٹ میں درد", "بخار"]);
  });

  it("translates an approved note preserving approved status and id", async () => {
    const approvedNote = {
      ...mockNote,
      id: "note-123",
      approval_status: "approved" as const,
      approved_at: "2026-08-28T12:00:00.000Z",
    };

    const urduNote = await translateNoteToUrdu(approvedNote);

    expect(urduNote.id).toBe("note-123");
    expect(urduNote.approval_status).toBe("approved");
    expect(urduNote.approved_at).toBe("2026-08-28T12:00:00.000Z");
    expect(urduNote.symptoms.some((s) => s.includes("درد"))).toBe(true);
  });
});

