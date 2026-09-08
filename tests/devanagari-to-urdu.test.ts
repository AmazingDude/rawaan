import { describe, expect, it } from "vitest";

import {
  devanagariToUrdu,
  hasDevanagari,
  sanitizeTranscript,
} from "@/lib/transcription/devanagari-to-urdu";

describe("transcript preservation helpers", () => {
  it("detects Devanagari characters without changing the input", () => {
    expect(hasDevanagari("Hello world")).toBe(false);
    expect(hasDevanagari("یہ ایک اردو جملہ ہے۔")).toBe(false);
    expect(hasDevanagari("मुझे सीने में दर्द है।")).toBe(true);
  });

  it("preserves names, verbs, negation, and Devanagari digits verbatim", () => {
    const transcript = "अजय ने दवा नहीं ली; उसने दर्द बताया ०१२३४५६७८९";

    expect(devanagariToUrdu(transcript)).toBe(transcript);
    expect(sanitizeTranscript(transcript)).toBe(transcript);
  });

  it("preserves mixed English and Urdu without normalizing whitespace", () => {
    const mixed = "I have a lot of pain in my body. سر میں درد ہے۔";

    expect(sanitizeTranscript(mixed)).toBe(mixed);
    expect(sanitizeTranscript("  " + mixed + "  ")).toBe("  " + mixed + "  ");
  });
});
