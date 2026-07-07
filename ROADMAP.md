# Longtail Forge Roadmap

This file is the detailed per-version forward plan for Longtail Forge. README.md should stay cursory and point here for version-level detail.

## Version 0.33.5.29 - Regression and check-suite performance and consolidation pass

Purpose:

With the 0.33.5.27 database-conversion and 0.33.5.28 parameter-binding gap-closeout branches complete (294 regression scripts as of 0.33.5.28.2) plus `eslint` and the separate permission suite, the standard gate is taking long enough to slow the per-slice ceremony. This version makes the regression and check suites materially faster and less flaky **without reducing coverage** — the same bar the 0.33.5.18.6.5.4 lightening pass held. It is deliberately sequenced after 0.33.5.27/0.33.5.28 so the suite is optimized against its post-conversion shape (the new parameter-binding, dialect-guardrail, and gap-closeout regressions included) rather than optimized twice.

Key decision (record in `DECISIONS.md`):

- This is a **test-infrastructure and consolidation** pass, not a coverage-reduction pass. No assertion may be silently dropped: consolidation must fold overlapping/superseded per-slice regressions into a retained script that still carries their assertions, and a coverage ratchet must make an accidental coverage drop fail the suite. If any script is genuinely retired as dead (its target code no longer exists), that retirement is recorded explicitly with rationale, not absorbed into a speedup.

Entry contract and grounding (re-verify at implementation time — code will have drifted):

- The runner is `scripts/run-regressions.mjs` driving buckets from `scripts/regression-suite.mjs` (`REGRESSION_BUCKETS`/`REGRESSION_SCRIPTS`). It spawns **one Node child process per script** (`spawn(process.execPath, [script])`), so process-startup + per-script baseline-DB clone is a large, fixed share of wall-clock independent of assertion work.
- Buckets today: a parallel "isolated database regressions" bucket (default parallelism 4, tunable via `LTF_ISOLATED_REGRESSION_PARALLELISM`/`LTF_REGRESSION_PARALLELISM`), a "static/source regressions" bucket that runs against `process.env` with no baseline, plus the baseline fixture from `scripts/test-support/database-fixture.mjs` (`prepareRegressionBaselineDatabase`, per-script `createScriptEnv`).
- A timing report already exists: set `LTF_REGRESSION_TIMING_JSON` to capture per-script seconds; the runner also prints the slowest 8. Use this as the measurement backbone rather than adding new instrumentation.
- The runner is itself covered (`scripts/regression-runner-regression.mjs`, `scripts/regression-clean-clone-contract.mjs`), and `assertUniqueScripts()` already guards duplicates — extend these rather than replacing them.
- `npm run check` = `run-regressions.mjs` then `eslint .`; `npm run test:permissions` is a separate `permission-regression.mjs` entry. The known transient flake is the isolated-DB bucket under parallelism (per the regression-suite operational notes), currently worked around by running standalone/serial.
- **New consolidation target surfaced by 0.33.5.27**: the static/source bucket now carries a database-contract guardrail cluster that each spawns its own process. The 0.33.5.29.1 measurement shows three current whole-`src/**` walkers (`scripts/parameter-binding-audit-regression.mjs`, `interpolation-enforcement-guardrail-regression.mjs`, and `dialect-enforcement-guardrail-regression.mjs`) plus three adjacent database-contract scripts that read narrower sources/docs (`parameter-binding-layer-regression.mjs`, `parameter-binding-conversion-wave-regression.mjs`, and `database-agnostic-contract-closeout-regression.mjs`). Start source-scan consolidation with the actual whole-tree walkers, then decide whether the adjacent database-contract checks should share the same support module or remain separate. Separately, the many `*-closeout-regression.mjs` scripts (view-builder, view-conversion-branch, surface-standardization, files-conversion, files-browse-edit-preview, notes-import, module-file, database-agnostic-contract) are per-branch artifacts that frequently re-assert what their own branch's focused regressions already cover — the prime consolidation candidates.

Sizing rule for this branch:

- Each sub-slice has one primary blast radius and should be completable in a single focused session. Measure before changing execution model; do not combine runner execution-model work with source-scan consolidation, coverage-ratchet work, closeout-regression pruning, or isolated-DB flake fixes. If a measurement result shows a slice below is still too broad, split that slice before implementing it.

### Version 0.33.5.29.1 - Timing baseline and suite inventory (measure only)

- [x] Run the full suite with `LTF_REGRESSION_TIMING_JSON` set and capture a per-script timing baseline; record total wall-clock, the slow tail, and an estimate of the fixed per-script process-spawn + baseline-clone overhead (e.g. by comparing a trivial static script's floor time against assertion-heavy scripts).
- [x] Categorize the regression scripts by bucket, by whether they need a database at all, by closeout-vs-focused ownership, and by whole-source-tree scan behavior.
- [x] Produce a short target list in `docs/` (or the audit-style doc pattern): expected wall-clock reduction, the source-scan cluster to consolidate, closeout-regression candidates to inspect, runner scheduling candidates, and the separate isolated-DB flake diagnosis still required. Change no runtime/test behavior in this slice.

Acceptance criteria:

- A measured baseline, script inventory, overlap map, and explicit speedup/consolidation target list exist before any execution-model or script change is made.

### Version 0.33.5.29.2 - Database source-scan consolidation

**Model: GPT-5.5 Extra High** — high-volume mechanical rollout across the full-tree guardrails where a silent scan/assertion error breaks the coverage guarantee.

- [x] Factor the repeated whole-`src/**` source-tree read/tokenize behavior used by the actual full-tree database-contract guardrails (`parameter-binding-audit`, `interpolation-enforcement-guardrail`, and `dialect-enforcement-guardrail`) into shared test-support code, then review the full six-script database-contract group (`parameter-binding-audit`, `parameter-binding-layer`, `parameter-binding-conversion-wave`, `interpolation-enforcement-guardrail`, `dialect-enforcement-guardrail`, `database-agnostic-contract-closeout`) against that helper in one slice. Keep adjacent narrower checks separate unless the 0.33.5.29.1 target list and implementation proof show shared support preserves their assertions cleanly.
- [x] Preserve every original assertion's wording and failure behavior. If the 0.33.5.29.1 target list supports it, replace the actual full-tree walker entries with a single multi-assertion source-scan script; otherwise keep the separate entry points but eliminate the duplicate scan/parse work inside each full-tree walker.
- [x] Update `scripts/regression-suite.mjs`, the runner/clean-clone guardrails, and the performance target doc to reflect the retained source-scan contract.
- [x] Spot-check at least two folded assertions by temporarily breaking their target pattern during local verification, and record before/after timing for the cluster.
- [x] Only split this slice if the 0.33.5.29.1 measurement shows the shared scanner itself is non-trivial; do not pre-split the mechanical rollout by default.

Acceptance criteria:

- The actual full-tree database-contract guardrails run over one shared scan path (ideally one process), adjacent database-contract scripts have an explicit keep-separate-or-share decision, every original assertion still runs, suite registration stays clean, and before/after timing is recorded.

### Version 0.33.5.29.3 - Runner scheduling and timing optimization

**Model: GPT-5.5 Extra High** — changes runner execution semantics; isolation and fail-fast correctness are load-bearing.

- [x] Implement exactly one non-consolidation runner optimization from the 0.33.5.29.1 target list, such as auto-tuning isolated parallelism to available cores while preserving `LTF_ISOLATED_REGRESSION_PARALLELISM`/`LTF_REGRESSION_PARALLELISM`, or one narrowly-scoped static bucket batching mechanism for proven read-only scripts. If more than one runner change is needed, split before implementing the second.
- [x] Preserve bucket order, fail-fast semantics, per-script timing output, `LTF_REGRESSION_TIMING_JSON`, baseline bypass behavior for `fresh-database-regression.mjs`, and isolation for mutating database scripts.
- [x] Extend `scripts/regression-runner-regression.mjs` / `scripts/regression-clean-clone-contract.mjs` to prove the new runner behavior still isolates mutating scripts and still fails correctly on a single script failure.
- [x] Record the new timing baseline.

Acceptance criteria:

- One runner execution-model improvement lands with its isolation/failure/timing guarantees proven and without bundling source-scan consolidation or script pruning. Landing it early (with 0.33.5.29.2) shortens the mandatory suite run every remaining slice pays at closeout.

### Version 0.33.5.29.4 - Coverage ratchet and retirement manifest

**Model: GPT-5.5 Extra High** — new enforcement mechanism; a false negative silently defeats coverage preservation.

- [x] Add a coverage-preservation ratchet: a manifest/count check and, where practical, assertion-inventory metadata that fails if the retained regression set drops below the recorded floor without an explicit retirement entry.
- [x] Define the documented retirement entry format: script retired, assertions moved or rationale for dead target code, retained script/coverage owner, and verification performed.
- [x] Add focused coverage for the ratchet itself, including a failing fixture/path for an undocumented script drop.
- [x] Update the performance target doc with the ratchet rules. Do not consolidate or retire scripts in this slice except for test fixtures that prove the ratchet.

Acceptance criteria:

- A coverage ratchet prevents silent future regression drops, and the repo has a documented way to retire dead scripts without hiding coverage loss.

### Version 0.33.5.29.5 - Closeout-regression consolidation

**Model: GPT-5.5 Extra High** — high-volume fold across ~12 closeout scripts with coverage-preservation risk.

- [x] Using the 0.33.5.29.1 overlap map and the 0.33.5.29.4 ratchet, inspect the full `*-closeout-regression.mjs` cluster in one pass: the view/surface/Files group (`view-builder-closeout-regression.mjs`, `view-conversion-branch-closeout-regression.mjs`, `surface-standardization-closeout-regression.mjs`, `files-conversion-closeout-regression.mjs`, `files-browse-edit-preview-closeout-regression.mjs`, `module-file-closeout-regression.mjs`) and the remaining artifacts (`notes-import-closeout-regression.mjs`, `lists-closeout-regression.mjs`, `markdown-closeout-regression.mjs`, `work-resume-state-closeout-regression.mjs`, `runtime-database-foundation-closeout-regression.mjs`, `file-storage-scanner-runtime-closeout-regression.mjs`, and any other `*-closeout-regression.mjs` still listed in `scripts/regression-suite.mjs`).
- [x] Fold only assertions demonstrably covered by a retained focused regression or a retained closeout script; keep distinct branch-boundary assertions that still protect active behavior. Record every consolidation and any genuine retirement with rationale in `docs/` and `CHANGELOG.md`, moving coverage through the ratchet manifest.
- [x] Spot-check at least two moved assertions by temporarily breaking their target behavior, then re-run the full suite and confirm the retained coverage map is current.
- [x] Split this slice by file-group only if the 0.33.5.29.1 inventory shows the closeout cluster is too large for one safe session; do not pre-split it into two ceremonies by default.

Acceptance criteria:

- Redundant closeout assertions are folded into retained owners where safe, every distinct assertion still runs, the coverage movement is recorded through the ratchet manifest, and suite count/timing changes are documented.

### Version 0.33.5.29.6 - Diagnose and stabilize the isolated-database bucket

**Model: GPT-5.5 Extra High** — concurrency/race diagnosis and fix; genuinely hard reasoning under nondeterminism.

- [ ] Diagnose the known isolated-DB transient flake first (incorporating whatever the 0.33.5.29.1 target list already flagged): run a bounded repeat of the isolated bucket under default and higher parallelism, inspect temp database/path/lock/port naming and cleanup for the scripts that contend, and pin the narrowest root cause plus the exact stress check that will prove the fix.
- [ ] Fix that root cause so the parallel bucket is deterministic under its default and a higher parallelism setting; ensure per-script database/temp resources are uniquely named and cleaned up with no cross-script path/lock/port contention.
- [ ] Add a focused regression or bounded repeat-run mode that exercises the isolated bucket under parallelism to prove stability, and update the operational notes to retire the standalone/serial workaround only after the stress check passes.

Acceptance criteria:

- The isolated-database bucket runs deterministically under parallelism without the standalone/serial workaround, proven by a concurrency stress check. Diagnosis and fix are one slice because they share the isolated-bucket blast radius; separating them would only add a measure-only ceremony.

### Version 0.33.5.29.7 - Check/lint speed, docs, and branch closeout

**Model: GPT-5.4** — mostly documentation of shipped behavior and routine closeout ceremony; low correctness risk.

- [ ] Review the `npm run check` path (regressions + `eslint .`) and `npm run test:permissions` for cheap final wins (e.g. eslint caching or avoiding redundant work) while keeping the same gate semantics.
- [ ] Document the tuning knobs (`LTF_ISOLATED_REGRESSION_PARALLELISM`/`LTF_REGRESSION_PARALLELISM`, `LTF_REGRESSION_TIMING_JSON`), the runner execution model, the source-scan consolidation, the coverage ratchet, and the retired flake workaround in the appropriate `docs/` file and `DECISIONS.md`.
- [ ] Complete the standing branch closeout ceremony: version/package metadata, `CHANGELOG.md`, roadmap/archive bookkeeping, `npm run check`, `npm run test:permissions`, before/after wall-clock readout, SQLite integrity check if database fixtures changed, and `/api/app-info` after restart.

Acceptance criteria:

- The full standard gate is meaningfully faster and no longer flaky, coverage is provably preserved and ratcheted, the tuning knobs and model are documented, and the branch is closed out per the normal ceremony.

## Version 0.33.6 - Dashboard and Workbench Formalization as Project hub and work center

Purpose:

Turn the already-existing Dashboard and Workbench surfaces into framework-owned hosts that render module *contributions* instead of hardcoded Tasks/Time-Tracking behavior. Dashboard becomes the workspace overview/orientation surface; Workbench becomes the active work/resumption/focus surface driven by a single normalized work-candidate model, focus modes, the existing resume-state service, a floating Quick Action Capture (QAC) drawer, and a Workbench Inspector.

This is a formalization and de-hardcoding pass, not greenfield. Dashboard, Workbench, and the resume-state service already exist; several contribution contracts already exist. The work is finishing/converting them, adding the net-new contracts, and reconciling the QAC/Inspector direction from `TODO.md`.

Dependencies and framework baseline:

- 0.33.5.9 shipped the framework-owned resume-state service and `/api/work-resume`.
- 0.33.5.15/0.33.5.16/0.33.5.18 provide the `LongtailForge.view` primitives, validated `viewSurfaces`/`renderSurface(...)`, minimal protected hosts, and the finalized view baseline. Dashboard/Workbench hosts must consume this baseline rather than hand-building framework-owned anatomy (mirrors the Reporting host rule in 0.33.8).

Current wiring (grounding for this branch):

- Contribution contracts already half-exist. The module manifest already validates `dashboard` and `workbench` contributions (plus `timerSources`/`workItemSources`) in `src/core/modules/manifest-contract.js:1019-1047`, and `modulesService` already exposes `listDashboardPanels`, `listWorkbenchCards`, `listTimerSources`, `listWorkItemSources` (`src/core/modules/modules.service.js:997-1023`), all filtered through the shared `listWorkspaceContributions(workspaceId, session, fieldName)` path (enabled-module + `requiredPermissions` + `requiredWorkspaceCapabilities` + `requiresEnabledModules`). The **net-new** contracts are focus modes and a candidate source; a resume-snippet producer contract already exists (below).
- Workbench still hardcodes Tasks + Time-Tracking despite having the registry: `src/services/workbench.service.js:1-21` imports `tasksService`/`activeTimersService` and calls them directly alongside `listWorkbenchCards`/`listTimerSources`/`listWorkItemSources`. This is the primary de-hardcoding target.
- Dashboard is hand-built static HTML, not a framework host: `views/protected/dashboard.html` hardcodes the client/billing panels inline and exposes only a hidden `data-dashboard-extension-panels` stub for contributions. Converting it to a minimal host is in scope for this version.
- Resume state is fully built and safe by construction. `GET /api/work-resume` + `POST /api/work-resume/:id/dismiss` (`src/routes/work-resume.routes.js`) return a rich normalized item (`title`, `contextLabel`, `nextAction`, `sourceUrl`, `priority`, `dueAt`, `blockedReason`, `resumeRankHint`, `lastActionLabel`, `metadata`, `mode`). It is fed by an event-driven producer registry (`src/services/work-resume-state-producers.js`) with a strict field allowlist and forbidden-field patterns (`body`, `html`, `attachment`, `secure`, `encrypt`, `storage.key`, `scanner`, ...). This producer payload is the basis for the shared work-candidate shape below.
- Global chrome is injected per protected page via the shared `navigation.js` + `footer.js` includes (see `views/protected/dashboard.html`); the QAC floating drawer hooks into that app-shell include so it appears on all protected screens.

Sizing rule for this branch:

- Each sub-slice below should have one primary blast radius and should be completable in a single focused implementation session.
- Each implementation sub-slice follows the normal release ceremony: focused regressions, relevant docs, `CHANGELOG.md`, package metadata when the version changes, and verification.
- Do not combine adjacent slices just because the same helper file is already open. In particular, the candidate model (0.33.6.2) is split from its ranking/sources (0.33.6.3), and the Dashboard host conversion (0.33.6.8) is split from moving Time-Tracking's panels into contributions (0.33.6.9).

Key decisions for this branch:

- QAC is a floating bottom-right drawer available on all protected pages, NOT a permanent right-side rail (reconciling `TODO.md` against the earlier rail wording). Record this in `DECISIONS.md`.
- The Workbench Inspector is a persistent right panel on wide Workbench layouts showing related record titles and read-only previews. It is a distinct surface from QAC and must not steal the same screen space.
- Next-action candidates and resume state share ONE normalized work-candidate shape derived from the existing resume-producer payload; there is no second parallel candidate contract. The candidate model inherits the producer allowlist/forbidden-field safety so candidates can never leak body/secure/storage-key content.

### Version 0.33.6.1 - Surface contracts and scope (plan only)

- [ ] Define Dashboard as the workspace overview/orientation surface and Workbench as the active work/resumption/focus surface, and keep them separate.
- [ ] Confirm and document the already-existing contribution contracts (`dashboard`, `workbench`, `timerSources`, `workItemSources`) and the resume-state producer registry, so later slices extend rather than reinvent them.
- [ ] Name the net-new contracts this branch adds: a focus-mode contract/registry (0.33.6.4) and a normalized work-candidate source (0.33.6.2-0.33.6.3).
- [ ] Enumerate the hardcoded Task/Time assumptions to remove (`src/services/workbench.service.js` direct `tasksService`/`activeTimersService` calls and its hardcoded `modules: { tasks, timeTracking }` bootstrap return shape; the inline panels in `views/protected/dashboard.html`; and the first-party module IDs baked into the framework registry service itself — `TASKS_MODULE_ID`/`TIME_TRACKING_MODULE_ID` constants, the `readModuleSettingValue` `taskTimersEnabled` special-case, and the `tasksEnabled`/`timeTrackingEnabled` compat-flag injection in `decorateWorkspaceSettings` in `src/core/modules/modules.service.js`) and assign each to its owning slice. These compat flags cannot be retired until the Dashboard/Workbench/settings browser code that reads them is de-hardcoded in this branch, which is why they land here rather than in the earlier 0.33.5.27 database-conversion waves.
- [ ] Preserve, as a standing requirement for every slice, permission checks, module enabled/disabled checks, workspace boundaries, and private/secure/deleted-record handling.
- [ ] Update the implementation plan only; do not change runtime behavior in this slice.

Acceptance criteria:

- The Dashboard/Workbench boundary, the existing vs. net-new contracts, and the de-hardcoding targets are documented, with each target assigned to a later slice.

### Version 0.33.6.2 - Normalized work-candidate contract and service

- [ ] Promote the resume-producer payload shape (`src/services/work-resume-state-producers.js`) into a single normalized work-candidate shape reused by both next-action ranking and resume state: `moduleId`, `recordType`, `recordId`, `title`, `contextLabel`, `reason`, primary-action descriptor, `sourceUrl`, `priority`, `dueAt`, `blockedReason`, and a rank hint.
- [ ] Add a framework-owned candidate service that assembles candidates from resume-state rows plus live signals (e.g. running/paused timers) behind one shape.
- [ ] Inherit the producer safety rules verbatim: the same field allowlist and forbidden-field patterns (`body`, `html`, `attachment`, `secure`, `storage.key`, `scanner`, ...) so a candidate can never carry body text, secure content, storage keys, or raw IDs in labels.
- [ ] Every candidate must expose a reason string, a primary action, a safe context label, and a source URL; labels follow the `docs/workflow-context-contract.md` no-raw-ID rule.
- [ ] Add regressions proving the shape is stable and that forbidden fields are stripped even if a source tries to supply them.

Acceptance criteria:

- One normalized, safe-by-construction work-candidate shape backs both next-action and resume behavior, with no second parallel contract.

### Version 0.33.6.3 - Deterministic ranking and module candidate sources

- [ ] Add deterministic candidate ranking: running timers, paused timers, overdue assigned work, due today, blocked/stale work, recently touched work, due this week.
- [ ] Tasks contributes task candidates and Time Tracking contributes running/paused timer candidates through the shared contract; Lists, Notes (Active Work), and future Tickets contribute when their integrations are ready.
- [ ] Reuse the existing resume-state producer registry where a candidate is event-driven; add a pull-style candidate source only where live state (e.g. active timers) is not captured by producers.
- [ ] Keep ranking a pure function of candidate fields (no hidden per-module ordering) so the "one recommended next action" is deterministic and testable.
- [ ] Add regressions for ranking order across mixed candidate types and for disabled-module/permission filtering of sources.

Acceptance criteria:

- Candidates from multiple modules rank deterministically into a single ordered list, permission- and module-aware.

### Version 0.33.6.4 - Focus-mode contract and resolver

- [ ] Add a focus-mode contract/registry (following the `listWorkspaceContributions` pattern) with the canonical modes: Start my day, Pick up where I left off, What's due next, Work this week, Review blocked work, In progress, Project focus, and Client focus (Business workspaces only).
- [ ] Each focus mode resolves to a normalized focus context (scope, client/project, status/date filters) passed to the candidate sources from 0.33.6.3.
- [ ] Focus modes are user-friendly labels over deterministic filters, not separate hardcoded pages.
- [ ] Client focus must be hidden outside Business workspaces; Personal/Family must not surface client scope or labels.
- [ ] Add regressions for mode-to-context resolution and workspace-type gating.

Acceptance criteria:

- A canonical focus-mode set resolves to normalized focus contexts that drive the candidate sources, with correct workspace-type gating.

### Version 0.33.6.5 - De-hardcode the Workbench service

- [ ] Remove the direct `tasksService`/`activeTimersService` imports and hardcoded `tasks`/`time-tracking` branches from `src/services/workbench.service.js`; drive timers and work items purely through the contribution registry and the candidate service. The `TASKS_MODULE_ID`/`TIME_TRACKING_MODULE_ID` constants and the hardcoded `modules: { tasks, timeTracking }` bootstrap return shape must both be gone; if the browser still needs a module-state map, build it generically from enabled-module state keyed by module ID.
- [ ] Also de-hardcode the framework registry service itself: remove the `taskTimersEnabled` special-case in `readModuleSettingValue` and the `tasksEnabled`/`timeTrackingEnabled` compat-flag injection in `decorateWorkspaceSettings` (`src/core/modules/modules.service.js`), retiring those deprecated top-level flags now that the settings/Workbench browser code consuming them is being converted in this branch. `src/core/modules/` must not name specific first-party module IDs to make generic contribution/settings decisions.
- [ ] Keep the existing Workbench bootstrap response shape working for the browser during the transition (adapt internals without breaking the page contract).
- [ ] Preserve enabled/disabled-module handling, permission checks, and workspace boundaries already enforced in `bootstrap`.
- [ ] Add regressions proving Workbench renders the same live data with Tasks/Time enabled and degrades cleanly when either is disabled, without importing them directly, and that no first-party module ID remains hardcoded in `workbench.service.js` or the `modules.service.js` settings/decoration paths.

Acceptance criteria:

- Workbench data comes entirely from contributions and the candidate service, with no hardcoded module imports and no behavior regression, and the framework registry service (`modules.service.js`) no longer names specific first-party modules to make generic settings/contribution decisions.

### Version 0.33.6.6 - Guided Workbench UI

- [ ] Add a question-led Workbench entry that presents the focus modes as friendly questions ("Pick up where I left off", "Start with what's due", "Work this week", "Review blocked work", "Focus on a project") over the 0.33.6.4 deterministic filters.
- [ ] Show one recommended next action (top-ranked candidate) before showing longer lists.
- [ ] Keep secondary lists available but visually subordinate; do not turn Workbench into another full module index.
- [ ] Add empty states that suggest a useful next step instead of dead ends.
- [ ] Build on `LongtailForge.view` primitives and framework view states; do not hand-build framework-owned anatomy.
- [ ] Add focused browser/static regressions for focus selection, recommended-action rendering, and empty states.

Acceptance criteria:

- Workbench opens as a guided, focus-led surface that highlights one recommended action first and keeps secondary work subordinate.

### Version 0.33.6.7 - Resume "Pick up where I left off" UI

- [ ] Wire the "Pick up where I left off" focus to `GET /api/work-resume` first, falling back to recent activity only when no active resume rows exist.
- [ ] Show one recommended resume candidate first; keep secondary candidates subordinate.
- [ ] Allow users to dismiss stale resume candidates via `POST /api/work-resume/:id/dismiss`.
- [ ] Preserve permission checks, disabled-module behavior, deleted-record handling, and private/secure content boundaries (already enforced by the producer allowlist).
- [ ] Add regressions for resume-first ordering, activity fallback, dismiss behavior, and safe handling of stale/unavailable targets.

Acceptance criteria:

- The resume focus consumes the existing resume-state service, recommends one candidate first, supports dismissal, and never exposes unsafe content.

### Version 0.33.6.8 - Dashboard host conversion

- [ ] Convert `views/protected/dashboard.html` into a minimal framework host that renders contributed dashboard panels via `modulesService.listDashboardPanels` and registered panel renderers, using `LongtailForge.view` primitives for shell/header/status/empty/error states.
- [ ] Keep the existing panels working through the host during the conversion (no visual/data regression), retiring the hidden `data-dashboard-extension-panels` stub.
- [ ] Do not hand-build framework-owned Dashboard anatomy in static HTML or ad-hoc DOM when a view primitive or descriptor field covers it.
- [ ] Add a focused static regression proving the Dashboard page is a minimal framework host.

Acceptance criteria:

- Dashboard renders module-contributed panels through a framework host rather than hardcoded static markup, with existing panels preserved.

### Version 0.33.6.9 - Move Time-Tracking dashboard panels into contributions

- [ ] Move the currently-inline billing/client Dashboard panels (client summary, current-month billables, hours-and-billables chart) out of `dashboard.html` and into Time-Tracking-owned `dashboard` contributions with their own renderers and data routes.
- [ ] Keep Time Tracking responsible for the billing/time data and calculations; keep the framework responsible only for panel hosting, placement, and status/empty/error states.
- [ ] Ensure the panels disappear cleanly when Time Tracking is disabled or the user lacks the required permissions, via the existing contribution filtering.
- [ ] Add regressions proving the panels appear only when Time Tracking is enabled and permitted, and that no hardcoded Task/Time assumptions remain in the Dashboard host.

Acceptance criteria:

- The Dashboard billing/client panels are module contributions gated by enabled-module and permission checks, with no remaining hardcoded Time-Tracking markup in the host.

### Version 0.33.6.10 - Quick Action Capture floating drawer

Decision:

QAC is app-shell utility behavior, not a Workbench focus mode. It provides low-distraction access to common capture and recovery tools without navigating away from the current work surface: reduce focus/workflow interruption, keep productivity focused, and allow quick idea/thought capture without derailing the work train. QAC is a floating bottom-right drawer (not a permanent rail).

- [ ] Add a floating, drawer-style QAC control anchored bottom-right, available on ALL protected screens via the shared app-shell include (`navigation.js`/`footer.js`), quiet until the user opens it.
  - [ ] Use an icon that communicates action/capture rather than words that consume screen real estate (evaluate a "runner"/lightning-style glyph against the existing icon registry at build time).
  - [ ] On wide screens the drawer may show icon + small text; on narrow screens it collapses to icon-only.
- [ ] Drawer actions are contributed by enabled modules or mapped from registered module actions; since the user may not yet have a target record, capture actions should offer an initial find-or-create modal.
- [ ] First actions and their target behavior:
  - [ ] Timer - opens the future 2-timer modal when it exists; temporary fallback to `time-tracker.html` (see deferred follow-ups in 0.33.6.12).
  - [ ] Task - opens a task picker with an Add Task button, then the appropriate task modal.
  - [ ] Note - opens a note picker with an Add Note button, then the appropriate note modal.
  - [ ] List - opens a picker to add an item to a list or add a list, then the appropriate modal.
  - [ ] File - opens the Add File modal.
  - [ ] Reporting - opens the future report-creation modal when it exists; temporary fallback to `reporting.html`.
  - [ ] Search - opens the future advanced-search modal when it exists; temporary fallback to `search.html`.
- [ ] Actions open modals without changing the current page, receive safe current-page context when available, and return focus to the triggering control when closed.
- [ ] If a modal action does not exist yet, the QAC action may be hidden, disabled with a clear tooltip, or temporarily link to the existing module page as an explicitly temporary fallback; temporary navigation fallbacks must be removed once the modal action exists.
- [ ] Do not use badges, alerts, or recommendation behavior in the drawer; notifications and Workbench own those concerns.
- [ ] Add regressions for drawer presence on protected pages, contributed-action gating, focus return, quiet-until-opened behavior, and temporary-fallback labeling.

Acceptance criteria:

- A quiet floating QAC drawer is available on all protected pages, opens contributed capture actions as modals (with explicit temporary page fallbacks), preserves focus, and adds no badge/alert noise.

### Version 0.33.6.11 - Workbench Inspector panel

- [ ] Add a persistent Inspector panel on wide Workbench layouts (subordinate to the main surface) that stays out of the QAC drawer's space.
- [ ] Show related record titles when idle; clicking a related title opens a read-only preview inside the Inspector (reuse existing preview/linked-context infrastructure rather than a new viewer).
- [ ] Keep the Inspector permission-safe and workspace-aware, and apply the no-raw-ID/`docs/workflow-context-contract.md` label rules; non-Workbench screens remain centered unless they explicitly opt into Inspector behavior.
- [ ] Degrade gracefully on narrow screens (collapse/hide) and when there is no related context.
- [ ] Add regressions for related-title rendering, read-only preview, permission scoping, and narrow-screen behavior.

Acceptance criteria:

- The Workbench Inspector shows permission-safe related titles and read-only previews on wide layouts without competing with the QAC drawer or leaking unsafe content.

### Version 0.33.6.12 - Guardrails, docs, decisions, and closeout

- [ ] Record the branch decisions in `DECISIONS.md`: QAC as a floating drawer (not a permanent rail), the single shared work-candidate shape, and the Workbench Inspector as a distinct surface.
- [ ] Add guardrails so Dashboard/Workbench hosts do not hand-build framework-owned page/header/filter/status anatomy when a view primitive covers it, and do not reintroduce hardcoded module assumptions.
- [ ] Add a framework-coupling guardrail (lint/regression grep) that fails if `src/core/**` or the framework aggregation services under `src/services/**` (Workbench, Dashboard host) import a specific first-party module service/repo or hardcode a first-party module ID string to make a generic decision, outside an explicitly documented allowlist. Record the allowlist and the still-coupled framework services deferred to their own slices (Reporting → 0.33.8; public API and tag propagation → 0.39.15) so the coupling debt is tracked rather than silently accepted.
- [ ] Update `docs/declarative-view-surfaces.md`, `docs/module-contract.md`, and `docs/view-building-contract.md` with the Dashboard/Workbench host status and the focus-mode/candidate/QAC contribution boundaries.
- [ ] Define the deferred future-modal follow-ups the QAC actions temporarily fall back to, as explicit cross-referenced items (not hidden inside QAC bullets):
  - [ ] 2-timer Timer modal (redirect the QAC Timer action to it once built).
  - [ ] Advanced-search modal + search-result display modal, including routing all search results (even main-ribbon searches) through it; evaluate at build time whether this needs its own roadmap version (e.g. 0.33.9) given the potential search overhaul.
  - [ ] Report-creation modal, cross-referenced to 0.37.5.
- [ ] Run the Dashboard/Workbench regressions, `npm run check`, and `npm run test:permissions` (re-running any transiently-flaky isolated-DB regressions standalone to confirm).
- [ ] Verify `/api/app-info` reports the expected version after restart and that Dashboard/Workbench render correctly with modules enabled and disabled.

Acceptance criteria:

- Dashboard/Workbench are framework-owned hosts driven by contributions and the shared candidate model, decisions and docs are recorded, deferred modal follow-ups are cross-referenced, and the regression suite covers the new surfaces.

## Version 0.33.7 - Task Calendar Views (lean, read-only)

Purpose:

Give the Dashboard/Workbench work a calendar companion as soon as it lands: a read-only calendar that visualizes existing task due dates and the reminder schedule shipped in 0.33.5.21.8. This is intentionally lean. User-created calendar events, iCal/shared-calendar display, and external Google/Outlook sync stay at 0.36.0 (Calendars and Calendar Views) and the 0.70.x integrations work; this slice must not build them.

Scope decision:

- Read-only. No calendar event record type, no event creation, no iCal, and no external calendar sync in this slice.
- Framework-owned Calendar host built on the finalized 0.33.5.18 view baseline and the bounded-query pattern from 0.33.5.20, not a bespoke Calendar-only layout.
- Data comes from the existing task calendar-window path (`GET /api/tasks/calendar` -> `tasksService.calendarWindow` -> `tasksRepository.readDueBetween`), which is already workspace- and permission-aware and date-range bounded (`canReadTask` filtering, `taskCalendarRow` shape). Extend it only where needed; do not replace it with a load-everything query.

### Version 0.33.7.1 - Task calendar data contract

- [ ] Confirm/extend `tasksService.calendarWindow` (`src/modules/tasks/tasks.service.js`) to return everything a month/week/day render needs: task id, title, due date, due time/`due_at_utc`, status, priority, client/project context, assignee summary, and a task URL/link.
- [ ] Include reminder markers from the 0.33.5.21 reminder schedule (the `reminder_at_utc` occurrences from `taskRemindersService`) so the calendar can show when reminders fire, not only the due date.
- [ ] Keep the range bounded (reuse the existing start/end window and the 0.33.5.20 bounded-query pattern via `readDueBetween`); clamp or reject overly wide ranges instead of loading all tasks.
- [ ] Keep results permission- and workspace-aware (already enforced by `canReadTask` in `calendarWindow`); archived/complete and disabled-module handling must match the rest of Tasks.

### Version 0.33.7.2 - Framework Calendar host and month/week/day views

- [ ] Add a framework-owned Calendar surface (protected page + browser behavior) built on `LongtailForge.view` primitives and the 0.33.5.18 anatomy, not hand-built layout/CSS.
- [ ] Render read-only month, week, and day views of task due dates (year view can defer to 0.36.0).
- [ ] Show each task as a calendar entry with its title and a priority/status affordance, plus a reminder indicator on days a reminder fires; clicking an entry opens the existing task editor/detail (reuse the task modal) rather than an inline editor.
- [ ] Handle empty/loading/error states through the framework view states, not ad-hoc DOM.

### Version 0.33.7.3 - Filters, navigation, and Workbench hook

- [ ] Add client (business workspace only) and project filters, mirroring the filter behavior used by Tasks and the Reporting host.
- [ ] Add period navigation (previous/next/today) and view switching (month/week/day) that re-query the bounded window.
- [ ] Add framework navigation for the Calendar surface, permission- and module-aware.
- [ ] Provide a lightweight entry point from Workbench/Dashboard (e.g. a "this week" affordance or link) so the calendar reinforces the "what's due next / work this week" focus modes; keep Workbench framework-owned and do not duplicate calendar logic there.

### Version 0.33.7.4 - Guardrails, docs, and closeout

- [ ] Do not introduce a calendar event record type, iCal parsing, or external calendar sync in this slice; cross-reference 0.36.0 as the owner of events/iCal and the 0.70.x work as the owner of Google/Outlook sync.
- [ ] Add guardrails so the Calendar host does not hand-build framework-owned page/header/filter/status anatomy when a view primitive already covers it.
- [ ] Add focused regressions: bounded-range enforcement, permission/workspace scoping (no cross-workspace or unreadable tasks leak), reminder-marker correctness, and disabled-module behavior.
- [ ] Update `docs/declarative-view-surfaces.md` and the view/module contract docs with the Calendar host status.
- [ ] Update the changelog and verify `/api/app-info` after restart.

Acceptance criteria:

- A read-only task calendar (month/week/day) shows task due dates and reminder markers, filtered by client/project, consuming the existing bounded, permission-aware task calendar-window path.
- Calendar entries link back to their task; the surface reuses framework view anatomy and adds no event/iCal/external-sync behavior (those remain at 0.36.0 / 0.70.x).
- The calendar is reachable from Workbench/Dashboard and reinforces the "what's due / this week" focus without duplicating calendar logic.

## Version 0.33.8 - Reporting Framework and Time Report Contribution

Decision:

Reporting is framework-owned report infrastructure, not a normal disable-able first-party workflow module. The framework owns the Reporting page, report catalog, contribution filtering, report execution dispatch, shared filter host, loading/error/empty states, and future saved/export/export scheduling behavior. Individual modules own the actual report definitions, report runners, data queries, domain calculations, result shapes, and record-level permission checks.

The first 0.33.8 report should remain intentionally small: Time Tracking contributes one Project Time & Billing report. Do not build a custom report builder, report designer, analytics dashboard, or saved report system in this pass.

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
`src/modules/reporting` workflow module just to fit module-owned `viewSurfaces`. 0.33.8 must decide
and document the framework-owned equivalent: either a framework-owned descriptor/config source that
the same renderer can consume, or a narrow framework host adapter built directly on
`LongtailForge.view` primitives where the descriptor contract cannot yet model report execution.

### Version 0.33.8.1 - Reporting Architecture and Framework View Baseline

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

### Version 0.33.8.2 - Reporting Contribution Contract

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

### Version 0.33.8.3 - Reporting Framework Catalog Route

- [ ] Add framework-owned report catalog route:
  - [ ] `GET /api/reporting/catalog`
- [ ] Return only reports allowed by enabled modules, workspace capabilities, required modules, and user permissions.
- [ ] Include report metadata, supported filters, renderer ID, default filter values, and report-specific permission requirements.
- [ ] Ensure disabled modules do not contribute active catalog reports.
- [ ] Ensure reports from historically readable disabled modules are only visible when explicitly allowed by contribution and module policy.
- [ ] Add focused catalog regressions for disabled modules, missing permissions, workspace capability filtering, and required-module filtering.

### Version 0.33.8.4 - Reporting Runner Registry and Execution Route

- [ ] Add framework-owned report execution route:
  - [ ] `GET /api/reporting/reports/:moduleId/:reportId/run`
  - [ ] or a stable equivalent using a report key.
- [ ] Add a server-side report runner registry keyed by stable runner IDs.
- [ ] The framework Reporting service should validate report availability, permissions, enabled modules, workspace capability requirements, and basic filter shape before dispatching.
- [ ] The module-owned runner should remain responsible for domain-specific data access, calculations, and record-level permission safety.
- [ ] Normalize execution errors into framework-owned report status/error payloads without exposing implementation details.
- [ ] Add focused execution regressions for unknown report IDs, missing runners, denied permissions, disabled modules, and invalid filter shape.

### Version 0.33.8.5 - Time Tracking Project Time & Billing Contribution

- [ ] Move Project Time & Billing report logic out of the framework Reporting service and into Time Tracking-owned report/service code.
- [ ] Make removal of framework→module coupling a hard bar for this move, not just a logic relocation: after the migration, `src/services/reporting.service.js` must not directly import `tasksService`, `timeEntriesService`, `clientsService`, or any other specific module service/repo. The framework Reporting service keeps only catalog/dispatch/host responsibilities; all client/project/task/time-entry data access moves behind the module-owned runner registered by ID. Any client/project hierarchy the runner needs must come through a module-owned contract (the Clients/Projects module), not a framework-level import.
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

### Version 0.33.8.6 - Correct Project and Client Rollup Billing Math

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

### Version 0.33.8.7 - Framework Reporting Host Shell

- [ ] Keep one framework-owned `reporting.html` page.
- [ ] Reduce `views/protected/reporting.html` to a minimal framework host that loads shared view assets,
      the chosen Reporting host renderer/adapter, and the Reporting browser behavior file.
- [ ] Convert the hard-coded Time Report UI into a framework Reporting host that loads available report definitions from the catalog.
- [ ] Render the page shell, header, report selector, status/error/empty states, filter host, and results host through the chosen framework view path.
- [ ] Do not hand-build framework-owned Reporting anatomy in static HTML or ad-hoc browser DOM when a descriptor field or `LongtailForge.view` primitive exists.
- [ ] Keep the first host simple: one selected report, one filter area, one status area, and one results area.
- [ ] Add a focused static regression proving the Reporting page is a minimal framework host.

### Version 0.33.8.8 - Reporting Filter Host and Report Selection

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

### Version 0.33.8.9 - Project Time & Billing Result Renderer

- [ ] Add a registered report result renderer for `time-project-billing-table`.
- [ ] The first renderer may remain specific to Project Time & Billing, but it should use framework table/action primitives where they fit.
- [ ] Preserve hierarchical project display:
  - [ ] Parent rows can expand/collapse child rows.
  - [ ] Child rows are display-only rows under their parent.
  - [ ] Footer totals come from the runner result and are not recomputed from expanded display rows.
- [ ] Keep Time Tracking responsible for the result shape and billing semantics.
- [ ] Keep the framework responsible for result-host placement, overflow wrappers, loading/error/empty states, and renderer dispatch.
- [ ] Add focused regressions for expandable child rows, totals, no-results state, and renderer-not-found recovery.

### Version 0.33.8.10 - Permissions, Navigation, Guardrails, and Closeout

- [ ] Decide whether `reporting.view` should become a framework-owned permission instead of being contributed by Time Tracking.
- [ ] Keep report-specific visibility dependent on both `reporting.view` and the owning module's required permissions.
- [ ] Keep Reporting navigation framework-owned, with child report entries contributed by modules.
- [ ] Add strict guardrails for the converted Reporting host:
  - [ ] Reporting must not ship a non-minimal protected HTML view.
  - [ ] Reporting must not call `document.createElement` for framework-owned page header, filter host, status, table shell, or action anatomy when the chosen framework view path covers it.
  - [ ] Reporting must not introduce new one-off layout/footer classes for framework-owned anatomy.
  - [ ] `src/services/reporting.service.js` (and any framework Reporting host/service code) must not import a specific module service/repo or hardcode a first-party module ID to reach data; all report data access stays behind module-owned runners. Add a grep/regression guardrail asserting this so the coupling that exists today (`reporting.service.js` importing `clientsService`/`tasksService`/`timeEntriesService`) cannot survive or be reintroduced.
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

A lean, read-only task calendar shipped earlier in 0.33.7 (task due dates + reminder markers). This
section owns the fuller Calendar module: user-created calendar events, iCal/shared-calendar display,
and richer views beyond the 0.33.7 task read-out. External Google/Outlook sync remains later integrations work.

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

### Version 0.38.4 - Backup and Restore

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

### Version 0.38.8 - MCP Server for AI Task access

## Slice: LTF ChatGPT Read-Only MCP Connector Foundation

Goal:
Create a private read-only MCP connector so ChatGPT can retrieve LTF context for daily briefings.

Scope:
- Add an integration layer separate from feature modules.
- Do not wire ChatGPT directly into Tasks, Notes, Lists, or Projects UI code.
- Do not add write actions in this slice.
- Do not expose unauthenticated real user data.

Deliverables:
1. Add MCP server endpoint:
   - `GET/POST /mcp` as required by the MCP server package being used.
   - Endpoint must advertise tools and metadata.

2. Add read-only tools:
   - `ltf_get_daily_briefing_context`
   - `ltf_list_due_tasks`
   - `ltf_list_overdue_tasks`
   - `ltf_list_recent_activity`
   - `ltf_search`
   - `ltf_fetch`

3. Add service-layer query functions:
   - Retrieve tasks due today.
   - Retrieve overdue tasks.
   - Retrieve upcoming tasks.
   - Retrieve active projects/actions with blockers.
   - Retrieve recently changed notes/lists.
   - Return structured JSON only; no HTML rendering.

4. Add auth placeholder:
   - Development may allow local/test mode only.
   - Production path must support OAuth-based user auth before exposing real data.
   - Define future read scopes:
     - `tasks:read`
     - `projects:read`
     - `notes:read`
     - `lists:read`
     - `activity:read`

5. Add audit logging:
   - Log connector tool name.
   - Log authenticated user/workspace.
   - Log timestamp.
   - Do not log full private record bodies unless debug mode is explicitly enabled.

6. Add documentation:
   - How to run locally.
   - How to expose via tunnel for testing.
   - How to connect in ChatGPT Settings → Connectors → Create.
   - Security warning that tunnels/no-auth are for dev only.

Non-goals:
- No write actions.
- No public app directory submission.
- No UI widgets inside ChatGPT yet.
- No broad data sync/indexing yet.

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

## Version 0.39.15 - Public API and integration-surface decoupling (backend-agnostic, pre-Postgres)

Purpose:

Decouple the public/integration-facing surfaces from both specific module internals and from any assumption about the storage backend, **before** the 0.40.0 PostgreSQL adapter and dual-backend work begins. This is deliberately ordered ahead of 0.40.0: the public API is the contract external integrations, the MCP connector (0.38.8), the ticket public API (0.35.5), and the future 0.70.0 integrations all depend on, and it must not care whether SQLite or PostgreSQL is running underneath, nor reach around module boundaries to assemble its responses. Doing this decoupling while the backend is still single-provider means the public API contract is proven stable *before* a second backend can perturb it.

Entry contract and grounding (re-verify at implementation time — code will have drifted):

- `src/services/public-api.service.js` currently imports `clientsService`, `clientsRepository`, and `projectsRepository` directly, reaching around the module boundary to assemble responses instead of consuming module-owned contracts.
- `src/services/tag-propagation-registry.js` is nominally a framework registry but `registerBuiltInResolvers()` embeds module-specific SQL against `clients`, `projects`, `tasks`, `notes`, and `note_links` (with a literal `sqlText("client-projects")` module id). That is module data logic living in a framework file, and it is also raw-dialect/interpolation surface that the 0.33.5.27 seam work does not own because it is keyed on module semantics.
- This version consumes the framework-coupling allowlist recorded in 0.33.6.12, which explicitly deferred `public-api.service.js` and `tag-propagation-registry.js` to this slice.
- Aligns with the 0.70.0 integration guideline: "Avoid integration-specific logic leaking into core services where a module or adapter would be cleaner."

Sizing rule for this branch:

- Each sub-slice has one primary blast radius and should be completable in a single focused session. Do not fold the public API decoupling and the tag-propagation decoupling into one slice just because both touch `src/services/`.

### Version 0.39.15.1 - Public API service module-boundary decoupling

- [ ] Remove the direct `clientsService`/`clientsRepository`/`projectsRepository` imports from `src/services/public-api.service.js`; have it consume module-owned read contracts (the Clients/Projects module's service surface) or a registry-mediated data provider rather than importing another module's repo.
- [ ] Confirm the public API depends only on framework-owned foundations (auth, API-key scopes, permissions, workspace boundaries, module enable/disable guards) plus module-declared `publicApiEndpoints`/`apiScopes`, never on a concrete module's storage internals.
- [ ] Preserve every existing public API response shape, scope check, workspace boundary, and disabled-module write guard exactly; this is a decoupling, not a contract change.
- [ ] Add regressions proving public API responses are unchanged and that the service no longer imports specific module repos/services.

Acceptance criteria:

- The public API assembles its responses through framework foundations and module-owned contracts only, with no direct import of a specific module's service/repo and no response-shape change.

### Version 0.39.15.2 - Tag propagation registry module-ownership decoupling

- [ ] Move the module-specific propagation SQL out of `src/services/tag-propagation-registry.js` and into module-owned resolvers registered through the existing `registerTagPropagationResolver()` seam, so the framework registry holds only the registration/materialization/suppression machinery and each module owns the SQL that reads its own tables.
- [ ] Keep the framework responsible for materializing propagated assignments, honoring suppressions, emitting safe events, and repair tooling; keep each Client/Project/Task/Note relationship query owned by the module that owns those tables.
- [ ] Route any dialect-sensitive SQL the resolvers still need through the 0.33.5.27 seams so the tag-propagation path is also backend-agnostic (this SQL was outside the 0.33.5.27 conversion waves because it lived in a framework service keyed on module semantics).
- [ ] Preserve current Client/Project/Task/Note propagation behavior, resolver outputs, and suppression semantics exactly.
- [ ] Add regressions proving propagation behavior is unchanged and that `tag-propagation-registry.js` no longer contains module-specific table SQL.

Acceptance criteria:

- Tag propagation SQL is module-owned behind the resolver registry, the framework file holds only generic machinery, and dialect-sensitive resolver SQL uses the provider-neutral seams.

### Version 0.39.15.3 - Integration-surface backend-agnostic assertion and closeout

- [ ] Confirm the public API, MCP read connector groundwork (0.38.8), and ticket public API (0.35.5) surfaces contain no direct dependency on a storage backend, raw dialect, or a specific module's storage internals; anything remaining routes through framework foundations, module contracts, or the provider-neutral seams.
- [ ] Extend the 0.33.6.12 framework-coupling guardrail (or add a companion) so the public/integration surfaces cannot reintroduce a direct module-repo import or a hardcoded module ID for data access, and remove `public-api.service.js`/`tag-propagation-registry.js` from the deferred-coupling allowlist.
- [ ] Update `docs/public-api.md`, `docs/module-contract.md`, and `DECISIONS.md` to record that integration-facing surfaces are module-contract- and backend-agnostic, and cross-reference this as a prerequisite the 0.40.0 dual-backend work relies on.
- [ ] Run `npm run check` and `npm run test:permissions`, and verify `/api/app-info` after restart.

Acceptance criteria:

- The public API and integration surfaces are provably independent of the storage backend and of specific module internals before 0.40.0 begins, with a guardrail preventing regression and the coupling allowlist reduced accordingly.

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

### Database extraction layer - PostgreSQL adapter and dual-backend support

Deferred here from the 0.33.5 line (originally 0.33.5.23, "PostgreSQL Adapter and SaaS Runtime Proof"). Its prerequisites are the provider-neutral database seam from 0.33.5.19, the parameter-binding migration from 0.33.5.23, the array/bulk binding follow-ups from 0.33.5.26, and the completed 0.33.5.27 agnostic-by-contract conversion/seam branch. By the time this section starts, application call sites already use named bound params and provider-neutral dialect seams, with the interpolation and raw-dialect ratchets enforced at zero for app call sites. 0.40.0 is the actual PostgreSQL backend, provider gating, migration-runner, dual-backend test, and SaaS seed/load proof work behind those seams, not an app-wide SQL rewrite. SQLite stays the self-hosted default throughout. See also the PostgreSQL bullets in 0.50.0 and 0.60.0, which this section is the concrete plan for.

Purpose: implement and prove the hosted-SaaS PostgreSQL database backend behind the provider-neutral database contract while preserving SQLite small-office support.

Grounding (re-verify at implementation time - code will have drifted):

- The real adapter seam is `createDatabaseAdapter(provider)` in `src/db/provider.js`, which throws for anything but `"sqlite"` and returns `createSqliteAdapter()`. PostgreSQL plugs in as a new `src/db/adapters/postgres-adapter.js` plus a branch in the factory, not by editing `core/database.js` (a re-export).
- Adapter contract shape (from `sqlite-adapter.js`): `provider`, a `capabilities` object (`transactions: true`, `transactionApi: "callback"`), `query/get/run(sql, params)`, `transaction(callback)`, `health`, `initializeRuntime`.
- `assertNotInsideTransactionContext` (AsyncLocalStorage) guards top-level `db.*` inside a transaction; nested `transaction()` throws. Re-verify the `db.transaction(...)` call-site count (5 at time of writing: `jobs.service.js`, `job-queue.js`, `job-runner.js`, `notes.repo.js`, `tasks.repo.js`).
- SQLite-only introspection/repair historically lived in `src/db/migrations.js` and `src/db/index.js` startup maintenance. Re-verify the 0.33.5.27 startup/migration allowlist and provider gates before adding PostgreSQL equivalents.
- The migration lock is file-based (`src/db/migration-lock.js`, `fs.open(path, "wx")`) and single-host; PostgreSQL needs an advisory-lock equivalent.
- Search is behind a search adapter (`src/core/search/adapters/sqlite-search-adapter.js`, FTS5 `MATCH`/`bm25()`); PostgreSQL needs a parallel `tsvector`/`tsquery` search adapter, not an inline SQL port.

- [ ] **Dialect seam implementation recheck** - consume the closed 0.33.5.27 decisions, audit totals, and enforcement allowlist, then re-scan for drift before building PostgreSQL support. Confirm every active call site still uses the established seams for `INSERT OR IGNORE`/SQLite `ON CONFLICT`, `COLLATE NOCASE`, PRAGMA usage, FTS5 (`MATCH`/`bm25()`), JSON assumptions, boolean storage, `julianday(...)`/date arithmetic, `rowid`, and `RETURNING`/identity. Output only the PostgreSQL implementation gap list and intentional provider-specific paths; do not reopen application repository conversion unless drift is found.
- [ ] **PostgreSQL adapter skeleton and factory wiring** - add `src/db/adapters/postgres-adapter.js`, register it in `createDatabaseAdapter(provider)` (replace the `"postgres"` throw), match the adapter contract exactly, support `DATABASE_URL`/pool/TLS via runtime config, add health checks in the shape diagnostics already consume, and docs for local Postgres dev. No SQLite default changes; connection + contract only.
- [ ] **PostgreSQL implementations for established dialect seams** - implement provider translations for the non-FTS seams established in 0.33.5.27 (`INSERT OR IGNORE`/`ON CONFLICT`, case-insensitive compare/order, boolean storage, date/interval math, `rowid`/identity). SQLite output stays identical; PostgreSQL routes to the compatible form behind the same call. Document intentional provider-specific paths.
- [ ] **Full-text search portability** - a PostgreSQL search adapter behind the existing search-adapter seam, mapping FTS5 `MATCH`/`bm25()` to `tsvector`/`tsquery` + ranking, preserving the search result/permission-scoping contract. SQLite FTS5 adapter unchanged.
- [ ] **Read-modify-write transaction hardening** - wrap the RMW sequences from the audit in `db.transaction(...)` so they stay correct on a pooled/concurrent backend without SQLite's global serialization; reuse the callback-transaction contract and `assertNotInsideTransactionContext`; no nested transactions.
- [ ] **Provider-gate SQLite-only introspection and repair** - gate the SQLite-only routines in both `src/db/index.js` startup maintenance and `src/db/migrations.js` behind the SQLite provider; provide provider-appropriate equivalents (or explicit no-ops) so a PostgreSQL boot does not silently skip required repairs. SQLite behavior unchanged.
- [ ] **PostgreSQL migration runner and advisory locking** - per-provider DDL/introspection selection in the migration runner; advisory-lock equivalent of the file-based lock (which stays SQLite/single-host); keep the `runMigrations` app-facing entry stable.
- [ ] **PostgreSQL schema baseline and checksum** - a PostgreSQL-compatible schema baseline/translation (`src/db/schema/current.sql` is SQLite DDL today), verified from an empty PG database, with checksum validation; docs for the SQLite self-hosted path vs the PostgreSQL SaaS path, migration ownership, and backups.
- [ ] **Dual-backend repository contract tests** - a runner that executes repository contract tests against SQLite and (opt-in via `DATABASE_URL`, Docker or local Postgres) PostgreSQL; prioritize sessions, workspaces, permissions, tasks, notes, files metadata, search index, notifications; prove `db.transaction(...)` pins one connection for the whole callback on PG and that no path uses top-level `db.*` inside a transaction.
- [ ] **SaaS seed and load smoke test** - a Postgres seed profile for many workspaces + basic load-smoke scripts covering login/session, app shell, tasks, notes, files, search, notifications, and the job worker; record baseline performance numbers and document what is and is not proven.
- [ ] **Closeout** - record decisions in `DECISIONS.md` (advisory-lock strategy, FTS `tsvector` boundary, intentional provider-specific paths), update runtime-configuration docs so `LONGTAIL_DATABASE_PROVIDER`/`DATABASE_URL`/pool/TLS keys are marked live vs. reserved accurately, add the dual-backend/portability regressions to the suite, and verify `/api/runtime-diagnostics` reports the configured provider/health on both backends.

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
- [ ] Make PostgreSQL the preferred production database for this release (the SQLite/PostgreSQL adapter, dialect, and dual-backend work is built earlier in 0.40.0 - Database extraction layer; SQLite stays the lightweight self-hosted default)
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

This will be a private plugin, only available to me. This layer is the hosted, multi-tenant *operation* of the app - it builds on the SQLite/PostgreSQL adapter work from 0.40.0 rather than re-implementing it. "Hosted PostgreSQL" here means the managed/provisioned database service and tenant data isolation for the hosted product, not the database adapter itself.

- [ ] SaaS wrapper
- [ ] Hosted PostgreSQL (managed/provisioned instances + tenant isolation on top of the 0.40.0 adapter)
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
