import { describe, expect, it } from "vitest";
import { z } from "zod";
import { describeAgentFailure } from "@/lib/agent/errors";
import { LlmContextLimitError, LlmRateLimitError, LlmOutputLimitError } from "@/lib/llm/errors";
import { ClinicalProposalError } from "@/lib/clinical/output-guard";

describe("private AI failure diagnostics",()=>{
  it("distinguishes output-rate capacity, cooldown and truncated replies",()=>{
    const failure=describeAgentFailure(new LlmRateLimitError({kind:"output_tokens_per_minute",httpStatus:429,limit:1000,used:900,requested:900,retryAfterSeconds:45}));
    expect(failure.message).toMatch(/output-token/);
    expect(failure.message).toContain("45 seconds");
    expect(failure.diagnostic).toMatchObject({code:"provider_rate_limit",kind:"output_tokens_per_minute",limit:1000,httpStatus:429});
    expect(describeAgentFailure(new LlmOutputLimitError()).diagnostic.code).toBe("output_limit");
  });
  it.each([401,403,404,429,503])("classifies HTTP %s without returning its private payload",status=>{
    const result=describeAgentFailure(new Error(`LLM provider returned ${status}: sensitive-provider-body`));
    expect(result.diagnostic).toEqual({code:"provider_error",httpStatus:status});
    expect(JSON.stringify(result)).not.toContain("sensitive-provider-body");
    if(status===429)expect(result.message).toMatch(/rate limit/);
  });
  it("records schema issue types and known fields without clinical values or unknown keys",()=>{
    const parsed=z.object({answer:z.string(),clinical:z.record(z.string(),z.number())}).safeParse({answer:null,clinical:{"private-key-name":"private-value"}});
    expect(parsed.success).toBe(false);if(parsed.success)return;
    const result=describeAgentFailure(parsed.error);
    expect(result.diagnostic.code).toBe("invalid_response");
    expect(JSON.stringify(result)).toContain("answer");
    expect(JSON.stringify(result)).not.toContain("private");
  });
  it("distinguishes output, references, connection and capacity failures",()=>{
    expect(describeAgentFailure(new SyntaxError("private-json-fragment")).diagnostic.code).toBe("invalid_json");
    expect(describeAgentFailure(new Error("Use clinical discussion language rather than treatment orders.")).diagnostic.code).toBe("clinical_output_rejected");
    expect(describeAgentFailure(new Error("The agent returned an invalid record citation.")).diagnostic.code).toBe("invalid_citation");
    expect(describeAgentFailure(new Error("Groq chat completion request failed.")).diagnostic.code).toBe("provider_connection");
    expect(describeAgentFailure(new LlmContextLimitError()).diagnostic.code).toBe("context_limit");
  });
  it("does not return arbitrary exceptions or thrown values",()=>{
    expect(JSON.stringify(describeAgentFailure(new Error("private-record-content")))).not.toContain("private");
    expect(describeAgentFailure("private-record-content").diagnostic.code).toBe("unexpected_failure");
  });
  it("reports a fixed clinical rule without including the rejected reply",()=>{
    const result=describeAgentFailure(new ClinicalProposalError("medication_order","private-generated-response"));
    expect(result.diagnostic).toEqual({code:"clinical_output_rejected",rule:"medication_order"});
    expect(JSON.stringify(result)).not.toContain("private");
    expect(result.message).not.toContain("Records only");
  });
  it.each([
    ["dosing","dosing instructions"],
    ["medication_order","medication orders"],
    ["unverified_recommendation","unsupported patient-specific"],
    ["missing_references","references"],
  ] as const)("explains the actual %s failure rather than telling users to avoid medicines",(reason,detail)=>{
    const failure=describeAgentFailure(new ClinicalProposalError(reason,"private rejected text"));
    expect(failure.message).toContain(detail);
    expect(failure.message).not.toContain("non-medication options");
    expect(JSON.stringify(failure)).not.toContain("private rejected");
  });
});
