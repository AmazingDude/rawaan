import { describe, expect, it } from "vitest";

import { generateGroundedAnswer } from "@/lib/brain/answer-generation";
import type { RetrievalResult } from "@/lib/brain/types";

const evidenceBranch = {
  kind: "evidence",
  patientId: "p1",
  question: "Has she mentioned chest pain before?",
  evidence: [
    {
      noteId: "note-chest",
      patientId: "p1",
      consultationDate: "2026-06-01",
      excerpts: ["Symptoms: Patient reported chest pain when climbing stairs."],
      relevanceScore: 0.5,
    },
  ],
} as const satisfies Extract<RetrievalResult, { kind: "evidence" }>;

describe("generateGroundedAnswer", () => {
  it("accepts only retrieved evidence, never a no-record result", () => {
    if (false) {
      // @ts-expect-error no_supporting_record must not satisfy the evidence-only parameter
      void generateGroundedAnswer({ kind: "no_supporting_record" });
    }

    expect(true).toBe(true);
  });

  it("returns evidence excerpts verbatim and cites only the notes those excerpts came from", () => {
    const result = generateGroundedAnswer({
      ...evidenceBranch,
      evidence: [
        ...evidenceBranch.evidence,
        {
          noteId: "note-follow-up",
          patientId: "p1",
          consultationDate: "2026-06-15",
          excerpts: ["Follow-up: Review in two weeks."],
          relevanceScore: 0.4,
        },
        {
          noteId: "note-empty",
          patientId: "p1",
          consultationDate: "2026-06-20",
          excerpts: ["   "],
          relevanceScore: 0.3,
        },
      ],
    });

    expect(result).toEqual({
      status: "supported",
      answer:
        "Symptoms: Patient reported chest pain when climbing stairs.\nFollow-up: Review in two weeks.",
      sources: [
        { noteId: "note-chest", consultationDate: "2026-06-01" },
        { noteId: "note-follow-up", consultationDate: "2026-06-15" },
      ],
    });
  });

  it("returns an explicit no-record response when no nonblank excerpts exist", () => {
    expect(
      generateGroundedAnswer({
        ...evidenceBranch,
        evidence: [
          { ...evidenceBranch.evidence[0], excerpts: ["", "  "] },
        ],
      }),
    ).toEqual({
      status: "no_supporting_record",
      reason: "no_relevant_evidence",
      message: "No record of that for this patient.",
    });
  });
});
