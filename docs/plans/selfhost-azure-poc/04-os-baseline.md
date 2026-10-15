# Phase 04 — OS baseline + Docker

Outcome: a patched, firewalled VM with swap and Docker Engine + Compose ready.
All commands run **on the VM** (VS Code remote terminal or `ssh reflow-vm`).

## Updates

- [ ] **[you]** `sudo apt update && sudo apt full-upgrade -y`
- [ ] **[you]** If `ls /var/run/reboot-required` prints a file: `sudo reboot`, wait ~1 min, reconnect.
- [ ] **[you]** Confirm automatic security updates are active: `systemctl is-active unattended-upgrades` → `active`.
- [ ] **[you]** Keep the server clock in **UTC** (default, don't change it). The app computes "today" in the browser, never on the server.

## Swap (a safety net for a 2 GiB box)

- [ ] **[you]** `sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile`
- [ ] **[you]** Make it permanent: `echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab`
- [ ] **[you]** Prefer RAM, swap only under pressure: `echo 'vm.swappiness=10' | sudo tee /etc/sysctl.d/99-swappiness.conf && sudo sysctl --system`
- [ ] **[you]** Verify: `free -h` shows `Swap: 2.0Gi`.

## Host firewall (second layer behind the NSG)

- [ ] **[you]** `sudo ufw allow OpenSSH && sudo ufw allow 80/tcp && sudo ufw allow 443/tcp && sudo ufw allow 443/udp`
- [ ] **[you]** `sudo ufw enable` (answer `y`), then `sudo ufw status verbose`. Only 22, 80, 443 should be allowed.
- ⚠️ **Docker bypasses ufw** for published ports. That's why Postgres will be published on `127.0.0.1` only (phase 05), and nothing except Caddy publishes public ports.

## fail2ban (bans IPs that brute-force SSH)

- [ ] **[you]** `sudo apt install -y fail2ban`. Ubuntu enables the `sshd` jail by default.
- [ ] **[you]** Verify: `sudo fail2ban-client status sshd` shows the jail.

## Docker Engine + Compose plugin (official Docker apt repo)

- [ ] **[you]** Add Docker's key and repo:

  ```bash
  sudo apt install -y ca-certificates curl
  sudo install -m 0755 -d /etc/apt/keyrings
  sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  sudo chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
  sudo apt update
  ```
- [ ] **[you]** Install: `sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin`
- [ ] **[you]** Cap container log size so logs can't fill the 30 GiB disk. Create `/etc/docker/daemon.json` with `{ "log-driver": "local", "log-opts": { "max-size": "10m", "max-file": "3" } }`, then `sudo systemctl restart docker`.
- [ ] **[you]** Let `reflow` run docker without sudo: `sudo usermod -aG docker reflow`. Then fully disconnect and reconnect (in VS Code: *Remote-SSH: Kill VS Code Server on Host*, then reconnect).
- [ ] **[you]** Verify: `docker run --rm hello-world` prints "Hello from Docker!", and `docker compose version` prints v2.x.
- [ ] **[you]** Docker starts on boot: `systemctl is-enabled docker` → `enabled`.

## Verify

- [ ] **[you]** `sudo reboot`, reconnect, then `free -h` (swap on), `sudo ufw status` (active), `docker ps` (works without sudo).
- [ ] **[you]** Session log line, then move this file to `archive/`.
