# Backlog

Open ideas and unresolved polish items not yet turned into a phase plan. When one of these
becomes real scoped work, promote it into its own `docs/plans/<name>/` folder per CLAUDE.md §5
and remove it from this list — don't track it in both places.

## Open features

- [ ] Dynamic tag filter: derive clickable filter chips from tasks' active tags, animate them in;
      needs a matching filter icon (see `src/components/icons/`)
- [ ] Reposition tags in `TaskRow` to float on the right side instead of stacking under the title
- [ ] History: filter by tag (e.g. a client/project code), so one billing code's work can be read off at once
- [ ] History: copy the range as text / download CSV (title, closed date, hours) to paste into a timesheet tool

## Infrastructure (carried over from the archived `devops-setup` plan)

- [ ] PROD Supabase project is missing migration `0002_task_fields.sql` (the `tags` column).
      Surfaces as an opaque HTTP 400 on insert. Apply it via the SQL Editor.
- [ ] RLS / security audit across all Supabase tables — deliberately deferred, wanted before
      real users or payments.
- [ ] Octopus → Pushcut deploy notification links to Octopus's generic Tasks page, which has
      nothing actionable on it; it should land somewhere the next stage can be triggered from.
      Three ranked fix options are in `docs/plans/devops-setup/archive/04-octopus-setup.md`.

## Verification / spot-checks (likely already fine, unconfirmed)

- [ ] Confirm toast display duration (currently 4375ms success / 6250ms error in `useToast.ts`)
      feels long enough in real use — raised once as "disappears too fast," never re-confirmed
      after the toast system was built
- [ ] Spot-check tag-chip contrast in dark theme (tokens are theme-aware; rendered contrast
      unverified)

## Open product question (not a scoped task)

- The multi-list brainstorm (`docs/plans/multi-list/archive/00-brainstorm.md`) has 6 unresolved
  open questions blocking any implementation start — see that file directly, don't duplicate its
  questions here. Archived as parked, not as done; note it also predates `due_time`'s removal.
