/**
 * Legacy import path retained for callers that display transcripts. Automatic
 * script conversion is disabled because it can change names, negation, and
 * other clinical meaning. Preserve the ASR text until a clinician edits it.
 */

const DEVANAGARI_REGEX = /[\u0900-\u097F]/;

export function hasDevanagari(text: string): boolean {
  return DEVANAGARI_REGEX.test(text);
}

/** @deprecated Retained as an identity function to avoid rewriting clinical text. */
export function devanagariToUrdu(text: string): string {
  return text;
}

/** Legacy identity helper; it intentionally preserves the raw transcript. */
export function sanitizeTranscript(rawTranscript: string): string {
  return rawTranscript;
}
