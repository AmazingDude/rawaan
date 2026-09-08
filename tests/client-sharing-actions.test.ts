import { beforeEach, describe, expect, it, vi } from "vitest";
import fixture from "@/data/seed/client-sharing.json";
import tutorial from "@/data/seed/tutorial-session.json";

const mocks = vi.hoisted(() => ({ storage: vi.fn(), create: vi.fn(), preview: vi.fn(), claim: vi.fn(), revoke: vi.fn(), list: vi.fn(), history: vi.fn(), service: vi.fn(), revalidate: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ requireUserStorage: mocks.storage }));
vi.mock("@/lib/sharing/service", () => ({ createClientSharingService: mocks.service, clientSharingFailure: () => "Sharing unavailable" }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
import * as actions from "@/app/client-sharing-actions";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.storage.mockResolvedValue({ ownerId: fixture.recipient.id, getClient: () => ({}) });
  mocks.service.mockReturnValue({ create: mocks.create, preview: mocks.preview, import: mocks.claim, revoke: mocks.revoke, list: mocks.list, history: mocks.history });
});

describe("client sharing action boundaries", () => {
  it("authenticates every action before processing untrusted input", async () => {
    mocks.storage.mockRejectedValue(new Error("Sign in"));
    for (const action of Object.values(actions)) await expect(action(null)).rejects.toThrow("Sign in");
    expect(mocks.service).not.toHaveBeenCalled();
  });
  it("requires explicit permission and rejects injected owner identities", async () => {
    expect(await actions.createClientShareAction({ patientId: tutorial.client.patientId, permissionConfirmed: false })).toMatchObject({ ok: false });
    expect(await actions.createClientShareAction({ patientId: tutorial.client.patientId, permissionConfirmed: true, ownerId: fixture.sender.id })).toMatchObject({ ok: false });
    expect(mocks.create).not.toHaveBeenCalled();
    await actions.createClientShareAction({ patientId: tutorial.client.patientId, permissionConfirmed: true });
    expect(mocks.service).toHaveBeenCalledWith(fixture.recipient.id, expect.any(Function));
    expect(mocks.create).toHaveBeenCalledWith(tutorial.client.patientId);
  });
  it("never imports records during preview and validates capability tokens", async () => {
    mocks.preview.mockResolvedValue({ display_name: tutorial.client.displayName });
    expect(await actions.previewClientShareAction("a".repeat(43))).toMatchObject({ ok: true });
    expect(mocks.claim).not.toHaveBeenCalled();
    expect(await actions.importClientShareAction("malformed")).toMatchObject({ ok: false });
    expect(mocks.claim).not.toHaveBeenCalled();
  });
  it("revalidates the roster and AI only after a successful atomic import", async () => {
    mocks.claim.mockResolvedValue({ patient_id: tutorial.client.patientId, note_count: 2, plan_count: 1, already_imported: false });
    expect(await actions.importClientShareAction("a".repeat(43))).toMatchObject({ ok: true });
    expect(mocks.revalidate.mock.calls.map(call => call[0])).toEqual(["/clients", "/record", "/rawaan-ai", `/clients/${tutorial.client.patientId}`]);
    mocks.revalidate.mockClear(); mocks.claim.mockRejectedValue(new Error("private database payload"));
    expect(await actions.importClientShareAction("a".repeat(43))).toEqual({ ok: false, message: "Sharing unavailable" });
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
});
