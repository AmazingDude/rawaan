export const LLM_CONTEXT_LIMIT_MESSAGE =
  "This client's history is too large for the AI to read in one response. You can still search all sessions in Records only.";

export class LlmContextLimitError extends Error {
  constructor() {
    super(LLM_CONTEXT_LIMIT_MESSAGE);
    this.name = "LlmContextLimitError";
  }
}
