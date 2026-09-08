"use client";

import { ArrowUp, MessageSquare, Menu, Plus, Globe, User } from "lucide-react";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { listBrainPatientsAction, listAgentThreadsAction, sendAgentMessageAction, type BrainPatient } from "@/app/actions";
import { ChatEntryCard } from "@/app/components/brain-chat-entry-card";
import { RawaanLogo } from "@/app/components/rawaan-logo";
import { RequestStatus } from "@/app/components/request-status";
import { brainChatReducer, initialBrainChatState } from "@/app/components/brain-chat-state";
import { STORAGE_ERROR_MESSAGE } from "@/lib/db/errors";
import type { ChatThread } from "@/lib/db/chats";

const ClinicalContextPanel = dynamic(() => import("@/app/components/clinical-context-panel").then(module => module.ClinicalContextPanel), {
  loading: () => <RequestStatus label="Loading clinical context…" skeleton />,
});
const generalPrompts = ["Explain a medical concept in simple terms", "Help me prepare for my next consultation", "What information is needed for a treatment plan?"];
const clientPrompts = ["Summarize this client's session history", "Help me prepare for this client's next session", "Draft a discussion plan from the saved sessions"];

export function BrainChat({ initialPatientId, initialQuestion }: { initialPatientId?: string; initialQuestion?: string }) {
  const [state, dispatch] = useReducer(brainChatReducer, initialBrainChatState);
  const [patients, setPatients] = useState<BrainPatient[]>([]);
  const [patientsLoading, setPatientsLoading] = useState(false);
  const [patientLoadError, setPatientLoadError] = useState<string | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [threads, setThreads] = useState<ChatThread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [contextOpen, setContextOpen] = useState(false);
  const [mode, setMode] = useState<"assistant" | "records">("assistant");
  const [webEnabled, setWebEnabled] = useState(true);
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);
  const [unsaved, setUnsaved] = useState<Set<string>>(new Set());

  const mountedRef = useRef(true);
  const patientsRequestedRef = useRef(false);
  const initialAppliedRef = useRef(false);
  const requestedPatientRef = useRef("");
  const loadedHistoryRef = useRef<string | null>(null);
  const historyGenerationRef = useRef(0);
  const activeThreadRef = useRef<string | null>(null);
  const queryGenerationRef = useRef(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const loadPatients = useCallback(async () => {
    if (patientsRequestedRef.current) return;
    patientsRequestedRef.current = true;
    setPatientsLoading(true);
    setPatientLoadError(null);
    try { const list = await listBrainPatientsAction(); if (mountedRef.current) setPatients(list); }
    catch { if (mountedRef.current) { setPatientLoadError(STORAGE_ERROR_MESSAGE); patientsRequestedRef.current = false; } }
    finally { if (mountedRef.current) setPatientsLoading(false); }
  }, []);

  const loadHistory = useCallback(async (patientId: string) => {
    const generation = ++historyGenerationRef.current;
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const fetched = await listAgentThreadsAction(patientId || null);
      if (generation !== historyGenerationRef.current || !mountedRef.current || requestedPatientRef.current !== patientId) return;
      loadedHistoryRef.current = patientId;
      setHistoryLoaded(true);
      setThreads([...fetched].reverse());
    } catch {
      if (generation === historyGenerationRef.current && mountedRef.current) setHistoryError(STORAGE_ERROR_MESSAGE);
    } finally {
      if (generation === historyGenerationRef.current && mountedRef.current) setHistoryLoading(false);
    }
  }, []);

  const handleSelectPatient = useCallback((patientId: string) => {
    queryGenerationRef.current++;
    historyGenerationRef.current++;
    requestedPatientRef.current = patientId;
    loadedHistoryRef.current = null;
    activeThreadRef.current = null;
    setHistoryError(null); setSaveError(null); setHistoryLoading(false); setHistoryLoaded(false);
    setActiveThreadId(null); setThreads([]); setIsHistoryOpen(false); setContextOpen(false); setPendingQuestion(null); setUnsaved(new Set());
    dispatch({ type: "select-patient", patientId });
  }, []);

  useEffect(() => {
    if (!initialPatientId) return;
    const timer = window.setTimeout(() => void loadPatients(), 0);
    return () => window.clearTimeout(timer);
  }, [initialPatientId, loadPatients]);

  useEffect(() => {
    if (initialAppliedRef.current || (initialPatientId && !patients.some(patient => patient.patientId === initialPatientId))) return;
    const timer = window.setTimeout(() => {
      initialAppliedRef.current = true;
      if (initialPatientId) handleSelectPatient(initialPatientId);
      if (initialQuestion) dispatch({ type: "set-draft", text: initialQuestion });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [initialPatientId, initialQuestion, patients, handleSelectPatient]);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [state.entries, pendingQuestion]);

  const selectedPatient = patients.find(patient => patient.patientId === state.patientId);
  function handleNewChat() {
    queryGenerationRef.current++;
    activeThreadRef.current = null;
    setActiveThreadId(null); setIsHistoryOpen(false); setSaveError(null); setPendingQuestion(null); setUnsaved(new Set());
    dispatch({ type: "new-chat" });
    inputRef.current?.focus();
  }
  function openHistory() {
    setIsHistoryOpen(open => !open);
    if (loadedHistoryRef.current !== state.patientId && !historyLoading) void loadHistory(state.patientId);
  }
  function handleSelectThread(thread: ChatThread) {
    if (loadedHistoryRef.current !== state.patientId || !threads.includes(thread) || state.isSubmitting) return;
    queryGenerationRef.current++;
    activeThreadRef.current = thread.threadId;
    setActiveThreadId(thread.threadId); setIsHistoryOpen(false); setSaveError(null); setPendingQuestion(null); setUnsaved(new Set());
    dispatch({ type: "load-thread", entries: thread.entries });
  }
  async function submitQuestion(rawQuestion: string) {
    const question = rawQuestion.trim();
    if (!question || question.length > 5000 || state.isSubmitting || (mode === "records" && !state.patientId)) return;
    const patientId = state.patientId;
    const threadId = activeThreadRef.current;
    const generation = ++queryGenerationRef.current;
    dispatch({ type: "submit-start" });
    setPendingQuestion(question);
    setSaveError(null);
    try {
      const result = await sendAgentMessageAction({ patientId: patientId || null, threadId, question, mode, webEnabled });
      if (!mountedRef.current || generation !== queryGenerationRef.current || requestedPatientRef.current !== patientId || activeThreadRef.current !== threadId) return;
      if (result.ok) {
        activeThreadRef.current = result.threadId;
        setActiveThreadId(result.threadId);
        dispatch({ type: "append-entry", entry: { question, response: result.response, timestamp: result.timestamp } });
        if (!result.persisted) {
          setUnsaved(previous => new Set(previous).add(result.timestamp));
          setSaveError("This reply is visible but could not be saved. Try again before leaving this conversation.");
        }
        loadedHistoryRef.current = null;
      } else {
        dispatch({ type: "append-entry", entry: { question, response: { status: "error", message: result.message }, timestamp: new Date().toISOString() } });
      }
    } catch {
      if (mountedRef.current && generation === queryGenerationRef.current) dispatch({ type: "append-entry", entry: {
        question, response: { status: "error", message: "Rawaan could not answer. Please retry." }, timestamp: new Date().toISOString(),
      } });
    } finally {
      if (mountedRef.current && generation === queryGenerationRef.current) setPendingQuestion(null);
    }
  }

  return <div className="chatgpt-container">
    <aside className={`chatgpt-sidebar ${isHistoryOpen ? "is-open" : ""}`} aria-label="Chat history">
      <div className="chatgpt-sidebar-header"><button className="chatgpt-new-chat-btn ghost-button" onClick={handleNewChat} type="button"><Plus size={16}/> New chat</button></div>
      <div className="chatgpt-threads-scroll">
        <div className="chatgpt-threads-section-title">{selectedPatient ? selectedPatient.displayName + "'s conversations" : "General conversations"}</div>
        <button className="agent-history-load secondary-button" disabled={historyLoading} onClick={() => void loadHistory(state.patientId)} type="button">{historyLoading ? "Loading…" : "Load conversations"}</button>
        {historyLoading ? <RequestStatus label="Loading conversations…" skeleton/> : null}
        {historyError ? <p role="alert">{historyError}</p> : null}
        {!historyLoading && historyLoaded && !threads.length ? <p className="chatgpt-thread-empty">No saved conversations yet.</p> : null}
        {threads.map(thread => <button key={thread.threadId} className={`chatgpt-thread-item ${thread.threadId === activeThreadId ? "is-active" : ""}`} disabled={state.isSubmitting} onClick={() => handleSelectThread(thread)} type="button">
          <MessageSquare size={15}/><span className="chatgpt-thread-title">{thread.entries[0]?.question || "Conversation"}</span>
        </button>)}
      </div>
      <div className="chatgpt-sidebar-footer"><RawaanLogo decorative className="rawaan-message-logo"/><span>Rawaan AI</span></div>
    </aside>
    {isHistoryOpen ? <button aria-label="Close chat history" className="chatgpt-mobile-scrim" onClick={() => setIsHistoryOpen(false)} type="button"/> : null}
    <main className="chatgpt-main">
      <header className="chatgpt-topbar">
        <span className="chatgpt-topbar-name">{selectedPatient?.displayName || "Rawaan AI"}</span>
        <div className="chatgpt-topbar-actions">
          <button aria-expanded={isHistoryOpen} aria-label="Chat history" className="chatgpt-history-toggle" onClick={openHistory} type="button"><Menu size={16}/> History</button>
          <div className="chatgpt-topbar-patient-picker">
            <label htmlFor="topbar-patient-select" className="chatgpt-topbar-label"><User size={14}/> Client:</label>
            <select id="topbar-patient-select" className="chatgpt-topbar-select select-input" onFocus={() => void loadPatients()} onChange={event => handleSelectPatient(event.target.value)} value={state.patientId}>
              <option value="">General chat</option>{patients.map(patient => <option key={patient.patientId} value={patient.patientId}>{patient.displayName}</option>)}
            </select>
          </div>
          {state.patientId ? <button className="secondary-button" aria-expanded={contextOpen} title="Optional extra details; saved notes are included automatically" onClick={() => setContextOpen(open => !open)} type="button">Clinical context</button> : null}
        </div>
      </header>
      <div className="agent-mode-bar">
        <label>Mode <select aria-label="Assistant mode" value={mode} disabled={state.isSubmitting} onChange={event => { setMode(event.target.value as "assistant" | "records"); handleNewChat(); }}>
          <option value="assistant">Assistant</option><option value="records">Records only</option>
        </select></label>
        <label className="agent-web-toggle"><input type="checkbox" checked={webEnabled} disabled={state.isSubmitting || mode === "records"} onChange={event => setWebEnabled(event.target.checked)}/><Globe size={15}/> Web search</label>
        {state.patientId ? <span>All saved sessions are included automatically.</span> : null}
        {patientsLoading ? <RequestStatus label="Loading clients…"/> : null}
        {patientLoadError ? <span role="alert">Could not load clients. <button type="button" onClick={() => void loadPatients()}>Retry</button></span> : null}
      </div>
      {contextOpen && state.patientId ? <div className="agent-context-drawer"><ClinicalContextPanel key={state.patientId} patientId={state.patientId} onClose={() => setContextOpen(false)}/></div> : null}
      {saveError ? <p className="agent-tool-notice" role="alert">{saveError}</p> : null}
      <div className="chatgpt-messages-container brain-chat-thread">
        <div className="chatgpt-messages-stream">
          {!state.entries.length && !pendingQuestion ? <div className="chatgpt-welcome-state brain-chat-empty">
            <div className="chatgpt-welcome-icon"><RawaanLogo className="rawaan-welcome-logo" decorative/></div>
            <h2 className="chatgpt-welcome-title">What can I help you with?</h2>
            <p className="chatgpt-welcome-desc">{mode === "records" ? "Select a client to recall exact excerpts from their approved notes." : state.patientId ? "Your client's full saved session history is included automatically. Ask about their history or prepare for the next session." : "Ask a question, explore clinical considerations, or draft a plan. Select a client when you want their records included."}</p>
            {mode === "assistant" ? <div className="chatgpt-quick-prompts-grid">{(state.patientId ? clientPrompts : generalPrompts).map(question => <button className="chatgpt-quick-prompt-card" key={question} onClick={() => dispatch({ type: "set-draft", text: question })} type="button">{question}<ArrowUp size={14}/></button>)}</div> : null}
          </div> : null}
          {state.entries.map((entry, index) => <ChatEntryCard entry={entry} patientId={state.patientId || undefined} key={entry.timestamp + "-" + index}
            reviewContext={state.patientId && activeThreadId && !unsaved.has(entry.timestamp) ? { patientId: state.patientId, threadId: activeThreadId, entryTimestamp: entry.timestamp } : undefined}/>)}
          {pendingQuestion ? <article className="chatgpt-turn"><div className="chatgpt-message-row is-user"><div className="chatgpt-user-bubble"><p>{pendingQuestion}</p></div></div><div className="chatgpt-message-row is-assistant"><RawaanLogo className="rawaan-message-logo" decorative/><RequestStatus label={mode === "records" ? "Checking approved notes…" : webEnabled ? "Thinking and checking sources…" : "Thinking…"} skeleton/></div></article> : null}
          <div ref={messagesEndRef}/>
        </div>
      </div>
      <footer className="chatgpt-input-container">
        <form className="chatgpt-input-capsule brain-chat-input-row" onSubmit={event => { event.preventDefault(); void submitQuestion(state.draftQuestion); }}>
          <input ref={inputRef} className="chatgpt-text-input brain-chat-input" maxLength={5000} disabled={state.isSubmitting || (mode === "records" && !state.patientId)} onChange={event => dispatch({ type: "set-draft", text: event.target.value })} placeholder={mode === "records" ? "Ask about the client's recorded history…" : "Message Rawaan…"} aria-label="Message Rawaan" value={state.draftQuestion}/>
          <button className="chatgpt-send-btn primary-button" disabled={state.isSubmitting || !state.draftQuestion.trim() || (mode === "records" && !state.patientId)} type="submit" aria-label="Send message"><ArrowUp size={18}/></button>
        </form>
        <p className="chatgpt-disclaimer">{mode === "records" ? "Exact excerpts from approved notes; absent information is reported." : "Clinical suggestions are proposals for clinician review. Web sources appear when search is available."}</p>
      </footer>
    </main>
  </div>;
}
