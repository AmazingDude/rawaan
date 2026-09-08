import assert from "node:assert/strict";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const run = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const ffprobe = process.env.TUTORIAL_FFPROBE || "ffprobe";
const ffmpeg = process.env.TUTORIAL_FFMPEG || "ffmpeg";
const timing = JSON.parse(await readFile(resolve(root, "lib/guides/media-timing.json"), "utf8"));
const directory = resolve(root, "plans/2026-10-08-visual-onboarding/frames");
await mkdir(directory, { recursive: true });
const results = [];
function seconds(time) { const [h, m, s] = time.split(":").map(Number); return h * 3600 + m * 60 + s; }
for (const [id, metadata] of Object.entries(timing)) {
  const path = resolve(root, "public/tutorials", `${id}.mp4`);
  const { stdout } = await run(ffprobe, ["-v", "error", "-show_format", "-show_streams", "-of", "json", path], { windowsHide: true });
  const probe = JSON.parse(stdout);
  const video = probe.streams.find(stream => stream.codec_type === "video");
  const audio = probe.streams.find(stream => stream.codec_type === "audio");
  assert.equal(video.width, 1920); assert.equal(video.height, 1080);
  assert.equal(video.codec_name, "h264"); assert.equal(audio.codec_name, "aac");
  assert.equal(video.avg_frame_rate, "24/1");
  assert.ok(Math.abs(Number(probe.format.duration) - metadata.durationSeconds) < .15, `${id} duration mismatch`);
  const captions = await readFile(resolve(root, "public/tutorials", `${id}.vtt`), "utf8");
  assert.ok(captions.startsWith("WEBVTT"));
  const cues = [...captions.matchAll(/(\d\d:\d\d:\d\d\.\d\d\d) --> (\d\d:\d\d:\d\d\.\d\d\d)\n([^\n]+)/g)];
  assert.ok(cues.length > 0);
  let previousEnd = 0;
  for (const cue of cues) {
    const start = seconds(cue[1]), end = seconds(cue[2]);
    assert.ok(start >= previousEnd - .002 && end > start && end <= metadata.durationSeconds + .01);
    previousEnd = end;
  }
  const transcript = (await readFile(resolve(root, "public/tutorials", `${id}.txt`), "utf8")).replace(/\s+/g, " ").trim();
  assert.equal(cues.map(cue => cue[3]).join(" ").replace(/\s+/g, " ").trim(), transcript, `${id} captions differ from the narration script`);
  const storyboard = JSON.parse(await readFile(resolve(root, "tools/tutorial-video/compositions", id, "storyboard.json"), "utf8"));
  assert.equal(storyboard.narrated, true);
  for (const [index, scene] of storyboard.scenes.entries()) {
    const at = scene.start + Math.min(2, scene.duration / 2);
    await run(ffmpeg, ["-y", "-v", "error", "-ss", String(at), "-i", path, "-frames:v", "1", resolve(directory, `${id}-${index}.jpg`)], { windowsHide: true });
  }
  results.push({ id, duration: Number(probe.format.duration), width: video.width, height: video.height, fps: video.avg_frame_rate, audio: audio.codec_name, bytes: Number(probe.format.size), captionCues: cues.length, sampledScenes: storyboard.scenes.length });
  console.log(`PASS ${id}: 1080p H.264/AAC, 24fps, ${probe.format.duration}s, ${cues.length} synchronized caption cues.`);
}
await writeFile(resolve(root, "plans/2026-10-08-visual-onboarding/media-verification.json"), JSON.stringify(results, null, 2));
