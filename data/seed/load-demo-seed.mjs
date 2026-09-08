import { readFile } from "node:fs/promises";
import { noteSchema, noteToRow, parseStoredNote } from "../../lib/notes/schema.ts";
import { patientSchema } from "../../lib/db/schemas.ts";
import { createCliClient, planImport, executeImport } from "../storage-cli.mjs";

const args = process.argv.slice(2);
if (args.some((arg) => arg !== "--reset" && arg !== "--dry-run" && !arg.startsWith("--owner=")) || (args.includes("--reset") && args.includes("--dry-run"))) {
  throw new Error("Usage: npm run seed:demo [-- --dry-run] OR npm run seed:reset");
}
const ownerId = args.find((arg) => arg.startsWith("--owner="))?.slice(8).trim();
if (!ownerId) throw new Error("Fictional seed operations require an explicit --owner=<Clerk user ID>.");
const notes = noteSchema.array().parse(JSON.parse(await readFile(new URL("./demo-patients.json", import.meta.url), "utf8")));
const client = createCliClient();
const owner = await client.from("app_users").select("id").eq("id", ownerId).maybeSingle();
if (owner.error || !owner.data) throw new Error("Owner must first sign in to the workspace so their Supabase account is registered.");
if (args.includes("--reset")) {
  // Delete ONLY canonical seed notes. Preserve patients, their other notes, and chats.
  for (const note of notes) {
    const { error } = await client.from("notes").delete().eq("id", note.id).eq("patient_id", note.patient_id).eq("owner_user_id", ownerId);
    if (error) throw new Error("Could not remove demo notes from Supabase; no local fallback exists.");
  }
  console.log("Removed canonical demo note IDs from Supabase; other records were preserved.");
} else {
  const patients = [...new Map(notes.map((note) => [note.patient_id, {
    id: note.patient_id, display_name: note.patient_display_name,
    first_name: note.first_name ?? "", last_name: note.last_name ?? "",
    email: note.email ?? "", mobile_number: note.mobile_number ?? "",
  }])).values()];
  const patientPlan = await planImport(client, "patients", patients, (row) => patientSchema.parse(row), (row) => row, ownerId);
  const notePlan = await planImport(client, "notes", notes, parseStoredNote, noteToRow, ownerId);
  if (!args.includes("--dry-run")) {
    await executeImport(client, patientPlan);
    await executeImport(client, notePlan);
  }
  console.log((args.includes("--dry-run") ? "Dry run: " : "Imported: ") +
    patientPlan.pending.length + " fictional patients, " + notePlan.pending.length +
    " fictional approved notes; identical existing rows were skipped.");
}
