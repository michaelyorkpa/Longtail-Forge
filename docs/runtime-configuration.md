# Runtime Configuration

Longtail Forge reads install and startup configuration from environment variables. At app startup, `server.js` loads a local root `.env` file when present, then `src/config.js` normalizes the resulting environment. A real `.env` file is local runtime state and must not be committed; use `.env.example` as the documented contract.

As of 0.33.5.22.12, this contract records active runtime settings plus future reserved settings. Worker settings, job retention settings, local Files upload storage-provider selection, local storage provider diagnostics, the local storage streaming write contract, single-file multipart uploads, streamed multipart batch uploads, the attachment-helper streamed batch path, streamed upload error hardening, scanner mode resolution, safe scanner health diagnostics, the optional `clamscan` executable scanner adapter, the optional `clamd` TCP scanner adapter, and S3-compatible provider selection/configuration are now active; PostgreSQL, hosted proxy, Unix-socket scanning, and S3 object operations remain reserved until their roadmap slices wire behavior. ClamAV setup guidance for Linux, Windows, and macOS is documented in [file-scanner-setup.md](file-scanner-setup.md).

Process environment values win over `.env` values. This lets shells, service managers, containers, and hosted runtimes override local defaults without editing the local file. Missing `.env` files do not fail startup.

## Current Active Settings

### App

| Variable | Default | Notes |
| --- | --- | --- |
| `LONGTAIL_ENV` | `development` | Must be `development`, `test`, or `production`. Production mode requires `SUPER_ADMIN_PASSWORD`. |
| `LONGTAIL_PUBLIC_URL` | empty | Recommended in production for future absolute URL and hosted deployment work. |
| `HOST` | `0.0.0.0` | Express listen host. |
| `PORT` | `8001` | Express listen port. Must be an integer from 1 through 65535. |

### Data

| Variable | Default | Notes |
| --- | --- | --- |
| `LONGTAIL_DATA_DIR` | `./data` | Root for local runtime data. Relative paths resolve from the app root. |

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

SQLite startup applies `PRAGMA foreign_keys = ON`, applies the configured `PRAGMA journal_mode`, configures the SQLite busy timeout, verifies the database file path is writable, and emits a safe admin health line with provider, database file path, writable state, foreign-key state, journal mode, and busy timeout. The health output does not include secrets, secure-note key material, storage keys, signed URLs, scanner internals, or protected file paths.

SQLite migrations and schema repairs use a local lock file beside `LONGTAIL_DATABASE_FILE` so only one startup or maintenance process owns migration work at a time. This is startup behavior, not a runtime-editable setting.

As of 0.33.5.21.0.6, `SQLITE_COMMAND` is a legacy ignored setting. Normal database access no longer shells out to the `sqlite3` CLI; Longtail Forge uses the in-process `better-sqlite3` dependency and does not require the `sqlite3` executable for normal operation.

### Initial Bootstrap

| Variable | Default | Notes |
| --- | --- | --- |
| `LONGTAIL_INITIAL_WORKSPACE_NAME` | `Longtail Forge Workspace` | Name used only when creating the first fresh-start workspace. Existing workspaces are not renamed. |
| `SUPER_ADMIN_USERNAME` | `support@longtailforge.local` | Username for the initial protected super-admin account. |
| `SUPER_ADMIN_DISPLAY_NAME` | `Super Admin` | Display name for the initial protected super-admin account. Existing users are not renamed except during first-user/bootstrap repair paths. |
| `SUPER_ADMIN_PASSWORD` | empty | Optional in development. Required when `LONGTAIL_ENV=production`. If omitted outside production, the app keeps the existing generated-password behavior for first launch. |

### Sessions And Cookies

| Variable | Default | Notes |
| --- | --- | --- |
| `LONGTAIL_SESSION_COOKIE_SECURE` | `false` | Adds the `Secure` cookie attribute when true. |
| `LONGTAIL_SESSION_COOKIE_SAMESITE` | `Lax` | Must be `Lax`, `Strict`, or `None`. `None` requires secure cookies. |
| `LONGTAIL_SESSION_TTL_SECONDS` | `43200` | Session, theme, and theme auto-source cookie lifetime. Must be between 300 seconds and 30 days. |

### Secure Notes

| Variable | Default | Notes |
| --- | --- | --- |
| `LONGTAIL_SECURE_NOTES_MASTER_KEY` | empty | Preferred server-side secure-note key name. |
| `SECURE_NOTES_MASTER_KEY` | empty | Backward-compatible secure-note key name. |
| `LONGTAIL_SECURE_NOTES_KEY_VERSION` | `v1` | Stored on secure notes and revisions for future rotation planning. |

Secure-note keys are runtime secrets. They must not be committed, logged, or exposed through normal UI or diagnostics.

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

As of 0.33.5.22.12, `LONGTAIL_STORAGE_PROVIDER` is consumed by Files upload writes and storage provider diagnostics are active, the storage adapter contract supports streamed local writes through `saveStream(readable, options)`, `POST /api/files/upload` accepts one multipart file in local/self-hosted mode, and `POST /api/files/upload/batch` accepts streamed multipart batches with per-file success/failure results. The multipart upload routes use Busboy, expect `moduleId`, `targetType`, and `targetId` metadata fields before file parts in this first ordering contract, enforce upload size while streaming, and then use the same file-row, `file.scan` job, and attachment lifecycle as `POST /api/files` and `POST /api/files/batch`. The shared browser attachment helper now uses the streamed batch route for normal uploads. The existing JSON/base64 routes remain compatibility routes through the 0.33.5.22 storage/scanner branch and are retired no earlier than 0.33.5.23.0 by a later explicit roadmap slice. Streamed upload cancellation, request read errors, fatal parser errors, oversized payloads, and storage stream errors stop active file streams, return bounded failure copy, and avoid active file records, attachments, or usable partial local files. `LONGTAIL_STORAGE_PROVIDER=local` remains the default and uses `LONGTAIL_LOCAL_STORAGE_ROOT`; `LONGTAIL_STORAGE_PROVIDER=s3` selects the registered S3-compatible provider stub and reads `LONGTAIL_S3_BUCKET`, `LONGTAIL_S3_REGION`, `LONGTAIL_S3_ENDPOINT`, `LONGTAIL_S3_ACCESS_KEY_ID`, and `LONGTAIL_S3_SECRET_ACCESS_KEY` from runtime configuration. S3 object operations are not implemented until 0.33.5.22.13: missing required S3 settings fail clearly as configuration errors, and fully configured S3 operations fail safely as not implemented rather than partially writing data. File scanner mode selection is active for `none`, `noop`, `clamd`, and `clamscan`: `none` is the default disabled-scanning mode and resolves queued `file.scan` jobs to `status = available` plus `scan_status = not_required`; `noop` is an explicit pass-through scanner for development or accepted self-hosted use and resolves to `scan_status = passed`; `clamscan` is an optional executable scanner adapter that uses `LONGTAIL_CLAMSCAN_PATH` when set or the `clamscan` command on `PATH`, probes scanner health with `--version`, streams file bytes through stdin, treats clean scans as `passed`, and quarantines infected, unavailable, or timed-out scans without auto-deleting stored files; `clamd` is an optional TCP scanner adapter that uses `LONGTAIL_CLAMD_HOST` when set or `127.0.0.1`, uses `LONGTAIL_CLAMD_PORT` when set or `3310`, probes health with `PING`, streams file bytes through `INSTREAM`, treats clean scans as `passed`, and quarantines infected, unavailable, or timed-out scans without auto-deleting stored files. Safe scanner health diagnostics are active: `none` reports disabled, `noop` reports pass-through, and unavailable scanner modes report unavailable health without exposing hostnames, ports, executable paths, scanner output, sockets, storage keys, protected paths, signed URLs, or raw environment values. The `clamscan` and `clamd` adapters return safe scanner metadata only; the `clamd` TCP scanner adapter works without exposing hostnames or ports in diagnostics or UI payloads. Unix-socket scanning is explicitly deferred; there is no `LONGTAIL_CLAMD_SOCKET` setting in this branch. Unknown storage providers fail clearly for writes and report unavailable health in diagnostics instead of falling back to local. Existing files continue to read through their stored `files.storage_provider` value, so the setting affects new writes only.

| Group | Variables | Future owner |
| --- | --- | --- |
| PostgreSQL | `DATABASE_URL`, `LONGTAIL_DATABASE_POOL_MIN`, `LONGTAIL_DATABASE_POOL_MAX`, `LONGTAIL_DATABASE_SSL` | 0.33.5.23 PostgreSQL adapter and SaaS runtime proof. |
| File storage | `LONGTAIL_STORAGE_PROVIDER`, `LONGTAIL_LOCAL_STORAGE_ROOT`, `LONGTAIL_S3_BUCKET`, `LONGTAIL_S3_REGION`, `LONGTAIL_S3_ENDPOINT`, `LONGTAIL_S3_ACCESS_KEY_ID`, `LONGTAIL_S3_SECRET_ACCESS_KEY` | 0.33.5.22 storage provider runtime. `LONGTAIL_STORAGE_PROVIDER=local` is the default for new Files upload writes and diagnostics. `LONGTAIL_LOCAL_STORAGE_ROOT` sets the local provider root and is shown in diagnostics only as a safe app-root/data-root relative or redacted label. `LONGTAIL_STORAGE_PROVIDER=s3` selects the registered S3-compatible provider stub and consumes the S3 bucket, region, endpoint, and credential settings from server runtime configuration only. The local provider supports buffered `save()` writes, streamed `saveStream()` writes, single-file multipart uploads, streamed multipart batch uploads through the shared attachment helper, and partial-file cleanup for failed local streamed writes where practical. S3 object operations are not active until 0.33.5.22.13; normal diagnostics and browser payloads must not expose buckets, endpoints, credential values, storage keys, protected paths, or signed URLs. |
| File scanning | `LONGTAIL_FILE_SCANNER`, `LONGTAIL_CLAMD_HOST`, `LONGTAIL_CLAMD_PORT`, `LONGTAIL_CLAMSCAN_PATH` | 0.33.5.22 scanner runtime. Live settings: `LONGTAIL_FILE_SCANNER` must be `none`, `noop`, `clamd`, or `clamscan`; `LONGTAIL_CLAMSCAN_PATH` optionally points `clamscan` at the ClamAV CLI; `LONGTAIL_CLAMD_HOST` and `LONGTAIL_CLAMD_PORT` optionally point `clamd` at a TCP daemon and default internally to `127.0.0.1:3310` when blank. `none` is disabled scanning and marks queued `file.scan` jobs `not_required`/`available`; `noop` is an explicit pass-through scanner. Runtime Diagnostics exposes safe scanner mode/status and disabled/pass-through/unavailable warnings without exposing hostnames, ports, executable paths, raw scanner output, sockets, storage keys, protected paths, or raw environment values. Deferred setting: Unix-socket scanning is not wired and no `LONGTAIL_CLAMD_SOCKET` key is active in this branch. See [file-scanner-setup.md](file-scanner-setup.md) for ClamAV setup. |
| Logging | `LONGTAIL_LOG_LEVEL` | Later diagnostics and runtime readout work. |
| Proxy trust | `TRUST_PROXY` | Later hosted deployment/security hardening. |

Reserved settings may appear in `config` for readout consistency, but this slice does not implement PostgreSQL, hosted proxy behavior, Unix-socket scanning, S3 object operations, or runtime settings editing.

## Startup Validation

Startup fails clearly when active settings are invalid:

- `LONGTAIL_ENV` must be `development`, `test`, or `production`.
- `PORT` must be an integer from 1 through 65535.
- `LONGTAIL_DATABASE_PROVIDER` must be `sqlite`.
- `LONGTAIL_STORAGE_PROVIDER` defaults to `local`; selecting `s3` requires the S3 provider settings before object operations can proceed, but object operations are still intentionally not implemented until 0.33.5.22.13.
- `LONGTAIL_SQLITE_FOREIGN_KEYS` must be `on`.
- `LONGTAIL_SQLITE_JOURNAL_MODE` must be `delete`, `truncate`, `persist`, `memory`, `wal`, or `off`.
- `LONGTAIL_SQLITE_BUSY_TIMEOUT_MS` must be an integer from 0 through 3600000.
- `LONGTAIL_FILE_SCANNER` must be `none`, `noop`, `clamd`, or `clamscan`.
- `LONGTAIL_WORKER_MODE` must be `inline`, `separate`, or `disabled`.
- `LONGTAIL_JOB_POLL_INTERVAL_MS` must be an integer from 1000 through 3600000.
- `LONGTAIL_JOB_LOCK_TTL_SECONDS` must be an integer from 30 through 86400.
- `LONGTAIL_JOB_COMPLETED_RETENTION_DAYS` must be an integer from 1 through 3650.
- `LONGTAIL_JOB_DEAD_RETENTION_DAYS` must be an integer from 1 through 3650.
- `LONGTAIL_SESSION_COOKIE_SAMESITE` must be `Lax`, `Strict`, or `None`.
- `LONGTAIL_SESSION_COOKIE_SECURE` must be true when SameSite is `None`.
- `LONGTAIL_SESSION_TTL_SECONDS` must be between 300 seconds and 30 days.
- `WORKSPACE_INSTALL_MODE` must be `self_hosted` or `saas`.
- `WORKSPACE_TYPE_LIMIT` must be empty or `business`.
- `SUPER_ADMIN_PASSWORD` is required when `LONGTAIL_ENV=production`.

The local `.env` loader accepts blank lines, full-line comments, `KEY=VALUE` entries, optional `export KEY=VALUE` entries, unquoted values with trailing comments, and basic single- or double-quoted values. Malformed lines fail clearly before app config is created.

Startup may warn without failing when optional but recommended production settings are absent. In 0.33.5.19.9, production mode warns when `LONGTAIL_PUBLIC_URL` is missing.

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

The completed 0.33.5.19 runtime/database foundation creates the runtime contract and current-setting validation, loads local `.env` files at startup, keeps SQLite as the only active database provider, hardens SQLite startup, exposes safe diagnostics, and reserves stable names for later storage, scanner, and PostgreSQL work. The completed 0.33.5.21.0 driver swap keeps that contract on the in-process `better-sqlite3` path and retires the former `sqlite3` CLI setting. The 0.33.5.21.2 worker runner makes worker settings active, 0.33.5.21.3 makes lock TTL reclaim active with a minimal admin job readout, 0.33.5.21.4 moves search indexing onto jobs, 0.33.5.21.5 moves notification fan-out onto jobs, 0.33.5.21.6 adds durable handlers/producers for task reminders, recurrence generation, file scanning, and reserved future imports, 0.33.5.21.7.1 removes inline upload scanning so `file.scan` owns the scan state transition, 0.33.5.21.7.2 bounds reminder scheduling with a 30-day horizon plus a 12-hour sweep, 0.33.5.21.7.3 hardens reminder notification idempotency for at-least-once worker retries, 0.33.5.21.7.4 adds configurable completed/dead-letter job retention pruning, 0.33.5.21.7.5 adds safe Workspace Settings job observability, 0.33.5.21.7.6 proves separate-worker end-to-end processing for the current durable handlers, 0.33.5.21.7.7 closes the recurring-task completion response contract around queued worker handoff, 0.33.5.21.8 delivers task due reminders to the in-app notification surface, 0.33.5.22.1 routes Files upload writes through configured storage provider resolution, 0.33.5.22.2 adds safe local storage provider diagnostics, 0.33.5.22.3 adds the local storage streaming write contract plus the Busboy multipart parser dependency decision, 0.33.5.22.4 adds the first single-file multipart upload route while preserving the JSON upload route, 0.33.5.22.5 moves normal attachment-panel uploads to streamed multipart batches while preserving JSON/base64 batch compatibility, 0.33.5.22.6 defines the JSON/base64 transition window plus streamed upload failure cleanup, 0.33.5.22.7 resolves scanner modes through `file.scan`, 0.33.5.22.8 adds safe scanner health diagnostics, 0.33.5.22.9 adds the optional `clamscan` executable adapter, 0.33.5.22.11 adds the optional `clamd` TCP adapter, and 0.33.5.22.12 registers the safely failing S3-compatible storage provider stub. This branch still does not:

- Change the database provider away from SQLite.
- Enable PostgreSQL.
- Add webhook or integration job producers owned by later durable-job slices.
- Complete S3 object storage operations.
- Enable Unix-socket scanning or alternate scanner adapters beyond the optional `clamscan` executable and `clamd` TCP modes.
- Add a runtime settings editor.
- Load `.env` files from browser/public code or expose raw runtime values to the browser.
