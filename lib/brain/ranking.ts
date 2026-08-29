import type { EvidenceNote } from "@/lib/brain/types";
import type { ApprovedNote } from "@/lib/notes/schema";

export const RELEVANCE_THRESHOLD = 0.25;

const STOP_WORDS = new Set([
  "has", "have", "the", "a", "an", "is", "was", "been", "before", "this",
  "that", "patient", "she", "he", "they", "their", "any", "ever", "mentioned",
  "reported", "did", "does", "what", "of", "in", "on", "with", "for", "to", "and", "i",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z\u00C0-\u024F]+/)
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token));
}

function noteText(note: ApprovedNote): string {
  return [
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

function extractExcerpts(note: ApprovedNote, terms: Set<string>): string[] {
  const sentences = note.raw_transcript.split(/(?<=[.!?])\s+/).concat(
    [...note.symptoms, ...note.history].map((entry) => `${entry}.`),
  );
  const matches = sentences.filter((sentence) =>
    tokenize(sentence).some((token) => terms.has(token)),
  );
  return matches.slice(0, 3);
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
    .filter(({ score }) => score >= RELEVANCE_THRESHOLD)
    .sort((a, b) => b.score - a.score)
    .map(({ note, score, termsMatched }) => ({
      noteId: note.id,
      patientId: note.patient_id,
      consultationDate: note.consultation_date,
      excerpts: extractExcerpts(note, termsMatched),
      relevanceScore: Number(score.toFixed(4)),
    }));
}
