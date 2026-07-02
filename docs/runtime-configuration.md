# Runtime Configuration

Longtail Forge reads install and startup configuration from environment variables. At app startup, `server.js` loads a local root `.env` file when present, then `src/config.js` normalizes the resulting environment. A real `.env` file is local runtime state and must not be committed; use `.env.example` as the documented contract.

As of 0.33.5.21.7.4, this contract records active runtime settings plus future reserved settings. Worker settings and job retention settings are now active for the durable job runner; PostgreSQL, scanner adapter, hosted proxy, and most storage-provider settings remain reserved until their roadmap slices wire behavior.

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
| `LONGTAIL_SESSION_TTL_SECONDS` | `43200` | Session and theme-cookie lifetime. Must be between 300 seconds and 30 days. |

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

Job retention pruning is framework-owned maintenance, not a route delete or module-owned loop. App startup and separate-worker startup delete only `completed` rows older than `LONGTAIL_JOB_COMPLETED_RETENTION_DAYS` and `dead` rows older than `LONGTAIL_JOB_DEAD_RETENTION_DAYS`. `pending`, `running`, and `failed` rows stay intact regardless of age so retryable or claimed work is not lost.

## Reserved Settings

These names are documented now and intentionally left mostly dormant until their roadmap slices wire behavior.

| Group | Variables | Future owner |
| --- | --- | --- |
| PostgreSQL | `DATABASE_URL`, `LONGTAIL_DATABASE_POOL_MIN`, `LONGTAIL_DATABASE_POOL_MAX`, `LONGTAIL_DATABASE_SSL` | 0.33.5.23 PostgreSQL adapter and SaaS runtime proof. |
| File storage | `LONGTAIL_STORAGE_PROVIDER`, `LONGTAIL_LOCAL_STORAGE_ROOT` | 0.33.5.22 storage provider runtime. `LONGTAIL_LOCAL_STORAGE_ROOT` is already used as the local storage default root. |
| File scanning | `LONGTAIL_FILE_SCANNER`, `LONGTAIL_CLAMD_HOST`, `LONGTAIL_CLAMD_PORT`, `LONGTAIL_CLAMSCAN_PATH` | 0.33.5.22 scanner runtime. |
| Logging | `LONGTAIL_LOG_LEVEL` | Later diagnostics and runtime readout work. |
| Proxy trust | `TRUST_PROXY` | Later hosted deployment/security hardening. |

Reserved settings may appear in `config` for readout consistency, but this slice does not implement PostgreSQL, scanner adapters, storage-provider switching, hosted proxy behavior, or runtime settings editing.

## Startup Validation

Startup fails clearly when active settings are invalid:

- `LONGTAIL_ENV` must be `development`, `test`, or `production`.
- `PORT` must be an integer from 1 through 65535.
- `LONGTAIL_DATABASE_PROVIDER` must be `sqlite`.
- `LONGTAIL_SQLITE_FOREIGN_KEYS` must be `on`.
- `LONGTAIL_SQLITE_JOURNAL_MODE` must be `delete`, `truncate`, `persist`, `memory`, `wal`, or `off`.
- `LONGTAIL_SQLITE_BUSY_TIMEOUT_MS` must be an integer from 0 through 3600000.
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

The response includes app version, runtime environment, database provider, database health status, SQLite journal mode, SQLite foreign-key status, SQLite busy timeout, safe database file location, safe data directory location, storage provider, scanner mode, worker mode, lock TTL, safe worker status counters, and configuration warnings. Paths are app-root or data-root relative when possible; locations outside the app root are redacted to a basename.

Workspace Settings includes a compact read-only Runtime Diagnostics panel that consumes this route for admins. SQLite small-office deployment assumptions are documented in [sqlite-small-office-mode.md](sqlite-small-office-mode.md).

Runtime diagnostics must not include secrets, storage keys, signed URLs, protected paths, scanner internals, secure-note key material, raw `.env` contents, `DATABASE_URL`, secure-note master keys, scanner host/path settings, or local storage roots.

## Jobs Admin Readout

`GET /api/jobs/status` returns the minimal durable-job status readout for authenticated users with `workspace_settings.manage` in the active workspace. The response includes pending/running/failed/dead counts and recent failed/dead summaries using the shared bounded-pagination envelope. It is read-only and does not expose job payload JSON, dedupe keys, storage paths, scanner internals, or raw environment values.

## Worker Mode For Background Work

As of 0.33.5.21.7.4, `LONGTAIL_WORKER_MODE` controls search indexing, notification fan-out, task reminder firing, recurring task generation, file-scan jobs, and the reserved future-import job type. Task reminders use a documented 30-day scheduling horizon plus a durable 12-hour top-up sweep, uploaded files stay pending and unavailable until an inline or separate worker completes their queued `file.scan` job, and job retention pruning bounds completed/dead-letter history without touching active rows. Reminder notification delivery is idempotent under normal at-least-once worker retries through stable delivery keys and deterministic notification rows.

- `inline` starts one poll timer inside the app process after the server is listening. This is the default SQLite/small-office mode.
- `separate` is for `node worker.js`; it requires the app schema to be initialized already and, in SQLite mode, acquires the one-local-worker lock beside the database file.
- `disabled` keeps jobs in the database but does not process them until a worker mode is re-enabled. Use it only for troubleshooting; pending scan uploads remain unavailable while processing is disabled.

Admins can inspect queue health through Runtime Diagnostics and `GET /api/jobs/status`. The worker does not expose job payloads, dedupe keys, scanner internals, file paths, storage keys, or secrets in those readouts.

## Scope Boundary

The completed 0.33.5.19 runtime/database foundation creates the runtime contract and current-setting validation, loads local `.env` files at startup, keeps SQLite as the only active database provider, hardens SQLite startup, exposes safe diagnostics, and reserves stable names for later storage, scanner, and PostgreSQL work. The completed 0.33.5.21.0 driver swap keeps that contract on the in-process `better-sqlite3` path and retires the former `sqlite3` CLI setting. The 0.33.5.21.2 worker runner makes worker settings active, 0.33.5.21.3 makes lock TTL reclaim active with a minimal admin job readout, 0.33.5.21.4 moves search indexing onto jobs, 0.33.5.21.5 moves notification fan-out onto jobs, 0.33.5.21.6 adds durable handlers/producers for task reminders, recurrence generation, file scanning, and reserved future imports, 0.33.5.21.7.1 removes inline upload scanning so `file.scan` owns the scan state transition, 0.33.5.21.7.2 bounds reminder scheduling with a 30-day horizon plus a 12-hour sweep, 0.33.5.21.7.3 hardens reminder notification idempotency for at-least-once worker retries, and 0.33.5.21.7.4 adds configurable completed/dead-letter job retention pruning. This branch still does not:

- Change the database provider away from SQLite.
- Enable PostgreSQL.
- Add webhook or integration job producers owned by later durable-job slices.
- Replace local file storage with another provider.
- Enable ClamAV or any other scanner adapter.
- Add a runtime settings editor.
- Load `.env` files from browser/public code or expose raw runtime values to the browser.
