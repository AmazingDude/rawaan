import { MAX_AUDIO_UPLOAD_BYTES, validateAudioUpload } from "@/lib/transcription/validate-audio";

export type PromptDictationPhase = "starting" | "recording" | "transcribing";
export type PromptDictationController = { start(): void; stop(): void; cancel(): void };
export type PromptRecorder = Pick<MediaRecorder, "state" | "mimeType" | "start" | "stop"> & {
  ondataavailable: ((event: BlobEvent) => void) | null;
  onstop: ((event: Event) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
};
type Dependencies = {
  getUserMedia(): Promise<MediaStream>;
  createRecorder(stream: MediaStream): PromptRecorder;
  requestTranscription(audio: File, signal: AbortSignal): Promise<string>;
};
type Callbacks = {
  onPhaseChange(phase: PromptDictationPhase): void;
  onFinish(text: string): void;
  onError(message: string): void;
};

export function appendDictatedText(existing: string, spoken: string): string {
  return spoken ? `${existing}${existing && !/\s$/.test(existing) ? " " : ""}${spoken}` : existing;
}

/** Uses the same authenticated, server-only Groq endpoint as session recordings. */
export async function requestPromptTranscription(audio: File, signal: AbortSignal): Promise<string> {
  const body = new FormData(); body.append("audio", audio);
  const response = await fetch("/api/transcribe", { method: "POST", body, signal });
  const payload: unknown = await response.json();
  if (!response.ok || typeof payload !== "object" || payload === null ||
      !("ok" in payload) || payload.ok !== true || !("transcript" in payload) ||
      typeof payload.transcript !== "string" || !payload.transcript.trim()) {
    throw new Error("Voice transcription failed.");
  }
  return payload.transcript.trim();
}

const browserDependencies: Dependencies = {
  getUserMedia: () => navigator.mediaDevices.getUserMedia({ audio: true }),
  createRecorder: stream => {
    const mimeType = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"]
      .find(type => MediaRecorder.isTypeSupported(type));
    return new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  },
  requestTranscription: requestPromptTranscription,
};

/** One completed recording, one upload, one editable prompt; cancel discards it. */
export function createPromptDictation(callbacks: Callbacks, dependencies = browserDependencies): PromptDictationController {
  let closed = false, started = false, stopping = false, uploading = false;
  let stream: MediaStream | null = null, recorder: PromptRecorder | null = null;
  let chunks: Blob[] = [], size = 0;
  let captureTimer: ReturnType<typeof setTimeout> | undefined;
  let finishTimer: ReturnType<typeof setTimeout> | undefined;
  const request = new AbortController();

  function releaseMicrophone() {
    stream?.getTracks().forEach(track => track.stop()); stream = null;
  }
  function dispose() {
    closed = true;
    clearTimeout(captureTimer); clearTimeout(finishTimer); request.abort();
    if (recorder) {
      recorder.ondataavailable = null; recorder.onstop = null; recorder.onerror = null;
      if (recorder.state !== "inactive") {
        try { recorder.stop(); } catch { /* The device may already be disconnected. */ }
      }
    }
    releaseMicrophone(); chunks = [];
  }
  function finish(text: string) {
    if (closed) return;
    dispose(); callbacks.onFinish(text);
  }
  function fail(message: string) {
    if (closed) return;
    callbacks.onError(message); finish("");
  }
  function beginTranscribing() {
    if (stopping) return;
    stopping = true; clearTimeout(captureTimer);
    callbacks.onPhaseChange("transcribing");
    finishTimer = setTimeout(() => fail("Voice input did not finish. Please try again or type your request."), 45000);
  }
  const controller: PromptDictationController = {
    start() {
      if (closed || started) return;
      started = true; callbacks.onPhaseChange("starting");
      void (async () => {
        try {
          const acquired = await dependencies.getUserMedia();
          if (closed) { acquired.getTracks().forEach(track => track.stop()); return; }
          stream = acquired;
          const capture = dependencies.createRecorder(acquired); recorder = capture;
          capture.ondataavailable = event => {
            if (closed || uploading || !event.data.size) return;
            size += event.data.size;
            if (size > MAX_AUDIO_UPLOAD_BYTES) { fail("Voice recording is too large. Please record a shorter request."); return; }
            chunks.push(event.data);
          };
          capture.onerror = () => fail("Voice recording was interrupted. Please try again or type your request.");
          capture.onstop = () => {
            if (closed || uploading) return;
            uploading = true; beginTranscribing(); releaseMicrophone();
            const type = (capture.mimeType || chunks[0]?.type || "audio/webm").split(";")[0];
            const extension = type.includes("mp4") || type.includes("m4a") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
            const audio = new File(chunks, `voice-request.${extension}`, { type }); chunks = [];
            const invalid = validateAudioUpload(audio);
            if (invalid) { fail(invalid.message); return; }
            void dependencies.requestTranscription(audio, request.signal).then(text => {
              if (!text.trim()) { fail("No speech was captured. Please try again or type your request."); return; }
              finish(text.trim());
            }).catch(() => fail("Could not transcribe your voice input. Please try again or type your request."));
          };
          capture.start(500);
          callbacks.onPhaseChange("recording");
          captureTimer = setTimeout(() => controller.stop(), 120000);
        } catch (error) {
          const denied = error instanceof DOMException && (error.name === "NotAllowedError" || error.name === "SecurityError");
          fail(denied ? "Allow microphone permission in your browser to use voice input."
            : "Recording could not start. Check your microphone and try again or type your request.");
        }
      })();
    },
    stop() {
      if (closed || stopping || !recorder) return;
      beginTranscribing();
      try { recorder.stop(); releaseMicrophone(); }
      catch { fail("Recording could not stop. Please try again or type your request."); }
    },
    cancel() { if (!closed) dispose(); },
  };
  return controller;
}
