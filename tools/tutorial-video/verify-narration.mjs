// Optional production QA. Sends only generated tutorial narration to Groq ASR,
// never recordings or patient data. This is not part of app runtime or CI.
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const ffmpeg = process.env.TUTORIAL_FFMPEG || "ffmpeg";
const results = [];
const normalize = text => text.toLowerCase().replace(/rawa+a?n|ravan|rawan/g, "rawaan").replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean);
function distance(a, b) {
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 0; i < a.length; i++) {
    const current = [i + 1];
    for (let j = 0; j < b.length; j++) current[j + 1] = Math.min(current[j] + 1, previous[j + 1] + 1, previous[j] + Number(a[i] !== b[j]));
    previous = current;
  }
  return previous[b.length];
}
if (!process.env.GROQ_API_KEY) throw new Error("GROQ_API_KEY is needed for optional narration QA.");
for (const id of ["first-session", "past-sessions", "rawaan-ai", "overview"]) {
  const mp3 = resolve(root, "plans/2026-10-08-visual-onboarding", `${id}-narration.mp3`);
  await run(ffmpeg, ["-y", "-v", "error", "-i", resolve(root, "public/tutorials", `${id}.mp4`), "-vn", "-c:a", "libmp3lame", "-b:a", "96k", mp3], { windowsHide: true });
  const data = new FormData(); data.append("file", new Blob([await readFile(mp3)], { type: "audio/mpeg" }), `${id}.mp3`);
  data.append("model", "whisper-large-v3"); data.append("language", "en"); data.append("response_format", "json");
  const response = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", { method: "POST", headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` }, body: data, signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`Narration QA failed: Groq HTTP ${response.status}.`);
  const recognized = (await response.json()).text;
  const expected = await readFile(resolve(root, "public/tutorials", `${id}.txt`), "utf8");
  const words = normalize(expected), errorRate = distance(words, normalize(recognized)) / words.length;
  assert.ok(errorRate < .15, `${id} speech differs materially from the caption script (${Math.round(errorRate * 100)}% word difference).`);
  results.push({ id, language: "en", expectedWords: words.length, wordDifference: Math.round(errorRate * 1000) / 1000, recognized });
  console.log(`PASS ${id}: English speech recognized, ${(errorRate * 100).toFixed(1)}% word difference from the caption script.`);
}
await writeFile(resolve(root, "plans/2026-10-08-visual-onboarding/narration-verification.json"), JSON.stringify(results, null, 2));
