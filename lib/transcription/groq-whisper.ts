import { z } from "zod";

import type { TranscriptionProvider } from "@/lib/transcription/types";

const GROQ_TRANSCRIPTIONS_URL =
  "https://api.groq.com/openai/v1/audio/transcriptions";
const GROQ_WHISPER_MODEL = "whisper-large-v3-turbo";

const groqTranscriptionResponseSchema = z.object({
  text: z.string(),
});

function readGroqApiKey(): string {
  const apiKey = process.env.GROQ_API_KEY?.trim();

  if (!apiKey) {
    throw new Error("Groq transcription is not configured.");
  }

  return apiKey;
}

export function createGroqWhisperProvider(): TranscriptionProvider {
  return {
    async transcribe({ audio, signal }) {
      const formData = new FormData();
      formData.append("file", audio);
      formData.append("model", GROQ_WHISPER_MODEL);
      formData.append("response_format", "json");
      formData.append(
        "prompt",
        "Clinical consultation in Urdu and English. Transcribe conversation and medical terms accurately.",
      );
      formData.append("temperature", "0");

      const response = await fetch(GROQ_TRANSCRIPTIONS_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${readGroqApiKey()}`,
        },
        body: formData,
        signal,
      });

      if (!response.ok) {
        throw new Error("Groq transcription request failed.");
      }

      const payload = groqTranscriptionResponseSchema.safeParse(
        await response.json(),
      );

      if (!payload.success) {
        throw new Error("Groq transcription response was invalid.");
      }

      return {
        transcript: payload.data.text,
      };
    },
  };
}
