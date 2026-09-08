"use client";

import { ArrowLeft, ChevronDown, Clipboard, Video } from "lucide-react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { RequestStatus } from "@/app/components/request-status";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

import type { ClientRecord } from "@/app/actions";
import { ClientChatsTab } from "@/app/components/client-chats-tab";
import { SessionMindmap } from "@/app/components/session-mindmap";
import type { ApprovedNote } from "@/lib/notes/schema";
import { projectTreatmentPlan } from "@/lib/notes/treatment-plan";

const ReviewedPlansPanel = dynamic(() => import("@/app/components/reviewed-plans-panel").then(module => module.ReviewedPlansPanel), { loading: () => <RequestStatus label="Loading reviewed plans…" skeleton/> });

type ClientTab = "details" | "sessions" | "treatment" | "chats" | "mindmap";

const VALID_TABS: ClientTab[] = ["details", "sessions", "treatment", "chats", "mindmap"];

const TAB_LABELS: Record<ClientTab, string> = {
  details: "Details",
  sessions: "Sessions",
  treatment: "Treatment Plan",
  chats: "Chats",
  mindmap: "Mind map",
};

interface ClientDetailViewProps {
  client: ClientRecord;
  initialTab?: string;
  notes: ApprovedNote[];
}

export function ClientDetailView({
  client,
  initialTab,
  notes,
}: ClientDetailViewProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedTab = searchParams.get("tab") ?? initialTab;
  const activeTab: ClientTab = VALID_TABS.includes(requestedTab as ClientTab)
    ? (requestedTab as ClientTab)
    : "details";
  const [expandedNoteId, setExpandedNoteId] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  // Notes arrive newest-first; the mind map defaults to the latest session.
  const [mindmapNoteId, setMindmapNoteId] = useState<string | null>(
    notes[0]?.id ?? null,
  );

  // Notes are newest-first, so the earliest consultation is the last element.
  const since = client.firstSessionDate
    ? new Date(`${client.firstSessionDate}T00:00:00`).toLocaleDateString("en-US", { month: "short", year: "numeric" })
    : null;
  const mindmapNote = notes.find((note) => note.id === mindmapNoteId) ?? null;
  const clientHref = `/clients/${encodeURIComponent(client.patientId)}`;

  function selectTab(tab: ClientTab) {
    router.push(`${clientHref}?tab=${tab}`, { scroll: false });
  }

  async function copySummary(note: ApprovedNote) {
    try {
      await navigator.clipboard.writeText(note.summary?.trim() || note.chief_complaint.trim() || "Not documented");
      setCopyStatus(`Summary copied for ${note.consultation_date}.`);
    } catch {
      setCopyStatus("Could not copy the summary. Check clipboard permissions.");
    }
  }

  function formatDuration(seconds?: number): string {
    if (seconds === undefined) return "Duration not recorded";
    const minutes = Math.floor(seconds / 60);
    const remaining = seconds % 60;
    return minutes ? `${minutes}m ${remaining}s` : `${remaining}s`;
  }

  return (
    <div className="wireframe-page page-client-detail">
      <header className="client-detail-header">
        <div className="client-detail-header-left">
          <Link className="client-detail-back" href="/clients">
            <ArrowLeft aria-hidden="true" size={16} /> All clients
          </Link>
          <div className="client-detail-title-row">
            <h1 className="wireframe-title">{client.displayName}</h1>
            <span className="client-detail-badge">Individual</span>
          </div>
          <p className="wireframe-subtitle">
            {notes.length} {notes.length === 1 ? "session" : "sessions"}
            {since ? ` / Since ${since}` : ""}
          </p>
        </div>
        <Link
          className="primary-button"
          href={`/record?patient=${encodeURIComponent(client.patientId)}`}
        >
          <Video aria-hidden="true" size={15} /> Record a session
        </Link>
      </header>

      <nav
        className="workspace-tabs-nav client-detail-tabs"
        aria-label="Client detail tabs"
      >
        {VALID_TABS.map((tab) => (
          <button
            className={`workspace-tab-btn ${activeTab === tab ? "is-active" : ""}`}
            key={tab}
            aria-pressed={activeTab === tab}
            onClick={() => selectTab(tab)}
            type="button"
          >
            {TAB_LABELS[tab]}
          </button>
        ))}
      </nav>

      {activeTab === "details" ? (
        <section className="client-detail-panel">
          <h2 className="section-title">Profile</h2>
          <p className="client-detail-panel-sub">
            Client demographics and contact details.
          </p>
          <dl className="client-profile-fields">
            <div className="client-profile-field">
              <dt>First name</dt>
              <dd>{client.firstName || "N/A"}</dd>
            </div>
            <div className="client-profile-field">
              <dt>Last name</dt>
              <dd>{client.lastName || "N/A"}</dd>
            </div>
            <div className="client-profile-field">
              <dt>Email</dt>
              <dd>{client.email || "N/A"}</dd>
            </div>
            <div className="client-profile-field">
              <dt>Phone</dt>
              <dd>{client.mobileNumber || "N/A"}</dd>
            </div>
          </dl>
        </section>
      ) : activeTab === "sessions" ? (
        <section className="client-detail-panel">
          <h2 className="section-title">Sessions</h2>
          {notes.length === 0 ? (
            <p className="client-detail-empty">
              No approved sessions on record yet.
            </p>
          ) : (
            <ul className="client-session-list">
              {notes.map((note) => {
                const isOpen = expandedNoteId === note.id;
                const sessionHref = `${clientHref}/sessions/${encodeURIComponent(note.id)}`;
                return (
                  <li className="client-session-item" key={note.id}>
                    <button
                      aria-expanded={isOpen}
                      className="client-session-summary"
                      onClick={() =>
                        setExpandedNoteId(isOpen ? null : note.id)
                      }
                      type="button"
                    >
                      <span className="client-session-date">
                        {note.consultation_date}
                      </span>
                      <span className="client-session-complaint">
                        {note.chief_complaint ||
                          note.summary ||
                          "Consultation note"}
                      </span>
                      <span className="client-session-duration">{formatDuration(note.session_info?.duration_seconds)}</span>
                      <ChevronDown
                        aria-hidden="true"
                        className={`client-session-chevron ${isOpen ? "is-rotated" : ""}`}
                        size={14}
                      />
                    </button>
                    {isOpen ? (
                      <div className="client-session-detail">
                        <div className="client-session-actions">
                          <Link className="secondary-button" href={sessionHref}>Open session</Link>
                          <button className="ghost-button" onClick={() => void copySummary(note)} type="button"><Clipboard aria-hidden="true" size={14} /> Copy summary</button>
                        </div>
                        {note.summary ? <p>{note.summary}</p> : null}
                        {note.symptoms.length > 0 ? (
                          <>
                            <h4>Symptoms</h4>
                            <ul>
                              {note.symptoms.map((symptom, index) => (
                                <li key={index}>{symptom}</li>
                              ))}
                            </ul>
                          </>
                        ) : null}
                        {note.plan_discussed.length > 0 ? (
                          <>
                            <h4>Plan discussed</h4>
                            <ul>
                              {note.plan_discussed.map((planItem, index) => (
                                <li key={index}>{planItem}</li>
                              ))}
                            </ul>
                          </>
                        ) : null}
                        {note.follow_up ? (
                          <p>
                            <strong>Follow-up:</strong> {note.follow_up}
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
          {copyStatus ? <p className="client-copy-feedback" role="status">{copyStatus}</p> : null}
        </section>
      ) : activeTab === "treatment" ? (
        <section className="client-detail-panel client-treatment-panel">
          <h2 className="section-title">Treatment Plan</h2>
          <div className="agent-plan-entry-links"><Link className="primary-button" href={`/rawaan-ai?patient=${encodeURIComponent(client.patientId)}&question=${encodeURIComponent("Draft a treatment plan based on this client\'s records and current context.")}`}>Draft a plan with Rawaan</Link></div>
          <ReviewedPlansPanel key={client.patientId} patientId={client.patientId}/>
          <h3>Plans recorded in sessions</h3>
          <p className="client-detail-panel-sub">These are the original discussed plans, separate from reviewed AI proposals.</p>
          {notes.filter((note) => projectTreatmentPlan(note).hasRecordedPlan).length === 0 ? (
            <div className="client-detail-empty-state">
              <p className="client-detail-empty">No plan recorded yet.</p>
              <Link className="primary-button" href={`/record?patient=${encodeURIComponent(client.patientId)}`}><Video aria-hidden="true" size={15} /> Record a session</Link>
            </div>
          ) : notes.filter((note) => projectTreatmentPlan(note).hasRecordedPlan).map((note) => {
            const plan = projectTreatmentPlan(note);
            return (
              <article className="client-treatment-entry" key={note.id}>
                <div className="client-treatment-source">Recorded in session · {plan.consultationDate}</div>
                <div className="client-treatment-fields">
                  {plan.fields.map((field) => (
                    <section key={field.label}>
                      <h3>{field.label}</h3>
                      {field.values.length ? <ul>{field.values.map((value, index) => <li key={`${field.label}-${index}`}>{value}</li>)}</ul> : <p>Not documented</p>}
                    </section>
                  ))}
                </div>
                <Link href={`${clientHref}/sessions/${encodeURIComponent(note.id)}`}>Open source session</Link>
              </article>
            );
          })}
        </section>
      ) : activeTab === "chats" ? (
        <ClientChatsTab patientId={client.patientId} />
      ) : (
        <section className="client-detail-panel">
          <h2 className="section-title">Mind map</h2>
          {notes.length === 0 ? (
            <p className="client-detail-empty">
              No sessions available to map yet.
            </p>
          ) : (
            <>
              <label className="form-field client-mindmap-picker">
                Session
                <select
                  className="select-input"
                  onChange={(event) => setMindmapNoteId(event.target.value)}
                  value={mindmapNoteId ?? ""}
                >
                  {notes.map((note) => (
                    <option key={note.id} value={note.id}>
                      {note.consultation_date} —{" "}
                      {note.chief_complaint || "Consultation note"}
                    </option>
                  ))}
                </select>
              </label>
              {mindmapNote ? <SessionMindmap note={mindmapNote} /> : null}
            </>
          )}
        </section>
      )}
    </div>
  );
}
