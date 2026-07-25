# Operational Security

This document defines the minimum operational-security contract for the current Longtail Forge private-preview line. It is an operator baseline, not a security certification, penetration-test result, or claim that an internet deployment is perfectly safe.

## Production logs and request correlation

When `LONGTAIL_ENV=production`, process output is newline-delimited JSON. Every record has `timestamp`, `level`, and a stable `event`. HTTP completion records also contain a server-generated `requestId`, method, status code, and duration in milliseconds. The same opaque ID is returned in the `X-Request-ID` response header so an operator can correlate one response with its log record. Client-supplied request IDs are not trusted or reused.

Production logging uses a strict field allowlist. It deliberately omits request paths and query strings, request/response bodies, headers, cookies, session IDs, bearer tokens, passwords, secret values, database and storage paths, private record contents, and raw error messages or stacks. The production console bridge converts legacy console writes into safe classified records without copying their arguments. Application errors use a safe error type only. Do not weaken this boundary to make debugging easier; reproduce privately with sanitized diagnostics instead.

Collect stdout and stderr through the service manager or container runtime, restrict log access to operators, set an explicit retention period, and protect exported logs as potentially sensitive operational data even though the application redacts its structured fields.

## Private calendar feed bearer URLs

As of 0.33.22.3, `GET /feeds/calendar/:token.ics` is a sessionless, read-only authentication surface. Its URL is a bearer secret: anyone who receives the complete URL can request the owner's permission-scoped Tasks calendar for that workspace. Do not put it in tickets, chat, screenshots, analytics, proxy access logs, browser telemetry, or monitoring labels. Longtail Forge's production request logger omits paths, queries, headers, cookies, and bodies, and lifecycle security events record only the generate/rotate/disable classification. Operators must configure every upstream proxy and observability layer with the same path-redaction rule.

The database stores one active-or-disabled row per user, workspace, and provider. Only a random selector and SHA-256 digest of a separate high-entropy secret are stored; the raw token is returned only when generated or rotated. Verification uses a constant-time digest comparison, rotation immediately replaces the stored selector/digest, and disablement immediately makes the current URL fail on its next request. Invalid, malformed, rotated, disabled, inaccessible, and unknown tokens receive the same `404` body. The endpoint ignores session cookies, performs no mutation, and is deliberately outside the browser CSRF path.

Requests use the existing trusted client-IP resolver and durable sensitive-endpoint throttle with an IP-only dimension. Forged forwarding headers do not create a new bucket unless the direct proxy peer is explicitly trusted under the deployment contract. Successful and rejected reads both consume the conservative throttle budget. A `429` includes `Retry-After`; valid calendar responses are `text/calendar`, `private, no-store`, and advertise a 900-second refresh interval. Generate, rotate, disable, and status routes remain under `/api/private-feeds/calendar` behind the user's own browser session and normal CSRF/origin protections.

User Settings exposes those lifecycle routes as Calendar Subscription. A status read never returns the bearer URL. The raw URL is displayed only after generation or rotation, remains masked until the user reveals it, and is held only for the current page; revisiting an enabled subscription requires rotation if the URL was not saved. The client-help links open documentation only and never transmit the private URL. Users paste the URL into a client's subscription workflow themselves and should expect periodic rather than real-time refresh. Rotation and disablement confirmations state that the old URL stops working immediately.

## Health and readiness

The unauthenticated probes are intentionally minimal and always set `Cache-Control: no-store`:

| Probe | Success | Failure meaning |
| --- | --- | --- |
| `GET /healthz` | `200 {"status":"ok"}` | No response means the HTTP process or route is unavailable. It does not prove database or worker readiness. |
| `GET /readyz` | `200 {"status":"ready"}` | `503 {"status":"not_ready"}` means the database runtime, current migration set, or configured worker is not ready. |

`/readyz` requires a writable database with its expected runtime safety controls, an applied and checksum-valid current migration set, and a live worker. Inline mode uses the in-process runner state. SQLite separate-worker mode uses the heartbeat on the existing single-worker lock file; a missing or stale heartbeat is not ready. Disabled worker mode is not ready. Neither response identifies the failing component or exposes versions, paths, worker IDs, errors, secrets, or configuration details. Use correlated private logs and protected runtime diagnostics to investigate.

Reverse-proxy or orchestrator checks should use `/healthz` for process liveness and `/readyz` for traffic eligibility. Do not use `/healthz` alone to decide that a deployment can safely receive user traffic.

## Dependency and repository scanning plan

Before friends-and-family invitations, the repository owner must review and enable the capabilities available for the repository and plan:

1. Enable Dependabot alerts and scheduled dependency-update pull requests for npm. Review lockfile changes, release notes, transitive changes, install scripts, licenses, and the full release gate before merging; do not auto-merge dependency updates solely because they are automated.
2. Run `npm audit` in CI against the committed lockfile and review the complete report. Define a documented severity threshold for the preview gate, but still triage lower-severity and unreachable findings instead of treating the threshold as proof of safety.
3. Enable dependency review on pull requests when the repository plan supports it, so newly introduced vulnerable dependencies and material license changes are visible before merge.
4. Enable CodeQL code scanning for JavaScript/TypeScript on pull requests, the default branch, and a schedule. Triage results against the actual runtime and preserve suppressions with a concrete rationale and review date.
5. Enable secret scanning and push protection where available. Keep user-level push protection enabled, review every bypass, rotate/revoke a real credential immediately if one is committed, and remove it from history only after rotation. Continue local review because scanning recognizes patterns and cannot detect every secret.
6. Keep GitHub private vulnerability reporting enabled, subscribe the maintainer to security alerts, and test that the repository's **Report a vulnerability** action opens the private form.

These tools identify known advisories and detectable patterns. A clean dependency, code, or secret scan does not prove the application is secure, does not validate deployment configuration, and does not replace threat review, permission/workspace regressions, manual review, incident readiness, or tested restoration.

## Minimum private-preview incident response

For a suspected compromise, credential exposure, private-data disclosure, or actively exploitable vulnerability:

1. **Receive privately and start a restricted incident record.** Record time, reporter, affected version/deployment, observed indicators, and the current incident owner. Do not copy secrets or private content into tickets or chat.
2. **Contain.** Pause invitations and deployments. If exploitation may be active, remove public traffic at the reverse proxy or stop the app while preserving data. Disable affected accounts, revoke relevant sessions/API keys, and rotate exposed runtime secrets or external credentials. Do not destroy the only evidence while containing.
3. **Preserve and scope.** Preserve access-controlled logs, configuration classifications, database/storage snapshots, and relevant timestamps. Use request IDs to correlate activity. Determine affected users, workspaces, records, versions, and time window without broadening access to private content.
4. **Eradicate and recover.** Fix the root cause on a private branch, add a regression, review adjacent trust boundaries, rotate/revoke again where necessary, restore only from a known-good backup, apply migrations, and prove `/readyz`, permission/security gates, and targeted user workflows before returning traffic.
5. **Communicate privately.** Notify affected preview participants promptly with confirmed facts, required actions, data-impact scope, and the next update time. Avoid unsupported certainty. Coordinate disclosure with a private vulnerability reporter.
6. **Review.** Record the timeline, root cause, controls that worked or failed, follow-up owners, and completion evidence. Update this procedure and the pre-invitation checklist when the incident exposes a gap.

The tested baseline recovery capability and its limits are defined in [Baseline Backup and Restore](backup-restore.md). Do not claim recovery readiness unless the exact deployment has a recently inspected off-host archive, separately protected Secure Notes key recovery where required, recorded retention/access ownership, and a successful representative restore drill.

## Manual security review before invitations

The maintainer must complete and date one manual review immediately before the first invitation and repeat it after a material security, deployment, authentication, permission, storage, or recovery change. This review is paired with [Private Preview Readiness](private-preview-readiness.md), which owns the invitation gate and participant/account/feedback checklist. Invitations remain blocked unless every applicable item passes or a documented risk decision explicitly defers the preview:

Use [Reference Internet Deployment](internet-deployment.md) as the authoritative direct-Caddy or bounded Nginx/WireGuard/Caddy topology and operator procedure for the proxy-specific checks below.

- 0.33.16 security hardening and the reference TLS-proxy closeout are complete on the exact candidate version.
- The supported 0.33.17 deployment is reproducible, secrets and data paths have restricted permissions, and the Node listener is not directly public.
- Backup and restore from 0.33.17 have been tested end to end on representative data; the protected backup location, retention, access, and restore owner are recorded.
- `npm run closeout`, `npm run check`, `npm run test:permissions`, SQLite integrity, the focused security regressions, and the reference-proxy manual review pass on the candidate.
- `/healthz`, `/readyz`, production JSON logs, `X-Request-ID` correlation, and readiness failure behavior are verified without secret-bearing output.
- The deferred live HTTPS/proxy session review is recorded for the current candidate when applicable: public sign-in, authenticated refresh/navigation, workspace switching, logout/relogin, cookie persistence, and HTTP-to-HTTPS redirect behavior must be exercised against the real edge; local Caddy smokes are supplementary only.
- Login flood controls are reviewed on the exact candidate: application pre-verification admission stays enabled with explicit global/per-trusted-IP bounds, durable failure throttling remains enabled, and the bounded Nginx topology validates its `$binary_remote_addr` `/api/login` limit and generic `429` without trusting forwarded input. A direct-Caddy deployment records that no repository-owned proxy limiter exists and relies on the independently tested application controls.
- Dependabot/dependency review, vulnerability scanning, CodeQL, secret scanning/push protection, and private vulnerability reporting are reviewed and enabled where available; every open alert has a recorded disposition.
- The incident owner can execute containment, session/API-key revocation, secret rotation, evidence preservation, participant communication, restoration, and rollback without inventing steps during an incident.
- Known limitations and low-stakes-data guidance are included in the invitation; the preview makes no certification, perfect-security, uptime, or durability promise.

Record the reviewer, candidate version/commit, date, evidence links or command outputs, unresolved risks, and the invite/no-invite decision in a private operational record. Do not commit secrets, private incident evidence, participant data, or scan exports to this repository.

## External references

- [GitHub: configuring private vulnerability reporting](https://docs.github.com/en/code-security/how-tos/report-and-fix-vulnerabilities/configure-vulnerability-reporting/configure-for-a-repository)
- [GitHub security features](https://docs.github.com/en/code-security/getting-started/github-security-features)
- [GitHub push protection](https://docs.github.com/en/code-security/concepts/secret-security/push-protection)
- [npm audit](https://docs.npmjs.com/cli/v11/commands/npm-audit/)
