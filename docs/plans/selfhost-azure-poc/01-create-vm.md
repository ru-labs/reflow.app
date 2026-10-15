# Phase 01 — Create the VM in the Azure portal

Outcome: a running Ubuntu 24.04 B1ms VM you can reach over SSH with your own key.

## A. Before opening the portal (on your laptop, PowerShell)

- [ ] **[you]** Generate a dedicated SSH key: `ssh-keygen -t ed25519 -C "reflow-poc" -f $HOME\.ssh\reflow_poc`. Set a passphrase. It's saved in the Windows ssh-agent later, so you type it once.
- [ ] **[you]** Print the public key and keep it handy: `Get-Content $HOME\.ssh\reflow_poc.pub`. This is the only part that goes to Azure. `reflow_poc` (no `.pub`) never leaves the laptop.
- [ ] **[you]** Find your public IP (you'll restrict SSH to it): open https://ifconfig.me and note it.

## B. Portal → Virtual machines → Create → Azure virtual machine

**Basics tab**
- [ ] **[you]** Subscription: yours. Resource group: **Create new** → `rg-reflow-poc`.
- [ ] **[you]** Virtual machine name: `vm-reflow-poc`.
- [ ] **[you]** Region: the one closest to you and your users (e.g. *Germany West Central*, *West Europe*, *Poland Central*). If B1ms shows as unavailable, pick another region. Write it into the overview's Environment facts.
- [ ] **[you]** Availability options: *No infrastructure redundancy required*.
- [ ] **[you]** Security type: *Trusted launch virtual machines* (default is fine).
- [ ] **[you]** Image: **Ubuntu Server 24.04 LTS – x64 Gen2**.
- [ ] **[you]** Size: *See all sizes* → search `B1ms` → **Standard_B1ms** (1 vCPU, 2 GiB). Note the monthly price shown (roughly US$15–20 incl. disk + IP).
- [ ] **[you]** Authentication type: **SSH public key**. Username: `reflow`. SSH public key source: **Use existing public key** → paste the `.pub` content from step A.
- [ ] **[you]** Public inbound ports: *Allow selected ports* → **SSH (22)** only. You'll lock it to your IP in phase 02, so ignore the warning for now.

**Disks tab**
- [ ] **[you]** OS disk size: *Image default (30 GiB)*. OS disk type: **Standard SSD (LRS)**. Premium is faster but costs more; you can upgrade later if the load test shows disk waits.
- [ ] **[you]** Tick **Delete with VM**.

**Networking tab**
- [ ] **[you]** Virtual network / subnet: accept the new defaults.
- [ ] **[you]** Public IP: new (Standard SKU; Standard is always static).
- [ ] **[you]** NIC network security group: *Basic*. Public inbound ports: SSH (22).
- [ ] **[you]** Tick **Delete public IP and NIC when VM is deleted**.

**Management tab**
- [ ] **[you]** Microsoft Defender for Cloud: leave off/basic (PoC).
- [ ] **[you]** **Auto-shutdown: make sure "Enable auto-shutdown" is UNCHECKED.** Otherwise the load test and demo die at 19:00.
- [ ] **[you]** Backup: off. The DB gets its own `pg_dump` backups in phase 05.
- [ ] **[you]** Guest OS updates: leave *Image default*. Ubuntu's unattended-upgrades handles security patches.

**Monitoring tab**
- [ ] **[you]** Boot diagnostics: **Enable with managed storage account**. This unlocks the *Serial console*, your way back in if a firewall mistake ever locks you out of SSH.

**Tags tab**
- [ ] **[you]** Add `project = reflow`, `env = poc`. Helps filter costs in Cost Management.

**Review + create**
- [ ] **[you]** Check the summary (size B1ms, Ubuntu 24.04, auto-shutdown off), then **Create**. Wait for "Deployment complete" (~2 min).

## C. Verify

- [ ] **[you]** VM → Overview: Status = *Running*. Copy the **Public IP address** into the overview's Environment facts.
- [ ] **[you]** First connection test from PowerShell: `ssh -i $HOME\.ssh\reflow_poc reflow@<PUBLIC_IP>` → answer `yes` to the fingerprint prompt → you see an `reflow@vm-reflow-poc:~$` prompt. Type `exit`.
- [ ] **[you]** Add a line to the session log in `00-overview.md`, then move this file to `archive/`.
