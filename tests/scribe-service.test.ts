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
    createId: (() => {
      let count = 0;
      return () => `note-amina-${++count}`;
    })(),
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
    expect(approved.id).toBe("note-amina-1");
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

  it("does not create duplicates when approve is called twice on the same draft", async () => {
    const service = await createTestService();

    const generated = await service.createDraft(draftInput);
    const firstApproval = await service.approve(generated.draft);

    const secondApproval = await service.approve(generated.draft);

    // Both calls should return the same note — no duplicate created
    expect(secondApproval.id).toBe(firstApproval.id);

    // Only one approved note should exist in storage
    const storedNotes = await service.listByPatient(draftInput.patient_id);
    expect(storedNotes).toHaveLength(1);
    expect(storedNotes[0].id).toBe(firstApproval.id);
  });

  it("allows separate same-day consultations for the same patient", async () => {
    const service = await createTestService();
    const firstDraft = await service.createDraft(draftInput);
    const secondDraft = await service.createDraft({
      ...draftInput,
      transcript: "Chief complaint: New dizziness\nPlan discussed: Keep a symptom diary",
    });

    const firstApproval = await service.approve(firstDraft.draft);
    const secondApproval = await service.approve(secondDraft.draft);

    expect(secondApproval.id).not.toBe(firstApproval.id);
    expect(await service.listByPatient(draftInput.patient_id)).toHaveLength(2);
  });
});
