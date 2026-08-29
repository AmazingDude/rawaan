# Rawaan — Design Reference
> forest-green clinic, calm and structured — adapted from Turn.io's "Chat for impact" system for a clinician-facing documentation tool.

**Theme:** light

Rawaan uses a warm, clinically-confident visual system built around one anchor color: a deep forest green that already appears in the current app's headline treatment. Soft pastel card washes (mint, sky, cream, lilac) replace flat white/gray cards to create visual rhythm between sections without adding clutter. A single coral action color is reserved exclusively for the primary forward action on each screen (Create draft, Approve note, Ask a question) — so there is never ambiguity about what to click next. Typography uses Onest for every UI, form, navigation, and body-text role. Thestral Neue is the sole scoped exception: it appears only in the largest landing hero headline, creating one editorial moment without altering the working clinical interface. Components are flat and borderless — depth comes from color-surface stepping, not shadows — which keeps the interface calm and readable, appropriate for a tool clinicians will use during or right after a consultation.

Optional: the abstract green/blue motion-blur imagery may be used as a subtle, low-opacity background texture behind the dark hero band only (see Imagery section) — decorative, never behind readable content.

## Tokens — Colors

| Name | Value | Token | Role |
|---|---|---|---|
| Canopy Green | `#0a3922` | `--color-canopy-green` | Hero/header background, primary heading color on light surfaces — the dominant brand anchor |
| Coral Action | `#ff643b` | `--color-coral-action` | The ONE primary action color: Create draft, Approve, Ask. Never used decoratively |
| Leaf Accent | `#1dbf73` | `--color-leaf-accent` | Success states ("Approved", "Saved"), positive status pills, focus rings |
| Recording Red | `#e5484d` | `--color-recording-red` | **Active-recording state only** — the Stop control and recording-indicator dot while capture is in progress. Not a general accent color and not a second CTA color. |
| Deep Teal | `#003642` | `--color-deep-teal` | Secondary outline accent for tags/dividers — never promote to CTA |
| Ink Black | `#000000` | `--color-ink-black` | Primary body text, strong borders |
| Charcoal | `#333333` | `--color-charcoal` | Headings on light/pastel surfaces |
| Graphite | `#3d3d3d` | `--color-graphite` | Secondary text, icon strokes |
| Slate | `#7a7a7a` | `--color-slate` | Meta text, captions, timestamps |
| Ash | `#a6a6a6` | `--color-ash` | Placeholder text, disabled states, secondary borders |
| Frost Gray | `#e0e0e0` | `--color-frost-gray` | Hairline dividers on white surfaces |
| Mint Wash | `#d2f2e3` | `--color-mint-wash` | Card surface — draft/neutral state cards |
| Sky Wash | `#ccf0f8` | `--color-sky-wash` | Card surface — Brain/query answer cards |
| Sage Wash | `#e4f7ee` | `--color-sage-wash` | Card surface — approved/success cards |
| Peach Wash | `#ffede8` | `--color-peach-wash` | Card surface — warning/uncertainty cards (e.g. "uncertainties" note field) |
| Lilac Wash | `#fdf0ff` | `--color-lilac-wash` | Card surface — secondary/info cards |
| Cream | `#faf7e8` | `--color-cream` | Alternate warm background variant |
| Paper White | `#ffffff` | `--color-paper-white` | Input fields, inner content surfaces, nav background |

## Tokens — Typography

**UI/body font:** Onest [1] everywhere in the application and across landing-page navigation, eyebrow, body, CTA, workflow, labels, and controls. It is self-hosted from the official Google Fonts source under the SIL Open Font License (OFL).

**Display Serif (landing hero + workspace page titles):** Thestral Neue [2] is reserved for the single largest headline, **“Notes that stay with the patient.”**, on the root landing hero, **and** for each workspace page's own H1 title (Record, Clients, Rawaan AI, Learn Rawaan) at the `heading`/`heading-lg` size tokens — page titles, not marketing headlines, so never at `display` size. *(2026-08-29 deliberate rule change: previously "landing hero only"; extended so each workspace "room" gets one editorial moment.)* It is self-hosted under the OFL. No other landing copy, screen, field, button, status, or card may use it.

**Weights used:** Onest 400 (body), 500 (UI/labels), 600 (headings/buttons), and 700 (emphasis); Thestral Neue 700 for the landing hero headline and the workspace page titles.
**Letter spacing:** -0.028em at ≥52px, -0.019em at 32–48px, normal below that.

| Role | Size | Line height | Weight | Token |
|---|---|---|---|---|
| caption | 12px | 1.2 | 400 | `--text-caption` |
| body-sm | 14px | 1.38 | 400 | `--text-body-sm` |
| body | 16px | 1.38 | 400 | `--text-body` |
| body-lg | 18px | 1.4 | 400 | `--text-body-lg` |
| subheading | 20px | 1.33 | 500 | `--text-subheading` |
| heading-sm | 24px | 1.3 | 600 | `--text-heading-sm` |
| heading | 32px | 1.2 | 600 | `--text-heading` |
| heading-lg | 48px | 1.14 | 600 | `--text-heading-lg` |
| display | 64px | 1.05 | 600 | `--text-display` |

Note: this is intentionally toned down from the source system's 116px display size — Rawaan is a working clinical tool used inside a browser tab during appointments, not a marketing landing page, so headline sizes stay in the 32–64px range across the whole app, not just the homepage.

### Font sources

[1]: https://fonts.google.com/specimen/Onest "Onest — Google Fonts"
[2]: https://xcicero.esad-gv.net/page/thestral/index.php "Thestral Neue — X Cicéro"

## Spacing & Shape

- Base unit: 4px
- Page max-width: 1120px (slightly narrower than a marketing site — this is a working tool, not a scroll-y landing page)
- Section gap: 48px
- Card padding: 24px
- Element gap: 8px

| Element | Radius |
|---|---|
| icons | 8px |
| tags/status pills | 9999px |
| cards | 20px |
| buttons | 40px (pill) |
| inputs | 12px |

## Elevation

No box-shadow for elevation, anywhere. Depth comes entirely from surface-color stepping: page canvas → white card → pastel card → dark green band. This is a deliberate calm/clinical choice, not a stylistic default — shadows read as "app chrome," flat color reads as "considered document."

## Components

### Primary Coral Button
**Role:** The one forward action per screen — "Create structured draft", "Approve note", "Ask Rawaan"
`background: #ff643b; color: #ffffff; font: 16px/600; padding: 12px 24px; border-radius: 40px; border: none; box-shadow: none;`
Never use coral for more than one button in the same viewport. If a screen needs a second action, it's a Ghost Outline Button, not a second coral one.

### Ghost Outline Button
**Role:** Secondary action beside a primary — "Cancel", "Edit again", "Back"
`background: transparent; border: 1px solid #000000; color: #000000; font: 16px/500; padding: 12px 24px; border-radius: 40px;`

### Recording Stop Control
**Role:** A stateful capture control that appears only while a fictional-demo recording is live.

Use a solid Recording Red (`#e5484d`) fill with white text and no border for **“Stop recording”**; retain the shared 40px pill radius and capture-button padding. Use the same token for the matching indicator dot beside the visible timer. It is not a forward CTA: do not use Coral Action, shadows, gradients, or any other recording-red treatment outside this active state.

### Status Pill
**Role:** Draft / Approved / No supporting record — small state indicator on notes and answers
`padding: 4px 12px; border-radius: 9999px; font: 12px/600;`
- Draft: background `#d2f2e3` (mint), text `#0a3922`
- Approved: background `#e4f7ee` (sage), text `#1dbf73`
- No supporting record: background `#ffede8` (peach), text `#a6432b` (darker coral-adjacent, for contrast — not the action coral itself)

### Scribe Review Section
**Role:** Group the structured note review into the three readable sections: **Subjective** (chief complaint, history, symptoms), **Assessment & Plan** (assessment, plan, medications), and **Follow-up & Notes** (follow-up, uncertainties).
`background: #ffffff; border-radius: 20px; padding: 24px; border: 1px solid #e0e0e0;`
Each section title is 20px/600 Charcoal. Use subtle `#e0e0e0` internal dividers between fields rather than a separate bordered card around every field. On wide viewports, pair naturally short fields in two columns; fields stack to one column on narrow viewports. Labels remain 14px/600 Charcoal, with editable text areas in 16px/400 Ink Black. The "uncertainties" field specifically uses a `#ffede8` (Peach Wash) surface to flag clinician attention, without any colored left accent.

### Explicit Absence State
**Role:** Distinguish a transcript that explicitly records an absence from a parser omission without changing the stored note schema.

When a structured transcript line explicitly says `None`, `None mentioned`, `Not mentioned`, or `N/A`, render a small sage inset reading **“None mentioned in transcript”** above the empty review field. When the field is empty because no usable value was extracted, render a restrained cream inset reading **“No documented items extracted.”** Do not use placeholder text as the only indication of either state.

### Approved Note Lock State
**Role:** Make a saved note read unmistakably as read-only.

After explicit approval, preserve the visible note content but disable all consultation and review controls. Use a quiet gray fill, muted text, default cursor, and no editable-looking focus or resize affordance for the disabled fields. Change the status pill to **“Approved · saved”** in Sage/Leaf. The action area should offer **“Start new consultation”**, which resets only local form and draft UI state; it must not alter persisted records or routing.

### Step Card (Scribe workflow)
**Role:** "Step 1: Enter consultation context" / "Step 2: Review and approve" — the two-column workflow container
`background: #ffffff; border-radius: 20px; padding: 24px; border: 1px solid #e0e0e0;`
Step label ("STEP 1") in 12px/600 uppercase Slate, tracked wide. Step title in 24px/600 Charcoal directly below. On desktop widths above the two-column breakpoint, Step 1 is `position: sticky` with a modest top offset so consultation context remains visible while reviewing the longer Step 2 form. Disable the sticky behavior at and below the single-column breakpoint.

### Brain Answer Card
**Role:** Response to a clinician's question, when supporting notes exist
`background: #ccf0f8 (Sky Wash); border-radius: 20px; padding: 24px;`
Answer text 16px/400 Ink Black. Below it, a row of small source citation chips (see below) — never render an answer without at least one citation chip attached.

### No-Supporting-Record Card
**Role:** The explicit refusal state — must look visually distinct from a normal answer, not just a text difference
`background: #ffede8 (Peach Wash); border-radius: 20px; padding: 24px; border: 1px solid #a6432b;`
Icon + "No record of that" in 16px/600, explanatory line in 14px/400 Slate below. This card should never contain a coral button or any action that looks like "generate an answer anyway."

### Source Citation Chip
**Role:** Attached under every Brain answer, shows which approved note(s) it came from
`background: #ffffff; border: 1px solid #ccf0f8; border-radius: 9999px; padding: 4px 12px; font: 12px/500;`
Shows note date + patient display name, e.g. "Aug 12, 2026 · Amina Khan". Clicking opens the source note.

### Patient Context Header
**Role:** Persistent strip showing which patient's data is currently in view — critical for the "never mix patients" guarantee
`background: #0a3922; color: #ffffff; padding: 12px 24px; font: 14px/500;`
Always visible when a patient is selected. Shows patient ID + display name. This is a deliberate, slightly heavy-handed visual choice — the point is that a clinician (or a judge watching the demo) should never be able to forget which patient's context they're in.

### Landing Page
**Role:** The root-route introduction to Rawaan. It provides a single, honest entry point to the working Scribe at `/scribe`.

#### Navigation Bar
Use one horizontally aligned bar, vertically centered within the dark hero. The left lockup contains the **RAWAAN** wordmark with **Patient Context Engine** as a tightly spaced small-caps subtitle directly below it. The right side uses the existing `safety-label` pill treatment for **“Documentation support only”**. Do not distribute the lockup, subtitle, and disclosure as three unrelated floating text elements.

#### Hero Column
Use a solid Canopy Green (`#0a3922`) hero bounded to roughly 600–720px tall rather than an oversized `100vh` frame. Place the eyebrow, headline, body copy, and the one Coral **“Try the Demo”** link in one constrained left column, 560–640px wide. Use 12px from eyebrow to headline, 24px from headline to body, and 32px from body to CTA. The display headline must not exceed 64px, uses `-0.028em` letter spacing, and is the only location that uses Thestral Neue; one meaningful word may use Leaf Accent (`#1dbf73`) for emphasis. The hero has no accounts, authentication controls, secondary CTA, box-shadow, gradient, fake product window, or stock imagery.

#### Pastel Workflow Section
Place a Cream (`#faf7e8`) or Mint Wash section directly below the hero. Render **Transcript**, **Clinician review**, and **Approved note** as three connected Step Card-style items: each uses a small Status Pill-like numbered marker, a concise title, and one sentence of explanation. At wide widths a subtle horizontal connector visually relates the three steps; at narrow widths the cards stack without a decorative rail. Place the fictional-demo disclosure inside or immediately after this section, not alone at the base of the hero. Current implementation deliberately uses the solid-color hero fallback: omit the optional texture unless it remains subordinate to text at low opacity and passes screenshot review.

### Top Navigation Bar
`background: #ffffff; border-bottom: 1px solid #e0e0e0; padding: 16px 24px;`
Logo/wordmark left ("RAWAAN · PATIENT CONTEXT ENGINE" in 12px/600 uppercase Canopy Green — this already exists and is good, keep it). Nav/status right, no coral in the nav bar itself — coral is reserved for in-page primary actions only.

### Compliance Banner
**Role:** The existing "Fictional demo data only..." disclosure banner
`background: #d2f2e3 (Mint Wash); padding: 16px 20px; border-radius: 12px;`
Keep this — it's doing real work (both product-honesty and hackathon-judging-honesty). Use a flat pastel fill only: no left-side accent bar, shadow, or generic alert treatment.

## Personality — per-page temperature *(2026-08-29)*

Each workspace page reads as a different "room" via a **header band** tinted with one wash (the page body stays neutral/white, per the flat, calm language). Only existing tokens are used; flat surfaces, no shadows/gradients.

| Page | Header band wash | Notes |
|---|---|---|
| `/record` | Mint Wash | kept close to prior warm feel |
| `/clients` | Lilac Wash | |
| `/rawaan-ai` | Sky Wash | reinforces the Sky Wash answer cards |
| `/learn-rawaan` | Peach Wash | warm, informational tone |

**Idle icon color pass:** "Record in-person" mic tile = Sky Wash bg + Deep Teal stroke; "Record a summary" waveform tile = Lilac Wash bg + Deep Teal stroke; Rawaan AI nav icon = Deep Teal (the blue token, matching its Sky wash). Clients (Leaf) and Learn (Canopy) nav icons unchanged. Completed/historical session badges = neutral Slate on frost so they recede and live action cards stay the focus.

**Warm empty/loading states:** flat placeholders (Scribe review-before-draft, Rawaan AI empty thread, Clients empty roster, Record empty session list) get a small lucide icon in a white rounded tile plus brief, professional, warmer copy — clinical-but-warm, never cutesy.

**Hard constraints (unchanged):** Recording Red `#e5484d` stays reserved exclusively for the active-recording Stop control + timer dot (never idle icons or washes). Coral stays reserved for exactly one primary CTA per screen. No shadows, no gradients.

## Do's and Don'ts

### Do
- Use Onest for all UI and body roles; use Thestral Neue only for the landing hero headline and the four workspace page titles (see Typography) — do not introduce a third typeface
- Reserve `#ff643b` coral for exactly one primary action per screen
- Use the pastel wash rotation for card backgrounds instead of white/gray — mint for neutral/draft, sky for Brain answers, peach for warnings/no-record states, sage for success/approved
- Keep all radii from the defined scale (8 / 12 / 16 / 20 / 40 / 9999px) — no ad-hoc values
- Keep the Patient Context Header visible at all times when a patient is in view

### Don't
- Don't use box-shadow anywhere — surface color stepping only
- Don't use colored left-border accent bars on banners, callouts, or note sections
- Don't use coral decoratively, or on more than one button per screen
- Don't let the No-Supporting-Record card look like a normal answer card with different text — the color/border difference must be immediate, at a glance, before reading
- Don't push display type past 64px anywhere in the app — this is a working tool, not a marketing site
- Don't use Google Sans: it is Google’s proprietary in-house typeface and is not licensed for self-hosting or embedding
- Don't introduce accent hues beyond Coral (primary action), Leaf (success), and the strictly active-recording-only Recording Red — keep the palette disciplined

## Imagery

Rawaan does not use lifestyle or stock photography — there's no real clinician imagery to use honestly for a hackathon demo tool, and stock healthcare photos would undercut the "fictional demo data only" honesty the product already commits to.

**Optional hero texture:** the abstract green/blue motion-blur images may be used as a decorative background layer behind the dark Canopy Green hero band on the landing/home screen only — at low opacity (15–20%), blended under the solid `#0a3922` color, never directly behind readable text or inside working screens (Scribe workflow, note review, Brain query). Treat it the way Revolte.ai uses its abstract gradient hero background: texture, not content. If it doesn't read cleanly at low opacity behind dark green, skip it — a solid Canopy Green hero is a perfectly good fallback and matches the rest of the system either way.

## Layout

Single-column max-width 1120px container, centered, with 24px horizontal padding on smaller viewports. Working screens (Scribe, Review, Brain query) are NOT full-bleed marketing layouts — they're application screens, so keep vertical rhythm tighter (48px section gaps, not 64–96px) and prioritize getting to working UI fast over hero-scale whitespace. The two-column Step 1/Step 2 layout already in place is good and should be kept, just restyled per the Step Card spec above.

## Quick Start — CSS Custom Properties

```css
:root {
  /* Colors */
  --color-canopy-green: #0a3922;
  --color-coral-action: #ff643b;
  --color-leaf-accent: #1dbf73;
  --color-deep-teal: #003642;
  --color-ink-black: #000000;
  --color-charcoal: #333333;
  --color-graphite: #3d3d3d;
  --color-slate: #7a7a7a;
  --color-ash: #a6a6a6;
  --color-frost-gray: #e0e0e0;
  --color-mint-wash: #d2f2e3;
  --color-sky-wash: #ccf0f8;
  --color-sage-wash: #e4f7ee;
  --color-peach-wash: #ffede8;
  --color-lilac-wash: #fdf0ff;
  --color-cream: #faf7e8;
  --color-paper-white: #ffffff;

  /* Typography */
  --font-ui: var(--font-onest), ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --font-display: var(--font-thestral-neue), Georgia, "Times New Roman", serif; /* landing hero headline only */
  --text-caption: 12px;
  --text-body-sm: 14px;
  --text-body: 16px;
  --text-body-lg: 18px;
  --text-subheading: 20px;
  --text-heading-sm: 24px;
  --text-heading: 32px;
  --text-heading-lg: 48px;
  --text-display: 64px;

  /* Spacing */
  --spacing-unit: 4px;
  --page-max-width: 1120px;
  --section-gap: 48px;
  --card-padding: 24px;
  --element-gap: 8px;

  /* Radius */
  --radius-icons: 8px;
  --radius-inputs: 12px;
  --radius-cards: 20px;
  --radius-buttons: 40px;
  --radius-pills: 9999px;
}
```

### Tailwind v4

```css
@theme {
  --color-canopy-green: #0a3922;
  --color-coral-action: #ff643b;
  --color-leaf-accent: #1dbf73;
  --color-deep-teal: #003642;
  --color-mint-wash: #d2f2e3;
  --color-sky-wash: #ccf0f8;
  --color-sage-wash: #e4f7ee;
  --color-peach-wash: #ffede8;
  --color-lilac-wash: #fdf0ff;
  --color-cream: #faf7e8;

  --font-ui: var(--font-onest), ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --font-display: var(--font-thestral-neue), Georgia, "Times New Roman", serif; /* landing hero headline only */

  --radius-cards: 20px;
  --radius-buttons: 40px;
  --radius-pills: 9999px;
  --radius-inputs: 12px;
}
```

## Source

Adapted from the "Chat for impact" (Turn.io) design system on refero.design, chosen over alternatives (Ease Health / botanical serif, Function / terracotta apothecary, Revolte.ai / dev-tools SaaS) because it is purpose-built for healthcare trust, already aligns with the forest-green anchor present in Rawaan's existing UI, and its single-CTA-color discipline maps directly onto the app's draft → review → approve workflow.