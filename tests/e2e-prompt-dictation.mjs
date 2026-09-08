// Actual note assistant and native MediaRecorder; synthetic audio, mocked transcription, fictional seed only.
import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolveChrome } from "../tools/tutorial-video/browser.mjs";
const require = createRequire(import.meta.url);
const { build } = require("esbuild");
const { chromium, expect } = require("@playwright/test");
const training = JSON.parse(await readFile("data/seed/tutorial-session.json", "utf8"));
const fixture = JSON.parse(await readFile("data/seed/prompt-dictation.json", "utf8"));
const trainingWave = (await readFile("data/seed/prompt-dictation-training.wav")).toString("base64");
const output = "plans/2026-10-21-prompt-dictation";
await mkdir(output, { recursive: true });
const actions = `window.voiceRequests=[];
export async function modifyNoteAction(input){window.voiceRequests.push({kind:"modify",prompt:input.prompt});return {ok:true,assistantReply:"Training draft reviewed.",updatedNote:input.note};}
export async function sendAgentMessageAction(input){window.voiceRequests.push({kind:"agent",prompt:input.question});return {ok:true,response:{status:"agent",answer:"Training session response.",category:"general",sources:[],notice:null,clinical:null},timestamp:"2026-10-08T09:00:00.000Z",threadId:"training-thread",persisted:true};}
export async function getClientDetailAction(){return {client:${JSON.stringify(training.client)},notes:[]};}
export async function listClinicalPlansAction(){return [];}
export async function approveDraftAction(){throw Error("Unexpected write");}
export async function reviewClinicalPlanAction(){throw Error("Unexpected write");}
export async function translateTranscriptToUrduAction(){throw Error("Unexpected translation");}
export async function translateNoteToUrduAction(){throw Error("Unexpected translation");}
`;
const bundled = await build({ stdin: { contents: `
import React from "react";import {createRoot} from "react-dom/client";import {SessionWorkspaceView} from "./app/components/session-workspace-view";import "./app/globals.css";
const training=${JSON.stringify(training)};const root=createRoot(document.getElementById("root"));let sequence=0;
window.showVoiceWorkspace=(approved=false)=>root.render(<SessionWorkspaceView key={++sequence} draft={approved?{...training.draft,id:"training-approved-note",approval_status:"approved",approved_at:training.draft.session_info.recorded_at}:training.draft} onBack={()=>root.render(<p>Workspace closed</p>)}/>);
window.showVoiceWorkspace();`, resolveDir: process.cwd(), loader: "tsx" },
  jsx: "automatic", bundle: true, write: false, format: "iife", outdir: ".", define: { "process.env": "{}", "process.env.NODE_ENV": '"development"' },
  plugins: [{ name: "voice-boundaries", setup(builder) {
    builder.onResolve({ filter: /^@\/app\/actions$/ }, () => ({ path: "actions", namespace: "voice" }));
    builder.onResolve({ filter: /^next\/(link|image)$/ }, args => ({ path: args.path, namespace: "voice" }));
    builder.onLoad({ filter: /.*/, namespace: "voice" }, args => ({ contents: args.path === "actions" ? actions : args.path === "next/link" ? 'import React from "react";export default function Link({children,href}){return <a href={href}>{children}</a>}' : 'import React from "react";export default function Image(props){return <img {...props}/>}', loader: "jsx", resolveDir: process.cwd() }));
  } }],
});
const js = bundled.outputFiles.find(file => file.path.endsWith(".js")).text;
const css = bundled.outputFiles.find(file => file.path.endsWith(".css")).text;
const browser = await chromium.launch({ executablePath: await resolveChrome(chromium), headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [], externalRequests = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(trainingWave => {
    window.captureTest = { streams: [], recorders: [], permissionDenied: false, holdPermission: false };
    // Deliberately unavailable: this flow must not use browser speech recognition.
    Object.defineProperty(window, "SpeechRecognition", { value: undefined });
    Object.defineProperty(window, "webkitSpeechRecognition", { value: undefined });
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", { value: async () => {
      if (window.captureTest.permissionDenied) throw new DOMException("Training denial", "NotAllowedError");
      if (window.captureTest.holdPermission) await new Promise(resolve => { window.captureTest.grant = resolve; });
      const context = new AudioContext(); const destination = context.createMediaStreamDestination();
      let source;
      if (!window.captureTest.streams.length) {
        source = context.createBufferSource();
        source.buffer = await context.decodeAudioData(Uint8Array.from(atob(trainingWave), c => c.charCodeAt(0)).buffer);
        source.onended = () => { window.captureTest.trainingAudioPlayed = true; };
      } else source = context.createOscillator();
      source.connect(destination); source.start(context.currentTime + 0.15);
      const stream = destination.stream; window.captureTest.streams.push(stream);
      stream.getAudioTracks()[0].addEventListener("ended", () => { source.stop(); void context.close(); });
      return stream;
    } });
    const NativeRecorder = window.MediaRecorder;
    window.MediaRecorder = class extends NativeRecorder {
      constructor(...args) {
        super(...args); this.byteCount = 0;
        this.addEventListener("dataavailable", event => { this.byteCount += event.data.size; });
        window.captureTest.recorders.push(this);
      }
    };
  }, trainingWave);
  const uploads = [], pendingUploads = [];
  await page.route("**/*", async route => {
    const url = new URL(route.request().url());
    if (url.origin !== "https://dictation.test") { externalRequests.push(url.href); return route.abort(); }
    if (url.pathname === "/api/transcribe") {
      expect(route.request().method()).toBe("POST");
      const bytes = route.request().postDataBuffer();
      expect(bytes.length).toBeGreaterThan(100);
      expect(bytes.toString("latin1")).toContain('name="audio"; filename="voice-request.webm"');
      expect(route.request().headers().authorization).toBeUndefined();
      if (!uploads.length) {
        const form = await new Request(url, { method: "POST", headers: { "content-type": route.request().headers()["content-type"] }, body: bytes }).formData();
        const audio = form.get("audio");
        await writeFile("data/seed/prompt-dictation-training.webm", Buffer.from(await audio.arrayBuffer()));
      }
      uploads.push({ bytes: bytes.length }); pendingUploads.push(route); return;
    }
    if (url.pathname === "/images/rawaan-mascot.png") return route.fulfill({ contentType: "image/png", body: await readFile("public/images/rawaan-mascot.png") });
    if (url.pathname === "/font.ttf") return route.fulfill({ contentType: "font/ttf", body: await readFile("app/fonts/onest-variable.ttf") });
    return route.fulfill({ contentType: "text/html", body: '<html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>@font-face{font-family:Onest;src:url(/font.ttf)}body{--font-onest:Onest;margin:0}' + css + '</style></head><body><div id="root"></div><script>' + js.replaceAll("</script>", "<\\/script>") + '</script></body></html>' });
  });
  const waitForAudio = () => expect.poll(() => page.evaluate(() => window.captureTest.recorders.at(-1)?.byteCount || 0)).toBeGreaterThan(0);
  const noMicrophone = () => expect.poll(() => page.evaluate(() => window.captureTest.streams.every(stream => stream.getTracks().every(track => track.readyState === "ended")))).toBe(true);
  const reply = async (payload = { ok: true, transcript: fixture.finalCommand }, status = 200) => {
    const route = pendingUploads.shift(); expect(route).toBeTruthy();
    await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(payload) });
  };
  const record = async () => {
    await page.getByRole("button", { name: "Voice input", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "Recording..." })).toBeVisible();
    await waitForAudio();
  };
  const stop = async () => {
    const count = uploads.length;
    await page.getByRole("button", { name: "Stop voice input", exact: true }).click();
    await expect.poll(() => uploads.length).toBe(count + 1);
    await noMicrophone();
  };
  await page.goto("https://dictation.test/");
  let input = page.getByRole("textbox", { name: "Ask Rawaan to refine this draft", exact: true });
  await input.fill(fixture.typedPrefix);
  await record();
  await expect(input).toHaveValue(fixture.typedPrefix);
  expect(uploads).toHaveLength(0);
  await expect(page.getByRole("button", { name: "Send message", exact: true })).toBeDisabled();
  expect(await page.evaluate(() => window.voiceRequests.length)).toBe(0);
  await page.screenshot({ path: `${output}/groq-recording.png` });
  await expect.poll(() => page.evaluate(() => window.captureTest.trainingAudioPlayed)).toBe(true);
  await stop();
  await expect(page.getByRole("status").filter({ hasText: "Transcribing your voice input" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Send message", exact: true })).toBeDisabled();
  await reply();
  await expect(input).toHaveValue(fixture.typedPrefix + " " + fixture.finalCommand);
  await expect(input).toBeEditable();
  await page.screenshot({ path: `${output}/groq-final.png` });
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.voiceRequests)).toEqual([{ kind: "modify", prompt: fixture.typedPrefix + " " + fixture.finalCommand }]);
  await expect(input).toHaveValue("");
  // Cancel recording before Stop: no upload; all tracks end.
  await record(); await page.getByRole("button", { name: "New conversation", exact: true }).click();
  await noMicrophone(); expect(uploads).toHaveLength(1);
  // Cancel an upload: a late response cannot refill the new conversation.
  await record(); await stop();
  await page.getByRole("button", { name: "New conversation", exact: true }).click();
  await reply(); await expect(input).toBeEditable(); await expect(input).toHaveValue("");
  // Permission and endpoint failures leave existing typed input intact.
  await input.fill(fixture.typedPrefix);
  await page.evaluate(() => { window.captureTest.permissionDenied = true; });
  await page.getByRole("button", { name: "Voice input", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("microphone permission");
  await expect(input).toHaveValue(fixture.typedPrefix);
  await page.evaluate(() => { window.captureTest.permissionDenied = false; });
  await record(); await stop(); await reply({ ok: false, message: "Training failure" }, 502);
  await expect(page.getByRole("alert")).toContainText("Could not transcribe");
  await expect(input).toHaveValue(fixture.typedPrefix);
  // Closing while microphone permission is pending releases the late stream.
  await page.evaluate(() => { window.captureTest.holdPermission = true; });
  await page.getByRole("button", { name: "Voice input", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Allow microphone access" })).toBeVisible();
  await page.getByRole("button", { name: "Close Rawaan assistant", exact: true }).click();
  await page.evaluate(() => { window.captureTest.holdPermission = false; window.captureTest.grant(); });
  await noMicrophone();
  // Saved sessions use the same route and preserve intentional repetitions.
  await page.evaluate(() => window.showVoiceWorkspace(true));
  input = page.getByRole("textbox", { name: "Ask Rawaan about this session", exact: true });
  await record(); await stop(); await reply({ ok: true, transcript: fixture.secondCommand + " " + fixture.repeatedCommand });
  await expect(input).toHaveValue(fixture.secondCommand + " " + fixture.repeatedCommand);
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect.poll(() => page.evaluate(() => window.voiceRequests.length)).toBe(2);
  expect(await page.evaluate(() => window.voiceRequests[1].prompt)).toBe(fixture.secondCommand + " " + fixture.repeatedCommand);
  await expect(input).toBeEnabled();
  // Responsive transition, mobile close, Back and unmount release recording.
  await record(); await page.setViewportSize({ width: 390, height: 844 }); await noMicrophone();
  await page.getByRole("button", { name: "Show Rawaan assistant", exact: true }).click();
  await record(); await page.screenshot({ path: `${output}/groq-mobile.png` });
  await page.getByRole("button", { name: "Close Rawaan assistant", exact: true }).click(); await noMicrophone();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "Show Rawaan assistant", exact: true }).click();
  await record(); await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(page.getByText("Workspace closed", { exact: true })).toBeVisible(); await noMicrophone();
  await page.evaluate(() => window.showVoiceWorkspace()); await record();
  await page.evaluate(() => window.showVoiceWorkspace(true)); await noMicrophone();
  expect(errors).toEqual([]); expect(externalRequests).toEqual([]);
  await writeFile(`${output}/groq-browser-verification.json`, JSON.stringify({ nativeMediaRecorder: true, syntheticAudio: true, browserSpeechRecognition: false, recordingUploadsOnlyAfterStop: "pass", oneTranscriptAndExplicitSend: "pass", typedPrefixAndGenuineRepetition: "pass", permissionAndEndpointFailure: "pass", cancelUploadAndLatePermission: "pass", desktopMobileBackUnmountCleanup: "pass", uploads, errors, externalRequests, hostedWrites: 0, realTranscriptionProviderTested: false }, null, 2));
  console.log("PASS actual note assistant with native MediaRecorder: one completed upload and editable transcript, explicit Send, typed prefix, errors, cancellation and desktop/mobile cleanup. Synthetic audio; transcription route mocked; no hosted writes.");
} finally { await browser.close(); }
