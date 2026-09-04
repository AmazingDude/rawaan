import { expect, chromium } from "@playwright/test";

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
const browser = await chromium.launch({
  ...(executablePath
    ? { executablePath }
    : { channel: process.env.PLAYWRIGHT_CHROMIUM_CHANNEL ?? "chrome" }),
  headless: true,
});

const manualTranscript = `Chief complaint: Persistent headache
History: Headache for three days
Symptoms: Light sensitivity
Assessment discussed: Clinician discussed monitoring triggers
Plan discussed: Keep a symptom diary
Medications mentioned: None mentioned
Follow up: Return in two weeks
Uncertainties: Duration of each headache episode was not clarified`;

let transcriptionCalls = 0;
let transcriptionMode = "success";
let releaseTranscription;
let transcriptionGate = null;

function delaySuccessfulTranscription() {
  transcriptionMode = "delayed-success";
  transcriptionGate = new Promise((resolve) => {
    releaseTranscription = resolve;
  });
}

function releaseSuccessfulTranscription() {
  releaseTranscription?.();
  releaseTranscription = undefined;
  transcriptionGate = null;
}

async function configureVoicePage() {
  const page = await browser.newPage();

  await page.addInitScript(() => {
    window.__voiceE2EMediaMode = "success";

    class MockMediaRecorder extends EventTarget {
      start() {}

      stop() {
        this.dispatchEvent(
          new BlobEvent("dataavailable", {
            data: new Blob(["fictional demo recording"], { type: "audio/webm" }),
          }),
        );
        this.dispatchEvent(new Event("stop"));
      }
    }

    Object.defineProperty(window, "MediaRecorder", {
      configurable: true,
      value: MockMediaRecorder,
    });
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: {
        getUserMedia: async () => {
          if (window.__voiceE2EMediaMode === "permission-denied") {
            const error = new Error("Simulated microphone denial.");
            error.name = "NotAllowedError";
            throw error;
          }

          return { getTracks: () => [{ stop() {} }] };
        },
      },
    });
    Object.defineProperty(navigator, "onLine", {
      configurable: true,
      get: () => true,
    });
  });

  await page.route("**/api/transcribe", async (route) => {
    transcriptionCalls += 1;

    if (transcriptionMode === "delayed-success") {
      await transcriptionGate;
    }

    if (transcriptionMode === "endpoint-failure") {
      await route.fulfill({
        body: JSON.stringify({
          code: "transcription_failed",
          message:
            "Audio-to-text is unavailable. Please try again or type/paste the transcript manually.",
          ok: false,
        }),
        contentType: "application/json",
        status: 503,
      });
      return;
    }

    await route.fulfill({
      body: JSON.stringify({ ok: true, transcript: manualTranscript }),
      contentType: "application/json",
      status: 200,
    });
  });

  await page.goto("http://127.0.0.1:3000/record", { waitUntil: "networkidle" });
  await expect(page.getByText("Current mode: Local demo parser")).toBeVisible();

  return page;
}

async function completeScribeFlow(page, patientSuffix) {
  await page.getByLabel("Fictional patient ID").fill(`patient-voice-${patientSuffix}`);
  await page.getByLabel("Display name").fill(`Voice Demo ${patientSuffix}`);
  await page.getByLabel("Consultation date").fill("2026-08-25");

  await page.getByRole("button", { name: "Create structured draft" }).click();
  await expect(
    page.getByText(
      "Draft created with the local demo parser. Review every field before approval.",
    ),
  ).toBeVisible();

  await page
    .getByRole("textbox", { name: "Chief complaint", exact: true })
    .fill(`Persistent headache — ${patientSuffix} reviewed`);
  await page.getByRole("button", { name: "Approve and save" }).click();
  await expect(page.getByText("Approved note saved", { exact: true })).toBeVisible();

  const recordId = await page.locator(".success-card p").first().textContent();
  expect(recordId).toMatch(/^Record ID: /);
}

try {
  const successPage = await configureVoicePage();
  try {
    const transcriptField = successPage.getByLabel("Scripted or manually entered transcript");
    const recordControl = successPage.getByRole("button", {
      name: "Record consultation",
    });

    await expect(recordControl).toBeDisabled();
    await successPage
      .getByText("Patient consented to recording", { exact: true })
      .click();
    await expect(recordControl).toBeEnabled();

    delaySuccessfulTranscription();
    await recordControl.click();
    await expect(successPage.getByText(/^Recording 00:0/)).toBeVisible();
    await successPage.getByRole("button", { name: "Stop recording" }).click();
    await expect(successPage.getByText("Transcribing…")).toBeVisible();
    await expect(transcriptField).toHaveValue("");
    await expect(successPage.getByText("Partial transcript")).toHaveCount(0);
    expect(transcriptionCalls).toBe(1);

    releaseSuccessfulTranscription();
    await expect(transcriptField).toHaveValue(manualTranscript);
    await expect(successPage.getByText("Transcribing…")).toHaveCount(0);
    await completeScribeFlow(successPage, "success");
  } finally {
    releaseSuccessfulTranscription();
    await successPage.close();
  }

  transcriptionMode = "success";
  const permissionPage = await configureVoicePage();
  try {
    const callsBeforePermissionFallback = transcriptionCalls;
    await permissionPage.evaluate(() => {
      window.__voiceE2EMediaMode = "permission-denied";
    });
    await permissionPage
      .getByText("Patient consented to recording", { exact: true })
      .click();
    await permissionPage.getByRole("button", { name: "Record consultation" }).click();
    await expect(
      permissionPage.getByText(
        "Microphone permission was not granted. Type or paste the transcript manually.",
      ),
    ).toBeVisible();
    expect(transcriptionCalls).toBe(callsBeforePermissionFallback);

    await permissionPage
      .getByLabel("Scripted or manually entered transcript")
      .fill(manualTranscript);
    await completeScribeFlow(permissionPage, "permission");
  } finally {
    await permissionPage.close();
  }

  transcriptionMode = "endpoint-failure";
  const failurePage = await configureVoicePage();
  try {
    await failurePage
      .getByText("Patient consented to recording", { exact: true })
      .click();
    await failurePage.getByRole("button", { name: "Record consultation" }).click();
    await failurePage.getByRole("button", { name: "Stop recording" }).click();
    await expect(
      failurePage.getByText(
        "Audio-to-text is unavailable. Please try again or type/paste the transcript manually.",
      ),
    ).toBeVisible();

    await failurePage
      .getByLabel("Scripted or manually entered transcript")
      .fill(manualTranscript);
    await completeScribeFlow(failurePage, "endpoint");
  } finally {
    await failurePage.close();
  }

  expect(transcriptionCalls).toBe(2);
  console.log("Voice Scribe E2E passed: mocked success, permission fallback, and endpoint fallback.");
} finally {
  await browser.close();
}
