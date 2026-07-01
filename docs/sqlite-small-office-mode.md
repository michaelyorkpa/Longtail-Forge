# SQLite Small-Office Mode

Longtail Forge supports SQLite as the self-hosted small-office database mode. This mode is intended for one local app install, not a horizontally scaled SaaS deployment.

## Supported Shape

- Run one Longtail Forge app process/server against the SQLite database.
- Keep `LONGTAIL_DATABASE_PROVIDER=sqlite`.
- Keep the SQLite database on local or attached storage with reliable file locking.
- Keep uploaded files and local runtime data on local or attached storage.
- Keep SQLite foreign keys enabled.
- Use WAL journal mode unless the deployment filesystem requires another supported SQLite journal mode.
- Keep background work inline or on one local worker when later job/outbox slices add that option.

SQLite small-office mode targets roughly 50 total users, with typical active use around 5-15 concurrent users. If the install needs multiple app servers, separate web and worker fleets, very high write concurrency, or hosted multi-tenant isolation, move that deployment toward the future PostgreSQL provider instead of stretching SQLite.

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

## Unsupported Shapes

Do not run SQLite small-office mode with:

- Multiple Longtail Forge app servers sharing the same SQLite file.
- A SQLite file on object storage, synced folders, or network storage that cannot guarantee SQLite locking semantics.
- A shared SQLite database accessed by separate web nodes in different machines or containers.
- A background worker fleet that bypasses the future job/outbox ownership contract.
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

Workspace Settings includes a read-only Runtime Diagnostics panel for users with `workspace_settings.manage`. The panel consumes `GET /api/runtime-diagnostics` and shows database provider, SQLite journal mode, foreign-key status, safe database file location, safe data directory location, storage provider, and scanner mode.

The readout is diagnostic only. It does not edit runtime configuration, write `.env` values, reveal raw environment variables, expose local storage roots, reveal protected paths, expose scanner internals, or show secure-note key material.
