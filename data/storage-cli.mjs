import { createClient } from "@supabase/supabase-js";
import { isDeepStrictEqual } from "node:util";

export function createCliClient() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Supabase URL and a server-only SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY are required; see .env.example. An anon key cannot safely preflight records hidden by RLS.");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { timeout: 15_000, retry: false },
  });
}

function errorCode(error) {
  return typeof error?.code === "string" && /^[A-Z0-9_]{1,32}$/i.test(error.code) ? error.code : "unknown";
}

/** Preflight every candidate; callers finish all preflights before any insert. */
export function uniqueRows(table, rows) {
  const unique = new Map();
  for (const row of rows) {
    const previous = unique.get(row.id);
    if (previous && !isDeepStrictEqual(previous, row)) throw new Error(`Conflicting input rows in ${table}: ${row.id}`);
    unique.set(row.id, row);
  }
  return unique;
}

export async function planImport(client, table, rows, parse, serialize, ownerId) {
  if (!ownerId?.trim()) throw new Error("An explicit Clerk owner ID is required for imports.");
  const unique = uniqueRows(table, rows);
  const pending = [];
  let identical = 0;
  for (const row of unique.values()) {
    const { data, error } = await client.from(table).select("*").eq("id", row.id).maybeSingle();
    if (error) throw new Error(`Could not read ${table} (Supabase code ${errorCode(error)}); check the schema and server-role permissions.`);
    if (!data) pending.push(row);
    else if (data.owner_user_id === ownerId && isDeepStrictEqual(parse(data), row)) identical++;
    else throw new Error(`Existing ${table} row differs: ${row.id}. Import aborted without overwriting it.`);
  }
  return { table, pending, identical, parse, serialize: (row) => ({ ...serialize(row), owner_user_id: ownerId }) };
}

export async function executeImport(client, plan) {
  for (const row of plan.pending) {
    // Plain INSERT rejects IDs created since preflight rather than overwriting them.
    const { data, error } = await client.from(plan.table).insert(plan.serialize(row)).select("*").single();
    if (error) throw new Error(`Import stopped at ${plan.table} row ${row.id} (Supabase code ${errorCode(error)}). Earlier confirmed inserts remain; rerun the dry-run before retrying.`);
    if (!data || !isDeepStrictEqual(plan.parse(data), row)) throw new Error(`Import response did not match ${plan.table} row ${row.id}. The row may have been inserted; rerun the dry-run before retrying.`);
  }
}
