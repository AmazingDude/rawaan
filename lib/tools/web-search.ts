import { z } from "zod";
import { publicUrlSchema } from "@/lib/agent/schema";

export const CLINICAL_SOURCE_DOMAINS = ["nhs.uk", "nice.org.uk", "cdc.gov", "who.int", "fda.gov", "dailymed.nlm.nih.gov", "drap.gov.pk"];
export type WebResult = { title: string; url: string; content: string };
export interface WebSearchTool { search(query: string, clinical: boolean): Promise<WebResult[]>; }
const responseSchema = z.object({ results: z.array(z.object({ title: z.string(), url: z.string(), content: z.string() })) });
export function isClinicalSource(url: string): boolean {
  const hostname = new URL(url).hostname;
  return CLINICAL_SOURCE_DOMAINS.some(domain => hostname === domain || hostname.endsWith("." + domain));
}
export function createTavilySearch(apiKey: string): WebSearchTool {
  return { async search(query, clinical) {
    if (!apiKey.trim()) throw new Error("Web search is not configured.");
    const response = await fetch("https://api.tavily.com/search", {
      method: "POST", headers: { Authorization: "Bearer " + apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({ query, search_depth: "basic", max_results: 5, include_answer: false, include_raw_content: false,
        ...(clinical ? { include_domains: CLINICAL_SOURCE_DOMAINS } : {}) }),
      signal: AbortSignal.timeout(15000), cache: "no-store",
    });
    if (!response.ok) throw new Error("Web search is unavailable.");
    const payload = responseSchema.parse(await response.json());
    return payload.results.filter(result => publicUrlSchema.safeParse(result.url).success && (!clinical || isClinicalSource(result.url)))
      .slice(0, 5).map(result => ({ title: result.title.slice(0, 300), url: result.url, content: result.content.slice(0, 4000) }));
  } };
}
