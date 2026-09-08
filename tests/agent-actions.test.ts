import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestDatabase } from "@/tests/helpers/supabase";
import { clinicalContextSchema } from "@/lib/clinical/schema";
import seed from "@/data/seed/demo-patients.json";
import { noteSchema, noteToRow } from "@/lib/notes/schema";
import { LlmContextLimitError, LLM_CONTEXT_LIMIT_MESSAGE, LlmRateLimitError } from "@/lib/llm/errors";
import type { AgentResponse } from "@/lib/agent/schema";
import { appendChatEntryAction, sendAgentMessageAction, reviewClinicalPlanAction, saveClinicalContextAction } from "@/app/actions";
const mocks=vi.hoisted(()=>({storage:vi.fn(),agent:vi.fn()}));
vi.mock("@/lib/auth/session",()=>({requireUserStorage:mocks.storage}));
vi.mock("@/lib/llm/rawaan-agent",()=>({runRawaanAgent:mocks.agent}));
vi.mock("next/cache",()=>({revalidatePath:vi.fn()}));
const response:AgentResponse={status:"agent",answer:"Proposed plan for review",category:"clinical",notice:null,sources:[],clinical:{differential:[],medication_options:[],missing_information:[],plan:{title:"Proposed plan",goals:[],next_steps:["Discuss assessment"],monitoring:[],follow_up:"Review with clinician",red_flags:[]}}};
beforeEach(()=>{vi.clearAllMocks();mocks.agent.mockResolvedValue(response);});
describe("server-generated agent conversations and plan provenance",()=>{
  it.each([undefined,"2048"])("applies the server-owned Assistant output budget %s to the actual provider",async configured=>{
    const db=createTestDatabase();mocks.storage.mockResolvedValue({ownerId:"owner-a",getClient:()=>db.client});
    vi.stubEnv("GROQ_API_KEY","test-key");vi.stubEnv("RAWAAN_AI_MAX_OUTPUT_TOKENS",configured??"");
    const fetchMock=vi.spyOn(globalThis,"fetch").mockResolvedValue(Response.json({choices:[{message:{content:"ok"},finish_reason:"stop"}]}));
    mocks.agent.mockImplementationOnce(async(input,provider)=>{
      expect(input.outputTokenBudget).toBe(configured?2048:768);
      await provider.complete({system:"instruction",user:"question"});
      return response;
    });
    try {
      expect(await sendAgentMessageAction({patientId:null,threadId:null,question:"Main concern",mode:"assistant",webEnabled:false})).toMatchObject({ok:true});
      const providerRequest=fetchMock.mock.calls.find(call=>String(call[0]).includes("api.groq.com"));
      expect(JSON.parse(String(providerRequest?.[1]?.body)).max_tokens).toBe(configured?2048:768);
    } finally {fetchMock.mockRestore();vi.unstubAllEnvs();}
  });
  it("returns the provider's safe quota explanation without saving a failed turn",async()=>{
    const db=createTestDatabase();mocks.storage.mockResolvedValue({ownerId:"owner-a",getClient:()=>db.client});
    mocks.agent.mockRejectedValueOnce(new LlmRateLimitError({kind:"output_tokens_per_minute",httpStatus:429,limit:1000,used:950,requested:900,retryAfterSeconds:45}));
    const log=vi.spyOn(console,"error").mockImplementation(()=>{});
    try {
      const result=await sendAgentMessageAction({patientId:null,threadId:null,question:"Summarize",mode:"assistant",webEnabled:false});
      expect(result).toMatchObject({ok:false,message:expect.stringMatching(/output-token.*45 seconds/)});
      expect(log).toHaveBeenCalledWith("[Rawaan AI] request failed",expect.any(String));
      expect(JSON.parse(log.mock.calls[0][1])).toMatchObject({stage:"assistant",code:"provider_rate_limit",kind:"output_tokens_per_minute",retryAfterSeconds:45});
      expect(db.tables.general_chats).toEqual([]);
    } finally {log.mockRestore();}
  });
  it("returns actionable provider errors and logs only safe failure metadata",async()=>{
    const db=createTestDatabase();mocks.storage.mockResolvedValue({ownerId:"owner-a",getClient:()=>db.client});
    mocks.agent.mockRejectedValueOnce(new Error("LLM provider returned 429: private-provider-body"));
    const log=vi.spyOn(console,"error").mockImplementation(()=>{});
    try {
      const result=await sendAgentMessageAction({patientId:null,threadId:null,question:"Summarize",mode:"assistant",webEnabled:false});
      expect(result).toMatchObject({ok:false,message:expect.stringMatching(/rate limit/)});
      expect(log).toHaveBeenCalledWith("[Rawaan AI] request failed",expect.any(String));
      expect(JSON.parse(log.mock.calls[0][1])).toEqual({stage:"assistant",code:"provider_error",httpStatus:429});
      expect(JSON.stringify(log.mock.calls)).not.toContain("private-provider-body");
      expect(db.tables.general_chats).toEqual([]);
    } finally {log.mockRestore();}
  });
  it("reports oversized AI context explicitly without saving a partial answer",async()=>{
    const db=createTestDatabase();mocks.storage.mockResolvedValue({ownerId:"owner-a",getClient:()=>db.client});
    mocks.agent.mockRejectedValueOnce(new LlmContextLimitError());
    expect(await sendAgentMessageAction({patientId:null,threadId:null,question:"Read the history",mode:"assistant",webEnabled:false})).toEqual({ok:false,message:LLM_CONTEXT_LIMIT_MESSAGE});
    expect(db.tables.general_chats).toEqual([]);
  });
  it("loads all owned sessions automatically, even when an assistant turn focuses on one saved session",async()=>{
    const db=createTestDatabase();
    const base=noteSchema.parse(seed[0]);
    const other=noteSchema.parse(seed[2]);
    const notes=Array.from({length:12},(_,index)=>({...base,id:base.id+"-"+index}));
    db.tables.patients.push({id:base.patient_id,owner_user_id:"owner-a",clinical_context:{}});
    db.tables.notes.push(...notes.map(note=>({...noteToRow(note),owner_user_id:"owner-a"})),{...noteToRow(other),owner_user_id:"owner-a"},{...noteToRow({...base,id:"foreign-note"}),owner_user_id:"owner-b"});
    mocks.storage.mockResolvedValue({ownerId:"owner-a",getClient:()=>db.client});
    const result=await sendAgentMessageAction({patientId:base.patient_id,sessionNoteId:notes[0].id,threadId:null,question:"Compare the client's sessions",mode:"assistant",webEnabled:false});
    expect(result).toMatchObject({ok:true});
    const input=mocks.agent.mock.calls[0][0];
    expect(input.notes.map((note:{id:string})=>note.id).sort()).toEqual(notes.map(note=>note.id).sort());
    expect(input.activeNoteId).toBe(notes[0].id);
    expect(input.context.age).toBeNull();
    expect(db.requests.filter(request=>request.method==="GET").every(request=>request.url.searchParams.get("owner_user_id")==="eq.owner-a")).toBe(true);
    expect(db.tables.chats).toMatchObject([{owner_user_id:"owner-a",patient_id:base.patient_id}]);
    db.tables.notes.push({...noteToRow({...base,id:base.id+"-new"}),owner_user_id:"owner-a"});
    await sendAgentMessageAction({patientId:base.patient_id,threadId:null,question:"Include the newly saved session",mode:"assistant",webEnabled:false});
    expect(mocks.agent.mock.calls[1][0].notes).toHaveLength(13);
  });
  it("persists general answers with the verified owner and reports write failures explicitly",async()=>{
    const db=createTestDatabase();mocks.storage.mockResolvedValue({ownerId:"owner-a",getClient:()=>db.client});
    const result=await sendAgentMessageAction({patientId:null,threadId:null,question:"General question",mode:"assistant",webEnabled:false});
    expect(result).toMatchObject({ok:true,persisted:true});
    expect(db.tables.general_chats).toMatchObject([{owner_user_id:"owner-a",question:"General question",response}]);
    db.fail("general_chats",503,"POST");
    expect(await sendAgentMessageAction({patientId:null,threadId:null,question:"Other question",mode:"assistant",webEnabled:false})).toMatchObject({ok:true,persisted:false});
  });
  it("rejects foreign-client queries before any model call",async()=>{
    const db=createTestDatabase();db.tables.patients.push({id:"foreign",owner_user_id:"owner-b",clinical_context:{}});
    mocks.storage.mockResolvedValue({ownerId:"owner-a",getClient:()=>db.client});
    expect(await sendAgentMessageAction({patientId:"foreign",threadId:null,question:"Plan",mode:"assistant",webEnabled:true})).toMatchObject({ok:false});
    expect(mocks.agent).not.toHaveBeenCalled();
  });
  it("rejects client-appended agent responses so reviewed plans cannot be forged",async()=>{
    const db=createTestDatabase();mocks.storage.mockResolvedValue({ownerId:"owner-a",getClient:()=>db.client});
    expect(await appendChatEntryAction({patientId:"a",threadId:"t",entry:{question:"q",response,timestamp:new Date().toISOString()}})).toMatchObject({ok:false});
    expect(db.tables.chats).toEqual([]);
  });
  it("requires a saved server response and same-client note references before saving a reviewed plan",async()=>{
    const db=createTestDatabase();db.tables.patients.push({id:"a",owner_user_id:"owner-a",clinical_context:{}});
    mocks.storage.mockResolvedValue({ownerId:"owner-a",getClient:()=>db.client});
    const turn=await sendAgentMessageAction({patientId:"a",threadId:null,question:"Draft plan",mode:"assistant",webEnabled:false});
    expect(turn.ok).toBe(true);if(!turn.ok)return;
    const input={patientId:"a",threadId:turn.threadId,entryTimestamp:turn.timestamp,title:"Reviewed plan",content:"Clinician-reviewed assessment plan"};
    expect(await reviewClinicalPlanAction(input)).toMatchObject({ok:true});
    expect(db.tables.clinical_plans[0]).toMatchObject({owner_user_id:"owner-a",patient_id:"a",reviewed_content:input.content,generated_plan:response.clinical?.plan});
    const stored=db.tables.chats[0].response as AgentResponse;stored.sources=[{kind:"note",noteId:"foreign-note",consultationDate:"2026-10-07"}];
    expect(await reviewClinicalPlanAction(input)).toMatchObject({ok:false});
    expect(db.tables.clinical_plans).toHaveLength(1);
  });
  it("records context confirmation time on the server, never accepts a fabricated future timestamp",async()=>{
    const db=createTestDatabase();db.tables.patients.push({id:"a",owner_user_id:"owner-a",clinical_context:{}});
    mocks.storage.mockResolvedValue({ownerId:"owner-a",getClient:()=>db.client});
    const value=clinicalContextSchema.parse({age:30,medication_context_confirmed:true,confirmed_at:"2099-01-01T00:00:00.000Z"});
    const result=await saveClinicalContextAction("a",value);
    expect(result.ok).toBe(true);if(!result.ok)return;
    expect(Date.parse(result.context.confirmed_at!)).toBeLessThanOrEqual(Date.now());
  });
});
