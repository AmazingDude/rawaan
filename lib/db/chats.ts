import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import type { BrainResponse } from "@/lib/brain/types";

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
 * Local-first per-patient chat history backing the client Chats tab and the
 * Brain chat's resumed threads. Stored entries are DISPLAY ONLY — they must
 * never be fed back into the Brain query pipeline (grounding rule, PRD
 * §5.5/§8/§10). Local JSON is the durable store; no Supabase sync for chats.
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
      return entry;
    },

    async listThreads(patientId: string): Promise<ChatThread[]> {
      const entries = await readEntries(storagePath);
      const threadsById = new Map<string, ChatThread>();

      for (const entry of entries) {
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
