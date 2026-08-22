import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createNoteRepository } from "@/lib/notes/repository";
import { noteDraftSchema, noteSchema } from "@/lib/notes/schema";

const draftNote = {
  patient_id: "patient-amina-001",
  patient_display_name: "Amina Khan",
  consultation_date: "2026-08-22",
  chief_complaint: "Persistent headache",
  history: ["Headache for three days"],
  symptoms: ["Headache", "Light sensitivity"],
  assessment_discussed: ["Clinician discussed monitoring triggers"],
  plan_discussed: ["Keep a symptom diary"],
  medications_mentioned: [],
  follow_up: "Return in two weeks",
  uncertainties: ["Duration of each headache episode was not clarified"],
  approval_status: "draft" as const,
  raw_transcript:
    "Patient reports a headache for three days and light sensitivity. Clinician discussed monitoring triggers and keeping a symptom diary. Return in two weeks.",
};

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { force: true, recursive: true }),
    ),
  );
});

describe("note schemas", () => {
  it("accepts a complete structured draft with unresolved items retained", () => {
    const result = noteDraftSchema.safeParse(draftNote);

    expect(result.success).toBe(true);
    expect(result.data?.uncertainties).toEqual([
      "Duration of each headache episode was not clarified",
    ]);
  });

  it("rejects a note missing the raw transcript provenance", () => {
    const withoutTranscript = { ...draftNote, raw_transcript: undefined };

    expect(noteDraftSchema.safeParse(withoutTranscript).success).toBe(false);
  });

  it("requires an approved persisted note to include an identifier and approval time", () => {
    expect(
      noteSchema.safeParse({
        ...draftNote,
        approval_status: "approved",
      }).success,
    ).toBe(false);
  });
});

describe("note repository", () => {
  it("rejects draft notes and persists an approved note with its raw transcript", async () => {
    const directory = await mkdtemp(join(tmpdir(), "rawaan-notes-"));
    temporaryDirectories.push(directory);
    const storagePath = join(directory, "notes.json");
    const repository = createNoteRepository(storagePath);

    await expect(repository.save(draftNote)).rejects.toThrow(
      "Only approved notes can be persisted",
    );

    const approvedNote = await repository.save({
      ...draftNote,
      approval_status: "approved",
      approved_at: "2026-08-22T10:00:00.000Z",
      id: "note-amina-001",
    });

    expect(approvedNote.raw_transcript).toBe(draftNote.raw_transcript);
    expect(await repository.listByPatient("patient-amina-001")).toEqual([
      approvedNote,
    ]);

    const persistedData = await readFile(storagePath, "utf8");
    expect(persistedData).toContain(draftNote.raw_transcript);
  });
});
