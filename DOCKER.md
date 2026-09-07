# Running Rawaan in Docker (Judge Quickstart)

Run the entire Rawaan Patient Context Engine in a single command with Docker.

---

## 🚀 Quickstart (One Command)

### Option 1: Docker Compose (Recommended)

```bash
docker compose up --build
```

Open **[http://localhost:3000](http://localhost:3000)** in your browser.

---

### Option 2: Standard Docker

```bash
# 1. Build the image
docker build -t rawaan .

# 2. Run the container
docker run -p 3000:3000 --env-file .env.local rawaan
```

*(If you don't have a `.env.local` file, simply omit `--env-file .env.local` — Rawaan will start immediately with local storage and you can enter a Groq API key in **Settings** or test with pre-seeded clinical notes).*

---

## 🩺 What Judges Can Test Immediately

Once the app is running at `http://localhost:3000`:

1. **Rawaan AI (ChatGPT-style Clinical Brain)**:
   - Navigate to `/rawaan-ai`
   - Select **Amina Khan**, **Tariq Mahmood**, or **Aashir Aslam** from the top right
   - Click any quick clinical prompt (e.g. *"What plan was discussed?"*, *"What symptoms were reported?"*)
   - Inspect the citations mapping to approved consultation notes
   - Test conversational follow-ups: *"In detail please"*, *"Summarize this"*
   - Observe strict grounding: ask something unrecorded (e.g. *"Was the patient diagnosed with asthma?"*) and notice the engine truthfully declines: *"No record of that for this patient."*

2. **Clients Directory & History**:
   - Navigate to `/clients`
   - Click on any client to view their sessions, mind map, and previous chat logs (accordion click-to-open).

3. **Clinical Scribe & Voice Recording**:
   - Navigate to `/scribe`
   - Test recording or reviewing audio consultations in Urdu or English.

4. **Doctor Consultation Harness**:
   - Navigate to `/settings`
   - Test queries against any patient's record directly from the diagnostic harness.

---

## 🛠️ Environment Variables (Optional)

| Variable | Description |
|---|---|
| `GROQ_API_KEY` | Groq API Key for Whisper ASR & LLM answer generation |
| `LLM_MODEL` | LLM model name (defaults to `qwen/qwen3.8-27b`) |
| `NEXT_PUBLIC_SUPABASE_URL` | Optional Supabase cloud database URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Optional Supabase anonymous key |

*All patient records and chat history fall back gracefully to persistent local JSON files (`data/`) if Supabase is not configured.*
