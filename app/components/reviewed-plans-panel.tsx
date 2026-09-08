"use client";
import { useEffect,useState } from "react";
import { listClinicalPlansAction } from "@/app/actions";
import { RequestStatus } from "@/app/components/request-status";
import { formatProposedPlan } from "@/app/components/agent-answer";
import { AgentSources } from "@/app/components/agent-sources";
import type { ReviewedClinicalPlan } from "@/lib/db/clinical";
export function ReviewedPlansPanel({patientId}:{patientId:string}){
  const [plans,setPlans]=useState<ReviewedClinicalPlan[]|null>(null);
  const [error,setError]=useState<string|null>(null);
  const [retry,setRetry]=useState(0);
  useEffect(()=>{let cancelled=false;void listClinicalPlansAction(patientId).then(data=>{if(!cancelled){setPlans(data);setError(null);}}).catch(()=>{if(!cancelled)setError("Could not load reviewed plans.");});return()=>{cancelled=true;};},[patientId,retry]);
  return <section className="reviewed-plans"><h3>Clinician-reviewed plans</h3>
    {plans===null&&!error?<RequestStatus label="Loading reviewed plans…" skeleton/>:null}
    {error?<p role="alert">{error} <button className="secondary-button" onClick={()=>setRetry(value=>value+1)} type="button">Retry</button></p>:null}
    {plans?.length===0?<p>No reviewed AI plans saved yet.</p>:null}
    {plans?.map(plan=><article className="agent-plan" key={plan.id}><h4>{plan.title}</h4><p>Reviewed {new Date(plan.reviewed_at).toLocaleDateString()}</p><pre>{plan.reviewed_content}</pre><details><summary>Original proposed draft</summary><pre>{formatProposedPlan(plan.generated_plan)}</pre></details><AgentSources sources={plan.sources} patientId={patientId}/></article>)}
  </section>;
}
