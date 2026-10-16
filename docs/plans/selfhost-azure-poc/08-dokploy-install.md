# Phase 08 — Install Dokploy on the VM

Outcome: Dokploy (a self-hosted PaaS: web panel + Traefik + Docker Swarm)
is installed on the VM. Its panel is reachable at
**`https://dokploy.usereflow.app`** with 2FA, and Traefik owns ports 80/443.
The Postgres container from phase 05 keeps running untouched. The site
`self.usereflow.app` is **offline** from the moment Caddy is stopped until
phase 09 brings it back under Dokploy.

Why Dokploy (D12 in `00-overview.md`): it gives a UI for containers, logs,
env vars and domains, plus git-based deploys (push → build → deploy) without
hand-written SSH deploy scripts.

All commands run **on the VM** (`ssh reflow-vm`) unless marked *laptop*.

## What the installer does (read before running it)

- It **aborts if ports 80, 443 or 3000 are in use**. Caddy holds 80/443, so it has to go first.
- It runs `docker swarm leave --force` + `docker swarm init`, then creates the overlay network `dokploy-network` and `/etc/dokploy`. Plain compose containers (our `reflow-db-1`) are not touched by this.
- It starts `dokploy-postgres` (Dokploy's own DB, not published), the `dokploy` panel (port **3000** published on all interfaces), and `dokploy-traefik` (a plain container on 80/443/443-udp).
- Docker is already installed (phase 04), so it skips the Docker install.
- ⚠️ Port 3000 is published by Docker, so **ufw doesn't block it** (phase 04 note). The Azure NSG does, because it only allows 22/80/443. Never add 3000 to the NSG.

## Pre-checks

- [x] **[you]** VM size is now **Standard_B2ls_v2** (2 vCPU, 4 GiB, burstable, 30% base CPU). Confirm on the VM: `nproc` → `2`, `free -h` → about `3.8Gi` total and `2.0Gi` swap.
- [x] **[you]** Azure → VM → *Monitoring → Alerts*: the two phase-02 alerts (credits < 30, memory < 200 MB) still exist after the resize.
- [x] **[you]** Disk: `df -h /`. Dokploy asks for 30 GB total, which is exactly our OS disk, and on-VM builds leave image layers and build cache behind. **If less than 15 GB is free**, grow the OS disk to 64 GiB: portal → VM → *Stop* (deallocate) → *Disks* → OS disk → *Size + performance* → 64 GiB → Save → *Start*. Ubuntu grows the root partition automatically on boot. Check `df -h /` again.
- [x] **[you]** Note the VM's **private** IP: `hostname -I | awk '{print $1}'` (expect `10.0.0.x`; actual `172.16.0.4`, see run notes). This is the swarm advertise address. The public IP isn't on any interface on Azure, so don't use it.

## Retire Caddy (frees 80/443)

- [x] **[you]** `cd /opt/reflow && docker compose stop caddy && docker compose rm -f caddy`. `self.usereflow.app` is now down. Expected.
- [x] **[you]** In `/opt/reflow/compose.yaml`, comment out the whole `caddy:` service, so a later `docker compose up -d` can't start it again. Keep the `caddy_data`/`caddy_config` volumes for now (deleted in phase 09).
- [x] **[you]** `docker compose ps` → only `db`, still healthy.
- [x] **[you]** `sudo ss -tlnp | grep -E ':(80|443|3000) '` prints nothing.

## Install

- [x] **[you]** Download the script and skim it before running it as root: `curl -sSL https://dokploy.com/install.sh -o /tmp/dokploy-install.sh && less /tmp/dokploy-install.sh`
- [x] **[you]** Run it with the private IP passed **inline** (`sudo` resets exported variables): `sudo ADVERTISE_ADDR=<private-ip> sh /tmp/dokploy-install.sh`. It takes a few minutes.
- [x] **[you]** `docker service ls` → `dokploy` and `dokploy-postgres` at `1/1` (newer versions may add more services). `docker ps` → `dokploy-traefik` up on 80/443. `reflow-db-1` is still `healthy`.
- [x] **[you]** Overlay subnets vs the VM subnet: `ip -4 -o addr show eth0` and `docker network inspect ingress dokploy-network --format '{{.Name}} {{range .IPAM.Config}}{{.Subnet}}{{end}}'`. Write all three into the session log. If an overlay subnet **equals** the VM's subnet (Azure's default is `10.0.0.0/24`, and so is swarm's `ingress`), don't change anything yet: Traefik is a plain container and the panel uses host-mode ports, so the routing mesh isn't used. Only revisit this if containers can't reach the VM's private IP. The fix is described at https://docs.dokploy.com/docs/core/troubleshooting/networking.
- [x] **[you]** *Laptop:* `Test-NetConnection reflow-poc.northeurope.cloudapp.azure.com -Port 3000` → `TcpTestSucceeded : False`. The NSG keeps the panel port closed.

## First login (through an SSH tunnel, before anything is public)

- [x] **[you]** *Laptop:* `ssh -N -L 3000:localhost:3000 reflow-vm` (leave it running), then open `http://localhost:3000`.
- [x] **[you]** Create the admin account **right away**: whoever reaches the setup page first becomes the owner. Store the password in your password manager.
- [x] **[you]** Profile → enable **2FA** (or a passkey). The panel can deploy anything on this VM, so treat the account like root.
- [x] **[you]** Note the Dokploy version (shown in the panel) in the overview's Environment facts.

## Panel on its own HTTPS domain

GitHub (push webhooks) and GitHub Actions (phase 13) have to reach Dokploy
over HTTPS, so the panel needs a public domain. 2FA is what protects it.

- [x] **[you]** Cloudflare DNS: add an **A** record `dokploy` → `98.71.18.196`, **DNS only** (grey cloud), TTL Auto. Verify with `Resolve-DnsName dokploy.usereflow.app`.
- [x] **[you]** Dokploy → *Settings → Web Server*: domain `dokploy.usereflow.app`, HTTPS on, certificate **Let's Encrypt**, your email. Save.
- [x] **[you]** `https://dokploy.usereflow.app` loads with a valid padlock and asks for login + 2FA. Close the SSH tunnel from now on. The domain is the way in.

## Housekeeping settings

- [x] **[you]** Turn on Dokploy's **daily Docker cleanup** (server settings). It removes unused images and build cache, which keeps the 30 GB disk from filling up with old builds.
- [ ] **[you]** Leave Dokploy's own server **monitoring** off for now (it's an extra container). Phase 14 has its own monitoring script.

## Run notes (what differed from the plan)

- Private IP is `172.16.0.4/24`, not `10.0.0.x`. Used as `ADVERTISE_ADDR`.
- Overlay subnets: `ingress` `10.0.0.0/24`, `dokploy-network` `10.0.1.0/24`. No overlap with the VM subnet, so nothing changed.
- The `dokploy` A record was **not** in Cloudflare despite being listed in the overview. Added at step 17; it then resolved on `1.1.1.1`.
- The company laptop's network resolves `dokploy.usereflow.app` to `13.49.92.31`, not our server. Flushing the DNS cache didn't help. Cellular and Chrome work. Not a server problem.
- Safari on the phone showed "server not found" right after the record was created (cached negative DNS answer). Chrome on cellular worked, and home Wi-Fi works now.
- Dokploy version: `v0.30.8`.
- Step 21 (monitoring off): no monitoring toggle found on the Settings page yet. Still to confirm.

## Verify

- [ ] **[you]** Baseline after install: `free -m` and `docker stats --no-stream`. Put Dokploy's total RAM (panel + its Postgres + Traefik) in the session log. Expect roughly 350–600 MB.
- [ ] **[you]** `sudo reboot` → after ~1 min `https://dokploy.usereflow.app` works again and `reflow-db-1` is healthy, with nothing restarted by hand.
- [ ] **[you]** *Laptop:* the phase-05 DB tunnel still works: `ssh -N -L 15432:localhost:5432 reflow-vm`, then connect to `reflow_dev` on `localhost:15432`.
- [ ] **[you]** Session log line, then move this file to `archive/`.
