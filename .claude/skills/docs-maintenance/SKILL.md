---
name: docs-maintenance
description: Keeps docs/ARCHITECTURE.md, docs/BACKLOG.md, and CLAUDE.md's project-structure
  tree in sync with the code after a feature or fix lands. Use when a task is finished and
  about to be committed/merged, when a new src/lib, src/hooks, or src/components file is
  added or removed, when a backlog item just got implemented, or when the user asks to
  "update the docs" / "document this feature".
---

# Docs Maintenance

Runs at the end of a task, not mid-edit — docs should reflect finished work, not in-progress
diffs. Work through these checks in order; skip any that don't apply, and say so briefly in
the end-of-task summary.

## 1. Structure drift check

Diff CLAUDE.md's project-structure tree (§ Project structure) against the actual current
contents of `src/pages/`, `src/components/`, `src/components/icons/`, `src/hooks/`, `src/lib/`.
If any file exists in one but not the other, update the tree. This is the same diff Phase 5 of
`docs/plans/docs-cleanup/` (archived) did by hand — this step automates it going forward.

## 2. Architecture doc check

If the just-finished work added a new cross-cutting pattern, a new table/migration, or
materially changed one of the sections in `docs/ARCHITECTURE.md` (data model, module map,
optimistic-mutation pattern, realtime sync, ranking/duel, morning flow, auth/dev-mode), update
that section. Skip this step for pure bugfixes or copy changes that don't change the shape of
anything `ARCHITECTURE.md` describes — don't churn the doc for changes it was never meant to
capture.

## 3. Backlog check

If the just-finished work implements something listed in `docs/BACKLOG.md`, remove that line.
If the work surfaced a new, genuinely-open loose end (not part of the current task's own scope,
not urgent enough to be its own follow-up plan), add one line to the relevant section of
`docs/BACKLOG.md`. Do not log the task's own still-open subtasks as backlog items — that's what
the task's own plan-phase checkboxes are for (CLAUDE.md §5); the backlog is for ideas with no
phase file yet.

## 4. Don't let new plans become scope creep

A finished plan's durable knowledge (why a decision was made, a pattern worth naming) belongs
folded into `docs/ARCHITECTURE.md` once archived, not left only inside the archived phase file
where nobody will read it again. This is what prevents the docs-cleanup effort from being
needed a second time.

## 5. Report, don't silently commit

Summarize what doc changes were made (or that none were needed) as part of the normal
end-of-task summary — doc edits are real file changes and follow the same review expectations
as any other edit.

## Non-goals

- Does not touch `PRODUCT.md` or `branding.md` (binding brand references) — both
  explicitly out of this skill's write surface.
- Does not create new `docs/plans/` phase files — that's a planning decision, not a
  maintenance one.
- Does not run on every keystroke or every save — only at natural task-completion boundaries.
