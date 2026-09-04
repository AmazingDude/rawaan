"use client";

import { ArrowLeft, ChevronDown, Video } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import type { ClientRecord } from "@/app/actions";
import { ClientChatsTab } from "@/app/components/client-chats-tab";
import { SessionMindmap } from "@/app/components/session-mindmap";
import type { ApprovedNote } from "@/lib/notes/schema";

type ClientTab = "details" | "sessions" | "chats" | "mindmap";

const VALID_TABS: ClientTab[] = ["details", "sessions", "chats", "mindmap"];

const TAB_LABELS: Record<ClientTab, string> = {
  details: "Details",
  sessions: "Sessions",
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
  const [activeTab, setActiveTab] = useState<ClientTab>(
    VALID_TABS.includes(initialTab as ClientTab)
      ? (initialTab as ClientTab)
      : "details",
  );
  const [expandedNoteId, setExpandedNoteId] = useState<string | null>(null);
  // Notes arrive newest-first; the mind map defaults to the latest session.
  const [mindmapNoteId, setMindmapNoteId] = useState<string | null>(
    notes[0]?.id ?? null,
  );

  // Notes are newest-first, so the earliest consultation is the last element.
  const since =
    notes.length > 0
      ? new Date(
          `${notes[notes.length - 1].consultation_date}T00:00:00`,
        ).toLocaleDateString("en-US", { month: "short", year: "numeric" })
      : null;
  const mindmapNote = notes.find((note) => note.id === mindmapNoteId) ?? null;

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
            onClick={() => setActiveTab(tab)}
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
            <div className="client-profile-field">
              <dt>Client ID</dt>
              <dd>{client.patientId}</dd>
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
                return (
                  <li className="client-session-item" key={note.id}>
                    <button
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
                      <ChevronDown
                        aria-hidden="true"
                        className={`client-session-chevron ${isOpen ? "is-rotated" : ""}`}
                        size={14}
                      />
                    </button>
                    {isOpen ? (
                      <div className="client-session-detail">
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
