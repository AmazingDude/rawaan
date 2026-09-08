import { describe, expect, it } from "vitest";

import { classifyQuerySafety } from "@/lib/brain/query-safety";

describe("classifyQuerySafety", () => {
  it("classifies treatment recommendations as refused", () => {
    const result = classifyQuerySafety("What medication should we prescribe?");
    expect(result).toMatchObject({ kind: "refused", reason: "treatment_or_medication" });
  });

  it("classifies general medical knowledge as refused even when a patient is open", () => {
    const result = classifyQuerySafety("What is the standard treatment for migraine?");
    expect(result).toMatchObject({ kind: "refused", reason: "general_medical" });
  });

  it("classifies a first-line question as general medical", () => {
    const result = classifyQuerySafety("What is the first-line drug for hypertension?");
    expect(result).toMatchObject({ kind: "refused", reason: "general_medical" });
  });

  it("passes record questions through with a trimmed normalized question", () => {
    const result = classifyQuerySafety("  Has this patient mentioned chest pain before?  ");
    expect(result).toEqual({
      kind: "record_query",
      normalizedQuestion: "Has this patient mentioned chest pain before?",
    });
  });

  it("passes a follow-up history question through as a record query", () => {
    const result = classifyQuerySafety("Did her knee swelling come up in the last session?");
    expect(result).toEqual({
      kind: "record_query",
      normalizedQuestion: "Did her knee swelling come up in the last session?",
    });
  });

  it("treats documented side-effect history as a record query", () => {
    expect(classifyQuerySafety("Were any side effects documented?")).toEqual({
      kind: "record_query",
      normalizedQuestion: "Were any side effects documented?",
    });
  });

  it("continues refusing general side-effect questions", () => {
    expect(classifyQuerySafety("What are common side effects?")).toMatchObject({
      kind: "refused",
      reason: "general_medical",
    });
  });
});
