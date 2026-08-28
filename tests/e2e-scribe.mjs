import { chromium } from "@playwright/test";

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;

const browser = await chromium.launch({
  ...(executablePath ? { executablePath } : {}),
  headless: true,
});

try {
  const page = await browser.newPage();
  await page.goto("http://127.0.0.1:3000/record", { waitUntil: "networkidle" });

  await page.getByLabel("Fictional patient ID").fill("patient-amina-001");
  await page.getByLabel("Display name").fill("Amina Khan");
  await page.getByLabel("Consultation date").fill("2026-08-22");
  await page
    .getByLabel("Scripted or manually entered transcript")
    .fill(`Chief complaint: Persistent headache
History: Headache for three days
Symptoms: Light sensitivity
Assessment discussed: Clinician discussed monitoring triggers
Plan discussed: Keep a symptom diary
Medications mentioned: None mentioned
Follow up: Return in two weeks
Uncertainties: Duration of each headache episode was not clarified`);

  await page.getByRole("button", { name: "Create structured draft" }).click();
  await page.getByText(
    "Draft created with the local demo parser. Review every field before approval.",
  ).waitFor();

  await page
    .getByRole("textbox", { name: "Chief complaint", exact: true })
    .fill("Persistent headache — reviewed");
  await page.getByRole("button", { name: "Approve and save" }).click();
  await page.getByText("Approved note saved", { exact: true }).waitFor();

  const recordId = await page.locator(".success-card p").first().textContent();
  if (!recordId?.startsWith("Record ID: ")) {
    throw new Error("Approval confirmation did not include a persisted note ID.");
  }

  console.log("Scribe E2E flow passed:", recordId);
} finally {
  await browser.close();
}
