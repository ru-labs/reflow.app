# Phase 03 — SSH config + VS Code Remote-SSH

Outcome: `ssh reflow-vm` works from PowerShell, and VS Code opens the VM's
filesystem and terminal as if it were local.

## SSH config on the laptop

- [ ] **[you]** Make sure the Windows ssh-agent runs and holds the key (admin PowerShell, one-time): `Get-Service ssh-agent | Set-Service -StartupType Automatic; Start-Service ssh-agent`. Then, in a normal PowerShell: `ssh-add $HOME\.ssh\reflow_poc` (asks for the passphrase once).
- [ ] **[you]** Open `$HOME\.ssh\config` (create it if missing) and add:

  ```
  Host reflow-vm
      HostName reflow-poc.<region>.cloudapp.azure.com
      User reflow
      IdentityFile ~/.ssh/reflow_poc
      IdentitiesOnly yes
      ServerAliveInterval 60
  ```
- [ ] **[you]** Test: `ssh reflow-vm` → prompt appears with no password or path typing. `exit`.

## VS Code

- [ ] **[you]** Install the extension **Remote - SSH** (`ms-vscode-remote.remote-ssh`).
- [ ] **[you]** `F1` → **Remote-SSH: Connect to Host…** → `reflow-vm` → platform **Linux**. The first connect installs the VS Code server on the VM (~1 min).
- [ ] **[you]** In the remote window: *Terminal → New Terminal*. It's a shell on the VM. Run `uname -a && free -h`: you should see Ubuntu and ~1.9 GiB total memory.
- [ ] **[you]** (After phase 05 creates it) *File → Open Folder* → `/opt/reflow`. VS Code remembers it under *Recent*.

## Good to know

- The VS Code server on the VM uses roughly 200–400 MB of RAM, a real share of 2 GiB. **Disconnect Remote-SSH before load tests** (phase 12). Use a plain `ssh reflow-vm` terminal instead.
- VS Code's **Ports** panel can forward VM ports to your laptop (e.g. Postgres 5432 in phase 05) without typing tunnel commands.
- If SSH ever hangs after a firewall change: Azure portal → VM → *Help* → **Serial console**. This is why boot diagnostics was enabled.

## Verify

- [ ] **[you]** Remote window opens, terminal works, you can create and delete a file in `~` from the VS Code explorer.
- [ ] **[you]** Session log line, then move this file to `archive/`.
