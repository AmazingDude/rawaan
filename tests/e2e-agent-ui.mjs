import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { resolveChrome } from "../tools/tutorial-video/browser.mjs";
const require=createRequire(import.meta.url);
const { build }=require("esbuild");
const { chromium, expect }=require("@playwright/test");
const training=JSON.parse(await readFile("data/seed/tutorial-session.json","utf8"));
const actions = `
const training=${JSON.stringify(training)};
const notePlan={title:"Proposed discussion plan",goals:["Clarify concerns"],next_steps:["Discuss assessment with the clinician"],monitoring:["Review symptoms"],follow_up:"Clinician review",red_flags:[]};
const response={status:"agent",answer:"Here is a proposed plan for review [W1].",category:"clinical",sources:[{kind:"web",citation:"W1",title:"WHO reference",url:"https://www.who.int/topic",accessedAt:"2026-10-07T10:00:00.000Z"}],notice:null,clinical:{differential:[],medication_options:[],missing_information:["Confirm current context"],plan:notePlan}};
window.apiCalls=[];window.completedReplies=0;
export async function listBrainPatientsAction(){window.apiCalls.push("clients");return [{patientId:"fixture-client",displayName:"Fixture Client",approvedNoteCount:1,mostRecentConsultationDate:"2026-10-07"}];}
export async function listAgentThreadsAction(patientId){window.apiCalls.push("history");await new Promise(resolve=>setTimeout(resolve,600));return [{threadId:"saved-thread",startedAt:"2026-10-07T10:00:00.000Z",entries:[{question:"Previously saved question",response:{...response,clinical:null,category:"general",answer:"Previously saved reply"},timestamp:"2026-10-07T10:00:00.000Z"}]}];}
export async function sendAgentMessageAction(input){window.apiCalls.push(input);await new Promise(resolve=>setTimeout(resolve,1000));window.completedReplies++;return {ok:true,response:input.patientId?response:{...response,clinical:null,category:"general",answer:"General reply without a client",sources:[]},timestamp:new Date().toISOString(),threadId:input.threadId||"server-thread",persisted:true};}
export async function getClinicalContextAction(){window.apiCalls.push("context");await new Promise(resolve=>setTimeout(resolve,600));return {age:null,allergies:"",current_medications:"",pregnancy_status:"",kidney_function:"",liver_function:"",vitals:"",current_concern:"",confirmed_at:null,medication_context_confirmed:false};}
export async function saveClinicalContextAction(patientId,context){window.apiCalls.push({saveContext:context});await new Promise(resolve=>setTimeout(resolve,100));return {ok:true,context};}
export async function listClinicalPlansAction(){await new Promise(resolve=>setTimeout(resolve,600));return [{id:"plan-fixture",patient_id:"fixture-client",title:"Reviewed discussion plan",reviewed_content:"Clinician reviewed content [W1] [N1]",generated_plan:notePlan,sources:[...response.sources,{kind:"note",citation:"N1",noteId:"source-fixture",consultationDate:"2026-10-07"}],reviewed_at:"2026-10-07T10:00:00.000Z"}];}
export async function listClientsAction(){window.apiCalls.push("capture-clients");await new Promise(resolve=>setTimeout(resolve,1500));return [{patientId:"fixture-client",displayName:"Fixture Client",firstName:"Fixture",lastName:"Client",noteCount:1,firstSessionDate:"2026-10-07",lastSessionDate:"2026-10-07"}];}
export async function getPatientInsightsAction(){throw Error("Unexpected insights request");}
export async function getClientDetailAction(){throw Error("Unexpected timeline request");}
export async function createClientAction(input){return {ok:true,client:{...training.client,...input}};}
export async function generateDraftAction(input){window.apiCalls.push({generate:input});if(window.holdGeneration)await new Promise(resolve=>{window.finishGeneration=resolve});else await new Promise(resolve=>setTimeout(resolve,600));if(window.failGeneration)return {ok:false,message:"Generation failed; please retry."};return {ok:true,draft:{...training.draft,session_info:input.session_info,patient_id:input.patient_id,patient_display_name:input.patient_display_name,raw_transcript:input.transcript}};}
export async function approveDraftAction(note){window.apiCalls.push({approve:note});return {ok:true,noteId:"workflow-note-"+window.apiCalls.length,approvedAt:new Date().toISOString()};}
export async function modifyNoteAction(input){window.apiCalls.push({modify:input});await new Promise(resolve=>{window.completeRefinement=resolve});return {ok:true,assistantReply:"Draft refined",updatedNote:{...input.note,summary:training.draft.summary}};}
export async function translateTranscriptToUrduAction(){throw Error("Unexpected translation request");}
export async function translateNoteToUrduAction(note){window.apiCalls.push({translate:note});await new Promise(resolve=>{window.completeTranslation=resolve});return {ok:true,urduNote:note};}
export async function reviewClinicalPlanAction(input){window.apiCalls.push({reviewPlan:input});await new Promise(resolve=>setTimeout(resolve,100));return {ok:true};}
`;
const bundled=await build({stdin:{contents:`
import React from "react";import {createRoot} from "react-dom/client";import {BrainChat} from "./app/components/brain-chat";import {ScribeDashboard} from "./app/components/scribe-dashboard";import {ReviewedPlansPanel} from "./app/components/reviewed-plans-panel";import "./app/globals.css";
const root=createRoot(document.getElementById("root"));window.showScribe=()=>root.render(<ScribeDashboard ownerId="fixture-owner"/>);window.showReviewedPlans=()=>root.render(<ReviewedPlansPanel patientId="fixture-client"/>);root.render(<div className="chatgpt-page-wrapper"><BrainChat/></div>);
`,resolveDir:process.cwd(),loader:"tsx"},jsx:"automatic",bundle:true,write:false,format:"iife",outdir:".",define:{"process.env":"{}","process.env.NODE_ENV":'"development"'},plugins:[{name:"mock-actions",setup(build){build.onResolve({filter:/^@[/]app[/]actions$/},()=>({path:"actions",namespace:"test"}));build.onLoad({filter:/.*/,namespace:"test"},()=>({contents:actions,loader:"js"}));}}]});
const js=bundled.outputFiles.find(file=>file.path.endsWith(".js")).text;
const css=bundled.outputFiles.find(file=>file.path.endsWith(".css")).text;
const browser=await chromium.launch({executablePath:await resolveChrome(chromium),headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}});page.setDefaultTimeout(5000);
 const errors=[];page.on("pageerror",error=>{errors.push(error.message);console.error("UI runtime:",error.message);});
 await page.route("https://rawaan-ui.test/**",async route=>{const url=new URL(route.request().url());if(url.pathname === "/font.ttf")return route.fulfill({contentType:"font/ttf",body:await readFile("app/fonts/onest-variable.ttf")});if(url.pathname === "/_next/image" || url.pathname === "/images/rawaan-mascot.png")return route.fulfill({contentType:"image/png",body:await readFile("public/images/rawaan-mascot.png")});return route.fulfill({contentType:"text/html",body:'<html><head><style>@font-face{font-family:Onest;src:url(/font.ttf)}body{--font-onest:Onest}html,body,#root{height:100%;margin:0}'+css+'</style></head><body><div id="root"></div><script>'+js.replaceAll("</script>","<\\/script>")+'</script></body></html>'});});
 await page.goto("https://rawaan-ui.test/");
 await expect(page.getByRole("textbox",{name:"Message Rawaan"})).toBeEnabled();
 expect(await page.evaluate(()=>window.apiCalls)).toEqual([]);
 await page.getByRole("textbox",{name:"Message Rawaan"}).fill("Explain a concept");
 await page.getByRole("button",{name:"Send message",exact:true}).click();
 await expect(page.getByRole("status").filter({hasText:"Thinking and checking sources"})).toBeVisible();
 await expect(page.getByText("General reply without a client", {exact:true})).toBeVisible();
 await page.getByRole("combobox",{name:"Client:"}).focus();
 await expect(page.getByRole("option",{name:"Fixture Client"})).toHaveCount(1);
 await page.getByRole("combobox",{name:"Client:"}).selectOption("fixture-client");
 await expect(page.getByRole("textbox",{name:"Message Rawaan"})).toBeEnabled();
 await expect(page.getByRole("spinbutton",{name:"Age",exact:true})).toHaveCount(0);
 await page.getByRole("textbox",{name:"Message Rawaan"}).fill("Draft a treatment plan from the saved sessions");
 await page.getByRole("button",{name:"Send message",exact:true}).click();
 await expect(page.getByRole("button",{name:"Review and save plan"})).toBeVisible();
 expect(await page.evaluate(()=>window.apiCalls.includes("context")||window.apiCalls.some(value=>typeof value==="object"&&value.saveContext))).toBe(false);
 await page.getByRole("button",{name:"New chat",exact:true}).click();
 await page.getByRole("button",{name:"Clinical context",exact:true}).click();
 await expect(page.getByRole("status").filter({hasText:"Loading clinical context"})).toBeVisible();
 await page.getByRole("spinbutton",{name:"Age",exact:true}).fill("30");
 await page.getByRole("textbox",{name:"Current concern",exact:true}).fill("Current concerns reviewed");
 await page.getByRole("checkbox",{name:"I have confirmed"}).check();
 await page.getByRole("button",{name:"Save clinical context",exact:true}).click();
 await expect(page.getByText("Clinical context saved.",{exact:true})).toBeVisible();
 await page.getByRole("button",{name:"Close",exact:true}).click();
 await page.getByRole("textbox",{name:"Message Rawaan"}).fill("Draft a treatment plan");
 await page.getByRole("button",{name:"Send message",exact:true}).click();
 await expect(page.getByRole("button",{name:"Review and save plan"})).toBeVisible();
 await expect(page.getByRole("link",{name:"[W1] WHO reference"})).toHaveAttribute("href","https://www.who.int/topic");
 await page.getByRole("button",{name:"Review and save plan"}).click();
 await page.getByRole("textbox",{name:"Reviewed treatment plan"}).fill("Clinician-reviewed plan content");
 await page.getByRole("button",{name:"Confirm review and save",exact:true}).click();
 await expect(page.getByText("Reviewed plan saved to this client.",{exact:true})).toBeVisible();
 await page.locator(".chatgpt-messages-container").evaluate(element=>{element.scrollTop=0});
 await page.screenshot({path:"plans/2026-10-07-clinical-assistant/agent-desktop.png",fullPage:true});
 await page.getByRole("combobox",{name:"Assistant mode"}).selectOption("records");
 await page.getByRole("textbox",{name:"Message Rawaan"}).fill("What was recorded?");
 await page.getByRole("button",{name:"Send message",exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>window.apiCalls.filter(value=>typeof value==="object"&&value.mode==="records").length)).toBe(1);
 await page.getByRole("combobox",{name:"Client:"}).selectOption("");
 await expect(page.getByRole("textbox",{name:"Message Rawaan"})).toBeDisabled();
 await page.getByRole("combobox",{name:"Assistant mode"}).selectOption("assistant");
 await expect(page.getByRole("textbox",{name:"Message Rawaan"})).toBeEnabled();
 await page.setViewportSize({width:390,height:844});
 await page.getByRole("button",{name:"Chat history",exact:true}).click();
 await expect(page.getByRole("status").filter({hasText:"Loading conversations"})).toBeVisible();
 await page.getByRole("button",{name:"Previously saved question"}).click();
 await expect(page.getByText("Previously saved reply",{exact:true})).toBeVisible();
 await page.screenshot({path:"plans/2026-10-07-clinical-assistant/agent-mobile.png",fullPage:true});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.setViewportSize({width:1440,height:900});
 const completed=await page.evaluate(()=>window.completedReplies);
 await page.getByRole("textbox",{name:"Message Rawaan"}).fill("Check stale reply");
 await page.getByRole("button",{name:"Send message",exact:true}).click();
 await page.getByRole("button",{name:"New chat",exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>window.completedReplies)).toBeGreaterThan(completed);
 await expect(page.getByText("General reply without a client",{exact:true})).toHaveCount(0);
 await page.evaluate(()=>window.showReviewedPlans());
 await expect(page.getByRole("status").filter({hasText:"Loading reviewed plans"})).toBeVisible();
 await expect(page.getByRole("link",{name:"[N1] Client note"})).toHaveAttribute("href","/clients/fixture-client/sessions/source-fixture");
 await expect(page.getByRole("link",{name:"[W1] WHO reference"})).toHaveAttribute("href","https://www.who.int/topic");
 await page.evaluate(()=>window.showScribe());
 await expect(page.getByRole("heading",{name:"Record",exact:true})).toBeVisible();
 expect(await page.evaluate(()=>window.apiCalls.includes("capture-clients"))).toBe(false);
 await page.locator("button.action-card").first().click();
 await page.getByRole("button",{name:/Search for an existing client/}).click();
 await expect(page.getByRole("status").filter({hasText:"Loading clients"})).toBeVisible();
 await expect(page.getByRole("option",{name:/Fixture Client/})).toBeVisible();
 expect(await page.evaluate(()=>window.apiCalls.filter(value=>value==="capture-clients").length)).toBe(1);
 await page.getByRole("button",{name:"Close modal",exact:true}).click();
 await page.getByRole("button",{name:/Write a summary/}).click();
 await page.getByRole("textbox",{name:"Session summary",exact:true}).fill(training.draft.raw_transcript);
 await page.getByRole("button",{name:"Continue to assign client",exact:true}).click();
 await page.getByRole("button",{name:"+ Create New",exact:true}).click();
 await page.getByPlaceholder("Client First Name",{exact:true}).fill(training.client.firstName);
 await page.getByPlaceholder("Client Last Name",{exact:true}).fill(training.client.lastName);
 await page.getByRole("button",{name:"Create New Client",exact:true}).click();
 await page.evaluate(()=>{window.failGeneration=true});
 await page.getByRole("button",{name:"Next",exact:true}).click();
 await expect(page.getByRole("status").filter({hasText:"Putting your note together..."})).toBeVisible();
 await expect(page.getByRole("button",{name:/Create empty note/})).toHaveCount(0);
 await expect(page.getByRole("button",{name:"Upload",exact:true})).toHaveCount(0);
 await expect(page.getByRole("dialog",{name:"Assign Session",exact:true})).toBeVisible();
 await page.getByRole("button",{name:"Close modal",exact:true}).click();
 await expect(page.getByRole("button",{name:"Resume captured session",exact:true})).toBeVisible();
 const stored=await page.evaluate(()=>sessionStorage.getItem("rawaan-active-workspace-draft:fixture-owner"));
 expect(JSON.parse(stored).pendingSession.transcript).toBe(training.draft.raw_transcript);
 // Re-mount the dashboard as navigation would, restoring the unassigned audio.
 await page.evaluate(()=>window.showReviewedPlans());await page.evaluate(()=>window.showScribe());
 await expect(page.getByRole("dialog",{name:"Assign Session",exact:true})).toBeVisible();
 await page.getByRole("button",{name:/Search for your client/}).click();
 await page.getByRole("option",{name:/Fixture Client/}).click();
 await page.evaluate(()=>{window.failGeneration=false});
 await page.getByRole("button",{name:"Next",exact:true}).click();
 await expect(page.getByRole("button",{name:"Approve & Save Note",exact:true})).toBeEnabled();
 await page.getByRole("button",{name:"Edit note",exact:true}).click();
 await page.getByRole("textbox",{name:"Ask Rawaan to refine this draft",exact:true}).fill("Refine the summary");
 await page.getByRole("button",{name:"Send message",exact:true}).click();
 await expect(page.getByRole("button",{name:"Approve & Save Note",exact:true})).toBeDisabled();
 await expect(page.getByRole("textbox",{name:"Summary",exact:true})).toBeDisabled();
 expect(await page.evaluate(()=>window.apiCalls.some(call=>call.approve))).toBe(false);
 await page.evaluate(()=>window.completeRefinement());
 await expect(page.getByRole("button",{name:"Approve & Save Note",exact:true})).toBeEnabled();
 await page.getByRole("button",{name:"Translate note to Urdu",exact:true}).first().click();
 await expect(page.getByRole("button",{name:"Approve & Save Note",exact:true})).toBeDisabled();
 await page.evaluate(()=>window.completeTranslation());
 await page.getByRole("button",{name:"Switch to English",exact:true}).click();
 await expect(page.getByRole("button",{name:"Approve & Save Note",exact:true})).toBeEnabled();
 await page.getByRole("button",{name:"Approve & Save Note",exact:true}).click();
 await expect(page.getByText("Approved notes are read-only.",{exact:true})).toBeVisible();
 await page.getByRole("button",{name:"Translate note to Urdu",exact:true}).first().click();
 await expect.poll(()=>page.evaluate(()=>window.apiCalls.filter(call=>call.translate).at(-1)?.translate.approval_status)).toBe("approved");
 await page.evaluate(()=>window.completeTranslation());
 await expect(page.getByText("Approved notes are read-only.",{exact:true})).toBeVisible();
 await page.getByRole("button",{name:"Switch to English",exact:true}).click();
 await page.getByRole("button",{name:"Back",exact:true}).click();
 // Create another client via a manual note and check it appears in capture.
 await page.getByRole("button",{name:/Create empty note/}).click();
 await page.getByRole("button",{name:"+ Create New",exact:true}).click();
 await page.getByPlaceholder("Client First Name",{exact:true}).fill(training.client.firstName);
 await page.getByPlaceholder("Client Last Name",{exact:true}).fill(training.client.lastName);
 await page.getByRole("button",{name:"Create New Client",exact:true}).click();
 await page.getByRole("button",{name:"Close modal",exact:true}).click();
 await expect(page.getByRole("button",{name:/Options for/}).first()).toBeDisabled();
 await page.getByRole("button",{name:"Resume captured session",exact:true}).click();
 await page.getByRole("button",{name:/Search for your client/}).click();
 await page.getByRole("option",{name:new RegExp(training.client.displayName)}).click();
 await page.getByRole("button",{name:"Next",exact:true}).click();
 await page.getByRole("button",{name:"Approve & Save Note",exact:true}).click();
 await page.getByRole("button",{name:"Back",exact:true}).click();
 await page.getByRole("button",{name:/Record in-person/}).click();
 await page.getByRole("button",{name:/Search for an existing client/}).click();
 await expect(page.getByRole("option",{name:new RegExp(training.client.displayName)})).toBeVisible();
 // Exercise native MediaRecorder with synthetic audio, never the user's microphone.
 await page.keyboard.press("Escape");
 await page.evaluate(()=>{
   window.captureStreams=[];
   Object.defineProperty(navigator.mediaDevices,"getUserMedia",{value:async()=>{
     const context=new AudioContext();const destination=context.createMediaStreamDestination();
     const source=context.createOscillator();source.connect(destination);source.start();
     window.captureStreams.push(destination.stream);return destination.stream;
   }});
   const NativeRecorder=window.MediaRecorder;
   window.MediaRecorder=class extends NativeRecorder{constructor(...args){super(...args);window.testRecorder=this;this.addEventListener("dataavailable",event=>{window.recordedBytes=(window.recordedBytes||0)+event.data.size});}};
 });
 let transcriptionRoute;
 await page.route("**/api/transcribe",route=>{transcriptionRoute=route;});
 const approvalsBeforeRecording=await page.evaluate(()=>window.apiCalls.filter(call=>call.approve).length);
 await page.getByRole("button",{name:"Start recording",exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>window.recordedBytes||0)).toBeGreaterThan(0);
 await page.getByRole("button",{name:"Stop recording",exact:true}).click();
 const transcribing=page.getByRole("status").filter({hasText:"Giving your keyboard a breather..."});
 await expect(transcribing).toBeVisible();
 await expect.poll(()=>page.evaluate(()=>window.captureStreams.every(stream=>stream.getTracks().every(track=>track.readyState==="ended")))).toBe(true);
 await expect.poll(()=>Boolean(transcriptionRoute)).toBe(true);
 expect(await page.locator("body").innerText()).not.toContain("Whisper");
 await page.screenshot({path:"plans/2026-10-23-recording-loading/transcribing-desktop.png"});
 await page.setViewportSize({width:390,height:844});
 await page.emulateMedia({reducedMotion:"reduce"});
 await expect(transcribing).toBeVisible();
 expect(await transcribing.locator("svg").evaluate(element=>getComputedStyle(element).animationName)).toBe("none");
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:"plans/2026-10-23-recording-loading/transcribing-mobile.png"});
 await transcriptionRoute.fulfill({contentType:"application/json",body:JSON.stringify({ok:true,transcript:training.draft.raw_transcript})});
 await expect(page.getByRole("dialog",{name:"Assign Session",exact:true})).toBeVisible();
 await page.getByRole("button",{name:/Search for your client/}).click();
 await page.getByRole("option",{name:/Fixture Client/}).click();
 await page.evaluate(()=>{window.holdGeneration=true});
 await page.getByRole("button",{name:"Next",exact:true}).click();
 const generating=page.getByRole("status").filter({hasText:"Putting your note together..."});
 await expect(generating).toBeVisible();
 await expect(page.getByRole("heading",{name:"Record",exact:true})).toHaveCount(0);
 await page.screenshot({path:"plans/2026-10-23-recording-loading/generating-mobile.png"});
 await page.setViewportSize({width:1440,height:900});
 await page.screenshot({path:"plans/2026-10-23-recording-loading/generating-desktop.png"});
 await page.evaluate(()=>window.finishGeneration());
 await expect(page.getByRole("button",{name:"Approve & Save Note",exact:true})).toBeEnabled();
 await page.getByRole("tab",{name:"Transcript",exact:true}).click();
 await expect(page.getByText("Your words, without the writer's cramp.",{exact:true})).toBeVisible();
 expect(await page.locator("body").innerText()).not.toContain("Whisper");
 await page.getByRole("tab",{name:"Session Information",exact:true}).click();
 await expect(page.getByText("The conversation, now on paper",{exact:true})).toBeVisible();
 expect(await page.locator("body").innerText()).not.toContain("Whisper");
 expect(await page.evaluate(()=>window.apiCalls.filter(call=>call.approve).length)).toBe(approvalsBeforeRecording);
 expect(errors).toEqual([]);
 console.log("PASS: actual assistant UI, optional context, history/source links/reviewed plans/mobile; Scribe failed-generation recovery, navigation restore, approval/refinement/translation exclusion, approved translation cache and new-client next-capture selection. APIs mocked; no hosted writes.");
}finally{await browser.close();}
