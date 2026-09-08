// Live summary smoke check with fictional training records only.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const root=resolve(dirname(fileURLToPath(import.meta.url)),"..");
const require=createRequire(import.meta.url);
const {build}=require("esbuild");
const compiled=await build({stdin:{contents:'export { runRawaanAgent } from "./lib/llm/rawaan-agent"; export { createLlmProviderFromEnv } from "./lib/llm/provider"; export { createTavilySearch } from "./lib/tools/web-search"; export { clinicalContextSchema } from "./lib/clinical/schema"; export { noteSchema } from "./lib/notes/schema";',resolveDir:root},bundle:true,write:false,platform:"node",format:"esm"});
const {runRawaanAgent,createLlmProviderFromEnv,createTavilySearch,clinicalContextSchema,noteSchema}=await import(`data:text/javascript;base64,${Buffer.from(compiled.outputFiles[0].text).toString("base64")}`);
const fixture=JSON.parse(await readFile(resolve(root,"data/seed/tutorial-session.json"),"utf8"));
const note=noteSchema.parse({...fixture.draft,id:"tutorial-note",approval_status:"approved",approved_at:"2026-10-08T09:01:00.000Z"});
const outputs=[];
let stage="setup";
const treatment=process.argv.includes("--treatment");
const artifact=resolve(root,`plans/2026-10-08-agent-summary-recovery/live-${treatment?"treatment":"summary"}.json`);
try {
  const provider=createLlmProviderFromEnv(process.env,4096);
  if(treatment)assert.ok(process.env.TAVILY_API_KEY,"Tavily must be configured for the live treatment check.");
  const response=await runRawaanAgent({question:treatment?"Search internet and give me some treatment":"Summarize this client's session history",notes:[note],context:clinicalContextSchema.parse({}),history:[],webEnabled:true},{complete:async input=>{
    stage=outputs.length?"answer_request":"planner_request";
    const output=await provider.complete(input);outputs.push(output);
    stage=outputs.length===1?"planner_validation":"answer_validation";
    return output;
  }},treatment?createTavilySearch(process.env.TAVILY_API_KEY):{search:async()=>[]});
  assert.ok(response.answer);
  assert.ok(response.sources.some(source=>source.kind==="note"&&source.noteId===note.id));
  if(treatment){assert.ok(response.clinical?.plan);assert.ok(response.sources.some(source=>source.kind==="web"));}
  await writeFile(artifact,JSON.stringify({fixture:fixture.label,passed:true,response,outputs},null,2));
  console.log(`PASS live Groq fictional selected-client ${treatment?"treatment with Tavily sources":"summary"}; recorded source retained.`);
} catch(error) {
  const message=error.message.startsWith("LLM provider returned")?error.message.match(/^LLM provider returned \d+/)?.[0]||"Provider request failed":error.message;
  await writeFile(artifact,JSON.stringify({fixture:fixture.label,passed:false,stage,message,outputs},null,2));
  console.error(`FAIL fictional summary: ${stage}, ${message}`);
  process.exitCode=1;
}
