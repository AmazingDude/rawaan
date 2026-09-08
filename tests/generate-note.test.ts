import { describe, expect, it, vi } from "vitest";

import { generateNoteDraft, modifyNoteWithAi } from "@/lib/llm/generate-note";
import type { NoteDraft } from "@/lib/notes/schema";

const currentNote: NoteDraft = {
  patient_id: "patient-1",
  patient_display_name: "Fictional Patient",
  consultation_date: "2026-08-22",
  chief_complaint: "Headache",
  summary: "A headache was discussed.",
  history: ["First history detail", "Second history detail", "Third history detail"],
  symptoms: ["Light sensitivity", "Nausea", "Tiredness", "Blurred vision"],
  assessment_discussed: ["Clinician discussed possible triggers"],
  plan_discussed: ["Keep a symptom diary", "Return in two weeks"],
  medications_mentioned: ["Paracetamol was mentioned"],
  follow_up: "Return if symptoms increase",
  uncertainties: ["Duration was not clarified", "Severity was not discussed"],
  approval_status: "draft",
  raw_transcript: "The consultation transcript is retained here.",
};

describe("generateNoteDraft", () => {
  it("does not log clinical model output when structured generation fails", async () => {
    const logger = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const result = await generateNoteDraft({patient_id: currentNote.patient_id, patient_display_name: currentNote.patient_display_name, consultation_date: currentNote.consultation_date, transcript: currentNote.raw_transcript}, {
        complete: async () => "private-clinical-provider-response",
      });
      expect(result.source).toBe("local-demo");
      expect(logger).toHaveBeenCalledWith("[generateNoteDraft] Structured generation failed; using transcript-only fallback.");
      expect(JSON.stringify(logger.mock.calls)).not.toContain("private-clinical");
      expect(result.draft.raw_transcript).toBe(currentNote.raw_transcript);
    } finally { logger.mockRestore(); }
  });
  it("creates a schema-valid local-demo draft from explicit scripted transcript fields", async () => {
    const result = await generateNoteDraft({
      patient_id: "patient-amina-001",
      patient_display_name: "Amina Khan",
      consultation_date: "2026-08-22",
      transcript: `Chief complaint: Persistent headache
History: Headache for three days
Symptoms: Light sensitivity
Assessment discussed: Clinician discussed monitoring triggers
Plan discussed: Keep a symptom diary
Medications mentioned: None mentioned
Follow up: Return in two weeks
Uncertainties: Duration of each headache episode was not clarified`,
    });

    expect(result.source).toBe("local-demo");
    expect(result.draft.approval_status).toBe("draft");
    expect(result.draft.chief_complaint).toBe("Persistent headache");
    expect(result.draft.history).toEqual(["Headache for three days"]);
    expect(result.draft.medications_mentioned).toEqual([]);
    expect(result.draft.uncertainties).toEqual([
      "Duration of each headache episode was not clarified",
    ]);
  });

  it("does not infer unsupported clinical information from an unstructured transcript", async () => {
    const transcript = "The patient said they felt tired after work.";
    const result = await generateNoteDraft({
      patient_id: "patient-omar-002",
      patient_display_name: "Omar Ali",
      consultation_date: "2026-08-22",
      transcript,
    });

    expect(result.draft.history).toEqual([transcript]);
    expect(result.draft.assessment_discussed).toEqual([]);
    expect(result.draft.plan_discussed).toEqual([]);
    expect(result.draft.medications_mentioned).toEqual([]);
    expect(result.draft.uncertainties).toEqual([]);
  });

  it("never dumps an unstructured non-English transcript into clinical fields", async () => {
    const transcript = "मुझे सीने में दर्द है जो तीन हफ्तों से हो रहा है।";
    const result = await generateNoteDraft({
      patient_id: "patient-omar-002",
      patient_display_name: "Omar Ali",
      consultation_date: "2026-08-22",
      transcript,
    });

    expect(result.source).toBe("local-demo");
    expect(result.draft.history).toEqual([]);
    expect(result.draft.chief_complaint).toBe("");
    // Provenance is preserved verbatim in the transcript field.
    expect(result.draft.raw_transcript).toBe(transcript);
    // Missing summary content remains empty; provenance lives in raw_transcript.
    expect(result.draft.summary).toBe("");
  });

  it("does not invent a summary for an unstructured English transcript", async () => {
    const result = await generateNoteDraft({
      patient_id: "patient-omar-002",
      patient_display_name: "Omar Ali",
      consultation_date: "2026-08-22",
      transcript: "The patient said they felt tired after work.",
    });

    expect(result.draft.summary).toBe("");
    expect(result.draft.history).toEqual([
      "The patient said they felt tired after work.",
    ]);
  });

  it("keeps summary empty when structured fields have no summary or chief complaint", async () => {
    const result = await generateNoteDraft({
      patient_id: "patient-omar-002",
      patient_display_name: "Omar Ali",
      consultation_date: "2026-08-22",
      transcript: "Chief complaint:\nSymptoms: Light sensitivity",
    });

    expect(result.draft.summary).toBe("");
    expect(result.draft.chief_complaint).toBe("");
    expect(result.draft.symptoms).toEqual(["Light sensitivity"]);
  });

  it("parses provider JSON even when it includes a reasoning block and fences", async () => {
    const result = await generateNoteDraft(
      {
        patient_id: "patient-amina-001",
        patient_display_name: "Amina Khan",
        consultation_date: "2026-08-22",
        transcript: "मुझे सिर में दर्द है।",
      },
      {
        async complete() {
          return `<think>Analyzing the transcript...</think>
\`\`\`json
{
  "summary": "Headache consultation.",
  "chief_complaint": "Persistent headache",
  "history": ["Headache for three days"],
  "symptoms": ["Headache"],
  "assessment_discussed": ["Discussed triggers"],
  "plan_discussed": ["Keep a symptom diary"],
  "medications_mentioned": [],
  "follow_up": "Return in two weeks",
  "uncertainties": []
}
\`\`\``;
        },
      },
    );

    expect(result.source).toBe("groq");
    expect(result.draft.chief_complaint).toBe("Persistent headache");
    expect(result.draft.history).toEqual(["Headache for three days"]);
    expect(result.draft.plan_discussed).toEqual(["Keep a symptom diary"]);
  });

  it("preserves an empty provider summary instead of generating encounter text", async () => {
    const result = await generateNoteDraft({
      patient_id: "patient-1",
      patient_display_name: "Fictional Patient",
      consultation_date: "2026-08-22",
      transcript: "The patient mentioned a headache.",
    }, {
      async complete() {
        return JSON.stringify({
          summary: "",
          chief_complaint: "",
          history: [],
          symptoms: [],
          assessment_discussed: [],
          plan_discussed: [],
          medications_mentioned: [],
          follow_up: "",
          uncertainties: [],
        });
      },
    });

    expect(result.source).toBe("groq");
    expect(result.draft.summary).toBe("");
  });

  it("summarizes only recorded content and preserves every source field and uncertainty", async () => {
    const result = await modifyNoteWithAi(
      currentNote,
      "Summarize key clinical points",
    );

    expect(result.updatedNote.summary).toContain("Headache");
    expect(result.updatedNote.summary).toContain("Blurred vision");
    expect(result.updatedNote.summary).toContain("Third history detail");
    expect(result.updatedNote.summary).toContain("Severity was not discussed");
    expect(result.updatedNote.history).toEqual(currentNote.history);
    expect(result.updatedNote.symptoms).toEqual(currentNote.symptoms);
    expect(result.updatedNote.plan_discussed).toEqual(currentNote.plan_discussed);
    expect(result.updatedNote.uncertainties).toEqual(currentNote.uncertainties);
  });

  it("leaves an empty note empty when asked to summarize it", async () => {
    const emptyNote: NoteDraft = {
      ...currentNote,
      chief_complaint: "",
      summary: "",
      history: [],
      symptoms: [],
      assessment_discussed: [],
      plan_discussed: [],
      medications_mentioned: [],
      follow_up: "",
      uncertainties: [],
    };

    const result = await modifyNoteWithAi(emptyNote, "Summarize key clinical points");

    expect(result.updatedNote).toEqual(emptyNote);
    expect(result.assistantReply).toMatch(/no recorded clinical details|left unchanged/i);
    expect(result.updatedNote.summary).toBe("");
  });

  it("does not claim unsupported edits succeeded when no provider is available", async () => {
    const result = await modifyNoteWithAi(currentNote, "Convert this to bullet points");

    expect(result.updatedNote).toEqual(currentNote);
    expect(result.assistantReply).toMatch(/could not apply|unavailable|left unchanged/i);
    expect(result.assistantReply).not.toMatch(/updated/i);
  });

  it("does not claim unsupported edits succeeded when the provider fails", async () => {
    const result = await modifyNoteWithAi(currentNote, "Convert this to bullet points", {
      async complete() {
        throw new Error("provider unavailable");
      },
    });

    expect(result.updatedNote).toEqual(currentNote);
    expect(result.assistantReply).toMatch(/unavailable|left unchanged/i);
    expect(result.assistantReply).not.toMatch(/updated/i);
  });

  it("does not claim full anonymization or change only selected name fields", async () => {
    const provider = { complete: async () => { throw new Error("must not be called"); } };
    const result = await modifyNoteWithAi(currentNote, "Remove all names", provider);

    expect(result.updatedNote).toEqual(currentNote);
    expect(result.assistantReply).toMatch(/cannot safely|cannot guarantee|left unchanged/i);
    expect(result.assistantReply).not.toMatch(/all .*names .*removed/i);
  });

  it("rejects impossible consultation dates at the generation boundary", async () => {
    await expect(generateNoteDraft({
      patient_id: "patient-1",
      patient_display_name: "Fictional Patient",
      consultation_date: "2026-99-99",
      transcript: "The patient said they felt tired.",
    })).rejects.toThrow();
  });
});
