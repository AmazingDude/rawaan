# Rawaan visual onboarding

The public `/how-to-use` page and authenticated **Learn Rawaan** page share the
same guide. The landing page shows a short overview. Record shows a Start here
card when there are no approved sessions, plus a permanent guide link.

The guide covers recording without a selected client, assignment or client
creation afterward, transcript/draft review, approval, past sessions, and AI.
The summary text-entry option is labeled **Write a summary**.

## Tutorial production

Production tools are isolated in `tools/tutorial-video`; HyperFrames is not a
dependency of the deployed application. Install the pinned tooling with:

```powershell
npm ci --prefix tools/tutorial-video
```

Requirements: Node 22+, FFmpeg/FFprobe on PATH, and installed Playwright Chromium.
The delivered clips were produced with Node 22.19.0 and FFmpeg 8.0.1 locally.
Optional `TUTORIAL_CHROME`, `TUTORIAL_FFMPEG`, and `TUTORIAL_FFPROBE` variables can
point at existing executables. The browser resolver reuses installed Playwright
revisions on Windows for capture and posters. HyperFrames manages its own headless
browser for rendering (`hyperframes browser ensure`). If needed,
`TUTORIAL_HYPERFRAMES_CHROME` overrides that executable separately.

From the repository root:

```powershell
npm run tutorials:capture
npm run tutorials:produce
npm run tutorials:render
npm run test:guide:e2e
```

Capture mounts actual workspace components with mocked actions and a fictional
fixture from `data/seed/tutorial-session.json`. The harness blocks external
requests and never writes to Supabase. It exercises microphone setup, a capture,
new-client assignment, note editing/approval, reopening, source links, and plan
review. Keep all case details in the seed fixture, never in product logic.

Production reads `GROQ_API_KEY` from `.env.local` on the server. Enable and accept
the terms for `canopylabs/orpheus-v1-english` in Groq Console first. Narration uses
the English `hannah` voice and the documented 200-character input limit. WAV
responses are cached by input/model/voice hash, so interrupted generation can
resume without regenerating completed speech. No credential is written into
assets, captions, HTML compositions, or browser bundles.

The 25-second overview reuses selected narration sentences from the first-session
walkthrough. This keeps its voice consistent and avoids additional speech calls.

The source scripts create editable HTML compositions, copy local fonts/assets,
normalize narration loudness, and write measured chapter timing to
`lib/guides/media-timing.json`. HyperFrames checks precede each render. Native
1080p MP4s, posters, captions, and text transcripts live in `public/tutorials`.
Regenerate timing and videos together after editing narration. Treat those
static files as part of the release; no runtime TTS call is needed.

The composition check reports Studio organization warnings for standalone scene
groups and a repeated-image discovery warning for the reused AI screen. Inspect
the delivered frames after rendering these timelines. Runtime, layout, and
contrast audits must pass with zero errors. Rendering uses the strict error gate,
local assets, and disabled telemetry.

To inspect visuals without generating speech, run:

```powershell
node tools/tutorial-video/produce.mjs --prepare-only
node tools/tutorial-video/render.mjs --posters-only
```

This prepares visual previews only. Final rendering rejects compositions marked
as not narrated. Run normal production again before delivering videos.

## Verification

The guide browser check tests initial media deferral, real playback and captions,
chapter seeking, pausing the previous video, keyboard activation, mobile width,
reduced-motion rendering, landing preview playback, and failed-video fallback.
Written instructions remain available independently of playback.

Run the artifact and access checks after rendering and building:

```powershell
node tools/tutorial-video/verify-media.mjs
node tools/tutorial-video/verify-routes.mjs
```

An optional speech QA pass transcribes only the generated instructional audio
through Groq and compares it with the caption script:

```powershell
node --env-file-if-exists=.env.local tools/tutorial-video/verify-narration.mjs
```

These checks write their reports under `plans/2026-10-08-visual-onboarding`.
The speech comparison checks intelligibility; it does not replace a human
listen-through or a first-time-user usability session.

Check signed-out access to `/how-to-use` and `/tutorials/*.mp4`, and confirm
`/record`, `/clients`, `/rawaan-ai`, and API routes still require authentication.
Review rendered scene samples and audio; use FFprobe to confirm 1920×1080 video,
an audio stream, and duration matching measured timing. Run the normal repository
typecheck, lint, tests, and build before release.

Only static instructional content is public. Tutorial links to workspace actions
use ordinary authenticated routes. Watching a tutorial does not generate a note,
register tutorial clients, or mark a lesson completed in the user's account.
