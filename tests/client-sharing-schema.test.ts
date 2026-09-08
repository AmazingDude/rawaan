import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import tutorial from "@/data/seed/tutorial-session.json";
import fixture from "@/data/seed/client-sharing.json";

let db: PGlite;
const schema = await readFile(new URL("../supabase/schema.sql", import.meta.url), "utf8");
const migration = await readFile(new URL("../supabase/client-sharing.sql", import.meta.url), "utf8");
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
type Share = { id: string; note_count: number; plan_count: number };
type Claim = { patient_id: string; already_imported: boolean; note_count: number; plan_count: number };

async function createShare(token = "fixture-token"): Promise<Share> {
  return (await db.query<{ result: Share }>("select public.create_client_share($1,$2,$3) result",
    [fixture.sender.id, tutorial.client.patientId, hash(token)])).rows[0].result;
}
async function claim(token = "fixture-token", recipient = fixture.recipient.id): Promise<Claim> {
  return (await db.query<{ result: Claim }>("select public.import_client_share($1,$2) result", [hash(token), recipient])).rows[0].result;
}

beforeAll(async () => {
  db = await PGlite.create();
  await db.exec("create role anon; create role authenticated; create role service_role bypassrls;");
  await db.exec(schema);
  await db.exec(migration);
  await db.exec(migration);
}, 30000);
afterAll(async () => { await db?.close(); });
beforeEach(async () => {
  await db.exec("truncate public.app_users cascade");
  for (const user of [fixture.sender, fixture.recipient, fixture.other]) {
    await db.query("insert into public.app_users(id,clinic_name) values ($1,$2)", [user.id, user.clinic]);
  }
  await db.query(`insert into public.patients(id,owner_user_id,display_name,first_name,last_name,email,mobile_number,clinical_context)
    values ($1,$2,$3,$4,$5,$6,$7,$8)`, [tutorial.client.patientId, fixture.sender.id, tutorial.client.displayName,
    tutorial.client.firstName, tutorial.client.lastName, tutorial.client.email, tutorial.client.mobileNumber, JSON.stringify(fixture.context)]);
  for (const id of fixture.noteIds) {
    const note = { ...tutorial.draft, id, owner_user_id: fixture.sender.id, approval_status: "approved", approved_at: tutorial.draft.session_info.recorded_at, created_at: tutorial.draft.session_info.recorded_at };
    await db.query("insert into public.notes select * from jsonb_populate_record(null::public.notes,$1::jsonb)", [JSON.stringify(note)]);
  }
  await db.query(`insert into public.clinical_plans(id,owner_user_id,patient_id,title,reviewed_content,generated_plan,sources,reviewed_at)
    values ($1,$2,$3,$4,$5,$6,$7,$8)`, [fixture.planId, fixture.sender.id, tutorial.client.patientId, fixture.plan.title,
    fixture.plan.reviewed_content, JSON.stringify(fixture.plan.generated_plan), JSON.stringify([{ kind: "note", citation: "N1", noteId: fixture.noteIds[0], consultationDate: tutorial.draft.consultation_date }, fixture.webSource]), tutorial.draft.session_info.recorded_at]);
});

describe("private transactional client handoffs", () => {
  it("keeps the standalone and full-schema handoff migrations identical", () => {
    const section = migration.replace(/\r\n/g, "\n").replace(/^begin;\n/m, "").replace(/commit;\s*$/, "").trimEnd();
    expect(schema.replace(/\r\n/g, "\n")).toContain(section);
  });
  it("creates a fixed complete snapshot with a seven-day expiry and no private chat data", async () => {
    const share = await createShare();
    expect(share).toMatchObject({ note_count: 2, plan_count: 1 });
    const row = (await db.query<{ snapshot: Record<string, unknown>; days: number }>("select snapshot,extract(epoch from expires_at-created_at)/86400 as days from public.client_shares")).rows[0];
    expect(Number(row.days)).toBe(7);
    expect(Object.keys(row.snapshot).sort()).toEqual(["notes", "patient", "plans"]);
    expect(JSON.stringify(row.snapshot)).toContain(tutorial.draft.raw_transcript.replaceAll("\n", "\\n"));
    await db.query("update public.patients set display_name='Changed after snapshot' where id=$1", [tutorial.client.patientId]);
    const preview = (await db.query<{ result: Record<string, unknown> }>("select public.preview_client_share($1,$2) result", [hash("fixture-token"), fixture.recipient.id])).rows[0].result;
    expect(preview.display_name).toBe(tutorial.client.displayName);
    expect(preview).not.toHaveProperty("snapshot");
    expect(preview).not.toHaveProperty("token_hash");
    expect((await db.query("select id from public.patients where owner_user_id=$1", [fixture.recipient.id])).rows).toHaveLength(0);
  });

  it("copies demographics, full notes/transcripts, reviewed plans and original dates into independent ownership", async () => {
    await createShare();
    const result = await claim();
    expect(result).toMatchObject({ note_count: 2, plan_count: 1, already_imported: false });
    expect(result.patient_id).not.toBe(tutorial.client.patientId);
    const patient = (await db.query("select * from public.patients where id=$1", [result.patient_id])).rows[0];
    expect(patient).toMatchObject({ owner_user_id: fixture.recipient.id, display_name: tutorial.client.displayName, clinical_context: fixture.context });
    const notes = (await db.query<{ id: string; raw_transcript: string; owner_user_id: string; approval_status: string; approved_at: Date; session_info: unknown }>("select * from public.notes where patient_id=$1", [result.patient_id])).rows;
    expect(notes).toHaveLength(2);
    for (const note of notes) {
      expect(fixture.noteIds).not.toContain(note.id);
      expect(note).toMatchObject({ raw_transcript: tutorial.draft.raw_transcript, owner_user_id: fixture.recipient.id, approval_status: "approved", session_info: tutorial.draft.session_info });
      expect(new Date(note.approved_at).toISOString()).toBe(tutorial.draft.session_info.recorded_at);
    }
    const plan = (await db.query<{ sources: Array<{ noteId: string }> }>("select * from public.clinical_plans where patient_id=$1", [result.patient_id])).rows[0];
    expect(notes.map(note => note.id)).toContain(plan.sources[0].noteId);
    expect(plan.sources[1]).toEqual(fixture.webSource);
    expect(plan).toMatchObject({ reviewed_content: fixture.plan.reviewed_content, generated_plan: fixture.plan.generated_plan, owner_user_id: fixture.recipient.id });
    expect((await db.query("select source_clinic_name,note_ids,plan_ids from public.client_imports")).rows[0]).toMatchObject({ source_clinic_name: fixture.sender.clinic });
    expect((await db.query("select snapshot from public.client_shares")).rows).toEqual([{ snapshot: null }]);
    expect((await db.query("select id from public.notes where owner_user_id=$1", [fixture.sender.id])).rows).toHaveLength(2);
    expect((await db.query("select * from public.chats")).rows).toHaveLength(0);
    const comparable = "to_jsonb(n)-'id'-'owner_user_id'-'patient_id'-'created_at'";
    const original = (await db.query(`select ${comparable} as content from public.notes n where patient_id=$1`, [tutorial.client.patientId])).rows;
    const copied = (await db.query(`select ${comparable} as content from public.notes n where patient_id=$1`, [result.patient_id])).rows;
    expect(copied).toEqual(original);
  });

  it("executes through service-role privileges and excludes unapproved sessions", async () => {
    await db.query("update public.notes set approval_status='draft' where id=$1", [fixture.noteIds[1]]);
    await db.exec("set role service_role");
    try {
      expect(await createShare()).toMatchObject({ note_count: 1 });
      expect(await claim()).toMatchObject({ note_count: 1 });
    } finally { await db.exec("reset role"); }
  });

  it("copies an empty client without inventing history or merging by display name", async () => {
    await db.exec("delete from public.clinical_plans; delete from public.notes;");
    await db.query("insert into public.patients(id,owner_user_id,display_name) values ($1,$2,$3)", ["existing-training-client", fixture.recipient.id, tutorial.client.displayName]);
    await createShare();
    expect(await claim()).toMatchObject({ note_count: 0, plan_count: 0 });
    expect((await db.query("select id from public.patients where owner_user_id=$1", [fixture.recipient.id])).rows).toHaveLength(2);
  });

  it("allows only one recipient across racing claim requests", async () => {
    await createShare();
    const results = await Promise.allSettled([claim(), claim("fixture-token", fixture.other.id)]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter(result => result.status === "rejected")).toHaveLength(1);
    expect((await db.query("select id from public.client_imports")).rows).toHaveLength(1);
  });

  it("is idempotent for the claiming account and denies another recipient", async () => {
    await createShare();
    const first = await claim();
    expect(await claim()).toEqual({ ...first, already_imported: true });
    await expect(claim("fixture-token", fixture.other.id)).rejects.toThrow("share_unavailable");
    expect((await db.query("select id from public.patients where owner_user_id=$1", [fixture.recipient.id])).rows).toHaveLength(1);
  });

  it("rejects self-import, invalid/expired links and foreign source ownership", async () => {
    await createShare();
    await expect(claim("fixture-token", fixture.sender.id)).rejects.toThrow("share_self");
    await expect(claim("bad-token")).rejects.toThrow("share_unavailable");
    await expect(db.query("select public.create_client_share($1,$2,$3)", [fixture.recipient.id, tutorial.client.patientId, hash("foreign")])).rejects.toThrow("share_client_unavailable");
    await db.exec("update public.client_shares set expires_at=now()-interval '1 second'");
    await expect(claim()).rejects.toThrow("share_unavailable");
  });

  it("lets only the sender revoke, clears snapshots and prevents import afterward", async () => {
    const share = await createShare();
    expect((await db.query<{ result: boolean }>("select public.revoke_client_share($1,$2) result", [fixture.other.id, share.id])).rows[0].result).toBe(false);
    expect((await db.query<{ result: boolean }>("select public.revoke_client_share($1,$2) result", [fixture.sender.id, share.id])).rows[0].result).toBe(true);
    await expect(claim()).rejects.toThrow("share_unavailable");
    expect((await db.query("select snapshot from public.client_shares")).rows).toEqual([{ snapshot: null }]);
  });

  it("rolls back every imported row if a source reference cannot be mapped", async () => {
    await createShare();
    await db.query("update public.client_shares set snapshot=jsonb_set(snapshot,'{plans,0,sources,0,noteId}',to_jsonb($1::text))", ["missing-training-source"]);
    await expect(claim()).rejects.toThrow("share_source_unavailable");
    for (const table of ["patients", "notes", "clinical_plans", "client_imports"]) {
      expect((await db.query(`select id from public.${table} where owner_user_id=$1`, [fixture.recipient.id])).rows).toHaveLength(0);
    }
    expect((await db.query("select imported_at from public.client_shares")).rows).toEqual([{ imported_at: null }]);
  });

  it("does not issue a link when a reviewed plan has an unavailable source", async () => {
    await db.query("delete from public.notes where id=$1", [fixture.noteIds[0]]);
    await expect(createShare()).rejects.toThrow("share_source_unavailable");
    expect((await db.query("select id from public.client_shares")).rows).toHaveLength(0);
  });

  it("denies browser roles all table and function access", async () => {
    await createShare();
    for (const role of ["anon", "authenticated"]) {
      await db.exec("set role " + role);
      try {
        for (const table of ["client_shares", "client_imports"]) await expect(db.query("select * from public." + table)).rejects.toMatchObject({ code: "42501" });
        await expect(db.query("select public.preview_client_share($1,$2)", [hash("fixture-token"), fixture.recipient.id])).rejects.toMatchObject({ code: "42501" });
        await expect(db.query("select public.import_client_share($1,$2)", [hash("fixture-token"), fixture.recipient.id])).rejects.toMatchObject({ code: "42501" });
      } finally { await db.exec("reset role"); }
    }
  });
});
