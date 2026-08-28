import { WorkspaceSidebar } from "@/app/components/workspace-sidebar";

export default function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="workspace-shell">
      <WorkspaceSidebar />
      <main className="workspace-content-pane">{children}</main>
    </div>
  );
}
