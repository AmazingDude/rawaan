import { join } from "node:path";

import { ScribeDashboard } from "@/app/components/scribe-dashboard";
import { createNoteRepository } from "@/lib/notes/repository";

export const dynamic = "force-dynamic";

export default async function RecordPage({
  searchParams,
}: {
  searchParams: Promise<{ patient?: string }>;
}) {
  const { patient } = await searchParams;
  const notesStoragePath = join(process.cwd(), "data", "notes.json");
  const noteRepository = createNoteRepository(notesStoragePath);
  const notes = await noteRepository.listAll().catch(() => []);

  return <ScribeDashboard initialNotes={notes} initialPatientId={patient} />;
}
