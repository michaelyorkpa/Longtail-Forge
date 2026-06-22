# Longtail Forge Database

As of version 0.33.5.18.6.5.4, new Longtail Forge installs use a consolidated fresh-start database baseline instead of replaying the historical 0.22.x-0.33.5.18.6.5.3 migration chain.

As of version 0.31.24.2, the active SQLite helper keeps one queued sqlite process alive briefly between calls instead of spawning a new process for every query. The public database helper API remains `querySql`, `runSql`, `sqlText`, `sqlNullableText`, `sqlInteger`, and `sqlNullableInteger`; callers should continue to use those helpers rather than shelling out directly.

As of version 0.32.6.3, framework search metadata lives in the canonical `search_index` table. FTS virtual tables are lookup engines only and are not the source of truth for workspace scope, module scope, permissions, visibility, or record lifecycle state.

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
