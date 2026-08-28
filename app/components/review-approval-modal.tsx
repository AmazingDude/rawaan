"use client";

import { useState } from "react";

import { approveDraftAction } from "@/app/actions";
import type { ApprovedNote, NoteDraft } from "@/lib/notes/schema";

interface ReviewApprovalModalProps {
  draft: NoteDraft | ApprovedNote | null;
  isOpen: boolean;
  onApproveSuccess: (savedNote: ApprovedNote) => void;
  onClose: () => void;
}

type TextField = "chief_complaint" | "follow_up";
type ListField =
  | "history"
  | "symptoms"
  | "assessment_discussed"
  | "plan_discussed"
  | "medications_mentioned"
  | "uncertainties";

function toLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function ReviewApprovalModal({
  draft: initialDraft,
  isOpen,
  onApproveSuccess,
  onClose,
}: ReviewApprovalModalProps) {
  const [draft, setDraft] = useState<NoteDraft | ApprovedNote | null>(initialDraft);
  const [isApproving, setIsApproving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // Sync draft when initialDraft changes
  if (initialDraft && draft?.patient_id !== initialDraft.patient_id) {
    setDraft(initialDraft);
  }

  if (!isOpen || !draft) return null;

  const isApproved = draft.approval_status === "approved";

  function updateDraftText(field: TextField, value: string) {
    setDraft((cur) => (cur ? { ...cur, [field]: value } : cur));
  }

  function updateDraftList(field: ListField, value: string) {
    setDraft((cur) => (cur ? { ...cur, [field]: toLines(value) } : cur));
  }

  async function handleApprove() {
    if (!draft) return;
    setIsApproving(true);
    setMessage(null);

    const result = await approveDraftAction(draft);
    setIsApproving(false);

    if (!result.ok) {
      setMessage(result.message);
      return;
    }

    const saved: ApprovedNote = {
      ...draft,
      approval_status: "approved",
      approved_at: result.approvedAt,
      id: result.noteId,
    };

    onApproveSuccess(saved);
  }

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="review-modal-card" onClick={(e) => e.stopPropagation()}>
        <header className="review-modal-header">
          <div>
            <span className="eyebrow">CLINICIAN REVIEW & APPROVAL GATE</span>
            <h2>{draft.patient_display_name} — Consultation Note</h2>
            <p className="review-meta-text">
              Date: <strong>{draft.consultation_date}</strong> · ID: <code>{draft.patient_id}</code>
            </p>
          </div>
          <div className="review-header-right">
            <span className={`status-chip ${isApproved ? "approved" : "draft"}`}>
              {isApproved ? "Approved · Saved to Record" : "Draft · Review Required"}
            </span>
            <button aria-label="Close review" className="modal-icon-btn" onClick={onClose} type="button">
              ✕
            </button>
          </div>
        </header>

        <div className="review-modal-body">
          {message ? (
            <div className="modal-alert-banner" role="alert">
              {message}
            </div>
          ) : null}

          <div className="safety-notice compliance-banner" aria-label="Clinical safety notice">
            <strong>Documentation support only.</strong> This note captures facts extracted from the consultation transcript. Please verify all sections before saving to the permanent record.
          </div>

          <div className="review-sections-container">
            {/* 1. Subjective */}
            <section className="review-section-box">
              <h3 className="section-title">1. Subjective & History</h3>
              <div className="form-group-grid">
                <label className="form-field full-width">
                  <span>Chief Complaint</span>
                  <input
                    className="form-input"
                    disabled={isApproved}
                    onChange={(e) => updateDraftText("chief_complaint", e.target.value)}
                    type="text"
                    value={draft.chief_complaint}
                  />
                </label>

                <label className="form-field half-width">
                  <span>History of Present Illness (one item per line)</span>
                  <textarea
                    className="form-textarea"
                    disabled={isApproved}
                    onChange={(e) => updateDraftList("history", e.target.value)}
                    rows={3}
                    value={draft.history.join("\n")}
                  />
                </label>

                <label className="form-field half-width">
                  <span>Documented Symptoms (one item per line)</span>
                  <textarea
                    className="form-textarea"
                    disabled={isApproved}
                    onChange={(e) => updateDraftList("symptoms", e.target.value)}
                    rows={3}
                    value={draft.symptoms.join("\n")}
                  />
                </label>
              </div>
            </section>

            {/* 2. Assessment & Plan */}
            <section className="review-section-box">
              <h3 className="section-title">2. Assessment & Plan Discussed</h3>
              <div className="form-group-grid">
                <label className="form-field half-width">
                  <span>Assessment Discussed</span>
                  <textarea
                    className="form-textarea"
                    disabled={isApproved}
                    onChange={(e) => updateDraftList("assessment_discussed", e.target.value)}
                    rows={3}
                    value={draft.assessment_discussed.join("\n")}
                  />
                </label>

                <label className="form-field half-width">
                  <span>Plan Discussed</span>
                  <textarea
                    className="form-textarea"
                    disabled={isApproved}
                    onChange={(e) => updateDraftList("plan_discussed", e.target.value)}
                    rows={3}
                    value={draft.plan_discussed.join("\n")}
                  />
                </label>

                <label className="form-field full-width">
                  <span>Medications Mentioned</span>
                  <textarea
                    className="form-textarea"
                    disabled={isApproved}
                    onChange={(e) => updateDraftList("medications_mentioned", e.target.value)}
                    rows={2}
                    value={draft.medications_mentioned.join("\n")}
                  />
                </label>
              </div>
            </section>

            {/* 3. Follow-up & Uncertainties */}
            <section className="review-section-box">
              <h3 className="section-title">3. Follow-up & Clinical Uncertainties</h3>
              <div className="form-group-grid">
                <label className="form-field half-width">
                  <span>Follow-up Instructions</span>
                  <textarea
                    className="form-textarea"
                    disabled={isApproved}
                    onChange={(e) => updateDraftText("follow_up", e.target.value)}
                    rows={3}
                    value={draft.follow_up}
                  />
                </label>

                <label className="form-field half-width is-uncertainties">
                  <span>Uncertainties / Unverified Points</span>
                  <textarea
                    className="form-textarea"
                    disabled={isApproved}
                    onChange={(e) => updateDraftList("uncertainties", e.target.value)}
                    rows={3}
                    value={draft.uncertainties.join("\n")}
                  />
                </label>
              </div>
            </section>

            {/* Provenance */}
            <details className="transcript-provenance">
              <summary>View raw spoken transcript provenance</summary>
              <pre className="provenance-pre">{draft.raw_transcript}</pre>
            </details>
          </div>
        </div>

        <footer className="review-modal-footer">
          <div className="footer-status-text">
            <strong>{isApproved ? "Note Approved" : "Clinician Approval Required"}</strong>
            <p>
              {isApproved
                ? "This note is permanently saved to the patient record."
                : "Only reviewed notes will be saved and indexed by the Brain."}
            </p>
          </div>
          <div className="footer-buttons">
            <button className="ghost-button" onClick={onClose} type="button">
              {isApproved ? "Close" : "Cancel"}
            </button>
            {!isApproved ? (
              <button
                className="primary-button btn-approve-save"
                disabled={isApproving}
                onClick={handleApprove}
                type="button"
              >
                {isApproving ? "Saving Note…" : "Approve and save"}
              </button>
            ) : null}
          </div>
        </footer>
      </div>
    </div>
  );
}
