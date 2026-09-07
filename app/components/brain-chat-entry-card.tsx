import type { BrainChatEntry } from "@/app/components/brain-chat-state";

export function ChatEntryCard({ entry }: { entry: BrainChatEntry }) {
  const response = entry.response;

  return (
    <article className="brain-chat-entry" data-status={response.status}>
      <p className="brain-chat-question">{entry.question}</p>

      {response.status === "supported" ? (
        <div className="brain-chat-body is-supported">
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
        <div className="brain-chat-body is-no-record">
          <p className="brain-chat-state-title">No record of that for this patient.</p>
          <p className="brain-chat-state-body">{response.message}</p>
        </div>
      ) : response.status === "refused" ? (
        <div className="brain-chat-body is-refused">
          <p className="brain-chat-state-title">
            {response.reason === "treatment_or_medication"
              ? "Treatment or medication advice is not available."
              : "General medical information is not available."}
          </p>
          <p className="brain-chat-state-body">{response.message}</p>
        </div>
      ) : (
        <div className="brain-chat-body is-error">
          <p className="brain-chat-state-body">{response.message}</p>
        </div>
      )}
    </article>
  );
}
