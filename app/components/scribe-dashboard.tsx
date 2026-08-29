"use client";

import { ArrowUpRight, ChevronDown, Inbox, MoreVertical, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import {
  generateDraftAction,
  listClientsAction,
  type ClientRecord,
} from "@/app/actions";
import { AssignSessionModal } from "@/app/components/assign-session-modal";
import { RecordSessionModal } from "@/app/components/record-session-modal";
import { SessionWorkspaceView } from "@/app/components/session-workspace-view";
import type { ApprovedNote, NoteDraft } from "@/lib/notes/schema";
import type { TranscriptionResult } from "@/lib/transcription/types";

interface RecentSession {
  date: string;
  id: string;
  note?: ApprovedNote;
  patientName: string;
  summary: string;
  time: string;
}

interface ScribeDashboardProps {
  initialNotes?: ApprovedNote[];
}

function formatSessionTime(isoString?: string): string {
  if (!isoString) return "9:18 PM";
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return "Recent";
    const hours = date.getUTCHours();
    const minutes = date.getUTCMinutes().toString().padStart(2, "0");
    const ampm = hours >= 12 ? "PM" : "AM";
    const formattedHours = hours % 12 || 12;
    return `${formattedHours}:${minutes} ${ampm}`;
  } catch {
    return "Recent";
  }
}

async function requestTranscription(audio: File): Promise<TranscriptionResult> {
  const formData = new FormData();
  formData.append("audio", audio);

  const response = await fetch("/api/transcribe", {
    body: formData,
    method: "POST",
  });

  const payload: unknown = await response.json();
  if (!response.ok) {
    return {
      code: "transcription_failed",
      message:
        typeof payload === "object" && payload !== null && "message" in payload
          ? String((payload as { message?: unknown }).message)
          : "Transcription request failed",
      ok: false,
    };
  }

  return payload as TranscriptionResult;
}

export function ScribeDashboard({ initialNotes = [] }: ScribeDashboardProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [recentSessions, setRecentSessions] = useState<RecentSession[]>(() => {
    if (initialNotes.length > 0) {
      return initialNotes.map((note) => ({
        date: note.consultation_date,
        id: note.id,
        note,
        patientName: note.patient_display_name,
        summary: note.chief_complaint || note.summary || "Consultation note",
        time: formatSessionTime(note.approved_at),
      }));
    }
    return [
      {
        date: "Thursday August 27, 2026",
        id: "example-session-1",
        patientName: "Example Session",
        summary: "Session between Carl Rogers and Gloria",
        time: "9:18 PM",
      },
    ];
  });
  const [notification, setNotification] = useState<string | null>(null);

  // Workflow State Modals & Workspace Views
  const [isRecordModalOpen, setIsRecordModalOpen] = useState(false);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [pendingRecording, setPendingRecording] = useState<{
    consultationDate: string;
    transcript: string;
  } | null>(null);
  const [activeWorkspaceDraft, setActiveWorkspaceDraft] = useState<
    NoteDraft | ApprovedNote | null
  >(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Load clients list
  useEffect(() => {
    void listClientsAction().then((res) => {
      setClients(res);
    });
  }, []);

  // Step 1: Recording stops -> Open Assign Session Modal (Picture 1)
  function handleRecordingComplete(data: {
    consultationDate: string;
    patientDisplayName: string;
    patientId: string;
    transcript: string;
  }) {
    setIsRecordModalOpen(false);
    setPendingRecording({
      consultationDate: data.consultationDate,
      transcript: data.transcript,
    });
    setIsAssignModalOpen(true);
  }

  // Step 2: Client chosen in Assign Session Modal -> Generate Draft & Open Workspace View (Picture 3)
  async function handleAssignClient(client: ClientRecord) {
    if (!pendingRecording) return;
    setIsAssignModalOpen(false);
    setNotification("Generating structured clinical note with AI Overview…");

    const result = await generateDraftAction({
      consultation_date: pendingRecording.consultationDate,
      email: client.email,
      first_name: client.firstName,
      last_name: client.lastName,
      mobile_number: client.mobileNumber,
      patient_display_name: client.displayName,
      patient_id: client.patientId,
      transcript: pendingRecording.transcript,
    });

    if (result.ok) {
      setActiveWorkspaceDraft(result.draft);
      setNotification(null);
    } else {
      setNotification(result.message);
    }
  }

  function handleSelectSession(session: RecentSession) {
    if (session.note) {
      setActiveWorkspaceDraft(session.note);
    } else if (session.id === "example-session-1") {
      const demoDraft: ApprovedNote = {
        approval_status: "approved",
        approved_at: "2026-08-27T18:20:00.000Z",
        assessment_discussed: [
          "Therapist applied unconditional positive regard and reflective exploration",
        ],
        chief_complaint:
          "Therapy session exploring personal congruence and independence",
        consultation_date: "2026-08-27",
        email: "gloria@example.com",
        first_name: "Gloria",
        follow_up: "Next session in one week",
        history: [
          "Feeling tension between maternal obligations and personal identity",
        ],
        id: "example-session-1",
        last_name: "Rogers",
        medications_mentioned: [],
        mobile_number: "+1 555 0192834",
        patient_display_name: "Gloria",
        patient_id: "patient-gloria-001",
        plan_discussed: [
          "Weekly reflective journaling on authentic personal choices",
          "Continue exploratory therapy",
        ],
        raw_transcript:
          "Chief complaint: Therapy session on congruence and independence\nHistory: Tension between motherhood and personal identity\nSymptoms: Emotional conflict; mild anxiety\nAssessment discussed: Reflective exploration of internal standards\nPlan discussed: Weekly journaling; continue therapy\nMedications mentioned: None mentioned\nFollow up: Next session in one week\nUncertainties: Childhood roots not yet explored",
        summary:
          "This transcript documents an exploratory psychotherapy session addressing emotional conflict between familial expectations and personal autonomy. Client reflected on internal versus external validation. Agreed to weekly journaling and ongoing counseling.",
        symptoms: [
          "Emotional conflict",
          "Mild anxiety regarding personal decisions",
        ],
        uncertainties: [
          "Early childhood antecedents to independence anxiety not yet explored",
        ],
      };
      setActiveWorkspaceDraft(demoDraft);
    }
  }

  function handleApproveSuccess(savedNote: ApprovedNote) {
    const newSession: RecentSession = {
      date: savedNote.consultation_date,
      id: savedNote.id,
      note: savedNote,
      patientName: savedNote.patient_display_name,
      summary: savedNote.chief_complaint || savedNote.summary || "Approved consultation note",
      time: formatSessionTime(savedNote.approved_at),
    };

    setRecentSessions((prev) => [newSession, ...prev]);
    setNotification("Approved note saved to patient record.");
  }

  async function handleFileUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setNotification("Processing uploaded file…");

    let transcript = "";
    if (file.type.startsWith("audio/")) {
      setNotification("Transcribing audio file with Whisper Large v3…");
      const res = await requestTranscription(file);
      if (res.ok) {
        transcript = res.transcript;
      } else {
        setNotification(res.message);
        return;
      }
    } else {
      transcript = await file.text();
    }

    setPendingRecording({
      consultationDate: new Date().toISOString().slice(0, 10),
      transcript,
    });
    setIsAssignModalOpen(true);
  }

  // If viewing a note workspace (Picture 3), render full Session Workspace View!
  if (activeWorkspaceDraft) {
    return (
      <SessionWorkspaceView
        draft={activeWorkspaceDraft}
        onApprove={handleApproveSuccess}
        onBack={() => setActiveWorkspaceDraft(null)}
      />
    );
  }


  const filteredSessions = recentSessions.filter(
    (s) =>
      s.patientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.summary.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <div className="dashboard-layout">
      {notification ? (
        <div className="dashboard-notification-banner" role="status">
          <span>{notification}</span>
          <button
            aria-label="Dismiss notification"
            className="btn-dismiss-banner"
            onClick={() => setNotification(null)}
            type="button"
          >
            <X size={14} />
          </button>
        </div>
      ) : null}

      {/* Record page header band */}
      <header className="wireframe-header page-record-band">
        <div>
          <h1 className="wireframe-title">Record</h1>
          <p className="wireframe-subtitle">
            Capture consultations and turn them into structured, clinician-approved notes.
          </p>
        </div>
      </header>

      {/* Recording Option Action Cards */}
      <section className="action-cards-grid" aria-label="Recording options">
        <button
          className="action-card"
          onClick={() => setIsRecordModalOpen(true)}
          type="button"
        >
          <div className="action-card-top">
            <div className="action-card-icon-wrap is-inperson">
              <svg
                aria-hidden="true"
                fill="none"
                height="20"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                viewBox="0 0 24 24"
                width="20"
              >
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" x2="12" y1="19" y2="22" />
              </svg>
            </div>
            <span className="action-card-arrow" aria-hidden="true">
              <ArrowUpRight size={16} />
            </span>
          </div>
          <div className="action-card-body">
            <h3 className="action-card-title">Record in-person</h3>
            <p className="action-card-desc">
              Best for recording sessions for in-person clients.
            </p>
          </div>
        </button>

        <button
          className="action-card"
          onClick={() => setIsRecordModalOpen(true)}
          type="button"
        >
          <div className="action-card-top">
            <div className="action-card-icon-wrap is-summary">
              <svg
                aria-hidden="true"
                fill="none"
                height="20"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                viewBox="0 0 24 24"
                width="20"
              >
                <path d="M2 10v3" />
                <path d="M6 6v11" />
                <path d="M10 3v18" />
                <path d="M14 8v7" />
                <path d="M18 5v13" />
                <path d="M22 10v3" />
              </svg>
            </div>
            <span className="action-card-arrow" aria-hidden="true">
              <ArrowUpRight size={16} />
            </span>
          </div>
          <div className="action-card-body">
            <h3 className="action-card-title">Record a summary</h3>
            <p className="action-card-desc">
              Best for dictating key session notes after a session.
            </p>
          </div>
        </button>
      </section>

      {/* Search & Actions Bar */}
      <section className="search-actions-bar">
        <div className="search-pill-wrapper">
          <svg
            aria-hidden="true"
            className="search-icon"
            fill="none"
            height="18"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            viewBox="0 0 24 24"
            width="18"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" x2="16.65" y1="21" y2="16.65" />
          </svg>
          <input
            className="search-pill-input"
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by client name..."
            type="text"
            value={searchQuery}
          />
        </div>

        <div className="header-action-buttons">
          <input
            accept="audio/*,.txt"
            onChange={handleFileUpload}
            ref={fileInputRef}
            style={{ display: "none" }}
            type="file"
          />
          <button
            className="btn-create-empty"
            onClick={() => setIsRecordModalOpen(true)}
            type="button"
          >
            <span className="btn-plus">+</span> Create empty note
          </button>
          <button
            className="btn-upload"
            onClick={() => fileInputRef.current?.click()}
            type="button"
          >
            <svg
              aria-hidden="true"
              fill="none"
              height="16"
              stroke="currentColor"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              viewBox="0 0 24 24"
              width="16"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" x2="12" y1="3" y2="15" />
            </svg>
            Upload
            <span className="dropdown-arrow">
              <ChevronDown size={14} />
            </span>
          </button>
        </div>
      </section>

      {/* Timeline Section Header */}
      <div className="timeline-header">
        <h2>Thursday August 27, 2026</h2>
      </div>

      {/* Recent Sessions List */}
      <section className="sessions-list" aria-label="Recent consultation sessions">
        {filteredSessions.map((session) => (
          <div
            className="session-item-row is-clickable"
            key={session.id}
            onClick={() => handleSelectSession(session)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                handleSelectSession(session);
              }
            }}
            role="button"
            tabIndex={0}
          >
            <div className="session-item-left">
              <span className="session-item-icon">
                <svg
                  aria-hidden="true"
                  fill="none"
                  height="16"
                  stroke="currentColor"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                  width="16"
                >
                  <path d="M2 10v3" />
                  <path d="M6 6v11" />
                  <path d="M10 3v18" />
                  <path d="M14 8v7" />
                  <path d="M18 5v13" />
                  <path d="M22 10v3" />
                </svg>
              </span>
              <div className="session-item-info">
                <span className="session-item-title">{session.patientName}</span>
                <span className="session-item-desc">{session.summary}</span>
              </div>
            </div>
            <div className="session-item-right">
              <span className="session-item-time" suppressHydrationWarning>
                {session.time}
              </span>
              <button
                aria-label={`Options for ${session.patientName}`}
                className="session-item-menu"
                onClick={(e) => {
                  e.stopPropagation();
                  handleSelectSession(session);
                }}
                type="button"
              >
                <MoreVertical size={16} />
              </button>
            </div>
          </div>
        ))}
        {filteredSessions.length === 0 ? (
          <div className="sessions-empty">
            <span className="empty-state-icon" aria-hidden="true">
              <Inbox size={22} />
            </span>
            <p className="roster-empty-title">No sessions yet</p>
            <p className="roster-empty-body">
              Record a session above, or load the demo dataset, to see it here.
            </p>
          </div>
        ) : null}
      </section>

      {/* In-Person Recording Modal */}
      <RecordSessionModal
        initialClients={clients}
        isOpen={isRecordModalOpen}
        onClose={() => setIsRecordModalOpen(false)}
        onComplete={handleRecordingComplete}
        requestTranscription={requestTranscription}
      />

      {/* Step 1 & 2: Assign Session & Create New Client Modal (Pictures 1 & 2) */}
      <AssignSessionModal
        clients={clients}
        isOpen={isAssignModalOpen}
        onAssign={handleAssignClient}
        onClose={() => {
          setIsAssignModalOpen(false);
          setPendingRecording(null);
        }}
        onDelete={() => {
          setIsAssignModalOpen(false);
          setPendingRecording(null);
          setNotification("Recording deleted.");
        }}
      />
    </div>
  );
}
