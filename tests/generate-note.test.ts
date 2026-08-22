import { describe, expect, it } from "vitest";

import { generateNoteDraft } from "@/lib/llm/generate-note";

describe("generateNoteDraft", () => {
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
});
