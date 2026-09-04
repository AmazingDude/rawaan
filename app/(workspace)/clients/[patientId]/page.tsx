import Link from "next/link";

import { getClientDetailAction } from "@/app/actions";
import { ClientDetailView } from "@/app/components/client-detail-view";

// Notes and chat history change at runtime as the clinician works, so the
// detail page always renders per request.
export const dynamic = "force-dynamic";

export default async function ClientDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ patientId: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { patientId } = await params;
  const { tab } = await searchParams;
  const { client, notes } = await getClientDetailAction(patientId);

  if (!client) {
    return (
      <div className="wireframe-page">
        <div className="roster-empty-state">
          <p className="roster-empty-title">Client not found</p>
          <p className="roster-empty-body">
            This client may have been removed.{" "}
            <Link className="roster-empty-link" href="/clients">
              Back to all clients
            </Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <ClientDetailView client={client} initialTab={tab} notes={notes} />
  );
}
