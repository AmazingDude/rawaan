import { beforeEach, describe, expect, it, vi } from "vitest";
import seed from "@/data/seed/demo-patients.json";
import { noteSchema } from "@/lib/notes/schema";
import { runRawaanAgent } from "@/lib/llm/rawaan-agent";
import { clinicalContextSchema } from "@/lib/clinical/schema";
import { createTavilySearch } from "@/lib/tools/web-search";

const answer = { answer:"A helpful explanation.", note_source_indices:[], web_source_indices:[], clinical:null };
const clinical = { differential:[{condition:"Anxiety",rationale:"Reported stress is compatible, but requires assessment."}], medication_options:[], missing_information:[], plan:{title:"Proposed review plan",goals:["Clarify current symptoms"],next_steps:["Discuss assessment with the clinician"],monitoring:["Review symptom changes"],follow_up:"Arrange clinician review",red_flags:[]} };
function provider(plan:object, response:object) {
  return { complete:vi.fn().mockResolvedValue(JSON.stringify(response)).mockResolvedValueOnce(JSON.stringify(plan)).mockResolvedValueOnce(JSON.stringify(response)) };
}
beforeEach(()=>{vi.unstubAllGlobals();});

describe("bounded Rawaan agent",()=>{
  it("answers a selected client's plan question from notes without an intake form or web search",async()=>{
    const note=noteSchema.parse(seed[0]);
    const llm=provider({clinical:true,needs_search:true,search_query:"anxiety"},{...answer,answer:"Review the documented concerns [N1].",note_source_indices:[0],clinical});
    const result=await runRawaanAgent({question:"Help plan the next session",notes:[note],context:clinicalContextSchema.parse({}),history:[],webEnabled:false},llm);
    expect(llm.complete).toHaveBeenCalledTimes(2);
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
  it("answers general questions without a selected client or a search call",async()=>{
    const llm=provider({clinical:false,needs_search:false,search_query:""},answer);
    const search={search:vi.fn()};
    const result=await runRawaanAgent({question:"Explain recursion",notes:[],history:[],webEnabled:true},llm,search);
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
    const llm=provider({clinical:false,needs_search:true,search_query:"current weather"},{...answer,answer:"Current weather could not be verified."});
    const result=await runRawaanAgent({question:"What is today's weather?",notes:[],history:[],webEnabled:true},llm,{search:async()=>{throw Error("private provider payload");}});
    expect(result.notice).toMatch(/unavailable/);expect(result.sources).toEqual([]);
    expect(JSON.stringify(result)).not.toContain("private provider payload");
  });
  it("retains source positions when the model uses a later search result",async()=>{
    const llm=provider({clinical:false,needs_search:true,search_query:"recent space news"},{...answer,answer:"Verified finding [W2]",web_source_indices:[1]});
    const result=await runRawaanAgent({question:"Search space news",notes:[],history:[],webEnabled:true},llm,{search:async()=>[
      {title:"First",url:"https://www.nasa.gov/first",content:"first"},
      {title:"Second",url:"https://www.nasa.gov/second",content:"second"},
    ]});
    expect(result.sources).toMatchObject([{kind:"web",citation:"W2",url:"https://www.nasa.gov/second"}]);
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
  it("allows reference-supported discussion options without requiring a completed context form",async()=>{
    const context=clinicalContextSchema.parse({});
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
  it("keeps general search available when a client is selected",async()=>{
    const search={search:vi.fn().mockResolvedValue([])};
    await runRawaanAgent({question:"Search current weather in Karachi",notes:[],context:clinicalContextSchema.parse({}),privateIdentifiers:["Fixture Client"],history:[],webEnabled:true},provider({clinical:false,needs_search:true,search_query:"Karachi current weather"},answer),search);
    expect(search.search).toHaveBeenCalledExactlyOnceWith("Karachi current weather",false);
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
    const llm=provider({clinical:true,needs_search:false,search_query:""},{...answer,answer:"Take warfarin daily.",clinical});
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
    const llm=provider({clinical:false,needs_search:true,search_query:"space"},{...answer,answer:"Recorded concern [N1]; external context [W1]."});
    const result=await runRawaanAgent({question:"Search context",notes:[note],history:[],webEnabled:true},llm,{search:async()=>[{title:"Source",url:"https://www.nasa.gov/",content:"Context"}]});
    expect(result.sources.map(source=>source.citation)).toEqual(["N1","W1"]);
  });
  it("requires a specific reference for each medication option and validates it against fetched sources",async()=>{
    const search={search:vi.fn().mockResolvedValue([{title:"Source",url:"https://www.nice.org.uk/guidance",content:"Guidance"}])};
    const llm=provider({clinical:true,needs_search:true,search_query:"anxiety"},{...answer,web_source_indices:[0],clinical:{...clinical,medication_options:[{name:"Discussion option",considerations:"Unreferenced consideration"}]}});
    await expect(runRawaanAgent({question:"Medication considerations",notes:[],history:[],webEnabled:true},llm,search)).rejects.toThrow(/references/);
    expect(llm.complete).toHaveBeenCalledTimes(3);
    expect(search.search).toHaveBeenCalledTimes(1);
    const invalid=provider({clinical:true,needs_search:true,search_query:"anxiety"},{...answer,web_source_indices:[0],clinical:{...clinical,medication_options:[{name:"Discussion option",considerations:"Invented reference [W9]"}]}});
    await expect(runRawaanAgent({question:"Medication considerations",notes:[],history:[],webEnabled:true},invalid,search)).rejects.toThrow(/unsupported citation/);
  });
  it("accepts a valid medication source omitted from the redundant arrays without a rewrite",async()=>{
    const llm=provider({clinical:true,needs_search:true,search_query:"anxiety"},{...answer,clinical:{...clinical,medication_options:[{name:"Discussion option",considerations:"Assess contraindications [W1]."}]}});
    const result=await runRawaanAgent({question:"Medication considerations",notes:[],history:[],webEnabled:true},llm,{search:async()=>[{title:"Guideline",url:"https://www.nice.org.uk/guidance",content:"Guidance"}]});
    expect(result.clinical?.medication_options).toHaveLength(1);
    expect(llm.complete).toHaveBeenCalledTimes(2);
    expect(result.sources).toMatchObject([{kind:"web",citation:"W1"}]);
  });
  it("does not block planning on stale or unknown optional context or append an intake checklist",async()=>{
    const context=clinicalContextSchema.parse({age:30,allergies:"not available",current_medications:"unknown currently",pregnancy_status:"not applicable",kidney_function:"unknown - needs test",liver_function:"normal",medication_context_confirmed:true,confirmed_at:"2020-01-01T00:00:00.000Z"});
    const llm=provider({clinical:true,needs_search:true,search_query:"anxiety"},{...answer,clinical});
    const result=await runRawaanAgent({question:"Prepare the next session",notes:[noteSchema.parse(seed[0])],context,history:[],webEnabled:false},llm);
    expect(result.clinical?.plan).toEqual(clinical.plan);
    expect(result.clinical?.missing_information).toEqual([]);
    expect(llm.complete).toHaveBeenCalledTimes(2);
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
