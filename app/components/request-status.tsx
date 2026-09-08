"use client";
import { Loader2 } from "lucide-react";
export function RequestStatus({label="Loading…",skeleton=false}:{label?:string;skeleton?:boolean}){
  return <div className="request-status" role="status" aria-live="polite"><Loader2 aria-hidden="true" className="request-spinner" size={16}/><span>{label}</span>{skeleton?<div className="request-skeleton" aria-hidden="true"><span/><span/><span/></div>:null}</div>;
}
