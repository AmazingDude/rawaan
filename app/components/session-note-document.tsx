"use client";

import { Clipboard, Check } from "lucide-react";
import { useState } from "react";

import type { ApprovedNote, NoteDraft } from "@/lib/notes/schema";

type Note = NoteDraft | ApprovedNote;

export function SessionNoteDocument({ note, language }: { note: Note; language: "en" | "ur" }) {
  const [copiedSection, setCopiedSection] = useState<string | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);
  const sections: { label: string; values: string[] }[] = [
    { label: "Summary", values: note.summary?.trim() ? [note.summary] : [] },
    { label: "Chief complaint", values: note.chief_complaint.trim() ? [note.chief_complaint] : [] },
    { label: "History", values: note.history },
    { label: "Symptoms", values: note.symptoms },
    { label: "Assessment discussed", values: note.assessment_discussed },
    { label: "Plan / next steps discussed", values: note.plan_discussed },
    { label: "Medications mentioned", values: note.medications_mentioned },
    { label: "Follow-up discussed", values: note.follow_up.trim() ? [note.follow_up] : [] },
    { label: "Items needing review", values: note.uncertainties },
  ];

  async function copySection(label: string, values: string[]) {
    try {
      await navigator.clipboard.writeText(values.filter((value) => value.trim()).join("\n") || "Not documented");
      setCopiedSection(label);
      setCopyError(null);
      window.setTimeout(() => setCopiedSection(null), 1800);
    } catch {
      setCopyError("Could not copy this section. Check clipboard permissions.");
    }
  }

  return (
    <div className={`clinical-document-body session-note-document ${language === "ur" ? "is-urdu-doc" : ""}`} dir={language === "ur" ? "rtl" : "ltr"}>
      <header className="session-note-heading">
        <div><p>Clinical note</p><h1>{note.patient_display_name}</h1><span>{note.consultation_date}</span></div>
      </header>
      {sections.map((section) => (
        <section className="doc-section session-note-section" key={section.label}>
          <div className="section-title-row">
            <h2 className="section-title">{section.label}</h2>
            <button aria-label={`Copy ${section.label}`} className="btn-copy-inline" onClick={() => void copySection(section.label, section.values)} type="button">
              {copiedSection === section.label ? <Check aria-hidden="true" size={14} /> : <Clipboard aria-hidden="true" size={14} />}
            </button>
          </div>
          {section.values.length ? (
            section.values.length === 1 ? <p className="summary-paragraph-text">{section.values[0]}</p> : <ul className="topic-bullet-list">{section.values.map((value, index) => <li key={`${section.label}-${index}`}>{value}</li>)}</ul>
          ) : <p className="session-note-undocumented">Not documented</p>}
        </section>
      ))}
      {copyError ? <p role="alert">{copyError}</p> : null}
    </div>
  );
}
