export const BRAIN_QUICK_ACTIONS = [
  {
    id: "documented-plan",
    label: "Recall documented plan",
    question: "What plan was discussed in the documented visits?",
  },
  {
    id: "reported-symptoms",
    label: "Summarize reported symptoms",
    question: "What symptoms were reported in the documented visits?",
  },
  {
    id: "follow-up",
    label: "Recall follow-up",
    question: "What follow-up was documented for this patient?",
  },
] as const;

type BrainQuickActionsProps = {
  disabled?: boolean;
  onAsk: (question: string) => void;
};

export function BrainQuickActions({ disabled, onAsk }: BrainQuickActionsProps) {
  return (
    <div className="brain-quick-actions" role="group" aria-label="Quick recall actions">
      {BRAIN_QUICK_ACTIONS.map((action) => (
        <button
          className="brain-quick-action-chip"
          disabled={disabled}
          key={action.id}
          onClick={() => onAsk(action.question)}
          type="button"
        >
          {action.label}
        </button>
      ))}
    </div>
  );
}
