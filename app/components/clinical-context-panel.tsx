"use client";
import { useEffect, useState } from "react";
import { getClinicalContextAction, saveClinicalContextAction } from "@/app/actions";
import { RequestStatus } from "@/app/components/request-status";
import { clinicalContextSchema, type ClinicalContext } from "@/lib/clinical/schema";
const fields=[["current_concern","Current concern"],["allergies","Allergies (or confirmed none)"],["current_medications","Current medications (or confirmed none)"],["pregnancy_status","Pregnancy status (or not applicable)"],["kidney_function","Kidney function"],["liver_function","Liver function"],["vitals","Current vitals / examination"]] as const;
export function ClinicalContextPanel({patientId,onClose}:{patientId:string;onClose:()=>void}){
  const [context,setContext]=useState<ClinicalContext|null>(null);
  const [error,setError]=useState<string|null>(null);
  const [saving,setSaving]=useState(false);
  const [saved,setSaved]=useState(false);
  const [confirmed,setConfirmed]=useState(false);
  const [retry,setRetry]=useState(0);
  useEffect(()=>{let cancelled=false;void getClinicalContextAction(patientId).then(data=>{if(!cancelled){setContext(data);setError(null);}}).catch(()=>{if(!cancelled)setError("Could not load clinical context.");});return()=>{cancelled=true;};},[patientId,retry]);
  async function save(){
    if(!context||saving)return;
    const parsed=clinicalContextSchema.safeParse(context);if(!parsed.success){setError("Review the age and clinical context fields.");return;}
    setSaving(true);setError(null);setSaved(false);
    try{const result=await saveClinicalContextAction(patientId,{...parsed.data,medication_context_confirmed:confirmed});if(!result.ok){setError(result.message);return;}setContext(result.context);setSaved(true);}
    catch{setError("Could not save clinical context. Please retry.");}finally{setSaving(false);}
  }
  return <section className="clinical-context-panel" aria-label="Clinical context">
    <div className="clinical-panel-heading"><h3>Clinical context (optional)</h3><button className="secondary-button" onClick={onClose} type="button">Close</button></div>
    <p>Saved notes are included automatically. Add extra details here only if needed; you can chat without completing this form. Blank fields remain unknown.</p>
    {!context&&!error?<RequestStatus label="Loading clinical context…" skeleton/>:null}
    {error?<p role="alert">{error} {!context?<button className="secondary-button" onClick={()=>setRetry(value=>value+1)} type="button">Retry</button>:null}</p>:null}
    {context?<form onSubmit={event=>{event.preventDefault();void save();}}><label>Age<input type="number" min={0} max={130} aria-label="Age" value={context.age??""} disabled={saving} onChange={event=>setContext({...context,age:event.target.value===""?null:Number(event.target.value)})}/></label>
      {fields.map(([field,label])=><label key={field}>{label}<textarea aria-label={label} value={context[field]} maxLength={field==="current_concern"?5000:field==="pregnancy_status"?300:field==="vitals"?2000:field==="kidney_function"||field==="liver_function"?1000:3000} disabled={saving} onChange={event=>setContext({...context,[field]:event.target.value})}/></label>)}
      <label><input type="checkbox" checked={confirmed} disabled={saving} onChange={event=>setConfirmed(event.target.checked)}/> I have confirmed this is current clinical information.</label>
      <button className="primary-button" disabled={saving} type="submit">{saving?"Saving…":"Save clinical context"}</button>
      {saving?<RequestStatus label="Saving clinical context…"/>:null}{saved?<p role="status">Clinical context saved.</p>:null}
    </form>:null}
  </section>;
}
