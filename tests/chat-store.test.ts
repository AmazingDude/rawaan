import { describe, expect, it } from "vitest";
import { createTestDatabase } from "./helpers/supabase";

import {
  createChatStore,
  type StoredChatEntry,
} from "@/lib/db/chats";

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
  it("returns no threads when Supabase has no rows", async () => {
    const db = createTestDatabase();
    db.tables.patients.push({ id: "p1", owner_user_id: "user-test" }, { id: "p2", owner_user_id: "user-test" });
    const store = createChatStore("user-test", () => db.client);
    await expect(store.listThreads("p1")).resolves.toEqual([]);
  });

  it("appends entries and groups them into threads per patient", async () => {
    const db = createTestDatabase();
    db.tables.patients.push({ id: "p1", owner_user_id: "user-test" }, { id: "p2", owner_user_id: "user-test" });
    const store = createChatStore("user-test", () => db.client);
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
    const db = createTestDatabase();
    db.tables.patients.push({ id: "p1", owner_user_id: "user-test" }, { id: "p2", owner_user_id: "user-test" });
    const store = createChatStore("user-test", () => db.client);
    await store.append(entry({ id: "a", patientId: "p1" }));
    await store.append(entry({ id: "b", patientId: "p2" }));

    expect(await store.listThreads("p2")).toHaveLength(1);
    expect(await store.listThreads("p-unknown")).toEqual([]);
  });

  it("round-trips every response variant verbatim", async () => {
    const db = createTestDatabase();
    db.tables.patients.push({ id: "p1", owner_user_id: "user-test" }, { id: "p2", owner_user_id: "user-test" });
    const store = createChatStore("user-test", () => db.client);
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
