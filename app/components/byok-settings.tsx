"use client";

import { useState } from "react";
import { Settings } from "lucide-react";

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
        <Settings aria-hidden="true" size={20} />
        Settings
      </button>

      {isOpen ? (
        <section aria-label="Groq BYOK settings" aria-modal="true" className="byok-settings-panel" role="dialog">
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
