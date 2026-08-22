import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { noteSchema, type ApprovedNote } from "@/lib/notes/schema";

const storedNotesSchema = noteSchema.array();

async function readNotes(storagePath: string): Promise<ApprovedNote[]> {
  try {
    const storedNotes = await readFile(storagePath, "utf8");
    return storedNotesSchema.parse(JSON.parse(storedNotes));
  } catch (error) {
    if (isMissingFileError(error)) {
      return [];
    }

    throw error;
  }
}

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

export function createNoteRepository(storagePath: string) {
  return {
    async listByPatient(patientId: string): Promise<ApprovedNote[]> {
      const notes = await readNotes(storagePath);
      return notes.filter((note) => note.patient_id === patientId);
    },

    async save(candidate: unknown): Promise<ApprovedNote> {
      if (
        typeof candidate === "object" &&
        candidate !== null &&
        "approval_status" in candidate &&
        candidate.approval_status !== "approved"
      ) {
        throw new Error("Only approved notes can be persisted");
      }

      const approvedNote = noteSchema.parse(candidate);
      const notes = await readNotes(storagePath);

      await mkdir(dirname(storagePath), { recursive: true });
      await writeFile(storagePath, JSON.stringify([...notes, approvedNote], null, 2));

      return approvedNote;
    },
  };
}
