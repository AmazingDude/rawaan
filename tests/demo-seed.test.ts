import { describe, expect, it } from "vitest";

import demoNotes from "@/data/seed/demo-patients.json";
import { noteSchema } from "@/lib/notes/schema";

describe("fictional Brain demo seed", () => {
  it("contains only schema-valid approved notes", () => {
    const result = noteSchema.array().safeParse(demoNotes);

    expect(result.success).toBe(true);
    expect(demoNotes).toHaveLength(8);
    expect(demoNotes.every((note) => note.approval_status === "approved")).toBe(
      true,
    );
  });

  it("contains three distinct patients with two or three approved notes each", () => {
    const notesByPatient = new Map<string, number>();

    for (const note of demoNotes) {
      notesByPatient.set(
        note.patient_id,
        (notesByPatient.get(note.patient_id) ?? 0) + 1,
      );
    }

    expect([...notesByPatient.keys()].sort()).toEqual([
      "patient-amina-001",
      "patient-hassan-002",
      "patient-sara-003",
    ]);
    expect([...notesByPatient.values()].sort()).toEqual([2, 3, 3]);
  });

  it("uses fictional identities with chronological visit histories", () => {
    const datesByPatient = new Map<string, string[]>();

    for (const note of demoNotes) {
      expect(note.patient_display_name).toMatch(/^Fictional /);
      expect(note.raw_transcript).toMatch(/^Fictional patient /);

      const consultationDates = datesByPatient.get(note.patient_id) ?? [];
      consultationDates.push(note.consultation_date);
      datesByPatient.set(note.patient_id, consultationDates);
    }

    for (const consultationDates of datesByPatient.values()) {
      expect(consultationDates).toEqual([...consultationDates].sort());
    }
  });
});
