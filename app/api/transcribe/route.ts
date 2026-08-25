import { NextResponse } from "next/server";

import { createGroqWhisperProvider } from "@/lib/transcription/groq-whisper";
import type {
  TranscriptionFailure,
  TranscriptionProvider,
  TranscriptionResult,
} from "@/lib/transcription/types";
import {
  validateAudioUpload,
  validateTranscriptionText,
} from "@/lib/transcription/validate-audio";

const manualFallbackFailure: TranscriptionFailure = {
  ok: false,
  code: "transcription_failed",
  message:
    "Audio-to-text is unavailable. Please try again or type/paste the transcript manually.",
};

const missingAudioFailure: TranscriptionFailure = {
  ok: false,
  code: "invalid_audio",
  message:
    "Select one completed recording or type/paste the transcript manually.",
};

function resultResponse(
  result: TranscriptionResult,
  status: number,
): NextResponse<TranscriptionResult> {
  return NextResponse.json(result, { status });
}

export function createTranscriptionPost(provider: TranscriptionProvider) {
  return async function POST(request: Request): Promise<NextResponse<TranscriptionResult>> {
    let formData: FormData;

    try {
      formData = await request.formData();
    } catch {
      return resultResponse(missingAudioFailure, 400);
    }

    const audio = formData.get("audio");

    if (!(audio instanceof File)) {
      return resultResponse(missingAudioFailure, 400);
    }

    const audioFailure = validateAudioUpload(audio);

    if (audioFailure) {
      return resultResponse(audioFailure, 400);
    }

    try {
      const transcription = await provider.transcribe({ audio });
      const result = validateTranscriptionText(transcription.transcript);

      return resultResponse(result, result.ok ? 200 : 502);
    } catch {
      return resultResponse(manualFallbackFailure, 502);
    }
  };
}

export const POST = createTranscriptionPost(createGroqWhisperProvider());
