import { beforeEach, describe, expect, it, vi } from "vitest";
import seed from "@/data/seed/demo-patients.json";
import scopeFixture from "@/data/seed/assistant-scope.json";
import guardFixture from "@/data/seed/clinical-guard-cases.json";
import followUp from "@/data/seed/follow-up-discussion.json";
import { noteSchema } from "@/lib/notes/schema";
import { medicationContextIsFresh, runRawaanAgent } from "@/lib/llm/rawaan-agent";
import { clinicalContextSchema } from "@/lib/clinical/schema";
import { createTavilySearch } from "@/lib/tools/web-search";
import { agentOutputTokenBudget } from "@/lib/llm/agent-budget";

const answer = { answer:"A helpful explanation.", note_source_indices:[], web_source_indices:[], clinical:null };
const clinical = { differential:[{condition:"Anxiety",rationale:"Reported stress is compatible, but requires assessment."}], medication_options:[], missing_information:[], plan:{title:"Proposed review plan",goals:["Clarify current symptoms"],next_steps:["Discuss assessment with the clinician"],monitoring:["Review symptom changes"],follow_up:"Arrange clinician review",red_flags:[]} };
const confirmedContext = () => clinicalContextSchema.parse({medication_context_confirmed:true,confirmed_at:new Date().toISOString()});
function provider(plan:object, response:object) {
  return { complete:vi.fn().mockResolvedValue(JSON.stringify(response)).mockResolvedValueOnce(JSON.stringify({in_scope:true,...plan})).mockResolvedValueOnce(JSON.stringify(response)) };
}
beforeEach(()=>{vi.unstubAllGlobals();});

describe("Assistant output-budget configuration",()=>{
  it("defaults to 768 without changing other provider budgets",()=>{
    expect(agentOutputTokenBudget({})).toBe(768);
    expect(agentOutputTokenBudget({RAWAAN_AI_MAX_OUTPUT_TOKENS:"2048"})).toBe(2048);
  });
  it.each(["0","-1","900.5","invalid","999999"])("rejects an invalid server budget %s",value=>{
    expect(()=>agentOutputTokenBudget({RAWAAN_AI_MAX_OUTPUT_TOKENS:value})).toThrow(/RAWAAN_AI_MAX_OUTPUT_TOKENS/);
  });
});

describe("bounded Rawaan agent",()=>{
  it.each([
    ["no context", undefined, false],
    ["unconfirmed context", clinicalContextSchema.parse({confirmed_at:new Date().toISOString()}), false],
    ["missing timestamp", clinicalContextSchema.parse({medication_context_confirmed:true}), false],
    ["stale timestamp", clinicalContextSchema.parse({medication_context_confirmed:true,confirmed_at:"2026-10-22T00:00:00.000Z"}), false],
    ["future timestamp", clinicalContextSchema.parse({medication_context_confirmed:true,confirmed_at:"2099-01-01T00:00:00.000Z"}), false],
    ["recent confirmation", confirmedContext(), true],
  ] as const)("enables medication options only with a fresh explicit confirmation (%s)",async(_label,context,expected)=>{
    const llm=provider({clinical:true,needs_search:true,search_query:"clinical guidance"},{...answer,clinical});
    await runRawaanAgent({question:"Discuss medication considerations",notes:[],context,history:[],webEnabled:true},llm,
      {search:async()=>[{title:"Guideline",url:"https://www.who.int/health-topics",content:"Guidance"}]});
    expect(medicationContextIsFresh(context)).toBe(expected);
    expect(JSON.parse(llm.complete.mock.calls[1][0].user).allow_medication_options).toBe(expected);
  });
  it("accepts a confirmation exactly 24 hours old and rejects one a millisecond older",()=>{
    const now=Date.parse("2026-10-24T12:00:00.000Z");
    const atBoundary=clinicalContextSchema.parse({medication_context_confirmed:true,confirmed_at:new Date(now-24*60*60*1000).toISOString()});
    const stale=clinicalContextSchema.parse({medication_context_confirmed:true,confirmed_at:new Date(now-24*60*60*1000-1).toISOString()});
    expect(medicationContextIsFresh(atBoundary,now)).toBe(true);
    expect(medicationContextIsFresh(stale,now)).toBe(false);
  });
  it("fails explicitly on an invalid action review instead of assuming it cleared the draft",async()=>{
    const llm={complete:vi.fn().mockResolvedValueOnce(JSON.stringify({in_scope:true,clinical:true,needs_search:false,search_query:""}))
      .mockResolvedValueOnce(JSON.stringify({...answer,answer:followUp.unclassified[0],clinical}))
      .mockResolvedValueOnce(JSON.stringify({unexpected:false}))};
    await expect(runRawaanAgent({question:followUp.question,notes:[],history:[],webEnabled:false},llm)).rejects.toThrow();
    expect(llm.complete).toHaveBeenCalledTimes(3);
  });
  it("bounds action review to one call and never reuses a clearance for a changed rewrite",async()=>{
    const llm={complete:vi.fn().mockResolvedValueOnce(JSON.stringify({in_scope:true,clinical:true,needs_search:false,search_query:""}))
      .mockResolvedValueOnce(JSON.stringify({...answer,answer:"Start zolpidem.",clinical}))
      .mockResolvedValueOnce(JSON.stringify({has_medication_orders:true}))
      .mockResolvedValueOnce(JSON.stringify({...answer,answer:"Start warfarin.",clinical}))};
    await expect(runRawaanAgent({question:followUp.question,notes:[],history:[],webEnabled:false},llm)).rejects.toMatchObject({reason:"ambiguous_action"});
    expect(llm.complete).toHaveBeenCalledTimes(4);
  });
  it.each(followUp.unclassified)("checks ambiguous follow-up intent instead of calling unfamiliar wording a medication order: %s",async text=>{
    const note=noteSchema.parse(seed[0]);
    const output={...answer,answer:text+" Context [N1].",note_source_indices:[0],clinical};
    const llm={complete:vi.fn().mockResolvedValueOnce(JSON.stringify({in_scope:true,clinical:true,needs_search:false,search_query:""}))
      .mockResolvedValueOnce(JSON.stringify(output)).mockResolvedValueOnce(JSON.stringify({has_medication_orders:false}))};
    const result=await runRawaanAgent({question:"What should be the follow up of this conversation?",notes:[note],history:[],webEnabled:false},llm);
    expect(result.answer).toBe(output.answer);
    expect(result.sources).toMatchObject([{kind:"note",noteId:note.id}]);
    expect(llm.complete).toHaveBeenCalledTimes(3);
    expect(llm.complete.mock.calls[2][0].maxTokens).toBe(96);
    expect(JSON.parse(llm.complete.mock.calls[2][0].user)).not.toHaveProperty("approved_notes");
  });
  it("repairs an unknown drug order when the intent check identifies it",async()=>{
    const llm={complete:vi.fn().mockResolvedValueOnce(JSON.stringify({in_scope:true,clinical:true,needs_search:false,search_query:""}))
      .mockResolvedValueOnce(JSON.stringify({...answer,answer:"Start zolpidem.",clinical}))
      .mockResolvedValueOnce(JSON.stringify({has_medication_orders:true}))
      .mockResolvedValueOnce(JSON.stringify({...answer,answer:"Discuss the sleep concerns at follow-up.",clinical}))};
    const result=await runRawaanAgent({question:"What next?",notes:[],history:[],webEnabled:false},llm);
    expect(result.answer).toBe("Discuss the sleep concerns at follow-up.");
    expect(llm.complete).toHaveBeenCalledTimes(4);
  });
  it("does not let a non-medication intent result bypass an explicit drug order later in the reply",async()=>{
    const output={...answer,answer:followUp.unclassified[0]+" Start medication.",clinical};
    const llm={complete:vi.fn().mockResolvedValueOnce(JSON.stringify({in_scope:true,clinical:true,needs_search:false,search_query:""}))
      .mockResolvedValueOnce(JSON.stringify(output)).mockResolvedValueOnce(JSON.stringify({has_medication_orders:false}))
      .mockResolvedValueOnce(JSON.stringify(output))};
    await expect(runRawaanAgent({question:"What next?",notes:[],history:[],webEnabled:false},llm)).rejects.toThrow();
  });
  it("answers proposed follow-up topics outside the notes without treating discussion verbs as medication orders",async()=>{
    const note=noteSchema.parse(seed[0]);
    const proposedPlan={...clinical.plan,next_steps:followUp.allowed,goals:["Identify priorities for the next session"]};
    const response={...answer,answer:`Proposed topics, not recorded facts. ${followUp.allowed[0]} Context from the previous session [N1].`,note_source_indices:[0],clinical:{...clinical,plan:proposedPlan}};
    const llm=provider({clinical:true,needs_search:false,search_query:""},response);
    const result=await runRawaanAgent({question:followUp.question,notes:[note],history:[],webEnabled:false},llm);
    expect(result.answer).toBe(response.answer);
    expect(result.clinical?.plan?.next_steps).toEqual(followUp.allowed);
    expect(result.sources).toMatchObject([{kind:"note",noteId:note.id}]);
    expect(llm.complete).toHaveBeenCalledTimes(2);
    expect(llm.complete.mock.calls[1][0].system).toContain("proposed topics");
  });
  it("returns cited medication discussion with risk warnings without wasting a clinical rewrite",async()=>{
    const llm=provider({clinical:true,needs_search:true,search_query:"insomnia guidance"},{
      ...answer,answer:guardFixture.allowed[0],clinical:{...clinical,plan:null,
        medication_options:[{name:"Reference-supported discussion option",considerations:`${guardFixture.allowed[2]} [W1].`}],
      },
    });
    const search={search:vi.fn().mockResolvedValue([{title:"Clinical reference",url:"https://www.nhs.uk/conditions/insomnia/",content:"Reference text"}])};
    const result=await runRawaanAgent({question:guardFixture.insomniaQuestion,notes:[],context:confirmedContext(),history:[],webEnabled:true},llm,search);
    expect(llm.complete).toHaveBeenCalledTimes(2);
    expect(result.answer).toBe(guardFixture.allowed[0]);
    expect(result.clinical?.medication_options).toHaveLength(1);
    expect(result.sources).toMatchObject([{kind:"web",citation:"W1",url:"https://www.nhs.uk/conditions/insomnia/"}]);
  });
  it.each(scopeFixture.outOfScope)("redirects off-topic requests without answering or searching: %s",async question=>{
    const llm=provider({in_scope:false,clinical:false,needs_search:true,search_query:"coding"},{...answer,answer:"Unexpected code answer"});
    const search={search:vi.fn()};
    const result=await runRawaanAgent({question,notes:[noteSchema.parse(seed[0])],history:[],webEnabled:true},llm,search);
    expect(result.answer).toMatch(/clinical assistant/i);
    expect(result.answer).not.toContain("Unexpected code answer");
    expect(result).toMatchObject({status:"agent",category:"general",sources:[],clinical:null,notice:null});
    expect(llm.complete).toHaveBeenCalledTimes(1);
    expect(search.search).not.toHaveBeenCalled();
  });
  it("requires an explicit scope classification rather than defaulting missing scope to allowed",async()=>{
    const llm={complete:vi.fn().mockResolvedValue(JSON.stringify({clinical:false,needs_search:false,search_query:""}))};
    await expect(runRawaanAgent({question:scopeFixture.outOfScope[0],notes:[],history:[],webEnabled:false},llm)).rejects.toThrow();
    expect(llm.complete).toHaveBeenCalledTimes(1);
  });
  it.each(scopeFixture.inScope)("keeps broad medical conversation available without a selected client: %s",async question=>{
    const llm=provider({in_scope:true,clinical:false,needs_search:false,search_query:""},answer);
    const result=await runRawaanAgent({question,notes:[],history:[],webEnabled:false},llm);
    expect(result.answer).toBe(answer.answer);
    expect(llm.complete).toHaveBeenCalledTimes(2);
  });
  it("supplies redacted recent questions so medical follow-ups retain their context",async()=>{
    const note=noteSchema.parse(seed[0]);
    const llm=provider({in_scope:true,clinical:false,needs_search:false,search_query:""},answer);
    await runRawaanAgent({question:"Why is that?",notes:[note],history:[{question:`Summarize ${note.patient_display_name}'s clinical history`,answer:"Prior response"}],webEnabled:false},llm);
    const planner=JSON.parse(llm.complete.mock.calls[0][0].user);
    expect(planner.recent_questions[0]).toContain("clinical history");
    expect(planner.recent_questions[0]).not.toContain(note.patient_display_name);
  });
  it("budgets planning and complete answers below the observed free-tier output allowance",async()=>{
    const note=noteSchema.parse(seed[0]);
    const llm=provider({clinical:false,needs_search:false,search_query:""},answer);
    await runRawaanAgent({question:"What is the main concern?",notes:[note],history:[],webEnabled:false},llm);
    expect(llm.complete.mock.calls.map(call=>call[0].maxTokens)).toEqual([128,768]);
    const envelope=JSON.parse(llm.complete.mock.calls[1][0].user);
    expect(envelope.response_token_budget).toBe(768);
    expect(envelope.approved_notes[0].raw_transcript).toBe(note.raw_transcript);
  });
  it("supports a larger answer budget when the server account has higher quotas",async()=>{
    const llm=provider({clinical:false,needs_search:false,search_query:""},answer);
    await runRawaanAgent({question:"Explain clinical note formats",notes:[],history:[],webEnabled:false,outputTokenBudget:2048},llm);
    expect(llm.complete.mock.calls[1][0].maxTokens).toBe(2048);
    expect(JSON.parse(llm.complete.mock.calls[1][0].user).response_token_budget).toBe(2048);
  });
  it("uses the same bounded budget and full notes for a clinical rewrite",async()=>{
    const note=noteSchema.parse(seed[0]);
    const llm=provider({clinical:true,needs_search:false,search_query:""},{...answer,answer:"Start medication.",clinical});
    llm.complete.mockResolvedValueOnce(JSON.stringify({...answer,answer:"Review the documented symptoms [N1].",clinical}));
    await runRawaanAgent({question:"Discuss treatment",notes:[note],history:[],webEnabled:false},llm);
    expect(llm.complete.mock.calls.map(call=>call[0].maxTokens)).toEqual([128,768,768]);
    expect(JSON.parse(llm.complete.mock.calls[2][0].user).approved_notes[0].raw_transcript).toBe(note.raw_transcript);
  });
  it("answers a selected client's plan question from notes without an intake form or web search",async()=>{
    const note=noteSchema.parse(seed[0]);
    const llm=provider({clinical:true,needs_search:true,search_query:"anxiety"},{...answer,answer:"Review the documented concerns [N1].",note_source_indices:[0],clinical});
    const result=await runRawaanAgent({question:"Help plan the next session",notes:[note],context:clinicalContextSchema.parse({}),history:[],webEnabled:false},llm);
    expect(llm.complete).toHaveBeenCalledTimes(2);
    expect(llm.complete.mock.calls[0][0].maxTokens).toBe(128);
    expect(result.clinical?.plan).toEqual(clinical.plan);
    expect(result.clinical?.missing_information).toEqual([]);
    expect(result.answer).not.toMatch(/confirm.*context|before I can/i);
    expect(result.sources).toMatchObject([{kind:"note",noteId:note.id}]);
  });
  it("includes every session and its complete transcript, not just the newest ten",async()=>{
    const base=noteSchema.parse(seed[0]);
    const notes=Array.from({length:12},(_,index)=>({...base,id:base.id+"-"+index,consultation_date:`2026-${String(index+1).padStart(2,"0")}-01`}));
    const oldest=notes[0];
    oldest.raw_transcript=base.raw_transcript.repeat(30);
    oldest.history=Array.from({length:18},()=>base.history.join(" ").repeat(10));
    const llm=provider({clinical:false,needs_search:false,search_query:""},{...answer,answer:"The earliest session recorded this [N12].",note_source_indices:[11]});
    const result=await runRawaanAgent({question:"What was discussed in the very first session?",notes,history:[],webEnabled:false},llm);
    const envelope=JSON.parse(llm.complete.mock.calls[1][0].user);
    expect(envelope.approved_notes).toHaveLength(12);
    expect(envelope.approved_notes[11]).toMatchObject({date:oldest.consultation_date,history:oldest.history,raw_transcript:oldest.raw_transcript});
    expect(envelope.notes_truncated).not.toBe(true);
    expect(result.sources).toMatchObject([{kind:"note",citation:"N12",noteId:oldest.id}]);
  });
  it("can cite every session in a long history instead of rejecting a complete timeline",async()=>{
    const base=noteSchema.parse(seed[0]);
    const notes=Array.from({length:24},(_,index)=>({...base,id:base.id+"-"+String(index).padStart(2,"0")}));
    const citations=notes.map((_,index)=>`[N${index+1}]`).join(" ");
    const llm=provider({clinical:false,needs_search:false,search_query:""},{...answer,answer:citations,note_source_indices:notes.map((_,index)=>index)});
    const result=await runRawaanAgent({question:"Show the complete documented session timeline",notes,history:[],webEnabled:false},llm);
    expect(result.sources).toHaveLength(24);
    expect(result.sources[23]).toMatchObject({kind:"note",citation:"N24",noteId:notes[23].id});
  });
  it("answers clinical education without a selected client or a search call",async()=>{
    const llm=provider({clinical:false,needs_search:false,search_query:""},answer);
    const search={search:vi.fn()};
    const result=await runRawaanAgent({question:scopeFixture.inScope[0],notes:[],history:[],webEnabled:true},llm,search);
    expect(result).toMatchObject({status:"agent",category:"general",answer:answer.answer,sources:[]});
    expect(llm.complete).toHaveBeenCalledTimes(2);expect(search.search).not.toHaveBeenCalled();
  });
  it("sends fixed clinical concepts, never a private narrative, even for clients without notes",async()=>{
    const llm=provider({clinical:true,needs_search:true,search_query:"Aashir Aslam lives at 123 Private Road; anxiety on 2026-10-07"}, {...answer,clinical});
    const search={search:vi.fn().mockResolvedValue([])};
    await runRawaanAgent({question:"Draft a treatment plan",notes:[],context:clinicalContextSchema.parse({}),history:[],webEnabled:true},llm,search);
    expect(search.search).toHaveBeenCalledExactlyOnceWith("anxiety clinical evaluation treatment guideline",true);
  });
  it("shows search failure honestly and continues without fabricated web sources",async()=>{
    const llm=provider({clinical:false,needs_search:true,search_query:"clinical documentation standards"},{...answer,answer:"Current documentation standards could not be verified."});
    const result=await runRawaanAgent({question:"What are the current clinical documentation standards?",notes:[],history:[],webEnabled:true},llm,{search:async()=>{throw Error("private provider payload");}});
    expect(result.notice).toMatch(/unavailable/);expect(result.sources).toEqual([]);
    expect(JSON.stringify(result)).not.toContain("private provider payload");
  });
  it("retains source positions when the model uses a later search result",async()=>{
    const llm=provider({clinical:false,needs_search:true,search_query:"medical documentation standards"},{...answer,answer:"Verified finding [W2]",web_source_indices:[1]});
    const result=await runRawaanAgent({question:"Search medical documentation standards",notes:[],history:[],webEnabled:true},llm,{search:async()=>[
      {title:"First",url:"https://www.who.int/first",content:"first"},
      {title:"Second",url:"https://www.who.int/second",content:"second"},
    ]});
    expect(result.sources).toMatchObject([{kind:"web",citation:"W2",url:"https://www.who.int/second"}]);
  });
  it.each([
    {...answer,answer:"Invented source [W3]",web_source_indices:[]},
    {...answer,answer:"Unsupported source [99]"},
    {...answer,answer:"Unsupported source [W0]"},
    {...answer,answer:"Unsupported source [n3]"},
    {...answer,answer:"https://invented.example/claim"},
    {...answer,web_source_indices:[7]},
  ])("rejects unmatched citations and inline model URLs",async output=>{
    await expect(runRawaanAgent({question:"Search a fact",notes:[],history:[],webEnabled:true},provider({clinical:false,needs_search:true,search_query:"fact"},output),{search:async()=>[]})).rejects.toThrow();
  });
  it.each([
    {...answer,answer:"Start warfarin 5 mg daily.",clinical},
    {...answer,answer:"Warfarin: one tablet twice daily.",clinical},
    {...answer,answer:"Sertraline would be appropriate for this patient.",clinical},
    {...answer,clinical:{...clinical,plan:{...clinical.plan,next_steps:["Sertraline each morning would help this patient."]}}},
    {...answer,answer:"You should begin sertraline each morning",clinical},
    {...answer,answer:"میٹفارمن کی ایک گولی صبح اور شام لیں۔",clinical},
    {...answer,clinical:{...clinical,plan:{...clinical.plan,next_steps:["Take warfarin daily"]}}},
    {...answer,answer:"Continue sleep medication.",clinical},
    {...answer,answer:"Start warfarin.",clinical},
    {...answer,answer:"Use ibuprofen as needed.",clinical},
    {...answer,answer:"Do not forget to start medication.",clinical},
    {...answer,answer:"Do not hesitate to start insulin.",clinical},
    {...answer,answer:"Continue mood stabilizers.",clinical},
    {...answer,answer:"Do not prescribe but start medication.",clinical},
    {...answer,answer:"Do not stop warfarin; continue sleep medication.",clinical},
    {...answer,clinical:{...clinical,medication_options:[{name:"Warfarin",considerations:"Discuss use"}]}},
  ])("rejects forbidden orders across prose and plans, not only medication arrays",async output=>{
    await expect(runRawaanAgent({question:"Explain anxiety",notes:[],history:[],webEnabled:false},provider({clinical:true,needs_search:true,search_query:"warfarin"},output))).rejects.toThrow();
  });
  it("allows reference-supported discussion options after fresh context confirmation",async()=>{
    const context=confirmedContext();
    const llm=provider({clinical:true,needs_search:true,search_query:"anxiety guidance"}, {...answer,web_source_indices:[0],clinical:{...clinical,medication_options:[{name:"Reference-supported discussion option",considerations:"Discuss contraindications and interactions with the clinician [W1]."}]}});
    const result=await runRawaanAgent({question:"Medication considerations",notes:[noteSchema.parse(seed[0])],context,history:[],webEnabled:true},llm,{search:async()=>[{title:"Guideline",url:"https://www.nice.org.uk/guidance",content:"Clinical guidance"}]});
    expect(result.clinical?.medication_options).toHaveLength(1);
    expect(result.sources[0]).toMatchObject({kind:"web",citation:"W1"});
  });
  it("checks doses even if a provider misclassifies the question",async()=>{
    await expect(runRawaanAgent({question:"Help me",notes:[],history:[],webEnabled:false},provider({clinical:false,needs_search:false,search_query:""},{...answer,answer:"Start warfarin 5 mg daily."}))).rejects.toThrow();
  });
  it("allows non-medication workflow language",async()=>{
    const result=await runRawaanAgent({question:"Prepare for a consultation",notes:[],history:[],webEnabled:false},provider({clinical:true,needs_search:false,search_query:""},{...answer,answer:"Take a symptom diary to your follow-up.",clinical}));
    expect(result.answer).toContain("symptom diary");
  });
  it("allows a sleep and study journal follow-up without treating it as a medication order",async()=>{
    const llm=provider({clinical:true,needs_search:false,search_query:""},{...answer,answer:"Continue the sleep and study journal.",clinical});
    const result=await runRawaanAgent({question:"Plan the next session",notes:[noteSchema.parse(seed[0])],history:[],webEnabled:false},llm);
    expect(result.answer).toBe("Continue the sleep and study journal.");
  });
  it.each([
    "Reduce stress and increase social support. Continue CBT and begin sleep hygiene work.",
    "I cannot prescribe medication. Assess the documented sleep difficulties instead.",
    "Do not discontinue medication without reviewing it with the treating clinician.",
    "Psychotherapy would help this patient explore the recorded stressors.",
    "Psychotherapy would be appropriate for this patient as a discussion option.",
    "Begin exercise daily and continue CBT at the next session.",
    "Use mindfulness daily. You should begin exercise daily.",
    "Assess current medication or substance use history. Limit electronic device use before bed. Discuss relaxation for evening use. Reduce evening stress levels.",
  ])("allows clinician discussion and non-medication plans: %s",async text=>{
    const llm=provider({clinical:true,needs_search:false,search_query:""},{...answer,answer:text,clinical:{...clinical,plan:{...clinical.plan,goals:["Reduce stress"],next_steps:["Begin CBT","Increase social support"]}}});
    const result=await runRawaanAgent({question:"Propose treatment options",notes:[],history:[],webEnabled:false},llm);
    expect(result.answer).toBe(text);
  });
  it("keeps medical-workflow search available when a client is selected",async()=>{
    const search={search:vi.fn().mockResolvedValue([])};
    await runRawaanAgent({question:"Search current clinical documentation standards",notes:[],context:clinicalContextSchema.parse({}),privateIdentifiers:["Fixture Client"],history:[],webEnabled:true},provider({clinical:false,needs_search:true,search_query:"clinical documentation standards"},answer),search);
    expect(search.search).toHaveBeenCalledExactlyOnceWith("clinical documentation standards",false);
  });
  it("handles sensitive search text even if classified as general",async()=>{
    const search={search:vi.fn().mockResolvedValue([])};
    await runRawaanAgent({question:"A person lives at 123 Private Road with anxiety",notes:[],history:[],webEnabled:true},provider({clinical:false,needs_search:true,search_query:"Person at 123 Private Road anxiety"},answer),search);
    expect(search.search).toHaveBeenCalledExactlyOnceWith("anxiety clinical evaluation treatment guideline",true);
  });
  it("rejects unverified personalized medication advice even after removing the intake gate",async()=>{
    const llm=provider({clinical:true,needs_search:true,search_query:"anxiety"}, {...answer,answer:"Sertraline would be appropriate for this patient.",clinical});
    await expect(runRawaanAgent({question:"Suggest medication for this patient",notes:[],context:clinicalContextSchema.parse({}),history:[],webEnabled:false},llm)).rejects.toThrow(/Unverified/);
    expect(llm.complete).toHaveBeenCalledTimes(3);
  });
  it("repairs a medication-order draft once, retaining the full record and useful treatment plan",async()=>{
    const note=noteSchema.parse(seed[0]);
    const llm=provider({clinical:true,needs_search:false,search_query:""},{...answer,answer:"Take medication daily.",clinical});
    llm.complete.mockResolvedValueOnce(JSON.stringify({...answer,answer:"Reduce stress and consider psychotherapy [N1].",note_source_indices:[0],clinical}));
    const result=await runRawaanAgent({question:"Suggest treatment",notes:[note],history:[],webEnabled:false},llm);
    expect(result.answer).toMatch(/psychotherapy/);
    expect(llm.complete).toHaveBeenCalledTimes(3);
    const repair=JSON.parse(llm.complete.mock.calls[2][0].user);
    expect(repair.approved_notes[0].raw_transcript).toBe(note.raw_transcript);
    expect(repair.revision_required).toMatch(/orders/);
    expect(result.sources).toMatchObject([{kind:"note",noteId:note.id}]);
  });
  it("links inline citations omitted from the redundant source arrays only when their envelope positions exist",async()=>{
    const note=noteSchema.parse(seed[0]);
    const llm=provider({clinical:false,needs_search:true,search_query:"clinical documentation"},{...answer,answer:"Recorded concern [N1]; external context [W1]."});
    const result=await runRawaanAgent({question:"Search context",notes:[note],history:[],webEnabled:true},llm,{search:async()=>[{title:"Source",url:"https://www.nasa.gov/",content:"Context"}]});
    expect(result.sources.map(source=>source.citation)).toEqual(["N1","W1"]);
  });
  it("requires a specific reference for each medication option and validates it against fetched sources",async()=>{
    const search={search:vi.fn().mockResolvedValue([{title:"Source",url:"https://www.nice.org.uk/guidance",content:"Guidance"}])};
    const llm=provider({clinical:true,needs_search:true,search_query:"anxiety"},{...answer,web_source_indices:[0],clinical:{...clinical,medication_options:[{name:"Discussion option",considerations:"Unreferenced consideration"}]}});
    await expect(runRawaanAgent({question:"Medication considerations",notes:[],context:confirmedContext(),history:[],webEnabled:true},llm,search)).rejects.toThrow(/references/);
    expect(llm.complete).toHaveBeenCalledTimes(3);
    expect(search.search).toHaveBeenCalledTimes(1);
    const invalid=provider({clinical:true,needs_search:true,search_query:"anxiety"},{...answer,web_source_indices:[0],clinical:{...clinical,medication_options:[{name:"Discussion option",considerations:"Invented reference [W9]"}]}});
    await expect(runRawaanAgent({question:"Medication considerations",notes:[],context:confirmedContext(),history:[],webEnabled:true},invalid,search)).rejects.toThrow(/unsupported citation/);
  });
  it("accepts a valid medication source omitted from the redundant arrays without a rewrite",async()=>{
    const llm=provider({clinical:true,needs_search:true,search_query:"anxiety"},{...answer,clinical:{...clinical,medication_options:[{name:"Discussion option",considerations:"Assess contraindications [W1]."}]}});
    const result=await runRawaanAgent({question:"Medication considerations",notes:[],context:confirmedContext(),history:[],webEnabled:true},llm,{search:async()=>[{title:"Guideline",url:"https://www.nice.org.uk/guidance",content:"Guidance"}]});
    expect(result.clinical?.medication_options).toHaveLength(1);
    expect(llm.complete).toHaveBeenCalledTimes(2);
    expect(result.sources).toMatchObject([{kind:"web",citation:"W1"}]);
  });
  it("does not block planning on stale or unknown optional context or append an intake checklist",async()=>{
    const context=clinicalContextSchema.parse({age:30,allergies:"not available",current_medications:"unknown currently",pregnancy_status:"not applicable",kidney_function:"unknown - needs test",liver_function:"normal",medication_context_confirmed:true,confirmed_at:"2020-01-01T00:00:00.000Z"});
    const llm=provider({clinical:true,needs_search:true,search_query:"anxiety"},{...answer,clinical});
    const result=await runRawaanAgent({question:"Prepare the next session",notes:[noteSchema.parse(seed[0])],context,history:[],webEnabled:true},llm,
      {search:async()=>[{title:"Guideline",url:"https://www.who.int/health-topics",content:"Guidance"}]});
    expect(result.clinical?.plan).toEqual(clinical.plan);
    expect(result.clinical?.missing_information).toEqual([]);
    expect(llm.complete).toHaveBeenCalledTimes(2);
    const request=JSON.parse(llm.complete.mock.calls[1][0].user);
    expect(request.allow_medication_options).toBe(false);
    expect(request.clinical_context_confirmed_at).toBeNull();
  });
});

describe("Tavily HTTP tool",()=>{
  it("restricts clinical search and accepts only actual public authoritative results",async()=>{
    const fetchMock=vi.fn().mockResolvedValue(new Response(JSON.stringify({results:[
      {title:"WHO",url:"https://www.who.int/topic",content:"guidance"},
      {title:"Private",url:"https://127.0.0.1/path",content:"x"},
      {title:"Lookalike",url:"https://who.int.evil.example/topic",content:"x"},
    ]}),{status:200}));
    vi.stubGlobal("fetch",fetchMock);
    expect(await createTavilySearch("test-placeholder").search("anxiety clinical guideline",true)).toEqual([{title:"WHO",url:"https://www.who.int/topic",content:"guidance"}]);
    const options=fetchMock.mock.calls[0][1]; const body=JSON.parse(options.body);
    expect(body).toMatchObject({search_depth:"basic",max_results:5,include_answer:false});
    expect(body.include_domains).toContain("who.int");expect(options.cache).toBe("no-store");
  });
});
