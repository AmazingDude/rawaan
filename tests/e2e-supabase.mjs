import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { join, resolve, sep } from "node:path";
import assert from "node:assert/strict";
import { clerkTestEnvironment, sessionToken } from "./helpers/clerk-session.mjs";

// Canonical fiction stays under data/seed; no product storage or hosted writes.
const fixture = JSON.parse(await readFile(new URL("../data/seed/demo-patients.json", import.meta.url), "utf8"));
const database = { app_users: [], patients: [], notes: [], chats: [] };
const requests = [];
let failure = null;
const api = createServer(async (request, response) => {
  const url = new URL(request.url, "http://127.0.0.1");
  const table = url.pathname.split("/").at(-1);
  const method = request.method;
  requests.push({ table, method, search: url.searchParams });
  response.setHeader("Content-Type", "application/json");
  if (!database[table]) { response.writeHead(404).end("{}"); return; }
  if (failure?.table === table && (!failure.method || failure.method === method)) {
    response.writeHead(503).end(JSON.stringify({ code: "test_failure", message: "Test storage unavailable" })); return;
  }
  const matches = (row) => [...url.searchParams].every(([key, value]) =>
    !value.startsWith("eq.") || String(row[key]) === value.slice(3),
  );
  let rows = database[table].filter(matches);
  if (method === "POST") {
    let body = "";
    for await (const chunk of request) body += chunk;
    const input = JSON.parse(body);
    rows = [];
    for (const candidate of Array.isArray(input) ? input : [input]) {
      if (["notes", "chats"].includes(table) && !database.patients.some((patient) => patient.id === candidate.patient_id)) {
        response.writeHead(409).end(JSON.stringify({ code: "23503", message: "Missing patient" })); return;
      }
      const existing = database[table].findIndex((row) => row.id === candidate.id);
      const prefer = request.headers.prefer ?? "";
      if (existing >= 0 && prefer.includes("ignore-duplicates")) continue;
      if (existing >= 0 && !prefer.includes("merge-duplicates")) {
        response.writeHead(409).end(JSON.stringify({ code: "23505", message: "Duplicate id" })); return;
      }
      if (existing >= 0) database[table][existing] = { ...database[table][existing], ...candidate };
      else database[table].push(structuredClone(table === "app_users" ? { clinic_name: "", ...candidate } : candidate));
      rows.push(candidate);
    }
  } else if (method === "PATCH") {
    let body = "";
    for await (const chunk of request) body += chunk;
    const update = JSON.parse(body);
    rows = database[table].filter(matches);
    for (const row of rows) Object.assign(row, update);
  } else if (method === "DELETE") {
    database[table] = database[table].filter((row) => !matches(row));
    response.writeHead(204).end(); return;
  } else {
    const order = url.searchParams.get("order");
    if (order) rows.sort((a, b) => {
      for (const field of order.split(",")) {
        const [key, direction] = field.split(".");
        const comparison = String(a[key]).localeCompare(String(b[key]));
        if (comparison) return direction === "desc" ? -comparison : comparison;
      }
      return 0;
    });
    const offset = Number(url.searchParams.get("offset") ?? 0);
    rows = rows.slice(offset, offset + Number(url.searchParams.get("limit") ?? 1000));
  }
  // Match Postgres timestamptz serialization and JSONB key ordering.
  rows = rows.map((row) => ({ ...row,
    ...(row.approved_at ? { approved_at: new Date(row.approved_at).toISOString().replace("Z", "+00:00") } : {}),
    ...(row.session_info ? { session_info: Object.fromEntries(Object.entries(row.session_info).reverse()) } : {}),
  }));
  const single = request.headers.accept?.includes("vnd.pgrst.object");
  if (single && rows.length !== 1) { response.writeHead(406).end(JSON.stringify({ code: "PGRST116" })); return; }
  response.writeHead(200).end(JSON.stringify(single ? rows[0] : rows));
});
await new Promise((resolve) => api.listen(0, "127.0.0.1", resolve));
const apiUrl = "http://127.0.0.1:" + api.address().port;

const owner = "user_storage_e2e";
const environment = { ...process.env, ...clerkTestEnvironment,
  SUPABASE_URL: apiUrl, NEXT_PUBLIC_SUPABASE_URL: apiUrl,
  SUPABASE_SECRET_KEY: "", SUPABASE_SERVICE_ROLE_KEY: "test-placeholder",
  GROQ_API_KEY: "", TAVILY_API_KEY: "", NEXT_TELEMETRY_DISABLED: "1" };
const app = spawn(process.execPath, ["--import", new URL("./helpers/block-external-fetch.mjs", import.meta.url).href,
  "node_modules/next/dist/bin/next", "start", "--port", "0"], {
  cwd: process.cwd(), env: environment, stdio: ["ignore", "pipe", "pipe"], windowsHide: true,
});
let serverOutput = "";
app.stdout.on("data", chunk => { serverOutput += chunk; });
app.stderr.on("data", chunk => { serverOutput += chunk; });
let scratch;
async function runCli(script, args) {
  // Every CLI is restricted to the loopback mock database and forbidden from
  // fetching external hosts. No .env file or hosted storage key is loaded.
  const child = spawn(process.execPath, ["--import", new URL("./helpers/block-external-fetch.mjs", import.meta.url).href, script, ...args], {
    cwd: process.cwd(), env: environment, stdio: ["ignore", "pipe", "pipe"], windowsHide: true,
  });
  let output = "";
  child.stdout.on("data", chunk => { output += chunk; });
  child.stderr.on("data", chunk => { output += chunk; });
  const [code] = await once(child, "exit");
  return {code, output};
}
try {
  let baseUrl;
  for (let attempt=0; attempt<120; attempt++) {
    assert.equal(app.exitCode, null, "The isolated app exited before readiness.");
    const port = /Local:\s+http:\/\/localhost:(\d+)/.exec(serverOutput)?.[1];
    if (port) {
      baseUrl="http://127.0.0.1:"+port;
      try { if ((await fetch(baseUrl+"/api/health")).status===200) break; } catch { /* Wait for readiness. */ }
    }
    await new Promise(resolve=>setTimeout(resolve,250));
  }
  assert.ok(baseUrl, "The isolated production server did not start.");
  assert.deepEqual(await (await fetch(baseUrl+"/api/health")).json(), {status:"ok"});
  const anonymous=await fetch(baseUrl+"/record",{redirect:"manual"});
  assert.ok([307,308].includes(anonymous.status));
  assert.ok(anonymous.headers.get("location")?.includes("/sign-in"));
  const privateGet = path=>fetch(baseUrl+path, {headers:{Authorization:"Bearer "+sessionToken(owner,baseUrl)},redirect:"manual"});
  const registered=await privateGet("/record");
  assert.equal(registered.status,200, "Authenticated record route: "+JSON.stringify({reason:registered.headers.get("x-clerk-auth-reason"),status:registered.headers.get("x-clerk-auth-status"),redirectPath:new URL(registered.headers.get("location")||"/",baseUrl).pathname}));
  assert.ok(database.app_users.some(row=>row.id===owner));
  const missingOwner=await runCli("data/seed/load-demo-seed.mjs",[]);
  assert.equal(missingOwner.code,1);
  assert.match(missingOwner.output,/explicit --owner/);
  const before=database.notes.length;
  const dry=await runCli("data/seed/load-demo-seed.mjs",["--owner="+owner,"--dry-run"]);
  assert.equal(dry.code,0,dry.output);
  assert.equal(database.notes.length,before);
  const seed=await runCli("data/seed/load-demo-seed.mjs",["--owner="+owner]);
  assert.equal(seed.code,0,seed.output);
  assert.equal(database.notes.length,fixture.length);
  assert.ok(database.notes.every(row=>row.owner_user_id===owner));
  const repeated=await runCli("data/seed/load-demo-seed.mjs",["--owner="+owner]);
  assert.equal(repeated.code,0,repeated.output);
  assert.equal(database.notes.length,fixture.length);
  const foreignOwner="user_other_e2e";
  database.app_users.push({id:foreignOwner,clinic_name:"Other test clinic"});
  const crossOwner=await runCli("data/seed/load-demo-seed.mjs",["--owner="+foreignOwner]);
  assert.equal(crossOwner.code,1);
  assert.ok(database.notes.every(row=>row.owner_user_id===owner));
  // Exercise real production reads and verify backend ownership filters.
  const notesRequestStart=requests.length;
  const own=await privateGet("/record");
  assert.equal(own.status,200);
  assert.match(await own.text(),new RegExp(fixture[0].patient_display_name));
  const other=await fetch(baseUrl+"/record",{headers:{Authorization:"Bearer "+sessionToken(foreignOwner,baseUrl)},redirect:"manual"});
  assert.equal(other.status,200);
  assert.ok(!(await other.text()).includes(fixture[0].patient_display_name));
  const reads=requests.slice(notesRequestStart).filter(request=>request.table==="notes"&&request.method==="GET");
  assert.ok(reads.length>=2);
  assert.ok(reads.every(request=>[owner,foreignOwner].some(id=>request.search.get("owner_user_id")==="eq."+id)));
  failure={table:"notes",method:"GET"};
  const unavailable=await privateGet("/record");
  const failureBody=await unavailable.text();
  // Next can already have streamed the shell with status 200. The error digest
  // must still replace the failed segment, never a false empty record list.
  assert.ok(unavailable.status===500 || (unavailable.status===200 && /digest/.test(failureBody)));
  assert.ok(!failureBody.includes("No sessions yet"));
  assert.ok(!failureBody.includes(fixture[0].patient_display_name));
  failure=null;

  scratch=await mkdtemp(join("data/seed","storage-e2e-"));
  const legacyNote={...fixture[0],id:"isolated-import-note",patient_id:"isolated-import-client"};
  await writeFile(join(scratch,"notes.json"),JSON.stringify([legacyNote]));
  await writeFile(join(scratch,"patients.json"),"[]");
  await writeFile(join(scratch,"chats.json"),"[]");
  const args=["--owner="+owner,"--from="+scratch];
  const importDry=await runCli("data/import-legacy.mjs",args);
  assert.equal(importDry.code,0,importDry.output);
  assert.equal(database.notes.length,fixture.length);
  const imported=await runCli("data/import-legacy.mjs",[...args,"--write"]);
  assert.equal(imported.code,0,imported.output);
  assert.ok(database.notes.some(row=>row.id===legacyNote.id&&row.owner_user_id===owner));
  const importRepeat=await runCli("data/import-legacy.mjs",[...args,"--write"]);
  assert.equal(importRepeat.code,0,importRepeat.output);
  const count=database.notes.length;
  await writeFile(join(scratch,"notes.json"),JSON.stringify([{...legacyNote,summary:"Conflicting fictional import"}]));
  const conflict=await runCli("data/import-legacy.mjs",[...args,"--write"]);
  assert.equal(conflict.code,1);
  assert.equal(database.notes.length,count);
  const reset=await runCli("data/seed/load-demo-seed.mjs",["--owner="+owner,"--reset"]);
  assert.equal(reset.code,0,reset.output);
  assert.deepEqual(database.notes.map(row=>row.id),[legacyNote.id]);
  console.log("PASS isolated production auth/storage reads and CLI contracts: owner registration/isolation, storage failures, seed/import dry runs, retries, conflicts and scoped reset. External fetches blocked; no hosted writes. UI workflows are tested separately.");
} finally {
  if (app.exitCode===null) { app.kill(); await once(app,"exit"); }
  await new Promise(resolve=>api.close(resolve));
  if (scratch) {
    const target=resolve(scratch);
    assert.ok(target.startsWith(resolve("data/seed")+sep),"Unexpected cleanup path");
    await rm(target,{recursive:true,force:true});
  }
}
