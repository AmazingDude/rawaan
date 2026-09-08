import { randomUUID } from "node:crypto";

import type { LlmCompletionProvider } from "@/lib/llm/provider";
import {
  generateNoteDraft,
  type GeneratedDraft,
} from "@/lib/llm/generate-note";
import { createNoteRepository } from "@/lib/notes/repository";
import { noteDraftSchema, type ApprovedNote, type NoteDraft } from "@/lib/notes/schema";

type ScribeServiceOptions = {
  createId?: () => string;
  approvalTime?: () => string;
  provider?: LlmCompletionProvider;
  repository: NoteRepository;
};

export class MissingDraftIdentityError extends Error {
  constructor() {
    super("This draft is missing its save identity. Reopen the session and create a fresh draft before approving.");
    this.name = "MissingDraftIdentityError";
  }
}

export type NoteRepository = ReturnType<typeof createNoteRepository>;

function matchesApprovedDraft(note: ApprovedNote, draft: NoteDraft): boolean {
  return (
    note.patient_id === draft.patient_id &&
    note.patient_display_name === draft.patient_display_name &&
    note.first_name === draft.first_name &&
    note.last_name === draft.last_name &&
    note.email === draft.email &&
    note.mobile_number === draft.mobile_number &&
    note.consultation_date === draft.consultation_date &&
    note.chief_complaint === draft.chief_complaint &&
    note.summary === draft.summary &&
    note.follow_up === draft.follow_up &&
    note.raw_transcript === draft.raw_transcript &&
    JSON.stringify(note.history) === JSON.stringify(draft.history) &&
    JSON.stringify(note.symptoms) === JSON.stringify(draft.symptoms) &&
    JSON.stringify(note.assessment_discussed) === JSON.stringify(draft.assessment_discussed) &&
    JSON.stringify(note.plan_discussed) === JSON.stringify(draft.plan_discussed) &&
    JSON.stringify(note.medications_mentioned) === JSON.stringify(draft.medications_mentioned) &&
    JSON.stringify(note.uncertainties) === JSON.stringify(draft.uncertainties) &&
    JSON.stringify(note.session_info) === JSON.stringify(draft.session_info)
  );
}

export function createScribeService({
  createId = randomUUID,
  approvalTime = () => new Date().toISOString(),
  provider,
  repository,
}: ScribeServiceOptions) {
  const noteRepository = repository;

  return {
    async createDraft(candidate: unknown): Promise<GeneratedDraft> {
      const result = await generateNoteDraft(candidate, provider);
      return {
        ...result,
        draft: { ...result.draft, draft_id: createId() },
      };
    },

    async approve(candidate: unknown): Promise<ApprovedNote> {
      const draft = noteDraftSchema.parse(candidate);
      if (!draft.draft_id) throw new MissingDraftIdentityError();

      // Prevent duplicate approvals only when the full reviewed draft matches.
      // Same-day consultations with different content must both be retained.
      const existingNotes = await noteRepository.listByPatient(draft.patient_id);
      const alreadyApproved = existingNotes.find(
        (note) => note.approval_status === "approved" && matchesApprovedDraft(note, draft),
      );

      if (alreadyApproved) {
        return alreadyApproved;
      }

      return noteRepository.save({
        ...draft,
        approval_status: "approved",
        approved_at: approvalTime(),
        // Reuse the immutable draft token as the row primary key. Supabase's
        // primary-key constraint makes simultaneous retries one atomic write.
        id: draft.draft_id,
      });
    },

    listByPatient(patientId: string): Promise<ApprovedNote[]> {
      return noteRepository.listByPatient(patientId);
    },
  };
}

export type ScribeService = ReturnType<typeof createScribeService>;
export type ScribeDraft = NoteDraft;
