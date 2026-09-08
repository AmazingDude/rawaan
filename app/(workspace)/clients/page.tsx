import { listClientsAction } from "@/app/actions";
import { ClientsDirectory } from "@/app/components/clients-directory";

// The roster reflects the live approved-note store, which changes when a
// clinician approves a note during a session. Force per-request rendering so
// newly approved patients appear without a rebuild.
export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  const clients = await listClientsAction();
  return <ClientsDirectory clients={clients} />;
}
