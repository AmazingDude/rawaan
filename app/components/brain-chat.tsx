"use client";

import {
  ArrowUp,
  MessageSquare,
  Plus,
  ShieldCheck,
  Sparkles,
  User,
} from "lucide-react";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";

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
import { BRAIN_QUICK_ACTIONS } from "@/app/components/brain-quick-actions";
import type { ChatThread } from "@/lib/db/chats";
import {
  generateByokGroundedAnswer,
  getStoredGroqByokKey,
} from "@/lib/llm/byok-groq-client";

function getPatientInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0][0] || ""}${parts[parts.length - 1][0] || ""}`.toUpperCase();
  }
  return (name.slice(0, 2) || "PT").toUpperCase();
}

function formatThreadDate(timestamp: string): string {
  try {
    const d = new Date(timestamp);
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
    });
  } catch {
    return "";
  }
}

function createThreadId(): string {
  return `thread-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function BrainChat({ initialPatientId }: { initialPatientId?: string }) {
  const [state, dispatch] = useReducer(brainChatReducer, initialBrainChatState);
  const [patients, setPatients] = useState<BrainPatient[]>([]);
  const [patientsLoaded, setPatientsLoaded] = useState(false);
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);

  const requestedPatientRef = useRef<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const loadPatientThreads = useCallback(async (patientId: string) => {
    if (!patientId) {
      setThreads([]);
      return;
    }
    try {
      const fetched = await listChatThreadsAction(patientId);
      if (requestedPatientRef.current !== patientId) return;
      setThreads(fetched);
    } catch {
      if (requestedPatientRef.current === patientId) {
        setThreads([]);
      }
    }
  }, []);

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

  // When patient is selected: DO NOT automatically load the previous chat.
  // Wait for the user to select a chat log from the sidebar, or start a new chat.
  const handleSelectPatient = useCallback(
    (patientId: string) => {
      requestedPatientRef.current = patientId;
      setActiveThreadId(null);
      dispatch({ type: "select-patient", patientId });
      if (!patientId) {
        setThreads([]);
        return;
      }
      void loadPatientThreads(patientId);
    },
    [loadPatientThreads],
  );

  useEffect(() => {
    if (
      !patientsLoaded ||
      !initialPatientId ||
      state.patientId ||
      !patients.some((p) => p.patientId === initialPatientId)
    ) {
      return;
    }
    const id = window.setTimeout(() => handleSelectPatient(initialPatientId), 0);
    return () => window.clearTimeout(id);
  }, [patientsLoaded, initialPatientId, state.patientId, patients, handleSelectPatient]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [state.entries]);

  const selectedPatient = patients.find((p) => p.patientId === state.patientId);

  function handleNewChat() {
    setActiveThreadId(null);
    dispatch({ type: "new-chat" });
    inputRef.current?.focus();
  }

  function handleSelectThread(thread: ChatThread) {
    setActiveThreadId(thread.threadId);
    dispatch({ type: "load-thread", entries: thread.entries });
    inputRef.current?.focus();
  }

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

    const threadId = activeThreadId ?? createThreadId();
    if (!activeThreadId) setActiveThreadId(threadId);

    void appendChatEntryAction({
      patientId: state.patientId,
      threadId,
      entry,
    }).then((result) => {
      if (!result.ok) console.warn("Chat history save failed:", result.message);
      // Reload threads list so sidebar updates immediately with the new chat log
      void loadPatientThreads(state.patientId);
    });
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    void submitQuestion(state.draftQuestion);
  }

  function handleComposerKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    if (!state.isSubmitting && state.draftQuestion.trim()) {
      void submitQuestion(state.draftQuestion);
    }
  }

  if (!patientsLoaded) {
    return (
      <div className="chatgpt-container">
        <p className="brain-chat-loading" style={{ margin: "auto" }}>
          Loading clinician workspace…
        </p>
      </div>
    );
  }

  if (patients.length === 0) {
    return (
      <div className="roster-empty-state" style={{ margin: "auto" }}>
        <p className="roster-empty-title">No patients to query yet</p>
        <p className="roster-empty-body">
          Approve a consultation note first, then return here to ask Rawaan about it.
        </p>
      </div>
    );
  }

  return (
    <div className="chatgpt-container">
      {/* Left Sidebar: ONLY Chat Logs & New Chat */}
      <aside className="chatgpt-sidebar">
        <div className="chatgpt-sidebar-header">
          <button
            className="chatgpt-new-chat-btn ghost-button"
            disabled={!state.patientId || state.isSubmitting}
            onClick={handleNewChat}
            type="button"
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <Plus size={16} />
              <span>New chat</span>
            </div>
          </button>
        </div>

        <div className="chatgpt-threads-scroll" tabIndex={0}>
          <div className="chatgpt-threads-section-title">
            {selectedPatient ? `Chat Logs (${threads.length})` : "Chat Logs"}
          </div>

          {selectedPatient ? (
            threads.length === 0 ? (
              <div className="chatgpt-thread-empty">
                No previous chat logs for this patient.
                <br />
                Ask a question to start the first conversation!
              </div>
            ) : (
              threads.map((thread) => {
                const isActive = thread.threadId === activeThreadId;
                const firstQuestion =
                  thread.entries[0]?.question || "Conversation";
                const dateLabel = formatThreadDate(thread.startedAt);

                return (
                  <button
                    key={thread.threadId}
                    className={`chatgpt-thread-item ${isActive ? "is-active" : ""}`}
                    onClick={() => handleSelectThread(thread)}
                    type="button"
                    title={firstQuestion}
                  >
                    <MessageSquare size={15} style={{ flexShrink: 0 }} />
                    <span className="chatgpt-thread-title">{firstQuestion}</span>
                    {dateLabel && (
                      <span
                        style={{
                          fontSize: "11px",
                          color: isActive ? "#0f4c3a" : "#94a3b8",
                          flexShrink: 0,
                        }}
                      >
                        {dateLabel}
                      </span>
                    )}
                  </button>
                );
              })
            )
          ) : (
            <div className="chatgpt-thread-empty">
              Select a patient on the top right to view chat logs.
            </div>
          )}
        </div>

        <div className="chatgpt-sidebar-footer">
          <span className="chatgpt-status-dot" aria-hidden="true" />
          <ShieldCheck size={14} style={{ color: "#10b981" }} />
          <span>Grounded in approved notes</span>
        </div>
      </aside>

      {/* Right Main Chat Area */}
      <main className="chatgpt-main">
        {/* Top bar with Patient on Left AND Patient Selector on the Right */}
        <header className="chatgpt-topbar">
          <div className="chatgpt-topbar-patient">
            {selectedPatient ? (
              <>
                <div className="chatgpt-patient-avatar">
                  {getPatientInitials(selectedPatient.displayName)}
                </div>
                <div className="chatgpt-topbar-info">
                  <span className="chatgpt-topbar-name">
                    {selectedPatient.displayName}
                  </span>
                  <span className="chatgpt-topbar-id">
                    {selectedPatient.patientId}
                  </span>
                </div>
              </>
            ) : (
              <span className="chatgpt-topbar-name" style={{ color: "#64748b" }}>
                Select a patient to begin
              </span>
            )}
          </div>

          {/* Moved Patient Selector to the Right */}
          <div className="chatgpt-topbar-actions">
            <div className="chatgpt-topbar-patient-picker">
              <label
                htmlFor="topbar-patient-select"
                className="chatgpt-topbar-label"
              >
                <User size={14} />
                <span>Patient:</span>
              </label>
              <select
                id="topbar-patient-select"
                className="chatgpt-topbar-select select-input"
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
            </div>

            <span className="chatgpt-topbar-pill">Rawaan AI Brain</span>
          </div>
        </header>

        {/* Messages Container with Explicit Visible Scrollbar */}
        <div
          className="chatgpt-messages-container brain-chat-thread"
          aria-live="polite"
        >
          <div className="chatgpt-messages-stream">
            {state.entries.length === 0 ? (
              <div className="chatgpt-welcome-state brain-chat-empty">
                <div className="chatgpt-welcome-icon" aria-hidden="true">
                  <Sparkles size={28} />
                </div>
                <h2 className="chatgpt-welcome-title">
                  {selectedPatient
                    ? `How can I help with ${selectedPatient.displayName}'s records?`
                    : "Rawaan AI Patient Brain"}
                </h2>
                <p className="chatgpt-welcome-desc">
                  {selectedPatient
                    ? "Ask about documented symptoms, treatment plans, or follow-ups. Select a previous chat log on the left or type a question below to start a new chat."
                    : "Select a patient from the dropdown in the top right to start exploring approved medical records."}
                </p>

                {selectedPatient && (
                  <div className="chatgpt-quick-prompts-grid">
                    {BRAIN_QUICK_ACTIONS.map((action) => (
                      <button
                        key={action.id}
                        className="chatgpt-quick-prompt-card"
                        disabled={state.isSubmitting}
                        onClick={() => void submitQuestion(action.question)}
                        type="button"
                      >
                        <span>{action.question}</span>
                        <ArrowUp size={14} style={{ opacity: 0.6 }} />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              state.entries.map((entry, index) => (
                <ChatEntryCard
                  entry={entry}
                  key={`${entry.timestamp}-${index}`}
                />
              ))
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Bottom Floating Input Container (ChatGPT Capsule) */}
        <footer className="chatgpt-input-container">
          <form
            className="chatgpt-input-capsule brain-chat-input-row"
            onSubmit={handleSubmit}
          >
            <textarea
              ref={inputRef}
              className="chatgpt-text-input brain-chat-input"
              disabled={!state.patientId || state.isSubmitting}
              onChange={(event) =>
                dispatch({ type: "set-draft", text: event.target.value })
              }
              onKeyDown={handleComposerKeyDown}
              placeholder={
                selectedPatient
                  ? `Ask about ${selectedPatient.displayName}'s symptoms, history, or plans…`
                  : "Select a patient on the top right to ask questions…"
              }
              rows={1}
              value={state.draftQuestion}
            />

            <button
              className="chatgpt-send-btn primary-button"
              disabled={
                !state.patientId ||
                state.isSubmitting ||
                !state.draftQuestion.trim()
              }
              type="submit"
              aria-label="Send message"
            >
              <ArrowUp size={18} />
            </button>
          </form>

          <p className="chatgpt-composer-hint">Press Enter to ask · Shift+Enter for a new line</p>
          <p className="chatgpt-disclaimer">
            Rawaan AI answers strictly from approved clinician records · Documentation support only
          </p>
        </footer>
      </main>
    </div>
  );
}
