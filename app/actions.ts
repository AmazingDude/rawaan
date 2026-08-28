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

const notesStoragePath = join(process.cwd(), "data", "notes.json");
const scribeService = createScribeService({
  provider: createLazyBrainProvider(),
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
  source: "groq" | "local-demo";
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
    revalidatePath("/record");
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

export type ClientRecord = {
  displayName: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  lastSessionDate: string | null;
  mobileNumber?: string;
  noteCount: number;
  patientId: string;
};

export async function listClientsAction(): Promise<ClientRecord[]> {
  const notes = await noteRepository.listAll();
  const map = new Map<
    string,
    {
      displayName: string;
      email?: string;
      firstName?: string;
      lastName?: string;
      lastSessionDate: string | null;
      mobileNumber?: string;
      noteCount: number;
    }
  >();

  // Include baseline registered clients
  const defaultSeedClients = [
    {
      displayName: "Amina Khan",
      email: "amina.khan@example.com",
      firstName: "Amina",
      lastName: "Khan",
      mobileNumber: "+92 300 1234567",
      patientId: "patient-amina-001",
    },
    {
      displayName: "Tariq Mahmood",
      email: "tariq.mahmood@example.com",
      firstName: "Tariq",
      lastName: "Mahmood",
      mobileNumber: "+92 321 7654321",
      patientId: "patient-tariq-002",
    },
    {
      displayName: "Gloria",
      email: "gloria@example.com",
      firstName: "Gloria",
      lastName: "Rogers",
      mobileNumber: "+1 555 0192834",
      patientId: "patient-gloria-001",
    },
  ];

  for (const c of defaultSeedClients) {
    map.set(c.patientId, {
      displayName: c.displayName,
      email: c.email,
      firstName: c.firstName,
      lastName: c.lastName,
      lastSessionDate: null,
      mobileNumber: c.mobileNumber,
      noteCount: 0,
    });
  }

  for (const note of notes) {
    const existing = map.get(note.patient_id);
    if (!existing) {
      map.set(note.patient_id, {
        displayName: note.patient_display_name,
        email: note.email,
        firstName: note.first_name,
        lastName: note.last_name,
        lastSessionDate: note.consultation_date,
        mobileNumber: note.mobile_number,
        noteCount: 1,
      });
    } else {
      existing.noteCount += 1;
      if (
        !existing.lastSessionDate ||
        note.consultation_date > existing.lastSessionDate
      ) {
        existing.lastSessionDate = note.consultation_date;
      }
      if (note.email && !existing.email) existing.email = note.email;
      if (note.mobile_number && !existing.mobileNumber) existing.mobileNumber = note.mobile_number;
    }
  }

  return [...map].map(([patientId, data]) => ({
    patientId,
    displayName: data.displayName,
    email: data.email,
    firstName: data.firstName,
    lastName: data.lastName,
    lastSessionDate: data.lastSessionDate,
    mobileNumber: data.mobileNumber,
    noteCount: data.noteCount,
  }));
}

export async function createClientAction(data: {
  email?: string;
  firstName: string;
  lastName: string;
  mobileNumber?: string;
}): Promise<{ client: ClientRecord; ok: true } | ActionFailure> {
  const firstName = data.firstName.trim();
  const lastName = data.lastName.trim();

  if (!firstName) {
    return {
      message: "Please enter a client first name.",
      ok: false,
    };
  }

  const displayName = lastName ? `${firstName} ${lastName}` : firstName;
  const slug = displayName.toLowerCase().replace(/[^a-z0-9]/g, "-").replace(/-+/g, "-");
  const patientId = `patient-${slug}-${Date.now().toString().slice(-4)}`;

  const newClient: ClientRecord = {
    displayName,
    email: data.email?.trim() || "",
    firstName,
    lastName,
    lastSessionDate: null,
    mobileNumber: data.mobileNumber?.trim() || "",
    noteCount: 0,
    patientId,
  };

  return {
    client: newClient,
    ok: true,
  };
}

export async function modifyNoteAction(data: {
  note: NoteDraft;
  prompt: string;
}): Promise<{ assistantReply: string; ok: true; updatedNote: NoteDraft } | ActionFailure> {
  try {
    const { modifyNoteWithAi } = await import("@/lib/llm/generate-note");
    const result = await modifyNoteWithAi(
      data.note,
      data.prompt,
      createLazyBrainProvider(),
    );

    return {
      assistantReply: result.assistantReply,
      ok: true,
      updatedNote: result.updatedNote,
    };
  } catch {
    return {
      message: "Could not modify note with AI. Please try again.",
      ok: false,
    };
  }
}

export async function getPatientInsightsAction(
  patientId: string,
) {
  const { extractPatientSessionInsights } = await import(
    "@/lib/notes/insights"
  );
  const notes = await noteRepository.listByPatient(patientId);
  return extractPatientSessionInsights(notes);
}


