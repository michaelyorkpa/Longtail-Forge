# Longtail Forge Database

As of version 0.31.22, new Longtail Forge installs use a fresh-start database baseline instead of replaying the historical 0.22.x-0.31.21 migration chain.

As of version 0.31.24.2, the active SQLite helper keeps one queued sqlite process alive briefly between calls instead of spawning a new process for every query. The public database helper API remains `querySql`, `runSql`, `sqlText`, `sqlNullableText`, `sqlInteger`, and `sqlNullableInteger`; callers should continue to use those helpers rather than shelling out directly.

## Fresh Baseline

The active schema lives in:

```text
src/db/schema/current.sql
```

That file creates the current workspace-native schema directly, including framework tables, first-party Tasks and Time Tracking tables, indexes, core role/permission seed rows, and the `schema_migrations` table.

Fresh databases record one baseline row:

```text
version = 0.31.22
module_id = core
name = fresh_start_database
```

The old incremental migration files remain in the repository as historical reference, but startup no longer uses versions `001` through `031` for a new database.

## Existing Databases

Existing databases that already upgraded through 0.31.21 keep their historical `schema_migrations` rows. On first 0.31.22 startup, the runner records the fresh-start baseline marker after confirming the required current tables exist and removed legacy tables are absent.

The runner no longer requires old applied migration files for checksum validation. Checksum validation remains active for future migrations after the 0.31.22 baseline.

Partially upgraded databases that are not at the current schema should be restored from backup and upgraded through 0.31.21 before crossing into the fresh-start baseline era.

## Future Migrations

New schema changes after 0.31.22 should be added as normal SQL migration files with versions greater than `031`, such as:

```text
src/db/migrations/032_add_example.sql
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
