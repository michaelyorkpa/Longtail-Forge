# Longtail Forge Database

As of version 0.33.5.18.6.5.4, new Longtail Forge installs use a consolidated fresh-start database baseline instead of replaying the historical 0.22.x-0.33.5.18.6.5.3 migration chain.

From version 0.31.24.2 through 0.33.5.21.0.1, the SQLite helper kept one queued sqlite process alive briefly between calls instead of spawning a new process for every query. The public database helper API remains `querySql`, `runSql`, `sqlText`, `sqlNullableText`, `sqlInteger`, and `sqlNullableInteger`; callers should continue to use those helpers rather than shelling out directly.

As of version 0.32.6.3, framework search metadata lives in the canonical `search_index` table. FTS virtual tables are lookup engines only and are not the source of truth for workspace scope, module scope, permissions, visibility, or record lifecycle state.

As of version 0.33.5.19.9, runtime database configuration is documented in [runtime-configuration.md](runtime-configuration.md). SQLite remains the only implemented provider, `LONGTAIL_DATABASE_PROVIDER` must be `sqlite`, and PostgreSQL settings are reserved for future adapter work rather than active behavior. SQLite small-office deployment assumptions are documented in [sqlite-small-office-mode.md](sqlite-small-office-mode.md).

As of version 0.33.5.20.1, `scripts/seed-scale.mjs` can seed a disposable SQLite database with repeatable small-office scale data. The script requires explicit `--profile`, `--provider sqlite`, and `--database` arguments, refuses normal/non-disposable database paths, marks completed seed runs in `scale_seed_runs`, and verifies expected counts, permission sanity, search sanity, and app startup sanity. Scale-seeded workspaces keep audit logging enabled with a 365-day retention window so the seeded Audit Log rows remain available for bounded-list testing. It is a developer scale-testing tool, not a migration, import path, or production data generator.

As of version 0.33.5.20.5, the bounded-query branch covers normal Tasks list reads, normal Notes list reads, visible-row enrichment batching, and high-volume framework/admin reads for Audit Log, Notifications, Search results, and Files browse. These routes use explicit maximum page sizes, stable ordering, permission-shaped rows, and pagination metadata. This is still SQLite-first work and does not add PostgreSQL.

As of version 0.33.5.20.6, `scripts/sqlite-small-office-performance.mjs` provides a repeatable seeded SQLite route timing pass for App shell bootstrap, Tasks list/detail, Notes list/detail, Files browse, Search, Notifications, and Workbench bootstrap. The script records local development hardware sanity targets for the `sqlite-small-office-50` scale profile and can smoke `dev-demo`, but it is not a hosted SaaS load test, concurrency benchmark, SLA, or replacement for service-owned bounded query contracts.

As of version 0.33.5.21.0.1, `better-sqlite3@12.11.1` is installed as the selected in-process SQLite driver dependency for the 0.33.5.21.0 driver swap. The selected release declares support for Node `20.x || 22.x || 23.x || 24.x || 25.x || 26.x`; the dependency was verified on the Windows development runtime `v20.13.1`. `scripts/better-sqlite3-install-smoke.mjs` opens a disposable database and verifies that the bundled SQLite supports FTS5, `bm25()`, and `RETURNING`.

As of version 0.33.5.21.0.2, `src/db/sqlite.js` opens one long-lived `better-sqlite3` connection to the configured SQLite database file instead of shelling out to the `sqlite3` CLI. The existing helper exports stay stable for `querySql`, `runSql`, `closeSqlite`, `initializeSqliteRuntime`, health helpers, and the SQL literal helpers. Already-interpolated compatibility SQL still uses `sqlText`, `sqlInteger`, `sqlNullableText`, and `sqlNullableInteger`; single read statements route through driver `prepare().all()`, while multi-statement scripts route through driver `exec()`.

As of version 0.33.5.21.0.3, SQLite adapter parameterized calls bind values through `better-sqlite3` instead of expanding parameters into SQL text. The app-facing `db.query(sql, params)`, `db.get(sql, params)`, and `db.run(sql, params)` APIs stay async-compatible, while the helper normalizes booleans to `0`/`1`, `Date` values to ISO strings, and `undefined` to `null` before driver binding. Parameterized SQL must be a single statement and missing, unknown, or invalid named parameters fail before execution. No-parameter multi-statement compatibility SQL remains available for existing `sqlText` / `sqlInteger` literal paths.

As of version 0.33.5.23.1, [database-parameter-binding-audit.md](database-parameter-binding-audit.md) records the runtime source inventory for the parameter-binding migration: 1,680 literal-helper invocations, 262 direct interpolated SQL operation sites, and 49 existing direct bound-params operation sites. The audit is plan-only and does not change runtime behavior.

As of version 0.33.5.23.2, `src/db/parameter-bindings.js` owns the named-to-positional binding layer at the adapter boundary. App-facing calls still use named parameters through `db.query(sql, params)`, `db.get(sql, params)`, and `db.run(sql, params)`. The SQLite adapter consumes the same layer and sends positional `?` bindings to the `better-sqlite3` helper; the layer can also emit `$n` placeholders for a future PostgreSQL adapter without reworking repository call sites. The first proof conversion moved `src/core/search/tag-text.js` from `sqlText()` interpolation to named params, leaving the remaining conversion wave for 0.33.5.23.3.

As of version 0.33.5.23.3, the first conversion wave moved the auth, workspace, permission, and settings repositories from literal-helper interpolation to named bound params through the adapter path. The converted wave covers `users.repo`, `workspaces.repo`, `user-workspaces.repo`, `permissions.repo`, `settings.repo`, and `app-settings.repo`, with the live burndown now at 1,499 remaining helper invocations, 233 remaining direct interpolated operation sites, and 91 existing bound operation sites.

As of version 0.33.5.23.4, the SQL parameter-binding branch is closed at that recorded burndown. The active decision remains that `src/db/parameter-bindings.js` owns named-to-positional translation, while the SQL literal helpers are deprecated compatibility escape hatches for unconverted literal SQL and no-parameter multi-statement startup/migration paths. Further repository conversion waves and the dialect portability audit remain future work; the PostgreSQL/database-extraction branch in 0.40.0 consumes the recorded remaining inventory rather than reopening the completed 0.33.5.23 branch.

As of version 0.33.5.25.2, Files quota enforcement added one new named-bound database read in `src/services/files.service.js`. The live parameter-binding scanner now reports 1,499 remaining helper invocations, 233 remaining direct interpolated operation sites, 92 existing bound operation sites, and 408 runtime DB operation calls. This updates the current audit ratchet without reopening the closed 0.33.5.23 conversion branch.

As of version 0.33.5.26.1, `src/db/parameter-bindings.js` supports array-valued named parameters for variable-length `IN (...)` lists. Non-empty arrays expand to the correct driver placeholder sequence. Dollar-style placeholders reuse a repeated named array as the same `$n` sequence, while SQLite/question-style placeholders duplicate the array values at each occurrence because positional `?` placeholders cannot be reused by name. Empty arrays expand to `NULL`, so `column IN (:ids)` remains valid SQL and returns no rows instead of broadening a read. This slice does not convert high-traffic repositories and does not define the dynamic bulk `VALUES (...)` row-group contract; that remains the 0.33.5.26.2 follow-up.

As of version 0.33.5.26.2, dynamic bulk `VALUES (...)` row groups are supported through `createBulkValuesBindings()` from `src/core/database.js` / `src/db/parameter-bindings.js`. The helper returns `{ sql, params }`, where `sql` is a comma-separated set of named placeholder row groups and `params` is a scalar value map for the adapter binding layer. It is value-only: table names, column names, conflict targets, sort clauses, operators, and SQL fragments must remain static or come from validated allowlists. The helper requires at least one row and at least one column, rejects invalid parameter prefixes, and does not treat nested cell arrays as list expansion. The SQLite search adapter canonical `search_index` upsert is the proof case. SQLite FTS maintenance remains on the existing compatibility path until the 0.33.5.27 search/dialect seam work. The live parameter-binding audit after this proof is 1,498 remaining helper invocations, 233 direct interpolated SQL operation sites, 93 existing bound operation sites, and 409 runtime DB operation calls.

As of version 0.33.5.26.4, future parameter-binding conversion waves should use the Future Conversion Wave Ratchet Checklist in [database-parameter-binding-audit.md](database-parameter-binding-audit.md). The checklist keeps the canonical inventory table, `scripts/parameter-binding-audit-regression.mjs` exact totals/`expectedTopGroups`, and `CHANGELOG.md` burndown in lockstep instead of weakening the ratchet when counts change.

As of version 0.33.5.27.1, the 0.33.5.27 database-extraction line makes Longtail Forge agnostic by contract and enforcement, not agnostic-proven. SQLite remains the only live provider in this branch. The live PostgreSQL adapter, provider gating, PostgreSQL migration runner, dual-backend contract tests, and SaaS seed/load proof remain in the 0.40.0 database-extraction branch, which should implement and prove a second backend behind the seams established here rather than rewrite application call sites.

The active agnostic data-access contract for new and converted code is:

- Import database access from `src/core/database.js`.
- Use named value bindings through `db.query(sql, params)`, `db.get(sql, params)`, `db.run(sql, params)`, and `db.transaction(callback)`.
- Keep identifiers, column lists, conflict targets, operators, sort clauses, and SQL fragments static or allowlisted. Bound params are for values only.
- Do not use `sqlText()`, `sqlInteger()`, `sqlNullableText()`, or `sqlNullableInteger()` in new or converted single-statement repository/service code.
- Do not leave raw SQLite-only dialect at application call sites once a repository is converted.

The only sanctioned interpolation compatibility allowlist is no-parameter multi-statement startup/migration code in `src/db/index.js` and `src/db/migrations.js`. Those paths are handled in the 0.33.5.27 startup/migration slice; no other owner may add new interpolation-helper usage.

Dialect-sensitive operation seams:

| Operation | 0.33.5.27 seam decision |
| --- | --- |
| Upsert/conflict writes | Provider-neutral write helper or adapter method; SQLite lowers to the current `INSERT ... ON CONFLICT` / `INSERT OR IGNORE` behavior. |
| Case-insensitive compare/order | Provider-neutral comparison/order helper; SQLite lowers to `COLLATE NOCASE`. |
| Boolean storage | Adapter-owned normalization and row mapping; app code binds/reads logical booleans while SQLite stores `0` / `1`. |
| Timestamp and interval math | Provider date/time helper or adapter method; converted repositories must not embed raw `julianday(...)`. |
| Full-text search | Framework search adapter/service seam owns backend search syntax; modules must not emit raw FTS5 SQL. |
| JSON access | Provider capability/helper if JSON SQL becomes necessary; app call sites must not add raw SQLite JSON functions/operators. |
| `RETURNING` and identity reads | Adapter method/helper for returned rows or last-insert identity; durable-job `RETURNING` statements are reviewed under this seam. |
| `rowid` / physical identity | Provider-owned startup/migration/maintenance method only; app repositories must not rely on raw SQLite `rowid`. |
| PRAGMA/introspection | Provider startup, health, migration, or repair methods only; modules must not call SQLite PRAGMAs directly. |

As of version 0.33.5.27.2, the first SQLite-backed dialect seam scaffold lives on `db.dialect` and is re-exported as `databaseDialect` / `getDatabaseDialect()` from `src/core/database.js` and `src/db/index.js`. The adapter also exposes the same dialect object on transaction clients. The scaffold gives future conversion waves stable helper groups for conflict writes, case-insensitive comparison and ordering, boolean bind/read mapping, timestamp math with SQLite `julianday(...)`, FTS5 `MATCH`/`bm25()` search lowering, JSON capability reporting, `RETURNING` and identity reads, physical `rowid`, and PRAGMA/introspection helpers. This slice does not convert application repositories or change the audit burndown; it makes the seam locations real so later waves can move raw dialect syntax out of app call sites without changing SQLite behavior.

As of version 0.33.5.27.3, `db.dialect.conflict` includes upsert/conflict statement builders such as `databaseDialect.conflict.buildInsertOrIgnore(...)`, `buildInsertOnConflictDoNothing(...)`, and `buildInsertOnConflictDoUpdate(...)`. They keep table names, columns, conflict targets, update columns, value expressions, and optional returned columns static or allowlisted while SQLite lowers to the current `INSERT OR IGNORE`, `ON CONFLICT(...) DO NOTHING`, and `ON CONFLICT(...) DO UPDATE SET ... excluded...` shapes. The low-risk runtime proof is the startup role-permission repair in `src/db/index.js`, which now uses the conflict builder with named params. Durable job enqueue, claim, and retention-prune returned rows now use the returning seam through `transaction.dialect.returning.columns(...)` instead of raw `RETURNING` at those call sites. The durable-job outcome for 0.33.5.27.32 is converted, not excepted: the dialect guardrail should assert raw `RETURNING` stays provider-owned rather than allowlisting `core/jobs` or `services/jobs.service`.

As of version 0.33.5.27.4, `db.dialect.comparison` includes the case-insensitive helpers used by converted call sites: `db.dialect.comparison.equalsNoCase(...)`, `db.dialect.comparison.containsNoCase(...)`, `db.dialect.comparison.likeNoCase(...)`, `db.dialect.comparison.orderByNoCase(...)`, `db.dialect.comparison.escapeLikePattern(...)`, and `db.dialect.comparison.likePattern(...)`. SQLite lowers these helpers to `COLLATE NOCASE` plus a provider-owned `ESCAPE` clause for LIKE pattern matching. The proof path is the `services/files.service` attachable-target option read, which now uses named params through `db.query(...)`, the dialect LIKE pattern helper for user search text, and `db.dialect.comparison.orderByNoCase(...)` for static allowlisted target-label ordering. The live parameter-binding ratchet after this proof is 1,490 remaining helper invocations, 232 direct interpolated SQL operation sites, 95 existing bound operation sites, and 410 runtime DB operation calls.

As of version 0.33.5.27.5, `db.dialect.boolean` includes logical boolean bind/read helpers for converted call sites: `db.dialect.boolean.bind(...)`, `db.dialect.boolean.bindFields(...)`, `db.dialect.boolean.read(...)`, `db.dialect.boolean.readField(...)`, and `db.dialect.boolean.readFields(...)`. SQLite lowers logical booleans to `0` / `1` / `NULL` storage while converted repositories keep app-level booleans in their params and read models. `db.dialect.time.elapsedSecondsSince(...)` now gives converted call sites an app-oriented elapsed-seconds helper over the provider timestamp seam, so repositories can replace raw `julianday(...)` interval arithmetic without changing SQLite behavior. The proof paths are Workspace Settings boolean save/read mapping in `settings.repo` and active timer pause elapsed-time updates in `time-tracking/active-timers.repo`. The live parameter-binding ratchet after this proof is 1,481 remaining helper invocations, 230 direct interpolated SQL operation sites, 97 existing bound operation sites, and 410 runtime DB operation calls.

As of version 0.33.5.27.6, the SQLite search adapter owns backend search syntax through the framework search adapter/service seam instead of emitting FTS5 details from application callers. `db.dialect.search.createVirtualTable(...)`, `db.dialect.search.dropVirtualTable(...)`, `db.dialect.search.match(...)`, and `db.dialect.search.rank(...)` lower SQLite FTS storage and read syntax inside the provider seam, while the search service continues to compose backend-neutral request models with `adapterSyntax: null`. The adapter's FTS sync, removal, search read, and repair statements now use named params through `db.run(...)`, `db.query(...)`, and transaction clients. Canonical `search_index` rows remain the source of truth; FTS rows are lookup/ranking storage only and repair still rebuilds them from canonical rows. The indexed `LIKE` fallback path remains canonical `search_index` reads using `db.dialect.comparison.likePattern(...)` and `containsNoCase(...)` when FTS5 is unavailable or forced off. The live parameter-binding ratchet after this proof is 1,441 remaining helper invocations, 228 direct interpolated SQL operation sites, 109 existing bound operation sites, and 415 runtime DB operation calls.

As of version 0.33.5.27.7, PRAGMA/introspection and physical identity boundaries are explicit before the repository conversion waves continue. `db.dialect.introspection.compileOptions(...)` owns SQLite compile-option reads for the search adapter, `db.dialect.introspection.tableInfo(...)` owns table metadata reads for module services, and qualified `rowId(...)` reads through `db.dialect.identity.rowId(...)` own the existing user/workspace physical-identity tie-breakers. Raw PRAGMA and raw `rowid` SQL are provider/startup/migration/repair/adapter-owned only: the sanctioned runtime owners are the SQLite dialect seam, `src/db/index.js` startup repair/maintenance, `src/db/migrations.js` migration compatibility work, and SQLite provider health in `src/db/sqlite.js`. This proof does not change the parameter-binding ratchet, which remains 1,441 remaining helper invocations, 228 direct interpolated SQL operation sites, 109 existing bound operation sites, and 415 runtime DB operation calls.

As of version 0.33.5.27.8, `tasks/tasks.repo` is converted to the active data-access contract: named params through `db.query(...)` and `db.run(...)`, array-valued named params for task-id batches, `db.dialect.comparison.orderByNoCase(...)` for its existing case-insensitive title ordering path, and `db.dialect.boolean.bind(...)` / `read(...)` for reminder override storage mapping. The conversion preserves task list/detail reads, saved task views, assignee filters, due-window reads, reminder candidate reads, recurrence identity lookup, and `last_worked_at` updates. The live parameter-binding ratchet after this wave is 1,370 remaining helper invocations, 221 direct interpolated SQL operation sites, 116 existing bound operation sites, and 415 runtime DB operation calls.

As of version 0.33.5.27.9, `tasks/task-checklists.repo` is converted to the active data-access contract: named params through `db.query(...)`, `db.get(...)`, and `db.run(...)`, array-valued named params for checklist progress task-id batches, `db.transaction(callback)` for reorder writes, and `db.dialect.boolean.bind(...)` / `read(...)` for checked-state storage mapping. The conversion preserves checklist read/progress, create/update/reorder, soft-delete, and next-sort-order behavior. The live parameter-binding ratchet after this wave is 1,331 remaining helper invocations, 215 direct interpolated SQL operation sites, 123 existing bound operation sites, and 415 runtime DB operation calls.

As of version 0.33.5.27.10, `tasks/task-relationships.repo` is converted to the active data-access contract: named params through `db.query(...)`, `db.get(...)`, and `db.run(...)`, array-valued named params for relationship summary task-id batches, and `db.dialect.boolean.bind(...)` / `read(...)` for blocking-state storage mapping. The conversion preserves relationship create/update/remove, active pair reads, parent/child reads, blocking-child reads, recursive path checks, single-task summaries, and batched relationship summaries. The live parameter-binding ratchet after this wave is 1,285 remaining helper invocations, 204 direct interpolated SQL operation sites, 134 existing bound operation sites, and 415 runtime DB operation calls.

As of version 0.33.5.27.11, `tasks/task-recurrence.repo` and `tasks/task-reminders.repo` are converted to the active data-access contract: named params through `db.query(...)`, `db.get(...)`, `db.run(...)`, and `db.transaction(callback)`. Recurrence template assignee replacement and reminder offset replacement use provider-neutral transaction callbacks, while reminder target batch reads use generated named params for each target pair. The conversion preserves recurrence template reads/writes, template assignees, reminder offsets, durable recurrence generation handoff, and reminder delivery scheduling semantics. The live parameter-binding ratchet after this wave is 1,218 remaining helper invocations, 197 direct interpolated SQL operation sites, 144 existing bound operation sites, and 417 runtime DB operation calls.

As of version 0.33.5.27.12, `time-tracking/active-timers.repo` is converted to the active data-access contract: named params through `db.query(...)`, `db.get(...)`, and `db.run(...)`, the conflict seam for active timer upsert, and the time seam for elapsed running-segment pause math. The conversion preserves manual and sourced active timer reads, source-module `NULL` filtering for manual timers, `(workspace_id, user_id, timer_slot)` upsert behavior, pause/remove flows, source removal, source existence checks, and manual slot compaction. The live parameter-binding ratchet after this wave is 1,165 remaining helper invocations, 187 direct interpolated SQL operation sites, 154 existing bound operation sites, and 417 runtime DB operation calls.

As of version 0.33.5.27.13, `time-tracking/time-entries.repo` is converted to the active data-access contract: named params through `db.query(...)`, `db.get(...)`, and `db.run(...)`. The conversion preserves workspace entry reads, single-entry reads, project entry reads, create/update/remove writes, project-scope label updates, project entry counts, nullable client/task fields, duration integer coercion, and the end-time ordering used by reporting-facing read inputs. No additional dialect seam was needed because this repository does not own conflict, comparison, full-text, JSON, identity, rowid, PRAGMA, or interval SQL. The live parameter-binding ratchet after this wave is 1,116 remaining helper invocations, 180 direct interpolated SQL operation sites, 162 existing bound operation sites, and 417 runtime DB operation calls.

As of version 0.33.5.27.14, the `notes/notes.repo` record list/read/filter paths are converted to the active data-access contract while the remaining Notes writes, revisions, linked-record, collection, and count paths stay assigned to 0.33.5.27.15. The converted note reads use named params through `db.query(...)` and `db.get(...)`, array-valued named params for note-id and collection-id batches, and `db.dialect.comparison` helpers for case-insensitive owner/context/search filters and ordering. The conversion preserves Notes list projections, secure/private read-model shaping, note kind/status filters, context filters, collection filters, owner filters, search filters, ordering, and paging. The live parameter-binding ratchet after this wave is 1,112 remaining helper invocations, 180 direct interpolated SQL operation sites, 163 existing bound operation sites, and 417 runtime DB operation calls.

As of version 0.33.5.27.15, `notes/notes.repo` is fully converted to the active data-access contract. Notes writes, revisions, linked-record paths, collection management, and count helpers now use named params through `db.query(...)`, `db.get(...)`, `db.run(...)`, and `db.transaction(callback)`, while collection and target ordering use `db.dialect.comparison.orderByNoCase(...)` and batched link reads use array-valued named params. The conversion preserves note create/update behavior, create-with-staged-links transaction behavior, revision numbering, link lifecycle, collection nesting/counts, nullable text and integer coercion semantics, target reads through allowlisted direct-context columns, and plaintext secure-placeholder checks. The live parameter-binding ratchet after this wave is 904 remaining helper invocations, 166 direct interpolated SQL operation sites, 180 existing bound operation sites, and 417 runtime DB operation calls.

As of version 0.33.5.27.16, the `lists/lists.repo` record and item paths are converted to the active data-access contract while the remaining catalog and linked-record paths stay assigned to 0.33.5.27.17. List record and item reads/writes now use named params through `db.query(...)`, `db.get(...)`, `db.run(...)`, and `db.transaction(callback)`, with array-valued named params for batched list/item IDs, `db.dialect.comparison.orderByNoCase(...)` for title ordering, and `db.dialect.boolean.bind(...)` for reusable-list storage. The conversion preserves list execution, item progress, item ordering, create/update/delete behavior, nullable text trimming, integer fallback coercion, finite-number-or-null item field handling, and service-owned read shaping. In `lists/lists.repo`, 72 helper invocations remain and 10 direct interpolated operation sites remain for the catalog/link wave. The live parameter-binding ratchet after this wave is 798 remaining helper invocations, 159 direct interpolated SQL operation sites, 191 existing bound operation sites, and 417 runtime DB operation calls.

As of version 0.33.5.27.17, `lists/lists.repo` is fully converted to the active data-access contract. Catalog, catalog-usage, linked-record, and batched linked-record paths now use named params through `db.query(...)`, `db.get(...)`, and `db.run(...)`, while catalog suggestion matching and item-name ordering use `db.dialect.comparison` and batched linked-record reads use array-valued named params. The conversion preserves catalog suggestion ranking, project/client/list-type context matching, archived-suggestion filtering, catalog snapshot behavior, use-count increments, link lifecycle, default related link roles, metadata parsing, source-list context inputs, permission-safe linked-target enrichment inputs, nullable text trimming, integer fallback coercion, and finite-number-or-null catalog field handling. The live parameter-binding ratchet after this wave is 726 remaining helper invocations, 149 direct interpolated SQL operation sites, 201 existing bound operation sites, and 417 runtime DB operation calls.

As of version 0.33.5.21.0.4, the SQLite adapter has retired the former global operation queue now that normal calls use the in-process synchronous driver path. `db.transaction(callback)` still owns explicit `BEGIN TRANSACTION`, `COMMIT`, and `ROLLBACK` behavior, still passes a transaction client with `query`, `get`, `run`, `capabilities`, `dialect`, and nested-transaction rejection, and still rejects direct `db.query` / `db.get` / `db.run` use inside the callback. Open transactions are protected by a transaction-only tail so outside adapter calls wait until the callback commits or rolls back. Migration, baseline, and schema-repair scripts that already embed `BEGIN ... COMMIT` remain no-parameter multi-statement `runSql()` calls that route through the `exec()` compatibility path; do not wrap those migration scripts in `db.transaction(callback)`.

As of version 0.33.5.21.0.5, SQLite adapter capabilities report `adapter: "better-sqlite3"` while preserving the rest of the provider-neutral capability shape. Native driver result rows remain plain objects keyed by selected column names and aliases. Current value semantics stay compatible for app callers: boolean values are stored as `0` / `1`, SQL `NULL` reads as `null`, BLOB values round-trip as Node `Buffer` instances when bound through parameters, and normal counters/counts remain JavaScript numbers. The helper does not enable `safeIntegers` because the current TEXT-key schema uses TEXT keys for identifiers and current numeric values are expected to stay within JavaScript's safe-integer range; any future 64-bit INTEGER identifier or exact large-integer workflow must revisit that decision before shipping.

As of version 0.33.5.21.0.6, the in-process SQLite driver swap is complete. Normal database access no longer shells out to the `sqlite3` CLI, `SQLITE_COMMAND` is ignored as legacy configuration, and setup docs no longer require operators to install the `sqlite3` executable. The supported SQLite runtime path is the native `better-sqlite3` dependency behind the existing adapter contract; keep the npm/native-build prerequisites in the Native SQLite Driver Dependency section as the install readiness boundary.

As of version 0.33.5.21.1, the first post-baseline core migration, `src/db/migrations/065_job_outbox_schema.sql`, creates the workspace-scoped `jobs` table used as the durable job/outbox store. The table stores `job_id`, `workspace_id`, `job_type`, optional `dedupe_key`, `payload_json`, lifecycle `status`, integer `priority`, scheduling through `available_at`, retry counters through `attempt_count` and `max_attempts`, lock fields `locked_at` and `locked_by`, `last_error`, and lifecycle timestamps. Active dedupe is enforced by a partial unique index on `(workspace_id, job_type, dedupe_key)` for pending, running, and failed jobs only, so completed and dead-letter history does not block a later replacement job.

As of version 0.33.5.21.2, Worker runner v1 lives in `src/core/jobs/` with a handler registry, timer-driven polling, SQLite-safe transactional claiming, success completion, basic retry backoff, exhausted-job dead-letter transitions, safe status output, and graceful shutdown. `inline` mode starts after the app server begins listening and wakes future `available_at` jobs through the poll interval. `separate` mode runs through `node worker.js`, verifies schema readiness without running migrations, and uses a local worker lock so SQLite mode has at most one local worker process attached to the install. Module job producers remain later durable-job slices.

As of version 0.33.5.21.3, the runner reclaims expired running locks by comparing `locked_at` to `LONGTAIL_JOB_LOCK_TTL_SECONDS`, claims through atomic SQLite `UPDATE ... WHERE job_id = (SELECT ... LIMIT 1)` statements inside `db.transaction(...)`, and exposes the protected `GET /api/jobs/status` readout for pending/running/failed/dead counts plus paged recent failure summaries. As of 0.33.5.27.3, the claimed rows are read through the provider returning seam instead of raw `RETURNING` at the runner call site.

As of version 0.33.5.21.4, Search indexing uses the durable job runner. Normal record mutation helpers queue `search.index` jobs for reindex/remove work, the worker performs canonical `search_index` and SQLite FTS writes, and `POST /api/search-index/rebuild` queues a workspace/module rebuild job instead of rebuilding inside the HTTP request. Normal web startup no longer runs a full app-wide rebuild; if `search_index` is empty, startup queues one deduped app rebuild job so fresh or restored databases have an explicit recovery path.

As of version 0.33.5.21.5, Notification fan-out uses the durable job runner. Internal notification event hooks queue `notification.event` rows in `jobs`; the worker resolves recipients and creates notification records through the notification service, preserving workspace defaults, user preferences, subscriptions, permission checks, and module-enabled checks.

As of version 0.33.5.21.7.1, Files upload requests no longer run scanner work inline after queueing `file.scan`. Uploads create and attach a pending file row, leave download and preview unavailable, and rely on the inline or separate worker to complete the queued scan before the file becomes available or quarantined. Target-scoped attachment reads may include safe pending-scan rows so the owning record can show review-pending recovery copy while the worker is delayed or disabled.

As of version 0.33.5.21.7.2, task reminder scheduling uses a documented 30-day scheduling horizon plus a durable 12-hour sweep. Eligible task create/update/reopen/restore flows pre-enqueue only reminder occurrences whose `reminder_at_utc` falls inside that horizon. App startup and separate-worker startup queue a `task.reminder` sweep operation per active workspace; the sweep reads existing active due-dated tasks, tops up newly in-horizon reminder jobs, and reschedules the next sweep through the jobs table. This gives existing tasks reminder coverage without creating unbounded far-future queued rows.

As of version 0.33.5.21.7.3, the reminder model keeps the 30-day scheduling horizon and 12-hour sweep while registered durable job handlers are reviewed for normal at-least-once worker behavior. Task reminder firing carries a stable `notification_delivery_key`; notification event jobs dedupe that key while active, and notification fan-out uses deterministic recipient notification IDs so reclaimed reminder jobs and retried notification jobs cannot double-notify the same user for the same reminder firing. Search indexing remains canonical upsert/delete work, recurrence generation keeps its existing-instance guard, file scanning skips rows that are no longer pending scan work, and `import.future` remains a safe no-op.

As of version 0.33.5.21.7.4, durable job history is bounded by framework-owned retention pruning. App startup and `node worker.js` startup prune only old `completed` and `dead` rows according to `LONGTAIL_JOB_COMPLETED_RETENTION_DAYS` and `LONGTAIL_JOB_DEAD_RETENTION_DAYS`; active `pending`, `running`, and `failed` rows are preserved regardless of age. Completed and dead-letter history still does not participate in active dedupe, so replacement jobs with the same dedupe key remain allowed before or after pruning.

As of version 0.33.5.21.7.5, admin job observability is available from Workspace Settings as a read-only Jobs panel. The panel consumes the protected `GET /api/jobs/status` route for pending/running/failed/dead counts and paged recent failed/dead summaries, and Runtime Diagnostics renders safe worker health fields such as state, timer activity, last poll/run/success timestamps, counters, and registered job types. These readouts do not expose job payload JSON, dedupe keys, scanner internals, storage paths, raw environment values, or secrets.

As of version 0.33.5.21.7.6, separate worker operation is validated end to end through `node worker.js` against queued search indexing, notification fan-out, task reminder, task recurrence, and file scan jobs. The worker proves the SQLite boundary by requiring schema readiness before startup, avoiding app migrations and app startup defaults, acquiring the local worker lock, rejecting a second local worker process, and leaving disabled or inline `worker.js` modes from processing queued jobs.

As of version 0.33.5.21.7.7, recurring task completion responses are aligned with that asynchronous worker contract. Completing a recurring task returns the completed task with `createdTask: null` and a `recurrenceJob.queued` hint; the `task.recurrence` worker creates the next instance later. Public API responses expose only the safe queued boolean and do not expose job IDs, dedupe keys, payload JSON, or worker internals.

As of version 0.33.5.21.8, fired task reminders deliver in-app notifications through the existing notification fan-out job path. The `task.reminder` fire operation emits `task.due_soon` with explicit reminder recipients from the current task read: assignees for assigned tasks, or the task creator when there are no assignees. Existing task followers remain additive through notification subscriptions. The notification row keeps the stable delivery key, high priority, task link, reminder offset metadata, and user-preference/module-enabled filtering from the framework notification service.

As of version 0.33.5.19.2, SQLite startup hardens the existing helper boundary before migrations run. Longtail Forge applies foreign-key enforcement to every SQLite process, enables `PRAGMA journal_mode = WAL` by default, configures the SQLite busy timeout from runtime config, verifies the database file path is writable, and reports safe startup health for the provider, database file path, writable state, foreign-key state, journal mode, and busy timeout.

As of version 0.33.5.19.5, `src/db/provider.js` owns the provider-neutral database adapter boundary and `src/core/database.js` is the preferred app-facing import path for repositories, modules, and framework services that need database access. The v1 adapter API is `db.query(sql, params)`, `db.get(sql, params)`, `db.run(sql, params)`, `db.transaction(callback)`, `db.close()`, `db.health()`, and `db.capabilities`. SQLite is still the only implemented provider, and the SQLite helper stays behind `src/db/adapters/sqlite-adapter.js`. `querySql` and `runSql` remain temporary legacy compatibility helpers while repository code moves toward the adapter. Parameter binding is active for pilot repository paths, and the transaction helper is active for selected multi-step write pilots.

As of version 0.33.5.19.6, SQLite migrations and schema repairs run under a migration lock before normal app startup defaults are applied. The lock is a process-owned file beside the configured SQLite database file. If a second startup process reaches migrations while the lock is held, startup fails with an actionable message that names the lock file and stale-lock recovery path.

The completed 0.33.5.19 foundation covers runtime config, SQLite startup hardening, the provider-neutral adapter boundary, parameterized-query and transaction pilots, SQLite migration locking, and safe runtime diagnostics/admin readout. Later durable-job work consumes this boundary through the 0.33.5.21 `jobs` schema and v1 worker runner. The completed 0.33.5.22 storage/scanner runtime branch makes local Files storage-provider selection, streaming writes, multipart uploads, scanner mode resolution, the optional `clamscan` executable adapter active, the optional `clamd` TCP adapter active, S3-compatible adapter scaffolding, S3 object operations contract-tested through a mocked client path, and S3 diagnostics/signature-boundary documentation active on top of the same boundary. As of 0.33.5.25.1, selecting `LONGTAIL_STORAGE_PROVIDER=s3` fails app and worker startup until a provider-specific client is wired. As of 0.33.5.25.2, Files workspace/per-user quota enforcement consumes the existing `file_workspace_settings` and internal storage accounting shape before upload persistence. As of 0.33.5.25.3, Files download and preview-content reads consume the storage adapter `metadata()` pre-check before opening read streams so storage/DB drift returns clean 404 responses. As of 0.33.5.25.4, streamed multipart batch uploads return malformed individual file parts as per-file failures, and the active storage adapter contract matches wired behavior without the unused local `quarantine()` method. PostgreSQL, provider-specific hosted S3 client rollout, actual signed URL/direct-transfer routes, and any future stored-object relocation on quarantine remain future branches that should consume the same boundary rather than bypass it.

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

As of 0.33.5.23.4, named parameters are translated at the adapter boundary into provider-driver positional bindings. SQLite receives positional `?` bindings through the shared layer, and the same layer can produce `$n` placeholders for a future PostgreSQL adapter. The legacy `sqlText`, `sqlInteger`, `sqlNullableText`, and `sqlNullableInteger` helpers are deprecated compatibility escape hatches for unconverted code and no-parameter multi-statement startup/migration paths. They should not become param-emitting shims, and new or touched single-statement repository queries should use named parameters unless a slice explicitly keeps the code on the compatibility path. The auth, workspace, permission, and settings repositories are now converted examples for this style.

For variable-length `IN (...)` lists, pass an array as a named parameter:

```js
await db.query(`
SELECT task_id
FROM tasks
WHERE workspace_id = :workspaceId
  AND task_id IN (:taskIds);
`, {
  taskIds,
  workspaceId,
});
```

Do not manually join values into `IN (...)` lists in new or converted repository code. A repeated named array may be reused in more than one clause; future `$n` providers reuse the same placeholder sequence, while SQLite duplicates values for each positional occurrence. Empty arrays expand to `NULL` so `IN (:ids)` returns no rows. If a workflow needs a different empty-list meaning, handle that explicitly in service/repository code before issuing the query.

For dynamic bulk `VALUES (...)` row groups, use the shared helper rather than joining literal values:

```js
const values = createBulkValuesBindings(rows, ["recordId", "label"], {
  paramPrefix: "recordValue",
});

await db.run(`
INSERT INTO records (record_id, label)
VALUES ${values.sql}
ON CONFLICT(record_id) DO UPDATE SET
  label = excluded.label;
`, values.params);
```

This helper only builds value placeholder groups. Keep the column list and conflict target static or allowlisted, and skip the write explicitly when there are no rows.

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

As of 0.33.5.21.0.4, adapter transactions no longer rely on a global all-operation queue. Normal outside reads and writes use the synchronous driver path, while calls that arrive during an open transaction wait behind the transaction-only tail until the transaction completes.

## Native SQLite Driver Dependency

`better-sqlite3` is a native dependency. Normal installs should download a prebuilt binary for supported Node/runtime/platform combinations. If no prebuilt binary is available, npm falls back to building from source through `node-gyp`; on Windows that requires Python plus a C++ toolchain such as Visual Studio Build Tools with the Desktop development workload. Keep the Node runtime within the selected release's engine range before troubleshooting native build failures.

The `sqlite3` command-line executable is not required for normal Longtail Forge operation.

The dependency-readiness smoke can be run directly with:

```sh
npm run test:sqlite-driver
```

This smoke check uses a disposable temp database only. It does not change the app database or run migrations. The in-process helper core is covered separately by `scripts/better-sqlite3-helper-core-regression.mjs`.

## Migration Locking and Startup Ownership

Self-hosted SQLite mode keeps startup simple: one app process runs startup migrations and schema repairs before the app applies module/default records and starts serving requests. SQLite is still the only active provider in this branch, and this lock does not add horizontal SQLite app-server support.

The SQLite migration lock file is `.longtail-forge-migrations.lock` in the same directory as `LONGTAIL_DATABASE_FILE`. `runMigrations()` acquires that lock before fresh-baseline adoption, legacy schema repairs, checksum validation, and future migration files. The lock is released after migration work succeeds or fails. If startup finds an existing lock, the app reports that another Longtail Forge startup or maintenance process is running migrations or schema repairs, then tells the operator to wait or remove the stale lock file after confirming the other process crashed.

Normal app startup work runs after schema startup maintenance. Framework module rows, default app settings, default workspace/bootstrap records, module registry sync, stored-time normalization, and role/permission repairs are app-startup defaults, not migration files. Inline worker startup and the empty-index search rebuild job queue check are post-startup app work, not migration work.

As of 0.33.5.21.2, the SQLite small-office worker boundary is implemented for the v1 durable-job runner: SQLite mode may run jobs inline inside the single app process, or through at most one local worker process attached to the same local install through `node worker.js`. SQLite mode does not support multiple app servers, multiple web nodes, or a worker fleet sharing one SQLite file.

Future SaaS/PostgreSQL mode should not let every web or worker instance run migrations independently. A deploy or maintenance process should own migrations, acquire a PostgreSQL advisory lock or a provider-backed migration lock table in the same database, run migrations once, then start web and worker processes against the current schema. Web and worker processes should verify schema readiness and fail clearly if the maintenance owner has not completed migration work.

## Durable Job/Outbox Schema

The `jobs` table is framework-owned infrastructure for durable background work and outbox-style handoff. The table shipped as schema only in 0.33.5.21.1, the v1 worker runner shipped in 0.33.5.21.2, lock-timeout recovery plus the minimal admin readout shipped in 0.33.5.21.3, the first job producers shipped across 0.33.5.21.4 through 0.33.5.21.6, completed/dead-letter retention pruning shipped in 0.33.5.21.7.4, safe Workspace Settings job observability shipped in 0.33.5.21.7.5, separate-worker end-to-end validation shipped in 0.33.5.21.7.6, and recurring-task completion response closeout shipped in 0.33.5.21.7.7.

Job states:

- `pending`: work is stored durably and can be claimed once `available_at` is due. Pending rows should have no active lock.
- `running`: a worker has claimed the row and records `locked_at` plus `locked_by`. If `locked_at` is older than `LONGTAIL_JOB_LOCK_TTL_SECONDS`, a later poll can reclaim the row and record another attempt.
- `completed`: work finished successfully and records `completed_at`; completed rows are retained as short-term history, pruned after the configured completed-job retention window, and no longer participate in active dedupe.
- `failed`: work failed but has retry capacity left. `last_error` stores a safe failure summary, `attempt_count` tracks tries, and `available_at` can schedule the next retry.
- `dead`: retry capacity is exhausted or the job is otherwise dead-lettered. Dead rows record `dead_at`, keep `last_error` for admin-readable summaries, are pruned after the configured dead-letter retention window, and no longer participate in active dedupe.

The pending-work index covers retryable work by `status`, `available_at`, `priority`, `created_at`, and `job_id`. A separate running-lock index supports future lock-timeout scans. Workspace/status and job-type/status indexes support future admin readouts and handler-specific work without requiring browser code to scan or classify jobs.

Job retention pruning runs through `jobsService.pruneOldJobs()` as framework maintenance, not through ad hoc route deletes. It deletes in bounded batches, uses `completed_at` or `dead_at` cutoffs with stored timestamp fallbacks for malformed historical rows, and restricts deletion by exact status so active rows survive even if their timestamps are old.

## Durable Job Runner V1

Worker handlers register through `src/core/jobs/index.js`. The runner claims available `pending`, due `failed`, or expired-lock `running` rows with atomic SQLite `UPDATE ... WHERE job_id = (SELECT ... LIMIT 1)` statements inside `db.transaction(...)`, reads claimed rows through `transaction.dialect.returning.columns(...)`, sets `status = 'running'`, records `locked_at` and `locked_by`, and increments `attempt_count` before invoking the registered handler. The transaction repeats that one-row claim up to the requested claim limit because SQLite does not support `FOR UPDATE SKIP LOCKED`. Successful handlers mark the row `completed` and clear lock/error fields.

Handler failures keep the row in `failed` when retry capacity remains, clear the lock, store a bounded error summary, and move `available_at` forward with exponential backoff starting at one second and capped at sixty seconds. When `attempt_count` reaches `max_attempts`, the runner moves the row to `dead` and records `dead_at`.

`GET /api/jobs/status` returns a minimal admin readout for authenticated users with `workspace_settings.manage` in the active workspace. The readout includes pending/running/failed/dead counts and recent failed/dead summaries with the shared bounded-pagination envelope. Workspace Settings uses that same route for the read-only Jobs panel. It does not expose job payload JSON or dedupe keys.

In `inline` mode, the app server starts the worker after `app.listen(...)` succeeds. The in-process poll timer, not HTTP responses, triggers work. Future `available_at` jobs wake on the next poll interval; SQLite mode does not have a separate scheduler. Inline worker work shares the same Node process, database adapter, and SQLite connection path as request handling.

In `separate` mode, `node worker.js` is the worker process. It loads the local `.env` file, requires `LONGTAIL_WORKER_MODE=separate`, verifies that the schema and migration `065_job_outbox_schema` are already present, and does not run migrations or app startup defaults such as module, user, role, or workspace repair. In SQLite mode it creates `.longtail-forge-worker.lock` beside the configured database file, enforcing the one-local-worker boundary for the install.

## Durable Search Index Jobs

`search.index` is the first framework-owned job producer. The payload operation is one of:

- `reindex`: call the registered module/framework indexer for one record and upsert the canonical `search_index` row.
- `remove`: remove one canonical search row and its backend search storage row.
- `rebuild`: rebuild a workspace/module scope, or an app scope for local maintenance/startup recovery.

Module mutation services call `searchIndexSyncService` after successful create/update/archive/restore/delete flows. That helper queues jobs and logs queue failures without throwing, preserving the previous user-facing save behavior where search indexing errors do not fail the saved record. Worker failures are retried by the durable runner and become visible through the jobs admin readout.

The protected browser rebuild route queues a workspace/module rebuild job for the active workspace and returns `202`. Direct `searchService` and `searchIndexRebuildService` calls remain available to focused regressions and local maintenance scripts, including `scripts/search-index-rebuild.mjs`, but normal web startup no longer calls `rebuildApp()`. Startup only checks whether `search_index` is empty; when it is empty, it queues a deduped app rebuild job with source `startup-empty-index`.

## Durable Notification Fan-out Jobs

`notification.event` is the second framework-owned job producer. Framework notification event hooks enqueue one job per notification-producing internal event with the event name, workspace/module context, actor, record reference, before/after values, metadata, emitted timestamp, and minimal session context.

The notification worker handler resolves recipients and creates notification records through `notificationsService.createFromEvent()`. That path still owns workspace defaults, user preferences, follow subscriptions, actor suppression, safe notification metadata, target access checks, and disabled-module checks. Direct `notificationsService.create()` and `createMany()` remain available for explicit framework calls and focused tests, but normal module event fan-out should go through the queued event path.

Failed fan-out jobs use the durable runner's normal retry behavior. A retryable failure remains in `failed` with a bounded `last_error` and a future `available_at`; exhausted jobs move to `dead` for the admin job readout without blocking the app. As of 0.33.5.21.7.3, notification events with a stable delivery key dedupe active fan-out jobs and use deterministic recipient notification IDs, so retried or reclaimed jobs do not create duplicate notification rows.

## Durable Background Work Jobs

As of version 0.33.5.21.6, time-sensitive and slow workflow work has durable job handlers:

- `task.reminder`: queued when eligible tasks are created, updated, reopened, restored, or found by the reminder sweep. As of 0.33.5.21.7.2, reminder scheduling is bounded to a 30-day horizon and topped up by a durable 12-hour sweep so existing tasks can receive reminders without queuing unbounded far-future rows. As of 0.33.5.21.7.3, the fire operation includes a stable `notification_delivery_key` so the downstream notification path is idempotent under at-least-once retries. As of 0.33.5.21.8, the fire operation also passes explicit reminder recipients from the current task read so assigned tasks notify assignees and unassigned tasks notify the creator while task followers remain additive. The worker recomputes the effective reminder policy before firing, skips stale/completed/archived tasks, accounts for a small web/worker clock-skew window, and emits `task.due_soon` with the task's timezone-derived due context.
- `task.recurrence`: queued when a recurring task is completed. The worker creates the next recurrence instance through the Tasks recurrence service, records the same audit/event/search side effects as the old inline path, and relies on the recurrence service's existing "find existing instance first" behavior for idempotence.
- `file.scan`: queued when a file record is created. As of 0.33.5.21.7.1, upload requests do not scan inline after queueing; the worker handler owns the pending -> available/quarantined transition and safely skips files that are no longer pending. As of 0.33.5.22.7, `LONGTAIL_FILE_SCANNER=none` resolves queued scan work to `available`/`not_required`, `noop` is an explicit pass-through mode, and scanner modes resolve through Files-owned adapters. As of 0.33.5.22.8, Runtime Diagnostics reports safe scanner health/status and disabled/pass-through warnings without exposing scanner internals. As of 0.33.5.22.9, `clamscan` can stream bytes through an optional executable scanner; clean results pass, infected results quarantine/fail, and unavailable or timed-out scanner executions quarantine/error without auto-deleting stored files. As of 0.33.5.22.11, `clamd` can stream bytes through the optional TCP daemon adapter with the same clean/infected/unavailable/timeout disposition and the same no-hostname/no-port/no-output redaction boundary.
- `import.future`: reserved for future import producers. The registered handler completes as a safe no-op until a concrete import workflow is promoted into the roadmap.

SQLite inline mode remains intentionally simple: the app's inline worker poll timer or the one local `node worker.js` process claims these rows using the same `jobs` table and retry/dead-letter behavior. Scanner mode resolution is configuration-owned by Files; the durable file-scan execution path keeps pending files unavailable until a worker completes the configured scan disposition, without enabling ClamAV or exposing scanner internals in this slice.

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

New schema changes after 0.33.5.18.6.5.4 should be added as normal SQL migration files with versions newer than the baseline. The first future migration is `065_job_outbox_schema.sql`; later migrations should keep advancing the migration number, such as:

```text
src/db/migrations/066_add_example.sql
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
