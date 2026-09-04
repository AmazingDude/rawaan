/**
 * Chat history store contract (2026-09-04 client detail page work).
 *
 * The store persists per-patient Brain chat entries to local JSON and groups
 * them into threads on read. Hard rules:
 *  - Entries are DISPLAY ONLY — they must never feed back into the Brain
 *    query pipeline (grounding rule, PRD §5.5/§8/§10).
 *  - Per-patient isolation: listThreads only ever returns the requested
 *    patient's threads.
 *  - Missing storage file reads as empty (local-first convention, same as
 *    lib/db/patients.ts and lib/notes/repository.ts).
 */

import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createChatStore,
  type StoredChatEntry,
} from "@/lib/db/chats";

let dir: string;
let storagePath: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "chat-store-"));
  storagePath = join(dir, "chats.json");
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

function entry(partial: Partial<StoredChatEntry>): StoredChatEntry {
  return {
    id: partial.id ?? "chat-1",
    patientId: partial.patientId ?? "p1",
    threadId: partial.threadId ?? "thread-1",
    question: partial.question ?? "q",
    response: partial.response ?? { status: "error", message: "m" },
    timestamp: partial.timestamp ?? "2026-09-04T10:00:00.000Z",
  };
}

describe("createChatStore", () => {
  it("returns no threads when the file does not exist", async () => {
    const store = createChatStore(storagePath);
    await expect(store.listThreads("p1")).resolves.toEqual([]);
  });

  it("appends entries and groups them into threads per patient", async () => {
    const store = createChatStore(storagePath);
    await store.append(
      entry({
        id: "a",
        question: "first",
        threadId: "t1",
        timestamp: "2026-09-04T10:00:00.000Z",
      }),
    );
    await store.append(
      entry({
        id: "b",
        question: "second",
        threadId: "t1",
        timestamp: "2026-09-04T10:05:00.000Z",
      }),
    );
    await store.append(
      entry({
        id: "c",
        question: "third",
        threadId: "t2",
        timestamp: "2026-09-04T11:00:00.000Z",
      }),
    );
    await store.append(entry({ id: "other", patientId: "p2", threadId: "t9" }));

    const threads = await store.listThreads("p1");

    expect(threads.map((t) => t.threadId)).toEqual(["t1", "t2"]);
    expect(threads[0].startedAt).toBe("2026-09-04T10:00:00.000Z");
    expect(threads[0].entries.map((e) => e.question)).toEqual([
      "first",
      "second",
    ]);
    expect(threads[1].entries).toHaveLength(1);
  });

  it("keeps patients isolated from each other", async () => {
    const store = createChatStore(storagePath);
    await store.append(entry({ id: "a", patientId: "p1" }));
    await store.append(entry({ id: "b", patientId: "p2" }));

    expect(await store.listThreads("p2")).toHaveLength(1);
    expect(await store.listThreads("p-unknown")).toEqual([]);
  });

  it("round-trips every response variant verbatim", async () => {
    const store = createChatStore(storagePath);
    const variants: StoredChatEntry["response"][] = [
      {
        status: "supported",
        answer: "Chest pain was documented.",
        sources: [{ noteId: "n1", consultationDate: "2026-06-01" }],
      },
      {
        status: "no_supporting_record",
        reason: "no_relevant_evidence",
        message: "No record of that for this patient.",
      },
      {
        status: "refused",
        reason: "general_medical",
        message:
          "This tool only retrieves documented patient history and does not provide general medical or treatment advice.",
      },
      { status: "error", message: "boom" },
    ];

    for (const [index, response] of variants.entries()) {
      await store.append(entry({ id: `v${index}`, response }));
    }

    const threads = await store.listThreads("p1");
    expect(threads[0].entries.map((e) => e.response)).toEqual(variants);
  });
});
