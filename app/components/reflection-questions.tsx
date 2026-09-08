"use client";

import { Check, Clipboard, Lightbulb } from "lucide-react";
import { useState } from "react";
import type { NoteDraft, ApprovedNote } from "@/lib/notes/schema";

type Note = NoteDraft | ApprovedNote;
type ReflectionPrompt = { question: string; source: string; context: string };

function deriveQuestions(note: Note): ReflectionPrompt[] {
  const prompts: ReflectionPrompt[] = [];
  if (note.follow_up.trim()) prompts.push({ question: "What progress was noted since the follow-up discussed?", source: "Follow-up discussed", context: note.follow_up });
  if (note.uncertainties.some((item) => item.trim())) prompts.push({ question: "What information could clarify the item marked for review?", source: "Items needing review", context: note.uncertainties.find((item) => item.trim()) ?? "" });
  if (note.plan_discussed.some((item) => item.trim())) prompts.push({ question: "What was the outcome of the actions discussed?", source: "Plan / next steps discussed", context: note.plan_discussed.filter((item) => item.trim()).slice(0, 2).join("; ") });
  if (note.symptoms.some((item) => item.trim())) prompts.push({ question: "How have the reported symptoms changed since this session?", source: "Symptoms", context: note.symptoms.filter((item) => item.trim()).slice(0, 2).join("; ") });
  if (note.assessment_discussed.some((item) => item.trim())) prompts.push({ question: "What has changed since this assessment was discussed?", source: "Assessment discussed", context: note.assessment_discussed.find((item) => item.trim()) ?? "" });
  return prompts.slice(0, 5);
}

export function ReflectionQuestions({ note }: { note: Note }) {
  const questions = deriveQuestions(note);
  const [copied, setCopied] = useState<string | null>(null);
  const [copyError, setCopyError] = useState<string | null>(null);

  async function copy(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
      setCopyError(null);
      window.setTimeout(() => setCopied(null), 1800);
    } catch {
      setCopyError("Could not copy. Check clipboard permissions.");
    }
  }

  return (
    <div className="reflection-questions-view">
      <div className="reflection-intro"><Lightbulb aria-hidden="true" size={18} /><p>Preparation prompts drawn from this note&apos;s recorded fields. They are questions for the clinician, not findings.</p></div>
      {questions.length ? (
        <>
          <div className="reflection-card-heading"><h3>Questions to consider</h3><button className="secondary-button" onClick={() => void copy(questions.map((item, index) => (index + 1) + ". " + item.question + " [" + item.source + "]").join("\n"), "all")} type="button">{copied === "all" ? <Check aria-hidden="true" size={14} /> : <Clipboard aria-hidden="true" size={14} />} Copy all</button></div>
          <ol className="reflection-list">
            {questions.map((item, index) => (
              <li className="reflection-item" key={item.source}>
                <span className="reflection-number">{index + 1}</span>
                <div className="reflection-question-content"><p className="reflection-text">{item.question}</p><p className="reflection-source">{item.source}: {item.context}</p></div>
                <button aria-label={"Copy question " + (index + 1)} className="reflection-copy" onClick={() => void copy(item.question, item.source)} type="button">{copied === item.source ? <Check aria-hidden="true" size={15} /> : <Clipboard aria-hidden="true" size={15} />}</button>
              </li>
            ))}
          </ol>
        </>
      ) : <p className="reflection-empty">No prompts can be drawn from the fields recorded in this note.</p>}
      {copyError ? <p role="alert">{copyError}</p> : null}
    </div>
  );
}
