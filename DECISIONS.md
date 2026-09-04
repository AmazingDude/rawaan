# Architecture Decisions

## 2026-08-22 — Start with a Next.js App Router + TypeScript monolith

**Decision:** Build the initial Scribe and Brain application as a single **Next.js App Router + TypeScript** project. Keep API routes, domain validation, persistence, and the clinician-facing UI in the same repository and deployment unit.

**Why:** `AGENTS.md` is the repository’s standing engineering governance and specifies Next.js App Router with strict TypeScript. The first Scribe vertical slice accepts a scripted or manually entered transcript, so neither live ASR nor Python orchestration is on the critical path. This keeps the earliest acceptance test small and deployable: transcript → schema-valid note draft → clinician edit/approval → persisted approved note.

**Boundary for later ASR:** If live ASR later requires a Python-only or materially stronger Python implementation, introduce it as a small, standalone service behind a narrow API boundary. Do not restructure the Next.js application merely to add ASR.

**Non-goals preserved:** The application does not diagnose, recommend treatment, answer from general medical knowledge, support multi-patient analytics, integrate with an EHR, or process real patient data.

## 2026-08-25 — Use Groq Whisper for Scribe batch transcription

**Decision:** The planned Scribe voice-input v1 will use Groq's OpenAI-compatible transcription endpoint, `https://api.groq.com/openai/v1/audio/transcriptions`, with model `whisper-large-v3-turbo`. The server-only provider adapter will read `GROQ_API_KEY` from `.env.local`; no key belongs in client code, source control, logs, or a `NEXT_PUBLIC_` variable.

**Why:** The project already names Whisper as its ASR direction. Groq provides an OpenAI-compatible route, supports the `whisper-large-v3-turbo` model, and its published free-plan baseline is sufficient for a small hackathon demo: 20 requests per minute, 2,000 requests per day, 7,200 audio seconds per hour, and 28,800 audio seconds per day. These remain provider-published baseline limits rather than a guaranteed entitlement for every account; the account's current limits page is authoritative.

**Audio policy:** The free-tier direct-upload limit is 25 MB. The endpoint documents direct support for `audio/webm` as well as FLAC, MP3, MP4, MPEG, MPGA, M4A, OGG, and WAV. Chrome desktop's typical `MediaRecorder` output, `audio/webm` with Opus, therefore needs no conversion in v1. The demo browser/OS support commitment is limited to the rehearsed environment, expected to be Chrome desktop; it is not a universal cross-browser guarantee.

**Honesty and scope boundary:** Audio-to-text becomes real only after a configured Groq key is present. Structured-note generation remains the explicitly labelled Local demo parser. This decision authorizes documentation and later provider-adapter planning only; Task 2 contracts/validation and all implementation code still require a separate explicit go-ahead.

**Sources:** [Groq Speech to Text](https://console.groq.com/docs/speech-to-text); [Groq Rate Limits](https://console.groq.com/docs/rate-limits).

## 2026-08-28 — Post-Recording Workflow, Client Assignment & AI Overview Workspace

**Decision:** The post-recording experience follows a 3-step structured workflow:
1. **Assign Session Modal (`AssignSessionModal`):** Recording completes -> doctor sees recording card with waveform, title `Rawaan-MM.DD.YY`, search dropdown to assign to an existing client, and actions `Delete Recording` / `Next`.
2. **Create A New Client View:** Inline sub-view with First Name, Last Name, Email (Optional), and Client Mobile Number (Optional - replacing pronouns).
3. **Session Note Workspace (`SessionWorkspaceView`):** Dedicated clinician document workspace with 7 navigation tabs (`Notes`, `Client`, `Treatment Plan`, `Transcript`, `Session Information`, `Mindmap`, `Reflection Questions`), full structured clinical note with narrative `Summary` and `Session Topics`, and an interactive **AI Overview** chat assistant pre-loaded with note context (`📄 [Client] - Note (BASE)`).

**Why:** Matches the clinician UX patterns in high-fidelity clinical scribes, keeps patient assignment explicit, provides instant multi-tab clinical context, and gives clinicians conversational AI transformations (e.g. paragraph format, de-identification/remove names, summarize key clinical points) without losing grounding or data provenance.

## 2026-09-02 — Dedicated Urdu Clinical Translation Engine & RTL Document View

**Decision:**
1. **Urdu Translation Strategy:** Implement a dual-layer translation pipeline (`lib/llm/translate-note-urdu.ts`) combining LLM-powered prompt execution (`NOTE_URDU_TRANSLATION_SYSTEM_PROMPT`) with a high-accuracy offline medical Urdu dictionary fallback (`translatePhraseToUrdu`, `translateSummaryToUrdu`).
2. **Language Boundary:** The language switch button translates strictly into Urdu (`اردو`) with RTL layout and Nastaliq typography (`.is-urdu-doc`, `.is-urdu-transcript`), preventing drift into other languages.
3. **Whisper Script Locking & Devanagari Sanitization:** Whisper STT is configured with `language: "ur"` and Urdu prompt context. Any residual Devanagari output is automatically transliterated to Perso-Arabic Urdu script via `devanagariToUrdu` to ensure provenance records strictly display in Urdu or English.
4. **Clinical Context File Attachment:** The workspace chat input allows clinicians to upload and attach external clinical reference documents (`.txt`, `.md`, `.json`, `.csv`, `.pdf`), injecting document context directly into the AI note modification prompt.

**Why:** Addresses Pakistani clinical workflow requirements where spoken consultations occur in Urdu or bilingual English/Urdu, ensures consistent localized documentation, eliminates non-intended Devanagari script output from Whisper, and enables clinicians to enrich notes with external lab/referral records.

## 2026-09-04 — Per-Client Chat History Stored Locally, Display-Only

**Decision:** Brain chat conversations are persisted per client in a local JSON store (`data/chats.json`, via `lib/db/chats.ts`) so the client detail page's Chats tab and the Rawaan AI page stay in sync. The store is local-first and gitignored like `data/patients.json`; Supabase sync for chats is deliberately deferred. A new chat deep-links to `/rawaan-ai?patient=<id>` with the client preselected, and selecting a patient resumes their most recent thread.

**Grounding boundary:** Persisted chat entries are **display-only** — they are never fed back into the Brain query pipeline, which still receives exactly `(patientId, question)` per turn. The Task-3 stateless-per-turn isolation contract is unchanged and remains test-enforced.

**Why:** Clinicians need continuity of the questions they asked about a client across sessions, but recall answers must stay grounded solely in approved notes. Local-first storage matches the hackathon deployment reality (Supabase optional) and avoids a schema migration for a demo-scale feature.


