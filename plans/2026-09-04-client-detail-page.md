# Client Detail Page + Synced Per-Client Chat — Implementation Plan

> **For agentic workers:** implement task-by-task in order. Steps use checkbox (`- [ ]`) syntax. Commit points are marked, but per repo rules commits only happen when the user asks.

**Goal:** Client cards open a per-client detail page (`/clients/[patientId]`, tabs: Details / Sessions / Chats / Mind map), and Brain chat history is persisted per client so `/rawaan-ai` and the client's Chats tab stay in sync.

**Architecture:** New local-first JSON chat store (`lib/db/chats.ts`, mirrors `lib/db/patients.ts` conventions) written through server actions. `/rawaan-ai` gets an `initialPatientId` prop + thread resume; the detail page's Chats tab renders the same store read-only and deep-links out for new chats. Persistence is display-only — the Brain query path still receives exactly `(patientId, question)`.

**Tech Stack:** Next.js 16.3.2 App Router (async `params`/`searchParams` — `Promise`-typed, must `await`), React 19, TypeScript strict, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-04-client-detail-page-design.md`

## Global Constraints

- Grounded answers are a product requirement (PRD §5.5/§8/§10): never feed stored chat history into the query pipeline.
- No diagnosis, care-team/multi-provider, files, or treatment-plan tabs (PRD §3 non-goals).
- Strict TypeScript, no `any`; all durable data server-side (no localStorage).
- `data/chats.json` is runtime data — gitignored like `data/patients.json`.
- Test commands: `npm run typecheck`, `npm run lint`, `npm test` (vitest), `npm run build`.

---

### Task 1: Chat store (`lib/db/chats.ts`)

**Files:**
- Create: `lib/db/chats.ts`
- Test: `tests/chat-store.test.ts`

**Interfaces:**
- Produces (consumed by Tasks 2, 6):
  - `type StoredChatEntry = { id: string; patientId: string; threadId: string; question: string; response: BrainResponse | { message: string; status: "error" }; timestamp: string }`
  - `type ChatThread = { threadId: string; startedAt: string; entries: Array<{ question: string; response: StoredChatEntry["response"]; timestamp: string }> }`
  - `createChatStore(storagePath: string)` → `{ append(entry: StoredChatEntry): Promise<StoredChatEntry>; listThreads(patientId: string): Promise<ChatThread[]> }`

- [ ] **Step 1: Write the failing test** — `tests/chat-store.test.ts`:

```ts
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createChatStore,
  type StoredChatEntry,
} from "@/lib/db/chats";

let dir: string;
let storagePath: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "chat-store-"));
  storagePath = join(dir, "chats.json");
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

function entry(partial: Partial<StoredChatEntry>): StoredChatEntry {
  return {
    id: partial.id ?? "chat-1",
    patientId: partial.patientId ?? "p1",
    threadId: partial.threadId ?? "thread-1",
    question: partial.question ?? "q",
    response: partial.response ?? { status: "error", message: "m" },
    timestamp: partial.timestamp ?? "2026-09-04T10:00:00.000Z",
  };
}

describe("createChatStore", () => {
  it("returns no threads when the file does not exist", async () => {
    const store = createChatStore(storagePath);
    await expect(store.listThreads("p1")).resolves.toEqual([]);
  });

  it("appends entries and groups them into threads per patient", async () => {
    const store = createChatStore(storagePath);
    await store.append(entry({ id: "a", threadId: "t1", timestamp: "2026-09-04T10:00:00.000Z" }));
    await store.append(entry({ id: "b", threadId: "t1", timestamp: "2026-09-04T10:05:00.000Z" }));
    await store.append(entry({ id: "c", threadId: "t2", timestamp: "2026-09-04T11:00:00.000Z" }));
    await store.append(entry({ id: "other", patientId: "p2", threadId: "t9" }));

    const threads = await store.listThreads("p1");
    expect(threads.map((t) => t.threadId)).toEqual(["t1", "t2"]);
    expect(threads[0].startedAt).toBe("2026-09-04T10:00:00.000Z");
    expect(threads[0].entries.map((e) => e.question)).toEqual(["q", "q"]);
    expect(threads[1].entries).toHaveLength(1);
  });

  it("round-trips every response variant verbatim", async () => {
    const store = createChatStore(storagePath);
    const variants: StoredChatEntry["response"][] = [
      { status: "supported", answer: "a", sources: [{ noteId: "n1", consultationDate: "2026-06-01" }] },
      { status: "no_supporting_record", reason: "no_relevant_evidence", message: "No record of that for this patient." },
      { status: "refused", reason: "general_medical", message: "This tool only retrieves documented patient history and does not provide general medical or treatment advice." },
      { status: "error", message: "boom" },
    ];
    for (const [i, response] of variants.entries()) {
      await store.append(entry({ id: `v${i}`, response }));
    }
    const threads = await store.listThreads("p1");
    expect(threads[0].entries.map((e) => e.response)).toEqual(variants);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/chat-store.test.ts`
Expected: FAIL — module `@/lib/db/chats` does not exist.

- [ ] **Step 3: Implement** — `lib/db/chats.ts`:

```ts
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import type { BrainResponse } from "@/lib/brain/types";

/** Response shape persisted per chat turn — structurally identical to the
 * BrainChatEntry response in app/components/brain-chat-state.ts. */
export type StoredChatResponse =
  | BrainResponse
  | { message: string; status: "error" };

export type StoredChatEntry = {
  id: string;
  patientId: string;
  threadId: string;
  question: string;
  response: StoredChatResponse;
  timestamp: string;
};

export type ChatThread = {
  threadId: string;
  startedAt: string;
  entries: Array<{
    question: string;
    response: StoredChatResponse;
    timestamp: string;
  }>;
};

function isMissingFileError(error: unknown): error is NodeJS.ErrnoException {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as NodeJS.ErrnoException).code === "ENOENT"
  );
}

async function readEntries(storagePath: string): Promise<StoredChatEntry[]> {
  try {
    const raw = await readFile(storagePath, "utf8");
    return JSON.parse(raw) as StoredChatEntry[];
  } catch (error) {
    if (isMissingFileError(error)) return [];
    throw error;
  }
}

/**
 * Local-first per-patient chat history. Chat entries are DISPLAY ONLY — they
 * must never be fed back into the Brain query pipeline (PRD grounding rule).
 */
export function createChatStore(storagePath: string) {
  return {
    async append(entry: StoredChatEntry): Promise<StoredChatEntry> {
      const entries = await readEntries(storagePath);
      await mkdir(dirname(storagePath), { recursive: true });
      await writeFile(storagePath, JSON.stringify([...entries, entry], null, 2));
      return entry;
    },

    async listThreads(patientId: string): Promise<ChatThread[]> {
      const entries = await readEntries(storagePath);
      const threadsById = new Map<string, ChatThread>();

      for (const entry of entries) {
        if (entry.patientId !== patientId) continue;
        const thread = threadsById.get(entry.threadId);
        const chatEntry = {
          question: entry.question,
          response: entry.response,
          timestamp: entry.timestamp,
        };
        if (thread) {
          thread.entries.push(chatEntry);
        } else {
          threadsById.set(entry.threadId, {
            threadId: entry.threadId,
            startedAt: entry.timestamp,
            entries: [chatEntry],
          });
        }
      }

      return [...threadsById.values()].sort((a, b) =>
        a.startedAt.localeCompare(b.startedAt),
      );
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes** — `npx vitest run tests/chat-store.test.ts` → PASS.

---

### Task 2: Chat + client-detail server actions (`app/actions.ts`)

**Files:**
- Modify: `app/actions.ts` (append at end)

**Interfaces:**
- Consumes: `createChatStore`, `ChatThread`, `StoredChatEntry` from Task 1; existing `noteRepository`, `listClientsAction`, `ClientRecord`, `ActionFailure`.
- Produces (consumed by Tasks 4, 5, 6):
  - `listChatThreadsAction(patientId: string): Promise<ChatThread[]>`
  - `appendChatEntryAction(input: { patientId: string; threadId: string; entry: { question: string; response: StoredChatEntry["response"]; timestamp: string } }): Promise<{ ok: true } | ActionFailure>`
  - `getClientDetailAction(patientId: string): Promise<{ client: ClientRecord | null; notes: ApprovedNote[] }>` (notes sorted newest-first)

- [ ] **Step 1: Add the store singleton** (next to the other module-level stores):

```ts
const chatStore = createChatStore(join(process.cwd(), "data", "chats.json"));
```

with import `import { createChatStore, type StoredChatEntry } from "@/lib/db/chats";`

- [ ] **Step 2: Append the actions:**

```ts
export async function listChatThreadsAction(patientId: string) {
  try {
    return await chatStore.listThreads(patientId);
  } catch {
    return [];
  }
}

export async function appendChatEntryAction(input: {
  entry: {
    question: string;
    response: StoredChatEntry["response"];
    timestamp: string;
  };
  patientId: string;
  threadId: string;
}): Promise<{ ok: true } | ActionFailure> {
  try {
    await chatStore.append({
      ...input.entry,
      id: `chat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      patientId: input.patientId,
      threadId: input.threadId,
    });
    return { ok: true };
  } catch {
    return { message: "The chat could not be saved.", ok: false };
  }
}

export async function getClientDetailAction(patientId: string): Promise<{
  client: ClientRecord | null;
  notes: ApprovedNote[];
}> {
  const [clients, notes] = await Promise.all([
    listClientsAction(),
    noteRepository.listByPatient(patientId),
  ]);

  return {
    client: clients.find((c) => c.patientId === patientId) ?? null,
    notes: notes.sort((a, b) =>
      b.consultation_date.localeCompare(a.consultation_date),
    ),
  };
}
```

- [ ] **Step 3: Verify** — `npm run typecheck` passes.

---

### Task 3: Reducer `load-thread` action (`brain-chat-state.ts`)

**Files:**
- Modify: `app/components/brain-chat-state.ts`
- Test: `tests/brain-chat.test.ts`

**Interfaces:**
- Produces: new `BrainChatAction` variant `{ type: "load-thread"; entries: BrainChatEntry[] }`.

- [ ] **Step 1: Write the failing test** — append a describe block to `tests/brain-chat.test.ts`:

```ts
describe("load-thread (persisted history)", () => {
  it("replaces entries with the loaded thread and clears draft/submitting", () => {
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
});
```

- [ ] **Step 2: Run test to verify it fails** — `npx vitest run tests/brain-chat.test.ts` → FAIL (`load-thread` not handled / type error).

- [ ] **Step 3: Implement** — in `brain-chat-state.ts`:

```ts
export type BrainChatAction =
  | { type: "select-patient"; patientId: string }
  | { type: "set-draft"; text: string }
  | { type: "submit-start" }
  | { type: "append-entry"; entry: BrainChatEntry }
  | { type: "load-thread"; entries: BrainChatEntry[] }
  | { type: "new-chat" };
```

and in the reducer switch:

```ts
    case "load-thread":
      // Hydrates a persisted thread for display. Stored history is never
      // sent back into the query pipeline — display only.
      return {
        ...state,
        entries: action.entries,
        draftQuestion: "",
        isSubmitting: false,
      };
```

- [ ] **Step 4: Run tests** — `npx vitest run tests/brain-chat.test.ts` → PASS (existing isolation tests must stay green).

---

### Task 4: Extract `ChatEntryCard` for reuse

**Files:**
- Create: `app/components/brain-chat-entry-card.tsx`
- Modify: `app/components/brain-chat.tsx` (remove inline `ChatEntryCard`, import instead)

**Interfaces:**
- Produces: `export function ChatEntryCard({ entry }: { entry: BrainChatEntry })` — consumed by Tasks 5, 6.

- [ ] **Step 1:** Move the existing `ChatEntryCard` function verbatim from `brain-chat.tsx` into `brain-chat-entry-card.tsx` (add `import type { BrainChatEntry } from "@/app/components/brain-chat-state";`).
- [ ] **Step 2:** In `brain-chat.tsx`, delete the inline definition and import it: `import { ChatEntryCard } from "@/app/components/brain-chat-entry-card";`
- [ ] **Step 3: Verify** — `npm run typecheck` passes; `npx vitest run tests/brain-chat.test.ts` still green.

---

### Task 5: BrainChat persistence + `initialPatientId`; rawaan-ai deep link

**Files:**
- Modify: `app/components/brain-chat.tsx`
- Modify: `app/(workspace)/rawaan-ai/page.tsx`

**Interfaces:**
- Consumes: `listChatThreadsAction`, `appendChatEntryAction` (Task 2); `ChatEntryCard` (Task 4); `load-thread` (Task 3).
- Produces: `<BrainChat initialPatientId?: string />` — used by rawaan-ai page.

- [ ] **Step 1: Rework `brain-chat.tsx`:**

Signature: `export function BrainChat({ initialPatientId }: { initialPatientId?: string })`.

Add component state + ref:

```ts
const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
const requestedPatientRef = useRef<string | null>(null);
```

Replace the select `onChange` dispatch with a handler that also loads history:

```ts
function handleSelectPatient(patientId: string) {
  requestedPatientRef.current = patientId;
  setActiveThreadId(null);
  dispatch({ type: "select-patient", patientId });
  if (!patientId) return;
  void listChatThreadsAction(patientId).then((threads) => {
    // Ignore stale responses if the clinician switched patients mid-load.
    if (requestedPatientRef.current !== patientId) return;
    const latest = threads[threads.length - 1];
    if (latest) {
      setActiveThreadId(latest.threadId);
      dispatch({ type: "load-thread", entries: latest.entries });
    }
  });
}
```

Add the initial-patient effect (after the patients-loading effect):

```ts
useEffect(() => {
  if (
    !patientsLoaded ||
    !initialPatientId ||
    state.patientId ||
    !patients.some((p) => p.patientId === initialPatientId)
  ) {
    return;
  }
  handleSelectPatient(initialPatientId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [patientsLoaded, initialPatientId]);
```

In `submitQuestion`, persist after appending:

```ts
dispatch({ type: "append-entry", entry });

const threadId =
  activeThreadId ??
  `thread-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
if (!activeThreadId) setActiveThreadId(threadId);
void appendChatEntryAction({
  patientId: state.patientId,
  threadId,
  entry,
}).then((result) => {
  if (!result.ok) console.warn("Chat history save failed:", result.message);
});
```

"New chat" button `onClick` becomes:

```ts
() => {
  setActiveThreadId(null);
  dispatch({ type: "new-chat" });
}
```

- [ ] **Step 2: Deep-link the rawaan-ai page** — `app/(workspace)/rawaan-ai/page.tsx`:

```tsx
import { BrainChat } from "@/app/components/brain-chat";

export default async function RawaanAiPage({
  searchParams,
}: {
  searchParams: Promise<{ patient?: string }>;
}) {
  const { patient } = await searchParams;

  return (
    <div className="wireframe-page page-ai">
      <header className="wireframe-header">
        <div>
          <h1 className="wireframe-title">Rawaan AI · Patient Context Brain</h1>
          <p className="wireframe-subtitle">
            Natural-language recall strictly grounded in clinician-approved patient records.
          </p>
        </div>
        <div className="safety-label">Documentation support only</div>
      </header>

      <BrainChat initialPatientId={patient} />
    </div>
  );
}
```

- [ ] **Step 3: Verify** — `npm run typecheck`, `npx vitest run tests/brain-chat.test.ts` green.

---

### Task 6: Client detail page (route + view + chats tab)

**Files:**
- Create: `app/(workspace)/clients/[patientId]/page.tsx`
- Create: `app/components/client-detail-view.tsx`
- Create: `app/components/client-chats-tab.tsx`

**Interfaces:**
- Consumes: `getClientDetailAction` + `ClientRecord` (Task 2), `listChatThreadsAction` / `ChatThread` (Task 2), `ChatEntryCard` (Task 4), `SessionMindmap` (existing), `ApprovedNote` (existing).
- Produces: route `/clients/[patientId]?tab=details|sessions|chats|mindmap`.

- [ ] **Step 1: Server page** — `app/(workspace)/clients/[patientId]/page.tsx`:

```tsx
import Link from "next/link";

import { getClientDetailAction } from "@/app/actions";
import { ClientDetailView } from "@/app/components/client-detail-view";

export const dynamic = "force-dynamic";

export default async function ClientDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ patientId: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { patientId } = await params;
  const { tab } = await searchParams;
  const { client, notes } = await getClientDetailAction(patientId);

  if (!client) {
    return (
      <div className="wireframe-page">
        <div className="roster-empty-state">
          <p className="roster-empty-title">Client not found</p>
          <p className="roster-empty-body">
            This client may have been removed.{" "}
            <Link className="roster-empty-link" href="/clients">
              Back to all clients
            </Link>
          </p>
        </div>
      </div>
    );
  }

  return (
    <ClientDetailView client={client} initialTab={tab} notes={notes} />
  );
}
```

- [ ] **Step 2: Chats tab** — `app/components/client-chats-tab.tsx`:

```tsx
"use client";

import { MessageSquarePlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { listChatThreadsAction } from "@/app/actions";
import { ChatEntryCard } from "@/app/components/brain-chat-entry-card";
import type { ChatThread } from "@/lib/db/chats";

export function ClientChatsTab({ patientId }: { patientId: string }) {
  const router = useRouter();
  const [threads, setThreads] = useState<ChatThread[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void listChatThreadsAction(patientId).then((result) => {
      if (!cancelled) setThreads(result);
    });
    return () => {
      cancelled = true;
    };
  }, [patientId]);

  function handleNewChat() {
    router.push(`/rawaan-ai?patient=${encodeURIComponent(patientId)}`);
  }

  return (
    <div className="client-chats-tab">
      <div className="client-chats-toolbar">
        <p className="client-chats-hint">
          Every Rawaan AI conversation for this client is saved here.
        </p>
        <button className="primary-button" onClick={handleNewChat} type="button">
          <MessageSquarePlus aria-hidden="true" size={15} /> New chat
        </button>
      </div>

      {threads === null ? (
        <p className="brain-chat-loading">Loading chats…</p>
      ) : threads.length === 0 ? (
        <div className="brain-chat-empty">
          <p>
            No chats yet for this client. Start a new chat to ask questions
            grounded in their approved notes.
          </p>
        </div>
      ) : (
        [...threads].reverse().map((thread) => (
          <section className="client-chat-thread" key={thread.threadId}>
            <h3 className="client-chat-thread-date">
              {new Date(thread.startedAt).toLocaleString("en-US", {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </h3>
            {thread.entries.map((entry, index) => (
              <ChatEntryCard entry={entry} key={`${entry.timestamp}-${index}`} />
            ))}
          </section>
        ))
      )}
    </div>
  );
}
```

- [ ] **Step 3: Detail view shell** — `app/components/client-detail-view.tsx` (tabs `details` | `sessions` | `chats` | `mindmap`; `initialTab` validated against the union, defaulting to `"details"`):

```tsx
"use client";

import { ArrowLeft, ChevronDown, Video } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import type { ClientRecord } from "@/app/actions";
import { ClientChatsTab } from "@/app/components/client-chats-tab";
import { SessionMindmap } from "@/app/components/session-mindmap";
import type { ApprovedNote } from "@/lib/notes/schema";

type ClientTab = "details" | "sessions" | "chats" | "mindmap";

const VALID_TABS: ClientTab[] = ["details", "sessions", "chats", "mindmap"];

interface ClientDetailViewProps {
  client: ClientRecord;
  initialTab?: string;
  notes: ApprovedNote[];
}

export function ClientDetailView({ client, initialTab, notes }: ClientDetailViewProps) {
  const [activeTab, setActiveTab] = useState<ClientTab>(
    VALID_TABS.includes(initialTab as ClientTab) ? (initialTab as ClientTab) : "details",
  );
  const [expandedNoteId, setExpandedNoteId] = useState<string | null>(null);
  const [mindmapNoteId, setMindmapNoteId] = useState<string | null>(notes[0]?.id ?? null);

  const since = notes.length > 0
    ? new Date(`${notes[notes.length - 1].consultation_date}T00:00:00`).toLocaleDateString("en-US", { month: "short", year: "numeric" })
    : null;
  const mindmapNote = notes.find((n) => n.id === mindmapNoteId) ?? null;

  return (
    <div className="wireframe-page page-client-detail">
      <header className="client-detail-header">
        <div className="client-detail-header-left">
          <Link className="client-detail-back" href="/clients">
            <ArrowLeft aria-hidden="true" size={16} /> All clients
          </Link>
          <div className="client-detail-title-row">
            <h1 className="wireframe-title">{client.displayName}</h1>
            <span className="client-detail-badge">Individual</span>
          </div>
          <p className="wireframe-subtitle">
            {notes.length} {notes.length === 1 ? "session" : "sessions"}
            {since ? ` / Since ${since}` : ""}
          </p>
        </div>
        <Link className="primary-button" href={`/record?patient=${encodeURIComponent(client.patientId)}`}>
          <Video aria-hidden="true" size={15} /> Record a session
        </Link>
      </header>

      <nav className="workspace-tabs-nav client-detail-tabs" aria-label="Client detail tabs">
        {(["details", "sessions", "chats", "mindmap"] as ClientTab[]).map((tab) => (
          <button
            className={`workspace-tab-btn ${activeTab === tab ? "is-active" : ""}`}
            key={tab}
            onClick={() => setActiveTab(tab)}
            type="button"
          >
            {tab === "mindmap" ? "Mind map" : tab[0].toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </nav>

      {activeTab === "details" ? (
        <section className="client-detail-panel">
          <h2 className="section-title">Profile</h2>
          <p className="client-detail-panel-sub">Client demographics and contact details.</p>
          <dl className="client-profile-fields">
            <div className="client-profile-field"><dt>First name</dt><dd>{client.firstName || "N/A"}</dd></div>
            <div className="client-profile-field"><dt>Last name</dt><dd>{client.lastName || "N/A"}</dd></div>
            <div className="client-profile-field"><dt>Email</dt><dd>{client.email || "N/A"}</dd></div>
            <div className="client-profile-field"><dt>Phone</dt><dd>{client.mobileNumber || "N/A"}</dd></div>
            <div className="client-profile-field"><dt>Client ID</dt><dd>{client.patientId}</dd></div>
          </dl>
        </section>
      ) : activeTab === "sessions" ? (
        <section className="client-detail-panel">
          <h2 className="section-title">Sessions</h2>
          {notes.length === 0 ? (
            <p className="client-detail-empty">No approved sessions on record yet.</p>
          ) : (
            <ul className="client-session-list">
              {notes.map((note) => {
                const isOpen = expandedNoteId === note.id;
                return (
                  <li className="client-session-item" key={note.id}>
                    <button
                      className="client-session-summary"
                      onClick={() => setExpandedNoteId(isOpen ? null : note.id)}
                      type="button"
                    >
                      <span className="client-session-date">{note.consultation_date}</span>
                      <span className="client-session-complaint">
                        {note.chief_complaint || note.summary || "Consultation note"}
                      </span>
                      <ChevronDown aria-hidden="true" className={isOpen ? "is-rotated" : ""} size={14} />
                    </button>
                    {isOpen ? (
                      <div className="client-session-detail">
                        {note.summary ? <p>{note.summary}</p> : null}
                        {note.symptoms.length > 0 ? (
                          <><h4>Symptoms</h4><ul>{note.symptoms.map((s, i) => <li key={i}>{s}</li>)}</ul></>
                        ) : null}
                        {note.plan_discussed.length > 0 ? (
                          <><h4>Plan discussed</h4><ul>{note.plan_discussed.map((p, i) => <li key={i}>{p}</li>)}</ul></>
                        ) : null}
                        {note.follow_up ? <p><strong>Follow-up:</strong> {note.follow_up}</p> : null}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ) : activeTab === "chats" ? (
        <ClientChatsTab patientId={client.patientId} />
      ) : (
        <section className="client-detail-panel">
          <h2 className="section-title">Mind map</h2>
          {notes.length === 0 ? (
            <p className="client-detail-empty">No sessions available to map yet.</p>
          ) : (
            <>
              <label className="form-field client-mindmap-picker">
                Session
                <select
                  className="select-input"
                  onChange={(event) => setMindmapNoteId(event.target.value)}
                  value={mindmapNoteId ?? ""}
                >
                  {notes.map((note) => (
                    <option key={note.id} value={note.id}>
                      {note.consultation_date} — {note.chief_complaint || "Consultation note"}
                    </option>
                  ))}
                </select>
              </label>
              {mindmapNote ? <SessionMindmap note={mindmapNote} /> : null}
            </>
          )}
        </section>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Verify** — `npm run typecheck` passes.

---

### Task 7: Clients page card arrow + deep links

**Files:**
- Modify: `app/(workspace)/clients/page.tsx`

- [ ] **Step 1:** In the card, add an arrow link at the top of the article and rewire the footer buttons:

```tsx
<article className="client-card" key={patient.patientId}>
  <Link
    aria-label={`Open ${patient.displayName}`}
    className="client-card-arrow"
    href={`/clients/${encodeURIComponent(patient.patientId)}`}
  >
    <ArrowUpRight aria-hidden="true" size={16} />
  </Link>
  ...
  <div className="client-card-footer">
    <Link className="ghost-button" href={`/record?patient=${encodeURIComponent(patient.patientId)}`}>
      Start Session
    </Link>
    <Link className="secondary-button" href={`/clients/${encodeURIComponent(patient.patientId)}?tab=chats`}>
      Query with Brain
      <ArrowUpRight aria-hidden="true" size={14} />
    </Link>
  </div>
</article>
```

- [ ] **Step 2: Verify** — `npm run typecheck`.

---

### Task 8: Record-page preselection (`?patient=`)

**Files:**
- Modify: `app/(workspace)/record/page.tsx`
- Modify: `app/components/scribe-dashboard.tsx`
- Modify: `app/components/assign-session-modal.tsx`

- [ ] **Step 1: record page** — accept searchParams and pass through:

```tsx
export default async function RecordPage({
  searchParams,
}: {
  searchParams: Promise<{ patient?: string }>;
}) {
  const { patient } = await searchParams;
  const notesStoragePath = join(process.cwd(), "data", "notes.json");
  const noteRepository = createNoteRepository(notesStoragePath);
  const notes = await noteRepository.listAll().catch(() => []);

  return <ScribeDashboard initialNotes={notes} initialPatientId={patient} />;
}
```

- [ ] **Step 2: ScribeDashboard** — add `initialPatientId?: string` to `ScribeDashboardProps`, accept it, and pass `initialClientId={initialPatientId}` to `<AssignSessionModal />`.

- [ ] **Step 3: AssignSessionModal** — add `initialClientId?: string` prop; seed the selection in an effect placed BEFORE the `if (!isOpen) return null` early return:

```ts
useEffect(() => {
  if (!isOpen || !initialClientId || selectedClient) return;
  const match = allClients.find((c) => c.patientId === initialClientId);
  if (match) setSelectedClient(match);
}, [isOpen, initialClientId, selectedClient, allClients]);
```

(`allClients` is derived each render; the effect is cheap and idempotent.)

- [ ] **Step 4: Verify** — `npm run typecheck`.

---

### Task 9: Styles, gitignore, DECISIONS.md

**Files:**
- Modify: `app/globals.css`
- Modify: `.gitignore`
- Modify: `DECISIONS.md`

- [ ] **Step 1:** Append `client-detail-*` / `client-chats-*` / `client-card-arrow` styles to `globals.css`, reusing existing tokens (check nearby classes for the CSS variable names in use — e.g. card borders, muted text colors): card arrow (absolute top-right icon button), detail header layout, tab spacing, profile field grid (label/value rows like the mockup), session list accordion, chat thread date headers.
- [ ] **Step 2:** Add `data/chats.json` under the existing `data/patients.json` line in `.gitignore`.
- [ ] **Step 3:** Append a DECISIONS.md entry: per-client chat history stored in local `data/chats.json` (local-first, gitignored, Supabase sync deferred); persisted chat is display-only and never re-enters the Brain query pipeline.
- [ ] **Step 4: Verify** — `npm run lint` clean.

---

### Task 10: Full verification loop (Definition of Done)

- [ ] `npm run typecheck` — clean
- [ ] `npm run lint` — clean
- [ ] `npm test` — all green (including unchanged brain isolation/adversarial suites)
- [ ] `npm run build` — clean
- [ ] Manual pass (`npm run dev`): card arrow → detail page → tabs render; Chats "New chat" → `/rawaan-ai?patient=<id>` preselected → ask a question → answer renders → back to client Chats tab shows the entry → reload `/rawaan-ai` and reselect patient → latest thread resumes. Also: "Start Session" opens `/record?patient=<id>` and the assign modal has the client preselected after a recording.

## Self-review notes

- Spec coverage: §3 store → T1; §4 actions → T2; §5.1/5.2/5.3 → T6; §5.4 → T7; §5.5 + §6 → T3/T4/T5; §7 → T8; §8 tests → T1/T3/T10; §9 → T9.
- Type consistency: `ChatThread`/`StoredChatEntry` (T1) used verbatim by T2 actions and T6 chats tab; `BrainChatEntry` structurally matches `ChatThread["entries"][number]` so `load-thread` accepts `latest.entries` directly.
- Grounding: no task touches `lib/brain/*`; isolation tests are a required green at T3 and T10.
