# Longtail Forge Roadmap

This file is the detailed per-version changelog and forward plan for Longtail Forge. README.md should stay cursory and point here for version-level detail.

## Archived Roadmap History

Completed 0.33.5.17, 0.33.5.18, 0.33.5.19, and 0.33.5.20 work is archived in `ROADMAP-ARCHIVE.md`.

Completed 0.33.5.18.6.1 through 0.33.5.18.6.11 are archived.
Completed 0.33.5.18.11.1 through 0.33.5.18.11.13 are archived.
Completed 0.33.5.18.12.1 through 0.33.5.18.12.7 are archived.
Completed 0.33.5.18.13.1 through 0.33.5.18.13.3 are archived.
Completed 0.33.5.18.14.1 is archived.
Completed 0.33.5.18.14.2 is archived.
Completed 0.33.5.18.14.3 is archived.
Completed 0.33.5.18.14.4 is archived.
Completed 0.33.5.18.14.5 is archived.
Completed 0.33.5.18.15 is archived.
Completed 0.33.5.19 runtime configuration and SQLite small-office foundation work is archived in `ROADMAP-ARCHIVE.md`.
Completed 0.33.5.20 bounded queries and small-office scale data work is archived in `ROADMAP-ARCHIVE.md`.

The active roadmap continues with durable jobs and outbox foundation work.

## Version 0.33.5.21 - Durable Jobs and Outbox Foundation

Purpose:

Add a SQLite-compatible background job/outbox system that works simply in self-hosted mode and can evolve into a separate worker model for hosted SaaS.

Decision:

Jobs are Node-side work stored in database tables. SQL stores job state; Node workers perform the work.

SQLite mode may run jobs inline or through at most one local worker process attached to the same local install.
PostgreSQL/SaaS mode should run one or more separate worker processes and may scale into a worker fleet.

Entry contract from 0.33.5.19: use the provider-neutral transaction helper for atomic job/outbox writes and consume the reserved worker runtime config names without requiring a separate worker in SQLite mode.

### Version 0.33.5.21.0 - In-process SQLite driver (better-sqlite3)

Decision (recorded in `DECISIONS.md`): replace the `sqlite3` CLI shell-out with the in-process `better-sqlite3` driver behind the existing `src/db/provider.js` adapter before durable jobs, streamed uploads, and the PostgreSQL adapter build on it. `better-sqlite3` was chosen over `node:sqlite` for its stable API, bundled/consistent SQLite version across installs (guaranteed FTS5 and `RETURNING`), and no experimental-flag or Node-floor requirement, accepting a native/compiled dependency as the tradeoff. Revisit `node:sqlite` once it is no longer experimental.

Historical scope note: before 0.33.5.21.0.2, the only code that touched the `sqlite3` CLI was `src/db/sqlite.js` (`spawn(config.sqliteCommand, ...)`), so the swap was contained but not small. The in-scope database-mechanism files are `src/db/sqlite.js`, `src/db/adapters/sqlite-adapter.js`, `src/db/provider.js`, `src/db/index.js`, and `src/db/migrations.js`. Repositories and module services should not change, because the `db.query/get/run/transaction/health/capabilities` contract stays stable.

Reslice evaluation: as originally written, 0.33.5.21.0 bundled dependency/native install risk, a database driver swap, parameter semantics, transaction behavior, migration script routing, diagnostics, docs, and full verification into one oversized slice. Split it into the sub-slices below so each pass has one main blast radius and can be closed independently before durable job schema/worker work begins.

#### Version 0.33.5.21.0.1 - better-sqlite3 dependency and install readiness

- [x] Add `better-sqlite3` to `package.json` and update `package-lock.json`.
- [x] Verify the selected release installs on the current Windows development Node runtime and record the minimum supported Node version implied by that release.
- [x] Add a small install/runtime smoke check that opens a disposable database and proves the bundled SQLite has FTS5 and `RETURNING`.
- [x] Document the native dependency fallback for developers/operators who compile from source, including Python plus a C++ toolchain / Visual Studio Build Tools on Windows.

Acceptance criteria:

- [x] `npm install` has captured the native dependency in the lockfile.
- [x] A disposable smoke check proves `better-sqlite3` can load and expose the SQLite features the app depends on.
- [x] No application database behavior changes yet; the `sqlite3` CLI helper may still be active until 0.33.5.21.0.2.

#### Version 0.33.5.21.0.2 - In-process SQLite helper core

- [x] Replace the `src/db/sqlite.js` spawn/marker/idle-close implementation with one long-lived `better-sqlite3` connection to `config.databaseFile`.
- [x] Keep the existing exported helper names (`querySql`, `runSql`, `closeSqlite`, `initializeSqliteRuntime`, health helpers, and SQL literal exports) so `src/db/adapters/sqlite-adapter.js`, `src/db/provider.js`, and `src/db/index.js` continue to load without caller changes.
- [x] Route already-interpolated string SQL through the driver with `prepare().all()` for single read statements and `exec()` for multi-statement scripts.
- [x] Apply startup PRAGMAs through the driver: foreign keys on, configured journal mode/WAL, and busy timeout.
- [x] Preserve database-file writability checks, last-health caching, and `formatSqliteHealth()` output shape.

Acceptance criteria:

- Normal app startup, fresh database creation, baseline adoption, and existing string-SQL regressions run through `better-sqlite3` without shelling out to the `sqlite3` CLI.
- `sqlText`/`sqlInteger`/`sqlNullableText`/`sqlNullableInteger` remain the compatibility path for existing interpolated statements.
- Health output still reports provider, database file, writable state, foreign-key state, journal mode, and busy timeout.

#### Version 0.33.5.21.0.3 - Driver-native parameter binding and value coercion

- [x] Move adapter parameter handling away from `expandSqlParameters()` literal inlining and bind named parameters through `better-sqlite3`.
- [x] Preserve the async app-facing adapter API for `db.query`, `db.get`, and `db.run` so `src/core/database.js` and callers do not change.
- [x] Normalize driver-bound values to match the old literal path where needed: booleans to `0/1`, `Date` values to ISO strings, and `undefined` to `null`.
- [x] Reject missing, unknown, or invalid named parameters clearly.
- [x] Keep no-parameter and multi-statement compatibility paths for the unconverted SQL that already uses `sqlText` and related helpers.

Acceptance criteria:

- Parameterized single-statement adapter calls use real driver bindings instead of interpolated SQL literals.
- Existing pilot parameterized repositories and existing compatibility string-SQL callers both pass.
- Focused regression coverage proves boolean, `Date`, `undefined`/`null`, missing-parameter, and unknown-parameter behavior.

#### Version 0.33.5.21.0.4 - Transaction and migration fidelity

- [x] Preserve `db.transaction(callback)` semantics, including the transaction client shape and the existing "use the transaction client inside a transaction" guard.
- [x] Retire the global adapter `operationChain` only after the in-process synchronous call path is stable.
- [x] Ensure migration, baseline, and repair scripts that already embed `BEGIN ... COMMIT` are routed through the multi-statement `exec()` path instead of being wrapped in a second transaction.
- [x] Preserve the migration lock, baseline checksum validation, future migration checksum validation, and schema-repair flows.
- [x] Verify rollback behavior and nested-transaction rejection through the existing transaction helper regression.

Acceptance criteria:

- Fresh baseline, existing database adoption, legacy repair paths, future migration application, and transaction helper regressions keep their current behavior.
- No nested transaction is opened around migration scripts that already contain their own transaction block.
- `db.transaction(callback)` remains available and provider-neutral for job/outbox work.

#### Version 0.33.5.21.0.5 - Result fidelity, diagnostics, and SQLite-mode worker decision

- [x] Verify returned row shapes and column/alias keys match current expectations with native driver result rows.
- [x] Confirm value types remain safe for current callers, especially booleans stored as `0/1`, `null`, `Buffer`, and large integers; decide and document whether `safeIntegers` is unnecessary for the current TEXT-key schema.
- [x] Update the SQLite capability label from `adapter: "sqlite-process"` to `adapter: "better-sqlite3"` while preserving the rest of the capability shape.
- [x] Preserve `/api/runtime-diagnostics` database health fields and redaction behavior.
- [x] Resolve the SQLite worker-mode boundary before 0.33.5.21.2: document whether SQLite small-office mode supports inline only or one app process plus one local worker process, and keep the "no multiple app servers / no worker fleet" rule explicit.

Acceptance criteria:

- Adapter contract and runtime diagnostics regressions pass with the new `better-sqlite3` capability label.
- FTS5 search still works through `MATCH`/`bm25()`.
- The SQLite worker-mode boundary is reconciled across `DECISIONS.md`, `docs/sqlite-small-office-mode.md`, and the future worker slices.

#### Version 0.33.5.21.0.6 - CLI retirement docs and driver-swap closeout

- [x] Remove or mark `SQLITE_COMMAND` as legacy/ignored in active runtime configuration now that normal operation no longer shells out to `sqlite3`.
- [x] Update `.env.example`, `docs/runtime-configuration.md`, `docs/database.md`, and any self-hosting/setup docs that still instruct operators to install the `sqlite3` CLI.
- [x] Update `CHANGELOG.md`, version metadata, and roadmap bookkeeping for the completed driver swap.
- [x] Run `npm run check`, `npm run test:permissions`, `PRAGMA integrity_check`, and a targeted FTS5 search spot-check after the full swap.
- [x] Restart the local app server if needed and verify `/api/app-info` reports the expected version.

Acceptance criteria:

- All database access runs through the in-process `better-sqlite3` driver behind the existing adapter contract, with no `sqlite3` CLI shell-out in normal operation.
- Docs and runtime configuration no longer present the CLI as an active dependency.
- Full verification passes and the branch is safe to use as the entry point for 0.33.5.21.1 job/outbox schema and 0.33.5.21.2 worker runner work.

Notes for the implementer (already checked, no re-investigation needed):

- The `sqlite3` CLI is only used in `src/db/sqlite.js`; no `scripts/*` shell out to it, so nothing outside the database layer needs changing for the CLI removal.
- No repository or service inspects database error text (stderr strings such as "UNIQUE constraint"), so moving to `better-sqlite3` `SqliteError` objects does not silently break error handling. Add `SqliteError.code` handling only where a typed error branch is deliberately wanted.

Gate: do not start 0.33.5.21.2 worker runner work until this driver swap is complete.

### Version 0.33.5.21.1 - Job/outbox schema

- [x] Add job/outbox tables compatible with SQLite:
  - [x] `job_id`
  - [x] `workspace_id`
  - [x] `job_type`
  - [x] `dedupe_key`
  - [x] `payload_json`
  - [x] `status`
  - [x] `priority`
  - [x] `available_at`
  - [x] `attempt_count`
  - [x] `max_attempts`
  - [x] `locked_at`
  - [x] `locked_by`
  - [x] `last_error`
  - [x] `created_at`
  - [x] `updated_at`
  - [x] `completed_at`
  - [x] `dead_at`
- [x] Add indexes for pending work by status/available time.
- [x] Add dedupe behavior where appropriate.
- [x] Add docs explaining:
  - [x] Pending.
  - [x] Running/locked.
  - [x] Completed.
  - [x] Failed/retry.
  - [x] Dead-letter.
- [x] Ship job/outbox tables as a new versioned core migration under `src/db/migrations/` (checksum-validated), not as an edit to the frozen `current.sql` baseline.

Acceptance criteria:

- [x] SQLite can store durable background work.
- [x] The schema is portable to PostgreSQL later.

### Version 0.33.5.21.2 - Worker runner v1

- [x] Add a Node worker runner.
- [x] Support modes:
  - [x] `inline` for simple SQLite self-hosting.
  - [x] `separate` for `node worker.js`.
  - [x] `disabled` for tests/admin troubleshooting.
- [x] Worker should:
  - [x] Poll for available jobs.
  - [x] Claim one or more jobs.
  - [x] Run registered job handlers.
  - [x] Mark jobs complete.
  - [x] Retry failed jobs with backoff.
  - [x] Move exhausted jobs to dead-letter state.
- [x] Add worker health/status output.
- [x] Add graceful shutdown.
- [x] Define exactly what triggers `inline` mode execution (in-process poll timer vs post-response drain) and document that in-process polling shares the SQLite serial queue with request handling.
- [x] Define how time-scheduled jobs (`available_at` in the future) are woken in inline mode, since SQLite mode has no always-on external scheduler.
- [x] Define migration/startup ownership for worker processes: a `separate` worker must verify schema readiness and must not independently run migrations or contend for the migration lock.
- [x] Implement the 0.33.5.21.0.5 SQLite boundary for `separate` worker mode: at most one local worker process attached to the same SQLite install, no extra app server, no worker fleet, and no independent migration ownership.

Acceptance criteria:

- [x] SQLite installs can run jobs without extra infrastructure.
- [x] Future SaaS can run workers separately from web processes.

### Version 0.33.5.21.3 - Job claiming, locking, retry, and dead-letter behavior

- [x] Implement safe job claiming.
  - [x] Define the SQLite-safe claim strategy explicitly: SQLite has no `FOR UPDATE SKIP LOCKED`, so claiming is an atomic conditional `UPDATE ... WHERE job_id = (SELECT ... LIMIT n)` run inside `db.transaction(...)`, then a read-back of claimed rows.
  - [x] Use `RETURNING` for the claim read-back: the bundled `better-sqlite3` SQLite supports it (verified by the 0.33.5.21.0.1 install smoke check), so no claim-then-reselect fallback is required; `RETURNING` is simply new to this codebase and needs coverage.
- [x] Add lock timeout handling.
- [x] Add retry backoff.
- [x] Add max-attempt handling.
- [x] Add dead-letter state.
- [x] Add admin-readable job failure summaries.
- [x] Add a minimal permission-checked admin readout for pending/running/dead-letter job counts and recent failures, reusing the bounded-pagination envelope from 0.33.5.20.5. A dead-letter state with no visibility is not acceptable.
- [x] Add regression coverage:
  - [x] Failed job retries.
  - [x] Exhausted job becomes dead.
  - [x] Locked job is not claimed twice.
  - [x] Expired lock can be reclaimed.

Acceptance criteria:

- [x] A failed notification/indexing/scanning job does not block the system forever.

### Version 0.33.5.21.4 - Move search indexing to jobs

- [x] Add job type for search indexing.
- [x] Queue search-index jobs from create/update/archive/restore flows.
- [x] Preserve immediate user-facing save behavior.
- [x] Add synchronous fallback for tests or SQLite inline mode if needed.
- [x] Remove full app-wide search rebuild from normal web startup or gate it behind explicit maintenance mode.
- [x] Add admin/manual search rebuild job.
- [x] Define the empty-index transition: fresh installs and restored databases currently rely on the startup rebuild (`src/core/app.js` `scheduleStartupSearchIndexRebuild`); once it is removed, provide an explicit rebuild-on-empty or documented post-restore rebuild path so search is not silently empty.
- [x] Add regressions proving:
  - [x] Record writes queue search jobs.
  - [x] Worker updates search index.
  - [x] Failed indexing jobs retry.
  - [x] Startup does not launch duplicate full-app rebuilds in normal mode.

Acceptance criteria:

- [x] Search indexing becomes durable background work.

### Version 0.33.5.21.5 - Move notification fan-out to jobs

- [x] Add job type for notification event processing.
- [x] Store notification-producing events in the outbox.
- [x] Worker resolves recipients and creates notification records.
- [x] Preserve permission checks.
- [x] Preserve module-enabled checks.
- [x] Add regressions proving:
  - [x] Notification jobs are queued.
  - [x] Recipients are resolved by worker.
  - [x] Disabled modules do not create new notifications.
  - [x] Failed fan-out jobs retry safely.

Acceptance criteria:

- [x] Notifications no longer depend only on in-process event handlers.

### Version 0.33.5.21.6 - Move reminders, recurrence, and file scanning to jobs

- [x] Add job handlers for:
  - [x] Task reminders.
  - [x] Recurrence generation.
  - [x] File scanning.
  - [x] Future imports.
- [x] Keep SQLite inline mode simple.
- [x] Ensure jobs are idempotent where practical.
- [x] Note that task reminders have no delivery mechanism today (only offset policy + read-time computation in `src/modules/tasks/task-reminders.service.js`); this slice introduces scheduled reminder firing, not a migration of existing background work.
- [x] Preserve per-user/workspace timezone correctness for fired reminders and account for web/worker clock skew when reminders run in a separate worker.
- [x] Add admin docs for worker mode.
- [x] Add regressions for each job type.

Acceptance criteria:

- [x] Time-sensitive and slow work has a durable background path.

### Version 0.33.5.21.7 - Durable jobs hardening and follow-ups

Purpose:

Close the residual gaps surfaced while landing 0.33.5.21.1 through 0.33.5.21.6 so the durable jobs foundation is safe for real scanners, larger reminder volumes, long-running installs, and separate-worker operation. This branch is hardening and follow-through; it does not add new job types.

### Version 0.33.5.21.7.1 - File scan request-path handoff

Purpose:

Make `file.scan` the real scanning execution path before scanner adapters ship.

- [x] Remove the unconditional inline `scanFile(session, file)` in the upload path (`src/services/files.service.js`) so scanning runs through the enqueued `file.scan` job. As written, the inline scan moves the file off `pending`, so `handleFileScanJob` always short-circuits on `file_not_pending_scan` and the durable path is never exercised.
- [x] Keep uploaded files in a clear `pending`/unavailable state until the scan job completes; if immediate availability is wanted for SQLite inline mode, run the scan job synchronously through the job handler path rather than scanning unconditionally in the web request.
- [x] Ensure `separate` worker mode owns scanning: the web process must not scan inline when a worker is configured.
- [x] Add/clarify Files UI handling for pending-scan files (uploaded, not yet available) and a fallback when the worker is delayed or down.
- [x] Update Files/job docs and add focused regressions proving uploads enqueue scan work, pending files stay unavailable, the worker completes scanning, and scanner internals/storage paths remain hidden.

Acceptance criteria:

- [x] File scanning runs through the durable job path and no longer blocks the upload request, so real scanner adapters in 0.33.5.22 can be slow or hang without failing uploads.
- [x] The browser and API expose a safe pending-scan state without adding file rename, replacement, hard-purge, storage-key, scanner-internal, or inline preview behavior.

### Version 0.33.5.21.7.2 - Reminder scheduling backfill and horizon

Purpose:

Make reminder coverage explicit for existing and future tasks without accumulating unbounded far-future queued rows.

- [x] Document the reminder scheduling model: reminder jobs are pre-enqueued with a future `available_at` when a task is created, updated, reopened, or restored.
- [x] Add a backfill or periodic "enqueue due reminders" sweep so existing due-dated tasks are covered even if they have not been touched since the durable reminder producer shipped.
- [x] Add a bounded scheduling horizon so only reminders due within the configured or documented window are queued, then topped up by the sweep.
- [x] Preserve per-user/workspace timezone correctness and the existing web/worker clock-skew tolerance.
- [x] Add focused regressions for pre-existing tasks, horizon top-up behavior, disabled/archived/completed task skips, and duplicate enqueue suppression.

Acceptance criteria:

- [x] Existing eligible tasks can receive reminders without manual edits.
- [x] Far-future or many-offset tasks do not create an unbounded number of long-lived queued rows.

### Version 0.33.5.21.7.3 - Job idempotency and at-least-once audit

Purpose:

Confirm every registered handler is safe under retry, lock reclaim, and at-least-once delivery.

- [x] Harden reminder firing so a job retry does not re-emit `task.due_soon` and double-notify; record fired state with completion or verify durable notification dedupe covers the retry path.
- [x] Review search index, notification fan-out, task reminder, task recurrence, file scan, and `import.future` handlers for stale payload, duplicate delivery, and retry behavior.
- [x] Add or tighten regressions for the highest-risk duplicate paths, especially reminder retries and reclaimed running jobs.
- [x] Capture the idempotency contract in developer docs so future job handlers know to re-read current state and skip stale work.

Acceptance criteria:

- Registered durable job handlers are documented and tested as safe for normal at-least-once worker behavior.
- Reminder retry paths cannot double-notify a user for the same reminder firing.

### Version 0.33.5.21.7.4 - Job retention and pruning

Purpose:

Prevent the framework-owned `jobs` table from growing without bound on long-running installs.

- [x] Add a retention/pruning policy for old `completed` and `dead` jobs so history remains bounded while active pending/running/failed work is preserved.
- [x] Make the retention window configurable through runtime configuration with safe defaults and validation.
- [x] Prune through framework-owned maintenance behavior, such as a maintenance job or startup sweep, not ad hoc route deletes.
- [x] Keep active dedupe semantics intact: completed and dead-letter history must not block replacement jobs, and pruning must not remove active rows.
- [x] Update docs and regressions for retention defaults, configured windows, active-row preservation, and long-running-install safety.

Acceptance criteria:

- Completed and dead-letter job history is bounded by a clear retention policy.
- Pruning is framework-owned, repeatable, and safe for SQLite inline or one-local-worker mode.

### Version 0.33.5.21.7.5 - Admin job observability

Purpose:

Move durable-job health from route-only diagnostics into the admin experience.

- [x] Ensure pending/running/failed/dead-letter counts and recent failures are visible in an admin surface, not only the `/api/jobs/status` route, reusing the bounded-pagination envelope from 0.33.5.20.5.
- [x] Include worker health/status in Runtime Diagnostics without exposing job payload JSON, dedupe keys, scanner internals, storage paths, or raw environment values.
- [x] Preserve `workspace_settings.manage` authorization and the existing safe diagnostics redaction contract.
- [x] Add focused browser/service regressions for the admin readout, authorization, pagination envelope, and sensitive-field redaction.

Acceptance criteria:

- Admins can inspect queue health and recent failures from the app UI.
- Job observability remains read-only and safe to expose to workspace settings managers.

### Version 0.33.5.21.7.6 - Separate-worker end-to-end validation

Purpose:

Prove the shipped worker CLI can process the durable-job foundation outside the web process.

- [x] Add a regression that runs the `separate` worker (`src/core/jobs/worker-cli.js`) against queued jobs end to end, proving it registers all handlers and processes reminder, recurrence, file-scan, notification, and search-index jobs.
- [x] Verify the 0.33.5.21.0.5 SQLite boundary: one local worker, schema-readiness check, no independent migration ownership, and no worker fleet sharing one SQLite file.
- [x] Confirm `disabled`, `inline`, and `separate` modes leave understandable diagnostics and do not process jobs from the wrong process.
- [x] Update worker docs only for behavior proved by the regression.

Acceptance criteria:

- Separate-worker mode has a repeatable end-to-end regression covering all current durable job handlers.
- SQLite mode continues to allow at most one local worker and keeps migration ownership with app startup or maintenance, not the worker.

### Version 0.33.5.21.7.7 - Async recurrence response closeout

Purpose:

Make the asynchronous recurrence contract fully absorbed by service, API, and browser consumers before the durable-jobs branch closes.

- [x] Verify all consumers of `tasks.service.complete()` handle `createdTask` now being `null` because the next recurring instance is created asynchronously by the worker.
- [x] Check browser completion flows, public API completion responses, audit/event/search side effects, and tests for assumptions that a next recurring instance exists synchronously.
- [x] Decide whether to surface a small "next instance queued" affordance, and document the decision in the Tasks contract if behavior changes.
- [x] Complete the durable-jobs branch closeout only after the 0.33.5.21.7 child slices are done: docs, changelog, roadmap/archive bookkeeping, version pins, targeted regressions, full `npm run check`, permission checks if touched, SQLite integrity check if database behavior changed, and `/api/app-info` verification after restart.

Acceptance criteria:

- Recurring-task completion responses and UI behavior match the asynchronous worker contract.
- The 0.33.5.21 durable-jobs branch closes with no new job type introduced and with file scanning, reminder coverage, job-table growth, retry idempotency, admin observability, and separate-worker operation validated.

### Version 0.33.5.21.7.8 - Task checklist UI: "+" add button (and checklist-item display regression guard)

Purpose:

Small Tasks-editor checklist refinements, grouped with the durable-jobs follow-ups only for convenience. Convert the checklist "Add" button to a `+` icon and lock in the checklist-item display regression that was just fixed so it cannot silently return.

- [x] Convert the checklist "Add" button to a `+` icon:
  - [x] The button is built by `taskEditorButton(view, "Add", { "data-task-checklist-add": "" })` in `public/js/task-dialog.js` (the checklist add row, ~line 2134). Render it as an icon button using the app-wide icon system (`public/js/shared/icons.js` `createIconButton`, or the `view.createActionButton` `icon`/`iconOnly` bridge), matching how the Files/Notes action buttons are iconized.
  - [x] Use a `plus`/`add` glyph; if the icon registry (`public/js/shared/icons.js`) does not already contain one, add a Lucide-style `plus` entry (see existing entries like `complete`, `close`, `save`).
  - [x] Keep an accessible label (title/`aria-label` "Add checklist item") since the button becomes icon-only, and preserve the existing `data-task-checklist-add` hook and disabled/enabled behavior (`fields.checklistAdd.disabled = !canUseChecklist`).
  - [x] Confirm the input + icon button still line up in the `task-checklist-add-row` layout (`public/css/longtail-forge.css`).
- [x] Convert the per-item checklist action buttons (Save / Up / Down / Remove) to icon buttons:
  - [x] These are built by `checklistActionButton(action, text, label)` in `public/js/task-dialog.js` (~line 1717), called for `save`/`up`/`down`/`delete` in `checklistItemRow` (~line 1706-1709). Render each as an icon button via the app-wide icon system (`public/js/shared/icons.js`), preserving the existing `data-task-checklist-action` values and the up/down `disabled` edge logic (`up.disabled = index === 0`, `down.disabled = index >= totalItems - 1`).
  - [x] Icon mapping: Save -> a disk/save glyph (existing `save` in the registry); Up -> an up arrow or upward caret (`chevron-up`); Down -> a downward caret (`chevron-down`); Remove -> a trash can (existing `delete`). Add any missing Lucide-style glyphs (`chevron-up`/`chevron-down`) to the registry.
  - [x] Make the Remove (trash) icon red, using a destructive/danger button variant/class (do not hardcode a hex; reuse the existing danger token used elsewhere for destructive actions).
  - [x] Give every icon button a hover tooltip and accessible name: a `title` attribute plus `aria-label` (reuse the descriptive labels already passed to `checklistActionButton`, e.g. "Save checklist item", "Move checklist item up", "Move checklist item down", "Remove checklist item"). This applies to every icon-only button in this slice, including the `+` add button.
  - [x] Confirm row layout/alignment still holds with icon buttons (`.task-checklist-item` in `public/css/longtail-forge.css`), including disabled-state styling for Up/Down.
- [x] Regression guard for checklist-item display (fixed in this pass): the task editor renders item rows from `task.checklistItems`, but the tasks **list** row serializer (`taskSummaryRow`, `src/modules/tasks/tasks.service.js`) only carries `checklistProgress`, not the item array. When the editor was opened from a list row, no task detail was fetched, so items never rendered even though the "N/M complete" summary did. The fix ensures the single-task detail (`GET /api/tasks/:taskId` -> `attachTaskDetails`, which includes `checklistItems`) is fetched and preferred over the passed list row in `openTaskEditor` (`public/js/task-dialog.js`).
  - [x] Add a regression proving that opening the task editor for a task with checklist items renders all item rows (not just the progress summary), covering the open-from-list-row path specifically.

Acceptance criteria:

- The checklist add control is a `+` icon button with an accessible label, consistent with the app's icon system, and still adds items.
- The per-item Save / Up / Down / Remove controls are icon buttons (disk / up caret / down caret / trash), with the trash rendered in the destructive/danger color, each carrying a hover tooltip and accessible name, and the Up/Down disabled edges preserved.
- Opening the task editor for a task that has checklist items always displays those item rows, guarded by a regression.

### Version 0.33.5.21.8 - Deliver task due reminders to the notification surface

Purpose:

Task due reminders must produce in-app notifications through the existing notification surface, on the reminder schedule set for the task. This has never worked for the user. With 0.33.5.21.6 firing, 0.33.5.21.5 notification jobs, and 0.33.5.21.7.2/0.33.5.21.7.3 covering when reminders enqueue and how retries stay idempotent, the remaining gap is recipient delivery: who a fired reminder actually notifies. Email and calendar delivery remain future work; this slice is the in-app notification surface only.

Root cause (confirmed):

- Reminder firing (`handleTaskReminderJob` emitting `task.due_soon`) only arrived in 0.33.5.21.6; before it, `src/modules/tasks/module.js` described `task.due_soon` as a "Reserved notification event," so no shipped version ever fired a reminder.
- The `task.due_soon` notification event uses `recipientMode: "assignees"` (`src/modules/tasks/module.js`), and `resolveRecipients` (`src/services/notifications.service.js`) only adds assignee user IDs for that mode. A task with no assignee (or not assigned to the current user) resolves to zero recipients and produces no notification. The reminder job runs as a system actor (empty `actor_user_id`), so actor suppression is not the cause.

- [ ] Confirm the end-to-end reminder delivery path (0.33.5.21.6 firing + 0.33.5.21.5 notification jobs):
  - [ ] A task with a due date and reminder offsets enqueues `task.reminder` jobs at each `reminder_at_utc`.
  - [ ] The reminder job fires at its scheduled time and emits `task.due_soon`.
  - [ ] Notification fan-out creates an in-app notification record that appears in the notifications surface and unread count.
- [ ] Fix reminder recipient scope so reminders reach the responsible user.
  - [ ] Deliver task due reminders to the task's assignee(s) and to the task owner/creator when there is no assignee, so solo/personal/family-workspace tasks notify the user who set the schedule.
  - [ ] Prefer passing explicit reminder recipients from the reminder job (which already reads the full task) instead of relying only on the `assignees` recipient hint.
  - [ ] Preserve existing assignee and task-follower delivery and existing system-actor handling.
  - [ ] Respect per-user notification preferences (`task.due_soon` is `defaultEnabled: true`, `high` priority) and workspace module-enabled checks.
  - [ ] Do not notify for archived or completed tasks (already guarded when the job fires).
- [ ] Make the reminder notification useful.
  - [ ] Title/body should reference the task and how soon it is due (from the offset), link to the task, and use the declared `high` priority.
- [ ] Verification.
  - [ ] Add an end-to-end regression: near-future due date + reminder offsets -> reminder job -> `task.due_soon` -> notification record visible to the right user; cover assigned, unassigned/self-owned, and followed tasks.
  - [ ] Manually verify against a real reminder schedule: set reminders on a task and confirm a notification appears at the scheduled time in the notifications surface.
- [ ] Cross-reference: 0.33.5.21.7.2 covers when reminder jobs enqueue and 0.33.5.21.7.3 covers safe retries; this slice covers who a fired reminder notifies and that it reaches the notification surface.

Acceptance criteria:

- Setting a reminder schedule on a task reliably produces an in-app notification at each scheduled reminder time for the assignee(s) and, when unassigned, the task owner/creator.
- Reminder notifications appear in the existing notification surface and unread count, respect notification preferences and module-enabled checks, and link to the task.
- Regression coverage proves reminder-to-notification delivery for assigned, unassigned/self-owned, and followed tasks.

### Version 0.33.5.21.9 - User-facing UI fixes (markdown links, task complete, notes files, theme switch)

Purpose:

A batch of user-facing fixes promoted from `TODO.md`'s Short Term section. These are independent of the durable-jobs work in this branch and share no runtime surface with jobs; they are grouped here only as a convenience grab-bag. Each sub-slice can land and be closed independently. Where a change adds a user preference, follow the existing per-user settings pattern (schema column + migration, repo `USER_SELECT_COLUMNS` + writer, normalizer + `userRowToAppValue` mapping, `users.service.js` `readSettings`/`saveSettings`, `views/protected/user-settings.html` fieldset, `public/js/user-settings.js` load/save handlers).

#### Version 0.33.5.21.9.1 - External markdown links open in a new tab (configurable)

Context: markdown is rendered server-side with markdown-it and the resulting HTML is cached on the record (`note.body_html`) and shared across all users, so a per-user preference must NOT be baked into the server-rendered HTML — that would fragment the cache and leak one user's preference into another user's view. Wiki links already render as `span.note-wiki-link[data-note-title]` (not anchors) in `src/modules/notes/markdown.js:79`; only real external anchors (`a[href^="http"]`) are in scope. External anchors are emitted by the `link_open` rule in `src/core/markdown/markdown.service.js:85-99` and currently carry no `target`, so they open in the same tab.

- [ ] Add a user-level boolean preference "Open external links in a new tab" (default off) using the standard settings pattern above:
  - [ ] Schema column on `users` + migration (model on `theme_mode` at `src/db/schema/current.sql:28`).
  - [ ] `USER_SELECT_COLUMNS` + a `updateOpenLinksNewTab()` writer in `src/repositories/users.repo.js` (model on `updateThemeMode` at 189-195).
  - [ ] Boolean normalizer in `src/utils/normalizers.js` (model on `normalizeThemeMode` 96-98) and mapping in `userRowToAppValue` (100-111).
  - [ ] Return it from `readSettings` and handle it in `saveSettings` in `src/services/users.service.js` (model on the `themeMode` block ~588-596).
- [ ] Add a new "Markdown Rendering" fieldset to `views/protected/user-settings.html` (model on the Appearance fieldset 15-26) with a toggle, wired in `public/js/user-settings.js` (load + `save…()` PUT handler).
- [ ] Apply the preference client-side so the shared cached HTML is not user-specific: after the browser injects rendered markdown (`public/js/notes.js:1464` `body.innerHTML = note.body_html`, and the live preview at `:2531`), post-process `a[href]` anchors whose href is an absolute `http(s)` URL, adding `target="_blank"` and `rel="noopener noreferrer"` only when the preference is on. Do not touch `.note-wiki-link` spans or relative/`mailto:` links.
- [ ] Verification:
  - [ ] With the preference on, external links in a rendered note open in a new tab and carry `rel="noopener noreferrer"`; with it off they open in the same tab.
  - [ ] Wiki links and internal navigation are unaffected in both states.
  - [ ] The cached `body_html` is byte-identical regardless of which user viewed it (no per-user server-render fragmentation).

Acceptance criteria:

- Users can opt into external markdown links opening in a new tab from User Settings → Markdown Rendering, applied without changing the shared server-rendered/cached HTML.

#### Version 0.33.5.21.9.2 - "Complete" button in the task edit modal

Context: the task edit modal (`public/js/task-dialog.js`) has only Cancel + Save in its footer (`footerActions` at 1959-1962). Completing a task from the modal today requires changing the Status select to "Complete" and saving, which goes through `PUT /api/tasks/:id` (`tasksService.update`) and — unlike the dedicated `POST /api/tasks/:id/complete` route (`tasks.service.js:521-560`) — skips the active-timer guard and does not queue recurrence generation. The list view already exposes a proper checkmark Complete action (`public/js/tasks.js:1243-1251` → `postTaskAction(record, "complete")`).

- [ ] Add a "Complete" (checkmark) button to the task editor modal footer:
  - [ ] Add a `{ id: "complete", label: "Complete", icon: "complete", role: "primary" }` entry to `taskEditorModalDescriptor().footerActions` (`task-dialog.js:1959-1962`) and render/wire it in `taskEditorCommitActions()` (1992-2010), using the shared `complete` icon.
  - [ ] Bind a click handler (near the submit binding at `task-dialog.js:357`) that first persists edits via the existing `saveTask` flow, then calls the dedicated `POST /api/tasks/:id/complete` route — the same endpoint the list view uses — so the active-timer guard, `task_completed` audit/event, and recurrence generation all run.
- [ ] Gate the button: require the `tasks.complete` permission and a current status of `open`/`in_progress`/`blocked` (mirror the list action's `requiredPermissions`/`visibleStatuses`), and only show it for an already-saved task (needs a `task_id`); hide it when creating a new task.
- [ ] Handle the recurrence result: `complete` may return a `createdTask` (next recurring instance); surface/refresh it the same way the list-view complete flow does.
- [ ] Verification:
  - [ ] Clicking Complete in the modal saves pending edits and completes the task via the dedicated route (recurrence fires; active-timer block is respected).
  - [ ] The button is hidden without `tasks.complete`, for terminal statuses, and for the new-task form.

Acceptance criteria:

- A task can be saved-and-completed in one action from the edit modal, with the same side effects as the list-view Complete action.

#### Version 0.33.5.21.9.3 - Notes file panel: preview button and icon buttons

Context: the Notes "Files" surfaces mount the shared attachment component (`public/js/shared/file-attachments.js`), whose row actions (Download/Remove/Report/Review/Delete/Restore, `:394-499`) are rendered as plain text labels with no `icon`, and which has no preview action at all. The standalone Files module already solves both: it renders these same actions as icon buttons (`public/js/files.js:799-981`, e.g. `icon:"eye"` preview, `icon:"download"`) and owns a reusable preview modal (`openFilePreview`/`buildFilePreviewDialog`/`loadFilePreview` at `files.js:988-1211`, eligibility at `1886-1961`). The icon infrastructure (`public/js/shared/icons.js`, and `view.createActionButton`'s `icon`/`iconOnly` bridge at `view-builder.js:1397-1415`) is already app-wide; the needed glyphs (`eye`, `download`, `delete`, `restore`, `alert`, `shield-alert`) already exist in the registry.

- [ ] Extract the file preview flow out of `public/js/files.js` into a shared module (or expose it on `window.LongtailForge`) so both the Files module and the Notes attachment panel call one implementation. Move `openFilePreview`, `buildFilePreviewDialog`, `loadFilePreview`, the image/text/markdown/unavailable renderers, and `previewAvailabilityForRow`/`previewKindForExtension`/`previewUnavailableLabel`. Keep `files.js` behavior identical after extraction.
- [ ] Add a preview action to the shared attachment rows in `public/js/shared/file-attachments.js` (`createAttachmentActions` 394-453), gated on the shared preview-eligibility check, calling the extracted preview modal — so the note detail files panel (`notes.js` `renderFilesPanel`/`mountFilesPanel` 2814-2849) and the note editor Files dialog both get preview.
- [ ] Convert the shared attachment component's text-label buttons to icon buttons matching the Files module: pass `icon` (and `iconOnly` where the Files module does) to the existing `createActionButton`/`createAttachmentActionButton` calls — Download→`download`, Remove/Delete→`delete`, Report→`alert`, Review→`shield-alert`, Restore→`restore`, Preview→`eye`. Keep accessible labels (title/aria-label) even when icon-only.
- [ ] Verification:
  - [ ] A file attached to a note shows a working Preview button in the note detail files panel and the editor Files dialog, using the same preview modal as the Files module.
  - [ ] Attachment row actions render as icons consistent with the Files module, with accessible labels preserved.
  - [ ] The Files module page still previews and acts on files unchanged after the preview extraction.

Acceptance criteria:

- The Notes files view has a preview button and icon-based action buttons, sharing one preview implementation and the app-wide icon system with the Files module.

#### Version 0.33.5.21.9.4 - Three-position theme switch (light / auto / dark)

Context: theme is a binary light/dark preference everywhere — stored as `users.theme_mode` (`src/db/schema/current.sql:28`, values only `"light"`/`"dark"`), normalized by `normalizeThemeMode` (`src/utils/normalizers.js:96-98`, the single source of truth the backend imports), applied to `html[data-theme]` in three browser spots (`public/js/theme-init.js:12-25`, `public/js/navigation.js:846-853`, `public/js/user-settings.js:154-163`), and toggled by a two-position slider checkbox (`views/protected/user-settings.html:19-24`, CSS `public/css/longtail-forge.css:3077-3123`). There is no "auto" mode and no `prefers-color-scheme` detection anywhere. User timezone is already stored (`users.timezone`, `src/db/schema/current.sql:26`; client accessor `public/js/shared/timezones.js`).

- [ ] Add `"auto"` as a valid stored `theme_mode` value: extend `normalizeThemeMode` (`normalizers.js:96-98`) to allow `light`/`auto`/`dark` (keep default light). No schema type change needed (already `TEXT`); confirm the default stays `light`.
- [ ] Replace the two-position checkbox with a three-position control (light / auto / dark, "Auto" in the middle) in `views/protected/user-settings.html:19-24` — e.g. a radio/segmented control — and update the CSS (`longtail-forge.css:3077-3123`) from a binary slider knob to a 3-position/segmented style.
- [ ] Update the browser theme logic to resolve `auto` to an effective `light`/`dark` for the `data-theme` attribute:
  - [ ] `resolveThemeMode` in `public/js/theme-init.js` (currently a pass-through, 23-25) and `applyThemeMode` in `public/js/navigation.js:846-853` and `public/js/user-settings.js:154-163`.
  - [ ] `getSelectedThemeMode`/change listener in `public/js/user-settings.js` (39-43, 480-482) to read the 3-way control.
- [ ] Add a secondary two-position "auto source" control, only active/visible when the mode is `auto`, choosing how auto resolves:
  - [ ] "Match operating system" — resolve via `window.matchMedia("(prefers-color-scheme: dark)")`, re-resolving on the media-query `change` event (net-new; no `prefers-color-scheme` usage exists today). This is the recommended default auto source.
  - [ ] "Follow sunrise/sunset" — light after sunrise, dark after sunset, using the stored user timezone. NOTE the data gap: accurate sunrise/sunset needs a location (lat/long), and only an IANA timezone is stored today; scope this option as either (a) a timezone→approximate-location lookup, or (b) defer the sunrise/sunset source to a follow-up and ship only OS-match under `auto` first. Record the decision in `DECISIONS.md`.
  - [ ] Persist the auto-source choice as a second user preference using the standard settings pattern (schema column + migration, repo, normalizer/mapping, service read/save, settings UI). It only takes effect while mode is `auto`.
- [ ] Keep the pre-render flash guard working: `theme-init.js` must resolve `auto` before first paint (read the auto-source preference from the existing cookie/localStorage path, not an async fetch).
- [ ] Verification:
  - [ ] The switch offers light / auto / dark; auto with "match OS" flips the applied theme when the OS scheme changes, with no flash on load.
  - [ ] Existing stored `light`/`dark` preferences continue to resolve unchanged.
  - [ ] If sunrise/sunset ships, light/dark aligns to the user's timezone-based day boundaries; if deferred, `auto` cleanly falls back to OS match.

Acceptance criteria:

- Theme can be set to light, dark, or auto (three-position switch), and in auto mode resolves via OS color scheme (and, if in scope, sunrise/sunset by the user's timezone) without a load flash and without breaking existing light/dark preferences.

## Version 0.33.5.22 - Storage Provider and Scanner Runtime

Purpose:

Keep local file storage simple for SQLite/self-hosted mode while making storage provider selection configuration-owned and preparing for S3-compatible SaaS storage.

Entry contract from 0.33.5.19: consume the documented storage and scanner runtime config keys without changing existing Files storage semantics until this branch owns the behavior.

### Version 0.33.5.22.1 - Storage provider configuration

- [ ] Resolve storage provider from runtime/workspace configuration instead of hardcoding `local`.
- [ ] Route the upload write path through the configured provider: replace the hardcoded `getFileStorageAdapter("local")` and `storageProvider: "local"` in `src/services/files.service.js` with `config.storage.provider`, keeping the stored `files.storage_provider` per-row so existing local files still read back correctly.
- [ ] Keep `local` as default for SQLite/self-hosted mode.
- [ ] Add provider health checks.
- [ ] Add admin diagnostics:
  - [ ] Provider ID.
  - [ ] Local root path or safe provider label.
  - [ ] Availability status.
- [ ] Add docs for local storage mode.
- [ ] Add regressions proving:
  - [ ] Local storage remains default.
  - [ ] Unknown provider fails clearly.
  - [ ] File routes do not expose storage keys/paths.

Acceptance criteria:

- Storage provider selection is centralized and configurable.

### Version 0.33.5.22.2 - Streamed local uploads

- [ ] Move file uploads away from JSON-body file payloads where practical.
- [ ] Decide the multipart mechanism explicitly: no multipart parser exists today (uploads are base64-in-JSON via the hand-rolled `readJsonBody` in `src/utils/http.js`, capped at 8 MB JSON / 5 MB decoded file), so this slice adds either a streaming multipart dependency or a hand-rolled parser. Record the dependency decision in `DECISIONS.md`.
- [ ] Add streamed or multipart upload support for local/self-hosted mode.
- [ ] Preserve existing route compatibility temporarily if needed.
- [ ] Define the transition window: how long the base64 JSON route (`POST /api/files`) and the new streamed route coexist, and when the shared attachment helper's base64 path is retired.
- [ ] Add upload size enforcement.
- [ ] Add per-file result reporting.
- [ ] Add regressions for:
  - [ ] Successful upload.
  - [ ] Oversized upload rejection.
  - [ ] Partial batch failure.
  - [ ] Upload cancellation/error.

Acceptance criteria:

- Local uploads do not require buffering large file JSON payloads in memory.

### Version 0.33.5.22.3 - Scanner adapter configuration

- [ ] Formalize scanner modes:
  - [ ] `none`
  - [ ] `noop`
  - [ ] `clamd`
  - [ ] `clamscan`
- [ ] Define the `none` vs `noop` distinction precisely (e.g. `none` = do not scan / mark available; `noop` = pass-through adapter for tests), since only `noop` exists today (`src/core/files/scanner-adapter.js`) while config defaults to `none`.
- [ ] Cross-reference 0.33.5.21.7.1: `file.scan` now owns upload scan execution, uploaded files stay pending/unavailable until the worker completes the job, and this slice should make scanner adapter configuration the single owner of any future pending scan -> available/quarantine transition changes.
- [ ] Reuse the existing quarantine/review lifecycle (`files.manage_quarantine`, the `Mark Reviewed` restore path) rather than introducing new scan states.
- [ ] Keep no-op scanner only for development or explicitly accepted self-hosted mode.
- [ ] Add scanner health checks.
- [ ] Add admin warning when scanner is disabled.
- [ ] Add scanner docs for Windows, Linux, and macOS.
- [ ] Do not auto-delete suspicious files.
- [ ] Quarantine suspicious files and require review.
- [ ] Add regressions proving:
  - [ ] Scanner disabled state is visible.
  - [ ] Scanner failure quarantines or blocks according to policy.
  - [ ] Scanner does not bypass file permissions.

Acceptance criteria:

- Scanner behavior is OS-agnostic at the app level.
- ClamAV or other scanners are runtime adapters, not hard dependencies.

### Version 0.33.5.22.4 - ClamAV scanner adapter

- [ ] Add `clamd` adapter.
- [ ] Add `clamscan` executable adapter.
- [ ] Support configured executable/socket/host/port.
- [ ] Add timeout and failure behavior.
- [ ] Add safe scanner metadata.
- [ ] Add docs:
  - [ ] Linux service setup.
  - [ ] Windows executable path setup.
  - [ ] macOS/Homebrew setup if practical.
  - [ ] What happens when scanner is unavailable.
- [ ] Add regressions using mocked scanner responses:
  - [ ] Clean.
  - [ ] Infected.
  - [ ] Scanner unavailable.
  - [ ] Timeout.

Acceptance criteria:

- Real file scanning is available without making LTF Linux-only.

### Version 0.33.5.22.5 - S3-compatible storage provider proof

- [ ] Add S3-compatible storage adapter behind the provider contract.
- [ ] Support provider configuration through `.env`/runtime config.
- [ ] Do not require S3 for SQLite/self-hosted installs.
- [ ] Add safe provider health checks.
- [ ] Add direct/presigned upload planning or proof where practical.
- [ ] Treat any presigned upload/download URL as a deliberate, documented exception to the standing "no signed URLs unless designed for that route" guardrail, with per-object permission checks and expiry recorded in `DECISIONS.md`.
- [ ] Keep all downloads permission-checked through LTF routes or signed URL rules.
- [ ] Add regressions with mocked S3 provider.

Acceptance criteria:

- Hosted SaaS has a path to object storage.
- Self-hosted local storage remains unchanged.

## Version 0.33.5.23 - PostgreSQL Adapter and SaaS Runtime Proof

Purpose:

Add the hosted-SaaS database backend behind the provider-neutral database contract while preserving SQLite small-office support.

Entry contract from 0.33.5.19: consume the database provider config, `src/core/database.js` adapter boundary, health/capability shape, parameterized query and transaction conventions, and documented migration-lock strategy while keeping SQLite defaults intact.

### Version 0.33.5.23.1 - PostgreSQL adapter skeleton

- [ ] Add PostgreSQL database provider implementation.
- [ ] Support `DATABASE_URL`.
- [ ] Support pool configuration.
- [ ] Support TLS/SSL configuration.
- [ ] Add health checks.
- [ ] Add docs for local Postgres development.
- [ ] Do not change SQLite defaults.

Acceptance criteria:

- App can connect to PostgreSQL behind the same database adapter contract.

### Version 0.33.5.23.2 - SQL portability audit

- [ ] Make parameter binding the headline audit item: ~94% of queries interpolate values via `sqlText()/sqlInteger()/sqlNullableText()` (~1,763 calls / ~314 call sites) vs ~19 bound-parameter sites. Quantify per-repository and convert value interpolation to real bound parameters, since PostgreSQL (`pg`) requires positional `$1` binding and rejects inlined literals as the contract.
- [ ] Add a named-to-positional (`:name` to `$n`) parameter translation layer in the adapter so the app-facing `db.query(sql, params)` contract stays stable across providers.
- [ ] Inventory SQLite-specific SQL:
  - [ ] `INSERT OR IGNORE`.
  - [ ] SQLite-specific conflict syntax.
  - [ ] `COLLATE NOCASE` (~21 sites) vs `citext`/`ILIKE`/nondeterministic collation.
  - [ ] PRAGMA usage.
  - [ ] FTS-specific behavior; treat FTS5 (`MATCH`/`bm25()`) as a PostgreSQL `tsvector`/`tsquery` reimplementation, not a compatibility helper.
  - [ ] JSON handling assumptions.
  - [ ] Boolean storage (`0/1` + `CHECK (col IN (0,1))`) vs PostgreSQL `boolean`.
  - [ ] `julianday(...)` / date arithmetic (timer elapsed seconds) vs PostgreSQL interval math.
  - [ ] `rowid` reliance in dedup/repair code vs PostgreSQL (no implicit rowid).
- [ ] Inventory read-modify-write sequences that currently rely on the SQLite adapter's global operation serialization for correctness (counters, read-then-write upserts, claim/allocate patterns) and wrap them in `db.transaction(...)` before enabling a pooled/concurrent backend. Only two `db.transaction(...)` call sites exist today.
- [ ] Record the confirmed non-issues for scope clarity: no `RETURNING`, no SQLite JSON functions, and no `LIMIT`/`OFFSET` inside `UPDATE`/`DELETE` exist today.
- [ ] Add compatibility helpers where needed.
- [ ] Document intentional SQLite-only paths.
- [ ] Add repository tests for SQLite and PostgreSQL where practical.

Acceptance criteria:

- Provider differences are explicit and tested.

### Version 0.33.5.23.3 - PostgreSQL migrations and schema proof

- [ ] Add PostgreSQL migration runner support.
- [ ] Gate the SQLite-only migration/repair routines (`sqlite_master`, `PRAGMA table_info`, `PRAGMA legacy_alter_table`, `ALTER TABLE ... RENAME`, `INSERT OR IGNORE`, and the FK-repair passes in `src/db/migrations.js`) behind the SQLite provider so they never run against PostgreSQL.
- [ ] Add migration locking for PostgreSQL.
- [ ] Create PostgreSQL-compatible schema baseline or migration translation.
- [ ] Make the migration runner select DDL/introspection per provider rather than assuming SQLite (the baseline `src/db/schema/current.sql` is SQLite DDL today).
- [ ] Verify schema creation from empty database.
- [ ] Add checksum validation.
- [ ] Add docs explaining:
  - [ ] SQLite self-hosted path.
  - [ ] PostgreSQL SaaS path.
  - [ ] Migration ownership.
  - [ ] Backup expectations.

Acceptance criteria:

- PostgreSQL can initialize cleanly.
- SQLite migration behavior remains intact.

### Version 0.33.5.23.4 - Dual-backend repository contract tests

- [ ] Add a test runner that can execute repository contract tests against:
  - [ ] SQLite.
  - [ ] PostgreSQL, when configured.
- [ ] Prioritize high-value repositories:
  - [ ] Sessions.
  - [ ] Workspaces.
  - [ ] Permissions.
  - [ ] Tasks.
  - [ ] Notes.
  - [ ] Files metadata.
  - [ ] Search index.
  - [ ] Notifications.
- [ ] Add docs for optional Postgres test setup.
- [ ] Specify how Postgres contract tests run locally/CI (Docker or local Postgres, opt-in via `DATABASE_URL`) so the dual-backend suite is actually exercised, not skipped by default.
- [ ] Add a contract test proving `db.transaction(...)` pins one connection for the whole callback on PostgreSQL and that no code path uses the top-level `db.*` inside a transaction (the SQLite adapter already enforces this via `assertNotInsideTransactionContext`).

Acceptance criteria:

- Core behavior can be verified against both backends.

### Version 0.33.5.23.5 - SaaS seed and load smoke test

- [ ] Add Postgres seed profile for many workspaces.
- [ ] Add basic load-smoke scripts.
- [ ] Test:
  - [ ] Login/session.
  - [ ] App shell.
  - [ ] Tasks list/detail.
  - [ ] Notes list/detail.
  - [ ] Files browse.
  - [ ] Search.
  - [ ] Notifications.
  - [ ] Job worker.
- [ ] Record baseline performance numbers.
- [ ] Document what is proven and what is not yet proven.

Acceptance criteria:

- The SaaS backend has an evidence-based baseline.

## Version 0.33.6 - Reporting Framework and Time Report Contribution

Decision:

Reporting is framework-owned report infrastructure, not a normal disable-able first-party workflow module. The framework owns the Reporting page, report catalog, contribution filtering, report execution dispatch, shared filter host, loading/error/empty states, and future saved/export/export scheduling behavior. Individual modules own the actual report definitions, report runners, data queries, domain calculations, result shapes, and record-level permission checks.

The first 0.33.6 report should remain intentionally small: Time Tracking contributes one Project Time & Billing report. Do not build a custom report builder, report designer, analytics dashboard, or saved report system in this pass.

### Dependencies and Framework Baseline

This version builds on the framework surface work completed immediately before it and must not
reintroduce a hard-coded Reporting page:

- 0.33.5.13 defines shared surface/modal/overlay tokens and common page anatomy expectations.
- 0.33.5.15 exposes the framework-owned `LongtailForge.view` primitives for page headers,
  filters, status/empty/error states, tables, action strips, field grids, and modal shells.
- 0.33.5.16 introduces validated `viewSurfaces`, `LongtailForge.view.renderSurface(...)`,
  descriptor data binding, `surface.refresh()`, route actions, behavior handlers, minimal protected
  hosts, and strict guardrails for converted declarative surfaces.
- 0.33.5.18 extends the descriptor/renderer capability set while converting Notes, Tasks, Files,
  and Clients/Projects pages. Reporting should consume the finalized 0.33.5.18 view baseline
  instead of creating Reporting-only anatomy for filters, tables, status messages, or host layout.

Reporting is a framework-owned surface, so it should not create a fake disable-able
`src/modules/reporting` workflow module just to fit module-owned `viewSurfaces`. 0.33.6 must decide
and document the framework-owned equivalent: either a framework-owned descriptor/config source that
the same renderer can consume, or a narrow framework host adapter built directly on
`LongtailForge.view` primitives where the descriptor contract cannot yet model report execution.

### Version 0.33.6.1 - Reporting Architecture and Framework View Baseline

- [ ] Review the completed 0.33.5.18 renderer/primitive capabilities before implementing Reporting.
- [ ] Decide whether the Reporting host should use:
  - [ ] A framework-owned descriptor/config source consumed by `LongtailForge.view.renderSurface(...)`.
  - [ ] A narrow framework Reporting host adapter built on `LongtailForge.view` primitives.
- [ ] Do not create a normal disable-able `src/modules/reporting` workflow module only to satisfy
      module-owned `viewSurfaces` shape.
- [ ] Define which Reporting host anatomy is framework-owned:
  - [ ] Page shell and header.
  - [ ] Report selector.
  - [ ] Shared filter host.
  - [ ] Loading, error, empty, and status states.
  - [ ] Results host and overflow behavior.
  - [ ] Report action placement for future export/saved-report actions.
- [ ] Define module-owned report responsibilities:
  - [ ] Report definitions.
  - [ ] Runner IDs.
  - [ ] Data queries and aggregation.
  - [ ] Domain calculations.
  - [ ] Result shape.
  - [ ] Record-level permission checks.
- [ ] Update the implementation plan only; do not change runtime behavior in this slice.

### Version 0.33.6.2 - Reporting Contribution Contract

- [ ] Keep this roadmap section named "Reporting Framework and Time Report Contribution."
- [ ] Keep `reporting.html` framework-owned.
- [ ] Expand the existing module manifest `reporting` field into a validated report contribution contract.
- [ ] Report contribution fields should include:
  - [ ] `id`
  - [ ] `label`
  - [ ] `description`
  - [ ] `category`
  - [ ] `renderer`
  - [ ] `runner`
  - [ ] `requiredPermissions`
  - [ ] `requiredWorkspaceCapabilities`
  - [ ] `requiresEnabledModules`
  - [ ] `sortOrder`
  - [ ] supported filter metadata, such as billing period, custom date range, scope, project, tag, and descendants.
- [ ] Add `modulesService.listReportingReports(workspaceId, session)` using the same enabled-module, permission, workspace-capability, and required-module filtering pattern used by other module contributions.
- [ ] Keep contribution validation data-only. Do not place executable functions directly in module manifests.
- [ ] Keep report contribution filtering separate from report execution so the catalog can be permission-safe without running report code.
- [ ] Update `docs/module-contract.md` with the finalized reporting contribution shape.

### Version 0.33.6.3 - Reporting Framework Catalog Route

- [ ] Add framework-owned report catalog route:
  - [ ] `GET /api/reporting/catalog`
- [ ] Return only reports allowed by enabled modules, workspace capabilities, required modules, and user permissions.
- [ ] Include report metadata, supported filters, renderer ID, default filter values, and report-specific permission requirements.
- [ ] Ensure disabled modules do not contribute active catalog reports.
- [ ] Ensure reports from historically readable disabled modules are only visible when explicitly allowed by contribution and module policy.
- [ ] Add focused catalog regressions for disabled modules, missing permissions, workspace capability filtering, and required-module filtering.

### Version 0.33.6.4 - Reporting Runner Registry and Execution Route

- [ ] Add framework-owned report execution route:
  - [ ] `GET /api/reporting/reports/:moduleId/:reportId/run`
  - [ ] or a stable equivalent using a report key.
- [ ] Add a server-side report runner registry keyed by stable runner IDs.
- [ ] The framework Reporting service should validate report availability, permissions, enabled modules, workspace capability requirements, and basic filter shape before dispatching.
- [ ] The module-owned runner should remain responsible for domain-specific data access, calculations, and record-level permission safety.
- [ ] Normalize execution errors into framework-owned report status/error payloads without exposing implementation details.
- [ ] Add focused execution regressions for unknown report IDs, missing runners, denied permissions, disabled modules, and invalid filter shape.

### Version 0.33.6.5 - Time Tracking Project Time & Billing Contribution

- [ ] Move Project Time & Billing report logic out of the framework Reporting service and into Time Tracking-owned report/service code.
- [ ] Time Tracking should contribute the initial report:
  - [ ] ID: `project-time-billing`
  - [ ] Label: `Project Time & Billing`
  - [ ] Runner: `time-tracking.project-time-billing`
  - [ ] Renderer: `time-project-billing-table`
- [ ] Preserve existing useful filters:
  - [ ] Current billing period
  - [ ] Last billing period
  - [ ] Custom date range
  - [ ] Reporting scope
  - [ ] Projects
  - [ ] Tags
  - [ ] Include descendants
- [ ] Hide Start Date and End Date unless Billing Period is set to Custom.
- [ ] Keep Time Tracking responsible for time entry aggregation.
- [ ] Keep Client/Projects responsible for client/project hierarchy and billing metadata.
- [ ] Keep framework Reporting responsible only for report hosting and dispatch.
- [ ] Preserve existing `tagIds` filtering behavior through the Time Tracking-owned runner.
- [ ] Preserve existing task-linked time entry reporting behavior where already supported.
- [ ] Add focused Time Tracking report runner regressions before the page-host rewrite depends on it.

### Version 0.33.6.6 - Correct Project and Client Rollup Billing Math

- [ ] Fix descendant rollup calculation so each project/subproject computes its own direct time first.
- [ ] Apply that project's effective billing rate, billing period, and rounding rules to that project's direct time.
- [ ] Parent project totals should equal:
  - [ ] Parent direct rounded total
  - [ ] plus child project rounded totals
  - [ ] plus deeper descendant rounded totals
- [ ] Do not round all descendant time together at the parent level.
- [ ] Do not apply the parent billing rate to child project time when the child has its own effective rate.
- [ ] Client totals should aggregate project totals using the same already-rounded project/subproject totals.
- [ ] Parent clients should add direct client project totals plus child-client totals without losing child billing rules.
- [ ] Preserve display-only expandable child project rows without double-counting totals.
- [ ] Add fixture coverage for parent projects, child projects, deeper descendants, parent clients, child clients, mixed rates, and mixed billing periods.

### Version 0.33.6.7 - Framework Reporting Host Shell

- [ ] Keep one framework-owned `reporting.html` page.
- [ ] Reduce `views/protected/reporting.html` to a minimal framework host that loads shared view assets,
      the chosen Reporting host renderer/adapter, and the Reporting browser behavior file.
- [ ] Convert the hard-coded Time Report UI into a framework Reporting host that loads available report definitions from the catalog.
- [ ] Render the page shell, header, report selector, status/error/empty states, filter host, and results host through the chosen framework view path.
- [ ] Do not hand-build framework-owned Reporting anatomy in static HTML or ad-hoc browser DOM when a descriptor field or `LongtailForge.view` primitive exists.
- [ ] Keep the first host simple: one selected report, one filter area, one status area, and one results area.
- [ ] Add a focused static regression proving the Reporting page is a minimal framework host.

### Version 0.33.6.8 - Reporting Filter Host and Report Selection

- [ ] Load report definitions from `GET /api/reporting/catalog`.
- [ ] Select the first available report by default when no valid report is requested.
- [ ] Render report filters from contribution metadata through the shared filter host:
  - [ ] Billing period.
  - [ ] Custom date range.
  - [ ] Reporting scope.
  - [ ] Projects.
  - [ ] Tags.
  - [ ] Include descendants.
- [ ] Hide Start Date and End Date unless Billing Period is set to Custom.
- [ ] Preserve query-parameter deep links where already useful, including selected scope/report where practical.
- [ ] Ensure filter changes call the framework execution route and refresh the current result without rebuilding the host layout by hand.
- [ ] Add focused browser/static regressions for report selection, custom date visibility, empty catalog state, and filter refresh behavior.

### Version 0.33.6.9 - Project Time & Billing Result Renderer

- [ ] Add a registered report result renderer for `time-project-billing-table`.
- [ ] The first renderer may remain specific to Project Time & Billing, but it should use framework table/action primitives where they fit.
- [ ] Preserve hierarchical project display:
  - [ ] Parent rows can expand/collapse child rows.
  - [ ] Child rows are display-only rows under their parent.
  - [ ] Footer totals come from the runner result and are not recomputed from expanded display rows.
- [ ] Keep Time Tracking responsible for the result shape and billing semantics.
- [ ] Keep the framework responsible for result-host placement, overflow wrappers, loading/error/empty states, and renderer dispatch.
- [ ] Add focused regressions for expandable child rows, totals, no-results state, and renderer-not-found recovery.

### Version 0.33.6.10 - Permissions, Navigation, Guardrails, and Closeout

- [ ] Decide whether `reporting.view` should become a framework-owned permission instead of being contributed by Time Tracking.
- [ ] Keep report-specific visibility dependent on both `reporting.view` and the owning module's required permissions.
- [ ] Keep Reporting navigation framework-owned, with child report entries contributed by modules.
- [ ] Add strict guardrails for the converted Reporting host:
  - [ ] Reporting must not ship a non-minimal protected HTML view.
  - [ ] Reporting must not call `document.createElement` for framework-owned page header, filter host, status, table shell, or action anatomy when the chosen framework view path covers it.
  - [ ] Reporting must not introduce new one-off layout/footer classes for framework-owned anatomy.
- [ ] Update `docs/declarative-view-surfaces.md` inventory to move Reporting out of "reported" and into the chosen framework-owned Reporting host status.
- [ ] Update `docs/view-building-contract.md` and `docs/module-contract.md` with the Reporting host/contribution boundary.
- [ ] Update Help, `DECISIONS.md`, `CHANGELOG.md`, package metadata, and roadmap archive.
- [ ] Add regression coverage for:
  - [ ] Report catalog filters disabled modules.
  - [ ] Report catalog filters missing permissions.
  - [ ] Time Tracking report appears when Time Tracking is enabled and permissions allow it.
  - [ ] Time Tracking report disappears or is blocked when Time Tracking is disabled.
  - [ ] Custom date fields are hidden unless Custom is selected.
  - [ ] Project/subproject/client rollups apply rounding at the correct level.
  - [ ] Reporting no longer uses hard-coded framework-owned page anatomy.
- [ ] Run focused reporting regressions.
- [ ] Run `npm run check`.
- [ ] Run `npm run test:permissions`.
- [ ] Verify `/api/app-info` reports the expected version after implementation.

## Version 0.33.7 - Dashboard and Workbench Formalization as Project hub and work center

### Version 0.33.7.1 - Dashboard and Workbench Surface Contracts

- [ ] Define Dashboard as the workspace overview/orientation surface.
- [ ] Define Workbench as the active work/resumption/focus surface.
- [ ] Keep Dashboard and Workbench separate.
- [ ] Add framework-owned contribution contracts for:
  - [ ] Dashboard panels.
  - [ ] Workbench cards.
  - [ ] Focus modes.
  - [ ] Work item sources.
  - [ ] Next action candidates.
  - [ ] Resume state/context snippets.
- [ ] Remove remaining hardcoded Task/Time assumptions from Dashboard and Workbench where a module contribution can own the behavior.
- [ ] Preserve permission checks, module enabled/disabled checks, and workspace boundaries for every contribution.

### Version 0.33.7.2 - Workbench Focus Modes

- [ ] Add Workbench focus selector.
- [ ] Initial modes:
  - [ ] Pick up where I left off.
  - [ ] Today.
  - [ ] Next due.
  - [ ] This week.
  - [ ] Blocked.
  - [ ] In progress.
  - [ ] Project focus.
  - [ ] Client focus for Business workspaces.
- [ ] Each focus mode should resolve to a normalized focus context passed to module work item providers.
- [ ] Focus modes should be user-friendly labels over deterministic filters, not separate hardcoded pages.

### Version 0.33.7.3 - Next Action Candidates

- [ ] Add normalized next action candidate shape.
- [ ] Tasks should provide first next action candidates.
- [ ] Time Tracking should provide running/paused timer candidates.
- [ ] Lists should provide active/incomplete/needed-soon list candidates when Lists integrations are ready.
- [ ] Notes should provide resume/supporting-context candidates for Active Work notes when Notes integrations are ready.
- [ ] Future Tickets should provide waiting/urgent/assigned ticket candidates.
- [ ] Add deterministic ranking:
  - [ ] Running timers.
  - [ ] Paused timers.
  - [ ] Overdue assigned work.
  - [ ] Due today.
  - [ ] Blocked/stale work.
  - [ ] Recently touched work.
  - [ ] Due this week.
- [ ] Every candidate should provide a reason string, primary action, safe context label, and source URL.

### Version 0.33.7.4 - Resume State Consumption / Where I Left Off UI

- [ ] Consume the framework-owned resume state service introduced in 0.33.5.9.
- [ ] Workbench "Pick up where I left off" should use `/api/work-resume` first.
- [ ] Fall back to recent activity only when no active resume rows exist.
- [ ] Show one recommended resume candidate first.
- [ ] Keep secondary candidates available but visually subordinate.
- [ ] Allow users to dismiss stale resume candidates.
- [ ] Preserve permission checks, disabled-module behavior, deleted-record handling, and private/secure content boundaries.

### Version 0.33.7.5 - Guided Workbench UI

- [ ] Add question-led Workbench entry:
  - [ ] "Pick up where I left off"
  - [ ] "Start with what's due"
  - [ ] "Work this week"
  - [ ] "Review blocked work"
  - [ ] "Focus on a project"
- [ ] Show one recommended next action before showing longer lists.
- [ ] Keep secondary lists available but visually subordinate.
- [ ] Avoid turning Workbench into another full module index.
- [ ] Add empty states that suggest a useful next step instead of dead ends.

### Version 0.33.7.6 - Quick Action Capture Utility Rail

Decision:

Quick Action Capture (QAC) is app-shell utility behavior, not a Workbench focus mode. It should provide low-distraction access to common capture and recovery tools without navigating away from the user's current work surface. QAC should keep the user on the existing screen and simply open modals (where available). The basic concept is to:

- Reduce the likelihood of focus/workflow being interrupted
- Keep productivity focused
- Allow easy idea/concept/thought expungement without derailing the entire work train

- [ ] Add a compact right-side Utility Rail on protected app pages.
  - [ ] Should be icons + small text on wide screens, can be narrowed to strictly icons on narrow screens
  - [ ] Should be available on ALL protected screens (not just the workbench)
  - [ ] A single, drawer-style Quick Action Capture button should float on mobile
    - [ ] The QAC menu drawer button should be an icon that indicates what it is, rather than words that would steal valuable screen real estate
      - Action or Capture should be the main icon driver; Perhaps a fast moving runner? Is there an icon for that?

- [ ] Rail actions should be contributed by enabled modules or mapped from registered module actions.
  - Since we don't know if the user has an idea/thought to contribute to an existing, task, list, or note we should offer an initial modal that allows for finding of the item or creating a new one.
  - [ ] Timer (Should open a modal capable of 2 timers, eventually; for now take you to time-tracker.html)
    - [ ] Add documentation for 0.33.7.7 for creating the timer modal funcationality with a limit of 2 timers
      - Within this documentation include instructions to redirect the QAC timer button to this new modal timer.
  - [ ] Task (Should open a picker to find a task with a button to Add Task, then open the appropriate modal)
  - [ ] Note (Should open a picker to find a note with a button to Add Note, then direct to the appropriate modal)
  - [ ] List (Should open a picker to add an item to a list or add a list, then open the appropriate modal)
  - [ ] Reporting (Should open a report creation modal, eventually; for now take you to reporting.html)
    - [ ] Add documentation for 0.37.5 for creating the reporting modal
  - [ ] File (Should open the Add file modal)
  - [ ] Search (Should open an advanced search modal, eventually; for now take you to search.html)
    - [ ] Add documentation for 0.33.7.8 for creating the advanced search modal functionality with a search result display modal
      - Add documentation in 0.33.7.9 to update all search results to display in this modal, even searches from the main menu ribbon. Yes, this might be a complete overhaul of the search system (or at least a major extension of it) if this needs to go into its own ROADMAP version in 0.33.8, that's also fine. Evaluate at the time of building the documentation, please
  - If a modal action does not exist yet, the QAC action may be hidden, disabled with a clear tooltip, or temporarily link to the existing module page as an explicitly temporary fallback.
  - Temporary navigation fallbacks must be removed once the modal action exists.

- [ ] Actions should open modals without changing the current page.
- [ ] Actions should receive safe current-page context when available.
- [ ] Actions must return focus to the triggering control when closed.
- [ ] The rail must stay visually quiet unless opened by the user.
- [ ] Do not use badges, alerts, or recommendation behavior in the rail; notifications and Workbench own those concerns.

## Version 0.34 - Knowledge Base Module

## Knowledge Base Direction Adjustment

Decision:
Knowledge Base is the reviewed, read-only knowledge layer generated from Notes first. Notes remain the working authoring records. Knowledge Base entries may still be written directly, but the default workflow is note-sourced: normal internal/workspace/client-visible notes become KB review candidates automatically, then reviewers approve and publish safe read-only KB snapshots.

### Add to 0.34.1 - Knowledge Base Module Contract, Publishing Model, and Notes Relationship

* [ ] Define Knowledge Base as the reviewed consumption layer for Notes-backed knowledge.

  * [ ] Notes are the working/source records.
  * [ ] KB articles are reviewed read-only article records or publication snapshots.
  * [ ] Normal note creation/update can automatically create or update a KB review candidate.
  * [ ] Automatic KB candidate creation does not mean automatic publishing.
  * [ ] Publishing remains explicit, permission-protected, audited, and snapshot-based.
  * [ ] KB may support directly authored articles, but direct authoring is secondary to note-sourced workflow.

* [ ] Add KB candidate/source behavior.

  * [ ] Add `source_mode` values:

    * [ ] `note_sourced`
    * [ ] `manual`
    * [ ] `imported`
  * [ ] Add `source_sync_state` or equivalent metadata:

    * [ ] `current`
    * [ ] `source_updated`
    * [ ] `manual_override`
    * [ ] `detached`
  * [ ] Add `source_note_id` convenience field only if it simplifies the common one-note article case; keep `kb_article_sources` as the canonical many-source table.
  * [ ] Add `source_note_revision_id` or use `kb_article_sources.source_revision_id` to preserve the note revision that seeded the reviewed article.
  * [ ] Add `last_source_synced_at`.
  * [ ] Add `last_reviewed_at`.
  * [ ] Add `review_due_at` optional for future maintenance workflows.

* [ ] Define automatic candidate rules.

  * [ ] Normal `internal` notes create internal KB candidates.
  * [ ] Normal `workspace` notes create workspace KB candidates.
  * [ ] Normal `client_visible` notes may create client-visible KB candidates only after client-visible KB permissions and file safety are enabled.
  * [ ] `private` notes do not create KB candidates by default.
  * [ ] `secure` notes must never create KB candidates.
  * [ ] Deleted notes should not create KB candidates.
  * [ ] Archived notes may remain as KB sources, but should not automatically update pending candidates unless explicitly configured.

* [ ] Define KB statuses for note-sourced workflow.

  * [ ] `draft`
  * [ ] `in_review`
  * [ ] `approved`
  * [ ] `published`
  * [ ] `rejected`
  * [ ] `archived`
  * [ ] `deleted`
  * [ ] Manually created articles start as `draft`.
  * [ ] Automatically note-sourced articles start as `in_review`.
  * [ ] Updating a source note marks the KB candidate/publication as `source_updated` or creates a new review revision, but does not silently mutate the published snapshot.
  * [ ] Rejected candidates remain linked to the source note for history unless deleted by a permitted user.

### Add to 0.34.2 - Knowledge Base Browser API, Editorial Workflow, and Internal UI MVP

* [ ] Add automatic note-to-KB candidate service methods.

  * [ ] Create or update candidate from note.
  * [ ] Queue note for KB review.
  * [ ] Read KB candidate by source note.
  * [ ] List KB candidates needing review.
  * [ ] Mark source update pending review.
  * [ ] Detach KB article from source note where permitted.
  * [ ] Reject KB candidate with reason.
  * [ ] Approve KB candidate.
  * [ ] Publish approved KB article snapshot.

* [ ] Add Notes lifecycle hook integration.

  * [ ] On normal note created, create KB candidate if workspace KB candidate policy allows it.
  * [ ] On normal note updated, mark linked KB candidate/publication as source-updated.
  * [ ] On note archived, preserve existing KB linkage but stop automatic updates unless configured.
  * [ ] On note deleted, hide or mark linked KB candidate as source unavailable.
  * [ ] Do not process secure notes.
  * [ ] Do not process private notes unless a future explicit rule allows it.

* [ ] Add KB review queue UI.

  * [ ] Show candidates grouped by source visibility:

    * [ ] Internal
    * [ ] Workspace
    * [ ] Client-visible when enabled
  * [ ] Show source note title, source collection path, source updated date, proposed article title, visibility, review status, and whether the source changed since last review.
  * [ ] Allow reviewers to approve, reject, edit article draft, publish, or detach.
  * [ ] Make it obvious when a published KB article is behind its source note.

### Add to 0.34.3 - Knowledge Base Search, Tags, Attachments, Static Pages, and Permission Boundaries

* [ ] Add KB article chrome/window-dressing generation.

  * [ ] Generate safe table of contents.
  * [ ] Generate "What links here."
  * [ ] Generate related articles from article links, source notes, shared tags, shared collections, and wiki-style links.
  * [ ] Show source-note linkage only to users who can access the source note.
  * [ ] Show source update/review status only to internal users with review/history permission.
  * [ ] Hide internal source data from client-visible/public outputs.
  * [ ] Backlink lists must be permission-filtered and must not leak inaccessible article titles, note titles, files, or counts.

* [ ] Add KB link index support.

  * [ ] Track article-to-article links detected from Markdown/wiki-style links.
  * [ ] Track note-to-article references where useful.
  * [ ] Track source note-to-article relationships through `kb_article_sources`.
  * [ ] Rebuild link indexes when article Markdown, note wiki links, slugs, or source links change.
  * [ ] Broken links should be allowed but clearly labeled for reviewers.

### Add to 0.34.4 - Knowledge Base Settings, Documentation, and Closeout

* [ ] Add KB automation settings.

  * [ ] Configure note-to-KB candidate behavior:

    * [ ] Disabled
    * [ ] Manual only
    * [ ] Auto-create internal/workspace candidates
    * [ ] Auto-create client-visible candidates when supported
  * [ ] Configure default candidate status for note-sourced entries.
  * [ ] Configure whether review is always required before publishing.
  * [ ] Configure whether source note updates reopen review.
  * [ ] Configure whether archived notes can continue feeding KB candidates.
  * [ ] Settings must not bypass permissions, secure-note restrictions, private-note restrictions, file safety, or publication review.

## Version 0.35.0 - Support Tickets Framework Contract

* [ ] Add Support Tickets as a first-party workflow module.

  * [ ] Module ID should be `support-tickets`.
  * [ ] Tickets are workflow records, not framework/core records.
  * [ ] Tickets should use framework-owned services for users, workspaces, permissions, tags, search, notifications, audit logging, file attachments, events/hooks, API scopes, and module lifecycle.
  * [ ] Do not hard-code ticket behavior into framework-owned app shell, search, notification, file, or permission services.
  * [ ] Support Tickets should be disableable per workspace where appropriate.
  * [ ] Disabled ticket module should block new ticket writes while preserving historical reads if `historicalReadAccess` is enabled.

* [ ] Define ticket terminology by workspace type.

  * [ ] Business workspaces should display "Support Tickets" / "Tickets".
  * [ ] Personal and Family workspaces may display "Requests" where terminology is user-facing.
  * [ ] Terminology must be display-only.
  * [ ] Stored module IDs, route names, permission IDs, API scopes, audit record types, and database fields should remain stable.

* [ ] Define core ticket record model.

  * [ ] Add `tickets` table.
  * [ ] Suggested fields:

    * [ ] `ticket_id`
    * [ ] `workspace_id`
    * [ ] `ticket_number` or `display_key`
    * [ ] `client_id` optional
    * [ ] `project_id` optional
    * [ ] `requester_user_id` optional
    * [ ] `requester_name_snapshot`
    * [ ] `requester_email_snapshot`
    * [ ] `title`
    * [ ] `description`
    * [ ] `status`
    * [ ] `priority`
    * [ ] `category`
    * [ ] `source`
    * [ ] `visibility`
    * [ ] `assigned_user_id` optional
    * [ ] `created_by_user_id`
    * [ ] `created_at`
    * [ ] `updated_at`
    * [ ] `closed_at`
    * [ ] `archived_at`
    * [ ] `metadata_json`
  * [ ] Ticket records must always belong to one workspace.
  * [ ] Client/project links must belong to the same workspace as the ticket.
  * [ ] External/client-created tickets should snapshot requester name/email for historical context.

* [ ] Define ticket statuses.

  * [ ] Start with a small boring set:

    * [ ] `new`
    * [ ] `open`
    * [ ] `waiting_on_internal`
    * [ ] `waiting_on_client`
    * [ ] `resolved`
    * [ ] `closed`
    * [ ] `archived`
  * [ ] Keep status labels configurable/display-friendly later.
  * [ ] Do not make tags the source of truth for ticket status.

* [ ] Define ticket priorities.

  * [ ] Start with:

    * [ ] `low`
    * [ ] `normal`
    * [ ] `high`
    * [ ] `urgent`
  * [ ] Priority should be an explicit field.
  * [ ] Do not infer priority from tags.

* [ ] Define ticket sources.

  * [ ] Start with:

    * [ ] `internal`
    * [ ] `client_portal`
    * [ ] `public_api`
    * [ ] `import`
  * [ ] Reserve future source values:

    * [ ] `wordpress`
    * [ ] `shopify`
    * [ ] `email`
    * [ ] `webhook`
    * [ ] `automation`
  * [ ] Source should be metadata, not permission logic.

* [ ] Add ticket ledger foundation.

  * [ ] Add `ticket_entries` or `ticket_ledger_entries` table.
  * [ ] A ticket entry represents a visible ticket timeline item, not the security audit log.
  * [ ] Suggested fields:

    * [ ] `ticket_entry_id`
    * [ ] `workspace_id`
    * [ ] `ticket_id`
    * [ ] `entry_type`
    * [ ] `visibility`
    * [ ] `body`
    * [ ] `created_by_user_id`
    * [ ] `created_at`
    * [ ] `updated_at`
    * [ ] `deleted_at`
    * [ ] `metadata_json`
  * [ ] Entry visibility should be explicit:

    * [ ] `internal`
    * [ ] `client_visible`
  * [ ] Do not use the word `public` in code for client-visible ticket entries unless the entry is truly public internet visible.
  * [ ] Internal entries are visible only to internal users with appropriate ticket permissions.
  * [ ] Client-visible entries are visible to internal users and authorized client/external users who can access the ticket.
  * [ ] Ticket ledger entries should never replace audit logging.

* [ ] Define first ticket entry types.

  * [ ] `initial_request`
  * [ ] `client_reply`
  * [ ] `internal_note`
  * [ ] `status_change`
  * [ ] `assignment_change`
  * [ ] `priority_change`
  * [ ] `attachment_added`
  * [ ] `system_event`
  * [ ] Keep raw audit details out of normal ticket ledger display.

* [ ] Add ticket permissions.

  * [ ] `tickets.view`
  * [ ] `tickets.view_internal`
  * [ ] `tickets.create`
  * [ ] `tickets.create_for_client`
  * [ ] `tickets.reply_client_visible`
  * [ ] `tickets.add_internal_note`
  * [ ] `tickets.update`
  * [ ] `tickets.assign`
  * [ ] `tickets.close`
  * [ ] `tickets.archive`
  * [ ] `tickets.manage_settings`
  * [ ] `tickets.view_all`
  * [ ] Add client/external access checks separately from internal workspace role checks.
  * [ ] A client user should only see tickets explicitly associated with a client/project they can access.

* [ ] Add ticket resource definition.

  * [ ] Resource key: `tickets`.
  * [ ] Supported operations:

    * [ ] `read`
    * [ ] `create`
    * [ ] `update`
    * [ ] `archive`
    * [ ] `restore`
    * [ ] `assign`
    * [ ] `manage`

* [ ] Add ticket audit record types.

  * [ ] `ticket`
  * [ ] `ticket_entry`
  * [ ] Audit ticket creation, updates, assignment changes, status changes, priority changes, archive/restore, client-visible replies, internal notes, attachment links, and API-created tickets.
  * [ ] Audit records should remain admin/security records and should not be shown as the normal ticket timeline.

* [ ] Add ticket events.

  * [ ] `ticket.created`
  * [ ] `ticket.updated`
  * [ ] `ticket.assigned`
  * [ ] `ticket.status_changed`
  * [ ] `ticket.priority_changed`
  * [ ] `ticket.client_reply_added`
  * [ ] `ticket.internal_note_added`
  * [ ] `ticket.resolved`
  * [ ] `ticket.closed`
  * [ ] `ticket.archived`
  * [ ] `ticket.restored`
  * [ ] Event payloads should include workspace, actor, ticket ID, client/project IDs where applicable, safe previous/new values, source, and metadata.
  * [ ] Event payloads should leave room for future automations and integrations.

## Version 0.35.1 - Ticket Browser API and Services

* [ ] Add ticket service methods.

  * [ ] Create ticket.
  * [ ] Read one ticket.
  * [ ] List tickets.
  * [ ] Update ticket fields.
  * [ ] Assign ticket.
  * [ ] Change ticket status.
  * [ ] Change ticket priority.
  * [ ] Archive ticket.
  * [ ] Restore ticket where appropriate.
  * [ ] Add client-visible reply.
  * [ ] Add internal note.
  * [ ] List ticket ledger entries with permission-safe visibility filtering.

* [ ] Add browser API routes.

  * [ ] `GET /api/tickets`
  * [ ] `POST /api/tickets`
  * [ ] `GET /api/tickets/:ticketId`
  * [ ] `PUT /api/tickets/:ticketId`
  * [ ] `POST /api/tickets/:ticketId/assign`
  * [ ] `POST /api/tickets/:ticketId/status`
  * [ ] `POST /api/tickets/:ticketId/priority`
  * [ ] `POST /api/tickets/:ticketId/archive`
  * [ ] `POST /api/tickets/:ticketId/restore`
  * [ ] `GET /api/tickets/:ticketId/entries`
  * [ ] `POST /api/tickets/:ticketId/replies`
  * [ ] `POST /api/tickets/:ticketId/internal-notes`

* [ ] Enforce ticket API permissions.

  * [ ] Every route must validate active workspace.
  * [ ] Every ticket read must validate workspace membership or authorized client/external access.
  * [ ] Internal notes must never be returned to client/external users.
  * [ ] Client-visible replies must be visible only to users allowed to access that ticket.
  * [ ] Update/assign/status/priority actions must require explicit permissions.
  * [ ] Disabled ticket module must block writes.
  * [ ] Historical reads should follow module `historicalReadAccess`.

* [ ] Add ticket list filtering.

  * [ ] Status.
  * [ ] Priority.
  * [ ] Assignee.
  * [ ] Client.
  * [ ] Project.
  * [ ] Requester.
  * [ ] Source.
  * [ ] Updated date.
  * [ ] Created date.
  * [ ] Archived state.
  * [ ] Pagination.

* [ ] Add ticket number/display key generation.

  * [ ] Generate human-readable ticket keys per workspace.
  * [ ] Ensure keys do not collide inside a workspace.
  * [ ] Keep database IDs separate from user-facing ticket keys.

## Version 0.35.2 - Ticket UI MVP

* [ ] Add Tickets navigation and protected views.

  * [ ] Tickets list page.
  * [ ] Ticket detail page.
  * [ ] Create ticket dialog/page.
  * [ ] Edit ticket metadata controls.
  * [ ] Permission-aware buttons and empty states.
  * [ ] Disabled-module state.

* [ ] Add internal ticket creation workflow.

  * [ ] Internal users can create tickets.
  * [ ] Internal users can optionally assign a ticket to a client.
  * [ ] Internal users can optionally assign a ticket to a project.
  * [ ] Internal users can set title, description, priority, category, and assignee where permitted.
  * [ ] Ticket creation should create the first ledger entry.

* [ ] Add ticket detail workflow.

  * [ ] Show ticket title, status, priority, client, project, requester, assignee, created date, updated date, and source.
  * [ ] Show client-visible ledger entries.
  * [ ] Show internal ledger entries only to users with internal ticket access.
  * [ ] Visually distinguish internal notes from client-visible replies.
  * [ ] Allow permitted users to add internal notes.
  * [ ] Allow permitted users to add client-visible replies.
  * [ ] Allow permitted users to change status, priority, and assignment.
  * [ ] Preserve accessibility behavior for form controls, icon buttons, tabs/filters, and status messages.

* [ ] Add tickets list workflow.

  * [ ] Show ticket key, title, status, priority, client/project context, assignee, requester, source, and updated date.
  * [ ] Add basic filters.
  * [ ] Add pagination.
  * [ ] Add empty state.
  * [ ] Add archived filter or archived view.
  * [ ] Keep list UI simple; do not build a full helpdesk dashboard yet.

* [ ] Add client/external ticket visibility groundwork.

  * [ ] Add permission-safe service methods for client-visible ticket reads.
  * [ ] Add UI/API distinction between internal users and external/client users.
  * [ ] Client/external users should not see internal notes, internal-only status details, raw audit records, or private metadata.
  * [ ] Client-facing ticket pages can be minimal in 0.33.x but the permission model must be real.

## Version 0.35.3 - Ticket Integration Hooks

* [ ] Register tickets as searchable records.

  * [ ] Add `searchableTypes` manifest declaration for tickets.
  * [ ] Index ticket title, description, ticket key, client/project context, status, priority, requester snapshot, and safe ledger text.
  * [ ] Internal-only ledger text must only appear in search results for users allowed to see internal ticket content.
  * [ ] Client-visible search results must not expose internal notes.
  * [ ] Search indexing should use the framework search service and adapter, not ticket-specific search queries.

* [ ] Register tickets as taggable records.

  * [ ] Add `taggableTypes` declaration for tickets.
  * [ ] Allow permitted users to assign workspace tags to tickets.
  * [ ] Tags are classification metadata only.
  * [ ] Do not use tags for visibility, status, billing state, or access control.

* [ ] Register tickets as attachable records.

  * [ ] Use the framework file attachment contract.
  * [ ] Tickets should not implement separate file storage.
  * [ ] Attachments should inherit or explicitly declare ticket-entry visibility.
  * [ ] Client-visible attachments must require public/client-safe file handling.
  * [ ] Internal attachments must not be downloadable by client/external users.
  * [ ] Quarantined/pending files must not appear in normal ticket UI.

* [ ] Register ticket notification events.

  * [ ] Notify relevant users when a ticket is created.
  * [ ] Notify assignee when assigned.
  * [ ] Notify followers when status/priority/client-visible reply changes.
  * [ ] Notify internal users when a client-visible reply is added.
  * [ ] Do not notify client/external users about internal notes.
  * [ ] Add ticket follow/unfollow support through framework notification subscriptions.

* [ ] Register ticket Workbench contribution.

  * [ ] Tickets can appear as actionable Workbench items.
  * [ ] Workbench item payload should include ticket key, title, status, priority, client/project context, assignee, due/follow-up date later, source URL, and timer state if Time Tracking is enabled.
  * [ ] Workbench should remain framework-owned.

* [ ] Register ticket timer source.

  * [ ] If Time Tracking is enabled, internal users can start/resume/pause/finalize timers from tickets.
  * [ ] Ticket timers should use the shared Time Tracking active timer engine.
  * [ ] Finalized time entries should preserve ticket metadata.
  * [ ] Do not create a separate ticket timer engine.

* [ ] Add manual task creation hook.

  * [ ] If Tasks is enabled, permitted users can create a task from a ticket.
  * [ ] The created task should link back to the source ticket.
  * [ ] This should be manual in 0.33.x.
  * [ ] Automatic task creation rules should wait for the automation/rules framework in 0.4x.

## Version 0.35.4 - Client Ticket Portal MVP

* [ ] Add minimal client/external ticket creation surface.

  * [ ] Authorized client users can create tickets for their allowed client/project context.
  * [ ] Client users can provide title, description, category, and optional attachment only where file safety permits.
  * [ ] Created tickets should use source `client_portal`.
  * [ ] Created tickets should create a client-visible initial request entry.
  * [ ] Internal users should be notified when appropriate.

* [ ] Add minimal client/external ticket detail surface.

  * [ ] Client users can view tickets they are authorized to access.
  * [ ] Client users can see client-visible entries only.
  * [ ] Client users can add client-visible replies.
  * [ ] Client users can see safe status labels.
  * [ ] Client users cannot see internal notes, internal-only files, raw audit records, private metadata, internal assignment details unless explicitly allowed, or internal search results.

* [ ] Add client/external ticket list surface.

  * [ ] Show ticket key, title, safe status, created date, updated date, and project context where allowed.
  * [ ] Add basic status filtering.
  * [ ] Add pagination.
  * [ ] Keep this portal simple; do not build a full customer support portal yet.

* [ ] Add client ticket access regression tests.

  * [ ] Client users cannot access tickets from another workspace.
  * [ ] Client users cannot access tickets for another client/project.
  * [ ] Client users cannot see internal notes.
  * [ ] Client users cannot download internal-only attachments.
  * [ ] Client-visible replies are visible to the right client users and internal users.
  * [ ] Internal users with proper permission can see both internal and client-visible ledger entries.

## Version 0.35.5 - Ticket Public API Groundwork

* [ ] Add ticket API scopes.

  * [ ] `tickets:read`
  * [ ] `tickets:write`
  * [ ] `tickets:create`
  * [ ] `tickets:reply`
  * [ ] Consider separating `tickets:internal` from client-facing API scopes.
  * [ ] API scopes should be offered only when the Support Tickets module is enabled.

* [ ] Add first safe public API routes for future plugins.

  * [ ] `POST /api/v1/tickets`
  * [ ] `GET /api/v1/tickets/:ticketId` only if permission-safe.
  * [ ] `POST /api/v1/tickets/:ticketId/replies` only if permission-safe.
  * [ ] Keep public API minimal.
  * [ ] Require API keys and scopes.
  * [ ] Validate workspace, client/project context, module state, and allowed source.
  * [ ] Do not expose internal notes through public API.
  * [ ] Do not expose raw audit data through public API.

* [ ] Add source attribution for API-created tickets.

  * [ ] Store source application/plugin identifier where available.
  * [ ] Store safe request metadata.
  * [ ] Leave room for future webhook signatures, replay protection, and per-plugin rate limits.
  * [ ] Avoid building WordPress/Shopify plugins in 0.33.x.

* [ ] Add API regression tests.

  * [ ] Missing/invalid API key is rejected.
  * [ ] Missing scope is rejected.
  * [ ] Disabled ticket module blocks writes.
  * [ ] API-created ticket belongs to the correct workspace.
  * [ ] API-created ticket cannot spoof another workspace/client/project.
  * [ ] Public API cannot create internal notes unless explicitly using an internal/admin scope.
  * [ ] Public API cannot read internal ledger entries.

## Version 0.35.6 - Ticket Regression, Polish, and Closeout

* [ ] Add complete ticket regression coverage.

  * [ ] Tickets cannot cross workspace boundaries.
  * [ ] Client/project links cannot cross workspace boundaries.
  * [ ] Internal users only see tickets permitted by role/resource checks.
  * [ ] Client/external users only see authorized client-visible tickets.
  * [ ] Internal notes are hidden from client/external users.
  * [ ] Client-visible replies are visible to both authorized client users and appropriate internal users.
  * [ ] Ticket status, priority, assignment, archive, and restore actions enforce permissions.
  * [ ] Search does not expose internal ticket content to unauthorized users.
  * [ ] Tags can be assigned only by users with tag assignment permission and ticket access.
  * [ ] Attachments follow ticket and entry visibility.
  * [ ] Notifications do not expose private ticket details.
  * [ ] Disabled ticket module blocks new ticket writes and hides normal navigation.
  * [ ] Historical ticket reads work only when module policy allows them.
  * [ ] Ticket timers require Time Tracking to be enabled.
  * [ ] Create-task-from-ticket requires Tasks to be enabled.

* [ ] Add accessibility and UI regression coverage.

  * [ ] Ticket forms have labels, validation summaries, and keyboard-friendly controls.
  * [ ] Ticket ledger entries have readable structure and status labels.
  * [ ] Internal/client-visible labels are clear.
  * [ ] Icon buttons have accessible names.
  * [ ] Empty/error/loading states are clear.
  * [ ] Client portal views do not leak internal controls.

* [ ] Add documentation notes.

  * [ ] Document ticket visibility rules.
  * [ ] Document internal notes vs client-visible replies.
  * [ ] Document ticket permissions.
  * [ ] Document public API limitations.
  * [ ] Document future plugin and automation hooks.
  * [ ] Document that ticket ledger is not the same as audit log.

* [ ] Release bookkeeping.

  * [ ] Update `DECISIONS.md` or product notes with ticket visibility and ledger decisions.
  * [ ] Update `CHANGELOG.md`.
  * [ ] Bump `package.json` and `package-lock.json`.
  * [ ] Run `npm run check`.
  * [ ] Run `npm run test:permissions`.
  * [ ] Run ticket-specific regression scripts.

## Version 0.36.0 - Calendars and Calendar Views

- [ ] Calendars
  - [ ] Year view
  - [ ] Month view
  - [ ] Week view
  - [ ] Day view
  - [ ] Filters for client (business workspace only)/project

- [ ] Calendar Events
  - [ ] Allow addition of calendar events
  - [ ] Display iCal events from shared calendars

## Version 0.36.5 - Account Home / Cross-Workspace Attention View

Add a framework-owned Account Home view for users who belong to multiple workspaces.

This view must not weaken workspace isolation. It should aggregate only permission-safe summaries from workspaces the current user can access.

Account Home should not query module tables directly. It should use framework-owned summary services, notification records, announcement records, activity-feed records, and module-declared attention providers where available.

The first version should include:

- Workspace cards showing unread/attention counts.
- Active workspace announcements.
- Current-user notifications across accessible workspaces.
- Permission-safe attention items such as overdue tasks, assigned tickets, pending reviews, and stale timers where those modules are enabled.
- Links that switch/open the correct workspace before navigating to the target record.

Do not expose raw audit records, raw event payloads, private module records, or cross-workspace administrative data. Every item must be visible only if the user could read the source record inside that workspace.

## Version 0.37.0 - Expanded Reporting and Invoicing

- [ ] Expanded reporting
- [ ] Invoicing

## Version 0.38.0 - User Account Security Upgrades and Database/Settings File Backup/Restore

### Two Factor Authentication (TOTP) (2FA)

- [ ] Add optional 2FA for users. Can be turned on in the Settings -> User dialog
- [ ] Super admins should be able to turn on a setting that requires 2FA setup on next login for individual users
- [ ] Workspace admins can require users have 2FA to join workspace

### Version 0.38.1 - Passkeys

- [ ] Passkeys

### Version 0.38.2 - User Sessions

- [ ] Sessions should expire after 1 day
- [ ] Super Admins should have ability to log users out
- [ ] Workspace admins should have ability to log users out

## Version 0.38.3 - Login Security Monitoring and Risk Scoring

- [ ] Add `user_login_events` table:
  - [ ] `login_event_id`
  - [ ] `user_id`
  - [ ] `occurred_at`
  - [ ] `success`
  - [ ] `failure_reason`
  - [ ] `ip_address`
  - [ ] `ip_hash`
  - [ ] `user_agent`
  - [ ] `user_agent_hash`
  - [ ] `browser_family`
  - [ ] `os_family`
  - [ ] `device_type`
  - [ ] `country`
  - [ ] `region`
  - [ ] `risk_score`
  - [ ] `risk_reason`
  - [ ] `session_id_hash`
  - [ ] `metadata_json`
- [ ] Log authentication events:
  - [ ] Successful login.
  - [ ] Failed login.
  - [ ] Password reset requested.
  - [ ] Password reset completed.
  - [ ] 2FA challenge success/failure.
  - [ ] Passkey registration/removal.
  - [ ] New device/session.
  - [ ] Logout.
  - [ ] Admin-forced logout.
- [ ] Add login risk checks:
  - [ ] New device/browser.
  - [ ] New country or impossible travel.
  - [ ] IP reputation check if available.
  - [ ] Many failures for same account.
  - [ ] Many failures from same IP.
  - [ ] Successful login after many failures.
  - [ ] Login from TOR/VPN/proxy if detectable.
- [ ] Add risk-based responses:
  - [ ] Low risk: allow login and log event.
  - [ ] Medium risk: allow login and notify user.
  - [ ] High risk: require 2FA/passkey reauthentication if available.
  - [ ] Critical risk: temporarily block or require password reset/admin review.
- [ ] Add user-facing security tools:
  - [ ] Show recent login history in user settings.
  - [ ] Allow user to revoke sessions.
  - [ ] Email/in-app notification for new device login.
  - [ ] Email/in-app notification for suspicious login.
- [ ] Add admin security tools:
  - [ ] View recent failed login patterns.
  - [ ] Force logout user sessions.
  - [ ] Temporarily disable account.
  - [ ] Require password reset.
  - [ ] Require 2FA setup.
- [ ] Privacy rules:
  - [ ] Do not log passwords, tokens, reset tokens, or full session IDs.
  - [ ] Consider hashing or truncating IP addresses for long-term retention.
  - [ ] Define retention period for login events.
  - [ ] Restrict access to login security logs.

## Version 0.38.x - Security, Sessions, Login Monitoring, and Production Hardening

Add dependency note:

This branch depends on the runtime configuration contract from 0.33.5.19. Security-sensitive settings must be validated through `.env`/runtime config before public hosted SaaS launch.

Additional required hardening before hosted SaaS:

- [ ] Production secure cookies.
- [ ] Trusted proxy configuration.
  - [ ] Wire the already-reserved `TRUST_PROXY` env var into `src/config.js` and `app.set('trust proxy', ...)`; it is documented in `.env.example`/`docs/runtime-configuration.md` but currently unread.
- [ ] Login throttling/rate limiting.
- [ ] Async password hashing/verification.
- [ ] Session revocation.
- [ ] Admin-forced logout.
- [ ] Password reset.
- [ ] Security event logging.
- [ ] Backup/restore testing.
- [ ] Runtime secret documentation.

### Version 0.38.4

Super Admins should have a backup/restore function on the dashboard that dumps the current database into a clean file with an app meta data file that has app version stamped and datetime (UTC) of backup in it and zips it into a zip file along with any physical settings files on disk (this will be necessary after packaging for self-hosting and may not yet be necessary, but I want uniform functions for backup/restore that can be easily modified in the future)

- [ ] Create backup function to grab and zip:
  - [ ] Database dump/database file
  - [ ] App meta data file to include app version and datetime stamp of backup
  - [ ] Setup files (can be blank for now)
- [ ] Add backup to user interface for Super Admins in Settings menu
  - Label should be "App Backup"
  - Should only be visible if user is Super Admin (utilize session auth variables to keep from adding/hiding the option)
  - [ ] "Perform backup" button
    - this should then provide a link to the downloadable zip file
    - download should be a temporary file on the server in a "downloads" directory
    - backup should have checksum
    - backup shouldn't delete temporary file until checksum is confirmed
  - [ ] "Perform restore" button
    - this should only accept zip files
    - this should verify files, checksum, etc. before installing/overwriting current data

### Version 0.39.0 - Creator Studio / Content Studio Module

- [ ] Core records:
  - [ ] Content ideas.
  - [ ] Content drafts.
  - [ ] Campaigns/series.
  - [ ] Publishing channels.
  - [ ] Assets/media.
  - [ ] Content templates.
  - [ ] Repurposing tasks.
- [ ] Content idea fields:
  - [ ] Title.
  - [ ] Description/angle.
  - [ ] Workspace.
  - [ ] Client/project if applicable.
  - [ ] Channel(s).
  - [ ] Format: blog, short, long video, email, social post, product page, course material, etc.
  - [ ] Status: idea, planned, drafting, editing, scheduled, published, archived.
  - [ ] Priority.
  - [ ] Target publish date.
  - [ ] Assigned user.
  - [ ] Tags.
  - [ ] Related notes/tasks/assets.
- [ ] Editorial calendar:
  - [ ] Calendar view by publish date.
  - [ ] List view by status.
  - [ ] Kanban view by production stage.
  - [ ] Filter by brand/site/channel/project/tag.
- [ ] Publishing channels:
  - [ ] Website/blog.
  - [ ] YouTube.
  - [ ] Shorts/Reels/TikTok.
  - [ ] Newsletter.
  - [ ] Facebook/Instagram/X/LinkedIn/Mastodon.
  - [ ] Podcast if needed later.
- [ ] Asset library:
  - [ ] Attach images, video, audio, documents, thumbnails, captions, and scripts.
  - [ ] Track asset usage across content items.
  - [ ] Store alt text, captions, source/license notes, and credit requirements.
- [ ] Repurposing workflow:
  - [ ] One long-form item can spawn shorts, social posts, newsletter blurbs, blog excerpts, and follow-up tasks.
  - [ ] Track each derivative item separately but link it to the source content.
- [ ] Analytics groundwork:
  - [ ] Store published URL.
  - [ ] Store basic performance notes manually at first.
  - [ ] Later: integrate platform analytics where APIs allow.
- [ ] Permissions:
  - [ ] Creator Studio records are workspace-scoped.
  - [ ] Client/project-linked content respects existing permissions.
  - [ ] External clients may be allowed to review/comment only if explicitly enabled.

- [ ] Treat Creator Studio as an optional first-party module.
  - [ ] The module should ship with Longtail Forge but be disabled by default for workspaces that do not need it.
  - [ ] It should follow the same module manifest, permissions, navigation, search, tags, notification, file, task, notes, and calendar contracts as every other first-party module.
  - [ ] Do not build it as a separate third-party plugin project yet.
  - [ ] Use it as a real-world test case for whether Longtail Forge modules can compose shared framework services cleanly.

- [ ] Reuse existing first-party modules where appropriate.
  - [ ] Content ideas may start as Creator Studio records but should be linkable to notes and lists.
  - [ ] Content drafts may hook into Notes when Notes exists.
  - [ ] Campaigns/series should likely be Creator Studio-owned hierarchical records.
  - [ ] Assets/media should use the framework file service.
  - [ ] Repurposing work should be able to create/link Tasks.
  - [ ] Publishing dates should hook into Calendar when Calendar exists.
  - [ ] Tags and Search should apply to Creator Studio records.
  - [ ] Notifications should support assignments, due dates, review requests, and scheduled publish reminders later.

- [ ] Add Creator Studio workbench.
  - [ ] Add a dedicated Creator Studio workbench page.
  - [ ] Workbench should be accessible from a picker similar to workspace/module selection.
  - [ ] It should support a focused content-production workflow without cluttering the basic workbench.
  - [ ] It should optionally filter by client/project/brand/channel/campaign.
  - [ ] It should be disabled cleanly when the Creator Studio module is disabled.

- [ ] Define workbench areas as a framework concept.
  - [ ] Basic workbench for general first-party modules such as timers, tasks, notes, and lists.
  - [ ] Focused workbench for one client/project at a time.
  - [ ] Creator Studio workbench for content planning, drafting, assets, campaigns, repurposing, and editorial calendar work.
  - [ ] Future modules may declare their own workbench areas through the module manifest.

## Version 0.39.9 - User Documentation and 0.3x Stabilization Checkpoint

- [ ] Create user-facing documentation for the completed 0.3x feature set.
  - [ ] Getting started.
  - [ ] Workspace types and workspace switching.
  - [ ] Users, roles, and permissions.
  - [ ] Clients and projects.
  - [ ] Time tracking.
  - [ ] Tasks.
  - [ ] Notifications.
  - [ ] Tags.
  - [ ] Search.
  - [ ] Files/attachments if completed in 0.32.x.
  - [ ] Support tickets if completed in 0.33.x.
  - [ ] Notes and knowledge base foundations if completed in 0.34.x.
  - [ ] Calendar basics if completed in 0.35.x.
  - [ ] Shopping/procurement lists if completed in 0.39.x.
  - [ ] Creator/content studio if completed in 0.39.x.
- [ ] Create admin-facing documentation for workspace/module setup.
  - [ ] Module enable/disable behavior.
  - [ ] Workspace-type label differences.
  - [ ] Permission expectations.
  - [ ] Safe file upload/download behavior.
- [ ] Create developer-facing notes for first-party module contracts.
  - [ ] Module manifest fields.
  - [ ] Navigation registration.
  - [ ] Permission declarations.
  - [ ] Notification declarations.
  - [ ] Taggable/searchable declarations.
  - [ ] File attachable declarations.
  - [ ] Workbench card/area declarations.
- [ ] Update `docs/architecture.md` to reflect the completed 0.3x architecture.
- [ ] Verify `ROADMAP.md`, `TODO.md`, `DECISIONS.md`, `CHANGELOG.md`, and package versions are consistent.

- [x] Wipe existing DB migrations and create a new DB baseline  -  Completed in 0.33.5.18.6.5.4.

- [x] Evaluate all existing regressions and see what can be eliminated/lightened  -  Completed in 0.33.5.18.6.5.4 without removing coverage from the standard release gate.

- [x] Determine where efficiencies can be made in the code/Perform an efficiency refactor  -  Initial regression/database efficiency pass completed in 0.33.5.18.6.5.4.

- [ ] Evaluate whether TypeScript would be a useful addition for ensure module/framework contracts are adhered to

- [ ] Audit all Public API calls and make a list for review and modification. Sort by module.

- [ ] Audit all event hooks by module and make a list for review and modification.

## Version 0.40.0 - Project Tools expansion & Database extraction layer for use with SQLite or PostGRES

Now that we have the base layer of a complete project management tool, we can begin expanding actual project management with milestones, dependencies, status reporting, budgeting, estimation, views, templates, etc.

Allowing the app to run on SQLite OR PostGRES makes it more flexible for self-hosted installs; I want the database layer to be able to handle either one, based on the settings/.env file

Below is a rough road map for all of the 0.40 branch, this is not finalized yet

- [ ] Add topics to GitHub for discovery

### Project Tools expansion

- [ ] Project Milestones/Phases/Deliverables
  - Milestones belong to a workspace and optionally a client/project
  - Tasks, notes, tickets, time entries, and files may eventually link to a milestone
  - Milestones should have a title, description, status, due date, sort order, and optional completion/completed date
  - This should not block basic tasks, but the data model should leave room for it

- [ ] Task dependencies/blockers
  - Allow one task to depend on another task
  - Show blocked tasks clearly
  - Prevent circular dependencies
  - Allow blocked-by relationships across the same project, and maybe later across projects
  - More formal task workflow, such as `backlog`, `ready`, `in_progress`, `waiting`, `blocked`, `in_review`, `approved`, `complete`, `canceled`, and `archived`, often with rules about which statuses can move to which next statuses.

- [ ] Project Status/Health
  - Project status: active, paused, completed, archived
  - Project heatlh: on_track, at_risk, blocked, waiting_on_client
  - Dashboard should eventually surface project health

- [ ] Project budgeting/estimation/actuals
  - should be optional for personal/family projects
  - [ ] Add estimated hours to projects
  - [ ] Add optional budgeted hours/dollars to projects
  - [ ] Compare estimated vs actual tracked time
  - [ ] Show budget/burn progress on project pages and dashboard
  - [ ] Allow reporting by client, project, milestone, tag, and date range

- [ ] List/Kanban/Calendar views
  - [ ] Add list view for tasks
  - [ ] Add Kanban board view for tasks grouped by status
  - [ ] Add calendar view for tasks with due dates

- [ ] Project/task templates
  - should have hard-coded, initial examples that can be used as well as saved templates
  - [ ] Add task templates
  - [ ] Add project templates
  - [ ] Allow project templates to create default milestones, tasks, notes, and checklists
  - [ ] Allow workspace-level templates first
  - [ ] Later: allow client-specific templates

- [ ] Task checklists (tasks can have sub-item checklists)
  - Checklist items belong to a task
  - Items can be checked/unchecked and sorted
    - sort by: due date, importance, etc.
  - Checklist completion can optionally contribute to task progress

- [ ] Task/Project discussions
  - [ ] Add comments to tasks
  - [ ] Add comments to projects
  - [ ] Add internal comments to support tickets
  - [ ] Comments should respect permissions and visibility
  - [ ] Comments should appear in activity feeds where appropriate

- [ ] Files/attachments foundation
  - [ ] Add file attachment foundation for notes/tasks/support tickets/projects
  - [ ] Store file metadata in database
  - [ ] Decide local storage vs object storage later
  - [ ] Respect workspace/client/project permissions
  - [ ] Public-safe attachments required before public KB/client portal features

- [ ] Project Owner/Responsible-user fields
  - [ ] Workspace owner
  - [ ] Client/account owner
  - [ ] Project owner
  - [ ] Ticket owner
  - [ ] Task/ticket assignee remains separate from project ownership

- [ ] Saved views
  - people will want views like: "Tasks due this week," "Waiting on client," "Client open tickets," etc.
  - [ ] Allow users to save commenly used filters
  - [ ] Saved views may apply to tasks, time entries, tickets, notes, and dashboard sections
  - [ ] Views should be user-specific first
  - [ ] Workspace-share views can come later

- [ ] Client approvals/change requests
  - [ ] Add lightweight approval records
  - [ ] Add change request records
  - [ ] Link approvals/change requests to clients, projects, milestones, tasks, notes, or tickets
  - [ ] Track requested_by, approved_by, approved_at, status, and notes
  - [ ] Consider client-facing approvals only after permissions/client portal features exist

- [ ] Timeline/Gannt-style view

- [ ] Workload/capacity planning

- [ ] Portfolio-level reporting across clients/projects/workspaces

### Database Tools

- [ ] Configuration files for initial configuration
  - [ ] Merge all previous migrations to make unified initial SQL
- [ ] Migration tools to switch between database backends
- [ ] Export/Import database tools
  - [ ] Allow users to export their workspaces

### App Decisions

- [ ] Define archival period
- [ ] Define lifecycle of tasks, notes, tickets, etc.

## Version 0.43.0

- [ ] Email delivery
- [ ] Invite links
- [ ] Single Sign-On (SSO)

## Version 0.45.0 - Phone/Tablet/TV app prep

- Prepare APIs for Phone/Tablet/TV apps

- Universal Longtail Forge app for iOS

- Universal Longtail Forge app for Android (Latest)

- Roku apps for coordinating teams/families
  - Displays Calendar/Task Lists/Current-Upcoming Day Events

## Version 0.50.0 - Production, Packaging, and Self-Hosting

- [ ] Move to a demo production environment
- [ ] Add PostgreSQL support
  - [ ] Add a database adapter layer so the app is not permanently tied to shelling out to the SQLite CLI
  - [ ] Keep SQLite support for local/self-hosted lightweight installs if practical
  - [ ] PostgreSQL should become the preferred production database
- [ ] Add file attachment abilities to notes/tasks/support tickets
- [ ] Docker Compose
- [ ] Setup wizard
- [ ] Admin docs
- [ ] Add production cookie flags
- [ ] Self-hosted release
- [ ] Expand project management tools

### Added during 0.30.6 Code Review

- Verify runtime data directory permissions for `data/`, `logs/`, and `archive/`.
- Ensure the SQLite database file is not web-served under any configuration.
- Add startup warnings when data/log directories are world-readable or world-writable on platforms where that can be checked reliably.
- Add backup/restore path validation that prevents writing outside approved runtime directories.
- Consider an install health-check endpoint or CLI command that reports filesystem lockdown status without exposing sensitive paths to normal users.

## Version 0.60.0 - SaaS Wrapper

This will be a private plugin, only available to me.

- [ ] SaaS wrapper
- [ ] Hosted PostgreSQL
- [ ] Tenant signup
- [ ] Billing
- [ ] Monitoring

## Version 0.70.0 - Integrations and Plugin Readiness

### Guidelines/Notes for Integrations

- [ ] Integration architecture
  - [ ] Integrations should authenticate through API keys, OAuth, or integration-specific credentials as appropriate
  - [ ] Integrations should respect workspace, client, project, and user permissions
  - [ ] Integration events should be audit logged where appropriate
  - [ ] Integration-created records should identify their source in metadata
  - [ ] Avoid integration-specific logic leaking into core services where a module or adapter would be cleaner

### Potential Integrations List

#### Support tickets

- [ ] ZenDesk
- [ ] FreshDesk
- [ ] GitHub Issues

#### Calendars

- [ ] Google Calendar
- [ ] Outlook Calendar

#### Task/To Do App Integrations

- [ ] Microsoft To Do
- [ ] Google Tasks
- [ ] Identify others in the marketplace

#### File Sharing and Storage

Is it possible to get notifications from any of these sources?

- [ ] DigitalOcean Spaces
- [ ] AWS
- [ ] Microsoft Azure
- [ ] Microsoft OneDrive
- [ ] Google Drive
- [ ] DropBox
- [ ] Microsoft SharePoint
  - File sharing
  - Knowledgebase pages
  - Input for tickets/notes/tasks/etc.
- [ ] GitHub (Repository Linking)

#### Email integrations

Auto-routing communications/messaging

- [ ] Google Workspace email
- [ ] Outlook

#### eCommerce Plugins

- [ ] Knowledge Base plugin
- [ ] Support ticket plugin
  - Would include notes plugin for Shopify Admin
- [ ] Automated task creation from:
  - Front-end support tickets
  - Order issues (fulfillment failure, etc.)

- [ ] WordPress/WooCommerce
- [ ] Shopify
- [ ] Magento
- [ ] BigCommerce

#### Personal/Family Workspace Integrations

- [ ] Create grocery/shopping list items from Home Assistant (voice commands inputs)
- [ ] Update/create project tasks from Home Assistant (voice commands inputs)

- [ ] Home Assistant
- [ ] Apple Home
- [ ] Google Assistant (Google Home?)

#### Analytics (Creator Studio)

- [ ] WordPress
- [ ] YouTube
- [ ] TikTok
- [ ] Twitch
- [ ] Facebook
- [ ] Instagram
- [ ] Threads
- [ ] X
- [ ] BlueSky
- [ ] Mastodon
- [ ] Buffer

#### Publishing (Creator Studio)

The Creator studio tool can be much richer if it pushes content out to these platforms, or stores them there until ready for publishing.

- [ ] WordPress (Posts first, the Custom Post Types)
- [ ] Shopify (Blogs)
- [ ] Social Media
  - [ ] YouTube
  - [ ] TikTok
  - [ ] Twitch
  - [ ] Facebook
  - [ ] Instagram
  - [ ] Threads
  - [ ] X
  - [ ] BlueSky
  - [ ] Mastodon
  - [ ] Buffer

## Version 0.71.0

- [ ] Buy domain name
  - [ ] Launch website

- [ ] Launch Social Media
