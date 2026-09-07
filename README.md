# 🩺 Rawaan (روان) — Patient Context Engine
### AI-Powered Clinical Scribe & Longitudinal Patient Brain
**Bano Qabil Hackathon 2026 — Healthcare Track**

[![Next.js](https://img.shields.io/badge/Next.js-16.3.2-black?logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19-blue?logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Groq](https://img.shields.io/badge/Groq-LPU%20Inference-f55036)](https://groq.com/)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker)](https://www.docker.com/)
[![License](https://img.shields.io/badge/License-MIT-green)](./LICENSE)

---

> *"We don't just save doctors time writing notes — we ensure the notes that currently don't exist in Pakistani clinics actually get captured, and become instantly usable the next time the patient returns."*

---

## ⚡ 1-Minute Quickstart for Hackathon Judges

Run the entire production application in **one command** with Docker. No Node.js or dependency installation required:

```bash
docker compose up --build
```

Then open **[http://localhost:3000](http://localhost:3000)** in your browser!

*(For manual Docker commands and environment setup, see [DOCKER.md](./DOCKER.md)).*

---

## 🎯 The Problem & Our Innovation

In Pakistani public hospitals and busy private clinics, doctors routinely consult **40 to 80 patients per day**. Under severe time pressure:

1. **Documentation doesn't happen**: Due to heavy patient loads and paper-based workflows, doctors rarely have time to write thorough notes. A one-line prescription scribble is often all that exists.
2. **Longitudinal context is lost**: When a patient returns after 3 months, or sees a different specialist, they start from zero. There is no instant way to recall *"what medication did we try last time?"*, *"how long has this pain persisted?"*, or *"what were the recurring symptoms?"*.
3. **Language barrier**: Consultations happen in **Urdu, Roman Urdu, English, and regional dialects** interchangeably. Western AI scribes are built for English-only US hospital EHRs and fail in Pakistani clinical settings.

### Rawaan's Two Symbiotic Pillars:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            RAWAN PATIENT CONTEXT ENGINE                     │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
            ┌──────────────────────────┴──────────────────────────┐
            ▼                                                     ▼
 🎙️ 1. THE CLINICAL SCRIBE                             🧠 2. THE PATIENT BRAIN
 • Passive bilingual recording (Urdu/English)         • ChatGPT-style longitudinal recall
 • Groq Whisper Large v3 Turbo transcription          • 100% grounded in approved notes
 • Auto-extracts structured clinical notes            • Cites exact notes & dates
 • Clinician review & approval workflow               • Zero hallucinations: declines unrecorded facts
```

---

## 🚀 Core Features

### 🎙️ 1. Bilingual Clinical Scribe (`/scribe`)
- **Ambient Voice Capture**: One-click in-person and telehealth recording.
- **Urdu & English Code-Switching**: Built for Pakistani clinical conversations (supports Nastaliq script, Urdu phonetics, and medical English terms).
- **Structured Note Generation**: Automatically synthesizes raw speech into:
  - Chief Complaint & Patient Summary
  - History of Present Illness
  - Documented Symptoms
  - Clinical Assessment & Discussion
  - Treatment Plan & Next Steps
  - Medications Mentioned & Dosages
  - Follow-up Timeline & Clinical Uncertainties
- **Doctor-in-the-Loop Safety**: No note enters the patient record without explicit clinician review, editing, and approval.

### 🧠 2. Rawaan AI Patient Brain (`/rawaan-ai`)
- **ChatGPT-Style Clinician UI**: Modern split-layout with collapsible chat logs on the left and conversation stream on the right.
- **Longitudinal Patient Context**: Remembers past visits across weeks and months.
- **Conversational Follow-ups**: Seamlessly handles contextual questions (*"In detail please"*, *"Summarize this"*, *"What about their medications?"*).
- **Strict Clinical Safety & Grounding**:
  - **Answers ONLY from approved records**.
  - **The "Money Shot" Zero-Hallucination Guarantee**: If asked about an unrecorded symptom, vital, or diagnosis (*"Was this patient diagnosed with asthma?"*), the Brain explicitly declines: *"No record of that for this patient."*
  - Refuses ungrounded medical advice or speculative treatments.
- **Cloud & Offline Resilience**: Persists conversations to Supabase with automatic local JSON fallback (`data/chats.json`).

### 📂 3. Longitudinal Client Directory (`/clients`)
- Complete roster of patients with visit counts and history timelines.
- **Session Mind Map**: Visual graph view mapping symptoms, assessments, and plans for holistic clinical review.
- **Click-to-Open Chat History**: Collapsible accordion logs of every previous AI interaction per patient.

### 🔬 4. Doctor Consultation Harness (`/settings`)
- Dedicated clinician sandbox to test queries against patient records.
- Inspects real-time citation matching, retrieval confidence, and latency before live consultations.
- BYOK (Bring Your Own Key) support for direct browser-to-Groq inference.

---

## 🧭 Step-by-Step Demo Script for Judges

To evaluate Rawaan in **under 3 minutes**:

### Step 1: Query the Patient Brain (`/rawaan-ai`)
1. Go to [http://localhost:3000/rawaan-ai](http://localhost:3000/rawaan-ai).
2. Select **Aashir Aslam** from the patient dropdown in the top right.
3. Click the quick prompt: **"What symptoms were reported in the documented visits?"**
   - *Result*: Brain cites the exact consultation date (`2026-08-31`) and summarizes the reported abdominal and body pain.
4. Now test conversational follow-up: Type **"In detail please"** into the chat input.
   - *Result*: Brain resolves the context and provides detailed excerpts from the consultation history.
5. Click **"What plan was discussed in the documented visits?"**
   - *Result*: Cites the plan to monitor pain for 48 hours, rest, and schedule an ultrasound.

### Step 2: Test the "Money Shot" (Zero-Hallucination Safety)
1. In the same chat with **Aashir Aslam**, ask:
   > *"Was the patient diagnosed with diabetes?"* or *"What was his blood pressure?"*
2. **Observe**: The AI refuses to hallucinate and truthfully states:
   > **"No record of that for this patient."**
   *(This proves the retrieval safety boundary is actively preventing medical hallucinations).*

### Step 3: View Longitudinal Records & Mind Map (`/clients`)
1. Go to [http://localhost:3000/clients/patient-aashir-aslam-8574](http://localhost:3000/clients/patient-aashir-aslam-8574).
2. Click the **Sessions** tab: Expand the consultation note to view structured clinical sections.
3. Click the **Mind map** tab: Explore the visual relationship graph of the patient's complaints and care plan.
4. Click the **Chats** tab: Click any previous conversation log to expand and inspect historical doctor-AI discussions.

### Step 4: Test the Consultation Harness (`/settings`)
1. Go to [http://localhost:3000/settings](http://localhost:3000/settings).
2. Under **Doctor Consultation Harness**, select **Amina Khan**.
3. Run a quick query: *"What follow-up was documented for this patient?"*
4. View the real-time latency benchmark and cited source note IDs.

---

## 🏗️ System Architecture

```
                 Clinician Audio / Manual Entry
                                │
                                ▼
               ┌─────────────────────────────────┐
               │    Groq Whisper Large v3 Turbo  │
               │   (Urdu & English Transcription)│
               └────────────────┬────────────────┘
                                │ Raw Transcript
                                ▼
               ┌─────────────────────────────────┐
               │   Structured Note Extraction    │
               │    (Chief Complaint, Plan, etc.)│
               └────────────────┬────────────────┘
                                │ Draft Note
                                ▼
               ┌─────────────────────────────────┐
               │  Doctor Review & Approval Gate  │ ◄── Clinician in the loop
               └────────────────┬────────────────┘
                                │ Approved Only
                                ▼
             ┌──────────────────┴──────────────────┐
             ▼                                     ▼
   [Supabase Cloud DB]                    [Local JSON Storage]
   (patients, notes, chats)               (data/notes.json fallback)
             │                                     │
             └──────────────────┬──────────────────┘
                                │ Approved Notes Store
                                ▼
               ┌─────────────────────────────────┐
               │    Rawaan Retrieval & Ranking   │
               │  • Token & Semantic Matching    │
               │  • Hard Patient Isolation       │
               │  • Stop-word / Dilution Filter  │
               └────────────────┬────────────────┘
                                │ Scored Evidence Excerpts
                                ▼
               ┌─────────────────────────────────┐
               │   Safety Classifier Boundary    │
               │  (Refuses general advice/drugs) │
               └────────────────┬────────────────┘
                                │ Valid Record Query
                                ▼
               ┌─────────────────────────────────┐
               │    Groq Qwen 3.8-27B Generator  │
               │  • 100% Grounded in Excerpts    │
               │  • Declines if Evidence Empty   │
               └────────────────┬────────────────┘
                                │ Answer + Note IDs Cited
                                ▼
               ┌─────────────────────────────────┐
               │    ChatGPT-Style Brain UI       │
               │  (/rawaan-ai multi-turn chats)  │
               └─────────────────────────────────┘
```

---

## 📦 Technology Stack

| Layer | Technology | Purpose |
|---|---|---|
| **Frontend Framework** | Next.js 16.3 (App Router), React 19 | Server Components, Streaming & fast SSR |
| **Styling** | Vanilla CSS & Design Tokens | Custom responsive design, dark/light clinical palettes, zero framework bloat |
| **Language** | Strict TypeScript 5.9 | Full type safety across clinical schemas and action boundaries |
| **Speech-to-Text (ASR)** | Groq Whisper Large v3 Turbo | Fast Urdu, Roman Urdu, and English audio transcription |
| **LLM Inference** | Groq LPU (`qwen/qwen3.8-27b`) | Low-latency grounded answer generation under strict JSON schemas |
| **Database & Sync** | Supabase (PostgreSQL) + Local JSON | Cloud multi-device persistence with reliable offline JSON fallback |
| **Testing** | Vitest, React Testing Library | 121 automated unit tests covering retrieval, safety, and action contracts |
| **Containerization** | Docker & Docker Compose | Multi-stage Alpine standalone image for instant judge evaluation |

---

## 🧪 Automated Testing & Verification

Rawaan has **121 automated unit tests** covering adversarial clinical queries, safety gates, note generation, and chat persistence:

```bash
# Run all unit tests
npm run test

# Run TypeScript validation
npm run typecheck

# Run linter
npm run lint

# Run production build
npm run build
```

---

## 🔒 Security & Privacy

- **No Hallucinated Treatment**: The system explicitly forbids generating unverified medical advice or treatment plans.
- **Patient Isolation**: The retrieval layer scopes notes strictly to the queried `patientId`. Multi-tenant leaks are impossible.
- **Audio Privacy**: Audio is processed in memory during transcription and is **never retained** on disk or sent to third-party ad networks.
- **BYOK Support**: Clinicians can store their personal Groq API key in browser `localStorage` to bypass shared servers entirely.

---

## 👥 Bano Qabil Hackathon Pakistan 2026 Team

- **Project**: Rawaan (روان) — Patient Context Engine
- **Track**: Healthcare Track
- **Contact & Repository**: [github.com/AmazingDude/rawaan](https://github.com/AmazingDude/rawaan)

*Built with passion to elevate healthcare documentation and clinical recall across Pakistan.*
