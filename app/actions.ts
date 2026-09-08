"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { z, ZodError } from "zod";

import { queryPatientRecord } from "@/lib/actions/brain";
import { deriveRosterSummary } from "@/lib/actions/roster";
import { createScribeService, MissingDraftIdentityError } from "@/lib/actions/scribe";
import type { BrainResponse } from "@/lib/brain/types";
import {
  createChatStore,
  type StoredChatEntry,
} from "@/lib/db/chats";
import {
  listPatients,
  savePatient,
} from "@/lib/db/patients";
import {
  createLlmProviderFromEnv,
  getGroqApiKeyFromDisk,
  type LlmCompletionProvider,
} from "@/lib/llm/provider";
import { createNoteRepository } from "@/lib/notes/repository";
import { describeAgentFailure } from "@/lib/agent/errors";
import { agentOutputTokenBudget } from "@/lib/llm/agent-budget";
import { type ApprovedNote, type NoteDraft } from "@/lib/notes/schema";
import { StorageError, STORAGE_ERROR_MESSAGE } from "@/lib/db/errors";
import { requireUserStorage } from "@/lib/auth/session";
import { updateClinicName } from "@/lib/db/user-profile";

function createLazyLlmProvider(maxTokens = 600): LlmCompletionProvider {
  return {
    async complete(input) {
      const apiKey = process.env.GROQ_API_KEY?.trim() || getGroqApiKeyFromDisk();
      return createLlmProviderFromEnv(
        {
          GROQ_API_KEY: apiKey,
          LLM_MODEL: process.env.LLM_MODEL,
        },
        maxTokens,
      ).complete(input);
    },
  };
}

async function userServices() {
  const { ownerId, getClient } = await requireUserStorage();
  const noteRepository = createNoteRepository(ownerId, getClient);
  return { ownerId, getClient, noteRepository,
    chatStore: createChatStore(ownerId, getClient),
    scribeService: createScribeService({ provider: createLazyLlmProvider(), repository: noteRepository }),
  };
}

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
export type TranslationActionResult =
  | { ok: true; status: "translated"; urduNote: NoteDraft | ApprovedNote }
  | { ok: false; status: "unavailable"; message: string };
export type BrainActionResult =
  | { ok: true; response: BrainResponse }
  | ActionFailure;
export type BrainPatient = {
  displayName: string;
  patientId: string;
  approvedNoteCount: number;
  mostRecentConsultationDate: string;
};

export async function updateClinicNameAction(
  candidate: unknown,
): Promise<{ clinicName: string; ok: true } | ActionFailure> {
  const parsed = z.string().trim().min(1).max(80).safeParse(candidate);
  if (!parsed.success) {
    return { message: "Enter a clinic name between 1 and 80 characters.", ok: false };
  }
  const { ownerId, getClient } = await requireUserStorage();
  try {
    return { clinicName: await updateClinicName(ownerId, parsed.data, getClient), ok: true };
  } catch {
    return { message: STORAGE_ERROR_MESSAGE, ok: false };
  }
}

function toFailure(error: unknown): ActionFailure {
  if (error instanceof StorageError) return { message: STORAGE_ERROR_MESSAGE, ok: false };
  if (error instanceof MissingDraftIdentityError) return { message: error.message, ok: false };
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
  const { scribeService } = await userServices();
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
  const { scribeService } = await userServices();
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
  const { noteRepository } = await userServices();
  try {
    const notes = await noteRepository.listByPatient(patientId);
    const response = await queryPatientRecord({
      patientId,
      question,
      notes,
    });

    return { ok: true, response };
  } catch (error) {
    return {
      ok: false,
      message: error instanceof StorageError ? STORAGE_ERROR_MESSAGE : "The Brain could not answer right now. Try again.",
    };
  }
}

// Read from the verified user's repository, never from a client-supplied note snapshot.
export async function querySessionRecordAction(patientId: string, noteId: string, question: string): Promise<BrainActionResult> {
  const { noteRepository } = await userServices();
  try {
    const notes = (await noteRepository.listByPatient(patientId)).filter(note => note.id === noteId);
    return { ok: true, response: await queryPatientRecord({ patientId, question, notes }) };
  } catch (error) {
    return { ok: false, message: error instanceof StorageError ? STORAGE_ERROR_MESSAGE : "The saved session could not be queried. Try again." };
  }
}

export async function translateTranscriptToUrduAction(transcript: string): Promise<{ ok: true; transcript: string } | ActionFailure> {
  await userServices();
  const parsed = z.string().min(1).max(20000).safeParse(transcript);
  if (!parsed.success) return { ok: false, message: "This transcript is empty or too long to translate in one request." };
  const { translateTranscriptToUrdu } = await import("@/lib/llm/transcript-urdu");
  return translateTranscriptToUrdu(parsed.data, createLazyLlmProvider(8192));
}

export async function listBrainPatientsAction(): Promise<BrainPatient[]> {
  const { noteRepository, ownerId, getClient } = await userServices();
  const notes = await noteRepository.listAll();
  const rosterById = new Map(
    deriveRosterSummary(notes).map((patient) => [patient.patientId, patient]),
  );

  // Registered patients without any approved notes must still show up in the
  // Clients directory and the Brain's patient selector.
  const storedPatients = await listPatients(ownerId, getClient);

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
  firstSessionDate: string | null;
  lastName?: string;
  lastSessionDate: string | null;
  mobileNumber?: string;
  noteCount: number;
  patientId: string;
};

export async function listClientsAction(): Promise<ClientRecord[]> {
  const { noteRepository, ownerId, getClient } = await userServices();
  const notes = await noteRepository.listAll();

  const storedPatients = await listPatients(ownerId, getClient);

  const map = new Map<
    string,
    {
      displayName: string;
      email?: string;
      firstName?: string;
      firstSessionDate: string | null;
      lastName?: string;
      lastSessionDate: string | null;
      mobileNumber?: string;
      noteCount: number;
    }
  >();

  // Registered patients include clients who have no approved notes yet.
  for (const patient of storedPatients) {
    map.set(patient.id, {
      displayName: patient.display_name,
      email: patient.email || undefined,
      firstName: patient.first_name || undefined,
      firstSessionDate: null,
      lastName: patient.last_name || undefined,
      lastSessionDate: null,
      mobileNumber: patient.mobile_number || undefined,
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
        firstSessionDate: note.consultation_date,
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
      if (!existing.firstSessionDate || note.consultation_date < existing.firstSessionDate) {
        existing.firstSessionDate = note.consultation_date;
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
    firstSessionDate: data.firstSessionDate,
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
  const { ownerId, getClient } = await userServices();
  const firstName = data.firstName.trim();
  const lastName = data.lastName.trim();

  if (!firstName) {
    return {
      message: "Please enter a client first name.",
      ok: false,
    };
  }

  const displayName = lastName ? `${firstName} ${lastName}` : firstName;
  const patientId = "patient-" + randomUUID();

  const newClient: ClientRecord = {
    displayName,
    email: data.email?.trim() || "",
    firstName,
    firstSessionDate: null,
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
    }, ownerId, getClient);
  } catch (error) {
    return {
      message: error instanceof StorageError ? STORAGE_ERROR_MESSAGE : "Could not save the client. Please try again.",
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
  await userServices();
  try {
    const { modifyNoteWithAi } = await import("@/lib/llm/generate-note");
    const result = await modifyNoteWithAi(
      data.note,
      data.prompt,
      createLazyLlmProvider(),
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
): Promise<TranslationActionResult> {
  await userServices();
  try {
    const { translateNoteToUrdu } = await import("@/lib/llm/translate-note-urdu");
    const translation = await translateNoteToUrdu(
      note,
      createLazyLlmProvider(),
    );

    if (translation.status === "unavailable") {
      return { ok: false, status: "unavailable", message: translation.message };
    }
    return { ok: true, status: "translated", urduNote: translation.note };
  } catch {
    return {
      status: "unavailable",
      message: "Urdu translation is unavailable; the original note was left unchanged.",
      ok: false,
    };
  }
}


export async function getPatientInsightsAction(
  patientId: string,
) {
  const { noteRepository } = await userServices();
  const { extractPatientSessionInsights } = await import(
    "@/lib/notes/insights"
  );
  const notes = await noteRepository.listByPatient(patientId);
  return extractPatientSessionInsights(notes);
}

// --- Per-client chat history (display-only; never re-enters the Brain query
// pipeline — see docs/superpowers/specs/2026-09-04-client-detail-page-design.md)

export async function listChatThreadsAction(patientId: string) {
  const { chatStore } = await userServices();
  return chatStore.listThreads(patientId);
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
  const { chatStore } = await userServices();
  if (input.entry.response.status === "agent") return { ok: false, message: "Agent responses must be generated and saved by the server." };
  try {
    await chatStore.append({
      ...input.entry,
      id: "chat-" + randomUUID(),
      patientId: input.patientId,
      threadId: input.threadId,
    });
    return { ok: true };
  } catch (error) {
    return { message: error instanceof StorageError ? STORAGE_ERROR_MESSAGE : "The chat could not be saved.", ok: false };
  }
}

export async function getClientDetailAction(patientId: string): Promise<{
  client: ClientRecord | null;
  notes: ApprovedNote[];
}> {
  const { noteRepository } = await userServices();
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




const agentInputSchema = z.object({
  patientId: z.string().min(1).max(200).nullable(),
  threadId: z.string().min(1).max(200).nullable(),
  question: z.string().trim().min(1).max(5000),
  mode: z.enum(["assistant", "records"]),
  webEnabled: z.boolean(),
  sessionNoteId: z.string().min(1).max(200).optional(),
}).strict();

export async function sendAgentMessageAction(candidate: unknown): Promise<
  | {ok:true; response: StoredChatEntry["response"]; timestamp:string; threadId:string; persisted:boolean}
  | ActionFailure
> {
  const {ownerId,getClient,noteRepository,chatStore}=await userServices();
  const parsed=agentInputSchema.safeParse(candidate);
  if(!parsed.success)return {ok:false,message:"Enter a question of up to 5,000 characters."};
  const input=parsed.data;
  if(input.mode==="records"&&!input.patientId)return {ok:false,message:"Select a client to recall their records."};
  const threadId=input.threadId??"thread-"+randomUUID();
  let stage="context";
  try {
    const {createGeneralChatStore}=await import("@/lib/db/general-chats");
    const {createClinicalStore}=await import("@/lib/db/clinical");
    const generalStore=createGeneralChatStore(ownerId,getClient);
    const [ownedNotes,patientContext,threads]=await Promise.all([
      input.patientId?noteRepository.listByPatient(input.patientId):Promise.resolve([]),
      input.patientId?createClinicalStore(ownerId,getClient).getAgentContext(input.patientId):Promise.resolve(undefined),
      input.threadId?(input.patientId?chatStore.listThreads(input.patientId):generalStore.listThreads()):Promise.resolve([]),
    ]);
    let notes=ownedNotes;
    const context=patientContext?.context;
    if(input.sessionNoteId){
      const focusedNotes=notes.filter(note=>note.id===input.sessionNoteId);
      if(!focusedNotes.length)return {ok:false,message:"This saved session is unavailable."};
      if(input.mode==="records")notes=focusedNotes;
    }
    const history=threads.find(thread=>thread.threadId===input.threadId)?.entries??[];
    let response:StoredChatEntry["response"];
    if(input.mode==="records"){
      stage="records";
      response=await queryPatientRecord({patientId:input.patientId!,question:input.question,notes});
    }else{
      stage="assistant";
      const {runRawaanAgent}=await import("@/lib/llm/rawaan-agent");
      const {createTavilySearch}=await import("@/lib/tools/web-search");
      const key=process.env.TAVILY_API_KEY?.trim();
      const outputTokenBudget=agentOutputTokenBudget();
      response=await runRawaanAgent({
        question:input.question,notes,activeNoteId:input.sessionNoteId,context,privateIdentifiers:patientContext?.identifiers,webEnabled:input.webEnabled,outputTokenBudget,
        history:history.filter(entry=>entry.response.status==="agent"||entry.response.status==="supported").slice(-8)
          .map(entry=>({question:entry.question,answer:"answer" in entry.response?entry.response.answer:""})),
      },createLazyLlmProvider(outputTokenBudget),key?createTavilySearch(key):undefined);
    }
    const timestamp=new Date().toISOString();
    let persisted=true;
    try{
      const entry={id:"chat-"+randomUUID(),threadId,question:input.question,response,timestamp};
      if(input.patientId)await chatStore.append({...entry,patientId:input.patientId});
      else await generalStore.append(entry);
    }catch{persisted=false;}
    return {ok:true,response,timestamp,threadId,persisted};
  }catch(error){
    const failure=describeAgentFailure(error);
    // Only fixed error categories and schema paths: never log clinical content,
    // user/client IDs, credentials, raw provider errors, or model replies.
    console.error("[Rawaan AI] request failed",{stage,...failure.diagnostic});
    return {ok:false,message:failure.message};
  }
}

export async function listAgentThreadsAction(patientId:string|null):Promise<import("@/lib/db/chats").ChatThread[]>{
  const {ownerId,getClient,chatStore}=await userServices();
  if(patientId)return chatStore.listThreads(patientId);
  const {createGeneralChatStore}=await import("@/lib/db/general-chats");
  return createGeneralChatStore(ownerId,getClient).listThreads();
}

export async function getClinicalContextAction(patientId:string){
  const {ownerId,getClient}=await userServices();
  const {createClinicalStore}=await import("@/lib/db/clinical");
  return createClinicalStore(ownerId,getClient).getContext(patientId);
}

export async function saveClinicalContextAction(patientId:string,candidate:unknown):Promise<{ok:true;context:import("@/lib/clinical/schema").ClinicalContext}|ActionFailure>{
  const {ownerId,getClient}=await userServices();
  const {clinicalContextSchema}=await import("@/lib/clinical/schema");
  const parsed=clinicalContextSchema.safeParse(candidate);
  if(!parsed.success)return {ok:false,message:"Review the clinical context fields and try again."};
  try{
    const {createClinicalStore}=await import("@/lib/db/clinical");
    return {ok:true,context:await createClinicalStore(ownerId,getClient).saveContext(patientId,{...parsed.data,confirmed_at:parsed.data.medication_context_confirmed?new Date().toISOString():null})};
  }catch{return {ok:false,message:STORAGE_ERROR_MESSAGE};}
}

export async function listClinicalPlansAction(patientId:string){
  const {ownerId,getClient}=await userServices();
  const {createClinicalStore}=await import("@/lib/db/clinical");
  return createClinicalStore(ownerId,getClient).listPlans(patientId);
}

export async function reviewClinicalPlanAction(candidate:unknown):Promise<{ok:true;plan:import("@/lib/db/clinical").ReviewedClinicalPlan}|ActionFailure>{
  const {ownerId,getClient,chatStore,noteRepository}=await userServices();
  const parsed=z.object({patientId:z.string().min(1),threadId:z.string().min(1),entryTimestamp:z.string().datetime(),title:z.string().trim().min(1).max(200),content:z.string().trim().min(1).max(30000)}).strict().safeParse(candidate);
  if(!parsed.success)return {ok:false,message:"Review the plan title and content before saving."};
  try{
    const input=parsed.data;
    const entry=(await chatStore.listThreads(input.patientId)).find(thread=>thread.threadId===input.threadId)?.entries.find(entry=>entry.timestamp===input.entryTimestamp);
    if(!entry||entry.response.status!=="agent"||!entry.response.clinical?.plan)return {ok:false,message:"This generated plan is not in your saved client conversation. Wait for the conversation to save, then retry."};
    const ownedNotes = await noteRepository.listByPatient(input.patientId);
    if (entry.response.sources.some(source=>source.kind === "note" && !ownedNotes.some(note=>note.id === source.noteId && note.consultation_date === source.consultationDate))) return {ok:false,message:"A source note for this plan is unavailable."};
    const {createClinicalStore}=await import("@/lib/db/clinical");
    const plan=await createClinicalStore(ownerId,getClient).savePlan({
      id:"plan-"+randomUUID(),patient_id:input.patientId,title:input.title,reviewed_content:input.content,
      generated_plan:entry.response.clinical.plan,sources:entry.response.sources,reviewed_at:new Date().toISOString(),
    });
    revalidatePath("/clients/"+input.patientId);
    return {ok:true,plan};
  }catch{return {ok:false,message:STORAGE_ERROR_MESSAGE};}
}
