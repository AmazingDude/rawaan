import { createRequire } from "node:module";
import { readFile, writeFile, mkdir, copyFile, access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../..");
const require = createRequire(resolve(root, "package.json"));
const { build } = require("esbuild");
const bundled = await build({ entryPoints: [resolve(root, "lib/guides/tutorials.ts")], bundle: true, write: false, platform: "node", format: "esm" });
const { tutorials, overview } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString("base64")}`);
const ffmpeg = process.env.TUTORIAL_FFMPEG || "ffmpeg";
const ffprobe = process.env.TUTORIAL_FFPROBE || "ffprobe";
const voice = "hannah";
const model = "canopylabs/orpheus-v1-english";
const prepareOnly = process.argv.includes("--prepare-only");
const shots = JSON.parse(await readFile(resolve(here, "captures/shots.json"), "utf8"));
const sequences = {
  "first-session": [["record"], ["setup", "microphone"], ["recording"], ["assign", "create-client", "assigned"], ["draft", "transcript", "edit"], ["approved", "clients", "sessions", "saved-note"]],
  "past-sessions": [["clients"], ["sessions", "saved-note"], ["transcript", "session-info"]],
  "rawaan-ai": [["ai", "general-answer"], ["records-answer", "records-source"], ["ai", "clinical-context"], ["proposed-plan", "review-plan", "saved-plan"]],
  overview: [["record", "recording", "assigned", "draft", "approved", "clients", "ai"]],
};
const available = async path => { try { await access(path); return true; } catch { return false; } };
const escape = text => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");
const round = n => Math.round(n * 1000) / 1000;
const timecode = n => { const ms = Math.round(n * 1000); return `${String(Math.floor(ms / 3600000)).padStart(2, "0")}:${String(Math.floor(ms / 60000) % 60).padStart(2, "0")}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}.${String(ms % 1000).padStart(3, "0")}`; };
await mkdir(resolve(here, "audio-cache"), { recursive: true });

// Groq's documented Orpheus input limit is 200 characters. Split at sentence
// boundaries, then at words when necessary. Cache only generated audio, no keys.
function chunks(paragraph) {
  const sentences = paragraph.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [paragraph];
  const result = [];
  for (const sentence of sentences) {
    let current = "";
    for (const word of sentence.trim().split(/\s+/)) {
      if ((current + " " + word).trim().length > 200) { result.push(current); current = word; }
      else current = (current + " " + word).trim();
    }
    if (current) result.push(current);
  }
  return result;
}
async function speech(text) {
  const digest = createHash("sha256").update(JSON.stringify({ model, voice, text })).digest("hex").slice(0, 20);
  const output = resolve(here, "audio-cache", `${digest}.wav`);
  if (await available(output)) return output;
  if (!process.env.GROQ_API_KEY) throw new Error("GROQ_API_KEY is required in .env.local for narration generation.");
  for (let attempt = 0; attempt < 5; attempt++) {
    const response = await fetch("https://api.groq.com/openai/v1/audio/speech", {
      method: "POST", signal: AbortSignal.timeout(60000),
      headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, voice, input: text, response_format: "wav" }),
    });
    if (response.status === 429 && attempt < 4) {
      const seconds = Math.min(30, Math.max(2, Number(response.headers.get("retry-after")) || (attempt + 1) * 5));
      console.log(`Narration rate limit: retrying in ${seconds}s.`);
      await new Promise(r => setTimeout(r, seconds * 1000)); continue;
    }
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      // Print the error category only, never provider payloads or credentials.
      throw new Error(`Groq narration failed: HTTP ${response.status}, ${payload.error?.code || "check model access in Groq Console"}.`);
    }
    const data = Buffer.from(await response.arrayBuffer());
    if (data.toString("ascii", 0, 4) !== "RIFF") throw new Error("Groq did not return a valid WAV file.");
    await writeFile(output, data); return output;
  }
  throw new Error("Groq narration retry limit reached.");
}
async function duration(path) {
  const { stdout } = await run(ffprobe, ["-v", "error", "-show_entries", "format=duration", "-of", "json", path], { windowsHide: true });
  return Number(JSON.parse(stdout).format.duration);
}

const timing = {};
for (const tutorial of [...tutorials, overview]) {
  const directory = resolve(here, "compositions", tutorial.id);
  await mkdir(resolve(directory, "assets"), { recursive: true });
  await copyFile(resolve(root, "app/fonts/onest-variable.ttf"), resolve(directory, "assets/onest.ttf"));
  await copyFile(resolve(root, "public/images/rawaan-mascot.png"), resolve(directory, "assets/mascot.png"));
  await copyFile(resolve(here, "node_modules/gsap/dist/gsap.min.js"), resolve(directory, "assets/gsap.min.js"));
  const chapters = [], cues = [], scenes = [];
  let clock = 0;
  for (let index = 0; index < tutorial.transcript.length; index++) {
    const sentences = chunks(tutorial.transcript[index]);
    const pieces = [];
    let voiceDuration = 0;
    for (const text of prepareOnly ? [] : sentences) {
      const path = await speech(text);
      const seconds = await duration(path);
      pieces.push(path);
      cues.push({ start: round(clock + voiceDuration + .35), end: round(clock + voiceDuration + .35 + seconds), text });
      voiceDuration += seconds;
    }
    const chapterPath = resolve(directory, "assets", `voice-${index}.wav`);
    const list = resolve(directory, "assets", `voice-${index}.txt`);
    if (!prepareOnly) {
      await writeFile(list, pieces.map(path => `file '${path.replaceAll("\\", "/").replaceAll("'", "'\\''")}'`).join("\n"));
      await run(ffmpeg, ["-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", list, "-af", "loudnorm=I=-16:TP=-1.5:LRA=7", "-ar", "48000", chapterPath], { windowsHide: true });
    }
    const idealStart = tutorial.chapters[index]?.startSeconds ?? 0;
    const idealEnd = tutorial.chapters[index + 1]?.startSeconds ?? tutorial.durationSeconds;
    const length = round(Math.max(idealEnd - idealStart, voiceDuration + 1.05));
    chapters.push({ id: tutorial.chapters[index]?.id ?? "overview", title: tutorial.chapters[index]?.title ?? tutorial.title, start: round(clock), duration: length, audioDuration: prepareOnly ? 0 : round(await duration(chapterPath)) });
    const ids = sequences[tutorial.id][index];
    for (let shotIndex = 0; shotIndex < ids.length; shotIndex++) {
      const id = ids[shotIndex];
      await copyFile(resolve(here, "captures", `${id}.png`), resolve(directory, "assets", `${id}.png`));
      const shot = shots.find(item => item.id === id);
      const start = round(clock + length * shotIndex / ids.length);
      const sceneDuration = round(length / ids.length);
      scenes.push({ id, start, duration: sceneDuration, title: chapters[index].title, number: index + 1, focus: shot?.focus });
    }
    clock += length;
    console.log(`${prepareOnly ? "Prepared visual" : "Narrated"} ${tutorial.id} chapter ${index + 1}: ${length}s.`);
  }
  const total = round(clock);
  timing[tutorial.id] = { durationSeconds: total, chapters: Object.fromEntries(chapters.map(c => [c.id, c.start])) };
  const vtt = "WEBVTT\n\n" + cues.map((cue, index) => `${index + 1}\n${timecode(cue.start)} --> ${timecode(cue.end)}\n${cue.text}\n`).join("\n");
  if (!prepareOnly) await writeFile(resolve(root, "public/tutorials", `${tutorial.id}.vtt`), vtt);
  await writeFile(resolve(root, "public/tutorials", `${tutorial.id}.txt`), tutorial.transcript.join("\n\n") + "\n");
  const sceneMarkup = scenes.map((scene, index) => {
    const focus = scene.focus;
    const box = focus ? `left:${focus.x}px;top:${focus.y}px;width:${focus.width}px;height:${focus.height}px` : "display:none";
    const cursor = focus ? `left:${focus.x + focus.width * .78}px;top:${focus.y + focus.height * .65}px` : "display:none";
    return `<section class="clip scene" id="scene-${index}" data-start="${scene.start}" data-duration="${scene.duration}" data-track-index="1"><div class="scene-body" id="body-${index}"><div class="heading"><span class="step">${String(scene.number).padStart(2, "0")}</span><h1>${escape(scene.title)}</h1><span class="label">${escape(tutorial.title)}</span></div><div class="screen"><div class="capture"><img src="assets/${scene.id}.png" alt="Rawaan ${escape(scene.title)} screen" width="1440" height="800"/><div class="focus" id="focus-${index}" style="${box}"></div><svg class="cursor" id="cursor-${index}" style="${cursor}" width="30" height="38" viewBox="0 0 30 38" aria-hidden="true"><path d="M3 2v30l8-8 6 12 5-3-6-11 11-1Z" fill="white" stroke="#004f43" stroke-width="2.5"/></svg></div></div></div></section>`;
  }).join("\n");
  const tweens = scenes.map((scene, index) => `tl.fromTo("#body-${index}",{opacity:0},{opacity:1,duration:.25},${scene.start});tl.fromTo("#focus-${index}",{opacity:0},{opacity:1,duration:.2},${scene.start + .65});tl.fromTo("#cursor-${index}",{x:25,y:20,opacity:0},{x:0,y:0,opacity:1,duration:.65,ease:"power2.out"},${scene.start + .25});tl.fromTo("#focus-${index}",{scale:1},{scale:1.035,immediateRender:false,duration:.5,repeat:1,yoyo:true},${scene.start + 1.2});`).join("\n");
  const audioMarkup = chapters.filter(chapter => chapter.audioDuration > 0).map((chapter, index) => `<audio id="voice-${index}" src="assets/voice-${index}.wav" data-start="${chapter.start + .35}" data-duration="${chapter.audioDuration}" data-track-index="2"></audio>`).join("\n");
  const html = `<!doctype html><html lang="en"><head><meta charset="UTF-8"/><title>${escape(tutorial.title)} · Rawaan</title><script src="assets/gsap.min.js"></script><style>@font-face{font-family:Onest;src:url(assets/onest.ttf);font-weight:100 900}*{box-sizing:border-box}body{margin:0;font-family:Onest,system-ui,sans-serif;color:#133c33;background:#edf2eb}#root{position:relative;width:100%;height:100%;overflow:hidden}.brand{position:absolute;left:46px;top:22px;display:flex;align-items:center;gap:3px;font-size:28px;font-weight:700;z-index:5}.brand img{width:53px;height:40px;object-fit:contain}.training{position:absolute;right:46px;top:33px;font-size:15px;letter-spacing:.03em;color:#36584b;z-index:5}.scene{position:absolute;inset:0;padding:89px 46px 53px}.scene-body{height:100%;display:flex;flex-direction:column;gap:18px}.heading{display:flex;align-items:center;gap:15px;height:65px;flex-shrink:0}.heading h1{font-size:33px;letter-spacing:-.035em;margin:0}.step{display:grid;place-items:center;width:46px;height:46px;border-radius:14px;background:#cfe5d7;font-size:18px;font-weight:700}.label{margin-left:auto;border:1px solid #bfd2c4;border-radius:30px;padding:10px 17px;font-size:17px}.screen{flex:1;min-height:0;display:flex;justify-content:center;align-items:center}.capture{position:relative;flex-shrink:0;width:1440px;height:800px;border-radius:18px;overflow:hidden;box-shadow:0 8px 35px #174a3520}.capture>img{width:100%;height:100%;display:block}.focus{position:absolute;border:3px solid #00a48e;border-radius:10px;box-shadow:0 0 0 5px #00a48e22;pointer-events:none}.cursor{position:absolute;filter:drop-shadow(0 2px 3px #003b3530)}.footer{position:absolute;bottom:18px;left:46px;font-size:14px;color:#496356;letter-spacing:.02em}</style></head><body><div id="root" data-composition-id="${tutorial.id}" data-start="0" data-width="1920" data-height="1080" data-duration="${total}" data-fps="24"><div class="brand"><img src="assets/mascot.png" alt=""/>rawaan</div><div class="training">Fictional training example</div>${sceneMarkup}${audioMarkup}<div class="footer">Record. Assign. Review. Save. · English captions available</div></div><script>document.fonts.ready.then(()=>{const tl=gsap.timeline({paused:true});${tweens}window.__timelines=window.__timelines||{};window.__timelines["${tutorial.id}"]=tl;});</script></body></html>`;
  await writeFile(resolve(directory, "index.html"), html);
  await writeFile(resolve(directory, "storyboard.json"), JSON.stringify({ title: tutorial.title, total, chapters, scenes, cues, voice, model, narrated: !prepareOnly }, null, 2));
  await writeFile(resolve(directory, "hyperframes.json"), JSON.stringify({ name: tutorial.id, version: "1.0.0" }, null, 2));
  console.log(`Prepared ${tutorial.id}: ${total}s, ${scenes.length} scenes.`);
}
if (!prepareOnly) await writeFile(resolve(root, "lib/guides/media-timing.json"), JSON.stringify(timing, null, 2) + "\n");
console.log(prepareOnly ? "Editable visual compositions ready for inspection. Narration is pending." : "Narration, captions, and editable HyperFrames compositions ready.");
