# Regression Suite Contract

This document records the current regression-suite contract through 0.33.6.16.9. The runner auto-discovers convention-path metadata regressions, generates its coverage index from that registry, and exposes narrow area commands plus conservative changed-file suggestions while preserving every 0.33.6.16.1 legacy script and its execution/isolation mode through a checked-in migration snapshot.

## Current Entry Points

| Entry point | Current responsibility |
| --- | --- |
| `scripts/run-regressions.mjs` | Runs the registered buckets in order, schedules safe parallel work, prepares baseline-derived database fixtures, supports bounded bucket/repeat filters, prints timings, and stops later scheduling after a failure. |
| `scripts/regression-suite.mjs` | Builds and exports the executable suite index from deterministic discovery metadata. Compatibility exports retain the four historical script arrays for existing consumers. |
| `scripts/lib/regression-discovery.mjs` | Discovers new convention-path scripts, preserves snapshot-backed legacy paths, validates metadata, and builds the four execution buckets. |
| `scripts/lib/regression-metadata.mjs` | Defines canonical metadata values, statically parses `regressionMeta` object exports without importing regression modules, validates metadata, and supplies transitional legacy metadata. |
| `scripts/lib/regression-runner-options.mjs` | Parses area/tag/tier/list/dry-run options and filters the discovered bucket entries. |
| `scripts/lib/regression-change-routing.mjs` | Maps changed repository paths to conservative focused-area commands without changing suite membership. |
| `scripts/suggest-regressions-for-changes.mjs` | Inspects tracked and untracked working-tree changes and prints likely focused commands plus the unchanged release gate. |
| `scripts/lib/docs-change-routing.mjs` | Validates the data-only documentation ownership index and maps changed source paths to likely owning documents. |
| `scripts/suggest-docs-for-changes.mjs` | Prints changed-area documentation suggestions and the warning-only closeout disposition gate. |
| `scripts/regression-legacy-snapshot.json` | Freezes the 312-script 0.33.6.16.1 legacy path and run-mode set so discovery cannot silently drop or parallelize an existing regression. |
| `scripts/regression-coverage-ratchet.mjs` | Validates discovered metadata against the generated index and explicit policy, including active/area/release-gate/family floors plus retirement evidence. |
| `scripts/lib/regression-manifest.mjs` | Builds the deterministic metadata index and owns coverage-policy validation shared by the generator and ratchet regressions. |
| `scripts/generate-regression-manifest.mjs` | Writes or checks the generated coverage index from the discovered registry and exceptions policy. |
| `scripts/regression-clean-clone-contract.mjs` | Proves every registered script and required support file exists in a clean clone and does not depend on ignored local bookkeeping files. |
| `scripts/regression-coverage-manifest.json` | Generated schema-v2 index of every discovered regression's ID, path, area, tier, tags, description, run mode, legacy state, release-gate state, summaries, coverage families, and retirement records. Do not edit it manually. |
| `scripts/regression-coverage-exceptions.json` | Human-maintained policy for active and per-area floors, protected areas, required release-gate IDs, coverage families, legacy migration allowance, and explicit retirement evidence. |
| `package.json` | Exposes the broad and focused command entry points described below. |

Current package commands:

| Command | Current behavior |
| --- | --- |
| `npm run check` | Runs `scripts/run-regressions.mjs`, then cached ESLint. |
| `npm run test:regressions` | Runs the full discovered regression registry without the lint stage. |
| `npm run test:regressions:list` | Lists every discovered regression and its metadata without executing it. |
| `npm run test:regressions:<area>` | Runs one supported focused area: `framework`, `views`, `dashboard`, `workbench`, `tasks`, `notes`, `files`, `database`, `permissions`, or `release`. |
| `npm run test:permissions` | Runs `scripts/permission-regression.mjs` directly; the same script is also registered in the full suite. |
| `npm run test:sqlite-driver` | Runs the standalone better-sqlite3 install smoke check; the same script is also registered in the full suite. |
| `npm run audit:params` | Reports parameter-binding scan totals, reviewed baseline exceptions, new violations, and resolved findings without pinning informational counts. |
| `npm run audit:params:check` | Fails on new unreviewed legacy-helper or template-interpolated SQL findings. |
| `npm run audit:params:update-baseline` | Deterministically updates the reviewed finding baseline; reserved for dedicated parameter-binding cleanup. |
| `npm run docs:suggest` | Lists mapped source areas and likely documentation owners for current tracked and untracked changes. |
| `npm run docs:check` | Runs the same documentation review as a warning-only closeout gate and accepts an optional explicit `--note`. |
| `npm run licensing:gates` | Reports missing future public-release and outside-contribution artifacts without failing ordinary private development. |
| `npm run db:migration:create -- <name>` | Creates the next globally numbered core migration with a forward-only template after validating core/module migration numbers. |
| `npm run db:schema:refresh` | Replays the fresh-start baseline plus ordered migrations into disposable SQLite and rewrites the generated final-schema snapshot. |
| `npm run db:schema:check` | Fails on migration-number collisions, invalid names, generated snapshot drift, or an unaccompanied baseline-schema change. |
| `npm run regressions:manifest` | Regenerates `scripts/regression-coverage-manifest.json` deterministically from discovery metadata and the exceptions policy. |
| `npm run regressions:manifest:check` | Fails when the checked-in generated manifest differs from current discovery metadata or policy. |
| `npm run lint` | Runs cached ESLint without the custom regression suite. |
| `npm run version:guard` | Runs the current-version literal guardrail directly; the same script is also registered in the full suite. |

## Current Execution Model

At completion of 0.33.6.16.9, the suite contains 319 discovered scripts: all 312 paths in `scripts/regression-legacy-snapshot.json` plus convention-path guardrails for discovery, manifest generation, regression routing, canonical asset cache versioning, documentation ownership routing, migration/schema workflow, and licensing/public-release process gates. Existing regressions remain in their original buckets.

| Bucket | Registered scripts | Declared mode | Declared concurrency | Current safety boundary |
| --- | ---: | --- | ---: | --- |
| `static/source regressions` | 158 | parallel | 6 | The 151 legacy read-only/parallel-safe checks plus the discovery, manifest-generation, regression-routing, asset-version, documentation-ownership, migration/schema-workflow, and licensing-gate guardrails; these do not receive a runner database fixture. |
| `default database regressions` | 6 | serial | 1 | Search/database checks whose current ordering and shared-state assumptions remain serial. |
| `file storage regressions` | 29 | serial | 1 | File storage/scanner checks remain serial until their database, filesystem, port, and process isolation is explicitly proven. |
| `isolated database regressions` | 126 | parallel | 4 fallback | Database-backed checks receive per-script fixture environments. The runner auto-tunes isolated parallelism with a conservative cap while preserving explicit environment overrides. |

The runner no longer uses hand-maintained arrays as its source of truth. Discovery reads the frozen legacy snapshot, scans top-level `scripts/*-regression.mjs` files that opt into metadata, and recursively scans `scripts/regressions/**/*.regression.mjs`. The generated coverage manifest and explicit policy retain count floors, required release gates, coverage families, and retirement checks.

## Current Category Inventory

Legacy scripts live primarily at `scripts/*-regression.mjs`, and names frequently carry more than one concern. The table records the current path/name signals and representative registered owners. It is an inventory, not a claim that filename matching is already authoritative.

| Current category | Legacy path/name signals and representative owners | Future canonical area |
| --- | --- | --- |
| Workbench | `scripts/workbench-*`, `scripts/work-*`, `scripts/work-resume-state-*`, including `workbench-guided-ui-regression.mjs` and `work-candidate-service-regression.mjs` | `workbench` |
| Dashboard | `scripts/dashboard-*`, currently centered on `dashboard-workbench-regression.mjs` | `dashboard` |
| Files | `scripts/file-*` and `scripts/files-*`, spanning storage, scanning, browse, preview, upload, attachment, and strict-surface checks | `files` |
| Tasks | `scripts/task-*` and `scripts/tasks-*`, spanning list, editor, checklist, relationships, recurrence, reminders, and timer integration | `tasks` |
| Notes | `scripts/notes-*`, plus Notes-owned linked-context coverage such as `linked-context-note-list-label-regression.mjs` | `notes` |
| Lists | `scripts/lists-*`, including foundation, API/service, catalog, linked layout, view, and closeout checks | `lists` |
| Search | `scripts/search-*`, including index, rebuild, FTS, result-page, lifecycle, jobs, API, and workflow checks | `search` |
| Notifications | `scripts/notification-*` and `scripts/notifications-*`, including inbox, preferences, subscriptions, jobs, and delivery | `notifications` |
| Tags | `scripts/tag-*` and `scripts/tags-*`, including assignment, propagation, picker, management, and repository checks | `tags` |
| Public API | Explicit public-contract names such as `public-api-client-project-write-regression.mjs`, `api-key-scope-audit-regression.mjs`, and `notes-lists-tags-api-scope-regression.mjs` | `public-api` |
| Permissions | `permission-regression.mjs`, workspace/access checks, and cross-cutting permission assertions inside module regressions | `permissions` |
| Database and migrations | `scripts/database-*`, `scripts/sqlite-*`, `scripts/migration-*`, parameter-binding/dialect guardrails, driver checks, and startup compatibility checks | `database` |
| View builder and declarative views | `scripts/view-*`, `scripts/*-declarative-*`, descriptor/renderer/surface/modal/drawer anatomy checks | `views` |
| Module contracts | `scripts/module-*`, manifest/contribution checks, module sanity, and module-owned workflow regressions; cross-cutting module-contract checks use the `framework` area plus tags | `framework` |
| Background jobs and worker runner | `scripts/job-*`, `worker-runner-regression.mjs`, `separate-worker-end-to-end-regression.mjs`, `background-work-jobs-regression.mjs`, and producer-specific job checks | `jobs` |
| App-info, version, and release gates | `bump-version-regression.mjs`, `version-literal-guardrail-regression.mjs`, clean-clone/coverage ratchets, and app-info/version assertions distributed through runtime and closeout checks | `release` |
| Licensing and public-release gates | The warning-only licensing/public-release process gate protects the current AGPL/package/README/link contract and reports future publication/contribution artifacts without failing ordinary private development | `licensing` |

Additional canonical areas cover inventory that is not called out as a separate legacy category: `framework`, `time-tracking`, and `docs`. Cross-cutting behavior belongs to one primary area and carries its other concerns as tags rather than being registered more than once.

## Discovery Convention

New convention-based regression files will use:

```text
scripts/regressions/<area>/<name>.regression.mjs
```

The `<area>` directory must be one of the canonical areas below and must match `regressionMeta.area`. `<name>` should be a stable lowercase kebab-case description without repeating `.regression`. New convention files are discovered recursively and sorted deterministically.

Transitional discovery must continue to include existing top-level files matching:

```text
scripts/*-regression.mjs
```

All 312 pre-migration legacy paths are discovered from `scripts/regression-legacy-snapshot.json`, including historical nonstandard names such as `check-js.mjs`. Their exact run modes and relative order are preserved. A new top-level legacy-style `scripts/*-regression.mjs` file is discovered only when it exports valid metadata; metadata-free top-level files outside the snapshot remain ignored so retained source modules for documented retirements are not accidentally re-registered.

Legacy files do not need to move merely to adopt metadata. File migration, if later justified, must preserve script IDs, execution semantics, and coverage ownership. A snapshot-backed script that adds metadata cannot change its `runMode` without failing discovery.

Historical regression-local registration assertions read the legacy snapshot instead of the implementation source. That preserves their exact retained-path checks without requiring `scripts/regression-suite.mjs` to duplicate all legacy paths after discovery became authoritative.

## Generated Coverage Index and Exceptions

`scripts/regression-coverage-manifest.json` is generated, checked in, deterministic, and timestamp-free. Metadata is authoritative for regression identity, area, tier, tags, protected-contract description, run mode, legacy state, and release-gate status. Generation also records count summaries and resolved coverage-family membership.

`scripts/regression-coverage-exceptions.json` is the only manually maintained coverage-policy file. It contains judgments that cannot be derived safely:

- Minimum active, per-area, release-gate, and coverage-family floors.
- Populated areas that must retain an active regression or credited retirement.
- Stable release-gate IDs that cannot disappear silently.
- The snapshot-backed legacy metadata allowance.
- Historical and future retirement/consolidation evidence.

The 14 historical closeout consolidations remain explicit `assertions-moved` retirements with `floorCredit: false` because the current active floors were recorded after those consolidations. A future retirement that deliberately lowers current coverage must use `floorCredit: true` and include its stable ID, area, tier, tags, legacy state where applicable, rationale, assertion disposition, retained coverage owners, and verification performed. `dead-target` remains available only when the protected target truly no longer exists.

Normal workflow:

```sh
npm run regressions:manifest
npm run regressions:manifest:check
```

Run the generator after adding or changing regression metadata. Commit the generated index with the source change. Do not hand-edit the generated manifest. Edit the exceptions policy only for an intentional policy-floor change, legacy migration, coverage-family policy change, or complete retirement/consolidation record.

## Required Metadata

Each discovered regression must export one metadata object:

```js
export const regressionMeta = Object.freeze({
  "id": "tasks.server-side-list-paging",
  "area": "tasks",
  "tier": "integration",
  "tags": ["database", "paging", "permissions"],
  "description": "Protects bounded, permission-shaped Tasks list paging.",
  "runMode": "isolated-database"
});
```

Required fields:

- `id`: globally unique, stable, lowercase dot-delimited identifier. It is the regression identity even if the file later moves.
- `area`: exactly one canonical primary owner.
- `tier`: exactly one canonical cost/coverage tier.
- `tags`: a sorted array of unique lowercase kebab-case cross-cutting concerns. An empty array is valid.
- `description`: one concise sentence describing the protected contract, not its implementation steps.
- `runMode`: the execution/isolation contract needed to preserve the current four-bucket safety model.

Unknown fields, unknown enum values, duplicate IDs, duplicate paths, malformed tags, and metadata/path area conflicts fail discovery validation. Tags must be unique, sorted, lowercase kebab-case values.

Discovery reads the exported object literal statically; it does not import or execute the regression module. Metadata must therefore remain a JSON-compatible literal: double-quoted string values, arrays of strings, no computed values, functions, spreads, getters, template expressions, or runtime helper calls. Top-level field names may be quoted or unquoted, and a trailing comma is accepted.

## Canonical Areas

- `framework`
- `views`
- `dashboard`
- `workbench`
- `tasks`
- `notes`
- `lists`
- `files`
- `search`
- `notifications`
- `tags`
- `time-tracking`
- `database`
- `permissions`
- `jobs`
- `public-api`
- `release`
- `docs`
- `licensing`

## Canonical Tiers

- `unit-like`: narrow helper or source-contract proof with no route/workflow integration.
- `focused`: one contained shipped behavior or owner boundary; the default for most regressions.
- `integration`: multiple service/route/storage owners or a real database-backed workflow.
- `release-gate`: repository, clean-clone, coverage, version, permission, or release invariant required before shipping.
- `slow`: deliberately expensive process, scanner, worker, performance, or end-to-end proof that should be easy to select or exclude by tier.

## Canonical Run Modes

| `runMode` | Current bucket equivalent | Contract |
| --- | --- | --- |
| `static` | `static/source regressions` | May run in parallel and does not receive a runner database fixture. |
| `serial-database` | `default database regressions` | Runs serially with the runner's database fixture contract. |
| `serial-files` | `file storage regressions` | Runs serially because filesystem, scanner, port, process, or shared storage safety is not proven parallel-safe. |
| `isolated-database` | `isolated database regressions` | May run in parallel only with the existing per-script isolated fixture environment. |

The `fresh-database-regression.mjs` baseline bypass is represented by the generated legacy `baseline-bypass` tag and consumed from its discovered entry. The runner does not infer parallel safety from a filename, area, or tier; `runMode` is always explicit in exported metadata or the frozen legacy snapshot.

## Runner Selection Options

The default remains unchanged:

```sh
npm run check
```

That command runs the full discovered suite and then ESLint. Direct runner options are available for focused iteration and inspection:

```sh
node scripts/run-regressions.mjs --area tasks
node scripts/run-regressions.mjs --tag permissions
node scripts/run-regressions.mjs --tier release-gate
node scripts/run-regressions.mjs --area files --tag storage --dry-run
node scripts/run-regressions.mjs --area release --list
```

- `--area <area>` selects one canonical primary owner.
- `--tag <tag>` selects entries containing the lowercase kebab-case tag.
- `--tier <tier>` selects one canonical tier.
- `--list` prints ID, area, tier, run mode, tags, and path without executing regressions.
- `--dry-run` prints selected buckets and paths without executing regressions or preparing database fixtures.

Area, tag, and tier filters combine with logical AND. They also combine with the existing `LTF_REGRESSION_BUCKET` and bounded `LTF_REGRESSION_REPEAT` environment controls. An unknown option, invalid canonical value, missing option value, or empty result fails with a useful error instead of silently running or skipping a different set.

## Narrow Commands and Changed-File Routing

Use a focused package command while iterating on one owner:

```sh
npm run test:regressions:tasks
npm run test:regressions:files
npm run test:regressions:workbench
npm run test:regressions:database
```

Run `node scripts/suggest-regressions-for-changes.mjs` to inspect the current tracked and untracked working-tree changes. The helper routes module paths to their owning area, shared view-builder/renderer paths to both `framework` and `views`, database/migration/repository paths to `database`, permission/session/workspace/membership paths to `permissions`, and package/version/app-info/release paths to `release`. Rules are additive: a repository file with permission meaning recommends both database and permissions checks. An unrecognized path falls back to `npm run test:regressions` instead of guessing a narrow owner.

Operator guidance:

- For a one-module change, run that module's narrow command first.
- For a shared framework or view change, run both framework/view commands plus every affected module command.
- For a database change, run the database command plus affected module commands; add permissions when access or workspace boundaries are involved.
- For release closeout, always run `npm run check`. Narrow commands are iteration aids and never replace the full release gate.

## Adding a Regression

1. Create `scripts/regressions/<area>/<name>.regression.mjs`.
2. Export `regressionMeta` as the first declaration using the JSON-compatible literal shape above.
3. Choose the safest truthful `runMode`; filesystem, scanner, port, process, shared-state, or unproven database work stays serial.
4. Keep the file import-safe for metadata discovery: assertions may run normally when Node executes the script, but metadata extraction must not depend on module execution.
5. Run `node scripts/run-regressions.mjs --area <area> --list` to confirm discovery and metadata.
6. Run the new regression directly while iterating.
7. Run `npm run regressions:manifest`, review the generated index diff, then run `npm run regressions:manifest:check` and the normal closeout checks.

Do not edit `scripts/regression-suite.mjs` or hand-edit `scripts/regression-coverage-manifest.json` for a new convention-path regression. Discovery and generation own both lists. The exceptions policy changes only when the coverage policy or an explicit exception changes.

## Intended Future Workflow

1. An agent adds one regression script with valid metadata. Shipped in 0.33.6.16.2.
2. The runner discovers both convention-path and transitional legacy-path regressions deterministically. Shipped in 0.33.6.16.2.
3. Metadata determines the primary area, tier, tags, and safe execution mode. Shipped in 0.33.6.16.2.
4. The coverage index/manifest is generated and validated from metadata while preserving documented retirement evidence. Shipped in 0.33.6.16.3.
5. Narrow package commands and changed-area suggestions select from the same discovered registry. Shipped in 0.33.6.16.4.
6. Agents do not manually add the same regression to suite arrays, generated manifests, clean-clone lists, and narrow command lists. Suite and clean-clone duplication were removed in 0.33.6.16.2; generated manifest upkeep landed in 0.33.6.16.3.

Discovery does not authorize bucket weakening, unsafe parallelism, regression retirement, or skipped coverage. Retirement still requires the coverage-manifest evidence contract until its owning slice deliberately replaces that mechanism.
