import { describe, expect, it } from "vitest";
import fixture from "@/data/seed/clinical-guard-cases.json";
import { assertClinicalProposal } from "@/lib/clinical/output-guard";
import type { AgentResponse } from "@/lib/agent/schema";

const clinical: NonNullable<AgentResponse["clinical"]> = { differential: [], medication_options: [], missing_information: [], plan: null };

describe("clinical effects versus medication orders", () => {
  it.each(fixture.allowed)("allows medical discussion: %s", answer => {
    expect(() => assertClinicalProposal({ answer, clinical: null }, true, false)).not.toThrow();
  });
  it.each(fixture.blocked)("still rejects an instruction, including after a warning: %s", answer => {
    expect(() => assertClinicalProposal({ answer, clinical }, true, true)).toThrow();
  });
  it("checks medication considerations, differentials and plan goals without treating warnings as orders", () => {
    const output = { answer: "Referenced options for discussion [W1].", clinical: {
      ...clinical,
      differential: [{ condition: "Training condition", rationale: fixture.allowed[0] }],
      medication_options: [{ name: "Training option", considerations: `${fixture.allowed[1]} [W1].` }],
      missing_information: [fixture.allowed[4]],
      plan: { title: "Discussion plan", goals: [fixture.allowed[7]], next_steps: [fixture.allowed[2]], monitoring: [fixture.allowed[3]], follow_up: fixture.allowed[8], red_flags: [fixture.allowed[6]] },
    } };
    expect(() => assertClinicalProposal(output, true, true)).not.toThrow();
    output.clinical.plan.next_steps.push("Start zolpidem.");
    expect(() => assertClinicalProposal(output, true, true)).toThrow(/orders/);
  });
  it("still requires medication references when discussion wording is acceptable", () => {
    const output = { answer: fixture.allowed[0], clinical: { ...clinical, medication_options: [{ name: "Training option", considerations: fixture.allowed[1] }] } };
    expect(() => assertClinicalProposal(output, true, true)).toThrow(/references/);
    expect(() => assertClinicalProposal(output, true, false)).toThrow(/references/);
  });
});
