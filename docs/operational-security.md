# Operational Security

This document defines the minimum operational-security contract for the current Longtail Forge private-preview line. It is an operator baseline, not a security certification, penetration-test result, or claim that an internet deployment is perfectly safe.

## Production logs and request correlation

When `LONGTAIL_ENV=production`, process output is newline-delimited JSON. Every record has `timestamp`, `level`, and a stable `event`. HTTP completion records also contain a server-generated `requestId`, method, status code, and duration in milliseconds. The same opaque ID is returned in the `X-Request-ID` response header so an operator can correlate one response with its log record. Client-supplied request IDs are not trusted or reused. As of 0.33.27.3, this correlation value comes from the central opaque UUIDv4 authority; it remains non-secret and carries no ordering semantics.

Production logging uses a strict field allowlist. It deliberately omits request paths and query strings, request/response bodies, headers, cookies, session IDs, bearer tokens, passwords, secret values, database and storage paths, private record contents, and raw error messages or stacks. The production console bridge converts legacy console writes into safe classified records without copying their arguments. Application errors use a safe error type only. Do not weaken this boundary to make debugging easier; reproduce privately with sanitized diagnostics instead.

As of 0.33.23.1, a server-side 500-class failure writes one `http.request.failed` diagnostic under the response's request ID. Its additional allowlisted context is classification-only: `errorType`, a bounded `errorStack` containing sanitized function names rather than messages or paths, `routeClass`, `actorState`, and `workspaceState`. It never records the URL, route parameters, user/workspace IDs, exception message, raw stack, SQL, filesystem path, or request data. Expected client errors do not create this failure diagnostic. Internal and versioned API error bodies carry the matching request ID; unexpected browser documents show it in their HTML fallback.

For support, ask only for the displayed Request ID, approximate time, and attempted action. Match that opaque value exactly to one `http.request.failed` diagnostic; a separate `http.request.completed` record is normal and is not another failure diagnostic. Do not request passwords, bearer URLs, cookies, bodies, private record text, or raw protected IDs. The full support workflow, response contract, and in-process `503` versus proxy-maintenance boundary are in [http-errors.md](http-errors.md).

Collect stdout and stderr through the service manager or container runtime, restrict log access to operators, set an explicit retention period, and protect exported logs as potentially sensitive operational data even though the application redacts its structured fields.

## Support View identity and event boundary

Support View is an install-level security capability and remains disabled unless `LONGTAIL_SUPPORT_VIEW_ENABLED=true`. The dedicated `support_view.enter` permission is granted only to the installation Super Admin role; ordinary Workspace Administrators do not receive it. Version 0.33.30.2 supplies the server boundary but still exposes no browser entry workflow; the 0.33.30.3 UX/audit closeout must land before operators treat the feature as usable.

The authenticated administrator remains the actor. Durable state and request context carry a separate effective user and exactly one effective workspace. Current-password verification uses the shared trusted-client-IP/account throttle, and entry plus exit rotate the opaque browser session ID. Expiry, runtime disablement, authority loss, user or membership deactivation, and workspace deactivation terminate the support state immediately; restoration creates a new normal session only for a still-active actor with a valid active workspace.

`support_sessions` and `support_view_events` retain bounded reason/reference text, actor/effective/workspace attribution, start/expiry/end timestamps, safe outcome classifications, request IDs, and stable route/action/reason identifiers. They exclude credentials, password hashes, cookies, browser session IDs, query strings, request/response bodies, secure content, and arbitrary payload metadata. The same safe action attribution is emitted through the structured operational logger. Runtime diagnostics disclose only whether the install gate is enabled; retention/export review and the administrator audit surface remain owned by 0.33.30.3.

After live support-session validation, one central request gate replaces authorization identity with the target's live user/workspace context, permits only declared read-safe GET/HEAD actions, and denies every other method before protected routers execute. Sensitive and undeclared reads return ordinary not-found. The sensitive catalog includes credential/token/recovery and auth-factor surfaces, exports/backups, billing/payment or integration-secret configuration, security/audit/session administration, raw file content, and secure Notes/catalog state. A newly added protected read must be declared and pass the release-gate source audit; modules cannot create an override for central mutation denial.

## Secure Notes catalog boundaries

Catalog policy uses the same effective-security result for explicit secure notes, direct secure catalogs, inherited ancestors, and fail-closed transition or malformed-hierarchy states. Effectively secure bodies and revisions stay encrypted at rest. Normal Files, activity, notifications, Search, resume/Workbench, public API, exports, generic provider catalogs, and Support View omit the record rather than returning a partial title or count. Enabling effective security removes existing normal Search documents, notification/subscription rows, and resume-state rows for the affected notes; read-time policy checks still fail closed if cleanup is interrupted. Internal events and audit records omit titles, bodies, excerpts, encryption fields, and secret metadata. Do not add a Notes consumer that reads `security_mode` directly; declare it in `protectedContentConsumers` and call the Notes policy assertion.

Catalog enable, retry, and downgrade require `notes.secure.manage` plus Library management. Security is effective as soon as a versioned transition is claimed. A failed or interrupted transition remains protected and operator-visible; it never falls back to normal. Downgrade additionally requires current-password reauthentication and exact catalog/action/count confirmation. Moving a note or subtree out of inherited protection preserves explicit security and writes a separate safe audit action rather than downgrading silently.

## Private calendar feed bearer URLs

As of 0.33.22.9, `GET /feeds/calendar/:token.ics` remains a sessionless, read-only authentication surface. As of `0.33.22.9.3`, new and rotated links use `GET /feeds/calendar/:token/:calendarName.ics` so filename-based clients can show the subscription's path-safe friendly name; the token-only route remains supported. The complete URL is a bearer secret: anyone who receives it may request the owner's currently permitted Tasks calendar for its workspace. Do not put it in tickets, chat, screenshots, analytics, proxy access logs, browser telemetry, or monitoring labels. Production request logging omits paths, queries, headers, cookies, and bodies; lifecycle security events contain only safe create/rotate/revoke/automatic-invalidation classifications and reason/scope metadata. Every upstream proxy and observability layer needs the same path-redaction rule.

The database stores independently identified named active-or-revoked rows. Each is bound to its creator and one Workspace, Client, or Project entitlement scope. Project scope is available to every workspace type; Client scope is accepted only in Business workspaces, while Personal and Family workspaces remain Client-free. Storage contains only a random selector and SHA-256 digest of a separate high-entropy secret. The raw URL is returned once on creation or owner rotation. Workspace administrators can list safe workspace metadata and revoke any row but cannot mint for another user, recover another URL, or rotate another owner's credential. Every public read rechecks the owner, membership, workspace type, Tasks module, target lifecycle, and exact live `tasks.view` scope before provider dispatch. Canonical lifecycle reconciliation and startup repair update durable status, while read-time rejection remains authoritative if repair fails.

Malformed, unknown, rotated-away, revoked, inaccessible, and invalid-scope tokens receive the same `404` body. Framework dispatch exposes only an immutable secret-free subscription descriptor. Tasks reauthorizes that exact Workspace/Client/Project scope, applies the ceiling in its Task and recurrence-template queries, and then intersects those rows with current record permissions. Client scope follows the Project's current Client parent; moved out-of-scope recurrence instances become title-free cancellations rather than content. An authorized scope with no matching Tasks returns a valid empty calendar, while lost scope authority remains a generic rejection. Requests use the trusted client-IP resolver and durable IP-only sensitive-endpoint throttle. Successful and rejected reads consume the budget; `429` includes `Retry-After`, while valid responses remain `text/calendar`, `private, no-store`, with a 900-second refresh hint.

The `/api/private-feeds/calendar-subscriptions` collection/item routes are browser-session protected and require `workspace_settings.manage`. Settings -> Admin -> Modules -> Calendar is their sole management surface; User Settings and the retired singular lifecycle routes cannot manage subscriptions. Create always binds the new row to the authenticated actor. Business workspaces may submit Workspace, Client, or Project scope; Personal and Family workspaces expose Workspace and Project, discard Client options, and receive a server rejection for forged Client scope. Owner-only rotation returns a replacement URL once, and safe list reads expose only lifecycle, owner, scope, and effective owner-timezone metadata—never URLs, selectors, digests, or token prefixes. Workspace administrators may revoke another owner's active row but cannot rotate it or recover its secret. Manual Revoke emits the lifecycle security event and deletes the credential row, which makes the bearer URL unknown immediately and removes the list entry. Rows already revoked by automatic eligibility reconciliation remain deletable through a separately classified cleanup action. The Calendar page remains available for listing, revocation, and deletion while Tasks is disabled; create and rotate fail closed until Tasks and the owner's required live scope are active.
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
