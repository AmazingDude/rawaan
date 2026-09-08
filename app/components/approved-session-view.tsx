"use client";

import { useRouter } from "next/navigation";

import { SessionWorkspaceView } from "@/app/components/session-workspace-view";
import type { ApprovedNote } from "@/lib/notes/schema";

export function ApprovedSessionView({ note, clientHref }: { note: ApprovedNote; clientHref: string }) {
  const router = useRouter();
  return (
    <SessionWorkspaceView
      backLabel="Back to sessions"
      draft={note}
      isManualEntry={note.session_info?.session_type === "manual"}
      onBack={() => router.push(`${clientHref}?tab=sessions`)}
    />
  );
}
