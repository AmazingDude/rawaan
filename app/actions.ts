"use server";

import { join } from "node:path";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";

import { createScribeService } from "@/lib/actions/scribe";
import { type NoteDraft } from "@/lib/notes/schema";

const scribeService = createScribeService({
  storagePath: join(process.cwd(), "data", "notes.json"),
});

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
