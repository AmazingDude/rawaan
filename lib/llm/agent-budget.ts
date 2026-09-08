export const DEFAULT_AGENT_OUTPUT_TOKENS = 768;

/** Raise this only when the configured Groq account/model has sufficient quota. */
export function agentOutputTokenBudget(env: { RAWAAN_AI_MAX_OUTPUT_TOKENS?: string } = { RAWAAN_AI_MAX_OUTPUT_TOKENS: process.env.RAWAAN_AI_MAX_OUTPUT_TOKENS }): number {
  const value = env.RAWAAN_AI_MAX_OUTPUT_TOKENS?.trim();
  if (!value) return DEFAULT_AGENT_OUTPUT_TOKENS;
  const tokens = Number(value);
  if (!Number.isInteger(tokens) || tokens < 256 || tokens > 8192) {
    throw new Error("RAWAAN_AI_MAX_OUTPUT_TOKENS must be an integer between 256 and 8192.");
  }
  return tokens;
}
