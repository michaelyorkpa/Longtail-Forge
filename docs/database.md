# Longtail Forge Database

As of version 0.33.5.18.6.5.4, new Longtail Forge installs use a consolidated fresh-start database baseline instead of replaying the historical 0.22.x-0.33.5.18.6.5.3 migration chain.

As of version 0.31.24.2, the active SQLite helper keeps one queued sqlite process alive briefly between calls instead of spawning a new process for every query. The public database helper API remains `querySql`, `runSql`, `sqlText`, `sqlNullableText`, `sqlInteger`, and `sqlNullableInteger`; callers should continue to use those helpers rather than shelling out directly.

As of version 0.32.6.3, framework search metadata lives in the canonical `search_index` table. FTS virtual tables are lookup engines only and are not the source of truth for workspace scope, module scope, permissions, visibility, or record lifecycle state.

As of version 0.33.5.19.5, runtime database configuration is documented in [runtime-configuration.md](runtime-configuration.md). SQLite remains the only implemented provider, `LONGTAIL_DATABASE_PROVIDER` must be `sqlite`, and PostgreSQL settings are reserved for future adapter work rather than active behavior.

As of version 0.33.5.19.2, SQLite startup hardens the existing helper boundary before migrations run. Longtail Forge applies foreign-key enforcement to every SQLite process, enables `PRAGMA journal_mode = WAL` by default, configures the SQLite busy timeout from runtime config, verifies the database file path is writable, and reports safe startup health for the provider, database file path, writable state, foreign-key state, journal mode, and busy timeout.

As of version 0.33.5.19.5, `src/db/provider.js` owns the provider-neutral database adapter boundary and `src/core/database.js` is the preferred app-facing import path for repositories, modules, and framework services that need database access. The v1 adapter API is `db.query(sql, params)`, `db.get(sql, params)`, `db.run(sql, params)`, `db.transaction(callback)`, `db.close()`, `db.health()`, and `db.capabilities`. SQLite is still the only implemented provider, and the SQLite process helper stays behind `src/db/adapters/sqlite-adapter.js`. `querySql` and `runSql` remain temporary legacy compatibility helpers while repository code moves toward the adapter. Parameter binding is active for pilot repository paths, and the transaction helper is active for selected multi-step write pilots.

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
