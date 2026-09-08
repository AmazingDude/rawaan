import { createClient } from "@supabase/supabase-js";

/** Exercise the installed SDK's HTTP contract, without credentials or a live DB. */
export function createTestDatabase() {
  const tables: Record<string, Record<string, unknown>[]> = {
    app_users: [], patients: [], notes: [], chats: [], general_chats: [], clinical_plans: [],
  };
  const requests: Array<{ url: URL; method: string; body: unknown; headers: Headers }> = [];
  let failure: { table: string; method?: string; status: number } | null = null;
  let serverRowCap = 1000;
  const client = createClient("http://127.0.0.1:9999", "test-placeholder", {
    db: { retry: false },
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: async (input, init) => {
        const url = new URL(String(input));
        const method = init?.method ?? "GET";
        const headers = new Headers(init?.headers);
        const body: unknown = init?.body ? JSON.parse(String(init.body)) : null;
        requests.push({ url, method, body, headers });
        const table = url.pathname.split("/").at(-1)!;
        if (failure?.table === table && (!failure.method || failure.method === method)) {
          return new Response(JSON.stringify({ message: "Storage request rejected", code: "test_failure" }), {
            status: failure.status, headers: { "Content-Type": "application/json" },
          });
        }
        const rows = tables[table];
        if (!rows) throw new Error(`Unexpected table ${table}`);
        let result: Record<string, unknown>[];
        if (method === "POST") {
          const candidates = Array.isArray(body) ? body : [body];
          result = [];
          for (const candidate of candidates as Record<string, unknown>[]) {
            const existing = rows.findIndex((row) => row.id === candidate.id);
            if (existing >= 0 && headers.get("prefer")?.includes("ignore-duplicates")) continue;
            if (existing >= 0) rows[existing] = { ...rows[existing], ...candidate };
            else rows.push({ ...candidate });
            result.push(candidate);
          }
        } else if (method === "PATCH") {
          result = rows.filter((row) => [...url.searchParams].every(([key, value]) =>
            !value.startsWith("eq.") || String(row[key]) === value.slice(3),
          ));
          for (const row of result) Object.assign(row, body);
        } else {
          result = rows.filter((row) => [...url.searchParams].every(([key, value]) =>
            !value.startsWith("eq.") || String(row[key]) === value.slice(3),
          ));
          const order = url.searchParams.get("order");
          if (order) {
            result = [...result].sort((a, b) => {
              for (const field of order.split(",")) {
                const [key, direction] = field.split(".");
                const comparison = String(a[key]).localeCompare(String(b[key]));
                if (comparison) return direction === "desc" ? -comparison : comparison;
              }
              return 0;
            });
          }
          const offset = Number(url.searchParams.get("offset") ?? 0);
          const limit = Math.min(serverRowCap, Number(url.searchParams.get("limit") ?? 1000));
          result = result.slice(offset, offset + limit);
        }
        const single = headers.get("accept")?.includes("vnd.pgrst.object");
        return new Response(JSON.stringify(single ? result[0] : result), {
          status: 200, headers: { "Content-Type": "application/json" },
        });
      },
    },
  });
  return {
    client, tables, requests,
    fail(table: string, status = 503, method?: string) { failure = { table, status, method }; },
    capRows(limit: number) { serverRowCap = limit; },
  };
}
