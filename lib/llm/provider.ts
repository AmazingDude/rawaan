import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { LlmContextLimitError, LlmOutputLimitError, LlmRateLimitError, type LlmRateLimitDetails, type LlmRateLimitKind } from "@/lib/llm/errors";

const GROQ_CHAT_COMPLETIONS_URL =
  "https://api.groq.com/openai/v1/chat/completions";
// Verified against the project's Groq account: qwen/qwen3.8-27b returns clean
// JSON content with no reasoning overhead. The older gpt-oss models emit
// reasoning tokens that eat the max_tokens budget and truncate the JSON.
const DEFAULT_GROQ_MODEL = "qwen/qwen3.8-27b";
const REQUEST_TIMEOUT_MS = 30_000;
const MAX_TOTAL_RATE_LIMIT_WAIT_MS = 45_000;

export function getGroqApiKeyFromDisk(): string | undefined {
  try {
    const envPath = join(process.cwd(), ".env.local");
    if (existsSync(envPath)) {
      const content = readFileSync(envPath, "utf-8");
      const match = content.match(/^\s*GROQ_API_KEY\s*=\s*(.*)?\s*$/m);
      if (match && match[1]) {
        let val = match[1].trim();
        if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
        if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);
        return val.trim();
      }
    }
  } catch {
    // Ignore fallback failure
  }
  return undefined;
}

const groqChatCompletionSchema = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({
          content: z.string(),
        }),
        finish_reason: z.string().nullable().optional(),
      }),
    )
    .min(1),
});

export interface LlmCompletionProvider {
  complete(input: { system: string; user: string; maxTokens?: number }): Promise<string>;
}

type GroqRequest = {
  model: string;
  messages: Array<{ role: "system" | "user"; content: string }>;
  max_tokens: number;
  temperature: number;
  stream: boolean;
};

function quotaDetails(text: string, response: Response): LlmRateLimitDetails {
  let message = "";
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed && typeof parsed === "object" && "error" in parsed) {
      const error = parsed.error;
      if (error && typeof error === "object" && "message" in error && typeof error.message === "string") message = error.message;
    }
  } catch { /* A proxy may return plain text instead of Groq's JSON error. */ }
  const matchingText = message || text;
  const patterns: Array<[LlmRateLimitKind, RegExp]> = [
    ["output_tokens_per_minute", /output tokens per minute|\bOTPM\b/i],
    ["input_tokens_per_minute", /input tokens per minute|\bITPM\b/i],
    ["tokens_per_minute", /tokens per minute|\bTPM\b/i],
    ["tokens_per_day", /tokens per day|\bTPD\b/i],
    ["requests_per_minute", /requests per minute|\bRPM\b/i],
    ["requests_per_day", /requests per day|\bRPD\b/i],
  ];
  const kind = patterns.find(([, pattern]) => pattern.test(matchingText))?.[0] ?? "unknown";
  const number = (label: string) => {
    const match = new RegExp(`\\b${label}\\s*:?\\s*([0-9][0-9,]*(?:\\.[0-9]+)?)`, "i").exec(matchingText);
    const value = match ? Number(match[1].replaceAll(",", "")) : NaN;
    return Number.isFinite(value) && value >= 0 ? value : undefined;
  };
  const retryHeader = response.headers.get("retry-after");
  const seconds = retryHeader && /^\d+(?:\.\d+)?$/.test(retryHeader.trim()) ? Number(retryHeader) : retryHeader ? (Date.parse(retryHeader) - Date.now()) / 1000 : NaN;
  return { kind, httpStatus: response.status, limit: number("limit"), used: number("used"), requested: number("requested"), retryAfterSeconds: Number.isFinite(seconds) && seconds >= 0 ? seconds : undefined };
}

type LlmProviderEnvironment = Partial<
  Pick<NodeJS.ProcessEnv, "GROQ_API_KEY" | "LLM_MODEL">
>;

function readConfiguredValue(value: string, label: string): string {
  const configuredValue = value.trim();

  if (!configuredValue) {
    throw new Error(`LLM provider is not configured: ${label} missing`);
  }

  return configuredValue;
}

async function fetchGroqChatCompletion(
  apiKey: string,
  body: GroqRequest,
): Promise<Response> {
  let lastNetworkError: unknown;
  let lastResponse: Response | undefined;
  let outputBudget = body.max_tokens;
  let adjustedOutputBudget = false;
  let remainingRateLimitWaitMs = MAX_TOTAL_RATE_LIMIT_WAIT_MS;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(GROQ_CHAT_COMPLETIONS_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ...body, max_tokens: outputBudget }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if ((response.status === 429 || response.status === 413) && attempt < 2) {
        const details = quotaDetails(await response.clone().text(), response);
        // A per-minute output cap can reject max_tokens before any generation,
        // even with an empty history. Change only output capacity, never records.
        if (!adjustedOutputBudget && details.kind === "output_tokens_per_minute" && details.limit && outputBudget > details.limit) {
          const delayMs = (details.retryAfterSeconds ?? 0) * 1000;
          if (delayMs > remainingRateLimitWaitMs) return response;
          remainingRateLimitWaitMs -= delayMs;
          outputBudget = Math.max(1, Math.floor(details.limit * .9));
          adjustedOutputBudget = true;
          lastResponse = response;
          if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
          continue;
        }
        const exceedsCapacity = details.limit !== undefined && details.requested !== undefined && details.requested > details.limit;
        if (response.status !== 429 || exceedsCapacity || details.kind.endsWith("per_day")) return response;
        const delayMs = (details.retryAfterSeconds ?? 1.5 * (attempt + 1)) * 1000;
        // Honor Groq's cooldown, with one bounded wait budget for the whole call.
        if (delayMs > remainingRateLimitWaitMs) return response;
        remainingRateLimitWaitMs -= delayMs;
        lastResponse = response;
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }

      return response;
    } catch (error) {
      lastNetworkError = error;
      if (attempt >= 1) {
        break;
      }
    }
  }

  if (lastResponse) {
    return lastResponse;
  }

  throw new Error("Groq chat completion request failed.", {
    cause: lastNetworkError,
  });
}

export function createGroqProvider(
  apiKey: string,
  model: string,
  maxTokens = 1024,
): LlmCompletionProvider {
  const configuredApiKey = readConfiguredValue(apiKey, "GROQ_API_KEY");
  const configuredModel = readConfiguredValue(model, "LLM_MODEL");

  return {
    async complete({ system, user, maxTokens: requestMaxTokens }) {
      const response = await fetchGroqChatCompletion(
        configuredApiKey,
        {
          model: configuredModel,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          max_tokens: Math.min(maxTokens, requestMaxTokens ?? maxTokens),
          temperature: 0,
          stream: false,
        },
      );

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        const details = quotaDetails(errorText, response);
        if (response.status === 429 || (response.status === 413 && details.kind !== "unknown")) throw new LlmRateLimitError(details);
        if (response.status === 413) throw new LlmContextLimitError();
        if (response.status === 400 && /context.{0,30}(?:length|window|limit)|maximum.{0,30}tokens|too many tokens/i.test(errorText)) throw new LlmContextLimitError();
        throw new Error(`LLM provider returned ${response.status}.`);
      }

      const payload = groqChatCompletionSchema.safeParse(await response.json());
      if (!payload.success) {
        throw new Error("Groq chat completion response was invalid.");
      }

      if (payload.data.choices[0].finish_reason === "length") throw new LlmOutputLimitError();

      return payload.data.choices[0].message.content;
    },
  };
}

export function createLlmProviderFromEnv(
  env: LlmProviderEnvironment,
  maxTokens = 1024,
): LlmCompletionProvider {
  const apiKey = env.GROQ_API_KEY?.trim();

  if (!apiKey) {
    throw new Error("LLM provider is not configured: GROQ_API_KEY missing");
  }

  return createGroqProvider(
    apiKey,
    env.LLM_MODEL?.trim() || process.env.LLM_MODEL?.trim() || DEFAULT_GROQ_MODEL,
    maxTokens,
  );
}
