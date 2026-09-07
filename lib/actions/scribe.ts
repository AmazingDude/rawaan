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
  repository?: NoteRepository;
};

export type NoteRepository = ReturnType<typeof createNoteRepository>;

export function createScribeService({
  storagePath,
  createId = randomUUID,
  approvalTime = () => new Date().toISOString(),
  provider,
  repository,
}: ScribeServiceOptions) {
  const noteRepository = repository ?? createNoteRepository(storagePath);

  return {
    createDraft(candidate: unknown): Promise<GeneratedDraft> {
      return generateNoteDraft(candidate, provider);
    },

    async approve(candidate: unknown): Promise<ApprovedNote> {
      const draft = noteDraftSchema.parse(candidate);

      // Prevent duplicate approvals: check if an approved note already exists
      // for this patient on the same date. If found, return it as-is.
      const existingNotes = await noteRepository.listAll();
      const alreadyApproved = existingNotes.find(
        (note) =>
          note.patient_id === draft.patient_id &&
          note.consultation_date === draft.consultation_date &&
          note.approval_status === "approved",
      );

      if (alreadyApproved) {
        return alreadyApproved;
      }

      return noteRepository.save({
        ...draft,
        approval_status: "approved",
        approved_at: approvalTime(),
        id: createId(),
      });
    },

    listByPatient(patientId: string): Promise<ApprovedNote[]> {
      return noteRepository.listByPatient(patientId);
    },
  };
}

export type ScribeService = ReturnType<typeof createScribeService>;
export type ScribeDraft = NoteDraft;
