"use client";

import { Copy, Download, Share2, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClientShareAction, listClientSharesAction, revokeClientShareAction, listClientImportsAction } from "@/app/client-sharing-actions";
import { useAccessibleDialog } from "@/app/components/use-accessible-dialog";
import { RequestStatus } from "@/app/components/request-status";
import { clientSharePath, parseClientShareLink, type ClientShareListItem, type ClientImportHistory } from "@/lib/sharing/contracts";
import styles from "./client-sharing.module.css";

export function sharingDate(value: string): string {
  return new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function ShareClientDialog({ patientId, displayName, onClose }: { patientId: string; displayName: string; onClose: () => void }) {
  const dialog = useRef<HTMLDivElement>(null);
  const [permission, setPermission] = useState(false);
  const [busy, setBusy] = useState(false);
  const [shares, setShares] = useState<ClientShareListItem[] | null>(null);
  const [link, setLink] = useState("");
  const [linkShareId, setLinkShareId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [now, setNow] = useState(() => Date.now());
  useAccessibleDialog(dialog, () => { if (!busy) onClose(); }, true);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    let current = true;
    listClientSharesAction(patientId).then(result => {
      if (!current) return;
      if (result.ok) setShares(items => items === null ? result.value : [...items, ...result.value.filter(item => !items.some(existing => existing.id === item.id))]);
      else { setShares(items => items ?? []); setError(result.message); }
    }).catch(() => { if (current) { setShares(items => items ?? []); setError("Could not load sharing links. Please reopen this dialog."); } });
    return () => { current = false; };
  }, [patientId]);

  async function create() {
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await createClientShareAction({ patientId, permissionConfirmed: permission });
      if (!result.ok) { setError(result.message); return; }
      setLink(new URL(result.value.path, window.location.origin).href);
      setLinkShareId(result.value.id);
      setShares(items => [{ ...result.value, revoked_at: null, imported_at: null }, ...(items ?? [])]);
    } catch { setError("Could not create a sharing link. Please try again."); }
    finally { setBusy(false); }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(link); setNotice("Link copied. Send it directly to the receiving clinician."); }
    catch { setError("Could not copy automatically. Select the link above and copy it manually."); }
  }
  async function revoke(id: string) {
    setBusy(true); setError(""); setNotice("");
    try {
      const result = await revokeClientShareAction(id);
      if (!result.ok) { setError(result.message); return; }
      setShares(items => items?.map(item => item.id === id ? { ...item, revoked_at: new Date().toISOString() } : item) ?? []);
      // A just-generated link is no longer offered if its share is revoked.
      if (linkShareId === id) { setLink(""); setLinkShareId(null); }
      setNotice("Sharing link revoked. It can no longer be imported.");
    } catch { setError("Could not revoke the link. Please try again."); }
    finally { setBusy(false); }
  }

  return <div className={styles.overlay} onClick={event => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <div aria-labelledby="share-client-title" aria-modal="true" className={styles.dialog} ref={dialog} role="dialog" tabIndex={-1}>
      <div className={styles.heading}><h2 id="share-client-title">Share {displayName}</h2><button aria-label="Close sharing dialog" className={styles.close} disabled={busy} onClick={onClose} type="button"><X size={18}/></button></div>
      <p className={styles.description}>Hand this client&apos;s history to another clinician on Rawaan.</p>
      <div className={styles.scope}><h3>What the link includes</h3><ul>
        <li>Client details and saved clinical context</li><li>All approved notes, full transcripts and session information</li><li>Reviewed treatment plans and their source references</li>
      </ul><p>Private AI conversations and unfinished drafts stay in your account. The recipient gets an independent copy of the history as it is now.</p></div>
      <p className={styles.muted}>Anyone signed in to Rawaan with this link can import it once. The link expires in seven days. You can revoke it before import; an imported copy stays with its recipient.</p>
      <label className={styles.permission}><input checked={permission} disabled={busy} onChange={event => setPermission(event.currentTarget.checked)} type="checkbox"/>I have permission to share this client&apos;s clinical record with the receiving clinician.</label>
      <button className="primary-button" disabled={!permission || busy} onClick={() => void create()} type="button"><Share2 size={16}/>{busy ? "Working..." : "Create sharing link"}</button>
      {link ? <div className={styles.linkBox}><p><strong>Your sharing link is ready</strong></p><p>Copy it before closing. This link is only shown here once.</p><label className={styles.field}>Sharing link<input onFocus={event => event.currentTarget.select()} readOnly value={link}/></label><button className="secondary-button" onClick={() => void copy()} type="button"><Copy size={15}/> Copy link</button></div> : null}
      {notice ? <p className={styles.notice} role="status">{notice}</p> : null}
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      <div className={styles.section}><h3>Sharing links</h3>
        {shares === null ? <RequestStatus label="Loading sharing links..."/> : !shares.length ? <p className={styles.muted}>No sharing links created for this client.</p> : <ul className={styles.list}>{shares.map(item => {
          const status = item.imported_at ? "Imported" : item.revoked_at ? "Revoked" : new Date(item.expires_at).getTime() <= now ? "Expired" : "Ready to import";
          return <li key={item.id}><div><strong>{status}</strong><span className={styles.muted}>Created {sharingDate(item.created_at)} · {item.note_count} sessions<br/>Expires {sharingDate(item.expires_at)}</span></div>{status === "Ready to import" ? <button className={styles.smallButton} disabled={busy} onClick={() => void revoke(item.id)} type="button">Revoke link</button> : null}</li>;
        })}</ul>}
      </div>
    </div>
  </div>;
}

export function ShareClientButton({ patientId, displayName }: { patientId: string; displayName: string }) {
  const [open, setOpen] = useState(false);
  return <><button className="secondary-button" onClick={() => setOpen(true)} type="button"><Share2 aria-hidden="true" size={16}/> Share client</button>{open ? <ShareClientDialog displayName={displayName} onClose={() => setOpen(false)} patientId={patientId}/> : null}</>;
}

function ImportLinkDialog({ onClose }: { onClose: () => void }) {
  const dialog = useRef<HTMLDivElement>(null);
  const [value, setValue] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();
  useAccessibleDialog(dialog, onClose, true);
  function submit(event: FormEvent) {
    event.preventDefault();
    const token = parseClientShareLink(value, window.location.origin);
    if (!token) { setError("Paste a client sharing link from this Rawaan website."); return; }
    router.push(clientSharePath(token)); onClose();
  }
  return <div className={styles.overlay} onClick={event => { if (event.target === event.currentTarget) onClose(); }}><div aria-labelledby="import-link-title" aria-modal="true" className={styles.dialog} ref={dialog} role="dialog" tabIndex={-1}>
    <div className={styles.heading}><h2 id="import-link-title">Import a shared client</h2><button aria-label="Close import dialog" className={styles.close} onClick={onClose} type="button"><X size={18}/></button></div>
    <p className={styles.description}>Received a link from another clinician? Preview the handoff, then add the client and their approved history to your workspace.</p>
    <form onSubmit={submit}><label className={styles.dropZone} onDragOver={event => event.preventDefault()} onDrop={event => {
      event.preventDefault(); const text = event.dataTransfer.getData("text/uri-list") || event.dataTransfer.getData("text/plain");
      const links = text.split(/\r?\n/).filter(line => line.trim() && !line.startsWith("#"));
      setValue(links.length === 1 ? links[0].trim() : text.trim()); setError("");
    }}>Paste or drop a sharing link<textarea autoComplete="off" onChange={event => { setValue(event.currentTarget.value); setError(""); }} placeholder="Paste the Rawaan sharing link here" spellCheck={false} value={value}/><span>You&apos;ll review the client before anything is imported.</span></label>
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      <button className="primary-button" disabled={!value.trim()} type="submit">Preview shared client</button>
    </form>
  </div></div>;
}

export function ImportClientButton() {
  const [open, setOpen] = useState(false);
  return <><button className="secondary-button" onClick={() => setOpen(true)} type="button"><Download aria-hidden="true" size={16}/> Import shared client</button>{open ? <ImportLinkDialog onClose={() => setOpen(false)}/> : null}</>;
}

export function ClientImportHistory({ patientId }: { patientId: string }) {
  const [history, setHistory] = useState<ClientImportHistory[] | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let current = true;
    listClientImportsAction(patientId).then(result => { if (current) { if (result.ok) setHistory(result.value); else setError(true); } })
      .catch(() => { if (current) setError(true); });
    return () => { current = false; };
  }, [patientId]);
  if (error) return <p className={styles.muted} role="status">Sharing history could not be loaded. Refresh to try again.</p>;
  if (history === null) return <RequestStatus label="Loading sharing history..."/>;
  return <>{history.map(item => <aside className={styles.history} key={item.id}><h3>History shared by {item.source_clinic_name}</h3><p>Shared {sharingDate(item.shared_at)} · Imported {sharingDate(item.imported_at)}</p><p>{item.note_count} sessions · {item.plan_count} reviewed plans</p><p>The original clinician&apos;s approval and review dates are preserved. This copy updates independently from the sending clinic.</p></aside>)}</>;
}
