import { ScribeDashboard } from "@/app/components/scribe-dashboard";
import { createNoteRepository } from "@/lib/notes/repository";
import { requireUserStorage } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function RecordPage({
  searchParams,
}: {
  searchParams: Promise<{ patient?: string }>;
}) {
  const { patient } = await searchParams;
  const { ownerId, getClient } = await requireUserStorage();
  const notes = await createNoteRepository(ownerId, getClient).listAll();

  return <ScribeDashboard key={ownerId} ownerId={ownerId} initialNotes={notes} initialPatientId={patient} />;
}
