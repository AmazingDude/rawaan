import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { StorageError } from "@/lib/db/errors";
export { StorageError } from "@/lib/db/errors";

export type SupabaseClientFactory = () => SupabaseClient;
let cachedClient: SupabaseClient | undefined;


/** Required runtime configuration; never fall back to files or demo records. */
export function getSupabaseClient(): SupabaseClient {
  if (cachedClient) return cachedClient;
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new StorageError();
  try {
    cachedClient = createClient(url, key, {
      db: { retry: false, timeout: 15_000 },
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input, init) => fetch(input, {
          ...init, cache: "no-store",
        }),
      },
    });
    return cachedClient;
  } catch {
    throw new StorageError();
  }
}

export async function storageOperation<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch {
    // Never expose backend error payloads or misrepresent failed reads as empty.
    throw new StorageError();
  }
}

type RowQuery = {
  range(from: number, to: number): PromiseLike<{ data: unknown[] | null; error: unknown }>;
};

/** Each factory must apply filters and deterministic ordering before pagination. */
export async function readAllRows(query: () => RowQuery): Promise<unknown[]> {
  const rows: unknown[] = [];
  const pageSize = 1000;
  for (let offset = 0; ;) {
    const { data, error } = await query().range(offset, offset + pageSize - 1);
    if (error || !data) throw new StorageError();
    if (data.length === 0) return rows;
    rows.push(...data);
    // A project may cap responses below the requested range. Advance by rows
    // actually returned and continue until an explicitly empty terminal page.
    offset += data.length;
  }
}
