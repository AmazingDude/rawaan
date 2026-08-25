import type { TranscriptionResult } from "@/lib/transcription/types";

export type VoiceCapturePhase = "idle" | "recording" | "transcribing";

export type VoiceCaptureState = {
  elapsedSeconds: number;
  fallbackMessage: string | null;
  phase: VoiceCapturePhase;
};

export type VoiceRecorder = {
  addEventListener(
    type: "dataavailable",
    listener: (event: { data: Blob }) => void,
  ): void;
  addEventListener(type: "stop", listener: () => void): void;
  start(): void;
  stop(): void;
};

type VoiceMediaStream = {
  getTracks(): Array<{ stop(): void }>;
};

export type VoiceCaptureDependencies = {
  clearScheduledInterval(intervalId: number): void;
  createAudioFile(parts: Blob[], name: string, type: string): File;
  createRecorder(stream: VoiceMediaStream): VoiceRecorder;
  getUserMedia(): Promise<VoiceMediaStream>;
  isOnline(): boolean;
  isRecorderSupported(): boolean;
  onStateChange?(state: VoiceCaptureState): void;
  onTranscript?(transcript: string): void;
  requestTranscription(audio: File): Promise<TranscriptionResult>;
  scheduleInterval(callback: () => void, milliseconds: number): number;
};

type TranscriptPlacementInput = {
  currentTranscript: string;
  transcriptAtStop: string;
  transcribedText: string;
};

type TranscriptPlacement = {
  pendingTranscript: string | null;
  transcript: string;
};

const defaultState: VoiceCaptureState = {
  elapsedSeconds: 0,
  fallbackMessage: null,
  phase: "idle",
};

const endpointFailureMessage =
  "Audio-to-text is unavailable. Please try again or type/paste the transcript manually.";

export function isRecordControlDisabled(
  hasConsent: boolean,
  state: VoiceCaptureState,
): boolean {
  return !hasConsent || state.phase === "transcribing";
}

export function resolveTranscriptPlacement({
  currentTranscript,
  transcriptAtStop,
  transcribedText,
}: TranscriptPlacementInput): TranscriptPlacement {
  if (currentTranscript === transcriptAtStop) {
    return {
      pendingTranscript: null,
      transcript: transcribedText,
    };
  }

  return {
    pendingTranscript: transcribedText,
    transcript: currentTranscript,
  };
}

function errorName(error: unknown): string | null {
  if (typeof error !== "object" || error === null || !("name" in error)) {
    return null;
  }

  const name = error.name;
  return typeof name === "string" ? name : null;
}

export class VoiceCaptureController {
  private audioChunks: Blob[] = [];
  private audioFilePromise: Promise<File> | null = null;
  private captureRevision = 0;
  private clearTimer: (() => void) | null = null;
  private currentState: VoiceCaptureState = defaultState;
  private recorder: VoiceRecorder | null = null;
  private resolveAudioFile: ((audio: File) => void) | null = null;
  private stream: VoiceMediaStream | null = null;

  constructor(private readonly dependencies: VoiceCaptureDependencies) {}

  get state(): VoiceCaptureState {
    return this.currentState;
  }

  async start(hasConsent: boolean): Promise<void> {
    if (!hasConsent || this.currentState.phase !== "idle") {
      return;
    }

    if (!this.dependencies.isRecorderSupported()) {
      this.setFallback(
        "Recording is not supported in this demo browser. Type or paste the transcript manually.",
      );
      return;
    }

    if (!this.dependencies.isOnline()) {
      this.setFallback(
        "You are offline. Type or paste the transcript manually.",
      );
      return;
    }

    try {
      const stream = await this.dependencies.getUserMedia();
      const recorder = this.dependencies.createRecorder(stream);

      this.captureRevision += 1;
      this.stream = stream;
      this.recorder = recorder;
      this.audioChunks = [];
      this.audioFilePromise = new Promise((resolve) => {
        this.resolveAudioFile = resolve;
      });

      recorder.addEventListener("dataavailable", (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      });

      recorder.addEventListener("stop", () => {
        const type = this.audioChunks[0]?.type || "audio/webm";
        const audio = this.dependencies.createAudioFile(
          this.audioChunks,
          "consultation.webm",
          type,
        );
        this.resolveAudioFile?.(audio);
      });

      this.setState({
        elapsedSeconds: 0,
        fallbackMessage: null,
        phase: "recording",
      });
      this.clearTimer = () => {
        this.dependencies.clearScheduledInterval(intervalId);
      };
      const intervalId = this.dependencies.scheduleInterval(() => {
        this.setState({
          ...this.currentState,
          elapsedSeconds: this.currentState.elapsedSeconds + 1,
        });
      }, 1000);
      recorder.start();
    } catch (error) {
      this.setFallback(
        errorName(error) === "NotAllowedError"
          ? "Microphone permission was not granted. Type or paste the transcript manually."
          : "Recording could not start. Type or paste the transcript manually.",
      );
    }
  }

  async stop(): Promise<void> {
    if (this.currentState.phase !== "recording" || !this.recorder) {
      return;
    }

    this.clearRecordingTimer();
    this.setState({
      elapsedSeconds: this.currentState.elapsedSeconds,
      fallbackMessage: null,
      phase: "transcribing",
    });

    const captureRevision = this.captureRevision;
    const recorder = this.recorder;
    const audioFilePromise = this.audioFilePromise;
    recorder.stop();
    this.stopTracks();

    if (!audioFilePromise) {
      this.setFallback(endpointFailureMessage);
      return;
    }

    const audio = await audioFilePromise;

    try {
      const result = await this.dependencies.requestTranscription(audio);

      if (captureRevision !== this.captureRevision) {
        return;
      }

      if (!result.ok) {
        this.setFallback(result.message);
        return;
      }

      if (!result.transcript.trim()) {
        this.setFallback(
          "No spoken words were transcribed. Please try again or type/paste the transcript manually.",
        );
        return;
      }

      this.dependencies.onTranscript?.(result.transcript);
      this.setState({
        elapsedSeconds: 0,
        fallbackMessage: null,
        phase: "idle",
      });
    } catch {
      if (captureRevision === this.captureRevision) {
        this.setFallback(endpointFailureMessage);
      }
    } finally {
      if (captureRevision === this.captureRevision) {
        this.recorder = null;
        this.stream = null;
        this.audioFilePromise = null;
        this.resolveAudioFile = null;
        this.audioChunks = [];
      }
    }
  }

  reset(): void {
    this.captureRevision += 1;
    this.clearRecordingTimer();

    if (this.currentState.phase === "recording") {
      this.recorder?.stop();
    }

    this.stopTracks();
    this.audioChunks = [];
    this.audioFilePromise = null;
    this.recorder = null;
    this.resolveAudioFile = null;
    this.stream = null;
    this.setState(defaultState);
  }

  private clearRecordingTimer(): void {
    this.clearTimer?.();
    this.clearTimer = null;
  }

  private setFallback(message: string): void {
    this.clearRecordingTimer();
    this.stopTracks();
    this.setState({
      elapsedSeconds: 0,
      fallbackMessage: message,
      phase: "idle",
    });
  }

  private setState(state: VoiceCaptureState): void {
    this.currentState = state;
    this.dependencies.onStateChange?.(state);
  }

  private stopTracks(): void {
    this.stream?.getTracks().forEach((track) => track.stop());
  }
}
