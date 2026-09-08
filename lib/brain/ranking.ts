import type { EvidenceNote } from "@/lib/brain/types";
import type { ApprovedNote } from "@/lib/notes/schema";

export const RELEVANCE_THRESHOLD = 0.25;

const STOP_WORDS = new Set([
  "has", "have", "the", "a", "an", "is", "was", "been", "before", "this",
  "that", "patient", "she", "he", "they", "their", "any", "ever", "mentioned",
  "reported", "did", "does", "what", "of", "in", "on", "with", "for", "to", "and", "i",
  // Conversational filler common in Brain questions; these dilute scores.
  "were", "are", "documented", "visit", "visits", "recall", "summarize", "tell",
  "detail", "details", "please", "more", "elaborate", "explain", "follow",
  // Common Urdu function words; clinical content terms remain searchable.
  "کیا", "کو", "کی", "کا", "کے", "میں", "سے", "تھا", "تھی", "تھے",
  "ہے", "ہیں", "اور", "نے", "یہ", "وہ", "اس", "ان", "پر", "ایک",
  "مریض", "کبھی", "کوئی",
]);

function tokenize(text: string): string[] {
  return text
    .normalize("NFKC")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) =>
      (token.length > 1 || /^\p{N}+$/u.test(token)) && !STOP_WORDS.has(token),
    );
}

function noteText(note: ApprovedNote): string {
  return [
    note.summary || "",
    note.chief_complaint,
    ...note.history,
    ...note.symptoms,
    ...note.assessment_discussed,
    ...note.plan_discussed,
    ...note.medications_mentioned,
    note.follow_up,
    ...note.uncertainties,
    note.raw_transcript,
  ].join("\n");
}

function extractExcerpts(
  note: ApprovedNote,
  terms: Set<string>,
  intentMatches: string[],
): string[] {
  const structuredFields = [
    ...(note.summary ? [["Summary", note.summary] as const] : []),
    ...(note.chief_complaint ? [["Chief complaint", note.chief_complaint] as const] : []),
    ...note.history.map((value) => ["History", value] as const),
    ...note.symptoms.map((value) => ["Symptoms", value] as const),
    ...note.assessment_discussed.map((value) => ["Assessment discussed", value] as const),
    ...note.plan_discussed.map((value) => ["Plan discussed", value] as const),
    ...note.medications_mentioned.map((value) => ["Medications mentioned", value] as const),
    ...(note.follow_up ? [["Follow-up", note.follow_up] as const] : []),
    ...note.uncertainties.map((value) => ["Uncertainty", value] as const),
  ].map(([label, value]) => `${label}: ${value}`);
  const transcriptSentences = note.raw_transcript.split(/(?<=[.!?])\s+/);
  const matches = [...structuredFields, ...transcriptSentences].filter((sentence) =>
    tokenize(sentence).some((token) => terms.has(token)),
  );
  return [...new Set([...intentMatches, ...matches.slice(0, 3)])].slice(0, 6);
}

// Lexical matching alone cannot answer "What symptoms were reported?" — the
// structured symptoms entries ("Lower abdominal pain") do not contain the
// literal word "symptoms". Map a question's clinical intent to the structured
// field that holds the answer. Only fires when the note actually has content
// for that field, so questions about undocumented facts still decline.
const FIELD_INTENTS: Array<{
  pattern: RegExp;
  label: string;
  pick: (note: ApprovedNote) => string[];
}> = [
  { pattern: /\bsymptoms?\b/i, label: "Symptoms", pick: (note) => note.symptoms },
  {
    pattern: /\b(medications?|medicines?|drugs?|prescri\w*)\b/i,
    label: "Medications mentioned",
    pick: (note) => note.medications_mentioned,
  },
  { pattern: /\b(plan|treatment|manag\w*)\b/i, label: "Plan discussed", pick: (note) => note.plan_discussed },
  {
    pattern: /\bfollow[- ]?up\b/i,
    label: "Follow-up",
    pick: (note) => (note.follow_up ? [note.follow_up] : []),
  },
  { pattern: /\bhistory\b/i, label: "History", pick: (note) => note.history },
  {
    // Deliberately excludes "diagnos*": "diagnosed with diabetes?" asks
    // about a specific condition, not the assessment category, and must
    // decline when that condition is undocumented (adversarial money shot).
    pattern: /\b(assessment|impression)\b/i,
    label: "Assessment discussed",
    pick: (note) => note.assessment_discussed,
  },
  {
    pattern: /\b(chief complaint|complaint|summary|summarize|overview)\b/i,
    label: "Summary",
    pick: (note) =>
      [note.summary, note.chief_complaint].filter(Boolean) as string[],
  },
];

function intentMatchesFor(note: ApprovedNote, question: string): string[] {
  return FIELD_INTENTS.filter(({ pattern }) => pattern.test(question)).flatMap(
    ({ pick, label }) => pick(note).filter((value) => value.trim()).map((value) => `${label}: ${value}`),
  );
}

// A patient's own name appears in nearly every sentence of a realistic
// transcript, so it acts as a near-universal lexical match and lets short
// absent-fact questions cross the relevance threshold on a name-only match.
// Exclude name/ID tokens from scoring so a note must match on clinical content.
function nameTokens(note: ApprovedNote): Set<string> {
  return new Set([
    ...tokenize(note.patient_display_name),
    ...tokenize(note.patient_id),
  ]);
}

export function rankNotes(
  notes: ApprovedNote[],
  question: string,
): EvidenceNote[] {
  const allQuestionTerms = tokenize(question);
  if (allQuestionTerms.length === 0) return [];

  return notes
    .map((note) => {
      const excluded = nameTokens(note);
      const questionTerms = new Set(
        allQuestionTerms.filter((term) => !excluded.has(term)),
      );
      if (questionTerms.size === 0) {
        return { note, score: 0, termsMatched: new Set<string>() };
      }
      const tokens = tokenize(noteText(note)).filter(
        (token) => !excluded.has(token),
      );
      if (tokens.length === 0) {
        return { note, score: 0, termsMatched: new Set<string>() };
      }
      const uniqueTokens = new Set(tokens);
      const numericQuestionTerms = [...questionTerms].filter((term) => /^\p{N}+$/u.test(term));
      if (numericQuestionTerms.some((term) => !uniqueTokens.has(term))) {
        return { note, score: 0, termsMatched: new Set<string>() };
      }
      let matched = 0;
      const termsMatched = new Set<string>();
      for (const term of questionTerms) {
        if (uniqueTokens.has(term)) {
          matched += 1;
          termsMatched.add(term);
        }
      }
      return { note, score: matched / questionTerms.size, termsMatched };
    })
    .map(({ note, score, termsMatched }) => {
      const intentMatches = intentMatchesFor(note, question);
      // A note that has content in the field the question asks about is
      // relevant even when the lexical score is weak.
      const effectiveScore =
        intentMatches.length > 0 ? Math.max(score, RELEVANCE_THRESHOLD) : score;
      return { intentMatches, note, score: effectiveScore, termsMatched };
    })
    .filter(({ score }) => score >= RELEVANCE_THRESHOLD)
    .sort((a, b) => b.score - a.score)
    .map(({ note, score, termsMatched, intentMatches }) => ({
      noteId: note.id,
      patientId: note.patient_id,
      consultationDate: note.consultation_date,
      excerpts: extractExcerpts(note, termsMatched, intentMatches),
      relevanceScore: Number(score.toFixed(4)),
    }));
}
