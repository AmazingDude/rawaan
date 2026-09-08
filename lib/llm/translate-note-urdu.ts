import { z } from "zod";

import type { LlmCompletionProvider } from "@/lib/llm/provider";
import { NOTE_URDU_TRANSLATION_SYSTEM_PROMPT } from "@/lib/llm/prompts/urdu-translation";
import type { ApprovedNote, NoteDraft } from "@/lib/notes/schema";

const translatedFieldsSchema = z.object({
  chief_complaint: z.string(),
  summary: z.string(),
  history: z.array(z.string()),
  symptoms: z.array(z.string()),
  assessment_discussed: z.array(z.string()),
  plan_discussed: z.array(z.string()),
  medications_mentioned: z.array(z.string()),
  follow_up: z.string(),
  uncertainties: z.array(z.string()),
}).strict();

export type UrduTranslationResult<T> =
  | { status: "translated"; note: T }
  | { status: "unavailable"; note: T; message: string };

const TRANSLATION_UNAVAILABLE_MESSAGE =
  "Urdu translation is unavailable; the original note was left unchanged.";

function extractJsonObject(raw: string): string {
  let cleaned = raw.replace(/<think>[\s\S]*?<\/think>/gi, "");
  if (cleaned.includes("<think>")) {
    cleaned = cleaned.replace(/<think>[\s\S]*$/gi, "");
  }
  cleaned = cleaned
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  return firstBrace !== -1 && lastBrace > firstBrace
    ? cleaned.slice(firstBrace, lastBrace + 1)
    : cleaned;
}

type TranslatedFields = z.infer<typeof translatedFieldsSchema>;

function preservesContentShape(
  currentNote: NoteDraft | ApprovedNote,
  translated: TranslatedFields,
): boolean {
  const sourceSummary = currentNote.summary ?? "";
  const stringsPreserveContent =
    Boolean(currentNote.chief_complaint.trim()) === Boolean(translated.chief_complaint.trim()) &&
    Boolean(sourceSummary.trim()) === Boolean(translated.summary.trim()) &&
    Boolean(currentNote.follow_up.trim()) === Boolean(translated.follow_up.trim());
  if (!stringsPreserveContent) return false;

  const arrays = [
    [currentNote.history, translated.history],
    [currentNote.symptoms, translated.symptoms],
    [currentNote.assessment_discussed, translated.assessment_discussed],
    [currentNote.plan_discussed, translated.plan_discussed],
    [currentNote.medications_mentioned, translated.medications_mentioned],
    [currentNote.uncertainties, translated.uncertainties],
  ] as const;

  return arrays.every(([before, after]) =>
    before.length === after.length && before.every((value, index) =>
      Boolean(value.trim()) === Boolean(after[index]?.trim()),
    ),
  );
}

function keepSourceEmptyText(source: string, translated: string): string {
  return source.trim() ? translated : source;
}

function keepSourceEmptyItems(source: string[], translated: string[]): string[] {
  return source.map((value, index) => value.trim() ? translated[index]! : value);
}

export async function translateNoteToUrdu<T extends NoteDraft | ApprovedNote>(
  currentNote: T,
  provider?: LlmCompletionProvider,
): Promise<UrduTranslationResult<T>> {
  if (!provider) {
    return {
      status: "unavailable",
      note: currentNote,
      message: TRANSLATION_UNAVAILABLE_MESSAGE,
    };
  }

  try {
    const rawResponse = await provider.complete({
      system: NOTE_URDU_TRANSLATION_SYSTEM_PROMPT,
      user: `Clinical Note To Translate:\n${JSON.stringify(currentNote, null, 2)}`,
    });
    const translated = translatedFieldsSchema.parse(
      JSON.parse(extractJsonObject(rawResponse)),
    );

    if (!preservesContentShape(currentNote, translated)) {
      return {
        status: "unavailable",
        note: currentNote,
        message: TRANSLATION_UNAVAILABLE_MESSAGE,
      };
    }

    return {
      status: "translated",
      note: {
        ...currentNote,
        chief_complaint: keepSourceEmptyText(currentNote.chief_complaint, translated.chief_complaint),
        summary: currentNote.summary === undefined
          ? undefined
          : keepSourceEmptyText(currentNote.summary, translated.summary),
        history: keepSourceEmptyItems(currentNote.history, translated.history),
        symptoms: keepSourceEmptyItems(currentNote.symptoms, translated.symptoms),
        assessment_discussed: keepSourceEmptyItems(currentNote.assessment_discussed, translated.assessment_discussed),
        plan_discussed: keepSourceEmptyItems(currentNote.plan_discussed, translated.plan_discussed),
        medications_mentioned: keepSourceEmptyItems(currentNote.medications_mentioned, translated.medications_mentioned),
        follow_up: keepSourceEmptyText(currentNote.follow_up, translated.follow_up),
        uncertainties: keepSourceEmptyItems(currentNote.uncertainties, translated.uncertainties),
      },
    };
  } catch {
    return {
      status: "unavailable",
      note: currentNote,
      message: TRANSLATION_UNAVAILABLE_MESSAGE,
    };
  }
}
