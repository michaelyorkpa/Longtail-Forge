# Regression Suite Performance Baseline

This document is the 0.33.5.29.1 measurement artifact for the regression and check-suite performance branch. It records the pre-optimization baseline, suite inventory, and target list. This slice intentionally changes no runner behavior and does not drop coverage.

## Baseline Run

- Version target: 0.33.5.29.1.
- Command: `LTF_REGRESSION_TIMING_JSON=tmp\0.33.5.29.1-regression-timing.json npm run check`.
- Measured on: 2026-07-07 00:44 -04:00.
- Result: `npm run check` passed: 294/294 regression scripts plus ESLint.
- Runner timing JSON reported 109.57 wall seconds for the regression runner before ESLint.
- A first measurement attempt completed 294/294 scripts in 98.95 seconds but exited before ESLint because the `LTF_REGRESSION_TIMING_JSON` parent directory did not exist. Later runner/docs work should either create the parent directory or document that the directory must already exist.

## Bucket Inventory

| Bucket | Mode | Concurrency | Scripts | Script seconds | Wall seconds | Data fixture |
| --- | --- | --- | --- | --- | --- | --- |
| static/source regressions | parallel | 6 | 137 | 105.20 | 20.57 | none |
| default database regressions | serial | 1 | 6 | 11.60 | 11.60 | serial database fixture |
| file storage regressions | serial | 1 | 30 | 38.53 | 38.53 | serial database and file storage fixtures |
| isolated database regressions | parallel | 4 | 121 | 153.17 | 38.83 | isolated per-script database fixture |

The simulated wall seconds match the runner total within rounding because buckets run in order. The main wall-clock contributors are the serial file-storage bucket, the isolated database bucket at concurrency 4, and the static/source bucket's scan-heavy scripts.

## Slow Tail

| Script | Bucket | Seconds | Data fixture |
| --- | --- | --- | --- |
| scripts/check-js.mjs | static/source regressions | 11.45 | none |
| scripts/separate-worker-end-to-end-regression.mjs | isolated database regressions | 11.29 | isolated DB |
| scripts/task-checklist-editor-display-regression.mjs | static/source regressions | 5.98 | none |
| scripts/search-contract-regression.mjs | default database regressions | 5.19 | serial DB/search |
| scripts/sqlite-small-office-performance-regression.mjs | static/source regressions | 5.07 | none |
| scripts/sqlite-connection-hardening-regression.mjs | isolated database regressions | 5.01 | isolated DB |
| scripts/high-volume-admin-lists-regression.mjs | static/source regressions | 4.72 | none |
| scripts/file-scanner-health-diagnostics-regression.mjs | file storage regressions | 3.74 | serial DB/files |
| scripts/files-descriptor-host-regression.mjs | static/source regressions | 3.70 | none |
| scripts/view-descriptor-bootstrap-regression.mjs | static/source regressions | 3.63 | none |
| scripts/runtime-configuration-contract-regression.mjs | static/source regressions | 3.52 | none |
| scripts/file-clamd-adapter-regression.mjs | file storage regressions | 3.30 | serial DB/files |
| scripts/file-clamscan-adapter-regression.mjs | file storage regressions | 3.28 | serial DB/files |
| scripts/file-scanner-mode-resolver-regression.mjs | file storage regressions | 3.26 | serial DB/files |
| scripts/scale-seed-framework-regression.mjs | isolated database regressions | 3.20 | isolated DB |
| scripts/database-migration-locking-regression.mjs | isolated database regressions | 3.20 | isolated DB |
| scripts/batched-list-enrichment-regression.mjs | static/source regressions | 2.84 | none |
| scripts/runtime-diagnostics-route-regression.mjs | static/source regressions | 2.72 | none |
| scripts/parameter-binding-conversion-wave-regression.mjs | static/source regressions | 2.43 | none |
| scripts/tasks-server-side-list-paging-regression.mjs | isolated database regressions | 2.33 | isolated DB |

## Script Categories

- Total scripts: 294.
- Static/no-runner-database scripts: 137.
- Runner database-fixture scripts: 157.
- Closeout scripts: 21, 14.80 script seconds in this run.
- Focused scripts: 273.
- Static scripts at or below the process-floor band of 0.20 seconds: 72; these are dominated by child-process startup and simple file reads.
- Database-bucket scripts with no obvious database signal from source inspection: 5; these are candidates to verify before moving buckets, not automatic moves.

## Source-Scan Cluster

The roadmap named six database-contract guardrails as a likely whole-source scan cluster. Re-reading the live scripts shows that three currently walk the whole `src` tree and three are adjacent database-contract checks that read narrower source/doc targets. The six should still be considered together, but 0.33.5.29.2 should start with a shared scan helper proof for the actual full-tree walkers instead of assuming all six duplicate identical work today.

| Script | Seconds | Current scan behavior |
| --- | --- | --- |
| scripts/parameter-binding-audit-regression.mjs | 1.07 | walks src tree today |
| scripts/parameter-binding-layer-regression.mjs | 1.87 | database-contract adjacent, no full src walk observed today |
| scripts/parameter-binding-conversion-wave-regression.mjs | 2.43 | database-contract adjacent, no full src walk observed today |
| scripts/interpolation-enforcement-guardrail-regression.mjs | 0.32 | walks src tree today |
| scripts/dialect-enforcement-guardrail-regression.mjs | 0.31 | walks src tree today |
| scripts/database-agnostic-contract-closeout-regression.mjs | 0.20 | database-contract adjacent, no full src walk observed today |

Total script seconds for the six-script database-contract cluster in this run: 6.20.

## 0.33.5.29.2 Source-Scan Consolidation Result

0.33.5.29.2 extracted the repeated runtime source walking, source-entry reads, line-number calculation, and call-expression parsing into `scripts/test-support/source-scan.mjs`. The three actual whole-`src` guardrails now use that shared support:

- `scripts/parameter-binding-audit-regression.mjs`
- `scripts/interpolation-enforcement-guardrail-regression.mjs`
- `scripts/dialect-enforcement-guardrail-regression.mjs`

The parameter-binding audit now reads the runtime source tree once and reuses those entries for its inventory plus the `RETURNING`, SQLite JSON, `UPDATE`/`DELETE LIMIT`, and variable-bound `NOT IN` source-match checks. The interpolation and dialect guardrails also consume the shared source-entry and line-number helpers.

The three suite entries were intentionally retained instead of being collapsed into a single registered script. That keeps each guardrail's standalone output, assertion owner, and historical script path stable until the coverage ratchet lands in 0.33.5.29.4. The three adjacent database-contract scripts remain separate because they still read narrower source/docs or exercise database-backed binding behavior rather than walking the full runtime source tree.

After-conversion standalone timing sample:

| Script | 0.33.5.29.1 baseline seconds | 0.33.5.29.2 sample seconds |
| --- | ---: | ---: |
| scripts/parameter-binding-audit-regression.mjs | 1.07 | 0.35 |
| scripts/interpolation-enforcement-guardrail-regression.mjs | 0.32 | 0.15 |
| scripts/dialect-enforcement-guardrail-regression.mjs | 0.31 | 0.16 |

The three-script whole-source walker sample dropped from 1.70 seconds to 0.66 seconds on the local run. Two deliberate break checks were also run against a temporary source probe: interpolation rejected a reintroduced `sqlText()` helper/interpolated operation, and dialect rejected raw `rowid` plus `COLLATE NOCASE`. The probe file was removed before final verification.

## Closeout Overlap Map

The closeout scripts below are the 0.33.5.29.5 overlap-inspection pool. This list is not a deletion list. Each retained or retired assertion needs the 0.33.5.29.4 ratchet/manifest before scripts are folded.

| Script | Bucket | Seconds | Data fixture |
| --- | --- | --- | --- |
| scripts/view-conversion-branch-closeout-regression.mjs | static/source regressions | 1.95 | none |
| scripts/module-file-closeout-regression.mjs | static/source regressions | 1.62 | none |
| scripts/task-qol-closeout-regression.mjs | isolated database regressions | 1.19 | isolated DB |
| scripts/lists-closeout-regression.mjs | isolated database regressions | 1.18 | isolated DB |
| scripts/work-resume-state-closeout-regression.mjs | isolated database regressions | 1.16 | isolated DB |
| scripts/notes-integration-closeout-regression.mjs | isolated database regressions | 1.12 | isolated DB |
| scripts/files-time-tracking-qol-closeout-regression.mjs | isolated database regressions | 1.07 | isolated DB |
| scripts/async-recurrence-response-closeout-regression.mjs | isolated database regressions | 1.06 | isolated DB |
| scripts/better-sqlite3-driver-closeout-regression.mjs | isolated database regressions | 1.06 | isolated DB |
| scripts/clients-projects-strict-closeout-regression.mjs | static/source regressions | 1.03 | none |
| scripts/notes-slideout-closeout-regression.mjs | static/source regressions | 0.58 | none |
| scripts/files-browse-edit-preview-closeout-regression.mjs | static/source regressions | 0.31 | none |
| scripts/files-conversion-closeout-regression.mjs | static/source regressions | 0.27 | none |
| scripts/database-agnostic-contract-closeout-regression.mjs | static/source regressions | 0.20 | none |
| scripts/view-builder-closeout-regression.mjs | static/source regressions | 0.19 | none |
| scripts/runtime-database-foundation-closeout-regression.mjs | static/source regressions | 0.18 | none |
| scripts/notes-import-closeout-regression.mjs | static/source regressions | 0.18 | none |
| scripts/surface-standardization-closeout-regression.mjs | static/source regressions | 0.16 | none |
| scripts/markdown-closeout-regression.mjs | static/source regressions | 0.12 | none |
| scripts/tasks-conversion-closeout-regression.mjs | static/source regressions | 0.10 | none |
| scripts/file-storage-scanner-runtime-closeout-regression.mjs | file storage regressions | 0.07 | review no-db signal |

## Database-Fixture Review Candidates

These scripts run in a database bucket but their source did not show an obvious database/runtime service signal during the 0.33.5.29.1 static review. Later slices should verify them before moving them; their combined measured time is small, so this is not the primary speed target.

| Script | Bucket | Seconds | Current runner fixture |
| --- | --- | --- | --- |
| scripts/file-storage-scanner-runtime-closeout-regression.mjs | file storage regressions | 0.07 | review no-db signal |
| scripts/file-scanner-setup-docs-regression.mjs | file storage regressions | 0.07 | review no-db signal |
| scripts/task-modal-compact-layout-regression.mjs | isolated database regressions | 0.07 | review no-db signal |
| scripts/task-modal-reflow-regression.mjs | isolated database regressions | 0.07 | review no-db signal |
| scripts/task-modal-followup-regression.mjs | isolated database regressions | 0.07 | review no-db signal |

## Target List

1. Source-scan consolidation target for 0.33.5.29.2: completed by introducing shared scan support around the actual whole-`src` walkers first (parameter-binding audit, interpolation guardrail, dialect guardrail). The three adjacent database-contract scripts remain separate because they read narrower source/docs or exercise database-backed binding behavior. The single-process fold is deferred until the coverage ratchet can record assertion movement without lowering the suite floor silently.

2. Runner scheduling target for 0.33.5.29.3: evaluate exactly one runner change after measurement. The isolated bucket has 153.17 script seconds and 38.83 simulated wall seconds at concurrency 4; safe auto-tuning may matter more than source-scan work if it does not worsen the known flake. The file-storage bucket contributes 38.53 serial wall seconds, but it should stay serial until storage/database isolation is proven safe.

3. Coverage ratchet target for 0.33.5.29.4: add a manifest/count guard before deleting or folding any script. The current floor is 294 registered scripts and 21 closeout scripts; a later lower script count is allowed only with documented assertion movement or a dead-target retirement entry.

4. Closeout consolidation target for 0.33.5.29.5: inspect the 21 closeout scripts that consume 14.79 script seconds. The likely wins are fewer process starts and fewer repeated branch-boundary assertions, not a large single-script slow-tail reduction. Expected reduction: about 2-5 script seconds plus lower future maintenance noise if the ratchet preserves each distinct assertion.

5. Isolated-DB flake target for 0.33.5.29.6: this slice did not quantify the isolated-DB flake. Keep flake work separate from speed work. The proof should stress the isolated bucket under default and higher parallelism, then inspect per-script temp/database/path/lock/port ownership.

6. Check/lint target for 0.33.5.29.7: `scripts/check-js.mjs` is the slowest regression script at 11.45 seconds, and `npm run check` runs ESLint after the regression runner. Review duplicate JS scanning and ESLint caching only in the final check/lint slice, keeping the same gate semantics.

## Full Per-Script Timing Appendix

| Script | Bucket | Seconds | Ownership | Data fixture | Scan tag |
| --- | --- | --- | --- | --- | --- |
| scripts/check-js.mjs | static/source regressions | 11.45 | focused | none | repo JS scan |
| scripts/accessibility-regression.mjs | static/source regressions | 0.09 | focused | none |  |
| scripts/event-bus-regression.mjs | static/source regressions | 1.62 | focused | none |  |
| scripts/runtime-configuration-contract-regression.mjs | static/source regressions | 3.52 | focused | none |  |
| scripts/runtime-env-loading-regression.mjs | static/source regressions | 0.47 | focused | none |  |
| scripts/runtime-local-env-materialization-regression.mjs | static/source regressions | 0.23 | focused | none |  |
| scripts/runtime-diagnostics-route-regression.mjs | static/source regressions | 2.72 | focused | none |  |
| scripts/sqlite-small-office-readout-regression.mjs | static/source regressions | 0.17 | focused | none |  |
| scripts/runtime-database-foundation-closeout-regression.mjs | static/source regressions | 0.18 | closeout | none |  |
| scripts/parameter-binding-audit-regression.mjs | static/source regressions | 1.07 | focused | none | whole src scan |
| scripts/parameter-binding-layer-regression.mjs | static/source regressions | 1.87 | focused | none | DB-contract adjacent |
| scripts/parameter-binding-conversion-wave-regression.mjs | static/source regressions | 2.43 | focused | none | DB-contract adjacent |
| scripts/interpolation-enforcement-guardrail-regression.mjs | static/source regressions | 0.32 | focused | none | whole src scan |
| scripts/dialect-enforcement-guardrail-regression.mjs | static/source regressions | 0.31 | focused | none | whole src scan |
| scripts/database-agnostic-contract-closeout-regression.mjs | static/source regressions | 0.20 | closeout | none | DB-contract adjacent |
| scripts/better-sqlite3-install-smoke.mjs | static/source regressions | 0.34 | focused | none |  |
| scripts/better-sqlite3-helper-core-regression.mjs | static/source regressions | 1.80 | focused | none |  |
| scripts/audit-extensibility-regression.mjs | static/source regressions | 1.66 | focused | none |  |
| scripts/search-results-page-regression.mjs | static/source regressions | 0.18 | focused | none |  |
| scripts/regression-runner-regression.mjs | static/source regressions | 0.15 | focused | none |  |
| scripts/regression-clean-clone-contract.mjs | static/source regressions | 0.34 | focused | none |  |
| scripts/tag-usability-ui-regression.mjs | static/source regressions | 0.14 | focused | none |  |
| scripts/tag-inline-picker-regression.mjs | static/source regressions | 0.17 | focused | none |  |
| scripts/tag-record-workflow-regression.mjs | static/source regressions | 0.18 | focused | none |  |
| scripts/tag-management-page-regression.mjs | static/source regressions | 0.13 | focused | none |  |
| scripts/file-ui-integration-regression.mjs | static/source regressions | 0.15 | focused | none |  |
| scripts/module-file-closeout-regression.mjs | static/source regressions | 1.62 | closeout | none |  |
| scripts/notes-developer-docs-regression.mjs | static/source regressions | 0.13 | focused | none |  |
| scripts/notes-context-terminology-regression.mjs | static/source regressions | 0.16 | focused | none |  |
| scripts/notes-modal-stack-guardrails-regression.mjs | static/source regressions | 0.16 | focused | none |  |
| scripts/notes-tags-stacked-modal-regression.mjs | static/source regressions | 0.15 | focused | none |  |
| scripts/notes-files-stacked-modal-regression.mjs | static/source regressions | 0.17 | focused | none |  |
| scripts/linked-context-provider-contract-regression.mjs | static/source regressions | 1.76 | focused | none |  |
| scripts/linked-context-picker-shell-regression.mjs | static/source regressions | 0.18 | focused | none |  |
| scripts/notes-import-closeout-regression.mjs | static/source regressions | 0.18 | closeout | none |  |
| scripts/project-hierarchy-move-regression.mjs | static/source regressions | 0.18 | focused | none |  |
| scripts/app-shell-navigation-regression.mjs | static/source regressions | 2.17 | focused | none |  |
| scripts/module-sanity-check.mjs | static/source regressions | 1.87 | focused | none |  |
| scripts/ui-contract-regression.mjs | static/source regressions | 0.15 | focused | none |  |
| scripts/surface-token-contract-regression.mjs | static/source regressions | 0.15 | focused | none |  |
| scripts/modal-section-contract-regression.mjs | static/source regressions | 0.17 | focused | none |  |
| scripts/modal-footer-contract-regression.mjs | static/source regressions | 0.18 | focused | none |  |
| scripts/overlay-host-contract-regression.mjs | static/source regressions | 0.20 | focused | none |  |
| scripts/drawer-main-surface-contract-regression.mjs | static/source regressions | 0.17 | focused | none |  |
| scripts/surface-adoption-pass-regression.mjs | static/source regressions | 0.15 | focused | none |  |
| scripts/surface-standardization-closeout-regression.mjs | static/source regressions | 0.16 | closeout | none |  |
| scripts/view-builder-contract-regression.mjs | static/source regressions | 0.23 | focused | none |  |
| scripts/view-builder-helper-regression.mjs | static/source regressions | 0.29 | focused | none |  |
| scripts/lists-view-builder-pilot-regression.mjs | static/source regressions | 0.16 | focused | none |  |
| scripts/view-builder-converted-surface-guardrails.mjs | static/source regressions | 0.19 | focused | none |  |
| scripts/view-builder-closeout-regression.mjs | static/source regressions | 0.19 | closeout | none |  |
| scripts/view-descriptor-manifest-regression.mjs | static/source regressions | 0.27 | focused | none |  |
| scripts/view-descriptor-reference-regression.mjs | static/source regressions | 0.33 | focused | none |  |
| scripts/view-descriptor-terminology-regression.mjs | static/source regressions | 0.15 | focused | none |  |
| scripts/view-descriptor-declarative-guardrails.mjs | static/source regressions | 2.00 | focused | none |  |
| scripts/view-conversion-branch-closeout-regression.mjs | static/source regressions | 1.95 | closeout | none |  |
| scripts/view-renderer-shell-regression.mjs | static/source regressions | 0.27 | focused | none |  |
| scripts/view-descriptor-bootstrap-regression.mjs | static/source regressions | 3.63 | focused | none |  |
| scripts/view-renderer-data-binding-regression.mjs | static/source regressions | 0.21 | focused | none |  |
| scripts/files-descriptor-host-regression.mjs | static/source regressions | 3.70 | focused | none |  |
| scripts/files-filter-sidebar-regression.mjs | static/source regressions | 0.22 | focused | none |  |
| scripts/files-browse-list-shell-regression.mjs | static/source regressions | 0.20 | focused | none |  |
| scripts/files-browse-compact-reset-regression.mjs | static/source regressions | 0.18 | focused | none |  |
| scripts/files-edit-modal-shell-regression.mjs | static/source regressions | 0.14 | focused | none |  |
| scripts/files-edit-modal-save-regression.mjs | static/source regressions | 0.29 | focused | none |  |
| scripts/files-preview-modal-regression.mjs | static/source regressions | 0.23 | focused | none |  |
| scripts/files-browse-edit-preview-closeout-regression.mjs | static/source regressions | 0.31 | closeout | none |  |
| scripts/files-upload-shell-regression.mjs | static/source regressions | 0.28 | focused | none |  |
| scripts/files-attachment-panel-shell-regression.mjs | static/source regressions | 0.22 | focused | none |  |
| scripts/files-row-attachment-actions-regression.mjs | static/source regressions | 0.22 | focused | none |  |
| scripts/files-visual-state-control-parity-regression.mjs | static/source regressions | 0.22 | focused | none |  |
| scripts/files-strict-guardrail-inventory-regression.mjs | static/source regressions | 0.20 | focused | none |  |
| scripts/files-conversion-closeout-regression.mjs | static/source regressions | 0.27 | closeout | none |  |
| scripts/view-index-primitive-regression.mjs | static/source regressions | 0.29 | focused | none |  |
| scripts/view-shared-capabilities-regression.mjs | static/source regressions | 0.54 | focused | none |  |
| scripts/view-renderer-actions-regression.mjs | static/source regressions | 0.24 | focused | none |  |
| scripts/lists-declarative-readonly-surface-regression.mjs | static/source regressions | 0.16 | focused | none |  |
| scripts/lists-items-modals-descriptor-regression.mjs | static/source regressions | 0.22 | focused | none |  |
| scripts/lists-workflow-linked-layout-regression.mjs | static/source regressions | 0.29 | focused | none |  |
| scripts/batched-list-enrichment-regression.mjs | static/source regressions | 2.84 | focused | none |  |
| scripts/high-volume-admin-lists-regression.mjs | static/source regressions | 4.72 | focused | none |  |
| scripts/sqlite-small-office-performance-regression.mjs | static/source regressions | 5.07 | focused | none |  |
| scripts/notes-declarative-readonly-surface-regression.mjs | static/source regressions | 0.42 | focused | none |  |
| scripts/notes-slideout-closeout-regression.mjs | static/source regressions | 0.58 | closeout | none |  |
| scripts/notes-server-side-list-paging-regression.mjs | static/source regressions | 2.21 | focused | none |  |
| scripts/notes-records-filters-repository-conversion-regression.mjs | static/source regressions | 1.82 | focused | none |  |
| scripts/notes-writes-revisions-links-collections-repository-conversion-regression.mjs | static/source regressions | 1.51 | focused | none |  |
| scripts/markdown-platform-contract-regression.mjs | static/source regressions | 0.10 | focused | none |  |
| scripts/markdown-renderer-service-regression.mjs | static/source regressions | 0.30 | focused | none |  |
| scripts/markdown-closeout-regression.mjs | static/source regressions | 0.12 | closeout | none |  |
| scripts/notes-external-markdown-links-preference-regression.mjs | static/source regressions | 1.57 | focused | none |  |
| scripts/notes-file-preview-actions-regression.mjs | static/source regressions | 0.11 | focused | none |  |
| scripts/user-theme-auto-mode-regression.mjs | static/source regressions | 1.52 | focused | none |  |
| scripts/dashboard-workbench-regression.mjs | static/source regressions | 1.02 | focused | none |  |
| scripts/task-list-density-regression.mjs | static/source regressions | 0.08 | focused | none |  |
| scripts/task-list-canonical-ui-regression.mjs | static/source regressions | 0.12 | focused | none |  |
| scripts/tasks-declarative-readonly-surface-regression.mjs | static/source regressions | 0.14 | focused | none |  |
| scripts/tasks-filter-sidebar-anatomy-regression.mjs | static/source regressions | 0.10 | focused | none |  |
| scripts/tasks-readonly-list-binding-regression.mjs | static/source regressions | 0.13 | focused | none |  |
| scripts/tasks-bulk-toolbar-shell-regression.mjs | static/source regressions | 0.10 | focused | none |  |
| scripts/tasks-bulk-nondestructive-toolbar-regression.mjs | static/source regressions | 1.77 | focused | none |  |
| scripts/tasks-bulk-lifecycle-toolbar-regression.mjs | static/source regressions | 1.66 | focused | none |  |
| scripts/tasks-lifecycle-action-descriptor-regression.mjs | static/source regressions | 0.09 | focused | none |  |
| scripts/tasks-workflow-action-descriptor-regression.mjs | static/source regressions | 0.11 | focused | none |  |
| scripts/tasks-detail-read-panel-regression.mjs | static/source regressions | 0.12 | focused | none |  |
| scripts/tasks-relationship-linked-context-regression.mjs | static/source regressions | 0.12 | focused | none |  |
| scripts/tasks-strict-guardrail-inventory-regression.mjs | static/source regressions | 0.13 | focused | none |  |
| scripts/tasks-conversion-closeout-regression.mjs | static/source regressions | 0.10 | closeout | none |  |
| scripts/tasks-list-surface-boundary-regression.mjs | static/source regressions | 0.13 | focused | none |  |
| scripts/tasks-modal-shell-regression.mjs | static/source regressions | 0.11 | focused | none |  |
| scripts/task-modal-complete-action-regression.mjs | static/source regressions | 1.62 | focused | none |  |
| scripts/tasks-recurrence-reminder-escape-hatch-regression.mjs | static/source regressions | 0.11 | focused | none |  |
| scripts/tasks-checklist-escape-hatch-regression.mjs | static/source regressions | 0.13 | focused | none |  |
| scripts/task-checklist-editor-display-regression.mjs | static/source regressions | 5.98 | focused | none |  |
| scripts/tasks-timer-utility-escape-hatch-regression.mjs | static/source regressions | 0.14 | focused | none |  |
| scripts/tasks-canonical-editor-opener-regression.mjs | static/source regressions | 0.12 | focused | none |  |
| scripts/tasks-modal-context-sections-regression.mjs | static/source regressions | 0.11 | focused | none |  |
| scripts/modal-action-standardization-contract-regression.mjs | static/source regressions | 0.12 | focused | none |  |
| scripts/tasks-tags-files-child-dialog-regression.mjs | static/source regressions | 0.13 | focused | none |  |
| scripts/notes-tasks-modal-footer-visual-parity-regression.mjs | static/source regressions | 0.11 | focused | none |  |
| scripts/notes-notification-follow-regression.mjs | static/source regressions | 2.16 | focused | none |  |
| scripts/client-picker-hierarchy-regression.mjs | static/source regressions | 0.13 | focused | none |  |
| scripts/client-modal-footer-actions-regression.mjs | static/source regressions | 0.09 | focused | none |  |
| scripts/clients-projects-read-descriptor-host-regression.mjs | static/source regressions | 1.70 | focused | none |  |
| scripts/clients-projects-framework-read-anatomy-regression.mjs | static/source regressions | 1.11 | focused | none |  |
| scripts/clients-projects-action-registration-regression.mjs | static/source regressions | 0.11 | focused | none |  |
| scripts/clients-projects-related-regions-regression.mjs | static/source regressions | 0.10 | focused | none |  |
| scripts/clients-projects-bulk-toolbar-regression.mjs | static/source regressions | 0.11 | focused | none |  |
| scripts/clients-projects-hierarchy-reparent-regression.mjs | static/source regressions | 0.12 | focused | none |  |
| scripts/clients-projects-strict-closeout-regression.mjs | static/source regressions | 1.03 | closeout | none |  |
| scripts/time-entries-screen-regression.mjs | static/source regressions | 0.10 | focused | none |  |
| scripts/workbench-task-ordering-regression.mjs | static/source regressions | 0.10 | focused | none |  |
| scripts/module-actions-regression.mjs | static/source regressions | 0.13 | focused | none |  |
| scripts/shared-icons-regression.mjs | static/source regressions | 0.11 | focused | none |  |
| scripts/icon-control-conversion-regression.mjs | static/source regressions | 0.11 | focused | none |  |
| scripts/remaining-icon-actions-regression.mjs | static/source regressions | 0.12 | focused | none |  |
| scripts/icon-accessibility-contract-regression.mjs | static/source regressions | 0.14 | focused | none |  |
| scripts/search-contract-regression.mjs | default database regressions | 5.19 | focused | serial DB/search |  |
| scripts/search-index-sync-regression.mjs | default database regressions | 1.80 | focused | serial DB/search |  |
| scripts/search-rebuild-regression.mjs | default database regressions | 1.46 | focused | serial DB/search |  |
| scripts/search-index-jobs-regression.mjs | default database regressions | 1.18 | focused | serial DB/search |  |
| scripts/search-fts-repair-regression.mjs | default database regressions | 0.88 | focused | serial DB/search |  |
| scripts/search-lifecycle-regression.mjs | default database regressions | 1.09 | focused | serial DB/search |  |
| scripts/file-framework-contract-regression.mjs | file storage regressions | 0.91 | focused | serial DB/files |  |
| scripts/file-api-lifecycle-regression.mjs | file storage regressions | 1.37 | focused | serial DB/files |  |
| scripts/file-storage-provider-configuration-regression.mjs | file storage regressions | 0.90 | focused | serial DB/files |  |
| scripts/file-storage-diagnostics-regression.mjs | file storage regressions | 1.08 | focused | serial DB/files |  |
| scripts/file-storage-streaming-contract-regression.mjs | file storage regressions | 0.10 | focused | serial DB/files |  |
| scripts/file-storage-quota-enforcement-regression.mjs | file storage regressions | 0.98 | focused | serial DB/files |  |
| scripts/files-lifecycle-settings-quota-conversion-regression.mjs | file storage regressions | 0.93 | focused | serial DB/files |  |
| scripts/file-streamed-validation-download-metadata-regression.mjs | file storage regressions | 1.13 | focused | serial DB/files |  |
| scripts/file-s3-provider-registration-regression.mjs | file storage regressions | 1.32 | focused | serial DB/files |  |
| scripts/file-s3-object-operation-proof-regression.mjs | file storage regressions | 0.97 | focused | serial DB/files |  |
| scripts/file-s3-diagnostics-signed-url-boundary-regression.mjs | file storage regressions | 1.12 | focused | serial DB/files |  |
| scripts/file-storage-scanner-runtime-closeout-regression.mjs | file storage regressions | 0.07 | closeout | review no-db signal |  |
| scripts/file-multipart-upload-route-regression.mjs | file storage regressions | 1.09 | focused | serial DB/files |  |
| scripts/file-multipart-batch-upload-helper-regression.mjs | file storage regressions | 1.10 | focused | serial DB/files |  |
| scripts/file-upload-compatibility-error-hardening-regression.mjs | file storage regressions | 1.32 | focused | serial DB/files |  |
| scripts/file-scanner-mode-resolver-regression.mjs | file storage regressions | 3.26 | focused | serial DB/files |  |
| scripts/file-scanner-health-diagnostics-regression.mjs | file storage regressions | 3.74 | focused | serial DB/files |  |
| scripts/file-clamscan-adapter-regression.mjs | file storage regressions | 3.28 | focused | serial DB/files |  |
| scripts/file-clamd-adapter-regression.mjs | file storage regressions | 3.30 | focused | serial DB/files |  |
| scripts/file-scanner-setup-docs-regression.mjs | file storage regressions | 0.07 | focused | review no-db signal |  |
| scripts/file-scan-job-handoff-regression.mjs | file storage regressions | 1.02 | focused | serial DB/files |  |
| scripts/files-attachment-context-route-regression.mjs | file storage regressions | 1.29 | focused | serial DB/files |  |
| scripts/files-attachable-target-options-regression.mjs | file storage regressions | 1.13 | focused | serial DB/files |  |
| scripts/files-browse-attachment-reads-conversion-regression.mjs | file storage regressions | 0.93 | focused | serial DB/files |  |
| scripts/files-context-targets-conversion-regression.mjs | file storage regressions | 0.99 | focused | serial DB/files |  |
| scripts/files-preview-availability-route-regression.mjs | file storage regressions | 1.13 | focused | serial DB/files |  |
| scripts/files-preview-content-route-regression.mjs | file storage regressions | 1.35 | focused | serial DB/files |  |
| scripts/file-storage-accounting-regression.mjs | file storage regressions | 0.88 | focused | serial DB/files |  |
| scripts/file-settings-regression.mjs | file storage regressions | 0.88 | focused | serial DB/files |  |
| scripts/files-attachment-readmodel-regression.mjs | file storage regressions | 0.91 | focused | serial DB/files |  |
| scripts/workspace-storage-regression.mjs | isolated database regressions | 0.98 | focused | isolated DB |  |
| scripts/legacy-cleanup-regression.mjs | isolated database regressions | 1.22 | focused | isolated DB |  |
| scripts/fresh-database-regression.mjs | isolated database regressions | 1.00 | focused | isolated DB |  |
| scripts/sqlite-connection-hardening-regression.mjs | isolated database regressions | 5.01 | focused | isolated DB |  |
| scripts/database-adapter-contract-regression.mjs | isolated database regressions | 1.38 | focused | isolated DB |  |
| scripts/database-parameterized-query-pilot-regression.mjs | isolated database regressions | 1.16 | focused | isolated DB |  |
| scripts/database-transaction-helper-regression.mjs | isolated database regressions | 1.30 | focused | isolated DB |  |
| scripts/database-migration-locking-regression.mjs | isolated database regressions | 3.20 | focused | isolated DB |  |
| scripts/database-result-fidelity-regression.mjs | isolated database regressions | 1.05 | focused | isolated DB |  |
| scripts/database-dialect-seam-scaffold-regression.mjs | isolated database regressions | 0.77 | focused | isolated DB |  |
| scripts/database-conflict-identity-seam-regression.mjs | isolated database regressions | 1.00 | focused | isolated DB |  |
| scripts/database-case-insensitive-seam-regression.mjs | isolated database regressions | 0.99 | focused | isolated DB |  |
| scripts/database-boolean-time-seam-regression.mjs | isolated database regressions | 1.09 | focused | isolated DB |  |
| scripts/search-fts-seam-regression.mjs | isolated database regressions | 1.11 | focused | isolated DB |  |
| scripts/search-adapter-rebuild-service-conversion-regression.mjs | isolated database regressions | 1.15 | focused | isolated DB |  |
| scripts/database-introspection-boundary-regression.mjs | isolated database regressions | 1.20 | focused | isolated DB |  |
| scripts/better-sqlite3-driver-closeout-regression.mjs | isolated database regressions | 1.06 | closeout | isolated DB |  |
| scripts/job-outbox-schema-regression.mjs | isolated database regressions | 1.06 | focused | isolated DB |  |
| scripts/worker-runner-regression.mjs | isolated database regressions | 2.14 | focused | isolated DB |  |
| scripts/job-claiming-locking-regression.mjs | isolated database regressions | 1.21 | focused | isolated DB |  |
| scripts/scale-seed-framework-regression.mjs | isolated database regressions | 3.20 | focused | isolated DB |  |
| scripts/baseline-adoption-regression.mjs | isolated database regressions | 1.05 | focused | isolated DB |  |
| scripts/performance-regression.mjs | isolated database regressions | 1.22 | focused | isolated DB |  |
| scripts/notification-jobs-regression.mjs | isolated database regressions | 1.11 | focused | isolated DB |  |
| scripts/background-work-jobs-regression.mjs | isolated database regressions | 1.11 | focused | isolated DB |  |
| scripts/task-reminder-scheduling-horizon-regression.mjs | isolated database regressions | 1.03 | focused | isolated DB |  |
| scripts/task-reminder-notification-delivery-regression.mjs | isolated database regressions | 1.20 | focused | isolated DB |  |
| scripts/job-idempotency-at-least-once-regression.mjs | isolated database regressions | 1.18 | focused | isolated DB |  |
| scripts/job-retention-pruning-regression.mjs | isolated database regressions | 1.43 | focused | isolated DB |  |
| scripts/admin-job-observability-regression.mjs | isolated database regressions | 1.29 | focused | isolated DB |  |
| scripts/separate-worker-end-to-end-regression.mjs | isolated database regressions | 11.29 | focused | isolated DB |  |
| scripts/async-recurrence-response-closeout-regression.mjs | isolated database regressions | 1.06 | closeout | isolated DB |  |
| scripts/notifications-inbox-lifecycle-conversion-regression.mjs | isolated database regressions | 0.95 | focused | isolated DB |  |
| scripts/notifications-preferences-subscriptions-conversion-regression.mjs | isolated database regressions | 0.95 | focused | isolated DB |  |
| scripts/notification-regression.mjs | isolated database regressions | 1.83 | focused | isolated DB |  |
| scripts/search-api-regression.mjs | isolated database regressions | 1.26 | focused | isolated DB |  |
| scripts/search-shell-regression.mjs | isolated database regressions | 0.95 | focused | isolated DB |  |
| scripts/search-workflow-regression.mjs | isolated database regressions | 1.37 | focused | isolated DB |  |
| scripts/help-contract-regression.mjs | isolated database regressions | 0.97 | focused | isolated DB |  |
| scripts/help-markdown-source-layout-regression.mjs | isolated database regressions | 0.10 | focused | isolated DB |  |
| scripts/help-center-surface-regression.mjs | isolated database regressions | 1.00 | focused | isolated DB |  |
| scripts/help-navigation-boundary-regression.mjs | isolated database regressions | 0.96 | focused | isolated DB |  |
| scripts/help-search-regression.mjs | isolated database regressions | 1.48 | focused | isolated DB |  |
| scripts/help-content-regression.mjs | isolated database regressions | 1.23 | focused | isolated DB |  |
| scripts/help-workflow-regression.mjs | isolated database regressions | 1.59 | focused | isolated DB |  |
| scripts/tags-repository-conversion-regression.mjs | isolated database regressions | 1.01 | focused | isolated DB |  |
| scripts/tag-propagation-service-conversion-regression.mjs | isolated database regressions | 1.02 | focused | isolated DB |  |
| scripts/tag-service-regression.mjs | isolated database regressions | 0.96 | focused | isolated DB |  |
| scripts/tag-core-records-regression.mjs | isolated database regressions | 1.05 | focused | isolated DB |  |
| scripts/tag-propagation-foundation-regression.mjs | isolated database regressions | 1.02 | focused | isolated DB |  |
| scripts/tag-propagation-contract-regression.mjs | isolated database regressions | 0.95 | focused | isolated DB |  |
| scripts/tag-propagation-paths-regression.mjs | isolated database regressions | 1.13 | focused | isolated DB |  |
| scripts/tag-bulk-assignment-regression.mjs | isolated database regressions | 1.07 | focused | isolated DB |  |
| scripts/notes-foundation-regression.mjs | isolated database regressions | 0.92 | focused | isolated DB |  |
| scripts/notes-markdown-revision-regression.mjs | isolated database regressions | 0.94 | focused | isolated DB |  |
| scripts/notes-access-contract-regression.mjs | isolated database regressions | 0.93 | focused | isolated DB |  |
| scripts/notes-api-service-regression.mjs | isolated database regressions | 1.21 | focused | isolated DB |  |
| scripts/notes-search-help-regression.mjs | isolated database regressions | 1.29 | focused | isolated DB |  |
| scripts/notes-collections-regression.mjs | isolated database regressions | 1.08 | focused | isolated DB |  |
| scripts/notes-ui-workflow-regression.mjs | isolated database regressions | 1.31 | focused | isolated DB |  |
| scripts/notes-primary-context-regression.mjs | isolated database regressions | 1.28 | focused | isolated DB |  |
| scripts/linked-context-client-project-label-sort-regression.mjs | isolated database regressions | 1.20 | focused | isolated DB |  |
| scripts/linked-context-task-label-sort-regression.mjs | isolated database regressions | 1.22 | focused | isolated DB |  |
| scripts/linked-context-note-list-label-regression.mjs | isolated database regressions | 1.22 | focused | isolated DB |  |
| scripts/linked-context-unavailable-fallback-regression.mjs | isolated database regressions | 1.16 | focused | isolated DB |  |
| scripts/notes-task-context-regression.mjs | isolated database regressions | 1.16 | focused | isolated DB |  |
| scripts/notes-preview-editor-regression.mjs | isolated database regressions | 1.07 | focused | isolated DB |  |
| scripts/notes-markdown-soft-break-regression.mjs | isolated database regressions | 1.07 | focused | isolated DB |  |
| scripts/notes-secure-regression.mjs | isolated database regressions | 1.16 | focused | isolated DB |  |
| scripts/notes-integration-closeout-regression.mjs | isolated database regressions | 1.12 | closeout | isolated DB |  |
| scripts/notes-linked-panel-regression.mjs | isolated database regressions | 1.16 | focused | isolated DB |  |
| scripts/notes-lists-tags-api-scope-regression.mjs | isolated database regressions | 1.37 | focused | isolated DB |  |
| scripts/lists-foundation-regression.mjs | isolated database regressions | 0.97 | focused | isolated DB |  |
| scripts/lists-service-regression.mjs | isolated database regressions | 1.13 | focused | isolated DB |  |
| scripts/lists-api-regression.mjs | isolated database regressions | 1.85 | focused | isolated DB |  |
| scripts/lists-ui-workflow-regression.mjs | isolated database regressions | 1.03 | focused | isolated DB |  |
| scripts/lists-closeout-regression.mjs | isolated database regressions | 1.18 | closeout | isolated DB |  |
| scripts/lists-query-suggestions-regression.mjs | isolated database regressions | 1.12 | focused | isolated DB |  |
| scripts/lists-records-items-repository-conversion-regression.mjs | isolated database regressions | 1.03 | focused | isolated DB |  |
| scripts/lists-catalog-links-repository-conversion-regression.mjs | isolated database regressions | 1.07 | focused | isolated DB |  |
| scripts/personal-family-workspace-scope-regression.mjs | isolated database regressions | 1.17 | focused | isolated DB |  |
| scripts/client-projects-bugfix-regression.mjs | isolated database regressions | 1.09 | focused | isolated DB |  |
| scripts/client-projects-canonical-payload-regression.mjs | isolated database regressions | 1.15 | focused | isolated DB |  |
| scripts/client-projects-repositories-conversion-regression.mjs | isolated database regressions | 1.13 | focused | isolated DB |  |
| scripts/clients-projects-strict-guardrail-inventory-regression.mjs | isolated database regressions | 0.09 | focused | isolated DB |  |
| scripts/framework-admin-low-count-repositories-conversion-regression.mjs | isolated database regressions | 1.10 | focused | isolated DB |  |
| scripts/startup-maintenance-compatibility-regression.mjs | isolated database regressions | 1.16 | focused | isolated DB |  |
| scripts/migration-compatibility-regression.mjs | isolated database regressions | 1.08 | focused | isolated DB |  |
| scripts/api-key-scope-audit-regression.mjs | isolated database regressions | 1.03 | focused | isolated DB |  |
| scripts/public-api-client-project-write-regression.mjs | isolated database regressions | 1.35 | focused | isolated DB |  |
| scripts/task-resume-context-regression.mjs | isolated database regressions | 1.15 | focused | isolated DB |  |
| scripts/task-activity-metrics-regression.mjs | isolated database regressions | 1.36 | focused | isolated DB |  |
| scripts/task-recurrence-frequency-regression.mjs | isolated database regressions | 1.25 | focused | isolated DB |  |
| scripts/task-checklist-regression.mjs | isolated database regressions | 1.11 | focused | isolated DB |  |
| scripts/task-relationships-regression.mjs | isolated database regressions | 1.23 | focused | isolated DB |  |
| scripts/task-qol-closeout-regression.mjs | isolated database regressions | 1.19 | closeout | isolated DB |  |
| scripts/task-bulk-due-tags-regression.mjs | isolated database regressions | 1.16 | focused | isolated DB |  |
| scripts/task-modal-compact-layout-regression.mjs | isolated database regressions | 0.07 | focused | review no-db signal |  |
| scripts/task-modal-reflow-regression.mjs | isolated database regressions | 0.07 | focused | review no-db signal |  |
| scripts/task-modal-followup-regression.mjs | isolated database regressions | 0.07 | focused | review no-db signal |  |
| scripts/task-timer-status-regression.mjs | isolated database regressions | 1.19 | focused | isolated DB |  |
| scripts/timer-timestamp-integrity-regression.mjs | isolated database regressions | 1.09 | focused | isolated DB |  |
| scripts/timer-resume-metadata-regression.mjs | isolated database regressions | 1.06 | focused | isolated DB |  |
| scripts/active-timers-repository-conversion-regression.mjs | isolated database regressions | 1.03 | focused | isolated DB |  |
| scripts/time-entries-repository-conversion-regression.mjs | isolated database regressions | 1.04 | focused | isolated DB |  |
| scripts/work-resume-state-conversion-regression.mjs | isolated database regressions | 1.06 | focused | isolated DB |  |
| scripts/work-resume-state-service-regression.mjs | isolated database regressions | 1.05 | focused | isolated DB |  |
| scripts/work-resume-state-producer-regression.mjs | isolated database regressions | 1.02 | focused | isolated DB |  |
| scripts/work-resume-state-initial-producers-regression.mjs | isolated database regressions | 1.22 | focused | isolated DB |  |
| scripts/work-resume-state-api-regression.mjs | isolated database regressions | 1.41 | focused | isolated DB |  |
| scripts/work-resume-state-closeout-regression.mjs | isolated database regressions | 1.16 | closeout | isolated DB |  |
| scripts/files-time-tracking-qol-closeout-regression.mjs | isolated database regressions | 1.07 | closeout | isolated DB |  |
| scripts/task-canonical-query-regression.mjs | isolated database regressions | 1.28 | focused | isolated DB |  |
| scripts/tasks-view-selector-query-contract-regression.mjs | isolated database regressions | 1.33 | focused | isolated DB |  |
| scripts/tasks-server-side-list-paging-regression.mjs | isolated database regressions | 2.33 | focused | isolated DB |  |
| scripts/tasks-primary-repository-conversion-regression.mjs | isolated database regressions | 1.15 | focused | isolated DB |  |
| scripts/task-checklists-repository-conversion-regression.mjs | isolated database regressions | 1.10 | focused | isolated DB |  |
| scripts/task-relationships-repository-conversion-regression.mjs | isolated database regressions | 1.14 | focused | isolated DB |  |
| scripts/task-recurrence-reminders-repository-conversion-regression.mjs | isolated database regressions | 1.09 | focused | isolated DB |  |
| scripts/task-options-payload-regression.mjs | isolated database regressions | 1.04 | focused | isolated DB |  |
| scripts/project-default-assignee-regression.mjs | isolated database regressions | 0.98 | focused | isolated DB |  |
