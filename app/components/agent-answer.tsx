"use client";
import { useState } from "react";
import { AgentSources } from "@/app/components/agent-sources";
import { reviewClinicalPlanAction } from "@/app/actions";
import { RequestStatus } from "@/app/components/request-status";
import type { AgentResponse } from "@/lib/agent/schema";
import type { ProposedPlan } from "@/lib/clinical/schema";

export type PlanReviewContext={patientId:string;threadId:string;entryTimestamp:string};
export function formatProposedPlan(plan:ProposedPlan):string {
  return [plan.title,"Goals",...plan.goals.map(value=>"• "+value),"Next steps",...plan.next_steps.map(value=>"• "+value),"Monitoring",...plan.monitoring.map(value=>"• "+value),"Follow-up",plan.follow_up,"Red flags",...plan.red_flags.map(value=>"• "+value)].filter(Boolean).join("\n");
}
export function AgentAnswer({response,patientId,reviewContext}:{response:AgentResponse;patientId?:string;reviewContext?:PlanReviewContext}){
  const [reviewing,setReviewing]=useState(false);
  const [content,setContent]=useState("");
  const [saving,setSaving]=useState(false);
  const [saved,setSaved]=useState(false);
  const [error,setError]=useState<string|null>(null);
  const clinical=response.clinical;
  async function savePlan(){
    if(!reviewContext||!clinical?.plan||saving||!content.trim())return;
    setSaving(true);setError(null);
    try{
      const result=await reviewClinicalPlanAction({...reviewContext,title:clinical.plan.title,content});
      if(!result.ok){setError(result.message);return;}
      setSaved(true);setReviewing(false);
    }catch{setError("Could not save this reviewed plan. Please retry.");}
    finally{setSaving(false);}
  }
  return <div className="agent-answer">
    {response.category==="clinical"?<span className="agent-proposal-label">Clinical considerations · For clinician review</span>:null}
    <div className="brain-chat-answer">{response.answer}</div>
    {response.notice?<p className="agent-tool-notice" role="status">{response.notice}</p>:null}
    {clinical?.differential.length?<section className="agent-section"><h3>Possible diagnoses</h3><ul>{clinical.differential.map((item,index)=><li key={index}><strong>{item.condition}</strong><p>{item.rationale}</p></li>)}</ul></section>:null}
    {clinical?.medication_options.length?<section className="agent-section"><h3>Medication considerations</h3><ul>{clinical.medication_options.map((item,index)=><li key={index}><strong>{item.name}</strong><p>{item.considerations}</p></li>)}</ul></section>:null}
    {clinical?.missing_information.length?<details className="agent-section"><summary>Information to confirm</summary><ul>{clinical.missing_information.map((item,index)=><li key={index}>{item}</li>)}</ul></details>:null}
    {clinical?.plan?<section className="agent-plan"><h3>{clinical.plan.title}</h3><pre>{formatProposedPlan(clinical.plan)}</pre>
      {reviewContext&&!saved&&!reviewing?<button className="secondary-button" onClick={()=>{setContent(formatProposedPlan(clinical.plan!));setReviewing(true);}} type="button">Review and save plan</button>:null}
      {!reviewContext?<p className="agent-tool-notice">Select a client and save this conversation before reviewing a plan.</p>:null}
      {reviewing?<div className="agent-plan-review"><label>Reviewed plan<textarea aria-label="Reviewed treatment plan" value={content} onChange={event=>setContent(event.target.value)} disabled={saving}/></label><p>Save only after checking the proposed plan and its references.</p>
        <button className="primary-button" onClick={()=>void savePlan()} disabled={saving||!content.trim()} type="button">{saving?"Saving reviewed plan…":"Confirm review and save"}</button>
        <button className="secondary-button" disabled={saving} onClick={()=>setReviewing(false)} type="button">Cancel</button>
        {saving?<RequestStatus label="Saving reviewed plan…"/>:null}
      </div>:null}
      {saved?<p role="status">Reviewed plan saved to this client.</p>:null}{error?<p role="alert">{error}</p>:null}
    </section>:null}
    <AgentSources sources={response.sources} patientId={patientId}/>
  </div>;
}
