# Phase 3 — UI and routing

The history screen itself, how it's reached, and a browser check.
Colours, type, lowercase copy, icons and motion follow `PRODUCT.md` /
`branding.md` (binding). Use the `impeccable` skill for the visual pass.

## Deliverables

- [x] Hash route in `src/App.tsx`: a tiny `useHashRoute()` (listens to
      `hashchange`, returns `window.location.hash`). The `screen` becomes
      `'history'` when signed in and the hash is `#/history`. Loading, auth
      and landing keep their current precedence, and a signed-out visit to
      `#/history` lands on landing as before. The screen switch reuses the
      existing `pageVariants` transition via the `key={screen}` frame.
      Browser back returns to Today.
- [x] History icon: reused the existing, previously unused
      `src/components/icons/Clock.tsx` (already on the 24px/1.75px system)
      instead of drawing a new one. The back button reuses `ChevronLeft`.
- [x] Entry points on `src/pages/Today.tsx`: a `history` text button in the
      desktop rail (next to `start my day`) and an icon button in the mobile
      `header-right`, same class/pattern as the existing header buttons.
      Both set `location.hash = '#/history'`.
- [x] `src/pages/History.tsx`:
  - Header: back button (to `#/`), title `history`, preset chips
    (`today`, `yesterday`, `this week`, `last week`, `custom`). When
    `custom` is picked, it shows two `<input type="date">` fields.
  - Body: for each day, a heading with the formatted local date and
    `· Xh` when the total is > 0, then `done` rows, then `dropped` rows
    (muted).
  - Loading state reuses `TaskListSkeleton`. The no-results state reuses
    `EmptyState` with range-aware lowercase copy.
- [x] `src/components/HistoryRow.tsx`:
  - Title and tags (the same tag chip styling as `TaskRow`), plus the meta
    line `opened <d mon> · settled <HH:mm>` (or `let go <HH:mm>`, matching
    Today's existing "settled"/"let go" wording rather than done/dropped).
  - `done` rows get a compact decimal hours input (`inputMode="decimal"`)
    that saves on blur or Enter via `parseHours`, shows an inline error on
    bad input, and reverts on Escape.
  - A `reopen` action on both kinds of row.
- [x] Styles: a `/* History */` section appended to `src/styles/global.css`
      (all app styles live in that one file, so no new `history.css`), working at phone width (16px gutter, no horizontal
      scroll) and on the desktop layout, in light and dark mode.
- [x] Browser verification with `VITE_DEV_MODE=true npm run dev` and the
      Playwright MCP:
  - Opened history from both the mobile header icon (390px) and the desktop
    rail (1280px). Checked the `today`, `this week` and `custom`
    (10–23 sep) ranges, with seeded rows grouped by day. `yesterday`
    and `last week` weren't clicked through; their date math is covered by
    `history.test.ts`.
  - Entered `1,5`, which saved as 1.5 and updated the day total (4h). `30`
    showed "at most 24 hours" and wasn't saved.
  - Reopened a let-go task, and it appeared at the bottom of Today.
  - Browser back returned from history to Today. Forward wasn't tested.
  - Screenshots: light at 390px, dark at desktop width. No console errors
    (the one warning is the existing `apple-mobile-web-app-capable` meta
    tag).
- [ ] Real Supabase check (dev schema, after 0006 applied): complete and
      drop a task, check both show under `today`, set hours, reload, and
      check the hours persisted.
- [x] `npm run test`, `npm run lint` and `npm run build` are clean. Then run
      the `docs-maintenance` skill (ARCHITECTURE data model + module map,
      CLAUDE.md tree, BACKLOG follow-ups: tag filter, export). In
      ARCHITECTURE, note that pre-0006 dropped rows carry
      `completed_at = created_at` (backfilled, approximate).
