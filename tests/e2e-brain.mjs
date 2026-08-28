import { readFile, writeFile } from "node:fs/promises";

import { chromium } from "@playwright/test";

const notesPath = new URL("../data/notes.json", import.meta.url);

const seedNotes = [
  {
    id: "fictional-note-amina-1",
    patient_id: "fictional-amina",
    patient_display_name: "Fictional Amina Khan",
    consultation_date: "2026-06-01",
    chief_complaint: "Chest pain on exertion",
    history: [],
    symptoms: ["chest pain"],
    assessment_discussed: ["Exertional chest pain"],
    plan_discussed: ["Cardiology referral"],
    medications_mentioned: [],
    follow_up: "Follow-up in two weeks with symptom diary.",
    uncertainties: [],
    raw_transcript:
      "Patient reported chest pain when climbing stairs. Advised ECG and symptom diary. Follow-up in two weeks.",
    approval_status: "approved",
    approved_at: "2026-06-01T10:00:00.000Z",
  },
];

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;

const browser = await chromium.launch({
  ...(executablePath ? { executablePath } : {}),
  headless: true,
});

const originalNotes = await readFile(notesPath, "utf8");

try {
  await writeFile(notesPath, JSON.stringify(seedNotes, null, 2));

  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto("http://127.0.0.1:3000/rawaan-ai", { waitUntil: "networkidle" });

  await page.locator(".brain-chat-controls .select-input").selectOption("fictional-amina");
  await page.locator(".patient-context-header").waitFor();

  const ask = async (question) => {
    await page.locator(".brain-chat-input").fill(question);
    await page.locator(".brain-chat-input-row .primary-button").click();
  };
  const waitEntries = (n) =>
    page.waitForFunction(
      (count) => document.querySelectorAll(".brain-chat-entry").length === count,
      n,
      { timeout: 60000 },
    );

  // 1. Supported answer with the exact returned source date.
  await ask("Has this patient mentioned chest pain before?");
  await waitEntries(1);
  await page.locator(".brain-chat-body.is-supported").first().waitFor();
  const citation = (
    await page.locator(".brain-chat-citation-chip").first().textContent()
  )?.trim();
  if (!citation?.includes("2026-06-01")) {
    throw new Error(`Supported citation missing source date: ${citation}`);
  }
  console.log("supported with source date:", citation);

  // 2. Deliberately absent fact -> no-record.
  await ask("What was her blood pressure in March?");
  await waitEntries(2);
  await page.locator(".brain-chat-body.is-no-record").first().waitFor();
  console.log("no-record: OK");

  // 3. Treatment question -> refused.
  await ask("What medication should we prescribe?");
  await waitEntries(3);
  await page.locator(".brain-chat-body.is-refused").first().waitFor();
  console.log("treatment refused: OK");

  // 4. General-medical question -> distinct refusal.
  await ask("What is the standard treatment for hypertension?");
  await waitEntries(4);
  const refusedCount = await page.locator(".brain-chat-body.is-refused").count();
  if (refusedCount !== 2) {
    throw new Error(`Expected 2 refusal cards, got ${refusedCount}`);
  }
  console.log("general-medical refused (distinct): OK");

  // 5. New chat clears the thread only.
  await page.locator(".brain-chat-controls .ghost-button").click();
  await page.waitForFunction(() => document.querySelectorAll(".brain-chat-entry").length === 0, {
    timeout: 5000,
  });
  console.log("new chat cleared thread: OK");

  // 6. A later supported question is independent of the cleared thread.
  await ask("Has this patient mentioned chest pain before?");
  await waitEntries(1);
  await page.locator(".brain-chat-body.is-supported").first().waitFor();
  console.log("later supported independent: OK");

  console.log("Brain E2E flow passed.");
} finally {
  await writeFile(notesPath, originalNotes);
  await browser.close();
}
