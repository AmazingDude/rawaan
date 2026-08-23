# Handoff

## Current state

Work continues locally on branch `design/system-and-landing`. The completed Scribe design work is committed through `c5140a2` (`style: keep Scribe primary actions coral`). The user has approved the Scribe rounds and requested the landing page next. Landing implementation is complete and validated in the current local landing commit: `/` is the Rawaan landing page, while the preserved documentation workflow is at `/scribe`. The combined pull request is explicitly deferred until the landing page is reviewed; therefore this design system is not yet available in `main` for Brain UI work.

| Area | Current direction |
|---|---|
| Scope | Preserve the existing transcript → draft → edit → approve → persist workflow; make presentation and layout changes only. |
| Visual change | Remove colored left-border accent bars from banners and callouts; use flat pastel fills instead. |
| Step 2 layout | Organize the existing note fields into Subjective, Assessment & Plan, and Follow-up & Notes sections, with dividers and responsive two-column field pairing. |
| Step 1 layout | Keep the transcript card sticky above the 900px breakpoint and stacked normally at narrower widths. Fixed-viewport live-scroll verification confirmed it pins at a 24px top offset after scrolling. |
| Third-round UX | Added explicit transcript-absence messaging, a visibly locked approved-note state, and a local-only “Start new consultation” reset action. |
| Documentation | `docs/DESIGN.md` is the canonical reference for the no-accent, section-grouped, sticky layout, approved/empty Scribe states, and the landing hero. |
| Landing route split | Root `/` becomes one dark Canopy Green Rawaan landing hero. Its single Coral “Try the Demo” action routes to `/scribe`; the existing Scribe flow remains otherwise unchanged. |
| Branch process | Keep the combined design + landing PR local and deferred until the user reviews landing-page results. After the combined PR merges, the design system will be available for Brain UI work. |

## Constraints

The labels, field names, schema, state management, Server Actions, accessibility roles, and test selectors must remain unchanged. The `inspo/` directory is an untracked reference asset and must remain untouched. The design system still prohibits shadows, decorative coral, unnecessary motion, and content hidden by animation.

## Validation and environment notes

The second-round implementation was validated with `npm run typecheck`, `npm run lint`, `npm run test` (3 files and 8 tests), and `npm run build`; every command passed. A production-browser capture exercised transcript → draft → edit → approve → persisted confirmation. It asserted that the desktop Step 1 card is sticky, the compliance and message callouts have no left border, and the 800px layout makes all grouped review fields full-width with Step 1 no longer sticky. The unchanged `tests/e2e-scribe.mjs` script also passed against the production build.

The third-round sticky verification used separate 1440×900 viewport screenshots at scroll positions 0, 400px, and 800px rather than a stitched full-page capture. At 400px and 800px, Step 1 measured `position: sticky` with a 24px viewport top offset and rendered correctly. The prior detached full-page placement is a known capture artifact for sticky elements, not a live layout defect; do not use a stitched full-page image to assess sticky positioning.

The third-round implementation passed `npm run typecheck`, `npm run lint`, `npm run test` (3 files and 8 tests), and `npm run build`. A production-browser exercise verified the explicit transcript-absence and parser-omission states, the locked approved-note controls, the approved status pill, the local-only reset to an empty consultation, and the fixed-scroll sticky measurements. The unchanged `tests/e2e-scribe.mjs` script also passed on the production build.

On this Windows machine, use `npm run build` followed by `npm run start` for browser exercises; the development server has previously served client chunks unreliably. The optional `PLAYWRIGHT_CHROMIUM_EXECUTABLE` variable can point to the installed local Chromium. Browser test data was reset to `data/notes.json` containing `[]`, and temporary servers and test artifacts were removed.

The landing route split passed `npm run typecheck`, `npm run lint`, `npm run test` (3 files and 8 tests), and `npm run build`, which emitted both `/` and `/scribe`. A production browser check verified the root page’s single `/scribe` CTA, solid Canopy Green surface, absence of shadow/gradient, and responsive desktop/mobile layout. The updated production Scribe E2E passed on `/scribe`. One initial routed E2E timeout was traced to a stale development listener on port 3000; after stopping it and restarting `next start`, the flow passed unchanged.

## Next action

Present the local landing commit and screenshots for user review. Do not push, open a PR, or begin Brain work before the user’s next approval.
