import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

const notesPath = join(process.cwd(), "data", "notes.json");
const fixturePath = join(process.cwd(), "data", "seed", "demo-patients.json");
const resetRequested = process.argv.includes("--reset");
const hasUnknownArgument = process.argv.slice(2).some(
  (argument) => argument !== "--reset",
);

if (hasUnknownArgument) {
  throw new Error("Usage: npm run seed:demo [-- --reset]");
}

const notes = resetRequested
  ? []
  : JSON.parse(await readFile(fixturePath, "utf8"));

if (!Array.isArray(notes)) {
  throw new Error("The demo seed fixture must be a JSON array of approved notes.");
}

await mkdir(dirname(notesPath), { recursive: true });
await writeFile(notesPath, `${JSON.stringify(notes, null, 2)}\n`);

console.log(
  resetRequested
    ? "Reset data/notes.json to an empty array."
    : `Loaded ${notes.length} fictional approved demo notes into data/notes.json.`,
);
