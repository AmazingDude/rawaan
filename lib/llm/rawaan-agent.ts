import { z } from "zod";
import { containsSensitiveSearchData } from "@/lib/tools/search-privacy";
import { clinicalSearchQuery } from "@/lib/clinical/search-topics";
import { assertClinicalProposal, ClinicalProposalError } from "@/lib/clinical/output-guard";
import { agentResponseSchema, type AgentResponse, type AgentSource } from "@/lib/agent/schema";
import type { ClinicalContext } from "@/lib/clinical/schema";
import type { ApprovedNote } from "@/lib/notes/schema";
import type { LlmCompletionProvider } from "@/lib/llm/provider";
import { DEFAULT_AGENT_OUTPUT_TOKENS } from "@/lib/llm/agent-budget";
import { RAWAAN_AGENT_PLANNER_PROMPT, RAWAAN_AGENT_ANSWER_PROMPT, RAWAAN_AGENT_ACTION_REVIEW_PROMPT, RAWAAN_MEDICAL_SCOPE_REDIRECT } from "@/lib/llm/prompts/rawaan-agent";
import type { WebSearchTool, WebResult } from "@/lib/tools/web-search";

const plannerSchema = z.object({ in_scope: z.boolean(), clinical: z.boolean(), needs_search: z.boolean(), search_query: z.string().max(400) }).strict();
const answerSchema = z.object({
  answer: z.string().min(1).max(20000),
  note_source_indices: z.array(z.number().int().nonnegative()),
  web_source_indices: z.array(z.number().int().nonnegative()).max(5),
  clinical: agentResponseSchema.shape.clinical,
}).strict();
export type AgentTurn = { question: string; answer: string };
export type AgentInput = { question: string; notes: ApprovedNote[]; activeNoteId?: string; context?: ClinicalContext; privateIdentifiers?: string[]; history: AgentTurn[]; webEnabled: boolean; outputTokenBudget?: number };
const clinicalQuestionPattern = /diagnos|medicine|medication|prescrib|treatment|dosage|differential|دوا|علاج|تشخیص/i;

function parseJson(text: string): unknown {
  return JSON.parse(text.trim().replace(/^\x60\x60\x60(?:json)?\s*/i, "").replace(/\s*\x60\x60\x60$/, ""));
}

function reconcileCitations(output: z.infer<typeof answerSchema>, notes: ApprovedNote[], results: WebResult[]): void {
  const text = JSON.stringify({answer: output.answer, clinical: output.clinical});
  if (/https?:\/\//i.test(text)) throw new Error("Use only verified source links.");
  // The two arrays duplicate inline labels. Add only real envelope positions.
  for (const match of text.matchAll(/\[([a-zA-Z]*[0-9]+)\]/g)) {
    const label = match[1];
    if (!/^[NW][1-9][0-9]*$/.test(label)) throw new Error("The response contains an unsupported citation.");
    const index = Number(label.slice(1)) - 1;
    if (label[0] === "N" ? !notes[index] : !results[index]) throw new Error("The response contains an unsupported citation.");
    (label[0] === "N" ? output.note_source_indices : output.web_source_indices).push(index);
  }
  output.note_source_indices = [...new Set(output.note_source_indices)];
  output.web_source_indices = [...new Set(output.web_source_indices)];
  if (output.note_source_indices.some(index=>!notes[index])) throw new Error("The agent returned an invalid record citation.");
  if (output.web_source_indices.some(index=>!results[index])) throw new Error("The agent returned an invalid web citation.");
}

export function redactSearchText(text: string, notes: ApprovedNote[], privateIdentifiers: string[] = []): string {
  const identities = [...privateIdentifiers, ...notes.flatMap(note => [
    note.patient_id, note.patient_display_name, note.first_name, note.last_name, note.email, note.mobile_number,
    ...note.patient_display_name.split(/\s+/).filter(part => part.length > 2),
  ])].filter((value): value is string => Boolean(value));
  let cleaned = text;
  for (const identity of [...new Set(identities)].sort((a, b) => b.length - a.length)) {
    const escaped = identity.replace(/[.*+?^$\{\}()|[\]\\]/g, "\\$&");
    cleaned = cleaned.replace(new RegExp(escaped, "gi"), "[private]");
  }
  return cleaned.replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, "[private]")
    .replace(/\+?\d[\d\s().-]{7,}\d/g, "[private]");
}

export async function runRawaanAgent(input: AgentInput, provider: LlmCompletionProvider, search?: WebSearchTool): Promise<AgentResponse> {
  // Optional details supplement the record. Blank form defaults are not evidence
  // that a fact is absent from the client's saved sessions.
  const context = Object.fromEntries(Object.entries(input.context ?? {}).filter(([key,value]) =>
    key !== "confirmed_at" && key !== "medication_context_confirmed" && value !== null && value !== ""));
  const notes = [...input.notes].sort((a,b) => b.consultation_date.localeCompare(a.consultation_date) || a.id.localeCompare(b.id));
  const question = input.question.trim();
  const outputTokenBudget = input.outputTokenBudget ?? DEFAULT_AGENT_OUTPUT_TOKENS;
  const plan = plannerSchema.parse(parseJson(await provider.complete({
    maxTokens: 128,
    system: RAWAAN_AGENT_PLANNER_PROMPT,
    user: JSON.stringify({
      question: redactSearchText(question, input.notes, input.privateIdentifiers),
      recent_questions: input.history.slice(-2).map(turn => redactSearchText(turn.question.slice(0,500), input.notes, input.privateIdentifiers)),
      anonymous_symptoms: notes.map(note => redactSearchText([note.chief_complaint, ...note.symptoms].join("; ").slice(0,1000), input.notes)),
      current_date: new Date().toISOString().slice(0,10),
    }),
  })));
  if (!plan.in_scope) return agentResponseSchema.parse({
    status:"agent",answer:RAWAAN_MEDICAL_SCOPE_REDIRECT,category:"general",sources:[],notice:null,clinical:null,
  });
  const clinical = plan.clinical || clinicalQuestionPattern.test(question);
  const needsSearch = plan.needs_search || clinical;
  let results: WebResult[] = [];
  let notice: string | null = null;
  if (needsSearch) {
    if (!input.webEnabled) notice = "Web search is off; this response has no verified current web sources.";
    else if (!search) notice = "Web search is not configured; this response has no verified current web sources.";
    else {
      const clinicalSearch = clinical || containsSensitiveSearchData(question) || containsSensitiveSearchData(plan.search_query);
      const query = clinicalSearch ? clinicalSearchQuery(plan.search_query) : redactSearchText(plan.search_query, input.notes, input.privateIdentifiers).replaceAll("[private]", "").trim();
      if (!query) notice = "No suitable anonymous search query was available.";
      else {
        try { results = await search.search(query, clinicalSearch); if (!results.length) notice = "No suitable web references were found."; }
        catch { notice = "Web search is temporarily unavailable. Current web information could not be verified."; }
      }
    }
  }
  const allowMedications = clinical && results.length > 0;
  const recordData = notes.map(note => ({
    date: note.consultation_date, patient_display_name: note.patient_display_name,
    summary: note.summary, chief_complaint: note.chief_complaint,
    history: note.history, symptoms: note.symptoms, assessment_discussed: note.assessment_discussed,
    plan_discussed: note.plan_discussed, medications_mentioned: note.medications_mentioned,
    follow_up: note.follow_up, uncertainties: note.uncertainties,
    raw_transcript: note.raw_transcript, session_info: note.session_info, approved_at: note.approved_at,
  }));
  const answerRequest = {
    maxTokens: outputTokenBudget,
    system: RAWAAN_AGENT_ANSWER_PROMPT,
    user: JSON.stringify({
      question, response_token_budget: outputTokenBudget, conversation: input.history.slice(-8).map(turn => ({question:turn.question.slice(0,2000),answer:turn.answer.slice(0,3000)})),
      patient_selected: input.notes.length > 0 || Boolean(input.context), approved_notes: recordData,
      clinical_context: context, web_results: results, tool_notice: notice,
      clinical_context_confirmed_at: input.context?.confirmed_at ?? null,
      allow_medication_options: allowMedications,
      active_session_note_index: input.activeNoteId ? notes.findIndex(note=>note.id===input.activeNoteId) : null,
      approved_note_count: notes.length, current_date: new Date().toISOString().slice(0,10),
    }),
  };
  let output = answerSchema.parse(parseJson(await provider.complete(answerRequest)));
  reconcileCitations(output, notes, results);
  let actionReviewUsed = false;
  async function validateProposal(candidate: z.infer<typeof answerSchema>): Promise<void> {
    const medicationAllowed = allowMedications && candidate.web_source_indices.length > 0;
    try { assertClinicalProposal(candidate, clinical, medicationAllowed); }
    catch (error) {
      if (!(error instanceof ClinicalProposalError) || error.reason !== "ambiguous_action" || actionReviewUsed) throw error;
      actionReviewUsed = true;
      const review = z.object({has_medication_orders:z.boolean()}).strict().parse(parseJson(await provider.complete({
        maxTokens:96, system:RAWAAN_AGENT_ACTION_REVIEW_PROMPT,
        user:JSON.stringify({answer:candidate.answer,clinical:candidate.clinical}),
      })));
      if (review.has_medication_orders) throw new ClinicalProposalError("medication_order", "The response contains treatment orders.");
      // The review exempts only unknown action wording in this exact draft.
      // Run the entire guard again: doses, explicit orders and references still apply.
      assertClinicalProposal(candidate, clinical, medicationAllowed, true);
    }
  }
  try {
    await validateProposal(output);
  } catch (error) {
    if (!(error instanceof ClinicalProposalError)) throw error;
    // One bounded rewrite uses the same complete record and fetched references.
    // The rejected text is not promoted into evidence or persisted to history.
    const repairRequest = JSON.parse(answerRequest.user);
    output = answerSchema.parse(parseJson(await provider.complete({
      maxTokens: outputTokenBudget,
      system: RAWAAN_AGENT_ANSWER_PROMPT,
      user: JSON.stringify({...repairRequest, previous_output: output, revision_required: error.message,
        revision_instruction: "Rewrite the reply as a substantive clinician discussion. Remove medication orders and doses; retain useful supported clinical options, non-medication interventions and the proposed plan. Phrase non-medication follow-up steps as topics to Discuss, Review or Explore. Include medications only with current supporting web references. Never invent or change patient facts or source positions."}),
    })));
    reconcileCitations(output, notes, results);
    await validateProposal(output);
  }
  const sources: AgentSource[] = [];
  for (const index of [...new Set(output.note_source_indices)]) {
    const note = notes[index]; if (!note) throw new Error("The agent returned an invalid record citation.");
    sources.push({kind:"note",citation:"N"+(index+1),noteId:note.id,consultationDate:note.consultation_date});
  }
  for (const index of [...new Set(output.web_source_indices)]) {
    const result = results[index]; if (!result) throw new Error("The agent returned an invalid web citation.");
    sources.push({kind:"web",citation:"W"+(index+1),title:result.title,url:result.url,accessedAt:new Date().toISOString()});
  }
  const clinicalResult = output.clinical;
  if (clinicalResult) {
    if (!allowMedications || !output.web_source_indices.length) clinicalResult.medication_options = [];
  }
  return agentResponseSchema.parse({
    status:"agent", answer:output.answer, category:clinical||output.clinical?"clinical":"general", sources, notice,
    clinical:clinicalResult,
  });
}
