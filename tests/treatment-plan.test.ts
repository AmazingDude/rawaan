import { describe, expect, it } from "vitest";

import seed from "@/data/seed/demo-patients.json";
import { noteDraftSchema, noteSchema } from "@/lib/notes/schema";
import { projectTreatmentPlan } from "@/lib/notes/treatment-plan";

const approved = noteSchema.parse(seed[0]);

describe("recorded treatment plan projection", () => {
  it("keeps source wording and the approved source note id", () => {
    const projection = projectTreatmentPlan(approved);
    expect(projection.sourceNoteId).toBe(approved.id);
    expect(projection.fields.find((field) => field.label === "Plan / next steps discussed")?.values).toEqual(approved.plan_discussed);
    expect(projection.fields.find((field) => field.label === "Assessment discussed")?.values).toEqual(approved.assessment_discussed);
    expect(projection.hasRecordedPlan).toBe(true);
  });

  it("does not treat assessment or medication mentions alone as a recorded plan", () => {
    const note = noteSchema.parse({
      ...approved,
      plan_discussed: [],
      follow_up: "",
      assessment_discussed: approved.assessment_discussed,
      medications_mentioned: ["Medication discussed in the source fixture"],
    });
    const projection = projectTreatmentPlan(note);
    expect(projection.hasRecordedPlan).toBe(false);
    expect(projection.fields[0].values).toEqual(approved.assessment_discussed);
  });

  it("filters whitespace-only values without changing recorded text and leaves drafts uncited", () => {
    const draft = noteDraftSchema.parse({
      ...approved,
      id: undefined,
      approved_at: undefined,
      approval_status: "draft",
      plan_discussed: ["  " , approved.plan_discussed[0]],
    });
    const projection = projectTreatmentPlan(draft);
    expect(projection.sourceNoteId).toBeNull();
    expect(projection.fields.find((field) => field.label === "Plan / next steps discussed")?.values).toEqual([approved.plan_discussed[0]]);
  });

  it("keeps each session projection separate", () => {
    const second = noteSchema.parse(seed[1]);
    const projections = [approved, second].map(projectTreatmentPlan);
    expect(projections.map((projection) => projection.sourceNoteId)).toEqual([approved.id, second.id]);
    expect(projections[0].fields).not.toEqual(projections[1].fields);
  });
});
