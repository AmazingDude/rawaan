# PRD: Patient Context Engine ("Clinical Scribe + Brain")
*AI Hackathon Pakistan 2026 — Healthcare Track*

**Status:** Draft for stress-testing
**Owner:** [Team name]
**Last updated:** 7 Aug 2026

---

## 1. Problem Statement

Doctors and therapists in Pakistan — especially in high-volume public hospitals and clinics — see a large number of patients per day, and many patients return repeatedly over weeks, months, or years (chronic conditions, therapy, follow-ups). Two compounding problems result:

1. **Documentation doesn't happen.** With minimal time per patient and mostly paper-based or no record-keeping, doctors rarely have time to write detailed notes during or after a consultation. What gets recorded is often a one-line scrawl, if anything.
2. **Even when notes exist, they're not usable later.** A patient returning after 3 months, or seeing a different doctor/specialist, effectively starts from zero — there's no quick way for a clinician to recall "what did we try last time," "what's this patient's history with this symptom," or "has this come up before."

For therapists specifically, this is worse: continuity of context across sessions (what was discussed last time, recurring themes, mood/symptom trends) is core to the quality of care itself, not just administrative record-keeping.

## 2. Goal

Build a tool that:
- **Captures** a consultation as a structured note automatically, with near-zero extra effort from the clinician (the "Scribe")
- **Stores** that note against the patient's ongoing record
- **Recalls** relevant history on demand — the clinician can ask a natural-language question about a patient and get an answer grounded in that patient's actual past notes (the "Brain")

The pitch in one line: *we don't just save doctors time writing notes — we make sure the notes that currently don't exist actually get captured, and instantly usable next time.*

## 3. Non-Goals (explicitly out of scope for the hackathon MVP)

- Not a diagnostic tool. The system never generates new medical judgments, treatment suggestions, or diagnoses — it only captures and retrieves what a clinician actually said/decided.
- Not integrated with any real hospital EHR/record system.
- Not handling insurance, billing, or claims (unlike the US-context tools this is loosely inspired by).
- Not built for multi-clinic or multi-tenant use — single clinician/single clinic demo only.
- Not attempting real-time streaming transcription — turn-based recording is acceptable.
- Not persisting real patient data beyond the demo (all data should be treated as sensitive and handled accordingly — see Section 8).

## 4. Users / Personas

| Persona | Context | Primary need |
|---|---|---|
| General physician (public hospital) | Sees 40–80 patients/day, minimal time per patient | Fast, near-zero-effort note capture |
| Therapist / psychiatrist | Sees fewer patients but needs deep continuity across sessions | Recall of past sessions, recurring themes, symptom trends over time |
| Specialist receiving a referral | Meeting a patient for the first time, referred by another doctor | Quick summary of relevant history without re-interviewing the patient from scratch |

## 5. Core User Stories

1. *As a doctor,* after a consultation, I want the system to have already produced a structured note from our conversation, so I don't have to write it myself.
2. *As a doctor,* I want to review and approve/edit the generated note before it's saved, so I stay in control of the medical record.
3. *As a doctor,* when a returning patient sits down, I want to ask "what's this patient's relevant history?" and get a concise, accurate summary pulled from their actual past notes.
4. *As a therapist,* I want to ask "what themes have come up in this patient's last few sessions?" and get an honest summary grounded only in what was actually discussed.
5. *As a clinician,* I never want the system to invent or infer information that wasn't actually said or recorded.

## 6. Functional Requirements

### 6.1 Scribe (Capture)
- Record audio of a consultation (turn-based: press record, press stop)
- Transcribe audio to text (ASR)
- Generate a structured note from the transcript using a fixed template:
  - Chief complaint
  - History/symptoms discussed
  - Assessment/observations
  - Plan/next steps discussed
- Present the draft note to the clinician for review, edit, and approval
- Save the approved note against the patient's record, timestamped

### 6.2 Brain (Recall)
- Store each approved note in a retrievable per-patient store
- Accept a natural-language query about a specific patient (e.g. "has she mentioned chest pain before?")
- Retrieve relevant past note(s) for that patient
- Generate a concise answer **strictly grounded in retrieved notes** — if nothing relevant exists, say so explicitly rather than guessing
- Display which past note(s) the answer was drawn from (source transparency — important for clinician trust)

### 6.3 Demo Data
- Since real accumulated history doesn't exist in a 6-day window, seed each demo patient with 2–4 synthetic "past visit" notes (written by the team) to populate the Brain before the live demo
- Live demo then adds one *new* real consultation on top via the Scribe, and shows the Brain answering a question that spans both the seeded history and the new note

## 7. Technical Architecture

```
[Consultation Audio]
        ↓
   [ASR: Whisper]
        ↓
   [Transcript]
        ↓
[LLM: structured note generation, fixed template]
        ↓
[Clinician review/edit UI] → [Approved Note]
        ↓
[Per-patient note store (simple DB / vector store)]
        ↓
[Clinician query: natural language] → [Retrieval] → [LLM: grounded summary] → [Answer + source notes shown]
```

- **ASR:** Whisper (open-source, handles Urdu/English/code-switched speech reasonably well)
- **Note generation & retrieval-answering LLM:** GPT-4-class or Claude, prompted with a fixed clinical note template and strict "answer only from provided notes" instructions
- **Storage:** For the hackathon, a simple structured store (e.g. one JSON/DB record per note, tagged by patient ID) is sufficient — a full vector database is not required at this scale (a handful of notes per demo patient), though one can be used if the team is comfortable with it
- **Frontend:** Persistent sidebar workspace layout with four dedicated pages: (1) Record / Scribe consultation capture & dashboard (`/record`), (2) Clients directory (`/clients`), (3) Rawaan AI Brain recall & Q&A (`/rawaan-ai`), and (4) Learn Rawaan clinical guide (`/learn-rawaan`).

## 8. Data, Privacy & Risk Notes

- All demo "patients" and consultations must be clearly fictional/role-played — no real patient data should be used or discussed, given hackathon time constraints don't allow for proper consent/privacy handling
- The system must never present itself as making a diagnosis or treatment recommendation — this should be explicit in the UI (e.g. a persistent "this tool assists documentation only" note)
- Retrieval answers must be traceable to source notes to avoid the appearance of the AI "knowing" something it invented

## 9. Key Risks

| Risk | Mitigation |
|---|---|
| ASR accuracy on medical terms / code-switched Urdu-English speech | Test early against real sample consultations (even scripted ones) before demo day |
| LLM hallucinating patient history that wasn't actually said | Strict retrieval-grounded prompting; explicitly say "no record of that" when nothing relevant is found |
| Demo history feels artificial since it's seeded, not real | Be transparent with judges about this being simulated continuity for demo purposes — honesty here is a strength, not a weakness |
| Scope creep into building a full EHR system | Explicitly hold the line at the Non-Goals in Section 3 |
| Clinical note template doesn't feel authentic/usable to an actual doctor | If possible, get a doctor (even informally, a family contact) to sanity-check the note template before build week |

## 10. Success Criteria for the Hackathon Demo

- Live consultation → structured note generated and reviewable within the demo, no crashes
- A patient-history query correctly retrieves and summarizes information from seeded past notes
- The system correctly declines to answer when asked about something not in any note (proves it's not hallucinating)
- Judges can clearly see the "before" (nothing captured) and "after" (structured, queryable record) in under 5 minutes

## 11. 6-Day Build Plan (22–27 Aug)

| Day | Focus |
|---|---|
| 1 | ASR + note-generation pipeline working end-to-end (rough) |
| 2 | Note template refinement; clinician review/edit UI |
| 3 | Per-patient storage; seed synthetic historical notes |
| 4 | Query/retrieval + grounded-answer generation |
| 5 | UI polish across both Scribe and Brain views; source-transparency display |
| 6 | Full demo rehearsal, edge-case testing (e.g. "no history found" case), buffer |

## 12. Open Questions (for stress-testing)

- Should the Brain support queries across *multiple* patients (e.g. "how many patients this month reported this symptom") or strictly single-patient recall? (Recommend: single-patient only for MVP — multi-patient analytics is a materially larger scope.)
- How is "approval" of a note handled in the UI — a simple edit-and-save, or a more formal sign-off flow?
- Does the team have access to even one real clinician to validate the note template and demo realism before build week?
- What's the fallback if Whisper's accuracy on the chosen language/dialect is too low during testing — is there a simpler manual-entry fallback path for the live demo?
