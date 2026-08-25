import { describe, expect, it } from "vitest";

import {
  VoiceCaptureController,
  isRecordControlDisabled,
  resolveTranscriptPlacement,
  type VoiceCaptureDependencies,
  type VoiceRecorder,
} from "@/lib/transcription/voice-recorder";

class FakeRecorder implements VoiceRecorder {
  private dataListeners: Array<(event: { data: Blob }) => void> = [];
  private stopListeners: Array<() => void> = [];
  started = false;
  stopped = false;

  addEventListener(
    type: "dataavailable" | "stop",
    listener: ((event: { data: Blob }) => void) | (() => void),
  ) {
    if (type === "dataavailable") {
      this.dataListeners.push(listener as (event: { data: Blob }) => void);
      return;
    }

    this.stopListeners.push(listener as () => void);
  }

  start() {
    this.started = true;
  }

  stop() {
    this.stopped = true;
    this.stopListeners.forEach((listener) => listener());
  }

  emitAudio(blob = new Blob(["demo audio"], { type: "audio/webm" })) {
    this.dataListeners.forEach((listener) => listener({ data: blob }));
  }
}

type Harness = {
  controller: VoiceCaptureController;
  getUserMediaCalls: () => number;
  recorder: FakeRecorder;
  stoppedTracks: () => number;
  tick: () => void;
};

function createHarness(
  overrides: Partial<VoiceCaptureDependencies> = {},
): Harness {
  let getUserMediaCalls = 0;
  let stoppedTracks = 0;
  let tickCallback: (() => void) | null = null;
  const recorder = new FakeRecorder();

  const dependencies: VoiceCaptureDependencies = {
    createAudioFile: (parts, name, type) => new File(parts, name, { type }),
    createRecorder: () => recorder,
    getUserMedia: async () => {
      getUserMediaCalls += 1;
      return {
        getTracks: () => [
          {
            stop: () => {
              stoppedTracks += 1;
            },
          },
        ],
      };
    },
    isOnline: () => true,
    isRecorderSupported: () => true,
    requestTranscription: async () => ({
      ok: true,
      transcript: "Chief complaint: Persistent headache",
    }),
    scheduleInterval: (callback) => {
      tickCallback = callback;
      return 1;
    },
    clearScheduledInterval: () => {
      tickCallback = null;
    },
    ...overrides,
  };

  return {
    controller: new VoiceCaptureController(dependencies),
    getUserMediaCalls: () => getUserMediaCalls,
    recorder,
    stoppedTracks: () => stoppedTracks,
    tick: () => tickCallback?.(),
  };
}

describe("Task 4 consent-gated recorder state", () => {
  it("keeps Record disabled until consent while the manual path remains available", async () => {
    const harness = createHarness();

    expect(isRecordControlDisabled(false, harness.controller.state)).toBe(true);
    expect(isRecordControlDisabled(true, harness.controller.state)).toBe(false);

    await harness.controller.start(false);

    expect(harness.getUserMediaCalls()).toBe(0);
    expect(harness.controller.state.phase).toBe("idle");
  });

  it("records only after consent, exposes a timer, and sends one completed file after Stop", async () => {
    const uploadedFiles: File[] = [];
    const harness = createHarness({
      requestTranscription: async (audio) => {
        uploadedFiles.push(audio);
        return { ok: true, transcript: "Chief complaint: Persistent headache" };
      },
    });

    await harness.controller.start(true);

    expect(harness.getUserMediaCalls()).toBe(1);
    expect(harness.recorder.started).toBe(true);
    expect(harness.controller.state).toMatchObject({
      elapsedSeconds: 0,
      phase: "recording",
    });

    harness.tick();
    expect(harness.controller.state.elapsedSeconds).toBe(1);

    harness.recorder.emitAudio();
    const stop = harness.controller.stop();

    expect(harness.controller.state.phase).toBe("transcribing");
    await stop;

    expect(harness.recorder.stopped).toBe(true);
    expect(harness.stoppedTracks()).toBe(1);
    expect(uploadedFiles).toHaveLength(1);
    expect(uploadedFiles[0]?.type).toBe("audio/webm");
    expect(harness.controller.state.phase).toBe("idle");
  });

  it("preserves a manual edit made after Stop and requires an explicit transcript replacement", () => {
    expect(
      resolveTranscriptPlacement({
        currentTranscript: "Clinician typed this after stopping.",
        transcriptAtStop: "Original manual transcript",
        transcribedText: "Delayed voice transcript",
      }),
    ).toEqual({
      pendingTranscript: "Delayed voice transcript",
      transcript: "Clinician typed this after stopping.",
    });
  });

  it("uses a successful delayed transcript only when the manual text has not changed", () => {
    expect(
      resolveTranscriptPlacement({
        currentTranscript: "Original manual transcript",
        transcriptAtStop: "Original manual transcript",
        transcribedText: "Completed voice transcript",
      }),
    ).toEqual({
      pendingTranscript: null,
      transcript: "Completed voice transcript",
    });
  });

  it("discards a delayed transcription result after a consultation reset", async () => {
    let resolveTranscription: (result: {
      ok: true;
      transcript: string;
    }) => void = () => undefined;
    const receivedTranscripts: string[] = [];
    const delayedTranscription = new Promise<{
      ok: true;
      transcript: string;
    }>((resolve) => {
      resolveTranscription = resolve;
    });
    const harness = createHarness({
      onTranscript: (transcript) => receivedTranscripts.push(transcript),
      requestTranscription: async () => delayedTranscription,
    });

    await harness.controller.start(true);
    harness.recorder.emitAudio();
    const stop = harness.controller.stop();
    harness.controller.reset();
    resolveTranscription({
      ok: true,
      transcript: "A prior consultation result that must be ignored",
    });
    await stop;

    expect(receivedTranscripts).toEqual([]);
    expect(harness.controller.state).toEqual({
      elapsedSeconds: 0,
      fallbackMessage: null,
      phase: "idle",
    });
  });

  it("shows a manual fallback after microphone permission is denied", async () => {
    const harness = createHarness({
      getUserMedia: async () => {
        const error = new Error("denied");
        error.name = "NotAllowedError";
        throw error;
      },
    });

    await harness.controller.start(true);

    expect(harness.controller.state).toMatchObject({
      fallbackMessage:
        "Microphone permission was not granted. Type or paste the transcript manually.",
      phase: "idle",
    });
  });

  it("shows a manual fallback when browser recording is unsupported", async () => {
    const harness = createHarness({ isRecorderSupported: () => false });

    await harness.controller.start(true);

    expect(harness.controller.state.fallbackMessage).toBe(
      "Recording is not supported in this demo browser. Type or paste the transcript manually.",
    );
  });

  it("shows a manual fallback while offline", async () => {
    const harness = createHarness({ isOnline: () => false });

    await harness.controller.start(true);

    expect(harness.controller.state.fallbackMessage).toBe(
      "You are offline. Type or paste the transcript manually.",
    );
  });

  it("shows a manual fallback after a safe endpoint failure", async () => {
    const harness = createHarness({
      requestTranscription: async () => {
        throw new Error("endpoint unavailable");
      },
    });

    await harness.controller.start(true);
    harness.recorder.emitAudio();
    await harness.controller.stop();

    expect(harness.controller.state).toMatchObject({
      fallbackMessage:
        "Audio-to-text is unavailable. Please try again or type/paste the transcript manually.",
      phase: "idle",
    });
  });
});
