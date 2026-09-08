"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { importClientShareAction, previewClientShareAction } from "@/app/client-sharing-actions";
import { RequestStatus } from "@/app/components/request-status";
import type { ClientShareClaim, ClientSharePreview } from "@/lib/sharing/contracts";
import styles from "./client-sharing.module.css";

export function ClientShareReceiver({ token }: { token: string | null }) {
  const [preview, setPreview] = useState<ClientSharePreview | null>(null);
  const [claim, setClaim] = useState<ClientShareClaim | null>(null);
  const [loading, setLoading] = useState(Boolean(token));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(token ? "" : "A valid sharing link is required. Open the link your colleague sent you, or paste it from the Clients page.");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!token) return;
    let current = true;
    previewClientShareAction(token).then(result => {
      if (!current) return;
      if (result.ok) { setPreview(result.value); setError(""); }
      else setError(result.message);
    }).catch(() => { if (current) setError("Could not load the shared client. Check your connection and try again."); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [token, attempt]);

  async function accept() {
    if (!token) return;
    setBusy(true); setError("");
    try {
      const result = await importClientShareAction(token);
      if (result.ok) setClaim(result.value);
      else setError(result.message);
    } catch { setError("The import could not be confirmed. Try again; the same link will not create a duplicate copy."); }
    finally { setBusy(false); }
  }
  const importedId = claim?.patient_id ?? preview?.imported_patient_id;
  return <section aria-busy={loading || busy} className={styles.receiver}>
    <p className={styles.eyebrow}>Clinician handoff</p>
    <h1>{importedId ? "Your client history is ready" : "A colleague shared a client"}</h1>
    <p className={styles.description}>{importedId ? "The client and their shared clinical history are saved in your workspace." : "Bring their approved clinical history into your own Rawaan workspace."}</p>
    {loading ? <RequestStatus label="Checking sharing link..." skeleton/> : null}
    {preview ? <div className={styles.preview}><h2>{preview.display_name}</h2><p>Shared by <strong>{preview.source_clinic_name}</strong></p><div className={styles.counts}><span>{preview.note_count} approved {preview.note_count === 1 ? "session" : "sessions"}</span><span>{preview.plan_count} reviewed {preview.plan_count === 1 ? "plan" : "plans"}</span></div>
      <p>Includes client details, saved clinical context, complete session notes and transcripts. Original approval and review dates are kept.</p>
      <p className={styles.muted}>Shared {new Date(preview.created_at).toLocaleDateString("en-GB")} · Link expires {new Date(preview.expires_at).toLocaleDateString("en-GB")}</p>
    </div> : null}
    {!importedId && preview ? <><p>A new client record will be created. It won&apos;t merge with an existing client. Changes you make afterward stay in your workspace; the sending clinician keeps their own copy.</p><p className={styles.muted}>Private AI conversations and unfinished drafts are not included.</p></> : null}
    {error ? <p className={styles.error} role="alert">{error}</p> : null}
    <div className={styles.actions}>
      {importedId ? <><Link className="primary-button" href={`/clients/${encodeURIComponent(importedId)}?tab=sessions`}>Open client history</Link><Link className="secondary-button" href={`/rawaan-ai?patient=${encodeURIComponent(importedId)}`}>Ask Rawaan about this client</Link></> : preview ? <button className="primary-button" disabled={busy || loading} onClick={() => void accept()} type="button">{busy ? "Importing client and history..." : "Import client and history"}</button> : token && !loading ? <button className="secondary-button" onClick={() => { setError(""); setLoading(true); setAttempt(value => value + 1); }} type="button">Try link again</button> : null}
      <Link className="ghost-button" href="/clients">Back to clients</Link>
    </div>
    {importedId ? <p className={styles.notice} role="status">{claim?.already_imported || preview?.imported_patient_id ? "This link was already imported into your workspace. No duplicate was created." : "Client imported successfully. Rawaan can now use these sessions as context."}</p> : null}
  </section>;
}
