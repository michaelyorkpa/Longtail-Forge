# Longtail Forge Database

As of version 0.33.5.18.6.5.4, new Longtail Forge installs use a consolidated fresh-start database baseline instead of replaying the historical 0.22.x-0.33.5.18.6.5.3 migration chain.

As of version 0.31.24.2, the active SQLite helper keeps one queued sqlite process alive briefly between calls instead of spawning a new process for every query. The public database helper API remains `querySql`, `runSql`, `sqlText`, `sqlNullableText`, `sqlInteger`, and `sqlNullableInteger`; callers should continue to use those helpers rather than shelling out directly.

As of version 0.32.6.3, framework search metadata lives in the canonical `search_index` table. FTS virtual tables are lookup engines only and are not the source of truth for workspace scope, module scope, permissions, visibility, or record lifecycle state.

As of version 0.33.5.19.9, runtime database configuration is documented in [runtime-configuration.md](runtime-configuration.md). SQLite remains the only implemented provider, `LONGTAIL_DATABASE_PROVIDER` must be `sqlite`, and PostgreSQL settings are reserved for future adapter work rather than active behavior. SQLite small-office deployment assumptions are documented in [sqlite-small-office-mode.md](sqlite-small-office-mode.md).

As of version 0.33.5.20.1, `scripts/seed-scale.mjs` can seed a disposable SQLite database with repeatable small-office scale data. The script requires explicit `--profile`, `--provider sqlite`, and `--database` arguments, refuses normal/non-disposable database paths, marks completed seed runs in `scale_seed_runs`, and verifies expected counts, permission sanity, search sanity, and app startup sanity. Scale-seeded workspaces keep audit logging enabled with a 365-day retention window so the seeded Audit Log rows remain available for bounded-list testing. It is a developer scale-testing tool, not a migration, import path, or production data generator.

As of version 0.33.5.20.5, the bounded-query branch covers normal Tasks list reads, normal Notes list reads, visible-row enrichment batching, and high-volume framework/admin reads for Audit Log, Notifications, Search results, and Files browse. These routes use explicit maximum page sizes, stable ordering, permission-shaped rows, and pagination metadata. This is still SQLite-first work and does not add PostgreSQL.

As of version 0.33.5.19.2, SQLite startup hardens the existing helper boundary before migrations run. Longtail Forge applies foreign-key enforcement to every SQLite process, enables `PRAGMA journal_mode = WAL` by default, configures the SQLite busy timeout from runtime config, verifies the database file path is writable, and reports safe startup health for the provider, database file path, writable state, foreign-key state, journal mode, and busy timeout.

As of version 0.33.5.19.5, `src/db/provider.js` owns the provider-neutral database adapter boundary and `src/core/database.js` is the preferred app-facing import path for repositories, modules, and framework services that need database access. The v1 adapter API is `db.query(sql, params)`, `db.get(sql, params)`, `db.run(sql, params)`, `db.transaction(callback)`, `db.close()`, `db.health()`, and `db.capabilities`. SQLite is still the only implemented provider, and the SQLite process helper stays behind `src/db/adapters/sqlite-adapter.js`. `querySql` and `runSql` remain temporary legacy compatibility helpers while repository code moves toward the adapter. Parameter binding is active for pilot repository paths, and the transaction helper is active for selected multi-step write pilots.

As of version 0.33.5.19.6, SQLite migrations and schema repairs run under a migration lock before normal app startup defaults are applied. The lock is a process-owned file beside the configured SQLite database file. If a second startup process reaches migrations while the lock is held, startup fails with an actionable message that names the lock file and stale-lock recovery path.

The completed 0.33.5.19 foundation covers runtime config, SQLite startup hardening, the provider-neutral adapter boundary, parameterized-query and transaction pilots, SQLite migration locking, and safe runtime diagnostics/admin readout. It does not implement PostgreSQL, durable jobs/outbox processing, storage-provider switching, or scanner adapters; those branches should consume this boundary rather than bypass it.

Repositories and module services should not import `src/db/sqlite.js` directly. New app code should import database access from `src/core/database.js`; database startup and regression fixtures may import from `src/db/index.js`; only the SQLite adapter should import the raw SQLite helper. Future PostgreSQL work should plug into the same provider-neutral adapter instead of forcing every module repository to learn a second database API.

## Parameterized Query Style

New repository work should use `db.query(sql, params)`, `db.get(sql, params)`, or `db.run(sql, params)` from `src/core/database.js`.

Use named parameters for values:

```js
await db.get(`
SELECT workspace_id
FROM workspaces
WHERE workspace_id = :workspaceId
LIMIT 1;
`, { workspaceId });
```

Do not interpolate user-supplied values into SQL strings. Table and column names must stay static or come from validated allowlists before building SQL. Bound parameters are for values only; they do not parameterize identifiers, sort clauses, operators, or SQL fragments.

The legacy `sqlText`, `sqlInteger`, `sqlNullableText`, and `sqlNullableInteger` helpers remain available as compatibility escape hatches for unconverted code and multi-statement paths until later portability slices. New or touched single-statement repository queries should prefer named parameters unless a slice explicitly keeps the code on the compatibility path.

## Transaction Style

Multi-step writes that need atomic behavior should use `db.transaction(callback)` from `src/core/database.js`. The callback receives a transaction client with the same `query`, `get`, and `run` methods:

```js
await db.transaction(async (transaction) => {
  await transaction.run("UPDATE records SET status = :status WHERE record_id = :recordId;", {
    recordId,
    status: "archived",
  });
  await transaction.run("INSERT INTO record_events (event_id, record_id) VALUES (:eventId, :recordId);", {
    eventId,
    recordId,
  });
});
```

The SQLite adapter begins a transaction before the callback, commits when the callback completes, and rolls back when the callback throws. Nested transactions are not supported; keep a transaction callback focused on the database writes that must commit together. As of 0.33.5.19.5, the transaction pilot covers Task assignee replacement and Notes create-with-staged-links. Broader transaction conversion remains future portability work.

## Migration Locking and Startup Ownership

Self-hosted SQLite mode keeps startup simple: one app process runs startup migrations and schema repairs before the app applies module/default records and starts serving requests. SQLite is still the only active provider in this branch, and this lock does not add horizontal SQLite app-server support.

The SQLite migration lock file is `.longtail-forge-migrations.lock` in the same directory as `LONGTAIL_DATABASE_FILE`. `runMigrations()` acquires that lock before fresh-baseline adoption, legacy schema repairs, checksum validation, and future migration files. The lock is released after migration work succeeds or fails. If startup finds an existing lock, the app reports that another Longtail Forge startup or maintenance process is running migrations or schema repairs, then tells the operator to wait or remove the stale lock file after confirming the other process crashed.

Normal app startup work runs after schema startup maintenance. Framework module rows, default app settings, default workspace/bootstrap records, module registry sync, stored-time normalization, and role/permission repairs are app-startup defaults, not migration files. The current search-index startup rebuild and inline worker mode are still post-startup app work; 0.33.5.19.6 does not implement the 0.33.5.21 job/outbox runner or move search indexing to jobs.

Future SaaS/PostgreSQL mode should not let every web or worker instance run migrations independently. A deploy or maintenance process should own migrations, acquire a PostgreSQL advisory lock or a provider-backed migration lock table in the same database, run migrations once, then start web and worker processes against the current schema. Web and worker processes should verify schema readiness and fail clearly if the maintenance owner has not completed migration work.

## Fresh Baseline

The active schema lives in:

```text
src/db/schema/current.sql
```

That file creates the current workspace-native schema directly, including framework tables, first-party module tables, indexes, current role/permission seed rows, and the `schema_migrations` table.

Fresh databases record one baseline row:

```text
version = 0.33.5.18.6.5.4
module_id = core
name = current_fresh_start_database
```

The old incremental migration files were consolidated into `current.sql` and removed from the active source tree. Startup no longer replays historical migration files for a new database.

## Existing Databases

There are no production users yet, but local developer data should still be preserved. When startup sees an existing application schema without the current baseline marker, it checks whether the database already matches the expected current schema shape. Compatible current-schema databases are adopted in place by replacing historical `schema_migrations` rows with the consolidated baseline marker, preserving users and records.

Older or incompatible local databases still fail with a backup/restore message instead of attempting a partial upgrade through migration files that were intentionally removed.

Checksum validation remains active for the current baseline and for any future migrations after this reset.

## Future Migrations

New schema changes after 0.33.5.18.6.5.4 should be added as normal SQL migration files with versions newer than the baseline, such as:

```text
src/db/migrations/065_add_example.sql
```

Future migrations are applied after the baseline and still receive checksum validation. Do not edit an applied future migration in place.

First-party module schema that is required by the bundled app should be folded into `src/db/schema/current.sql` when the baseline is deliberately refreshed. Optional or third-party module schema should use future module-owned migrations once third-party loading exists.

## Verification

Database-related changes should run:

```sh
npm run check
```

The check suite includes fresh-database coverage, legacy-cleanup coverage, performance timing checks, module sanity checks, and linting. For direct database repairs or migration work, also confirm SQLite integrity:

```sql
PRAGMA integrity_check;
```

When permission or workspace-scoped data behavior changes, also run:

```sh
npm run test:permissions
```
