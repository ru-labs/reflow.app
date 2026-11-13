# Board

Task board for the agent team. One file per task: `docs/board/T-<nnn>-<slug>.md`. Status lives in the
task's front matter, so there is no separate index. List a column with
`grep -l "^status: review" docs/board/T-*.md`. Done tasks move to `docs/board/archive/`.

## Roles

| Role | On the Board |
|---|---|
| Architect (main session) | Writes tasks and specs, prioritizes, approves, runs agents, reviews results, decides `ponytail`. Creates doc tasks. |
| Senior frontend / backend | Takes one `approved` task. May propose junior tasks. |
| Junior developer | Read-only lookups. Starts only `approved` tasks. |
| DevOps engineer | Takes one `approved` task. Does not create tasks. |

## Lifecycle

```
Architect-written:  backlog ─► approved ─► in-progress ─► review ─► done
Senior-proposed:    proposed ─► approved ─► in-progress ─► review ─► done
                        │
                        └─► needs-revision ─► (senior updates) ─► proposed
```

- `proposed` — a senior wrote a task for the junior; nothing runs yet.
- `needs-revision` — Architect sent it back with a note under `## Architect notes`. The author
  updates the task and resubmits as `proposed`.
- `approved` — Architect checked spec and priority. Only now may an agent start it.
- `review` — agent finished; Architect reads `## Result` / `## Report`. Back to `in-progress` if
  rework is needed. If the task has `## Manual test` steps, it stays in `review` until the human
  confirms them (or waives them); only then `done`.

## Task template

```markdown
---
id: T-001
title: short imperative title
status: backlog          # backlog | proposed | needs-revision | approved | in-progress | review | done
priority: P2             # P1 now · P2 next · P3 later
owner: senior-frontend   # senior-frontend | senior-backend | devops-engineer | junior-developer
created-by: architect    # architect | senior-frontend | senior-backend
model: sonnet            # optional override, Architect only
ponytail: off            # off | lite | full | ultra — Architect only, and only if the human asked
---

## Spec
What to do and why. Files/areas in scope. Out of scope.

## Acceptance
- [ ] checkable outcome

## Manual test
(filled by the agent for UI/behavior changes: what to click, what to expect, edge cases. Write
"none" for pure refactors, docs and config the human can't exercise.)

## Architect notes
(review feedback)

## Report / Result
(filled by the agent: files changed, checks run, unverified, docs affected)
```

## Rules

- Agents edit only their own task file's status, `## Report` / `## Result`, `## Manual test`, and tasks they created.
  Priority, `approved`, `done`, `model` and `ponytail` are the Architect's.
- One agent runs one task. Anything extra it spots becomes a one-line note, not work.
- Never put credentials or personal data in a task file.
