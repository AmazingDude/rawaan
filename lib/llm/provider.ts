import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

const GROQ_CHAT_COMPLETIONS_URL =
  "https://api.groq.com/openai/v1/chat/completions";
// Verified against the project's Groq account: qwen/qwen3.8-27b returns clean
// JSON content with no reasoning overhead. The older gpt-oss models emit
// reasoning tokens that eat the max_tokens budget and truncate the JSON.
const DEFAULT_GROQ_MODEL = "qwen/qwen3.8-27b";
const REQUEST_TIMEOUT_MS = 30_000;

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
      }),
    )
    .min(1),
});

export interface LlmCompletionProvider {
  complete(input: { system: string; user: string }): Promise<string>;
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
  body: string,
): Promise<Response> {
  let lastNetworkError: unknown;
  let lastResponse: Response | undefined;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(GROQ_CHAT_COMPLETIONS_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (response.status === 429 && attempt < 2) {
        lastResponse = response;
        const retryAfter = response.headers.get("retry-after");
        const delayMs = Math.min(
          (retryAfter ? Number.parseFloat(retryAfter) || 1.5 : 1.5) * 1000,
          3000,
        );
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
    async complete({ system, user }) {
      const response = await fetchGroqChatCompletion(
        configuredApiKey,
        JSON.stringify({
          model: configuredModel,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          max_tokens: maxTokens,
          temperature: 0,
          stream: false,
        }),
      );

      if (!response.ok) {
        const errorText = await response.text().catch(() => "");
        throw new Error(`LLM provider returned ${response.status}: ${errorText || response.statusText}`);
      }

      const payload = groqChatCompletionSchema.safeParse(await response.json());
      if (!payload.success) {
        throw new Error("Groq chat completion response was invalid.");
      }

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
