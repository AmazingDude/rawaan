import { z } from "zod";
import type { LlmCompletionProvider } from "@/lib/llm/provider";
import { TRANSCRIPT_URDU_SYSTEM_PROMPT } from "@/lib/llm/prompts/transcript-urdu";
import { hasDevanagari } from "@/lib/transcription/devanagari-to-urdu";

const outputSchema = z.object({ lines: z.array(z.string()) }).strict();
const unavailable = { ok: false as const, message: "Urdu transcript is unavailable. Retry to load it; the original transcription is preserved." };

// Display translation only: callers must retain the original ASR text as provenance.
export async function translateTranscriptToUrdu(transcript: string, provider: LlmCompletionProvider): Promise<{ ok: true; transcript: string } | { ok: false; message: string }> {
  if (!hasDevanagari(transcript)) return { ok: true, transcript };
  const lines = transcript.split("\n");
  try {
    const output = outputSchema.parse(JSON.parse(await provider.complete({ system: TRANSCRIPT_URDU_SYSTEM_PROMPT, user: JSON.stringify({ lines }) })));
    if (output.lines.length !== lines.length) return unavailable;
    for (let index = 0; index < lines.length; index += 1) {
      const source = lines[index]!;
      const translated = output.lines[index]!;
      if (Boolean(source.trim()) !== Boolean(translated.trim()) || hasDevanagari(translated)) return unavailable;
      if (hasDevanagari(source) && !/[\u0600-\u06FF]/.test(translated)) return unavailable;
      // Keep literal English terms and numeric values, including repeated occurrences.
      const tokens: string[] = source.match(/[A-Za-z][A-Za-z0-9._/-]*|[+-]?\d+(?:[.,]\d+)*/g) ?? [];
      const remaining: string[] = translated.match(/[A-Za-z][A-Za-z0-9._/-]*|[+-]?\d+(?:[.,]\d+)*/g) ?? [];
      for (const token of tokens) {
        const position = remaining.indexOf(token);
        if (position < 0) return unavailable;
        remaining.splice(position, 1);
      }
      if (remaining.length > 0) return unavailable;
      const sourceNegations = source.match(/नहीं|نہیں/g)?.length ?? 0;
      const translatedNegations = translated.match(/نہیں|نہ/g)?.length ?? 0;
      if (sourceNegations > translatedNegations) return unavailable;
      if (!source.trim()) output.lines[index] = source;
    }
    return { ok: true, transcript: output.lines.join("\n") };
  } catch {
    return unavailable;
  }
}
