import { beforeEach, describe, expect, it, vi } from "vitest";
import seed from "@/data/seed/demo-patients.json";
import { noteSchema, noteToRow } from "@/lib/notes/schema";
import { createTestDatabase } from "@/tests/helpers/supabase";
import { translateTranscriptToUrdu } from "@/lib/llm/transcript-urdu";
import { createGroqWhisperProvider } from "@/lib/transcription/groq-whisper";
import { querySessionRecordAction } from "@/app/actions";

const session = vi.hoisted(() => ({ storage: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ requireUserStorage: session.storage }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
beforeEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("saved session chat", () => {
  it("retrieves only the selected owned session, never other sessions or users", async () => {
    const db = createTestDatabase();
    const note = noteSchema.parse(seed[0]);
    const other = noteSchema.parse(seed[1]);
    db.tables.notes.push({ ...noteToRow(note), owner_user_id: "owner-one" }, { ...noteToRow(other), owner_user_id: "owner-one" });
    session.storage.mockResolvedValue({ ownerId: "owner-one", getClient: () => db.client });
    const result = await querySessionRecordAction(note.patient_id, note.id, "What headache symptoms were documented?");
    expect(result).toMatchObject({ ok: true, response: { status: "supported" } });
    if (result.ok && result.response.status === "supported") expect(result.response.sources.every(source => source.noteId === note.id)).toBe(true);
    expect(db.requests.every(request => request.url.searchParams.get("owner_user_id") === "eq.owner-one")).toBe(true);
    session.storage.mockResolvedValue({ ownerId: "other-owner", getClient: () => db.client });
    const foreign = await querySessionRecordAction(note.patient_id, note.id, "What headache symptoms were documented?");
    expect(foreign).toMatchObject({ ok: true, response: { status: "no_supporting_record" } });
    expect(db.requests.every(request => request.method === "GET")).toBe(true);
  });
  it("declines missing sessions even when the patient has other notes", async () => {
    const db = createTestDatabase();
    const note = noteSchema.parse(seed[0]);
    db.tables.notes.push({ ...noteToRow(note), owner_user_id: "owner-one" });
    session.storage.mockResolvedValue({ ownerId: "owner-one", getClient: () => db.client });
    expect(await querySessionRecordAction(note.patient_id, "missing-session", "What headache symptoms were documented?"))
      .toMatchObject({ ok: true, response: { status: "no_supporting_record" } });
  });
});

describe("Urdu transcript display", () => {
  const source = "दवा नहीं ली। GPHCR 19";
  it("keeps English and Urdu source text unchanged without a model call", async () => {
    const complete = vi.fn();
    expect(await translateTranscriptToUrdu("اردو English 19", { complete })).toEqual({ ok: true, transcript: "اردو English 19" });
    expect(complete).not.toHaveBeenCalled();
  });
  it("renders Urdu while preserving the source, Latin terms, and numbers", async () => {
    const complete = vi.fn().mockResolvedValue(JSON.stringify({ lines: ["دوا نہیں لی۔ GPHCR 19"] }));
    expect(await translateTranscriptToUrdu(source, { complete })).toEqual({ ok: true, transcript: "دوا نہیں لی۔ GPHCR 19" });
    expect(source).toBe("दवा नहीं ली। GPHCR 19");
    expect(complete.mock.calls[0][0].user).toContain(source);
  });
  it.each(["", "not json", JSON.stringify({ lines: [source] }), JSON.stringify({ lines: ["دوا لی۔"] }), JSON.stringify({ lines: ["دوا لی۔ GPHCR 19"] }), JSON.stringify({ lines: ["دوا نہیں لی۔ GPHCR 19 500"] }), JSON.stringify({ lines: [] })])("rejects unusable or incomplete output: %s", async output => {
    expect(await translateTranscriptToUrdu(source, { complete: async () => output })).toMatchObject({ ok: false });
  });
  it("reports provider failure without returning Hindi as an Urdu result", async () => {
    expect(await translateTranscriptToUrdu(source, { complete: async () => { throw new Error("unavailable"); } })).toMatchObject({ ok: false });
  });
});

describe("new Urdu recordings", () => {
  it("sets the ASR input language to Urdu without translating to English", async () => {
    vi.stubEnv("GROQ_API_KEY", "test-key");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ text: "دوا نہیں لی۔ English" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await createGroqWhisperProvider().transcribe({ audio: new File(["audio"], "recording.webm", { type: "audio/webm" }) })).toEqual({ transcript: "دوا نہیں لی۔ English" });
    const body = fetchMock.mock.calls[0][1].body as FormData;
    expect(body.get("language")).toBe("ur");
    expect(fetchMock.mock.calls[0][0]).toContain("/audio/transcriptions");
  });
});
