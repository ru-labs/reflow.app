# Phase 07 — `self.usereflow.app` + automatic HTTPS

Outcome: `https://self.usereflow.app` serves the app with a valid Let's
Encrypt certificate, and plain http redirects to https. Nothing else on
`usereflow.app` changes.

## Find where the DNS lives (laptop, PowerShell)

- [x] **[you]** `Resolve-DnsName usereflow.app -Type NS`
  - `ns1.vercel-dns.com` / `ns2.vercel-dns.com` → DNS is managed in **Vercel → Domains → usereflow.app**.
  - anything else → it's at your registrar (or Cloudflare etc.). Manage the record there.
  Note the answer in the overview's Environment facts.
- [x] **[you]** Check for CAA records that could block Let's Encrypt: `Resolve-DnsName usereflow.app -Type CAA`. No CAA records is fine. If there are some and none says `letsencrypt.org`, add a CAA record `0 issue "letsencrypt.org"`.

## Add the record

- [x] **[you]** In the DNS provider add: type **A**, name **`self`**, value **`<VM public IP>`**, TTL **300** (or the provider's lowest). If the provider is Cloudflare, set it to *DNS only* (grey cloud) for now.
- [x] **[you]** Don't touch the apex (`@`), `www`, or any existing Vercel records.
- [x] **[you]** Wait, then verify: `Resolve-DnsName self.usereflow.app -Type A` returns the VM IP. Usually within minutes; `ipconfig /flushdns` if your laptop cached a miss.

## Switch Caddy to the domain

- [x] **[you]** In `/opt/reflow/Caddyfile`, add a global block at the very top with your email (Let's Encrypt expiry notices):

  ```
  {
      email you@example.com
  }
  ```
  …and change the site address line from `:80 {` to `self.usereflow.app {`. Everything inside the block stays the same.
- [x] **[you]** Reload: `docker compose exec caddy caddy reload --config /etc/caddy/Caddyfile`
- [x] **[you]** Watch the certificate get issued: `docker compose logs -f caddy` → look for `certificate obtained successfully` for `self.usereflow.app` (Ctrl+C to stop). If it fails, the usual causes are DNS not propagated yet, NSG/ufw port 80 closed, or CAA.

## Verify

- [x] **[you]** `https://self.usereflow.app` loads with a valid padlock (issuer: Let's Encrypt).
- [x] **[you]** `http://self.usereflow.app` redirects to https automatically.
- [x] **[you]** Sign in with a DEV account again. It works. DevTools → *Application* → a Service Worker is now registered, and the install prompt may appear.
- [x] **[you]** (Deferred to after phase 11, see D11) To test Google/GitHub on this interim build: Supabase DEV → *Authentication → URL Configuration → Redirect URLs* → add `https://self.usereflow.app`. Remove it after phase 10, when the self-hosted build replaces this one.
- [x] **[you]** 🎯 **Milestone 1:** the current app runs from your own VM on your own subdomain. Session log line, then move this file to `archive/`.
