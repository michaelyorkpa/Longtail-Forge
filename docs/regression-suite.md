# Regression Suite Contract

This document records the current regression-suite contract through 0.33.28.5. The runner auto-discovers convention-path metadata regressions, generates its coverage index from that registry, and exposes ceremony-aware narrow-area routing plus conservative full escalation while preserving the checked-in legacy migration snapshot and every documented retirement.

As of 0.33.27.7.1, one runner invocation owns one `NODE_COMPILE_CACHE` below the operating-system temp directory, passes it to every regression child, and removes it with the baseline fixture during final cleanup. Baseline construction starts before static execution and may overlap that safe work, but fixture consumers still await the same validated promise. Static scheduling resolves `LTF_STATIC_REGRESSION_PARALLELISM`, then the shared concurrency override, then a conservative two-thirds host-aware default capped at eight; `1` remains the diagnostic serial override. Successful output remains buffered per script to avoid interleaving, while failures, retries, recovered-flake labels, bucket summaries, and timing JSON stay visible. Metadata discovery remains one bootstrap read, the retry queue remains exclusive to isolated-database failures, and bucket fail-fast ordering is unchanged.

As of 0.33.27.7.2, eligible database-backed children receive a one-shot pipe attestation for the runner's exact closed template. A preloader consumes the descriptor before the regression entry point and registers it only when the recorded parent matches; nested children cannot inherit it. Before the provider opens SQLite, the child validates the temporary template path, environment binding, size, SHA-256 and attestation, copies into an absent temporary target, and binds the migration skip to that exact target. The copied database retains the runner-proven complete migration identity, checksum rows, `PRAGMA integrity_check`, foreign-key enforcement and zero foreign-key violations. Missing/direct/environment-only/existing-target cases use the complete normal migration chain; malformed, stale, forged, moved and tampered cases fail closed. Production, restore and worker paths have no authority source.

As of 0.33.27.7.3, every populated canonical area exposes `npm run test:regressions:<area>`. The routing owner reads existing regression ownership from the generated manifest, handles new convention-path owners directly, and maps product sources through explicit area rules rather than broad filename substrings. Tracked collection uses Git name-status data so deletes retain their former owner and renames inspect both source and destination. Search, Tags, Lists, Notifications, Time Tracking, jobs, public API, licensing, and permission/session/workspace authority all have explicit positive routes. Cross-cutting matches remain additive, and Files, permissions, repositories/database, shared framework/views/jobs, public API authority, generated contracts, executable package/release tooling, and unknown non-empty paths fail toward complete coverage. Permission ownership adds the separate permission harness exactly once. Advice-only output, local changed execution, `verify:slice`, and CI prechecked execution all consume this same routing result.

As of 0.33.27.7.4, coverage floors are machine-derived from active discovery plus reviewed credited retirements. Ordinary manifest generation and checking detect lag without mutating policy; only the explicit reviewed `--ratchet-floors` mode may raise global, per-area, release-gate, and coverage-family floors, and it refuses every decrease. One delimited numeric block below is generated from the manifest and policy with separate write/check modes. `closeout --fix` regenerates only the manifest, that delimited block, the bundled-module catalog, and the database schema snapshot before validation; it never edits exceptions, roadmap, changelog, decisions, or free-form documentation. Default closeout still reports every gate, while `--fail-fast` is opt-in. The version helper now points to roadmap-cursor/archive handoff, changelog and owning docs, reviewed manifest generation, one final `verify:slice`, and runtime identity without duplicating `version:guard` or `check`.

As of 0.33.27.7.5, ordinary closeout is the sole automatic owner for the direct version, parameter-binding, licensing, bundled-module catalog, and generated-manifest checks. The suite keeps in-process synthetic valid/invalid cases without respawning the live commands; module-catalog child checks remain fixture-rooted because they prove generated-file failure paths rather than duplicate the live catalog check. `legacy.version.literal.guardrail` and `legacy.regression.coverage.ratchet` are credited retirements: `version:guard` remains directly runnable and the ratchet fixtures moved into `release.regression-manifest-generation`. `release.validation-single-ownership`, `scripts/package-script-contracts.json`, and `scripts/validation-ownership-consolidation.json` enforce one owner for exact root command strings, current package/lock version equality, legacy discovery membership, current changelog heading, repeated TypeScript facts, and recorded assertion movements. The version scan obtains tracked and non-ignored paths before reads, excludes historical paths before size checks, and fails explicitly on any included file at or above its two-megabyte ceiling.

As of 0.33.27.7.6, `database.backup-archive-portability` proves Windows drive-letter archive paths are reduced to basename-only tar archive operands under the archive directory while POSIX paths retain the same local boundary. Whole-instance and workspace backup creation, listing, and extraction share that command owner; their existing release-gate regressions retain the compressed archive layout, checksum and entry validation, database-and-Files scope, pre-restore backup, rollback, migration, and restored-integrity proof. `database.demo-data-host-operation` retains its backup-first recovery coverage through the same whole-instance owner.

As of 0.33.27.7.7, ESLint covers `worker.js` alongside the application server, source, scripts, tests, and tool configuration. `test:files` names `tests/contracts/files-contracts.test.mjs` directly and fails if that Files-owned suite disappears; it never uses `--passWithNoTests`. Vitest uses the host-aware 50% threads pool only after three repeats preserved all 13 files and 184 tests with a materially lower median wall time. Playwright selects nine mobile-only and eleven desktop-only tests through declaration tags and project-level exclusion before browser setup, while untagged login, accessibility, and shared-flow coverage remains dual-viewport. Browser runs retain failure screenshots and use the measured shared-server-safe two-worker bound; local runs retain failure traces with zero retries, while CI uses one retry and a first-retry trace. A six-worker probe produced three shared-harness failures that all passed together at two workers. The canonical Node runner launches the managed server and Playwright as direct children, waits for readiness, and always performs bounded cleanup, replacing the Windows shell-wrapped teardown that timed out after all 129 tests had passed; the repaired 0.33.27.7.7 suite passed 129/129 in 1.4 minutes and left port 8101 clean. The required check remains `Browser smoke and accessibility`.

As of 0.33.28.5, every release-workflow job has a finite timeout; main-release and CodeQL runs have cancellation-safe concurrency; and only history-owning classifiers plus deliberate main-revision reachability checks retain full checkout history. Live branch-protection inspection confirmed the exact required names before CodeQL push scans were retired: PR analysis still supplies `CodeQL JavaScript analysis` on both `nightly` and `main`. `release.nightly-proof-reuse` proves a normal promotion reuses Nightly evidence only for one successful unexpired exact-SHA push run whose repository, workflow/ref and workflow checksum, `nightly-proof-v1` policy, required job set, release metadata, artifact and metadata checksums, and retained artifact names match. Every mismatch, ambiguity, expiry, failure, cancellation, policy change, and every `hotfix/*` source selects the full path. Runtime-artifact, backup/recovery, and container proofs consume the same controlled artifact; promotion builds at most once on fallback, downloads on accepted reuse, fans isolated recovery consumers out in parallel, and retains `Packaging and recovery` as the required aggregation result. The retired bare-metal smoke is not part of promotion. Scheduled Nightly uses the same verifier before any expensive skip, while the preflight stays visible. No workflow uses `paths-ignore`.

The exact new static inventory is `clients-projects-strict-guardrail-inventory`, `help-markdown-source-layout`, `task-modal-compact-layout`, `task-modal-reflow`, `task-modal-followup`, `database.private-calendar-subscriptions-migration`, and `file-scanner-setup-docs`. The first five are read-only repository assertions, the calendar migration uses only process-local in-memory SQLite plus one read-only migration file, and the Files setup owner asserts documentation/source membership without starting a scanner or mutating storage. `scripts/regression-static-isolation-audit.json` records every resource dimension and the three-pass, 651-run stress proof.

All 28 stateful original Files entries now run in `isolated-files`; the exact script-by-script database, storage, port, scanner, environment, worker/process, singleton, and rationale inventory remains checked in at `scripts/regression-files-isolation-audit.json`. The only other original Files entry is the static documentation owner above, so the retained current serial inventory is empty. This is not a blanket Files rule: future entries must declare and prove their own run mode, Files failures still receive no automatic retry, and the empty serial bucket remains supported in cheap-first order. The 28-entry cohort passed 84 stress runs at concurrency six with zero failures or recoveries before reclassification.

As of 0.33.23.1, `framework.http-error-contract` owns the shared internal/public API error envelopes, header/body request-ID correlation, API-over-HTML route classification, final middleware order, 403/404 non-enumeration, safe explicit dependency 503 handling, generic unexpected responses, one sanitized protected diagnostic, browser document HTML classification, and the shared browser parser contract.

As of 0.33.23.2, `framework.browser-recovery-boundary` owns the self-contained server/browser fallback anatomy, saved Light/Dark theme-cookie continuity with system color preference limited to Auto, no-store and security headers, one manual action, exact 403/404 navigation non-enumeration, request-ID visibility rules, early boundary injection, generic mutation-permission dialog, focus/announcement behavior, and the prohibition on automatic mutation replay. `browser-recovery.spec.mjs` supplies desktop/mobile rendered proof for Light-under-dark-system rendering, history, expired auth, dynamic rendering failure, dialog focus return, and read-only conflict/dependency recovery.

As of 0.33.23.3, `framework.http-error-contract` also proves that each user-visible API or unexpected-browser request ID maps to exactly one protected failure diagnostic whose exact field allowlist omits query values, request bodies, headers, credentials, SQL, filesystem paths, exception text, and raw protected user/workspace/record identifiers. `framework.http-error-development-guardrails` freezes the registered default-code table, canonical documentation sections, `AppError` route boundary, the two reviewed generic sessionless calendar-feed responses, shared parser/recovery injection order, and a `<head>` injection point on every repository browser entry.

The current `framework.identifier-authority` contract makes `src/core/identifiers.js` the only allowed `uuid` package entry point, proves that the authority exposes only record UUIDv7 and opaque UUIDv4 operations, pins every audited framework persistent-record generator to `createRecordId()`, every audited operational generator to `createOpaqueId()`, and the exact 29 server-side module record calls across 11 authoritative owners. The production direct-generator baseline is empty; the guard rejects unauthorized Node `randomUUID`, UUID-package `v4`/`v7`, and browser `crypto.randomUUID` use while freezing dedicated security helpers and the explicit Tasks, Notes, Lists, Time Tracking, job, Search, and audit ordering fields that precede ID tie-breakers. Clients/Projects integration and public API regressions prove legacy UUIDv4 read/update, UUIDv4/UUIDv7 relationships in both directions, server-authoritative UUIDv7 creation, exact Search identity, and audit-export references. The development-data regression proves UUIDv7 bootstrap identity coexists with deterministic UUIDv4 Client, Project, Task, Note, List, relationship, and Search fixtures. Whole-instance and workspace recovery drills prove exact mixed IDs, foreign keys, storage keys and paths, URLs, audit JSON, integrity, and foreign keys after restore. Documented unit, regression, seed, fixture, and recovery-drill generators remain intentional non-production compatibility exceptions.

As of 0.33.25.5, `help-markdown-source-layout-regression.mjs` compares the complete framework and first-party Help declaration inventory, every Help Markdown file, and every `help/toc.md` link as exact sets. A dangling ToC link, duplicate entry, undeclared Markdown article, missing source-layout descriptor, or declared-but-unreachable article fails mechanically. The same owner pins current post-conversion Files and calendar-subscription wording plus the explicit note-level Secure Notes versus non-inheriting Catalog/Collection boundary. `help-workflow-regression.mjs` independently toggles Tasks, Time Tracking, Notes, and Lists and proves their Help articles and navigation disappear and return with module activation; Help search rebuild proof retains only active contributions.

As of 0.33.21.21.1, `workbench.task-focus-exit-capture` covers eligible Open/In Progress Task Focus rather than only timed focus, pins Blocked/Blocked-Reason prompt suppression and the Task-ID/timestamp-only hard-exit marker, and pairs with `task-resume-context-regression.mjs` plus rendered desktop/mobile proof for consume/capture cycles, Open-status preservation on No and consume, In Progress capture, stale Blocked and terminal-race refusal, and exact `Resume note:` Start here copy.

The same patch pins Blocked recovery across the Tasks lifecycle descriptors, canonical Task editor, Workbench Task Focus action strip, checklist mutation response, and timer service. `task-timer-status-regression.mjs` covers recovery after a paused timer's Task is blocked again, Tasks/Workbench static regressions require the Play/Resume action and authoritative surface synchronization, and `task-blocked-recovery.spec.mjs` proves Workbench, editor, checklist, and timer recovery at desktop and mobile widths.

As of 0.33.21.21.3, `workbench.direct-task-completion` replaces the retired completion-follow-up candidate regression. It proves that a completed Task's stored Next Action is not promoted into Tasks work items or framework candidates, while completion still preserves asynchronous recurrence continuity. `task-direct-completion.spec.mjs` renders editor, Tasks-row, and Workbench completion at desktop and mobile widths and distinguishes unchanged, occurrence-only dirty, and recurrence-template-backed dirty completion so the recurrence scope question appears only for the last case.

Blocked persistence is also pinned as a Task-timer pause invariant. `task-timer-status-regression.mjs` proves canonical update and automatic blocking-child rollup both pause a running timer, the static Tasks quick-fix contract requires a cross-user source-scoped Time Tracking repository update with no user predicate, and the rendered recovery spec proves the open editor changes from Running to Paused immediately.

As of 0.33.31.4, `database.development-data-seed` continues to prove the private local contract: the fat development profile preserves its operator and adds seven separately credentialed fixtures, while local sanitized-demo reuses its bootstrap identity and retains seven private active logins. Paired seeds prove deterministic semantic identity across different private values, exact roles/scopes/memberships, disabled ordinary personas, and local-only activation. `permissions.sanitized-demo-role-journey` retains the original seven-account authenticated proof. The additional `permissions.public-demo-role-journey` requires the exact bound version 2 operator-only credential document, authenticates only the six public visitors, and proves authorized reads/writes, scoped and workspace denials, immutable credentials, logout, and no public Super Administrator credential or delegated role. `database.startup-maintenance-lifecycle` still proves startup cannot invent or rename an administrator.

As of 0.33.31.4, `database.demo-data-host-operation` proves exact `rt-ltf-demo` host/target/origin refusal occurs before protected credential reads; the separate root-owned version 2 role file has exact mode and binding and contains only the private operator value; only its path enters the minimal candidate environment; and missing, weak, copied, extra-role, or malformed input fails before backup or mutation. The isolated operation proves non-mutating preflight, backup-first six-public-plus-one-private candidate construction, exact identity/role/scope/membership/no-override verification, public visitor marker and operator exclusion, fingerprint/domain/Secure Notes/Search/Files rejection, atomic database-and-Files promotion, safe output redaction, retained prior state, and automatic rollback. Normal startup and deployment sources remain unable to invoke it.

As of 0.33.31.5, `framework.public-demo-account-catalog` pins the exact six source-aligned public account projections, role/scope wording, nonempty representative/action/denial guidance, intentionally public credential contract, no internal IDs or Super Admin option, no-store enabled response, and generic disabled-mode not-found response without booting a database. `login.spec.mjs` independently renders the helper at desktop and mobile widths, proves the native select's accessible name and keyboard focus order, all six option labels and guidance groups, selection/fill without authentication, ordinary submit as the only login request, generic failure recovery, and complete absence with unchanged focus/autocomplete when the optional catalog is unavailable.

As of 0.33.31.6, `database.public-demo-baseline-candidate` runs as an isolated release gate and proves exact-target/profile refusal, non-mutating dry run, two same-anchor builds with identical semantic and migration identities, standalone validation, fixed public/private credential hashes, exact database-to-Files inventory, and unchanged active database/Files sentinels. Its corruption matrix covers release migration checksums, Files bytes and extra objects, roles, scopes, credential hashes, sessions, Secure Notes, analytics persistence, marker anchors, plaintext protected values, symlinks, existing candidates, and partial build state. The retained `database.demo-data-host-operation` and `database.development-data-seed` regressions independently preserve historical recovery behavior and private local seed contracts.

As of 0.33.31.14, `release.public-demo-release-candidate` freezes the redacted Compose profile, credential-free operator runbook, twelve-script exact-demo contract inventory, artifact/release-asset membership, live disposable-demo health/readiness/app-version checks, normal-mode boundary, and analytics/feedback/interest-persistence rejection. `npm run demo:release-candidate:smoke` runs those existing owners, creates and boots the controlled runtime artifact, and optionally invokes the supported native container lifecycle smoke against the same tarball; it is repository candidate proof, not live-host acceptance.

As of 0.33.31.9, `framework.public-demo-files-ingress` is an isolated release gate. It launches exact demo and standard child probes, requires direct service denials before payload/session access, sends malformed JSON and multipart bodies through every creation route to prove capability refusal wins before parsing, pins the stable safe response, verifies read-only seeded-content classification, and confirms ordinary-mode ingress remains enabled. Static inventory assertions keep the shared attachment helper as the only browser file-input/upload endpoint owner, omit its chooser/drop/upload controls plus the File quick action in demo mode, freeze absent paste/profile/avatar/import and `/api/v1/files` ingress, and retain list/preview/content/download entry points.

As of 0.33.31.11, `framework.public-demo-budgets` is an isolated release gate. It proves exact input/query boundary values, fixed safe error hints, undeclared-route refusal, bulk pre-service atomicity, rollback after failed responses, concurrent account and workspace ceilings, restart persistence, normal-mode bypass, SQLite integrity, and exact catalog coverage for every authenticated framework/module route. The retained HTTP error and Lists regressions independently prove structured expected-error forwarding and unchanged ordinary list duplication behavior.

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

The 0.33.19.4 runtime-configuration split is the reference partial-movement contract. The policy's generated `assertionMovements` evidence records the exact pure assertion inventory, existing Vitest target, and still-discovered integration owner without granting retirement or floor credit. The current 142-case defaults/normalization/accepted-value/warning/error matrix calls `createConfig` directly in Vitest, including the default-off and bounded Support View settings plus the default-off, exact-identity public-demo profile. The legacy-snapshot regression keeps child-process environment/import behavior and its database, module-registry, version, docs/source, and runtime/app-info consumer integration. Pure and integration fixtures remain local to their one responsibility rather than sharing a second maintained source of truth.

As of 0.33.30.1, `framework.support-view-session-contract` is the release-gate owner for default-off Support View configuration, Super-Admin-only permission seeding, current-password throttle behavior, atomic entry/exit rotation, exact expiry, independent concurrent sessions, immutable actor and separate effective identity/workspace request context, no nesting or recovery-mode entry, fixed-workspace behavior, live role/permission/membership/user/workspace revocation, safe cookie posture, safe diagnostic/event storage, and SQLite integrity.

As of 0.33.30.2, `framework.support-view-request-enforcement` is the release-gate owner for complete protected GET/HEAD route declarations, immutable central mutation denial with valid CSRF proof, target-shaped response identity, sensitive and undeclared read non-enumeration, secure Notes/detail/catalog omission, append-only action attribution, secret-free event persistence, and SQLite integrity. `framework.operational-security-basics` additionally pins the structured logger's Support View allowlist while continuing to reject queries, bodies, and unknown fields.

As of 0.33.32.2, `framework.typecheck-seams` also owns the separate HTTP identity declarations, Express request augmentation, the exact Support View outcome/reason unions, and the monotonic 27-file checked-seam floor. The existing remembered-session, auth warning, revocation, account-recovery, Support View session, and Support View request-enforcement regressions remain the behavioral proof that adding the checked contract did not change authentication, rotation/invalidation, or 403/404 outcomes.

As of 0.33.32.8, `database.transaction-client-types` compiles one valid callback-scoped query/get/run probe and requires a nested `transaction.transaction(...)` probe to fail. It also pins the `DatabaseAdapter`/`TransactionClient` declarations, SQLite callback annotation and runtime guard, and full-adapter versus transaction-client injection choices in authentication throttle, private calendar token, and account-export recovery repositories. Existing adapter, transaction-helper, and repository regressions remain the independent SQLite behavior proof.

As of 0.33.32.9, `database.dialect-binding-types` compiles a valid dialect/binding probe and requires malformed conflict options, conflicting row-ID qualifiers, and scalar/array placeholder-property misuse to fail. `framework.typecheck-seams` raises the complete checked inventory to 49 files and pins the exported dialect/binding declarations. The existing dialect scaffold, boolean/time, introspection, parameter-binding, and statement-cache regressions independently prove generated SQL and normalized values remain unchanged.

As of 0.33.32.10, `database.repository-signature-types` compiles valid Settings, Users, and Workspaces calls and requires invalid password options, malformed workspace ownership input, and unchecked nullable module-setting/user/workspace property access to fail. `framework.typecheck-seams` raises the complete checked inventory to 52 files. Existing parameter-binding conversion, workspace storage, boolean/time, workspace query, and Clients/Projects repository regressions independently prove the repository SQL and behavior remain unchanged.

As of 0.33.32.11, `framework.typecheck-seams` raises the complete checked inventory to 60 files and requires all eight bundled module declarations to retain their first-line pragma. `framework.bundled-module-registry` additionally requires every generated catalog entry to annotate its manifest as `ModuleManifest` and keeps `npm run typecheck` first in the fast gate. The generated catalog check plus existing Dashboard/Workbench, event, notification, and view-manifest regressions independently prove module inventory, declaration data, activation, and runtime behavior remain unchanged.

As of 0.33.32.12, `framework.typecheck-seams` raises the complete checked inventory to 61 files and pins the module registry service's `ModuleManifest`, `TransactionClient`, API-scope/event-hook projection, and shape-preserving terminology boundaries. `framework.bundled-module-registry` and `permissions.permission-resource-catalog` remain the focused behavioral proof that catalog inventory, deterministic ordering, enablement, and permission-filtered resource delivery are unchanged.

As of 0.33.32.13, `framework.typecheck-seams` raises the complete checked inventory to 67 files, requires every first-party module/Help indexer to consume the shared camelCase `SearchReference`, and rejects snake_case destructuring at that callback boundary. `search-contract-regression.mjs` proves the live single-record callback payload, while Search lifecycle, rebuild, and Help regressions independently prove workspace-scoped indexing, idempotence, stale-row removal, and indexed record coverage remain unchanged.

As of 0.33.32.14, `framework.typecheck-seams` raises the complete checked inventory to 69 files and pins the first-party Work Resume State producer and read-resolver assembly to shared payload, resolver-context, batch-resolver, and lifecycle-result contracts. The initial-producer, producer, service, and conversion regressions independently prove registration, permission and lifecycle pruning, unavailable states, active/history filtering, ranking, and emitted recovery payloads remain unchanged. `framework.identifier-authority` excludes dot-prefixed transient regression workspaces from its package-import scan so concurrently removed compile fixtures cannot invalidate an otherwise stable tracked-source audit.

As of 0.33.32.15, `framework.typecheck-seams` raises the complete checked inventory to 73 files and pins Jobs enqueue/persisted-row/handler-envelope/worker-state contracts plus normalized internal-event and declared summary-resolver contracts. The Jobs area proves schema, dedupe, claims, locking, retries, idempotency, retention, and separate-worker execution; event-bus and audit-extensibility coverage prove hook isolation, safe summary/redaction/fallback behavior; Notifications coverage proves queued delivery and inbox/preference lifecycles remain unchanged.

As of 0.33.32.16, `framework.typecheck-seams` raises the complete checked inventory to 75 files and pins Authentication request-session, post-verification user, workspace-bound session, and API-key active/null contracts without checker suppression. Authentication throttle, password hashing, remembered sessions, account recovery, API scopes, Support View sessions, public-demo capability enforcement, and visitor-identity immutability independently prove the credential, enumeration, session, scope, audit, and demo-protection behavior remains unchanged.

As of 0.33.32.17, `framework.typecheck-seams` raises the complete checked inventory to 77 files and pins the permission service plus shared resource constructors to a workspace-required `PermissionResource`. `permissions.permission-resource-types` compiles a valid resource, requires a workspace-less resource to fail, and pins the Audit, Search-result, and Search-index construction call sites. The permission harness, resource-catalog, Audit, Search lifecycle/rebuild/index jobs, and Support View regressions independently prove allowed/denied decisions and surrounding behavior remain unchanged.

As of 0.33.32.18, `framework.typecheck-seams` also owns the retained bounded-pass inventory: each clean-file pass names one ownership tier, contains 1-40 unique sorted paths, cannot overlap another pass, excludes separately scoped route work, and must remain a subset of the complete checked inventory. The first 12-file framework core leaf-utility pass raises the monotonic floor from 77 to 89 files. The fast TypeScript gate proves the selected files remain clean; existing framework, runtime, security, identifier, HTTP-error, and release regressions remain the behavioral owners because the pass changes no runtime statements.

As of 0.33.32.19, `framework.typecheck-seams` also pins the separate DOM-only `tsconfig.public.json` program, its exact six shared classic-script inputs, browser contract exports, and reuse of the framework-owned `ApiErrorEnvelope`. The guardrail requires `error-contract.js` to remain the shared envelope parser, rejects duplicate parsing in `api-client.js`, and raises the complete inventory floor from 89 to 95 files. HTTP-error, cached-fetch, framework-view, validation-ownership, and fast-pipeline regressions retain independent runtime and release behavior proof.

As of 0.33.32.20, `framework.typecheck-seams` adds the checked app-shell producer and browser adapter, pins `AppShellBootstrap` and the browser adapter contract, keeps `navigation.js` outside whole-file checking, and raises the complete inventory floor from 95 to 97 files. `framework.app-shell-bootstrap-boundary` executes the adapter against absent and malformed input, proves safe defaults and workspace-context fallbacks, and pins its framework-preamble order before navigation. The existing app-shell navigation, browser-recovery, workspace-switching, module-visibility, and rendered browser coverage retain independent behavior proof.

As of 0.33.32.21, `framework.typecheck-seams` adds the checked `view-response-records.js` browser adapter and `BrowserViewResponseRecords` contract, pins the browser program at eight classic scripts, and raises the complete inventory floor from 97 to 98 files. The view data-binding regression proves declared-key precedence plus the retained direct-array, known-key, and first-array compatibility behavior; the declarative inventory pins the real envelope key for all eight bundled surfaces and rejects response-key guessing in the unchecked renderer. The full views area and rendered browser smoke retain selection, paging, empty/error, action, permission, layout, and real-browser coverage.

As of 0.33.32.25, `framework.typecheck-seams` adds the checked sessions service, pins its canonical required `preservedSessionId` exception contract, rejects a return to the auth-side double cast or permission-assignment wildcard parameters, and raises the complete inventory floor from 100 to 101 files. `framework.session-revocation` executes the missing-preservation fail-closed path plus the real two-cookie password-change path, proving only the identified current session survives while the other bearer is rejected and safe events/audit retain no session IDs. The authentication, account-recovery, permission, Support View, and public-demo regressions retain independent proof for generic credential errors, full-user lifecycle revocation, role/workspace/effective-user decisions, and protected demo identities.

As of 0.33.32.26, `framework.typecheck-seams` pins the runner's shared safe-summary calls, rejects a return to an error-related `any` escape, and requires `JobWorkerLogger.warn` to accept one string. `jobs.job-worker-shutdown-rejection` executes a normal scheduled-poll failure plus active-run shutdown rejections carrying `Error`, long multiline string, object payload, `null`, and `undefined`; it requires stopped/non-running/timer-inactive status and bounded string-only warnings without raw object payload leakage. The complete eight-script Jobs area retains independent claim/lock, retry/dead-letter, idempotency, retention, public-demo, handler, and separate-worker proof.

As of 0.33.32.2.1, the same typecheck owner pins `readJsonBody()` to `Promise<unknown>`, inventories every checked consumer, requires the Support View route's explicit object narrowing, and raises the monotonic floor to 29 files. `framework.support-view-session-contract` proves JSON `null`, array, string, and number bodies return the existing generic confirmation 400 while a valid object still starts and rotates Support View successfully; the HTTP error and public-demo body regressions retain their independent parser/envelope/admission coverage.

As of 0.33.32.3, `framework.typecheck-seams` also pins the canonical `TimeEntry` string-duration and tri-state billable typedefs, the timezone input/parsed-part/date-edge declarations, and the monotonic 32-file floor. The checked `normalizers-timezones.test.mjs` contract imports those runtime types and proves record coercion, empty-input call-time fallback, explicit offsets, invalid-input fallback, invalid named-timezone failure, DST gap/overlap behavior, and local-date start/end conversion.

As of 0.33.32.4, `framework.typecheck-seams` also inventories the Time Tracking time-entry browser/public services and repository at a monotonic 35-file floor, pins the public payload and canonical repository input annotations, and rejects drift back to raw duration passthrough. `time-tracking.public-api-duration-persistence` uses the real public API and an isolated SQLite fixture to prove hours-only and seconds-only creates return, list, and persist billing-authoritative integer seconds with numerically matching hours, followed by `PRAGMA integrity_check`.

As of 0.33.32.5, `framework.typecheck-seams` also inventories the Tasks timer service at a monotonic 36-file floor, requires its Time Tracking dependency to use the public module entry, and pins canonical billable normalization at both sides of the sourced save bridge. `time-tracking.sourced-task-timer-bridge` reproduces boolean `false` collapsing to `"yes"`, then proves the corrected direct save plus a non-billable Task Timer's save/finalize lifecycle retain 300 authoritative seconds, a matching hours projection, Task attribution, sourced-row removal, and SQLite integrity.

As of 0.33.32.6, `framework.typecheck-seams` also inventories the active-timer service and repository at a monotonic 38-file floor, pins their shared `ActiveTimer` record and seconds-derived finalization projection, and rejects a return to client-supplied hours at that boundary. `time-tracking.active-timer-duration-consistency` reproduces the missing-timer one-second clamp retaining contradictory hours, then proves both that fallback and stored paused-timer finalization persist matching duration fields, preserve authoritative accumulated seconds, remove the timer row, and pass SQLite integrity.

As of 0.33.32.7, `framework.typecheck-seams` inventories the Time Tracking billing and Dashboard services at a monotonic 40-file floor, pins the session-timezone/local-date helper path, and rejects restored server-local month construction or duplicate Dashboard date-key math. `time-tracking.billing-dashboard-timezone-boundaries` reproduces a Los Angeles month edge that omitted a valid UTC entry, then proves corrected billing and Dashboard totals across UTC boundaries and New York's 23-hour spring DST day with inclusive starts, exclusive ends, and SQLite integrity.

As of 0.33.30.3, the same release-gate owner also pins readable target selection, the normal-session-only audit/filter/export contract, 1,000-row export ceiling, 365-day transactional retention, pre-gate CSRF-protected exit rotation, persistent shared-shell banner, dynamic write-control suppression, and safe focus/landing restoration source boundaries. `support-view.spec.mjs` supplies the managed desktop journey and axe scans for entry, active state, authoritative write/sensitive-read denial, exit, focus restoration, and audit review.

## Current Entry Points

| Entry point | Current responsibility |
| --- | --- |
| `scripts/run-regressions.mjs` | Runs the registered buckets in order, owns the invocation-scoped compile cache and baseline-prefetch lifecycle, schedules safe parallel work, supports bounded bucket/repeat filters, prints timings, and stops later scheduling after a failure. |
| `scripts/regression-suite.mjs` | Builds and exports the executable suite index from deterministic discovery metadata. Compatibility exports retain the four historical script arrays for existing consumers. |
| `scripts/lib/regression-discovery.mjs` | Discovers new convention-path scripts, preserves snapshot-backed legacy paths, applies the explicit Files and static isolation audits, validates metadata, and builds the five execution buckets. |
| `scripts/lib/regression-metadata.mjs` | Defines canonical metadata values, statically parses `regressionMeta` object exports without importing regression modules, validates metadata, and supplies transitional legacy metadata. |
| `scripts/lib/regression-runner-options.mjs` | Parses area/tag/tier/list/dry-run options and filters the discovered bucket entries. |
| `scripts/lib/regression-change-routing.mjs` | Maps changed paths to focused areas, inspects package/lock content for exact application-version-only bookkeeping, and retains full escalation for executable/high-risk boundaries. |
| `scripts/suggest-regressions-for-changes.mjs` | Inspects tracked and untracked working-tree changes and prints likely focused commands plus the unchanged release gate. |
| `scripts/lib/changed-regression-runner.mjs` | Converts shared routing into focused, empty, full-check, or CI-prechecked full-regression execution and runs controlled package commands through direct Node execution or the composed-script npm fallback. |
| `scripts/run-changed-regressions.mjs` | Inspects the same working-tree changes as the suggester, prints selected areas and reasons, then executes the shared plan. |
| `scripts/lib/slice-verification-plan.mjs` | De-duplicates closeout, fast checks, changed/full regressions, and the separate permission harness into one timed immutable local plan with explicit skipped stages. |
| `scripts/run-slice-verification.mjs` | Collects one content-aware change set, runs the canonical local plan, and prints included/skipped/passed/failed stage timings. |
| `scripts/run-timed-stage.mjs` | Wraps a CI command with elapsed time, status propagation, console evidence, and a GitHub job-summary entry. |
| `scripts/agent-brief.mjs` | Generates the active-slice packet from `ROADMAP.md`, `DECISIONS.md`, documentation ownership, and regression routing at runtime. |
| `scripts/lib/closeout-gates.mjs` | Defines hard versus warning-only maintenance gates, runs every gate through direct Node execution or the composed-script npm fallback, and formats the consolidated closeout status board. |
| `scripts/run-closeout.mjs` | Runs the standing maintenance gates, optionally regenerates the enumerated deterministic artifacts with `--fix`, optionally stops after the first hard failure with `--fail-fast`, and exits nonzero only when a hard gate fails. |
| `scripts/test-support/isolated-regression-retry.mjs` | Applies the isolated-database bucket's one-retry policy while preserving fail-fast scheduling and logical script counts. |
| `scripts/test-support/regression-bucket-orchestrator.mjs` | Executes selected buckets sequentially in their discovered order and returns immediately after the first bucket failure. |
| `scripts/test-support/regression-runtime-resources.mjs` | Creates and deterministically removes the one invocation-scoped operating-system-temp Node compile-cache directory. |
| `scripts/lib/package-script-runner.mjs` | Executes simple `node` package scripts without Windows cmd/npm shim hops and falls back to npm for composed commands while preserving public scripts. |
| `scripts/test-support/disposable-database.mjs` | Gives direct database-backed regressions a temp-directory database target before runtime/database imports. |
| `scripts/test-support/canonical-workspace-inventory.mjs` | Fingerprints the canonical workspace and membership inventory before and after the full runner. |
| `scripts/lib/docs-change-routing.mjs` | Validates the data-only documentation ownership index and maps changed source paths to likely owning documents. |
| `scripts/suggest-docs-for-changes.mjs` | Prints changed-area documentation suggestions and the warning-only closeout disposition gate. |
| `scripts/regression-legacy-snapshot.json` | Records the frozen 0.33.6.16.1 legacy path/run-mode set; the policy reconciles its active membership with the documented credited `check-js.mjs` assertion-moved retirement. |
| `scripts/regression-files-isolation-audit.json` | Human-reviewed resource inventory, decision, stress evidence, timing, and rationale for all 29 original Files regressions. Discovery may reclassify only entries explicitly approved here. |
| `scripts/regression-static-isolation-audit.json` | Human-reviewed resource inventory and repeat/full-suite timing evidence for the seven entries moved to static scheduling. |
| `scripts/regression-coverage-ratchet.mjs` | Validates discovered metadata against the generated index and explicit policy, including active/area/release-gate/family floors plus retirement evidence. |
| `scripts/lib/regression-manifest.mjs` | Builds the deterministic metadata index and owns coverage-policy validation shared by the generator and consolidated manifest regression. |
| `scripts/generate-regression-manifest.mjs` | Writes or checks the generated coverage index and exposes the explicit reviewed `--ratchet-floors` policy-advance mode, which refuses floor decreases. |
| `scripts/generate-regression-doc-inventory.mjs` | Writes or checks only the delimited numeric inventory block in this document from the generated manifest and reviewed policy. |
| `scripts/regression-clean-clone-contract.mjs` | Proves every registered script and required support file exists in a clean clone and does not depend on ignored local bookkeeping files. |
| `scripts/regression-coverage-manifest.json` | Generated schema-v3 index of every discovered regression's ID, path, area, tier, tags, description, run mode, legacy state, release-gate state, summaries, coverage families, partial assertion movements, and retirement records. Do not edit it manually. |
| `scripts/regression-coverage-exceptions.json` | Human-maintained policy for active and per-area floors, protected areas, required release-gate IDs, coverage families, legacy migration allowance, partial assertion movements, and explicit retirement evidence. |
| `package.json` | Exposes the broad and focused command entry points described below. |

As of 0.33.27.7.2, the required `release.files-regression-isolation-audit` owner proves all original Files scripts remain classified, seven named entries have explicit static resource proof, all stateful Files entries have isolated resource proof and repeat stress, the current serial Files inventory is empty, and Files failures never receive automatic retries. No regression, assertion, identity, permission, browser, promotion, integration, packaging owner, coverage family, or floor was retired. Bucket upkeep uses exact flattened discovery membership, uniqueness, and safety floors rather than brittle aggregate or per-bucket equality pins. Obsolete current-package-document assertions remain replaced by stable owning-document and behavior checks from the 0.33.18.7 streamlining pass.

Current package commands:

| Command | Current behavior |
| --- | --- |
| `npm run check` | Runs independently runnable `check:fast` (typecheck, unit, cached lint) followed by the complete discovered registry. |
| `npm run check:fast` | Runs typecheck, unit tests, and cached lint without regressions; CI uses it before the prechecked changed-regression command. |
| `npm run typecheck` | Runs `tsc --noEmit` against the narrow server `tsconfig.json` scope, then the DOM-only `tsconfig.public.json` browser scope. Both keep `checkJs` off so JavaScript files opt in per file with `// @ts-check`; the browser program excludes Node ambient types. `framework.typecheck-seams` reconciles the complete opted-in inventory and monotonic floor; the nominal server `tests/**/*.mjs` include checks only tests carrying that explicit pragma. |
| `npm run test:unit` | Runs the Vitest suite (`tests/**/*.test.mjs`) once. |
| `npm run test:watch` | Runs Vitest in watch mode for local iteration. |
| `npm run test:contracts` / `test:tasks` | Filtered Vitest passes for contract/schema and Tasks tests; the optional filters retain `--passWithNoTests`. |
| `npm run test:files` | Runs the exact Files contract suite and fails closed if that owned test file is missing. |
| `npm run test:regressions` | Runs the full discovered regression registry without the lint stage. |
| `npm run test:regressions:changed` | Runs content-aware routing; version-only package/lock plus roadmap/changelog ceremony stays focused, while executable/high-risk and unknown paths escalate to `npm run check`. |
| `npm run test:regressions:changed:ci` | Same routing after that CI job has already passed fast checks; a full escalation runs the complete registry without repeating typecheck/unit/lint. |
| `npm run verify:slice` | Canonical local final verification with timed context, closeout, fast-check, regression, permission, browser, and packaging stage rows; non-applicable stages are visibly skipped. |
| `npm run agent:brief` | Prints the current active slice, relevant decision paragraphs, documentation owners, and likely test commands from canonical sources. |
| `npm run test:regressions:list` | Lists every discovered regression and its metadata without executing it. |
| `npm run test:regressions:<area>` | Runs one canonical focused area: `framework`, `views`, `dashboard`, `workbench`, `tasks`, `notes`, `lists`, `files`, `search`, `notifications`, `tags`, `time-tracking`, `database`, `permissions`, `jobs`, `public-api`, `release`, `docs`, or `licensing`. |
| `npm run test:permissions` | Runs the separate one-database/one-server permission harness directly. It is not registered in `npm run check`; `verify:slice` adds it exactly once when changed-area routing selects permission ownership, and named CI/release gates invoke it explicitly where required. |
| `npm run test:sqlite-driver` | Runs the standalone better-sqlite3 install smoke check; the same script is also registered in the full suite. |
| `npm run audit:params` | Reports parameter-binding scan totals, reviewed baseline exceptions, new violations, and resolved findings without pinning informational counts. |
| `npm run audit:params:check` | Fails on new unreviewed legacy-helper or template-interpolated SQL findings. |
| `npm run audit:params:update-baseline` | Deterministically updates the reviewed finding baseline; reserved for dedicated parameter-binding cleanup. |
| `npm run docs:suggest` | Lists mapped source areas and likely documentation owners for current tracked and untracked changes. |
| `npm run docs:check` | Runs the same documentation review as a warning-only closeout gate and accepts an optional explicit `--note`. |
| `npm run modules:registry:generate` | Deterministically regenerates the tracked first-party ESM catalog from repository-owned `src/modules/*/module.js` entries. |
| `npm run modules:registry:check` | Fails on a missing, extra, reordered, or stale bundled-module catalog and runs as a hard closeout gate. |
| `npm run closeout` | Runs all standing maintenance gates and prints one hard/warning-only status board; `-- --fix` first regenerates only the enumerated deterministic artifacts, and `-- --fail-fast` opts out of the default run-all report after the first hard failure. |
| `npm run licensing:gates` | Confirms the active reviewed third-party-notices inventory and reports missing future public-app/outside-contribution artifacts without failing ordinary private development. |
| `npm run third-party-notices:check` | Hard-checks that `THIRD_PARTY_NOTICES.md` exactly matches the production lockfile closure, reviewed license texts, and bundled-asset inventory. |
| `npm run db:migration:create -- <name>` | Creates the next globally numbered core migration with a forward-only template after validating core/module migration numbers. |
| `npm run db:schema:refresh` | Replays the fresh-start baseline plus ordered migrations into disposable SQLite and rewrites the generated final-schema snapshot. |
| `npm run db:schema:check` | Fails on migration-number collisions, invalid names, generated snapshot drift, or an unaccompanied baseline-schema change. |
| `npm run regressions:manifest` | Regenerates `scripts/regression-coverage-manifest.json` deterministically without changing floors; `-- --ratchet-floors` is the explicit reviewed mode that raises every live floor and refuses decreases. |
| `npm run regressions:manifest:check` | Non-mutating check that fails when the manifest differs from discovery/policy or a live floor lags discovered coverage plus credits. |
| `npm run regressions:inventory:write` | Rewrites only the single delimited numeric inventory block in this document from the manifest and policy. |
| `npm run regressions:inventory:check` | Non-mutating hard closeout gate for the delimited inventory block. |
| `npm run lint` | Runs cached ESLint without the custom regression suite. |
| `npm run version:guard` | Runs the current-version literal guardrail directly; ordinary closeout invokes it once, and it is intentionally retired from duplicate suite discovery. |

## Current Execution Model

Current numeric membership and ratchet data live only in the generated block below. Exact per-path membership remains in `scripts/regression-coverage-manifest.json`; prose names only durable high-risk owners. These include identifier authority, exact migration-baseline proof, HTTP and browser recovery boundaries, maintenance rehearsal and deployment-curtain sequencing, Calendar Subscription Settings, sanitized-demo permissions, GitHub-only documentation classification, marketing claims, Client child-create scope, scoped Admin navigation, view permission wiring, role-seed convergence, delegated Role Assignments, private calendar authentication/content, and native SQLite compatibility.

As of 0.33.24.2, `framework.reference-internet-deployment` statically owns the identical marker matcher, exact diagnostic bypass, hardened curtain, generic diagnostic failure, and upstream-error route in both checked-in Caddy examples while retaining their distinct forwarding contracts. `scripts/reference-caddy-security-smoke.mjs` executes both disposable topologies and proves operator/deployment/both-marker state, GET/HEAD/POST and query behavior, exact diagnostic paths and near-misses, page and header policy, unexpected Node failure, recovery without reload, and rejection of forged forwarding input.

As of 0.33.24.6, the multi-proxy form uses real Nginx for the disposable public TLS edge instead of simulating that hop with a second Caddy process. The static owner pins `proxy_intercept_errors off`, the internal root-owned edge asset, hardened HTML and exact diagnostic JSON fallbacks, preserved host/SNI rejection, streaming/size/limiter/timeouts, and the distinction between valid upstream `503` and edge-owned transport failure. The clean-Ubuntu pull-request job runs `nginx -t` and the complete application -> private Caddy -> Nginx chain, including forwarding replacement, marker/Node-down pass-through, private-Caddy-down fallback, internal-route isolation, both recovery boundaries, and public-edge-down connection failure.

As of 0.33.24.7, `release.maintenance-release-rehearsal` pins the one native-Linux `npm run maintenance:rehearse` conductor and its clean-Ubuntu execution. The conductor composes the disposable root-owned helper/marker fixture, direct Caddy boundary, real Nginx/private-Caddy chain, deployment failure recovery, rollback, and stale-marker recovery in fail-fast order. Documentation ownership maps the conductor, host assets, proxy examples, regressions, and historical staging retirement to the governing operator/release docs; the response-owner matrix and private evidence boundary remain regression-owned.

As of 0.33.24.8, the live demo canary exposed and closed the distinct-service-account marker read boundary. `release.maintenance-host-assets` and `release.deploy-maintenance-curtain` now pin operator marker mode `0664`, deployment marker mode `0644`, and the corresponding creation umasks while retaining non-listable operator-group/root-only state directories and separate write authority. The executable host fixture checks the resulting modes, and the live canary separately proved Caddy could match both markers when running under its production service account.

As of 0.33.24.9, the final maintenance closeout pins the checked-in public-Nginx login-limit `429` to no-store, one-minute retry, HSTS, and `nosniff`, matching the live preview/demo blocks. `release.maintenance-release-rehearsal` also owns the branch archive/changelog handoff, the safe technical preview-readiness record, and the monotonic cursor floor at `0.33.25.1`; exact live host evidence remains private.

As of 0.33.28.5, `release.deploy-maintenance-curtain` owns the retained Compose marker and recovery-order contract: the root-owned Compose helper must assert its independent deployment marker before stopping the service, create and inspect the protected whole-instance backup before selecting the immutable digest, verify the candidate before clearing the marker, and restore and verify the recorded prior whole state before reopening after failure. `release.live-compose-cutover` owns retirement of the former service, direct-artifact helper, cutover helper, bare-metal smoke, and workflow wiring while preserving the metadata-only Compose transport. `release.preview-deployment-boundary`, `artifact:smoke`, and `container:smoke` retain the supported payload, runtime, and container proof.

<!-- GENERATED REGRESSION INVENTORY START -->
<!-- Generated by `node scripts/generate-regression-doc-inventory.mjs --write`; edit only through discovery metadata or the reviewed floor policy. -->
### Generated coverage inventory

Ratchet floors include credited retirements; validation subtracts the matching credit when enforcing the active minimum.

| Inventory | Count |
| --- | ---: |
| Active discovered regressions | 458 |
| Legacy-snapshot regressions | 309 |
| Convention-path metadata regressions | 149 |
| Credited retirements | 3 |
| Active release-gate regressions | 71 |
| Required release-gate IDs | 47 |
| Global ratchet floor | 461 |
| Release-gate ratchet floor | 73 |

| Canonical area | Active | Credits | Ratchet floor |
| --- | ---: | ---: | ---: |
| `framework` | 82 | 0 | 82 |
| `views` | 33 | 0 | 33 |
| `dashboard` | 2 | 0 | 2 |
| `workbench` | 32 | 0 | 32 |
| `tasks` | 58 | 0 | 58 |
| `notes` | 40 | 0 | 40 |
| `lists` | 12 | 0 | 12 |
| `files` | 44 | 0 | 44 |
| `search` | 12 | 0 | 12 |
| `notifications` | 3 | 0 | 3 |
| `tags` | 12 | 0 | 12 |
| `time-tracking` | 13 | 0 | 13 |
| `database` | 45 | 0 | 45 |
| `permissions` | 13 | 0 | 13 |
| `jobs` | 8 | 0 | 8 |
| `public-api` | 3 | 0 | 3 |
| `release` | 35 | 3 | 38 |
| `docs` | 10 | 0 | 10 |
| `licensing` | 1 | 0 | 1 |

| Canonical tier | Active |
| --- | ---: |
| `unit-like` | 0 |
| `focused` | 210 |
| `integration` | 169 |
| `release-gate` | 71 |
| `slow` | 8 |

| Run mode | Active |
| --- | ---: |
| `static` | 232 |
| `serial-database` | 6 |
| `serial-files` | 0 |
| `isolated-files` | 28 |
| `isolated-database` | 192 |

| Coverage family | Active | Credits | Ratchet floor |
| --- | ---: | ---: | ---: |
| `closeout-regressions` | 16 | 0 | 16 |
<!-- GENERATED REGRESSION INVENTORY END -->

The runner no longer uses hand-maintained arrays as its source of truth. Discovery reads the frozen legacy snapshot, scans top-level `scripts/*-regression.mjs` files that opt into metadata, and recursively scans `scripts/regressions/**/*.regression.mjs`. The generated coverage manifest and explicit policy retain count floors, required release gates, coverage families, and retirement checks.

### Fast-fail bucket order

The default full run stays cheap-first: static/source checks, serial default-database checks, the retained serial Files safety bucket, isolated Files checks, and isolated-database checks. Each bucket prints actual wall time as well as summed script time and its longest script. The runner executes buckets sequentially and stops after the first failing bucket.

This is an explicit ordering guarantee, not a coverage reduction. The flattened bucket paths must remain exactly equal to the discovered registry, each bucket retains its declared concurrency and fixture boundary, and narrow area/tag/tier filters preserve the relative order of whichever buckets they select. `LTF_REGRESSION_BUCKET=file-storage` selects both Files buckets; `isolated-files` selects only the audited parallel subset. A focused runner regression seeds a static failure and proves that no stateful bucket is scheduled. Typecheck, Vitest, and cached ESLint run before this sequence without replacing it.

### Canonical database isolation

As of 0.33.11.4, suite bucket metadata and direct invocation share one database safety rule. A regression entry point whose file name ends in `regression.mjs` may initialize the database only when `LONGTAIL_DATABASE_FILE` resolves beneath the operating-system temp directory. `src/db/regression-database-safety.js` enforces the rule before the database adapter opens. A database-backed direct regression must therefore create its temp fixture and set `LONGTAIL_DATABASE_FILE` / `LONGTAIL_DATA_DIR` before dynamically importing database or runtime modules; a static import is too early because module imports are evaluated before the script body.

The suite gives every non-static bucket a per-script fixture through `scripts/test-support/database-fixture.mjs`; static/source entries receive one only through explicit `baseline-fixture` metadata. `createDisposableDatabaseFixture()` automatically reuses a runner-provisioned temporary target while a verified handshake is registered, returns `ownsFixture: false`, and leaves runner cleanup authoritative. Direct invocation or an unverified environment creates and owns a fresh OS-temp fixture. The checked-in bypass audit keeps historical schema/startup owners, custom bootstrap identities, and nested seeded-child databases on their intended full-chain paths.

`scripts/run-regressions.mjs` also captures the canonical `data/longtail-forge.db` workspace and membership fingerprint before the first bucket and compares it after cleanup of the regression baseline. Any workspace/membership change fails the run even if every individual assertion passed. `database.workspace-cleanup-isolation` proves the refusal path without creating the requested non-disposable file, runs representative formerly-leaking and already-isolated regressions directly, and verifies the canonical fingerprint stays unchanged.

### Closeout maintenance conductor

`npm run closeout` invokes `version:guard`, `regressions:manifest:check`, `regressions:inventory:check`, `modules:registry:check`, `db:schema:check`, `audit:params:check`, `docs:check`, and `licensing:gates` in that order. It deliberately continues after failures so one run surfaces the entire maintenance backlog, then reports every gate as pass, warn, or fail with its hard or warning-only policy. Any failed hard gate produces a nonzero conductor exit; documentation and licensing results remain warning-only. The individual package scripts remain the source contracts and may still be run directly.

`npm run closeout -- --fix` first runs only `regressions:manifest`, `regressions:inventory:write`, `modules:registry:generate`, and `db:schema:refresh`, stopping if deterministic regeneration fails, then performs normal validation. This mode does not ratchet policy floors and never edits exceptions, roadmap, changelog, decisions, or arbitrary documentation. `npm run closeout -- --fail-fast` stops validation after the first hard failure; without that option the complete report remains the default. The options may be combined.

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

The `baseline-bypass` tag is consumed from discovered metadata and its complete owner set is enforced by `scripts/regression-baseline-bypass-audit.json`. Full-chain migration/startup owners, custom-bootstrap identity owners, and nested seeded-child environment opt-outs remain explicit; ordinary repository/service regressions no longer delete the runner baseline defensively. The runner does not infer parallel safety from a filename, area, tier, or aggregate time; `runMode` is explicit in exported metadata, the frozen legacy snapshot, or the audited Files override layered on that snapshot.

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
npm run test:regressions:time-tracking
npm run test:regressions:lists
npm run test:regressions:files
npm run test:regressions:search
npm run test:regressions:notifications
npm run test:regressions:tags
npm run test:regressions:jobs
npm run test:regressions:public-api
npm run test:regressions:licensing
```

Run `npm run test:regressions:changed` when direct execution of the routing plan is useful during iteration: it inspects tracked and untracked working-tree changes, including deleted paths and both sides of renames, prints the selected areas and matching reasons, and executes the shared plan. Existing regression files use their generated manifest area; new convention-path regressions use their declared directory area. A contained module or product-area change runs its complete narrow owner set. Files, permissions, public API authority, repositories/database, shared framework/views/jobs, generated contracts, executable package/release tooling, and unknown non-empty work retain complete escalation. Exact application-version-only package/lock edits plus roadmap/changelog ceremony stay on the focused release owner. Unknown work cannot produce an empty green plan, and an empty change set prints `No changed files found. No regressions were run.` without claiming test success.

`node scripts/suggest-regressions-for-changes.mjs` remains the advice-only view of the same result. It, local execution, `verify:slice`, and CI's `--prechecked` entry all consume `scripts/lib/regression-change-routing.mjs`; route rules are not duplicated in their callers. Permission/session/workspace routing names reviewed authority paths explicitly, so unrelated filenames such as documentation containing “session” or “workspace” do not select permissions merely by substring. Rules are additive: a Tags repository selects Tags plus database, shared Tags browser code selects Tags plus framework, and workspace recovery selects permissions plus database/release owners.

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
7. Review and run `npm run regressions:manifest -- --ratchet-floors`; this raises active, area, release-gate, and family floors without permitting a decrease and regenerates the manifest.
8. Run `npm run regressions:inventory:write`, review only the delimited numeric block, and use the ordinary non-mutating closeout checks before final `npm run verify:slice`.

Do not edit `scripts/regression-suite.mjs` or hand-edit `scripts/regression-coverage-manifest.json` for a new convention-path regression. Discovery and generation own both lists. The exceptions policy changes only when the coverage policy or an explicit exception changes.

## Intended Future Workflow

1. An agent adds one regression script with valid metadata. Shipped in 0.33.6.16.2.
2. The runner discovers both convention-path and transitional legacy-path regressions deterministically. Shipped in 0.33.6.16.2.
3. Metadata determines the primary area, tier, tags, and safe execution mode. Shipped in 0.33.6.16.2.
4. The coverage index/manifest is generated and validated from metadata while preserving documented retirement evidence. Shipped in 0.33.6.16.3.
5. Narrow package commands and changed-area suggestions select from the same discovered registry. Shipped in 0.33.6.16.4.
6. Agents do not manually add the same regression to suite arrays, generated manifests, clean-clone lists, and narrow command lists. Suite and clean-clone duplication were removed in 0.33.6.16.2; generated manifest upkeep landed in 0.33.6.16.3.

Discovery does not authorize bucket weakening, unsafe parallelism, regression retirement, or skipped coverage. Retirement still requires the coverage-manifest evidence contract until its owning slice deliberately replaces that mechanism.
