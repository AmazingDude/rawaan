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

  it("includes structured plan and follow-up text that supplied the retrieval match", () => {
    const note = makeNote({
      id: "note-plan-only",
      plan_discussed: [],
      follow_up: "Return after the next examination block if headaches increase.",
      raw_transcript: "The clinician discussed the appointment.",
    });

    const ranked = rankNotes(
      [note],
      "When should she return if headaches increase?",
    );

    expect(ranked).toHaveLength(1);
    expect(ranked[0]?.excerpts).toContain(
      "Follow-up: Return after the next examination block if headaches increase.",
    );
    expect(ranked[0]?.excerpts.every((excerpt) => excerpt.trim().length > 0)).toBe(true);
  });

  it("matches a recorded two-letter clinical acronym without matching absent acronyms", () => {
    const note = makeNote({
      id: "note-bp",
      raw_transcript: "BP was 120/80.",
    });

    expect(rankNotes([note], "What was BP?")).toHaveLength(1);
    expect(rankNotes([note], "What was ECG?")).toHaveLength(0);
  });

  it("uses numeric tokens to retrieve a recorded measurement", () => {
    const note = makeNote({
      id: "note-dose",
      medications_mentioned: ["Metformin 500 mg"],
      raw_transcript: "Metformin 500 mg was mentioned.",
    });

    expect(rankNotes([note], "Was 500 mg mentioned?")).toHaveLength(1);
    expect(rankNotes([note], "Was 750 mg mentioned?")).toHaveLength(0);
  });

  it("preserves one-digit pain scores while still requiring exact numeric values", () => {
    const note = makeNote({
      id: "note-pain-score",
      symptoms: ["Pain score 7/10"],
      raw_transcript: "Pain score was 7/10.",
    });

    expect(rankNotes([note], "Was the pain score 7/10?")).toHaveLength(1);
    expect(rankNotes([note], "Was the pain score 8/10?")).toHaveLength(0);
  });

  it("matches a pure Urdu question to Urdu text in approved fields", () => {
    const note = makeNote({
      id: "note-urdu",
      symptoms: ["سر میں درد"],
      raw_transcript: "مریض نے سر میں درد بتایا۔",
    });

    const ranked = rankNotes([note], "کیا مریض کو سر میں درد تھا؟");

    expect(ranked).toHaveLength(1);
    expect(ranked[0]?.excerpts).toContain("Symptoms: سر میں درد");
  });

  it("does not create Urdu evidence when the requested symptom is absent", () => {
    const note = makeNote({
      id: "note-urdu-no-fever",
      symptoms: ["سر میں درد"],
      raw_transcript: "مریض نے سر میں درد بتایا۔",
    });

    expect(rankNotes([note], "کیا مریض کو بخار تھا؟")).toHaveLength(0);
  });
});

describe("rankNotes name-token exclusion", () => {
  // Transcript densely repeats the patient's first name, as realistic seeds do.
  const nameDense = makeNote({
    id: "note-name-dense",
    patient_id: "p1",
    patient_display_name: "Amina Khan",
    symptoms: ["headache"],
    raw_transcript: "Amina said Amina felt tired. Amina denied other symptoms.",
  });

  it("returns no evidence for a short name + unrecorded-vital question (no name-only match)", () => {
    // Without the fix, the single name token "amina" alone crosses the 0.25
    // threshold (1/3) and yields a false match. With the fix, name tokens are
    // excluded from both sides, leaving {blood,pressure} with no note match.
    const ranked = rankNotes([nameDense], "What was Amina's blood pressure?");
    expect(ranked).toHaveLength(0);
  });

  it("still returns evidence when the question pairs the name with a recorded content term", () => {
    const ranked = rankNotes([nameDense], "Did Amina report feeling tired?");
    expect(ranked).toHaveLength(1);
    expect(ranked[0]?.noteId).toBe("note-name-dense");
  });

  it("returns no evidence when the question is only the patient's name", () => {
    const ranked = rankNotes([nameDense], "Amina?");
    expect(ranked).toHaveLength(0);
  });
});

export { makeNote };
