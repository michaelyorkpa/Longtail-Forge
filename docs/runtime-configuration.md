# Runtime Configuration

Longtail Forge reads install and startup configuration from environment variables. At app startup, `server.js` loads a local root `.env` file when present, then `src/config.js` normalizes the resulting environment. A real `.env` file is local runtime state and must not be committed; use `.env.example` as the documented contract.

As of 0.33.5.19.9, this contract records both active settings and future reserved settings. Reserved settings are documented so later runtime, jobs, storage, scanner, and PostgreSQL slices can build on stable names. They do not change behavior until the roadmap slice that owns that behavior wires them.

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
| `LONGTAIL_DATABASE_FILE` | `./data/longtail-forge.db` | SQLite database file. Relative paths resolve from the app root. |
| `SQLITE_COMMAND` | `sqlite3` | Command used by the current SQLite helper. |
| `LONGTAIL_SQLITE_FOREIGN_KEYS` | `on` | Must stay enabled. Startup fails if this is disabled, and each SQLite process runs with foreign-key enforcement on. |
| `LONGTAIL_SQLITE_JOURNAL_MODE` | `wal` | Journal mode applied during SQLite startup. WAL is the default for small-office installs; set a different valid SQLite mode only when the deployment filesystem requires it. |
| `LONGTAIL_SQLITE_BUSY_TIMEOUT_MS` | `5000` | SQLite busy timeout in milliseconds. The helper applies it to SQLite processes and verifies `PRAGMA busy_timeout` during startup health checks. |

SQLite startup applies `PRAGMA foreign_keys = ON`, applies the configured `PRAGMA journal_mode`, configures the SQLite busy timeout, verifies the database file path is writable, and emits a safe admin health line with provider, database file path, writable state, foreign-key state, journal mode, and busy timeout. The health output does not include secrets, secure-note key material, storage keys, signed URLs, scanner internals, or protected file paths.

SQLite migrations and schema repairs use a local lock file beside `LONGTAIL_DATABASE_FILE` so only one startup or maintenance process owns migration work at a time. This is startup behavior, not a runtime-editable setting.

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

## Reserved Settings

These names are documented now and intentionally left mostly dormant until their roadmap slices wire behavior.

| Group | Variables | Future owner |
| --- | --- | --- |
| PostgreSQL | `DATABASE_URL`, `LONGTAIL_DATABASE_POOL_MIN`, `LONGTAIL_DATABASE_POOL_MAX`, `LONGTAIL_DATABASE_SSL` | 0.33.5.23 PostgreSQL adapter and SaaS runtime proof. |
| File storage | `LONGTAIL_STORAGE_PROVIDER`, `LONGTAIL_LOCAL_STORAGE_ROOT` | 0.33.5.22 storage provider runtime. `LONGTAIL_LOCAL_STORAGE_ROOT` is already used as the local storage default root. |
| File scanning | `LONGTAIL_FILE_SCANNER`, `LONGTAIL_CLAMD_HOST`, `LONGTAIL_CLAMD_PORT`, `LONGTAIL_CLAMSCAN_PATH` | 0.33.5.22 scanner runtime. |
| Jobs/workers | `LONGTAIL_WORKER_MODE`, `LONGTAIL_WORKER_ID`, `LONGTAIL_JOB_POLL_INTERVAL_MS`, `LONGTAIL_JOB_LOCK_TTL_SECONDS` | 0.33.5.21 durable jobs and outbox. |
| Logging | `LONGTAIL_LOG_LEVEL` | Later diagnostics and runtime readout work. |
| Proxy trust | `TRUST_PROXY` | Later hosted deployment/security hardening. |

Reserved settings may appear in `config` for readout consistency, but this slice does not implement PostgreSQL, background workers, scanner adapters, storage-provider switching, hosted proxy behavior, or runtime settings editing.

## Startup Validation

Startup fails clearly when active settings are invalid:

- `LONGTAIL_ENV` must be `development`, `test`, or `production`.
- `PORT` must be an integer from 1 through 65535.
- `LONGTAIL_DATABASE_PROVIDER` must be `sqlite`.
- `LONGTAIL_SQLITE_FOREIGN_KEYS` must be `on`.
- `LONGTAIL_SQLITE_JOURNAL_MODE` must be `delete`, `truncate`, `persist`, `memory`, `wal`, or `off`.
- `LONGTAIL_SQLITE_BUSY_TIMEOUT_MS` must be an integer from 0 through 3600000.
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

The response includes app version, runtime environment, database provider, database health status, SQLite journal mode, SQLite foreign-key status, SQLite busy timeout, safe database file location, safe data directory location, storage provider, scanner mode, worker mode, and configuration warnings. Paths are app-root or data-root relative when possible; locations outside the app root are redacted to a basename.

Workspace Settings includes a compact read-only Runtime Diagnostics panel that consumes this route for admins. SQLite small-office deployment assumptions are documented in [sqlite-small-office-mode.md](sqlite-small-office-mode.md).

Runtime diagnostics must not include secrets, storage keys, signed URLs, protected paths, scanner internals, secure-note key material, raw `.env` contents, `DATABASE_URL`, secure-note master keys, scanner host/path settings, or local storage roots.

## Scope Boundary

The completed 0.33.5.19 runtime/database foundation creates the runtime contract and current-setting validation, loads local `.env` files at startup, keeps SQLite as the only active database provider, hardens SQLite startup, exposes safe diagnostics, and reserves stable names for later jobs, storage, scanner, and PostgreSQL work. It does not:

- Change the database provider away from SQLite.
- Enable PostgreSQL.
- Add durable job processing or a separate worker.
- Replace local file storage with another provider.
- Enable ClamAV or any other scanner adapter.
- Add a runtime settings editor.
- Load `.env` files from browser/public code or expose raw runtime values to the browser.
