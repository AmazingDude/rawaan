import { z } from "zod";

import type { BrainResponse, EvidenceNote } from "@/lib/brain/types";
import { BRAIN_ANSWER_SYSTEM_PROMPT_V1 } from "@/lib/llm/prompts/brain-answer";

const GROQ_CHAT_COMPLETIONS_URL =
  "https://api.groq.com/openai/v1/chat/completions";
const GROQ_BYOK_STORAGE_KEY = "rawaan.groq-byok-key";
const GROQ_MODEL = "qwen/qwen3.8-27b";

const groqResponseSchema = z.object({
  choices: z.array(z.object({ message: z.object({ content: z.string() }) })).min(1),
});

const brainAnswerSchema = z.object({
  answer: z.string(),
  cited_note_ids: z.array(z.string()),
});

export function getStoredGroqByokKey(): string | null {
  const key = window.localStorage.getItem(GROQ_BYOK_STORAGE_KEY)?.trim();
  return key || null;
}

export function saveGroqByokKey(key: string): void {
  window.localStorage.setItem(GROQ_BYOK_STORAGE_KEY, key.trim());
}

export function clearStoredGroqByokKey(): void {
  window.localStorage.removeItem(GROQ_BYOK_STORAGE_KEY);
}

function parseJsonObject(raw: string): z.infer<typeof brainAnswerSchema> {
  let cleaned = raw.replace(/<think>[\s\S]*?<\/think>/gi, "");
  if (cleaned.includes("<think>")) {
    cleaned = cleaned.replace(/<think>[\s\S]*$/gi, "");
  }
  cleaned = cleaned
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  }

  return brainAnswerSchema.parse(JSON.parse(cleaned));
}

export async function generateByokGroundedAnswer(input: {
  apiKey: string;
  evidence: EvidenceNote[];
  question: string;
}): Promise<BrainResponse> {
  const response = await fetch(GROQ_CHAT_COMPLETIONS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [
        { role: "system", content: BRAIN_ANSWER_SYSTEM_PROMPT_V1 },
        {
          role: "user",
          content: JSON.stringify({
            question: input.question,
            evidence: input.evidence.map((note) => ({
              noteId: note.noteId,
              consultationDate: note.consultationDate,
              excerpts: note.excerpts,
            })),
          }),
        },
      ],
      max_tokens: 600,
      temperature: 0,
      stream: false,
    }),
  });

  if (!response.ok) {
    throw new Error("Your Groq key could not complete this Brain request.");
  }

  const payload = groqResponseSchema.parse(await response.json());
  const answer = parseJsonObject(payload.choices[0].message.content);
  if (!answer.answer.trim()) {
    return {
      status: "no_supporting_record",
      reason: "no_relevant_evidence",
      message: "No record of that for this patient.",
    };
  }

  const datesByNoteId = new Map(
    input.evidence.map((note) => [note.noteId, note.consultationDate]),
  );
  // This check is advisory only, for BYOK good-faith UX — it can be bypassed client-side and is NOT a security or grounding boundary. Patient isolation and approved-note filtering happen server-side and remain the actual guarantee; do not treat this client check as equivalent.
  const hasUnretrievedCitation = answer.cited_note_ids.some(
    (noteId) => !datesByNoteId.has(noteId),
  );
  if (hasUnretrievedCitation) {
    throw new Error("Your Groq key returned an unsupported citation.");
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
