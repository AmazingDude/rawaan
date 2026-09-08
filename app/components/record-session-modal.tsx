"use client";

import { ChevronDown, Mic, Sprout, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  getPatientInsightsAction,
  listClientsAction,
  type ClientRecord,
} from "@/app/actions";
import { RequestStatus } from "@/app/components/request-status";
import { STORAGE_ERROR_MESSAGE } from "@/lib/db/errors";
import type { PatientSessionInsights } from "@/lib/notes/insights";
import { useAccessibleDialog } from "@/app/components/use-accessible-dialog";
import { formatSessionDate, localConsultationDate } from "@/app/components/session-date";

interface RecordSessionModalProps {
  isClientsLoading?: boolean;
  initialClientId?: string;
  initialClients?: ClientRecord[];
  isOpen: boolean;
  onClose: () => void;
  onComplete: (data: {
    consultationDate: string;
    patientDisplayName: string;
    patientId: string;
    recordingDevice?: string;
    recordingDurationSeconds?: number;
    transcript: string;
  }) => void;
  requestTranscription: (audio: File) => Promise<{ ok: boolean; transcript?: string; message?: string }>;
}

export function RecordSessionModal({
  initialClientId,
  initialClients,
  isClientsLoading = false,
  isOpen,
  onClose,
  onComplete,
  requestTranscription,
}: RecordSessionModalProps) {
  const [loadedClients, setClients] = useState<ClientRecord[]>(initialClients ?? []);
  const clients = initialClients ?? loadedClients;
  const [selectedClient, setSelectedClient] = useState<ClientRecord | null>(null);
  const [clientSearchQuery, setClientSearchQuery] = useState("");
  const [isClientDropdownOpen, setIsClientDropdownOpen] = useState(false);

  const [insights, setInsights] = useState<PatientSessionInsights | null>(null);
  const [isLoadingInsights, setIsLoadingInsights] = useState(false);
  const selectedClientIdRef = useRef<string | null>(null);
  const insightRequestIdRef = useRef(0);

  // Audio Device Setup
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("default");

  // Mic Tester State
  const [isTestingMic, setIsTestingMic] = useState(false);
  const [audioLevels, setAudioLevels] = useState<number[]>(new Array(18).fill(10));
  const micTestRequestIdRef = useRef(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // Recording State
  const [phase, setPhase] = useState<"setup" | "recording" | "transcribing">("setup");
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const recordingStreamRef = useRef<MediaStream | null>(null);
  const isCaptureAbandonedRef = useRef(false);
  const captureRequestIdRef = useRef(0);
  const recordingStartedAtRef = useRef<number | null>(null);
  const timerIntervalRef = useRef<number | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const isMountedRef = useRef(true);
  const clientSelectorRef = useRef<HTMLDivElement>(null);
  const clientSelectorTriggerRef = useRef<HTMLButtonElement>(null);
  const initialClientSelectionResolvedRef = useRef(false);

  const handleSelectClient = useCallback((client: ClientRecord | null) => {
    const selected = client;
    initialClientSelectionResolvedRef.current = true;
    setClientSearchQuery("");
    const requestId = ++insightRequestIdRef.current;
    selectedClientIdRef.current = selected?.patientId ?? null;
    setSelectedClient(selected);
    setInsights(null);
    setIsLoadingInsights(false);
    setIsClientDropdownOpen(false);
    if (!selected) return;

    setIsLoadingInsights(true);
    void getPatientInsightsAction(selected.patientId)
      .then((data) => {
        if (requestId !== insightRequestIdRef.current || selectedClientIdRef.current !== selected.patientId) return;
        setInsights(data);
      })
      .catch(() => {
        if (requestId !== insightRequestIdRef.current || selectedClientIdRef.current !== selected.patientId) return;
        setInsights(null);
        setStatusMessage(STORAGE_ERROR_MESSAGE);
      })
      .finally(() => {
        if (requestId === insightRequestIdRef.current && selectedClientIdRef.current === selected.patientId) {
          setIsLoadingInsights(false);
        }
      });
  }, []);

  useEffect(() => {
    if (!isClientDropdownOpen) return;
    function handleOutsidePointer(event: PointerEvent) {
      if (event.target instanceof Node && !clientSelectorRef.current?.contains(event.target)) {
        setIsClientDropdownOpen(false);
      }
    }
    document.addEventListener("pointerdown", handleOutsidePointer);
    return () => document.removeEventListener("pointerdown", handleOutsidePointer);
  }, [isClientDropdownOpen]);

  function handleClientSelectorKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (!isClientDropdownOpen) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setIsClientDropdownOpen(false);
      clientSelectorTriggerRef.current?.focus();
      return;
    }
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const options = Array.from(
      clientSelectorRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? [],
    );
    if (!options.length) return;
    event.preventDefault();
    const index = options.findIndex((option) => option === document.activeElement);
    const nextIndex = index < 0
      ? event.key === "ArrowDown" ? 0 : options.length - 1
      : (index + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length;
    options[nextIndex]?.focus();
  }

  // Load clients if none passed
  useEffect(() => {
    if (isOpen && initialClients === undefined && clients.length === 0) {
      void listClientsAction().then((loaded) => {
        if (loaded.length > 0) {
          setClients(loaded);
        }
      }).catch(() => setStatusMessage(STORAGE_ERROR_MESSAGE));
    }
  }, [isOpen, initialClients, clients.length]);

  // Preselect initial client if provided
  useEffect(() => {
    if (!isOpen || !initialClientId || initialClientSelectionResolvedRef.current) return;
    const match = clients.find((c) => c.patientId === initialClientId);
    if (match) {
      const id = window.setTimeout(() => handleSelectClient(match), 0);
      return () => window.clearTimeout(id);
    }
  }, [isOpen, initialClientId, clients, handleSelectClient]);

  // Enumerate Audio Devices
  useEffect(() => {
    if (!isOpen) return;

    async function getDevices() {
      try {
        if (navigator.mediaDevices?.enumerateDevices) {
          const devices = await navigator.mediaDevices.enumerateDevices();
          const audioInputs = devices.filter((d) => d.kind === "audioinput");
          setAudioDevices(audioInputs);
          if (audioInputs.length > 0 && !selectedDeviceId) {
            setSelectedDeviceId(audioInputs[0]!.deviceId || "default");
          }
        }
      } catch {
        // Fallback gracefully
      }
    }

    void getDevices();
  }, [isOpen, selectedDeviceId]);

  function handleClose() {
    ++insightRequestIdRef.current;
    ++micTestRequestIdRef.current;
    selectedClientIdRef.current = null;
    stopMicTest();
    stopCapture();
    onClose();
  }

  useAccessibleDialog(dialogRef, handleClose, isOpen);

  // Cleanup on close or unmount
  function invalidateOutstandingRequests() {
    ++insightRequestIdRef.current;
    ++micTestRequestIdRef.current;
  }

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      invalidateOutstandingRequests();
      stopMicTest(false);
      stopCapture();
    };
  }, []);

  // Releases the mic and abandons any in-flight recording/transcription, so a
  // capture that is torn down mid-flight can never report back into the UI.
  function stopCapture() {
    isCaptureAbandonedRef.current = true;
    ++captureRequestIdRef.current;
    recordingStartedAtRef.current = null;

    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }

    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
    mediaRecorderRef.current = null;

    if (recordingStreamRef.current) {
      recordingStreamRef.current.getTracks().forEach((t) => t.stop());
      recordingStreamRef.current = null;
    }

    recordedChunksRef.current = [];
  }

  function handleCancelRecording() {
    stopCapture();
    setElapsedSeconds(0);
    setPhase("setup");
    setStatusMessage(null);
  }

  function stopMicTest(updateState = true) {
    ++micTestRequestIdRef.current;
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }
    if (audioContextRef.current && audioContextRef.current.state !== "closed") {
      void audioContextRef.current.close();
      audioContextRef.current = null;
    }
    if (updateState && isMountedRef.current) {
      setIsTestingMic(false);
      setAudioLevels(new Array(18).fill(10));
    }
  }

  async function handleToggleMicTest() {
    if (isTestingMic) {
      stopMicTest();
      return;
    }

    const requestId = ++micTestRequestIdRef.current;
    let acquiredStream: MediaStream | null = null;
    let audioContext: AudioContext | null = null;

    try {
      const constraints: MediaStreamConstraints = {
        audio: selectedDeviceId && selectedDeviceId !== "default"
          ? { deviceId: { exact: selectedDeviceId } }
          : true,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      acquiredStream = stream;
      if (requestId !== micTestRequestIdRef.current || !isOpen) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      micStreamRef.current = stream;

      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioContext = new AudioCtx();
      audioContextRef.current = audioContext;

      const analyser = audioContext.createAnalyser();
      analyser.fftSize = 64;
      analyserRef.current = analyser;

      const source = audioContext.createMediaStreamSource(stream);
      source.connect(analyser);

      setIsTestingMic(true);

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      function updateMeter() {
        if (!analyserRef.current) return;
        analyserRef.current.getByteFrequencyData(dataArray);

        // Map frequency bins to 18 bars (height percentage 10% - 100%)
        const bars: number[] = [];
        const step = Math.floor(bufferLength / 18) || 1;
        for (let i = 0; i < 18; i += 1) {
          const val = dataArray[i * step] || 0;
          const pct = Math.max(12, Math.min(100, Math.round((val / 255) * 100)));
          bars.push(pct);
        }
        setAudioLevels(bars);
        animFrameRef.current = requestAnimationFrame(updateMeter);
      }

      updateMeter();
    } catch {
      acquiredStream?.getTracks().forEach((track) => track.stop());
      if (audioContext && audioContext.state !== "closed") void audioContext.close();
      if (micStreamRef.current === acquiredStream) micStreamRef.current = null;
      if (audioContextRef.current === audioContext) audioContextRef.current = null;
      if (requestId === micTestRequestIdRef.current && isMountedRef.current) {
        setStatusMessage("Microphone access denied or unavailable.");
      }
    }
  }

  function startRecordingTimer() {
    setElapsedSeconds(0);
    timerIntervalRef.current = window.setInterval(() => {
      setElapsedSeconds((s) => s + 1);
    }, 1000);
  }

  function stopRecordingTimer() {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
  }

  function formatTime(secs: number) {
    const mins = Math.floor(secs / 60)
      .toString()
      .padStart(2, "0");
    const seconds = (secs % 60).toString().padStart(2, "0");
    return `${mins}:${seconds}`;
  }

  async function handleStartRecording() {
    stopMicTest();
    setStatusMessage(null);
    recordedChunksRef.current = [];
    isCaptureAbandonedRef.current = false;
    const requestId = ++captureRequestIdRef.current;
    let acquiredStream: MediaStream | null = null;

    try {
      const constraints: MediaStreamConstraints = {
        audio: selectedDeviceId && selectedDeviceId !== "default"
          ? { deviceId: { exact: selectedDeviceId } }
          : true,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      acquiredStream = stream;
      if (requestId !== captureRequestIdRef.current || !isOpen) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      recordingStreamRef.current = stream;

      let preferredMimeType = "audio/webm";
      if (typeof MediaRecorder !== "undefined" && typeof MediaRecorder.isTypeSupported === "function") {
        if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) {
          preferredMimeType = "audio/webm;codecs=opus";
        } else if (MediaRecorder.isTypeSupported("audio/webm")) {
          preferredMimeType = "audio/webm";
        } else if (MediaRecorder.isTypeSupported("audio/mp4")) {
          preferredMimeType = "audio/mp4";
        } else if (MediaRecorder.isTypeSupported("audio/ogg")) {
          preferredMimeType = "audio/ogg";
        }
      }

      const recorder = new MediaRecorder(stream, preferredMimeType ? { mimeType: preferredMimeType } : undefined);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (requestId === captureRequestIdRef.current && event.data && event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        if (requestId !== captureRequestIdRef.current || isCaptureAbandonedRef.current) {
          recordedChunksRef.current = [];
          return;
        }
        const startedAt = recordingStartedAtRef.current;
        const durationSeconds = startedAt === null
          ? 0
          : Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
        recordingStartedAtRef.current = null;
        const actualMime = recorder.mimeType || preferredMimeType || "audio/webm";
        const cleanMime = actualMime.split(";")[0] || "audio/webm";
        const audioBlob = new Blob(recordedChunksRef.current, { type: cleanMime });
        const ext =
          cleanMime.includes("mp4") || cleanMime.includes("m4a")
            ? "m4a"
            : cleanMime.includes("ogg")
              ? "ogg"
              : cleanMime.includes("wav")
                ? "wav"
                : "webm";
        const audioFile = new File([audioBlob], `consultation-recording.${ext}`, { type: cleanMime });
        void processRecording(audioFile, durationSeconds, requestId);
      };

      recordingStartedAtRef.current = Date.now();
      recorder.start(500);
      setPhase("recording");
      startRecordingTimer();
    } catch {
      acquiredStream?.getTracks().forEach((track) => track.stop());
      if (recordingStreamRef.current === acquiredStream) recordingStreamRef.current = null;
      if (requestId === captureRequestIdRef.current && isMountedRef.current) {
        isCaptureAbandonedRef.current = true;
        setStatusMessage("Could not start recording. Check microphone permissions.");
      }
    }
  }

  function handleStopRecording() {
    stopRecordingTimer();
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      setPhase("transcribing");
      mediaRecorderRef.current.stop();
    }
  }

  async function processRecording(file: File, durationSeconds: number, requestId: number) {
    try {
      const result = await requestTranscription(file);
      if (requestId !== captureRequestIdRef.current || isCaptureAbandonedRef.current) return;
      if (result.ok && result.transcript) {
        const selectedDevice = audioDevices.find((d) => d.deviceId === selectedDeviceId);
        onComplete({
          consultationDate: localConsultationDate(),
          patientDisplayName: selectedClient?.displayName ?? "",
          patientId: selectedClient?.patientId ?? "",
          recordingDevice: selectedDevice?.label || "Default Microphone",
          recordingDurationSeconds: durationSeconds,
          transcript: result.transcript,
        });
      } else {
        setStatusMessage(result.message || "Transcription failed. Please try again.");
        setPhase("setup");
      }
    } catch {
      if (requestId !== captureRequestIdRef.current || isCaptureAbandonedRef.current) return;
      setStatusMessage("Transcription service error. Please try again.");
      setPhase("setup");
    }
  }

  function renderInsightSource(sourceNoteId: string) {
    const source = insights?.timeline.find((note) => note.noteId === sourceNoteId);
    const label = source ? "Source: " + formatSessionDate(source.date) : "View source note";
    if (!selectedClient) return <span className="insight-source-note">{label}</span>;

    return (
      <a
        className="insight-source-note"
        href={"/clients/" + encodeURIComponent(selectedClient.patientId) + "/sessions/" + encodeURIComponent(sourceNoteId)}
      >
        {label}
      </a>
    );
  }

  if (!isOpen) return null;

  const filteredClients = clients.filter(
    (c) =>
      c.displayName.toLowerCase().includes(clientSearchQuery.toLowerCase()) ||
      c.email?.toLowerCase().includes(clientSearchQuery.toLowerCase()) ||
      c.mobileNumber?.includes(clientSearchQuery),
  );

  return (
    <div
      className="modal-backdrop"
      onClick={(event) => { if (event.target === event.currentTarget) handleClose(); }}
    >
      <div
        aria-label="Record an In-Person Session"
        aria-modal="true"
        className="record-session-modal"
        onClick={(e) => e.stopPropagation()}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
      >
        {/* Header matching Image 1 */}
        <header className="modal-header">
          <div className="modal-title-lockup">
            <span className="plant-sprout-icon" aria-hidden="true">
              <Sprout size={18} />
            </span>
            <h2>Record an In-Person Session</h2>
          </div>
          <div className="modal-window-actions">
            <button
              aria-label="Close modal"
              className="modal-icon-btn"
              onClick={handleClose}
              type="button"
            >
              <X size={16} />
            </button>
          </div>
        </header>

        {statusMessage ? (
          <div className="modal-alert-banner" role="alert">
            {statusMessage}
          </div>
        ) : null}

        {phase === "recording" ? (
          /* Active Recording State */
          <div className="modal-recording-active-view">
            <div className="pulsing-record-indicator">
              <span className="live-pulse-dot" />
              <span className="live-timer-text">{formatTime(elapsedSeconds)}</span>
            </div>
            <h3>Recording in-person session with {selectedClient?.displayName || "Client"}…</h3>
            <p className="recording-hint">Speak naturally. Spoken Urdu, English, and medical terms will be transcribed and structured.</p>

            <div className="active-waveform-bars">
              {new Array(24).fill(0).map((_, idx) => (
                <span
                  key={idx}
                  className="waveform-bar-active"
                  style={{ animationDelay: `${(idx % 6) * 0.15}s` }}
                />
              ))}
            </div>

            <div className="modal-recording-actions">
              <button
                className="primary-button stop-record-btn"
                onClick={handleStopRecording}
                type="button"
              >
                Stop recording
              </button>
              <button
                className="ghost-button"
                onClick={handleCancelRecording}
                type="button"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : phase === "transcribing" ? (
          /* Transcribing Loading State */
          <div className="modal-transcribing-view">
            <div className="transcribing-spinner" />
            <h3>Transcribing audio with Whisper Large v3…</h3>
            <p>Extracting conversation and preparing clinical note draft.</p>
          </div>
        ) : (
          /* Setup & Overview 2-Column State matching Image 1 */
          <div className="modal-body-two-column">
            {/* Left Column: Client, Mic Setup & Mic Tester */}
            <div className="modal-left-column">
              {/* 1. Selected Client */}
              <div className="setup-block">
                <span className="setup-label" id="record-client-label">Selected Client</span>
                <div
                  className="client-search-select-wrapper"
                  onBlur={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget)) setIsClientDropdownOpen(false);
                  }}
                  onKeyDown={handleClientSelectorKeyDown}
                  ref={clientSelectorRef}
                >
                  <button
                    aria-controls="record-client-options"
                    aria-expanded={isClientDropdownOpen}
                    aria-haspopup="listbox"
                    aria-labelledby="record-client-label record-client-value"
                    className={isClientDropdownOpen ? "client-select-input-box is-open" : "client-select-input-box"}
                    onClick={() => {
                      setClientSearchQuery("");
                      setIsClientDropdownOpen((open) => !open);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                        event.preventDefault();
                        setIsClientDropdownOpen(true);
                      }
                    }}
                    ref={clientSelectorTriggerRef}
                    type="button"
                  >
                    <svg aria-hidden="true" className="search-input-icon" fill="none" height="18" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" width="18">
                      <circle cx="11" cy="11" r="8" />
                      <line x1="21" x2="16.65" y1="21" y2="16.65" />
                    </svg>
                    <span className="selected-client-display" id="record-client-value">
                      {selectedClient?.displayName || "Search for an existing client…"}
                    </span>
                    <ChevronDown aria-hidden="true" className="dropdown-caret" size={18} />
                  </button>

                  {isClientDropdownOpen ? (
                    <div className="client-dropdown-menu">
                      <div className="dropdown-search-row">
                        <input
                          aria-label="Search existing clients"
                          autoFocus
                          className="dropdown-filter-input"
                          onChange={(event) => setClientSearchQuery(event.target.value)}
                          placeholder="Search clients by name…"
                          type="search"
                          value={clientSearchQuery}
                        />
                      </div>
                      <ul aria-label="Existing clients" className="client-options-list" id="record-client-options" role="listbox">
                        {filteredClients.map((client) => (
                          <li key={client.patientId} role="presentation">
                            <button
                              aria-selected={selectedClient?.patientId === client.patientId}
                              className={selectedClient?.patientId === client.patientId ? "client-option-item is-selected" : "client-option-item"}
                              onClick={() => {
                                handleSelectClient(client);
                                clientSelectorTriggerRef.current?.focus();
                              }}
                              role="option"
                              type="button"
                            >
                              <span className="option-name">{client.displayName}</span>
                              <span className="option-meta">{client.noteCount} {client.noteCount === 1 ? "session" : "sessions"}</span>
                              <span className="client-option-type">Individual</span>
                            </button>
                          </li>
                        ))}
                        <li role="presentation">
                          <button
                            aria-selected={!selectedClient}
                            className="client-option-item is-unassigned-option"
                            onClick={() => {
                              handleSelectClient(null);
                              clientSelectorTriggerRef.current?.focus();
                            }}
                            role="option"
                            type="button"
                          >
                            <span className="option-name">No client selected</span>
                            <span className="option-meta">Assign after recording</span>
                          </button>
                        </li>
                      </ul>
                      {isClientsLoading ? <RequestStatus label="Loading clients…"/> : filteredClients.length === 0 ? (
                        <p className="dropdown-empty-row" role="status">
                          No matching clients. You can record now and create a client on the next screen.
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>

              {/* 2. Setup Session - Mic Device Selector */}
              <div className="setup-block">
                <label className="setup-label">Setup Session</label>
                <p className="setup-sublabel">Select the mic you&apos;d like to use for the session.</p>
                <div className="mic-select-wrapper">
                  <span className="mic-icon" aria-hidden="true">
                    <Mic size={16} />
                  </span>
                  <select
                    className="mic-dropdown-select"
                    onChange={(e) => setSelectedDeviceId(e.target.value)}
                    value={selectedDeviceId}
                  >
                    {audioDevices.length > 0 ? (
                      audioDevices.map((d, i) => (
                        <option key={d.deviceId || i} value={d.deviceId || "default"}>
                          {d.label || `Default - Microphone (${i + 1})`}
                        </option>
                      ))
                    ) : (
                      <option value="default">Default - Microphone (Built-in Audio)</option>
                    )}
                  </select>
                </div>
              </div>

              {/* 3. Test Microphone */}
              <div className="setup-block">
                <label className="setup-label">Test Microphone</label>
                <p className="setup-sublabel">Make sure your mic is working before you begin.</p>
                <div className="mic-checker-row">
                  <button
                    className={`btn-check-mic ${isTestingMic ? "is-checking" : ""}`}
                    onClick={handleToggleMicTest}
                    type="button"
                  >
                    <span className="check-dot" /> {isTestingMic ? "Active!" : "Check!"}
                  </button>

                  <div className="sound-visualizer-bars" aria-label="Audio level meter">
                    {audioLevels.map((lvl, idx) => (
                      <span
                        key={idx}
                        className="meter-bar"
                        style={{
                          height: `${lvl}%`,
                          backgroundColor: lvl > 30 ? "#ff643b" : "#cbd5e1",
                        }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column: Insights From a Previous Session */}
            <div className="modal-right-column">
              <div className="insights-card-container">
                <h3 className="insights-heading">Insights From a Previous Session</h3>

                {isLoadingInsights ? (
                  <div className="insights-loading">
                    <p>Loading client history…</p>
                  </div>
                ) : insights && insights.hasInsights ? (
                  <div className="insights-content-populated">
                    <div className="insight-section">
                      <span className="insight-section-title">Summary</span>
                      <p className="insight-text">{insights.summary?.text || "Not documented"}</p>
                      {insights.summary ? renderInsightSource(insights.summary.sourceNoteId) : null}
                    </div>

                    <div className="insight-section">
                      <span className="insight-section-title">Previous Action Items</span>
                      <ul className="insight-bullets">
                        {insights.previousActionItems.length ? insights.previousActionItems.map((item, idx) => (
                          <li key={`${item.sourceNoteId}-${idx}`}>
                            {item.text}{renderInsightSource(item.sourceNoteId)}
                          </li>
                        )) : <li>Not documented</li>}
                      </ul>
                    </div>

                    <div className="insight-section">
                      <span className="insight-section-title">Items needing review</span>
                      <ul className="insight-bullets">
                        {insights.interestingQuestions.length ? insights.interestingQuestions.map((item, idx) => (
                          <li key={`${item.sourceNoteId}-${idx}`}>
                            {item.text}{renderInsightSource(item.sourceNoteId)}
                          </li>
                        )) : <li>Not documented</li>}
                      </ul>
                    </div>

                    <div className="insight-section">
                      <span className="insight-section-title">Plan for This Session</span>
                      <ul className="insight-bullets">
                        {insights.planForThisSession.length ? insights.planForThisSession.map((item, idx) => (
                          <li key={`${item.sourceNoteId}-${idx}`}>
                            {item.text}{renderInsightSource(item.sourceNoteId)}
                          </li>
                        )) : <li>Not documented</li>}
                      </ul>
                    </div>
                  </div>
                ) : (
                  /* Skeleton State when no client selected */
                  <div className="insights-placeholder-skeleton">
                    <div className="skeleton-section">
                      <span className="skeleton-title">Summary</span>
                      <div className="skeleton-bar bar-long" />
                      <div className="skeleton-bar bar-medium" />
                    </div>

                    <div className="skeleton-section">
                      <span className="skeleton-title">Previous Action Items</span>
                      <div className="skeleton-bar bar-long" />
                      <div className="skeleton-bar bar-short" />
                    </div>

                    <div className="skeleton-section">
                      <span className="skeleton-title">Interesting Questions</span>
                      <div className="skeleton-bar bar-long" />
                      <div className="skeleton-bar bar-medium" />
                    </div>

                    <div className="skeleton-section">
                      <span className="skeleton-title">Plan for This Session</span>
                      <div className="skeleton-bar bar-long" />
                      <div className="skeleton-bar bar-short" />
                    </div>

                    <p className="skeleton-instruction">
                      You need to assign a client to view session insights
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Footer with start recording button */}
        {phase === "setup" ? (
          <footer className="modal-footer">
            <p className="session-duration-note">
              Sessions must be between 30 seconds and 3 hours
            </p>
            <button
              className="primary-button btn-start-recording"
              onClick={handleStartRecording}
              type="button"
            >
              Start recording
            </button>
          </footer>
        ) : null}
      </div>
    </div>
  );
}
