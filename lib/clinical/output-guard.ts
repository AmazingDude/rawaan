import type { AgentResponse } from "@/lib/agent/schema";

export class ClinicalProposalError extends Error {
  constructor(public readonly reason: "dosing" | "medication_order" | "unverified_recommendation" | "missing_references", message: string) {
    super(message);
    this.name = "ClinicalProposalError";
  }
}

// This conservative check rejects dose instructions and treatment orders.
// It is a release guard, not a guarantee of clinical correctness.
export function assertClinicalProposal(output: { answer: string; clinical: AgentResponse["clinical"] }, clinical: boolean, medicationAllowed: boolean): void {
  const text = JSON.stringify(output);
  if (/\b\d+(?:\.\d+)?\s*(?:mg|mcg|µg|ug|ml|milligrams?|micrograms?|units?)\b/i.test(text) ||
      /\b(?:one|two|three|four|half|a|\d+)\s+(?:tablets?|capsules?|pills?|doses?|injections?)\b|\b(?:once|twice|three times)\s+(?:a\s+day|daily|weekly)\b/i.test(text) ||
      /(?:گولی|کیپسول|ملی گرام|ملی لیٹر|خوراک).{0,100}(?:لیں|دیں|روزانہ|صبح|شام)/.test(text) ||
      /(?:गोली|कैप्सूल|खुराक).{0,100}(?:लें|दिन|सुबह|शाम)/.test(text) ||
      /(?:روزانہ|خوراک|ملی گرام)\s*\d|\d\s*(?:ملی گرام|ملی لیٹر)/.test(text)) {
    throw new ClinicalProposalError("dosing", "The response contains treatment orders or dosing instructions.");
  }
  const behavioralTarget = /^\s*(?:(?:a|an|the|regular|daily|evening|morning|brief|structured|individual|group|guided|gentle)\s+)*(?:stress|anxiety|depression|distress|rumination|worry|avoidance|social|support|sleep|study|mood|symptom|diary|journal|log|notes|walk|walking|exercise|physical activity|breathing|relaxation|mindfulness|meditation|grounding|break|time|counselling|counseling|psychotherapy|therapy|CBT|CBT-I|DBT|ACT|EMDR|IPT|exposure|behavioral|behavioural|cognitive|screening|assessment|evaluation|monitoring|follow-up|follow up|referral|sessions?|appointments?|communication|coping|routine|activity|activities|caffeine|alcohol|screen time)\b/i;
  if (clinical || output.clinical) {
    // An action verb alone is not a medication order: "reduce stress", "begin
    // CBT" and "increase support" are valid clinician-facing plan language.
    const medicationTarget = /\b(?:medications?|medicines?|drugs?|tablets?|capsules?|pills?|doses?|injections?|antidepressants?|antibiotics?|antipsychotics?|sedatives?|insulin|sleep aids?|mood stabili[sz]ers?)\b/i;
    // Unknown directive targets are rewritten rather than assuming an unfamiliar
    // drug name is safe. These targets describe behavioral care and workflow.
    const medicationNames = output.clinical?.medication_options.map(option=>option.name.trim().toLowerCase()).filter(Boolean) ?? [];
    const passages = [output.answer, ...(output.clinical?.medication_options.map(option=>option.considerations) ?? []),
      ...(output.clinical?.differential.map(item=>item.rationale) ?? []), ...(output.clinical?.missing_information ?? []),
      ...(output.clinical?.plan?.goals ?? []), ...(output.clinical?.plan?.next_steps ?? []),
      ...(output.clinical?.plan?.monitoring ?? []), ...(output.clinical?.plan?.red_flags ?? []), output.clinical?.plan?.title ?? "", output.clinical?.plan?.follow_up ?? ""];
    for (const passage of passages) {
      for (const sentence of passage.split(/[.!?\n]+/)) {
        for (const action of sentence.matchAll(/\b(prescribe|administer|inject|titrate|taper|discontinue|start|stop|take|begin|resume|continue|increase|decrease|reduce|switch to|use)\b/gi)) {
          const prefix = sentence.slice(0, action.index);
          // "Substance use history" and "device use before bed" contain a
          // noun, not a directive. Direct or modal "use <drug>" still checks.
          if (/^use$/i.test(action[0]) && !/(?:^|[;:])\s*$|\b(?:can|could|may|might|should|must|would|please|to|and|then|but)\s*$/i.test(prefix)) continue;
          // Only an immediately preceding negation applies; it must not exempt
          // a later positive command ("do not stop X; start Y" or "but start Y").
          if (/\b(?:cannot|can['’]t|do not|don['’]t|must not|should not|never|not to)\s*(?:\w+ly\s+){0,2}$/i.test(prefix)) continue;
          const target = sentence.slice(action.index + action[0].length).split(/;|\b(?:but|then|and)\b/i)[0];
          if (/^(?:prescribe|administer|inject|titrate|taper|discontinue)$/i.test(action[0]) || medicationTarget.test(target) || medicationNames.some(name=>target.toLowerCase().includes(name)) || !behavioralTarget.test(target)) {
            throw new ClinicalProposalError("medication_order", "The response contains treatment orders.");
          }
        }
      }
    }
  }
  if (!medicationAllowed) {
    for (const match of text.matchAll(/([^.!?\n"]+)\s+would (?:be appropriate for|help) this (?:patient|client|person)\b/gi)) {
      if (!behavioralTarget.test(match[1])) throw new ClinicalProposalError("unverified_recommendation", "Unverified personalized treatment recommendations are not supported.");
    }
    if (/آپ کو.{0,40}(?:دوا|گولی)/i.test(text)) throw new ClinicalProposalError("unverified_recommendation", "Unverified personalized treatment recommendations are not supported.");
  }
  if (!medicationAllowed && output.clinical?.medication_options.length) {
    throw new ClinicalProposalError("missing_references", "Medication considerations require current cited references.");
  }
  if (output.clinical?.medication_options.some(option=>! /\[W[1-9][0-9]*\]/.test(option.considerations))) {
    throw new ClinicalProposalError("missing_references", "Medication considerations require current cited references.");
  }
}
