import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import type { BrainResponse } from "@/lib/brain/types";
import { getSupabaseClient } from "@/lib/db/supabase";

/**
 * Response shape persisted per chat turn — structurally identical to the
 * BrainChatEntry response in app/components/brain-chat-state.ts.
 */
export type StoredChatResponse =
  | BrainResponse
  | { message: string; status: "error" };

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
  entries: Array<{
    question: string;
    response: StoredChatResponse;
    timestamp: string;
  }>;
};

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

async function readEntries(storagePath: string): Promise<StoredChatEntry[]> {
  try {
    const raw = await readFile(storagePath, "utf8");
    return JSON.parse(raw) as StoredChatEntry[];
  } catch (error) {
    if (isMissingFileError(error)) return [];
    throw error;
  }
}

/**
 * Per-patient chat history store with Supabase sync and local JSON fallback.
 * Stored entries are DISPLAY ONLY — they must never be fed back into the Brain
 * query pipeline (grounding rule, PRD §5.5/§8/§10).
 */
export function createChatStore(storagePath: string) {
  return {
    async append(entry: StoredChatEntry): Promise<StoredChatEntry> {
      const entries = await readEntries(storagePath);
      await mkdir(dirname(storagePath), { recursive: true });
      await writeFile(
        storagePath,
        JSON.stringify([...entries, entry], null, 2),
      );

      const client = getSupabaseClient();
      if (client) {
        try {
          await client.from("chats").upsert({
            id: entry.id,
            patient_id: entry.patientId,
            thread_id: entry.threadId,
            question: entry.question,
            response: entry.response,
            timestamp: entry.timestamp,
          });
        } catch (error) {
          console.warn("Supabase chat sync failed:", error);
        }
      }

      return entry;
    },

    async listThreads(patientId: string): Promise<ChatThread[]> {
      const localEntries = await readEntries(storagePath);
      const allEntries = [...localEntries];

      const client = getSupabaseClient();
      if (client) {
        try {
          const { data, error } = await client
            .from("chats")
            .select("id, patient_id, thread_id, question, response, timestamp")
            .eq("patient_id", patientId);

          if (!error && data && data.length > 0) {
            const localIds = new Set(localEntries.map((e) => e.id));
            for (const row of data as Array<{
              id: string;
              patient_id: string;
              thread_id: string;
              question: string;
              response: unknown;
              timestamp: string;
            }>) {
              if (!localIds.has(row.id)) {
                allEntries.push({
                  id: row.id,
                  patientId: row.patient_id,
                  threadId: row.thread_id,
                  question: row.question,
                  response: row.response as StoredChatResponse,
                  timestamp: row.timestamp,
                });
              }
            }
          }
        } catch (error) {
          console.warn("Supabase chat list failed:", error);
        }
      }

      const threadsById = new Map<string, ChatThread>();

      for (const entry of allEntries) {
        if (entry.patientId !== patientId) continue;
        const chatEntry = {
          question: entry.question,
          response: entry.response,
          timestamp: entry.timestamp,
        };
        const thread = threadsById.get(entry.threadId);
        if (thread) {
          thread.entries.push(chatEntry);
        } else {
          threadsById.set(entry.threadId, {
            threadId: entry.threadId,
            startedAt: entry.timestamp,
            entries: [chatEntry],
          });
        }
      }

      return [...threadsById.values()].sort((a, b) =>
        a.startedAt.localeCompare(b.startedAt),
      );
    },
  };
}
