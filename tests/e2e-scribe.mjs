import { readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { chromium } from "@playwright/test";

const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
const baseUrl = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";
const notesPath = join(process.cwd(), "data", "notes.json");
const patientsPath = join(process.cwd(), "data", "patients.json");

function isMissingFile(error) {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

async function snapshotFile(filePath) {
  try {
    return { contents: await readFile(filePath), exists: true };
  } catch (error) {
    if (isMissingFile(error)) return { exists: false };
    throw error;
  }
}

async function restoreFile(filePath, snapshot) {
  if (snapshot.exists) {
    await writeFile(filePath, snapshot.contents);
    return;
  }

  try {
    await unlink(filePath);
  } catch (error) {
    if (!isMissingFile(error)) throw error;
  }
}

const [notesSnapshot, patientsSnapshot] = await Promise.all([
  snapshotFile(notesPath),
  snapshotFile(patientsPath),
]);
let browser;

try {
  browser = await chromium.launch({
    ...(executablePath
      ? { executablePath }
      : { channel: process.env.PLAYWRIGHT_CHROMIUM_CHANNEL ?? "chrome" }),
    headless: true,
  });

  const page = await browser.newPage();
  const clientFirstName = `E2E${Date.now()}`;
  const clientLastName = "Fictional";
  const clientDisplayName = `${clientFirstName} ${clientLastName}`;

  await page.goto(`${baseUrl}/record`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /^Record in-person/ }).click();
  await page
    .getByRole("heading", { name: "Record an In-Person Session", exact: true })
    .waitFor();

  await page.goto(`${baseUrl}/record`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /^Record a summary/ }).click();
  await page.getByRole("heading", { name: "Record a Summary", exact: true }).waitFor();
  await page.getByLabel("Session summary").fill("Clinician-entered fictional session summary.");
  await page
    .getByRole("button", { name: "Continue to assign client", exact: true })
    .click();
  await page.getByRole("heading", { name: "Assign Session", exact: true }).waitFor();
  await page.getByText("Dictated Summary", { exact: true }).waitFor();

  await page.goto(`${baseUrl}/record`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /Create empty note/ }).click();
  await page.getByRole("heading", { name: "Assign Session", exact: true }).waitFor();
  await page.getByText("Manual Note", { exact: true }).waitFor();
  await page.getByRole("button", { name: "+ Create New", exact: true }).click();
  await page
    .getByRole("heading", { name: "Create A New Client", exact: true })
    .waitFor();
  await page.getByPlaceholder("Client First Name").fill(clientFirstName);
  await page.getByPlaceholder("Client Last Name").fill(clientLastName);
  await page.getByPlaceholder("Client Email").fill("fictional-e2e@example.com");
  await page
    .getByPlaceholder("Client Mobile Number (e.g. +92 300 1234567)")
    .fill("+92 300 0000000");
  await page.getByRole("button", { name: "Create New Client", exact: true }).click();
  await page.getByText(clientDisplayName, { exact: true }).waitFor();
  await page.getByRole("button", { name: "Next", exact: true }).click();

  await page.getByRole("heading", { name: "Manual note", exact: true }).waitFor();
  await page.getByLabel("Summary").fill("Fictional clinician-authored session summary.");
  await page
    .getByLabel("Chief complaint")
    .fill("Fictional discussion of current wellbeing.");
  await page.getByLabel("History").fill("Fictional background detail");
  await page.getByLabel("Symptoms").fill("Reported stress\nInterrupted sleep");
  await page
    .getByLabel("Assessment discussed")
    .fill("Topics documented for clinician review");
  await page.getByLabel("Plan discussed").fill("Review notes at a future session");
  await page.getByLabel("Medications mentioned").fill("No medications mentioned");
  await page.getByLabel("Follow-up").fill("Arrange a fictional follow-up session");
  await page.getByLabel("Items needing review").fill("Confirm details at follow-up");

  if (await page.getByRole("button", { name: "Refine with AI" }).count()) {
    throw new Error("Manual notes must not offer the Refine with AI control.");
  }
  if (await page.getByPlaceholder("Make modifications to your note here").count()) {
    throw new Error("Manual notes must not render an AI prompt input.");
  }

  await page.getByRole("button", { name: "Approve & Save Note", exact: true }).click();
  await page
    .getByText("Approved & Saved to Patient Record", { exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Back to dashboard" }).click();
  await page.getByText(clientDisplayName, { exact: true }).waitFor();

  await page.goto(`${baseUrl}/record`, { waitUntil: "networkidle" });
  await page.getByText(clientDisplayName, { exact: true }).waitFor();

  console.log("Record entry-flow E2E passed.");
} finally {
  try {
    await browser?.close();
  } finally {
    await Promise.all([
      restoreFile(notesPath, notesSnapshot),
      restoreFile(patientsPath, patientsSnapshot),
    ]);
  }
}
