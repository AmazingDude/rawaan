import { randomUUID } from "node:crypto";

import type { LlmCompletionProvider } from "@/lib/llm/provider";
import {
  generateNoteDraft,
  type GeneratedDraft,
} from "@/lib/llm/generate-note";
import { createNoteRepository } from "@/lib/notes/repository";
import { noteDraftSchema, type ApprovedNote, type NoteDraft } from "@/lib/notes/schema";

type ScribeServiceOptions = {
  storagePath: string;
  createId?: () => string;
  approvalTime?: () => string;
  provider?: LlmCompletionProvider;
};

export function createScribeService({
  storagePath,
  createId = randomUUID,
  approvalTime = () => new Date().toISOString(),
  provider,
}: ScribeServiceOptions) {
  const repository = createNoteRepository(storagePath);

  return {
    createDraft(candidate: unknown): Promise<GeneratedDraft> {
      return generateNoteDraft(candidate, provider);
    },

    async approve(candidate: unknown): Promise<ApprovedNote> {
      const draft = noteDraftSchema.parse(candidate);

      return repository.save({
        ...draft,
        approval_status: "approved",
        approved_at: approvalTime(),
        id: createId(),
      });
    },

    listByPatient(patientId: string): Promise<ApprovedNote[]> {
      return repository.listByPatient(patientId);
    },
  };
}

export type ScribeService = ReturnType<typeof createScribeService>;
export type ScribeDraft = NoteDraft;
