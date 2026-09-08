import { generateKeyPairSync, sign } from "node:crypto";

// Ephemeral test identities, not a configured hosted Clerk application.
const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
export const clerkTestEnvironment = {
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_" + Buffer.from("clerk.e2e.test$").toString("base64"),
  CLERK_SECRET_KEY: "sk_test_isolated_placeholder",
  CLERK_JWT_KEY: keys.publicKey.export({ type: "spki", format: "pem" }).toString(),
};

export function sessionToken(userId, origin) {
  const now = Math.floor(Date.now() / 1000);
  const encode = value => Buffer.from(JSON.stringify(value)).toString("base64url");
  const unsigned = encode({ alg: "RS256", typ: "JWT", kid: "isolated-test-key" }) + "." + encode({
    sub: userId, sid: "sess_" + userId, iss: "https://clerk.e2e.test", azp: origin,
    iat: now, nbf: now - 10, exp: now + 3600, v: 2, fva: [0, -1],
  });
  return unsigned + "." + sign("RSA-SHA256", Buffer.from(unsigned), keys.privateKey).toString("base64url");
}
