"use client";

import { useEffect, useRef, useState } from "react";

import {
  approveDraftAction,
  generateDraftAction,
} from "@/app/actions";
import type { NoteDraft } from "@/lib/notes/schema";
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

export function ScribeWorkspace() {
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

  function handleStartNewConsultation() {
    resetVoiceCapture();
    setForm(initialForm);
    setDraft(null);
    setMessage(null);
    setApprovedNote(null);
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
  }

  return (
    <main className={`page-shell ${isApproved ? "is-approved" : ""}`}>
      <header className="hero">
        <div>
          <p className="eyebrow">RAWAAN · PATIENT CONTEXT ENGINE</p>
          <h1>Consultation Scribe</h1>
          <p className="hero-copy">
            Capture a role-played consultation as a reviewable structured note.
          </p>
        </div>
        <div className="safety-label">Documentation support only</div>
      </header>

      <section className="safety-notice compliance-banner" aria-label="Clinical safety notice">
        <strong>Fictional demo data only.</strong> This tool records documentation
        discussed in the transcript. It does not diagnose, recommend treatment,
        or replace clinical judgment.
      </section>

      <section className="workspace-grid">
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
                    onClick={handleStartNewConsultation}
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
      </section>
    </main>
  );
}
