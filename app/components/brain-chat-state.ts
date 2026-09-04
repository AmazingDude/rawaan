import type { BrainResponse } from "@/lib/brain/types";

export type BrainChatEntry = {
  question: string;
  response: BrainResponse | { message: string; status: "error" };
  timestamp: string;
};

export type BrainChatState = {
  patientId: string;
  entries: BrainChatEntry[];
  draftQuestion: string;
  isSubmitting: boolean;
};

/** Structurally identical to BrainActionResult in app/actions.ts. */
export type ChatQueryResult =
  | { ok: true; response: BrainResponse }
  | { message: string; ok: false };

export type BrainChatAction =
  | { type: "select-patient"; patientId: string }
  | { type: "set-draft"; text: string }
  | { type: "submit-start" }
  | { type: "append-entry"; entry: BrainChatEntry }
  | { type: "load-thread"; entries: BrainChatEntry[] }
  | { type: "new-chat" };

export const initialBrainChatState: BrainChatState = {
  patientId: "",
  entries: [],
  draftQuestion: "",
  isSubmitting: false,
};

export function brainChatReducer(
  state: BrainChatState,
  action: BrainChatAction,
): BrainChatState {
  switch (action.type) {
    case "select-patient":
      // Changing patient resets the thread and draft so a prior patient's
      // conversation (or a question typed for it) can never leak into the next
      // patient's context.
      return {
        ...state,
        patientId: action.patientId,
        entries: [],
        draftQuestion: "",
        isSubmitting: false,
      };
    case "set-draft":
      return { ...state, draftQuestion: action.text };
    case "submit-start":
      return { ...state, isSubmitting: true };
    case "append-entry":
      return {
        ...state,
        entries: [...state.entries, action.entry],
        draftQuestion: "",
        isSubmitting: false,
      };
    case "load-thread":
      // Hydrates a persisted thread for display. Stored history is never
      // sent back into the query pipeline — display only.
      return {
        ...state,
        entries: action.entries,
        draftQuestion: "",
        isSubmitting: false,
      };
    case "new-chat":
      // Clears only in-memory messages; never touches persisted notes or the
      // stored chat history.
      return { ...state, entries: [], draftQuestion: "", isSubmitting: false };
    default:
      return state;
  }
}

type RunQueryInput = {
  patientId: string;
  question: string;
  query: (patientId: string, question: string) => Promise<ChatQueryResult>;
  now: () => string;
};

/**
 * Runs one stateless turn. The injected query receives ONLY (patientId,
 * question) — no prior-turn context — preserving the hard per-turn isolation
 * rule. The result is mapped verbatim onto a timestamped chat entry.
 */
export async function runBrainChatQuery({
  patientId,
  question,
  query,
  now,
}: RunQueryInput): Promise<BrainChatEntry> {
  const result = await query(patientId, question);

  const response = result.ok
    ? result.response
    : { message: result.message, status: "error" as const };

  return { question, response, timestamp: now() };
}
