import type { QuerySafetyResult } from "@/lib/brain/types";

const REFUSAL_MESSAGE =
  "This tool only retrieves documented patient history and does not provide general medical or treatment advice.";

const TREATMENT_PATTERNS = [
  /\bwhat (medication|medicine|drug|dose|dosage)\b/i,
  /\b(prescribe|prescription|titrate)\b/i,
  /\bshould we (prescribe|give|administer)\b/i,
  /\b(start|switch|stop) (the )?(patient )?on\b/i,
];

const GENERAL_MEDICAL_PATTERNS = [
  /\bstandard treatment\b/i,
  /\bfirst[- ]line\b/i,
  /\bwhat causes\b/i,
  /\bside effects?\b/i,
  /\btypical (dose|dosage)\b/i,
  /\bhow (is|are|do(es)?|can)\b.*\btreat(ed|ment)?\b/i,
];

export function classifyQuerySafety(rawQuestion: string): QuerySafetyResult {
  const normalizedQuestion = rawQuestion.trim();

  if (TREATMENT_PATTERNS.some((pattern) => pattern.test(normalizedQuestion))) {
    return { kind: "refused", reason: "treatment_or_medication", message: REFUSAL_MESSAGE };
  }

  if (GENERAL_MEDICAL_PATTERNS.some((pattern) => pattern.test(normalizedQuestion))) {
    return { kind: "refused", reason: "general_medical", message: REFUSAL_MESSAGE };
  }

  return { kind: "record_query", normalizedQuestion };
}
