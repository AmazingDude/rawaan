import { readFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { noteSchema, noteToRow, parseStoredNote } from "../lib/notes/schema.ts";
import { patientSchema, chatRowSchema } from "../lib/db/schemas.ts";
import { createCliClient, planImport, executeImport, uniqueRows } from "./storage-cli.mjs";

const args = process.argv.slice(2);
if (args.some((arg) => arg !== "--write" && !arg.startsWith("--from=") && !arg.startsWith("--owner="))) {
  throw new Error("Usage: npm run storage:import -- --owner=user_clerk_id [--from=data/legacy-json --write]");
}
const ownerId = args.find((arg) => arg.startsWith("--owner="))?.slice(8).trim();
if (!ownerId) throw new Error("Pass --owner=<Clerk user ID>. Imports cannot claim shared or foreign records automatically.");
const directory = resolve(args.find((arg) => arg.startsWith("--from="))?.slice(7) ?? "data/legacy-json");
async function readLegacy(name) {
  try { return JSON.parse(await readFile(join(directory, name + ".json"), "utf8")); }
  catch (error) { if (error.code === "ENOENT") return []; throw error; }
}
const notes = noteSchema.array().parse(await readLegacy("notes"));
const registered = patientSchema.array().parse(await readLegacy("patients"));
const chats = chatRowSchema.array().parse((await readLegacy("chats")).map((entry) => ({
  id: entry.id, patient_id: entry.patientId, thread_id: entry.threadId,
  question: entry.question, response: entry.response, timestamp: entry.timestamp,
})));
const patientsById = uniqueRows("patients", registered);
for (const note of notes) {
  if (!patientsById.has(note.patient_id)) patientsById.set(note.patient_id, {
    id: note.patient_id, display_name: note.patient_display_name,
    first_name: note.first_name ?? "", last_name: note.last_name ?? "",
    email: note.email ?? "", mobile_number: note.mobile_number ?? "",
  });
}
for (const chat of chats) {
  if (!patientsById.has(chat.patient_id)) throw new Error("A legacy chat has no registered patient or note identity. Import aborted.");
}
const client = createCliClient();
const owner = await client.from("app_users").select("id").eq("id", ownerId).maybeSingle();
if (owner.error || !owner.data) throw new Error("Owner must first sign in to the workspace so their Supabase account is registered.");
const plans = [
  await planImport(client, "patients", [...patientsById.values()], (row) => patientSchema.parse(row), (row) => row, ownerId),
  await planImport(client, "notes", notes, parseStoredNote, noteToRow, ownerId),
  await planImport(client, "chats", chats, (row) => chatRowSchema.parse(row), (row) => row, ownerId),
];
for (const plan of plans) console.log(plan.table + ": " + plan.pending.length + " new, " + plan.identical + " identical");
if (args.includes("--write")) {
  for (const plan of plans) await executeImport(client, plan);
  console.log("Confirmed import to Supabase. Backup files were preserved.");
} else console.log("Dry run only. Review conflicts/counts, then add --write to import. No cloud rows were changed.");
