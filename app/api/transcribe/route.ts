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
import { createTranscriptTranslator, type TranscriptTranslator } from "@/lib/llm/translate-transcript";
import { createLlmProviderFromEnv } from "@/lib/llm/provider";

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

// Translates the full transcript to English when a Groq key is configured.
// Whisper transcribes Urdu speech in the source script (often Devanagari);
// Groq's endpoint has no translation mode, so the LLM does the conversion.
function createDefaultTranscriptTranslator(): TranscriptTranslator | undefined {
  try {
    return createTranscriptTranslator(
      createLlmProviderFromEnv({
        GROQ_API_KEY: process.env.GROQ_API_KEY,
        LLM_MODEL: process.env.LLM_MODEL,
      }),
    );
  } catch {
    return undefined;
  }
}

export function createTranscriptionPost(
  provider: TranscriptionProvider,
  translator?: TranscriptTranslator,
) {
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
      const translatedTranscript = translator
        ? await translator.translate(transcription.transcript)
        : transcription.transcript;
      const result = validateTranscriptionText(translatedTranscript);

      return resultResponse(result, result.ok ? 200 : 502);
    } catch {
      return resultResponse(manualFallbackFailure, 502);
    }
  };
}

export const POST = createTranscriptionPost(
  createGroqWhisperProvider(),
  createDefaultTranscriptTranslator(),
);
