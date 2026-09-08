import { z } from "zod";

export const shareTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
export const shareIdSchema = z.string().uuid();
export const sharePatientIdSchema = z.string().trim().min(1).max(200);
const timestamp = z.string().datetime({ offset: true });
const counts = { note_count: z.number().int().nonnegative(), plan_count: z.number().int().nonnegative() };

export const createdShareSchema = z.object({
  id: shareIdSchema, created_at: timestamp, expires_at: timestamp, ...counts,
});
export const sharePreviewSchema = z.object({
  display_name: z.string(), source_clinic_name: z.string(), created_at: timestamp,
  expires_at: timestamp, imported_patient_id: z.string().nullable(), ...counts,
});
export const shareClaimSchema = z.object({
  patient_id: z.string().min(1), already_imported: z.boolean(), ...counts,
});
export const shareListSchema = createdShareSchema.extend({
  revoked_at: timestamp.nullable(), imported_at: timestamp.nullable(),
});
export const importHistorySchema = z.object({
  id: shareIdSchema, source_clinic_name: z.string(), shared_at: timestamp,
  imported_at: timestamp, ...counts,
});
export type CreatedClientShare = z.infer<typeof createdShareSchema> & { path: string };
export type ClientSharePreview = z.infer<typeof sharePreviewSchema>;
export type ClientShareClaim = z.infer<typeof shareClaimSchema>;
export type ClientShareListItem = z.infer<typeof shareListSchema>;
export type ClientImportHistory = z.infer<typeof importHistorySchema>;
export type SharingResult<T> = { ok: true; value: T } | { ok: false; message: string };

export function clientSharePath(token: string): string {
  return `/clients/import?share=${encodeURIComponent(shareTokenSchema.parse(token))}`;
}

/** Parse locally; never navigate to or fetch a pasted external URL. */
export function parseClientShareLink(value: string, origin: string): string | null {
  if (!value.trim() || value.length > 2048) return null;
  try {
    const url = new URL(value.trim(), origin);
    if (url.origin !== new URL(origin).origin || url.pathname !== "/clients/import" ||
      url.username || url.password || url.hash || [...url.searchParams.keys()].some(key => key !== "share") ||
      url.searchParams.getAll("share").length !== 1) return null;
    const token = shareTokenSchema.safeParse(url.searchParams.get("share"));
    return token.success ? token.data : null;
  } catch { return null; }
}
