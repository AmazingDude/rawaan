"use client";

import { Mic, Sprout, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import {
  createClientAction,
  getPatientInsightsAction,
  listClientsAction,
  type ClientRecord,
} from "@/app/actions";
import type { PatientSessionInsights } from "@/lib/notes/insights";

interface RecordSessionModalProps {
  initialClients?: ClientRecord[];
  isOpen: boolean;
  onClose: () => void;
  onComplete: (data: {
    consultationDate: string;
    patientDisplayName: string;
    patientId: string;
    transcript: string;
  }) => void;
  requestTranscription: (audio: File) => Promise<{ ok: boolean; transcript?: string; message?: string }>;
}

export function RecordSessionModal({
  initialClients = [],
  isOpen,
  onClose,
  onComplete,
  requestTranscription,
}: RecordSessionModalProps) {
  const [clients, setClients] = useState<ClientRecord[]>(initialClients);
  const [selectedClient, setSelectedClient] = useState<ClientRecord | null>(null);
  const [clientSearchQuery, setClientSearchQuery] = useState("");
  const [isClientDropdownOpen, setIsClientDropdownOpen] = useState(false);
  const [isCreatingClient, setIsCreatingClient] = useState(false);
  const [newClientName, setNewClientName] = useState("");

  const [insights, setInsights] = useState<PatientSessionInsights | null>(null);
  const [isLoadingInsights, setIsLoadingInsights] = useState(false);

  // Audio Device Setup
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("default");

  // Mic Tester State
  const [isTestingMic, setIsTestingMic] = useState(false);
  const [audioLevels, setAudioLevels] = useState<number[]>(new Array(18).fill(10));
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
  const timerIntervalRef = useRef<number | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Load clients if none passed
  useEffect(() => {
    if (isOpen && clients.length === 0) {
      void listClientsAction().then((loaded) => {
        if (loaded.length > 0) {
          setClients(loaded);
        }
      });
    }
  }, [isOpen, clients.length]);

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

  function handleSelectClient(client: ClientRecord | null) {
    // If clicking the already selected client, toggle off (unselect)
    if (
      selectedClient &&
      client &&
      selectedClient.patientId === client.patientId
    ) {
      setSelectedClient(null);
      setInsights(null);
      setIsClientDropdownOpen(false);
      return;
    }

    setSelectedClient(client);
    setIsClientDropdownOpen(false);
    if (!client) {
      setInsights(null);
      return;
    }

    setIsLoadingInsights(true);
    void getPatientInsightsAction(client.patientId)
      .then((data) => {
        setInsights(data);
      })
      .catch(() => {
        setInsights(null);
      })
      .finally(() => {
        setIsLoadingInsights(false);
      });
  }

  // Cleanup on close or unmount
  useEffect(() => {
    return () => {
      stopMicTest();
      stopCapture();
    };
  }, []);

  // Releases the mic and abandons any in-flight recording/transcription, so a
  // capture that is torn down mid-flight can never report back into the UI.
  function stopCapture() {
    isCaptureAbandonedRef.current = true;

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

  function stopMicTest() {
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
    setIsTestingMic(false);
    setAudioLevels(new Array(18).fill(10));
  }

  async function handleToggleMicTest() {
    if (isTestingMic) {
      stopMicTest();
      return;
    }

    try {
      const constraints: MediaStreamConstraints = {
        audio: selectedDeviceId && selectedDeviceId !== "default"
          ? { deviceId: { exact: selectedDeviceId } }
          : true,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      micStreamRef.current = stream;

      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const audioCtx = new AudioCtx();
      audioContextRef.current = audioCtx;

      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;
      analyserRef.current = analyser;

      const source = audioCtx.createMediaStreamSource(stream);
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
      setStatusMessage("Microphone access denied or unavailable.");
    }
  }

  async function handleCreateClientSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!newClientName.trim()) return;

    // Persist through the server action so the client is stored
    // (Supabase + local fallback) instead of living only in this modal.
    const result = await createClientAction({
      firstName: newClientName.trim(),
      lastName: "",
    });

    if (!result.ok) {
      setStatusMessage(result.message);
      return;
    }

    setClients((prev) => [result.client, ...prev]);
    handleSelectClient(result.client);
    setNewClientName("");
    setIsCreatingClient(false);
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

    try {
      const constraints: MediaStreamConstraints = {
        audio: selectedDeviceId && selectedDeviceId !== "default"
          ? { deviceId: { exact: selectedDeviceId } }
          : true,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      recordingStreamRef.current = stream;
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        if (isCaptureAbandonedRef.current) {
          recordedChunksRef.current = [];
          return;
        }
        const audioBlob = new Blob(recordedChunksRef.current, { type: "audio/webm" });
        const audioFile = new File([audioBlob], "consultation-recording.webm", { type: "audio/webm" });
        void processRecording(audioFile);
      };

      recorder.start(500);
      setPhase("recording");
      startRecordingTimer();
    } catch {
      setStatusMessage("Could not start recording. Check microphone permissions.");
    }
  }

  function handleStopRecording() {
    stopRecordingTimer();
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
      setPhase("transcribing");
      mediaRecorderRef.current.stop();
    }
  }

  async function processRecording(file: File) {
    try {
      const result = await requestTranscription(file);
      if (isCaptureAbandonedRef.current) return;
      if (result.ok && result.transcript) {
        onComplete({
          consultationDate: new Date().toISOString().slice(0, 10),
          patientDisplayName: selectedClient ? selectedClient.displayName : "Walk-in Consultation",
          patientId: selectedClient ? selectedClient.patientId : `patient-guest-${Date.now().toString().slice(-4)}`,
          transcript: result.transcript,
        });
      } else {
        setStatusMessage(result.message || "Transcription failed. Please try again.");
        setPhase("setup");
      }
    } catch {
      if (isCaptureAbandonedRef.current) return;
      setStatusMessage("Transcription service error. Please try again.");
      setPhase("setup");
    }
  }

  if (!isOpen) return null;

  const filteredClients = clients.filter(
    (c) =>
      c.displayName.toLowerCase().includes(clientSearchQuery.toLowerCase()) ||
      c.patientId.toLowerCase().includes(clientSearchQuery.toLowerCase()),
  );

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="record-session-modal" onClick={(e) => e.stopPropagation()}>
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
              aria-label="Expand"
              className="modal-icon-btn"
              type="button"
            >
              <svg aria-hidden="true" fill="none" height="15" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" width="15">
                <polyline points="15 3 21 3 21 9" />
                <polyline points="9 21 3 21 3 15" />
                <line x1="21" x2="14" y1="3" y2="10" />
                <line x1="3" x2="10" y1="21" y2="14" />
              </svg>
            </button>
            <button
              aria-label="Close modal"
              className="modal-icon-btn"
              onClick={onClose}
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
                Stop & Generate Note
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
                <label className="setup-label">Selected Client</label>
                <div className="client-search-select-wrapper">
                  <div
                    className="client-select-input-box"
                    onClick={() => setIsClientDropdownOpen((prev) => !prev)}
                    role="button"
                    tabIndex={0}
                  >
                    <svg className="search-input-icon" fill="none" height="16" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" width="16">
                      <circle cx="11" cy="11" r="8" />
                      <line x1="21" x2="16.65" y1="21" y2="16.65" />
                    </svg>
                    <span className="selected-client-display">
                      {selectedClient ? selectedClient.displayName : "Search for a client or group…"}
                    </span>
                    {selectedClient ? (
                      <button
                        aria-label="Unselect client"
                        className="btn-unselect-client"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelectClient(null);
                        }}
                        type="button"
                      >
                        <X size={14} />
                      </button>
                    ) : (
                      <span className="dropdown-caret">⌄</span>
                    )}
                  </div>

                  {isClientDropdownOpen ? (
                    <div className="client-dropdown-menu">
                      <div className="dropdown-search-row">
                        <input
                          autoFocus
                          className="dropdown-filter-input"
                          onChange={(e) => setClientSearchQuery(e.target.value)}
                          placeholder="Type client name or ID…"
                          type="text"
                          value={clientSearchQuery}
                        />
                      </div>
                      <ul className="client-options-list">
                        {selectedClient ? (
                          <li
                            className="client-option-item is-clear-option"
                            onClick={() => handleSelectClient(null)}
                          >
                            <span className="option-name">
                              <X size={14} /> Clear selection (No client)
                            </span>
                          </li>
                        ) : null}
                        {filteredClients.map((client) => (
                          <li
                            key={client.patientId}
                            className={`client-option-item ${selectedClient?.patientId === client.patientId ? "is-selected" : ""}`}
                            onClick={() => handleSelectClient(client)}
                          >
                            <span className="option-name">{client.displayName}</span>
                            <span className="option-meta">ID: {client.patientId}</span>
                          </li>
                        ))}
                      </ul>

                      {filteredClients.length === 0 ? (
                        <div className="dropdown-empty-row">
                          <p>No matching client found.</p>
                          <button
                            className="btn-create-inline"
                            onClick={() => {
                              setNewClientName(clientSearchQuery);
                              setIsCreatingClient(true);
                            }}
                            type="button"
                          >
                            + Create &quot;{clientSearchQuery || "New Client"}&quot;
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                {isCreatingClient ? (
                  <form className="inline-client-form" onSubmit={handleCreateClientSubmit}>
                    <input
                      autoFocus
                      className="form-input"
                      onChange={(e) => setNewClientName(e.target.value)}
                      placeholder="Enter new patient name…"
                      type="text"
                      value={newClientName}
                    />
                    <div className="inline-form-actions">
                      <button className="primary-button btn-sm" type="submit">
                        Save Client
                      </button>
                      <button
                        className="ghost-button btn-sm"
                        onClick={() => setIsCreatingClient(false)}
                        type="button"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : null}
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
                      <p className="insight-text">{insights.summary}</p>
                    </div>

                    <div className="insight-section">
                      <span className="insight-section-title">Previous Action Items</span>
                      <ul className="insight-bullets">
                        {insights.previousActionItems.map((item, idx) => (
                          <li key={idx}>{item}</li>
                        ))}
                      </ul>
                    </div>

                    <div className="insight-section">
                      <span className="insight-section-title">Interesting Questions</span>
                      <ul className="insight-bullets">
                        {insights.interestingQuestions.map((item, idx) => (
                          <li key={idx}>{item}</li>
                        ))}
                      </ul>
                    </div>

                    <div className="insight-section">
                      <span className="insight-section-title">Plan for This Session</span>
                      <ul className="insight-bullets">
                        {insights.planForThisSession.map((item, idx) => (
                          <li key={idx}>{item}</li>
                        ))}
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
