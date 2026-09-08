// A search provider receives topic queries, never raw clinical narratives.
export function containsSensitiveSearchData(text: string): boolean {
  return /\b(?:patient|client|consultation|medical history|my (?:symptoms|diagnosis|medications?|address)|lives? at|address|phone|email|date of birth|born on)\b/i.test(text) ||
    /[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/.test(text) ||
    /\b\d{4}[-/]\d{1,2}[-/]\d{1,2}\b|\+?\d[\d ().-]{7,}\d/.test(text) ||
    /\b\d+\s+\w+(?:\s+\w+)?\s+(?:road|street|avenue|lane|rd|st)\b/i.test(text) ||
    /(?:مریض|پتہ|فون|شناخت)/.test(text);
}
