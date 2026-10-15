# Phase 05 — Postgres in Docker

Outcome: Postgres 17 running in a container, reachable **only** from the VM
itself (and from your laptop through an SSH tunnel), surviving reboots, with
nightly dumps. The schema itself comes from the API's migrations in phase 08.
The DB stays empty for now.

## Project directory + secrets

- [ ] **[you]** `sudo mkdir -p /opt/reflow/backups && sudo chown -R reflow:reflow /opt/reflow && cd /opt/reflow`
- [ ] **[you]** Generate a DB password: `echo "POSTGRES_PASSWORD=$(openssl rand -hex 24)" > .env && chmod 600 .env`. This file is the only place the password lives. Don't paste it into the plan or git.

## compose.yaml

- [ ] **[you]** Create `/opt/reflow/compose.yaml`:

  ```yaml
  services:
    db:
      image: postgres:17-alpine          # pin 17: the 18 image moved its data dir, don't upgrade casually
      restart: unless-stopped
      environment:
        POSTGRES_USER: reflow
        POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
        POSTGRES_DB: reflow
      command: >
        postgres
        -c shared_buffers=256MB
        -c effective_cache_size=768MB
        -c work_mem=4MB
        -c maintenance_work_mem=64MB
        -c max_connections=100
        -c shared_preload_libraries=pg_stat_statements
      volumes:
        - pgdata:/var/lib/postgresql/data
      ports:
        - "127.0.0.1:5432:5432"          # localhost only, never 0.0.0.0 (Docker bypasses ufw)
      healthcheck:
        test: ["CMD-SHELL", "pg_isready -U reflow -d reflow"]
        interval: 10s
        timeout: 5s
        retries: 5

  volumes:
    pgdata:
  ```
  Memory settings are sized for 2 GiB shared with the API + Caddy.
- [ ] **[you]** Start it: `docker compose up -d db`
- [ ] **[you]** `docker compose ps` → `db` is `running (healthy)` after ~10 s.

## Verify from inside

- [ ] **[you]** `docker compose exec db psql -U reflow -d reflow -c 'select version();'` prints PostgreSQL 17.x.
- [ ] **[you]** Enable query stats (used in the load test): `docker compose exec db psql -U reflow -d reflow -c 'create extension if not exists pg_stat_statements;'`
- [ ] **[you]** Create the two extra databases the coding agent needs: `docker compose exec db createdb -U reflow reflow_dev` and `docker compose exec db createdb -U reflow reflow_test`
- [ ] **[you]** Confirm it isn't public: from your **laptop**, `Test-NetConnection reflow-poc.<region>.cloudapp.azure.com -Port 5432` → `TcpTestSucceeded : False`.

## Reach it from the laptop (SSH tunnel)

- [ ] **[you]** In PowerShell: `ssh -N -L 15432:localhost:5432 reflow-vm` (leave running). Or in VS Code Remote: *Ports* panel → *Forward a Port* → `5432`.
- [ ] **[you]** Connect with any client (DBeaver, pgAdmin, or `psql`): host `localhost`, port `15432`, user `reflow`, db `reflow_dev`, password from `/opt/reflow/.env`. You should see an empty DB.
- [ ] **[you]** Hand the agent the connection details it needs in **its local, gitignored** `server/.env`, *not* in chat logs or the plan: `DATABASE_URL=postgres://reflow:<pw>@localhost:15432/reflow_dev` and `TEST_DATABASE_URL=…/reflow_test`.

## Nightly backup (PoC-grade: same disk, 7 days)

- [ ] **[you]** `crontab -e` and add:

  ```
  0 3 * * * cd /opt/reflow && docker compose exec -T db pg_dump -U reflow -Fc reflow > backups/reflow-$(date +\%F).dump && find backups -name '*.dump' -mtime +7 -delete
  ```
- [ ] **[you]** Run the command once by hand and check `ls -lh /opt/reflow/backups` shows a non-empty `.dump`. (A copy off the VM is part of phase 13.)

## Resilience

- [ ] **[you]** `sudo reboot` → reconnect → `docker compose ps` shows `db` healthy again without you doing anything.
- [ ] **[you]** Session log line, then move this file to `archive/`.
