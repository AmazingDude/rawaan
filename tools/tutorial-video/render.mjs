import { createRequire } from "node:module";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
import { resolveChrome } from "./browser.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const require = createRequire(resolve(root, "package.json"));
const { chromium } = require("@playwright/test");
const chrome = await resolveChrome(chromium);
const cli = resolve(here, "node_modules/hyperframes/bin/hyperframes.mjs");
const ids = process.argv.filter(arg => ["first-session", "past-sessions", "rawaan-ai", "overview"].includes(arg));
const tutorials = ids.length ? ids : ["first-session", "past-sessions", "rawaan-ai", "overview"];
const postersOnly = process.argv.includes("--posters-only");
const browser = await chromium.launch({ executablePath: chrome, headless: true });

async function command(args, logName) {
  const output = [];
  let partial = "", lastPercent = -10;
  const environment = { ...process.env, DO_NOT_TRACK: "1", HYPERFRAMES_NO_TELEMETRY: "1" };
  // HyperFrames manages its supported headless-shell revision separately from
  // Playwright. Windows GUI Chrome cannot satisfy its --version probe.
  if (process.env.TUTORIAL_HYPERFRAMES_CHROME) environment.HYPERFRAMES_BROWSER_PATH = process.env.TUTORIAL_HYPERFRAMES_CHROME;
  else delete environment.HYPERFRAMES_BROWSER_PATH;
  await new Promise((resolveRun, reject) => {
    const child = spawn(process.execPath, [cli, ...args], {
      cwd: here, windowsHide: true,
      env: environment,
    });
    child.stdout.on("data", chunk => {
      output.push(chunk);
      if (args[0] !== "render") return;
      partial += chunk.toString();
      const lines = partial.split("\n"); partial = lines.pop();
      for (const line of lines) {
        if (!line.startsWith("@hf-progress ")) continue;
        const progress = JSON.parse(line.slice(13));
        if (progress.pct >= lastPercent + 10) { console.log(`HyperFrames ${progress.code}: ${progress.pct}%`); lastPercent = progress.pct; }
      }
    });
    child.stderr.on("data", chunk => { output.push(chunk); });
    child.once("error", reject);
    child.once("exit", code => code === 0 ? resolveRun() : reject(new Error(`HyperFrames ${args[0]} failed with exit ${code}.`)));
  }).finally(() => writeFile(resolve(root, "plans/2026-10-08-visual-onboarding", logName), Buffer.concat(output)));
  console.log(`HyperFrames ${args[0]} complete; ${logName} saved.`);
}

try {
  for (const id of tutorials) {
    const directory = resolve(here, "compositions", id);
    const storyboard = JSON.parse(await readFile(resolve(directory, "storyboard.json"), "utf8"));
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    await page.goto(pathToFileURL(resolve(directory, "index.html")).href);
    await page.waitForFunction(() => Object.values(window.__timelines || {}).length > 0);
    const at = storyboard.scenes[0].start + 2;
    await page.evaluate(({ id, at }) => {
      const root = document.querySelector("[data-composition-id]");
      root.style.width = "1920px"; root.style.height = "1080px";
      document.querySelectorAll(".clip").forEach(element => {
        const start = Number(element.dataset.start), end = start + Number(element.dataset.duration);
        element.style.visibility = at >= start && at < end ? "visible" : "hidden";
      });
      window.__timelines[id].seek(at);
    }, { id, at });
    await page.screenshot({ path: resolve(root, "public/tutorials", `${id}.jpg`), type: "jpeg", quality: 88 });
    await page.close();
    if (postersOnly) continue;
    if (!storyboard.narrated) throw new Error(`${id} is not narrated. Run produce.mjs with Groq access before rendering final videos.`);
    const sampleTimes = storyboard.scenes.map(scene => scene.start + Math.min(2, scene.duration / 2)).join(",");
    await command(["check", directory, "--at", sampleTimes, "--json"], `${id}-check.json`);
    await command(["render", directory, "--output", resolve(root, "public/tutorials", `${id}.mp4`), "--fps", "24", "--quality", "delivery", "--crf", "22", "--workers", "2", "--strict"], `${id}-render.log`);
  }
} finally { await browser.close(); }
