# Record Entry Flows Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use subagent-driven development (recommended) or executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route each Record dashboard action into its truthful, usable workflow: microphone capture, clinician-entered summary, or a blank manual note.

**Architecture:** Keep `RecordSessionModal` exclusive to microphone capture. Add a small summary-entry modal that passes a `summary` session into the existing client assignment and draft-generation path. Represent blank notes as `manual` sessions, create their schema-valid draft directly after client selection, and render structured field editors only for manual drafts in the existing workspace.

**Tech Stack:** Next.js 16 App Router, React 19 client components, TypeScript, Zod, Playwright, Vitest.

**Spec:** `docs/PRD.md` §5.2, §6.1, §8; approved Record-flow behavior in the current task conversation.

## Global Constraints

- Keep `RecordSessionModal` unchanged and exclusive to the Record in-person action.
- Capture only clinician-entered information; do not invent diagnoses, treatment, or transcripts.
- Do not persist a note until the clinician approves it.
- Retain raw provenance for every note and use fictional data only in browser tests.
- Keep the diff focused on the Record entry workflows and their current E2E test.

---

### Task 1: Establish current Record-flow regression coverage

**Files:**
- Modify: `tests/e2e-scribe.mjs`

**Interfaces:**
- Consumes: `/record` dashboard action buttons and modal accessible names.
- Produces: a browser test that proves each entry control opens the correct first step.

- [ ] **Step 1: Replace legacy selectors with current dashboard checks**

```js
await page.getByRole("button", { name: "Record in-person" }).click();
await expect(page.getByRole("heading", { name: "Record an In-Person Session" })).toBeVisible();

await page.getByRole("button", { name: "Record a summary" }).click();
await expect(page.getByRole("heading", { name: "Record a Summary" })).toBeVisible();

await page.getByRole("button", { name: "Create empty note" }).click();
await expect(page.getByRole("heading", { name: "Assign Session" })).toBeVisible();
```

- [ ] **Step 2: Run the browser test against the unmodified application**

Run: `python ".agents/skills/webapp-testing/scripts/with_server.py" --server "npm run start -- --hostname 127.0.0.1" --port 3000 -- node tests/e2e-scribe.mjs`

Expected: FAIL because the summary and empty-note actions open `RecordSessionModal`.

- [ ] **Step 3: Keep regression assertions focused on the public UI**

```js
await page.getByLabel("Session summary").fill("Clinician-entered session summary.");
await page.getByRole("button", { name: "Continue to assign client" }).click();
await expect(page.getByText("Dictated Summary", { exact: true })).toBeVisible();
```

- [ ] **Step 4: Rerun after Tasks 2–4 complete**

Run: `node tests/e2e-scribe.mjs`

Expected: PASS and print the current Record entry-flow success message.

### Task 2: Model pending Record sessions and add manual summary capture

**Files:**
- Create: `app/components/manual-summary-modal.tsx`
- Modify: `app/components/scribe-dashboard.tsx:95-171, 348-351, 534-562`

**Interfaces:**
- Consumes: clinician-entered `consultationDate` and non-empty `transcript`.
- Produces: `onContinue({ consultationDate: string, transcript: string })` from `ManualSummaryModal` and a `PendingSession` discriminated by `sessionType`.

- [ ] **Step 1: Write the modal contract and accessible form fields**

```tsx
interface ManualSummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onContinue: (data: { consultationDate: string; transcript: string }) => void;
}

<label className="form-field">
  <span>Session summary</span>
  <textarea aria-label="Session summary" required value={transcript} />
</label>
```

- [ ] **Step 2: Replace `pendingRecording` with a pending session shape**

```ts
type PendingSession = {
  consultationDate: string;
  recordingDevice?: string;
  recordingDurationSeconds?: number;
  sessionType: "in-person" | "summary" | "upload" | "manual";
  transcript: string;
  transcriptSource: string;
};
```

- [ ] **Step 3: Route only Record a summary to the summary modal**

```tsx
<button className="action-card" onClick={() => setIsSummaryModalOpen(true)} type="button">
  <h3 className="action-card-title">Record a summary</h3>
</button>
```

- [ ] **Step 4: Generate summary drafts through the existing action with truthful metadata**

```ts
session_info: {
  recorded_at: new Date().toISOString(),
  session_type: "summary",
  transcript_source: "Clinician-entered summary",
},
```

- [ ] **Step 5: Preserve existing in-person and upload behavior**

Run: `npm run typecheck`

Expected: PASS with the same in-person `Whisper Large v3` session metadata and upload workflow behavior.

### Task 3: Add the direct blank manual-note path

**Files:**
- Modify: `app/components/scribe-dashboard.tsx:136-171, 422-428, 546-561`
- Modify: `lib/notes/schema.ts:6-12`
- Modify: `app/components/assign-session-modal.tsx:8-24, 237-395`
- Modify: `app/components/session-info-view.tsx:18-26, 65-83`

**Interfaces:**
- Consumes: a selected `ClientRecord` and a pending `manual` session.
- Produces: a schema-valid `NoteDraft` with empty clinical fields, manual provenance, and `session_info.session_type === "manual"`.

- [ ] **Step 1: Extend the session schema and visible label**

```ts
session_type: z.enum(["in-person", "telehealth", "summary", "upload", "manual"]),
```

```ts
manual: "Manual Note",
```

- [ ] **Step 2: Route Create empty note directly to assignment**

```ts
function handleCreateEmptyNote() {
  setPendingSession({
    consultationDate: new Date().toISOString().slice(0, 10),
    sessionType: "manual",
    transcript: "No transcript was provided. This note was created manually.",
    transcriptSource: "Clinician-created manual note",
  });
  setIsAssignModalOpen(true);
}
```

- [ ] **Step 3: Configure assignment copy for manual notes**

```tsx
<AssignSessionModal
  recordingSubtitle="Manual Note"
  recordingTitle="Untitled manual note"
  deleteLabel="Discard note"
/>
```

- [ ] **Step 4: Build the manual draft without calling `generateDraftAction`**

```ts
const draft: NoteDraft = {
  approval_status: "draft",
  assessment_discussed: [],
  chief_complaint: "",
  consultation_date: pendingSession.consultationDate,
  email: client.email,
  first_name: client.firstName,
  follow_up: "",
  history: [],
  last_name: client.lastName,
  medications_mentioned: [],
  mobile_number: client.mobileNumber,
  patient_display_name: client.displayName,
  patient_id: client.patientId,
  plan_discussed: [],
  raw_transcript: pendingSession.transcript,
  session_info: {
    recorded_at: new Date().toISOString(),
    session_type: "manual",
    transcript_source: pendingSession.transcriptSource,
  },
  summary: "",
  symptoms: [],
  uncertainties: [],
};
```

- [ ] **Step 5: Keep no-audio fields accurate**

```tsx
<span className="session-info-value">{info?.recording_device || "Not recorded"}</span>
```

Run: `npm run test -- --runInBand`

Expected: PASS; no existing schema consumer rejects the new manual type.

### Task 4: Make manual drafts directly editable before approval

**Files:**
- Modify: `app/components/session-workspace-view.tsx:29-33, 57-83, 351-429`

**Interfaces:**
- Consumes: `isManualEntry?: boolean` from the dashboard and a `NoteDraft`.
- Produces: controlled structured form values that are passed unchanged to `approveDraftAction`.

- [ ] **Step 1: Add a narrow workspace capability flag**

```ts
interface SessionWorkspaceViewProps {
  draft: NoteDraft | ApprovedNote;
  isManualEntry?: boolean;
  onApprove?: (note: ApprovedNote) => void;
  onBack: () => void;
}
```

- [ ] **Step 2: Add controlled field updates without changing AI-generated note display**

```ts
function updateListField(
  field: "history" | "symptoms" | "assessment_discussed" | "plan_discussed" | "medications_mentioned" | "uncertainties",
  value: string,
) {
  setCurrentNote((note) => ({
    ...note,
    [field]: value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean),
  }));
}
```

- [ ] **Step 3: Render editable summary and structured fields only for manual drafts**

```tsx
{isManualEntry ? (
  <textarea aria-label="Chief complaint" onChange={(event) => updateTextField("chief_complaint", event.target.value)} value={currentNote.chief_complaint} />
) : (
  <p>{currentNote.chief_complaint || "No chief complaint entered."}</p>
)}
```

- [ ] **Step 4: Verify approval preserves edits**

Run: `npm run typecheck && npm run lint && npm run test`

Expected: PASS with no TypeScript or lint errors.

### Task 5: Complete production-style browser verification

**Files:**
- Modify: `tests/e2e-scribe.mjs`

**Interfaces:**
- Consumes: built application served on `127.0.0.1:3000`.
- Produces: evidence that the three entry actions no longer share one microphone modal.

- [ ] **Step 1: Build the application**

Run: `npm run build`

Expected: exit code 0.

- [ ] **Step 2: Run current Record-flow E2E coverage against production output**

Run: `python ".agents/skills/webapp-testing/scripts/with_server.py" --server "npm run start -- --hostname 127.0.0.1" --port 3000 -- node tests/e2e-scribe.mjs`

Expected: exit code 0 and verified in-person, summary, and blank-note entry paths.

- [ ] **Step 3: Inspect the final diff**

Run: `git diff --check && git status --short`

Expected: no whitespace errors and only the files listed in this plan.

## Self-Review

- **Spec coverage:** Tasks 2–4 cover clinician-controlled capture, review/edit, provenance, and approval boundaries from `docs/PRD.md`; Task 5 validates the public behavior.
- **Scope:** Client-context handoff, duplicate approval protection, recording-failure fallback, upload label corrections, favicon, and voice E2E replacement are explicitly excluded.
- **Type consistency:** `PendingSession.sessionType`, Zod `session_type`, `SessionInfoView` labels, dashboard metadata, and workspace `isManualEntry` all use the same `manual` literal.
- **Placeholder scan:** No deferred implementation or unspecified test step remains.
