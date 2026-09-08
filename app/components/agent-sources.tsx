import type { AgentSource } from "@/lib/agent/schema";

export function AgentSources({ sources, patientId }: { sources: AgentSource[]; patientId?: string }) {
  if (!sources.length) return null;
  return <div className="agent-sources"><h4>Sources</h4>{sources.map((source, index) => {
    const label = source.citation ? "[" + source.citation + "] " : "";
    if (source.kind === "web") return <a key={"web-" + index} href={source.url} target="_blank" rel="noopener noreferrer">{label}{source.title}</a>;
    const title = label + "Client note · " + source.consultationDate;
    return patientId ? <a key={"note-" + index} href={"/clients/" + encodeURIComponent(patientId) + "/sessions/" + encodeURIComponent(source.noteId)}>{title}</a> : <span key={"note-" + index}>{title}</span>;
  })}</div>;
}
