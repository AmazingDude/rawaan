"use client";

import { X } from "lucide-react";
import { useState } from "react";

interface ManualSummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onContinue: (data: {
    consultationDate: string;
    transcript: string;
  }) => void;
}

export function ManualSummaryModal({
  isOpen,
  onClose,
  onContinue,
}: ManualSummaryModalProps) {
  const [consultationDate, setConsultationDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [transcript, setTranscript] = useState("");

  if (!isOpen) return null;

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const summary = transcript.trim();
    if (!summary) return;

    onContinue({ consultationDate, transcript: summary });
  }

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <form
        aria-labelledby="manual-summary-heading"
        className="manual-summary-modal"
        onClick={(event) => event.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <header className="manual-summary-header">
          <div>
            <p className="manual-summary-eyebrow">Clinician entry</p>
            <h2 id="manual-summary-heading">Record a Summary</h2>
          </div>
          <button
            aria-label="Close"
            className="btn-close-modal"
            onClick={onClose}
            type="button"
          >
            <X size={16} />
          </button>
        </header>

        <div className="manual-summary-body">
          <label className="manual-summary-label" htmlFor="summary-date">
            Session date
          </label>
          <input
            className="manual-summary-date-input"
            id="summary-date"
            onChange={(event) => setConsultationDate(event.target.value)}
            required
            type="date"
            value={consultationDate}
          />

          <label className="manual-summary-label" htmlFor="session-summary">
            Session summary
          </label>
          <textarea
            aria-label="Session summary"
            className="manual-summary-textarea"
            id="session-summary"
            onChange={(event) => setTranscript(event.target.value)}
            placeholder="Enter the key details from this session."
            required
            rows={9}
            value={transcript}
          />
        </div>

        <footer className="manual-summary-footer">
          <button className="btn-secondary-summary" onClick={onClose} type="button">
            Cancel
          </button>
          <button className="btn-next-step" type="submit">
            Continue to assign client
          </button>
        </footer>
      </form>
    </div>
  );
}
