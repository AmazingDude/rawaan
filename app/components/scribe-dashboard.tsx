"use client";

import { ArrowUpRight, ChevronDown, MoreVertical } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import {
  approveDraftAction,
  generateDraftAction,
} from "@/app/actions";
import type { ApprovedNote, NoteDraft } from "@/lib/notes/schema";
import type { TranscriptionResult } from "@/lib/transcription/types";
import {
  VoiceCaptureController,
  isRecordControlDisabled,
  resolveTranscriptPlacement,
  type VoiceCaptureState,
} from "@/lib/transcription/voice-recorder";

type FormValues = {
  consultation_date: string;
  patient_display_name: string;
  patient_id: string;
  transcript: string;
};

type ListField =
  | "history"
  | "symptoms"
  | "assessment_discussed"
  | "plan_discussed"
  | "medications_mentioned"
  | "uncertainties";

type TextField = "chief_complaint" | "follow_up";

type DraftField =
  | {
      field: TextField;
      kind: "text";
      label: string;
      layout: "full" | "half";
      rows: number;
    }
  | {
      field: ListField;
      kind: "list";
      label: string;
      layout: "full" | "half";
      rows: number;
      sourceLabel: string;
    };

const draftSections: { fields: DraftField[]; id: string; title: string }[] = [
  {
    id: "subjective-fields",
    title: "Subjective",
    fields: [
      {
        field: "chief_complaint",
        kind: "text",
        label: "Chief complaint",
        layout: "half",
        rows: 2,
      },
      {
        field: "history",
        kind: "list",
        label: "History discussed",
        layout: "half",
        rows: 3,
        sourceLabel: "History",
      },
      {
        field: "symptoms",
        kind: "list",
        label: "Symptoms",
        layout: "full",
        rows: 3,
        sourceLabel: "Symptoms",
      },
    ],
  },
  {
    id: "assessment-plan-fields",
    title: "Assessment & Plan",
    fields: [
      {
        field: "assessment_discussed",
        kind: "list",
        label: "Assessment / observations discussed",
        layout: "half",
        rows: 3,
        sourceLabel: "Assessment discussed",
      },
      {
        field: "plan_discussed",
        kind: "list",
        label: "Plan / next steps discussed",
        layout: "half",
        rows: 3,
        sourceLabel: "Plan discussed",
      },
      {
        field: "medications_mentioned",
        kind: "list",
        label: "Medications mentioned",
        layout: "full",
        rows: 3,
        sourceLabel: "Medications mentioned",
      },
    ],
  },
  {
    id: "follow-up-notes-fields",
    title: "Follow-up & Notes",
    fields: [
      {
        field: "follow_up",
        kind: "text",
        label: "Follow-up",
        layout: "full",
        rows: 3,
      },
      {
        field: "uncertainties",
        kind: "list",
        label: "Uncertainties",
        layout: "full",
        rows: 3,
        sourceLabel: "Uncertainties",
      },
    ],
  },
];

const initialForm: FormValues = {
  consultation_date: "2026-08-22",
  patient_display_name: "",
  patient_id: "",
  transcript: "",
};

const initialVoiceState: VoiceCaptureState = {
  elapsedSeconds: 0,
  fallbackMessage: null,
  phase: "idle",
};

interface RecentSession {
  date: string;
  id: string;
  note?: ApprovedNote;
  patientName: string;
  summary: string;
  time: string;
}

const defaultSessions: RecentSession[] = [
  {
    id: "example-session-1",
    patientName: "Example Session",
    summary: "Session between Carl Rogers and Gloria",
    date: "Thursday August 27, 2026",
    time: "9:18 PM",
  },
];

function formatElapsedSeconds(elapsedSeconds: number): string {
  const minutes = Math.floor(elapsedSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (elapsedSeconds % 60).toString().padStart(2, "0");

  return `${minutes}:${seconds}`;
}

function isTranscriptionResult(value: unknown): value is TranscriptionResult {
  if (typeof value !== "object" || value === null || !("ok" in value)) {
    return false;
  }

  if (value.ok === true) {
    return "transcript" in value && typeof value.transcript === "string";
  }

  return (
    value.ok === false &&
    "code" in value &&
    typeof value.code === "string" &&
    "message" in value &&
    typeof value.message === "string"
  );
}

async function requestTranscription(audio: File): Promise<TranscriptionResult> {
  const formData = new FormData();
  formData.append("audio", audio);

  const response = await fetch("/api/transcribe", {
    body: formData,
    method: "POST",
  });
  const result: unknown = await response.json();

  if (!isTranscriptionResult(result)) {
    throw new Error("The transcription response was invalid.");
  }

  return result;
}

function toLines(value: string): string[] {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

function getListFieldEmptyState(
  values: string[],
  rawTranscript: string,
  sourceLabel: string,
): "explicit-none" | "not-extracted" | null {
  if (values.length > 0) {
    return null;
  }

  const prefix = `${sourceLabel.toLowerCase()}:`;
  const sourceValue = rawTranscript
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.toLowerCase().startsWith(prefix))
    ?.slice(prefix.length)
    .trim();

  return /^(none|none mentioned|not mentioned|n\/a)$/i.test(sourceValue ?? "")
    ? "explicit-none"
    : "not-extracted";
}

interface ScribeDashboardProps {
  initialNotes?: ApprovedNote[];
}

export function ScribeDashboard({ initialNotes = [] }: ScribeDashboardProps) {
  const [form, setForm] = useState<FormValues>(initialForm);
  const [draft, setDraft] = useState<NoteDraft | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isApproving, setIsApproving] = useState(false);
  const [approvedNote, setApprovedNote] = useState<{
    approvedAt: string;
    noteId: string;
  } | null>(null);
  const [hasRecordingConsent, setHasRecordingConsent] = useState(false);
  const [pendingTranscript, setPendingTranscript] = useState<string | null>(null);
  const [voiceState, setVoiceState] = useState<VoiceCaptureState>(initialVoiceState);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeSessionMode, setActiveSessionMode] = useState<string | null>(null);
  const [recentSessions, setRecentSessions] = useState<RecentSession[]>(() => {
    if (initialNotes.length > 0) {
      return initialNotes.map((note) => ({
        id: note.id,
        patientName: note.patient_display_name,
        summary: note.chief_complaint || `Session with ${note.patient_display_name}`,
        date: "Thursday August 27, 2026",
        time: new Date(note.approved_at).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        }),
        note,
      }));
    }
    return defaultSessions;
  });

  const currentTranscriptRef = useRef(form.transcript);
  const transcriptAtStopRef = useRef("");
  const [voiceController, setVoiceController] =
    useState<VoiceCaptureController | null>(null);
  const isApproved = Boolean(approvedNote);

  useEffect(() => {
    currentTranscriptRef.current = form.transcript;
  }, [form.transcript]);

  useEffect(() => {
    const controller = new VoiceCaptureController({
      clearScheduledInterval: (intervalId) => window.clearInterval(intervalId),
      createAudioFile: (parts, name, type) => new File(parts, name, { type }),
      createRecorder: (stream) => new MediaRecorder(stream as MediaStream),
      getUserMedia: () => navigator.mediaDevices.getUserMedia({ audio: true }),
      isOnline: () => navigator.onLine,
      isRecorderSupported: () =>
        typeof MediaRecorder !== "undefined" &&
        typeof navigator !== "undefined" &&
        Boolean(navigator.mediaDevices?.getUserMedia),
      onStateChange: setVoiceState,
      onTranscript: (transcribedText) => {
        const placement = resolveTranscriptPlacement({
          currentTranscript: currentTranscriptRef.current,
          transcriptAtStop: transcriptAtStopRef.current,
          transcribedText,
        });

        setForm((current) => ({ ...current, transcript: placement.transcript }));
        setPendingTranscript(placement.pendingTranscript);
      },
      requestTranscription,
      scheduleInterval: (callback, milliseconds) =>
        window.setInterval(callback, milliseconds),
    });

    setVoiceController(controller);

    return () => controller.reset();
  }, []);

  function updateForm(field: keyof FormValues, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function handleStartRecording() {
    void voiceController?.start(hasRecordingConsent);
  }

  function handleStopRecording() {
    transcriptAtStopRef.current = currentTranscriptRef.current;
    void voiceController?.stop();
  }

  function handleUseTranscribedText() {
    if (!pendingTranscript) {
      return;
    }

    updateForm("transcript", pendingTranscript);
    setPendingTranscript(null);
  }

  function resetVoiceCapture() {
    voiceController?.reset();
    setHasRecordingConsent(false);
    setPendingTranscript(null);
    transcriptAtStopRef.current = "";
  }

  function updateDraftText(field: TextField, value: string) {
    setDraft((current) => (current ? { ...current, [field]: value } : current));
  }

  function updateDraftList(field: ListField, value: string) {
    setDraft((current) =>
      current ? { ...current, [field]: toLines(value) } : current,
    );
  }

  async function handleGenerate() {
    setIsGenerating(true);
    setApprovedNote(null);
    setMessage(null);

    const result = await generateDraftAction({
      ...form,
      transcript: form.transcript,
    });

    setIsGenerating(false);

    if (!result.ok) {
      setMessage(result.message);
      return;
    }

    setDraft(result.draft);
    setMessage(
      "Draft created with the local demo parser. Review every field before approval.",
    );
  }

  function handleStartNewConsultation(presetMode?: string) {
    resetVoiceCapture();
    setForm(initialForm);
    setDraft(null);
    setMessage(null);
    setApprovedNote(null);
    if (presetMode) {
      setActiveSessionMode(presetMode);
    }
  }

  async function handleApprove() {
    if (!draft) {
      return;
    }

    setIsApproving(true);
    setMessage(null);
    const result = await approveDraftAction(draft);
    setIsApproving(false);

    if (!result.ok) {
      setMessage(result.message);
      return;
    }

    setApprovedNote(result);
    setMessage("Approved note saved to the demo-only local record.");

    const newSession: RecentSession = {
      id: result.noteId,
      patientName: form.patient_display_name || form.patient_id,
      summary: draft.chief_complaint || "Approved consultation note",
      date: "Thursday August 27, 2026",
      time: new Date(result.approvedAt).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
    };
    setRecentSessions((prev) => [newSession, ...prev]);
  }

  const filteredSessions = recentSessions.filter(
    (s) =>
      s.patientName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.summary.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <div className="dashboard-layout">
      {/* Top 3 Action Cards matching reference image */}
      <section className="action-cards-grid" aria-label="Recording options">
        <button
          className="action-card"
          onClick={() => handleStartNewConsultation("Virtual Session")}
          type="button"
        >
          <div className="action-card-top">
            <div className="action-card-icon-wrap is-virtual">
              <span className="record-circle-icon" />
            </div>
            <span className="action-card-arrow" aria-hidden="true">
              <ArrowUpRight size={16} />
            </span>
          </div>
          <div className="action-card-body">
            <h3 className="action-card-title">Record virtual session</h3>
            <p className="action-card-desc">
              For web-based platforms like Jane, Owl, and others.
            </p>
          </div>
        </button>

        <button
          className="action-card"
          onClick={() => handleStartNewConsultation("In-Person Session")}
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
          onClick={() => handleStartNewConsultation("Session Summary")}
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

      {/* Search & Actions Bar matching reference */}
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
          <button
            className="btn-create-empty"
            onClick={() => handleStartNewConsultation()}
            type="button"
          >
            <span className="btn-plus">+</span> Create empty note
          </button>
          <button
            className="btn-upload"
            onClick={() => handleStartNewConsultation()}
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
          <div key={session.id} className="session-item-row">
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
              <span className="session-item-time">{session.time}</span>
              <button
                aria-label={`Options for ${session.patientName}`}
                className="session-item-menu"
                type="button"
              >
                <MoreVertical size={16} />
              </button>
            </div>
          </div>
        ))}
      </section>

      {/* Active Consultation Scribe Studio Workspace */}
      <section className={`scribe-studio ${isApproved ? "is-approved" : ""}`}>
        <div className="studio-heading">
          <div>
            <span className="eyebrow">
              {activeSessionMode ? activeSessionMode.toUpperCase() : "CONSULTATION SCRIBE STUDIO"}
            </span>
            <h2 className="studio-title">Capture & Structured Note Generator</h2>
          </div>
          <div className="safety-label">Documentation support only</div>
        </div>

        <div className="safety-notice compliance-banner" aria-label="Clinical safety notice">
          <strong>Fictional demo data only.</strong> This tool records documentation
          discussed in the transcript. It does not diagnose, recommend treatment,
          or replace clinical judgment.
        </div>

        <div className="workspace-grid">
          {/* STEP 1: Transcript & Recording Panel */}
          <section className="panel step-card transcript-panel" aria-labelledby="transcript-title">
            <div className="panel-heading">
              <div>
                <p className="step-label">STEP 1</p>
                <h2 id="transcript-title">Enter consultation context</h2>
              </div>
              <span className="status-chip neutral">Manual transcript</span>
            </div>

            <div className="form-grid">
              <label className="form-field">
                Fictional patient ID
                <input
                  value={form.patient_id}
                  onChange={(event) => updateForm("patient_id", event.target.value)}
                  placeholder="e.g. patient-amina-001"
                  disabled={isApproved}
                />
              </label>
              <label className="form-field">
                Display name
                <input
                  value={form.patient_display_name}
                  onChange={(event) =>
                    updateForm("patient_display_name", event.target.value)
                  }
                  placeholder="e.g. Amina Khan"
                  disabled={isApproved}
                />
              </label>
              <label className="form-field">
                Consultation date
                <input
                  type="date"
                  value={form.consultation_date}
                  onChange={(event) =>
                    updateForm("consultation_date", event.target.value)
                  }
                  disabled={isApproved}
                />
              </label>
            </div>

            <section className="voice-capture" aria-labelledby="voice-capture-title">
              <div className="voice-capture-heading">
                <div>
                  <p className="voice-capture-kicker">Optional demo capture</p>
                  <h3 id="voice-capture-title">Record one complete consultation</h3>
                </div>
                {voiceState.phase === "recording" ? (
                  <p className="recording-indicator" role="status">
                    Recording {formatElapsedSeconds(voiceState.elapsedSeconds)}
                  </p>
                ) : null}
              </div>
              <p className="voice-capture-copy">
                This sends one completed fictional-demo recording for transcription after you stop. You can always type or paste the transcript below.
              </p>
              <label className="consent-control">
                <input
                  checked={hasRecordingConsent}
                  disabled={isApproved || voiceState.phase !== "idle"}
                  onChange={(event) => setHasRecordingConsent(event.target.checked)}
                  type="checkbox"
                />
                Patient consented to recording
              </label>
              <div className="voice-capture-actions">
                <button
                  aria-live="polite"
                  className={`capture-button ${voiceState.phase === "recording" ? "is-recording" : ""}`}
                  disabled={
                    isApproved ||
                    !voiceController ||
                    (voiceState.phase === "recording"
                      ? false
                      : isRecordControlDisabled(hasRecordingConsent, voiceState))
                  }
                  onClick={
                    voiceState.phase === "recording"
                      ? handleStopRecording
                      : handleStartRecording
                  }
                  type="button"
                >
                  {voiceState.phase === "recording" ? "Stop recording" : "Record consultation"}
                </button>
                {voiceState.phase === "transcribing" ? (
                  <p className="transcribing-status" role="status">
                    Transcribing…
                  </p>
                ) : null}
              </div>
              {voiceState.fallbackMessage ? (
                <p className="voice-fallback" role="alert">
                  {voiceState.fallbackMessage}
                </p>
              ) : null}
            </section>

            <label className="transcript-field form-field">
              Scripted or manually entered transcript
              <textarea
                value={form.transcript}
                onChange={(event) => updateForm("transcript", event.target.value)}
                placeholder={"For the local demo parser, use labelled lines such as:\nChief complaint: Persistent headache\nHistory: Headache for three days\nPlan discussed: Keep a symptom diary"}
                rows={14}
                disabled={isApproved}
              />
            </label>

            {pendingTranscript ? (
              <div className="transcript-replacement" role="status">
                <p>
                  A completed transcription is ready. Your manual edits were kept.
                </p>
                <button
                  className="ghost-button"
                  disabled={isApproved}
                  onClick={handleUseTranscribedText}
                  type="button"
                >
                  Use transcribed text
                </button>
              </div>
            ) : null}

            <div className="panel-footer">
              <p className="source-note">
                Current mode: <strong>Local demo parser</strong>. No LLM provider is
                connected for this slice.
              </p>
              <button
                type="button"
                className={draft ? "ghost-button" : "primary-button"}
                onClick={handleGenerate}
                disabled={isGenerating || isApproved}
              >
                {isGenerating ? "Creating draft…" : "Create structured draft"}
              </button>
            </div>
          </section>

          {/* STEP 2: Review & Approval Panel */}
          <section className="panel step-card review-panel" aria-labelledby="review-title">
            <div className="panel-heading">
              <div>
                <p className="step-label">STEP 2</p>
                <h2 id="review-title">Review and approve</h2>
              </div>
              <span
                className={`status-chip ${isApproved ? "approved" : draft ? "draft" : "neutral"}`}
              >
                {isApproved
                  ? "Approved · saved"
                  : draft
                    ? "Draft · clinician review required"
                    : "No draft yet"}
              </span>
            </div>

            {message ? <p className="message" role="status">{message}</p> : null}

            {draft ? (
              <div className="draft-fields">
                {draftSections.map((section) => (
                  <section
                    key={section.id}
                    className="note-section"
                    aria-labelledby={section.id}
                  >
                    <h3 id={section.id}>{section.title}</h3>
                    <div className="note-section-fields">
                      {section.fields.map((field) => {
                        const emptyState =
                          field.kind === "list"
                            ? getListFieldEmptyState(
                                draft[field.field],
                                draft.raw_transcript,
                                field.sourceLabel,
                              )
                            : null;

                        return (
                          <label
                            key={field.field}
                            className={`section-field is-${field.layout} ${field.field === "uncertainties" ? "is-uncertainties" : ""}`}
                          >
                            {field.label}
                            {emptyState ? (
                              <p className={`field-empty-state is-${emptyState}`}>
                                {emptyState === "explicit-none"
                                  ? "None mentioned in transcript"
                                  : "No documented items extracted"}
                              </p>
                            ) : null}
                            <textarea
                              value={
                                field.kind === "text"
                                  ? draft[field.field]
                                  : draft[field.field].join("\n")
                              }
                              onChange={(event) =>
                                field.kind === "text"
                                  ? updateDraftText(field.field, event.target.value)
                                  : updateDraftList(field.field, event.target.value)
                              }
                              placeholder={
                                field.kind === "list"
                                  ? "One documented item per line"
                                  : undefined
                              }
                              rows={field.rows}
                              disabled={isApproved}
                            />
                          </label>
                        );
                      })}
                    </div>
                  </section>
                ))}

                <details className="transcript-provenance">
                  <summary>View raw transcript provenance</summary>
                  <p>{draft.raw_transcript}</p>
                </details>

                <div className="approval-bar">
                  <div>
                    <strong>{isApproved ? "Note approved" : "Approval gate"}</strong>
                    <p>
                      {isApproved
                        ? "The saved note is locked. Start a new consultation to continue."
                        : "Only the edited, approved note will be saved."}
                    </p>
                  </div>
                  {isApproved ? (
                    <button
                      type="button"
                      className="primary-button"
                      onClick={() => handleStartNewConsultation()}
                    >
                      Start new consultation
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="primary-button"
                      onClick={handleApprove}
                      disabled={isApproving}
                    >
                      {isApproving ? "Saving approved note…" : "Approve and save"}
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="empty-state">
                <p>Generate a draft to begin the clinician review step.</p>
              </div>
            )}

            {approvedNote ? (
              <div className="success-card">
                <strong>Approved note saved</strong>
                <p>Record ID: {approvedNote.noteId}</p>
                <p>Approved: {new Date(approvedNote.approvedAt).toLocaleString()}</p>
              </div>
            ) : null}
          </section>
        </div>
      </section>
    </div>
  );
}
