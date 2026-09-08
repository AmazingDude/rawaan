import "server-only";

import { StorageError, storageOperation, type SupabaseClientFactory } from "@/lib/db/supabase";

type UserProfileRow = { clinic_name: string | null };

async function readClinicName(ownerId: string, getClient: SupabaseClientFactory): Promise<string> {
  const { data, error } = await getClient()
    .from("app_users")
    .select("clinic_name")
    .eq("id", ownerId)
    .maybeSingle();
  if (error || !data) throw new StorageError();
  const profile = data as UserProfileRow;
  return typeof profile.clinic_name === "string" ? profile.clinic_name.trim() : "";
}

export function clinicNameFromFirstName(firstName?: string | null): string {
  const name = firstName?.trim().slice(0, 70);
  return name ? `${name}'s Clinic` : "Your Clinic";
}

export async function getClinicName(ownerId: string, getClient: SupabaseClientFactory): Promise<string> {
  if (!ownerId.trim()) throw new StorageError();
  return storageOperation(() => readClinicName(ownerId, getClient));
}

export async function getOrCreateClinicName(
  ownerId: string,
  suggestedName: string,
  getClient: SupabaseClientFactory,
): Promise<string> {
  if (!ownerId.trim()) throw new StorageError();
  return storageOperation(async () => {
    const existing = await readClinicName(ownerId, getClient);
    if (existing) return existing;

    const nextName = suggestedName.trim() || "Your Clinic";
    const { data, error } = await getClient()
      .from("app_users")
      .update({ clinic_name: nextName })
      .eq("id", ownerId)
      .eq("clinic_name", "")
      .select("clinic_name")
      .maybeSingle();
    if (error) throw new StorageError();
    const initializedName = (data as UserProfileRow | null)?.clinic_name;
    if (typeof initializedName === "string") return initializedName.trim();

    // A concurrent save or first-page request may have initialized the name.
    const saved = await readClinicName(ownerId, getClient);
    if (!saved) throw new StorageError();
    return saved;
  });
}

export async function updateClinicName(
  ownerId: string,
  clinicName: string,
  getClient: SupabaseClientFactory,
): Promise<string> {
  if (!ownerId.trim() || !clinicName.trim() || clinicName.trim().length > 80) {
    throw new StorageError();
  }
  return storageOperation(async () => {
    const { data, error } = await getClient()
      .from("app_users")
      .update({ clinic_name: clinicName.trim() })
      .eq("id", ownerId)
      .select("clinic_name")
      .maybeSingle();
    const savedName = (data as UserProfileRow | null)?.clinic_name;
    if (error || typeof savedName !== "string") {
      throw new StorageError();
    }
    return savedName.trim();
  });
}
