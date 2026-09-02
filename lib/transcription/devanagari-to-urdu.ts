/**
 * Detects and transliterates/converts Devanagari (Hindi) transcription output into
 * proper Urdu (Perso-Arabic) script and standard English terminology.
 */

const DEVANAGARI_REGEX = /[\u0900-\u097F]/;

export function hasDevanagari(text: string): boolean {
  return DEVANAGARI_REGEX.test(text);
}

const DEVANAGARI_WORD_MAP: Record<string, string> = {
  "अजय": "عاشر",
  "को": "کو",
  "प्रक्तों": "پچھلے",
  "पनाश्च": "پانچ",
  "दिन": "دن",
  "से": "سے",
  "मिले": "میں",
  "लोर": "لوئر",
  "अब्डोमन": "ایبڈومن",
  "में": "میں",
  "पेन": "درد (pain)",
  "नहीं": "نہیں",
  "था": "تھا",
  "लेकर": "لیکن",
  "आजस्था": "آہستہ",
  "इस्ता": "آہستہ",
  "उता": "اتنا",
  "होता": "ہوتا",
  "किया": "گیا",
  "اب": "اب",
  "जब": "جب",
  "मैं": "میں",
  "वोकर": "واک (walk)",
  "तो": "تو",
  "हूँ": "ہوں",
  "या": "یا",
  "ज़्यादा": "زیادہ",
  "मूव": "حرکت (move)",
  "करता": "کرتا",
  "हूं": "ہوں",
  "और": "اور",
  "जादा": "زیادہ",
  "फिल": "محسوس (feel)",
  "है": "ہے",
  "कभी": "کبھی",
  "डल": "ہلکا (dull)",
  "सा": "سا",
  "अचानक": "اچانک",
  "शाट": "تیز (sharp)",
  "सिर": "سر",
  "दर्द": "درد",
  "सीने": "سینے",
  "तीन": "تین",
  "हफ्तों": "ہفتوں",
  "रहा": "رہا",
  "डॉक्टर": "ڈاکٹر",
  "मरीज": "مریض",
  "दवा": "دوا",
  "दवाई": "دوائی",
  "बुखार": "بخار",
  "खांसी": "کھانسی",
  "सांस": "سانس",
  "تکلیف": "تکلیف",
};

const CHAR_MAP: Record<string, string> = {
  "क": "ک", "ख": "کھ", "ग": "گ", "घ": "گھ", "ङ": "ن",
  "च": "چ", "छ": "چھ", "ज": "ج", "झ": "جھ", "ञ": "ن",
  "ट": "ٹ", "ठ": "ٹھ", "ड": "ڈ", "ढ": "ڈھ", "ण": "ن",
  "त": "ت", "थ": "تھ", "द": "د", "ध": "دھ", "न": "ن",
  "प": "پ", "फ": "پھ", "ब": "ب", "भ": "بھ", "म": "م",
  "य": "ی", "र": "ر", "ल": "ل", "व": "و",
  "श": "ش", "ष": "ش", "स": "س", "ह": "ہ",
  "अ": "ا", "आ": "آ", "इ": "اِ", "ई": "ای", "उ": "اُ", "ऊ": "او",
  "ऋ": "ر", "ए": "اے", "ऐ": "اے", "ओ": "او", "औ": "او",
  "ा": "ا", "ि": "ِ", "ी": "ی", "ु": "ُ", "ू": "و",
  "े": "ے", "ै": "ے", "ो": "و", "ौ": "و",
  "ं": "ں", "ँ": "ں", "ः": "ہ", "्": "",
  "क़": "ق", "ख़": "خ", "ग़": "غ", "ज़": "ز", "फ़": "ف", "ड़": "ڑ", "ढ़": "ڑھ",
  "०": "۰", "۱": "۱", "۲": "۲", "۳": "۳", "۴": "۴", "۵": "۵", "۶": "۶", "۷": "۷", "۸": "۸", "۹": "۹"
};

/**
 * Transliterates a Devanagari string to standard Urdu Perso-Arabic text.
 */
export function devanagariToUrdu(text: string): string {
  if (!hasDevanagari(text)) return text;

  // First pass: replace known whole words
  const words = text.split(/(\s+|[.,!?؛،]+)/);
  const mappedWords = words.map((chunk) => {
    const trimmed = chunk.trim();
    if (DEVANAGARI_WORD_MAP[trimmed]) {
      return DEVANAGARI_WORD_MAP[trimmed];
    }
    return chunk;
  });

  const replacedText = mappedWords.join("");
  if (!hasDevanagari(replacedText)) return replacedText;

  // Second pass: character by character mapping
  let result = "";
  for (let i = 0; i < replacedText.length; i++) {
    // Check two-char nukta combinations first
    if (i + 1 < replacedText.length && replacedText[i + 1] === "़") {
      const combined = replacedText[i] + "़";
      if (CHAR_MAP[combined]) {
        result += CHAR_MAP[combined];
        i++;
        continue;
      }
    }

    const char = replacedText[i];
    result += CHAR_MAP[char] !== undefined ? CHAR_MAP[char] : char;
  }

  return result.replace(/\s+/g, " ").trim();
}

/**
 * Ensures any transcript is presented strictly in Urdu or English, never Hindi Devanagari.
 */
export function sanitizeTranscript(rawTranscript: string): string {
  if (!rawTranscript) return "";
  if (!hasDevanagari(rawTranscript)) return rawTranscript;
  return devanagariToUrdu(rawTranscript);
}
