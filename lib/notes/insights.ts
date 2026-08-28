import type { ApprovedNote } from "@/lib/notes/schema";

export interface PatientSessionInsights {
  hasInsights: boolean;
  interestingQuestions: string[];
  lastSessionDate: string | null;
  planForThisSession: string[];
  previousActionItems: string[];
  summary: string;
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
      summary: "",
    };
  }

  // Sort descending by consultation date
  const sortedNotes = [...notes].sort((a, b) =>
    b.consultation_date.localeCompare(a.consultation_date),
  );
  const latestNote = sortedNotes[0]!;

  const summary =
    latestNote.chief_complaint ||
    (latestNote.symptoms.length > 0
      ? `Consultation focused on ${latestNote.symptoms.join(", ")}.`
      : "Previous consultation record available.");

  const previousActionItems =
    latestNote.plan_discussed.length > 0
      ? latestNote.plan_discussed
      : ["Continue monitoring symptoms and daily lifestyle diary."];

  const interestingQuestions =
    latestNote.uncertainties.length > 0
      ? latestNote.uncertainties
      : latestNote.history.length > 0
        ? latestNote.history
        : ["Review any trigger variations since last session."];

  const planForThisSession = latestNote.follow_up
    ? [latestNote.follow_up]
    : [
        "Follow up on symptom response and progress toward discussed goals.",
      ];

  return {
    hasInsights: true,
    interestingQuestions,
    lastSessionDate: latestNote.consultation_date,
    planForThisSession,
    previousActionItems,
    summary,
  };
}
