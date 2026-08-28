import type { ApprovedNote } from "@/lib/notes/schema";

export type RosterPatient = {
  patientId: string;
  displayName: string;
  approvedNoteCount: number;
  mostRecentConsultationDate: string;
};

export function deriveRosterSummary(notes: ApprovedNote[]): RosterPatient[] {
  const map = new Map<
    string,
    { displayName: string; count: number; latestDate: string }
  >();

  for (const note of notes) {
    const existing = map.get(note.patient_id);
    if (!existing) {
      map.set(note.patient_id, {
        displayName: note.patient_display_name,
        count: 1,
        latestDate: note.consultation_date,
      });
    } else {
      existing.count += 1;
      if (note.consultation_date > existing.latestDate) {
        existing.latestDate = note.consultation_date;
      }
    }
  }

  return [...map.entries()].map(([patientId, data]) => ({
    patientId,
    displayName: data.displayName,
    approvedNoteCount: data.count,
    mostRecentConsultationDate: data.latestDate,
  }));
}
