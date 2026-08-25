export type TranscriptionSuccess = {
  ok: true;
  transcript: string;
};

export type TranscriptionFailureCode =
  | "recording_not_supported"
  | "microphone_permission_denied"
  | "offline"
  | "invalid_audio"
  | "transcription_failed";

export type TranscriptionFailure = {
  ok: false;
  code: TranscriptionFailureCode;
  message: string;
};

export type TranscriptionResult =
  | TranscriptionSuccess
  | TranscriptionFailure;

export type TranscriptionProvider = {
  transcribe(input: {
    audio: File;
    signal?: AbortSignal;
  }): Promise<{ transcript: string }>;
};
