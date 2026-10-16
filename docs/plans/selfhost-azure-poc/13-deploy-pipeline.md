# Phase 13 — Gated deployment: GitHub Actions → Dokploy

Outcome: one click in GitHub Actions runs the tests and only then deploys to
`self.usereflow.app` through Dokploy's API. A health gate checks the result,
and rollback is documented. `release.yml` and Octopus are **not touched** (D9).

No SSH from CI and no port-22 change: GitHub talks to
`https://dokploy.usereflow.app` with an API token. (The old plan's
"open port 22 vs Tailscale" decision is gone.)

## Decision to make first [you]

Read the build numbers from the session log (phases 09 and 12), then pick:

- **A: build on the VM (recommended if a full build takes < ~10 min with no OOM/heavy swap).** GitHub Actions runs the tests, then calls `compose.deploy`. Dokploy builds from the branch head, as it does now. Simplest option, same compose file. Rollback = `git revert` + deploy, which costs one build.
- **B: build in GitHub Actions, the VM only pulls.** CI builds `ghcr.io/ru-labs/reflow-web` and `reflow-api` (tags `<sha7>` and a moving `:poc`). The compose switches `build:` → `image: …:poc` with `pull_policy: always`. This saves VM CPU credits during deploys, deploys exactly the tested commit, and makes rollback one click with no rebuild (re-point `:poc` at an older sha). The self-hosted web image holds no secrets (phase 12 removed `VITE_SUPABASE_*`), so the packages can be public and the VM needs no registry login.
- Not recommended: leaving Dokploy's push-to-deploy as the only path. Untested commits go live.

- [ ] **[you]** Decision recorded in the session log: ___

## Credentials [you]

- [ ] **[you]** Dokploy → Profile → **API / CLI** → generate a token named `github-actions`.
- [ ] **[you]** Find the compose ID: open the `reflow` compose service in Dokploy (it's in the URL), or call `GET https://dokploy.usereflow.app/api/project.all` with header `x-api-key: <token>`.
- [ ] **[you]** GitHub → repo → *Settings → Secrets and variables → Actions* → add `SELFHOST_DOKPLOY_URL` (`https://dokploy.usereflow.app`), `SELFHOST_DOKPLOY_TOKEN`, and `SELFHOST_COMPOSE_ID`.
- [ ] **[you]** Dokploy → compose → **Auto Deploy off**. From now on, only the workflow deploys.

## Workflow `.github/workflows/selfhost-deploy.yml` [agent]

- [ ] **[agent]** Trigger: `workflow_dispatch`. No automatic trigger during the PoC. `permissions: contents: read` (+ `packages: write` for B). Under A, the workflow tests the head of `feature/selfhost-poc` (the branch Dokploy builds). Under B, an input `ref` (default `feature/selfhost-poc`) chooses what's built.
- [ ] **[agent]** Job `test`: root `npm ci && npm run test && npm run lint`. Then `server/` `npm ci && npm test`, with a `services: postgres:17-alpine` container and `TEST_DATABASE_URL` pointing at it.
- [ ] **[agent]** (B only) Job `build` (needs test): `docker buildx` the web image (`BUILD_MODE=selfhosted`, `VITE_APP_VERSION=selfhost.${{ github.run_number }}`, `VITE_APP_COMMIT=<sha7>`) and the api image (`APP_VERSION` baked in as `ARG` → `ENV`, so `/api/health` reports what's really running). Push both as `:<sha7>` and `:poc`. Change `compose.yaml` to `image:` + `pull_policy: always`, and drop `APP_VERSION` from the compose `environment:`.
- [ ] **[agent]** Job `deploy` (needs test/build, `environment: selfhost-poc`):
  1. `POST $SELFHOST_DOKPLOY_URL/api/compose.deploy` with `x-api-key` and `{"composeId": …}`.
  2. Wait for the deployment: poll `GET /api/deployment.allByCompose?composeId=…` until the newest entry is `done` (success) or `error` (fail the job). Timeout: 20 min for A (includes the build), 5 min for B. Confirm the exact response fields against `https://docs.dokploy.com/openapi.json` while writing this.
  3. Health gate: `GET https://self.usereflow.app/api/health` returns `ok: true` (for B, `version` must also equal the new version), with retries for up to 60 s.
  4. Never print the token. `curl` with `--fail-with-body` so HTTP errors fail the step.
- [ ] **[agent]** Rollback:
  - A: document in `deploy/selfhost/README.md`: `git revert <bad sha>`, push, run the workflow.
  - B: `.github/workflows/selfhost-rollback.yml` (`workflow_dispatch`, input `sha7`). It re-points `:poc` → `:<sha7>` with `docker buildx imagetools create`, calls `compose.deploy`, then runs the same health gate. Document it in `deploy/selfhost/README.md`.
- [ ] **[agent]** `deploy/selfhost/README.md`: what runs where (Dokploy compose, env vars live in the Dokploy UI), how to deploy, how to roll back, and how to reach the DB (tunnel / `docker exec`).

## Verify [you]

- [ ] **[you]** GitHub → *Actions* → *selfhost-deploy* → *Run workflow*. All jobs are green, and Dokploy shows a new deployment started by the API.
- [ ] **[you]** `/api/health` shows the expected version, and so does the version badge (B: `selfhost.<run>`; A: whatever `APP_VERSION`/`VITE_APP_VERSION` is set to in Dokploy).
- [ ] **[you]** Make a deliberately failing test on a throwaway commit → the workflow stops at `test` and **nothing is deployed**. Revert it.
- [ ] **[you]** Change something visible (e.g. a copy tweak), deploy, and see it live. Then roll back (A: revert + deploy; B: the rollback workflow with the previous sha) and see it revert.
- [ ] **[you]** Existing data survived both deploys (the tasks from phase 12 are still there).
- [ ] **[you]** Session log line, then move this file to `archive/`.
