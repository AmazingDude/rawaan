import Link from "next/link";
import type { BrainChatEntry } from "@/app/components/brain-chat-state";
import { RawaanLogo } from "@/app/components/rawaan-logo";
import { AgentAnswer, type PlanReviewContext } from "@/app/components/agent-answer";

export function ChatEntryCard({ entry, patientId, reviewContext }: { entry: BrainChatEntry; patientId?: string; reviewContext?: PlanReviewContext }) {
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
          <RawaanLogo className="rawaan-message-logo" decorative />
        </div>
        <div className="chatgpt-assistant-content">
          {response.status === "agent" ? <AgentAnswer response={response} patientId={patientId} reviewContext={reviewContext}/> : response.status === "supported" ? (
            <div className="brain-chat-body is-supported chatgpt-card-supported">
              <p className="brain-chat-answer">{response.answer}</p>
              <div className="brain-chat-citations">
                {response.sources.map((source, index) => (
                  <Link
                    prefetch={false}
                    href={`/clients/${encodeURIComponent(patientId ?? "")}/sessions/${encodeURIComponent(source.noteId)}`}
                    className="brain-chat-citation-chip"
                    data-source-note-id={source.noteId}
                    key={`${source.noteId}-${source.consultationDate}-${index}`}
                  >
                    {source.consultationDate} · Source {index + 1}
                  </Link>
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
