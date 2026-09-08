import type { BrainResponse } from "@/lib/brain/types";
import type { AgentResponse } from "@/lib/agent/schema";

export type BrainChatEntry = {
  question: string;
  response: BrainResponse | AgentResponse | { message: string; status: "error" };
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
  // Only clear ellipses inherit the previous supported question. A question
  // that names a field or subject (for example, blood pressure) is independent.
  return /^(?:in detail(?: please)?|tell me more|can you elaborate\??|explain further\??|why\??|how\??|and then\??|what else\??|(?:what|how) about (?:it|that|those|the same)(?: part)?[?.]?)$/.test(q);
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
  return `${baseQuestion}\n${currentQuestion}`;
}

export type RunQueryInput = {
  patientId: string;
  question: string;
  query: (patientId: string, question: string) => Promise<ChatQueryResult>;
  now: () => string;
  history?: BrainChatEntry[];
};

/**
 * Runs one conversational turn. Only a strict ellipsis may include the prior
 * supported question for context. Independent questions are never retried as
 * another clinical field, and the entry always retains the user's question.
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
  }

  const response = result.ok
    ? result.response
    : { message: result.message, status: "error" as const };

  return { question, response, timestamp: now() };
}

