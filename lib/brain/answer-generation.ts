import { z } from "zod";

import type { BrainResponse, RetrievalResult } from "@/lib/brain/types";
import type { LlmCompletionProvider } from "@/lib/llm/provider";
import { BRAIN_ANSWER_SYSTEM_PROMPT_V1 } from "@/lib/llm/prompts/brain-answer";

const brainAnswerSchema = z.object({
  answer: z.string(),
  cited_note_ids: z.array(z.string()),
});

type RetrievedEvidence = Extract<RetrievalResult, { kind: "evidence" }>;

function buildEvidenceUserMessage(evidence: RetrievedEvidence): string {
  return JSON.stringify({
    question: evidence.question,
    evidence: evidence.evidence.map((note) => ({
      noteId: note.noteId,
      consultationDate: note.consultationDate,
      excerpts: note.excerpts,
    })),
  });
}

function parseBrainAnswer(completion: string): z.infer<typeof brainAnswerSchema> {
  let parsed: unknown;

  try {
    parsed = JSON.parse(completion);
  } catch {
    throw new Error("Brain answer response was invalid.");
  }

  const result = brainAnswerSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error("Brain answer response was invalid.");
  }

  return result.data;
}

export async function generateGroundedAnswer(
  evidence: RetrievedEvidence,
  provider: LlmCompletionProvider,
): Promise<BrainResponse> {
  const completion = await provider.complete({
    system: BRAIN_ANSWER_SYSTEM_PROMPT_V1,
    user: buildEvidenceUserMessage(evidence),
  });
  const answer = parseBrainAnswer(completion);

  if (answer.answer.length === 0 && answer.cited_note_ids.length > 0) {
    throw new Error("Brain answer cannot cite evidence without an answer.");
  }

  const datesByNoteId = new Map(
    evidence.evidence.map((note) => [note.noteId, note.consultationDate]),
  );
  const hasUnretrievedCitation = answer.cited_note_ids.some(
    (noteId) => !datesByNoteId.has(noteId),
  );

  if (hasUnretrievedCitation) {
    throw new Error("Brain answer cited evidence that was not retrieved.");
  }

  return {
    status: "supported",
    answer: answer.answer,
    sources: answer.cited_note_ids.map((noteId) => ({
      noteId,
      consultationDate: datesByNoteId.get(noteId)!,
    })),
  };
}
