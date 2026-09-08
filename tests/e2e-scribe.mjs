// The Record workflow now shares the Supabase-only browser contract suite.
// Build first. This suite owns isolated servers and never writes legacy stores.
await import("./e2e-supabase.mjs");
