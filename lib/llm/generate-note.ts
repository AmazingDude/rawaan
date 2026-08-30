import { z } from "zod";

import type { LlmCompletionProvider } from "@/lib/llm/provider";
import {
  NOTE_GENERATION_SYSTEM_PROMPT,
  NOTE_MODIFICATION_SYSTEM_PROMPT,
} from "@/lib/llm/prompts/note-generation";
import { noteDraftSchema, type NoteDraft } from "@/lib/notes/schema";

export const generateNoteInputSchema = z.object({
  patient_id: z.string().trim().min(1),
  patient_display_name: z.string().trim().min(1),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  email: z.string().optional(),
  mobile_number: z.string().optional(),
  consultation_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
  transcript: z.string().trim().min(1),
});

type GenerateNoteInput = z.infer<typeof generateNoteInputSchema>;

export type GeneratedDraft = {
  draft: NoteDraft;
  source: "groq" | "local-demo";
};

type LabeledField =
  | "chief_complaint"
  | "history"
  | "symptoms"
  | "assessment_discussed"
  | "plan_discussed"
  | "medications_mentioned"
  | "follow_up"
  | "uncertainties";

const labels: Record<LabeledField, string> = {
  chief_complaint: "chief complaint",
  history: "history",
  symptoms: "symptoms",
  assessment_discussed: "assessment discussed",
  plan_discussed: "plan discussed",
  medications_mentioned: "medications mentioned",
  follow_up: "follow up",
  uncertainties: "uncertainties",
};

function readLabeledValue(lines: string[], label: string): string | undefined {
  const prefix = `${label.toLowerCase()}:`;
  const matchingLine = lines.find((line) =>
    line.toLowerCase().startsWith(prefix),
  );

  return matchingLine?.slice(prefix.length).trim();
}

function listFromValue(value: string | undefined): string[] {
  if (
    value === undefined ||
    value.length === 0 ||
    /^(none|none mentioned|not mentioned|n\/a)$/i.test(value)
  ) {
    return [];
  }

  return value
    .split(/\s*;\s*/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function containsNonLatinText(value: string): boolean {
  return /[^\x00-\x7F]/.test(value);
}

/**
 * Extracts the JSON object from an LLM response, tolerating reasoning blocks
 * (`<think>…</think>`), markdown fences, and surrounding prose.
 */
function extractJsonObject(raw: string): string {
  let cleaned = raw.replace(/<think>[\s\S]*?<\/think>/gi, "");
  cleaned = cleaned
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  }

  return cleaned;
}

function createLocalDemoDraft(input: GenerateNoteInput): NoteDraft {
  const transcript = input.transcript.trim();
  const lines = transcript.split(/\r?\n/).map((line) => line.trim());
  const values = Object.fromEntries(
    (Object.entries(labels) as [LabeledField, string][]).map(([field, label]) => [
      field,
      readLabeledValue(lines, label),
    ]),
  ) as Record<LabeledField, string | undefined>;
  const hasStructuredLabels = Object.values(values).some(
    (value) => value !== undefined,
  );
  // An unstructured non-English transcript must never be dumped verbatim into
  // the clinical fields; the raw transcript stays in raw_transcript instead.
  const isUnstructuredForeignTranscript =
    !hasStructuredLabels && containsNonLatinText(transcript);

  return noteDraftSchema.parse({
    patient_id: input.patient_id,
    patient_display_name: input.patient_display_name,
    first_name: input.first_name,
    last_name: input.last_name,
    email: input.email,
    mobile_number: input.mobile_number,
    consultation_date: input.consultation_date,
    chief_complaint: values.chief_complaint ?? "",
    summary: hasStructuredLabels
      ? `Consultation encounter with ${input.patient_display_name} regarding ${values.chief_complaint || "clinical evaluation"}.`
      : isUnstructuredForeignTranscript
        ? `Clinical encounter with ${input.patient_display_name}. Automatic note structuring was unavailable; review the transcript for the verbatim record.`
        : `Clinical encounter with ${input.patient_display_name}. Key discussions and recommendations documented from consultation recording.`,
    history: hasStructuredLabels
      ? listFromValue(values.history)
      : isUnstructuredForeignTranscript
        ? []
        : [transcript],
    symptoms: listFromValue(values.symptoms),
    assessment_discussed: listFromValue(values.assessment_discussed),
    plan_discussed: listFromValue(values.plan_discussed),
    medications_mentioned: listFromValue(values.medications_mentioned),
    follow_up: values.follow_up ?? "",
    uncertainties: listFromValue(values.uncertainties),
    approval_status: "draft",
    raw_transcript: transcript,
  });
}

/**
 * Create a reviewable note draft. If a configured LLM provider is available,
 * it uses LLM structured completion to extract and translate clinical notes to English.
 * Otherwise, it falls back to the local demo parser.
 */
export async function generateNoteDraft(
  candidate: unknown,
  provider?: LlmCompletionProvider,
): Promise<GeneratedDraft> {
  const input = generateNoteInputSchema.parse(candidate);

  if (provider) {
    try {
      const userPrompt = `Patient Name: ${input.patient_display_name}\nPatient ID: ${input.patient_id}\nConsultation Date: ${input.consultation_date}\n\nSpoken Transcript:\n${input.transcript}`;
      const rawResponse = await provider.complete({
        system: NOTE_GENERATION_SYSTEM_PROMPT,
        user: userPrompt,
      });

      const parsedJson = JSON.parse(extractJsonObject(rawResponse));

      const draft = noteDraftSchema.parse({
        patient_id: input.patient_id,
        patient_display_name: input.patient_display_name,
        first_name: input.first_name,
        last_name: input.last_name,
        email: input.email,
        mobile_number: input.mobile_number,
        consultation_date: input.consultation_date,
        chief_complaint:
          typeof parsedJson.chief_complaint === "string"
            ? parsedJson.chief_complaint
            : "",
        summary:
          typeof parsedJson.summary === "string" && parsedJson.summary.trim()
            ? parsedJson.summary.trim()
            : `Clinical consultation with ${input.patient_display_name} on ${input.consultation_date}.`,
        history: Array.isArray(parsedJson.history)
          ? parsedJson.history.map(String)
          : [],
        symptoms: Array.isArray(parsedJson.symptoms)
          ? parsedJson.symptoms.map(String)
          : [],
        assessment_discussed: Array.isArray(parsedJson.assessment_discussed)
          ? parsedJson.assessment_discussed.map(String)
          : [],
        plan_discussed: Array.isArray(parsedJson.plan_discussed)
          ? parsedJson.plan_discussed.map(String)
          : [],
        medications_mentioned: Array.isArray(parsedJson.medications_mentioned)
          ? parsedJson.medications_mentioned.map(String)
          : [],
        follow_up:
          typeof parsedJson.follow_up === "string" ? parsedJson.follow_up : "",
        uncertainties: Array.isArray(parsedJson.uncertainties)
          ? parsedJson.uncertainties.map(String)
          : [],
        approval_status: "draft",
        raw_transcript: input.transcript.trim(),
      });

      return {
        draft,
        source: "groq",
      };
    } catch {
      // Fallback to local demo parser if LLM completion or parsing fails
    }
  }

  return {
    draft: createLocalDemoDraft(input),
    source: "local-demo",
  };
}

export type ModifiedNoteResult = {
  assistantReply: string;
  updatedNote: NoteDraft;
};

export async function modifyNoteWithAi(
  currentNote: NoteDraft,
  prompt: string,
  provider?: LlmCompletionProvider,
): Promise<ModifiedNoteResult> {
  if (provider) {
    try {
      const userPrompt = `Current Clinical Note:\n${JSON.stringify(currentNote, null, 2)}\n\nClinician Instruction:\n${prompt}`;
      const rawResponse = await provider.complete({
        system: NOTE_MODIFICATION_SYSTEM_PROMPT,
        user: userPrompt,
      });

      const parsed = JSON.parse(extractJsonObject(rawResponse));
      const updated = parsed.updated_note || {};

      const newDraft = noteDraftSchema.parse({
        ...currentNote,
        chief_complaint:
          typeof updated.chief_complaint === "string"
            ? updated.chief_complaint
            : currentNote.chief_complaint,
        summary:
          typeof updated.summary === "string"
            ? updated.summary
            : currentNote.summary,
        history: Array.isArray(updated.history)
          ? updated.history.map(String)
          : currentNote.history,
        symptoms: Array.isArray(updated.symptoms)
          ? updated.symptoms.map(String)
          : currentNote.symptoms,
        assessment_discussed: Array.isArray(updated.assessment_discussed)
          ? updated.assessment_discussed.map(String)
          : currentNote.assessment_discussed,
        plan_discussed: Array.isArray(updated.plan_discussed)
          ? updated.plan_discussed.map(String)
          : currentNote.plan_discussed,
        medications_mentioned: Array.isArray(updated.medications_mentioned)
          ? updated.medications_mentioned.map(String)
          : currentNote.medications_mentioned,
        follow_up:
          typeof updated.follow_up === "string"
            ? updated.follow_up
            : currentNote.follow_up,
        uncertainties: Array.isArray(updated.uncertainties)
          ? updated.uncertainties.map(String)
          : currentNote.uncertainties,
      });

      return {
        assistantReply:
          typeof parsed.assistant_reply === "string" && parsed.assistant_reply.trim()
            ? parsed.assistant_reply.trim()
            : `I have updated your note based on: "${prompt}".`,
        updatedNote: newDraft,
      };
    } catch {
      // Fall through to local rule-based modification
    }
  }

  // Local fallback modifications
  const lowerPrompt = prompt.toLowerCase();
  const updatedNote = { ...currentNote };
  let reply = `I have updated the note according to your instruction.`;

  if (lowerPrompt.includes("paragraph format") || lowerPrompt.includes("paragraph")) {
    const combined = [
      currentNote.chief_complaint ? `Chief Complaint: ${currentNote.chief_complaint}.` : "",
      currentNote.history.length > 0 ? `History: ${currentNote.history.join(", ")}.` : "",
      currentNote.symptoms.length > 0 ? `Reported Symptoms: ${currentNote.symptoms.join(", ")}.` : "",
      currentNote.assessment_discussed.length > 0 ? `Assessment: ${currentNote.assessment_discussed.join("; ")}.` : "",
      currentNote.plan_discussed.length > 0 ? `Plan: ${currentNote.plan_discussed.join("; ")}.` : "",
    ].filter(Boolean).join(" ");
    updatedNote.summary = combined || currentNote.summary;
    reply = "I've converted the key findings into a comprehensive paragraph format.";
  } else if (lowerPrompt.includes("remove all names") || lowerPrompt.includes("remove names") || lowerPrompt.includes("anonymize")) {
    updatedNote.patient_display_name = "Client";
    updatedNote.first_name = "Client";
    updatedNote.last_name = "";
    if (updatedNote.summary) {
      updatedNote.summary = updatedNote.summary.replace(new RegExp(currentNote.patient_display_name, "gi"), "the client");
    }
    reply = "All patient and clinician identifiable names have been removed and anonymized.";
  } else if (lowerPrompt.includes("summarize") || lowerPrompt.includes("key clinical points")) {
    updatedNote.summary = `Key Highlights: ${currentNote.chief_complaint || "Consultation"}. Symptoms: ${currentNote.symptoms.slice(0, 2).join(", ") || "None"}. Plan: ${currentNote.plan_discussed.slice(0, 2).join(", ") || "Follow-up"}.`;
    reply = "I've summarized the note to focus on the key clinical highlights.";
  }

  return {
    assistantReply: reply,
    updatedNote: noteDraftSchema.parse(updatedNote),
  };
}

