import type { BrainChatEntry } from "@/app/components/brain-chat-state";
import { Sparkles } from "lucide-react";

export function ChatEntryCard({ entry }: { entry: BrainChatEntry }) {
  const response = entry.response;

  return (
    <article className="brain-chat-entry chatgpt-turn" data-status={response.status}>
      {/* User message row */}
      <div className="chatgpt-message-row is-user">
        <div className="chatgpt-user-bubble">
          <p className="brain-chat-question">{entry.question}</p>
        </div>
      </div>

      {/* Assistant message row */}
      <div className="chatgpt-message-row is-assistant">
        <div className="chatgpt-assistant-avatar" aria-hidden="true">
          <Sparkles size={16} />
        </div>
        <div className="chatgpt-assistant-content">
          {response.status === "supported" ? (
            <div className="brain-chat-body is-supported chatgpt-card-supported">
              <p className="brain-chat-answer">{response.answer}</p>
              <div className="brain-chat-citations">
                {response.sources.map((source, index) => (
                  <span
                    className="brain-chat-citation-chip"
                    key={`${source.noteId}-${source.consultationDate}-${index}`}
                  >
                    {source.consultationDate} · {source.noteId}
                  </span>
                ))}
              </div>
            </div>
          ) : response.status === "no_supporting_record" ? (
            <div className="brain-chat-body is-no-record chatgpt-card-no-record">
              <p className="brain-chat-state-title">No record of that for this patient.</p>
            </div>
          ) : response.status === "refused" ? (
            <div className="brain-chat-body is-refused chatgpt-card-refused">
              <p className="brain-chat-state-title">
                {response.reason === "treatment_or_medication"
                  ? "Treatment or medication advice is not available."
                  : "General medical information is not available."}
              </p>
              <p className="brain-chat-state-body">{response.message}</p>
            </div>
          ) : (
            <div className="brain-chat-body is-error chatgpt-card-error">
              <p className="brain-chat-state-body">{response.message}</p>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
