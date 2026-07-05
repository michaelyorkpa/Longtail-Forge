# SQL Parameter-Binding Audit

Version 0.33.5.23.1 is a plan-only audit for the SQL parameter-binding migration. It does not change runtime database behavior.

## Scope

Runtime source scan:

- Included: `src/**/*.js` and `src/**/*.mjs`.
- Excluded: `scripts/` regression fixtures, generated/runtime data, and the helper definitions in `src/db/sql-literals.js`.
- Counted literal-helper invocations: `sqlText()`, `sqlInteger()`, `sqlNullableText()`, and `sqlNullableInteger()` used outside the helper definition file.
- Counted direct interpolated SQL operation sites: `db.query/get/run`, `transaction.query/get/run`, `querySql`, `getSql`, and `runSql` calls whose call expression directly contains one of the literal helpers.
- Counted existing direct bound-params operation sites: the same operation calls with a second `params` argument.

Totals as of 0.33.5.23.1:

- Total runtime literal-helper invocations: 1,680.
- Total direct interpolated SQL operation sites: 262.
- Existing direct bound-params operation sites: 49.
- Total runtime database operation calls seen by the audit scanner: 399.

The operation-site number is intentionally smaller than the helper-invocation count because one SQL statement can interpolate many values.

## Inventory

| Owner | Literal-helper invocations | Direct interpolated operation sites | Existing bound operation sites | Runtime database operation calls |
| --- | ---: | ---: | ---: | ---: |
| notes/notes.repo | 212 | 14 | 3 | 21 |
| lists/lists.repo | 178 | 17 | 0 | 21 |
| services/files.service | 148 | 27 | 0 | 30 |
| notifications.repo | 99 | 20 | 0 | 25 |
| db/index | 99 | 19 | 0 | 34 |
| tags.repo | 84 | 17 | 0 | 17 |
| users.repo | 78 | 13 | 0 | 16 |
| tasks/tasks.repo | 71 | 7 | 8 | 15 |
| time-tracking/active-timers.repo | 62 | 12 | 0 | 12 |
| client-projects/clients.repo | 60 | 5 | 0 | 7 |
| services/work-resume-state.service | 53 | 7 | 0 | 7 |
| client-projects/projects.repo | 49 | 7 | 0 | 8 |
| time-tracking/time-entries.repo | 49 | 7 | 0 | 8 |
| tasks/task-recurrence.repo | 49 | 5 | 0 | 5 |
| tasks/task-relationships.repo | 46 | 11 | 1 | 12 |
| core/search/adapters/sqlite-search-adapter | 41 | 2 | 0 | 11 |
| tasks/task-checklists.repo | 39 | 6 | 1 | 8 |
| services/tag-propagation-registry | 32 | 15 | 0 | 15 |
| permissions.repo | 30 | 4 | 0 | 7 |
| workspaces.repo | 30 | 1 | 6 | 7 |
| core/modules/modules.service | 29 | 6 | 0 | 9 |
| audit-logs.repo | 28 | 3 | 0 | 10 |
| api-keys.repo | 20 | 8 | 0 | 8 |
| settings.repo | 19 | 3 | 0 | 3 |
| db/migrations | 18 | 8 | 0 | 24 |
| tasks/task-reminders.repo | 18 | 2 | 0 | 3 |
| user-workspaces.repo | 16 | 6 | 0 | 7 |
| services/search-index-rebuild.service | 5 | 2 | 0 | 2 |
| services/work-resume-state-initial-producers | 5 | 2 | 0 | 2 |
| app-settings.repo | 5 | 1 | 0 | 3 |
| services/tags.service | 4 | 3 | 0 | 3 |
| core/search/tag-text | 3 | 1 | 0 | 1 |
| services/help.service | 1 | 1 | 0 | 1 |
| sessions.repo | 0 | 0 | 8 | 8 |
| core/jobs/job-runner | 0 | 0 | 4 | 4 |
| services/jobs.service | 0 | 0 | 4 | 4 |
| core/jobs/job-queue | 0 | 0 | 3 | 3 |
| db/provider | 0 | 0 | 6 | 6 |
| db/sqlite | 0 | 0 | 2 | 6 |
| db/sqlite-adapter | 0 | 0 | 2 | 2 |
| tasks/task-jobs.service | 0 | 0 | 1 | 2 |

## Scope Rechecks

Confirmed non-issues for this parameter-binding slice:

- No SQLite JSON SQL functions were found in runtime source.
- No top-level `UPDATE` or `DELETE` statements with `LIMIT` or `OFFSET` were found in runtime source.

Corrected audit finding:

- `RETURNING` is present in four durable-job statements: `src/core/jobs/job-queue.js`, `src/core/jobs/job-runner.js`, and `src/services/jobs.service.js`. This is not part of the 0.33.5.23 parameter-binding conversion. It belongs with the 0.40.0 dialect portability audit because SQLite and PostgreSQL both support `RETURNING`, but the exact statement shapes should still be reviewed with the future adapter.

Out of scope for this slice and still deferred to 0.40.0:

- SQLite-vs-PostgreSQL dialect portability beyond the corrected `RETURNING` note, including `INSERT OR IGNORE`, `COLLATE NOCASE`, PRAGMA usage, FTS5, boolean storage, `julianday(...)`, `rowid`, and read-modify-write serialization.
- Regression fixture SQL under `scripts/`.
- Rewriting runtime call sites.

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

The table above remains the 0.33.5.23.1 inventory snapshot. 0.33.5.23.3 should consume the current live burndown and continue reducing the remaining helper/interpolated-site counts in explicit waves.

## 0.33.5.23.3 Conversion Wave

0.33.5.23.3 converted the auth/workspace/permission core wave from literal SQL interpolation to named bound params. This wave intentionally stayed smaller than the full audit inventory and covered these repositories:

- `src/repositories/users.repo.js`
- `src/repositories/workspaces.repo.js`
- `src/repositories/user-workspaces.repo.js`
- `src/repositories/permissions.repo.js`
- `src/repositories/settings.repo.js`
- `src/repositories/app-settings.repo.js`

Converted wave rows in the current runtime audit:

| Owner | Literal-helper invocations | Direct interpolated operation sites | Existing bound operation sites | Runtime database operation calls |
| --- | ---: | ---: | ---: | ---: |
| users.repo | 0 | 0 | 17 | 17 |
| workspaces.repo | 0 | 0 | 10 | 10 |
| permissions.repo | 0 | 0 | 8 | 10 |
| user-workspaces.repo | 0 | 0 | 6 | 7 |
| settings.repo | 0 | 0 | 4 | 4 |
| app-settings.repo | 0 | 0 | 2 | 3 |

Current live burndown after the conversion wave:

- Remaining runtime literal-helper invocations after the conversion wave: 1,499.
- Remaining direct interpolated SQL operation sites after the conversion wave: 233.
- Existing direct bound-params operation sites after the conversion wave: 91.
- Total runtime database operation calls seen by the scanner after the conversion wave: 407.

Remaining conversion waves still include Tasks and Time Tracking repositories, Notes, Files metadata, Notifications, Tags, Search/recovery helpers, Work Resume State, client/project repositories, admin/framework repositories, and low-count migration or startup compatibility paths.

Further conversion waves should continue in this order:

1. Auth, workspace, and permission core is converted as of 0.33.5.23.3: `sessions.repo`, `users.repo`, `workspaces.repo`, `user-workspaces.repo`, `permissions.repo`, `settings.repo`, and `app-settings.repo`. Include `db/index` startup maintenance only after the layer supports the needed compatibility shape for multi-statement startup repairs.
2. Tasks and time-sensitive work: `tasks/tasks.repo`, `task-checklists.repo`, `task-relationships.repo`, `task-recurrence.repo`, `task-reminders.repo`, and the Time Tracking repositories. Preserve existing task read/list behavior and recurrence/reminder job semantics.
3. Notes: convert `notes/notes.repo` after Tasks because it has the largest single repository count and secure/private/read-model shaping needs focused regression coverage.
4. Files metadata: convert `services/files.service` without changing storage, scan, preview, download, quarantine, or attachment lifecycle behavior.
5. Notifications, tags, search, and resume helpers: convert `notifications.repo`, `tags.repo`, tag propagation, search adapter/tag-text helpers, and resume-state services once the high-traffic workflow modules are stable.
6. Remaining low-count framework/admin paths: audit logs, API keys, Help, module registry reads, and migration-maintenance paths. Keep migration files and multi-statement schema repair on the documented no-parameter compatibility path unless a later slice explicitly changes that contract.

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
