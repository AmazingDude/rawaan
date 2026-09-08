export const LLM_CONTEXT_LIMIT_MESSAGE =
  "This client's history is too large for the AI to read in one response. You can still search all sessions in Records only.";

export class LlmContextLimitError extends Error {
  constructor() {
    super(LLM_CONTEXT_LIMIT_MESSAGE);
    this.name = "LlmContextLimitError";
  }
}

export type LlmRateLimitKind = "output_tokens_per_minute" | "input_tokens_per_minute" | "tokens_per_minute" | "tokens_per_day" | "requests_per_minute" | "requests_per_day" | "unknown";

export type LlmRateLimitDetails = {
  kind: LlmRateLimitKind;
  httpStatus: number;
  retryAfterSeconds?: number;
  limit?: number;
  used?: number;
  requested?: number;
};

export class LlmRateLimitError extends Error {
  constructor(readonly details: LlmRateLimitDetails) {
    const label = details.kind === "output_tokens_per_minute" ? "output-token" : details.kind === "input_tokens_per_minute" ? "input-token" : details.kind.startsWith("tokens") ? "token" : "request";
    const period = details.kind.endsWith("per_day") ? "daily" : "per-minute";
    const capacity = details.limit && details.requested && details.requested > details.limit
      ? ` This request exceeds the account's ${period} ${label} allowance; use a Groq model or plan with higher limits.` : "";
    const retry = !capacity && details.retryAfterSeconds !== undefined ? ` Retry in about ${Math.max(1, Math.ceil(details.retryAfterSeconds))} seconds.` : !capacity ? " Please retry after the quota resets." : "";
    super(`Groq's ${details.kind === "unknown" ? "rate" : `${period} ${label}`} limit was reached.${retry}${capacity} Limits are shared across API keys in the same organization.`);
    this.name = "LlmRateLimitError";
  }
}

export class LlmOutputLimitError extends Error {
  constructor() {
    super("Groq cut off the reply at its output-token limit. Ask for a shorter answer or use a Groq model or plan with higher output limits.");
    this.name = "LlmOutputLimitError";
  }
}
