# SQL Parameter-Binding Audit

This document started as the 0.33.5.23.1 plan-only SQL parameter-binding audit and now tracks the live parameter-binding burndown. Audit-doc updates do not change runtime database behavior by themselves.

## Scope

Runtime source scan:

- Included: `src/**/*.js` and `src/**/*.mjs`.
- Excluded: `scripts/` regression fixtures, generated/runtime data, and the helper definitions in `src/db/sql-literals.js`.
- Counted literal-helper invocations: `sqlText()`, `sqlInteger()`, `sqlNullableText()`, and `sqlNullableInteger()` used outside the helper definition file.
- Counted direct interpolated SQL operation sites: `db.query/get/run`, `transaction.query/get/run`, `querySql`, `getSql`, and `runSql` calls whose call expression directly contains one of the literal helpers.
- Counted existing direct bound-params operation sites: the same operation calls with a second `params` argument.

Current totals as of 0.33.5.27.3:

- Remaining runtime literal-helper invocations: 1,498.
- Remaining direct interpolated SQL operation sites: 233.
- Existing direct bound-params operation sites: 94.
- Total runtime database operation calls seen by the audit scanner: 410.

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
| notes/notes.repo | Remaining | 212 | 14 | 3 | 21 |
| lists/lists.repo | Remaining | 178 | 17 | 0 | 21 |
| services/files.service | Remaining | 148 | 27 | 1 | 31 |
| notifications.repo | Remaining | 99 | 20 | 0 | 25 |
| db/index | Remaining | 99 | 19 | 1 | 35 |
| tags.repo | Remaining | 84 | 17 | 0 | 17 |
| tasks/tasks.repo | Remaining | 71 | 7 | 8 | 15 |
| time-tracking/active-timers.repo | Remaining | 62 | 12 | 0 | 12 |
| client-projects/clients.repo | Remaining | 60 | 5 | 0 | 7 |
| services/work-resume-state.service | Remaining | 53 | 7 | 0 | 7 |
| client-projects/projects.repo | Remaining | 49 | 7 | 0 | 8 |
| time-tracking/time-entries.repo | Remaining | 49 | 7 | 0 | 8 |
| tasks/task-recurrence.repo | Remaining | 49 | 5 | 0 | 5 |
| tasks/task-relationships.repo | Remaining | 46 | 11 | 1 | 12 |
| core/search/adapters/sqlite-search-adapter | Remaining | 40 | 2 | 1 | 12 |
| tasks/task-checklists.repo | Remaining | 39 | 6 | 1 | 8 |
| services/tag-propagation-registry | Remaining | 32 | 15 | 0 | 15 |
| core/modules/modules.service | Remaining | 29 | 6 | 0 | 9 |
| audit-logs.repo | Remaining | 28 | 3 | 0 | 10 |
| api-keys.repo | Remaining | 20 | 8 | 0 | 8 |
| db/migrations | Remaining | 18 | 8 | 0 | 24 |
| tasks/task-reminders.repo | Remaining | 18 | 2 | 0 | 3 |
| services/search-index-rebuild.service | Remaining | 5 | 2 | 0 | 2 |
| services/work-resume-state-initial-producers | Remaining | 5 | 2 | 0 | 2 |
| services/tags.service | Remaining | 4 | 3 | 0 | 3 |
| services/help.service | Remaining | 1 | 1 | 0 | 1 |
| core/search/tag-text | Converted | 0 | 0 | 1 | 1 |
| users.repo | Converted | 0 | 0 | 17 | 17 |
| workspaces.repo | Converted | 0 | 0 | 10 | 10 |
| permissions.repo | Converted | 0 | 0 | 8 | 10 |
| user-workspaces.repo | Converted | 0 | 0 | 6 | 7 |
| settings.repo | Converted | 0 | 0 | 4 | 4 |
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

0.33.5.27.1 records the portability contract and assigns every remaining owner in the Inventory table to a one-session implementation wave. The wave assignment does not change runtime SQL behavior or the burndown totals. Roadmap slices `0.33.5.27.2` through `0.33.5.27.7` are seam implementation/proof slices; they should update this audit only for deliberate proof call-site conversions.

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
