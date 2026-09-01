import { Calendar, Clock, Mic, FileAudio } from "lucide-react";
import type { NoteDraft, ApprovedNote } from "@/lib/notes/schema";

type Note = NoteDraft | ApprovedNote;

interface SessionInfoViewProps {
  note: Note;
}

function formatDuration(seconds?: number): string {
  if (seconds === undefined || seconds === 0) return "Not recorded";
  const mins = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (mins === 0) return `${remainingSeconds}s`;
  return `${mins}m ${remainingSeconds.toString().padStart(2, "0")}s`;
}

function formatSessionType(type?: string): string {
  if (!type) return "Consultation";
  const labels: Record<string, string> = {
    "in-person": "In-Person Session",
    telehealth: "Telehealth Session",
    summary: "Dictated Summary",
    upload: "Uploaded Recording",
    manual: "Manual Note",
  };
  return labels[type] || type;
}

export function SessionInfoView({ note }: SessionInfoViewProps) {
  const info = note.session_info;
  const transcriptWordCount = note.raw_transcript.split(/\s+/).filter(Boolean).length;

  return (
    <div className="session-info-grid">
      <div className="session-info-card">
        <div className="session-info-icon">
          <Calendar size={18} />
        </div>
        <div className="session-info-body">
          <span className="session-info-label">Session Date</span>
          <span className="session-info-value">{note.consultation_date}</span>
        </div>
      </div>

      <div className="session-info-card">
        <div className="session-info-icon">
          <FileAudio size={18} />
        </div>
        <div className="session-info-body">
          <span className="session-info-label">Session Type</span>
          <span className="session-info-value">{formatSessionType(info?.session_type)}</span>
        </div>
      </div>

      <div className="session-info-card">
        <div className="session-info-icon">
          <Clock size={18} />
        </div>
        <div className="session-info-body">
          <span className="session-info-label">Recording Duration</span>
          <span className="session-info-value">{formatDuration(info?.duration_seconds)}</span>
        </div>
      </div>

      <div className="session-info-card">
        <div className="session-info-icon">
          <Mic size={18} />
        </div>
        <div className="session-info-body">
          <span className="session-info-label">Audio Source</span>
          <span className="session-info-value">{info?.recording_device || "Not recorded"}</span>
        </div>
      </div>

      <div className="session-info-card is-wide">
        <div className="session-info-body">
          <span className="session-info-label">Transcript Provenance</span>
          <span className="session-info-value">
            {info?.transcript_source || "Not recorded"}
          </span>
          <span className="session-info-meta">
            {transcriptWordCount.toLocaleString()} words captured
            {info?.recorded_at ? ` · recorded ${new Date(info.recorded_at).toLocaleString()}` : ""}
          </span>
        </div>
      </div>
    </div>
  );
}
