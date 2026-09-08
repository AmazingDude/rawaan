import { z } from "zod";

import type { LlmCompletionProvider } from "@/lib/llm/provider";
import {
  NOTE_GENERATION_SYSTEM_PROMPT,
  NOTE_MODIFICATION_SYSTEM_PROMPT,
} from "@/lib/llm/prompts/note-generation";
import {
  noteDraftSchema,
  consultationDateSchema,
  sessionInfoSchema,
  type ApprovedNote,
  type NoteDraft,
} from "@/lib/notes/schema";

export const generateNoteInputSchema = z.object({
  patient_id: z.string().trim().min(1),
  patient_display_name: z.string().trim().min(1),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  email: z.string().optional(),
  mobile_number: z.string().optional(),
  consultation_date: consultationDateSchema,
  transcript: z.string().trim().min(1),
  session_info: sessionInfoSchema.optional(),
});

type GenerateNoteInput = z.infer<typeof generateNoteInputSchema>;

export type GeneratedDraft = {
  draft: NoteDraft;
  source: "groq" | "local-demo";
};

type LabeledField =
  | "summary"
  | "chief_complaint"
  | "history"
  | "symptoms"
  | "assessment_discussed"
  | "plan_discussed"
  | "medications_mentioned"
  | "follow_up"
  | "uncertainties";

const labels: Record<LabeledField, string> = {
  summary: "summary",
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

/**
 * Extracts the JSON object from an LLM response, tolerating reasoning blocks
 * (`<think>…</think>`), markdown fences, and surrounding prose.
 */
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
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  }

  return cleaned;
}

function containsNonLatinText(value: string): boolean {
  return /[^\x00-\x7F]/.test(value);
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
    summary: values.summary?.trim() ?? "",
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
    session_info: input.session_info,
  });
}

function recordedFactsSummary(note: NoteDraft | ApprovedNote): string {
  const sections = [
    note.summary ? `Existing summary: ${note.summary}` : "",
    note.chief_complaint ? `Chief complaint: ${note.chief_complaint}` : "",
    ...note.history.map((item) => `History: ${item}`),
    ...note.symptoms.map((item) => `Symptoms: ${item}`),
    ...note.assessment_discussed.map((item) => `Assessment discussed: ${item}`),
    ...note.plan_discussed.map((item) => `Plan discussed: ${item}`),
    ...note.medications_mentioned.map((item) => `Medications mentioned: ${item}`),
    note.follow_up ? `Follow-up: ${note.follow_up}` : "",
    ...note.uncertainties.map((item) => `Uncertainty: ${item}`),
  ];

  return sections.filter(Boolean).join(" ");
}

function unchangedEditReply(prompt: string): string {
  if (/\b(remove|delete|redact|anonymi[sz]e)\b/i.test(prompt)) {
    return "I cannot safely remove every identifier from the note and transcript. No changes were made.";
  }

  return "AI editing is unavailable for this instruction. The note was left unchanged.";
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
            : "",
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
        session_info: input.session_info,
      });

      return {
        draft,
        source: "groq",
      };
    } catch {
      console.error("[generateNoteDraft] Structured generation failed; using transcript-only fallback.");
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
  updatedNote: NoteDraft | ApprovedNote;
};

export async function modifyNoteWithAi<T extends NoteDraft | ApprovedNote>(
  currentNote: T,
  prompt: string,
  provider?: LlmCompletionProvider,
): Promise<{ assistantReply: string; updatedNote: T }> {
  // The editable note includes contact fields and the original transcript.
  // Partial name substitutions cannot support a complete anonymization claim.
  if (/\b(remove|delete|redact|anonymi[sz]e)\b/i.test(prompt)) {
    return { assistantReply: unchangedEditReply(prompt), updatedNote: currentNote };
  }

  if (provider) {
    try {
      const userPrompt = `Current Clinical Note:\n${JSON.stringify(currentNote, null, 2)}\n\nClinician Instruction:\n${prompt}`;
      const rawResponse = await provider.complete({
        system: NOTE_MODIFICATION_SYSTEM_PROMPT,
        user: userPrompt,
      });

      const parsed = JSON.parse(extractJsonObject(rawResponse));
      const updated = parsed.updated_note || {};

      const newDraft: T = {
        ...currentNote,
        patient_display_name:
          typeof updated.patient_display_name === "string" && updated.patient_display_name.trim()
            ? updated.patient_display_name.trim()
            : currentNote.patient_display_name,
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
      };

      const hasChanges = JSON.stringify(newDraft) !== JSON.stringify(currentNote);

      return {
        assistantReply: hasChanges
          ? typeof parsed.assistant_reply === "string" && parsed.assistant_reply.trim()
            ? parsed.assistant_reply.trim()
            : "The note was updated using the provider response."
          : "No note changes were returned. The note was left unchanged.",
        updatedNote: newDraft,
      };
    } catch {
      // Fall through to local rule-based modification
    }
  }

  // Local fallback modifications
  const lowerPrompt = prompt.toLowerCase();
  const updatedNote: T = { ...currentNote };
  let reply = unchangedEditReply(prompt);

  if (lowerPrompt.includes("paragraph format") || lowerPrompt.includes("paragraph")) {
    const combined = recordedFactsSummary(currentNote);
    if (combined) {
      updatedNote.summary = combined;
      reply = combined === currentNote.summary
        ? "The summary already contains the available recorded details; the note was left unchanged."
        : "AI editing was unavailable, so I formatted only recorded note fields and preserved all source details.";
    } else {
      reply = "AI editing was unavailable and there are no recorded clinical details to format; the note was left unchanged.";
    }
  } else if (lowerPrompt.includes("summarize") || lowerPrompt.includes("key clinical points") || lowerPrompt.includes("key points")) {
    const summary = recordedFactsSummary(currentNote);
    if (summary) {
      updatedNote.summary = summary;
      reply = summary === currentNote.summary
        ? "The summary already contains the available recorded details; the note was left unchanged."
        : "AI editing was unavailable, so I summarized only recorded note fields and preserved all details and uncertainties.";
    } else {
      reply = "AI editing was unavailable and there are no recorded clinical details to summarize; the note was left unchanged.";
    }
  }


  return {
    assistantReply: reply,
    updatedNote,
  };
}


