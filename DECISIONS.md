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

## 2026-08-27 — Use Groq Chat Completions for Brain grounded-answer generation

**Decision:** The future Brain LLM provider boundary will use Groq's OpenAI-compatible Chat Completions endpoint, `https://api.groq.com/openai/v1/chat/completions`, through plain server-side `fetch`. It will reuse the existing `GROQ_API_KEY` from `.env.local`; no `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, client-side key, `NEXT_PUBLIC_` key, or additional billing-enabled provider is authorized. The default model will be `openai/gpt-oss-120b`. An optional `LLM_MODEL` override may select `llama-3.3-70b-versatile` only after an explicit review establishes that the primary model underperforms the Task 5 exact JSON-compliance tests; this is a documented fallback candidate, not automatic runtime failover.

**Why:** The same Groq account and server-only key already support the verified Scribe Whisper integration, so this keeps the provider boundary small and avoids an additional provider setup that is unavailable without paid billing. Groq documents GPT-OSS 120B as supporting JSON Object Mode and JSON Schema Mode, capabilities suited to Task 5's strict `{\"answer\":\"...\",\"cited_note_ids\":[...]}` contract. Groq's published free-plan baseline for `openai/gpt-oss-120b` is 30 RPM, 1,000 RPD, 8,000 TPM, and 200,000 TPD. These are provider-published baseline limits, not a guaranteed entitlement; the account limits page remains authoritative. The documented fallback, `llama-3.3-70b-versatile`, supports JSON Object Mode and is selected through the same explicit `LLM_MODEL` override mechanism.

**Alternative rejected for this demo:** OpenRouter's no-credit free-model route has a 50 requests-per-day limit and its `openrouter/free` router randomly selects from currently available free models, whose availability changes frequently. That makes it a weaker fit for a fixed, repeatable JSON-contract demo than the selected Groq model.

**Supersedes:** This decision supersedes the original Anthropic/OpenAI provider wording in `plans/2026-08-24-brain-feature.md`. It authorizes only documentation and future Task 4 planning. It does **not** authorize implementation of `lib/llm/provider.ts`, `.env.example`, answer generation, a live API call, or any further Brain task.

**Sources:** [Groq OpenAI Compatibility](https://console.groq.com/docs/openai); [Groq GPT OSS 120B](https://console.groq.com/docs/model/openai/gpt-oss-120b); [Groq Llama 3.3 70B](https://console.groq.com/docs/model/llama-3.3-70b-versatile); [Groq Rate Limits](https://console.groq.com/docs/rate-limits); [OpenRouter Limits](https://openrouter.ai/docs/api_reference/limits); [OpenRouter Free Models Router](https://openrouter.ai/docs/guides/routing/routers/free-router).
