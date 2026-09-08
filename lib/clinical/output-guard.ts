import type { AgentResponse } from "@/lib/agent/schema";

export class ClinicalProposalError extends Error {
  constructor(public readonly reason: "dosing" | "medication_order" | "ambiguous_action" | "unverified_recommendation" | "missing_references", message: string) {
    super(message);
    this.name = "ClinicalProposalError";
  }
}

function describesDiscussionAction(verb: string, target: string): boolean {
  if (!/^(?:start|begin|continue|resume|use|take)$/i.test(verb)) return false;
  // Classify the clinician's activity, rather than whitelisting each topic
  // they might ask about. Medication review can itself be a discussion topic.
  return /^\s*(?:(?:by|with)\s+)?(?:asking|discussing|exploring|reviewing|checking|reflecting|clarifying|identifying|assessing|evaluating|planning|summari[sz]ing|listening|validating|revisiting|working|focusing|building|practi[cs]ing|addressing|considering|reassessing)\b/i.test(target) ||
    /^\s*(?:(?:by|with)\s+)?(?:(?:a|an|the|some)\s+)?(?:(?:brief|open-ended|curious|non-judgmental|collaborative|supportive|reflective|structured|focused|gentle|follow-up|respectful|patient-centred|patient-centered)[\s,]+)*(?:questions?|check-ins?|conversations?|discussions?|approach|reflection|feedback)\b/i.test(target);
}

function describesClinicalEffect(prefix: string, verb: string, target: string): boolean {
  if (!/^(?:increase|decrease|reduce)$/i.test(verb)) return false;
  const clause = prefix.split(/[;:]|\bthen\b/i).at(-1) ?? "";
  const modal = /\b(?:may|can|could|might|that|which)(?:\s+(?:also|sometimes|often|potentially|further))?\s*$/i.exec(clause);
  if (!modal) {
    // A second descriptive predicate can inherit its subject and modal:
    // "Sedatives can increase fall risk and reduce alertness."
    const coordinated = /^(.*)\b(increase|decrease|reduce)\b(.*?)\s+\b(?:and|but)\s*$/i.exec(clause);
    if (!coordinated || !describesClinicalEffect(coordinated[1], coordinated[2], coordinated[3])) return false;
  }
  const subject = modal ? clause.slice(0, modal.index).trim() : clause.trim();
  if (!subject || /\b(?:you|patient|client|should|must|please|recommend|advise|instruct|tell|ask)\b/i.test(subject)) return false;
  const effect = /^\s*(?:(?:the|a|an)\s+)?(?:fall risk|falls|risk|likelihood|chance|incidence|severity|dependence(?: risk)?|dependency|tolerance|alertness|sedation|drowsiness|impairment|next-day impairment|daytime sleepiness|respiratory depression|sleep latency)\b(?!-)(.*)$/i.exec(target);
  if (!effect) return false;
  const explanation = effect[1].trim();
  // The object must be an effect, not a drug described by an effect adjective
  // ("sedation medications"). Medicines in an interaction warning are allowed.
  return !explanation || /^(?:[,([]|(?:of|in|with|when|during|among|for|due to|because|especially|particularly|requires? (?:review|assessment|monitoring))\b)/i.test(explanation);
}

// This conservative check rejects dose instructions and treatment orders.
// It is a release guard, not a guarantee of clinical correctness.
export function assertClinicalProposal(output: { answer: string; clinical: AgentResponse["clinical"] }, clinical: boolean, medicationAllowed: boolean, nonMedicationActionsReviewed = false): void {
  const text = JSON.stringify(output);
  if (/\b\d+(?:\.\d+)?\s*(?:mg|mcg|µg|ug|ml|milligrams?|micrograms?|units?)\b/i.test(text) ||
      /\b(?:one|two|three|four|half|a|\d+)\s+(?:tablets?|capsules?|pills?|doses?|injections?)\b|\b(?:once|twice|three times)\s+(?:a\s+day|daily|weekly)\b/i.test(text) ||
      /(?:گولی|کیپسول|ملی گرام|ملی لیٹر|خوراک).{0,100}(?:لیں|دیں|روزانہ|صبح|شام)/.test(text) ||
      /(?:गोली|कैप्सूल|खुराक).{0,100}(?:लें|दिन|सुबह|शाम)/.test(text) ||
      /(?:روزانہ|خوراک|ملی گرام)\s*\d|\d\s*(?:ملی گرام|ملی لیٹر)/.test(text)) {
    throw new ClinicalProposalError("dosing", "The response contains treatment orders or dosing instructions.");
  }
  const behavioralTarget = /^\s*(?:(?:a|an|the|regular|daily|evening|morning|brief|structured|individual|group|guided|gentle|pre-sleep|daytime|functional)\s+)*(?:stress|anxiety|depression|distress|rumination|worry|avoidance|arousal|impairment|social|support|sleep|study|mood|symptom|diary|journal|log|notes|walk|walking|exercise|physical activity|breathing|relaxation|mindfulness|meditation|grounding|break|time|counselling|counseling|psychotherapy|therapy|CBT|CBT-I|DBT|ACT|EMDR|IPT|exposure|behavioral|behavioural|cognitive|screening|assessment|evaluation|monitoring|follow-up|follow up|referral|sessions?|appointments?|communication|coping|routine|activity|activities|caffeine|alcohol|screen time)\b/i;
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
          const afterAction = sentence.slice(action.index + action[0].length);
          // "Use of a sedative can increase fall risk" is a noun phrase plus
          // an effect statement. Later verbs in the sentence are still checked.
          if (/^use$/i.test(action[0]) && /^\s+of\b/i.test(afterAction) && /\b(?:can|may|could|might)(?:\s+(?:also|sometimes|often|potentially|further))?\s+(?:increase|decrease|reduce)\b/i.test(afterAction)) continue;
          // "Substance use history" and "device use before bed" contain a
          // noun, not a directive. Direct or modal "use <drug>" still checks.
          if (/^use$/i.test(action[0]) && !/(?:^|[;:])\s*$|\b(?:can|could|may|might|should|must|would|please|to|and|then|but)\s*$/i.test(prefix)) continue;
          // Only an immediately preceding negation applies; it must not exempt
          // a later positive command ("do not stop X; start Y" or "but start Y").
          if (/\b(?:cannot|can['’]t|do not|don['’]t|must not|should not|never|not to)\s*(?:\w+ly\s+){0,2}$/i.test(prefix)) continue;
          const target = afterAction.split(/;|\b(?:but|then|and)\b/i)[0];
          const targetsMedication = medicationTarget.test(target) || medicationNames.some(name=>target.toLowerCase().includes(name));
          // "Reduce sleep latency by taking <drug>" still directs treatment;
          // checking its gerund target also retains "by using CBT" as allowed.
          const means = /\b(?:by|through|via)\s+(?:(?:gradually|slowly)\s+)?(prescrib\w*|administer\w*|inject\w*|titrat\w*|taper\w*|discontinu\w*|start\w*|stop\w*|tak\w*|begin\w*|resum\w*|continu\w*|increas\w*|decreas\w*|reduc\w*|switch\w*|us(?:e|ing))\s+(.*)/i.exec(target);
          // A mechanism can link two effects without directing a drug change:
          // "may increase fall risk by reducing alertness".
          if (means && /^(?:increas|decreas|reduc)/i.test(means[1]) && describesClinicalEffect(prefix, action[0], target.slice(0, means.index)) && describesClinicalEffect(prefix, action[0], means[2])) continue;
          if (means && (medicationTarget.test(means[2]) || medicationNames.some(name=>means[2].toLowerCase().includes(name)))) {
            throw new ClinicalProposalError("medication_order", "The response contains treatment orders.");
          }
          if (means && !behavioralTarget.test(means[2]) && !nonMedicationActionsReviewed) {
            throw new ClinicalProposalError("ambiguous_action", "Unclear whether this action describes medication orders or a non-medication activity.");
          }
          if (describesDiscussionAction(action[0], target)) {
            // A discussion prefix must not exempt later drug instructions.
            // Keep this additional scan within the newly allowed discussion
            // syntax; ordinary behavioral context retains its existing rules.
            for (const embedded of target.matchAll(/\b(?:by|through|via|before|after)\s+(?:(?:gradually|slowly)\s+)?(prescrib\w*|administer\w*|inject\w*|titrat\w*|taper\w*|discontinu\w*|start\w*|stop\w*|tak\w*|giv\w*|begin\w*|resum\w*|continu\w*|increas\w*|decreas\w*|reduc\w*|switch\w*|us(?:e|ing))\s+(.*)/gi)) {
              if (medicationTarget.test(embedded[2]) || medicationNames.some(name=>embedded[2].toLowerCase().includes(name))) {
                throw new ClinicalProposalError("medication_order", "The response contains treatment orders.");
              }
              if (!behavioralTarget.test(embedded[2]) && !nonMedicationActionsReviewed) {
                throw new ClinicalProposalError("ambiguous_action", "Unclear whether this action describes medication orders or a non-medication activity.");
              }
            }
            continue;
          }
          if (!targetsMedication && /^reduce$/i.test(action[0]) && /^\s+reliance on pharmacological interventions\s*$/i.test(target)) continue;
          if (describesClinicalEffect(prefix, action[0], target)) continue;
          if (targetsMedication) {
            throw new ClinicalProposalError("medication_order", "The response contains treatment orders.");
          }
          if (!behavioralTarget.test(target) && !nonMedicationActionsReviewed) {
            throw new ClinicalProposalError("ambiguous_action", "Unclear whether this action describes medication orders or a non-medication activity.");
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
