# Rawaan Landing Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Execute the tasks in order and preserve the completed Scribe workflow while validating each route.

**Goal:** Replace the root Scribe entry with a single-screen Rawaan landing page and expose the existing Scribe workflow at `/scribe`.

**Architecture:** Keep the Next.js App Router application as one codebase. The root `app/page.tsx` becomes a static, server-rendered landing page that uses `next/link` for its single forward action. A new `app/scribe/page.tsx` renders the unchanged client-side `ScribeWorkspace`, while the existing approval Server Action revalidates `/scribe` rather than the landing route.

**Tech Stack:** Next.js App Router, React, TypeScript, CSS custom properties in `app/globals.css`, `next/link`, existing Playwright E2E tooling.

**Spec:** `docs/DESIGN.md`, `docs/no-slop.md`, `AGENTS.md`, and the user-approved landing brief: one dark Canopy Green hero screen; one Coral “Try the Demo” action linked to `/scribe`; no account/auth controls; optional abstract texture only if it remains low-opacity and legible, otherwise solid Canopy Green.

## Global Constraints

- Use DM Sans and only the design tokens in `docs/DESIGN.md`.
- Keep a single Coral primary action in the landing viewport. Do not add a secondary button pair.
- Use no shadow, gradient, generic card grid, fake application window, stock/lifestyle photography, or content-hidden entrance animation.
- Keep all Scribe labels, schema, data flow, Server Actions, persistence behavior, and existing workflow semantics intact apart from the required route revalidation change.
- The landing hero must stay fully visible without JavaScript and must remain usable at narrow widths.
- Leave `inspo/` unmodified and use it only as a layout/motion reference, never as a source of colors, typography, branding, or copy.
- Keep the combined pull request deferred until after landing-page review.

---

### Task 1: Define the landing hero and route boundaries

**Files:**
- Create: `app/components/landing-page.tsx`
- Modify: `app/page.tsx`
- Create: `app/scribe/page.tsx`
- Modify: `app/actions.ts:64-79`

**Interfaces:**
- `LandingPage` is a server-rendered React component and uses `Link` with `href="/scribe"`.
- `app/page.tsx` exports the root landing route.
- `app/scribe/page.tsx` exports the existing `ScribeWorkspace` route.
- `approveDraftAction` retains its signature and changes only `revalidatePath("/")` to `revalidatePath("/scribe")`.

- [ ] **Step 1: Create the landing component**

```tsx
import Link from "next/link";

export function LandingPage() {
  return (
    <main className="landing-shell">
      <section className="landing-hero" aria-labelledby="landing-title">
        <nav className="landing-nav" aria-label="Primary navigation">
          <p className="landing-brand">RAWAAN</p>
          <p className="landing-product">Patient Context Engine</p>
        </nav>
        <div className="landing-content">
          <p className="landing-index">Consultation documentation, kept reviewable.</p>
          <h1 id="landing-title">Notes that stay with the patient.</h1>
          <p className="landing-summary">Rawaan turns a fictional consultation transcript into a structured note for clinician review, editing, and explicit approval.</p>
          <Link className="landing-demo-link" href="/scribe">Try the Demo</Link>
        </div>
      </section>
    </main>
  );
}
```

- [ ] **Step 2: Make the root route render the landing page**

```tsx
import { LandingPage } from "@/app/components/landing-page";

export default function HomePage() {
  return <LandingPage />;
}
```

- [ ] **Step 3: Add the dedicated Scribe route**

```tsx
import { ScribeWorkspace } from "@/app/components/scribe-workspace";

export default function ScribePage() {
  return <ScribeWorkspace />;
}
```

- [ ] **Step 4: Revalidate the Scribe route after approval**

```ts
revalidatePath("/scribe");
```

- [ ] **Step 5: Typecheck the route boundary**

Run: `npm run typecheck`
Expected: exit code 0.

### Task 2: Add responsive, design-system-compliant landing styling

**Files:**
- Modify: `app/globals.css`
- Modify: `docs/DESIGN.md`

**Interfaces:**
- The landing component owns only `landing-*` classes.
- Existing Scribe selectors remain unchanged in behavior and visual hierarchy.
- CSS uses the existing token set and no image asset is required; a solid Canopy Green surface is the approved imagery fallback.

- [ ] **Step 1: Add full-viewport landing styles**

```css
.landing-hero {
  min-height: 100svh;
  color: var(--color-paper-white);
  background: var(--color-canopy-green);
}

.landing-demo-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 48px;
  padding: 12px 24px;
  border-radius: var(--radius-buttons);
  color: var(--color-paper-white);
  background: var(--color-coral-action);
  font-weight: 600;
  text-decoration: none;
}
```

- [ ] **Step 2: Compose one coherent first viewport**

Use a treated navigation row, a restrained two-line maximum heading, a single CTA, and an honest transcript → review → approval statement. Preserve intentional negative space without splitting the hero into a default text-left/product-right SaaS composition. Keep content visible by default; use only color-state transitions with a `prefers-reduced-motion` fallback.

- [ ] **Step 3: Document the landing component spec**

Add a `Landing Hero` entry to `docs/DESIGN.md` defining: solid Canopy Green full-viewport hero; DM Sans; one Coral “Try the Demo” action; the `/scribe` destination; no account controls; no shadows/gradients; optional texture skipped in favor of the solid-color fallback unless it passes legibility review.

- [ ] **Step 4: Run lint**

Run: `npm run lint`
Expected: exit code 0.

### Task 3: Update route-aware tests and docs

**Files:**
- Modify: `tests/e2e-scribe.mjs:12`
- Modify: `app/layout.tsx:13-16`
- Modify: `README.md`
- Modify: `docs/HANDOFF.md`

**Interfaces:**
- Existing Scribe E2E begins at `http://127.0.0.1:3000/scribe`.
- The landing route is covered by a small browser check that verifies its single `/scribe` call to action.

- [ ] **Step 1: Retarget the existing Scribe E2E**

```js
await page.goto("http://127.0.0.1:3000/scribe", { waitUntil: "networkidle" });
```

- [ ] **Step 2: Broaden the root metadata**

```ts
export const metadata: Metadata = {
  description: "A clinician-controlled patient context engine for fictional demo consultations.",
  title: "Rawaan | Patient Context Engine",
};
```

- [ ] **Step 3: Update documentation**

Document `/` as the landing page and `/scribe` as the documentation workflow. In `docs/HANDOFF.md`, record that the system and landing work are still local on `design/system-and-landing`, the combined PR remains deferred by user request, and the design system will be available to Brain UI work after that combined PR is merged.

- [ ] **Step 4: Run focused test coverage**

Run: `npm run test`
Expected: all existing tests pass.

### Task 4: Production validation and review

**Files:**
- No product file is required unless a defect is found.

- [ ] **Step 1: Build production output**

Run: `npm run build`
Expected: static routes include `/` and `/scribe`.

- [ ] **Step 2: Exercise both routes in production**

Start `npm run start`, then use the installed Chromium override. Verify the landing CTA navigates to `/scribe`; execute transcript → draft → edit → approve → persisted confirmation at `/scribe`; reset `data/notes.json` to `[]` and stop the temporary server afterwards.

- [ ] **Step 3: Capture and inspect responsive screenshots**

Capture the root landing page at a desktop viewport and a 375px-wide viewport. Confirm the first viewport is intentional, readable, no text is clipped, no content depends on motion, no shadows/gradients appear, and exactly one Coral primary action is present.

- [ ] **Step 4: Final diff review and local commit**

Run `git diff --check` and stage only landing/route/docs/test changes. Create an isolated landing commit. Do not push or open a PR; the user explicitly deferred the combined PR until after landing-page review.
