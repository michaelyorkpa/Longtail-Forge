# Regression Suite Contract

This document records the current regression-suite contract through 0.33.26.8. The runner auto-discovers convention-path metadata regressions, generates its coverage index from that registry, and exposes ceremony-aware narrow-area routing plus conservative full escalation while preserving the checked-in legacy migration snapshot and every documented retirement.

As of 0.33.23.1, `framework.http-error-contract` owns the shared internal/public API error envelopes, header/body request-ID correlation, API-over-HTML route classification, final middleware order, 403/404 non-enumeration, safe explicit dependency 503 handling, generic unexpected responses, one sanitized protected diagnostic, browser document HTML classification, and the shared browser parser contract.

As of 0.33.23.2, `framework.browser-recovery-boundary` owns the self-contained server/browser fallback anatomy, saved Light/Dark theme-cookie continuity with system color preference limited to Auto, no-store and security headers, one manual action, exact 403/404 navigation non-enumeration, request-ID visibility rules, early boundary injection, generic mutation-permission dialog, focus/announcement behavior, and the prohibition on automatic mutation replay. `browser-recovery.spec.mjs` supplies desktop/mobile rendered proof for Light-under-dark-system rendering, history, expired auth, dynamic rendering failure, dialog focus return, and read-only conflict/dependency recovery.

As of 0.33.23.3, `framework.http-error-contract` also proves that each user-visible API or unexpected-browser request ID maps to exactly one protected failure diagnostic whose exact field allowlist omits query values, request bodies, headers, credentials, SQL, filesystem paths, exception text, and raw protected user/workspace/record identifiers. `framework.http-error-development-guardrails` freezes the registered default-code table, canonical documentation sections, `AppError` route boundary, the two reviewed generic sessionless calendar-feed responses, shared parser/recovery injection order, and a `<head>` injection point on every repository browser entry.

As of 0.33.25.5, `help-markdown-source-layout-regression.mjs` compares the complete framework and first-party Help declaration inventory, every Help Markdown file, and every `help/toc.md` link as exact sets. A dangling ToC link, duplicate entry, undeclared Markdown article, missing source-layout descriptor, or declared-but-unreachable article fails mechanically. The same owner pins current post-conversion Files and calendar-subscription wording plus the explicit note-level Secure Notes versus non-inheriting Catalog/Collection boundary. `help-workflow-regression.mjs` independently toggles Tasks, Time Tracking, Notes, and Lists and proves their Help articles and navigation disappear and return with module activation; Help search rebuild proof retains only active contributions.

As of 0.33.21.21.1, `workbench.task-focus-exit-capture` covers eligible Open/In Progress Task Focus rather than only timed focus, pins Blocked/Blocked-Reason prompt suppression and the Task-ID/timestamp-only hard-exit marker, and pairs with `task-resume-context-regression.mjs` plus rendered desktop/mobile proof for consume/capture cycles, Open-status preservation on No and consume, In Progress capture, stale Blocked and terminal-race refusal, and exact `Resume note:` Start here copy.

The same patch pins Blocked recovery across the Tasks lifecycle descriptors, canonical Task editor, Workbench Task Focus action strip, checklist mutation response, and timer service. `task-timer-status-regression.mjs` covers recovery after a paused timer's Task is blocked again, Tasks/Workbench static regressions require the Play/Resume action and authoritative surface synchronization, and `task-blocked-recovery.spec.mjs` proves Workbench, editor, checklist, and timer recovery at desktop and mobile widths.

As of 0.33.21.21.3, `workbench.direct-task-completion` replaces the retired completion-follow-up candidate regression. It proves that a completed Task's stored Next Action is not promoted into Tasks work items or framework candidates, while completion still preserves asynchronous recurrence continuity. `task-direct-completion.spec.mjs` renders editor, Tasks-row, and Workbench completion at desktop and mobile widths and distinguishes unchanged, occurrence-only dirty, and recurrence-template-backed dirty completion so the recurrence scope question appears only for the last case.

Blocked persistence is also pinned as a Task-timer pause invariant. `task-timer-status-regression.mjs` proves canonical update and automatic blocking-child rollup both pause a running timer, the static Tasks quick-fix contract requires a cross-user source-scoped Time Tracking repository update with no user predicate, and the rendered recovery spec proves the open editor changes from Running to Paused immediately.

As of 0.33.21.20, `database.development-data-seed` proves the seed CLI loads root `.env` before bootstrap configuration while explicit process values retain precedence and the configured operator is the only protected seed identity. `database.startup-maintenance-lifecycle` proves a later `SUPER_ADMIN_USERNAME` change does not create or rename a user and that a nonempty installation without an administrator does not receive an invented account during startup.

As of 0.33.26.8, `database.demo-data-host-operation` proves exact `rt-ltf-demo` host/target/origin refusal occurs before either protected credential source is read; the separate root-owned role file has exact mode and binding; only its path enters the minimal candidate environment; and missing, weak, copied, or malformed secrets fail before backup or mutation. The isolated operation then proves non-mutating preflight, backup-first seven-role candidate construction, exact identity/role/scope/membership/no-override verification, fingerprint/domain/Secure Notes/Search/Files rejection, atomic database-and-Files promotion, safe output redaction, retained prior state, and automatic rollback. Normal startup and deployment sources remain unable to invoke it.

## Streamlining Review Policy And Budget

The first formal review at 0.33.18.7 measured 380/380 pre-change regressions in 193.28 seconds with no flaky recoveries, then 379/379 post-change regressions in 279.78 seconds with one visible migration-lock recovery on the documented Windows reference workstation. The current local reference budget is 300 seconds for the full regression runner on comparable hardware and workload. This is a review threshold, not a cross-machine hard failure: two comparable runs above budget, a material slow-tail change, or more than 20% growth in the rolling three-run median triggers another ownership/setup review. The measurement, bucket totals, slow tail, retirement evidence, and consolidation queue live in [regression-suite-performance.md](regression-suite-performance.md).

At Support Tickets closeout, Knowledge Base closeout, Creator Studio closeout, 0.39.9, the pre-PostgreSQL/API decoupling checkpoint, and the PostgreSQL dual-backend matrix, consume `LTF_REGRESSION_TIMING_JSON` again and review the budget. Review duplicate coverage, implementation-detail assertions, obsolete historical checks, and overly broad setup. Prefer fixture, isolation, selection, bounded assertions, and setup improvements before removing coverage. Pure functions, schema validation, and stable contracts may move toward Vitest, but permissions, workspace isolation, database/migration behavior, file safety, and integration behavior remain strongly covered, while critical rendered journeys and accessibility remain in Playwright. A slow test is not obsolete. Retirement requires demonstrated replacement coverage and evidence recorded through the current manifest/ratchet process, and the full release gate remains until equivalence is proven.

As of 0.33.20.7 the suite also carries explicit performance-budget regressions for the hot Workbench path. `workbench.hot-endpoint-budgets` boots the app over HTTP and pins per-request SQLite statement counts (via `readSqliteStatementCount()` in `src/db/sqlite.js`), payload sizes, and near-constant statement growth as data grows for `/api/workbench/bootstrap`, `/api/workbench/focus-modes`, `/api/tasks/workbench-items`, and `/api/tasks/options`; `workbench.focus-candidate-pipeline` pins the bootstrap and focus-candidate statement budgets at the service layer. A budget failure means an N+1 or payload regression was reintroduced — raise a budget only with a deliberate, documented capacity decision, not to absorb accidental growth.

As of 0.33.21.19.1, `time-tracking.dashboard-effort-summary-budgets` applies the same discipline to the Dashboard effort-summary path. It pins the indexed seven-day SQL aggregate and three-row limit, exact parity with the former full-scan totals/recent rows, one physical request-memoized workspace-settings query, an at-most-three-row authorization pass, small statement/payload ceilings, and zero statement or payload growth after 500 out-of-window historical time entries are added. The permission harness separately proves an inaccessible recent Project entry changes neither rows nor aggregate values.

As of 0.33.21.19.2, `tasks.task-calendar-window` also pins the Dashboard/Actions Calendar hot read to a one-statement calendar-specific SQL projection with no assignee hydration. Its payload assertion is an exact renderer-field allowlist and explicitly rejects the former Task summary/detail, resume-context, relationship, assignee, URL, and source fields while the existing bounded-window, active-status/default selector, permission, reminder-marker, and single-day coverage remains intact.

As of 0.33.22.4, `tasks.task-calendar-feed-serialization` pins the Tasks-owned private-feed content seam. Its fixed fixture matrix covers one-off, all-day, canonical-UTC timed, ended/open-ended RRULE, moved `RECURRENCE-ID`, unreadable, archived, and out-of-horizon cases; validates balanced RFC 5545 components, CRLF, UTF-8 75-octet folding, escaping, exclusive all-day ends, bounded UNTIL, stable opaque UIDs, and DST-transition `VTIMEZONE` onset values; and then uses a disposable database to prove a Project-scoped user receives the readable Task without the sibling Project title or raw identifiers. `framework.private-calendar-feed-authentication` remains the independent endpoint/token/throttle/revocation owner.

As of 0.33.22.9.2, `framework.calendar-subscription-settings` pins the sole Admin -> Modules -> Calendar management seam: protected framework navigation, shared Settings anatomy without Save/Revert, collection-only lifecycle calls, Workspace-first Client/Project selection, page-memory-only masked URLs, safe API-key-style metadata, owner rotation, administrator revocation, disabled-Tasks recovery, User Settings removal, official client guidance, and current Help wording. `calendar-subscription-settings.spec.mjs` renders the complete desktop/mobile workflow without mutating a real token, while `user-settings-appearance.spec.mjs` pins the old surface's absence.

As of 0.33.22.9, `framework.private-calendar-feed-authentication` also owns the named collection contract: multiple same-owner scopes, one-time URLs, safe list metadata, owner-only rotation, administrator cross-owner revocation, role-loss and Tasks-disable invalidation, generic fail-closed public reads, zero active orphans after lifecycle reconciliation, and the protected Calendar Settings permission boundary. `database.private-calendar-subscriptions-migration` independently proves eligible legacy selector/digest continuity, invalid and disabled legacy revocation, workspace-scoped target foreign keys, and SQLite integrity.

As of 0.33.21.19.3, `tasks.dashboard-summary-budgets` pins the Tasks Dashboard summary to permission-shaped SQL count groups, per-resource ranked candidates for only the five rendered lists, one compiled `tasks.view` evaluator, and no per-row asynchronous permission calls. It asserts exact count/metric/row ordering, a 15-statement ceiling, and unchanged statement/enrichment cost after 500 terminal Tasks are added.

As of 0.33.21.19.4, `views.dashboard-client-bootstrap` pins the warm-first Dashboard manifest, shared route-promise reuse, parallel host/contribution asset batches, Today-anchored active calendar route, and interaction-only Task dialog import. `dashboard-bootstrap-sequencing.spec.mjs` supplies rendered proof by holding the Tasks contribution script while all three panel reads begin, then observing the Task dialog request only after a calendar task is opened.

As of 0.33.21.19.5, `dashboard.hot-endpoint-budgets` boots the app over HTTP and pins 500 ms timing ceilings, response-size ceilings, and per-request `readSqliteStatementCount()` ceilings for Tasks summary, the bounded active Tasks calendar, and Time Tracking effort summary. Its growth pass adds 400 terminal Tasks and 500 out-of-window time entries, then requires near-constant statements and unchanged payloads apart from bounded summary count digits. The rendered Dashboard sequencing spec also caps the load-event-to-first-fetch gap at one second. `npm run bench:dashboard` is the repeatable fat-seed evidence harness; it measures seven warm HTTP samples and the real browser gap while preserving the `Today()` seed anchor.

The 0.33.19.4 runtime-configuration split is the reference partial-movement contract. The policy's generated `assertionMovements` evidence records the exact pure assertion inventory, existing Vitest target, and still-discovered integration owner without granting retirement or floor credit. The 116-case defaults/normalization/accepted-value/warning/error matrix calls `createConfig` directly in Vitest. The legacy-snapshot regression keeps child-process environment/import behavior and its database, module-registry, version, docs/source, and runtime/app-info consumer integration. Pure and integration fixtures remain local to their one responsibility rather than sharing a second maintained source of truth.

## Current Entry Points

| Entry point | Current responsibility |
| --- | --- |
| `scripts/run-regressions.mjs` | Runs the registered buckets in order, schedules safe parallel work, prepares baseline-derived database fixtures, supports bounded bucket/repeat filters, prints timings, and stops later scheduling after a failure. |
| `scripts/regression-suite.mjs` | Builds and exports the executable suite index from deterministic discovery metadata. Compatibility exports retain the four historical script arrays for existing consumers. |
| `scripts/lib/regression-discovery.mjs` | Discovers new convention-path scripts, preserves snapshot-backed legacy paths, applies the explicit Files isolation audit, validates metadata, and builds the five execution buckets. |
| `scripts/lib/regression-metadata.mjs` | Defines canonical metadata values, statically parses `regressionMeta` object exports without importing regression modules, validates metadata, and supplies transitional legacy metadata. |
| `scripts/lib/regression-runner-options.mjs` | Parses area/tag/tier/list/dry-run options and filters the discovered bucket entries. |
| `scripts/lib/regression-change-routing.mjs` | Maps changed paths to focused areas, inspects package/lock content for exact application-version-only bookkeeping, and retains full escalation for executable/high-risk boundaries. |
| `scripts/suggest-regressions-for-changes.mjs` | Inspects tracked and untracked working-tree changes and prints likely focused commands plus the unchanged release gate. |
| `scripts/lib/changed-regression-runner.mjs` | Converts shared routing into focused, empty, full-check, or CI-prechecked full-regression execution and runs only controlled package commands. |
| `scripts/run-changed-regressions.mjs` | Inspects the same working-tree changes as the suggester, prints selected areas and reasons, then executes the shared plan. |
| `scripts/lib/slice-verification-plan.mjs` | De-duplicates closeout, fast checks, changed/full regressions, and the separate permission harness into one timed immutable local plan with explicit skipped stages. |
| `scripts/run-slice-verification.mjs` | Collects one content-aware change set, runs the canonical local plan, and prints included/skipped/passed/failed stage timings. |
| `scripts/run-timed-stage.mjs` | Wraps a CI command with elapsed time, status propagation, console evidence, and a GitHub job-summary entry. |
| `scripts/agent-brief.mjs` | Generates the active-slice packet from `ROADMAP.md`, `DECISIONS.md`, documentation ownership, and regression routing at runtime. |
| `scripts/lib/closeout-gates.mjs` | Defines hard versus warning-only maintenance gates, runs every gate, and formats the consolidated closeout status board. |
| `scripts/run-closeout.mjs` | Runs the seven standing maintenance gates through their existing package scripts and exits nonzero only when a hard gate fails. |
| `scripts/test-support/isolated-regression-retry.mjs` | Applies the isolated-database bucket's one-retry policy while preserving fail-fast scheduling and logical script counts. |
| `scripts/test-support/regression-bucket-orchestrator.mjs` | Executes selected buckets sequentially in their discovered order and returns immediately after the first bucket failure. |
| `scripts/test-support/disposable-database.mjs` | Gives direct database-backed regressions a temp-directory database target before runtime/database imports. |
| `scripts/test-support/canonical-workspace-inventory.mjs` | Fingerprints the canonical workspace and membership inventory before and after the full runner. |
| `scripts/lib/docs-change-routing.mjs` | Validates the data-only documentation ownership index and maps changed source paths to likely owning documents. |
| `scripts/suggest-docs-for-changes.mjs` | Prints changed-area documentation suggestions and the warning-only closeout disposition gate. |
| `scripts/regression-legacy-snapshot.json` | Recorded the 312-script 0.33.6.16.1 legacy path/run-mode set and now contains 311 active legacy entries after the documented `check-js.mjs` assertion-moved retirement. |
| `scripts/regression-files-isolation-audit.json` | Human-reviewed resource inventory, decision, stress evidence, timing, and retained-serial rationale for all 29 original Files regressions. Discovery may reclassify only entries explicitly approved here. |
| `scripts/regression-coverage-ratchet.mjs` | Validates discovered metadata against the generated index and explicit policy, including active/area/release-gate/family floors plus retirement evidence. |
| `scripts/lib/regression-manifest.mjs` | Builds the deterministic metadata index and owns coverage-policy validation shared by the generator and ratchet regressions. |
| `scripts/generate-regression-manifest.mjs` | Writes or checks the generated coverage index from the discovered registry and exceptions policy. |
| `scripts/regression-clean-clone-contract.mjs` | Proves every registered script and required support file exists in a clean clone and does not depend on ignored local bookkeeping files. |
| `scripts/regression-coverage-manifest.json` | Generated schema-v3 index of every discovered regression's ID, path, area, tier, tags, description, run mode, legacy state, release-gate state, summaries, coverage families, partial assertion movements, and retirement records. Do not edit it manually. |
| `scripts/regression-coverage-exceptions.json` | Human-maintained policy for active and per-area floors, protected areas, required release-gate IDs, coverage families, legacy migration allowance, partial assertion movements, and explicit retirement evidence. |
| `package.json` | Exposes the broad and focused command entry points described below. |

As of 0.33.19.5, the discovered registry contains 383 scripts and protects 44 release-gate entries. The required `release.files-regression-isolation-audit` owner proves all 29 original Files scripts remain classified, only nine fully disposable entries move, 20 ambiguous entries stay serial with script-specific reasons, the 2/4/6-worker repeat proof remains recorded, and Files failures never receive automatic retries. No regression, assertion, identity, permission, browser, promotion, integration, packaging owner, coverage family, or floor was retired. Twenty obsolete current-package-document assertions remain replaced by stable owning-document/behavior checks from the 0.33.18.7 streamlining pass.

Current package commands:

| Command | Current behavior |
| --- | --- |
| `npm run check` | Runs independently runnable `check:fast` (typecheck, unit, cached lint) followed by the complete discovered registry. |
| `npm run check:fast` | Runs typecheck, unit tests, and cached lint without regressions; CI uses it before the prechecked changed-regression command. |
| `npm run typecheck` | Runs `tsc --noEmit` against the narrow `tsconfig.json` scope; `checkJs` stays off so JavaScript files opt in per file with `// @ts-check`. |
| `npm run test:unit` | Runs the Vitest suite (`tests/**/*.test.mjs`) once. |
| `npm run test:watch` | Runs Vitest in watch mode for local iteration. |
| `npm run test:contracts` / `test:files` / `test:tasks` | Filtered Vitest passes for contract/schema, Files, and Tasks tests; they tolerate an empty match (`--passWithNoTests`) until 0.33.7.3+ land their tests. |
| `npm run test:regressions` | Runs the full discovered regression registry without the lint stage. |
| `npm run test:regressions:changed` | Runs content-aware routing; version-only package/lock plus roadmap/changelog ceremony stays focused, while executable/high-risk and unknown paths escalate to `npm run check`. |
| `npm run test:regressions:changed:ci` | Same routing after that CI job has already passed fast checks; a full escalation runs the complete registry without repeating typecheck/unit/lint. |
| `npm run verify:slice` | Canonical local final verification with timed context, closeout, fast-check, regression, permission, browser, and packaging stage rows; non-applicable stages are visibly skipped. |
| `npm run agent:brief` | Prints the current active slice, relevant decision paragraphs, documentation owners, and likely test commands from canonical sources. |
| `npm run test:regressions:list` | Lists every discovered regression and its metadata without executing it. |
| `npm run test:regressions:<area>` | Runs one supported focused area, including module/framework areas plus `docs` and `release`. |
| `npm run test:permissions` | Runs `scripts/permission-regression.mjs` directly; the same script is also registered in the full suite. |
| `npm run test:sqlite-driver` | Runs the standalone better-sqlite3 install smoke check; the same script is also registered in the full suite. |
| `npm run audit:params` | Reports parameter-binding scan totals, reviewed baseline exceptions, new violations, and resolved findings without pinning informational counts. |
| `npm run audit:params:check` | Fails on new unreviewed legacy-helper or template-interpolated SQL findings. |
| `npm run audit:params:update-baseline` | Deterministically updates the reviewed finding baseline; reserved for dedicated parameter-binding cleanup. |
| `npm run docs:suggest` | Lists mapped source areas and likely documentation owners for current tracked and untracked changes. |
| `npm run docs:check` | Runs the same documentation review as a warning-only closeout gate and accepts an optional explicit `--note`. |
| `npm run modules:registry:generate` | Deterministically regenerates the tracked first-party ESM catalog from repository-owned `src/modules/*/module.js` entries. |
| `npm run modules:registry:check` | Fails on a missing, extra, reordered, or stale bundled-module catalog and runs as a hard closeout gate. |
| `npm run closeout` | Runs all standing maintenance gates and prints one hard/warning-only status board; it does not invoke or replace `npm run check`. |
| `npm run licensing:gates` | Confirms the active reviewed third-party-notices inventory and reports missing future public-app/outside-contribution artifacts without failing ordinary private development. |
| `npm run third-party-notices:check` | Hard-checks that `THIRD_PARTY_NOTICES.md` exactly matches the production lockfile closure, reviewed license texts, and bundled-asset inventory. |
| `npm run db:migration:create -- <name>` | Creates the next globally numbered core migration with a forward-only template after validating core/module migration numbers. |
| `npm run db:schema:refresh` | Replays the fresh-start baseline plus ordered migrations into disposable SQLite and rewrites the generated final-schema snapshot. |
| `npm run db:schema:check` | Fails on migration-number collisions, invalid names, generated snapshot drift, or an unaccompanied baseline-schema change. |
| `npm run regressions:manifest` | Regenerates `scripts/regression-coverage-manifest.json` deterministically from discovery metadata and the exceptions policy. |
| `npm run regressions:manifest:check` | Fails when the checked-in generated manifest differs from current discovery metadata or policy. |
| `npm run lint` | Runs cached ESLint without the custom regression suite. |
| `npm run version:guard` | Runs the current-version literal guardrail directly; the same script is also registered in the full suite. |

## Current Execution Model

The current suite contains 423 discovered scripts: 311 active paths in `scripts/regression-legacy-snapshot.json` plus 112 convention-metadata guardrails. The only post-snapshot retirement is the credited `check-js.mjs` assertion movement to the cached ESLint stage; every stateful script and all high-risk contract coverage remain registered. The 55 required release-gate entries include the HTTP error contract and development guardrail, browser recovery boundary, complete maintenance release rehearsal, root-owned maintenance asset/marker boundary, successful deployment-curtain sequencing, Admin Calendar Subscription Settings closeout owner, the complete sanitized-demo role permission journey, and rename-aware GitHub-only documentation classifier with its protected Development/nightly routing contract, including the rule that runtime Help retains artifact and deployment handling. The marketing claims guardrail keeps the shipped baseline, proof register, private calendar-subscription claim, Secure Catalog boundary, and deployment-versus-invitation distinction aligned. The Client child-create scope guardrail pins the shared browser/public API service path, server-shaped top-level and per-parent capabilities, locked parent action, and exact Client tag-target scope. The scope-aware Admin navigation guardrail pins any-scope hints, protected Client/Project page eligibility, deliberate workspace-admin-only gates, and server-shaped scoped Project actions/targets. The view-surface permission-wiring guardrail pins effective permission IDs in every workspace bootstrap, shared action filtering, record-shaped child-client eligibility, and unchanged service denial after browser bypass. The role-seed convergence owner executes the corrected baseline, full fresh migration chain, pre-074 assignment expansion, and current-database metadata repair while reconciling all seven roles, scope maps, default grants, workspace-type availability, delegation ceilings, generated schema relationships, assignment preservation, integrity, and foreign keys. The delegated Role Assignments browser owner pins Users-module registration, server-qualified navigation, exact-account entry, server-shaped labeled choices, current delegable-subset rendering, add/remove confirmation, stale-state recovery, focus and accessible status behavior, branded denial, non-disclosure, and unchanged `users.manage` protection for User Admin. The private sanitized-demo journey authenticates all seven deterministic scoped fixtures through normal Argon2id and throttled login/logout, then exercises representative allowed/denied Client creation, Project Settings, declarative-action, role-catalog, and exact-account delegation behavior without printing credentials. The permission harness also pins the delegated role-assignment API and browser-eligibility contracts: exact active-member lookup parity and minimum disclosure, filtered ceilings/scopes, actor-bound stale revisions, hidden-row byte preservation, transactional authority/scope revalidation, safe audit data, Family/Personal and self/protected refusal, authorized Role Assignments navigation/page access, and unchanged full-administrator replacement and User Admin access. The isolated private-calendar owners split cleanly: framework coverage proves protected management-page authorization, collection lifecycle revocation, trusted-IP throttling, immutable secret-free provider dispatch, one-time URL handling, and generic rejection; Tasks coverage proves bounded RFC 5545 content plus Workspace/Client/current-child-Project/Project SQL ceilings, live permission intersection, Project moves, and title-free recurrence suppression. The native SQLite data-compatibility owner proves the pinned driver, fresh migration identity, transaction and deferred-foreign-key behavior, WAL/concurrency and busy-timeout semantics, bindings/results/BLOBs, FTS5 ranking, checkpoint/reopen persistence, and clean integrity/foreign-key results.

As of 0.33.24.2, `framework.reference-internet-deployment` statically owns the identical marker matcher, exact diagnostic bypass, hardened curtain, generic diagnostic failure, and upstream-error route in both checked-in Caddy examples while retaining their distinct forwarding contracts. `scripts/reference-caddy-security-smoke.mjs` executes both disposable topologies and proves operator/deployment/both-marker state, GET/HEAD/POST and query behavior, exact diagnostic paths and near-misses, page and header policy, unexpected Node failure, recovery without reload, and rejection of forged forwarding input.

As of 0.33.24.6, the multi-proxy form uses real Nginx for the disposable public TLS edge instead of simulating that hop with a second Caddy process. The static owner pins `proxy_intercept_errors off`, the internal root-owned edge asset, hardened HTML and exact diagnostic JSON fallbacks, preserved host/SNI rejection, streaming/size/limiter/timeouts, and the distinction between valid upstream `503` and edge-owned transport failure. The clean-Ubuntu pull-request job runs `nginx -t` and the complete application -> private Caddy -> Nginx chain, including forwarding replacement, marker/Node-down pass-through, private-Caddy-down fallback, internal-route isolation, both recovery boundaries, and public-edge-down connection failure.

As of 0.33.24.7, `release.maintenance-release-rehearsal` pins the one native-Linux `npm run maintenance:rehearse` conductor and its clean-Ubuntu execution. The conductor composes the disposable root-owned helper/marker fixture, direct Caddy boundary, real Nginx/private-Caddy chain, deployment failure recovery, rollback, and stale-marker recovery in fail-fast order. Documentation ownership maps the conductor, host assets, proxy examples, regressions, and historical staging retirement to the governing operator/release docs; the response-owner matrix and private evidence boundary remain regression-owned.

As of 0.33.24.8, the live demo canary exposed and closed the distinct-service-account marker read boundary. `release.maintenance-host-assets` and `release.deploy-maintenance-curtain` now pin operator marker mode `0664`, deployment marker mode `0644`, and the corresponding creation umasks while retaining non-listable operator-group/root-only state directories and separate write authority. The executable host fixture checks the resulting modes, and the live canary separately proved Caddy could match both markers when running under its production service account.

As of 0.33.24.9, the final maintenance closeout pins the checked-in public-Nginx login-limit `429` to no-store, one-minute retry, HSTS, and `nosniff`, matching the live preview/demo blocks. `release.maintenance-release-rehearsal` also owns the branch archive/changelog handoff, the safe technical preview-readiness record, and the monotonic cursor floor at `0.33.25.1`; exact live host evidence remains private.

As of 0.33.24.4, `release.deploy-maintenance-curtain` owns the complete bare-metal deploy state machine: host layout and marker validation, pre-outage artifact preparation, successful first-deploy/upgrade sequencing, root-only operation evidence, exact stop/backup/start/identity/restore/recovered-current failure classes, same-candidate retry, operator-hold preservation, Caddy continuity, and fail-closed signal behavior. Its disposable Linux fixture executes success, every named failure, verified and unresolved recovery, retained artifacts/state, already-active holds, repeated recovery, and signals at application stop, candidate start, recovery stop, and recovery start.

As of 0.33.24.5, that same release regression also owns explicit rollback: marker-before-stop and continuous-Caddy ordering, current-state backup plus recorded-target restore, direct/public identity before the state swap and reopening, target restore/start/identity failures, current-backup restore/start/identity failures, protected dual-recovery evidence, same-target retry, interrupted phases, operator-hold preservation, and identity-reviewed stale-marker recovery. The Linux fixture performs rollback and restore-forward, injects each rollback failure/signal, retries unresolved operations from retained state, and proves a mismatched or unresolved state never reopens traffic.

| Bucket | Registered scripts | Declared mode | Declared concurrency | Current safety boundary |
| --- | ---: | --- | ---: | --- |
| `static/source regressions` | 209 | parallel | 6 | Read-only/parallel-safe checks only; these do not receive a runner database fixture, and database access from a regression entry point is refused unless the script selected an OS-temp database before importing runtime/database modules. |
| `default database regressions` | 6 | serial | 1 | Search/database checks whose current ordering and shared-state assumptions remain serial. |
| `file storage regressions` | 20 | serial | 1 | HTTP applications, workers, scanners, child processes, provider registries, and coupled scanner-inventory proof remain serial for the script-specific reasons in the audit. |
| `isolated file storage regressions` | 9 | parallel | 4 fallback | Only repeat-stressed Files checks with unique runner/script database and storage roots and no server, scanner process, worker, nested child, or ambiguous singleton state. Auto-tunes up to six workers and never retries failures. |
| `isolated database regressions` | 179 | parallel | 4 fallback | Database-backed checks receive per-script fixture environments. The runner auto-tunes isolated parallelism with a conservative cap while preserving explicit environment overrides. |

The runner no longer uses hand-maintained arrays as its source of truth. Discovery reads the frozen legacy snapshot, scans top-level `scripts/*-regression.mjs` files that opt into metadata, and recursively scans `scripts/regressions/**/*.regression.mjs`. The generated coverage manifest and explicit policy retain count floors, required release gates, coverage families, and retirement checks.

### Fast-fail bucket order

The default full run uses the table order above: 209 cheap static/source checks run first, followed by 6 serial default-database checks, 20 retained serial Files checks, 9 isolated Files checks with adaptive safe parallelism, and 179 isolated-database checks with adaptive safe parallelism. Each bucket prints actual wall time as well as summed script time and its longest script. The runner executes buckets sequentially and stops after the first failing bucket.

This is an explicit ordering guarantee, not a coverage reduction. The flattened bucket paths must remain exactly equal to the 423 discovered registry entries, each bucket retains its declared concurrency and fixture boundary, and narrow area/tag/tier filters preserve the relative order of whichever buckets they select. `LTF_REGRESSION_BUCKET=file-storage` selects both Files buckets; `isolated-files` selects only the audited parallel subset. A focused runner regression seeds a static failure and proves that no stateful bucket is scheduled. Typecheck, Vitest, and cached ESLint run before this sequence without replacing it.

### Canonical database isolation

As of 0.33.11.4, suite bucket metadata and direct invocation share one database safety rule. A regression entry point whose file name ends in `regression.mjs` may initialize the database only when `LONGTAIL_DATABASE_FILE` resolves beneath the operating-system temp directory. `src/db/regression-database-safety.js` enforces the rule before the database adapter opens. A database-backed direct regression must therefore create its temp fixture and set `LONGTAIL_DATABASE_FILE` / `LONGTAIL_DATA_DIR` before dynamically importing database or runtime modules; a static import is too early because module imports are evaluated before the script body.

The suite continues to give every non-static bucket a per-script fixture through `scripts/test-support/database-fixture.mjs`. Static/source scripts receive no fixture and must remain read-only unless they explicitly create a disposable fixture themselves. The five legacy Search regressions that previously imported the database statically and the static/runtime contract regressions that transitively reach module registration now use `scripts/test-support/disposable-database.mjs`, so suite and direct invocation follow the same rule. Nested static closeout imports may reuse an already configured temp fixture without replacing or closing the parent fixture.

`scripts/run-regressions.mjs` also captures the canonical `data/longtail-forge.db` workspace and membership fingerprint before the first bucket and compares it after cleanup of the regression baseline. Any workspace/membership change fails the run even if every individual assertion passed. `database.workspace-cleanup-isolation` proves the refusal path without creating the requested non-disposable file, runs representative formerly-leaking and already-isolated regressions directly, and verifies the canonical fingerprint stays unchanged.

### Closeout maintenance conductor

`npm run closeout` invokes `version:guard`, `regressions:manifest:check`, `modules:registry:check`, `db:schema:check`, `audit:params:check`, `docs:check`, and `licensing:gates` in that order. It deliberately continues after failures so one run surfaces the entire maintenance backlog, then reports every gate as pass, warn, or fail with its hard or warning-only policy. Any failed hard gate produces a nonzero conductor exit; documentation and licensing results remain warning-only. The individual package scripts remain the source contracts and may still be run directly.

The closeout conductor remains a bookkeeping command and does not itself run the discovered regression suite or ESLint. `npm run verify:slice` is the ordinary local final conductor around it: it runs closeout exactly once, stops before regressions on a hard closeout failure, executes the existing changed-regression plan exactly once, and adds `npm run test:permissions` exactly once when routing selected permissions. The underlying commands remain independently runnable. The auto-discovered closeout regression still injects pass, hard-failure, and warning-only outcomes without deliberately breaking repository state.

### Pre-TypeScript maintenance baseline

Branch-closeout regressions assert roadmap bookkeeping through the shared cursor-floor helper (`scripts/lib/roadmap-cursor.mjs`): call `assertRoadmapCursorAtLeast("<cursor current when the branch closes>", message)` instead of writing exact `Active cursor` or next-section regex pins. Floors are monotonic, so closing a future branch requires no edits to prior closeout regressions; the `release.roadmap-cursor-floor` gate rejects new exact pins and proves floors survive future cursor advances against a fixture. Archived-section `doesNotMatch` assertions are already monotonic-safe and stay as they are.

The 0.33.19.3 planner treats exact application-version-only package/lock edits and roadmap/changelog bookkeeping as focused release ceremony. Tasks, Notes, their owned CSS, and general documentation stay focused; Files, security/permissions, framework/shared views, database, workflows, release tooling, generated contracts, executable package changes, and unknown paths escalate completely. After success, do not separately rerun closeout, check, changed regressions, an included area, or the permission harness unless files change.

The closeout verified all 312 legacy snapshot paths remain in the 321-script discovered registry, the generated manifest and ratchet protect 16 required release gates, static/source work runs before stateful buckets, and isolated-database recovery remains one visible serial retry. `npm start` remains `node server.js`. TypeScript, Zod, Vitest, Playwright, Puppeteer, jsdom, PHP, Python, and any second backend runtime remain outside this completed maintenance branch and begin only in their explicit future roadmap slices.

### Isolated-database flake recovery

Only the `isolated database regressions` bucket receives automatic retry handling. When one or more scripts fail during a parallel scheduling wave, the runner retries only those failed scripts once, sequentially, with a fresh retry fixture namespace. It never reruns the whole bucket. If every retry passes, each recovered logical script is reported as `flaky-recovered`, unscheduled scripts resume, and the bucket may pass. A script that fails its retry remains a hard failure and preserves fail-fast behavior.

Static/source, default-database, and file-storage failures are never auto-retried. A recovered isolated failure is visible in the per-attempt output, bucket summary, final timing summary, and `LTF_REGRESSION_TIMING_JSON` through attempt details plus the `flakyRecoveries` list; it is not silently converted to green. One isolated recovery is normally contention rather than a product bug, so do not spend a turn chasing it. Investigate scripts that fail both attempts or appear repeatedly in recovery summaries.

`LTF_REGRESSION_REPEAT` remains deliberate flake-hunting control. Each requested pass still runs the selected logical scripts, and an isolated script may receive at most one recovery attempt within that pass. Recovery attempts do not become extra repeat passes or change the scheduled logical-script count.

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

The active 311 pre-migration legacy paths are discovered from `scripts/regression-legacy-snapshot.json`; their exact run modes and relative order are preserved. The original 312-path baseline is reconciled by the credited `check-js.mjs` retirement record in the exceptions policy. A new top-level legacy-style `scripts/*-regression.mjs` file is discovered only when it exports valid metadata; metadata-free top-level files outside the snapshot remain ignored so retained source modules for documented retirements are not accidentally re-registered.

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
- `runMode`: the execution/isolation contract needed to preserve the current five-bucket safety model.

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
| `serial-files` | `file storage regressions` | Runs serially because filesystem, scanner, port, process, worker, registry, or shared storage safety remains ambiguous. |
| `isolated-files` | `isolated file storage regressions` | May run in parallel only when the checked-in audit proves unique disposable state through bounded repeat stress; failures are never automatically retried. |
| `isolated-database` | `isolated database regressions` | May run in parallel only with the existing per-script isolated fixture environment. |

The `fresh-database-regression.mjs` baseline bypass is represented by the generated legacy `baseline-bypass` tag and consumed from its discovered entry. The runner does not infer parallel safety from a filename, area, tier, or aggregate time; `runMode` is explicit in exported metadata, the frozen legacy snapshot, or the audited Files override layered on that snapshot.

## Runner Selection Options

The default remains unchanged:

```sh
npm run check
```

That command runs typecheck, Vitest, and cached ESLint before the full discovered suite. Direct runner options are available for focused iteration and inspection:

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

Run `npm run test:regressions:changed` when direct execution of the routing plan is useful during iteration: it inspects the current tracked and untracked working-tree changes, prints the selected areas and matching route reasons, and then executes the shared routing plan. A one-module change runs only its narrow area command. Any selected `framework`, `views`, `database`, or `release` area escalates to `npm run check`; this intentionally prefers too much coverage over too little for shared or release-sensitive changes. An unrecognized non-empty path falls back to `npm run test:regressions`. An empty change set prints `No changed files found. No regressions were run.`, exits successfully, and never claims a passing test run.

`node scripts/suggest-regressions-for-changes.mjs` remains the advice-only view of the same routing result. Both commands consume `scripts/lib/regression-change-routing.mjs`; route rules are not duplicated in the auto-runner. The helper routes module paths to their owning area, shared view-builder/renderer paths to both `framework` and `views`, database/migration/repository paths to `database`, permission/session/workspace/membership paths to `permissions`, and package/version/app-info/release paths to `release`. Rules are additive: a repository file with permission meaning selects both database and permissions checks.

Operator guidance:

- For a one-module change, run that module's narrow command first.
- During implementation, run only the cheapest focused test needed to diagnose the current edit; use the advice-only suggester when routing visibility is enough.
- Do not run `npm run check` on every shared edit by reflex; final `verify:slice` performs it when the existing planner escalates.
- At ordinary final local closeout, run `npm run verify:slice` once. Do not separately run an equivalent included command unless files subsequently change.
- Local Playwright is for diagnosing browser behavior. The protected pull request supplies independent clean-Linux browser, dependency-review, CodeQL, and PR verification.
- Promotion, manual release, and explicit security/data-integrity instructions retain their named additional gates.

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
