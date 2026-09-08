import "server-only";
import { auth, currentUser } from "@clerk/nextjs/server";
import { registerUser } from "@/lib/auth/register-user";
import { clinicNameFromFirstName, getClinicName, getOrCreateClinicName } from "@/lib/db/user-profile";

export class AuthenticationError extends Error {
  constructor() { super("Sign in to continue."); this.name = "AuthenticationError"; }
}

export async function requireUserId(): Promise<string> {
  const session = await auth();
  if (!session.userId) throw new AuthenticationError();
  return session.userId;
}

export async function requireUserStorage() {
  const session = await auth();
  if (!session.userId) throw new AuthenticationError();
  const client = await registerUser(session.userId);
  return { ownerId: session.userId, getClient: () => client };
}

export async function requireUserClinicProfile() {
  const storage = await requireUserStorage();
  const savedClinicName = await getClinicName(storage.ownerId, storage.getClient);
  if (savedClinicName) return { ...storage, clinicName: savedClinicName };
  const user = await currentUser().catch(() => null);
  const clinicName = await getOrCreateClinicName(
    storage.ownerId,
    clinicNameFromFirstName(user?.firstName),
    storage.getClient,
  );
  return { ...storage, clinicName };
}
