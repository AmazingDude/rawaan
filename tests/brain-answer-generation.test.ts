import { describe, expect, it } from "vitest";

import { generateGroundedAnswer } from "@/lib/brain/answer-generation";
import type { RetrievalResult } from "@/lib/brain/types";
import type { LlmCompletionProvider } from "@/lib/llm/provider";

const evidenceBranch = {
  kind: "evidence",
  patientId: "p1",
  question: "Has she mentioned chest pain before?",
  evidence: [
    {
      noteId: "note-chest",
      patientId: "p1",
      consultationDate: "2026-06-01",
      excerpts: ["Patient reported chest pain when climbing stairs."],
      relevanceScore: 0.5,
    },
  ],
} as const satisfies Extract<RetrievalResult, { kind: "evidence" }>;

const nullProvider: LlmCompletionProvider = {
  async complete() {
    return "";
  },
};

describe("generateGroundedAnswer", () => {
  it("accepts only the evidence branch — a no-record result is a type error, verified at compile time", () => {
    if (false) {
      // @ts-expect-error no_supporting_record must not satisfy the evidence-only parameter
      void generateGroundedAnswer({ kind: "no_supporting_record" }, nullProvider);
    }

    expect(true).toBe(true);
  });

  it("rejects a citation pointing outside the supplied evidence instead of showing it", async () => {
    const lyingProvider: LlmCompletionProvider = {
      async complete() {
        return JSON.stringify({
          answer: "She had chest pain.",
          cited_note_ids: ["made-up-id"],
        });
      },
    };

    await expect(
      generateGroundedAnswer(evidenceBranch, lyingProvider),
    ).rejects.toThrowError("Brain answer cited evidence that was not retrieved.");
  });

  it("returns a supported response whose sources match evidence dates exactly", async () => {
    const provider: LlmCompletionProvider = {
      async complete() {
        return JSON.stringify({
          answer: "Yes — chest pain on exertion.",
          cited_note_ids: ["note-chest"],
        });
      },
    };

    await expect(
      generateGroundedAnswer(evidenceBranch, provider),
    ).resolves.toEqual({
      status: "supported",
      answer: "Yes — chest pain on exertion.",
      sources: [{ noteId: "note-chest", consultationDate: "2026-06-01" }],
    });
  });
});
