"use client";

import { useState } from "react";

import {
  clearStoredGroqByokKey,
  getStoredGroqByokKey,
  saveGroqByokKey,
} from "@/lib/llm/byok-groq-client";

export function ByokSettings() {
  const [isOpen, setIsOpen] = useState(false);
  const [keyValue, setKeyValue] = useState("");
  const [status, setStatus] = useState<"cleared" | "saved" | null>(null);

  function openSettings() {
    setKeyValue(getStoredGroqByokKey() ?? "");
    setStatus(null);
    setIsOpen(true);
  }

  function saveKey() {
    const key = keyValue.trim();
    if (!key) return;
    saveGroqByokKey(key);
    setStatus("saved");
  }

  function clearKey() {
    clearStoredGroqByokKey();
    setKeyValue("");
    setStatus("cleared");
  }

  return (
    <div className="sidebar-settings">
      <button className="sidebar-settings-trigger" onClick={openSettings} type="button">
        <svg aria-hidden="true" fill="none" height="20" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" width="20">
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.12 2.12-.06-.06A1.7 1.7 0 0 0 15.74 18a1.7 1.7 0 0 0-1.02 1.56V19.7h-3v-.14A1.7 1.7 0 0 0 10.7 18a1.7 1.7 0 0 0-1.88.34l-.06.06-2.12-2.12.06-.06A1.7 1.7 0 0 0 7 14.34a1.7 1.7 0 0 0-1.56-1.02H5.3v-3h.14A1.7 1.7 0 0 0 7 9.3a1.7 1.7 0 0 0-.34-1.88L6.6 7.36 8.72 5.24l.06.06A1.7 1.7 0 0 0 10.66 5a1.7 1.7 0 0 0 1.02-1.56V3.3h3v.14A1.7 1.7 0 0 0 15.7 5a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.12 2.12-.06.06A1.7 1.7 0 0 0 19.4 8.66a1.7 1.7 0 0 0 1.56 1.02h.14v3h-.14A1.7 1.7 0 0 0 19.4 15Z" />
        </svg>
        Settings
      </button>

      {isOpen ? (
        <section aria-label="Groq BYOK settings" className="byok-settings-panel">
          <div className="byok-settings-heading">
            <h2>Bring your own Groq key</h2>
            <button aria-label="Close settings" onClick={() => setIsOpen(false)} type="button">×</button>
          </div>
          <label className="form-field">
            Groq API key
            <input
              autoComplete="off"
              className="text-input"
              onChange={(event) => setKeyValue(event.target.value)}
              placeholder="gsk_…"
              type="password"
              value={keyValue}
            />
          </label>
          <p>Your Groq key is stored only in this browser and is never sent to Rawaan&apos;s servers.</p>
          <p>Your question and the retrieved note excerpts are sent directly to Groq to generate the answer — this is the same information that would otherwise be processed through our shared server.</p>
          <p>Without a personal key, Rawaan uses shared demo capacity, which may be rate-limited.</p>
          {status ? <p className="byok-settings-status" role="status">{status === "saved" ? "Key saved in this browser." : "Key cleared from this browser."}</p> : null}
          <div className="byok-settings-actions">
            <button className="secondary-button" onClick={clearKey} type="button">Clear key</button>
            <button className="primary-button" disabled={!keyValue.trim()} onClick={saveKey} type="button">Save key</button>
          </div>
          <a href="https://github.com/AmazingDude/rawaan" rel="noreferrer" target="_blank">Verify this yourself — the code is open source.</a>
        </section>
      ) : null}
    </div>
  );
}
