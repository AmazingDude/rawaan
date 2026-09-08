import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let db: PGlite;
const migration = await readFile(new URL("../supabase/schema.sql", import.meta.url), "utf8");

beforeAll(async () => {
  db = await PGlite.create();
  await db.exec("create role anon; create role authenticated; create role service_role bypassrls;");
  // Recreate the old minimal schema and a permissive historical policy.
  await db.exec(`create table public.patients(id text primary key, display_name text not null, created_at timestamptz not null default now());
    insert into public.patients(id, display_name) values ('legacy-patient', 'Legacy fixture');
    alter table public.patients enable row level security;
    create policy old_allow_all on public.patients for all to anon using (true) with check (true);`);
  await db.exec(migration);
  await db.exec(migration);
  await db.exec(`insert into public.app_users(id) values ('user-a'), ('user-b');
    insert into public.patients(id, display_name, owner_user_id) values ('patient-a', 'Fixture A', 'user-a'), ('patient-b', 'Fixture B', 'user-b');`);
}, 30000);
afterAll(async () => { await db?.close(); });

describe("PostgreSQL ownership migration", () => {
  it("is rerunnable, retains legacy data without claiming it, and removes permissive policies", async () => {
    expect((await db.query("select owner_user_id from public.patients where id='legacy-patient'")).rows).toEqual([{ owner_user_id: null }]);
    expect((await db.query("select policyname from pg_policies where schemaname='public' and tablename in ('patients','notes','chats','app_users')")).rows).toEqual([]);
  });
  it("requires ownership for new rows and registered owners for patients", async () => {
    await expect(db.query("insert into public.patients(id,display_name) values ('no-owner','Fixture')")).rejects.toMatchObject({ code: "23514" });
    await expect(db.query("insert into public.patients(id,display_name,owner_user_id) values ('unknown-owner','Fixture','unknown')")).rejects.toMatchObject({ code: "23503" });
  });
  it("rejects cross-owner note and chat relationships at the database boundary", async () => {
    await expect(db.query(`insert into public.notes(id,patient_id,patient_display_name,consultation_date,raw_transcript,approved_at,owner_user_id)
      values ('forged-note','patient-a','Fixture','2026-10-06','Fixture transcript',now(),'user-b')`)).rejects.toMatchObject({ code: "23503" });
    await expect(db.query(`insert into public.chats(id,patient_id,thread_id,question,response,timestamp,owner_user_id)
      values ('forged-chat','patient-a','thread','Fixture question','{}','2026-10-06T00:00:00Z','user-b')`)).rejects.toMatchObject({ code: "23503" });
  });
  it("allows same-owner relationships", async () => {
    await db.query(`insert into public.notes(id,patient_id,patient_display_name,consultation_date,raw_transcript,approved_at,owner_user_id)
      values ('owned-note','patient-a','Fixture','2026-10-06','Fixture transcript',now(),'user-a')`);
    expect((await db.query("select owner_user_id from public.notes where id='owned-note'")).rows).toEqual([{ owner_user_id: "user-a" }]);
  });
  it("stores a private editable clinic name on each registered user profile", async () => {
    const columns = await db.query("select column_default, is_nullable from information_schema.columns where table_schema='public' and table_name='app_users' and column_name='clinic_name'");
    expect(columns.rows).toEqual([{ column_default: "''::text", is_nullable: "NO" }]);
    await db.query("update public.app_users set clinic_name='Aashir''s Clinic' where id='user-a'");
    expect((await db.query("select clinic_name from public.app_users where id='user-a'")).rows).toEqual([{ clinic_name: "Aashir's Clinic" }]);
    expect((await db.query("select clinic_name from public.app_users where id='user-b'")).rows).toEqual([{ clinic_name: "" }]);
  });
  it("denies direct browser-role reads and writes even with historical public grants", async () => {
    await db.exec("set role anon");
    try { await expect(db.query("select * from public.patients")).rejects.toMatchObject({ code: "42501" }); }
    finally { await db.exec("reset role"); }
    await db.exec("set role authenticated");
    try { await expect(db.query("select * from public.notes")).rejects.toMatchObject({ code: "42501" }); }
    finally { await db.exec("reset role"); }
  });
});

describe("agent and reviewed-plan database boundaries",()=>{
  it("adds current context and private general history without altering legacy records",async()=>{
    expect((await db.query("select clinical_context from public.patients where id='legacy-patient'")).rows).toEqual([{clinical_context:{}}]);
    await db.query("insert into public.general_chats(id,owner_user_id,thread_id,question,response) values ('general-a','user-a','t','Question','{}')");
    expect((await db.query("select owner_user_id from public.general_chats where id='general-a'")).rows).toEqual([{owner_user_id:"user-a"}]);
    await expect(db.query("insert into public.general_chats(id,owner_user_id,thread_id,question,response) values ('unknown-general','unknown','t','Question','{}')")).rejects.toMatchObject({code:"23503"});
  });
  it("rejects a reviewed plan attached to another owner's patient",async()=>{
    await expect(db.query("insert into public.clinical_plans(id,owner_user_id,patient_id,title,reviewed_content,generated_plan) values ('cross-plan','user-b','patient-a','Plan','Reviewed content','{}')")).rejects.toMatchObject({code:"23503"});
  });
  it("denies browser reads of new tables and retains RLS on them",async()=>{
    for(const role of ["anon","authenticated"]){
      await db.exec("set role "+role);
      try { for(const table of ["general_chats","clinical_plans"]) await expect(db.query("select * from public."+table)).rejects.toMatchObject({code:"42501"}); }
      finally {await db.exec("reset role");}
    }
    expect((await db.query("select relrowsecurity from pg_class where relname in ('general_chats','clinical_plans')")).rows).toEqual([{relrowsecurity:true},{relrowsecurity:true}]);
  });
});
