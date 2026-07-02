# SQLite Small-Office Mode

Longtail Forge supports SQLite as the self-hosted small-office database mode. This mode is intended for one local app install, not a horizontally scaled SaaS deployment.

## Supported Shape

- Run one Longtail Forge app process/server against the SQLite database.
- Keep `LONGTAIL_DATABASE_PROVIDER=sqlite`.
- Keep the SQLite database on local or attached storage with reliable file locking.
- Keep uploaded files and local runtime data on local or attached storage.
- Keep SQLite foreign keys enabled.
- Use WAL journal mode unless the deployment filesystem requires another supported SQLite journal mode.
- Keep background work inline, or on at most one local worker process through `node worker.js`.

SQLite small-office mode targets roughly 50 total users, with typical active use around 5-15 concurrent users. If the install needs multiple app servers, separate web and worker fleets, very high write concurrency, or hosted multi-tenant isolation, move that deployment toward the future PostgreSQL provider instead of stretching SQLite.

As of 0.33.5.21.2, the SQLite worker-mode boundary for durable jobs is one app process/server plus at most one local worker process attached to the same install. `LONGTAIL_WORKER_MODE=inline` starts an in-process poll timer after the app server begins listening. `LONGTAIL_WORKER_MODE=separate node worker.js` runs the worker outside the app server, verifies schema readiness, avoids independently running migrations, and takes `.longtail-forge-worker.lock` beside the SQLite database to prevent a second local worker. `LONGTAIL_WORKER_MODE=disabled` starts no worker for tests or troubleshooting. No worker fleet is supported for SQLite mode.

The inline poll timer wakes jobs whose `available_at` is in the future on the next `LONGTAIL_JOB_POLL_INTERVAL_MS` tick. It is not a post-response drain, and it shares the same Node process and SQLite adapter path as request handling. As of 0.33.5.21.3, `LONGTAIL_JOB_LOCK_TTL_SECONDS` makes expired running job locks reclaimable by a later poll. As of 0.33.5.21.4, search indexing runs through `search.index` jobs: normal record saves queue reindex/remove work, the worker updates canonical search rows and SQLite FTS storage, and an empty canonical index queues a deduped app rebuild job on startup instead of running a full rebuild inside app startup. As of 0.33.5.21.5, notification fan-out runs through `notification.event` jobs: internal event hooks store fan-out work durably, and the worker resolves recipients and creates notification records through the notification service. As of 0.33.5.21.6, task reminder firing, recurrence generation, file scanning, and the reserved future-import handoff use `task.reminder`, `task.recurrence`, `file.scan`, and `import.future` jobs. As of 0.33.5.21.7.1, uploaded files stay pending and unavailable until the inline worker or one local `node worker.js` process completes the queued `file.scan` job. As of 0.33.5.21.7.2, task reminder scheduling is bounded to a 30-day horizon and topped up by a durable 12-hour sweep instead of accumulating far-future reminder rows. As of 0.33.5.21.7.3, reminder notification delivery is idempotent under normal at-least-once retries: stable reminder delivery keys dedupe active fan-out jobs and deterministic notification IDs prevent duplicate recipient rows if a worker reclaims the same work. `GET /api/jobs/status` is the protected admin readout for pending, running, failed, and dead job counts plus paged recent failure summaries.

## Scale Seed Databases

As of 0.33.5.20.1, developers can create disposable SQLite load databases with:

```sh
node scripts/seed-scale.mjs --profile sqlite-small-office-50 --provider sqlite --database ./data/scale-seed-small-office.disposable.db
```

The seed script requires explicit provider and database arguments. It refuses normal app database paths unless the path is clearly marked disposable, test, temp, seed, scale, or demo, and it refuses to seed a database that already contains application data or a previous scale seed run.

Available profiles:

- `dev-demo` is a small fast profile for local script verification.
- `sqlite-small-office-50` seeds the minimum realistic 50-user SQLite small-office shape.
- `sqlite-heavy-workspace` seeds the upper end of the current SQLite small-office target.
- `future-saas-postgres-mixed` reserves a future mixed SaaS comparison shape; it still uses SQLite until the PostgreSQL provider exists.

Each successful run verifies expected counts, permission sanity, search sanity, and app startup sanity. The script writes realistic workspace, user, role-assignment, client, project, task, note, list/item, tag, notification, audit-log, file metadata, time-entry, attachment, and search-index rows. Seeded workspaces keep audit logging enabled with 365-day retention so the audit-log fixture remains available for route and performance checks. It is for disposable development and performance testing only; do not run it against production or real local data.

## Performance Checks

As of 0.33.5.20.6, developers can run a repeatable SQLite small-office route pass with:

```sh
node scripts/sqlite-small-office-performance.mjs --profile sqlite-small-office-50 --provider sqlite
```

The script creates a disposable scale seed database, starts the app on a local ephemeral port, signs in seeded users, warms each route once, then records repeated GET timings for App shell bootstrap, Tasks list, Task detail, Notes list, Note detail, Files browse, Search, Notifications, and Workbench bootstrap. Use `--json` for machine-readable output, `--iterations` and `--warmups` to tune the sample count, `--profile dev-demo` for a fast smoke run, and `--fail-on-warn` when a local gate should fail if a route exceeds its warning threshold.

Local development hardware sanity targets:

| Route | Target | Warning |
| --- | ---: | ---: |
| App shell bootstrap | 750ms | 1500ms |
| Tasks list | 900ms | 1800ms |
| Task detail | 450ms | 900ms |
| Notes list | 900ms | 1800ms |
| Note detail | 450ms | 900ms |
| Files browse | 1200ms | 2400ms |
| Search | 1200ms | 2400ms |
| Notifications | 750ms | 1500ms |
| Workbench bootstrap | 1000ms | 2000ms |

These targets are local development sanity checks, not a hosted SaaS load test, not a concurrency benchmark, and not an SLA. Hardware, antivirus, synced-folder behavior, and other local I/O noise can move individual timings. Treat repeated warning-threshold misses on the `sqlite-small-office-50` profile as a signal to inspect query shape, missing indexes, unbounded reads, or whether the deployment has outgrown SQLite small-office assumptions.

Workbench bootstrap is a special canary because it is a live start/resume surface, not a bulk task browser. Repeated Workbench warning misses usually mean the workspace is trying to push too many active work items through one bootstrap payload. Do not treat that as proof SQLite small-office mode supports loading every active task into Workbench; use the Tasks list for broad review, or add a bounded Workbench fetch/filter workflow before supporting that shape.

## Unsupported Shapes

Do not run SQLite small-office mode with:

- Multiple Longtail Forge app servers sharing the same SQLite file.
- A SQLite file on object storage, synced folders, or network storage that cannot guarantee SQLite locking semantics.
- A shared SQLite database accessed by separate web nodes in different machines or containers.
- More than one local worker process, or any background worker fleet that bypasses the future job/outbox ownership contract.
- Direct static file downloads or storage paths exposed outside permission-checked routes.

## Backups

Backups should preserve the database and local runtime data together. Include the SQLite database file and any active SQLite sidecar files, such as WAL or shared-memory files, or use a SQLite-aware backup method. Also include the configured data directory and local file-storage root when attachments are stored locally.

For the safest filesystem backup, stop the app first or take a storage snapshot that is consistent across the database and local runtime data. Always test restore into a separate install before relying on a backup plan.

## File Scanning

File scanning is optional in SQLite small-office mode. The current default scanner mode is `none`. Future scanner adapters should run locally or on a trusted attached service and continue to keep scanner internals, storage paths, and quarantine details behind framework-owned permission checks.

## Memory And Disk Guidance

Use an SSD or similarly responsive attached disk. Keep enough free disk for the SQLite database, WAL activity, local attachments, exports, logs, and backups. Monitor growth in the database file, local file storage, and backup destination.

SQLite small-office mode is designed to stay simple. If the install starts needing pooled database connections, cross-node workers, large import bursts, high-volume reporting, or independent scaling of reads and writes, treat that as a PostgreSQL/SaaS signal.

## Admin Readout

Workspace Settings includes a read-only Runtime Diagnostics panel for users with `workspace_settings.manage`. The panel consumes `GET /api/runtime-diagnostics` and shows database provider, SQLite journal mode, foreign-key status, safe database file location, safe data directory location, storage provider, scanner mode, worker mode, and worker state. The API response also includes safe worker status counters for diagnostics; pending/running/dead-letter queue counts and recent failure summaries remain later admin-readout work.

The readout is diagnostic only. It does not edit runtime configuration, write `.env` values, reveal raw environment variables, expose local storage roots, reveal protected paths, expose scanner internals, or show secure-note key material.
