import { describe, expect, it } from "vitest";
import { createTestDatabase } from "@/tests/helpers/supabase";
import { createGeneralChatStore } from "@/lib/db/general-chats";
import { createClinicalStore } from "@/lib/db/clinical";
import { clinicalContextSchema } from "@/lib/clinical/schema";
import { StorageError } from "@/lib/db/errors";

describe("new owner-scoped storage",()=>{
  it("normalizes Supabase offset timestamps and keeps general chat owners isolated",async()=>{
    const db=createTestDatabase();
    db.tables.general_chats.push({id:"entry-a",owner_user_id:"owner-a",thread_id:"t",question:"q",response:{status:"agent",answer:"answer",category:"general",sources:[],notice:null,clinical:null},timestamp:"2026-10-07T10:00:00+00:00"});
    db.tables.general_chats.push({id:"entry-b",owner_user_id:"owner-b",thread_id:"t",question:"private",response:{status:"error",message:"x"},timestamp:"2026-10-07T10:00:00Z"});
    const threads=await createGeneralChatStore("owner-a",()=>db.client).listThreads();
    expect(threads[0].entries).toHaveLength(1);
    expect(threads[0].entries[0].timestamp).toBe("2026-10-07T10:00:00.000Z");
    expect(db.requests.every(request=>request.url.searchParams.get("owner_user_id")==="eq.owner-a")).toBe(true);
  });
  it("loads and updates clinical context only for the requested owned client",async()=>{
    const db=createTestDatabase();
    db.tables.patients.push({id:"a",owner_user_id:"owner-a",clinical_context:{}},{id:"b",owner_user_id:"owner-b",clinical_context:{}});
    const store=createClinicalStore("owner-a",()=>db.client);
    await expect(store.getContext("b")).rejects.toBeInstanceOf(StorageError);
    const context=clinicalContextSchema.parse({age:40});
    await expect(store.saveContext("a",context)).resolves.toEqual(context);
    expect(db.tables.patients[1].clinical_context).toEqual({});
    expect(db.requests.every(request=>request.url.searchParams.get("owner_user_id")==="eq.owner-a")).toBe(true);
  });
  it("reports unavailable storage rather than fabricating empty history",async()=>{
    const db=createTestDatabase();db.fail("general_chats",503);
    await expect(createGeneralChatStore("a",()=>db.client).listThreads()).rejects.toBeInstanceOf(StorageError);
  });
});
