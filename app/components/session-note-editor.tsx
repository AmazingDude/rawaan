"use client";

import type { NoteDraft } from "@/lib/notes/schema";
import {
  noteListFields,
  noteListFromText,
  type NoteEditorText,
  type NoteListField,
} from "@/app/components/session-note-editor-state";

interface SessionNoteEditorProps {
  draft: NoteDraft;
  editorText: NoteEditorText;
  disabled: boolean;
  onChange: (draft: NoteDraft, editorText: NoteEditorText) => void;
}

const listLabels: Record<NoteListField, string> = {
  history: "History",
  symptoms: "Symptoms",
  assessment_discussed: "Assessment discussed",
  plan_discussed: "Plan discussed",
  medications_mentioned: "Medications mentioned",
  uncertainties: "Items needing review",
};

export function SessionNoteEditor({
  draft,
  editorText,
  disabled,
  onChange,
}: SessionNoteEditorProps) {
  function updateScalar(field: "summary" | "chief_complaint" | "follow_up", value: string) {
    onChange({ ...draft, [field]: value }, editorText);
  }

  function updateList(field: NoteListField, value: string) {
    onChange(
      { ...draft, [field]: noteListFromText(value) },
      { ...editorText, [field]: value },
    );
  }

  return (
    <div className="clinical-document-body manual-note-editor">
      <div className="doc-section">
        <h2 className="section-title">{draft.session_info?.session_type === "manual" ? "Manual note" : "Review clinical draft"}</h2>
        <p className="manual-note-editor-intro">
          Review and correct the recorded details before approval. Missing information remains undocumented.
        </p>
      </div>

      <div className="manual-note-fields-grid">
        <label className="manual-note-field is-full" htmlFor="manual-note-summary">
          <span>Summary</span>
          <textarea
            disabled={disabled}
            id="manual-note-summary"
            onChange={(event) => updateScalar("summary", event.target.value)}
            placeholder="Add a concise session summary."
            rows={4}
            value={draft.summary ?? ""}
          />
        </label>

        <label className="manual-note-field is-full" htmlFor="manual-note-chief-complaint">
          <span>Chief complaint</span>
          <input
            disabled={disabled}
            id="manual-note-chief-complaint"
            onChange={(event) => updateScalar("chief_complaint", event.target.value)}
            placeholder="Describe the primary reason for the session."
            type="text"
            value={draft.chief_complaint}
          />
        </label>

        {noteListFields.map((field) => (
          <label
            className="manual-note-field"
            htmlFor={`manual-note-${field}`}
            key={field}
          >
            <span>{listLabels[field]}</span>
            <textarea
              disabled={disabled}
              id={`manual-note-${field}`}
              onChange={(event) => updateList(field, event.target.value)}
              placeholder="One item per line"
              rows={field === "medications_mentioned" || field === "uncertainties" ? 4 : 5}
              value={editorText[field]}
            />
          </label>
        ))}

        <label className="manual-note-field" htmlFor="manual-note-follow-up">
          <span>Follow-up discussed</span>
          <textarea
            disabled={disabled}
            id="manual-note-follow-up"
            onChange={(event) => updateScalar("follow_up", event.target.value)}
            placeholder="Add follow-up details if they were discussed."
            rows={4}
            value={draft.follow_up}
          />
        </label>
      </div>
    </div>
  );
}
