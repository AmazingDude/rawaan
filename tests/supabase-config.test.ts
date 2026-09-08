import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.resetModules(); });

describe("required Supabase configuration", () => {
  it("rejects missing credentials rather than returning an optional store", async () => {
    for (const key of ["SUPABASE_URL", "SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY", "NEXT_PUBLIC_SUPABASE_URL"]) {
      vi.stubEnv(key, "");
    }
    const { getSupabaseClient } = await import("@/lib/db/supabase");
    expect(() => getSupabaseClient()).toThrow("Patient storage is unavailable");
  });

  it("uses server runtime credentials and disables auth persistence", async () => {
    vi.stubEnv("SUPABASE_URL", "http://127.0.0.1:9999");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-placeholder");
    vi.stubEnv("SUPABASE_SECRET_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "invalid-legacy-url");
    const { getSupabaseClient } = await import("@/lib/db/supabase");
    expect(getSupabaseClient()).toBe(getSupabaseClient());
    expect(await getSupabaseClient().auth.getSession()).toEqual({ data: { session: null }, error: null });
  });

  it("rejects anon-only configuration instead of treating RLS-hidden records as empty", async () => {
    vi.stubEnv("SUPABASE_URL", "http://127.0.0.1:9999");
    vi.stubEnv("SUPABASE_SECRET_KEY", "");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
    vi.stubEnv("SUPABASE_ANON_KEY", "test-placeholder");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-placeholder");
    const { getSupabaseClient } = await import("@/lib/db/supabase");
    expect(() => getSupabaseClient()).toThrow("Patient storage is unavailable");
  });

  it("sends the secret key rather than the service role or public anon key when configured", async () => {
    vi.stubEnv("SUPABASE_URL", "http://127.0.0.1:9999");
    vi.stubEnv("SUPABASE_SECRET_KEY", "sb_secret_unit_test_placeholder");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "test-legacy-placeholder");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "test-public-placeholder");
    const request = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(new Headers(init?.headers).get("apikey")).toBe("sb_secret_unit_test_placeholder");
      return new Response("[]", { headers: { "Content-Type": "application/json" } });
    });
    vi.stubGlobal("fetch", request);
    const { getSupabaseClient } = await import("@/lib/db/supabase");
    const { error } = await getSupabaseClient().from("patients").select("id").limit(0);
    expect(error).toBeNull();
    expect(request).toHaveBeenCalledOnce();
  });
});
