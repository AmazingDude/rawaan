# Client Detail Page + Synced Per-Client Chat — Design

**Date:** 2026-09-04
**Status:** Approved by owner (direction delegated: "do the one you think is better")
**Spec authority:** `docs/PRD.md` — especially §3 (Non-Goals), §6.2 (Brain recall), §7 (storage), §10 (grounded-answer money shot).

## 1. Goal

Turn the Clients directory into a two-level experience:

1. Each client card gains an arrow that opens a per-client detail page at `/clients/[patientId]`.
2. The detail page has four tabs: **Details, Sessions, Chats, Mind map**.
3. The **Chats** tab shows every Brain conversation held for that client, persisted. A "New chat" button sends the clinician to `/rawaan-ai?patient=<id>` with the client preselected; the resulting Q&As are stored and appear in the client's Chats tab.

### Explicitly out of scope (PRD §3 non-goals / YAGNI)

- No **Diagnosis** tab (PRD §3: not a diagnostic tool).
- No **Care team** / multi-provider features (PRD §3: single clinician).
- No Files tab, no Treatment Plan tab, no "Desired outcomes" entity, no client export/delete in this iteration.

## 2. Approach decision (chat sync)

Chosen: **server-persisted chat store** (Approach A).

- New `lib/db/chats.ts` writing to `data/chats.json`, following the exact local-first conventions of `lib/db/patients.ts` / `lib/notes/repository.ts` (factory taking a storage path, tolerant of a missing file).
- Supabase sync for chats is deferred — notes remain the only synced entity; chat history is local runtime data (gitignored like `data/patients.json`).
- Rejected: localStorage sync (violates storage conventions, per-browser, untestable server-side); Supabase-only (breaks local-first deployments, requires schema migration).

### Grounding guarantee (non-negotiable)

Persistence is **display-only**. The Brain query pipeline still receives exactly `(patientId, question)` per turn — stored history is never fed back into the LLM context. The Task-3 isolation contract tests must stay green; new tests assert the store is write-only with respect to the query path.

## 3. Data model

`data/chats.json` — flat entry list (grouped into threads on read):

```ts
type StoredChatEntry = {
  id: string;            // `chat-<ts>-<rand>`
  patientId: string;
  threadId: string;      // `thread-<ts>-<rand>`; one thread per "New chat" session
  question: string;
  response: BrainResponse | { message: string; status: "error" }; // verbatim BrainChatEntry.response
  timestamp: string;     // ISO
};

type ChatThread = { threadId: string; startedAt: string; entries: BrainChatEntry[] };
```

Store API (`createChatStore(storagePath)`):

- `append(entry: StoredChatEntry): Promise<StoredChatEntry>` — creates the file lazily.
- `listThreads(patientId: string): Promise<ChatThread[]>` — filtered, grouped by threadId, threads and entries chronological.

## 4. Server actions (`app/actions.ts`)

- `listChatThreadsAction(patientId)` → `ChatThread[]` (never throws; `[]` on failure).
- `appendChatEntryAction({ patientId, threadId, entry })` → `{ ok: true } | { ok: false; message }`.
- `getClientDetailAction(patientId)` → `{ client: ClientRecord | null; notes: ApprovedNote[] }` — one call for the detail page; notes sorted by `consultation_date` descending.

## 5. Routing & pages

### 5.1 `app/(workspace)/clients/[patientId]/page.tsx` (new, server component)

- `export const dynamic = "force-dynamic"` (roster/notes change at runtime).
- Awaits `params` and `searchParams` (Next 15+ async convention — verify against `node_modules/next/dist/docs` before writing).
- Loads `{ client, notes }` via `getClientDetailAction`. Unknown patient → friendly in-page "Client not found" empty state with a back link (no hard 404 for demo safety).
- Renders `<ClientDetailView client={...} notes={...} initialTab={searchParams.tab} />`.

### 5.2 `app/components/client-detail-view.tsx` (new, client component)

- Header: `← All clients` link, display name + "Individual" badge, `N sessions / Since <Mon YYYY>` (derived from notes), "Record a session" button → `/record?patient=<id>`.
- Tab bar (Details | Sessions | Chats | Mind map), client-side tab state seeded from `initialTab`.
- **Details**: profile card — first name, last name, email, phone (from `ClientRecord`; "N/A" when absent), client ID.
- **Sessions**: newest-first list of approved notes (date, chief complaint, summary); click expands a read-only detail (symptoms, plan, follow-up).
- **Mind map**: reuses `SessionMindmap` with a session picker dropdown; defaults to the most recent note; empty state when no notes.

### 5.3 `app/components/client-chats-tab.tsx` (new, client component)

- On mount: `listChatThreadsAction(patientId)`.
- "New chat" button → `router.push("/rawaan-ai?patient=<id>")`.
- Threads rendered newest-first with a date header; each entry reuses the extracted `ChatEntryCard` (citations included).
- Empty state: "No chats yet for this client" + the New chat button.

### 5.4 `app/(workspace)/clients/page.tsx` (modify)

- Card gains an arrow icon button (top-right) → `/clients/<patientId>`.
- "Start Session" → `/record?patient=<patientId>`.
- "Query with Brain" → `/clients/<patientId>?tab=chats`.

### 5.5 `app/(workspace)/rawaan-ai/page.tsx` (modify)

- Reads `searchParams.patient`, passes `initialPatientId` to `<BrainChat />`.

## 6. BrainChat changes (`brain-chat.tsx` / `brain-chat-state.ts`)

- New optional prop `initialPatientId?: string`. Once patients load, if set and nothing selected, dispatch `select-patient` for it.
- Component-level `activeThreadId: string | null`. On patient select: load threads via `listChatThreadsAction`; if any exist, resume the most recent thread — set `activeThreadId` and dispatch new `load-thread` reducer action with its entries; else blank state.
- On submit: existing `runBrainChatQuery` flow, then `appendChatEntryAction` with `activeThreadId ??= newThreadId()`. Persistence failure logs a console warning only — the on-screen answer is unaffected.
- "New chat": dispatches existing `new-chat` (clears the view) and resets `activeThreadId` to null (next submit starts a fresh thread). Stored history is untouched.
- Reducer: add `{ type: "load-thread"; entries: BrainChatEntry[] }` — sets entries, clears draft/submitting. `select-patient` and `new-chat` semantics unchanged (existing tests stay green).
- Extract `ChatEntryCard` into `app/components/brain-chat-entry-card.tsx` for reuse by the Chats tab.

## 7. Record-page preselection

- `app/(workspace)/record/page.tsx`: pass `searchParams.patient` through as `<ScribeDashboard initialPatientId />`.
- `ScribeDashboard`: forwards it to `AssignSessionModal` as new optional `initialClientId`.
- `AssignSessionModal`: when opened and clients are loaded, seeds `selectedClient` from `initialClientId` (clinician can still change it). No auto-advance; the recording flow is unchanged otherwise.

## 8. Testing

- `tests/chat-store.test.ts` (new): append creates file; listThreads groups/filters/sorts; per-patient isolation; all four response variants (supported / no_supporting_record / refused / error) survive a round-trip verbatim; missing-file tolerance.
- `tests/brain-chat.test.ts` (extend): `load-thread` replaces entries and clears draft/submitting; `select-patient` after `load-thread` still wipes entries (no cross-patient leak); isolation regression test unchanged and green.
- Definition of done: `npx tsc --noEmit`, lint, `npm test`, `npm run build`, plus a manual pass: card arrow → detail page → New chat → chat on /rawaan-ai → history visible in Chats tab and on returning to /rawaan-ai.

## 9. Misc

- `.gitignore`: add `data/chats.json` (runtime data, same as `data/patients.json`).
- `DECISIONS.md`: short entry recording the local-JSON chat store + display-only persistence decision.
- Styles: new `client-detail-*` classes in `globals.css`, reusing existing tokens; tab bar reuses the `workspace-tab-btn` pattern.

## 10. Non-goals for this change

- No Supabase chat sync, no chat deletion/editing, no cross-patient chat views, no diagnosis/treatment-plan features, no changes to retrieval, ranking, or answer generation.
