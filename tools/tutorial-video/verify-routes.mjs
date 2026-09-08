import assert from "node:assert/strict";
import { createServer } from "node:net";
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFile } from "node:fs/promises";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const socket = createServer();
await new Promise(done => socket.listen(0, "127.0.0.1", done));
const port = socket.address().port;
await new Promise(done => socket.close(done));
const child = spawn(process.execPath, [resolve(root, "node_modules/next/dist/bin/next"), "start", "--port", String(port)], { cwd: root, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
let exited = false;
child.once("exit", () => { exited = true; });
child.stdout.on("data", () => {}); child.stderr.on("data", () => {});
const origin = `http://localhost:${port}`;
const results = [];
try {
  let ready = false;
  for (let attempt = 0; attempt < 120; attempt++) {
    if (exited) throw new Error("The isolated production server exited before readiness.");
    try { const response = await fetch(origin + "/how-to-use", { redirect: "manual", signal: AbortSignal.timeout(1000) }); if (response.status === 200) { ready = true; break; } } catch { /* Wait for the server bootstrap. */ }
    await new Promise(done => setTimeout(done, 250));
  }
  assert.equal(ready, true, "Public guide did not become ready.");
  const guide = await fetch(origin + "/how-to-use", { redirect: "manual" });
  assert.equal(guide.status, 200); assert.ok((await guide.text()).includes("Make your first note."));
  results.push({ route: "/how-to-use", status: guide.status });
  for (const route of ["/record", "/clients", "/rawaan-ai", "/learn-rawaan"]) {
    const response = await fetch(origin + route, { redirect: "manual" });
    assert.ok([307, 308].includes(response.status), `${route} is not redirecting signed-out visitors.`);
    assert.ok(response.headers.get("location")?.includes("/sign-in"));
    results.push({ route, status: response.status, signInRedirect: true });
  }
  const api = await fetch(origin + "/api/transcribe", { headers: { Accept: "application/json" }, redirect: "manual" });
  const apiSignInRedirect = [307, 308].includes(api.status) && api.headers.get("location")?.includes("/sign-in");
  assert.ok([401, 403, 404].includes(api.status) || apiSignInRedirect, "Private API did not reject or redirect a signed-out request to Clerk.");
  results.push({ route: "/api/transcribe", status: api.status });
  for (const id of ["first-session", "past-sessions", "rawaan-ai", "overview"]) {
    const response = await fetch(origin + `/tutorials/${id}.mp4`, { headers: { Range: "bytes=0-255" }, redirect: "manual" });
    assert.equal(response.status, 206); assert.ok(response.headers.get("content-type")?.includes("video/mp4")); assert.equal((await response.arrayBuffer()).byteLength, 256);
    const captions = await fetch(origin + `/tutorials/${id}.vtt`, { redirect: "manual" });
    assert.equal(captions.status, 200); assert.ok((await captions.text()).startsWith("WEBVTT"));
    results.push({ route: `/tutorials/${id}.mp4`, status: response.status, publicCaptions: true });
  }
  await writeFile(resolve(root, "plans/2026-10-08-visual-onboarding/route-verification.json"), JSON.stringify(results, null, 2));
  console.log("PASS production routes: public guide/video ranges/captions; protected workspaces redirect to Clerk; private API rejects signed-out requests.");
} finally { child.kill(); }
