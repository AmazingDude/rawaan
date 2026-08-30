import { z } from "zod";

const GROQ_CHAT_COMPLETIONS_URL =
  "https://api.groq.com/openai/v1/chat/completions";
// Verified against the project's Groq account: qwen/qwen3.8-27b returns clean
// JSON content with no reasoning overhead. The older gpt-oss models emit
// reasoning tokens that eat the max_tokens budget and truncate the JSON.
const DEFAULT_GROQ_MODEL = "qwen/qwen3.8-27b";
const REQUEST_TIMEOUT_MS = 30_000;

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

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await fetch(GROQ_CHAT_COMPLETIONS_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch (error) {
      lastNetworkError = error;
    }
  }

  throw new Error("Groq chat completion request failed.", {
    cause: lastNetworkError,
  });
}

export function createGroqProvider(
  apiKey: string,
  model: string,
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
          max_tokens: 1024,
          temperature: 0,
          stream: false,
        }),
      );

      if (!response.ok) {
        throw new Error(`LLM provider returned ${response.status}`);
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
): LlmCompletionProvider {
  const apiKey = env.GROQ_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("LLM provider is not configured: GROQ_API_KEY missing");
  }

  return createGroqProvider(
    apiKey,
    env.LLM_MODEL?.trim() || DEFAULT_GROQ_MODEL,
  );
}
