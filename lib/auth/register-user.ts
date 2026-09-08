import "server-only";
import { getSupabaseClient, StorageError } from "@/lib/db/supabase";

/** Call only with a server-verified Clerk identity, never request input. */
export async function registerUser(userId: string) {
  if (!userId.trim()) throw new StorageError();
  const client = getSupabaseClient();
  const { error } = await client.from("app_users").upsert({ id: userId }, { onConflict: "id", ignoreDuplicates: true });
  if (error) throw new StorageError();
  return client;
}
