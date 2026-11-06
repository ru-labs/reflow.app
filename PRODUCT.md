# Product

## Platform

web

## Stack

delegated: React (Vite) SPA with Supabase (Postgres + Realtime) as the backend. Reasoning: this is a single-user personal tool that still needs multi-device sync (phone during the day, laptop for planning), so some backend is unavoidable — but it doesn't need the complexity of a multi-tenant SaaS backend. Supabase gives persistence, auth, and realtime sync with minimal backend code to maintain; Vite + React keeps the frontend lightweight and well-suited to the drag-and-drop and swipe-heavy interactions the product needs, without SSR complexity a personal tool doesn't require.

## Users

The builder themself: a team lead and data engineer who starts most days with a clear plan of 3-5 priority tasks, but is frequently and unpredictably pulled into unplanned-but-important work (helping others, consulting on hard topics, unexpected fires). Single user; no other audiences confirmed.

## Product Purpose

An interrupt-resilient day planner. Each day has one ordered, priority-ranked task list that adapts as the day gets disrupted, instead of a static list that silently falls out of date. Success means re-prioritization happens consciously and cheaply enough that it actually gets used, and tasks stop getting lost when the day goes sideways.

## Positioning

The problem is explicitly framed as triage/re-planning, not capture — the user already writes tasks down; what fails is that re-prioritization never happens consciously when interrupted. The differentiating mechanism is binary-search "Tinder-style" comparison for inserting a single new task into an existing ranked list (~4 swipe comparisons for a 15-item list via picking the middle item and narrowing up/down), kept deliberately separate from bulk list-building via drag-and-drop. A generic todo app or static list does not offer this reactive, low-effort re-ranking.

## Operating Context

- Daily cycle: a three-phase "Start My Day" morning flow, ongoing use through the day, and automatic end-of-day rollover.
  - Phase 1 (leftovers triage): yesterday's unfinished tasks shown one at a time; swipe right = keep (retains prior rank, carries forward), swipe left = drop.
  - Phase 2 (brain dump): new tasks for today captured as a flat list, quick text entry, no ranking at this stage.
  - Phase 3 (merge): kept carryover tasks at top (already ranked), new tasks appended below; one continuous drag-and-drop pass interleaves everything into final priority order.
- During the day: tasks can be added anytime via the same brain-dump input; each new task goes through the binary-search compare mechanic to be inserted at the right rank; tasks can be marked done anytime.
- End of day: no manual action needed — unfinished tasks automatically become tomorrow's leftovers, order preserved.
- Used across multiple devices in the same day: mobile (during interruptions/on the go) and desktop/laptop (for planning), requiring sync between them.

## Capabilities and Constraints

- One ordered list per day, ranked by priority (not a flat list).
- Binary-search compare mechanic: for a single incoming task, repeatedly compare against the list's current midpoint (swipe/tap to choose more urgent) until placed; ~4 comparisons for ~15 tasks.
  - Skipped entirely when the day's list has 0-1 tasks — task is added directly.
- Interaction vocabulary is fixed and deliberately kept distinct across the whole app:
  - Swipe right/left = binary decisions (keep/drop leftovers; urgency comparisons for insertion).
  - Drag and drop = reordering / list-building (morning merge; manual reordering anytime).
- Mobile reordering must use true long-press drag (Trello-style), not up/down arrow buttons.
- Multi-device sync is required (not a local-only tool).
- Design priority is stated explicitly by the user: this should feel like "good UI that's fast to use," not "minimize taps at all costs" — naturalness over raw step-count minimization.
- Explicitly undecided — do not invent answers, carry as open questions:
  - What a task contains: text only, or also note/subtask/time estimate.
  - What "done" looks like: disappears immediately, or stays visible (crossed out) for the rest of the day.
  - Compare-mechanic edge cases: whether top/bottom placement gets a confirmation ("Placed as #1 today") or places silently; cancel/skip behavior mid-compare (likely dumps task at bottom for manual placement); whether a third "about the same / place adjacent" option exists alongside the binary choice.
- Out of scope for v1 (parked, not to be designed against yet): "plan vs. actual" analytics over time (which days/meetings tend to blow up the plan, how consistently the plan holds).

## Brand Commitments

The product is named **Reflow** ("your day doesn't fall apart — it reflows"), with a complete pinned brand system recorded in `branding.md` at the project root. This is a binding brief, not a starting point — the visual world is decided, not open. Key facts a builder must not re-derive or override:

- Logo: "The shift" (three rounded bars; the middle bar breaks right into a chevron point, mid-reorder) as the canonical primary mark and app icon/favicon — see `branding.md` §1. Earlier concepts A–D (comparator, the reflow, confluence, chevron-leg monogram) are superseded and kept only as history.
- Color: ink-violet brand (`#171335` / `#4B3F8F` / `#7A70B8`) with cool paper/mist neutrals; signal coral (`#FF6B4A`) reserved strictly for decision moments (the compare/duel, the task being slotted, the single next action) — never on chrome, buttons, headers, or badges. No red/green semantic pair for compare states. (Revised from an earlier petrol-teal/amber/warm-paper direction, which read as washed out — see `branding.md` §2 for the full rationale.)
- Type: wordmark and headings in a low-contrast humanist sans (Söhne/Switzer/General Sans), set lowercase (`reflow`, never capitalized), with a true `fl` ligature; body/UI in Inter or system font; ranks/times/durations in a tabular mono (Geist Mono/JetBrains Mono), used sparingly.
- Tone of voice: the app never implies the user failed — no streaks, no "missed" language, no overdue counts. Calm-friend register, short lowercase-friendly lines, no exclamation marks; dry wit permitted only at the compare moment ("which first?"). Leftovers are framed neutrally ("still open," not "overdue"); dropping a task is framed as relief ("let it go"), not deletion.
- Iconography: stroke icons only (24px grid, 1.75px stroke), built from two atoms borrowed from the mark (rounded bar = a task, chevron = the verb) plus a circle.
- Motion: nothing animates at rest; the reflow/reorder transition is slow and spring-like (~380ms, near-zero overshoot); the compare/decide moment is fast (150-200ms) and is the only place coral appears as motion; dropping a task is a soft fade/collapse, never a shake or destructive red.
- Layout/structure (added in the post-Phase-4 redesign pass, see `docs/plans/reflow/00b-design-system.md`): today view uses an editorial rail+column layout on desktop and edge-to-edge cards on mobile, not a persistent bottom input bar — task entry is a floating "+" opening a modal. The compare duel is a single Tinder-style swipeable card against a fixed reference question, not two side-by-side options. The morning flow has a persistent step indicator and a desktop-specific centered-panel presentation.
- Compare duel presentation (user decision, 2026-08-14): the duel is a **full-bleed opaque screen**, never a modal, scrim, blurred backdrop, or nested panel — those were tried and rejected as "messy" and off-theme. It commits to the **swipe-card canon played straight** (Tinder/Hinge as the craft bar): a card stack with remaining-comparison cards peeking behind, 1:1 finger tracking, drag-proportional rotation, rotated decision stamps, and a velocity-matched fling exit. Stamps use coral for "sooner" and violet for "later" — never a red/green pair.

## Evidence on Hand

- `idea.md` at the project root is the source draft this product record was built from — treat it as the canonical original framing of the problem and mechanics.
- `branding.md` at the project root is the pinned brand identity system (see Brand Commitments) — treat it as binding visual authority, not inspiration.
- No other assets, data, testimonials, or prior art exist yet. Future work must not fabricate testimonials, usage data, or screenshots.

## Product Principles

1. Re-planning must be low-effort enough to survive real interruptions, or it won't be used — the user has explicitly ruled out anything requiring heavy manual discipline (e.g. detailed logging).
2. Comparison is the right tool for reactive single-item insertion; bulk list-building deliberately uses a different mechanic (drag-and-drop) so it isn't tedious to build a list from several items at once.
3. Capture and ranking are kept as separate steps — adding a task should never require deciding its priority in the same motion.
4. The interaction vocabulary stays minimal and consistent (swipe = binary decision, drag = reordering) so the app stays predictable without conscious thought.
5. Nothing silently falls off the list — every unfinished task is either explicitly dropped or automatically carried forward.
