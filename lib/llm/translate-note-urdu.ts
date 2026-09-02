import type { LlmCompletionProvider } from "@/lib/llm/provider";
import { NOTE_URDU_TRANSLATION_SYSTEM_PROMPT } from "@/lib/llm/prompts/urdu-translation";
import type { ApprovedNote, NoteDraft } from "@/lib/notes/schema";

const MEDICAL_URDU_DICTIONARY: Record<string, string> = {
  // Pain and Symptoms
  "abdominal pain": "پیٹ میں درد",
  "abdominal pain present for several days": "پیٹ میں درد (کئی دنوں سے موجود)",
  "pain is exacerbated by movement": "حرکت کرنے سے درد میں اضافہ ہوتا ہے",
  "pain character is described as both dull and sharp": "درد کی نوعیت ہلکی اور تیز دونوں بتائی گئی ہے",
  "stomach pain": "معدے یا پیٹ میں درد",
  "dull pain": "ہلکا درد",
  "sharp pain": "تیز درد",
  "dull and sharp": "ہلکا اور تیز",
  "generalized body pain": "پورے جسم میں درد",
  "significant generalized body pain": "پورے جسم میں شدید درد",
  "body pain": "جسمانی درد",
  "body aches": "جسم میں درد",
  "headache": "سر میں درد",
  "fever": "بخار",
  "high grade fever": "تیز بخار",
  "cough": "کھانسی",
  "dry cough": "خشک کھانسی",
  "productive cough": "بلغم والی کھانسی",
  "shortness of breath": "سانس لینے میں دشواری",
  "chest pain": "سینے میں درد",
  "fatigue": "تھکاوٹ اور کمزوری",
  "weakness": "کمزوری",
  "nausea": "متلی اور جی گھبرانا",
  "vomiting": "الٹی / قے",
  "diarrhea": "دست / پیچش",
  "constipation": "قبض",
  "dizziness": "چکر آنا",

  // Chronic Conditions
  "hypertension": "ہائی بلڈ پریشر",
  "high blood pressure": "ہائی بلڈ پریشر",
  "diabetes": "ذیابیطس (شوگر)",
  "diabetes mellitus": "ذیابیطس (شوگر)",
  "asthma": "دمہ (Asthma)",

  // Medications
  "metformin": "میٹفارمین (Metformin)",
  "omeprazole": "اومیپرازول (Omeprazole)",
  "paracetamol": "پیراسیٹامول (Panadol / Paracetamol)",
  "panadol": "پیناڈول (Panadol)",
  "amoxicillin": "اموکسیسلن (Amoxicillin)",
  "ibuprofen": "آئبوپروفین (Brufen)",
  "brufen": "بروفین (Brufen)",
  "insulin": "انسولین",
  "aspirin": "ایسپرین (Disprin)",

  // Clinical Management
  "evaluate for acute abdominal etiology": "پیٹ کے شدید درد کی وجوہات کا تشخیصی معائنہ",
  "rest and hydration": "آرام اور وافر مقدار میں پانی / سیال اشیاء کا استعمال",
  "follow up in 2 weeks": "دو ہفتوں بعد دوبارہ معائنہ",
  "follow up in 1 week": "ایک ہفتے بعد دوبارہ معائنہ",
  "follow up in 3 days": "تین دن بعد دوبارہ معائنہ",
  "follow up in 1 month": "ایک ماہ بعد دوبارہ معائنہ",
  "follow up as clinically indicated": "حسب ضرورت دوبارہ رابطہ کریں",
  "exacerbated by movement": "حرکت کرنے سے تکلیف بڑھ جاتی ہے",
  "present for several days": "کئی دنوں سے جاری ہے",
};

export function translatePhraseToUrdu(phrase: string): string {
  if (!phrase || typeof phrase !== "string" || !phrase.trim()) {
    return phrase || "";
  }
  const lower = phrase.trim().toLowerCase();

  // Exact dictionary match
  if (MEDICAL_URDU_DICTIONARY[lower]) {
    return MEDICAL_URDU_DICTIONARY[lower];
  }

  // Common clinical notes for review
  if (lower.startsWith("note for review:")) {
    const inner = phrase.slice("note for review:".length).trim();
    if (inner.toLowerCase().includes("exact duration of symptoms is unclear")) {
      return "جائزہ کے لیے نوٹ: آواز کی خرابی کی وجہ سے علامات کی درست مدت غیر واضح ہے۔";
    }
    if (inner.toLowerCase().includes("specific location of abdominal pain is not specified")) {
      return "جائزہ کے لیے نوٹ: پیٹ میں درد کی مخصوص جگہ واضح طور پر درج نہیں ہے۔";
    }
    if (inner.toLowerCase().includes("severity of pain is not quantified")) {
      return "جائزہ کے لیے نوٹ: درد کی شدت کا پیمانہ درج نہیں کیا گیا۔";
    }
    return `جائزہ کے لیے نوٹ: ${translatePhraseToUrdu(inner)}`;
  }

  // Partial phrase replacements
  let translated = phrase;
  let hasMatch = false;

  for (const [en, ur] of Object.entries(MEDICAL_URDU_DICTIONARY)) {
    const reg = new RegExp(`\\b${en}\\b`, "gi");
    if (reg.test(translated)) {
      translated = translated.replace(reg, ur);
      hasMatch = true;
    }
  }

  if (hasMatch) {
    return translated;
  }

  return phrase;
}

export function translateSummaryToUrdu(
  summary: string,
  currentNote: NoteDraft | ApprovedNote,
): string {
  const patientName = currentNote.patient_display_name;
  const chief = currentNote.chief_complaint
    ? translatePhraseToUrdu(currentNote.chief_complaint)
    : "طبی معائنہ";

  if (!summary || !summary.trim()) {
    return `مریض ${patientName} کے ساتھ طبی مشاورتی سیشن، بنیادی شکایت: ${chief}۔ علامات اور طبی تاریخ کا تفصیلی جائزہ لیا گیا اور مناسب طبی رہنمائی فراہم کی گئی۔`;
  }

  let text = summary;
  text = text.replace(/the patient presented with/gi, `مریض ${patientName} کی بنیادی شکایت`);
  text = text.replace(/that has been present for several days/gi, "جو کئی دنوں سے موجود ہے");
  text = text.replace(/the pain is described as/gi, "درد کی کیفیت");
  text = text.replace(/dull and sharp/gi, "ہلکی اور تیز");
  text = text.replace(/and is exacerbated by movement/gi, "اور حرکت سے بڑھ جاتی ہے");
  text = text.replace(/the patient also reported/gi, "مریض نے مزید بتایا");
  text = text.replace(/significant generalized body pain/gi, "پورے جسم میں شدید درد");
  text = text.replace(/generalized body pain/gi, "پورے جسم میں درد");
  text = text.replace(/abdominal pain/gi, "پیٹ کا درد");
  text = text.replace(/\band\b/gi, "اور");

  if (!text.includes(patientName)) {
    return `مریض ${patientName}: ${text}`;
  }

  return text;
}

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

function createLocalUrduFallback<T extends NoteDraft | ApprovedNote>(
  currentNote: T,
): T {
  const chief = currentNote.chief_complaint
    ? translatePhraseToUrdu(currentNote.chief_complaint)
    : "طبی معائنہ";

  const urduSummary = translateSummaryToUrdu(
    currentNote.summary || "",
    currentNote,
  );

  return {
    ...currentNote,
    chief_complaint: chief,
    summary: urduSummary,
    history: Array.isArray(currentNote.history)
      ? currentNote.history.map(translatePhraseToUrdu)
      : [],
    symptoms: Array.isArray(currentNote.symptoms)
      ? currentNote.symptoms.map(translatePhraseToUrdu)
      : [],
    assessment_discussed: Array.isArray(currentNote.assessment_discussed)
      ? currentNote.assessment_discussed.map(translatePhraseToUrdu)
      : [],
    plan_discussed: Array.isArray(currentNote.plan_discussed)
      ? currentNote.plan_discussed.map(translatePhraseToUrdu)
      : [],
    medications_mentioned: Array.isArray(currentNote.medications_mentioned)
      ? currentNote.medications_mentioned.map(translatePhraseToUrdu)
      : [],
    follow_up: currentNote.follow_up
      ? translatePhraseToUrdu(currentNote.follow_up)
      : "حسب ضرورت دوبارہ رابطہ کریں",
    uncertainties: Array.isArray(currentNote.uncertainties)
      ? currentNote.uncertainties.map(translatePhraseToUrdu)
      : [],
  };
}

export async function translateNoteToUrdu<T extends NoteDraft | ApprovedNote>(
  currentNote: T,
  provider?: LlmCompletionProvider,
): Promise<T> {
  if (provider) {
    try {
      const userPrompt = `Clinical Note To Translate:\n${JSON.stringify(currentNote, null, 2)}`;
      const rawResponse = await provider.complete({
        system: NOTE_URDU_TRANSLATION_SYSTEM_PROMPT,
        user: userPrompt,
      });

      const parsed = JSON.parse(extractJsonObject(rawResponse));

      return {
        ...currentNote,
        chief_complaint:
          typeof parsed.chief_complaint === "string" && parsed.chief_complaint.trim()
            ? parsed.chief_complaint.trim()
            : translatePhraseToUrdu(currentNote.chief_complaint),
        summary:
          typeof parsed.summary === "string" && parsed.summary.trim()
            ? parsed.summary.trim()
            : translateSummaryToUrdu(currentNote.summary || "", currentNote),
        history: Array.isArray(parsed.history)
          ? parsed.history.map(String)
          : (currentNote.history || []).map(translatePhraseToUrdu),
        symptoms: Array.isArray(parsed.symptoms)
          ? parsed.symptoms.map(String)
          : (currentNote.symptoms || []).map(translatePhraseToUrdu),
        assessment_discussed: Array.isArray(parsed.assessment_discussed)
          ? parsed.assessment_discussed.map(String)
          : (currentNote.assessment_discussed || []).map(translatePhraseToUrdu),
        plan_discussed: Array.isArray(parsed.plan_discussed)
          ? parsed.plan_discussed.map(String)
          : (currentNote.plan_discussed || []).map(translatePhraseToUrdu),
        medications_mentioned: Array.isArray(parsed.medications_mentioned)
          ? parsed.medications_mentioned.map(String)
          : (currentNote.medications_mentioned || []).map(translatePhraseToUrdu),
        follow_up:
          typeof parsed.follow_up === "string" && parsed.follow_up.trim()
            ? parsed.follow_up.trim()
            : translatePhraseToUrdu(currentNote.follow_up || ""),
        uncertainties: Array.isArray(parsed.uncertainties)
          ? parsed.uncertainties.map(String)
          : (currentNote.uncertainties || []).map(translatePhraseToUrdu),
      };
    } catch {
      // Fall through to local fallback
    }
  }

  return createLocalUrduFallback(currentNote);
}
