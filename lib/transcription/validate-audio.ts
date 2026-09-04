import type {
  TranscriptionFailure,
  TranscriptionResult,
} from "@/lib/transcription/types";

export const MAX_AUDIO_UPLOAD_BYTES = 25 * 1024 * 1024;

const supportedAudioMimeTypes = new Set([
  "audio/flac",
  "audio/x-flac",
  "audio/m4a",
  "audio/x-m4a",
  "audio/mp4",
  "video/mp4",
  "audio/mpeg",
  "audio/mp3",
  "audio/x-mpeg",
  "audio/mpga",
  "audio/ogg",
  "audio/opus",
  "audio/x-ogg",
  "audio/wav",
  "audio/x-wav",
  "audio/wave",
  "audio/webm",
  "video/webm",
]);

const supportedAudioExtensions = new Set([
  "flac",
  "m4a",
  "mp4",
  "mpeg",
  "mp3",
  "mpga",
  "ogg",
  "opus",
  "wav",
  "webm",
]);

function invalidAudio(message: string): TranscriptionFailure {
  return {
    ok: false,
    code: "invalid_audio",
    message,
  };
}

export function validateAudioUpload(audio: File): TranscriptionFailure | null {
  if (audio.size === 0) {
    return invalidAudio(
      "Recording is empty. Please record again or type/paste the transcript manually.",
    );
  }

  if (audio.size > MAX_AUDIO_UPLOAD_BYTES) {
    return invalidAudio(
      "Recording is larger than the 25 MB demo limit. Please record a shorter consultation or type/paste the transcript manually.",
    );
  }

  const rawType = (audio.type || "").toLowerCase();
  const baseMime = rawType.split(";")[0]?.trim() || "";

  if (baseMime) {
    if (!supportedAudioMimeTypes.has(baseMime)) {
      return invalidAudio(
        "This audio format is not supported. Please try the demo browser or type/paste the transcript manually.",
      );
    }
  } else {
    const extMatch = audio.name ? audio.name.split(".").pop()?.toLowerCase() : null;
    if (!extMatch || !supportedAudioExtensions.has(extMatch)) {
      return invalidAudio(
        "This audio format is not supported. Please try the demo browser or type/paste the transcript manually.",
      );
    }
  }

  return null;
}

export function validateTranscriptionText(candidate: string): TranscriptionResult {
  const transcript = candidate.trim();

  if (!transcript) {
    return {
      ok: false,
      code: "transcription_failed",
      message:
        "No spoken words were transcribed. Please try again or type/paste the transcript manually.",
    };
  }

  return {
    ok: true,
    transcript,
  };
}
