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
  Mail,
  Mic,
  Paperclip,
  Printer,
  Share2,
  Smartphone,
  X,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { RequestStatus } from "@/app/components/request-status";

import {
  approveDraftAction,
  modifyNoteAction,
  sendAgentMessageAction,
  translateTranscriptToUrduAction,
  translateNoteToUrduAction,
} from "@/app/actions";
import { ClientTimeline } from "@/app/components/client-timeline";
import { ReflectionQuestions } from "@/app/components/reflection-questions";
import { SessionInfoView } from "@/app/components/session-info-view";
import { SessionMindmap } from "@/app/components/session-mindmap";
import { SessionNoteEditor } from "@/app/components/session-note-editor";
import { SessionNoteDocument } from "@/app/components/session-note-document";
import { SessionTabs, type SessionTab } from "@/app/components/session-tabs";
import { TreatmentPlanView } from "@/app/components/treatment-plan-view";
import { useAccessibleDialog } from "@/app/components/use-accessible-dialog";
import { RawaanLogo } from "@/app/components/rawaan-logo";
import styles from "@/app/components/session-workspace.module.css";
import {
  noteEditorTextFrom,
  type NoteEditorText,
} from "@/app/components/session-note-editor-state";
import { formatClinicalNoteText } from "@/lib/notes/presentation";
import { noteDraftSchema, type ApprovedNote, type NoteDraft } from "@/lib/notes/schema";
import type { StoredChatResponse } from "@/lib/db/chats";
import { AgentAnswer } from "@/app/components/agent-answer";
import { AssistantMarkdown } from "@/app/components/assistant-markdown";
import { hasDevanagari } from "@/lib/transcription/devanagari-to-urdu";
import { formatSessionDate } from "@/app/components/session-date";
import { appendDictatedText, createPromptDictation, type PromptDictationController, type PromptDictationPhase } from "@/lib/transcription/prompt-dictation";

const ReviewedPlansPanel = dynamic(() => import("@/app/components/reviewed-plans-panel").then(module => module.ReviewedPlansPanel), { loading: () => <RequestStatus label="Loading reviewed plans…" skeleton/> });

interface SessionWorkspaceViewProps {
  draft: NoteDraft | ApprovedNote;
  draftEditorText?: NoteEditorText;
  isManualEntry?: boolean;
  backLabel?: string;
  onApprove?: (note: ApprovedNote) => void;
  onBack: () => void;
  onDraftChange?: (draft: NoteDraft | ApprovedNote, editorText: NoteEditorText) => void;
}

interface ChatMessage {
  id: string;
  role: "assistant" | "user";
  text: string;
  timestamp: string;
  response?: StoredChatResponse;
  threadId?: string;
  entryTimestamp?: string;
  persisted?: boolean;
}

export function SessionWorkspaceView({
  draft: initialDraft,
  draftEditorText: initialEditorText,
  isManualEntry = false,
  backLabel = "Back",
  onApprove,
  onBack,
  onDraftChange,
}: SessionWorkspaceViewProps) {
  const [activeTab, setActiveTab] = useState<SessionTab>("notes");

  const [currentNote, setCurrentNote] = useState<NoteDraft | ApprovedNote>(initialDraft);
  const [englishNote, setEnglishNote] = useState<NoteDraft | ApprovedNote>(initialDraft);
  const [urduNote, setUrduNote] = useState<(NoteDraft | ApprovedNote) | null>(null);
  const [editorText, setEditorText] = useState<NoteEditorText>(
    () => initialEditorText ?? noteEditorTextFrom(initialDraft),
  );
  const noteRevisionRef = useRef(0);
  const [activeLanguage, setActiveLanguage] = useState<"en" | "ur">("en");
  const [isTranslating, setIsTranslating] = useState(false);

  const [isCopied, setIsCopied] = useState(false);
  const [isShareMenuOpen, setIsShareMenuOpen] = useState(false);
  const [isAiOverviewOpen, setIsAiOverviewOpen] = useState(true);
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [isCompactViewport, setIsCompactViewport] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const shareMenuRef = useRef<HTMLDivElement>(null);
  const assistantPanelRef = useRef<HTMLElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatMessageSequence = useRef(0);
  const agentThreadRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [attachedFile, setAttachedFile] = useState<{
    name: string;
    content: string;
    size: string;
  } | null>(null);
  const [dictationPhase, setDictationPhase] = useState<PromptDictationPhase | "idle">("idle");
  const isListening = dictationPhase !== "idle";
  const isFinishingDictation = dictationPhase === "transcribing";
  const [dictationError, setDictationError] = useState<string | null>(null);
  const dictationRef = useRef<PromptDictationController | null>(null);
  const cancelDictation = useCallback(() => {
    dictationRef.current?.cancel();
    dictationRef.current = null;
    setDictationPhase("idle");
  }, []);

  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [inputPrompt, setInputPrompt] = useState("");
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [urduTranscript, setUrduTranscript] = useState<{ source: string; text: string } | null>(null);
  const [transcriptError, setTranscriptError] = useState<{ source: string; message: string } | null>(null);
  const [transcriptRetry, setTranscriptRetry] = useState(0);

  const isApproved = currentNote.approval_status === "approved";
  const isDraftValid = !isApproved && noteDraftSchema.safeParse(currentNote).success;
  const canRefineDraft = !isManualEntry && !isApproved && activeLanguage === "en" && !isAiLoading && !isSaving && !isTranslating;
  const hasAssistant = isApproved || !isManualEntry;
  const canUsePrompt = !isAiLoading && !isSaving && (isApproved || canRefineDraft);
  const canSendPrompt = canUsePrompt && !isListening;
  const needsUrduTranscript = hasDevanagari(currentNote.raw_transcript);
  const displayedTranscript = needsUrduTranscript
    ? urduTranscript?.source === currentNote.raw_transcript ? urduTranscript.text : null
    : currentNote.raw_transcript;
  const currentTranscriptError = transcriptError?.source === currentNote.raw_transcript ? transcriptError.message : null;
  const sessionTopics = [
    ...(currentNote.chief_complaint.trim() ? [{ key: "chief-complaint", label: "Chief complaint", value: currentNote.chief_complaint }] : []),
    ...currentNote.history.map((value, index) => ({ key: `history-${index}`, label: "History", value })),
    ...currentNote.symptoms.map((value, index) => ({ key: `symptoms-${index}`, label: "Symptoms", value })),
  ].filter((topic) => topic.value.trim());

  useAccessibleDialog(
    assistantPanelRef,
    () => { cancelDictation(); setIsAiOverviewOpen(false); },
    isCompactViewport && isAiOverviewOpen && hasAssistant,
  );

  useEffect(() => {
    const media = window.matchMedia("(max-width: 1023px)");
    const updateViewport = () => {
      setIsCompactViewport(media.matches);
      if (media.matches) { cancelDictation(); setIsAiOverviewOpen(false); }
    };
    updateViewport();
    media.addEventListener("change", updateViewport);
    return () => media.removeEventListener("change", updateViewport);
  }, [cancelDictation]);

  useEffect(() => () => { dictationRef.current?.cancel(); }, []);

  useEffect(() => {
    const source = currentNote.raw_transcript;
    if (activeTab !== "transcript" || !hasDevanagari(source) || urduTranscript?.source === source || transcriptError?.source === source) return;
    let cancelled = false;
    void translateTranscriptToUrduAction(source).then(result => {
      if (cancelled) return;
      if (result.ok) setUrduTranscript({ source, text: result.transcript });
      else setTranscriptError({ source, message: result.message });
    }).catch(() => {
      if (!cancelled) setTranscriptError({ source, message: "Urdu transcript could not be loaded. Please retry." });
    });
    return () => { cancelled = true; };
  }, [activeTab, currentNote.raw_transcript, urduTranscript, transcriptError, transcriptRetry]);

  function handleDraftChange(next: NoteDraft, nextEditorText: NoteEditorText) {
    noteRevisionRef.current += 1;
    setCurrentNote(next);
    setEnglishNote(next);
    setUrduNote(null);
    setEditorText(nextEditorText);
    onDraftChange?.(next, nextEditorText);
  }

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

    const extension = file.name.toLowerCase().split(".").pop();
    const supportedExtensions = new Set(["txt", "text", "md", "csv", "log", "json"]);
    const supportedMimeTypes = new Set([
      "",
      "text/plain",
      "text/markdown",
      "text/csv",
      "application/json",
    ]);
    if (!supportedExtensions.has(extension ?? "") || !supportedMimeTypes.has(file.type)) {
      setAttachedFile(null);
      setAttachmentError("This file format is not supported. Attach a plain-text .txt, .md, .csv, .log, or .json file.");
      e.target.value = "";
      return;
    }

    const sizeFormatted =
      file.size < 1024
        ? `${file.size} B`
        : file.size < 1024 * 1024
          ? `${(file.size / 1024).toFixed(1)} KB`
          : `${(file.size / (1024 * 1024)).toFixed(1)} MB`;

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result;
      const text = typeof result === "string" ? result : "";
      if (!text || /\u0000/.test(text)) {
        setAttachedFile(null);
        setAttachmentError("The selected file could not be read as plain text.");
        return;
      }
      if (text.length > 10000) {
        setAttachedFile(null);
        setAttachmentError("This file exceeds 10,000 characters. Shorten it to the relevant text before attaching.");
        return;
      }
      setAttachedFile({
        name: file.name,
        content: text,
        size: sizeFormatted,
      });
      setAttachmentError(null);
    };
    reader.onerror = () => {
      setAttachedFile(null);
      setAttachmentError("The selected file could not be read as plain text.");
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  function handleToggleDictation() {
    if (typeof window === "undefined") return;
    if (dictationRef.current) {
      dictationRef.current.stop();
      return;
    }
    if (!canUsePrompt) return;
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setDictationError("Microphone recording is unavailable. Use HTTPS or localhost in a supported browser, or type your request.");
      return;
    }
    setDictationError(null);
    try {
      const session = createPromptDictation({
        onPhaseChange: setDictationPhase,
        onError: setDictationError,
        onFinish: text => {
          if (dictationRef.current !== session) return;
          dictationRef.current = null;
          setInputPrompt(previous => appendDictatedText(previous, text));
          setDictationPhase("idle");
        },
      });
      dictationRef.current = session;
      session.start();
    } catch {
      cancelDictation();
      setDictationError("Voice input could not start. Please try again or type your request.");
    }
  }

  async function handleToggleLanguage() {
    if (isTranslating || isSaving || isAiLoading) return;
    cancelDictation();

    if (activeLanguage === "ur") {
      // Toggle back to English
      setActiveLanguage("en");
      setCurrentNote(englishNote);
      return;
    }

    // A cached translation is valid only for the unchanged English draft.
    if (urduNote) {
      setActiveLanguage("ur");
      setCurrentNote(urduNote);
      return;
    }

    // Otherwise, translate via server action
    const revision = noteRevisionRef.current;
    setIsTranslating(true);
    try {
      const res = await translateNoteToUrduAction(englishNote as NoteDraft);
      if (revision !== noteRevisionRef.current) return;
      if (res.ok) {
        setUrduNote(res.urduNote);
        setCurrentNote(res.urduNote);
        setActiveLanguage("ur");

        const aiMsg: ChatMessage = {
          id: `msg-${++chatMessageSequence.current}`,
          role: "assistant",
          text: "نوٹ کو اردو زبان میں کامیابی سے تبدیل کر دیا گیا ہے۔ (The clinical note has been translated into Urdu.)",
          timestamp: "Just now",
        };
        setChatMessages((prev) => [...prev, aiMsg]);
      } else {
        const errorMsg: ChatMessage = {
          id: `msg-${++chatMessageSequence.current}`,
          role: "assistant",
          text: `Urdu translation unavailable: ${res.message}`,
          timestamp: "Just now",
        };
        setChatMessages((prev) => [...prev, errorMsg]);
      }
    } catch {
      const errorMsg: ChatMessage = {
        id: `msg-${++chatMessageSequence.current}`,
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
    if (dictationRef.current || !canSendPrompt || (!userText && (isApproved || !attachedFile))) return;

    let effectivePrompt = userText || "Please incorporate the attached document into the clinical note.";
    if (attachedFile) {
      effectivePrompt = `[Attached Document: ${attachedFile.name}]\n${attachedFile.content}\n\n[Clinician Request]:\n${effectivePrompt}`;
    }

    const displayPrompt = userText || `Incorporate ${attachedFile?.name || "attached document"}`;


    const userMsg: ChatMessage = {
      id: `msg-${++chatMessageSequence.current}`,
      role: "user",
      text: displayPrompt,
      timestamp: "Just now",
    };

    setChatMessages((prev) => [...prev, userMsg]);
    setInputPrompt("");
    setAttachedFile(null);
    setAttachmentError(null);
    setIsAiLoading(true);

    try {
      if (currentNote.approval_status === "approved") {
        const result = await sendAgentMessageAction({patientId:currentNote.patient_id,sessionNoteId:currentNote.id,threadId:agentThreadRef.current,question:userText,mode:"assistant",webEnabled:true});
        if (result.ok) agentThreadRef.current = result.threadId;
        const response = result.ok ? result.response : undefined;
        const reply: ChatMessage = {
          id: `msg-${++chatMessageSequence.current}`, role: "assistant", timestamp: "Just now", response,
          text: response ? "answer" in response ? response.answer : response.message : result.ok ? "No response available." : result.message,
          threadId: result.ok ? result.threadId : undefined, entryTimestamp: result.ok ? result.timestamp : undefined, persisted: result.ok ? result.persisted : undefined,
        };
        setChatMessages(previous => [...previous, reply]);
        return;
      }
      const res = await modifyNoteAction({
        note: currentNote as NoteDraft,
        prompt: effectivePrompt,
      });

      if (res.ok) {
        noteRevisionRef.current += 1;
        setCurrentNote(res.updatedNote);
        setEnglishNote(res.updatedNote);
        setUrduNote(null);
        const nextEditorText = noteEditorTextFrom(res.updatedNote);
        setEditorText(nextEditorText);
        onDraftChange?.(res.updatedNote, nextEditorText);

        const aiMsg: ChatMessage = {
          id: `msg-${++chatMessageSequence.current}`,
          role: "assistant",
          text: res.assistantReply,
          timestamp: "Just now",
        };
        setChatMessages((prev) => [...prev, aiMsg]);
      } else {
        const errorMsg: ChatMessage = {
          id: `msg-${++chatMessageSequence.current}`,
          role: "assistant",
          text: `Sorry, I could not apply those modifications: ${res.message}`,
          timestamp: "Just now",
        };
        setChatMessages((prev) => [...prev, errorMsg]);
      }
    } catch {
      const errorMsg: ChatMessage = {
        id: `msg-${++chatMessageSequence.current}`,
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
    const fullText = formatClinicalNoteText(
      currentNote,
      activeLanguage === "ur" ? "Urdu (اردو)" : "English",
    );

    void navigator.clipboard.writeText(fullText).then(() => {
      setIsCopied(true);
      setCopyError(null);
      setTimeout(() => setIsCopied(false), 2000);
    }).catch(() => setCopyError("Could not copy the note. Check clipboard permissions."));
  }

  function handleCopyTranscript() {
    if (displayedTranscript === null) return;
    void navigator.clipboard.writeText(displayedTranscript).then(() => {
      setCopyError(null);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    }).catch(() => setCopyError("Could not copy the transcript. Check clipboard permissions."));
  }

  function handleDownloadTranscript() {
    if (displayedTranscript === null) return;
    const blob = new Blob([displayedTranscript], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `Session_Transcript_${currentNote.consultation_date}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function editDiscussedPlan() {
    if (isApproved) return;
    setActiveLanguage("en");
    setCurrentNote(englishNote);
    setActiveTab("notes");
    setIsEditingNote(true);
    window.setTimeout(() => {
      const planField = document.getElementById("manual-note-plan_discussed");
      const followUpField = document.getElementById("manual-note-follow_up");
      (planField ?? followUpField)?.focus();
    }, 0);
  }

  function startNewConversation() {
    if (isAiLoading) return;
    cancelDictation(); setDictationError(null);
    agentThreadRef.current = null;
    setChatMessages([]);
    setInputPrompt("");
    setAttachedFile(null);
    setAttachmentError(null);
  }

  function handleDownloadNoteFile() {
    const fullText = formatClinicalNoteText(
      currentNote,
      activeLanguage === "ur" ? "Urdu (اردو)" : "English",
    );

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
      formatClinicalNoteText(currentNote, activeLanguage === "ur" ? "Urdu (اردو)" : "English"),
    );
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
    setIsShareMenuOpen(false);
  }

  async function handleApproveAndSave() {
    // Re-approving an already-approved note would save a duplicate.
    if (currentNote.approval_status === "approved" || isSaving || isAiLoading || isTranslating) return;
    cancelDictation();

    setIsSaving(true);
    setSaveError(null);

    // Persist through the server action so the approved note lands in the
    // Supabase store exactly as it is currently reviewed.
    try {
    const result = await approveDraftAction({
      ...currentNote,
      approval_status: "draft",
      summary: currentNote.summary ?? "",
    });



    if (!result.ok) {
      setSaveError(result.message);
      return;
    }

    const saved: ApprovedNote = {
      ...currentNote,
      approval_status: "approved",
      approved_at: result.approvedAt,
      id: result.noteId,
      summary: currentNote.summary ?? "",
    };

    noteRevisionRef.current += 1;
    setCurrentNote(saved);
    setEnglishNote(saved);
    setUrduNote(null);
    setEditorText(noteEditorTextFrom(saved));
    setIsEditingNote(false);
    onDraftChange?.(saved, noteEditorTextFrom(saved));

    if (onApprove) {
      onApprove(saved);
    }
    } catch { setSaveError("Could not save this note. Please retry."); }
    finally { setIsSaving(false); }
  }

  return (
    <div className={styles.root} data-session-workspace>
      <main className={`${styles.split} session-workspace-split ${!hasAssistant ? styles.full : !isAiOverviewOpen ? styles.withoutAssistant : ""}`}>
        <section className={`${styles.document} workspace-document-panel`}>
      <header className={`${styles.topbar} session-workspace-topbar`}>
        <button
          aria-label={backLabel}
          className={`${styles.back} btn-workspace-back`}
          disabled={isSaving || isAiLoading || isTranslating}
          onClick={() => { cancelDictation(); onBack(); }}
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
          <span>{backLabel}</span>
        </button>

        <SessionTabs activeTab={activeTab} onChange={setActiveTab} />
      </header>

      {/* Main Split Layout: Left Clinical Note Document + Right AI Overview Panel */}
        <div
          aria-labelledby={`session-tab-${activeTab}`}
          className={styles.panel}
          id="session-tab-panel"
          role="tabpanel"
          tabIndex={0}
        >
          {/* Sub-toolbar */}
          <div className="document-sub-toolbar">
            <div className="toolbar-left-group">
              <div className="doc-status-badge">
                <span className="doc-status-dot" />
                <span className="doc-status-title">{isApproved ? "Approved" : "Draft"}</span>
              </div>
              {!isApproved && activeLanguage === "en" ? (
                <button className="session-edit-toggle" onClick={() => setIsEditingNote((editing) => !editing)} type="button">
                  {isEditingNote ? "Read note" : "Edit note"}
                </button>
              ) : null}
              <span className={`doc-language-pill ${activeLanguage === "ur" ? "is-urdu" : "is-en"}`}>
                {activeLanguage === "ur" ? "اردو (Urdu Active)" : "English"}
              </span>
              {isApproved || isManualEntry ? <span className="session-assistant-unavailable">{isApproved ? "Approved notes are read-only." : "AI editing is unavailable for manual notes."}</span> : null}
            </div>

            <div className="toolbar-right-group">
              {/* AI Polish */}
              {!canRefineDraft ? null : (
                <button
                  aria-label="Refine with AI"
                  className="icon-action-btn"
                  onClick={() => handleSendPrompt("Polish and refine clinical phrasing")}
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
                disabled={isTranslating || isSaving || isAiLoading}
                onClick={handleToggleLanguage}
                title={activeLanguage === "ur" ? "Switch back to English" : "Translate note to Urdu (اردو)"}
                type="button"
              >
                <Languages size={15} />
                <span className="lang-action-label">
                  {isTranslating ? "Translating…" : "اردو"}
                </span>
              </button>

              {!hasAssistant ? null : (
                <button
                  aria-label={isAiOverviewOpen ? "Hide Rawaan assistant" : "Show Rawaan assistant"}
                  className="icon-action-btn"
                  onClick={() => { if (isAiOverviewOpen) cancelDictation(); setIsAiOverviewOpen((open) => !open); }}
                  type="button"
                >
                  <RawaanLogo className={styles.assistantToggleLogo} decorative />
                </button>
              )}

              {/* Export actions */}
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
          {copyError ? <p className="session-copy-feedback" role="status">{copyError}</p> : null}

          {/* Tab 1: NOTES CONTENT */}
          {activeTab === "notes" ? (
            !isApproved && isEditingNote && activeLanguage === "en" ? (
              <>
                <SessionNoteEditor disabled={isSaving || isAiLoading} draft={currentNote as NoteDraft} editorText={editorText} onChange={handleDraftChange} />
                <div className="doc-approval-footer-bar">
                  {saveError ? <span className="save-error-tag" role="alert">{saveError}</span> : null}
                  <button className="primary-button btn-approve-doc" disabled={isSaving || isAiLoading || isTranslating || !isDraftValid || activeLanguage !== "en"} onClick={handleApproveAndSave} type="button">
                    {isSaving ? "Saving…" : "Approve & Save Note"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <SessionNoteDocument language={activeLanguage} note={currentNote} />
                {!isApproved ? (
                  <div className="doc-approval-footer-bar">
                    {saveError ? <span className="save-error-tag" role="alert">{saveError}</span> : null}
                    <button className="primary-button btn-approve-doc" disabled={isSaving || isAiLoading || isTranslating || !isDraftValid || activeLanguage !== "en"} onClick={handleApproveAndSave} type="button">
                      {isSaving ? "Saving…" : "Approve & Save Note"}
                    </button>
                    {activeLanguage === "ur" ? <span className="session-assistant-unavailable" role="status">Switch to English to approve the reviewed note.</span> : null}
                  </div>
                ) : null}
              </>
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
                currentNote={currentNote}
                patientId={currentNote.patient_id}
              />
            </div>
          ) : activeTab === "treatment" ? (
            <div className={`treatment-plan-tab-view ${activeLanguage === "ur" ? "is-urdu-doc" : ""}`} dir={activeLanguage === "ur" ? "rtl" : "ltr"}>
              <div className="doc-section">
                <h2 className="section-title">Treatment Plan</h2>
                <p className="treatment-plan-subtitle">Recorded in this session</p>
                <div className="agent-plan-entry-links"><Link className="secondary-button" href={`/rawaan-ai?patient=${encodeURIComponent(currentNote.patient_id)}&question=${encodeURIComponent("Draft a treatment plan using this client's saved session history.")}`}>Draft a plan with Rawaan</Link></div>
                <ReviewedPlansPanel key={currentNote.patient_id} patientId={currentNote.patient_id}/>
                <h3>Plan discussed in this session</h3>
                <TreatmentPlanView note={currentNote} onEdit={isApproved ? undefined : editDiscussedPlan} />
              </div>
            </div>
          ) : activeTab === "transcript" ? (
            <div className="transcript-tab-view">
              <div className="doc-section">
                <div className="transcript-heading-row">
                  <div>
                    <h2 className="section-title">{currentNote.session_info?.session_type === "manual" ? "Manual note source" : "Session transcript"}</h2>
                    <p className="transcript-hint">{currentNote.session_info?.transcript_source || "Transcript source not recorded"}</p>
                  </div>
                  <div className="transcript-actions">
                    <button aria-label="Copy transcript" disabled={displayedTranscript === null} className="secondary-button" onClick={handleCopyTranscript} type="button"><Clipboard aria-hidden="true" size={14} /> Copy</button>
                    <button className="secondary-button" disabled={displayedTranscript === null} onClick={handleDownloadTranscript} type="button"><Download aria-hidden="true" size={14} /> Download text</button>
                  </div>
                </div>
                {copyError ? <p role="status">{copyError}</p> : null}
                {needsUrduTranscript ? <p className="transcript-hint">Urdu rendering · original transcription preserved</p> : null}
                {displayedTranscript !== null ? (
                  <pre className={"transcript-verbatim-box " + (/[\u0600-\u06FF]/.test(displayedTranscript) ? "is-urdu-transcript" : "")} dir={/[\u0600-\u06FF]/.test(displayedTranscript) ? "rtl" : "ltr"}>{displayedTranscript}</pre>
                ) : currentTranscriptError ? (
                  <div role="alert"><p>{currentTranscriptError}</p><button className="secondary-button" onClick={() => { setTranscriptError(null); setTranscriptRetry(value => value + 1); }} type="button">Retry Urdu transcript</button></div>
                ) : <p role="status">Loading Urdu transcript…</p>}
                {needsUrduTranscript ? <details><summary>Original transcription</summary><pre className="transcript-verbatim-box" dir="auto">{currentNote.raw_transcript}</pre></details> : null}
              </div>
            </div>
          ) : activeTab === "session-info" ? (
            <div className="session-info-tab-view">
              <div className="doc-section session-information-document">
                <h2 className="section-title">Session Information</h2>
                <div className="session-recorded-grid">
                  <section className="session-recorded-card">
                    <h3>Topics discussed</h3>
                    {sessionTopics.length ? <ul>{sessionTopics.map((topic) => <li key={topic.key}><strong>{topic.label}:</strong> {topic.value}</li>)}</ul> : <p>No topics recorded.</p>}
                  </section>
                  <section className="session-recorded-card">
                    <h3>Items needing review</h3>
                    {currentNote.uncertainties.some((item) => item.trim()) ? <ul>{currentNote.uncertainties.filter((item) => item.trim()).map((item, index) => <li key={index}>{item}</li>)}</ul> : <p>No items marked for review.</p>}
                  </section>
                  <section className="session-recorded-card is-wide">
                    <h3>Recorded summary</h3>
                    <p>{currentNote.summary?.trim() || "Not documented"}</p>
                  </section>
                </div>
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
        </div>
        </section>

        {hasAssistant && isAiOverviewOpen ? (
            <>
            {isCompactViewport ? <button aria-label="Close assistant overlay" className={styles.assistantScrim} onClick={() => { cancelDictation(); setIsAiOverviewOpen(false); }} type="button" /> : null}
            <aside aria-labelledby="rawaan-assistant-title" aria-modal={isCompactViewport ? true : undefined} className={styles.assistant + " workspace-ai-overview-panel"} ref={assistantPanelRef} role={isCompactViewport ? "dialog" : undefined} tabIndex={isCompactViewport ? -1 : undefined}>
              <header className={styles.assistantHeader + " ai-overview-header"}>
                <RawaanLogo className={styles.assistantBrand + " rawaan-message-logo"} decorative />
                <h2 id="rawaan-assistant-title">Rawaan assistant</h2>
                <button aria-label="New conversation" className="assistant-new-conversation" onClick={startNewConversation} type="button">New chat</button>
                <button aria-label="Close Rawaan assistant" className="btn-chat-close" onClick={() => { cancelDictation(); setIsAiOverviewOpen(false); }} type="button"><X aria-hidden="true" size={16} /></button>
              </header>

              <div className={styles.assistantScroll + " ai-messages-scroll-area"}>
                {chatMessages.map((msg) => (
                  <div key={msg.id} className={"chat-bubble " + (msg.role === "user" ? "is-user-bubble" : "is-ai-bubble")}>
                    <div className="bubble-header"><span className="bubble-author">{msg.role === "user" ? "You" : "Rawaan assistant"}</span></div>
                    {msg.response?.status === "agent" ? <AgentAnswer response={msg.response} patientId={currentNote.patient_id} reviewContext={msg.persisted && msg.threadId && msg.entryTimestamp ? {patientId:currentNote.patient_id,threadId:msg.threadId,entryTimestamp:msg.entryTimestamp} : undefined}/> : <div className="bubble-text">{msg.role === "assistant" && !msg.response ? <AssistantMarkdown text={msg.text}/> : msg.text}</div>}
                    {msg.persisted === false ? <p role="alert">This response could not be saved.</p> : null}
                    {msg.response?.status === "supported" ? <div className="session-chat-sources">{msg.response.sources.map(source => <a href={`/clients/${currentNote.patient_id}/sessions/${source.noteId}`} key={source.noteId}>Source: {formatSessionDate(source.consultationDate)}</a>)}</div> : null}
                  </div>
                ))}
                {isAiLoading ? <div className="chat-bubble is-ai-bubble is-loading"><span className="dot-flashing" /><span className="loading-label">{isApproved ? "Thinking and checking sources…" : "Refining the draft…"}</span></div> : null}
                <div ref={messagesEndRef} />
              </div>

              <div className={styles.assistantInput + " ai-chat-input-wrapper"}>
                {chatMessages.length === 0 ? <h3 className={styles.composerHeading}>{isApproved ? "What would you like to know about this session?" : activeLanguage === "en" ? "How would you like to modify your note?" : "Switch to English to modify your note"}</h3> : null}
                <div className="loaded-context-badge"><span className="badge-file-icon"><FileText size={14} /></span><span className="badge-text">{currentNote.patient_display_name} · Clinical note · {currentNote.consultation_date}</span></div>
                <div className="chat-input-box-card">
                  <input accept=".txt,.text,.md,.json,.csv,.log" disabled={!canRefineDraft} onChange={handleFileSelect} ref={fileInputRef} style={{ display: "none" }} type="file" />
                  {!isApproved && attachedFile ? <div className="chat-attachment-chip"><Paperclip className="attachment-chip-icon" size={12} /><span className="attachment-chip-name">{attachedFile.name} ({attachedFile.size})</span><button aria-label="Remove attached document" className="btn-remove-attachment" onClick={() => setAttachedFile(null)} type="button"><X size={12} /></button></div> : null}
                  {attachmentError ? <p className="attachment-error" role="alert">{attachmentError}</p> : null}
                  {dictationError ? <p className="attachment-error" id="prompt-dictation-error" role="alert">{dictationError}</p> : null}
                  {isListening ? <p className="transcript-hint" id="prompt-dictation-status" role="status">{dictationPhase === "starting" ? "Allow microphone access to start recording..." : isFinishingDictation ? "Transcribing your voice input..." : "Recording... Speak your request, then click the microphone to finish."}</p> : null}
                  <textarea aria-describedby={isListening ? "prompt-dictation-status" : dictationError ? "prompt-dictation-error" : undefined} aria-label={isApproved ? "Ask Rawaan about this session" : "Ask Rawaan to refine this draft"} className="chat-textarea" disabled={!canUsePrompt} readOnly={isListening} onChange={(event) => setInputPrompt(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void handleSendPrompt(); } }} placeholder={isApproved ? "Ask about the saved session" : activeLanguage !== "en" ? "Switch to English before editing" : attachedFile ? "Instruct Rawaan how to use " + attachedFile.name : "Make a change to this draft"} rows={2} value={inputPrompt} />
                  <div className="chat-input-bottom-actions">
                    <div className="input-left-tools">{!isApproved ? <button aria-label="Attach text document" className={"tool-btn " + (attachedFile ? "is-attached" : "")} disabled={!canRefineDraft} onClick={() => fileInputRef.current?.click()} title="Attach a text document" type="button"><Paperclip size={15} /></button> : null}
                      <details
                        className={styles.suggestionsMenu}
                        onBlur={(event) => {
                          if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false;
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Escape" && event.currentTarget.open) {
                            event.preventDefault();
                            event.stopPropagation();
                            event.currentTarget.open = false;
                            event.currentTarget.querySelector("summary")?.focus();
                          }
                        }}
                      >
                        <summary>{isApproved ? "Suggested questions" : "Suggested edits"} <ChevronDown aria-hidden="true" size={12} /></summary>
                        <div
                          className={styles.suggestionOptions}
                          onClick={(event) => {
                            if (event.target instanceof Element && event.target.closest("button")) {
                              event.currentTarget.closest("details")?.removeAttribute("open");
                            }
                          }}
                        >
                          {isApproved ? <>
                            {["What symptoms were documented?", "What history was recorded?", "What follow-up was discussed?"].map(question => <button className="suggestion-pill" disabled={!canSendPrompt} key={question} onClick={() => void handleSendPrompt(question)} type="button">{question}</button>)}
                          </> : <>
                          <button className="suggestion-pill" disabled={!canRefineDraft} onClick={() => handleSendPrompt("Change to paragraph format")} type="button"><span className="pill-icon"><FileText size={14} /></span><span>Change to paragraph format</span></button>
                          <button className="suggestion-pill" disabled={!canRefineDraft} onClick={() => handleSendPrompt("Remove all names")} type="button"><span className="pill-icon"><EyeOff size={14} /></span><span>Remove all names</span></button>
                          <button className="suggestion-pill" disabled={!canRefineDraft} onClick={() => handleSendPrompt("Summarize key clinical points")} type="button"><span className="pill-icon"><Zap size={14} /></span><span>Summarize key clinical points</span></button>
                          <button className="suggestion-pill" disabled={isTranslating || isSaving || isAiLoading} onClick={() => void handleToggleLanguage()} type="button"><span className="pill-icon"><Languages size={14} /></span><span>Translate note to Urdu</span></button>
                          </>}
                        </div>
                      </details>
                    </div>
                    <div className="input-right-tools"><button aria-label={isListening ? "Stop voice input" : "Voice input"} aria-pressed={isListening} className={"tool-btn " + (isListening ? "is-recording-pulse" : "")} disabled={!canUsePrompt || dictationPhase === "starting" || isFinishingDictation} onClick={handleToggleDictation} title={isFinishingDictation ? "Transcribing dictation" : isListening ? "Recording, click to stop" : "Dictate a prompt"} type="button"><Mic size={15} /></button><button aria-label="Send message" className="btn-send-arrow" disabled={!canSendPrompt || (!inputPrompt.trim() && (isApproved || !attachedFile))} onClick={() => void handleSendPrompt()} type="button"><ArrowUp size={16} /></button></div>
                  </div>
                </div>
              </div>
            </aside>
            </>
        ) : null}
      </main>
    </div>
  );
}
