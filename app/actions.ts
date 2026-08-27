"use server";

import { join } from "node:path";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";

import { queryPatientRecord } from "@/lib/actions/brain";
import { createScribeService } from "@/lib/actions/scribe";
import type { BrainResponse } from "@/lib/brain/types";
import {
  createLlmProviderFromEnv,
  type LlmCompletionProvider,
} from "@/lib/llm/provider";
import { createNoteRepository } from "@/lib/notes/repository";
import { type NoteDraft } from "@/lib/notes/schema";

const notesStoragePath = join(process.cwd(), "data", "notes.json");
const scribeService = createScribeService({
  storagePath: notesStoragePath,
});
const noteRepository = createNoteRepository(notesStoragePath);

type ActionFailure = {
  message: string;
  ok: false;
};

type DraftActionSuccess = {
  draft: NoteDraft;
  ok: true;
  source: "local-demo";
};

type ApprovalActionSuccess = {
  approvedAt: string;
  noteId: string;
  ok: true;
};

export type DraftActionResult = DraftActionSuccess | ActionFailure;
export type ApprovalActionResult = ApprovalActionSuccess | ActionFailure;
export type BrainActionResult =
  | { ok: true; response: BrainResponse }
  | ActionFailure;

export type BrainPatient = {
  displayName: string;
  patientId: string;
};

function toFailure(error: unknown): ActionFailure {
  if (error instanceof ZodError) {
    return {
      message: "Enter a patient identifier, display name, date, and transcript before generating a draft.",
      ok: false,
    };
  }

  return {
    message: "The note could not be processed. Review the content and try again.",
    ok: false,
  };
}

export async function generateDraftAction(
  candidate: unknown,
): Promise<DraftActionResult> {
  try {
    const result = await scribeService.createDraft(candidate);

    return {
      ...result,
      ok: true,
    };
  } catch (error) {
    return toFailure(error);
  }
}

export async function approveDraftAction(
  candidate: unknown,
): Promise<ApprovalActionResult> {
  try {
    const approvedNote = await scribeService.approve(candidate);
    revalidatePath("/scribe");

    return {
      approvedAt: approvedNote.approved_at,
      noteId: approvedNote.id,
      ok: true,
    };
  } catch (error) {
    return toFailure(error);
  }
}

function createLazyBrainProvider(): LlmCompletionProvider {
  return {
    async complete(input) {
      return createLlmProviderFromEnv({
        GROQ_API_KEY: process.env.GROQ_API_KEY,
        LLM_MODEL: process.env.LLM_MODEL,
      }).complete(input);
    },
  };
}

export async function queryPatientRecordAction(
  patientId: string,
  question: string,
): Promise<BrainActionResult> {
  try {
    const notes = await noteRepository.listAll();
    const response = await queryPatientRecord({
      patientId,
      question,
      notes,
      provider: createLazyBrainProvider(),
    });

    return { ok: true, response };
  } catch {
    return {
      ok: false,
      message: "The Brain could not answer right now. Try again.",
    };
  }
}

export async function listBrainPatientsAction(): Promise<BrainPatient[]> {
  const notes = await noteRepository.listAll();
  const patients = new Map<string, string>();

  for (const note of notes) {
    if (!patients.has(note.patient_id)) {
      patients.set(note.patient_id, note.patient_display_name);
    }
  }

  return [...patients].map(([patientId, displayName]) => ({
    patientId,
    displayName,
  }));
}
