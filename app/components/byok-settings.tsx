"use client";

import { useState } from "react";

import {
  clearStoredGroqByokKey,
  getStoredGroqByokKey,
  saveGroqByokKey,
} from "@/lib/llm/byok-groq-client";

export function ByokSettings() {
  const [keyValue, setKeyValue] = useState("");
  const [status, setStatus] = useState<"cleared" | "saved" | null>(null);

  function loadStoredKey() {
    setKeyValue(getStoredGroqByokKey() ?? "");
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
    <section aria-labelledby="byok-settings-title" className="byok-settings-panel">
      <div className="byok-settings-heading">
        <div>
          <p className="settings-eyebrow">Rawaan AI</p>
          <h1 id="byok-settings-title">Bring your own Groq key</h1>
        </div>
      </div>
      <p className="settings-intro">Use a personal Groq key for direct browser-to-Groq Brain answers.</p>
      <label className="form-field">
        Groq API key
        <input
          autoComplete="off"
          className="text-input"
          onChange={(event) => setKeyValue(event.target.value)}
          onFocus={loadStoredKey}
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
  );
}
