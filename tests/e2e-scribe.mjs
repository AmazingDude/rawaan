import { chromium } from "@playwright/test";

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;

const browser = await chromium.launch({
  ...(executablePath ? { executablePath } : {}),
  headless: true,
});

try {
  const page = await browser.newPage();

  await page.goto("http://127.0.0.1:3000/record", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Record in-person", exact: true }).click();
  await page
    .getByRole("heading", { name: "Record an In-Person Session", exact: true })
    .waitFor();

  await page.goto("http://127.0.0.1:3000/record", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Record a summary", exact: true }).click();
  await page.getByRole("heading", { name: "Record a Summary", exact: true }).waitFor();
  await page.getByLabel("Session summary").fill("Clinician-entered session summary.");
  await page
    .getByRole("button", { name: "Continue to assign client", exact: true })
    .click();
  await page.getByRole("heading", { name: "Assign Session", exact: true }).waitFor();
  await page.getByText("Dictated Summary", { exact: true }).waitFor();

  await page.goto("http://127.0.0.1:3000/record", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Create empty note", exact: true }).click();
  await page.getByRole("heading", { name: "Assign Session", exact: true }).waitFor();
  await page.getByText("Manual Note", { exact: true }).waitFor();

  console.log("Record entry-flow E2E passed.");
} finally {
  await browser.close();
}
