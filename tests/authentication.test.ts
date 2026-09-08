import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), currentUser: vi.fn(), registerUser: vi.fn() }));
vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth, currentUser: mocks.currentUser }));
vi.mock("@/lib/auth/register-user", () => ({ registerUser: mocks.registerUser }));
import { AuthenticationError, requireUserId, requireUserStorage } from "@/lib/auth/session";
import * as actions from "@/app/actions";
import { POST } from "@/app/api/transcribe/route";

beforeEach(() => { vi.clearAllMocks(); mocks.auth.mockResolvedValue({ userId: null }); mocks.currentUser.mockResolvedValue(null); });

describe("server authentication boundaries", () => {
  it("rejects anonymous callers before registration or storage access", async () => {
    await expect(requireUserId()).rejects.toBeInstanceOf(AuthenticationError);
    await expect(requireUserStorage()).rejects.toBeInstanceOf(AuthenticationError);
    expect(mocks.registerUser).not.toHaveBeenCalled();
  });
  it("registers only the server-verified Clerk identity and returns its scoped context", async () => {
    const client = {};
    mocks.auth.mockResolvedValue({ userId: "user-verified" });
    mocks.registerUser.mockResolvedValue(client);
    const context = await requireUserStorage();
    expect(mocks.registerUser).toHaveBeenCalledWith("user-verified");
    expect(context.ownerId).toBe("user-verified");
    expect(context.getClient()).toBe(client);
  });
  it("checks every exported server action before reading input, data, or invoking a model", async () => {
    const calls = [
      () => actions.generateDraftAction(null), () => actions.approveDraftAction(null),
      () => actions.queryPatientRecordAction("foreign-id", "question"),
      () => actions.querySessionRecordAction("foreign-id", "foreign-note", "question"),
      () => actions.translateTranscriptToUrduAction("transcript"),
      () => actions.listBrainPatientsAction(), () => actions.listClientsAction(),
      () => actions.createClientAction({ firstName: "", lastName: "" }),
      () => actions.modifyNoteAction(null as never), () => actions.translateNoteToUrduAction(null as never),
      () => actions.sendAgentMessageAction(null), () => actions.listAgentThreadsAction(null),
      () => actions.getClinicalContextAction("foreign-id"), () => actions.saveClinicalContextAction("foreign-id",null),
      () => actions.listClinicalPlansAction("foreign-id"), () => actions.reviewClinicalPlanAction(null),
      () => actions.getPatientInsightsAction("foreign-id"), () => actions.listChatThreadsAction("foreign-id"),
      () => actions.appendChatEntryAction(null as never), () => actions.getClientDetailAction("foreign-id"),
    ];
    for (const call of calls) await expect(call()).rejects.toBeInstanceOf(AuthenticationError);
    expect(mocks.registerUser).not.toHaveBeenCalled();
  });
  it("returns 401 for anonymous audio uploads before parsing the request", async () => {
    const request = new Request("http://localhost/api/transcribe", { method: "POST", body: "invalid" });
    const parse = vi.spyOn(request, "formData");
    const response = await POST(request);
    expect(response.status).toBe(401);
    expect(parse).not.toHaveBeenCalled();
  });
});
