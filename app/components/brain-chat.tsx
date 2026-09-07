"use client";

import { MessageSquare } from "lucide-react";
import { useEffect, useReducer, useRef, useState } from "react";

import {
  appendChatEntryAction,
  listBrainPatientsAction,
  listChatThreadsAction,
  prepareByokBrainQueryAction,
  queryPatientRecordAction,
  type BrainPatient,
} from "@/app/actions";
import { ChatEntryCard } from "@/app/components/brain-chat-entry-card";
import {
  brainChatReducer,
  initialBrainChatState,
  runBrainChatQuery,
} from "@/app/components/brain-chat-state";
import { BrainQuickActions } from "@/app/components/brain-quick-actions";
import {
  generateByokGroundedAnswer,
  getStoredGroqByokKey,
} from "@/lib/llm/byok-groq-client";

export function BrainChat({ initialPatientId }: { initialPatientId?: string }) {
  const [state, dispatch] = useReducer(brainChatReducer, initialBrainChatState);
  const [patients, setPatients] = useState<BrainPatient[]>([]);
  const [patientsLoaded, setPatientsLoaded] = useState(false);
  // The thread new entries are persisted under. Null until history loads or
  // the first question of a fresh thread is answered.
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const requestedPatientRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listBrainPatientsAction()
      .then((list) => {
        if (!cancelled) {
          setPatients(list);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPatients([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setPatientsLoaded(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Selecting a patient resumes their most recent persisted thread so the
  // conversation picks up where it left off. Stored entries are display-only
  // and are never sent back into the query pipeline.
  function handleSelectPatient(patientId: string) {
    requestedPatientRef.current = patientId;
    setActiveThreadId(null);
    dispatch({ type: "select-patient", patientId });
    if (!patientId) return;
    void listChatThreadsAction(patientId).then((threads) => {
      // Ignore stale responses if the clinician switched patients mid-load.
      if (requestedPatientRef.current !== patientId) return;
      const latest = threads[threads.length - 1];
      if (latest) {
        setActiveThreadId(latest.threadId);
        dispatch({ type: "load-thread", entries: latest.entries });
      }
    });
  }

  // Deep-linked arrival (e.g. from a client's Chats tab) preselects the
  // patient once the roster has loaded.
  useEffect(() => {
    if (
      !patientsLoaded ||
      !initialPatientId ||
      state.patientId ||
      !patients.some((p) => p.patientId === initialPatientId)
    ) {
      return;
    }
    // Deferred: handleSelectPatient dispatches state updates, which must not
    // run synchronously inside an effect (react-hooks/set-state-in-effect).
    const id = window.setTimeout(() => handleSelectPatient(initialPatientId), 0);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientsLoaded, initialPatientId]);

  const selectedPatient = patients.find((p) => p.patientId === state.patientId);

  async function submitQuestion(rawQuestion: string) {
    if (!state.patientId || state.isSubmitting) return;
    const question = rawQuestion.trim();
    if (!question) return;

    dispatch({ type: "submit-start" });
    const entry = await runBrainChatQuery({
      patientId: state.patientId,
      question,
      history: state.entries,
      query: async (patientId, recordQuestion) => {
        const apiKey = getStoredGroqByokKey();
        if (!apiKey) return queryPatientRecordAction(patientId, recordQuestion);

        const preparation = await prepareByokBrainQueryAction(
          patientId,
          recordQuestion,
        );
        if (!preparation.ok) return preparation;
        if (preparation.kind === "response") {
          return { ok: true, response: preparation.response };
        }

        try {
          return {
            ok: true,
            response: await generateByokGroundedAnswer({
              apiKey,
              evidence: preparation.evidence,
              question: preparation.question,
            }),
          };
        } catch {
          return {
            ok: false,
            message: "The Brain could not answer right now. Try again.",
          };
        }
      },
      now: () => new Date().toISOString(),
    });
    dispatch({ type: "append-entry", entry });

    // Persist the turn so the client's Chats tab stays in sync. A failed save
    // never blocks the on-screen answer.
    const threadId =
      activeThreadId ??
      `thread-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    if (!activeThreadId) setActiveThreadId(threadId);
    void appendChatEntryAction({
      patientId: state.patientId,
      threadId,
      entry,
    }).then((result) => {
      if (!result.ok) console.warn("Chat history save failed:", result.message);
    });
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    void submitQuestion(state.draftQuestion);
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
            disabled={state.isSubmitting}
            onChange={(event) => handleSelectPatient(event.target.value)}
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
            disabled={state.isSubmitting}
            onClick={() => {
              // Starts a fresh thread; stored history stays intact and remains
              // visible on the client's Chats tab.
              setActiveThreadId(null);
              dispatch({ type: "new-chat" });
            }}
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
          <div className="brain-chat-empty">
            <span className="empty-state-icon" aria-hidden="true">
              <MessageSquare size={22} />
            </span>
            <p>
              {selectedPatient
                ? "No questions yet. Ask about symptoms, plans, or follow-ups from this patient's documented visits."
                : "Choose a patient above to start a grounded conversation — every answer cites approved notes only."}
            </p>
          </div>
        ) : (
          state.entries.map((entry, index) => (
            <ChatEntryCard entry={entry} key={`${entry.timestamp}-${index}`} />
          ))
        )}
      </div>

      {selectedPatient && (
        <BrainQuickActions
          disabled={state.isSubmitting}
          onAsk={(question) => void submitQuestion(question)}
        />
      )}

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
