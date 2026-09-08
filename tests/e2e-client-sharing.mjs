// Actual Rawaan components; fictional fixtures and mocked server actions only.
import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolveChrome } from "../tools/tutorial-video/browser.mjs";
const require = createRequire(import.meta.url);
const { build } = require("esbuild");
const { chromium, expect } = require("@playwright/test");
const training = JSON.parse(await readFile("data/seed/tutorial-session.json", "utf8"));
const fixture = JSON.parse(await readFile("data/seed/client-sharing.json", "utf8"));
const output = "plans/2026-10-20-client-handoff";
await mkdir(output, { recursive: true });
const actionSource = `
const training=${JSON.stringify(training)}, fixture=${JSON.stringify(fixture)};
window.handoff={calls:[],links:[],claim:null,failNextImport:false,clipboard:""};
const token="s".repeat(43),stamp=new Date().toISOString(),expiry=new Date(Date.now()+7*86400000).toISOString();
const pause=()=>new Promise(resolve=>setTimeout(resolve,150));
export async function listClientSharesAction(){window.handoff.calls.push("list");await pause();return {ok:true,value:window.handoff.links};}
export async function createClientShareAction(input){window.handoff.calls.push({create:input});await pause();const share={id:"00000000-0000-4000-8000-000000000001",created_at:stamp,expires_at:expiry,note_count:2,plan_count:1};window.handoff.links=[{...share,revoked_at:null,imported_at:null}];return {ok:true,value:{...share,path:"/clients/import?share="+token}};}
export async function revokeClientShareAction(id){window.handoff.calls.push({revoke:id});await pause();window.handoff.links=window.handoff.links.map(item=>({...item,revoked_at:stamp}));return {ok:true,value:true};}
export async function previewClientShareAction(value){window.handoff.calls.push("preview");await pause();if(value!==token)return {ok:false,message:"This sharing link has expired, was revoked, or has already been used. Ask the sender for a new link."};return {ok:true,value:{display_name:training.client.displayName,source_clinic_name:fixture.sender.clinic,note_count:2,plan_count:1,created_at:stamp,expires_at:expiry,imported_patient_id:window.handoff.claim?.patient_id??null}};}
export async function importClientShareAction(){window.handoff.calls.push("import");await pause();if(window.handoff.failNextImport){window.handoff.failNextImport=false;throw Error("Synthetic connection failure");}const already=Boolean(window.handoff.claim);window.handoff.claim={patient_id:"imported-training-client",note_count:2,plan_count:1,already_imported:already};return {ok:true,value:window.handoff.claim};}
export async function listClientImportsAction(){return {ok:true,value:[]};}
`;
const navigation = `
import React,{useSyncExternalStore} from "react";
const subscribe=cb=>{addEventListener("popstate",cb);return()=>removeEventListener("popstate",cb)};
const snapshot=()=>location.pathname+location.search;
export const useRouter=()=>({push:href=>window.navigate(href)});
export const useSearchParams=()=>new URLSearchParams(useSyncExternalStore(subscribe,snapshot).split("?")[1]||"");
export default function Link({href,children,...props}){return <a {...props} href={href}>{children}</a>}
`;
const result = await build({
  stdin: { contents: `
import React,{useSyncExternalStore} from "react";import {createRoot} from "react-dom/client";
import {ClientsDirectory} from "./app/components/clients-directory";
import {ShareClientButton} from "./app/components/client-sharing";
import {ClientShareReceiver} from "./app/components/client-share-receiver";
import "./app/globals.css";
const training=${JSON.stringify(training)};
window.navigate=href=>{history.pushState({},"",href);dispatchEvent(new PopStateEvent("popstate"));};
function App(){const path=useSyncExternalStore(cb=>{addEventListener("popstate",cb);return()=>removeEventListener("popstate",cb)},()=>location.pathname+location.search);return <main style={{padding:24}}>{path.startsWith("/clients/import")?<ClientShareReceiver key={path} token={new URL(location.href).searchParams.get("share")}/>:<><ShareClientButton patientId={training.client.patientId} displayName={training.client.displayName}/><ClientsDirectory clients={[training.client]}/></>}</main>}
createRoot(document.getElementById("root")).render(<App/>);`, resolveDir: process.cwd(), loader: "tsx" },
  jsx: "automatic", bundle: true, write: false, format: "iife", outdir: ".",
  define: { "process.env": "{}", "process.env.NODE_ENV": '"development"' },
  plugins: [{ name: "isolated-handoff", setup(builder) {
    builder.onResolve({ filter: /^@\/app\/client-sharing-actions$/ }, () => ({ path: "actions", namespace: "handoff" }));
    builder.onResolve({ filter: /^next\/(navigation|link)$/ }, args => ({ path: args.path, namespace: "handoff" }));
    builder.onLoad({ filter: /.*/, namespace: "handoff" }, args => ({ contents: args.path === "actions" ? actionSource : navigation, loader: "jsx", resolveDir: process.cwd() }));
  } }],
});
const js = result.outputFiles.find(file => file.path.endsWith(".js")).text;
const css = result.outputFiles.find(file => file.path.endsWith(".css")).text;
const browser = await chromium.launch({ executablePath: await resolveChrome(chromium), headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [], externalRequests = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.addInitScript(() => { Object.defineProperty(navigator, "clipboard", { value: { writeText: async text => { window.handoff.clipboard = text; } } }); });
  await page.route("**/*", async route => {
    const url = new URL(route.request().url());
    if (url.origin !== "https://handoff.test") { externalRequests.push(url.href); return route.abort(); }
    if (url.pathname === "/font.ttf") return route.fulfill({ contentType: "font/ttf", body: await readFile("app/fonts/onest-variable.ttf") });
    return route.fulfill({ contentType: "text/html", body: '<html><head><meta name="viewport" content="width=device-width, initial-scale=1"><style>@font-face{font-family:Onest;src:url(/font.ttf)}body{--font-onest:Onest;margin:0;background:#f4f7f4}*{box-sizing:border-box}' + css + '</style></head><body><div id="root"></div><script>' + js.replaceAll("</script>", "<\\/script>") + '</script></body></html>' });
  });
  await page.goto("https://handoff.test/clients");
  expect(await page.evaluate(() => window.handoff.calls)).toEqual([]);
  const shareButton = page.getByRole("button", { name: "Share client", exact: true });
  await shareButton.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("button", { name: "Create sharing link" })).toBeDisabled();
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: "Create sharing link" }).click();
  const link = await dialog.getByRole("textbox", { name: "Sharing link", exact: true }).inputValue();
  await dialog.getByRole("button", { name: "Copy link", exact: true }).click();
  expect(await page.evaluate(() => window.handoff.clipboard)).toBe(link);
  await page.screenshot({ path: `${output}/share-desktop.png`, fullPage: true });
  await dialog.getByRole("button", { name: "Revoke link" }).click();
  await expect(dialog.getByText("Revoked", { exact: true })).toBeVisible();
  await expect(dialog.getByRole("textbox", { name: "Sharing link", exact: true })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(shareButton).toBeFocused();
  const importButton = page.getByRole("button", { name: "Import shared client", exact: true });
  await importButton.click();
  await dialog.getByRole("textbox").fill("https://outside.example/clients/import?share=" + "s".repeat(43));
  await dialog.getByRole("button", { name: "Preview shared client" }).click();
  await expect(dialog.getByRole("alert")).toContainText("this Rawaan website");
  await dialog.getByRole("textbox").fill(link);
  await dialog.getByRole("button", { name: "Preview shared client" }).click();
  await expect(page.getByRole("heading", { name: training.client.displayName, exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.handoff.calls.filter(call => call === "import").length)).toBe(0);
  await expect(page.getByText("2 approved sessions")).toBeVisible();
  await page.screenshot({ path: `${output}/receive-desktop.png`, fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `${output}/receive-mobile.png`, fullPage: true });
  await page.evaluate(() => { window.handoff.failNextImport = true; });
  await page.getByRole("button", { name: "Import client and history", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("could not be confirmed");
  await page.getByRole("button", { name: "Import client and history", exact: true }).click();
  await expect(page.getByRole("link", { name: "Open client history" })).toHaveAttribute("href", "/clients/imported-training-client?tab=sessions");
  await expect(page.getByRole("button", { name: "Import client and history", exact: true })).toHaveCount(0);
  await page.evaluate(() => { window.navigate("/clients/import?share=" + "s".repeat(43) + "&reopen=1"); });
  await expect(page.getByRole("status")).toContainText("No duplicate was created");
  await page.evaluate(() => window.navigate("/clients"));
  await importButton.click();
  const transfer = await page.evaluateHandle(value => { const data = new DataTransfer(); data.setData("text/uri-list", value); return data; }, link);
  await dialog.getByText("Paste or drop a sharing link", { exact: false }).first().dispatchEvent("drop", { dataTransfer: transfer });
  await expect(dialog.getByRole("textbox")).toHaveValue(link);
  expect(await page.evaluate(() => window.handoff.calls.filter(call => call === "import").length)).toBe(2);
  await page.screenshot({ path: `${output}/import-mobile.png`, fullPage: true });
  await page.keyboard.press("Escape");
  await expect(importButton).toBeFocused();
  await page.evaluate(() => window.navigate("/clients/import?share=" + "x".repeat(43)));
  await expect(page.getByRole("alert")).toContainText("expired");
  expect(errors).toEqual([]); expect(externalRequests).toEqual([]);
  await writeFile(`${output}/browser-verification.json`, JSON.stringify({ desktop: "pass", mobile: "pass", createCopyRevoke: "pass", previewWithoutImport: "pass", foreignUrlRejected: "pass", pasteAndDrop: "pass", importFailureRetry: "pass", replay: "pass", keyboardEscapeFocus: "pass", errors, externalRequests, hostedWrites: 0 }, null, 2));
  console.log("PASS actual client-sharing components: create/copy/revoke, paste/drop, preview, import/retry/replay, keyboard and mobile; no hosted writes.");
} finally { await browser.close(); }
