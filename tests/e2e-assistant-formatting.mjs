// Actual UI components, fictional seed data, mocked actions; no hosted writes.
import { createRequire } from "node:module";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolveChrome } from "../tools/tutorial-video/browser.mjs";

const require = createRequire(import.meta.url);
const { build } = require("esbuild");
const { chromium, expect } = require("@playwright/test");
const text = await readFile("data/seed/assistant-formatting.md", "utf8");
const fixture = JSON.parse(await readFile("data/seed/tutorial-session.json", "utf8"));
const directory = "plans/2026-10-20-finale-preparation";
await mkdir(directory, { recursive: true });
const actions = `
const text=${JSON.stringify(text)};
export async function modifyNoteAction(input){return {ok:true,assistantReply:text,updatedNote:input.note};}
export async function getClientDetailAction(){return {client:${JSON.stringify(fixture.client)},notes:[]};}
export async function listClinicalPlansAction(){return [];}
export async function approveDraftAction(){throw Error("Unexpected write");}
export async function reviewClinicalPlanAction(){throw Error("Unexpected write");}
export async function sendAgentMessageAction(){throw Error("Unexpected request");}
export async function translateTranscriptToUrduAction(){throw Error("Unexpected request");}
export async function translateNoteToUrduAction(){throw Error("Unexpected request");}
`;
const result = await build({
  stdin: { contents: `
import React from "react";import {createRoot} from "react-dom/client";
import {ChatEntryCard} from "./app/components/brain-chat-entry-card";
import {SessionWorkspaceView} from "./app/components/session-workspace-view";
import "./app/globals.css";
const text=${JSON.stringify(text)},fixture=${JSON.stringify(fixture)};
const answer={status:"agent",answer:text,category:"clinical",sources:[],notice:null,clinical:{differential:[],medication_options:[],missing_information:["Confirm **recorded follow-up**"],plan:{title:"**Training review plan**",goals:["Review **the transcript**"],next_steps:["Check **source notes**"],monitoring:[],follow_up:"Review **the record**",red_flags:[]}}};
const root=createRoot(document.getElementById("root"));
const question="Keep **literal user text**";
window.showChat=()=>root.render(<main className="chatgpt-messages-container"><ChatEntryCard entry={{question,response:answer,timestamp:"2026-10-20T09:00:00Z"}}/><ChatEntryCard entry={{question:"Exact record",response:{status:"supported",answer:"The exact record says **literal record text**.",sources:[]},timestamp:"2026-10-20T09:00:00Z"}}/></main>);
window.showDraft=()=>root.render(<SessionWorkspaceView draft={fixture.draft} onBack={()=>{}}/>);
window.showChat();`, resolveDir: process.cwd(), loader: "tsx" },
  jsx: "automatic", bundle: true, write: false, format: "iife", outdir: ".",
  define: { "process.env": "{}", "process.env.NODE_ENV": '"development"' },
  plugins: [{ name: "isolated-boundaries", setup(builder) {
    builder.onResolve({ filter: /^@\/app\/actions$/ }, () => ({ path: "actions", namespace: "formatting" }));
    builder.onResolve({ filter: /^next\/(link|image)$/ }, args => ({ path: args.path, namespace: "formatting" }));
    builder.onLoad({ filter: /.*/, namespace: "formatting" }, args => ({ contents: args.path === "actions" ? actions : args.path === "next/link" ? 'import React from "react";export default function Link({children,href}){return <a href={href}>{children}</a>}' : 'import React from "react";export default function Image({src,alt,...props}){return <img src={src} alt={alt} {...props}/>} ', loader: "jsx", resolveDir: process.cwd() }));
  } }],
});
const js = result.outputFiles.find(file => file.path.endsWith(".js")).text;
const css = result.outputFiles.find(file => file.path.endsWith(".css")).text;
const browser = await chromium.launch({ executablePath: await resolveChrome(chromium), headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [], externalRequests = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/*", async route => {
    const url = new URL(route.request().url());
    if (url.origin !== "https://formatting.test") { externalRequests.push(url.href); return route.abort(); }
    if (url.pathname === "/images/rawaan-mascot.png") return route.fulfill({ contentType: "image/png", body: await readFile("public/images/rawaan-mascot.png") });
    if (url.pathname === "/font.ttf") return route.fulfill({ contentType: "font/ttf", body: await readFile("app/fonts/onest-variable.ttf") });
    return route.fulfill({ contentType: "text/html", body: '<html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>@font-face{font-family:Onest;src:url(/font.ttf)}body{--font-onest:Onest;margin:0}html,body,#root{min-height:100%}.chatgpt-messages-container{max-width:100%;padding:24px}' + css + '</style></head><body><div id="root"></div><script>' + js.replaceAll("</script>", "<\\/script>") + '</script></body></html>' });
  });
  await page.goto("https://formatting.test/");
  const answer = page.locator(".agent-answer");
  await expect(answer.getByRole("heading", { name: "Training example: review workflow" })).toBeVisible();
  await expect(answer.locator("strong", { hasText: "fictional training content" })).toBeVisible();
  await expect(answer.locator(".brain-chat-answer ul li")).toHaveCount(2);
  await expect(answer.locator(".brain-chat-answer ol li")).toHaveCount(2);
  await expect(answer.getByRole("table")).toBeVisible();
  await expect(answer.locator(".agent-plan h3 strong")).toHaveText("Training review plan");
  await expect(answer.locator(".agent-plan li strong", { hasText: "source notes" })).toBeVisible();
  await answer.getByText("Information to confirm", { exact: true }).click();
  await expect(answer.locator("details strong", { hasText: "recorded follow-up" })).toBeVisible();
  await expect(answer).not.toContainText("**");
  await expect(page.locator(".brain-chat-question").first()).toHaveText("Keep **literal user text**");
  await expect(page.locator(".is-supported .brain-chat-answer")).toHaveText("The exact record says **literal record text**.");
  const boldWeight = await answer.locator("strong").first().evaluate(element => getComputedStyle(element).fontWeight);
  expect(Number(boldWeight)).toBeGreaterThanOrEqual(600);
  await page.screenshot({ path: `${directory}/markdown-desktop.png`, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(answer.getByRole("table")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await answer.getByRole("region", { name: "Response table" }).focus();
  await expect(answer.getByRole("region", { name: "Response table" })).toBeFocused();
  await page.screenshot({ path: `${directory}/markdown-mobile.png`, fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(() => window.showDraft());
  await page.getByRole("textbox", { name: "Ask Rawaan to refine this draft" }).fill("Format this fictional training example");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(page.locator(".is-ai-bubble strong", { hasText: "fictional training content" })).toBeVisible();
  await expect(page.locator(".is-ai-bubble")).not.toContainText("**");
  expect(errors).toEqual([]); expect(externalRequests).toEqual([]);
  await writeFile(`${directory}/formatting-browser-verification.json`, JSON.stringify({ desktop: "pass", mobile: "pass", draftAssistant: "pass", literalUserAndRecordText: "pass", boldWeight, keyboardTableAccess: "pass", errors, externalRequests, hostedWrites: 0 }, null, 2));
  console.log("PASS actual chat and draft assistant: rich text, Urdu, tables, mobile width, keyboard access and literal excerpts; no external requests or hosted writes.");
} finally { await browser.close(); }
