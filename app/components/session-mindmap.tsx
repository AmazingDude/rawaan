import type { NoteDraft, ApprovedNote } from "@/lib/notes/schema";

type Note = NoteDraft | ApprovedNote;

interface MindmapBranch {
  group: "history" | "symptoms" | "assessment" | "plan" | "medications" | "followup";
  items: string[];
  label: string;
}

function deriveBranches(note: Note): MindmapBranch[] {
  const branches: MindmapBranch[] = [
    { group: "history", label: "History", items: note.history },
    { group: "symptoms", label: "Symptoms", items: note.symptoms },
    { group: "assessment", label: "Assessment", items: note.assessment_discussed },
    { group: "plan", label: "Plan", items: note.plan_discussed },
    { group: "medications", label: "Medications", items: note.medications_mentioned },
  ];

  if (note.follow_up) {
    branches.push({ group: "followup", label: "Follow-up", items: [note.follow_up] });
  }

  return branches.filter((branch) => branch.items.length > 0);
}

const groupColorClass: Record<MindmapBranch["group"], string> = {
  history: "mindmap-branch-history",
  symptoms: "mindmap-branch-symptoms",
  assessment: "mindmap-branch-assessment",
  plan: "mindmap-branch-plan",
  medications: "mindmap-branch-medications",
  followup: "mindmap-branch-followup",
};

interface SessionMindmapProps {
  note: Note;
}

export function SessionMindmap({ note }: SessionMindmapProps) {
  const branches = deriveBranches(note);
  const rootLabel = note.chief_complaint || note.summary || "Session Focus";

  if (branches.length === 0) {
    return (
      <div className="mindmap-empty-state">
        <p>No structured topics available to build a mindmap from this note.</p>
      </div>
    );
  }

  return (
    <div className="mindmap-canvas">
      <div className="mindmap-root-node">
        <span className="mindmap-node-label">{rootLabel}</span>
      </div>

      <div className="mindmap-branches">
        {branches.map((branch) => (
          <div key={branch.group} className={`mindmap-branch ${groupColorClass[branch.group]}`}>
            <div className="mindmap-branch-connector">
              <span className="mindmap-connector-line" />
            </div>
            <div className="mindmap-branch-content">
              <h3 className="mindmap-branch-title">{branch.label}</h3>
              <ul className="mindmap-leaf-list">
                {branch.items.map((item, idx) => (
                  <li key={`${branch.group}-${idx}`} className="mindmap-leaf-node">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
