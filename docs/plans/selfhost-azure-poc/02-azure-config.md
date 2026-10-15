# Phase 02 — Azure-side configuration

Outcome: the VM never shuts itself down, keeps its IP forever, only accepts the
traffic we want, and you get emailed before costs or CPU credits surprise you.

## Auto-shutdown

- [ ] **[you]** VM → *Operations* → **Auto-shutdown** → set to **Off** → Save. Do this even if you unticked it at creation; some subscriptions and policies re-enable it.

## Public IP: keep it stable

- [ ] **[you]** VM → Overview → click the public IP → *Configuration*: confirm **Assignment = Static**.
- [ ] **[you]** Same blade → **DNS name label**: `reflow-poc` → Save. You now also have `reflow-poc.<region>.cloudapp.azure.com`, handy for SSH config and debugging. Note it in Environment facts.
- [ ] **[you]** Same public IP resource → *Settings* → **Locks** → Add → name `keep-ip`, type **Delete**. The `self.usereflow.app` DNS record will point at this IP; losing it would break DNS. Remove the lock when you tear the PoC down.

## Network security group (firewall in front of the VM)

VM → *Networking* → *Network settings* → the NSG's inbound rules:

- [ ] **[you]** Edit the SSH rule: Source = **My IP address** (or the IP noted in phase 01). Save. If your home IP changes you'll need to update this. You can still get in via *Serial console*.
- [ ] **[you]** Add inbound rule: Destination port **80**, TCP, Source *Any*, Action Allow, Priority `310`, Name `allow-http`. Needed for Let's Encrypt and the http→https redirect.
- [ ] **[you]** Add inbound rule: Destination port **443**, TCP, Source *Any*, Priority `320`, Name `allow-https`.
- [ ] **[you]** (Optional, HTTP/3) Add inbound rule: port **443**, **UDP**, Source *Any*, Priority `330`, Name `allow-https-udp`.
- [ ] **[you]** Confirm there is **no** rule opening 5432 (Postgres) or 3000 (API). Those are never exposed.

## Cost guardrails

- [ ] **[you]** *Cost Management* → **Budgets** → Add → scope: `rg-reflow-poc` → amount e.g. **€30/month** → alerts at 80% (actual) and 100% (forecasted) → your email.

## Alerts worth having for a B-series VM

B-series VMs run at 20% of a vCPU baseline and burst above it by spending
**CPU credits**. When credits hit 0 the VM is throttled to 20%. This matters
most for the load test (phase 12).

- [ ] **[you]** VM → *Monitoring* → **Alerts** → Create alert rule → signal **CPU Credits Remaining** → condition *Less than* `30` (Average, 5 min) → action group: email yourself. Name `reflow-poc-low-credits`.
- [ ] **[you]** Same, signal **Available Memory Bytes** *Less than* `200000000` (≈200 MB) → name `reflow-poc-low-memory`.
- [ ] **[you]** VM → *Monitoring* → *Metrics*: build one chart with **Percentage CPU** + **CPU Credits Remaining** and **Pin to dashboard**. You'll watch this during load tests.

## Verify

- [ ] **[you]** Auto-shutdown blade says *Off*. The public IP says *Static* and has a lock. The NSG shows 22 (your IP), 80, 443.
- [ ] **[you]** `ssh -i $HOME\.ssh\reflow_poc reflow@reflow-poc.<region>.cloudapp.azure.com` still works (DNS label resolves).
- [ ] **[you]** Session log line, then move this file to `archive/`.
