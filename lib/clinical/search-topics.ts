// Clinical searches use a fixed topic vocabulary, never free-text patient narratives.
const TOPICS = [
  "anxiety", "depression", "stress", "panic", "insomnia", "sleep", "headache", "migraine",
  "chest pain", "shortness of breath", "cough", "fever", "fatigue", "dizziness", "fainting",
  "abdominal pain", "nausea", "vomiting", "diarrhea", "constipation", "back pain", "joint pain",
  "rash", "itching", "allergy", "allergies", "asthma", "hypertension", "diabetes", "infection",
  "pregnancy", "kidney disease", "liver disease", "thyroid", "anemia", "seizure", "stroke",
  "trauma", "ptsd", "adhd", "ocd", "bipolar", "psychosis", "suicide", "self harm",
  "urinary", "dysuria", "bleeding", "weight loss", "obesity", "arthritis", "palpitations",
  "warfarin", "metformin", "insulin", "paracetamol", "ibuprofen", "antibiotic", "antidepressant",
] as const;
export function clinicalSearchQuery(topic: string): string {
  const normalized = topic.toLowerCase().replace(/[^a-z ]/g, " ");
  const matched = TOPICS.filter(term => new RegExp("\\b" + term + "\\b").test(normalized)).slice(0, 6);
  return [...matched, "clinical evaluation treatment guideline"].join(" ");
}
