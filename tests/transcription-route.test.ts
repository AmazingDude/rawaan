import { describe, expect, it } from "vitest";

import { createTranscriptionPost } from "@/app/api/transcribe/route";
import type { TranscriptionProvider } from "@/lib/transcription/types";
import {
  MAX_AUDIO_UPLOAD_BYTES,
  validateAudioUpload,
  validateTranscriptionText,
} from "@/lib/transcription/validate-audio";

function makeAudioFile(size: number, type = "audio/webm"): File {
  return new File([new Uint8Array(size)], "consultation.webm", { type });
}

function makeTranscriptionRequest(audio: File): Request {
  const formData = new FormData();
  formData.append("audio", audio);

  return new Request("http://localhost/api/transcribe", {
    method: "POST",
    body: formData,
  });
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

  it("accepts audio/webm with codecs parameter from browser MediaRecorder", () => {
    expect(
      validateAudioUpload(makeAudioFile(1024, "audio/webm;codecs=opus")),
    ).toBeNull();
  });

  it("accepts mp3 and wav audio uploads", () => {
    expect(validateAudioUpload(makeAudioFile(1024, "audio/mp3"))).toBeNull();
    expect(validateAudioUpload(makeAudioFile(1024, "audio/wav"))).toBeNull();
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

describe("Task 3 transcription route", () => {
  it("returns a validated final transcript from a fake provider", async () => {
    const handler = createTranscriptionPost({
      async transcribe() {
        return { transcript: " Chief complaint: Persistent headache " };
      },
    });

    const response = await handler(makeTranscriptionRequest(makeAudioFile(1)));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      transcript: "Chief complaint: Persistent headache",
    });
  });

  it("returns a safe manual-fallback failure when the fake provider throws", async () => {
    const handler = createTranscriptionPost({
      async transcribe() {
        throw new Error("provider unavailable");
      },
    });

    const response = await handler(makeTranscriptionRequest(makeAudioFile(1)));

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      code: "transcription_failed",
      message:
        "Audio-to-text is unavailable. Please try again or type/paste the transcript manually.",
    });
  });

  it("returns validation failure without invoking the fake provider", async () => {
    let providerCalls = 0;
    const handler = createTranscriptionPost({
      async transcribe() {
        providerCalls += 1;
        return { transcript: "Unexpected call" };
      },
    });

    const response = await handler(
      makeTranscriptionRequest(makeAudioFile(1, "audio/aac")),
    );

    expect(providerCalls).toBe(0);
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      code: "invalid_audio",
      message:
        "This audio format is not supported. Please try the demo browser or type/paste the transcript manually.",
    });
  });
});
