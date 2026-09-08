"use client";

import { useEffect, useState } from "react";

const LEGACY_GROQ_KEY = "rawaan.groq-byok-key";

export function DocumentationBoundary() {
  const [removedLegacyKey, setRemovedLegacyKey] = useState(false);

  useEffect(() => {
    let noticeTimer: number | undefined;
    try {
      if (window.localStorage.getItem(LEGACY_GROQ_KEY) === null) return;
      window.localStorage.removeItem(LEGACY_GROQ_KEY);
      noticeTimer = window.setTimeout(() => setRemovedLegacyKey(true), 0);
    } catch {
      // Brain no longer reads browser-stored provider keys.
    }
    return () => {
      if (noticeTimer !== undefined) window.clearTimeout(noticeTimer);
    };
  }, []);

  return removedLegacyKey ? (
    <span className="legacy-key-cleanup-status" role="status">
      An unused Groq key saved by an earlier version was removed from this browser.
    </span>
  ) : null;
}
