import { describe, expect, it } from "vitest";
import { createNoteRepository } from "@/lib/notes/repository";
import { createChatStore } from "@/lib/db/chats";
import { listPatients, savePatient } from "@/lib/db/patients";
import { createTestDatabase } from "./helpers/supabase";
import seed from "@/data/seed/demo-patients.json";
import { noteSchema } from "@/lib/notes/schema";

const note = noteSchema.parse(seed[0]);
const patient = { id: note.patient_id, display_name: note.patient_display_name, first_name: "", last_name: "", email: "", mobile_number: "" };
const chat = { id: "chat-owned", patientId: patient.id, threadId: "thread-owned", question: "What was recorded?", response: { status: "error" as const, message: "test" }, timestamp: "2026-10-06T10:00:00.000Z" };

describe("Clerk user storage isolation", () => {
  it("hides another user's patients, notes, and chats, even when their patient ID is known", async () => {
    const db = createTestDatabase();
    await createNoteRepository("user-a", () => db.client).save(note);
    await createChatStore("user-a", () => db.client).append(chat);
    expect(await listPatients("user-b", () => db.client)).toEqual([]);
    expect(await createNoteRepository("user-b", () => db.client).listAll()).toEqual([]);
    expect(await createNoteRepository("user-b", () => db.client).listByPatient(patient.id)).toEqual([]);
    expect(await createChatStore("user-b", () => db.client).listThreads(patient.id)).toEqual([]);
    expect(await listPatients("user-a", () => db.client)).toEqual([patient]);
  });
  it("rejects foreign patient updates, note approvals and chat writes without changing owner or content", async () => {
    const db = createTestDatabase();
    await createNoteRepository("user-a", () => db.client).save(note);
    const before = structuredClone(db.tables);
    await expect(savePatient({ ...patient, display_name: "Changed" }, "user-b", () => db.client)).rejects.toThrow(/storage/i);
    await expect(createNoteRepository("user-b", () => db.client).save({ ...note, id: "forged-note" })).rejects.toThrow(/storage/i);
    await expect(createChatStore("user-b", () => db.client).append(chat)).rejects.toThrow(/storage/i);
    expect(db.tables).toEqual(before);
  });
  it("does not treat a foreign note-ID conflict as a successful idempotent approval", async () => {
    const db = createTestDatabase();
    await createNoteRepository("user-a", () => db.client).save(note);
    await expect(createNoteRepository("user-b", () => db.client).save({ ...note, patient_id: "own-patient" })).rejects.toThrow(/storage/i);
    expect(db.tables.notes).toHaveLength(1);
    expect(db.tables.notes[0].owner_user_id).toBe("user-a");
  });
  it("quarantines legacy records with no owner rather than assigning them to new users", async () => {
    const db = createTestDatabase();
    db.tables.patients.push({ ...patient, owner_user_id: null });
    db.tables.notes.push({ ...note, owner_user_id: null });
    expect(await listPatients("user-new", () => db.client)).toEqual([]);
    expect(await createNoteRepository("user-new", () => db.client).listAll()).toEqual([]);
  });
  it("rejects empty owner context before any database request", async () => {
    const db = createTestDatabase();
    expect(() => createNoteRepository("", () => db.client)).toThrow(/storage/i);
    expect(() => createChatStore(" ", () => db.client)).toThrow(/storage/i);
    await expect(listPatients("", () => db.client)).rejects.toThrow(/storage/i);
    await expect(savePatient(patient, "", () => db.client)).rejects.toThrow(/storage/i);
    expect(db.requests).toEqual([]);
  });
});
