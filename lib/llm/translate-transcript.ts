import type { LlmCompletionProvider } from "@/lib/llm/provider";

const TRANSCRIPT_TRANSLATION_SYSTEM_PROMPT = `You are a professional medical transcription translator.

Translate the given clinical consultation transcript into standard, professional clinical English.

RULES:
- Translate the ENTIRE transcript verbatim. Do NOT summarize, compress, or omit anything.
- Preserve every speaker turn, repeated phrases, and medical terms exactly as spoken.
- The source may be Urdu (Arabic script), Hindi (Devanagari), Roman Urdu, English, or any mix of these.
- Do not add explanations, notes, or extra text. Output ONLY the translated transcript.`;

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
