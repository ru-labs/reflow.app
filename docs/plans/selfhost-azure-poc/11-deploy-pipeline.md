# Phase 11 — Automated deployment to the VM

Outcome: one click in GitHub Actions tests, builds, and deploys to
`self.usereflow.app`, with health-checked rollout and one-command rollback.
`release.yml` and Octopus are **not touched** (D9).

## Decision to make first [you]

GitHub-hosted runners have changing IPs, so a push-over-SSH deploy needs port 22
reachable from anywhere. Pick one and log it in the overview:

- **A (recommended for PoC):** open NSG port 22 to *Any*. Safe enough with key-only auth (Azure default, no passwords) + fail2ban.
- **B:** keep 22 locked and join the VM + runner to **Tailscale** (the `tailscale/github-action`). Tighter, one more service.
- **C (later, before prod):** Octopus Linux Tentacle in *polling* mode, so no inbound port is needed and it fits the existing DEV/QUALITY/PROD promotion. This is an item in phase 13.

- [ ] **[you]** Decision recorded in the session log: ___

## Credentials [you]

- [ ] **[you]** Laptop: `ssh-keygen -t ed25519 -C "github-actions deploy" -f $HOME\.ssh\reflow_deploy -N '""'`. A separate key from your personal one, so it can be revoked on its own.
- [ ] **[you]** Append `reflow_deploy.pub` to the VM's `/home/reflow/.ssh/authorized_keys`.
- [ ] **[you]** Get the host key for pinning: `ssh-keyscan reflow-poc.<region>.cloudapp.azure.com`
- [ ] **[you]** GitHub → repo → *Settings → Secrets and variables → Actions* → add `SELFHOST_HOST` (the DNS label), `SELFHOST_USER` (`reflow`), `SELFHOST_SSH_KEY` (the **private** `reflow_deploy` file contents), and `SELFHOST_KNOWN_HOSTS` (the keyscan output).
- [ ] **[you]** If decision A: NSG SSH rule → Source *Any*.
- [ ] **[you]** GHCR pull access on the VM. If the repo is private, create a fine-grained PAT with `read:packages` only and on the VM run `echo <PAT> | docker login ghcr.io -u <github-user> --password-stdin`. (Or make the `reflow-api` package public; the image contains no secrets.)

## Workflow `.github/workflows/selfhost-deploy.yml` [agent]

- [ ] **[agent]** Trigger: `workflow_dispatch` with input `ref` (default `feature/selfhost-poc`). No automatic trigger during the PoC. Add `permissions: contents: read, packages: write`.
- [ ] **[agent]** Job `test`: root `npm ci && npm run test && npm run lint`. Then `server/` `npm ci && npm test`, with a `services: postgres:17-alpine` container and `TEST_DATABASE_URL` pointing at it.
- [ ] **[agent]** Job `build` (needs test): `npm run build:selfhosted`, with `VITE_APP_VERSION=selfhost.${{ github.run_number }}` and `VITE_APP_COMMIT=<sha7>` exported so `VersionBadge` shows it. Upload `dist/` as an artifact. `docker buildx build server/` and push `ghcr.io/<owner>/reflow-api:<sha7>` + `:poc`.
- [ ] **[agent]** Job `deploy` (needs build, `environment: selfhost-poc`):
  1. Write the SSH key + known_hosts from secrets.
  2. `rsync` (or `scp`) `dist/` → `/opt/reflow/releases/<sha7>/`, and `deploy/selfhost/compose.yaml` + `Caddyfile` → `/opt/reflow/`.
  3. Over SSH: set `API_IMAGE=ghcr.io/<owner>/reflow-api:<sha7>` and `APP_VERSION` in `/opt/reflow/.env` (in-place `sed`, keeping the other keys), run `docker compose pull api && docker compose up -d`, then `docker compose exec caddy caddy reload --config /etc/caddy/Caddyfile`.
  4. Health gate: poll `https://self.usereflow.app/api/health` for up to 60 s and expect `version` == the new version. On failure: re-point to the previous image, re-run `up -d`, and fail the job.
  5. Only after health is OK: `ln -sfn <sha7> current` in `releases/`, then delete all but the newest 3 release folders.
- [ ] **[agent]** `deploy/selfhost/rollback.sh <sha7>` (run on the VM): re-points `current` and `API_IMAGE` to an older release and runs `up -d`. Document it in `deploy/selfhost/README.md`.
- [ ] **[agent]** Since the api image now comes from GHCR, drop the `build:` key from `compose.yaml`, or keep it behind a profile. Remove `/opt/reflow/src` from the instructions, since it's no longer needed after this phase.

## Verify [you]

- [ ] **[you]** GitHub → *Actions* → *selfhost-deploy* → *Run workflow*. All jobs are green.
- [ ] **[you]** The site's version badge shows `selfhost.<run>`. `/api/health` shows the same version.
- [ ] **[you]** Change something visible on the branch (e.g. a copy tweak), deploy, and see it live. Then run `rollback.sh` to the previous sha and see it revert.
- [ ] **[you]** Existing data survived both deploys (the tasks from phase 10 are still there).
- [ ] **[you]** Session log line, then move this file to `archive/`.
