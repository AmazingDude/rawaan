"use client";
import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

export function WorkspaceSessionBoundary({ ownerId, children }: { ownerId: string; children: ReactNode }) {
  const { isLoaded, userId } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (!isLoaded || userId === ownerId) return;
    if (!userId) router.replace("/sign-in");
    else router.refresh();
  }, [isLoaded, userId, ownerId, router]);
  // Hide prior-account React state immediately, before the server refresh.
  if (!isLoaded || userId !== ownerId) {
    return <main className="auth-page"><p role="status">Loading your workspace…</p></main>;
  }
  return <div key={ownerId}>{children}</div>;
}
