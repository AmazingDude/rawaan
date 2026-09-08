import type { Metadata } from "next";
import { ClientShareReceiver } from "@/app/components/client-share-receiver";
import { shareTokenSchema } from "@/lib/sharing/contracts";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Import shared client | Rawaan", robots: { index: false, follow: false }, referrer: "no-referrer",
};

export default async function ClientImportPage({ searchParams }: { searchParams: Promise<{ share?: string | string[] }> }) {
  const params = await searchParams;
  const parsed = shareTokenSchema.safeParse(params.share);
  const token = parsed.success ? parsed.data : null;
  return <ClientShareReceiver key={token ?? "missing"} token={token}/>;
}
