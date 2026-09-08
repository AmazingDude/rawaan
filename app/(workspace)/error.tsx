"use client";

import { STORAGE_ERROR_MESSAGE } from "@/lib/db/errors";

export default function WorkspaceError() {
  return (
    <div className="roster-empty-state">
      <p className="roster-empty-title">Unable to load the workspace</p>
      <p className="roster-empty-body" role="alert">{STORAGE_ERROR_MESSAGE}</p>
      <button className="primary-button" onClick={() => window.location.reload()} type="button">Try again</button>
    </div>
  );
}
