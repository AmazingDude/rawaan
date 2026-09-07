import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createScribeService } from "@/lib/actions/scribe";

const temporaryDirectories: string[] = [];

const draftInput = {
  patient_id: "patient-amina-001",
  patient_display_name: "Amina Khan",
  consultation_date: "2026-08-22",
  transcript: "Chief complaint: Persistent headache\nPlan discussed: Keep a symptom diary",
};

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { force: true, recursive: true }),
    ),
  );
});

async function createTestService() {
  const directory = await mkdtemp(join(tmpdir(), "rawaan-scribe-"));
  temporaryDirectories.push(directory);

  return createScribeService({
    approvalTime: () => "2026-08-22T10:00:00.000Z",
    createId: () => "note-amina-001",
    storagePath: join(directory, "notes.json"),
  });
}

describe("scribe service", () => {
  it("creates a draft, then persists only the approved version", async () => {
    const service = await createTestService();

    const generated = await service.createDraft(draftInput);
    expect(generated.source).toBe("local-demo");
    expect(generated.draft.approval_status).toBe("draft");

    const approved = await service.approve(generated.draft);

    expect(approved.approval_status).toBe("approved");
    expect(approved.id).toBe("note-amina-001");
    expect(await service.listByPatient(draftInput.patient_id)).toEqual([approved]);
  });

  it("rejects blank transcript input before generation", async () => {
    const service = await createTestService();

    await expect(
      service.createDraft({
        ...draftInput,
        transcript: "   ",
      }),
    ).rejects.toThrow();
  });

  it("does not create duplicates when approve is called twice on the same note", async () => {
    const service = await createTestService();

    const generated = await service.createDraft(draftInput);
    const firstApproval = await service.approve(generated.draft);

    // Simulate a second approval attempt with the same patient and date
    // (e.g., user double-clicked or race condition)
    const duplicateDraft = await service.createDraft({
      ...draftInput,
      transcript: "Different transcript but same patient/date",
    });
    const secondApproval = await service.approve(duplicateDraft.draft);

    // Both calls should return the same note — no duplicate created
    expect(secondApproval.id).toBe(firstApproval.id);

    // Only one approved note should exist in storage
    const storedNotes = await service.listByPatient(draftInput.patient_id);
    expect(storedNotes).toHaveLength(1);
    expect(storedNotes[0].id).toBe(firstApproval.id);
  });
});
