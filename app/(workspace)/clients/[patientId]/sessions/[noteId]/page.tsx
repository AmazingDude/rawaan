import Link from "next/link";

import { getClientDetailAction } from "@/app/actions";
import { ApprovedSessionView } from "@/app/components/approved-session-view";

export const dynamic = "force-dynamic";

export default async function ApprovedSessionPage({
  params,
}: {
  params: Promise<{ patientId: string; noteId: string }>;
}) {
  const { patientId, noteId } = await params;
  const { client, notes } = await getClientDetailAction(patientId);
  const note = client ? notes.find((candidate) => candidate.id === noteId) : undefined;

  if (!client || !note) {
    return (
      <main className="approved-session-not-found">
        <h1>Session not found</h1>
        <p>This session is unavailable.</p>
        <Link className="secondary-button" href="/clients">Back to clients</Link>
      </main>
    );
  }

  const clientHref = `/clients/${encodeURIComponent(client.patientId)}`;
  return <ApprovedSessionView clientHref={clientHref} note={note} />;
}
