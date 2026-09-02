import { describe, expect, it } from "vitest";

import {
  devanagariToUrdu,
  hasDevanagari,
  sanitizeTranscript,
} from "@/lib/transcription/devanagari-to-urdu";

describe("Devanagari to Urdu script sanitizer", () => {
  it("detects Devanagari characters accurately", () => {
    expect(hasDevanagari("Hello world")).toBe(false);
    expect(hasDevanagari("یہ ایک اردو جملہ ہے۔")).toBe(false);
    expect(hasDevanagari("मुझे सीने में दर्द है।")).toBe(true);
    expect(hasDevanagari("अजय को प्रक्तों पनाश्च दिन से")).toBe(true);
  });

  it("transliterates Hindi Devanagari transcript to Urdu script", () => {
    const hindi = "अजय को प्रक्तों पनाश्च दिन से मिले लोर अब्डोमन में पेन नहीं था लेकर आजस्था इस्ता उता होता किया اب جب میں وہکر تو ہوں";
    const result = devanagariToUrdu(hindi);
    expect(hasDevanagari(result)).toBe(false);
    expect(result).toContain("عاشر");
    expect(result).toContain("لوئر");
    expect(result).toContain("ایبڈومن");
  });

  it("preserves English words mixed with Urdu", () => {
    const mixed = "I have a lot of pain in my body. سر میں درد ہے۔";
    const result = sanitizeTranscript(mixed);
    expect(result).toBe(mixed);
  });
});
