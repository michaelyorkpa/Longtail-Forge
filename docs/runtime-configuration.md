# Runtime Configuration

Longtail Forge reads install and startup configuration from environment variables. At app startup, `server.js` loads a local root `.env` file when present, then `src/config.js` normalizes the resulting environment. A real `.env` file is local runtime state and must not be committed; use `.env.example` as the documented contract.

Configuration test ownership is deliberately split. `tests/unit/runtime-configuration.test.mjs` directly exercises the complete deterministic `createConfig` matrix: defaults, explicit-value normalization, relative paths, accepted scanner modes, production warnings, legacy ignored input, and expected validation errors. `scripts/runtime-configuration-contract-regression.mjs` remains a discovered integration owner for fresh child-process environment materialization, import/startup failure propagation, disposable-database and module-registry loading, canonical version/runtime documentation contracts, and the sessions, cookies, transport security, authentication throttling, workspace bootstrap, Secure Notes, Files storage, and `/api/app-info` consumers. Adding a pure case belongs in Vitest; adding or changing a process, database, registry, startup, or runtime-response boundary belongs in the retained regression.

As of 0.33.18.2, this contract includes fail-closed production validation, structured secret-free production output, server-generated request correlation, public liveness/readiness probes, active explicit trusted-proxy configuration, proxy-aware request context, production public-URL enforcement, the fixed cookie scope policy, trusted-effective-HTTPS HSTS gating, production scanner and data-path readiness probes, database-backed login/password-sensitive throttling with internet-safe defaults, immediate session revocation, enforced post-reset password change, Argon2id password hashing with transparent legacy migration, consolidated security-event logging and retention, one framework browser-mutation boundary for origin, CSRF token, and content-type enforcement, and one enforced browser security-header policy with a documented CSP rollout path. The supported app runtime baseline is Node 24.7+ within the Node 24 line through the root package `engines.node` range `>=24.7 <25`; Node 24.7 is the minimum because it introduced the built-in Argon2id API. The native SQLite dependency is pinned to `better-sqlite3@13.0.1`. Its N-API runtime loads the bundled prebuild on the currently qualified `linux/amd64` Debian Bookworm/glibc target, while a clean Linux `npm ci` still requires Python 3, `make`, and a C/C++ compiler for the package's `node-gyp` install lifecycle. The final container runtime omits that builder-only toolchain; arm64 and musl/Alpine are not current deployment claims. Worker settings, job retention settings, local Files upload storage-provider selection, local storage provider diagnostics, the local storage streaming write contract, single-file multipart uploads, streamed multipart batch uploads, the attachment-helper streamed batch path, streamed upload error hardening, workspace/per-user Files quota enforcement, streamed signature validation, download/preview metadata pre-checks, malformed batch file-part failure handling, storage adapter contract cleanup, scanner mode resolution, safe scanner health diagnostics, the optional `clamscan` executable scanner adapter, the optional `clamd` TCP scanner adapter, S3-compatible adapter scaffolding, the mocked S3 object-operation proof, safe S3 diagnostics, and the signed URL boundary plan are now documented; PostgreSQL, Unix-socket scanning, direct-transfer behavior, provider-specific S3 client rollout, and actual signed URL routes remain reserved until their roadmap slices wire behavior. ClamAV setup guidance for Linux, Windows, and macOS is documented in [file-scanner-setup.md](file-scanner-setup.md). The 0.33.5.24 Node runtime branch changes the developer/runtime baseline and native-driver install contract; it does not add active runtime environment variables.

Express 5.2.1 is the supported HTTP runtime baseline. `createApp()` explicitly retains the prior extended query-parser shape for nested and repeated query values, uses root-inclusive named wildcard syntax for the protected browser fallback, preserves the established middleware/router/error-handler order, and continues to use the shared bounded JSON and multipart body readers. This migration adds no runtime environment variable and does not broaden proxy trust, static-file reach, request-body limits, or public API behavior.

Storage Provider and Scanner Runtime branch is complete as of 0.33.5.22.15, with a 0.33.5.25.1 cleanup that makes S3 storage explicitly deferred scaffolding, a 0.33.5.25.2 cleanup that makes Files workspace/per-user storage quotas active, a 0.33.5.25.3 cleanup that hardens streamed validation plus download/preview metadata pre-checks, and a 0.33.5.25.4 cleanup that closes the branch with per-file malformed batch failures and an adapter contract matching wired storage behavior. The live local storage/scanner keys are `LONGTAIL_STORAGE_PROVIDER`, `LONGTAIL_LOCAL_STORAGE_ROOT`, `LONGTAIL_FILE_SCANNER`, `LONGTAIL_CLAMD_HOST`, `LONGTAIL_CLAMD_PORT`, and `LONGTAIL_CLAMSCAN_PATH`; the reserved S3 keys are `LONGTAIL_S3_BUCKET`, `LONGTAIL_S3_REGION`, `LONGTAIL_S3_ENDPOINT`, `LONGTAIL_S3_ACCESS_KEY_ID`, and `LONGTAIL_S3_SECRET_ACCESS_KEY`. `LONGTAIL_CLAMD_SOCKET` is not active, no runtime key enables direct/presigned S3 upload or download routes, and no provider-specific S3 SDK/client setting exists yet. PostgreSQL settings remain reserved for the 0.40.0 database extraction layer; 0.33.5.23 is SQL parameter-binding migration and does not make PostgreSQL settings live.

Process environment values win over `.env` values. This lets shells, service managers, containers, and hosted runtimes override local defaults without editing the local file. Missing `.env` files do not fail startup.

As of 0.33.16.12, the supported private-internet posture is closed around the direct Caddy operator path in [Reference Internet Deployment](internet-deployment.md); that runbook owns DNS/TLS, ports, listener and filesystem permissions, forwarding behavior, logging, backup location, upgrade/emergency procedures, live proxy proof, and known limitations.

As of 0.33.17.1, the supported runtime can be installed from the checksummed allowlisted tarball described in [Runtime Artifact](runtime-artifact.md). The artifact carries this configuration contract and `.env.example`, but never a real `.env`, secret, database, uploaded file, log, cache, or other installation state. Operators still supply the environment separately and install the pruned runtime dependency graph with `npm ci --omit=dev`; on the qualified Linux target that install requires Python 3, `make`, and a C/C++ compiler even though the running driver loads its bundled native prebuild.

As of 0.33.17.2, [Docker and Bare-Metal Preview Deployment](preview-deployment.md) owns the supported Compose and staged-release installation shapes. Compose variables such as image tag, loopback host port, volume name, network range, and backup directory configure orchestration; they do not become application settings. Runtime secrets and application variables still come from a protected external environment file, while the container fixes database and Files paths to its one local persistent data volume.

As of 0.33.17.5, maintained immutable deployments may also provide `LONGTAIL_RELEASE_COMMIT` as an exact 40-character hexadecimal Git commit and `LONGTAIL_RELEASE_ARTIFACT_SHA256` as the exact 64-character artifact checksum. They are release identity, not user settings or secrets. `/api/app-info` returns them so operators can compare the running process to selected release metadata; ordinary local runs report `null`. The bare-metal systemd example loads these values from the optional root-owned `/etc/longtail-forge/release.env` file.

As of 0.33.17.3, [Baseline Backup and Restore](backup-restore.md) owns the safe configuration inventory recorded in recovery archives. It records only provider and operating-mode classifications needed for restore review; it never copies `.env`, secrets, endpoints, credentials, the Secure Notes master key, or raw protected paths into the archive.

As of 0.33.17.4, [Development and Demo Data](development-and-demo-data.md) owns the local seed/reset environment boundary. Those commands require `LONGTAIL_ENV=development`, an explicitly marked and contained data directory, and a unique `SUPER_ADMIN_PASSWORD`; they refuse production/live/customer targets, clear Secure Notes key variables, and never change the production runtime contract or seed a normal startup.

As of 0.33.19.1, [Demo Host Data Provisioning and Reset](demo-data-operations.md) owns a separate operator-only contract for the named `rt-ltf-demo` installation. Its root-owned helper configuration contains exact host/service/path identity but no application secret; the helper reads the existing protected application environment without printing or copying it, stages fictional data through the unchanged local scenario definition, and never runs from app/worker startup or ordinary Nightly deployment. It is not an application runtime setting surface or a general production seed escape hatch.

As of 0.33.17.6, [Private Preview Readiness](private-preview-readiness.md) owns the invitation gate that consumes this runtime configuration contract. It requires production fail-closed settings, exact release identity, tested backup/restore, separately protected Secure Notes key recovery, healthy `clamd` or `clamscan` scanning, unique invited accounts, and no unsafe production overrides before private-preview access is granted.

As of 0.33.17.7, the public login surface shows the required password-change form only after a successful login or existing session reports `passwordChangeRequired`; an ordinary unauthenticated visit shows only the login form. This visibility correction does not change the administrator-reset, restricted-session, password-change, throttling, or audit contracts below.

As of 0.33.17.7.1, User Settings renders Theme mode as a bounded Light/Auto/Dark radio group and renders the OS-match Auto source as a separate subordinate bounded control. This layout correction does not change the persisted `theme_mode` / `theme_auto_source`, cookie, first-paint, or operating-system color-scheme contracts below.

As of 0.33.17.7.2, maintained deployments supply `LONGTAIL_RELEASE_BRANCH` as their validated source branch. `/api/app-info`, runtime diagnostics, app-shell metadata, the splash, and the footer expose `<canonicalVersion>-<sourceBranch>` while keeping the unsuffixed package version available separately as `canonicalVersion`. The checked-in artifact and deployment paths pass `nightly` or `main` explicitly and never require `.git` in an installed artifact. A developer may omit the variable for an explicitly local unqualified run.

As of 0.33.17.7.3, protected Settings pages use one shared page transaction with two Revert/Save action pairs and an unsaved-navigation guard. This is browser transaction anatomy only: existing workspace/module, Files, user, and Notifications routes remain authoritative, and password/workspace/account/session/API-key lifecycle actions remain independent.

As of 0.33.17.7.4, Settings navigation uses the ordered Admin drawer and Workspace Settings groups optional modules without changing their namespaced values. Files Settings restores its required shared status dependency, and enabled Developer Example settings use the standard module Settings host rather than a standalone diagnostic page. These are browser host/navigation changes only; runtime environment variables, storage providers, module persistence, and route authorization are unchanged.

As of 0.33.17.7.5, disabled Tasks and Time Tracking retain permission-checked Settings recovery pages, and successful module lifecycle saves refresh app-shell navigation and Quick Action Capture immediately. Tasks and Workbench suppress task-timer surfaces when Time Tracking or Task Timers is disabled while preserving manual Time Tracking when only Task Timers is off. This changes no environment variable, startup policy, persistence format, route authorization, or timer mutation contract.

As of 0.33.17.7.6, workspace type is immutable after creation, workspace rename authorization is enforced for Workspace Administrators and Super Admins in the Settings service, and the Users dialog action resides in the Workspace Settings page header. This adds no environment variable, startup policy, database migration, or new route.

As of 0.33.17.7.7, User Settings derives its timezone choices and current UTC offset labels from the browser's supported IANA timezone catalog, and its reorganized workspace-creation and membership-departure anatomy continues to use the existing routes. This adds no environment variable, startup policy, database migration, or new route.

As of 0.33.17.7.8, initial login and workspace switching use per-user preferred landing values stored on `users` by migration 073. The server resolves module status, workspace capabilities, and permissions before returning a same-origin protected path, with Dashboard as the deterministic fallback. This adds no environment variable, startup policy, or route; the existing login, session, User Settings, and workspace-switch routes carry the new fields.

As of 0.33.17.7.9, User Admin can add an exact existing or new identity to an administrable workspace with a server-authorized initial role and scope. Migration 074 changes Project Administrator to concrete project scope. This adds no environment variable, startup policy, secret, or external account-directory integration; the Users and Permissions services and the existing database remain authoritative.

As of 0.33.17.7.10, self-service Delete Account retires credentials, sessions, API keys, roles, grants, and workspace memberships while retaining durable identity and attribution; User Admin deletion remains current-workspace-scoped and cannot target the signed-in user. Unknown, inactive, and retired identities share one non-enumerating login denial. This adds no environment variable, startup policy, database migration, external identity provider, or secret contract.

As of 0.33.17.7.11, task-timer status audit rows retain readable Client and Project attribution and the Audit browser recovers those labels from permitted saved task snapshots for older rows. This adds no environment variable, startup policy, route, permission, or database migration.

As of 0.33.17.7.12, `LONGTAIL_WORKSPACE_BACKUP_ROOT` selects the protected server-side destination for administrator-created one-workspace packages. The app creates packages beneath a workspace-specific subdirectory, rejects a root inside `public/`, and returns no server path or download URL to the browser. Compose pins the root to `/var/backups/longtail-forge/workspaces` on its protected backup mount. [Workspace Backup Package](workspace-backup.md) owns the extraction, checksum, Secure Notes, validation, and disposable-restore contract.

As of 0.33.17.7.14, workspace-deletion requests and final purge use only database-backed lifecycle/job state plus existing Files and workspace-backup roots. There is no new environment variable, automatic deadline sweep, startup cleanup, or page-request deletion behavior. An operator deliberately queues an eligible workspace with `npm run workspace:purge -- --workspace-id <id>`; the configured inline or separate worker executes the same restart-safe job boundary.

As of 0.33.17.7.15, zero-workspace account-export recovery is also entirely database-backed. It adds no environment variable, mail/token recovery channel, workspace-backup route, or public API scope. Eligibility is recorded only at a former workspace-administrator access-loss boundary, and the nullable-workspace session is restricted to the portable account export, minimal recovery page/session read, and logout.

As of 0.33.17.7.16, Timer project selectors preserve the shared Clients/Projects hierarchy order and readable labels. This is a browser option-rendering correction only; it adds no environment variable, startup policy, route, payload, permission, or database migration.

As of 0.33.17.8.1, the same private-internet contract adds the exact Nginx -> WireGuard -> Caddy path while retaining direct Caddy. The bounded path normalizes forwarding authority at each hop and keeps application `TRUST_PROXY` limited to loopback Caddy; it does not authorize generic multi-proxy trust or add an application environment variable.

As of 0.33.17.8.2, SQLite baseline and migration checksum validation is portable across LF and CRLF checkouts. New checksums use canonical LF SQL, validation accepts only the exact LF or CRLF representation of otherwise identical SQL, existing migration-ledger rows remain unchanged, and every other applied-SQL mismatch still blocks startup. This adds no environment variable or operator bypass.

As of 0.33.18.3, app and separate-worker database startup emit structured lifecycle phase timings. Production records use the existing secret-safe operational logger fields for action component, lifecycle mode, owner source, state, integer duration, and safe error type; development uses equivalent `[startup-phase]` key/value lines. Migration 080 tracks completed one-time application repairs so legacy full-table normalization does not repeat on every boot. This adds no environment variable, log destination, database-provider choice, credential behavior, worker mode, or readiness-route change.

As of 0.33.17.8.3, the root-owned SSH deployment-state directory is execute-only traversable (`0711`) so the pinned deployment account can reach its own nested `0700` inbox without listing the parent or accessing sibling state. The backup directory remains root-only `0700`; this corrects host filesystem permissions without adding an application environment variable or broadening the deployment account's sudo boundary.

As of 0.33.17.8.4, the Linux SSH deployment helper is tracked with an explicit LF-only Git attribute and release coverage requires that checkout policy. This preserves the host helper's shebang and Bash syntax across Windows development checkouts without changing runtime environment variables or the helper's privilege boundary.

As of 0.33.17.9, the root-owned bare-metal deployment helper reads allowlisted literal helper settings from the separate root-owned, non-writable `/etc/longtail-forge/deploy-helper.env`; reapplies the configured dedicated application account and private data/Files/database modes after a complete restore; rejects symbolic-link substitutions before privileged permission repair; and restores the retained current release identity plus pre-rollback backup if a rollback candidate fails startup or identity verification. The helper file owns `LTF_PUBLIC_URL`, an optional `LTF_SECURE_KEY_BACKUP` path, and reviewed helper-only overrides such as `LTF_APP_ACCOUNT` and `LTF_APP_GROUP`. These are not application runtime variables or diagnostics values, and reinstalling the helper does not replace the host file.

As of 0.33.24.1, `/etc/longtail-forge/maintenance-helper.env` is a separate root-owned, non-writable host-helper contract. It is parsed as allowlisted literal data rather than sourced as shell code and contains no application secret. `LTF_MAINTENANCE_OPERATOR_GROUP` names the dedicated group authorized to change only the operator marker; `LTF_MAINTENANCE_STATE_ROOT`, `LTF_MAINTENANCE_ASSET_ROOT`, and `LTF_MAINTENANCE_HELPER_PATH` keep caller-writable marker state separate from the root-owned page and helper. The file must be `root:root` mode `0644` because an unprivileged authorized caller needs to read the reviewed paths, but caller environment variables are discarded and cannot override them. Its root-owned parent may be non-listable `0711` so the caller can traverse to this known file while sibling `0600` deployment/application environments remain unreadable. These values are not application runtime configuration, are not exposed through diagnostics, and do not toggle an in-app setting. The deployment marker remains root-only for later integration with the existing root-owned deploy helper.

## Current Active Settings

### App

| Variable | Default | Notes |
| --- | --- | --- |
| `LONGTAIL_ENV` | `development` | Must be `development`, `test`, or `production`. Production activates the fail-closed policy below. |
| `LONGTAIL_PUBLIC_URL` | empty | Absolute HTTP/HTTPS public URL. It is required in production; production HTTPS requires the configured trusted TLS reverse proxy. A declared production HTTP URL fails startup unless the explicit unsafe override below is true. |
| `LONGTAIL_UNSAFE_ALLOW_INSECURE_PUBLIC_URL` | `false` | Unmistakable development-only escape hatch for an explicitly accepted production HTTP deployment. When enabled with a production HTTP URL, startup emits an unsafe-override warning. Do not use for an internet preview. |
| `LONGTAIL_LOG_LEVEL` | `info` | Must be `trace`, `debug`, `info`, `warn`, or `error`. Production rejects `trace`/`debug` unless the explicit override below is true. |
| `LONGTAIL_UNSAFE_ALLOW_DEBUG_LOGGING` | `false` | Narrow production override for temporary trace/debug logging. Startup emits an unsafe-override warning; browser errors remain generic even when enabled. |
| `HOST` | `0.0.0.0` | Express listen host. |
| `PORT` | `8001` | Express listen port. Must be an integer from 1 through 65535. |
| `LONGTAIL_RELEASE_BRANCH` | empty | Source branch for release identity. Deployment automation supplies `nightly` or `main`; values must use lowercase letters/numbers with internal dots, underscores, or hyphens. Leave blank only for an explicitly local unqualified run. |
| `LONGTAIL_RELEASE_COMMIT` | empty | Optional immutable deployment identity. When present, it must be the exact 40-character hexadecimal Git commit and is returned by `/api/app-info`. |
| `LONGTAIL_RELEASE_ARTIFACT_SHA256` | empty | Optional immutable deployment identity. When present, it must be the exact 64-character artifact checksum and is returned by `/api/app-info`. |

### Trusted Reverse Proxy

| Variable | Default | Notes |
| --- | --- | --- |
| `TRUST_PROXY` | `false` | `false` is direct/local mode and ignores every `X-Forwarded-*` header. To enable proxy trust, provide a comma-separated allowlist of the immediate proxy peer IP addresses or CIDR ranges, such as `127.0.0.1/32,::1/128`. Blanket `true` is rejected. |

Longtail Forge configures Express `trust proxy` from this allowlist before creating the shared request context. The resolved client IP, effective protocol, and effective hostname honor `X-Forwarded-For`, `X-Forwarded-Proto`, and `X-Forwarded-Host` only when the socket peer matches an allowlisted proxy. Otherwise the client IP is the socket peer, the protocol is the direct connection protocol, and the hostname comes from `Host`. Login session storage and audit context use the resolved client IP. Session, theme, and theme auto-source cookies gain `Secure` whenever the trusted effective protocol is HTTPS, even when `LONGTAIL_SESSION_COOKIE_SECURE=false`; setting that variable to `true` still forces `Secure` for every request.

#### Supported proxy references

Both supported proof topologies keep one Node process reachable only on loopback behind one Caddy process. The direct topology terminates TLS at Caddy. The bounded multi-proxy topology terminates TLS at public Nginx, crosses one allowlisted WireGuard path to private Caddy, and collapses the verified chain before Node. Both use application environment values equivalent to:

```dotenv
LONGTAIL_PUBLIC_URL=https://forge.example.com
LONGTAIL_ENV=production
HOST=127.0.0.1
PORT=8001
TRUST_PROXY=127.0.0.1/32
LONGTAIL_SESSION_COOKIE_SECURE=true
LONGTAIL_HSTS_MAX_AGE_SECONDS=300
LONGTAIL_FILE_SCANNER=clamd
# Supply strong deployment secrets from the service manager or secret store:
# SUPER_ADMIN_PASSWORD=...
# LONGTAIL_SECURE_NOTES_MASTER_KEY=...
```

Use this minimal Caddyfile, replacing the example hostname:

```caddyfile
forge.example.com {
    reverse_proxy 127.0.0.1:8001
}
```

Direct-edge Caddy ignores client-supplied forwarding values and derives the client IP, public protocol, and host itself. In the bounded multi-proxy topology, public Nginx replaces those values, private Caddy accepts only the exact Nginx WireGuard peer and parses right-to-left, then replaces the upstream chain with one resolved client IP. Longtail Forge still trusts only loopback Caddy; do not add the Nginx address, WireGuard subnet, private ranges, or a hop count to `TRUST_PROXY`. Do not expose port 8001 publicly. If Longtail Forge is run directly for local/private HTTP use, keep `TRUST_PROXY=false`; forwarded headers are then deliberately ignored.

The authoritative operator path is [Reference Internet Deployment](internet-deployment.md), including both checked-in Caddyfiles, the Nginx example, DNS/port and permission requirements, manual upgrade and emergency procedures, both repeatable proxy smokes, and known limitations. Other proxy chains remain unsupported until they receive the same bounded design and proof.

### Authentication Throttling

| Variable | Default | Notes |
| --- | --- | --- |
| `LONGTAIL_AUTH_THROTTLE_ENABLED` | `true` | Enables the shared login and password-sensitive throttle. Production rejects `false` unless the explicit override below is true. |
| `LONGTAIL_UNSAFE_ALLOW_DISABLED_AUTH_THROTTLE` | `false` | Narrow production override for a deliberately trusted offline/internal deployment. Startup emits an unsafe-override warning. Do not use for an internet preview. |
| `LONGTAIL_AUTH_THROTTLE_WINDOW_SECONDS` | `900` | Failure-count window, from 1 through 86400 seconds. |
| `LONGTAIL_AUTH_THROTTLE_FAILURE_LIMIT` | `5` | Failed-verification or bounded sensitive-action threshold, from 1 through 1000. Crossing the threshold starts the temporary lockout. |
| `LONGTAIL_AUTH_THROTTLE_LOCKOUT_SECONDS` | `900` | Temporary lockout duration, from 1 through 604800 seconds. |
| `LONGTAIL_AUTH_VERIFICATION_CONCURRENCY_LIMIT` | `4` | Maximum simultaneous admitted login password verifications for this app process, from 1 through 64. |
| `LONGTAIL_AUTH_VERIFICATION_CONCURRENCY_PER_IP_LIMIT` | `2` | Maximum simultaneous admitted login password verifications for one trusted client IP, from 1 through the global limit. |

Login failures are tracked independently by the trusted effective client IP and normalized submitted username. Either bucket can block an attempt, so rotating usernames does not bypass the IP limit and rotating client IPs does not bypass the targeted-account limit. Direct/untrusted requests use the socket peer established by the shared request context; raw or forged `X-Forwarded-For` values never create throttle keys. As of 0.33.17.7.17, the supported one-server SQLite/private-preview topology persists these installation-scoped buckets in `authentication_throttle_entries`, so counters and lockouts survive an intentional app restart. The table stores only scope, dimension, a versioned SHA-256 digest of the normalized bucket key, failure count, window/lock/expiry timestamps, and maintenance timestamps; it never stores submitted usernames, client IPs, passwords, hashes, session identifiers, or tokens. Each read/increment/reset is transaction-serialized, expired rows are pruned in bounded batches, and unlocked least-recently-touched rows enforce the configured tracked-key ceiling without dropping active lockouts. Multi-web-node hosting still requires a shared backend with cross-node atomic semantics before claiming equivalent protection.

As of 0.33.21.21.4, login also acquires a process-local admission lease before reading the durable throttle or starting Argon2id, PBKDF2, or unknown-user dummy verification. The synchronous lease acquisition strictly caps in-flight work globally and per trusted client IP; it is held until an admitted failure is transactionally recorded or a successful credential check resets the durable buckets. Capacity rejection returns the same generic `429` envelope, performs no password work, and does not increment account failures. The admission bound remains active even when a deliberately trusted offline install disables the failure throttle. This process-local boundary matches the supported one-app-server topology; a future multi-web-node deployment requires a shared admission design as well as the already-deferred cross-node durable throttle.

As of 0.33.17.7.19, the shared bottom Settings Revert/Save row fills the available page width so its existing end alignment places the actions at the bottom right. This browser-only layout correction changes no environment variable, startup validation, route, payload, permission, or Settings transaction behavior.

As of 0.33.17.7.20, the pre-preview UI/UX review closeout records the remaining manual-review disposition and keeps real TLS/proxy evidence deferred to the live preview environment. This bookkeeping closeout changes no environment variable, startup validation, route, payload, permission, database schema, or browser transaction behavior.

As of 0.33.17.8, the public login form offers an unchecked `Remember me for 30 days` preference. Omitted or false values retain the configured `LONGTAIL_SESSION_TTL_SECONDS` lifetime; a literal boolean `true` creates one absolute 2,592,000-second session whose authoritative `sessions.expires_at` and `HttpOnly` session-cookie `Max-Age` match. The remembered path reuses the existing opaque bearer and session table, does not slide or renew, preserves the configured cookie/trusted-proxy/CSRF/throttle/audit posture, and remains subject to logout, expiry, password reset/change, user deactivation, individual revocation, and workspace-wide revocation. A forced-password-change session stays restricted until the required change succeeds while preserving the requested absolute expiry.

The fifth admitted failed login under the defaults returns `429` with `Too many attempts. Try again later.` and locks the affected IP and/or account bucket for 15 minutes. Unknown, inactive, and wrong-password accounts all receive the same invalid-credential response before lockout. Every admitted known or unknown account still performs the appropriate real or dummy verification so the missing-account path does not become a cheap existence signal; a request rejected by pre-verification admission performs none. A successful login below the threshold resets that login IP and account state.

The same framework throttle owns separate scopes for current-password verification and administrator password reset. Failed current-password checks lock out further password-change verification after the threshold. Successful admin reset actions are bounded: the threshold action completes, emits the lockout event, and later reset attempts are rejected until expiry. Future reset-token redemption and other session-less credential/token surfaces must use the same trusted-IP boundary when they are implemented. Each threshold crossing emits `security.authentication_throttle.lockout` with the safe scope, attempted username, trusted client IP, and triggered dimensions; passwords, password hashes, session IDs, and tokens are never included.

The existing public API uses 192-bit random API keys stored by SHA-256 hash lookup, not user-chosen credentials, so password-guess throttling is not applied to API-key authentication in this slice. There is no shipped public-intake credential route. Any future tokenized feed, public intake, or lower-entropy secret surface must make an explicit abuse-limit decision rather than assuming this login policy applies automatically.

### Password Hashing And Transparent Migration

All credential creation and verification goes through the asynchronous `hashPassword`/`verifyPassword` boundary in `src/security/passwords.js`. New bootstrap, created-user, changed, reset, and scale-seed credentials use Node's built-in Argon2id with a random 16-byte salt, a 32-byte tag, 64 MiB of memory (`m=65536` KiB), three passes, and one lane. The stored PHC string is self-describing (`$argon2id$v=19$m=65536,t=3,p=1$...`) so a future policy can verify older parameter sets and mark them for another upgrade. The selected profile averaged about 171 ms on the reference development host, below the one-second operational ceiling while remaining materially memory-hard. The asynchronous runtime API avoids blocking the JavaScript event loop; pre-verification admission bounds queued/in-flight KDF work, the durable trusted-IP/account throttle bounds admitted credential failures, and the parser rejects unsafe stored memory/pass/lane values before invoking the KDF.

Legacy `pbkdf2_sha256$iterations$salt$hash` credentials remain readable through asynchronous PBKDF2 verification. After a successful login, an old algorithm or old accepted Argon2id parameter set is immediately replaced with the current Argon2id representation before the session is returned. This representation-only upgrade preserves `password_change_required`, does not revoke sessions, and emits `security.password.rehashed` with only the previous/current algorithm classifications and `legacy_algorithm` or `parameters_outdated` reason. Unknown-account login attempts verify against a fixed current-policy dummy hash so the missing-account path is not a cheap hash-format signal. Derived-byte comparison uses `timingSafeEqual`; passwords, hashes, tokens, cookies, and session identifiers never enter the rehash event or audit payload.

No pepper is configured. Introducing one would make an external secret part of every login and would require a documented backup, availability, compromise rotation, and forced-reset recovery policy; 0.33.16.9 deliberately avoids creating that undocumented lockout dependency. The existing new-password validation policy is unchanged, so previously valid credentials are not invalidated and no mass reset is required.

### Security Event Audit Stream

Security-relevant activity uses the existing `audit_logs` store with the dedicated `record_type = security_event` and `change_type = security` category. It covers successful and failed login, logout, throttle lockout, session revocation, password reset/change/rehash, user deactivation, audit-retention/logging changes, and permission denials. Every entry carries a stable event type, outcome, reason class, trusted client IP when available, actor or normalized attempted username, timestamp, and a strict allowlist of safe metadata. Security entries never store previous/new payloads, record URLs, passwords, hashes, tokens, cookies, authorization values, or session identifiers.

Security events are forced even when ordinary App Audit Logging is disabled and follow the workspace Audit Retention Days setting. Workspace-specific events remain in their workspace. A login attempt that cannot be attributed to an existing account is assigned to the protected install owner's workspace so it is retained without creating a global or parallel logging store. The ordinary `/api/audit-logs` read excludes this category; `/api/security-events` and its CSV export require both `audit_logs.view` and `workspace_settings.manage`, retain the existing workspace filter rules, and are available through the Audit Log page's Security events view. Any persistence failure is reduced to a generic server warning and cannot reject an otherwise valid login.

### Operational Logging And Probes

Production stdout/stderr is newline-delimited JSON with `timestamp`, `level`, and a stable `event`. HTTP completion records add only server-generated `requestId`, method, status code, and duration; the matching `X-Request-ID` response header supports correlation. A 500-class request failure adds one correlated `http.request.failed` record with only error type, sanitized function-name stack frames, route class, and actor/workspace presence classifications. Client request IDs are ignored. The allowlist omits URLs, paths, queries, bodies, headers, credentials, sessions, user/workspace IDs, private content, exception messages, internal paths, and raw stacks. Development remains human-readable. See [operational-security.md](operational-security.md) for collection guidance and the complete incident/security-review contract.

Unauthenticated `GET /healthz` returns only `200 {"status":"ok"}` for process liveness. `GET /readyz` returns only `200 {"status":"ready"}` or `503 {"status":"not_ready"}` after checking database runtime safety, current checksum-valid migrations, and configured worker liveness. A separate SQLite worker updates the existing single-worker lock heartbeat; stale/missing heartbeat and disabled-worker mode are not ready. Both probes are `no-store`, receive `X-Request-ID`, and never reveal the failed component, version, path, worker ID, exception, or secret.

### Browser Mutation And CSRF Boundary

Every state-changing browser API request (`POST`, `PUT`, `PATCH`, or `DELETE` under `/api`) passes through one framework middleware before public login/logout routes, authenticated module routes, or body parsers can handle it. The bearer-authenticated `/api/v1` public API is intentionally outside this cookie-CSRF boundary and retains its own API-key authentication and scope checks.

When an `Origin` header is present, its parsed origin must exactly match either the trusted effective request origin or the configured `LONGTAIL_PUBLIC_URL` origin. A malformed or cross-origin value fails with `403`, even if a valid token is also supplied. Only when `Origin` is absent may an absolute `Referer` act as a constrained fallback, and its origin must pass the same exact comparison. The effective request origin uses the shared trusted-proxy request context; forged `X-Forwarded-Host` or `X-Forwarded-Proto` values from a direct or untrusted peer cannot extend the allowlist.

If both browser-controlled origin headers are absent, browser-like requests must provide the signed double-submit token from `GET /api/csrf-token`: the browser-readable `lf_csrf` cookie and `X-CSRF-Token` header must match and verify. The early shared browser bootstrap wraps same-origin `fetch` mutations and adds this proof without changing caller payloads; it fetches a fresh token when the cookie is absent. Tokens are process-scoped and may be refreshed after a restart. Origin-less non-browser clients remain compatible because CSRF is a browser cookie-confusion defense, but any supplied token pair is still validated and an invalid or partial pair fails closed. `SameSite` remains defense in depth and never substitutes for this boundary.

JSON mutation bodies must use `application/json`. Bodyless actions such as logout and action-only `POST`/`DELETE` routes may omit `Content-Type`. `multipart/form-data` is allowed only on `/api/files/upload` and `/api/files/upload/batch`; form-encoded, text, and multipart bodies on other browser API routes fail with `415` before route logic runs. This preserves legitimate Files uploads without creating route-by-route content-type exceptions.

### Browser Security Headers And CSP

The framework transport-security middleware applies the following policy to public, authenticated, API, asset, redirect, and error responses:

- `Content-Security-Policy` defaults all content to same-origin, limits scripts to same-origin external files, rejects inline event handlers, blocks plugins/objects and child frames, prevents framing with `frame-ancestors 'none'`, restricts forms and connections to same-origin, and allows only the inventoried `data:`/`blob:` image, font, and media preview sources.
- `X-Frame-Options: DENY` supplies compatible anti-framing behavior for clients that do not enforce CSP `frame-ancestors`.
- `X-Content-Type-Options: nosniff` prevents content-type guessing.
- `Referrer-Policy: strict-origin-when-cross-origin` retains full same-origin navigation context while limiting cross-origin requests to the public origin.
- `Permissions-Policy: camera=(), geolocation=(), microphone=(), payment=(), usb=()` disables browser capabilities the product does not use.
- The existing trusted-effective-HTTPS HSTS policy remains independent and unchanged: HSTS appears only when the request context is HTTPS behind the configured trusted proxy.

The executable-script inventory is now entirely same-origin external classic scripts. The former inline Notifications load guard moved to `/js/notification-load-guard.js`; templates contain no executable inline scripts or inline event handlers, and CSP does not grant `script-src 'unsafe-inline'`, external hosts, `eval`, workers, or frames. Dynamic script loaders used by existing framework/module contributions remain restricted to same-origin paths by `script-src 'self'`.

The current browser still requires inline style compatibility. Protected HTML receives one server-injected critical first-paint theme block, and current browser adapters set bounded style properties for theme state, popover/overlay positioning, nesting depth, and color swatches. Therefore the enforced policy deliberately retains `style-src 'self' 'unsafe-inline'`; it is not a script exception and must not be broadened to external style hosts. The 0.33.18 ES-module/browser modernization work owns reducing these remaining style mutations and the injected critical-style exception.

Any CSP tightening follows an explicit report-only-to-enforcement sequence: deploy the exact candidate policy as `Content-Security-Policy-Report-Only` in the reference environment, run login plus authenticated Dashboard/Notifications and file-preview journeys, review browser violation output for required first-party behavior, remove code violations or add only the narrow documented source, then promote that unchanged candidate to `Content-Security-Policy` and repeat the rendered smoke. Do not enforce removal of the inline-style allowance before the current inventory is migrated and proven. The currently shipped policy is already enforced because the inline executable script was removed and the remaining style exception is explicit and compatible.

All `/api/*`, root, and HTML responses default to `Cache-Control: no-store`, covering login, authenticated/private API data, protected HTML, redirects, and error bodies. Versioned same-origin CSS/JavaScript assets retain normal browser caching. Attachment preview/download responses may replace the general CSP with their existing stricter `sandbox` policy while retaining the shared `nosniff` and other response hardening.

### Data

| Variable | Default | Notes |
| --- | --- | --- |
| `LONGTAIL_DATA_DIR` | `./data` | Root for local runtime data. Relative paths resolve from the app root. |
| `LONGTAIL_WORKSPACE_BACKUP_ROOT` | `./backups/workspaces` | Protected destination for one-workspace package archives and checksum sidecars. Relative paths resolve from the app root; paths inside `public/` are rejected. This is not ordinary Files storage and is never exposed as a browser download. |

### Database

| Variable | Default | Notes |
| --- | --- | --- |
| `LONGTAIL_DATABASE_PROVIDER` | `sqlite` | SQLite is the only implemented provider in 0.33.5.19.9. Unsupported values fail clearly at startup. |

### SQLite

| Variable | Default | Notes |
| --- | --- | --- |
| `LONGTAIL_DATABASE_FILE` | `./data/longtail-forge.db` | SQLite database file opened through the in-process `better-sqlite3` driver. Relative paths resolve from the app root. |
| `LONGTAIL_SQLITE_FOREIGN_KEYS` | `on` | Must stay enabled. Startup fails if this is disabled, and each SQLite process runs with foreign-key enforcement on. |
| `LONGTAIL_SQLITE_JOURNAL_MODE` | `wal` | Journal mode applied during SQLite startup. WAL is the default for small-office installs; set a different valid SQLite mode only when the deployment filesystem requires it. |
| `LONGTAIL_SQLITE_BUSY_TIMEOUT_MS` | `5000` | SQLite busy timeout in milliseconds. The helper applies it to the active SQLite connection and verifies `PRAGMA busy_timeout` during startup health checks. |
| `LONGTAIL_SQLITE_SYNCHRONOUS` | `normal` | `PRAGMA synchronous` mode: `normal`, `full`, or `extra`. The default `normal` is the recommended WAL pairing: it keeps the database corruption-safe, but transactions committed immediately before an operating-system crash or power loss may roll back on restart. Set `full` (or `extra`) to trade write throughput for maximum durability, and prefer `full` when running a non-WAL `LONGTAIL_SQLITE_JOURNAL_MODE`. |
| `LONGTAIL_SQLITE_CACHE_SIZE_KIB` | `65536` | Per-connection SQLite page-cache size in KiB (applied as a negative `PRAGMA cache_size`). Range 1024 through 1048576. |
| `LONGTAIL_SQLITE_TEMP_STORE` | `memory` | `PRAGMA temp_store` target for temporary tables and indices: `default`, `file`, or `memory`. |
| `LONGTAIL_SQLITE_MMAP_SIZE_BYTES` | `0` | `PRAGMA mmap_size` in bytes; `0` keeps memory-mapped I/O disabled. When set above zero, SQLite may cap the effective value below the request, so startup health validates the reported value is positive and no larger than the configured one. |

SQLite startup applies `PRAGMA foreign_keys = ON`, applies the configured `PRAGMA journal_mode`, configures the SQLite busy timeout, applies the configured `synchronous`, `cache_size`, `temp_store`, and `mmap_size` tuning PRAGMAs, and verifies the database file path is writable. Development may emit its detailed local startup health line; production emits only a structured database-ready classification without a path or database internals. Protected Runtime Diagnostics retains its existing safe location labels for authorized administrators. Public health/readiness output does not include database details, secrets, secure-note key material, storage keys, signed URLs, scanner internals, or protected file paths.

SQLite migrations and schema repairs use a local lock file beside `LONGTAIL_DATABASE_FILE` so only one startup or maintenance process owns migration work at a time. This is startup behavior, not a runtime-editable setting.

As of 0.33.5.21.0.6, `SQLITE_COMMAND` is a legacy ignored setting. Normal database access no longer shells out to the `sqlite3` CLI; Longtail Forge uses the in-process `better-sqlite3` dependency and does not require the `sqlite3` executable for normal operation.

### Initial Bootstrap

| Variable | Default | Notes |
| --- | --- | --- |
| `LONGTAIL_INITIAL_WORKSPACE_NAME` | `Longtail Forge Workspace` | Name used only when creating the first fresh-start workspace. Existing workspaces are not renamed. |
| `SUPER_ADMIN_USERNAME` | `support@longtailforge.local` | Username used only when an empty installation creates its initial protected super-admin account. Changing it later does not create or rename an identity. |
| `SUPER_ADMIN_DISPLAY_NAME` | `Super Admin` | Display name for the initial protected super-admin account. Existing users are not renamed except during first-user/bootstrap repair paths. |
| `SUPER_ADMIN_PASSWORD` | empty | Required whenever a fresh installation must create its initial protected super administrator. Supply a unique value that satisfies the password policy. Existing development/test installations can restart without it because bootstrap values never rotate an existing credential; production still requires its deployment secret on every startup. |

The bootstrap password is used only when an empty installation creates its first protected administrator and is never generated, logged, returned by diagnostics, or committed. Any existing protected user, `super_admin` assignment, or other user row prevents startup from inventing a new identity; administrator repair on a nonempty installation must be an explicit maintenance operation. Local development keeps its real value only in the untracked root `.env`. Deployments inject their own value through the service manager or secret store; the local `.env` is not a deployment artifact and must not be synchronized to a server. Operators should replace the account password and username through the normal product workflow after first launch and rotate deployment secrets deliberately; changing `SUPER_ADMIN_USERNAME` or `SUPER_ADMIN_PASSWORD` does not silently create, rename, or recredential an existing account.

### Sessions And Cookies

| Variable | Default | Notes |
| --- | --- | --- |
| `LONGTAIL_SESSION_COOKIE_SECURE` | `false` | Adds the `Secure` cookie attribute when true. It must be true for production HTTPS so an accidentally exposed direct HTTP path cannot issue a non-secure session cookie. |
| `LONGTAIL_SESSION_COOKIE_SAMESITE` | `Lax` | Must be `Lax`, `Strict`, or `None`. `None` requires secure cookies. |
| `LONGTAIL_SESSION_TTL_SECONDS` | `43200` | Normal session, theme, and theme auto-source cookie lifetime. Must be between 300 seconds and 30 days. An explicitly remembered login uses its fixed 30-day session lifetime without changing this setting. |
| `LONGTAIL_HSTS_MAX_AGE_SECONDS` | `300` in production; disabled when unset elsewhere | HSTS lifetime from 0 through 63072000 seconds. Production sends HSTS over trusted effective HTTPS by default with a conservative five-minute rollout; explicit `0` requires the rollback override. |
| `LONGTAIL_UNSAFE_ALLOW_HSTS_ROLLBACK` | `false` | Narrow production override required with `LONGTAIL_HSTS_MAX_AGE_SECONDS=0`; startup emits an unsafe-override warning. |

The session cookie is always `HttpOnly`, `SameSite=Lax` by default, scoped to `Path=/`, and host-only because Longtail Forge does not set a `Domain` attribute. Theme, theme auto-source, and CSRF cookies use the same `SameSite`, root path, host-only, lifetime, and effective-HTTPS `Secure` policy, but intentionally are not `HttpOnly`: the first-paint script reads theme state and the shared browser mutation wrapper reads the CSRF token. `SameSite=None` remains an explicit opt-in and requires `LONGTAIL_SESSION_COOKIE_SECURE=true`; proxy-derived HTTPS alone does not make that cross-site cookie mode implicit.

There is no reusable configured session-signing secret: login creates a 256-bit random opaque session credential backed by the authoritative `sessions` table, and the CSRF HMAC key is generated from process randomness at boot. Session rotation is therefore revocation—individual, user-wide, or password/deactivation-driven—not replacement of a shared signing key. Restarting rotates the process-local CSRF key; browsers fetch a new CSRF token through the existing bootstrap path.

Session revocation deletes the authoritative database row, so the existing request-session lookup rejects that bearer credential on its next request. A successful self-service password change revokes every other session while preserving the request that performed the change; administrator password reset and account deactivation revoke every session for the target user. Owners and administrators with `users.manage` can review and revoke only sessions associated with the active workspace in User Admin. Browser responses contain process-scoped one-way references plus safe creation, expiry, current-session, and IP context; raw session IDs are never returned. Each removed session emits a safe internal `security.session.revoked` event, and each revocation operation creates a forced audit record without session IDs, tokens, passwords, or hashes. A revoked current browser session reaches the existing framework session-expiry dialog on its next API request.

Remembered sessions are ordinary rows in that same authoritative store, so Active Sessions uses the existing `expires_at` readout and every revocation path above applies without a separate token or management workflow. Browser or server restart does not renew the row; the absolute expiry set at login remains final.

Administrator password reset also persists `users.password_change_required=1`. The generated credential is returned only in that successful reset response and is stored only as a password hash. A target can sign in with it, but the resulting session may access only session/logout/CSRF state, the public login assets, and `PUT /api/user/password`; other protected API calls return `403` with `PASSWORD_CHANGE_REQUIRED`, protected page requests return to the login password-change surface, and workspace switching is blocked. A successful current-password-verified change clears the flag, preserves that request's session, revokes the user's other sessions, and immediately restores normal access. Reset and change emit safe `security.password.reset` and `security.password.changed` internal events without credentials, hashes, session IDs, or tokens.

There is no forgot-password or reset-token route because Longtail Forge has no email/notification delivery transport for out-of-band recovery. Administrator reset remains the supported recovery path. Any future self-service recovery must add a delivery channel first and use a single-use, time-limited, hashed-at-rest token, a non-enumerating response, the shared trusted-IP throttle, and forced logout on redemption.

### HSTS Rollout And Rollback

HSTS uses the same trusted effective protocol as Secure-cookie decisions. Longtail Forge emits `Strict-Transport-Security` only when the request is HTTPS after the configured trusted-proxy boundary; direct HTTP, forged `X-Forwarded-Proto`, and headers from an untrusted peer never enable it. The policy is deliberately limited to `max-age`: it does not assert `includeSubDomains` or `preload`, because this private-preview slice does not own every sibling hostname and cannot safely make a preload commitment.

Production starts with a conservative `max-age=300`. Verify the public URL, certificate renewal, proxy trust, redirects, login, logout, and recovery access before raising it in stages (for example one day, then longer). To roll back, set both `LONGTAIL_HSTS_MAX_AGE_SECONDS=0` and `LONGTAIL_UNSAFE_ALLOW_HSTS_ROLLBACK=true`, then continue serving trusted HTTPS long enough for affected browsers to receive `max-age=0`; removing the header or turning off HTTPS first does not clear a browser's cached HSTS state. Do not submit the domain for browser preload in this supported posture.

### Secure Notes

| Variable | Default | Notes |
| --- | --- | --- |
| `LONGTAIL_SECURE_NOTES_MASTER_KEY` | empty | Preferred server-side secure-note key name. Production requires at least 32 non-default characters. |
| `SECURE_NOTES_MASTER_KEY` | empty | Backward-compatible secure-note key name. |
| `LONGTAIL_SECURE_NOTES_KEY_VERSION` | `v1` | Stored on secure notes and revisions for future rotation planning. |

Secure-note keys are runtime secrets. They must not be committed, logged, or exposed through normal UI or diagnostics. Development/test keep the existing fail-closed feature health (`not_configured`) when the key is absent; production refuses startup instead of presenting a partially ready Secure Notes deployment. Back up the key outside the database before storing secure notes. `LONGTAIL_SECURE_NOTES_KEY_VERSION` records envelope version metadata but does not rotate or recover key material by itself.

### Workspace Creation

| Variable | Default | Notes |
| --- | --- | --- |
| `WORKSPACE_INSTALL_MODE` | `self_hosted` | Must be `self_hosted` or `saas`. Environment values override app settings for workspace-creation options. |
| `WORKSPACE_TYPE_LIMIT` | empty | Empty means business, personal, and family workspace types are available where allowed. `business` limits creation to business workspaces. |

### Jobs And Workers

| Variable | Default | Notes |
| --- | --- | --- |
| `LONGTAIL_WORKER_MODE` | `inline` | Must be `inline`, `separate`, or `disabled`. `inline` starts an in-process poll timer with the app server. `separate` leaves the app server out of job execution and expects `node worker.js` with the same database. `disabled` starts no worker for tests or troubleshooting. |
| `LONGTAIL_WORKER_ID` | `default` | Label recorded in `jobs.locked_by` when a worker claims a job. It is operational metadata, not an authentication secret. |
| `LONGTAIL_JOB_POLL_INTERVAL_MS` | `5000` | Poll interval for inline and separate worker timers. This timer is also how future `available_at` jobs wake in SQLite mode. Must be an integer from 1000 through 3600000. |
| `LONGTAIL_JOB_LOCK_TTL_SECONDS` | `300` | Controls when expired running job locks become reclaimable by the next worker poll. Must be an integer from 30 through 86400. |
| `LONGTAIL_JOB_COMPLETED_RETENTION_DAYS` | `30` | Number of days to keep completed job history before framework startup pruning may delete it. Must be an integer from 1 through 3650. Active rows are never pruned by this setting. |
| `LONGTAIL_JOB_DEAD_RETENTION_DAYS` | `90` | Number of days to keep dead-letter job history before framework startup pruning may delete it. Must be an integer from 1 through 3650. Active rows are never pruned by this setting. |

In `inline` mode, worker execution begins after app startup and `app.listen(...)` succeeds. It is not triggered by individual HTTP responses. The poll timer shares the same Node process and SQLite adapter path as request handling, so job writes and request writes use the same local SQLite connection and transaction queue.

In `separate` mode, start the worker with:

```sh
LONGTAIL_WORKER_MODE=separate node worker.js
```

The separate worker loads the same local `.env` file as `server.js`, verifies that the schema and `065_job_outbox_schema` migration are already applied, and does not run migrations or app startup defaults such as module, user, role, or workspace repair. In SQLite mode, `node worker.js` also takes a local `.longtail-forge-worker.lock` beside the SQLite database so at most one local worker process attaches to the same install. A stale worker lock should be removed only after confirming no worker process is running.

As of 0.33.5.21.7.6, the proved separate worker behavior covers the real `node worker.js` process against queued `search.index`, `notification.event`, `task.reminder`, `task.recurrence`, and `file.scan` jobs. The regression also proves `LONGTAIL_WORKER_MODE=disabled` exits with disabled diagnostics without draining jobs, `worker.js` rejects `inline` mode with an operator-facing process-boundary error, and a second local `separate` worker cannot share the same SQLite file.

Job retention pruning is framework-owned maintenance, not a route delete or module-owned loop. App startup and separate-worker startup delete only `completed` rows older than `LONGTAIL_JOB_COMPLETED_RETENTION_DAYS` and `dead` rows older than `LONGTAIL_JOB_DEAD_RETENTION_DAYS`. `pending`, `running`, and `failed` rows stay intact regardless of age so retryable or claimed work is not lost.

As of 0.33.5.21.7.7, recurring task completion responses are closed around the asynchronous worker model: completion returns `createdTask: null` with a safe `recurrenceJob.queued` hint, and the worker creates the next instance later.

## Reserved Settings

These names are documented now and intentionally left mostly dormant until their roadmap slices wire behavior.

As of 0.33.5.22.15, `LONGTAIL_STORAGE_PROVIDER=local` is consumed by Files upload writes and storage provider diagnostics are active. The storage adapter contract supports streamed local writes through `saveStream(readable, options)`, `POST /api/files/upload` accepts one multipart file in local/self-hosted mode, and `POST /api/files/upload/batch` accepts streamed multipart batches with per-file success/failure results. The multipart upload routes use Busboy, expect `moduleId`, `targetType`, and `targetId` metadata fields before file parts in this first ordering contract, enforce upload size while streaming, and then use the same file-row, `file.scan` job, and attachment lifecycle as `POST /api/files` and `POST /api/files/batch`. The shared browser attachment helper now uses the streamed batch route for normal uploads. The existing JSON/base64 routes remain compatibility routes through the 0.33.5.22 storage/scanner branch and are retired no earlier than 0.33.5.23.0 by a later explicit roadmap slice. Streamed upload cancellation, request read errors, fatal parser errors, oversized payloads, and storage stream errors stop active file streams, return bounded failure copy, and avoid active file records, attachments, or usable partial local files.

As of 0.33.5.25.1, S3 storage is explicitly deferred scaffolding. `src/config.js` still parses the reserved S3 settings so the adapter contract and future provider-client rollout keep stable names, and the S3 adapter still has mocked object-operation proof coverage for `putObject`, `getObject`, `headObject`, `deleteObject`, and safe health. Real app and worker startup now validate the selected storage provider before listening or polling; `LONGTAIL_STORAGE_PROVIDER=s3` fails during app and worker startup until a provider-specific client is wired. Operators should use `LONGTAIL_STORAGE_PROVIDER=local`; S3 bucket names, endpoints, credentials, raw provider responses, storage keys, protected paths, root locations, and signed URLs must not appear in diagnostics, normal payloads, lifecycle events, audit metadata, or docs examples. No direct/presigned S3 upload or download route is implemented in 0.33.5.25.1. Any future signed URL exception must be a deliberate route-designed exception with per-object Files permission checks, target access checks where relevant, short expiry, audit/lifecycle expectations, and no persistent signed URLs in normal Files JSON payloads.

As of 0.33.5.25.2, Files workspace and per-user storage quotas are active application settings rather than runtime environment settings. `internal_storage_limit_bytes` and `per_user_storage_limit_bytes` remain `NULL` by default, which means unlimited. When set, both JSON/base64 compatibility uploads and streamed multipart uploads reject over-quota files before creating active file rows or attachments; streamed uploads use the remaining quota as the stream guard so a partial local write is cleaned up on rejection. Quota checks count internal stored bytes that still occupy storage across pending, available, quarantined, and staged-deleted files, at workspace scope and per `uploaded_by_user_id`.

As of 0.33.5.25.3, streamed upload signature validation begins while bytes are streaming once enough sampled header bytes exist for the claimed extension. Wrong-type content can therefore fail before the storage write completes where practical, and any rejected-upload object cleanup that happens after a write is awaited and logged if cleanup fails. Download and preview-content reads call the stored provider's `metadata()` before opening the read stream, so missing or rotated storage objects return a clean 404 before response streaming begins.

As of 0.33.5.25.4, `POST /api/files/upload/batch` treats malformed individual file parts as failed result items instead of rejecting the whole batch when the rest of the multipart request remains parseable. Whole-request parser failures, field limits, too many files, aborted requests, and empty batches remain request-level failures. The active storage adapter contract is `save()`, `saveStream()`, `read()`, `metadata()`, `delete()`, and `health()`; the unused local `quarantine()` method was removed. File quarantine remains a database status/lifecycle transition and does not relocate stored objects until a future roadmap slice explicitly designs that behavior.

File scanner mode selection is active for `none`, `noop`, `clamd`, and `clamscan`: `none` is the default disabled-scanning mode and resolves queued `file.scan` jobs to `status = available` plus `scan_status = not_required`; `noop` is an explicit pass-through scanner for development or accepted self-hosted use and resolves to `scan_status = passed`; `clamscan` is an optional executable scanner adapter that uses `LONGTAIL_CLAMSCAN_PATH` when set or the `clamscan` command on `PATH`, probes scanner health with `--version`, streams file bytes through stdin, treats clean scans as `passed`, and quarantines infected, unavailable, or timed-out scans without auto-deleting stored files; `clamd` is an optional TCP scanner adapter that uses `LONGTAIL_CLAMD_HOST` when set or `127.0.0.1`, uses `LONGTAIL_CLAMD_PORT` when set or `3310`, probes health with `PING`, streams file bytes through `INSTREAM`, treats clean scans as `passed`, and quarantines infected, unavailable, or timed-out scans without auto-deleting stored files. Safe scanner health diagnostics are active: `none` reports disabled, `noop` reports pass-through, and unavailable scanner modes report unavailable health without exposing hostnames, ports, executable paths, scanner output, sockets, storage keys, protected paths, signed URLs, or raw environment values. The `clamscan` and `clamd` adapters return safe scanner metadata only; the `clamd` TCP scanner adapter works without exposing hostnames or ports in diagnostics or UI payloads. Unix-socket scanning is explicitly deferred; there is no `LONGTAIL_CLAMD_SOCKET` setting in this branch. Existing files continue to read through their stored `files.storage_provider` value, so the setting affects new writes only.

Production requires `clamd` or `clamscan` unless `LONGTAIL_UNSAFE_ALLOW_UNSCANNED_UPLOADS=true`; app and separate-worker startup also call scanner `health()` before accepting requests or polling jobs. An unavailable production scanner therefore blocks startup instead of leaving public uploads in a misleading posture. The unsafe override emits an unmistakable redacted warning and is not the supported internet-preview posture.

| Group | Variables | Future owner |
| --- | --- | --- |
| PostgreSQL | `DATABASE_URL`, `LONGTAIL_DATABASE_POOL_MIN`, `LONGTAIL_DATABASE_POOL_MAX`, `LONGTAIL_DATABASE_SSL` | 0.40.0 database extraction layer. 0.33.5.23 is SQL parameter-binding migration and does not make PostgreSQL settings live. |
| File storage | `LONGTAIL_STORAGE_PROVIDER`, `LONGTAIL_LOCAL_STORAGE_ROOT`, `LONGTAIL_S3_BUCKET`, `LONGTAIL_S3_REGION`, `LONGTAIL_S3_ENDPOINT`, `LONGTAIL_S3_ACCESS_KEY_ID`, `LONGTAIL_S3_SECRET_ACCESS_KEY` | 0.33.5.22 storage provider runtime plus the 0.33.5.25.1 S3 cleanup. `LONGTAIL_STORAGE_PROVIDER=local` is the default and only bootable storage provider for new Files upload writes and diagnostics in this release. `LONGTAIL_LOCAL_STORAGE_ROOT` sets the local provider root and is shown in diagnostics only as a safe app-root/data-root relative or redacted label. `LONGTAIL_STORAGE_PROVIDER=s3` is reserved scaffolding and fails app/worker startup until a provider-specific client is wired. The local provider supports buffered `save()` writes, streamed `saveStream()` writes, single-file multipart uploads, streamed multipart batch uploads through the shared attachment helper, and partial-file cleanup for failed local streamed writes where practical. The S3 adapter keeps mocked object-operation proof coverage for `putObject`/`getObject`/`headObject`/`deleteObject`/`health`, but provider-specific client rollout and actual signed URL/direct-transfer behavior remain later slices. Normal diagnostics and browser payloads must not expose buckets, endpoints, credential values, storage keys, protected paths, or signed URLs. |
| File scanning | `LONGTAIL_FILE_SCANNER`, `LONGTAIL_UNSAFE_ALLOW_UNSCANNED_UPLOADS`, `LONGTAIL_CLAMD_HOST`, `LONGTAIL_CLAMD_PORT`, `LONGTAIL_CLAMSCAN_PATH` | Live settings: `LONGTAIL_FILE_SCANNER` selects `none`, `noop`, `clamd`, or `clamscan`; production requires healthy `clamd`/`clamscan` unless the explicit unsafe override is true. `LONGTAIL_CLAMSCAN_PATH` optionally selects the CLI; `LONGTAIL_CLAMD_HOST` and `LONGTAIL_CLAMD_PORT` select the TCP daemon and default internally to `127.0.0.1:3310`. Runtime Diagnostics exposes safe mode/status without endpoints or internals. Deferred setting: Unix-socket scanning is not wired and no `LONGTAIL_CLAMD_SOCKET` key is active. See [file-scanner-setup.md](file-scanner-setup.md). |
| Logging | `LONGTAIL_LOG_LEVEL` | Active validated server logging level; production trace/debug requires the explicit unsafe override documented above. |

Reserved settings may appear in `config` for readout consistency, but this slice does not implement PostgreSQL, Unix-socket scanning, direct-transfer behavior, provider-specific S3 client rollout, actual signed URL routes, or runtime settings editing.

## Startup Validation

As of 0.33.18.4, before opening or mutating the database, app and worker imports validate the tracked bundled-module catalog against repository-owned `src/modules/*/module.js` entries and validate the complete manifest/dependency graph. A stale generated catalog, missing canonical entry export, directory/manifest-ID mismatch, duplicate ID, unresolved dependency, or dependency cycle stops startup before migrations. After database readiness, the app or separate worker explicitly activates module behavior in dependency order; importing module entries alone cannot register search/report/settings/job behavior. This contract adds no environment variable or operator-selected executable module path.

As of 0.33.18.5, the Tasks and Notes canonical entries compose substantial side-effect-free manifest declarations from concern files while the generated catalog still discovers only `src/modules/*/module.js`. This source layout preserves the same startup validation, activation, routes, permissions, and contribution inventory and adds no runtime setting, environment variable, executable search path, or operator-selected module source.

As of 0.33.18.6, Dashboard's native ES-module entry and contribution-loaded scripts/styles reuse the canonical application version already injected into protected HTML. The compatibility bridge accepts only same-origin `/js/` and `/css/` assets and applies that version to dynamic imports and stylesheets. This changes no CSP directive, environment variable, external asset origin, runtime secret, route permission, or deployment setting.

Production (`LONGTAIL_ENV=production`) is an explicit fail-closed posture. A safe public-preview process requires a strong bootstrap password, a strong external Secure Notes master key, an absolute HTTPS public URL, an explicit immediate-proxy allowlist, forced `Secure` cookies, an enabled authentication throttle, non-debug logging, and a configured healthy `clamd` or `clamscan` scanner. Unsafe exceptions use narrowly named `LONGTAIL_UNSAFE_ALLOW_*` variables and emit unmistakable redacted warnings; they are not the supported internet-preview posture.

Before the app listens or a separate worker polls, startup creates/checks the configured data directory, database parent, and local Files root, verifies that they are directories readable and writable by the service account, and—on POSIX production hosts—requires owner-only mode `0700`. Windows does not expose equivalent owner/group/other mode semantics through Node, so the service account must be granted access and broad inherited ACLs must be removed with Windows administration tools. `LONGTAIL_DATA_DIR`, `LONGTAIL_DATABASE_FILE`, and `LONGTAIL_LOCAL_STORAGE_ROOT` are rejected if they resolve inside the public static directory. Readiness errors name only the setting and safe status; they do not print protected paths or secret values.

Browser APIs do not enable cross-origin credential sharing. State-changing browser requests enforce exact same-origin `Origin`/`Referer` checks plus the CSRF token boundary. Files JSON/base64 compatibility bodies are capped at 8 MiB, multipart batches are capped at 50 files and 20 fields with 64 KiB fields, and the Files service applies the attachable type's per-file size limit (5 MiB by default) while streaming. Unknown server exceptions return only `Internal server error` for browser and public API envelopes; stack traces and raw exception messages stay server-side even if the temporary debug-log override is active.

Startup fails clearly when active settings are invalid:

- `LONGTAIL_ENV` must be `development`, `test`, or `production`.
- `LONGTAIL_PUBLIC_URL`, when set, must be an absolute HTTP/HTTPS URL without embedded credentials. It is required in production. Production HTTP fails unless `LONGTAIL_UNSAFE_ALLOW_INSECURE_PUBLIC_URL=true`; production HTTPS requires an explicit `TRUST_PROXY` list and `LONGTAIL_SESSION_COOKIE_SECURE=true`.
- `PORT` must be an integer from 1 through 65535.
- `TRUST_PROXY` must be `false` or a comma-separated list of explicit IP addresses/CIDR ranges. Blanket `true`, hostnames, malformed addresses, and invalid CIDR prefixes fail startup.
- `LONGTAIL_DATABASE_PROVIDER` must be `sqlite`.
- `LONGTAIL_STORAGE_PROVIDER` defaults to `local`; selecting `s3` fails app and worker startup until a provider-specific client rollout is deliberately wired.
- `LONGTAIL_SQLITE_FOREIGN_KEYS` must be `on`.
- `LONGTAIL_SQLITE_JOURNAL_MODE` must be `delete`, `truncate`, `persist`, `memory`, `wal`, or `off`.
- `LONGTAIL_SQLITE_BUSY_TIMEOUT_MS` must be an integer from 0 through 3600000.
- `LONGTAIL_SQLITE_SYNCHRONOUS` must be `normal`, `full`, or `extra`.
- `LONGTAIL_SQLITE_CACHE_SIZE_KIB` must be an integer from 1024 through 1048576.
- `LONGTAIL_SQLITE_TEMP_STORE` must be `default`, `file`, or `memory`.
- `LONGTAIL_SQLITE_MMAP_SIZE_BYTES` must be an integer from 0 through 8589934592.
- `LONGTAIL_FILE_SCANNER` must be `none`, `noop`, `clamd`, or `clamscan`. Production requires `clamd` or `clamscan` and successful startup health unless `LONGTAIL_UNSAFE_ALLOW_UNSCANNED_UPLOADS=true`.
- `LONGTAIL_WORKER_MODE` must be `inline`, `separate`, or `disabled`.
- `LONGTAIL_JOB_POLL_INTERVAL_MS` must be an integer from 1000 through 3600000.
- `LONGTAIL_JOB_LOCK_TTL_SECONDS` must be an integer from 30 through 86400.
- `LONGTAIL_JOB_COMPLETED_RETENTION_DAYS` must be an integer from 1 through 3650.
- `LONGTAIL_JOB_DEAD_RETENTION_DAYS` must be an integer from 1 through 3650.
- `LONGTAIL_SESSION_COOKIE_SAMESITE` must be `Lax`, `Strict`, or `None`.
- `LONGTAIL_SESSION_COOKIE_SECURE` must be true when SameSite is `None`.
- `LONGTAIL_SESSION_TTL_SECONDS` must be between 300 seconds and 30 days.
- `LONGTAIL_HSTS_MAX_AGE_SECONDS` must be between 0 and 63072000 seconds. It defaults to 300 in production and is disabled when unset in development/test. Production `0` requires `LONGTAIL_UNSAFE_ALLOW_HSTS_ROLLBACK=true`.
- `LONGTAIL_AUTH_THROTTLE_ENABLED` must be true or false. Production `false` requires `LONGTAIL_UNSAFE_ALLOW_DISABLED_AUTH_THROTTLE=true`.
- `LONGTAIL_AUTH_THROTTLE_WINDOW_SECONDS` must be between 1 and 86400 seconds.
- `LONGTAIL_AUTH_THROTTLE_FAILURE_LIMIT` must be between 1 and 1000.
- `LONGTAIL_AUTH_THROTTLE_LOCKOUT_SECONDS` must be between 1 and 604800 seconds.
- `LONGTAIL_AUTH_VERIFICATION_CONCURRENCY_LIMIT` must be between 1 and 64.
- `LONGTAIL_AUTH_VERIFICATION_CONCURRENCY_PER_IP_LIMIT` must be between 1 and the configured global verification-concurrency limit.
- `WORKSPACE_INSTALL_MODE` must be `self_hosted` or `saas`.
- `WORKSPACE_TYPE_LIMIT` must be empty or `business`.
- `SUPER_ADMIN_PASSWORD` is required and must be at least 16 non-default characters when `LONGTAIL_ENV=production`.
- `LONGTAIL_SECURE_NOTES_MASTER_KEY` (or the legacy alias) is required and must be at least 32 non-default characters in production.
- `LONGTAIL_LOG_LEVEL` must be `trace`, `debug`, `info`, `warn`, or `error`. Production `trace`/`debug` requires `LONGTAIL_UNSAFE_ALLOW_DEBUG_LOGGING=true`.

The local `.env` loader accepts blank lines, full-line comments, `KEY=VALUE` entries, optional `export KEY=VALUE` entries, unquoted values with trailing comments, and basic single- or double-quoted values. Malformed lines fail clearly before app config is created.

Startup warnings are reserved for explicit unsafe overrides, not missing production requirements. Active production overrides for HTTP, unscanned uploads, HSTS rollback, disabled authentication throttling, or trace/debug logging emit `UNSAFE OVERRIDE ACTIVE` warnings without echoing secret values, configured paths, scanner endpoints, or raw environment values.

## Runtime Diagnostics

`GET /api/runtime-diagnostics` returns the safe runtime diagnostics read model for authenticated users with `workspace_settings.manage` in the active workspace. The route is diagnostic only; it does not edit runtime configuration or expose raw environment variables.

The response includes app version, runtime environment, database provider, database health status, SQLite journal mode, SQLite foreign-key status, SQLite busy timeout, safe database file location, safe data directory location, storage provider, storage provider health, safe local storage root location, scanner mode, scanner health status, scanner disabled/pass-through warnings, worker mode, lock TTL, safe worker status counters, last poll/run/success timestamps, registered job types, and configuration warnings. Paths are app-root or data-root relative when possible; locations outside the app root are redacted to a basename.

Workspace Settings includes a compact read-only Runtime Diagnostics panel that consumes this route for admins. The panel shows storage provider status, safe local storage root location, scanner mode/status, server-provided scanner disabled/pass-through warnings, worker mode, state, timer activity, last poll/run/success timestamps, completed/failed/dead counters, and registered job types without exposing job payloads or runtime secrets. SQLite small-office deployment assumptions are documented in [sqlite-small-office-mode.md](sqlite-small-office-mode.md).

Runtime diagnostics must not include secrets, storage keys, signed URLs, protected paths, scanner internals, secure-note key material, raw `.env` contents, `DATABASE_URL`, secure-note master keys, scanner host/path settings, or raw local storage roots.

## Jobs Admin Readout

`GET /api/jobs/status` returns the minimal durable-job status readout for authenticated users with `workspace_settings.manage` in the active workspace. The response includes pending/running/failed/dead counts and recent failed/dead summaries using the shared bounded-pagination envelope. Workspace Settings consumes this route for its read-only Jobs panel, including a bounded recent failures list and a load-more control when the route returns `nextCursor`. It is read-only and does not expose job payload JSON, dedupe keys, storage paths, scanner internals, or raw environment values.

## Worker Mode For Background Work

As of 0.33.5.21.7.4, `LONGTAIL_WORKER_MODE` controls search indexing, notification fan-out, task reminder firing, recurring task generation, file-scan jobs, and the reserved future-import job type. Task reminders use a documented 30-day scheduling horizon plus a durable 12-hour top-up sweep, uploaded files stay pending and unavailable until an inline or separate worker completes their queued `file.scan` job, and job retention pruning bounds completed/dead-letter history without touching active rows. Reminder notification delivery is idempotent under normal at-least-once worker retries through stable delivery keys and deterministic notification rows. As of 0.33.5.21.8, task due reminders reach in-app notifications for assigned users, unassigned task creators, and existing task followers through the same worker-controlled notification fan-out path.

- `inline` starts one poll timer inside the app process after the server is listening. This is the default SQLite/small-office mode.
- `separate` is for `node worker.js`; it requires the app schema to be initialized already and, in SQLite mode, acquires the one-local-worker lock beside the database file.
- `disabled` keeps jobs in the database but does not process them until a worker mode is re-enabled. Use it only for troubleshooting; pending scan uploads remain unavailable while processing is disabled.

Admins can inspect queue health through the Workspace Settings Jobs panel, Runtime Diagnostics, and `GET /api/jobs/status`. The worker and jobs readouts do not expose job payloads, dedupe keys, scanner internals, file paths, storage keys, or secrets.

## Scope Boundary

The completed 0.33.5.19 runtime/database foundation creates the runtime contract and current-setting validation, loads local `.env` files at startup, keeps SQLite as the only active database provider, hardens SQLite startup, exposes safe diagnostics, and reserves stable names for later storage, scanner, and PostgreSQL work. The completed 0.33.16.1 trusted-edge slice activates an explicit proxy IP/CIDR allowlist, framework request context, and trusted-effective-HTTPS cookie behavior without implementing the later public-URL, HSTS, or fail-closed production slices. The completed 0.33.5.21.0 driver swap keeps that contract on the in-process `better-sqlite3` path and retires the former `sqlite3` CLI setting. The 0.33.5.21.2 worker runner makes worker settings active, 0.33.5.21.3 makes lock TTL reclaim active with a minimal admin job readout, 0.33.5.21.4 moves search indexing onto jobs, 0.33.5.21.5 moves notification fan-out onto jobs, 0.33.5.21.6 adds durable handlers/producers for task reminders, recurrence generation, file scanning, and reserved future imports, 0.33.5.21.7.1 removes inline upload scanning so `file.scan` owns the scan state transition, 0.33.5.21.7.2 bounds reminder scheduling with a 30-day horizon plus a 12-hour sweep, 0.33.5.21.7.3 hardens reminder notification idempotency for at-least-once worker retries, 0.33.5.21.7.4 adds configurable completed/dead-letter job retention pruning, 0.33.5.21.7.5 adds safe Workspace Settings job observability, 0.33.5.21.7.6 proves separate-worker end-to-end processing for the current durable handlers, 0.33.5.21.7.7 closes the recurring-task completion response contract around queued worker handoff, 0.33.5.21.8 delivers task due reminders to the in-app notification surface, and the completed 0.33.5.22 storage/scanner runtime branch closes configured local Files storage-provider writes, safe local diagnostics, streamed local writes, multipart uploads, attachment-helper streamed uploads, scanner mode resolution, optional `clamscan` and `clamd` adapters, S3-compatible adapter scaffolding, mocked S3 object-operation proof, safe S3 diagnostics, and the signed URL exception boundary without adding signed URL routes. The 0.33.5.25.1 cleanup makes S3 selection fail during app and worker startup until a provider-specific client is wired. This branch still does not:

- Change the database provider away from SQLite.
- Enable PostgreSQL.
- Add webhook or integration job producers owned by later durable-job slices.
- Add direct/presigned S3 upload or download routes.
- Ship a provider-specific hosted S3 SDK/client rollout.
- Enable Unix-socket scanning or alternate scanner adapters beyond the optional `clamscan` executable and `clamd` TCP modes.
- Add a runtime settings editor.
- Load `.env` files from browser/public code or expose raw runtime values to the browser.
