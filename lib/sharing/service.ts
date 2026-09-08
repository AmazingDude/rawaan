import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { readAllRows, type SupabaseClientFactory } from "@/lib/db/supabase";
import {
  clientSharePath, createdShareSchema, importHistorySchema, shareClaimSchema,
  shareIdSchema, shareListSchema, sharePatientIdSchema, sharePreviewSchema, shareTokenSchema,
} from "@/lib/sharing/contracts";

const messages: Record<string, string> = {
  share_unavailable: "This sharing link has expired, was revoked, or has already been used. Ask the sender for a new link.",
  share_self: "This is your own sharing link. Send it to the clinician who should receive this client.",
  share_client_unavailable: "This client is unavailable in your workspace.",
  share_too_large: "This history is too large for a single handoff. No records were shared.",
  share_source_unavailable: "A reviewed plan refers to a source session that is no longer available. No records were transferred.",
};
export class ClientSharingError extends Error {}
const unavailable = "Client sharing is temporarily unavailable. Please try again.";

export function clientSharingFailure(error: unknown): string {
  return error instanceof ClientSharingError ? error.message : unavailable;
}

export function hashShareToken(token: string): string {
  return createHash("sha256").update(shareTokenSchema.parse(token)).digest("hex");
}

export function createClientSharingService(ownerId: string, getClient: SupabaseClientFactory) {
  if (!ownerId.trim()) throw new ClientSharingError("Sign in to continue.");
  async function rpc(name: string, args: Record<string, string>): Promise<unknown> {
    const { data, error } = await getClient().rpc(name, args);
    if (error) throw new ClientSharingError(messages[error.message] ?? unavailable);
    return data;
  }
  return {
    async create(patientId: string) {
      const token = randomBytes(32).toString("base64url");
      const result = createdShareSchema.parse(await rpc("create_client_share", {
        p_owner_id: ownerId, p_patient_id: sharePatientIdSchema.parse(patientId), p_token_hash: hashShareToken(token),
      }));
      return { ...result, path: clientSharePath(token) };
    },
    async preview(token: string) {
      return sharePreviewSchema.parse(await rpc("preview_client_share", { p_token_hash: hashShareToken(token), p_recipient_id: ownerId }));
    },
    async import(token: string) {
      return shareClaimSchema.parse(await rpc("import_client_share", { p_token_hash: hashShareToken(token), p_recipient_id: ownerId }));
    },
    async revoke(shareId: string) {
      const revoked = z.boolean().parse(await rpc("revoke_client_share", { p_owner_id: ownerId, p_share_id: shareIdSchema.parse(shareId) }));
      if (!revoked) throw new ClientSharingError("This link is unavailable or has already been imported. An imported copy cannot be revoked.");
      return revoked;
    },
    async list(patientId: string) {
      const id = sharePatientIdSchema.parse(patientId);
      return shareListSchema.array().parse(await readAllRows(() => getClient().from("client_shares")
        .select("id,created_at,expires_at,note_count,plan_count,revoked_at,imported_at")
        .eq("owner_user_id", ownerId).eq("patient_id", id).order("created_at", { ascending: false }).order("id")));
    },
    async history(patientId: string) {
      const id = sharePatientIdSchema.parse(patientId);
      const rows = z.array(z.object({ id: shareIdSchema, source_clinic_name: z.string(),
        shared_at: z.string(), imported_at: z.string(), note_ids: z.array(z.string()), plan_ids: z.array(z.string()) }))
        .parse(await readAllRows(() => getClient().from("client_imports")
          .select("id,source_clinic_name,shared_at,imported_at,note_ids,plan_ids")
          .eq("owner_user_id", ownerId).eq("patient_id", id).order("imported_at", { ascending: false }).order("id")));
      return rows.map(row => importHistorySchema.parse({ id: row.id, source_clinic_name: row.source_clinic_name,
        shared_at: row.shared_at, imported_at: row.imported_at, note_count: row.note_ids.length, plan_count: row.plan_ids.length }));
    },
  };
}
