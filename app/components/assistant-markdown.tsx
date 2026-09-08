import Markdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import styles from "./assistant-markdown.module.css";

const components: Components = {
  a: ({ children, href }) => href
    ? <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>
    : <span>{children}</span>,
  // Generated image URLs must not initiate external requests from a clinical UI.
  img: () => null,
  table: ({ children }) => (
    <div className={styles.tableScroll} role="region" aria-label="Response table" tabIndex={0}>
      <table>{children}</table>
    </div>
  ),
};

export function AssistantMarkdown({ text, inline = false }: { text: string; inline?: boolean }) {
  const Wrapper = inline ? "span" : "div";
  return (
    <Wrapper className={styles.root} dir="auto">
      <Markdown remarkPlugins={[remarkGfm]} components={components} skipHtml
        allowedElements={inline ? ["strong", "em", "del", "code", "a", "br"] : undefined}
        unwrapDisallowed={inline}>
        {text}
      </Markdown>
    </Wrapper>
  );
}
