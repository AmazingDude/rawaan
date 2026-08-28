"use client";

import { useEffect, useReducer, useState } from "react";

import {
  listBrainPatientsAction,
  queryPatientRecordAction,
  type BrainPatient,
} from "@/app/actions";
import {
  brainChatReducer,
  initialBrainChatState,
  runBrainChatQuery,
  type BrainChatEntry,
} from "@/app/components/brain-chat-state";

function ChatEntryCard({ entry }: { entry: BrainChatEntry }) {
  const response = entry.response;

  return (
    <article className="brain-chat-entry" data-status={response.status}>
      <p className="brain-chat-question">{entry.question}</p>

      {response.status === "supported" ? (
        <div className="brain-chat-body is-supported">
          <p className="brain-chat-answer">{response.answer}</p>
          <div className="brain-chat-citations">
            {response.sources.map((source) => (
              <span className="brain-chat-citation-chip" key={source.noteId}>
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
          <p className="brain-chat-state-title">Unable to answer this question.</p>
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

export function BrainChat() {
  const [state, dispatch] = useReducer(brainChatReducer, initialBrainChatState);
  const [patients, setPatients] = useState<BrainPatient[]>([]);
  const [patientsLoaded, setPatientsLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listBrainPatientsAction().then((list) => {
      if (!cancelled) {
        setPatients(list);
        setPatientsLoaded(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedPatient = patients.find((p) => p.patientId === state.patientId);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!state.patientId || state.isSubmitting) return;
    const question = state.draftQuestion.trim();
    if (!question) return;

    dispatch({ type: "submit-start" });
    const entry = await runBrainChatQuery({
      patientId: state.patientId,
      question,
      query: queryPatientRecordAction,
      now: () => new Date().toISOString(),
    });
    dispatch({ type: "append-entry", entry });
  }

  if (!patientsLoaded) {
    return <p className="brain-chat-loading">Loading patients…</p>;
  }

  if (patients.length === 0) {
    return (
      <div className="roster-empty-state">
        <p className="roster-empty-title">No patients to query yet</p>
        <p className="roster-empty-body">
          Approve a consultation note first, then return here to ask Rawaan about it.
        </p>
      </div>
    );
  }

  return (
    <div className="brain-chat">
      <div className="brain-chat-controls">
        <label className="form-field">
          Patient
          <select
            className="select-input"
            onChange={(event) =>
              dispatch({ type: "select-patient", patientId: event.target.value })
            }
            value={state.patientId}
          >
            <option value="">Select a patient…</option>
            {patients.map((patient) => (
              <option key={patient.patientId} value={patient.patientId}>
                {patient.displayName} ({patient.patientId})
              </option>
            ))}
          </select>
        </label>

        {selectedPatient && (
          <button
            className="ghost-button"
            onClick={() => dispatch({ type: "new-chat" })}
            type="button"
          >
            New chat
          </button>
        )}
      </div>

      {selectedPatient && (
        <div className="patient-context-header">
          {selectedPatient.displayName} · {selectedPatient.patientId}
        </div>
      )}

      <div className="brain-chat-thread" aria-live="polite">
        {state.entries.length === 0 ? (
          <p className="brain-chat-empty">
            {selectedPatient
              ? "Ask a question about this patient's documented history."
              : "Select a patient to start a grounded conversation."}
          </p>
        ) : (
          state.entries.map((entry, index) => (
            <ChatEntryCard entry={entry} key={`${entry.timestamp}-${index}`} />
          ))
        )}
      </div>

      <form className="brain-chat-input-row" onSubmit={handleSubmit}>
        <input
          className="brain-chat-input"
          disabled={!state.patientId || state.isSubmitting}
          onChange={(event) => dispatch({ type: "set-draft", text: event.target.value })}
          placeholder="Ask about symptoms, history, or past discussions…"
          type="text"
          value={state.draftQuestion}
        />
        <button
          className="primary-button"
          disabled={!state.patientId || state.isSubmitting || !state.draftQuestion.trim()}
          type="submit"
        >
          {state.isSubmitting ? "Thinking…" : "Ask"}
        </button>
      </form>
    </div>
  );
}
