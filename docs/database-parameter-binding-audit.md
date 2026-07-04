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

0.33.5.23.3 should consume this audit as conversion waves. Suggested order:

1. Auth, workspace, and permission core: `sessions.repo` is already bound, then convert remaining `users.repo`, `workspaces.repo`, `user-workspaces.repo`, `permissions.repo`, `settings.repo`, and `app-settings.repo` paths. Include `db/index` startup maintenance only after the layer supports the needed compatibility shape for multi-statement startup repairs.
2. Tasks and time-sensitive work: `tasks/tasks.repo`, `task-checklists.repo`, `task-relationships.repo`, `task-recurrence.repo`, `task-reminders.repo`, and the Time Tracking repositories. Preserve existing task read/list behavior and recurrence/reminder job semantics.
3. Notes: convert `notes/notes.repo` after Tasks because it has the largest single repository count and secure/private/read-model shaping needs focused regression coverage.
4. Files metadata: convert `services/files.service` without changing storage, scan, preview, download, quarantine, or attachment lifecycle behavior.
5. Notifications, tags, search, and resume helpers: convert `notifications.repo`, `tags.repo`, tag propagation, search adapter/tag-text helpers, and resume-state services once the high-traffic workflow modules are stable.
6. Remaining low-count framework/admin paths: audit logs, API keys, Help, module registry reads, and migration-maintenance paths. Keep migration files and multi-statement schema repair on the documented no-parameter compatibility path unless a later slice explicitly changes that contract.

Each wave should update this audit or a visible burndown with remaining literal-helper counts before closeout, then run the focused regression for the touched repository plus the normal release checks.
