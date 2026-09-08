import type { LlmCompletionProvider } from "@/lib/llm/provider";
import { TRANSCRIPT_TRANSLATION_SYSTEM_PROMPT } from "@/lib/llm/prompts/transcript-translation";

export type TranscriptTranslator = {
  translate(transcript: string): Promise<string>;
};

/**
 * Translates full transcripts to English through the configured LLM.
 * Any failure returns the original transcript unchanged, so transcription
 * output always reaches the clinician even when translation is unavailable.
 */
export function createTranscriptTranslator(
  provider: LlmCompletionProvider,
): TranscriptTranslator {
  return {
    async translate(transcript: string): Promise<string> {
      const text = transcript.trim();
      if (!text) return transcript;

      try {
        const translated = await provider.complete({
          system: TRANSCRIPT_TRANSLATION_SYSTEM_PROMPT,
          user: text,
        });
        const cleaned = translated.trim();
        return cleaned.length > 0 ? cleaned : transcript;
      } catch {
        return transcript;
      }
    },
  };
}
