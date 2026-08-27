import { describe, expect, it } from "vitest";
import { RELEVANCE_THRESHOLD, rankNotes } from "@/lib/brain/ranking";
import type { ApprovedNote } from "@/lib/notes/schema";

function makeNote(overrides: Partial<ApprovedNote>): ApprovedNote {
  return {
    id: "note-1",
    patient_id: "p1",
    patient_display_name: "Amina Khan",
    consultation_date: "2026-06-01",
    chief_complaint: "",
    history: [],
    symptoms: [],
    assessment_discussed: [],
    plan_discussed: [],
    medications_mentioned: [],
    follow_up: "",
    uncertainties: [],
    raw_transcript: "",
    approval_status: "approved",
    approved_at: "2026-06-01T10:00:00.000Z",
    ...overrides,
  };
}

describe("rankNotes", () => {
  const chestPain = makeNote({
    id: "note-chest",
    symptoms: ["chest pain"],
    raw_transcript: "Patient reported chest pain when climbing stairs.",
  });

  it("ranks a matching note above an unrelated note", () => {
    const unrelated = makeNote({
      id: "note-other",
      symptoms: ["knee swelling"],
      history: ["The pain started after running."],
    });
    const ranked = rankNotes([unrelated, chestPain], "Has she mentioned chest pain before?");

    expect(ranked[0]?.noteId).toBe("note-chest");
    expect(ranked[0]!.relevanceScore).toBeGreaterThan(ranked[1]!.relevanceScore);
  });

  it("excludes notes scoring below the relevance threshold", () => {
    const unrelated = makeNote({ id: "note-other", symptoms: ["knee swelling"] });
    const ranked = rankNotes([unrelated], "Has she mentioned chest pain before?");

    expect(RELEVANCE_THRESHOLD).toBeGreaterThan(0);
    expect(ranked).toHaveLength(0);
  });

  it("returns transcript-backed excerpts containing matched terms and caps them at three", () => {
    const note = makeNote({
      id: "note-excerpts",
      raw_transcript:
        "The patient described chest pain after walking. Chest pain improved with rest. The chest pain returned overnight. She denied chest pain at breakfast.",
    });

    const ranked = rankNotes([note], "Has she mentioned chest pain before?");
    const excerpts = ranked[0]?.excerpts ?? [];

    expect(excerpts.length).toBeLessThanOrEqual(3);
    expect(excerpts.length).toBe(3);
    for (const excerpt of excerpts) {
      expect(note.raw_transcript).toContain(excerpt);
      expect(excerpt.toLowerCase()).toMatch(/chest|pain/);
    }
  });

  it("orders all returned notes by descending relevance score", () => {
    const weak = makeNote({
      id: "note-weak",
      symptoms: ["chest pain"],
      raw_transcript: "The patient mentioned chest pain.",
    });
    const strong = makeNote({
      id: "note-strong",
      symptoms: ["chest pain", "shortness of breath"],
      raw_transcript: "The patient reported chest pain and shortness of breath.",
    });

    const ranked = rankNotes(
      [weak, strong],
      "Has she mentioned chest pain and shortness of breath before?",
    );

    expect(ranked).toHaveLength(2);
    expect(ranked[0]!.relevanceScore).toBeGreaterThanOrEqual(
      ranked[1]!.relevanceScore,
    );
  });
});

export { makeNote };
