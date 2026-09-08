import { createRequire } from "node:module";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveChrome } from "./browser.mjs";
process.chdir(fileURLToPath(new URL("../../", import.meta.url)));
const require = createRequire(import.meta.url);
const { build } = require("esbuild");
const { chromium, expect } = require("@playwright/test");
const fixture = JSON.parse(await readFile("data/seed/tutorial-session.json", "utf8"));
await mkdir("tools/tutorial-video/captures", { recursive: true });
const actions = `
const f=${JSON.stringify(fixture)};
window.training={created:false,saved:null,calls:[]};
const delay=()=>new Promise(r=>setTimeout(r,400));
export async function listClientsAction(){window.training.calls.push("clients");await delay();return window.training.created?[f.client]:[];}
export async function createClientAction(input){window.training.calls.push("create-client");window.training.created=true;return {ok:true,client:{...f.client,...input}};}
export async function generateDraftAction(){window.training.calls.push("generate");await delay();return {ok:true,draft:f.draft};}
export async function approveDraftAction(input){window.training.calls.push("approve");window.training.saved={...input,id:"tutorial-note",approval_status:"approved",approved_at:"2026-10-08T09:01:00.000Z"};return {ok:true,noteId:"tutorial-note",approvedAt:window.training.saved.approved_at};}
export async function listBrainPatientsAction(){return [{patientId:f.client.patientId,displayName:f.client.displayName,approvedNoteCount:1,mostRecentConsultationDate:f.client.lastSessionDate}];}
export async function listAgentThreadsAction(){return [];}
export async function getClientDetailAction(){return {client:f.client,notes:[{...f.draft,id:"tutorial-note",approval_status:"approved",approved_at:"2026-10-08T09:01:00.000Z"}]};}
export async function getPatientInsightsAction(){throw Error("Unexpected client insights request in unassigned recording");}
export async function sendAgentMessageAction(input){await delay();window.training.calls.push("chat");let response;if(input.mode==="records") response={status:"supported",answer:f.recordExcerpt,excerpts:[{noteId:"tutorial-note",consultationDate:f.client.lastSessionDate,text:f.recordExcerpt}],sources:[{noteId:"tutorial-note",consultationDate:f.client.lastSessionDate}]};else response={status:"agent",answer:input.patientId?f.planAnswer:f.generalAnswer,category:input.patientId?"clinical":"general",sources:input.patientId?[{kind:"note",citation:"N1",noteId:"tutorial-note",consultationDate:f.client.lastSessionDate}]:[],notice:null,clinical:input.patientId?{differential:[],medication_options:[],missing_information:[],plan:f.plan}:null};return {ok:true,response,threadId:"tutorial-thread",timestamp:"2026-10-08T09:02:00.000Z",persisted:true};}
export async function reviewClinicalPlanAction(){window.training.calls.push("review-plan");return {ok:true};}
export async function listClinicalPlansAction(){return [];}
export async function getClinicalContextAction(){return {age:null,allergies:"",current_medications:"",pregnancy_status:"",kidney_function:"",liver_function:"",vitals:"",current_concern:"",confirmed_at:null,medication_context_confirmed:false};}
export async function saveClinicalContextAction(){return {ok:true};}
export async function modifyNoteAction(){throw Error("Tutorial uses manual note editing");}
export async function translateTranscriptToUrduAction(){throw Error("Tutorial does not translate records");}
export async function translateNoteToUrduAction(){throw Error("Tutorial does not translate notes");}
export async function listClientChatThreadsAction(){return [];}
export async function listChatThreadsAction(){return [];}
`;
const nav = `
import React,{useSyncExternalStore} from "react";
const subscribe=cb=>{addEventListener("popstate",cb);return ()=>removeEventListener("popstate",cb)};
const snapshot=()=>location.pathname+location.search;
export const usePathname=()=>useSyncExternalStore(subscribe,snapshot).split("?")[0];
export const useSearchParams=()=>new URLSearchParams(useSyncExternalStore(subscribe,snapshot).split("?")[1]||"");
export const useRouter=()=>({push:href=>window.navigate(href),replace:href=>window.navigate(href),refresh:()=>{}});
export default function Link({href,children,onClick,prefetch:_prefetch,...props}){return <a {...props} href={href} onClick={event=>{onClick?.(event);if(href.startsWith("/")){event.preventDefault();window.navigate(href)}}}>{children}</a>}
`;
const bundle = await build({stdin:{contents: `
import React,{useSyncExternalStore} from "react";import {createRoot} from "react-dom/client";
import {ScribeDashboard} from "./app/components/scribe-dashboard";import {ClientsDirectory} from "./app/components/clients-directory";import {ClientDetailView} from "./app/components/client-detail-view";import {SessionWorkspaceView} from "./app/components/session-workspace-view";import {WorkspaceSidebar} from "./app/components/workspace-sidebar";import {BrainChat} from "./app/components/brain-chat";import {RawaanGuide} from "./app/components/rawaan-guide";import {TutorialPreview} from "./app/components/tutorial-preview";import "./app/globals.css";
import HowToUsePage from "./app/how-to-use/page";
const f=${JSON.stringify(fixture)};
window.navigate=href=>{history.pushState({},"",href);dispatchEvent(new PopStateEvent("popstate"))};
function App(){const path=useSyncExternalStore(cb=>{addEventListener("popstate",cb);return()=>removeEventListener("popstate",cb)},()=>location.pathname);const note=window.training?.saved||{...f.draft,id:"tutorial-note",approval_status:"approved",approved_at:"2026-10-08T09:01:00.000Z"};if(path==="/how-to-use")return <HowToUsePage/>;if(path==="/preview")return <TutorialPreview/>;return <div className="workspace-shell"><WorkspaceSidebar clinicName={f.clinicName}/><main className="workspace-content-pane">{path==="/record"?<ScribeDashboard ownerId="tutorial-owner"/>:path==="/clients"?<ClientsDirectory clients={[f.client]}/>:path.includes("/sessions/")?<SessionWorkspaceView draft={note} onBack={()=>window.navigate("/clients/tutorial-client?tab=sessions")}/>:path.startsWith("/clients/")?<ClientDetailView client={f.client} notes={[note]}/>:path==="/rawaan-ai"?<div className="chatgpt-page-wrapper"><BrainChat/></div>:<RawaanGuide/>}</main></div>}
createRoot(document.getElementById("root")).render(<App/>);
`,resolveDir:process.cwd(),loader:"tsx"},jsx:"automatic",bundle:true,write:false,format:"iife",outdir:".",define:{"process.env":"{}","process.env.NODE_ENV":'"development"'},plugins:[{name:"training-boundaries",setup(b){b.onResolve({filter:/^@[/]app[/]actions$/},()=>({path:"actions",namespace:"training"}));b.onResolve({filter:/^next[/](navigation|link|image)$/},a=>({path:a.path,namespace:"training"}));b.onResolve({filter:/^@clerk[/]nextjs$/},()=>({path:"clerk",namespace:"training"}));b.onLoad({filter:/.*/,namespace:"training"},a=>({contents:a.path==="actions"?actions:a.path==="clerk"?'import React from "react";export function UserButton(){return <span aria-label="Training profile" style={{background:"#d6eadd",borderRadius:99,padding:8}}>T</span>}':a.path==="next/image"?'import React from "react";export default function Image({src,alt,...p}){return <img {...p} src={src} alt={alt}/>}':nav,loader:"jsx",resolveDir:process.cwd()}));}}]});
const js=bundle.outputFiles.find(f=>f.path.endsWith(".js")).text;
const css=bundle.outputFiles.find(f=>f.path.endsWith(".css")).text;
const server=createServer(async(req,res)=>{try{
 const url=new URL(req.url,"http://localhost");
 if(url.pathname==="/api/transcribe"){res.setHeader("content-type","application/json");res.end(JSON.stringify({ok:true,transcript:fixture.draft.raw_transcript}));return;}
 const asset=url.pathname==="/font.ttf"?"app/fonts/onest-variable.ttf":url.pathname==="/bundle.js"?null:url.pathname.startsWith("/tutorials/")||url.pathname.startsWith("/images/")?resolve("public",'.'+url.pathname):null;
 if(url.pathname==="/bundle.js"){res.setHeader("content-type","text/javascript");res.end(js);return;}
 if(asset){const data=await readFile(asset);const ext=asset.split('.').pop();res.setHeader("content-type",{ttf:"font/ttf",png:"image/png",jpg:"image/jpeg",mp4:"video/mp4",vtt:"text/vtt"}[ext]||"application/octet-stream");res.setHeader("accept-ranges","bytes");const range=req.headers.range?.match(/bytes=(\d+)-(\d*)/);if(range){const start=Number(range[1]),end=Math.min(range[2]?Number(range[2]):data.length-1,data.length-1);res.writeHead(206,{"content-range":`bytes ${start}-${end}/${data.length}`,"content-length":end-start+1});res.end(data.subarray(start,end+1));}else res.end(data);return;}
 res.setHeader("content-type","text/html");res.end('<html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>@font-face{font-family:Onest;src:url(/font.ttf)}body{--font-onest:Onest}html,body,#root{height:100%;margin:0}.workspace-layout{display:flex;min-height:100vh}'+css+'</style></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>');
 }catch{res.writeHead(404);res.end("Missing training asset");}});
await new Promise(r=>server.listen(0,"127.0.0.1",r));
const origin=`http://127.0.0.1:${server.address().port}`;
const browser=await chromium.launch({executablePath:await resolveChrome(chromium),headless:true,args:["--use-fake-device-for-media-stream","--use-fake-ui-for-media-stream"]});
const page=await browser.newPage({viewport:{width:1440,height:800},permissions:["microphone"]});
page.setDefaultTimeout(10000);
const errors=[];page.on("pageerror",e=>errors.push(e.message));
page.on("console",message=>{if(message.type()==="error"&&/Encountered two children|Hydration failed|Invalid hook call/.test(message.text()))errors.push(message.text());});
await page.route("**/*",r=>r.request().url().startsWith(origin)?r.continue():r.abort());
const shots=[];
async function shot(id,focus){await page.evaluate(()=>document.fonts.ready);if(focus)await focus.scrollIntoViewIfNeeded();await page.waitForTimeout(150);const box=focus?await focus.boundingBox():null;await page.screenshot({path:`tools/tutorial-video/captures/${id}.png`});shots.push({id,focus:box});console.log("Captured",id);}
try{
 if(process.argv.includes("--verify-guide")) {
  await page.goto(origin+"/how-to-use");await expect(page.getByRole("heading",{name:/Make your first note/})).toBeVisible();
  const mediaRequests=[];page.on("request",request=>{if(/\.(mp4|vtt)(\?|$)/.test(request.url()))mediaRequests.push(request.url());});
  await page.waitForTimeout(250);expect(mediaRequests).toEqual([]);expect(await page.evaluate(()=>window.training.calls)).toEqual([]);
  await page.screenshot({path:"plans/2026-10-08-visual-onboarding/guide-desktop.png",fullPage:true});
  await page.getByRole("button",{name:/Watch your first session/}).click();
  const first=page.locator('video[aria-label="Your first session"]');await expect.poll(()=>first.evaluate(v=>v.readyState)).toBeGreaterThan(0);
  await expect.poll(()=>first.evaluate(v=>v.currentTime)).toBeGreaterThan(.1);
  await expect.poll(()=>first.evaluate(v=>v.textTracks.length)).toBe(1);await expect.poll(()=>first.evaluate(v=>v.textTracks[0].cues?.length||0)).toBeGreaterThan(0);
  await page.getByRole("button",{name:/Assign or create the client/}).click();await expect.poll(()=>first.evaluate(v=>v.currentTime)).toBeGreaterThan(55);
  await page.evaluate(()=>{window.firstTutorialVideo=document.querySelector("video")});
  await page.getByRole("button",{name:/Find a past session/}).click();expect(await page.evaluate(()=>window.firstTutorialVideo.paused)).toBe(true);await expect(page.locator('video[aria-label="Find a past session"]')).not.toHaveAttribute("src");
  await page.getByRole("button",{name:/Open a saved session/}).click();await expect.poll(()=>page.locator('video[aria-label="Find a past session"]').evaluate(v=>v.currentTime)).toBeGreaterThan(10);
  await page.getByRole("button",{name:/Ask Rawaan AI/}).click();await page.getByRole("button",{name:/Watch ask rawaan ai/}).focus();await page.keyboard.press("Enter");await expect.poll(()=>page.locator('video[aria-label="Ask Rawaan AI"]').evaluate(v=>v.currentTime)).toBeGreaterThan(.1);
  await page.getByText("Read the video transcript",{exact:true}).click();await expect(page.getByText(/Open Rawaan AI whenever you need help/, {exact:false})).toBeVisible();
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:"plans/2026-10-08-visual-onboarding/guide-mobile.png",fullPage:true});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.goto(origin+"/learn-rawaan");await expect(page.getByRole("heading",{name:/Make your first note/})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:"plans/2026-10-08-visual-onboarding/guide-workspace-mobile.png",fullPage:true});
  await page.emulateMedia({reducedMotion:"reduce"});await expect(page.getByRole("heading",{name:"Your step-by-step checklist"})).toBeVisible();
  await page.goto(origin+"/preview");await page.getByRole("button",{name:/Watch see how rawaan works/}).click();await expect.poll(()=>page.locator('video[aria-label="See how Rawaan works"]').evaluate(v=>v.currentTime)).toBeGreaterThan(.1);
  await page.route("**/tutorials/*.mp4",route=>route.fulfill({status:404,body:"Missing video"}));await page.goto(origin+"/how-to-use");await page.getByRole("button",{name:/Watch your first session/}).click();await expect(page.getByRole("status").filter({hasText:"The video could not load"})).toBeVisible();await expect(page.getByRole("heading",{name:"Your step-by-step checklist"})).toBeVisible();
  expect(await page.evaluate(()=>window.training.calls)).toEqual([]);expect(errors).toEqual([]);console.log("PASS guide: no eager media or backend calls, real playback/captions, chapter seek, old-player pause, keyboard, mobile, reduced motion, preview and failed-media fallback");
 } else {
 await page.goto(origin+"/record");await expect(page.getByRole("heading",{name:"Record",exact:true})).toBeVisible();await shot("record",page.getByRole("button",{name:/Record in-person/}));
 await page.getByRole("button",{name:/Record in-person/}).click();await expect(page.getByRole("button",{name:"Start recording",exact:true})).toBeVisible();await shot("setup",page.getByRole("button",{name:"Check!",exact:true}));
 await page.getByRole("button",{name:"Check!",exact:true}).click();await page.waitForTimeout(1000);await shot("microphone",page.getByRole("button",{name:"Start recording",exact:true}));
 await page.getByRole("button",{name:"Start recording",exact:true}).click();await expect(page.getByRole("button",{name:"Stop recording",exact:true})).toBeVisible();await page.waitForTimeout(31000);await shot("recording",page.getByRole("button",{name:"Stop recording",exact:true}));
 await page.getByRole("button",{name:"Stop recording",exact:true}).click();await expect(page.getByRole("heading",{name:"Assign Session",exact:true})).toBeVisible();await shot("assign",page.getByRole("button",{name:"+ Create New",exact:true}));
 await page.getByRole("button",{name:"+ Create New",exact:true}).click();await page.getByPlaceholder("Client First Name",{exact:true}).fill(fixture.client.firstName);await page.getByPlaceholder("Client Last Name",{exact:true}).fill(fixture.client.lastName);await shot("create-client",page.getByRole("button",{name:"Create New Client",exact:true}));
 await page.getByRole("button",{name:"Create New Client",exact:true}).click();await expect(page.getByRole("heading",{name:"Assign Session",exact:true})).toBeVisible();await shot("assigned",page.getByRole("button",{name:"Next",exact:true}));
 await page.getByRole("button",{name:"Next",exact:true}).click();await expect(page.getByRole("button",{name:"Approve & Save Note",exact:true})).toBeVisible();await shot("draft",page.getByRole("button",{name:"Edit note",exact:true}));
 await page.getByRole("tab",{name:"Transcript",exact:true}).click();await shot("transcript",page.getByRole("tab",{name:"Transcript",exact:true}));
 await page.getByRole("tab",{name:"Notes",exact:true}).click();await page.getByRole("button",{name:"Edit note",exact:true}).click();await shot("edit",page.getByRole("button",{name:"Approve & Save Note",exact:true}));
 await page.getByRole("button",{name:"Approve & Save Note",exact:true}).click();await expect.poll(()=>page.evaluate(()=>window.training.calls.includes("approve"))).toBe(true);await shot("approved");
 await page.evaluate(()=>window.navigate("/clients"));await shot("clients",page.getByRole("link",{name:fixture.client.displayName,exact:true}));await page.getByRole("link",{name:fixture.client.displayName,exact:true}).click();await page.getByRole("button",{name:"Sessions",exact:true}).click();await page.locator(".client-session-summary").click();await shot("sessions",page.getByRole("link",{name:"Open session",exact:true}));await page.getByRole("link",{name:"Open session",exact:true}).click();await expect(page.getByText("Approved notes are read-only.",{exact:true})).toBeVisible();await shot("saved-note",page.getByRole("tab",{name:"Notes",exact:true}));
 await page.getByRole("tab",{name:"Session Information",exact:true}).click();await shot("session-info",page.getByRole("tab",{name:"Session Information",exact:true}));
 await page.evaluate(()=>window.navigate("/rawaan-ai"));await expect(page.getByRole("textbox",{name:"Message Rawaan"})).toBeVisible();await shot("ai",page.getByRole("textbox",{name:"Message Rawaan"}));await page.getByRole("textbox",{name:"Message Rawaan"}).fill(fixture.generalQuestion);await page.getByRole("button",{name:"Send message",exact:true}).click();await expect(page.getByText(fixture.generalAnswer,{exact:true})).toBeVisible();await shot("general-answer");
 await page.getByRole("combobox",{name:"Client:"}).focus();await expect(page.getByRole("option",{name:fixture.client.displayName})).toHaveCount(1);await page.getByRole("combobox",{name:"Client:"}).selectOption(fixture.client.patientId);await page.getByRole("combobox",{name:"Assistant mode"}).selectOption("records");await page.getByRole("textbox",{name:"Message Rawaan"}).fill(fixture.recordsQuestion);await page.getByRole("button",{name:"Send message",exact:true}).click();await expect(page.getByText(fixture.recordExcerpt,{exact:true})).toBeVisible();await shot("records-answer",page.getByRole("combobox",{name:"Assistant mode"}));
 const source=page.getByRole("link",{name:/Source 1/});await expect(source).toHaveAttribute("href","/clients/tutorial-client/sessions/tutorial-note");await source.click();await expect(page.getByText("Approved notes are read-only.",{exact:true})).toBeVisible();await shot("records-source");
 await page.evaluate(()=>window.navigate("/rawaan-ai"));await page.getByRole("combobox",{name:"Client:"}).focus();await page.getByRole("combobox",{name:"Client:"}).selectOption(fixture.client.patientId);await page.getByRole("button",{name:"Clinical context",exact:true}).click();await expect(page.getByRole("textbox",{name:"Current concern",exact:true})).toBeVisible();await shot("clinical-context");await page.getByRole("button",{name:"Close",exact:true}).click();
 await page.getByRole("textbox",{name:"Message Rawaan"}).fill(fixture.planQuestion);await page.getByRole("button",{name:"Send message",exact:true}).click();await expect(page.getByRole("button",{name:"Review and save plan"})).toBeVisible();await shot("proposed-plan",page.getByRole("button",{name:"Review and save plan"}));await page.getByRole("button",{name:"Review and save plan"}).click();await shot("review-plan",page.getByRole("button",{name:"Confirm review and save",exact:true}));await page.getByRole("button",{name:"Confirm review and save",exact:true}).click();await expect(page.getByText("Reviewed plan saved to this client.",{exact:true})).toBeVisible();await shot("saved-plan");
 expect(errors).toEqual([]);await writeFile("tools/tutorial-video/captures/shots.json",JSON.stringify(shots,null,2));await writeFile("plans/2026-10-08-visual-onboarding/capture-results.json",JSON.stringify({errors,calls:await page.evaluate(()=>window.training.calls),fixture:"Fictional training example",externalRequestsAllowed:false},null,2));console.log("PASS actual-component training capture; no external backend requests");
 }
}finally{await browser.close();await new Promise(r=>server.close(r));}
