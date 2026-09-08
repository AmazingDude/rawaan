import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createGroqProvider,
  createLlmProviderFromEnv,
} from "@/lib/llm/provider";
import { LlmContextLimitError, LlmRateLimitError, LlmOutputLimitError } from "@/lib/llm/errors";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Groq completion provider", () => {
  const success = () => new Response(JSON.stringify({choices:[{message:{content:'{"answer":"ok"}'},finish_reason:"stop"}]}), {status:200});

  it("adapts an oversized output reservation to OTPM without dropping input", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({error:{message:"Output tokens per minute (OTPM): Limit 1000, Used 0, Requested 4096. private organization details"}}),{status:429}))
      .mockResolvedValueOnce(success());
    vi.stubGlobal("fetch",fetchMock);
    const provider=createGroqProvider("test-key","test-model",4096);
    await expect(provider.complete({system:"instruction",user:"Complete original session history"})).resolves.toBe('{"answer":"ok"}');
    const bodies=fetchMock.mock.calls.map(call=>JSON.parse(call[1].body));
    expect(bodies.map(body=>body.max_tokens)).toEqual([4096,900]);
    expect(bodies[1].messages).toEqual(bodies[0].messages);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("honors the provider's eight-second retry time instead of retrying at three seconds", async () => {
    vi.useFakeTimers();
    const fetchMock=vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({error:{message:"Output tokens per minute (OTPM): Limit 1000, Used 200, Requested 900"}}),{status:429,headers:{"retry-after":"8"}}))
      .mockResolvedValueOnce(success());
    vi.stubGlobal("fetch",fetchMock);
    const pending=createGroqProvider("test-key","test-model",900).complete({system:"instruction",user:"original history"});
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(3000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(5000);
    await expect(pending).resolves.toBe('{"answer":"ok"}');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it.each([8,75])("also honors a %s-second cooldown when adjusting an oversized output budget", async seconds => {
    vi.useFakeTimers();
    const fetchMock=vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({error:{message:"Output tokens per minute (OTPM): Limit 1000, Requested 4096"}}),{status:429,headers:{"retry-after":String(seconds)}})).mockResolvedValueOnce(success());
    vi.stubGlobal("fetch",fetchMock);
    const pending=createGroqProvider("test-key","test-model",4096).complete({system:"instruction",user:"original history"}).catch(error=>error);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    if(seconds>45){
      expect(await pending).toBeInstanceOf(LlmRateLimitError);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    }else{
      await vi.advanceTimersByTimeAsync(3000);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(5000);
      expect(await pending).toBe('{"answer":"ok"}');
      expect(JSON.parse(fetchMock.mock.calls[1][1].body).max_tokens).toBe(900);
    }
  });

  it("reports cooldowns beyond the bounded wait with safe quota details", async () => {
    const fetchMock=vi.fn().mockResolvedValue(new Response(JSON.stringify({error:{message:"Output tokens per minute (OTPM): Limit 1000, Used 900, Requested 900; private organization details"}}),{status:429,headers:{"retry-after":"75"}}));
    vi.stubGlobal("fetch",fetchMock);
    const error=await createGroqProvider("test-key","test-model",900).complete({system:"instruction",user:"history"}).catch(error=>error);
    expect(error).toBeInstanceOf(LlmRateLimitError);
    expect(error.details).toMatchObject({kind:"output_tokens_per_minute",limit:1000,used:900,requested:900,retryAfterSeconds:75});
    expect(error.message).toContain("75 seconds");
    expect(error.message).not.toContain("private organization");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("recovers the reported 18-second input cooldown with the full original request", async () => {
    vi.useFakeTimers();
    const fetchMock=vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({error:{message:"Input tokens per minute (ITPM): Limit 8000, Used 7500, Requested 2400"}}),{status:429,headers:{"retry-after":"18"}})).mockResolvedValueOnce(success());
    vi.stubGlobal("fetch",fetchMock);
    const pending=createGroqProvider("test-key","test-model").complete({system:"instruction",user:"Complete original session history and transcript"}).catch(error=>error);
    await vi.advanceTimersByTimeAsync(17000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(await pending).toBe('{"answer":"ok"}');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][1].body).toBe(fetchMock.mock.calls[0][1].body);
  });

  it("uses one cumulative wait budget across repeated quota responses", async () => {
    vi.useFakeTimers();
    const fetchMock=vi.fn().mockResolvedValue(new Response(JSON.stringify({error:{message:"Input tokens per minute (ITPM): Limit 8000, Used 7500, Requested 2400"}}),{status:429,headers:{"retry-after":"30"}}));
    vi.stubGlobal("fetch",fetchMock);
    const pending=createGroqProvider("test-key","test-model").complete({system:"instruction",user:"original history"}).catch(error=>error);
    await vi.advanceTimersByTimeAsync(30000);
    expect(await pending).toBeInstanceOf(LlmRateLimitError);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not wait for an input request that exceeds the entire allowance", async () => {
    const fetchMock=vi.fn().mockResolvedValue(new Response(JSON.stringify({error:{message:"Input tokens per minute (ITPM): Limit 8000, Used 0, Requested 9000"}}),{status:429,headers:{"retry-after":"18"}}));
    vi.stubGlobal("fetch",fetchMock);
    const error=await createGroqProvider("test-key","test-model").complete({system:"instruction",user:"original history"}).catch(error=>error);
    expect(error).toBeInstanceOf(LlmRateLimitError);
    expect(error.message).toContain("exceeds");
    expect(error.message).not.toContain("Retry in");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not retry a daily quota or confuse a TPM-sized request with the model context window", async () => {
    const fetchMock=vi.fn().mockResolvedValue(new Response(JSON.stringify({error:{message:"Tokens per day (TPD): Limit 200000, Used 200000, Requested 100"}}),{status:429}));
    vi.stubGlobal("fetch",fetchMock);
    const daily=await createGroqProvider("test-key","test-model").complete({system:"instruction",user:"history"}).catch(error=>error);
    expect(daily.details.kind).toBe("tokens_per_day");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({error:{message:"Tokens per minute (TPM): Limit 8000, Requested 9000; private organization"}}),{status:413}));
    const large=await createGroqProvider("test-key","test-model").complete({system:"instruction",user:"history"}).catch(error=>error);
    expect(large).toBeInstanceOf(LlmRateLimitError);
    expect(large).not.toBeInstanceOf(LlmContextLimitError);
    expect(large.details).toMatchObject({kind:"tokens_per_minute",limit:8000,requested:9000});
  });

  it("uses a smaller per-call planner budget without changing the default answer budget", async () => {
    const fetchMock=vi.fn().mockImplementation(async()=>success()); vi.stubGlobal("fetch",fetchMock);
    const provider=createGroqProvider("test-key","test-model",4096);
    await provider.complete({system:"planner",user:"question",maxTokens:512});
    await provider.complete({system:"answer",user:"all records"});
    expect(fetchMock.mock.calls.map(call=>JSON.parse(call[1].body).max_tokens)).toEqual([512,4096]);
  });

  it("rejects a reply cut off by the output budget rather than persisting incomplete JSON", async () => {
    vi.stubGlobal("fetch",vi.fn().mockResolvedValue(new Response(JSON.stringify({choices:[{message:{content:'{"private":"partial'},finish_reason:"length"}]}),{status:200})));
    const error=await createGroqProvider("test-key","test-model").complete({system:"instruction",user:"history"}).catch(error=>error);
    expect(error).toBeInstanceOf(LlmOutputLimitError);
    expect(error.message).not.toContain("partial");
  });
  it.each([413,400])("reports oversized context without exposing provider payloads (HTTP %s)",async status=>{
    const fetchMock=vi.fn().mockResolvedValue(new Response(JSON.stringify({error:{message:"Maximum context length exceeded; private organization details"}}),{status}));
    vi.stubGlobal("fetch",fetchMock);
    const provider=createGroqProvider("test-key","test-model");
    const error=await provider.complete({system:"instruction",user:"history"}).catch(error=>error);
    expect(error).toBeInstanceOf(LlmContextLimitError);
    expect(error.message).not.toContain("private organization");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("throws a clear error when the Groq key is not configured", () => {
    expect(() => createLlmProviderFromEnv({})).toThrowError(
      "LLM provider is not configured: GROQ_API_KEY missing",
    );
  });

  it("uses the verified JSON-safe default when no model override is configured", async () => {
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
      model: "qwen/qwen3.8-27b",
      max_tokens: 1024,
      temperature: 0,
      stream: false,
      messages: [
        { role: "system", content: "system instruction" },
        { role: "user", content: "evidence" },
      ],
    });
  });

  it("accepts an explicit model override", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({ choices: [{ message: { content: "fallback answer" } }] }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const provider = createLlmProviderFromEnv({
      GROQ_API_KEY: "test-key",
      LLM_MODEL: "qwen/qwen3.6-27b",
    });

    await provider.complete({ system: "system instruction", user: "evidence" });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toMatchObject({
      model: "qwen/qwen3.6-27b",
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
