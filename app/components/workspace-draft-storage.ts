import { z } from "zod";
import {
  noteEditorTextFrom,
  type NoteEditorText,
} from "@/app/components/session-note-editor-state";
import {
  noteDraftSchema,
  noteSchema,
  consultationDateSchema,
  type ApprovedNote,
  type NoteDraft,
} from "@/lib/notes/schema";

export const WORKSPACE_DRAFT_STORAGE_KEY = "rawaan-active-workspace-draft";

const pendingSessionSchema = z.object({
  consultationDate: consultationDateSchema,
  recordingDevice: z.string().optional(),
  recordingDurationSeconds: z.number().nonnegative().optional(),
  sessionType: z.enum(["in-person", "summary", "upload", "manual"]),
  transcript: z.string().min(1),
  transcriptSource: z.string().min(1),
});
export type PendingSession = z.infer<typeof pendingSessionSchema>;

export function restorePendingSession(serialized: string): PendingSession | null {
  try {
    const result = z.object({pendingSession: pendingSessionSchema}).safeParse(JSON.parse(serialized));
    return result.success ? result.data.pendingSession : null;
  } catch { return null; }
}

export interface WorkspaceSnapshot {
  draft: NoteDraft | ApprovedNote;
  editorText: NoteEditorText;
}

export function serializeWorkspaceSnapshot(
  draft: NoteDraft | ApprovedNote,
  editorText: NoteEditorText = noteEditorTextFrom(draft),
): string {
  return JSON.stringify({ draft, editorText });
}

export function restoreWorkspaceSnapshot(
  serialized: string,
  createDraftId: () => string = () => crypto.randomUUID(),
): WorkspaceSnapshot | null {
  let value: unknown;
  try {
    value = JSON.parse(serialized) as unknown;
  } catch {
    return null;
  }

  const isObject = typeof value === "object" && value !== null && !Array.isArray(value);
  if (!isObject) return null;

  const record = value as Record<string, unknown>;
  const candidate = "draft" in record ? record.draft : value;
  const approved = noteSchema.safeParse(candidate);
  if (approved.success) {
    return {
      draft: approved.data,
      editorText: readEditorText(record.editorText, approved.data),
    };
  }

  const draftResult = noteDraftSchema.safeParse(candidate);
  if (!draftResult.success) return null;

  const draft = draftResult.data.draft_id
    ? draftResult.data
    : { ...draftResult.data, draft_id: createDraftId() };
  return {
    draft,
    editorText: readEditorText(record.editorText, draft),
  };
}

function readEditorText(
  value: unknown,
  draft: NoteDraft | ApprovedNote,
): NoteEditorText {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return noteEditorTextFrom(draft);
  }
  const record = value as Record<string, unknown>;
  const fallback = noteEditorTextFrom(draft);
  return {
    history: typeof record.history === "string" ? record.history : fallback.history,
    symptoms: typeof record.symptoms === "string" ? record.symptoms : fallback.symptoms,
    assessment_discussed:
      typeof record.assessment_discussed === "string"
        ? record.assessment_discussed
        : fallback.assessment_discussed,
    plan_discussed:
      typeof record.plan_discussed === "string"
        ? record.plan_discussed
        : fallback.plan_discussed,
    medications_mentioned:
      typeof record.medications_mentioned === "string"
        ? record.medications_mentioned
        : fallback.medications_mentioned,
    uncertainties:
      typeof record.uncertainties === "string"
        ? record.uncertainties
        : fallback.uncertainties,
  };
}
