import { afterEach, describe, expect, it, vi } from "vitest";
import fixture from "@/data/seed/prompt-dictation.json";
import { appendDictatedText, createPromptDictation, requestPromptTranscription, type PromptRecorder } from "@/lib/transcription/prompt-dictation";

function setup() {
  const track = { stop: vi.fn() };
  const stream = { getTracks: () => [track] } as unknown as MediaStream;
  const recorder: PromptRecorder = {
    state: "inactive", mimeType: "audio/webm;codecs=opus", ondataavailable: null, onstop: null, onerror: null,
    start: vi.fn(() => { Object.assign(recorder, { state: "recording" }); }),
    stop: vi.fn(() => { Object.assign(recorder, { state: "inactive" }); }),
  };
  const dependencies = {
    getUserMedia: vi.fn().mockResolvedValue(stream),
    createRecorder: vi.fn(() => recorder),
    requestTranscription: vi.fn().mockResolvedValue(fixture.finalCommand),
  };
  const callbacks = { onPhaseChange: vi.fn(), onFinish: vi.fn(), onError: vi.fn() };
  const session = createPromptDictation(callbacks, dependencies);
  const data = (content = "fictional-audio-bytes") => recorder.ondataavailable?.({ data: new Blob([content], { type: recorder.mimeType }) } as BlobEvent);
  const end = () => recorder.onstop?.(new Event("stop"));
  return { track, stream, recorder, dependencies, callbacks, session, data, end };
}
async function flush() { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); }
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("note-assistant recorded dictation", () => {
  it("preserves typed text and whitespace", () => {
    expect(appendDictatedText(fixture.typedPrefix, fixture.finalCommand)).toBe(fixture.typedPrefix + " " + fixture.finalCommand);
    expect(appendDictatedText(fixture.typedPrefix + "\n", fixture.finalCommand)).toBe(fixture.typedPrefix + "\n" + fixture.finalCommand);
    expect(appendDictatedText(fixture.typedPrefix, "")).toBe(fixture.typedPrefix);
  });
  it("uploads all completed audio once after Stop and commits one final transcript", async () => {
    const s = setup(); s.session.start(); s.session.start(); await flush();
    expect(s.dependencies.getUserMedia).toHaveBeenCalledTimes(1);
    s.data("first chunk");
    expect(s.dependencies.requestTranscription).not.toHaveBeenCalled();
    s.session.stop(); s.session.stop();
    expect(s.recorder.stop).toHaveBeenCalledTimes(1);
    s.data("last chunk"); const lateStop = s.recorder.onstop!; s.end(); lateStop(new Event("stop")); await flush();
    expect(s.dependencies.requestTranscription).toHaveBeenCalledTimes(1);
    const audio = s.dependencies.requestTranscription.mock.calls[0][0] as File;
    expect(await audio.text()).toBe("first chunklast chunk");
    expect(audio.name).toBe("voice-request.webm");
    expect(s.callbacks.onFinish).toHaveBeenCalledExactlyOnceWith(fixture.finalCommand);
    expect(s.track.stop).toHaveBeenCalledTimes(1);
    expect(s.callbacks.onPhaseChange.mock.calls.map(call => call[0])).toEqual(["starting", "recording", "transcribing"]);
  });
  it("supports the recorder's MP4 format with the correct file extension", async () => {
    const s = setup(); Object.assign(s.recorder, { mimeType: "audio/mp4" });
    s.session.start(); await flush(); s.data(); s.session.stop(); s.end(); await flush();
    expect(s.dependencies.requestTranscription.mock.calls[0][0]).toMatchObject({ name: "voice-request.m4a", type: "audio/mp4" });
  });
  it("releases late microphone permission after cancellation without starting recording", async () => {
    const s = setup(); let grant!: (stream: MediaStream) => void;
    s.dependencies.getUserMedia.mockImplementation(() => new Promise(resolve => { grant = resolve; }));
    s.session.start(); s.session.cancel(); grant(s.stream); await flush();
    expect(s.track.stop).toHaveBeenCalledTimes(1);
    expect(s.dependencies.createRecorder).not.toHaveBeenCalled();
    expect(s.callbacks.onFinish).not.toHaveBeenCalled();
  });
  it("cancels recording without uploading and ignores queued stop events", async () => {
    const s = setup(); s.session.start(); await flush();
    const lateStop = s.recorder.onstop!, lateData = s.recorder.ondataavailable!;
    s.session.cancel(); lateData({ data: new Blob(["late"]) } as BlobEvent); lateStop(new Event("stop"));
    expect(s.track.stop).toHaveBeenCalledTimes(1);
    expect(s.dependencies.requestTranscription).not.toHaveBeenCalled();
    expect(s.callbacks.onFinish).not.toHaveBeenCalled();
  });
  it("aborts a pending upload and ignores its late response", async () => {
    const s = setup(); let reply!: (text: string) => void;
    s.dependencies.requestTranscription.mockImplementation(() => new Promise(resolve => { reply = resolve; }));
    s.session.start(); await flush(); s.data(); s.session.stop(); s.end();
    const signal = s.dependencies.requestTranscription.mock.calls[0][1] as AbortSignal;
    s.session.cancel(); reply(fixture.finalCommand); await flush();
    expect(signal.aborted).toBe(true); expect(s.callbacks.onFinish).not.toHaveBeenCalled();
  });
  it("reports denied permission without native error details", async () => {
    const s = setup(); s.dependencies.getUserMedia.mockRejectedValue(new DOMException("private", "NotAllowedError"));
    s.session.start(); await flush();
    expect(s.callbacks.onError).toHaveBeenCalledWith(expect.stringMatching(/microphone permission/i));
    expect(s.callbacks.onFinish).toHaveBeenCalledExactlyOnceWith("");
  });
  it("releases the microphone if recorder construction fails", async () => {
    const s = setup(); s.dependencies.createRecorder.mockImplementation(() => { throw Error("private"); });
    s.session.start(); await flush();
    expect(s.track.stop).toHaveBeenCalledTimes(1);
    expect(s.callbacks.onFinish).toHaveBeenCalledExactlyOnceWith("");
  });
  it("handles an error from an active recorder without uploading", async () => {
    const s = setup(); s.session.start(); await flush(); s.recorder.onerror?.(new Event("error") as ErrorEvent);
    expect(s.track.stop).toHaveBeenCalledTimes(1); expect(s.dependencies.requestTranscription).not.toHaveBeenCalled();
    expect(s.callbacks.onError).toHaveBeenCalledWith(expect.stringMatching(/recording/i));
  });
  it("rejects empty recordings before uploading", async () => {
    const s = setup(); s.session.start(); await flush(); s.session.stop(); s.end(); await flush();
    expect(s.dependencies.requestTranscription).not.toHaveBeenCalled();
    expect(s.callbacks.onError).toHaveBeenCalledWith(expect.stringMatching(/empty/i));
  });
  it("bounds recorded bytes and releases the microphone without uploading", async () => {
    const s = setup(); s.session.start(); await flush();
    s.recorder.ondataavailable?.({ data: new Blob([new Uint8Array(25 * 1024 * 1024 + 1)]) } as BlobEvent);
    expect(s.track.stop).toHaveBeenCalledTimes(1);
    expect(s.dependencies.requestTranscription).not.toHaveBeenCalled();
    expect(s.callbacks.onError).toHaveBeenCalledWith(expect.stringMatching(/too large/i));
  });
  it("releases the microphone when native stop throws", async () => {
    const s = setup(); s.session.start(); await flush();
    vi.mocked(s.recorder.stop).mockImplementation(() => { throw Error("private"); });
    s.session.stop();
    expect(s.track.stop).toHaveBeenCalledTimes(1);
    expect(s.callbacks.onFinish).toHaveBeenCalledExactlyOnceWith("");
  });
  it("reports upload failure and preserves the typed prompt", async () => {
    const s = setup(); s.dependencies.requestTranscription.mockRejectedValue(Error("private provider details"));
    s.session.start(); await flush(); s.data(); s.session.stop(); s.end(); await flush();
    expect(s.callbacks.onFinish).toHaveBeenCalledExactlyOnceWith("");
    expect(s.callbacks.onError).toHaveBeenCalledWith(expect.stringMatching(/transcribe/i));
  });
  it("bounds waiting for the recorder or network to finish", async () => {
    vi.useFakeTimers(); const s = setup(); s.session.start(); await flush(); s.session.stop();
    await vi.advanceTimersByTimeAsync(45000);
    expect(s.callbacks.onFinish).toHaveBeenCalledExactlyOnceWith("");
    expect(s.callbacks.onError).toHaveBeenCalledWith(expect.stringMatching(/finish/i));
    expect(s.track.stop).toHaveBeenCalledTimes(1);
  });
  it("automatically stops a long voice request", async () => {
    vi.useFakeTimers(); const s = setup(); s.session.start(); await flush();
    await vi.advanceTimersByTimeAsync(120000);
    expect(s.recorder.stop).toHaveBeenCalledTimes(1); s.session.cancel();
  });
});

describe("existing authenticated transcription endpoint", () => {
  it("posts audio to the same-origin route without a browser API key", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ ok: true, transcript: fixture.finalCommand }));
    vi.stubGlobal("fetch", fetcher);
    const audio = new File(["fixture"], "voice.webm", { type: "audio/webm" }); const signal = new AbortController().signal;
    expect(await requestPromptTranscription(audio, signal)).toBe(fixture.finalCommand);
    const [url, options] = fetcher.mock.calls[0]; expect(url).toBe("/api/transcribe");
    expect(options).toMatchObject({ method: "POST", signal }); expect(options.headers).toBeUndefined();
    expect(options.body.get("audio")).toBe(audio);
  });
  it.each([{ ok: true, transcript: " " }, { ok: true }, { ok: false, message: "private" }])("rejects malformed or empty endpoint responses", async payload => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(payload)));
    await expect(requestPromptTranscription(new File(["x"], "voice.webm"), new AbortController().signal)).rejects.toThrow();
  });
});
