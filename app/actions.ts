"use server";

import { join } from "node:path";

import { revalidatePath } from "next/cache";
import { ZodError } from "zod";

import { queryPatientRecord } from "@/lib/actions/brain";
import { deriveRosterSummary } from "@/lib/actions/roster";
import { createScribeService, type NoteRepository } from "@/lib/actions/scribe";
import { classifyQuerySafety } from "@/lib/brain/query-safety";
import { retrieveApprovedEvidence } from "@/lib/brain/retrieval";
import type { BrainResponse, EvidenceNote } from "@/lib/brain/types";
import {
  createChatStore,
  type StoredChatEntry,
} from "@/lib/db/chats";
import {
  ensureLocalNotesSynced,
  listSupabaseNotes,
  mergeNotes,
  syncNoteToSupabase,
} from "@/lib/db/notes-sync";
import {
  listPatients,
  savePatient,
  type PatientRecord,
} from "@/lib/db/patients";
import {
  createLlmProviderFromEnv,
  getGroqApiKeyFromDisk,
  type LlmCompletionProvider,
} from "@/lib/llm/provider";
import { createNoteRepository } from "@/lib/notes/repository";
import { type ApprovedNote, type NoteDraft } from "@/lib/notes/schema";
import demoSeedNotes from "@/data/seed/demo-patients.json";

function createLazyBrainProvider(): LlmCompletionProvider {
  return {
    async complete(input) {
      const apiKey = process.env.GROQ_API_KEY?.trim() || getGroqApiKeyFromDisk();
      return createLlmProviderFromEnv(
        {
          GROQ_API_KEY: apiKey,
          LLM_MODEL: process.env.LLM_MODEL,
        },
        4096,
      ).complete(input);
    },
  };
}

const notesStoragePath = join(process.cwd(), "data", "notes.json");
const chatStore = createChatStore(join(process.cwd(), "data", "chats.json"));

// Local JSON is the durable source of truth for notes; Supabase is synced on
// top when configured. Reads merge both so nothing created elsewhere is lost.
const baseNoteRepository = createNoteRepository(notesStoragePath);

const noteRepository: NoteRepository = {
  async listAll() {
    const local = await baseNoteRepository.listAll();
    const remote = await listSupabaseNotes();
    if (remote) {
      void ensureLocalNotesSynced(local);
      return mergeNotes(local, remote);
    }
    return local;
  },

  async listByPatient(patientId: string) {
    const all = await noteRepository.listAll();
    return all.filter((note) => note.patient_id === patientId);
  },

  async save(candidate: unknown) {
    const saved = await baseNoteRepository.save(candidate);
    await syncNoteToSupabase(saved);
    return saved;
  },
};

const scribeService = createScribeService({
  provider: createLazyBrainProvider(),
  storagePath: notesStoragePath,
  repository: noteRepository,
});

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
export type ByokBrainPreparationResult =
  | { evidence: EvidenceNote[]; kind: "evidence"; ok: true; question: string }
  | { kind: "response"; ok: true; response: BrainResponse }
  | ActionFailure;

export type BrainPatient = {
  displayName: string;
  patientId: string;
  approvedNoteCount: number;
  mostRecentConsultationDate: string;
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

export async function prepareByokBrainQueryAction(
  patientId: string,
  question: string,
): Promise<ByokBrainPreparationResult> {
  try {
    const safety = classifyQuerySafety(question);
    if (safety.kind === "refused") {
      return {
        kind: "response",
        ok: true,
        response: {
          status: "refused",
          reason: safety.reason,
          message: safety.message,
        },
      };
    }

    const retrieval = retrieveApprovedEvidence({
      patientId,
      question: safety.normalizedQuestion,
      notes: await noteRepository.listAll(),
    });
    if (retrieval.kind === "no_supporting_record") {
      return {
        kind: "response",
        ok: true,
        response: {
          status: "no_supporting_record",
          reason: retrieval.reason,
          message: retrieval.message,
        },
      };
    }

    return {
      evidence: retrieval.evidence,
      kind: "evidence",
      ok: true,
      question: retrieval.question,
    };
  } catch {
    return {
      ok: false,
      message: "The Brain could not answer right now. Try again.",
    };
  }
}

export async function listBrainPatientsAction(): Promise<BrainPatient[]> {
  const notes = await noteRepository.listAll();
  const rosterById = new Map(
    deriveRosterSummary(notes).map((patient) => [patient.patientId, patient]),
  );

  // Registered patients without any approved notes must still show up in the
  // Clients directory and the Brain's patient selector.
  let storedPatients: PatientRecord[] = [];
  try {
    storedPatients = await listPatients();
  } catch {
    // Storage unreadable — fall back to the notes-derived roster.
  }

  for (const patient of storedPatients) {
    if (!rosterById.has(patient.id)) {
      rosterById.set(patient.id, {
        patientId: patient.id,
        displayName: patient.display_name,
        approvedNoteCount: 0,
        mostRecentConsultationDate: "—",
      });
    }
  }

  return [...rosterById.values()];
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

  let storedPatients: PatientRecord[] = [];
  try {
    storedPatients = await listPatients();
  } catch {
    // Storage unreadable — fall back to notes + baseline clients below.
  }

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

  // Registered patients (Supabase + local fallback) come first.
  for (const patient of storedPatients) {
    map.set(patient.id, {
      displayName: patient.display_name,
      email: patient.email || undefined,
      firstName: patient.first_name || undefined,
      lastName: patient.last_name || undefined,
      lastSessionDate: null,
      mobileNumber: patient.mobile_number || undefined,
      noteCount: 0,
    });
  }

  // Baseline clients come from the canonical demo dataset in data/seed/ so
  // the demo stays usable when storage is empty (fresh clone, no Supabase).
  for (const note of demoSeedNotes) {
    if (!map.has(note.patient_id)) {
      map.set(note.patient_id, {
        displayName: note.patient_display_name,
        lastSessionDate: null,
        noteCount: 0,
      });
    }
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

  try {
    await savePatient({
      id: patientId,
      first_name: firstName,
      last_name: lastName,
      display_name: displayName,
      email: newClient.email || "",
      mobile_number: newClient.mobileNumber || "",
    });
  } catch {
    return {
      message: "Could not save the client. Please try again.",
      ok: false,
    };
  }

  return {
    client: newClient,
    ok: true,
  };
}

export async function modifyNoteAction(data: {
  note: NoteDraft | ApprovedNote;
  prompt: string;
}): Promise<{ assistantReply: string; ok: true; updatedNote: NoteDraft | ApprovedNote } | ActionFailure> {
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

export async function translateNoteToUrduAction(
  note: NoteDraft | ApprovedNote,
): Promise<{ ok: true; urduNote: NoteDraft | ApprovedNote } | ActionFailure> {
  try {
    const { translateNoteToUrdu } = await import("@/lib/llm/translate-note-urdu");
    const urduNote = await translateNoteToUrdu(
      note,
      createLazyBrainProvider(),
    );

    return {
      ok: true,
      urduNote,
    };
  } catch (error) {
    console.error("translateNoteToUrduAction error:", error);
    return {
      message: "Could not translate note to Urdu. Please try again.",
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

// --- Per-client chat history (display-only; never re-enters the Brain query
// pipeline — see docs/superpowers/specs/2026-09-04-client-detail-page-design.md)

export async function listChatThreadsAction(patientId: string) {
  try {
    return await chatStore.listThreads(patientId);
  } catch {
    return [];
  }
}

export async function appendChatEntryAction(input: {
  entry: {
    question: string;
    response: StoredChatEntry["response"];
    timestamp: string;
  };
  patientId: string;
  threadId: string;
}): Promise<{ ok: true } | ActionFailure> {
  try {
    await chatStore.append({
      ...input.entry,
      id: `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      patientId: input.patientId,
      threadId: input.threadId,
    });
    return { ok: true };
  } catch {
    return { message: "The chat could not be saved.", ok: false };
  }
}

export async function getClientDetailAction(patientId: string): Promise<{
  client: ClientRecord | null;
  notes: ApprovedNote[];
}> {
  const [clients, notes] = await Promise.all([
    listClientsAction(),
    noteRepository.listByPatient(patientId),
  ]);

  return {
    client: clients.find((c) => c.patientId === patientId) ?? null,
    notes: notes.sort((a, b) =>
      b.consultation_date.localeCompare(a.consultation_date),
    ),
  };
}



