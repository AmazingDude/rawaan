import { ZodError } from "zod";
import { StorageError, STORAGE_ERROR_MESSAGE } from "@/lib/db/errors";
import { LlmContextLimitError, LLM_CONTEXT_LIMIT_MESSAGE, LlmRateLimitError, LlmOutputLimitError } from "@/lib/llm/errors";
import { ClinicalProposalError } from "@/lib/clinical/output-guard";

const fields=new Set(["clinical","needs_search","search_query","answer","note_source_indices","web_source_indices","differential","condition","rationale","medication_options","name","considerations","missing_information","plan","title","goals","next_steps","monitoring","follow_up","red_flags"]);
const guardMessages=new Set(["Use clinical discussion language rather than treatment orders.","The response contains treatment orders or dosing instructions.","The response contains treatment orders.","Unverified personalized treatment recommendations are not supported.","Medication considerations require current cited references."]);
const citationMessages=new Set(["The agent returned an invalid record citation.","The agent returned an invalid web citation.","The response contains an unsupported citation.","Use only verified source links."]);
const clinicalFailureMessages:Record<ClinicalProposalError["reason"],string>={
  dosing:"The generated reply included dosing instructions and could not be shown. Please retry for a discussion of medication options.",
  medication_order:"The generated reply included medication orders instead of a clinical discussion. Please retry.",
  ambiguous_action:"Rawaan could not finish checking the proposed actions. Please retry.",
  unverified_recommendation:"The generated reply made an unsupported patient-specific medication recommendation. Please retry for a referenced discussion.",
  missing_references:"Current references could not be verified for the medication options. Enable Web search or retry.",
};

export function describeAgentFailure(error:unknown) {
  if(error instanceof StorageError)return {message:STORAGE_ERROR_MESSAGE,diagnostic:{code:"storage_unavailable"}};
  if(error instanceof LlmContextLimitError)return {message:LLM_CONTEXT_LIMIT_MESSAGE,diagnostic:{code:"context_limit"}};
  if(error instanceof LlmRateLimitError)return {message:error.message,diagnostic:{code:"provider_rate_limit",...error.details}};
  if(error instanceof LlmOutputLimitError)return {message:error.message,diagnostic:{code:"output_limit"}};
  const message=error instanceof Error?error.message:"";
  const status=Number(/^LLM provider returned (\d{3})\b/.exec(message)?.[1]);
  if(status){
    const explanation=status===429?"The AI provider's rate limit was reached. Please try again shortly.":
      status===401||status===403?"The AI provider rejected the server credentials. Check the Groq configuration.":
      status===404?"The configured AI model is unavailable. Check the server's model configuration.":
      status>=500?"The AI provider is temporarily unavailable. Please try again shortly.":
      "The AI provider rejected this request. Please try again.";
    return {message:explanation,diagnostic:{code:"provider_error",httpStatus:status}};
  }
  if(error instanceof ZodError)return {message:"The AI returned an incomplete response. Please retry.",diagnostic:{code:"invalid_response",issues:error.issues.slice(0,20).map(issue=>({code:issue.code,path:issue.path.map(part=>typeof part==="number"?part:fields.has(String(part))?String(part):"(field)")}))}};
  if(error instanceof SyntaxError)return {message:"The AI returned an unreadable response. Please retry.",diagnostic:{code:"invalid_json"}};
  if(error instanceof ClinicalProposalError)return {message:clinicalFailureMessages[error.reason],diagnostic:{code:"clinical_output_rejected",rule:error.reason}};
  if(guardMessages.has(message))return {message:"The AI reply could not be verified safely. Use Records only for exact recorded excerpts, or retry.",diagnostic:{code:"clinical_output_rejected"}};
  if(citationMessages.has(message))return {message:"The AI's source references could not be verified. Please retry.",diagnostic:{code:"invalid_citation"}};
  if(message==="Groq chat completion request failed.")return {message:"The AI provider could not be reached. Please try again shortly.",diagnostic:{code:"provider_connection"}};
  return {message:"Rawaan could not complete this response. Please retry.",diagnostic:{code:"unexpected_failure"}};
}
