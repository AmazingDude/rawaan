"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Calendar, Clock, Loader2 } from "lucide-react";
import { getClientDetailAction } from "@/app/actions";
import { STORAGE_ERROR_MESSAGE } from "@/lib/db/errors";
import type { ApprovedNote, NoteDraft } from "@/lib/notes/schema";

interface ClientTimelineProps {
  currentNote: ApprovedNote | NoteDraft;
  patientId: string;
}

export function ClientTimeline({ currentNote, patientId }: ClientTimelineProps) {
  const [notes, setNotes] = useState<ApprovedNote[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void getClientDetailAction(patientId)
      .then((data) => {
        if (!cancelled) { setNotes(data.notes); setLoadError(null); }
      })
      .catch(() => {
        if (!cancelled) setLoadError(STORAGE_ERROR_MESSAGE);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [patientId]);

  if (isLoading) {
    return (
      <div className="client-timeline-loading">
        <Loader2 size={18} className="spin" />
        <span>Loading session history…</span>
      </div>
    );
  }

  const isCurrentApproved = "id" in currentNote;
  const clientHref = `/clients/${encodeURIComponent(patientId)}`;

  return (
    <div className="client-timeline">
      <h3 className="section-title">Session History</h3>

      {loadError ? <p role="alert">{loadError}</p> : null}
      {!isCurrentApproved ? (
        <div className="timeline-item is-current-draft">
          <span className="timeline-dot" />
          <div className="timeline-content">
            <div className="timeline-date"><Calendar aria-hidden="true" size={12} /><strong>{currentNote.consultation_date}</strong><span className="session-history-status">Draft</span></div>
            <p>{currentNote.chief_complaint || currentNote.summary || "Current session"}</p>
          </div>
        </div>
      ) : null}
      {notes.length === 0 && isCurrentApproved ? <p className="client-timeline-empty">No approved sessions on record.</p> : null}
      {notes.length > 0 ? (
        <div className="patient-sessions-timeline">
          {notes.map((note) => {
            const isCurrent = "id" in currentNote && note.id === currentNote.id;
            const duration = note.session_info?.duration_seconds;
            const durationText = duration === undefined ? "Duration not recorded" : `${Math.floor(duration / 60)}m ${duration % 60}s`;
            return (
              <div key={note.id} className={`timeline-item ${isCurrent ? "is-active" : ""}`}>
                <span className="timeline-dot" />
                <div className="timeline-content">
                  <div className="timeline-date"><Calendar aria-hidden="true" size={12} /><strong>{note.consultation_date}</strong>{isCurrent ? <span className="session-history-status">Current session</span> : null}</div>
                  <p>{note.chief_complaint || note.summary || "Consultation note"}</p>
                  <div className="session-history-meta"><Clock aria-hidden="true" size={12} /> {durationText}</div>
                  <Link className="session-history-link" href={`${clientHref}/sessions/${encodeURIComponent(note.id)}`}>Open session</Link>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
