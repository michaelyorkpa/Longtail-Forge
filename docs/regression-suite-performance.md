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

## 0.33.5.29.3 Runner Scheduling Result

0.33.5.29.3 implements exactly one runner execution-model optimization: the isolated database bucket now auto-tunes its default parallelism from Node's available worker count while preserving the existing override knobs. `LTF_ISOLATED_REGRESSION_PARALLELISM` still wins first, `LTF_REGRESSION_PARALLELISM` remains the shared fallback override, and explicit positive integer overrides are used as requested.

The auto path uses `scripts/test-support/regression-runner-scheduler.mjs` and keeps a conservative cap of six isolated workers. On the local verification runtime, Node reports 12 available workers, so the default isolated bucket increases from the historical fixed four workers to six workers. Static, default-database, and file-storage buckets keep their existing suite-defined scheduling; the file-storage bucket stays serial because storage/database isolation has not been proven safe.

The same helper owns the limited scheduler used by the runner. The runner guardrail now exercises auto sizing, override precedence, stable script indexes for per-script database fixture envs, and the fail-fast contract where a single script failure stops later scheduling while allowing already-running scripts to finish. Bucket order, per-script timing output, `LTF_REGRESSION_TIMING_JSON`, the `fresh-database-regression.mjs` baseline bypass, and mutating-script database isolation remain unchanged.

Measured 0.33.5.29.3 check timing:

| Run | Isolated concurrency | Runner wall seconds | Result |
| --- | ---: | ---: | --- |
| 0.33.5.29.1 baseline | 4 | 109.57 | 294/294 plus ESLint |
| 0.33.5.29.3 verification | 6 | 110.46 | 294/294 plus ESLint |

This local verification run proved the auto-tuned six-worker isolated bucket without surfacing the known isolated-DB flake. Total runner timing stayed comparable to the original baseline rather than showing a clean wall-clock reduction; the retained value of this slice is the guarded execution-model knob, not a coverage or script-count change.

## 0.33.5.29.4 Coverage Ratchet Result

0.33.5.29.4 adds the coverage-preservation ratchet before any script consolidation or retirement work. `scripts/regression-coverage-manifest.json` is the tracked manifest, and `scripts/regression-coverage-ratchet.mjs` is the static regression suite entry that validates the live suite against it.

The manifest records:

- `minimumRegisteredScripts`: 295, including the ratchet regression itself.
- `minimumCloseoutScripts`: 21.
- `requiredScripts`: the full retained regression script set at the time the ratchet landed.
- `coverageFamilies`: currently the `closeout-regressions` family with its 21 required closeout scripts.
- `retiredScripts`: explicit future retirement entries; this starts empty because this slice retires no real scripts.

The ratchet fails when a required script is missing without a retirement entry, when registered script count drops below the manifest floor adjusted by documented retirements, when the closeout family drops below its adjusted floor, when a retired script is still registered, or when a retirement entry is incomplete. The focused fixture coverage inside `scripts/regression-coverage-ratchet.mjs` proves both sides: an undocumented synthetic drop fails, while the same synthetic drop passes only after a complete retirement entry is supplied.

Retirement entries must use this shape:

```json
{
  "script": "scripts/example-closeout-regression.mjs",
  "retiredInVersion": "0.33.5.29.5",
  "retirementType": "assertions-moved",
  "rationale": "Why this script no longer needs to remain registered.",
  "assertionDisposition": "Where each assertion moved, or why the target code is dead.",
  "retainedCoverageOwners": ["scripts/retained-focused-regression.mjs"],
  "verificationPerformed": ["node scripts/retained-focused-regression.mjs", "npm run check"]
}
```

Use `retirementType: "assertions-moved"` when coverage is folded into retained owners, and `retirementType: "dead-target"` only when the protected target code no longer exists. `retainedCoverageOwners` should name registered regression scripts whenever assertions move. Future consolidation slices should update the manifest in the same change that removes a script from `scripts/regression-suite.mjs`; removing the script first or adding an incomplete retirement entry makes the ratchet fail.

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

## 0.33.5.29.5 Closeout Consolidation Result

0.33.5.29.5 inspected the full 21-script closeout family from the overlap map. The safe consolidation boundary was static historical closeout/doc assertions: they do not need separate Node processes, but their assertions still protect branch-boundary documentation, roadmap hygiene, current-version pins, and framework/module contract handoffs. Database-backed closeouts remain separately registered because they create fixtures, exercise services, verify permissions, inspect search rows, or assert SQLite integrity.

`scripts/static-contract-closeout-regression.mjs` is the retained closeout owner for the static group. It imports these 14 retired suite entries in-process, so the old assertion modules still run:

- `scripts/runtime-database-foundation-closeout-regression.mjs`
- `scripts/database-agnostic-contract-closeout-regression.mjs`
- `scripts/module-file-closeout-regression.mjs`
- `scripts/notes-import-closeout-regression.mjs`
- `scripts/surface-standardization-closeout-regression.mjs`
- `scripts/view-builder-closeout-regression.mjs`
- `scripts/view-conversion-branch-closeout-regression.mjs`
- `scripts/files-browse-edit-preview-closeout-regression.mjs`
- `scripts/files-conversion-closeout-regression.mjs`
- `scripts/notes-slideout-closeout-regression.mjs`
- `scripts/markdown-closeout-regression.mjs`
- `scripts/tasks-conversion-closeout-regression.mjs`
- `scripts/clients-projects-strict-closeout-regression.mjs`
- `scripts/file-storage-scanner-runtime-closeout-regression.mjs`

The coverage manifest now records `minimumRegisteredScripts: 296` and `minimumCloseoutScripts: 22`, then subtracts the 14 documented retirements. The live registered suite is 282 scripts, with 8 registered `*-closeout-regression.mjs` owners. The retained closeout family is the new static owner plus the seven database-backed closeouts: `better-sqlite3-driver-closeout-regression.mjs`, `async-recurrence-response-closeout-regression.mjs`, `notes-integration-closeout-regression.mjs`, `lists-closeout-regression.mjs`, `task-qol-closeout-regression.mjs`, `work-resume-state-closeout-regression.mjs`, and `files-time-tracking-qol-closeout-regression.mjs`.

Two moved assertions were spot-checked by temporary target breaks before restoration: removing the `## OneNote Mapping Plan` heading failed through the imported Notes import closeout module, and changing the `## Implementation Notes For 0.33.5.18.15` heading failed through the imported view-conversion closeout module. Both target files were restored before final verification.

Measured 0.33.5.29.5 check timing:

| Run | Registered scripts | Registered closeout owners | Runner wall seconds | Result |
| --- | ---: | ---: | ---: | --- |
| 0.33.5.29.4 verification | 295 | 21 | 111.94 | 295/295 plus ESLint |
| 0.33.5.29.5 verification | 282 | 8 | 115.27 | 282/282 plus ESLint |

The local wall time did not improve on this run because the remaining slow tail is outside the retired static closeout group, especially `separate-worker-end-to-end-regression.mjs`, `check-js.mjs`, file-scanner adapter checks, and isolated database scripts. The consolidation still removes 13 registered process starts and lowers future closeout maintenance noise while preserving the moved assertions through one retained owner.

## 0.33.5.29.6 Isolated Bucket Stability Result

0.33.5.29.6 diagnosed the isolated-bucket transient as a runner-level baseline preparation race, not a script-owned port, temp path, worker lock, or per-script database collision. Running the isolated bucket by itself reproduced the failure before the fix: the first parallel scripts all reached `getRegressionBaseline()` while `regressionBaseline` was still unset, so multiple callers attempted `prepareRegressionBaselineDatabase()` in the parent runner process and contended on the same cached baseline database configuration. The visible failure was a SQLite migration lock at the runner baseline path, for example `baseline-data/.longtail-forge-migrations.lock`.

The fix keeps one shared in-flight `regressionBaselinePromise` so parallel scripts wait for the same baseline preparation instead of starting competing baseline migrations. The runner also gained a bounded stress mode: set `LTF_REGRESSION_BUCKET` to a bucket name or alias such as `isolated`, and set `LTF_REGRESSION_REPEAT` to repeat the selected bucket up to five times. Database fixture paths now include a sanitized bucket/pass namespace under `script-data`, so repeated bucket runs do not reuse per-script database or lock paths inside the same runner process.

Measured isolated-bucket stability checks:

| Run | Isolated concurrency | Repeat count | Runner wall seconds | Result |
| --- | ---: | ---: | ---: | --- |
| Pre-fix isolated-only repro | 6 | 1 | 2.00 | failed on baseline migration lock |
| Post-fix isolated-only default | 6 | 1 | 35.76 | 121/121 isolated scripts |
| Post-fix isolated-only stress | 8 | 2 | 70.94 | 242/242 isolated script runs |

Operationally, the old standalone/serial workaround is retired only after the bounded stress command passes:

```sh
LTF_REGRESSION_BUCKET=isolated LTF_REGRESSION_REPEAT=2 LTF_ISOLATED_REGRESSION_PARALLELISM=8 node scripts/run-regressions.mjs
```

## 0.33.5.29.7 Check/Lint And Branch Closeout Result

0.33.5.29.7 reviewed the remaining `npm run check` and `npm run test:permissions` paths after the runner, source-scan, coverage-ratchet, closeout, and isolated-bucket work landed. The only cheap semantic-preserving speed win left on the standard gate was ESLint caching, so `npm run check` and `npm run lint` now run `eslint . --cache --cache-strategy content --cache-location .eslintcache`. That keeps the same lint input surface and failure behavior while reducing repeated local closeout runs.

The branch intentionally did not fold `scripts/check-js.mjs` into ESLint or drop it from the suite. It is still the explicit whole-repo syntax gate in the static/source bucket, and its runtime remains visible in the timing summary. `npm run test:permissions` was also left unchanged: it is already one focused harness with no duplicated whole-repo scan or repeated child-process setup to remove safely, so changing it here would have been ceremony without a proven payoff.

Current execution model and tuning knobs:

| Surface | Contract |
| --- | --- |
| `npm run check` | Runs `node scripts/run-regressions.mjs` first, then ESLint with content-based caching at `.eslintcache`. |
| `npm run test:permissions` | Runs the standalone `scripts/permission-regression.mjs` harness unchanged. |
| Static/source bucket | Parallel read-only regressions, including `scripts/check-js.mjs` and the shared-source database guardrails. |
| Default database bucket | Serial shared-database regressions. |
| File storage bucket | Serial regressions until storage/database isolation is explicitly re-proven for parallelism. |
| Isolated database bucket | Parallel per-script fixture clones with one shared in-flight baseline preparation promise and namespaced bucket/pass fixture paths. |

| Knob | Purpose | Notes |
| --- | --- | --- |
| `LTF_ISOLATED_REGRESSION_PARALLELISM` | Explicit isolated-bucket worker override. | Highest-precedence concurrency override for isolated database regressions. |
| `LTF_REGRESSION_PARALLELISM` | Shared runner concurrency fallback. | Used when the isolated-specific override is absent. |
| `LTF_REGRESSION_TIMING_JSON` | Write per-script timing JSON. | Parent directory must exist before the run starts. |
| `LTF_REGRESSION_BUCKET` | Run one selected bucket or bucket alias. | Useful for bounded targeted reruns such as `isolated`. |
| `LTF_REGRESSION_REPEAT` | Repeat the selected bucket up to five times. | Used for bounded flake stress checks with `LTF_REGRESSION_BUCKET`. |
| `LTF_CHECK_JS_PARALLELISM` | Override `scripts/check-js.mjs` worker count. | Applies only to the repo syntax-scan regression. |

Measured closeout timings:

| Measurement | Runner wall seconds | Shell wall seconds | Result |
| --- | ---: | ---: | --- |
| 0.33.5.29.1 baseline `npm run check` | 109.57 | n/a | 294/294 plus ESLint |
| 0.33.5.29.7 closeout `npm run check` | 88.53 | 90.37 | 282/282 plus cached ESLint |
| 0.33.5.29.7 `npm run lint` cold | n/a | 5.83 | first cache-populating lint pass |
| 0.33.5.29.7 `npm run lint` warm | n/a | 1.71 | repeated lint pass against `.eslintcache` |
| 0.33.5.29.7 `npm run test:permissions` | n/a | 7.16 | 236 permission checks |

Relative to the 0.33.5.29.1 baseline, the branch closed with a 21.04-second runner-time reduction on `npm run check`, preserved coverage through the manifest/ratchet, and removed the isolated-bucket flake that previously forced the standalone/serial workaround.

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

2. Runner scheduling target for 0.33.5.29.3: completed by auto-tuning only the isolated database bucket's default concurrency from available worker count while preserving the explicit override knobs. The local Node runtime reports 12 available workers, so the isolated bucket now defaults to six workers under the conservative cap. Static batching and file-storage parallelism remain out of scope; file-storage stays serial until storage/database isolation is proven safe.

3. Coverage ratchet target for 0.33.5.29.4: completed by adding `scripts/regression-coverage-manifest.json` and `scripts/regression-coverage-ratchet.mjs`. The current floor is 295 registered scripts, including the ratchet itself, and 21 closeout scripts. A later lower script count is allowed only with a complete `retiredScripts` entry documenting assertion movement or dead-target rationale, retained coverage owner, and verification performed.

4. Closeout consolidation target for 0.33.5.29.5: completed by registering `scripts/static-contract-closeout-regression.mjs`, retiring 14 static closeout suite entries through manifest `assertions-moved` records, and leaving the seven database-backed closeout scripts independently registered. The live suite now has 282 registered scripts and 8 registered closeout owners, while the manifest preserves the 296/22 pre-retirement floors and the retained owner for every moved assertion.

5. Isolated-DB flake target for 0.33.5.29.6: completed by reproducing the isolated-only baseline migration-lock race, fixing `getRegressionBaseline()` with a shared in-flight promise, namespacing per-script data paths by bucket/pass, and proving the bucket with default isolated parallelism plus a repeat-2 concurrency-8 stress run.

6. Check/lint target for 0.33.5.29.7: completed by keeping `scripts/check-js.mjs` as the explicit syntax gate, adding content-based ESLint caching to `npm run check`/`npm run lint`, leaving `npm run test:permissions` unchanged as a focused standalone harness, and recording the final runner model plus tuning knobs. The closeout `npm run check` measured 88.53 runner wall seconds (90.37 shell wall) versus the 109.57-second baseline, and warm `npm run lint` fell from 5.83 seconds cold to 1.71 seconds.

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
| scripts/workbench-task-ordering-regression.mjs | static/source regressions | 0.10 | focused | none | Task-options/source-boundary regression after 0.33.6.6g removed the all-tasks list. |
| scripts/workbench-remove-all-tasks-list-regression.mjs | static/source regressions | 0.10 | focused | none | Guards the 0.33.6.6g Workbench no-all-tasks-index contract. |
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
