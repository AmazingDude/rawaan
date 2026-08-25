import { describe, expect, it } from "vitest";

import type { TranscriptionProvider } from "@/lib/transcription/types";
import {
  MAX_AUDIO_UPLOAD_BYTES,
  validateAudioUpload,
  validateTranscriptionText,
} from "@/lib/transcription/validate-audio";

function makeAudioFile(
  size: number,
  type = "audio/webm",
): File {
  return new File([new Uint8Array(size)], "consultation.webm", { type });
}

async function validateFakeProviderTranscript(
  transcript: string,
): Promise<ReturnType<typeof validateTranscriptionText>> {
  const provider: TranscriptionProvider = {
    async transcribe() {
      return { transcript };
    },
  };

  const response = await provider.transcribe({
    audio: makeAudioFile(1),
  });

  return validateTranscriptionText(response.transcript);
}

describe("Task 2 transcription validation boundary", () => {
  it("rejects an empty completed audio file before any provider call", () => {
    expect(validateAudioUpload(makeAudioFile(0))).toEqual({
      ok: false,
      code: "invalid_audio",
      message:
        "Recording is empty. Please record again or type/paste the transcript manually.",
    });
  });

  it("rejects a MIME type Groq does not accept before any provider call", () => {
    expect(validateAudioUpload(makeAudioFile(1, "audio/aac"))).toEqual({
      ok: false,
      code: "invalid_audio",
      message:
        "This audio format is not supported. Please try the demo browser or type/paste the transcript manually.",
    });
  });

  it("rejects audio that exceeds the 25 MB direct-upload policy before any provider call", () => {
    expect(
      validateAudioUpload(makeAudioFile(MAX_AUDIO_UPLOAD_BYTES + 1)),
    ).toEqual({
      ok: false,
      code: "invalid_audio",
      message:
        "Recording is larger than the 25 MB demo limit. Please record a shorter consultation or type/paste the transcript manually.",
    });
  });

  it("accepts a non-empty supported WebM upload at the direct-upload limit", () => {
    expect(
      validateAudioUpload(makeAudioFile(MAX_AUDIO_UPLOAD_BYTES)),
    ).toBeNull();
  });

  it.each(["", "   \n\t  "])(
    "rejects a blank fake-provider transcript (%j)",
    async (transcript) => {
      await expect(validateFakeProviderTranscript(transcript)).resolves.toEqual({
        ok: false,
        code: "transcription_failed",
        message:
          "No spoken words were transcribed. Please try again or type/paste the transcript manually.",
      });
    },
  );
});
