# Reference Internet Deployment

This is the one supported Longtail Forge private-internet-preview topology for the 0.33.16 security closeout. Caddy is the only supported public edge. It uses one Caddy 2 process as the public TLS edge and one Longtail Forge Node process bound to loopback. SQLite, local Files storage, and either the inline worker or one same-host worker remain inside the same installation boundary.

This document is the public-edge operational-security contract. The reproducible runtime artifact plus Docker and bare-metal application paths are defined in [Docker and Bare-Metal Preview Deployment](preview-deployment.md), and the tested whole-instance recovery path is in [Baseline Backup and Restore](backup-restore.md). Docker acceptance, CI, release operations, and the manual review in [Operational Security](operational-security.md#manual-security-review-before-invitations) remain prerequisites; do not send friends-and-family invitations until they pass.

## Supported topology

```text
Internet
  |
  | TCP 80/443 only
  v
Caddy 2 (public edge, TLS termination, automatic HTTPS)
  |
  | loopback HTTP only; trusted immediate peer
  v
Longtail Forge Node process at 127.0.0.1:8001
  |
  +-- SQLite database and local Files storage
  +-- inline worker, or one same-host separate worker
```

The Longtail Forge login page is the authentication gate. Cloudflare Access, HTTP Basic Authentication, a VPN, or another second password screen is optional operator defense in depth and is not required or assumed by the supported application posture. Adding a CDN or another proxy changes the trusted-peer chain and requires a new explicit review; do not copy this one-proxy `TRUST_PROXY` value into a multi-proxy deployment.

The supported scale is one application server with SQLite, roughly 50 total users, and typical active use around 5-15 concurrent users. This is not a horizontally scaled, hosted-SaaS, high-availability, or enterprise topology. See [SQLite Small-Office Mode](sqlite-small-office-mode.md).

## DNS, ports, and firewall

1. Choose one dedicated hostname such as `forge.example.com`. Create its DNS `A` record for the server's public IPv4 address. Add an `AAAA` record only when IPv6 reaches the same protected Caddy edge and the IPv6 firewall has been reviewed; otherwise omit it.
2. Allow inbound TCP 80 and 443 to Caddy. Port 80 exists for ACME HTTP validation and HTTP-to-HTTPS redirects; normal application traffic uses 443.
3. Deny public inbound access to Node port 8001, the Caddy administration endpoint 2019, the SQLite database, Files storage, ClamAV, and any worker port or process interface. Bind Node to `127.0.0.1`, not merely a public interface protected by convention.
4. Allow the outbound DNS/HTTPS traffic Caddy needs for certificate issuance and renewal. Monitor renewal failures before certificates expire.

Caddy automatically manages public certificates for a qualifying hostname and redirects HTTP to HTTPS when ports 80 and 443 are reachable. Do not use `tls internal`, self-signed certificates, or disabled certificate verification for the public deployment; `tls internal` is only for the local closeout harness.

## Service identities and permissions

Run Caddy and Longtail Forge as dedicated, non-interactive service identities where the operating system supports them. Caddy needs its configuration plus its own certificate/state directories and permission to bind the public ports. It does not need read access to the Longtail Forge database, Files storage, `.env`, Secure Notes key, session data, or backups.

The Longtail Forge identity needs read access to the staged application and exclusive read/write access to its configured data directory, SQLite database and sidecars, local Files root, worker lock files, and production log stream. Keep these locations outside `public/`. On POSIX, data directories must remain owner-only (`0700`) and secret/configuration files should be owner-readable only (`0600`). On Windows, remove broad inherited ACLs and grant access only to the Longtail Forge service identity and the administrators responsible for recovery. Never commit the real `.env` file or copy secrets into the Caddyfile, shell history, unit definition, tickets, or logs.

Backups must be written to a location separate from the live data tree, restricted to the backup/recovery operator, protected in transit and at rest, and unavailable through Caddy or Longtail Forge static paths. A complete backup must preserve the SQLite database consistently with local Files data and preserve required external encryption material, including the Secure Notes master key, through a separate protected recovery channel. The 0.33.17 backup/restore implementation and a successful representative restore are mandatory before invitations.

## Longtail Forge environment

Use the following production shape, substituting the real hostname and strong deployment secrets. Supply secrets through the service manager or a protected environment file; the values below are names, not example credentials.

```dotenv
LONGTAIL_ENV=production
LONGTAIL_PUBLIC_URL=https://forge.example.com
HOST=127.0.0.1
PORT=8001
TRUST_PROXY=127.0.0.1/32
LONGTAIL_SESSION_COOKIE_SECURE=true
LONGTAIL_SESSION_COOKIE_SAMESITE=Lax
LONGTAIL_HSTS_MAX_AGE_SECONDS=300
LONGTAIL_AUTH_THROTTLE_ENABLED=true
LONGTAIL_LOG_LEVEL=info

LONGTAIL_DATABASE_PROVIDER=sqlite
LONGTAIL_SQLITE_FOREIGN_KEYS=on
LONGTAIL_SQLITE_JOURNAL_MODE=wal
LONGTAIL_STORAGE_PROVIDER=local
LONGTAIL_WORKER_MODE=inline

# Required secret values; do not commit them:
SUPER_ADMIN_PASSWORD=REPLACE_THROUGH_SECRET_STORE
LONGTAIL_SECURE_NOTES_MASTER_KEY=REPLACE_THROUGH_SECRET_STORE

# The supported preview requires one healthy real scanner:
LONGTAIL_FILE_SCANNER=clamd
```

Do not enable any `LONGTAIL_UNSAFE_ALLOW_*` override for the supported preview. Use `clamd` or `clamscan` with a successful startup health check. Keep `TRUST_PROXY` limited to the immediate Caddy peer; blanket `true`, public networks, hostnames, and the address of an upstream CDN are not supported by this topology.

## Caddy configuration

Set `LONGTAIL_PUBLIC_HOST=forge.example.com` in Caddy's service environment and use the checked-in [Caddyfile.private-preview.example](Caddyfile.private-preview.example). Validate before the initial start and every reload:

```sh
caddy validate --config ./Caddyfile --adapter caddyfile
caddy adapt --config ./Caddyfile --adapter caddyfile --pretty
```

Caddy's default `reverse_proxy` behavior ignores client-supplied `X-Forwarded-For`, `X-Forwarded-Proto`, and `X-Forwarded-Host` values from an untrusted direct client, then derives the values supplied upstream from the accepted connection, TLS state, and host. The checked-in example deliberately preserves that default. This makes the immediate peer named by `TRUST_PROXY` the only party allowed to establish the client IP, effective HTTPS, and public host. Do not add custom `header_up` forwarding rules, Caddy `trusted_proxies`, or CDN forwarding until the whole chain and its spoofing behavior are designed and tested.

Caddy's local administration endpoint stays on `127.0.0.1:2019`; firewalling it is still required. The example leaves request access logging off. Longtail Forge production output is newline-delimited JSON on stdout/stderr and should be collected by the service manager with operator-only access, bounded retention, rotation, disk monitoring, and protected export. If Caddy access logging is enabled later, treat client IPs and URLs as sensitive, do not add request/response headers or bodies, and apply the same access/retention discipline.

## Start and verification

Start SQLite, Files storage, ClamAV, and the chosen worker dependency before admitting traffic. Start Longtail Forge and wait for direct loopback `/readyz`; then start or reload Caddy and perform the public-origin checks below. A service manager should restart failed processes with bounded backoff, preserve logs, and order shutdown so public traffic stops before the application and worker.

```sh
curl --fail --silent --show-error https://forge.example.com/healthz
curl --fail --silent --show-error https://forge.example.com/readyz
curl --fail --silent --show-error https://forge.example.com/api/app-info
```

Manual review through Caddy must confirm:

- HTTP redirects to HTTPS and only ports 80/443 are public.
- `/healthz` returns only `200 {"status":"ok"}` and `/readyz` returns only `200 {"status":"ready"}` for a ready install; both are `no-store` and carry server-generated request IDs.
- The login page and authenticated session flow work at the public origin without a second authentication gate.
- Login, session, and theme cookies are `Secure`; the session cookie is also `HttpOnly` and uses the configured `SameSite` policy.
- HSTS, CSP, anti-framing, `nosniff`, referrer, permissions, and no-store policies survive the proxy.
- A client-supplied forwarding IP/protocol/host is replaced by Caddy. The resulting security event contains the real proxy-observed client address, not the forged value.
- Cross-origin browser mutations fail, same-origin CSRF-protected login succeeds, revocation invalidates the next request, and protected workspace/admin routes retain their permission and workspace boundaries.
- Production application logs are valid JSON lines, correlate the public response's `X-Request-ID`, and do not contain credentials, cookies, request bodies, private content, internal paths, or raw errors.

The repeatable local form of this review is `node scripts/reference-caddy-security-smoke.mjs --caddy <path-to-caddy>`. It uses Caddy's internal CA on disposable high ports, a disposable database, and a test-only unscanned-upload override because it proves the proxy/app boundary rather than ClamAV deployment. That override is forbidden in the real preview and the local smoke is not backup, scanner, DNS, public-certificate, firewall, or restore proof.

## Manual upgrade and rollback

The exact Docker and bare-metal upgrade procedures are defined in [Docker and Bare-Metal Preview Deployment](preview-deployment.md), and the backup/restore commands they consume are defined in [Baseline Backup and Restore](backup-restore.md). Upgrades remain maintainer-operated and invitations remain blocked on the other preview gates:

1. Pause invitations and changes, review the exact candidate commit and changelog, complete the manual security checklist, and take the tested complete backup required by 0.33.17. If tested backup/restore is unavailable, stop; the preview is not upgrade-ready.
2. Keep the currently running installation untouched. Verify and extract the checksummed versioned runtime artifact into a separate non-public directory, materialize the protected environment outside the tree, run `npm ci --omit=dev`, and run the release gates in the reviewed source checkout before promotion. Do not `git pull` over the live installation.
3. Stop public traffic at Caddy, then stop the app and separate worker. Preserve logs and confirm the backup completed before allowing startup migrations.
4. Point the service definition at the staged candidate, start the app/worker, require direct and proxied readiness, then test login, session, workspace access, Files access, and one representative workflow before returning traffic.
5. If verification fails, remove public traffic and stop the candidate. Application rollback may point at the prior staged tree only when its schema compatibility with already-applied forward migrations is proven. Otherwise restore the complete known-good backup into an isolated path, validate integrity/readiness, then deliberately promote it. Never mix an old database with new Files data or reverse applied migrations by hand.
6. Record candidate/prior versions, backup identity, migrations, commands, checks, decision, operator, timestamps, and any recovery action in the private operational record.

The invitation gate that ties this deployment review to participant guidance, account flow, feedback, restore proof, and revocation readiness is [Private Preview Readiness](private-preview-readiness.md). There is no in-app updater or automatic rollback.

## Emergency containment and access revocation

For suspected active exploitation, first remove public traffic at Caddy while preserving logs and data. When the app is safe to use, an owner/administrator can open **User Admin → Active Sessions** to revoke one or all workspace-associated sessions, reset a user's password, or deactivate the affected account; revocation takes effect on the next request. Review and revoke API keys through the protected API-key administration surface. If the administrator account or host may be compromised, keep the app offline, rotate exposed external/runtime credentials through the secret store, preserve evidence, and follow [Operational Security](operational-security.md#minimum-private-preview-incident-response). Do not expose or edit raw session credentials in the database as a substitute for the supported lifecycle operations.

## Known limitations

- This work has not received external penetration testing, independent security certification, a compliance audit, or a guarantee of perfect internet safety.
- The supported posture is a small, invitation-only private preview on one server. It is not hosted SaaS, multi-node high availability, an enterprise deployment, or a public launch.
- SQLite supports one app server and at most one same-host separate worker. Authentication throttle buckets are database-backed and survive an intentional app restart, but multi-app-server coordination is not supported.
- Caddy is the only reviewed public edge. CDN, load balancer, ingress-controller, VPN-proxy, or multi-proxy forwarding chains are unreviewed until explicitly added and tested.
- HSTS begins with the bounded 300-second rollout; preload and long-lived promotion require the documented observation process. CSP retains the reviewed same-origin style compatibility allowance.
- TOTP, passkeys, SSO, risk scoring, device history, PostgreSQL, S3-backed Files, worker fleets, WAF/IDS integration, and automatic updates/rollback are not part of this release.
- Health and readiness are intentionally public and binary. They are not authentication, deep diagnostics, monitoring history, or proof that every workflow is correct.
- Public-release CI, Docker acceptance, sanitized demo data, and final invitation readiness remain 0.33.17 work. Until those gates pass, this reference closeout does not authorize invitations. [Private Preview Readiness](private-preview-readiness.md) must also be complete for the exact candidate before access is granted.

## Reference sources

- [Caddy automatic HTTPS quick start](https://caddyserver.com/docs/quick-starts/https)
- [Caddy reverse proxy header behavior](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy)
- [Caddy TLS directive](https://caddyserver.com/docs/caddyfile/directives/tls)
