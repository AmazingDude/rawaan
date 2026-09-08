"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUserStorage } from "@/lib/auth/session";
import { clientSharingFailure, createClientSharingService } from "@/lib/sharing/service";
import {
  shareIdSchema, sharePatientIdSchema, shareTokenSchema,
  type SharingResult, type CreatedClientShare, type ClientSharePreview,
  type ClientShareClaim, type ClientShareListItem, type ClientImportHistory,
} from "@/lib/sharing/contracts";

export async function createClientShareAction(candidate: unknown): Promise<SharingResult<CreatedClientShare>> {
  const { ownerId, getClient } = await requireUserStorage();
  const parsed = z.object({ patientId: sharePatientIdSchema, permissionConfirmed: z.literal(true) }).strict().safeParse(candidate);
  if (!parsed.success) return { ok: false, message: "Confirm that you have permission to share this client's clinical record." };
  try { return { ok: true, value: await createClientSharingService(ownerId, getClient).create(parsed.data.patientId) }; }
  catch (error) { return { ok: false, message: clientSharingFailure(error) }; }
}

export async function listClientSharesAction(candidate: unknown): Promise<SharingResult<ClientShareListItem[]>> {
  const { ownerId, getClient } = await requireUserStorage();
  const id = sharePatientIdSchema.safeParse(candidate);
  if (!id.success) return { ok: false, message: "Select a client from your workspace." };
  try { return { ok: true, value: await createClientSharingService(ownerId, getClient).list(id.data) }; }
  catch (error) { return { ok: false, message: clientSharingFailure(error) }; }
}

export async function revokeClientShareAction(candidate: unknown): Promise<SharingResult<boolean>> {
  const { ownerId, getClient } = await requireUserStorage();
  const id = shareIdSchema.safeParse(candidate);
  if (!id.success) return { ok: false, message: "Choose a sharing link to revoke." };
  try { return { ok: true, value: await createClientSharingService(ownerId, getClient).revoke(id.data) }; }
  catch (error) { return { ok: false, message: clientSharingFailure(error) }; }
}

export async function previewClientShareAction(candidate: unknown): Promise<SharingResult<ClientSharePreview>> {
  const { ownerId, getClient } = await requireUserStorage();
  const token = shareTokenSchema.safeParse(candidate);
  if (!token.success) return { ok: false, message: "This sharing link is invalid. Ask the sender for a new link." };
  try { return { ok: true, value: await createClientSharingService(ownerId, getClient).preview(token.data) }; }
  catch (error) { return { ok: false, message: clientSharingFailure(error) }; }
}

export async function importClientShareAction(candidate: unknown): Promise<SharingResult<ClientShareClaim>> {
  const { ownerId, getClient } = await requireUserStorage();
  const token = shareTokenSchema.safeParse(candidate);
  if (!token.success) return { ok: false, message: "This sharing link is invalid. Ask the sender for a new link." };
  try {
    const value = await createClientSharingService(ownerId, getClient).import(token.data);
    revalidatePath("/clients"); revalidatePath("/record"); revalidatePath("/rawaan-ai");
    revalidatePath(`/clients/${encodeURIComponent(value.patient_id)}`);
    return { ok: true, value };
  } catch (error) { return { ok: false, message: clientSharingFailure(error) }; }
}

export async function listClientImportsAction(candidate: unknown): Promise<SharingResult<ClientImportHistory[]>> {
  const { ownerId, getClient } = await requireUserStorage();
  const id = sharePatientIdSchema.safeParse(candidate);
  if (!id.success) return { ok: false, message: "Select a client from your workspace." };
  try { return { ok: true, value: await createClientSharingService(ownerId, getClient).history(id.data) }; }
  catch (error) { return { ok: false, message: clientSharingFailure(error) }; }
}
