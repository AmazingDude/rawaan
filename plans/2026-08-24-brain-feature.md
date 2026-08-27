# Brain Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Brain: a clinician asks a natural-language question about one selected patient and gets an answer generated strictly from that patient's approved notes — citing source-note dates, saying exactly "No record of that for this patient." when evidence is absent, and refusing general-medical/treatment questions without ever calling the LLM.

**Architecture:** A typed server-side pipeline inside the existing Next.js App Router app: deterministic query-safety classification → patient-isolated retrieval over approved notes → grounded LLM answer generation only when sufficient evidence exists. Retrieval (Rehan) and answer generation (Aashir) are separate modules joined by the `RetrievalResult` contract already defined in `plans/2026-08-22-brain-retrieval.md`. The UI (Dev2) consumes only a typed Server Action result and never imports Brain internals.

**Tech Stack:** Next.js 16 App Router + TypeScript strict (existing), Zod 4 (existing), Vitest (existing), Playwright (existing). New: zero npm dependencies. LLM access via plain `fetch` against Groq's OpenAI-compatible Chat Completions endpoint using the existing server-only `GROQ_API_KEY` — no SDK, no vector database, no new storage engine.

**Spec:** `PRD.md` §7.2 (Brain functional requirements), §8.1 (stack), §8.3 (data model + approval gate), §8.5 (recall prompt + isolation rule), §8.6 (adversarial cases), §8.7 (fallbacks), §11 (success criteria). Extends `plans/2026-08-22-brain-retrieval.md` — that plan stays authoritative for the Rehan/Aashir ownership split and commit messages of Tasks 1–4 here.

---

## Technology Decisions (and why)

| Decision | Choice | Why |
|---|---|---|
| LLM access | Groq OpenAI-compatible Chat Completions via plain `fetch`; primary model `openai/gpt-oss-120b`, with `llama-3.3-70b-versatile` as the documented fallback candidate | Reuses the proven Groq integration and the existing server-only `GROQ_API_KEY`; zero new dependencies; the one-method provider interface remains easy to fake in tests. |
| Provider selection | Reuse `GROQ_API_KEY` from `.env.local`; optional `LLM_MODEL` overrides the default `openai/gpt-oss-120b` | No additional billing-enabled provider or credential is required. The fallback model is selected explicitly through `LLM_MODEL` only if the primary fails the exact JSON-compliance test suite; no automatic model switching is introduced. |
| Vector DB / embeddings | None. Lexical token-overlap ranking with a fixed relevance threshold | PRD §8.1: "a full vector database is not required at this scale". A handful of notes per patient |
| Storage | Existing `data/notes.json` via `createNoteRepository` — read path only | Schema already matches PRD §8.3 exactly; approval gate enforced by Zod literal `"approved"` |
| Patient list for UI | Derived from distinct `patient_id`/`patient_display_name` pairs in approved notes | No separate Patient store needed for MVP; roster is Track B's job |
| Answer format | LLM returns JSON `{answer, cited_note_ids}`; Zod-validated; every cited id must exist in supplied evidence | Machine-checkable grounding — citation validation happens in code, not in the prompt |
| Determinism | `temperature: 0`, `max_tokens: 1024`, 30s timeout, one retry on network failure | PRD §8.7: bounded timeout, demo must not hang |

## Data & Contract Schema

No database changes. Brain reads the existing approved-note shape (`lib/notes/schema.ts`). All new types go in `lib/brain/types.ts` and must match the contract in `plans/2026-08-22-brain-retrieval.md` verbatim:

```ts
export type QuerySafetyResult =
  | { kind: "record_query"; normalizedQuestion: string }
  | {
      kind: "refused";
      reason: "general_medical" | "treatment_or_medication";
      message: "This tool only retrieves documented patient history and does not provide general medical or treatment advice.";
    };

export type EvidenceNote = {
  noteId: string;
  patientId: string;
  consultationDate: string;
  excerpts: string[];
  relevanceScore: number;
};

export type RetrievalResult =
  | { kind: "evidence"; patientId: string; question: string; evidence: EvidenceNote[] }
  | {
      kind: "no_supporting_record";
      patientId: string;
      message: "No record of that for this patient.";
      reason: "no_approved_notes" | "no_relevant_evidence";
    };

export type BrainResponse =
  | { status: "supported"; answer: string; sources: Array<{ noteId: string; consultationDate: string }> }
  | {
      status: "no_supporting_record";
      message: "No record of that for this patient.";
      reason: "no_approved_notes" | "no_relevant_evidence";
    }
  | {
      status: "refused";
      message: "This tool only retrieves documented patient history and does not provide general medical or treatment advice.";
      reason: "general_medical" | "treatment_or_medication";
    };
```

Server Action edge type (mirrors the existing Scribe action result pattern):

```ts
export type BrainActionResult =
  | { ok: true; response: BrainResponse }
  | { ok: false; message: string }; // generation/network/validation failures only
```

## Global Constraints

- Filter candidate notes by selected `patient_id` **before** any ranking, scoring, or LLM call — code-level gate, never prompt-only (PRD §8.5 Isolation rule).
- Only `approval_status === "approved"` notes may reach ranker, generator, or UI.
- Refusals and no-record results return **without invoking the provider** — proven by tests where the provider double throws if called.
- General-medical and treatment/medication questions are `refused`, a distinct state from `no_supporting_record`.
- Every supported answer's `sources` must reference only note IDs present in that response's retrieved evidence; violations are rejected, never shown.
- No diagnosis/treatment content anywhere; persistent disclaimer copy unchanged (AGENTS.md rule 4, PRD §9).
- Secrets only in `.env.local` (gitignored); never logged. `.env.example` will contain a placeholder `GROQ_API_KEY` and optional `LLM_MODEL` override only.
- Do not create or modify `data/seed/**` (Dev1 owns `feat/seed-data`); do not build the query UI (Dev2 owns `feat/query-ui`).
- Windows verification loop: `npm run typecheck && npm run lint && npm run test && npm run build`; browser checks use `next start`, not dev (see `docs/HANDOFF.md`).

## File Map

| Path | Responsibility | Owner |
|---|---|---|
| `lib/brain/types.ts` | Discriminated contracts above | Joint |
| `lib/brain/query-safety.ts` | Deterministic record-vs-refusal classifier | Joint |
| `lib/brain/ranking.ts` | Lexical relevance scorer + excerpt extraction + threshold | Rehan |
| `lib/brain/retrieval.ts` | Patient-first filter → approved filter → rank → threshold → `RetrievalResult` | Rehan |
| `lib/llm/provider.ts` | `LlmCompletionProvider` interface + Groq OpenAI-compatible Chat Completions adapter + env factory | Aashir |
| `lib/llm/prompts/brain-answer.ts` | Versioned grounded-answer system prompt | Aashir |
| `lib/brain/answer-generation.ts` | Evidence-only answer boundary; Zod parse + citation validation | Aashir |
| `lib/actions/brain.ts` | Pipeline orchestrator `queryPatientRecord` | Joint |
| `app/actions.ts` | Add `queryPatientRecordAction`, `listBrainPatientsAction` | Joint |
| `.env.example` | Placeholder keys | Aashir |
| `tests/brain-query-safety.test.ts` … `tests/brain-service.test.ts`, `tests/brain-adversarial.test.ts` | See tasks | Joint |
| `docs/HANDOFF.md` | Update when stopping work | Whoever stops first |

---

### Task 1: Contracts and deterministic query-safety gate

**Files:**
- Create: `lib/brain/types.ts`, `lib/brain/query-safety.ts`
- Test: `tests/brain-query-safety.test.ts`

**Interfaces:**
- Produces: all four contract types above; `classifyQuerySafety(question: string): QuerySafetyResult`

- [ ] **Step 1: Write failing tests**

```ts
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

  it("passes record questions through with a trimmed normalized question", () => {
    const result = classifyQuerySafety("  Has this patient mentioned chest pain before?  ");
    expect(result).toEqual({
      kind: "record_query",
      normalizedQuestion: "Has this patient mentioned chest pain before?",
    });
  });
});
```

- [ ] **Step 2: Run to verify failure** — `npm run test -- tests/brain-query-safety.test.ts` → FAIL (module not found)

- [ ] **Step 3: Implement** — `lib/brain/types.ts` holds the four contract types exactly as in "Data & Contract Schema" above. `lib/brain/query-safety.ts`:

```ts
import type { QuerySafetyResult } from "@/lib/brain/types";

const REFUSAL_MESSAGE =
  "This tool only retrieves documented patient history and does not provide general medical or treatment advice.";

const TREATMENT_PATTERNS = [
  /\bwhat (medication|medicine|drug|dose|dosage)\b/i,
  /\b(prescribe|prescription|titrate|start|switch|stop)\s+(the\s+)?(patient\s+)?on\b/i,
  /\bshould we (prescribe|give|administer)\b/i,
];

const GENERAL_MEDICAL_PATTERNS = [
  /\bstandard treatment\b/i,
  /\bfirst[- ]line\b/i,
  /\bwhat causes\b/i,
  /\bhow (is|are)\b.*\btreated\b/i,
  /\bside effects of\b/i,
  /\btypical (dose|dosage)\b/i,
];

export function classifyQuerySafety(rawQuestion: string): QuerySafetyResult {
  const normalizedQuestion = rawQuestion.trim();

  if (TREATMENT_PATTERNS.some((pattern) => pattern.test(normalizedQuestion))) {
    return { kind: "refused", reason: "treatment_or_medication", message: REFUSAL_MESSAGE };
  }

  if (GENERAL_MEDICAL_PATTERNS.some((pattern) => pattern.test(normalizedQuestion))) {
    return { kind: "refused", reason: "general_medical", message: REFUSAL_MESSAGE };
  }

  return { kind: "record_query", normalizedQuestion };
}
```

- [ ] **Step 4: Run to verify pass**, then `npm run typecheck`
- [ ] **Step 5: Commit** — `git add lib/brain tests/brain-query-safety.test.ts && git commit -m "test(brain): define query safety states"`

### Task 2: Lexical ranking with excerpts and threshold

**Files:**
- Create: `lib/brain/ranking.ts`
- Test: `tests/brain-ranking.test.ts`

**Interfaces:**
- Consumes: `ApprovedNote` from `@/lib/notes/schema`
- Produces: `rankNotes(notes: ApprovedNote[], question: string): EvidenceNote[]` (sorted by score desc); exported `RELEVANCE_THRESHOLD = 0.25`

- [ ] **Step 1: Write failing tests** — assert (a) a note containing the question's symptom outscores an unrelated note; (b) a note whose best score is below `RELEVANCE_THRESHOLD` is excluded; (c) excerpts are transcript-backed substrings containing a matched term, max 3; (d) ordering is descending by `relevanceScore`

```ts
import { describe, expect, it } from "vitest";
import { RELEVANCE_THRESHOLD, rankNotes } from "@/lib/brain/ranking";
import type { ApprovedNote } from "@/lib/notes/schema";

function makeNote(overrides: Partial<ApprovedNote>): ApprovedNote {
  return {
    id: "note-1",
    patient_id: "p1",
    patient_display_name: "Amina Khan",
    consultation_date: "2026-06-01",
    chief_complaint: "",
    history: [],
    symptoms: [],
    assessment_discussed: [],
    plan_discussed: [],
    medications_mentioned: [],
    follow_up: "",
    uncertainties: [],
    raw_transcript: "",
    approval_status: "approved",
    approved_at: "2026-06-01T10:00:00.000Z",
    ...overrides,
  };
}

describe("rankNotes", () => {
  const chestPain = makeNote({
    id: "note-chest",
    symptoms: ["chest pain"],
    raw_transcript: "Patient reported chest pain when climbing stairs.",
  });

  it("ranks a matching note above an unrelated note", () => {
    const unrelated = makeNote({ id: "note-other", symptoms: ["knee swelling"] });
    const ranked = rankNotes([unrelated, chestPain], "Has she mentioned chest pain before?");
    expect(ranked[0]?.noteId).toBe("note-chest");
    expect(ranked[0]!.relevanceScore).toBeGreaterThan(ranked[1]!.relevanceScore);
  });

  it("excludes notes scoring below the relevance threshold", () => {
    const unrelated = makeNote({ id: "note-other", symptoms: ["knee swelling"] });
    const ranked = rankNotes([unrelated], "Has she mentioned chest pain before?");
    expect(ranked).toHaveLength(RELEVANCE_THRESHOLD > 0 ? 0 : 1);
  });
});
```

- [ ] **Step 2: Verify failure** — `npm run test -- tests/brain-ranking.test.ts`
- [ ] **Step 3: Implement**

```ts
import type { ApprovedNote } from "@/lib/notes/schema";
import type { EvidenceNote } from "@/lib/brain/types";

export const RELEVANCE_THRESHOLD = 0.25;

const STOP_WORDS = new Set([
  "has", "have", "the", "a", "an", "is", "was", "been", "before", "this",
  "that", "patient", "she", "he", "they", "their", "any", "ever", "mentioned",
  "did", "does", "what", "of", "in", "on", "with", "for", "to", "and", "i",
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z\u00C0-\u024F]+/)
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token));
}

function noteText(note: ApprovedNote): string {
  return [
    note.chief_complaint,
    ...note.history,
    ...note.symptoms,
    ...note.assessment_discussed,
    ...note.plan_discussed,
    ...note.medications_mentioned,
    note.follow_up,
    ...note.uncertainties,
    note.raw_transcript,
  ].join("\n");
}

function extractExcerpts(note: ApprovedNote, terms: Set<string>): string[] {
  const sentences = note.raw_transcript.split(/(?<=[.!?])\s+/).concat(
    [...note.symptoms, ...note.history].map((entry) => `${entry}.`),
  );
  const matches = sentences.filter((sentence) =>
    tokenize(sentence).some((token) => terms.has(token)),
  );
  return matches.slice(0, 3);
}

export function rankNotes(notes: ApprovedNote[], question: string): EvidenceNote[] {
  const questionTerms = new Set(tokenize(question));
  if (questionTerms.size === 0) return [];

  return notes
    .map((note) => {
      const tokens = tokenize(noteText(note));
      if (tokens.length === 0) {
        return { note, score: 0, termsMatched: new Set<string>() };
      }
      const uniqueTokens = new Set(tokens);
      let matched = 0;
      const termsMatched = new Set<string>();
      for (const term of questionTerms) {
        if (uniqueTokens.has(term)) {
          matched += 1;
          termsMatched.add(term);
        }
      }
      return { note, score: matched / questionTerms.size, termsMatched };
    })
    .filter(({ score }) => score >= RELEVANCE_THRESHOLD)
    .sort((a, b) => b.score - a.score)
    .map(({ note, score, termsMatched }) => ({
      noteId: note.id,
      patientId: note.patient_id,
      consultationDate: note.consultation_date,
      excerpts: extractExcerpts(note, termsMatched),
      relevanceScore: Number(score.toFixed(4)),
    }));
}
```

- [ ] **Step 4: Verify pass** + typecheck
- [ ] **Step 5: Commit** — `feat(brain): add lexical relevance ranking`

### Task 3: Patient-isolated, approved-only retrieval boundary (Rehan)

**Files:**
- Create: `lib/brain/retrieval.ts`
- Modify: `lib/notes/repository.ts` (add `listAll()`)
- Test: `tests/brain-retrieval.test.ts`

**Interfaces:**
- Consumes: `rankNotes` from Task 2 (injectable), `createNoteRepository(...).listAll()`
- Produces: `retrieveApprovedEvidence({ patientId, question, notes, rankNotes }): RetrievalResult`

- [ ] **Step 1: Write failing tests** — the critical ones:

```ts
it("shows the ranker only the selected patient's notes, proving pre-ranking isolation", () => {
  const seen: string[] = [];
  const rankSpy = (notes: ApprovedNote[]) => {
    seen.push(...notes.map((n) => n.id));
    return [];
  };
  retrieveApprovedEvidence({
    patientId: "p1",
    question: "chest pain?",
    notes: [makeNote({ id: "a", patient_id: "p1" }), makeNote({ id: "b", patient_id: "p2" })],
    rankNotes: rankSpy,
  });
  expect(seen).toEqual(["a"]);
});

it("never lets a draft reach the ranker or the evidence output", () => {
  const draft = { ...makeNote({ id: "d" }), approval_status: "draft" } as unknown as ApprovedNote;
  const seen: string[] = [];
  retrieveApprovedEvidence({
    patientId: "p1",
    question: "q",
    notes: [draft],
    rankNotes: (notes) => { seen.push(...notes.map((n) => n.id)); return []; },
  });
  expect(seen).not.toContain("d");
});

it("returns no_approved_notes when the patient has zero approved notes", () => {
  const result = retrieveApprovedEvidence({ patientId: "pX", question: "q", notes: [], rankNotes });
  expect(result).toMatchObject({
    kind: "no_supporting_record",
    reason: "no_approved_notes",
    message: "No record of that for this patient.",
  });
});

it("returns no_relevant_evidence when nothing clears the threshold", () => {
  const result = retrieveApprovedEvidence({
    patientId: "p1",
    question: "completely unrelated zebra question",
    notes: [makeNote({ symptoms: ["knee swelling"] })],
    rankNotes,
  });
  expect(result).toMatchObject({ kind: "no_supporting_record", reason: "no_relevant_evidence" });
});
```

- [ ] **Step 2: Verify failure**
- [ ] **Step 3: Implement**

```ts
import type { ApprovedNote } from "@/lib/notes/schema";
import { rankNotes as defaultRankNotes } from "@/lib/brain/ranking";
import type { RetrievalResult } from "@/lib/brain/types";

type RankFn = typeof defaultRankNotes;

export function retrieveApprovedEvidence(input: {
  patientId: string;
  question: string;
  notes: ApprovedNote[];
  rankNotes?: RankFn;
}): RetrievalResult {
  const { patientId, question, notes, rankNotes = defaultRankNotes } = input;

  const patientScoped = notes.filter((note) => note.patient_id === patientId);
  if (patientScoped.length === 0) {
    return {
      kind: "no_supporting_record",
      patientId,
      message: "No record of that for this patient.",
      reason: "no_approved_notes",
    };
  }

  const approvedOnly = patientScoped.filter((note) => note.approval_status === "approved");
  if (approvedOnly.length === 0) {
    return {
      kind: "no_supporting_record",
      patientId,
      message: "No record of that for this patient.",
      reason: "no_approved_notes",
    };
  }

  const evidence = rankNotes(approvedOnly, question);
  if (evidence.length === 0) {
    return {
      kind: "no_supporting_record",
      patientId,
      message: "No record of that for this patient.",
      reason: "no_relevant_evidence",
    };
  }

  return { kind: "evidence", patientId, question, evidence };
}
```

Add to `createNoteRepository`'s returned object in `lib/notes/repository.ts`:

```ts
async listAll(): Promise<ApprovedNote[]> {
  return readNotes(storagePath);
},
```

- [ ] **Step 4: Verify pass** + typecheck + lint
- [ ] **Step 5: Commit** — `feat(brain): add patient-isolated approved-note retrieval`

### Task 4: Groq LLM provider boundary with model override (Aashir)

**Files:**
- Create: `lib/llm/provider.ts`, `.env.example`
- Test: `tests/llm-provider.test.ts`

**Interfaces:**
- Produces: `interface LlmCompletionProvider { complete(input: { system: string; user: string }): Promise<string> }`; `createLlmProviderFromEnv(env: Pick<NodeJS.ProcessEnv, "GROQ_API_KEY" | "LLM_MODEL">): LlmCompletionProvider` (throws descriptive `Error` when `GROQ_API_KEY` is missing); `createGroqProvider(apiKey: string, model: string)`.

- [ ] **Step 1: Write failing tests** — use `vi.stubGlobal("fetch", …)` doubles; no real network in unit tests:

```ts
it("throws a clear error when the Groq key is not configured", () => {
  expect(() => createLlmProviderFromEnv({})).toThrowError(/GROQ_API_KEY missing/);
});

it("Groq adapter sends the documented OpenAI-compatible request shape and returns text", async () => {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify({ choices: [{ message: { content: "hello" } }] }), { status: 200 }),
  );
  vi.stubGlobal("fetch", fetchMock);
  const provider = createGroqProvider("key", "openai/gpt-oss-120b");
  const text = await provider.complete({ system: "sys", user: "usr" });
  expect(text).toBe("hello");
  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  expect(url).toBe("https://api.groq.com/openai/v1/chat/completions");
  expect((init.headers as Record<string, string>).Authorization).toBe("Bearer key");
  expect(JSON.parse(init.body as string)).toMatchObject({
    model: "openai/gpt-oss-120b",
    max_tokens: 1024,
    temperature: 0,
    messages: [
      { role: "system", content: "sys" },
      { role: "user", content: "usr" },
    ],
  });
});

it("aborts after the 30s bound instead of hanging", async () => {
  const fetchMock = vi.fn().mockRejectedValue(new Error("The operation was aborted"));
  vi.stubGlobal("fetch", fetchMock);
  const provider = createGroqProvider("key", "openai/gpt-oss-120b");
  await expect(provider.complete({ system: "s", user: "u" })).rejects.toThrowError();
});
```

- [ ] **Step 2: Verify failure**
- [ ] **Step 3: Implement** — the Groq adapter builds the documented OpenAI-compatible Chat Completions request, uses `AbortSignal.timeout(30_000)`, retries once on a network-level failure (not HTTP 4xx), throws `Error(\`LLM provider returned ${status}\`)` for non-2xx, and extracts `choices[0].message.content`. Factory:

```ts
export function createLlmProviderFromEnv(
  env: Pick<NodeJS.ProcessEnv, "GROQ_API_KEY" | "LLM_MODEL">,
): LlmCompletionProvider {
  if (!env.GROQ_API_KEY) {
    throw new Error("LLM provider is not configured: GROQ_API_KEY missing");
  }

  return createGroqProvider(
    env.GROQ_API_KEY,
    env.LLM_MODEL ?? "openai/gpt-oss-120b",
  );
}
```

> **API check before implementing (AGENTS.md rule 1):** confirm the current endpoint and request fields against [Groq OpenAI Compatibility](https://console.groq.com/docs/openai) and the Groq API reference before merging. `LLM_MODEL` is env-overridable; use `llama-3.3-70b-versatile` only after an explicit primary-model JSON-compliance review, not as an automatic fallback.

Create `.env.example` with commented `GROQ_API_KEY` and optional `LLM_MODEL` placeholders only; never include real values.

- [ ] **Step 4: Verify pass**; confirm `.gitignore` still ignores `.env*.local`
- [ ] **Step 5: Commit** — `feat(llm): add env-selected completion provider boundary`

### Task 5: Versioned prompt + evidence-bound answer generation (Aashir)

**Files:**
- Create: `lib/llm/prompts/brain-answer.ts`, `lib/brain/answer-generation.ts`
- Test: `tests/brain-answer-generation.test.ts`

**Interfaces:**
- Consumes: `LlmCompletionProvider` (Task 4), evidence branch of `RetrievalResult` (Task 1)
- Produces: `generateGroundedAnswer(evidence: Extract<RetrievalResult, { kind: "evidence" }>, provider: LlmCompletionProvider): Promise<BrainResponse>`; exported `BRAIN_ANSWER_SYSTEM_PROMPT_V1`

- [ ] **Step 1: Write failing tests** — provider doubles, no network:

```ts
const evidenceBranch = {
  kind: "evidence",
  patientId: "p1",
  question: "Has she mentioned chest pain before?",
  evidence: [{
    noteId: "note-chest",
    patientId: "p1",
    consultationDate: "2026-06-01",
    excerpts: ["Patient reported chest pain when climbing stairs."],
    relevanceScore: 0.5,
  }],
} as const;

it("accepts only the evidence branch — a no-record result is a type error, verified at compile time", () => {
  // @ts-expect-error no_supporting_record branch must not satisfy the parameter
  generateGroundedAnswer({ kind: "no_supporting_record" }, nullProvider);
});

it("rejects a citation pointing outside the supplied evidence instead of showing it", async () => {
  const lyingProvider: LlmCompletionProvider = {
    complete: async () => JSON.stringify({ answer: "She had chest pain.", cited_note_ids: ["made-up-id"] }),
  };
  const result = await generateGroundedAnswer(evidenceBranch, lyingProvider);
  expect(result.status).not.toBe("supported");
});

it("returns a supported response whose sources match evidence dates exactly", async () => {
  const provider: LlmCompletionProvider = {
    complete: async () => JSON.stringify({ answer: "Yes — chest pain on exertion.", cited_note_ids: ["note-chest"] }),
  };
  const result = await generateGroundedAnswer(evidenceBranch, provider);
  expect(result).toEqual({
    status: "supported",
    answer: "Yes — chest pain on exertion.",
    sources: [{ noteId: "note-chest", consultationDate: "2026-06-01" }],
  });
});
```

- [ ] **Step 2: Verify failure**
- [ ] **Step 3: Implement** — prompt in `lib/llm/prompts/brain-answer.ts` (from PRD §8.5 sketch):

```ts
export const BRAIN_ANSWER_PROMPT_VERSION = "v1";

export const BRAIN_ANSWER_SYSTEM_PROMPT_V1 = `You are a patient-record retrieval assistant. Use only the supplied evidence from this patient's approved notes.
Do not diagnose. Do not recommend treatment. Do not infer facts not present in the evidence. Do not use general medical knowledge to fill gaps.
If the evidence does not support the question, respond with {"answer":"","cited_note_ids":[]} and nothing else — never guess.
Every claim in your answer must map to a specific source note you cite by its note ID.
Respond with exactly one JSON object: {"answer":"string","cited_note_ids":["string"]} and no other text.`;
```

Generation in `lib/brain/answer-generation.ts`: build user message with evidence JSON (noteId, date, excerpts only — never whole unrelated notes); `JSON.parse` inside try/catch; validate with Zod `z.object({ answer: z.string(), cited_note_ids: z.array(z.string()) })`; **reject** (throw) if any cited id is absent from `evidence.evidence` or if `answer` is empty while ids are claimed; map valid output to `{ status: "supported", answer, sources: citedIds.map(id => ({ noteId: id, consultationDate: evidence.evidence.find(e => e.noteId === id)!.consultationDate })) }`.

- [ ] **Step 4: Verify pass** + typecheck
- [ ] **Step 5: Commit** — `feat(brain): add evidence-bound answer generation`

### Task 6: Guarded orchestration + Server Actions

**Files:**
- Create: `lib/actions/brain.ts`
- Modify: `app/actions.ts` (add exports; change nothing existing)
- Test: `tests/brain-service.test.ts`

**Interfaces:**
- Consumes: everything above
- Produces: `queryPatientRecord({ patientId, question, notes?, provider? }): Promise<BrainResponse>` (deps injectable for tests, real defaults wired in the Server Action layer); `queryPatientRecordAction(patientId: string, question: string): Promise<BrainActionResult>`; `listBrainPatientsAction(): Promise<Array<{ patientId: string; displayName: string }>>`

- [ ] **Step 1: Write failing tests** — provider double that throws if called:

```ts
const explodingProvider: LlmCompletionProvider = {
  complete: async () => { throw new Error("provider must not be called"); },
};

it("refuses treatment requests end-to-end without retrieval-side LLM use", async () => {
  const result = await queryPatientRecord(
    { patientId: "p1", question: "What medication should we prescribe?", notes: [approvedNote], provider: explodingProvider },
  );
  expect(result.status).toBe("refused");
});

it("returns no_supporting_record for unrecorded questions without calling the provider", async () => {
  const result = await queryPatientRecord(
    { patientId: "p1", question: "What was her blood pressure in March?", notes: [approvedNoteAboutKnees], provider: explodingProvider },
  );
  expect(result).toMatchObject({ status: "no_supporting_record", reason: "no_relevant_evidence" });
});

it("returns supported with source dates when evidence and provider agree", async () => { /* happy-path double */ });
```

- [ ] **Step 2: Verify failure**
- [ ] **Step 3: Implement** `lib/actions/brain.ts` — fixed order: classify → refused ? return : retrieve → `no_supporting_record` ? return : generate. In `app/actions.ts`, lazily wire `createLlmProviderFromEnv(process.env)` only inside the action (so builds without `GROQ_API_KEY` still succeed); catch thrown generation errors into `{ ok: false, message: "The Brain could not answer right now. Try again." }`; `listBrainPatientsAction` derives distinct patients from `repository.listAll()`.
- [ ] **Step 4: Verify pass**, then full loop: `npm run typecheck && npm run lint && npm run test && npm run build`
- [ ] **Step 5: Commit** — `feat(brain): add guarded query orchestration`

### Task 7: Adversarial suite (PRD §8.6) and review gate

**Files:**
- Test: `tests/brain-adversarial.test.ts`
- Modify: `docs/HANDOFF.md`

- [ ] **Step 1:** Encode all six §8.6 rows as integration tests (provider doubles; seeded fixture notes built in-test, not from `data/seed/`): prior symptom → supported+cited; unrecorded vital → `no_supporting_record`; unrecorded condition → `no_supporting_record`; medication request → `refused`; different-patient probe → `no_supporting_record` (assert other patient's note IDs appear nowhere in result JSON); general-knowledge-with-patient-open → `refused`
- [ ] **Step 2:** Full loop green; run existing Scribe tests too (no regression)
- [ ] **Step 3:** Browser E2E (`tests/e2e-brain.mjs`) **deferred until Dev2's query UI lands on `feat/query-ui`** — integration coverage above is the merge gate for this branch; coordinate with Dev1 for seeded notes post-merge
- [ ] **Step 4:** Update `docs/HANDOFF.md` (state, validation results, next action); commit — `test(brain): cover adversarial cases from PRD 8.6`
- [ ] **Step 5:** Human review (Rehan/Aashir cross-review + one teammate) before opening PR into `main`

## Demo-Day Wiring (after merge)

1. Dev1 merges `feat/seed-data` (2–4 synthetic notes/patient incl. deliberately-absent facts for §11 criterion 3)
2. Dev2 builds query screen consuming `BrainResponse` states verbatim (exact refusal/no-record copy, source dates visible)
3. Day-4 rehearsal: run all §8.6 cases live against `next start`; record backup video (PRD Phase 1–6, Day 6)

## Rollback

Revert Brain commits as a group (Tasks 1–7 are independent commits). If any cross-patient leak is found post-merge: disable `queryPatientRecordAction` (return `{ ok: false }`), keep Scribe untouched, re-run Task 3 isolation tests before re-enabling.
