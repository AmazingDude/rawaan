import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AssistantMarkdown } from "@/app/components/assistant-markdown";

const fixture = readFileSync(new URL("../data/seed/assistant-formatting.md", import.meta.url), "utf8");
const render = (text: string) => renderToStaticMarkup(createElement(AssistantMarkdown, { text }));

describe("AI answer formatting", () => {
  it("renders real headings, emphasis, lists, tables, quotes and code without changing citations", () => {
    const html = render(fixture);
    expect(html).toContain("<h2>Training example: review workflow</h2>");
    expect(html).toContain("<strong>fictional training content</strong>");
    expect(html).toContain("<em>emphasis</em>");
    expect(html).toContain("<ul>");
    expect(html).toContain("<ol>");
    expect(html).toContain("<table>");
    expect(html).toContain("<blockquote>");
    expect(html).toContain("<code>sample code</code>");
    expect(html).toContain("<pre>");
    expect(html).toContain("[N1]");
    expect(html).toContain("<strong>ریکارڈ کا جائزہ</strong>");
    expect(html).not.toContain("**fictional training content**");
  });

  it("ignores injected HTML and blocks active URLs and remote images", () => {
    const html = render('<script>alert(1)</script>\n\n<img src="https://example.com/tracker" onerror="alert(1)">\n\n[bad](javascript:alert%281%29)\n\n![tracking](https://example.com/pixel.png)');
    expect(html).not.toMatch(/<script|<img|onerror=|javascript:|pixel\.png/);
  });

  it("keeps safe references usable with a protected new tab", () => {
    const html = render("[reference](https://example.com/reference)");
    expect(html).toContain('href="https://example.com/reference"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it("formats inline clinical titles without injecting block elements into headings", () => {
    const html = renderToStaticMarkup(createElement(AssistantMarkdown, { text: "**Review** the *record*", inline: true }));
    expect(html).toContain("<strong>Review</strong>");
    expect(html).toContain("<em>record</em>");
    expect(html).not.toMatch(/<p>|<div|<h[1-6]/);
  });
});
