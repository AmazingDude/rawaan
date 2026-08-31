"use client";

import { useEffect, useState } from "react";
import { Calendar, Loader2 } from "lucide-react";
import { getPatientInsightsAction } from "@/app/actions";
import type { PatientSessionInsights } from "@/lib/notes/insights";

interface ClientTimelineProps {
  patientId: string;
  patientDisplayName: string;
}

export function ClientTimeline({ patientId, patientDisplayName }: ClientTimelineProps) {
  const [insights, setInsights] = useState<PatientSessionInsights | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    void getPatientInsightsAction(patientId)
      .then((data) => {
        if (!cancelled) setInsights(data);
      })
      .catch(() => {
        if (!cancelled) setInsights(null);
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

  const timeline = insights?.timeline ?? [];

  return (
    <div className="client-timeline">
      <h3 className="section-title">Session History</h3>

      {timeline.length === 0 ? (
        <p className="client-timeline-empty">
          No prior sessions on record for {patientDisplayName}.
        </p>
      ) : (
        <div className="patient-sessions-timeline">
          {timeline.map((session, idx) => (
            <div
              key={session.noteId}
              className={`timeline-item ${idx === 0 ? "is-active" : ""}`}
            >
              <span className="timeline-dot" />
              <div className="timeline-content">
                <div className="timeline-date">
                  <Calendar size={12} />
                  <strong>{session.date}</strong>
                </div>
                <p>{session.chiefComplaint}</p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
