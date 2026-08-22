"use client";

import { useState } from "react";

import {
  approveDraftAction,
  generateDraftAction,
} from "@/app/actions";
import type { NoteDraft } from "@/lib/notes/schema";

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

const listFields: { field: ListField; label: string }[] = [
  { field: "history", label: "History discussed" },
  { field: "symptoms", label: "Symptoms" },
  { field: "assessment_discussed", label: "Assessment / observations discussed" },
  { field: "plan_discussed", label: "Plan / next steps discussed" },
  { field: "medications_mentioned", label: "Medications mentioned" },
  { field: "uncertainties", label: "Uncertainties" },
];

const textFields: { field: TextField; label: string }[] = [
  { field: "chief_complaint", label: "Chief complaint" },
  { field: "follow_up", label: "Follow-up" },
];

const initialForm: FormValues = {
  consultation_date: "2026-08-22",
  patient_display_name: "",
  patient_id: "",
  transcript: "",
};

function toLines(value: string): string[] {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
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

  function updateForm(field: keyof FormValues, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
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
    <main className="page-shell">
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
              />
            </label>
          </div>

          <label className="transcript-field form-field">
            Scripted or manually entered transcript
            <textarea
              value={form.transcript}
              onChange={(event) => updateForm("transcript", event.target.value)}
              placeholder={"For the local demo parser, use labelled lines such as:\nChief complaint: Persistent headache\nHistory: Headache for three days\nPlan discussed: Keep a symptom diary"}
              rows={14}
            />
          </label>

          <div className="panel-footer">
            <p className="source-note">
              Current mode: <strong>Local demo parser</strong>. No LLM provider is
              connected for this slice.
            </p>
            <button
              type="button"
              className={draft ? "ghost-button" : "primary-button"}
              onClick={handleGenerate}
              disabled={isGenerating}
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
            <span className={`status-chip ${draft ? "draft" : "neutral"}`}>
              {draft ? "Draft · clinician review required" : "No draft yet"}
            </span>
          </div>

          {message ? <p className="message" role="status">{message}</p> : null}

          {draft ? (
            <div className="draft-fields">
              {textFields.map(({ field, label }) => (
                <label key={field} className="note-field">
                  {label}
                  <textarea
                    value={draft[field]}
                    onChange={(event) => updateDraftText(field, event.target.value)}
                    rows={field === "chief_complaint" ? 2 : 3}
                  />
                </label>
              ))}

              {listFields.map(({ field, label }) => (
                <label
                  key={field}
                  className={`note-field ${field === "uncertainties" ? "is-uncertainties" : ""}`}
                >
                  {label}
                  <textarea
                    value={draft[field].join("\n")}
                    onChange={(event) => updateDraftList(field, event.target.value)}
                    placeholder="One documented item per line"
                    rows={3}
                  />
                </label>
              ))}

              <details className="transcript-provenance">
                <summary>View raw transcript provenance</summary>
                <p>{draft.raw_transcript}</p>
              </details>

              <div className="approval-bar">
                <div>
                  <strong>Approval gate</strong>
                  <p>Only the edited, approved note will be saved.</p>
                </div>
                <button
                  type="button"
                  className={approvedNote ? "ghost-button" : "primary-button"}
                  onClick={handleApprove}
                  disabled={isApproving || Boolean(approvedNote)}
                >
                  {approvedNote
                    ? "Note approved"
                    : isApproving
                      ? "Saving approved note…"
                      : "Approve and save"}
                </button>
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
