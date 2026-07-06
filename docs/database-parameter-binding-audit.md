# SQL Parameter-Binding Audit

This document started as the 0.33.5.23.1 plan-only SQL parameter-binding audit and now tracks the live parameter-binding burndown. Audit-doc updates do not change runtime database behavior by themselves.

## Scope

Runtime source scan:

- Included: `src/**/*.js` and `src/**/*.mjs`.
- Excluded: `scripts/` regression fixtures, generated/runtime data, and the helper definitions in `src/db/sql-literals.js`.
- Counted literal-helper invocations: `sqlText()`, `sqlInteger()`, `sqlNullableText()`, and `sqlNullableInteger()` used outside the helper definition file.
- Counted direct interpolated SQL operation sites: `db.query/get/run`, `transaction.query/get/run`, `querySql`, `getSql`, and `runSql` calls whose call expression directly contains one of the literal helpers.
- Counted existing direct bound-params operation sites: the same operation calls with a second `params` argument.

Current totals as of 0.33.5.27.25:

- Remaining runtime literal-helper invocations: 362.
- Remaining direct interpolated SQL operation sites: 66.
- Existing direct bound-params operation sites: 293.
- Total runtime database operation calls seen by the audit scanner: 419.

Original 0.33.5.23.1 baseline totals:

- Total runtime literal-helper invocations: 1,680.
- Total direct interpolated SQL operation sites: 262.
- Existing direct bound-params operation sites: 49.
- Total runtime database operation calls seen by the audit scanner: 399.

The operation-site number is intentionally smaller than the helper-invocation count because one SQL statement can interpolate many values.

The inventory below is the canonical per-owner view and should be updated in place after each conversion wave. Do not add separate per-wave owner tables with different counts; historical wave notes should point back to this table.

## Inventory

Status legend:

- `Remaining`: still has literal-helper invocations and direct interpolated operation sites to convert, even if some bound sites already exist.
- `Converted`: this branch converted or proof-converted the owner to zero literal-helper/direct-interpolation sites.
- `Already bound`: the owner already had zero literal-helper/direct-interpolation sites in the initial audit and is tracked here for completeness.

| Owner | Status | Literal-helper invocations | Direct interpolated operation sites | Existing bound operation sites | Runtime database operation calls |
| --- | --- | ---: | ---: | ---: | ---: |
| db/index | Remaining | 99 | 19 | 1 | 35 |
| client-projects/clients.repo | Remaining | 60 | 5 | 0 | 7 |
| services/work-resume-state.service | Remaining | 53 | 7 | 0 | 7 |
| client-projects/projects.repo | Remaining | 49 | 7 | 0 | 8 |
| core/modules/modules.service | Remaining | 29 | 6 | 0 | 9 |
| audit-logs.repo | Remaining | 28 | 3 | 0 | 10 |
| api-keys.repo | Remaining | 20 | 8 | 0 | 8 |
| db/migrations | Remaining | 18 | 8 | 0 | 24 |
| services/work-resume-state-initial-producers | Remaining | 5 | 2 | 0 | 2 |
| services/help.service | Remaining | 1 | 1 | 0 | 1 |
| services/files.service | Converted | 0 | 0 | 32 | 33 |
| services/tag-propagation-registry | Converted | 0 | 0 | 15 | 15 |
| services/tags.service | Converted | 0 | 0 | 3 | 3 |
| tags.repo | Converted | 0 | 0 | 17 | 17 |
| core/search/adapters/sqlite-search-adapter | Converted | 0 | 0 | 13 | 17 |
| core/search/tag-text | Converted | 0 | 0 | 1 | 1 |
| services/search-index-rebuild.service | Converted | 0 | 0 | 2 | 2 |
| tasks/task-checklists.repo | Converted | 0 | 0 | 8 | 8 |
| tasks/task-recurrence.repo | Converted | 0 | 0 | 6 | 6 |
| tasks/task-relationships.repo | Converted | 0 | 0 | 12 | 12 |
| tasks/task-reminders.repo | Converted | 0 | 0 | 4 | 4 |
| tasks/tasks.repo | Converted | 0 | 0 | 15 | 15 |
| time-tracking/active-timers.repo | Converted | 0 | 0 | 12 | 12 |
| time-tracking/time-entries.repo | Converted | 0 | 0 | 8 | 8 |
| users.repo | Converted | 0 | 0 | 17 | 17 |
| workspaces.repo | Converted | 0 | 0 | 10 | 10 |
| permissions.repo | Converted | 0 | 0 | 8 | 10 |
| user-workspaces.repo | Converted | 0 | 0 | 6 | 7 |
| settings.repo | Converted | 0 | 0 | 4 | 4 |
| notes/notes.repo | Converted | 0 | 0 | 21 | 21 |
| notifications.repo | Converted | 0 | 0 | 25 | 25 |
| lists/lists.repo | Converted | 0 | 0 | 21 | 21 |
| app-settings.repo | Converted | 0 | 0 | 2 | 3 |
| sessions.repo | Already bound | 0 | 0 | 8 | 8 |
| db/provider | Already bound | 0 | 0 | 6 | 6 |
| core/jobs/job-runner | Already bound | 0 | 0 | 4 | 4 |
| services/jobs.service | Already bound | 0 | 0 | 4 | 4 |
| core/jobs/job-queue | Already bound | 0 | 0 | 3 | 3 |
| db/sqlite | Already bound | 0 | 0 | 2 | 6 |
| db/sqlite-adapter | Already bound | 0 | 0 | 2 | 2 |
| tasks/task-jobs.service | Already bound | 0 | 0 | 1 | 2 |

## Future Conversion Wave Ratchet Checklist

Every future parameter-binding conversion wave must update these artifacts together before closeout:

1. `docs/database-parameter-binding-audit.md`: update the current totals above and the canonical Inventory row for every touched owner, including the owner status.
2. `scripts/parameter-binding-audit-regression.mjs`: update the exact `audit.totals` object, `expectedTopGroups` when top-owner order or counts change, and any owner-specific row/status assertions touched by the wave.
3. `CHANGELOG.md`: record the shipped burndown with the same helper, direct-interpolation, bound-site, and runtime DB-operation counts.
4. `docs/database.md`: update only when the wave changes the reusable database contract or a published live ratchet summary.
5. Focused regressions: run the touched repository/service regression plus `scripts/parameter-binding-audit-regression.mjs`; keep the full closeout checks for release bookkeeping.

Do not weaken the exact-equality ratchet when it fails. A red ratchet means the conversion changed the live SQL inventory and the artifacts above need to be reconciled.

Standing query rule from `DECISIONS.md`: new or touched single-statement repository queries must use named params through `db.query(sql, params)`, `db.get(sql, params)`, or `db.run(sql, params)`. `sqlText()`, `sqlInteger()`, `sqlNullableText()`, and `sqlNullableInteger()` remain deprecated compatibility escape hatches for unconverted literal SQL and no-parameter multi-statement startup/migration paths unless a roadmap slice explicitly keeps a touched statement on that compatibility path.

## 0.33.5.27 Conversion Wave Assignments

0.33.5.27.1 records the portability contract and assigns every remaining owner in the Inventory table to a one-session implementation wave. The wave assignment does not change runtime SQL behavior or the burndown totals. Roadmap slices `0.33.5.27.2` through `0.33.5.27.7` are seam implementation/proof slices; repository conversion waves begin at `0.33.5.27.8` and update this audit when they move owners to named params.

| Wave | Assigned owners |
| --- | --- |
| 0.33.5.27.8 - Tasks primary repository | `tasks/tasks.repo` |
| 0.33.5.27.9 - Task checklist repository | `tasks/task-checklists.repo` |
| 0.33.5.27.10 - Task relationships repository | `tasks/task-relationships.repo` |
| 0.33.5.27.11 - Task recurrence and reminders | `tasks/task-recurrence.repo`, `tasks/task-reminders.repo` |
| 0.33.5.27.12 - Active timers | `time-tracking/active-timers.repo` |
| 0.33.5.27.13 - Time entries | `time-tracking/time-entries.repo` |
| 0.33.5.27.14 - Notes records and filters | `notes/notes.repo` partial: record list/read/filter paths |
| 0.33.5.27.15 - Notes writes, revisions, links, and collections | `notes/notes.repo` remaining paths |
| 0.33.5.27.16 - Lists records and items | `lists/lists.repo` partial: list record and item paths |
| 0.33.5.27.17 - Lists catalog and linked records | `lists/lists.repo` remaining catalog/link paths |
| 0.33.5.27.18 - Files browse and attachment reads | `services/files.service` partial: browse/read/attachment/preview/download metadata reads |
| 0.33.5.27.19 - Files context and attachable targets | `services/files.service` partial: File Context, attachable-target option, target label/context, and duplicate-context paths |
| 0.33.5.27.20 - Files lifecycle, settings, quota, and accounting | `services/files.service` remaining lifecycle/settings/quota/accounting/file-record paths |
| 0.33.5.27.21 - Notifications inbox and lifecycle | `notifications.repo` partial: create/list/count/read/mark/dismiss/archive/admin/filter paths |
| 0.33.5.27.22 - Notification preferences and subscriptions | `notifications.repo` remaining preference/default/subscription paths |
| 0.33.5.27.23 - Tags repository | `tags.repo` |
| 0.33.5.27.24 - Tag propagation and tags service | `services/tag-propagation-registry`, `services/tags.service` |
| 0.33.5.27.25 - Search adapter and rebuild service | `core/search/adapters/sqlite-search-adapter`, `core/search/tag-text`, `services/search-index-rebuild.service` |
| 0.33.5.27.26 - Work resume state | `services/work-resume-state.service`, `services/work-resume-state-initial-producers` |
| 0.33.5.27.27 - Clients and Projects repositories | `client-projects/clients.repo`, `client-projects/projects.repo` |
| 0.33.5.27.28 - Framework and admin low-count repositories | `core/modules/modules.service`, `audit-logs.repo`, `api-keys.repo`, `services/help.service`, and any other remaining low-count application repository from the audit inventory |
| 0.33.5.27.29 - Startup maintenance compatibility path | `db/index` |
| 0.33.5.27.30 - Migration compatibility path | `db/migrations` |

The only sanctioned interpolation compatibility allowlist is no-parameter multi-statement startup/migration code in `src/db/index.js` and `src/db/migrations.js`. All other assigned owners must convert to named bound params and the dialect seams before their wave is complete.

## Scope Rechecks

Confirmed non-issues for this parameter-binding slice:

- No SQLite JSON SQL functions were found in runtime source.
- No top-level `UPDATE` or `DELETE` statements with `LIMIT` or `OFFSET` were found in runtime source.

Corrected audit finding:

- Raw `RETURNING` is now provider-owned in `src/db/adapters/sqlite-dialect-seams.js`. The four durable-job returned-row statements in `src/core/jobs/job-queue.js`, `src/core/jobs/job-runner.js`, and `src/services/jobs.service.js` were converted in 0.33.5.27.3 to use `transaction.dialect.returning.columns(...)`, so the later dialect guardrail should not add durable-job exceptions for them.

Out of scope for the original 0.33.5.23 parameter-binding slice:

- Runtime call-site rewrites outside the completed auth/workspace/permission conversion wave.
- Dialect portability implementation. 0.33.5.27.1 now records the seam decisions, 0.33.5.27.2 through 0.33.5.27.7 implement the SQLite-backed seams, and 0.40.0 remains the live PostgreSQL adapter/proof branch.
- Regression fixture SQL under `scripts/`.

## Conversion Plan

0.33.5.23.2 should land the named-to-positional binding layer and one small proof conversion. It should also decide the future of `sqlText()`, `sqlInteger()`, `sqlNullableText()`, and `sqlNullableInteger()`: deprecated compatibility helpers, param-emitting shims, or provider-gated escape hatches. Do not mass-convert the table above in that slice.

## 0.33.5.23.2 Proof Conversion

0.33.5.23.2 landed `src/db/parameter-bindings.js` as the shared named-to-positional binding layer. App-facing calls keep named params. SQLite consumes the same layer with positional `?` bindings, while the layer can emit `$n` placeholders for a future PostgreSQL adapter.

Decision for the literal helpers: `sqlText()`, `sqlInteger()`, `sqlNullableText()`, and `sqlNullableInteger()` remain deprecated compatibility escape hatches for unconverted literal SQL and no-parameter multi-statement startup/migration paths. They should not become param-emitting shims, and new or touched single-statement repository queries should use named params through `db.query(sql, params)`, `db.get(sql, params)`, or `db.run(sql, params)`.

Small proof conversion:

- `src/core/search/tag-text.js` moved from `sqlText()` interpolation to named params.

Current live burndown after that proof conversion:

- Remaining runtime literal-helper invocations after the proof conversion: 1,677.
- Remaining direct interpolated SQL operation sites after the proof conversion: 261.
- Existing direct bound-params operation sites after the proof conversion: 50.

The original 0.33.5.23.1 numeric baseline remains historical. The Inventory table above is the current canonical table and is updated in place as follow-up waves reduce helper/interpolated-site counts.

## 0.33.5.23.3 Conversion Wave

0.33.5.23.3 converted the auth/workspace/permission core wave from literal SQL interpolation to named bound params. This wave intentionally stayed smaller than the full audit inventory and covered these repositories:

- `src/repositories/users.repo.js`
- `src/repositories/workspaces.repo.js`
- `src/repositories/user-workspaces.repo.js`
- `src/repositories/permissions.repo.js`
- `src/repositories/settings.repo.js`
- `src/repositories/app-settings.repo.js`

The canonical Inventory table above now marks these six repositories as `Converted` with zero literal-helper/direct-interpolation sites. `sessions.repo` is not part of this converted wave; it was already a bound-params pilot before 0.33.5.23.3 and is tracked separately as `Already bound`.

Current live burndown after the conversion wave:

- Remaining runtime literal-helper invocations after the conversion wave: 1,499.
- Remaining direct interpolated SQL operation sites after the conversion wave: 233.
- Existing direct bound-params operation sites after the conversion wave: 91.
- Total runtime database operation calls seen by the scanner after the conversion wave: 407.

Remaining conversion waves still include Tasks and Time Tracking repositories, Notes, Lists, Files metadata, Notifications, Tags, Search/recovery helpers, Work Resume State, client/project repositories, admin/framework repositories, and low-count migration or startup compatibility paths. The active one-session assignments are the `0.33.5.27` table above; older coarse ordering should not be used to merge these waves back together.

Each wave should update this audit or a visible burndown with remaining literal-helper counts before closeout, then run the focused regression for the touched repository plus the normal release checks.

## 0.33.5.23.4 Closeout

0.33.5.23.4 closed the parameter-binding branch without changing the runtime SQL surface beyond the completed conversion wave. The active decision remains:

- `src/db/parameter-bindings.js` owns named-to-positional translation at the adapter boundary.
- App-facing repository code should use named params through `db.query(sql, params)`, `db.get(sql, params)`, and `db.run(sql, params)`.
- `sqlText()`, `sqlInteger()`, `sqlNullableText()`, and `sqlNullableInteger()` remain deprecated compatibility escape hatches for unconverted literal SQL and no-parameter multi-statement startup/migration paths; they should not become param-emitting shims.

Closeout confirmations:

- `scripts/parameter-binding-audit-regression.mjs`, `scripts/parameter-binding-layer-regression.mjs`, and `scripts/parameter-binding-conversion-wave-regression.mjs` are wired into the regression suite.
- The live roadmap now advances to 0.33.5.24, while the completed 0.33.5.23 branch details live in the roadmap archive.
- The final 0.33.5.23 branch burndown remains 1,499 runtime literal-helper invocations, 233 direct interpolated SQL operation sites, 91 existing bound operation sites, and 407 total runtime database operation calls seen by the scanner.

Further conversion waves and the dialect portability audit are future work. The 0.40.0 database-extraction branch should consume this recorded remaining inventory instead of treating 0.33.5.23 as fully removing every legacy helper call.

## 0.33.5.25.2 Quota-Bound Query Update

0.33.5.25.2 added one Files quota accounting read in `src/services/files.service.js` using named bound params. This is new quota enforcement behavior, not a reopened 0.33.5.23 conversion wave, and it keeps the remaining helper and direct-interpolation counts unchanged.

Current live audit totals after that quota query:

- Remaining runtime literal-helper invocations: 1,499.
- Remaining direct interpolated SQL operation sites: 233.
- Existing direct bound-params operation sites: 92.
- Total runtime database operation calls seen by the scanner: 408.

In compact form, the current live ratchet is 1,499 runtime literal-helper invocations, 233 direct interpolated SQL operation sites, 92 existing bound operation sites, and 408 total runtime database operation calls.

The current `services/files.service` row is 148 runtime literal-helper invocations, 27 direct interpolated operation sites, 1 existing bound operation site, and 31 runtime database operation calls. Future Files metadata conversion should consume that updated current row while preserving the Files storage, scan, preview, download, quarantine, attachment lifecycle, and quota behavior.

## 0.33.5.26.1 Array-Expansion Binding

0.33.5.26.1 added array-valued named parameter expansion to `src/db/parameter-bindings.js` so later repository conversion waves can replace variable-length `IN (...)` interpolation without inventing per-module placeholder builders.

Binding contract:

- Non-empty named arrays expand to the correct driver placeholder sequence.
- Dollar-style placeholders reuse a repeated named array as the same `$n` sequence and flatten the array once.
- SQLite/question-style placeholders duplicate values each time a repeated named array appears, because positional `?` placeholders cannot be reused by name.
- Empty arrays expand to `NULL`, keeping `column IN (:ids)` syntactically valid and fail-closed with no matching rows.
- Top-level positional parameter arrays keep their existing meaning and do not opt into nested list expansion.

This slice intentionally does not convert the high-traffic repositories listed in the inventory above. The live audit totals therefore remain 1,499 runtime literal-helper invocations, 233 direct interpolated SQL operation sites, 92 existing bound operation sites, and 408 runtime database operation calls. Dynamic bulk `VALUES (...)` row groups, including the SQLite search adapter upsert path, remain the separate 0.33.5.26.2 decision/proof slice.

## 0.33.5.26.2 Bulk VALUES Binding

0.33.5.26.2 supports dynamic bulk `VALUES (...)` row-group construction through `createBulkValuesBindings()` in `src/db/parameter-bindings.js`, re-exported for app-facing use from `src/core/database.js`. The helper builds named placeholder row groups plus scalar params for dynamic value sets; it does not parameterize identifiers, SQL fragments, conflict targets, sort clauses, operators, or backend-specific search syntax.

Contract:

- Callers pass rows, a static/allowlisted column-key list, and optionally a value mapping callback.
- The helper returns `{ sql, params }`, where `sql` can be embedded after `VALUES` in one parameterized statement.
- At least one row and one column are required. Empty input should be handled by the caller before issuing the write.
- Cell values are scalar database parameters. Nested arrays are rejected and remain reserved for named `IN (...)` list expansion only.
- Parameter names are generated from a validated prefix plus row/column indexes so repositories do not invent per-module row builders.

Proof conversion:

- `src/core/search/adapters/sqlite-search-adapter.js` now uses the helper for the canonical `search_index` upsert, replacing the dynamic joined literal row construction for that `VALUES (...)` statement.
- SQLite FTS maintenance in the same adapter remains on the existing compatibility path until the 0.33.5.27 search/dialect seam work moves backend search details behind a fuller provider seam.

The canonical Inventory table above records the current `core/search/adapters/sqlite-search-adapter` row as 40 runtime literal-helper invocations, 2 direct interpolated operation sites, 1 existing bound operation site, and 12 runtime database operation calls.

Current live audit totals after the bulk `VALUES` proof are 1,498 runtime literal-helper invocations, 233 direct interpolated SQL operation sites, 93 existing bound operation sites, and 409 total runtime database operation calls.

## 0.33.5.26.3 Inventory Canonicalization

0.33.5.26.3 made the Inventory table above the single source of truth for per-owner parameter-binding status. Future conversion waves should update that table in place, then use the historical wave sections only to describe what changed and what the live totals became.

The table now marks:

- Owners with remaining literal-helper/direct-interpolation sites as `Remaining`.
- The proof and converted wave owners as `Converted`.
- `sessions.repo` and the other zero-interpolation owners that predated the wave as `Already bound`.

The current live audit totals remain 1,498 runtime literal-helper invocations, 233 direct interpolated SQL operation sites, 93 existing bound operation sites, and 409 total runtime database operation calls.

## 0.33.5.26.4 Ratchet Checklist

0.33.5.26.4 added the Future Conversion Wave Ratchet Checklist above so later conversion waves have a short closeout reference for keeping the exact-equality audit ratchet, the canonical inventory, and shipped burndown notes synchronized.

The current live audit totals remain 1,498 runtime literal-helper invocations, 233 direct interpolated SQL operation sites, 93 existing bound operation sites, and 409 total runtime database operation calls.

## 0.33.5.27.1 Portability Contract and Dialect Seams

0.33.5.27.1 is a plan-only slice. It defines the single agnostic data-access contract, records the dialect seam decisions in `DECISIONS.md` and `docs/database.md`, reconciles the 0.40.0 scope as the future PostgreSQL implementation/proof branch, and assigns the remaining inventory owners to the 0.33.5.27 conversion waves above.

No runtime SQL behavior changed. The current live audit totals remain 1,498 runtime literal-helper invocations, 233 direct interpolated SQL operation sites, 93 existing bound operation sites, and 409 total runtime database operation calls.

## 0.33.5.27.2 Dialect Seam Scaffold

0.33.5.27.2 adds the SQLite-backed `db.dialect` seam scaffold and a focused proof harness for conflict writes, case-insensitive SQL, boolean mapping, timestamp math, FTS5 search lowering, JSON capability status, `RETURNING`/identity, `rowid`, and PRAGMA/introspection helpers.

No application repository conversion happened in this slice, and the helper/direct-interpolation burndown was intentionally unchanged. The 0.33.5.27.2 audit totals at that point were 1,498 runtime literal-helper invocations, 233 direct interpolated SQL operation sites, 93 existing bound operation sites, and 409 total runtime database operation calls.

## 0.33.5.27.3 Upsert/Conflict and Identity Seams

0.33.5.27.3 adds provider-neutral upsert/conflict statement builders to `db.dialect.conflict` and converts the low-risk startup role-permission repair in `src/db/index.js` to `databaseDialect.conflict.buildInsertOrIgnore(...)` with named params.

The durable-job `RETURNING` statements are converted to the provider returning seam through `transaction.dialect.returning.columns(...)` in `src/core/jobs/job-queue.js`, `src/core/jobs/job-runner.js`, and `src/services/jobs.service.js`. This is the explicit 0.33.5.27.3 durable-job outcome: conversion, not a sanctioned raw-dialect exception.

The helper/direct-interpolation burndown is unchanged at 1,498 runtime literal-helper invocations and 233 direct interpolated SQL operation sites. The startup proof path adds one existing bound operation site and one runtime database operation call, so the current live audit totals are 94 existing bound operation sites and 410 total runtime database operation calls.

## 0.33.5.27.4 Case-Insensitive Comparison and Ordering Seams

0.33.5.27.4 extends `db.dialect.comparison` with case-insensitive equality, ordering, escaped LIKE pattern construction, and case-insensitive LIKE matching helpers.

The `services/files.service` attachable-target option read is the proof path. It now keeps table and column identifiers behind the existing attachable-type metadata validation, binds workspace/filter/search/limit values through `db.query(...)`, uses `db.dialect.comparison.likePattern(...)` for user search text, and uses `db.dialect.comparison.containsNoCase(...)` / `orderByNoCase(...)` instead of local `LOWER(...) LIKE`, manual LIKE escaping, or raw `COLLATE NOCASE` at the call site.

This proof reduces `services/files.service` to 140 runtime literal-helper invocations, 26 direct interpolated SQL operation sites, 2 existing bound operation sites, and 31 runtime database operation calls. The current live audit totals are 1,490 runtime literal-helper invocations, 232 direct interpolated SQL operation sites, 95 existing bound operation sites, and 410 total runtime database operation calls.

## 0.33.5.27.5 Boolean and Timestamp/Interval Seams

0.33.5.27.5 extends `db.dialect.boolean` with logical bind/read field helpers and adds `db.dialect.time.elapsedSecondsSince(...)` as the converted-repository timestamp helper for elapsed interval math.

The `settings.repo` proof path uses `db.dialect.boolean.bindFields(...)` and `db.dialect.boolean.readFields(...)` for Workspace Settings boolean save/read mapping instead of owning SQLite `0` / `1` conversion at the repository call site. The `time-tracking/active-timers.repo` proof path converts the active timer pause elapsed-time updates to `db.run(...)` with named params and `db.dialect.time.elapsedSecondsSince(...)` instead of raw `julianday(...)` interval arithmetic in the repository.

This proof reduces `time-tracking/active-timers.repo` to 53 runtime literal-helper invocations, 10 direct interpolated SQL operation sites, 2 existing bound operation sites, and 12 runtime database operation calls. The current live audit totals are 1,481 runtime literal-helper invocations, 230 direct interpolated SQL operation sites, 97 existing bound operation sites, and 410 total runtime database operation calls.

## 0.33.5.27.6 Search/FTS Seam Extraction

0.33.5.27.6 moves backend search syntax ownership into the framework search adapter/service seam. The SQLite search adapter now consumes `db.dialect.search.createVirtualTable(...)`, `dropVirtualTable(...)`, `match(...)`, and `rank(...)` for FTS5 storage/read lowering and `db.dialect.comparison.likePattern(...)` / `containsNoCase(...)` for the indexed LIKE fallback path.

The `core/search/adapters/sqlite-search-adapter` proof path now binds canonical upserts, FTS sync/removal, FTS and fallback reads, and FTS repair statements through `db.run(...)`, `db.query(...)`, and transaction clients. Canonical `search_index` rows remain the source of truth; FTS rows remain lookup/ranking state rebuilt from canonical rows by adapter-owned repair.

This proof converts `core/search/adapters/sqlite-search-adapter` to zero runtime literal-helper invocations and zero direct interpolated SQL operation sites, with 13 existing bound operation sites and 17 runtime database operation calls. The current live audit totals are 1,441 runtime literal-helper invocations, 228 direct interpolated SQL operation sites, 109 existing bound operation sites, and 415 total runtime database operation calls.

## 0.33.5.27.7 PRAGMA, Rowid, and Introspection Boundary

0.33.5.27.7 moves the remaining non-startup runtime PRAGMA/introspection and physical identity spellings behind provider-owned seams before application repository conversion waves continue. The SQLite search adapter now reads compile options through `db.dialect.introspection.compileOptions(...)`; Files attachable-target table metadata reads use `db.dialect.introspection.tableInfo(...)`; and `users.repo` / `workspaces.repo` consume qualified `db.dialect.identity.rowId(...)` helpers for their existing duplicate-row and owner-transfer tie-breakers.

No repository conversion wave happened in this slice, and no helper/direct-interpolation burndown changed. The current live audit totals remain 1,441 runtime literal-helper invocations, 228 direct interpolated SQL operation sites, 109 existing bound operation sites, and 415 total runtime database operation calls.

## 0.33.5.27.8 Tasks Primary Repository Conversion

0.33.5.27.8 converts `tasks/tasks.repo` from literal-helper interpolation to named params through `db.query(...)` and `db.run(...)`, including task create/update writes, full workspace reads, batched `readByIds(...)` reads, assignee batch reads, recurrence instance lookup, due-window reads, reminder candidate reads, and `last_worked_at` updates. The converted task-id batch reads now use array-valued named params, and the repository consumes `db.dialect.comparison.orderByNoCase(...)` and `db.dialect.boolean.bind(...)` / `read(...)` for the dialect-sensitive title ordering and reminder override mapping it owns.

This wave converts `tasks/tasks.repo` to zero runtime literal-helper invocations and zero direct interpolated SQL operation sites, with 15 existing bound operation sites and 15 runtime database operation calls. The current live audit totals are 1,370 runtime literal-helper invocations, 221 direct interpolated SQL operation sites, 116 existing bound operation sites, and 415 total runtime database operation calls.

## 0.33.5.27.9 Task Checklist Repository Conversion

0.33.5.27.9 converts `tasks/task-checklists.repo` from literal-helper interpolation to named params through `db.query(...)`, `db.get(...)`, `db.run(...)`, and `db.transaction(callback)`. The conversion covers checklist task reads, batched progress reads, create/update writes, reorder writes, soft delete, and implicit next-sort-order reads.

The converted progress read uses array-valued named params for task-id batches, while checklist checked-state storage now binds and reads through `db.dialect.boolean`. Reorder writes now run through the provider-neutral transaction helper instead of a hand-composed `BEGIN TRANSACTION` script.

This wave converts `tasks/task-checklists.repo` to zero runtime literal-helper invocations and zero direct interpolated SQL operation sites, with 8 existing bound operation sites and 8 runtime database operation calls. The current live audit totals are 1,331 runtime literal-helper invocations, 215 direct interpolated SQL operation sites, 123 existing bound operation sites, and 415 total runtime database operation calls.

## 0.33.5.27.10 Task Relationships Repository Conversion

0.33.5.27.10 converts `tasks/task-relationships.repo` from literal-helper interpolation to named params through `db.query(...)`, `db.get(...)`, and `db.run(...)`. The conversion covers relationship create/update/remove writes, active pair reads, parent/child reads, blocking-child reads, recursive path checks, single-task summaries, and batched relationship summaries.

The converted batched summary read uses array-valued task-id params for both parent and child sides, while blocking state now binds and reads through `db.dialect.boolean`. Recursive path checks keep the same `WITH RECURSIVE` shape and now use the provider-neutral single-row read helper.

This wave converts `tasks/task-relationships.repo` to zero runtime literal-helper invocations and zero direct interpolated SQL operation sites, with 12 existing bound operation sites and 12 runtime database operation calls. The current live audit totals are 1,285 runtime literal-helper invocations, 204 direct interpolated SQL operation sites, 134 existing bound operation sites, and 415 total runtime database operation calls.

## 0.33.5.27.11 Task Recurrence and Reminders Repository Conversion

0.33.5.27.11 converts `tasks/task-recurrence.repo` and `tasks/task-reminders.repo` from literal-helper interpolation to named params through `db.query(...)`, `db.get(...)`, `db.run(...)`, and `db.transaction(callback)`. The conversion covers recurrence template create/update/read paths, template assignee replacement/reads, reminder offset reads, batched reminder target reads, and reminder offset replacement.

Template assignee replacement and reminder offset replacement now use provider-neutral transaction callbacks instead of hand-composed transaction scripts. Reminder target batch reads keep the existing target-pair OR shape but generate named params for every target pair, preserving task/project reminder offset grouping without interpolating values.

This wave converts `tasks/task-recurrence.repo` to zero runtime literal-helper invocations and zero direct interpolated SQL operation sites, with 6 existing bound operation sites and 6 runtime database operation calls. It also converts `tasks/task-reminders.repo` to zero runtime literal-helper invocations and zero direct interpolated SQL operation sites, with 4 existing bound operation sites and 4 runtime database operation calls. The current live audit totals are 1,218 runtime literal-helper invocations, 197 direct interpolated SQL operation sites, 144 existing bound operation sites, and 417 total runtime database operation calls.

## 0.33.5.27.12 Active Timers Repository Conversion

0.33.5.27.12 converts `time-tracking/active-timers.repo` from literal-helper interpolation to named params through `db.query(...)`, `db.get(...)`, and `db.run(...)`. The conversion covers manual and sourced active timer reads, slot reads, source reads, active timer upsert, timer removal, sourced timer removal, source existence checks, and manual slot compaction.

The active timer upsert now uses `db.dialect.conflict.buildInsertOnConflictDoUpdate(...)` for the existing `(workspace_id, user_id, timer_slot)` conflict behavior. Running timer pause flows keep the provider time seam through `db.dialect.time.elapsedSecondsSince(...)`, and manual timer reads preserve the source-module `NULL` filter instead of broadening sourced timer visibility.

This wave converts `time-tracking/active-timers.repo` to zero runtime literal-helper invocations and zero direct interpolated SQL operation sites, with 12 existing bound operation sites and 12 runtime database operation calls. The current live audit totals are 1,165 runtime literal-helper invocations, 187 direct interpolated SQL operation sites, 154 existing bound operation sites, and 417 total runtime database operation calls.

## 0.33.5.27.13 Time Entries Repository Conversion

0.33.5.27.13 converts `time-tracking/time-entries.repo` from literal-helper interpolation to named params through `db.query(...)`, `db.get(...)`, and `db.run(...)`. The conversion covers workspace entry reads, single-entry reads, project entry reads, create/update/remove writes, project-scope label updates, and project entry counts.

No additional dialect seam was required for this repository because the existing SQL uses static table/column names, text values, nullable text values, and integer duration binding without conflict, comparison, full-text, JSON, identity, rowid, PRAGMA, or interval expressions. The converted helpers preserve the previous required-text, nullable-text, and integer coercion behavior while moving values to named params.

This wave converts `time-tracking/time-entries.repo` to zero runtime literal-helper invocations and zero direct interpolated SQL operation sites, with 8 existing bound operation sites and 8 runtime database operation calls. The current live audit totals are 1,116 runtime literal-helper invocations, 180 direct interpolated SQL operation sites, 162 existing bound operation sites, and 417 total runtime database operation calls.

## 0.33.5.27.14 Notes Records and Filters Repository Conversion

0.33.5.27.14 converts the note record list/read/filter paths in `notes/notes.repo` to named params through `db.query(...)` and `db.get(...)` plus the dialect comparison seams, while leaving the remaining write, revision, linked-record, collection, and count paths for 0.33.5.27.15. The converted paths cover full note record list filters, detail reads, batched note-id reads, lightweight list read-model filters, collection-id array filters, owner search, context search, text search, ordering, and paging.

The converted list filters now use array-valued named params for `IN (:noteIds)` and `IN (:noteCollectionIds)`, plus `db.dialect.comparison.containsNoCase(...)`, `likePattern(...)`, and `orderByNoCase(...)` instead of raw `LOWER(...) LIKE` or `COLLATE NOCASE` in the touched record/filter paths. Secure/private list read-model behavior remains service-owned and unchanged: list projections stay body-light, secure placeholders stay closed, and permission pruning remains outside the repository SQL.

This wave reduces `notes/notes.repo` to 208 runtime literal-helper invocations and 14 direct interpolated SQL operation sites, with 4 existing bound operation sites and 21 runtime database operation calls. The current live audit totals are 1,112 runtime literal-helper invocations, 180 direct interpolated SQL operation sites, 163 existing bound operation sites, and 417 total runtime database operation calls.

## 0.33.5.27.15 Notes Writes, Revisions, Links, and Collections Repository Conversion

0.33.5.27.15 converts the remaining write, revision, linked-record, collection, and count paths to named params through `db.query(...)`, `db.get(...)`, `db.run(...)`, and `db.transaction(callback)`, so `notes/notes.repo` is fully converted. This completes the Notes repository conversion after the 0.33.5.27.14 read/filter slice.

The converted paths preserve note create/update persistence, create-with-staged-links transaction behavior, revision numbering and newest-first revision reads, link create/list/batch/read/remove lifecycle, target reads through the existing allowlisted direct-context columns, collection create/update/list/count behavior, nullable text trimming, integer fallback coercion, and plaintext secure-placeholder safety checks. Collection and target read ordering now use `db.dialect.comparison.orderByNoCase(...)` instead of raw `COLLATE NOCASE`, and batched link reads use array-valued named params.

This wave converts `notes/notes.repo` to zero runtime literal-helper invocations and zero direct interpolated SQL operation sites, with 21 existing bound operation sites and 21 runtime database operation calls. The current live audit totals are 904 runtime literal-helper invocations, 166 direct interpolated SQL operation sites, 180 existing bound operation sites, and 417 total runtime database operation calls.

## 0.33.5.27.16 Lists Records and Items Repository Conversion

0.33.5.27.16 converts the list record and item read/write paths in `lists/lists.repo` to named params through `db.query(...)`, `db.get(...)`, `db.run(...)`, and `db.transaction(callback)`, while leaving the remaining catalog and linked-record paths assigned to 0.33.5.27.17. The converted paths cover list filters, single and batched list reads, list create/update writes, item filters, single and batched item reads, item create/update writes, and item reordering.

The converted list reads use array-valued named params for `IN (:listIds)`, `db.dialect.comparison.orderByNoCase(...)` for title ordering, and `db.dialect.boolean.bind(...)` for reusable-list filters and writes. Item list batches also use array-valued named params, while item reorder writes now run through `db.transaction(callback)` with bound update statements. Nullable text trimming, integer fallback coercion, finite-number-or-null item field handling, list execution/progress behavior, and service-owned read shaping are unchanged.

This wave reduces `lists/lists.repo` to 72 runtime literal-helper invocations and 10 direct interpolated SQL operation sites, with 11 existing bound operation sites and 21 runtime database operation calls. The current live audit totals are 798 runtime literal-helper invocations, 159 direct interpolated SQL operation sites, 191 existing bound operation sites, and 417 total runtime database operation calls.

## 0.33.5.27.17 Lists Catalog and Linked Records Repository Conversion

0.33.5.27.17 converts the remaining catalog, catalog usage, linked-record, and batched linked-record paths in `lists/lists.repo` to named params through `db.query(...)`, `db.get(...)`, and `db.run(...)`, so `lists/lists.repo` is fully converted. This completes the Lists repository conversion after the 0.33.5.27.16 record/item slice.

The converted catalog paths preserve catalog create/update/read behavior, suggestion ranking, project/client/list-type context matching, archived-suggestion filtering, use-count increment behavior, nullable text trimming, integer fallback coercion, and finite-number-or-null catalog field handling. Catalog suggestion text matching and item-name ordering now route through `db.dialect.comparison`, and batched link reads use array-valued named params for `IN (:listIds)`. Link create/list/read/remove behavior, default `related` link roles, metadata parsing, permission-safe target enrichment inputs, source-list context inputs, and modal/editor payload behavior are unchanged.

This wave marks `lists/lists.repo` as converted with 0 runtime literal-helper invocations and 0 direct interpolated SQL operation sites, with 21 existing bound operation sites and 21 runtime database operation calls. The current live audit totals are 726 runtime literal-helper invocations, 149 direct interpolated SQL operation sites, 201 existing bound operation sites, and 417 total runtime database operation calls.

## 0.33.5.27.18 Files Browse and Attachment Reads Conversion

0.33.5.27.18 converts the Files browse/read metadata paths in `services/files.service`, covering Files browse, attachment list, visible attachment page, attachment count, preview access, download/read, attachment-by-id, file-row, and active-attachments-for-file metadata reads through named params with `db.query(...)` and `db.get(...)`. Filename search and filename/status ordering use `db.dialect.comparison`, while paged candidate reads bind limit and offset values.

This slice intentionally leaves File Context update/read paths, attachable-target option reads, readable target label/context reads, duplicate-context checks, and safe target lookup SQL assigned to 0.33.5.27.19. It does not change storage adapters, scanner adapters, streamed upload behavior, lifecycle semantics, preview rendering, download routing, or attachment visibility rules.

The live ratchet after this conversion is 709 runtime literal-helper invocations, 145 direct interpolated SQL operation sites, 206 existing bound operation sites, and 417 total runtime database operation calls.

## 0.33.5.27.19 Files Context and Attachable Targets Conversion

0.33.5.27.19 converts the File Context attachment update path, safe attachable-target lookup, readable target/context label reads, workspace-type read, attachable-target option context-label enrichment, and duplicate active attachment-context check in `services/files.service` to named params through `db.run(...)`, `db.get(...)`, and `db.query(...)`. Dynamic attachable target identifiers remain behind the existing attachable metadata validation, and Client/Project label enrichment uses array-valued named params.

This slice intentionally leaves attachment create/remove, file lifecycle writes, report/quarantine/review paths, workspace file settings, storage accounting, quota reads, and file record create/update paths assigned to 0.33.5.27.20. It does not change storage adapters, scanner adapters, streamed upload behavior, lifecycle semantics, preview rendering, download routing, route-backed File Context workflow, selector ordering, readable label fallbacks, or raw-ID label protections.

The live ratchet after this conversion is 687 runtime literal-helper invocations, 137 direct interpolated SQL operation sites, 214 existing bound operation sites, and 417 total runtime database operation calls.

## 0.33.5.27.20 Files Lifecycle, Settings, Quota, and Accounting Conversion

0.33.5.27.20 converts the remaining Files service database access in `services/files.service`, covering attachment removal, file record creation, file scan updates, attachment creation, delete/restore/review/quarantine lifecycle writes, report writes, workspace file settings reads/writes, internal and external storage accounting, and quota usage reads through named params with `db.run(...)`, `db.get(...)`, `db.query(...)`, and `db.transaction(...)`. Workspace file settings and external storage accounting upserts use `db.dialect.conflict`, and storage-accounting refresh plus report/quarantine writes keep their paired statements transaction-scoped.

`services/files.service` is fully converted in the canonical inventory at 0 runtime literal-helper invocations and 0 direct interpolated SQL operation sites. This slice preserves upload lifecycle, storage accounting, quota enforcement, report/review/quarantine semantics, audit/lifecycle events, scan state transitions, storage adapters, preview/download gates, route-backed File Context and Preview workflows, and attachment visibility behavior.

The live ratchet after this conversion is 586 runtime literal-helper invocations, 123 direct interpolated SQL operation sites, 231 existing bound operation sites, and 419 total runtime database operation calls.

## 0.33.5.27.21 Notifications Inbox and Lifecycle Conversion

0.33.5.27.21 converts the Notifications inbox and lifecycle persistence paths in `notifications.repo`, covering create, list/count, bell summary, read-by-id, mark-read, dismiss, archive, admin-recipient, and filter-option paths through named params with `db.run(...)`, `db.get(...)`, and `db.query(...)`. Notification filter option ordering now uses `db.dialect.comparison.orderByNoCase(...)`, and active/read-dismissed status groups use array-valued named params instead of inline `IN (...)` lists.

`notifications.repo` inbox and lifecycle paths are partially converted in the canonical inventory at 49 remaining runtime literal-helper invocations and 8 remaining direct interpolated SQL operation sites. The remaining preference/default/subscription paths stay assigned to 0.33.5.27.22. This slice preserves in-app notification display, unread counts, low-priority badge behavior, priority alert state, filtering, read/dismiss/archive lifecycle, recipient scoping, admin recipient resolution, and target decoration inputs.

The live ratchet after this conversion is 536 runtime literal-helper invocations, 111 direct interpolated SQL operation sites, 246 existing bound operation sites, and 419 total runtime database operation calls.

## 0.33.5.27.22 Notifications Preferences and Subscriptions Conversion

0.33.5.27.22 converts the remaining Notification preference and subscription persistence paths in `notifications.repo`, covering user preferences, display preferences, workspace defaults, follow subscription reads, target fan-out subscription reads, follow/unfollow writes, and preference/default/display upserts through named params with `db.query(...)`, `db.get(...)`, `db.run(...)`, and `db.transaction(...)`. Boolean preference/default storage uses `db.dialect.boolean.bind(...)`, regular preference/default/display upserts use `db.dialect.conflict.buildInsertOnConflictDoUpdate(...)`, and the subscription reactivation upsert uses the SQLite dialect's any-conflict upsert seam for the existing expression-index conflict shape.

`notifications.repo` is fully converted in the canonical inventory at 0 runtime literal-helper invocations and 0 direct interpolated SQL operation sites. This slice preserves per-user notification preferences, display grouping preferences, workspace defaults, follow/unfollow behavior, general and event-specific follow subscriptions, fan-out subscription inputs, actor/follower behavior, and disabled-default/user-muted notification delivery behavior.

The live ratchet after this conversion is 487 runtime literal-helper invocations, 103 direct interpolated SQL operation sites, 256 existing bound operation sites, and 419 total runtime database operation calls.

## 0.33.5.27.23 Tags Repository Conversion

0.33.5.27.23 converts `tags.repo` from literal-helper interpolation to named params through `db.query(...)`, `db.get(...)`, and `db.run(...)`. The conversion covers tag create/update/status writes, tag list/read/search paths, batched tag reads, assignment reads and writes, assignment removals, propagation-context reads, suppression reads/writes, and target suppression lists.

Tag search and tag/assignment ordering now use `db.dialect.comparison.likeNoCase(...)` and `orderByNoCase(...)`, batched tag and target reads use array-valued named params, and duplicate-tolerant assignment/suppression writes use `db.dialect.conflict.buildInsertOrIgnore(...)`. This slice preserves tag create/update/archive, tag list/read, assignment de-duplication, source-filtered assignment reads/removals, suppression uniqueness, propagation-context reads, and tag filter inputs.

`tags.repo` is fully converted in the canonical inventory at 0 runtime literal-helper invocations and 0 direct interpolated SQL operation sites.

The live ratchet after this conversion is 403 runtime literal-helper invocations, 86 direct interpolated SQL operation sites, 273 existing bound operation sites, and 419 total runtime database operation calls.

## 0.33.5.27.24 Tag Propagation and Tags Service Conversion

0.33.5.27.24 converts `services/tag-propagation-registry` and `services/tags.service` from literal-helper interpolation to named params through `db.query(...)` and `db.get(...)`. The conversion covers the built-in Client/Project/Task/Note propagation resolver reads, service-owned tag propagation count reads, and descriptor-backed target existence reads.

The tag propagation registry keeps the existing built-in resolver IDs and Client/Project/Task/Note SQL ownership in place for this branch; moving module-specific propagation SQL out of the framework registry remains assigned to 0.39.15.2. The converted `tags.service` target-read path still validates descriptor table/field identifiers through the existing allowlist before binding workspace and target values.

`services/tag-propagation-registry` and `services/tags.service` are fully converted in the canonical inventory at 0 runtime literal-helper invocations and 0 direct interpolated SQL operation sites. This slice preserves Client/Project/Task/Note propagation targets, resolver behavior, service-owned tag read shaping, propagated assignment materialization, repair count readouts, and tag target lookup behavior.

The live ratchet after this conversion is 367 runtime literal-helper invocations, 68 direct interpolated SQL operation sites, 291 existing bound operation sites, and 419 total runtime database operation calls.

## 0.33.5.27.25 Search Adapter and Rebuild Service Conversion

0.33.5.27.25 keeps the earlier `core/search/adapters/sqlite-search-adapter` and `core/search/tag-text` proof conversions in place and converts the remaining `services/search-index-rebuild.service` reads from literal-helper interpolation to named params through `db.query(...)`.

The converted rebuild service binds workspace, module, and record-type filters for inactive-row cleanup and stale canonical row reads while leaving rebuild flow ownership unchanged. The SQLite search adapter remains the provider-owned seam for FTS5 storage, FTS repair, ranking, and indexed LIKE fallback; search callers still send backend-neutral request models and canonical `search_index` rows remain the source of truth.

`services/search-index-rebuild.service` is converted in the canonical inventory at 0 runtime literal-helper invocations and 0 direct interpolated SQL operation sites. `core/search/adapters/sqlite-search-adapter` and `core/search/tag-text` remain converted with 0 helper and 0 direct interpolation sites. This slice preserves FTS5 maintenance, indexed LIKE fallback, adapter repair/rebuild behavior, stale-row cleanup, inactive-type cleanup, canonical `search_index` writes, and permission-safe search request shaping.

The live ratchet after this conversion is 362 runtime literal-helper invocations, 66 direct interpolated SQL operation sites, 293 existing bound operation sites, and 419 total runtime database operation calls.
