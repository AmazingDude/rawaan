// Loaded only by the isolated production browser test process.
// Allow local PostgREST/app requests and block every external request.
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === "string" || input instanceof URL ? input : input.url);
  if (url.hostname === "api.clerk.com" && url.pathname.startsWith("/v1/users/")) {
    const id = decodeURIComponent(url.pathname.split("/").at(-1));
    const user = {
      object: "user", id, first_name: "Aashir", last_name: "Test", username: "aashir",
      image_url: "", primary_email_address_id: "email_e2e",
      email_addresses: [{ id: "email_e2e", email_address: "aashir@example.test", verification: { status: "verified", strategy: "test" } }],
      phone_numbers: [], web3_wallets: [], external_accounts: [], passkeys: [],
      public_metadata: {}, private_metadata: {}, unsafe_metadata: {},
      created_at: 0, updated_at: 0,
    };
    return new Response(JSON.stringify(user), { status: 200, headers: { "Content-Type": "application/json" } });
  }
  if (!["127.0.0.1", "localhost"].includes(url.hostname)) {
    throw new Error("External request blocked by isolated browser test");
  }
  return originalFetch(input, init);
};
