import { describe, expect, it } from "vitest";
import { createNoteRepository } from "@/lib/notes/repository";
import { listPatients, savePatient } from "@/lib/db/patients";
import { createChatStore } from "@/lib/db/chats";
import seedNotes from "@/data/seed/demo-patients.json";
import { noteSchema } from "@/lib/notes/schema";
import { createTestDatabase } from "./helpers/supabase";

const note = noteSchema.parse({ ...seedNotes[0], session_info: {
  session_type: "manual", transcript_source: "clinician-entered", recorded_at: "2026-10-05T10:00:00.000Z",
} });
const patient = { id: note.patient_id, display_name: note.patient_display_name,
  first_name: "", last_name: "", email: "", mobile_number: "" };

describe("Supabase-only storage contracts", () => {
  it("rejects note persistence when the cloud insert fails", async () => {
    const db = createTestDatabase(); db.fail("notes", 503, "POST");
    await expect(createNoteRepository("user-test", () => db.client).save(note)).rejects.toThrow(/storage/i);
    expect(db.tables.notes).toEqual([]);
  });
  it("round-trips the transcript and session metadata, without blanking patient details", async () => {
    const db = createTestDatabase();
    db.tables.patients.push({ ...patient, owner_user_id: "user-test", email: "existing@example.test" });
    const repository = createNoteRepository("user-test", () => db.client);
    await repository.save(note);
    expect(await repository.listByPatient(note.patient_id)).toEqual([note]);
    expect(db.tables.patients[0].email).toBe("existing@example.test");
    const request = db.requests.find((r) => r.method === "GET" && r.url.pathname.endsWith("notes"))!;
    expect(request.url.searchParams.get("patient_id")).toBe(`eq.${note.patient_id}`);
    expect(request.url.searchParams.get("approval_status")).toBe("eq.approved");
  });
  it("rejects drafts before making any network request", async () => {
    const db = createTestDatabase();
    await expect(createNoteRepository("user-test", () => db.client).save({ ...note, approval_status: "draft" }))
      .rejects.toThrow("Only approved notes can be persisted");
    expect(db.requests).toEqual([]);
  });
  it("does not treat an outage or a malformed row as an empty record", async () => {
    const db = createTestDatabase(); db.fail("notes");
    await expect(createNoteRepository("user-test", () => db.client).listAll()).rejects.toThrow(/storage/i);
    const malformed = createTestDatabase(); malformed.tables.notes.push({ id: "bad", owner_user_id: "user-test", approval_status: "approved" });
    await expect(createNoteRepository("user-test", () => malformed.client).listAll()).rejects.toThrow(/storage/i);
  });
  it("reads beyond the default 1000 row limit", async () => {
    const db = createTestDatabase();
    db.tables.notes.push(...Array.from({ length: 1001 }, (_, i) => ({ ...note, owner_user_id: "user-test", id: `note-${String(i).padStart(4, "0")}` })));
    expect(await createNoteRepository("user-test", () => db.client).listAll()).toHaveLength(1001);
    expect(db.requests.filter((r) => r.method === "GET")).toHaveLength(3);
  });
  it("does not truncate records when the project caps responses below 1000 rows", async () => {
    const db = createTestDatabase();
    db.capRows(2);
    db.tables.notes.push(...Array.from({ length: 5 }, (_, i) => ({ ...note, owner_user_id: "user-test", id: `capped-${i}` })));
    expect((await createNoteRepository("user-test", () => db.client).listAll()).map((stored) => stored.id))
      .toEqual(["capped-0", "capped-1", "capped-2", "capped-3", "capped-4"]);
  });
  it("normalizes Postgres timestamp offsets and absent optional columns", async () => {
    const db = createTestDatabase();
    db.tables.notes.push({ ...note, owner_user_id: "user-test", approved_at: note.approved_at.replace("Z", "+00:00"),
      first_name: null, last_name: null, email: null, mobile_number: null, summary: null });
    const stored = await createNoteRepository("user-test", () => db.client).listAll();
    expect(stored[0].approved_at).toBe(note.approved_at);
    expect(stored[0].session_info).toEqual(note.session_info);
    expect(stored[0].summary).toBeUndefined();
  });
  it("returns confirmed patient writes and rejects patient read/write failures", async () => {
    const db = createTestDatabase();
    expect(await savePatient(patient, "user-test", () => db.client)).toEqual(patient);
    expect(await listPatients("user-test", () => db.client)).toEqual([patient]);
    db.fail("patients");
    await expect(savePatient(patient, "user-test", () => db.client)).rejects.toThrow(/storage/i);
    await expect(listPatients("user-test", () => db.client)).rejects.toThrow(/storage/i);
  });
  it("rejects chat write/read failures rather than claiming saved or no chats", async () => {
    const db = createTestDatabase(); db.fail("chats");
    const store = createChatStore("user-test", () => db.client);
    await expect(store.append({ id: "chat", patientId: patient.id, threadId: "thread", question: "q",
      response: { status: "error", message: "m" }, timestamp: "2026-10-05T10:00:00.000Z" }))
      .rejects.toThrow(/storage/i);
    await expect(store.listThreads(patient.id)).rejects.toThrow(/storage/i);
  });
});
