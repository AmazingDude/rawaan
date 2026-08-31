import { Lightbulb } from "lucide-react";
import type { NoteDraft, ApprovedNote } from "@/lib/notes/schema";

type Note = NoteDraft | ApprovedNote;

interface ReflectionQuestionsProps {
  note: Note;
}

function deriveQuestions(note: Note): string[] {
  const questions: string[] = [];

  if (note.follow_up) {
    questions.push(`How did the patient progress on the follow-up plan: "${note.follow_up}"?`);
  }

  if (note.uncertainties.length > 0) {
    questions.push(
      `What additional information would resolve the open question: "${note.uncertainties[0]}"?`,
    );
  }

  if (note.plan_discussed.length > 0) {
    questions.push(
      `Which of the discussed actions (${note.plan_discussed.slice(0, 2).join("; ")}) had the biggest impact?`,
    );
  }

  if (note.symptoms.length > 0) {
    questions.push(
      `Have the reported symptoms (${note.symptoms.slice(0, 2).join("; ")}) changed in frequency or intensity?`,
    );
  }

  if (note.assessment_discussed.length > 0) {
    questions.push(
      `Does today's clinical picture still align with the previous assessment: "${note.assessment_discussed[0]}"?`,
    );
  }

  if (questions.length === 0) {
    questions.push("What was the most important theme from this session?");
    questions.push("What should be revisited in the next consultation?");
  }

  return questions.slice(0, 5);
}

export function ReflectionQuestions({ note }: ReflectionQuestionsProps) {
  const questions = deriveQuestions(note);

  return (
    <div className="reflection-questions-view">
      <div className="reflection-intro">
        <Lightbulb size={18} />
        <p>
          These prompts are derived from the documented session content to help guide your
          reflection and preparation for the next visit.
        </p>
      </div>

      <ol className="reflection-list">
        {questions.map((question, idx) => (
          <li key={idx} className="reflection-item">
            <span className="reflection-number">{idx + 1}</span>
            <span className="reflection-text">{question}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
