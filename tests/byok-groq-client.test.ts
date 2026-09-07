import { afterEach, describe, expect, it, vi } from "vitest";

import { generateByokGroundedAnswer } from "@/lib/llm/byok-groq-client";

const evidence = [{
  consultationDate: "2026-02-11",
  excerpts: ["The diary showed fewer headache days."],
  noteId: "note-amina-001-2026-02-11",
  patientId: "patient-amina-001",
  relevanceScore: 1,
}];

afterEach(() => vi.unstubAllGlobals());

describe("BYOK Groq client", () => {
  it("returns a cited answer from direct Groq output", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        choices: [{ message: { content: '{"answer":"Fewer headache days were documented.","cited_note_ids":["note-amina-001-2026-02-11"]}' } }],
      }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(generateByokGroundedAnswer({ apiKey: "user-key", evidence, question: "Did headaches improve?" })).resolves.toEqual({
      answer: "Fewer headache days were documented.",
      sources: [{ consultationDate: "2026-02-11", noteId: "note-amina-001-2026-02-11" }],
      status: "supported",
    });
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.groq.com/openai/v1/chat/completions",
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: "Bearer user-key" }) }),
    );
  });

  it("rejects citations outside server-prepared evidence", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        choices: [{ message: { content: '{"answer":"Unsupported","cited_note_ids":["other-note"]}' } }],
      }), { status: 200 }),
    ));

    await expect(generateByokGroundedAnswer({ apiKey: "user-key", evidence, question: "Did headaches improve?" })).rejects.toThrow("unsupported citation");
  });
});
