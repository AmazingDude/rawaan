import { WorkspaceSidebar } from "@/app/components/workspace-sidebar";
import { DocumentationBoundary } from "@/app/components/documentation-boundary";
import { auth } from "@clerk/nextjs/server";
import { requireUserClinicProfile } from "@/lib/auth/session";
import { WorkspaceSessionBoundary } from "@/app/components/workspace-session-boundary";
import { StorageError } from "@/lib/db/errors";
import styles from "./workspace.module.css";

export default async function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await auth.protect();
  let profile: Awaited<ReturnType<typeof requireUserClinicProfile>>;
  try {
    profile = await requireUserClinicProfile();
  } catch (error) {
    if (!(error instanceof StorageError)) throw error;
    return (
      <main className={styles.storageError} role="alert">
        <div className={styles.storageErrorCard}>
          <p className="settings-eyebrow">Signed in</p>
          <h1>Unable to load your workspace</h1>
          <p>Rawaan could not read your Supabase profile. Run the latest full <code>supabase/schema.sql</code> file in your project&apos;s SQL Editor. If it still fails, check the server-side Supabase URL and service key.</p>
          <a className="primary-button" href="/record">Try again</a>
        </div>
      </main>
    );
  }
  const { ownerId, clinicName } = profile;
  return (
    <WorkspaceSessionBoundary key={ownerId} ownerId={ownerId}><div className="workspace-shell">
      <WorkspaceSidebar clinicName={clinicName} />
      <main className="workspace-content-pane">
        <DocumentationBoundary />
        {children}
      </main>
    </div></WorkspaceSessionBoundary>
  );
}
