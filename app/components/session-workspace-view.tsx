"use client";

import {
  ArrowUp,
  Check,
  Clipboard,
  Download,
  EyeOff,
  FileText,
  Languages,
  Lock,
  Mail,
  Mic,
  Paperclip,
  Smartphone,
  Sprout,
  X,
  Zap,
} from "lucide-react";
import { useState } from "react";

import { approveDraftAction, modifyNoteAction } from "@/app/actions";
import { ClientTimeline } from "@/app/components/client-timeline";
import { ReflectionQuestions } from "@/app/components/reflection-questions";
import { SessionInfoView } from "@/app/components/session-info-view";
import { SessionMindmap } from "@/app/components/session-mindmap";
import type { ApprovedNote, NoteDraft } from "@/lib/notes/schema";

interface SessionWorkspaceViewProps {
  draft: NoteDraft | ApprovedNote;
  isManualEntry?: boolean;
  onApprove?: (note: ApprovedNote) => void;
  onBack: () => void;
}

interface ChatMessage {
  id: string;
  role: "assistant" | "user";
  text: string;
  timestamp: string;
}

export function SessionWorkspaceView({
  draft: initialDraft,
  onApprove,
  onBack,
}: SessionWorkspaceViewProps) {
  const [activeTab, setActiveTab] = useState<
    | "notes"
    | "client"
    | "treatment"
    | "transcript"
    | "session-info"
    | "mindmap"
    | "reflection"
  >("notes");

  const [currentNote, setCurrentNote] = useState<NoteDraft | ApprovedNote>(initialDraft);
  const [noteVariant, setNoteVariant] = useState<"BASE" | "SOAP" | "NARRATIVE">("BASE");
  const [detailLevel, setDetailLevel] = useState<"Detailed" | "Concise">("Detailed");
  const [isCopied, setIsCopied] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(() => [
    {
      id: "msg-welcome",
      role: "assistant",
      text: `I've loaded ${initialDraft.patient_display_name}'s clinical note into context. You can ask me to rewrite the note in a different format, remove identifiable names, summarize key clinical points, or make custom edits.`,
      timestamp: "Just now",
    },
  ]);
  const [inputPrompt, setInputPrompt] = useState("");
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [includeTreatmentPlanToggle, setIncludeTreatmentPlanToggle] = useState(true);

  // Generate fallback summary if empty
  const noteSummary =
    currentNote.summary ||
    (currentNote.chief_complaint
      ? `This consultation focused on ${currentNote.chief_complaint}. Clinical history was evaluated alongside reported symptoms (${currentNote.symptoms.slice(0, 2).join(", ") || "observed"}). The provider discussed assessment and instituted the corresponding management plan.`
      : "Clinical consultation note documented from conversation recording.");

  async function handleSendPrompt(promptToSend?: string) {
    const prompt = (promptToSend || inputPrompt).trim();
    if (!prompt || isAiLoading) return;

    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: "user",
      text: prompt,
      timestamp: "Just now",
    };

    setChatMessages((prev) => [...prev, userMsg]);
    setInputPrompt("");
    setIsAiLoading(true);

    try {
      const res = await modifyNoteAction({
        note: currentNote as NoteDraft,
        prompt,
      });

      if (res.ok) {
        setCurrentNote(res.updatedNote);
        const aiMsg: ChatMessage = {
          id: `msg-${Date.now() + 1}`,
          role: "assistant",
          text: res.assistantReply,
          timestamp: "Just now",
        };
        setChatMessages((prev) => [...prev, aiMsg]);
      } else {
        const errorMsg: ChatMessage = {
          id: `msg-${Date.now() + 1}`,
          role: "assistant",
          text: `Sorry, I could not apply those modifications: ${res.message}`,
          timestamp: "Just now",
        };
        setChatMessages((prev) => [...prev, errorMsg]);
      }
    } catch {
      const errorMsg: ChatMessage = {
        id: `msg-${Date.now() + 1}`,
        role: "assistant",
        text: "There was a network error communicating with the AI assistant.",
        timestamp: "Just now",
      };
      setChatMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsAiLoading(false);
    }
  }

  function handleCopyNote() {
    const fullText = `PATIENT: ${currentNote.patient_display_name}\nDATE: ${currentNote.consultation_date}\n\nSUMMARY:\n${noteSummary}\n\nCHIEF COMPLAINT:\n${currentNote.chief_complaint}\n\nHISTORY:\n${currentNote.history.map((h) => `• ${h}`).join("\n")}\n\nSYMPTOMS:\n${currentNote.symptoms.map((s) => `• ${s}`).join("\n")}\n\nASSESSMENT DISCUSSED:\n${currentNote.assessment_discussed.map((a) => `• ${a}`).join("\n")}\n\nPLAN DISCUSSED:\n${currentNote.plan_discussed.map((p) => `• ${p}`).join("\n")}\n\nMEDICATIONS MENTIONED:\n${currentNote.medications_mentioned.map((m) => `• ${m}`).join("\n")}\n\nFOLLOW-UP:\n${currentNote.follow_up}`;

    void navigator.clipboard.writeText(fullText).then(() => {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    });
  }

  async function handleApproveAndSave() {
    setIsSaving(true);
    setSaveError(null);

    // Persist through the server action so the approved note lands in the
    // store (Supabase + local JSON) instead of only updating this view.
    // approval_status is normalized to "draft" because approve() re-marks it.
    const result = await approveDraftAction({
      ...currentNote,
      approval_status: "draft",
      summary: noteSummary,
    });

    setIsSaving(false);

    if (!result.ok) {
      setSaveError(result.message);
      return;
    }

    const saved: ApprovedNote = {
      ...currentNote,
      approval_status: "approved",
      approved_at: result.approvedAt,
      id: result.noteId,
      summary: noteSummary,
    };

    if (onApprove) {
      onApprove(saved);
    }
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 3000);
  }

  return (
    <div className="session-workspace-container">
      {/* Top Header & Navigation Tabs matching Picture 3 */}
      <header className="session-workspace-topbar">
        <button
          aria-label="Back to dashboard"
          className="btn-workspace-back"
          onClick={onBack}
          type="button"
        >
          <svg
            aria-hidden="true"
            fill="none"
            height="18"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            viewBox="0 0 24 24"
            width="18"
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
          <span>Back</span>
        </button>

        <nav className="workspace-tabs-nav" aria-label="Session document tabs">
          <button
            className={`workspace-tab-btn ${activeTab === "notes" ? "is-active" : ""}`}
            onClick={() => setActiveTab("notes")}
            type="button"
          >
            Notes
          </button>
          <button
            className={`workspace-tab-btn ${activeTab === "client" ? "is-active" : ""}`}
            onClick={() => setActiveTab("client")}
            type="button"
          >
            Client
          </button>
          <button
            className={`workspace-tab-btn ${activeTab === "treatment" ? "is-active" : ""}`}
            onClick={() => setActiveTab("treatment")}
            type="button"
          >
            Treatment Plan
          </button>
          <button
            className={`workspace-tab-btn ${activeTab === "transcript" ? "is-active" : ""}`}
            onClick={() => setActiveTab("transcript")}
            type="button"
          >
            Transcript
          </button>
          <button
            className={`workspace-tab-btn ${activeTab === "session-info" ? "is-active" : ""}`}
            onClick={() => setActiveTab("session-info")}
            type="button"
          >
            Session Information
          </button>
          <button
            className={`workspace-tab-btn ${activeTab === "mindmap" ? "is-active" : ""}`}
            onClick={() => setActiveTab("mindmap")}
            type="button"
          >
            Mindmap
          </button>
          <button
            className={`workspace-tab-btn ${activeTab === "reflection" ? "is-active" : ""}`}
            onClick={() => setActiveTab("reflection")}
            type="button"
          >
            Reflection Questions
          </button>
        </nav>
      </header>

      {/* Main Split Layout: Left Clinical Note Document + Right AI Overview Panel */}
      <main className="session-workspace-split">
        {/* ===================================================================
           LEFT COLUMN: CLINICAL DOCUMENT WORKSPACE
           =================================================================== */}
        <section className="workspace-document-panel">
          {/* Sub-toolbar matching Picture 3 */}
          <div className="document-sub-toolbar">
            <div className="toolbar-left-group">
              <select
                className="select-pill"
                onChange={(e) => setNoteVariant(e.target.value as "BASE")}
                value={noteVariant}
              >
                <option value="BASE">BASE</option>
                <option value="SOAP">SOAP Note</option>
                <option value="NARRATIVE">Narrative</option>
              </select>

              <select
                className="select-pill"
                onChange={(e) => setDetailLevel(e.target.value as "Detailed")}
                value={detailLevel}
              >
                <option value="Detailed">Detailed</option>
                <option value="Concise">Concise</option>
              </select>
            </div>

            <div className="toolbar-right-group">
              {/* AI Polish */}
              <button
                aria-label="Refine with AI"
                className="icon-action-btn"
                onClick={() => handleSendPrompt("Polish and refine clinical phrasing")}
                title="Polish note"
                type="button"
              >
                <Zap size={16} />
              </button>
              {/* Copy Note */}
              <button
                aria-label="Copy Note"
                className="icon-action-btn"
                onClick={handleCopyNote}
                title="Copy entire note"
                type="button"
              >
                {isCopied ? <Check size={16} /> : <Clipboard size={16} />}
              </button>
              {/* Export / Download */}
              <button
                aria-label="Download Note"
                className="icon-action-btn"
                onClick={handleCopyNote}
                title="Export"
                type="button"
              >
                <Download size={16} />
              </button>
              {/* Flag / Language */}
              <button
                aria-label="English Translation"
                className="icon-action-btn flag-btn"
                title="English (US/UK)"
                type="button"
              >
                <Languages size={16} />
              </button>
              {/* Lock note */}
              <button
                aria-label="Locked"
                className="icon-action-btn"
                title="Protected medical record"
                type="button"
              >
                <Lock size={16} />
              </button>
              {/* Share button */}
              <button
                className="btn-share-pill"
                type="button"
              >
                Share ⌄
              </button>
              {/* Sprout icon */}
              <span className="toolbar-sprout" aria-hidden="true">
                <Sprout size={16} />
              </span>
            </div>
          </div>

          {/* Tab 1: NOTES CONTENT matching Picture 3 */}
          {activeTab === "notes" ? (
            <div className="clinical-document-body">
              {/* Summary Section */}
              <div className="doc-section">
                <div className="section-title-row">
                  <h2 className="section-title">Summary</h2>
                  <button
                    aria-label="Copy summary"
                    className="btn-copy-inline"
                    onClick={() => {
                      void navigator.clipboard.writeText(noteSummary);
                      setIsCopied(true);
                      setTimeout(() => setIsCopied(false), 2000);
                    }}
                    type="button"
                  >
                    <Clipboard size={14} />
                  </button>
                </div>
                <p className="summary-paragraph-text">{noteSummary}</p>
              </div>

              {/* Session Topics Section matching Picture 3 */}
              <div className="doc-section">
                <h2 className="section-title">Session Topics</h2>

                <div className="topic-block">
                  <h3 className="topic-subtitle">Medical History Documentation</h3>
                  <ul className="topic-bullet-list">
                    {currentNote.history.length > 0 ? (
                      currentNote.history.map((h, i) => (
                        <li key={`hist-${i}`}>{h}</li>
                      ))
                    ) : (
                      <li>Patient attended consultation for routine clinical evaluation.</li>
                    )}
                    {currentNote.symptoms.map((s, i) => (
                      <li key={`symp-${i}`}>{s}</li>
                    ))}
                    {currentNote.assessment_discussed.map((a, i) => (
                      <li key={`assess-${i}`}>{a}</li>
                    ))}
                    {currentNote.plan_discussed.map((p, i) => (
                      <li key={`plan-${i}`}>{p}</li>
                    ))}
                    {currentNote.medications_mentioned.map((m, i) => (
                      <li key={`med-${i}`}>Prescribed/Discussed medication: {m}</li>
                    ))}
                    {currentNote.follow_up ? (
                      <li>Follow-up recommendations: {currentNote.follow_up}</li>
                    ) : null}
                    {currentNote.uncertainties.map((u, i) => (
                      <li key={`unc-${i}`}>Note for review: {u}</li>
                    ))}
                  </ul>
                </div>
              </div>

              {/* Approval Bar */}
              <div className="doc-approval-footer-bar">
                {saveSuccess ? (
                  <span className="save-success-tag">
                    <Check size={14} /> Approved & Saved to Patient Record
                  </span>
                ) : null}
                {saveError ? (
                  <span className="save-error-tag">{saveError}</span>
                ) : null}
                <button
                  className="primary-button btn-approve-doc"
                  disabled={isSaving}
                  onClick={handleApproveAndSave}
                  type="button"
                >
                  {isSaving ? "Saving…" : "Approve & Save Note"}
                </button>
              </div>
            </div>
          ) : activeTab === "client" ? (
            /* Tab 2: CLIENT INFO */
            <div className="client-tab-view">
              <div className="client-profile-card">
                <div className="client-avatar-large">
                  {currentNote.patient_display_name.slice(0, 1)}
                </div>
                <div className="client-profile-info">
                  <h2>{currentNote.patient_display_name}</h2>
                  <p className="client-meta-line">Client ID: {currentNote.patient_id}</p>
                  {currentNote.email ? (
                    <p className="client-meta-line">
                      <Mail size={14} /> {currentNote.email}
                    </p>
                  ) : null}
                  {currentNote.mobile_number ? (
                    <p className="client-meta-line">
                      <Smartphone size={14} /> {currentNote.mobile_number}
                    </p>
                  ) : null}
                </div>
              </div>

              <ClientTimeline
                key={currentNote.patient_id}
                patientDisplayName={currentNote.patient_display_name}
                patientId={currentNote.patient_id}
              />
            </div>
          ) : activeTab === "treatment" ? (
            /* Tab 3: TREATMENT PLAN */
            <div className="treatment-plan-tab-view">
              <div className="doc-section">
                <h2 className="section-title">Assessment & Treatment Plan</h2>
                <div className="plan-card">
                  <h3>Clinical Assessment</h3>
                  <ul>
                    {currentNote.assessment_discussed.map((a, i) => (
                      <li key={i}>{a}</li>
                    ))}
                  </ul>
                </div>

                <div className="plan-card">
                  <h3>Action Items & Directives</h3>
                  <ul>
                    {currentNote.plan_discussed.map((p, i) => (
                      <li key={i}>{p}</li>
                    ))}
                  </ul>
                </div>

                <div className="plan-card">
                  <h3>Medications & Interventions</h3>
                  <ul>
                    {currentNote.medications_mentioned.length > 0 ? (
                      currentNote.medications_mentioned.map((m, i) => <li key={i}>{m}</li>)
                    ) : (
                      <li>No new pharmacological prescriptions recorded in this session.</li>
                    )}
                  </ul>
                </div>

                <div className="plan-card">
                  <h3>Follow-Up Timeframe</h3>
                  <p>{currentNote.follow_up || "Follow up as clinically indicated."}</p>
                </div>
              </div>
            </div>
          ) : activeTab === "transcript" ? (
            /* Tab 4: TRANSCRIPT */
            <div className="transcript-tab-view">
              <div className="doc-section">
                <h2 className="section-title">Spoken Audio Transcript</h2>
                <p className="transcript-hint">Whisper Large v3 Spoken Audio Provenance</p>
                <pre className="transcript-verbatim-box">
                  {currentNote.raw_transcript}
                </pre>
              </div>
            </div>
          ) : activeTab === "session-info" ? (
            /* Tab 5: SESSION INFORMATION */
            <div className="session-info-tab-view">
              <div className="doc-section">
                <h2 className="section-title">Session Information</h2>
                <SessionInfoView note={currentNote} />
              </div>
            </div>
          ) : activeTab === "mindmap" ? (
            /* Tab 6: MINDMAP */
            <div className="mindmap-tab-view">
              <div className="doc-section">
                <h2 className="section-title">Session Mindmap</h2>
                <SessionMindmap note={currentNote} />
              </div>
            </div>
          ) : activeTab === "reflection" ? (
            /* Tab 7: REFLECTION QUESTIONS */
            <div className="reflection-tab-view">
              <div className="doc-section">
                <h2 className="section-title">Reflection Questions</h2>
                <ReflectionQuestions note={currentNote} />
              </div>
            </div>
          ) : null}
        </section>

        {/* ===================================================================
           RIGHT COLUMN: AI OVERVIEW CHAT ASSISTANT matching Picture 3
           =================================================================== */}
        <aside className="workspace-ai-overview-panel">
          {/* Top Chat Bar */}
          <header className="ai-overview-header">
            <button className="btn-chat-dropdown" type="button">
              New Chat ⌄
            </button>
            <button
              aria-label="Close AI Overview"
              className="btn-chat-close"
              onClick={() => {}}
              type="button"
            >
              <X size={16} />
            </button>
          </header>

          {/* Quick Suggestions matching Picture 3 */}
          <div className="ai-quick-suggestions">
            <button
              className="suggestion-pill"
              onClick={() => handleSendPrompt("Change to paragraph format")}
              type="button"
            >
              <span className="pill-icon">
                <FileText size={14} />
              </span>
              <span>Change to paragraph format</span>
            </button>

            <button
              className="suggestion-pill"
              onClick={() => handleSendPrompt("Remove all names")}
              type="button"
            >
              <span className="pill-icon">
                <EyeOff size={14} />
              </span>
              <span>Remove all names</span>
            </button>

            <button
              className="suggestion-pill"
              onClick={() => handleSendPrompt("Summarize key clinical points")}
              type="button"
            >
              <span className="pill-icon">
                <Zap size={14} />
              </span>
              <span>Summarize key clinical points</span>
            </button>
          </div>

          {/* Chat Messages Stream */}
          <div className="ai-messages-scroll-area">
            {chatMessages.map((msg) => (
              <div
                key={msg.id}
                className={`chat-bubble ${msg.role === "user" ? "is-user-bubble" : "is-ai-bubble"}`}
              >
                <div className="bubble-header">
                  <span className="bubble-author">
                    {msg.role === "user" ? "You (Clinician)" : "Rawaan AI Assistant"}
                  </span>
                </div>
                <div className="bubble-text">{msg.text}</div>
              </div>
            ))}

            {isAiLoading ? (
              <div className="chat-bubble is-ai-bubble is-loading">
                <span className="dot-flashing" />
                <span className="loading-label">Refining note with AI…</span>
              </div>
            ) : null}
          </div>

          {/* Bottom Chat Input Form matching Picture 3 */}
          <div className="ai-chat-input-wrapper">
            <h4 className="chat-prompt-title">How would you like to modify your note?</h4>

            {/* Note Loaded Context Badge */}
            <div className="loaded-context-badge">
              <span className="badge-file-icon">
                <FileText size={14} />
              </span>
              <span className="badge-text">
                {currentNote.patient_display_name} - Note ({noteVariant})
              </span>
            </div>

            {/* Input Box Card */}
            <div className="chat-input-box-card">
              <textarea
                className="chat-textarea"
                onChange={(e) => setInputPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void handleSendPrompt();
                  }
                }}
                placeholder="Make modifications to your note here"
                rows={2}
                value={inputPrompt}
              />

              <div className="chat-input-bottom-actions">
                <div className="input-left-tools">
                  <button
                    aria-label="Attach context"
                    className="tool-btn"
                    title="Attach document"
                    type="button"
                  >
                    <Paperclip size={15} />
                  </button>
                  <button
                    aria-label="Add field"
                    className="tool-btn"
                    title="Add context"
                    type="button"
                  >
                    +
                  </button>
                  <button
                    className={`pill-toggle-btn ${includeTreatmentPlanToggle ? "is-selected" : ""}`}
                    onClick={() => setIncludeTreatmentPlanToggle((p) => !p)}
                    type="button"
                  >
                    <Clipboard size={14} /> Treatment Plan
                  </button>
                </div>

                <div className="input-right-tools">
                  <button
                    aria-label="Voice input"
                    className="tool-btn"
                    title="Dictate modification prompt"
                    type="button"
                  >
                    <Mic size={15} />
                  </button>
                  <button
                    aria-label="Send message"
                    className="btn-send-arrow"
                    disabled={!inputPrompt.trim() || isAiLoading}
                    onClick={() => void handleSendPrompt()}
                    type="button"
                  >
                    <ArrowUp size={16} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </aside>
      </main>
    </div>
  );
}
