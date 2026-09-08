import { chatRowSchema } from "@/lib/db/schemas";
import type { BrainResponse } from "@/lib/brain/types";
import type { AgentResponse } from "@/lib/agent/schema";
import {
  readAllRows, storageOperation, StorageError,
  type SupabaseClientFactory,
} from "@/lib/db/supabase";

export type StoredChatResponse = BrainResponse | AgentResponse | { message: string; status: "error" };
export type StoredChatEntry = {
  id: string;
  patientId: string;
  threadId: string;
  question: string;
  response: StoredChatResponse;
  timestamp: string;
};
export type ChatThread = {
  threadId: string;
  startedAt: string;
  entries: Array<{ question: string; response: StoredChatResponse; timestamp: string }>;
};

const columns = "id, patient_id, thread_id, question, response, timestamp";

/** Cloud history is display-only; never pass it into the Brain retrieval pipeline. */
export function createChatStore(ownerId: string, getClient: SupabaseClientFactory) {
  if (!ownerId.trim()) throw new StorageError();
  return {
    async append(entry: StoredChatEntry): Promise<StoredChatEntry> {
      const row = chatRowSchema.parse({
        id: entry.id, patient_id: entry.patientId, thread_id: entry.threadId,
        question: entry.question, response: entry.response, timestamp: entry.timestamp,
      });
      return storageOperation(async () => {
        const ownedPatient = await getClient().from("patients").select("id").eq("id", entry.patientId).eq("owner_user_id", ownerId).maybeSingle();
        if (ownedPatient.error || !ownedPatient.data) throw new StorageError();
        const { data, error } = await getClient().from("chats").insert({ ...row, owner_user_id: ownerId }).select(columns).single();
        if (error || !data) throw new StorageError();
        const saved = chatRowSchema.parse(data);
        return { id: saved.id, patientId: saved.patient_id, threadId: saved.thread_id,
          question: saved.question, response: saved.response, timestamp: saved.timestamp };
      });
    },
    async listThreads(patientId: string): Promise<ChatThread[]> {
      return storageOperation(async () => {
        const client = getClient();
        const rows = chatRowSchema.array().parse(await readAllRows(() =>
          client.from("chats").select(columns).eq("owner_user_id", ownerId).eq("patient_id", patientId)
            .order("timestamp").order("id"),
        ));
        const threadsById = new Map<string, ChatThread>();
        for (const row of rows) {
          if (row.patient_id !== patientId) throw new StorageError();
          const entry = { question: row.question, response: row.response, timestamp: row.timestamp };
          const thread = threadsById.get(row.thread_id);
          if (thread) thread.entries.push(entry);
          else threadsById.set(row.thread_id, {
            threadId: row.thread_id, startedAt: row.timestamp, entries: [entry],
          });
        }
        return [...threadsById.values()].sort((a, b) =>
          a.startedAt.localeCompare(b.startedAt) || a.threadId.localeCompare(b.threadId),
        );
      });
    },
  };
}
