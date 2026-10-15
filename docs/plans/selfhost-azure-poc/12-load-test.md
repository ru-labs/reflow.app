# Phase 12 — Load test: 10 / 100 / 1000 concurrent users

Outcome: measured response times for a realistic reflow workflow at three load
levels, server resource usage during each, and one comparison report. The
answer to "can a B1ms carry 1000 concurrent users?" comes with evidence.

## Definitions (agreed before running anything)

- **Concurrent user** = one k6 virtual user (VU) signed in with its **own
  account**, looping the workflow below with **5–15 s think time** between
  actions, like a person using the app. So 1000 users ≈ 100–200 requests/s.
  This is not "1000 requests per second".
- **Workflow response time** = wall-clock duration of one full loop *minus*
  think time. It's recorded as a custom k6 `Trend` called `workflow_duration`.
- **Pass criteria** (per level): error rate < 1%, per-request p95 < 500 ms,
  p99 < 1500 ms, workflow p95 < 3 s, and the VM doesn't swap-thrash.
- **Stress run** (optional, after the three levels): no think time, ramping up
  until errors > 5%. That finds the breaking point, which is a different
  question from "does it carry N users".

⚠️ **B-series CPU credits.** B1ms has a 20% CPU baseline and bursts on
banked credits. A test that starts with a full credit bank measures burst
performance, and once credits run out the VM drops to 20% of a core.
**Record "CPU Credits Remaining" before and after every run.** If the
1000-user run only passes with credits left, that's not a pass for 24/7
production. Compare with a B2s or a non-burstable size before deciding.

## Test data + server switches [agent]

- [ ] **[agent]** `server/scripts/seed-loadtest.ts --users 1000`: creates `lt-0001@loadtest.invalid` … `lt-1000@loadtest.invalid`, all with the password from env `LOADTEST_PASSWORD`. Compute the bcrypt hash **once** and reuse it for every row (seeding 1000 users otherwise takes minutes of CPU). Each user gets 15 active tasks + 20 closed tasks spread over the last 14 days, all in batched inserts.
- [ ] **[agent]** `server/scripts/cleanup-loadtest.ts`: `delete from users where email like '%@loadtest.invalid'` (cascades to tasks, profiles, sessions).
- [ ] **[agent]** Confirm that `AUTH_RATE_LIMIT_PER_MIN=0` disables the sign-in limiter. All VUs come from one IP, so it must be off during tests and back on afterwards.

## k6 scenario — `loadtest/workflow.js` [agent]

- [ ] **[agent]** Per VU: the first iteration signs in as `lt-<VU id padded>`. The k6 per-VU cookie jar keeps the session afterwards. **Spread sign-ins across the ramp-up**: bcrypt is deliberately CPU-heavy, and 1000 simultaneous logins on 1 vCPU would measure only bcrypt.
- [ ] **[agent]** Loop, one request tagged with `name` per step so results break down by endpoint:
  1. `GET /` + the main JS and CSS asset (the paths discovered once in `setup()` by parsing `index.html`), i.e. an app open
  2. `GET /api/tasks?status=active` + `GET /api/tasks/completed-since`
  3. `POST /api/tasks` (random title) → think
  4. `PATCH /api/tasks/:id` with a new rank (a reorder) → think
  5. `PATCH /api/tasks/:id` with status done + completed_at → think
  6. `GET /api/tasks/closed` for this week (the history screen) → think
  7. `PATCH /api/tasks/:id` with hours_spent
  To keep each account at a steady size, drop one extra active task per loop, so active tasks stay ~15.
- [ ] **[agent]** `checks` on status codes. Thresholds from the pass criteria, so k6 exits non-zero on failure.
- [ ] **[agent]** Profiles via env `LEVEL`: `smoke` (1 VU, 1 min), `u10` (10 VUs, 1 min ramp + 5 min), `u100` (100 VUs, 2 min ramp + 10 min), `u1000` (1000 VUs, 5 min ramp + 15 min), `stress` (ramping arrival rate, no think time).
- [ ] **[agent]** (Optional, realism) `loadtest/sse-hold.mjs`: a Node script that opens N authenticated `EventSource` connections and holds them, run alongside the k6 test. Real users keep one SSE stream open each, which costs memory on the API.

## Server-side monitoring [agent + you]

- [ ] **[agent]** `loadtest/vm-monitor.sh <run-name>`: every 5 s appends a timestamp + `docker stats --no-stream` (CPU%/mem per container) + `free -m` + the load average to `~/loadtest/<run-name>.csv`. Stops on Ctrl+C.
- [ ] **[agent]** `loadtest/pg-top.sql`: the top 15 queries from `pg_stat_statements` by total time, with mean/p95-ish (`mean_exec_time`, `max_exec_time`, `calls`).
- [ ] **[you]** Azure portal: the pinned chart from phase 02 (Percentage CPU + CPU Credits Remaining), plus **Available Memory Bytes** and **Network In/Out Total**.

## Visualization [agent]

- [ ] **[agent]** Each run writes into `loadtest/results/<run-name>/`: the k6 HTML dashboard (`K6_WEB_DASHBOARD=true`, `K6_WEB_DASHBOARD_EXPORT=…/dashboard.html`, giving live charts during the run and a static report after), `summary.json` (`--summary-export`), and the copied VM `monitor.csv`.
- [ ] **[agent]** `loadtest/report.mjs` merges all runs into `loadtest/results/report.html`. It shows p50/p95/p99 per endpoint per level, `workflow_duration` p95 per level, requests/s, error rate, and VM CPU% + memory over time with the credit readings noted. That's one page that answers the question.
- [ ] **[agent]** `loadtest/README.md` has exact PowerShell commands for each level. `loadtest/results/` is gitignored except `report.html`, which you can decide per run.

## Runbook (you, one level at a time)

Prep, once:
- [ ] **[you]** Install k6 on the laptop: `winget install k6 --source winget` → `k6 version`.
- [ ] **[you]** VM: `.env` → `AUTH_RATE_LIMIT_PER_MIN=0` → `docker compose up -d api`.
- [ ] **[you]** Seed: run the seed script against prod-on-VM (the agent documents the exact command, e.g. `docker compose exec api node dist/scripts/seed-loadtest.js --users 1000`).
- [ ] **[you]** **Disconnect VS Code Remote-SSH.** Use a plain `ssh reflow-vm` terminal for monitoring (VS Code server eats RAM).
- [ ] **[you]** Smoke: `$env:LEVEL='smoke'; k6 run loadtest/workflow.js`. It must be 100% green before going further.

Per level (repeat for `u10`, `u100`, `u1000`):
- [ ] **[you]** Note CPU Credits Remaining (Azure metric) → the results table below.
- [ ] **[you]** VM: `docker compose exec db psql -U reflow -d reflow -c 'select pg_stat_statements_reset();'`
- [ ] **[you]** VM: start `./vm-monitor.sh <level>` in a second ssh terminal.
- [ ] **[you]** Laptop: run the level with the agent's command. Watch the k6 dashboard at `http://localhost:5665`. Also watch the laptop's own CPU: if k6 goes above ~80% CPU, the laptop is the bottleneck, not the VM (see the note below).
- [ ] **[you]** After: stop the monitor, run `pg-top.sql`, copy `monitor.csv` into the run folder, note the credits again, and fill in the table.
- [ ] **[you]** Let credits recover before the next level (watch the metric), or note that you didn't.

Finish:
- [ ] **[you]** `node loadtest/report.mjs` → open `report.html`.
- [ ] **[you]** Clean up: run the cleanup script, then set `AUTH_RATE_LIMIT_PER_MIN=10` again and `docker compose up -d api`.

**If the laptop can't drive 1000 VUs** (CPU or home upload is the limit):
create a temporary *Standard_D2s_v5* Ubuntu VM in the **same region**, install k6
there, run only `u1000` from it, then **delete** that VM the same day. Same
region means the numbers show server capacity, not your home internet.

## Results

| Level | Credits before → after | Req/s | Error % | p95 req (ms) | p99 req (ms) | Workflow p95 (s) | Peak VM CPU % | Peak mem (MB) | Pass? |
|---|---|---|---|---|---|---|---|---|---|
| smoke | | | | | | | | | |
| 10 | | | | | | | | | |
| 100 | | | | | | | | | |
| 1000 | | | | | | | | | |
| stress (break point) | | | | | | | | | |

## If 1000 fails: tuning loop (one change at a time, re-run `u1000`)

- [ ] **[agent/you]** Read `pg-top.sql` first. Slow queries mean a missing index or a query shape problem.
- [ ] **[agent/you]** API CPU pegged and DB idle → check that bcrypt isn't in the hot path (only sign-in) and that the Node process isn't blocking on JSON serialization.
- [ ] **[agent/you]** Pool waits → adjust `pg.Pool max` (20 ↔ 40) against Postgres `max_connections`.
- [ ] **[you]** Memory → check swap usage and the Postgres `shared_buffers`.
- [ ] **[you]** A control experiment: resize the VM to **B2s** (2 vCPU, 4 GiB) → re-run `u1000`. The portal resize takes ~2 min plus a reboot. Log the result, then resize back.
- [ ] **[you]** Decision written into the session log: *B1ms sufficient / needs size X / needs architecture change*. Then move this file to `archive/`.
