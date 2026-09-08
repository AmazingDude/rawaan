"use client";

import { RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import { useId, useState } from "react";
import type { NoteDraft, ApprovedNote } from "@/lib/notes/schema";
import styles from "@/app/components/session-mindmap.module.css";

type Note = NoteDraft | ApprovedNote;
type MindmapBranch = { group: "history" | "symptoms" | "assessment" | "plan" | "medications" | "followup"; items: string[]; label: string };

function deriveBranches(note: Note): MindmapBranch[] {
  const branches: MindmapBranch[] = [
    { group: "history", label: "History", items: note.history },
    { group: "symptoms", label: "Symptoms", items: note.symptoms },
    { group: "assessment", label: "Assessment", items: note.assessment_discussed },
    { group: "plan", label: "Plan", items: note.plan_discussed },
    { group: "medications", label: "Medications", items: note.medications_mentioned },
    ...(note.follow_up.trim() ? [{ group: "followup" as const, label: "Follow-up", items: [note.follow_up] }] : []),
  ];
  return branches.map((branch) => ({ ...branch, items: branch.items.filter((item) => item.trim()) })).filter((branch) => branch.items.length > 0);
}

const branchColors: Record<MindmapBranch["group"], string> = {
  history: "#3e857c", symptoms: "#bc7c35", assessment: "#8171ac", plan: "#46866a", medications: "#b76768", followup: "#567fa0",
};

export function SessionMindmap({ note }: { note: Note }) {
  const [zoom, setZoom] = useState(1);
  const patternId = "mindmap-dots-" + useId().replaceAll(":", "");
  const branches = deriveBranches(note);
  const rootLabel = note.chief_complaint || note.summary || "Session";

  if (branches.length === 0) {
    return <div className="mindmap-empty-state"><p>No recorded topics are available for this session.</p></div>;
  }

  const nodes = branches.map((branch, index) => {
    const angle = -Math.PI / 2 + (index * Math.PI * 2) / branches.length;
    return { branch, x: 400 + Math.cos(angle) * 152, y: 245 + Math.sin(angle) * 152 };
  });

  return (
    <div className={styles.mindmap}>
      <div className={styles.toolbar} role="group" aria-label="Mind map zoom">
        <button aria-label="Zoom out" disabled={zoom <= 0.75} onClick={() => setZoom((value) => Math.max(0.75, value - 0.15))} type="button"><ZoomOut aria-hidden="true" size={16} /></button>
        <span>{Math.round(zoom * 100)}%</span>
        <button aria-label="Zoom in" disabled={zoom >= 1.45} onClick={() => setZoom((value) => Math.min(1.45, value + 0.15))} type="button"><ZoomIn aria-hidden="true" size={16} /></button>
        <button aria-label="Reset zoom" onClick={() => setZoom(1)} type="button"><RotateCcw aria-hidden="true" size={15} /></button>
      </div>
      <div className={styles.viewport}>
        <svg aria-hidden="true" className={styles.canvas} viewBox="0 0 800 490" style={{ transform: "scale(" + zoom + ")" }}>
          <defs><pattern id={patternId} width="18" height="18" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1" fill="#dce4df" /></pattern></defs>
          <rect width="800" height="490" fill={"url(#" + patternId + ")"} />
          {nodes.map(({ branch, x, y }) => <line key={branch.group} x1="400" y1="245" x2={x} y2={y} stroke={branchColors[branch.group]} strokeWidth="2" opacity=".55" />)}
          <circle cx="400" cy="245" r="43" fill="#173d37" />
          <text x="400" y="249" textAnchor="middle" fill="#fff" fontSize="13" fontWeight="600">Session</text>
          {nodes.map(({ branch, x, y }) => (
            <g key={branch.group}>
              <circle cx={x} cy={y} r="45" fill="#fff" stroke={branchColors[branch.group]} strokeWidth="2" />
              <text x={x} y={y + 4} textAnchor="middle" fill="#2d403a" fontSize="11" fontWeight="600">{branch.label}</text>
            </g>
          ))}
        </svg>
      </div>
      <div className={styles.textEquivalent}>
        <h3>Recorded topics</h3>
        <p><strong>Session focus:</strong> {rootLabel}</p>
        <ul>{branches.map((branch) => <li key={branch.group}><strong>{branch.label}</strong><ul>{branch.items.map((item, index) => <li key={branch.group + "-" + index}>{item}</li>)}</ul></li>)}</ul>
      </div>
    </div>
  );
}
