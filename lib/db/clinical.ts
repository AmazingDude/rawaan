import { z } from "zod";
import { agentSourceSchema } from "@/lib/agent/schema";
import { clinicalContextSchema, proposedPlanSchema, type ClinicalContext } from "@/lib/clinical/schema";
import { readAllRows, storageOperation, StorageError, type SupabaseClientFactory } from "@/lib/db/supabase";
const planSchema=z.object({id:z.string(),patient_id:z.string(),title:z.string(),reviewed_content:z.string(),generated_plan:proposedPlanSchema,sources:z.array(agentSourceSchema),reviewed_at:z.string()});
export type ReviewedClinicalPlan=z.infer<typeof planSchema>;
export function createClinicalStore(ownerId:string,getClient:SupabaseClientFactory) {
  if(!ownerId.trim())throw new StorageError();
  return {
    async getAgentContext(patientId:string):Promise<{context:ClinicalContext;identifiers:string[]}>{
      return storageOperation(async()=>{const {data,error}=await getClient().from("patients").select("id,display_name,first_name,last_name,email,mobile_number,clinical_context").eq("owner_user_id",ownerId).eq("id",patientId).maybeSingle();if(error||!data)throw new StorageError();return {context:clinicalContextSchema.parse(data.clinical_context??{}),identifiers:[data.id,data.display_name,data.first_name,data.last_name,data.email,data.mobile_number,...String(data.display_name??"").split(/\s+/)].filter((value):value is string=>typeof value==="string"&&value.length>2)};});
    },
    async getContext(patientId:string):Promise<ClinicalContext>{
      return storageOperation(async()=>{const {data,error}=await getClient().from("patients").select("id,clinical_context").eq("owner_user_id",ownerId).eq("id",patientId).maybeSingle();if(error||!data)throw new StorageError();return clinicalContextSchema.parse(data.clinical_context??{});});
    },
    async saveContext(patientId:string,context:ClinicalContext):Promise<ClinicalContext>{
      const value=clinicalContextSchema.parse(context);
      return storageOperation(async()=>{const {data,error}=await getClient().from("patients").update({clinical_context:value}).eq("owner_user_id",ownerId).eq("id",patientId).select("clinical_context").single();if(error||!data)throw new StorageError();return clinicalContextSchema.parse(data.clinical_context);});
    },
    async listPlans(patientId:string):Promise<ReviewedClinicalPlan[]> {
      return storageOperation(async()=>planSchema.array().parse(await readAllRows(()=>getClient().from("clinical_plans").select("id,patient_id,title,reviewed_content,generated_plan,sources,reviewed_at").eq("owner_user_id",ownerId).eq("patient_id",patientId).order("reviewed_at",{ascending:false}).order("id"))));
    },
    async savePlan(plan:ReviewedClinicalPlan):Promise<ReviewedClinicalPlan>{
      const value=planSchema.parse(plan);
      return storageOperation(async()=>{const {data,error}=await getClient().from("clinical_plans").insert({...value,owner_user_id:ownerId}).select("id,patient_id,title,reviewed_content,generated_plan,sources,reviewed_at").single();if(error||!data)throw new StorageError();return planSchema.parse(data);});
    },
  };
}
