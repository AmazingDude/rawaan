import type { ApprovedNote } from "@/lib/notes/schema";

export interface SourcedInsight {
  text: string;
  sourceNoteId: string;
}

export interface PatientSessionInsights {
  hasInsights: boolean;
  interestingQuestions: SourcedInsight[];
  lastSessionDate: string | null;
  planForThisSession: SourcedInsight[];
  previousActionItems: SourcedInsight[];
  summary: SourcedInsight | null;
  timeline: Array<{ chiefComplaint: string; date: string; noteId: string }>;
}

export function extractPatientSessionInsights(
  notes: ApprovedNote[],
): PatientSessionInsights {
  if (notes.length === 0) {
    return {
      hasInsights: false,
      interestingQuestions: [],
      lastSessionDate: null,
      planForThisSession: [],
      previousActionItems: [],
      summary: null,
      timeline: [],
    };
  }

  // Sort descending by consultation date
  const sortedNotes = [...notes].sort((a, b) =>
    b.consultation_date.localeCompare(a.consultation_date),
  );
  const latestNote = sortedNotes[0]!;

  const summary = latestNote.summary?.trim() ?? "";

  const withSource = (items: string[]): SourcedInsight[] =>
    items.filter((item) => item.trim()).map((text) => ({
      text,
      sourceNoteId: latestNote.id,
    }));

  const previousActionItems = withSource(latestNote.plan_discussed);
  const interestingQuestions = withSource(latestNote.uncertainties);
  const planForThisSession = withSource(
    latestNote.follow_up ? [latestNote.follow_up] : [],
  );

  const timeline = sortedNotes.map((note) => ({
    chiefComplaint: note.chief_complaint || note.summary || "Consultation note",
    date: note.consultation_date,
    noteId: note.id,
  }));

  return {
    hasInsights: true,
    interestingQuestions,
    lastSessionDate: latestNote.consultation_date,
    planForThisSession,
    previousActionItems,
    summary: summary ? { text: summary, sourceNoteId: latestNote.id } : null,
    timeline,
  };
}
