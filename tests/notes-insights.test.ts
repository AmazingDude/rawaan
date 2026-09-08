import { describe, expect, it } from "vitest";

import { extractPatientSessionInsights } from "@/lib/notes/insights";
import type { ApprovedNote } from "@/lib/notes/schema";

const latestNote: ApprovedNote = {
  id: "note-latest",
  patient_id: "patient-1",
  patient_display_name: "Fictional Patient",
  consultation_date: "2026-08-22",
  chief_complaint: "Headache",
  summary: "Headache was discussed.",
  history: ["Headache for several days"],
  symptoms: ["Headache"],
  assessment_discussed: [],
  plan_discussed: [],
  medications_mentioned: [],
  follow_up: "",
  uncertainties: [],
  raw_transcript: "The consultation transcript.",
  approval_status: "approved",
  approved_at: "2026-08-22T10:00:00.000Z",
};

describe("extractPatientSessionInsights", () => {
  it("returns no sourced insight summary when there are no notes", () => {
    const insights = extractPatientSessionInsights([]);

    expect(insights.hasInsights).toBe(false);
    expect(insights.summary).toBeNull();
  });

  it("keeps undocumented actions and follow-up empty instead of inventing instructions", () => {
    const insights = extractPatientSessionInsights([latestNote]);

    expect(insights.previousActionItems).toEqual([]);
    expect(insights.planForThisSession).toEqual([]);
    expect(insights.interestingQuestions).toEqual([]);
  });

  it("does not turn chief complaint or symptoms into an invented summary", () => {
    const insights = extractPatientSessionInsights([{
      ...latestNote,
      summary: "",
      chief_complaint: "Headache",
      symptoms: ["Headache", "Light sensitivity"],
    }]);

    expect(insights.summary).toBeNull();
  });

  it("attaches the source note ID to each derived insight", () => {
    const insights = extractPatientSessionInsights([{
      ...latestNote,
      plan_discussed: ["Keep a symptom diary"],
      follow_up: "Return in two weeks",
      uncertainties: ["Duration was not clarified"],
    }]);

    expect(insights.previousActionItems).toEqual([
      { text: "Keep a symptom diary", sourceNoteId: "note-latest" },
    ]);
    expect(insights.planForThisSession).toEqual([
      { text: "Return in two weeks", sourceNoteId: "note-latest" },
    ]);
    expect(insights.interestingQuestions).toEqual([
      { text: "Duration was not clarified", sourceNoteId: "note-latest" },
    ]);
    expect(insights.summary).toMatchObject({
      text: "Headache was discussed.",
      sourceNoteId: "note-latest",
    });
  });
});
