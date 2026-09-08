import { access, readdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

export async function resolveChrome(chromium) {
  if (process.env.TUTORIAL_CHROME) { await access(process.env.TUTORIAL_CHROME); return process.env.TUTORIAL_CHROME; }
  const expected = chromium.executablePath();
  try { await access(expected); return expected; } catch { /* Check installed Playwright revisions before downloading another browser. */ }
  if (process.platform === "win32") {
    const cache = dirname(dirname(dirname(expected)));
    const revisions = (await readdir(cache)).filter(name => /^chromium-\d+$/.test(name)).sort((a, b) => Number(b.split("-")[1]) - Number(a.split("-")[1]));
    for (const revision of revisions) {
      const candidate = resolve(cache, revision, "chrome-win64/chrome.exe");
      try { await access(candidate); return candidate; } catch { /* Try the next installed revision. */ }
    }
  }
  throw new Error("No installed Playwright Chromium found. Install it or set TUTORIAL_CHROME to an existing Chromium executable.");
}
