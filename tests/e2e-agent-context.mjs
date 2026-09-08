// Live provider smoke check using explicitly fictional seed content only.
// No Supabase or Clerk calls, search requests, or account records are changed.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const require=createRequire(import.meta.url);
const {build}=require("esbuild");
const built=await build({stdin:{contents:'export { runRawaanAgent } from "./lib/llm/rawaan-agent"; export { createLlmProviderFromEnv } from "./lib/llm/provider"; export { clinicalContextSchema } from "./lib/clinical/schema"; export { noteSchema } from "./lib/notes/schema";',resolveDir:root},bundle:true,write:false,platform:"node",format:"esm"});
const {runRawaanAgent,createLlmProviderFromEnv,clinicalContextSchema,noteSchema}=await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString("base64")}`);
const fixture=JSON.parse(await readFile(resolve(root,"data/seed/tutorial-session.json"),"utf8"));
const note=noteSchema.parse({...fixture.draft,id:"tutorial-note",approval_status:"approved",approved_at:"2026-10-08T09:01:00.000Z"});
const outputPath=resolve(root,"plans/2026-10-08-automatic-ai-context/live-provider-verification.json");
const provider=createLlmProviderFromEnv(process.env,4096);
const outputs=[];
try {
const response=await runRawaanAgent({question:fixture.planQuestion,notes:[note],context:clinicalContextSchema.parse({}),history:[],webEnabled:false},{complete:async input=>{const output=await provider.complete(input);outputs.push(output);return output;}});
assert.equal(response.status,"agent");
assert.ok(response.clinical?.plan,"A discussion plan should not require an intake form.");
assert.equal(response.clinical.medication_options.length,0);
assert.ok(response.sources.some(source=>source.kind==="note"&&source.noteId===note.id),"The plan should retain its recorded source.");
assert.doesNotMatch(response.answer,/before I can|confirm.{0,40}clinical context|complete.{0,40}(?:form|intake)/i);
assert.ok(!response.clinical.missing_information.some(value=>/\b(?:age|allergies|kidney|liver|pregnancy)\b|24 hours|confirm.{0,30}context/i.test(value)),"A non-medication follow-up plan should not append a generic intake checklist.");
await writeFile(outputPath,JSON.stringify({fixture:fixture.label,approvedSessions:1,optionalFormCompleted:false,webSearchEnabled:false,response},null,2));
console.log("PASS live Groq: discussion plan from a saved session with blank optional context; recorded source retained; no intake prerequisite or generic checklist.");
} catch(error) {
  const message=error.message.startsWith("LLM provider returned")?error.message.match(/^LLM provider returned \d+/)?.[0]||"Provider request failed":error.message;
  await writeFile(outputPath,JSON.stringify({fixture:fixture.label,passed:false,message,outputs},null,2));
  console.error("Live Groq check failed: "+message);
  process.exitCode=1;
}
