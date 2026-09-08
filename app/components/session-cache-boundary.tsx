"use client";
import { useUser } from "@clerk/nextjs";
import { useEffect } from "react";
import { WORKSPACE_DRAFT_STORAGE_KEY } from "@/app/components/workspace-draft-storage";

export function SessionCacheBoundary() {
  const { user, isLoaded } = useUser();
  useEffect(() => {
    if (!isLoaded) return;
    try {
      const currentKey = user ? `${WORKSPACE_DRAFT_STORAGE_KEY}:${user.id}` : null;
      for (const key of Object.keys(sessionStorage)) {
        if (key.startsWith(WORKSPACE_DRAFT_STORAGE_KEY) && key !== currentKey) sessionStorage.removeItem(key);
      }
    } catch { /* In-memory drafts remain usable when browser storage is blocked. */ }
  }, [isLoaded, user]);
  return null;
}
