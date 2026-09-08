import { createClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { createClientSharingService, hashShareToken } from "@/lib/sharing/service";
import { clientSharePath, parseClientShareLink } from "@/lib/sharing/contracts";
import { createTestDatabase } from "@/tests/helpers/supabase";
import fixture from "@/data/seed/client-sharing.json";
import tutorial from "@/data/seed/tutorial-session.json";

const token = "a".repeat(43);
const stamp = tutorial.draft.session_info.recorded_at;
const shareId = "00000000-0000-4000-8000-000000000001";
const metadata = { id: shareId, created_at: stamp, expires_at: stamp, note_count: 2, plan_count: 1 };

function rpcClient(payload: unknown, status = 200) {
  const requests: Array<{ url: string; method: string | undefined; body: Record<string, unknown> }> = [];
  const client = createClient("https://storage.example.test", "test-placeholder", {
    db: { retry: false }, auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input, init) => {
      requests.push({ url: String(input), method: init?.method, body: JSON.parse(String(init?.body)) });
      return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
    } },
  });
  return { client, requests };
}

describe("client share capability and URL contracts", () => {
  it("accepts only the expected same-origin receiving URL", () => {
    const path = clientSharePath(token);
    expect(parseClientShareLink("https://rawaan.example" + path, "https://rawaan.example")).toBe(token);
    expect(parseClientShareLink(path, "http://localhost:3000")).toBe(token);
    for (const link of ["https://other.example" + path, "javascript:alert(1)", "//other.example" + path,
      path + "&share=" + token, path + "&redirect_url=https://other.example", path + "#extra", "/clients/another?share=" + token,
      "https://user:password@rawaan.example" + path, "/clients/import?share=short"]) {
      expect(parseClientShareLink(link, "https://rawaan.example")).toBeNull();
    }
  });
  it("generates a random capability while sending only its hash and verified owner to storage", async () => {
    const db = rpcClient({ ...metadata, snapshot: "private payload", token_hash: "private hash" });
    const service = createClientSharingService(fixture.sender.id, () => db.client);
    const first = await service.create(tutorial.client.patientId);
    const second = await service.create(tutorial.client.patientId);
    expect(first.path).not.toBe(second.path);
    expect(first).not.toHaveProperty("snapshot");
    expect(first).not.toHaveProperty("token_hash");
    const generated = parseClientShareLink(first.path, "https://rawaan.example")!;
    expect(db.requests[0]).toMatchObject({ method: "POST", body: { p_owner_id: fixture.sender.id,
      p_patient_id: tutorial.client.patientId, p_token_hash: hashShareToken(generated) } });
    expect(db.requests[0].url).toContain("/rpc/create_client_share");
    expect(JSON.stringify(db.requests)).not.toContain(generated);
  });
  it("binds preview and import to the verified recipient with no caller-supplied identity", async () => {
    const preview = rpcClient({ display_name: tutorial.client.displayName, source_clinic_name: fixture.sender.clinic,
      created_at: stamp, expires_at: stamp, note_count: 2, plan_count: 1, imported_patient_id: null, snapshot: "private" });
    expect(await createClientSharingService(fixture.recipient.id, () => preview.client).preview(token)).not.toHaveProperty("snapshot");
    expect(preview.requests[0].body).toEqual({ p_recipient_id: fixture.recipient.id, p_token_hash: hashShareToken(token) });
    const claim = rpcClient({ patient_id: tutorial.client.patientId, note_count: 2, plan_count: 1, already_imported: false });
    await createClientSharingService(fixture.recipient.id, () => claim.client).import(token);
    expect(claim.requests[0].url).toContain("/rpc/import_client_share");
    expect(claim.requests[0].body).toEqual(preview.requests[0].body);
  });
  it("never exposes arbitrary backend error bodies", async () => {
    const rejected = rpcClient({ code: "P0001", message: "private backend data" }, 400);
    await expect(createClientSharingService(fixture.sender.id, () => rejected.client).create(tutorial.client.patientId)).rejects.toThrow("temporarily unavailable");
    const expired = rpcClient({ code: "P0001", message: "share_unavailable" }, 400);
    await expect(createClientSharingService(fixture.recipient.id, () => expired.client).import(token)).rejects.toThrow(/expired/);
  });
  it("rejects malformed tokens before sending a storage request", async () => {
    const factory = vi.fn();
    await expect(createClientSharingService(fixture.sender.id, factory).preview("bad")).rejects.toThrow();
    expect(factory).not.toHaveBeenCalled();
  });
  it("owner-scopes lists and import provenance and omits stored IDs, hashes and snapshots", async () => {
    const db = createTestDatabase();
    db.tables.client_shares = [{ ...metadata, patient_id: tutorial.client.patientId, owner_user_id: fixture.sender.id,
      token_hash: "private", snapshot: "private", revoked_at: null, imported_at: null },
    { ...metadata, patient_id: tutorial.client.patientId, owner_user_id: fixture.other.id, revoked_at: null, imported_at: null }];
    db.tables.client_imports = [{ id: shareId, owner_user_id: fixture.sender.id, patient_id: tutorial.client.patientId,
      source_clinic_name: fixture.recipient.clinic, shared_at: stamp, imported_at: stamp, note_ids: fixture.noteIds, plan_ids: [fixture.planId] }];
    const service = createClientSharingService(fixture.sender.id, () => db.client);
    const links = await service.list(tutorial.client.patientId);
    expect(links).toHaveLength(1);
    expect(JSON.stringify(links)).not.toContain("private");
    const history = await service.history(tutorial.client.patientId);
    expect(history).toMatchObject([{ source_clinic_name: fixture.recipient.clinic, note_count: 2, plan_count: 1 }]);
    expect(history[0]).not.toHaveProperty("note_ids");
    expect(db.requests.every(request => request.url.searchParams.get("owner_user_id") === "eq." + fixture.sender.id)).toBe(true);
  });
});
