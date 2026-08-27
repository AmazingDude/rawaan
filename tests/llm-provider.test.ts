import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createGroqProvider,
  createLlmProviderFromEnv,
} from "@/lib/llm/provider";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Groq Brain completion provider", () => {
  it("throws a clear error when the Groq key is not configured", () => {
    expect(() => createLlmProviderFromEnv({})).toThrowError(
      "LLM provider is not configured: GROQ_API_KEY missing",
    );
  });

  it("uses the approved GPT-OSS default when no model override is configured", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ choices: [{ message: { content: "grounded answer" } }] }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = createLlmProviderFromEnv({ GROQ_API_KEY: "test-key" });

    await expect(
      provider.complete({ system: "system instruction", user: "evidence" }),
    ).resolves.toBe("grounded answer");

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.groq.com/openai/v1/chat/completions");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer test-key",
    );
    expect(JSON.parse(init.body as string)).toMatchObject({
      model: "openai/gpt-oss-120b",
      max_tokens: 1024,
      temperature: 0,
      stream: false,
      messages: [
        { role: "system", content: "system instruction" },
        { role: "user", content: "evidence" },
      ],
    });
  });

  it("accepts an explicit model override for the documented fallback candidate", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ choices: [{ message: { content: "fallback answer" } }] }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = createLlmProviderFromEnv({
      GROQ_API_KEY: "test-key",
      LLM_MODEL: "llama-3.3-70b-versatile",
    });

    await provider.complete({ system: "system instruction", user: "evidence" });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toMatchObject({
      model: "llama-3.3-70b-versatile",
    });
  });

  it("uses a 30-second abort signal and retries a network-level failure once", async () => {
    const controller = new AbortController();
    const timeoutSpy = vi
      .spyOn(AbortSignal, "timeout")
      .mockReturnValue(controller.signal);
    const fetchMock = vi
      .fn()
      .mockRejectedValue(new DOMException("The operation was aborted", "AbortError"));
    vi.stubGlobal("fetch", fetchMock);

    const provider = createGroqProvider("test-key", "openai/gpt-oss-120b");

    await expect(
      provider.complete({ system: "system instruction", user: "evidence" }),
    ).rejects.toThrowError("Groq chat completion request failed.");

    expect(timeoutSpy).toHaveBeenCalledWith(30_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
