"use client";

import {
  ArrowUp,
  Check,
  ChevronDown,
  Clipboard,
  Download,
  EyeOff,
  FileText,
  Languages,
  Link2,
  Mail,
  Mic,
  Paperclip,
  Printer,
  Share2,
  Smartphone,
  X,
  Zap,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import {
  approveDraftAction,
  modifyNoteAction,
  translateNoteToUrduAction,
} from "@/app/actions";
import { ClientTimeline } from "@/app/components/client-timeline";
import { ReflectionQuestions } from "@/app/components/reflection-questions";
import { SessionInfoView } from "@/app/components/session-info-view";
import { SessionMindmap } from "@/app/components/session-mindmap";
import type { ApprovedNote, NoteDraft } from "@/lib/notes/schema";
import { sanitizeTranscript } from "@/lib/transcription/devanagari-to-urdu";

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

interface SpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onerror: () => void;
  onend: () => void;
  onresult: (event: { results: { 0: { 0: { transcript: string } } } }) => void;
  onstart: () => void;
  start: () => void;
}

export function SessionWorkspaceView({
  draft: initialDraft,
  isManualEntry = false,
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
  const [englishNote, setEnglishNote] = useState<NoteDraft | ApprovedNote>(initialDraft);
  const [urduNote, setUrduNote] = useState<(NoteDraft | ApprovedNote) | null>(null);
  const [activeLanguage, setActiveLanguage] = useState<"en" | "ur">("en");
  const [isTranslating, setIsTranslating] = useState(false);

  const [isCopied, setIsCopied] = useState(false);
  const [isCopiedLink, setIsCopiedLink] = useState(false);
  const [isShareMenuOpen, setIsShareMenuOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const shareMenuRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [attachedFile, setAttachedFile] = useState<{
    name: string;
    content: string;
    size: string;
  } | null>(null);
  const [isListening, setIsListening] = useState(false);

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>(() => [
    {
      id: "msg-welcome",
      role: "assistant",
      text: isManualEntry
        ? "This manual note remains local until you review and approve the structured fields."
        : `I've loaded ${initialDraft.patient_display_name}'s clinical note into context. You can ask me to rewrite the note in a different format, remove identifiable names, summarize key clinical points, attach lab/clinical documents, translate to Urdu, or make custom edits.`,

      timestamp: "Just now",
    },
  ]);
  const [inputPrompt, setInputPrompt] = useState("");
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [includeTreatmentPlanToggle, setIncludeTreatmentPlanToggle] = useState(true);

  // Auto-scroll chat to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatMessages, isAiLoading]);

  // Close share dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        shareMenuRef.current &&
        !shareMenuRef.current.contains(event.target as Node)
      ) {
        setIsShareMenuOpen(false);
      }
    }

    if (isShareMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isShareMenuOpen]);

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const sizeFormatted =
      file.size < 1024
        ? `${file.size} B`
        : file.size < 1024 * 1024
          ? `${(file.size / 1024).toFixed(1)} KB`
          : `${(file.size / (1024 * 1024)).toFixed(1)} MB`;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = (event.target?.result as string) || "";
      setAttachedFile({
        name: file.name,
        content: text.slice(0, 10000),
        size: sizeFormatted,
      });
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  function handleToggleDictation() {
    if (typeof window === "undefined") return;
    const SpeechRecognition =
      (window as unknown as { SpeechRecognition?: new () => SpeechRecognitionInstance }).SpeechRecognition ||
      (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionInstance }).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      return;
    }

    if (isListening) {
      setIsListening(false);
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = "en-US";
      recognition.continuous = false;
      recognition.interimResults = false;

      recognition.onstart = () => setIsListening(true);
      recognition.onend = () => setIsListening(false);
      recognition.onerror = () => setIsListening(false);
      recognition.onresult = (event: { results: { 0: { 0: { transcript: string } } } }) => {
        const transcript = event.results[0][0].transcript;
        setInputPrompt((prev) => (prev ? `${prev} ${transcript}` : transcript));
      };

      recognition.start();
    } catch {
      setIsListening(false);
    }
  }

  const noteSummary = isManualEntry
    ? currentNote.summary ?? ""
    : currentNote.summary ||
      (currentNote.chief_complaint
        ? `This consultation focused on ${currentNote.chief_complaint}. Clinical history was evaluated alongside reported symptoms (${currentNote.symptoms.slice(0, 2).join(", ") || "observed"}). The provider discussed assessment and instituted the corresponding management plan.`
        : "Clinical consultation note documented from conversation recording.");

  function toStructuredList(value: string) {
    return value
      .split("\n")
      .map((entry) => entry.trim())
      .filter(Boolean);
  }


  async function handleToggleLanguage() {
    if (isTranslating) return;

    if (activeLanguage === "ur") {
      // Toggle back to English
      setActiveLanguage("en");
      setCurrentNote(englishNote);
      return;
    }

    // If we already have the Urdu translation cached, switch instantly
    if (urduNote) {
      setActiveLanguage("ur");
      setCurrentNote(urduNote);
      return;
    }

    // Otherwise, translate via server action
    setIsTranslating(true);
    try {
      const res = await translateNoteToUrduAction(currentNote as NoteDraft);
      if (res.ok) {
        setUrduNote(res.urduNote);
        setCurrentNote(res.urduNote);
        setActiveLanguage("ur");

        const aiMsg: ChatMessage = {
          id: `msg-${Date.now()}`,
          role: "assistant",
          text: "نوٹ کو اردو زبان میں کامیابی سے تبدیل کر دیا گیا ہے۔ (The clinical note has been translated into Urdu.)",
          timestamp: "Just now",
        };
        setChatMessages((prev) => [...prev, aiMsg]);
      } else {
        const errorMsg: ChatMessage = {
          id: `msg-${Date.now()}`,
          role: "assistant",
          text: `Could not translate note to Urdu: ${res.message}`,
          timestamp: "Just now",
        };
        setChatMessages((prev) => [...prev, errorMsg]);
      }
    } catch {
      const errorMsg: ChatMessage = {
        id: `msg-${Date.now()}`,
        role: "assistant",
        text: "There was an error communicating with the translation service.",
        timestamp: "Just now",
      };
      setChatMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsTranslating(false);
    }
  }

  async function handleSendPrompt(promptToSend?: string) {
    const userText = (promptToSend || inputPrompt).trim();
    if (isManualEntry || (!userText && !attachedFile) || isAiLoading) return;

    let effectivePrompt = userText || "Please incorporate the attached document into the clinical note.";
    if (attachedFile) {
      effectivePrompt = `[Attached Document: ${attachedFile.name}]\n${attachedFile.content}\n\n[Clinician Request]:\n${effectivePrompt}`;
    }

    const displayPrompt = userText || `Incorporate ${attachedFile?.name || "attached document"}`;


    const userMsg: ChatMessage = {
      id: `msg-${Date.now()}`,
      role: "user",
      text: displayPrompt,
      timestamp: "Just now",
    };

    setChatMessages((prev) => [...prev, userMsg]);
    setInputPrompt("");
    setAttachedFile(null);
    setIsAiLoading(true);

    try {
      const res = await modifyNoteAction({
        note: currentNote as NoteDraft,
        prompt: effectivePrompt,
      });

      if (res.ok) {
        setCurrentNote(res.updatedNote);
        if (activeLanguage === "en") {
          setEnglishNote(res.updatedNote);
        } else {
          setUrduNote(res.updatedNote);
        }

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
    const fullText = `PATIENT: ${currentNote.patient_display_name}\nDATE: ${currentNote.consultation_date}\nLANGUAGE: ${activeLanguage === "ur" ? "Urdu (اردو)" : "English"}\n\nSUMMARY:\n${noteSummary}\n\nCHIEF COMPLAINT:\n${currentNote.chief_complaint}\n\nHISTORY:\n${currentNote.history.map((h) => `• ${h}`).join("\n")}\n\nSYMPTOMS:\n${currentNote.symptoms.map((s) => `• ${s}`).join("\n")}\n\nASSESSMENT DISCUSSED:\n${currentNote.assessment_discussed.map((a) => `• ${a}`).join("\n")}\n\nPLAN DISCUSSED:\n${currentNote.plan_discussed.map((p) => `• ${p}`).join("\n")}\n\nMEDICATIONS MENTIONED:\n${currentNote.medications_mentioned.map((m) => `• ${m}`).join("\n")}\n\nFOLLOW-UP:\n${currentNote.follow_up}`;

    void navigator.clipboard.writeText(fullText).then(() => {
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    });
  }

  function handleCopyShareLink() {
    const url = typeof window !== "undefined" ? window.location.href : "";
    if (url) {
      void navigator.clipboard.writeText(url).then(() => {
        setIsCopiedLink(true);
        setTimeout(() => setIsCopiedLink(false), 2500);
      });
    }
  }

  function handleDownloadNoteFile() {
    const fullText = `=====================================================
RAWAAN CLINICAL ENCOUNTER RECORD
=====================================================
Patient:       ${currentNote.patient_display_name}
Patient ID:    ${currentNote.patient_id}
Date:          ${currentNote.consultation_date}
Language:      ${activeLanguage === "ur" ? "Urdu (اردو)" : "English"}
Status:        ${currentNote.approval_status.toUpperCase()}
=====================================================

SUMMARY:
${noteSummary}

CHIEF COMPLAINT:
${currentNote.chief_complaint || "None recorded"}

HISTORY:
${currentNote.history.length > 0 ? currentNote.history.map((h) => `• ${h}`).join("\n") : "• Routine evaluation"}

SYMPTOMS:
${currentNote.symptoms.length > 0 ? currentNote.symptoms.map((s) => `• ${s}`).join("\n") : "• None reported"}

ASSESSMENT DISCUSSED:
${currentNote.assessment_discussed.length > 0 ? currentNote.assessment_discussed.map((a) => `• ${a}`).join("\n") : "• None documented"}

PLAN DISCUSSED:
${currentNote.plan_discussed.length > 0 ? currentNote.plan_discussed.map((p) => `• ${p}`).join("\n") : "• None documented"}

MEDICATIONS MENTIONED:
${currentNote.medications_mentioned.length > 0 ? currentNote.medications_mentioned.map((m) => `• ${m}`).join("\n") : "• No medications"}

FOLLOW-UP:
${currentNote.follow_up || "Follow up as clinically indicated"}

UNCERTAINTIES / NOTES FOR REVIEW:
${currentNote.uncertainties.length > 0 ? currentNote.uncertainties.map((u) => `• ${u}`).join("\n") : "• None"}

=====================================================
TRANSCRIPT PROVENANCE:
${currentNote.raw_transcript}
=====================================================
`;

    const blob = new Blob([fullText], { type: "text/plain;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    const safeName = currentNote.patient_display_name.replace(/[^a-zA-Z0-9]/g, "_");
    link.download = `${safeName}_Clinical_Note_${currentNote.consultation_date}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setIsShareMenuOpen(false);
  }

  function handleEmailSummary() {
    const subject = encodeURIComponent(
      `Clinical Note Summary: ${currentNote.patient_display_name} (${currentNote.consultation_date})`,
    );
    const body = encodeURIComponent(
      `Patient: ${currentNote.patient_display_name}\nDate: ${currentNote.consultation_date}\n\nSummary:\n${noteSummary}\n\nChief Complaint:\n${currentNote.chief_complaint}\n\nPlan:\n${currentNote.plan_discussed.join("\n")}\n\nFollow-up:\n${currentNote.follow_up}`,
    );
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
    setIsShareMenuOpen(false);
  }

  async function handleApproveAndSave() {
    setIsSaving(true);
    setSaveError(null);

    // Persist through the server action so the approved note lands in the
    // store (Supabase + local JSON) instead of only updating this view.
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
      {/* Top Header & Navigation Tabs */}
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
          {/* Sub-toolbar */}
          <div className="document-sub-toolbar">
            <div className="toolbar-left-group">
              <div className="doc-status-badge">
                <span className="doc-status-dot" />
                <span className="doc-status-title">Clinical Note</span>
              </div>
              <span className={`doc-language-pill ${activeLanguage === "ur" ? "is-urdu" : "is-en"}`}>
                {activeLanguage === "ur" ? "اردو (Urdu Active)" : "English"}
              </span>
            </div>

            <div className="toolbar-right-group">
              {/* AI Polish */}
              {isManualEntry ? null : (
                <button
                  aria-label="Refine with AI"
                  className="icon-action-btn"
                  onClick={() =>
                    handleSendPrompt(
                      activeLanguage === "ur"
                        ? "اردو جملوں اور طبی اصطلاحات کو مزید نکھاریں"
                        : "Polish and refine clinical phrasing",
                    )
                  }
                  title="Polish & refine clinical phrasing"
                  type="button"
                >
                  <Zap size={15} />
                </button>
              )}

              {/* Copy Note */}
              <button
                aria-label="Copy Note"
                className="icon-action-btn"
                onClick={handleCopyNote}
                title="Copy entire note"
                type="button"
              >
                {isCopied ? <Check size={15} /> : <Clipboard size={15} />}
              </button>

              {/* Download Note Text */}
              <button
                aria-label="Download Note File"
                className="icon-action-btn"
                onClick={handleDownloadNoteFile}
                title="Download note (.txt)"
                type="button"
              >
                <Download size={15} />
              </button>

              {/* Language Toggle: Urdu Only */}
              <button
                aria-label={activeLanguage === "ur" ? "Switch to English" : "Translate note to Urdu"}
                className={`btn-language-action ${activeLanguage === "ur" ? "is-active-urdu" : ""}`}
                disabled={isTranslating}
                onClick={handleToggleLanguage}
                title={activeLanguage === "ur" ? "Switch back to English" : "Translate note to Urdu (اردو)"}
                type="button"
              >
                <Languages size={15} />
                <span className="lang-action-label">
                  {isTranslating ? "Translating…" : activeLanguage === "ur" ? "اردو (Active)" : "اردو (Urdu)"}
                </span>
              </button>

              {/* Beautiful Interactive Share Menu */}
              <div className="share-menu-container" ref={shareMenuRef}>
                <button
                  aria-expanded={isShareMenuOpen}
                  aria-haspopup="true"
                  className={`btn-share-pill ${isShareMenuOpen ? "is-open" : ""}`}
                  onClick={() => setIsShareMenuOpen((prev) => !prev)}
                  type="button"
                >
                  <Share2 size={13} />
                  <span>Share</span>
                  <ChevronDown className={`share-chevron ${isShareMenuOpen ? "is-rotated" : ""}`} size={13} />
                </button>

                {isShareMenuOpen && (
                  <div className="share-dropdown-popover" role="menu">
                    <div className="share-popover-header">
                      <span className="share-popover-title">Share & Export</span>
                      <span className="share-popover-badge">Secure</span>
                    </div>

                    <div className="share-popover-list">
                      <button
                        className="share-popover-item"
                        onClick={handleCopyShareLink}
                        role="menuitem"
                        type="button"
                      >
                        <div className="share-item-icon">
                          {isCopiedLink ? <Check size={15} /> : <Link2 size={15} />}
                        </div>
                        <div className="share-item-content">
                          <div className="share-item-title">
                            {isCopiedLink ? "Link Copied!" : "Copy Shareable Link"}
                          </div>
                          <div className="share-item-desc">Direct encounter reference for clinical team</div>
                        </div>
                      </button>

                      <button
                        className="share-popover-item"
                        onClick={handleDownloadNoteFile}
                        role="menuitem"
                        type="button"
                      >
                        <div className="share-item-icon">
                          <FileText size={15} />
                        </div>
                        <div className="share-item-content">
                          <div className="share-item-title">Download Note (.txt)</div>
                          <div className="share-item-desc">Structured clinical note file download</div>
                        </div>
                      </button>

                      <button
                        className="share-popover-item"
                        onClick={() => {
                          setIsShareMenuOpen(false);
                          window.print();
                        }}
                        role="menuitem"
                        type="button"
                      >
                        <div className="share-item-icon">
                          <Printer size={15} />
                        </div>
                        <div className="share-item-content">
                          <div className="share-item-title">Print / PDF Report</div>
                          <div className="share-item-desc">Open printable clinical view</div>
                        </div>
                      </button>

                      <button
                        className="share-popover-item"
                        onClick={handleEmailSummary}
                        role="menuitem"
                        type="button"
                      >
                        <div className="share-item-icon">
                          <Mail size={15} />
                        </div>
                        <div className="share-item-content">
                          <div className="share-item-title">Email Clinical Summary</div>
                          <div className="share-item-desc">Draft referral email with note summary</div>
                        </div>
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Tab 1: NOTES CONTENT */}
          {activeTab === "notes" ? (
            isManualEntry ? (
              <div className="clinical-document-body manual-note-editor">
                <div className="doc-section">
                  <h2 className="section-title">Manual note</h2>
                  <p className="manual-note-editor-intro">
                    Add only the details you want recorded. This draft stays local until approval.
                  </p>
                </div>

                <div className="manual-note-fields-grid">
                  <label className="manual-note-field is-full" htmlFor="manual-note-summary">
                    <span>Summary</span>
                    <textarea
                      id="manual-note-summary"
                      onChange={(event) =>
                        setCurrentNote((note) => ({ ...note, summary: event.target.value }))
                      }
                      placeholder="Add a concise session summary."
                      rows={4}
                      value={currentNote.summary ?? ""}
                    />
                  </label>

                  <label className="manual-note-field is-full" htmlFor="manual-note-chief-complaint">
                    <span>Chief complaint</span>
                    <input
                      id="manual-note-chief-complaint"
                      onChange={(event) =>
                        setCurrentNote((note) => ({
                          ...note,
                          chief_complaint: event.target.value,
                        }))
                      }
                      placeholder="Describe the primary reason for the session."
                      type="text"
                      value={currentNote.chief_complaint}
                    />
                  </label>

                  <label className="manual-note-field" htmlFor="manual-note-history">
                    <span>History</span>
                    <textarea
                      id="manual-note-history"
                      onChange={(event) =>
                        setCurrentNote((note) => ({
                          ...note,
                          history: toStructuredList(event.target.value),
                        }))
                      }
                      placeholder="One item per line"
                      rows={5}
                      value={currentNote.history.join("\n")}
                    />
                  </label>

                  <label className="manual-note-field" htmlFor="manual-note-symptoms">
                    <span>Symptoms</span>
                    <textarea
                      id="manual-note-symptoms"
                      onChange={(event) =>
                        setCurrentNote((note) => ({
                          ...note,
                          symptoms: toStructuredList(event.target.value),
                        }))
                      }
                      placeholder="One item per line"
                      rows={5}
                      value={currentNote.symptoms.join("\n")}
                    />
                  </label>

                  <label className="manual-note-field" htmlFor="manual-note-assessment">
                    <span>Assessment discussed</span>
                    <textarea
                      id="manual-note-assessment"
                      onChange={(event) =>
                        setCurrentNote((note) => ({
                          ...note,
                          assessment_discussed: toStructuredList(event.target.value),
                        }))
                      }
                      placeholder="One item per line"
                      rows={5}
                      value={currentNote.assessment_discussed.join("\n")}
                    />
                  </label>

                  <label className="manual-note-field" htmlFor="manual-note-plan">
                    <span>Plan discussed</span>
                    <textarea
                      id="manual-note-plan"
                      onChange={(event) =>
                        setCurrentNote((note) => ({
                          ...note,
                          plan_discussed: toStructuredList(event.target.value),
                        }))
                      }
                      placeholder="One item per line"
                      rows={5}
                      value={currentNote.plan_discussed.join("\n")}
                    />
                  </label>

                  <label className="manual-note-field" htmlFor="manual-note-medications">
                    <span>Medications mentioned</span>
                    <textarea
                      id="manual-note-medications"
                      onChange={(event) =>
                        setCurrentNote((note) => ({
                          ...note,
                          medications_mentioned: toStructuredList(event.target.value),
                        }))
                      }
                      placeholder="One item per line"
                      rows={4}
                      value={currentNote.medications_mentioned.join("\n")}
                    />
                  </label>

                  <label className="manual-note-field" htmlFor="manual-note-follow-up">
                    <span>Follow-up</span>
                    <textarea
                      id="manual-note-follow-up"
                      onChange={(event) =>
                        setCurrentNote((note) => ({ ...note, follow_up: event.target.value }))
                      }
                      placeholder="Add follow-up details."
                      rows={4}
                      value={currentNote.follow_up}
                    />
                  </label>

                  <label className="manual-note-field" htmlFor="manual-note-uncertainties">
                    <span>Items needing review</span>
                    <textarea
                      id="manual-note-uncertainties"
                      onChange={(event) =>
                        setCurrentNote((note) => ({
                          ...note,
                          uncertainties: toStructuredList(event.target.value),
                        }))
                      }
                      placeholder="One item per line"
                      rows={4}
                      value={currentNote.uncertainties.join("\n")}
                    />
                  </label>
                </div>

                <div className="doc-approval-footer-bar">
                  {saveSuccess ? (
                    <span className="save-success-tag">
                      <Check size={14} /> Approved & Saved to Patient Record
                    </span>
                  ) : null}
                  {saveError ? <span className="save-error-tag">{saveError}</span> : null}
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
            ) : (
              <div
                className={`clinical-document-body ${activeLanguage === "ur" ? "is-urdu-doc" : ""}`}
                dir={activeLanguage === "ur" ? "rtl" : "ltr"}
              >

              {/* Summary Section */}
              <div className="doc-section">
                <div className="section-title-row">
                  <h2 className="section-title">
                    {activeLanguage === "ur" ? "خلاصہ" : "Summary"}
                  </h2>
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

              {/* Session Topics Section */}
              <div className="doc-section">
                <h2 className="section-title">
                  {activeLanguage === "ur" ? "سیشن کے موضوعات" : "Session Topics"}
                </h2>

                <div className="topic-block">
                  <h3 className="topic-subtitle">
                    {activeLanguage === "ur"
                      ? "طبی تاریخ اور علامات کا اندراج"
                      : "Medical History Documentation"}
                  </h3>
                  <ul className="topic-bullet-list">
                    {currentNote.history.length > 0 ? (
                      currentNote.history.map((h, i) => (
                        <li key={`hist-${i}`}>{h}</li>
                      ))
                    ) : (
                      <li>
                        {activeLanguage === "ur"
                          ? "مریض معمول کے طبی معائنے کے لیے حاضر ہوا۔"
                          : "Patient attended consultation for routine clinical evaluation."}
                      </li>
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
                      <li key={`med-${i}`}>
                        {activeLanguage === "ur"
                          ? `تجویز کردہ دوا: ${m}`
                          : `Prescribed/Discussed medication: ${m}`}
                      </li>
                    ))}
                    {currentNote.follow_up ? (
                      <li>
                        {activeLanguage === "ur"
                          ? `فالو اپ رہنمائی: ${currentNote.follow_up}`
                          : `Follow-up recommendations: ${currentNote.follow_up}`}
                      </li>
                    ) : null}
                    {currentNote.uncertainties.map((u, i) => (
                      <li key={`unc-${i}`}>
                        {activeLanguage === "ur"
                          ? `جائزہ کے لیے نوٹ: ${u}`
                          : `Note for review: ${u}`}
                      </li>
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
          )
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
            <div
              className={`treatment-plan-tab-view ${activeLanguage === "ur" ? "is-urdu-doc" : ""}`}
              dir={activeLanguage === "ur" ? "rtl" : "ltr"}
            >
              <div className="doc-section">
                <h2 className="section-title">
                  {activeLanguage === "ur" ? "تشخیص اور علاج کا منصوبہ" : "Assessment & Treatment Plan"}
                </h2>
                <div className="plan-card">
                  <h3>{activeLanguage === "ur" ? "طبی تشخیص" : "Clinical Assessment"}</h3>
                  <ul>
                    {currentNote.assessment_discussed.map((a, i) => (
                      <li key={i}>{a}</li>
                    ))}
                  </ul>
                </div>

                <div className="plan-card">
                  <h3>{activeLanguage === "ur" ? "علاج کی ہدایات" : "Action Items & Directives"}</h3>
                  <ul>
                    {currentNote.plan_discussed.map((p, i) => (
                      <li key={i}>{p}</li>
                    ))}
                  </ul>
                </div>

                <div className="plan-card">
                  <h3>{activeLanguage === "ur" ? "ادویات" : "Medications & Interventions"}</h3>
                  <ul>
                    {currentNote.medications_mentioned.length > 0 ? (
                      currentNote.medications_mentioned.map((m, i) => <li key={i}>{m}</li>)
                    ) : (
                      <li>
                        {activeLanguage === "ur"
                          ? "اس سیشن میں کوئی نئی ادویات شامل نہیں کی گئیں۔"
                          : "No new pharmacological prescriptions recorded in this session."}
                      </li>
                    )}
                  </ul>
                </div>

                <div className="plan-card">
                  <h3>{activeLanguage === "ur" ? "فالو اپ ٹائم فریم" : "Follow-Up Timeframe"}</h3>
                  <p>
                    {currentNote.follow_up ||
                      (activeLanguage === "ur"
                        ? "طبی ضرورت کے مطابق دوبارہ رابطہ کریں۔"
                        : "Follow up as clinically indicated.")}
                  </p>
                </div>
              </div>
            </div>
          ) : activeTab === "transcript" ? (
            /* Tab 4: TRANSCRIPT */
            <div className="transcript-tab-view">
              <div className="doc-section">
                <h2 className="section-title">
                  {currentNote.session_info?.session_type === "in-person"
                    ? "Spoken Audio Transcript"
                    : currentNote.session_info?.session_type === "upload"
                      ? "Uploaded Audio Transcript"
                      : currentNote.session_info?.session_type === "summary"
                        ? "Clinician-Entered Session Summary"
                        : currentNote.session_info?.session_type === "manual"
                          ? "Manual Note Provenance"
                          : "Session Transcript"}
                </h2>
                <p className="transcript-hint">
                  {currentNote.session_info?.transcript_source ?? "Whisper Large v3 Spoken Audio Provenance"}
                </p>
                {(() => {
                  const sanitized = sanitizeTranscript(currentNote.raw_transcript);
                  const isUrdu = /[\u0600-\u06FF]/.test(sanitized);
                  return (
                    <pre
                      className={`transcript-verbatim-box ${isUrdu ? "is-urdu-transcript" : ""}`}
                    >
                      {sanitized}
                    </pre>
                  );
                })()}
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

        {isManualEntry ? (
          <aside className="workspace-manual-entry-panel">
            <div className="manual-entry-panel-content">
              <h2>Manual entry</h2>
              <p>
                AI editing is unavailable for manually created notes. Review the structured
                fields before approval.
              </p>
            </div>
          </aside>
        ) : (
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

          {/* Quick Suggestions */}
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

            <button
              className="suggestion-pill"
              onClick={() => {
                if (activeLanguage === "en") {
                  void handleToggleLanguage();
                } else {
                  void handleSendPrompt("اردو زبان کے جملوں کی تصحیح اور خوبصورتی میں اضافہ کریں");
                }
              }}
              type="button"
            >
              <span className="pill-icon">
                <Languages size={14} />
              </span>
              <span>{activeLanguage === "en" ? "Translate note to Urdu" : "اردو میں مزید نکھاریں"}</span>
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
            <div ref={messagesEndRef} />
          </div>

          {/* Bottom Chat Input Form */}
          <div className="ai-chat-input-wrapper">
            <h4 className="chat-prompt-title">How would you like to modify your note?</h4>

            {/* Note Loaded Context Badge */}
            <div className="loaded-context-badge">
              <span className="badge-file-icon">
                <FileText size={14} />
              </span>
              <span className="badge-text">
                {currentNote.patient_display_name} - Clinical Note {activeLanguage === "ur" ? "(اردو)" : ""}
              </span>
            </div>

            {/* Input Box Card */}
            <div className="chat-input-box-card">
              <input
                accept=".txt,.md,.json,.csv,.log,.doc,.docx,.pdf"
                onChange={handleFileSelect}
                ref={fileInputRef}
                style={{ display: "none" }}
                type="file"
              />

              {attachedFile && (
                <div className="chat-attachment-chip">
                  <Paperclip className="attachment-chip-icon" size={12} />
                  <span className="attachment-chip-name">{attachedFile.name} ({attachedFile.size})</span>
                  <button
                    aria-label="Remove attached document"
                    className="btn-remove-attachment"
                    onClick={() => setAttachedFile(null)}
                    type="button"
                  >
                    <X size={12} />
                  </button>
                </div>
              )}

              <textarea
                className="chat-textarea"
                onChange={(e) => setInputPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void handleSendPrompt();
                  }
                }}
                placeholder={attachedFile ? `Instruct AI how to incorporate ${attachedFile.name}...` : "Make modifications to your note here"}
                rows={2}
                value={inputPrompt}
              />

              <div className="chat-input-bottom-actions">
                <div className="input-left-tools">
                  <button
                    aria-label="Attach clinical document"
                    className={`tool-btn ${attachedFile ? "is-attached" : ""}`}
                    onClick={() => fileInputRef.current?.click()}
                    title="Attach clinical document (.txt, .json, .csv, .md)"
                    type="button"
                  >
                    <Paperclip size={15} />
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
                    className={`tool-btn ${isListening ? "is-recording-pulse" : ""}`}
                    onClick={handleToggleDictation}
                    title={isListening ? "Listening... click to stop" : "Dictate modification prompt"}
                    type="button"
                  >
                    <Mic size={15} />
                  </button>
                  <button
                    aria-label="Send message"
                    className="btn-send-arrow"
                    disabled={(!inputPrompt.trim() && !attachedFile) || isAiLoading}
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
        )}
      </main>
    </div>
  );
}
