/**
 * Task 3 — Stateless Brain chat client-state contract.
 *
 * These tests define the pure, browser-independent state machine that
 * app/components/brain-chat.tsx drives. They were written RED first.
 *
 * Hard rules enforced here:
 *  - Stateless per turn: every query calls the Server Action with exactly
 *    (patientId, question). No prior question, answer, excerpt, citation, or
 *    timestamp is ever passed to the pipeline (isolation regression test).
 *  - Distinct render states: supported / no_supporting_record / refused /
 *    action-level error are preserved verbatim on the entry.
 *  - "New chat" clears only in-memory entries; it never touches the patient
 *    selection or any persisted data.
 *  - Changing patient resets the thread so a prior patient's conversation can
 *    never leak into the next patient's context.
 */

import { describe, expect, it } from "vitest";

import { classifyQuerySafety } from "@/lib/brain/query-safety";
import type { BrainResponse } from "@/lib/brain/types";

import {
  brainChatReducer,
  initialBrainChatState,
  runBrainChatQuery,
  type BrainChatEntry,
  type BrainChatState,
  type ChatQueryResult,
} from "@/app/components/brain-chat-state";
import { BRAIN_QUICK_ACTIONS } from "@/app/components/brain-quick-actions";

// ---------------------------------------------------------------------------
// Reducer: pure client-state transitions
// ---------------------------------------------------------------------------

describe("brainChatReducer", () => {
  it("starts with no patient, no entries, and not submitting", () => {
    expect(initialBrainChatState).toEqual({
      patientId: "",
      entries: [],
      draftQuestion: "",
      isSubmitting: false,
    });
  });

  it("selectPatient sets the patient and clears any prior thread and draft", () => {
    const withThread: BrainChatState = {
      ...initialBrainChatState,
      patientId: "p-old",
      draftQuestion: "question typed for the old patient",
      entries: [
        {
          question: "old question",
          response: { status: "error", message: "x" },
          timestamp: "2026-08-28T00:00:00.000Z",
        },
      ],
    };

    const next = brainChatReducer(withThread, {
      type: "select-patient",
      patientId: "p-new",
    });

    expect(next.patientId).toBe("p-new");
    expect(next.entries).toEqual([]);
    expect(next.draftQuestion).toBe("");
    expect(next.isSubmitting).toBe(false);
  });

  it("setDraft updates the draft question", () => {
    const next = brainChatReducer(initialBrainChatState, {
      type: "set-draft",
      text: "Has she mentioned chest pain?",
    });
    expect(next.draftQuestion).toBe("Has she mentioned chest pain?");
  });

  it("submitStart flags submitting and blocks duplicate submission", () => {
    const submitting = brainChatReducer(initialBrainChatState, {
      type: "submit-start",
    });
    expect(submitting.isSubmitting).toBe(true);
  });

  it("appendEntry appends a timestamped entry and clears draft + submitting", () => {
    const entry: BrainChatEntry = {
      question: "q",
      response: { status: "error", message: "m" },
      timestamp: "2026-08-28T00:00:00.000Z",
    };
    const started: BrainChatState = {
      ...initialBrainChatState,
      patientId: "p1",
      draftQuestion: "q",
      isSubmitting: true,
    };

    const next = brainChatReducer(started, { type: "append-entry", entry });

    expect(next.entries).toEqual([entry]);
    expect(next.draftQuestion).toBe("");
    expect(next.isSubmitting).toBe(false);
  });

  it("loadThread replaces entries with the loaded thread and clears draft/submitting", () => {
    const loaded: BrainChatEntry[] = [
      {
        question: "old q",
        response: { status: "error", message: "m" },
        timestamp: "2026-09-01T09:00:00.000Z",
      },
    ];
    const busy: BrainChatState = {
      ...initialBrainChatState,
      patientId: "p1",
      draftQuestion: "half-typed",
      isSubmitting: true,
    };

    const next = brainChatReducer(busy, { type: "load-thread", entries: loaded });

    expect(next.entries).toEqual(loaded);
    expect(next.draftQuestion).toBe("");
    expect(next.isSubmitting).toBe(false);
    expect(next.patientId).toBe("p1");
  });

  it("select-patient after load-thread still wipes entries (no cross-patient leak)", () => {
    const loaded = brainChatReducer(
      { ...initialBrainChatState, patientId: "p1" },
      {
        type: "load-thread",
        entries: [
          {
            question: "p1 history",
            response: { status: "error", message: "m" },
            timestamp: "2026-09-01T09:00:00.000Z",
          },
        ],
      },
    );

    const switched = brainChatReducer(loaded, {
      type: "select-patient",
      patientId: "p2",
    });

    expect(switched.entries).toEqual([]);
    expect(switched.patientId).toBe("p2");
  });

  it("newChat clears only in-memory entries and draft, keeping the patient", () => {
    const withThread: BrainChatState = {
      patientId: "p1",
      entries: [
        {
          question: "q",
          response: { status: "error", message: "m" },
          timestamp: "2026-08-28T00:00:00.000Z",
        },
      ],
      draftQuestion: "leftover",
      isSubmitting: false,
    };

    const next = brainChatReducer(withThread, { type: "new-chat" });

    expect(next.entries).toEqual([]);
    expect(next.draftQuestion).toBe("");
    expect(next.patientId).toBe("p1");
  });
});

// ---------------------------------------------------------------------------
// runBrainChatQuery: maps the Server Action result onto a chat entry
// ---------------------------------------------------------------------------

const NOW = "2026-08-28T12:00:00.000Z";

function ok(response: BrainResponse): ChatQueryResult {
  return { ok: true, response };
}

describe("runBrainChatQuery", () => {
  it("maps a supported response verbatim with the returned sources", async () => {
    const supported: BrainResponse = {
      status: "supported",
      answer: "Chest pain was documented.",
      sources: [{ noteId: "note-chest", consultationDate: "2026-06-01" }],
    };
    const entry = await runBrainChatQuery({
      patientId: "p1",
      question: "Has she mentioned chest pain?",
      query: async () => ok(supported),
      now: () => NOW,
    });

    expect(entry).toEqual({
      question: "Has she mentioned chest pain?",
      response: supported,
      timestamp: NOW,
    });
  });

  it("maps a no_supporting_record response verbatim", async () => {
    const noRecord: BrainResponse = {
      status: "no_supporting_record",
      reason: "no_relevant_evidence",
      message: "No record of that for this patient.",
    };
    const entry = await runBrainChatQuery({
      patientId: "p1",
      question: "What was her blood pressure?",
      query: async () => ok(noRecord),
      now: () => NOW,
    });
    expect(entry.response).toEqual(noRecord);
  });

  it("maps a refused response verbatim", async () => {
    const refused: BrainResponse = {
      status: "refused",
      reason: "treatment_or_medication",
      message:
        "This tool only retrieves documented patient history and does not provide general medical or treatment advice.",
    };
    const entry = await runBrainChatQuery({
      patientId: "p1",
      question: "What medication should we prescribe?",
      query: async () => ok(refused),
      now: () => NOW,
    });
    expect(entry.response).toEqual(refused);
  });

  it("maps an action-level failure to a safe error entry", async () => {
    const entry = await runBrainChatQuery({
      patientId: "p1",
      question: "q",
      query: async () => ({
        ok: false,
        message: "The Brain could not answer right now. Try again.",
      }),
      now: () => NOW,
    });
    expect(entry.response).toEqual({
      status: "error",
      message: "The Brain could not answer right now. Try again.",
    });
  });
});

// ---------------------------------------------------------------------------
// Isolation regression — the hard stateless-per-turn rule
//
// Submit three turns where early turns are refused / no-record and a later
// turn is supported. The injected query spy must receive ONLY
// (patientId, question) on every call — never prior questions, answers,
// excerpts, citations, or timestamps.
// ---------------------------------------------------------------------------

describe("stateless-per-turn isolation", () => {
  it("passes only (patientId, question) to the action on every turn", async () => {
    const calls: Array<[string, string]> = [];
    const refused: BrainResponse = {
      status: "refused",
      reason: "general_medical",
      message:
        "This tool only retrieves documented patient history and does not provide general medical or treatment advice.",
    };
    const noRecord: BrainResponse = {
      status: "no_supporting_record",
      reason: "no_relevant_evidence",
      message: "No record of that for this patient.",
    };
    const supported: BrainResponse = {
      status: "supported",
      answer: "Yes — documented.",
      sources: [{ noteId: "n1", consultationDate: "2026-06-01" }],
    };

    const spy = async (patientId: string, question: string): Promise<ChatQueryResult> => {
      calls.push([patientId, question]);
      if (question.includes("medication")) return ok(refused);
      if (question.includes("blood pressure")) return ok(noRecord);
      return ok(supported);
    };

    const q1 = "What medication should we prescribe?";
    const q2 = "What was her blood pressure in March?";
    const q3 = "Has she mentioned chest pain?";

    await runBrainChatQuery({ patientId: "p1", question: q1, query: spy, now: () => NOW });
    await runBrainChatQuery({ patientId: "p1", question: q2, query: spy, now: () => NOW });
    await runBrainChatQuery({ patientId: "p1", question: q3, query: spy, now: () => NOW });

    // Exactly one call per turn, each with only the two scalar args.
    expect(calls).toEqual([
      ["p1", q1],
      ["p1", q2],
      ["p1", q3],
    ]);

    // The later supported turn must not carry any earlier content.
    const [, , third] = calls;
    expect(third).toEqual(["p1", q3]);
    const serialized = JSON.stringify(third);
    expect(serialized).not.toContain("medication");
    expect(serialized).not.toContain("blood pressure");
    expect(serialized).not.toContain("documented");
  });
});

// ---------------------------------------------------------------------------
// Task 4 — Fixed retrieval-only quick-action chips
// ---------------------------------------------------------------------------

describe("BRAIN_QUICK_ACTIONS", () => {
  it("contains exactly the three approved retrieval-only templates", () => {
    expect(BRAIN_QUICK_ACTIONS).toEqual([
      {
        id: "documented-plan",
        label: "Recall documented plan",
        question: "What plan was discussed in the documented visits?",
      },
      {
        id: "reported-symptoms",
        label: "Summarize reported symptoms",
        question: "What symptoms were reported in the documented visits?",
      },
      {
        id: "follow-up",
        label: "Recall follow-up",
        question: "What follow-up was documented for this patient?",
      },
    ]);
  });

  it("every chip question is a record query, never a refusal", () => {
    for (const action of BRAIN_QUICK_ACTIONS) {
      expect(classifyQuerySafety(action.question)).toMatchObject({
        kind: "record_query",
      });
    }
  });

  it("a chip submits only its exact reviewed question through the same path", async () => {
    const calls: Array<[string, string]> = [];
    const spy = async (patientId: string, question: string): Promise<ChatQueryResult> => {
      calls.push([patientId, question]);
      return {
        ok: true,
        response: {
          status: "no_supporting_record",
          reason: "no_relevant_evidence",
          message: "No record of that for this patient.",
        },
      };
    };

    for (const action of BRAIN_QUICK_ACTIONS) {
      await runBrainChatQuery({
        patientId: "p1",
        question: action.question,
        query: spy,
        now: () => NOW,
      });
    }

    expect(calls).toEqual([
      ["p1", BRAIN_QUICK_ACTIONS[0].question],
      ["p1", BRAIN_QUICK_ACTIONS[1].question],
      ["p1", BRAIN_QUICK_ACTIONS[2].question],
    ]);
  });

  it("a chip no-record result does not alter the next manual turn", () => {
    const chipEntry: BrainChatEntry = {
      question: BRAIN_QUICK_ACTIONS[0].question,
      response: {
        status: "no_supporting_record",
        reason: "no_relevant_evidence",
        message: "No record of that for this patient.",
      },
      timestamp: NOW,
    };
    const manualEntry: BrainChatEntry = {
      question: "Has she mentioned chest pain?",
      response: {
        status: "supported",
        answer: "Yes — documented.",
        sources: [{ noteId: "n1", consultationDate: "2026-06-01" }],
      },
      timestamp: NOW,
    };

    let state = brainChatReducer(initialBrainChatState, {
      type: "append-entry",
      entry: chipEntry,
    });
    state = brainChatReducer(state, { type: "append-entry", entry: manualEntry });

    // Both entries remain verbatim and independent.
    expect(state.entries).toEqual([chipEntry, manualEntry]);
    expect(state.entries[1].response).toEqual(manualEntry.response);
  });
});
