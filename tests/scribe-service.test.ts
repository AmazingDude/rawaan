import { describe, expect, it } from "vitest";

import { createScribeService } from "@/lib/actions/scribe";
import { createNoteRepository } from "@/lib/notes/repository";
import { createTestDatabase } from "./helpers/supabase";

const draftInput = {
  patient_id: "patient-amina-001",
  patient_display_name: "Amina Khan",
  consultation_date: "2026-08-22",
  transcript: "Chief complaint: Persistent headache\nPlan discussed: Keep a symptom diary",
};

async function createTestService(db = createTestDatabase()) {
  return createScribeService({
    approvalTime: () => "2026-08-22T10:00:00.000Z",
    createId: (() => {
      let count = 0;
      return () => `note-amina-${++count}`;
    })(),
    repository: createNoteRepository("user-test", () => db.client),
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

  it("atomically deduplicates simultaneous retries of the same reviewed draft", async () => {
    const db = createTestDatabase();
    let approval = 0;
    const service = createScribeService({
      approvalTime: () => `2026-08-22T10:00:0${approval++}.000Z`,
      createId: (() => {
        let count = 0;
        return () => `draft-amina-${++count}`;
      })(),
      repository: createNoteRepository("user-test", () => db.client),
    });
    const generated = await service.createDraft(draftInput);

    const [first, retry] = await Promise.all([
      service.approve(generated.draft),
      service.approve(generated.draft),
    ]);

    expect(first.id).toBe(retry.id);
    expect(db.tables.notes).toHaveLength(1);
  });

  it("rejects changed content reusing a prior draft identity", async () => {
    const service = await createTestService();
    const generated = await service.createDraft(draftInput);
    await service.approve(generated.draft);

    await expect(service.approve({
      ...generated.draft,
      summary: "Different reviewed content",
    })).rejects.toThrow(/storage/i);
    expect(await service.listByPatient(draftInput.patient_id)).toHaveLength(1);
  });

  it("recognizes the same approved draft after JSONB metadata key reordering", async () => {
    const db = createTestDatabase();
    const service = await createTestService(db);
    const generated = await service.createDraft(draftInput);
    const draft = { ...generated.draft, session_info: {
      session_type: "manual" as const, duration_seconds: 0,
      recorded_at: "2026-10-05T10:00:00.000Z", transcript_source: "clinician-entered",
    } };
    const approved = await service.approve(draft);
    const metadata = db.tables.notes[0].session_info as Record<string, unknown>;
    db.tables.notes[0].session_info = Object.fromEntries(Object.entries(metadata).reverse());
    const retry = await service.approve(draft);
    expect(retry.id).toBe(approved.id);
    expect(db.tables.notes).toHaveLength(1);
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
