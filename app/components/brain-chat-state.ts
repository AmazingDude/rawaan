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

export function isFollowUpQuery(question: string): boolean {
  const q = question.trim().toLowerCase();
  // Common follow-up / elaboration / clarification starters
  if (
    /^(in\s+detail|details?\s+please|more\s+details?|elaborate|tell\s+me\s+more|expand|explain\s+further|(why|how)(\?|\b\s*$)|what\s+else\??|can\s+you\s+elaborate|can\s+you\s+explain|give\s+more\s+details?|summarize\s+in\s+detail|provide\s+more\s+detail|expand\s+on\s+this|expand\s+on\s+that|what\s+about\b|describe\s+in\s+detail|tell\s+me\s+in\s+detail|break\s+it\s+down)/i.test(
      q,
    )
  ) {
    return true;
  }
  // Short phrases (< 45 chars) containing follow-up keywords
  if (
    q.length < 45 &&
    /\b(in detail|details?\s+please|elaborate|tell me more|what about|how about|how so|what else|expand|explain further|more info|more information|specifics)\b/i.test(
      q,
    )
  ) {
    return true;
  }
  return false;
}

export function findRootQuestion(history: BrainChatEntry[]): string | undefined {
  const supported = history.filter((e) => e.response.status === "supported");
  if (supported.length === 0) return undefined;

  for (let i = supported.length - 1; i >= 0; i--) {
    if (!isFollowUpQuery(supported[i].question)) {
      return supported[i].question;
    }
  }
  return supported[0]?.question;
}

export function buildContextualQuery(
  currentQuestion: string,
  baseQuestion: string,
): string {
  return `${baseQuestion} (Follow-up: ${currentQuestion})`;
}

export type RunQueryInput = {
  patientId: string;
  question: string;
  query: (patientId: string, question: string) => Promise<ChatQueryResult>;
  now: () => string;
  history?: BrainChatEntry[];
};

/**
 * Runs one conversational turn. If the turn is a follow-up or elaboration,
 * it contextualizes the query against the previous supported clinical topic so
 * that retrieval and generation can answer in detail while preserving strict grounding.
 */
export async function runBrainChatQuery({
  patientId,
  question,
  query,
  now,
  history = [],
}: RunQueryInput): Promise<BrainChatEntry> {
  const rootQuestion = findRootQuestion(history);
  let result: ChatQueryResult;

  if (rootQuestion && isFollowUpQuery(question)) {
    result = await query(
      patientId,
      buildContextualQuery(question, rootQuestion),
    );
  } else {
    result = await query(patientId, question);
    // If standalone query returned no supporting record, retry with conversation context
    if (
      result.ok &&
      result.response.status === "no_supporting_record" &&
      rootQuestion
    ) {
      const contextualResult = await query(
        patientId,
        buildContextualQuery(question, rootQuestion),
      );
      if (
        contextualResult.ok &&
        contextualResult.response.status === "supported"
      ) {
        result = contextualResult;
      }
    }
  }

  const response = result.ok
    ? result.response
    : { message: result.message, status: "error" as const };

  return { question, response, timestamp: now() };
}

