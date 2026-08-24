# Scribe UI Restyle — Step 1 Plan

**Goal:** Apply the approved Rawaan design system to the existing Scribe workflow without changing its data flow, text, controls, routes, or clinical behavior.

**Scope:** This branch completes only the design-system setup and the existing root-route Scribe restyle. The landing page and `/scribe` route move are explicitly deferred pending user review.

## Files

| Path | Change |
|---|---|
| `docs/DESIGN.md` | Canonical Rawaan visual-system reference supplied by the user. |
| `app/layout.tsx` | Load the verified DM Sans font through Next.js. |
| `app/globals.css` | Add design tokens and restyle shared Scribe elements with responsive, reduced-motion-safe behavior. |
| `app/components/scribe-workspace.tsx` | Add styling-only class names for the defined note-field, banner, status, and card variants. |

## Constraints

- Preserve current strings, inputs, buttons, labels, event handlers, server-action calls, and accessibility roles so existing unit and E2E tests remain valid.
- Use the colors, typography, spacing, radii, and component definitions in `docs/DESIGN.md`.
- Keep content visible by default. Motion must be purposeful, subtle, and disabled or reduced under `prefers-reduced-motion`.
- Do not use shadows, decorative coral, more than one coral action per viewport, landing-page sections, new routes, authentication, stock imagery, or the inspiration page’s colors/fonts/content.
- Leave `inspo/**` untracked and untouched; it is a local reference asset, not application source.

## Verification

- Run typecheck, lint, unit tests, and production build.
- Exercise transcript → draft → edit → approve → persisted confirmation in a browser.
- Capture screenshots of the initial Step 1 / Step 2 workflow and the populated note-review state.
- Recheck the finished UI against `docs/DESIGN.md` and `docs/no-slop.md`, then stop for user approval before Step 2.
