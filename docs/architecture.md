# Longtail Forge Architecture

Longtail Forge started as a time tracker and is growing into a small-project operations hub for freelancers, small agencies, self-hosted teams, and eventually personal/family workspaces.

The long-term architecture goal is for Longtail Forge to behave like a product supported by a framework with bundled first-party modules, rather than a single tightly-coupled app where every feature is hard-coded into the frontend, backend, and database. The framework serves the Longtail Forge product; it is not being generalized for its own sake. Support Tickets, Knowledge Base, and Creator Studio are committed first-party public-core modules when completed, not market-gated external products.

This document explains the intended architecture direction so future development stays consistent.

---

## Core Principle

Longtail Forge should be built around this distinction:

```text
Framework/Core = the system that lets modules exist and work together.

Modules = workflow tools that plug into the framework.
```

The framework should provide shared services such as users, workspaces, authentication, permissions, navigation, module lifecycle, tags, search, notifications, audit logging, settings, events/hooks, and APIs.

Modules should provide business/workflow functionality such as tasks, time tracking, notes, support tickets, calendars, in-app messaging, invoicing, and reporting expansions.

### Two-Module Rule

Do not add a framework primitive, manifest field, registry, contribution type, generalized service, or framework-owned abstraction for one module's unusual requirement. A generalized facility normally needs two real first-party consumers with materially similar behavior and contracts; a hypothetical consumer or appearance-only similarity does not qualify. Keep single-module needs module-owned until the common contract is understood.

Intrinsically framework-wide requirements such as authentication, sessions, security, permissions, workspace isolation, deployment, database abstraction, and app-shell behavior are explicit exceptions. Apply the rule prospectively rather than destructively rewriting older abstractions. At closeout, name the two consumers or document the framework-wide exception. The planned 0.33.14 editable-field primitive qualifies through the current renderer, Reporting, and Settings.

---

## Current Architecture Direction

As of version 0.33.5.15.6, Longtail Forge has an active first-party module architecture with display-only workspace-aware terminology for framework/module-registry surfaces, a framework-owned search service contract with backend adapter capability detection, canonical search metadata storage, active searchable type discovery, backend-neutral permission-safe search request shaping, formal single-record indexing/removal/re-indexing methods, first module-owned indexers for Tasks, Time Entries, Clients, Projects, Notes, and Lists, framework-owned Help article indexing with Markdown-derived text, `record_type = help_article`, and `source = Help`, service-owned event synchronization for initial module records, rebuild tooling for workspace/module/local app-wide scopes, adapter-owned SQLite FTS repair, SQLite FTS5/indexed-LIKE search behavior behind the adapter boundary, a protected browser `GET /api/search` route that calls the framework search service and returns permission-shaped browser results, a compact authenticated-shell search entry powered by active searchable type declarations, a framework-owned `search.html` results page that reads URL filters and renders permission-safe results, icon-triggered shell controls for search and notifications, a framework-owned Help Center surface/API backed by validated framework and module help declarations, a current-state framework Help article set, Help article bodies loaded from repo-owned Markdown source files under `help/`, ToC-driven Help navigation loaded from `help/toc.md`, safe Help-owned Markdown rendering with explicit article body format metadata, and closeout Help content covering framework, first-party module, third-party module, and context-preserving workflow concepts, a framework-owned UI surface contract for shared surface tokens, modal groups, modal footers, overlay hosts, drawer/slideout shells, main-screen panels, dense action clusters, chips, dividers, and focus behavior, a shared `LongtailForge.overlayHost` browser helper for small module-owned picker panels, a framework-owned view-building helper layer exposed as `LongtailForge.view` for converted page headers, filters, split workspaces, tables, detail surfaces, modal shells/forms/footers, field grids, and action rows, first converted Lists workspace and Client/Project dialog surfaces, first converted Tasks modal/footer/overlay surfaces, and first adoption-pass Notifications and task timer surfaces, a Tasks first-party module with next-action/resume-note context, activity/completion metadata, lightweight checklists, parent/child blocking relationships, recurrence frequency QoL, task timer sources, safe lifecycle events, `tasks.records` search indexing, searchable/taggable/attachable declarations, current-state product Help pages, a Notes-linked Task detail panel that consumes Notes-owned read/write contracts, and current-state developer documentation in `docs/tasks-module.md`, a Notes first-party module with safe Active Work resume-context candidates and current-state developer documentation in `docs/notes-module.md`, and a Lists first-party module with module-owned schema for lists, list items, catalog-backed item suggestions, linked records, reusable-list workflows, bill-of-materials finalization, progress/resume-safe context, module-owned service/repository/browser routes, safe lifecycle events, `lists.records` search indexing, searchable/taggable/attachable declarations, current-state product Help pages, and current-state developer documentation in `docs/lists-module.md`. Notes keeps its Library, collection, revision, Markdown, import-planning, secure-note, linked-record picker, linked-panel helper, and producer-owned resume-context boundaries described in `docs/notes-module.md` and `docs/notes-import-planning.md`.

The first secure-note model is application-managed envelope encryption. The server-side master/key-encryption key comes from environment/config/secrets storage, not the database. The app may authorize decrypt requests based on a valid session and explicit secure-note permissions, but the session is not the encryption secret. Secure-note body content is encrypted with a random per-note data key and AES-256-GCM, the data key is wrapped with the configured server-side key, and normal note body/excerpt/search fields contain only safe placeholders. Secure notes and secure revisions store the configured key version from `LONGTAIL_SECURE_NOTES_KEY_VERSION` for future rotation planning, and secure-note health reports configured/unconfigured status without exposing key material. Titles remain plaintext metadata in this release. This is not zero-knowledge because a configured app server can decrypt secure bodies. Operators must back up the server-side key outside the database; losing it can make encrypted secure-note content unrecoverable.

As of 0.33.17.7.12, workspace backup is a framework-wide workspace-isolation and recovery exception to the Two-Module Rule. The framework owns authorization, audit, SQLite extraction, credential stripping, manifest/checksum validation, protected archive storage, and non-destructive operator restore. Files remains the provider-neutral object reader, while module records remain in their owning schema without module-to-module queries. The package contains one workspace plus readable inactive attribution identities, normalizes internal Files into a local restore layout, excludes every other workspace and runtime secret, and never exposes a browser path or download route. Secure Notes payloads remain encrypted and require separate key-recovery proof.

As of 0.33.17.7.13, the framework also owns the reversible workspace-deletion lifecycle boundary. A dedicated row—not workspace or membership status—records an authorized, backup-aware request and 30-day deadline. While it exists, every module and shared service continues through its existing workspace, permission, and lifecycle contracts; the app shell adds only a safe pending-deletion notice. Cancellation removes the lifecycle row without restoring data because no data is deleted. Expiry is inert until the separate final-purge job/operator boundary is implemented.

As of 0.33.17.7.14, the final-purge boundary is implemented as the explicitly queued `workspace.purge` job. Its first transaction changes lifecycle and workspace state to `purging`, revokes scoped sessions, prevents new workspace jobs and API-key use, and leaves already-running jobs present so the purge retries only after they drain. Artifact cleanup then removes internal Files objects through their registered provider and the workspace's protected backup directory; both operations tolerate a restart after successful deletion. Finalization discovers all database tables with `workspace_id`, removes their target rows with foreign keys deferred, clears dependent key scopes and sessions, rehomes identities only to another active membership or `NULL`, deletes the workspace last, and checks foreign-key and database integrity. The only durable evidence outside the deleted scope is an aggregate tombstone keyed by a SHA-256 workspace fingerprint; it contains no workspace ID, name, record content, storage key, or protected path. Browser routes never invoke this flow.

Current first-party modules include:

* Users
* Client/Project Management
* Tasks
* Time Tracking
* Notes
* Lists

These repository-owned modules export canonical, side-effect-free entries from `src/modules/*/module.js`. A deterministic tracked ESM catalog is generated from those entries; the synchronous registry engine names no workflow module and validates catalog freshness, directory/ID identity, entry shape, manifest uniqueness, and the complete dependency graph before database startup. Explicit app/worker activation then follows dependency order with a stable module-ID tie-breaker. The current manifest contract includes registry-driven navigation, settings, protected views, browser assets, permissions, API scopes, audit record types, internal events, event summaries, Workbench cards, timer sources, work item sources, lifecycle hooks, dependency checks, notification declarations, taggable type declarations, searchable type declarations, attachable file target declarations, framework-owned file API routing, and Help Center contribution declarations.

This generated catalog is not arbitrary runtime plugin discovery: the database and operator-writable directories never supply executable paths, and installation, signing, compatibility, marketplace, and third-party lifecycle behavior remain later work.

The public-demo capability catalog is a separate intrinsically framework-wide runtime/security exception to the Two-Module Rule. It is a frozen data-only list of stable IDs and reviewed `permitted`, `read_only`, `disabled`, or `hourly_resettable` classifications. Runtime configuration and startup identity own whether the profile is active; modules may consume catalog decisions but cannot branch on the demo hostname, add an undeclared default-allowed capability, expose marker/operator details, or override the framework classification. Server enforcement arrives through the explicitly numbered public-demo slices rather than being implied by catalog visibility alone.

As of 0.33.18.5, Tasks and Notes are the two real consumers of concern-based manifest source composition. Each still exports one unchanged, startup-validated manifest through the canonical `module.js` entry; substantial permissions, events/notifications, integrations, settings, and Help declarations move to side-effect-free concern files, while explicit field assignment preserves the runtime shape and contribution array order. The generated catalog and loader still discover only `module.js`. This optional pattern is for roughly 500-line or otherwise difficult-to-review entries, and a concern file must own substantial cohesive content; small modules do not receive empty boilerplate. Review thresholds and the complete future-module example live in `docs/module-development.md`.

As of 0.33.18.6, Dashboard is the first protected page loaded through one native browser ES-module entry, `public/js/dashboard.entry.js`. The entry owns an explicit, sequential compatibility import list for the existing framework scripts, validates same-origin `/js/` and `/css/` paths, reapplies the canonical application asset version to every dynamic import or stylesheet, deduplicates loads, and publishes the temporary `LongtailForge.esModuleBridge`. `dashboard.html` retains only pre-paint theme initialization plus that page entry; ordered implementation script tags no longer define its browser dependency graph.

Dashboard module behavior and styling now arrive through the permission-, capability-, and enabled-module-filtered `browserAssets` contribution list returned by `/api/dashboard`. Tasks owns `tasks-dashboard.js` and `tasks-dashboard.css`; Time Tracking owns its Dashboard renderer and stylesheet; the generic host no longer registers Tasks or Time Tracking renderers by ID. Framework Dashboard anatomy lives in `dashboard.css`, while the shared release stylesheet no longer owns those page/module selectors. Workbench remains on its measured classic-script graph until the scheduled 0.33.19 loading/performance work can restructure and benchmark its substantially larger client pipeline. This is not a React/Vue/Svelte/Angular migration or renderer rewrite, and converted assets may use the bridge only for preserved dependencies—new script-order globals are prohibited.

As of 0.33.18.3, database startup actions declare a stable ID, lifecycle, and owner before the fail-fast coordinator executes them in their preserved dependency order. The public database facade owns composition; the migration runner owns locked baseline/schema/version work; application startup maintenance owns first-install bootstrap, recurring settings/module/permission checks, and migration-080-tracked legacy data repairs; and worker readiness owns only provider initialization plus read-only jobs-schema verification. Structured phase events expose elapsed time and failure type without logging data or secrets. Explicit operator CLIs and post-readiness background work remain outside database bootstrap, and this split does not claim PostgreSQL support.

As of 0.33.27.6, UUID-shaped application identity has one framework-owned authority in `src/core/identifiers.js`. `createRecordId()` supplies UUIDv7 for forward-created ordinary persistent records, while `createOpaqueId()` supplies random UUIDv4 for non-secret request, lock, storage, backup, purge-fence, operator-operation, and temporary-path identity. Framework-created records and every audited server-side Clients/Projects, Tasks, Time Tracking, Notes, and Lists record family use the record operation; every audited framework/operator operational generator uses the opaque operation. The Clients/Projects browser omits identity on new Client/Project payloads, then applies the canonical returned server record to its existing optimistic object, focus, deep-link, and module-action state. One authoritative module service or repository owns each new ID, accepted caller-supplied UUIDv4/UUIDv7 values remain unchanged through APIs, Search, export, seeds, and recovery, and relationship plus explicit timestamp/due-date/sequence/paging contracts remain authoritative. UUID lexical order is never an authorization, security, causal, paging, or business rule. Bearer credentials and cryptographic material stay with their dedicated security helpers. This is an intrinsically framework-wide Two-Module Rule exception, not a module contribution or a secrets service. The production direct-generator bypass inventory is empty and machine-enforced; direct UUIDv4 fixture generation is intentionally limited to non-production compatibility proof. The complete classification and storage compatibility contract live in [database.md](database.md#identifier-authority-and-forward-uuidv7-policy).

### 0.33.18 Maintainability Boundary Evidence

The 0.33.18 closeout treats source organization as contract-preserving work. These are the shared facilities introduced or materially settled by the branch and their Two-Module Rule qualification:

| Settled boundary | Two-Module Rule evidence | Runtime-preservation owner |
| --- | --- | --- |
| Canonical `moduleEntry`, generated bundled catalog, dependency ordering, and explicit app/worker activation | All eight repository-owned first-party modules consume the same entry and validation contract; Tasks and Time Tracking additionally prove module-owned app/worker registrations and startup tasks. | `framework.bundled-module-registry` freezes the normalized pre-reorganization manifest inventory hash and proves declaration-only imports plus before/after activation behavior. |
| Optional concern-based manifest composition | Tasks and Notes are the two real consumers. Both retain one `module.js` composition point and side-effect-free concern declarations; small modules remain single files. | `framework.bundled-module-registry` checks the two composition points, substantial concern ownership, exact inventory, and activation behavior. |
| Dashboard contribution asset loading and parallel CSS ownership | Tasks and Time Tracking are the two real module consumers of the permission-filtered Dashboard `browserAssets` loader and own their renderer/style assets. | `views.dashboard-es-module-entry` proves catalog filtering, local/versioned loading, CSS ownership, behavior, accessibility, keyboard controls, focus return, and the unchanged Workbench boundary. |
| Dashboard native page entry and `LongtailForge.esModuleBridge` | This is a temporary Dashboard page-local compatibility mechanism, not a general module/plugin extension point. Its host loader and Tasks compatibility importer are the current concrete callers; another page must re-qualify the pattern before extracting a framework-wide loader. | `views.dashboard-es-module-entry` pins the single entry, explicit dependency order, same-origin paths, application asset version, deduplication, and CSP-safe implementation. |
| Startup action coordinator, lifecycle vocabulary, readiness split, and tracked repair ledger | Explicit framework-wide database/startup/data-integrity exception. App bootstrap and separate-worker readiness are lifecycle hosts, not invented module consumers. | `database.startup-maintenance-lifecycle` proves exact action order, fail-fast behavior, phase events, fresh and repeat startup, worker isolation, repair completion, foreign keys, and SQLite integrity. |
| Regression discovery/manifest floors, closeout orchestration, version guard, and measured streamlining policy | Explicit framework-wide release/tooling exception; these govern every module and framework change rather than serving one workflow module. | Required release gates, coverage floors, retirement evidence, `verify:slice`, and the 300-second comparable-workstation review budget remain mandatory. |

Express 5, ESLint, Markdown-it, and the version-literal guard are application/runtime or release-tooling baselines, not new workflow abstractions. Support Tickets may consume the module entry, concern composition, and contribution contracts above, but it must not turn the Dashboard bridge or startup coordinator into module-specific extension surfaces.

As of 0.33.18.2, Express 5.2.1 is the application-wide HTTP runtime baseline. Framework `createApp()` retains one explicit middleware and router order: request/security middleware and operational routes, public assets and public APIs, public module routers, authentication, framework and browser module APIs, the `/api` method boundary, the protected static fallback, and the final error middleware. Query parsing is explicitly `extended` to preserve the prior nested/repeated-value contract. Express 5 route strings use literal segments, named parameters, and named wildcards; a root-inclusive fallback uses `/{*name}`, never the removed bare `*` form. The existing `asyncRoute` wrapper remains the compatibility boundary for registered handlers, while regressions also prove Express 5's native rejected-Promise forwarding reaches the same error handler exactly once. JSON and multipart bodies remain owned by the existing bounded route helpers rather than a new application-wide Express body parser.

As of 0.33.23.1, the final order has explicit boundaries for unknown or unsupported `/api/v1` requests before browser authentication, unknown or unsupported internal `/api` requests after every authenticated framework/module API, browser/static resolution, a final browser not-found response, and the Express error middleware last. API classification is path-owned: an API path returns JSON even when its `Accept` header asks for HTML. Browser document failures return HTML, while `/healthz` and `/readyz` retain their minimal machine-readable probe shapes.

As of 0.33.23.2, browser documents install the shared recovery boundary before page-owned scripts. Server-rendered failures and client rendering failures share the same framework anatomy: self-contained, no-store, theme-safe and responsive, one contextual manual action, assertive announcement, and heading focus. The server fallback reads only the existing non-sensitive theme cookie so explicit Light/Dark remains consistent without a session, database read, or optional asset; Auto alone follows the operating-system color scheme. Protected 403/404 navigation stays generic and indistinguishable. Same-origin mutation 403 responses open one framework permission dialog and return focus to the attempted trigger; the boundary never automatically replays a write. Module-specific validation, route authorization, and protected server diagnostics remain with their existing owners.

As of 0.33.23.3, [http-errors.md](http-errors.md) is the canonical server/browser failure contract. It records route-class envelopes, the registered status taxonomy, final middleware order, framework/module ownership, non-enumeration, recovery-boundary installation, exact request-ID support correlation, diagnostic exclusions, and the boundary between an in-process dependency `503` and the proxy-owned `0.33.24` maintenance curtain.

Internal `/api` failures use one envelope:

```json
{
  "error": {
    "code": "conflict",
    "message": "A safe message.",
    "requestId": "server-generated-request-id"
  }
}
```

The `/api/v1` contract keeps that same `error` object inside its versioned envelope. The default status taxonomy is `authentication_required` (401), `forbidden` (403), `not_found` (404), `method_not_allowed` (405), `conflict` (409), `rate_limited` (429), `internal_server_error` (500), and `service_unavailable` (503); a bounded workflow may use a more specific stable code. Expected client errors may expose an approved safe message. A 500 or dependency error is generic unless its `AppError` explicitly marks a 503 message safe to expose. `X-Request-ID` and `error.requestId` identify the same request. The shared browser parser preserves the code, message, request ID, status, and body on the thrown error so callers no longer interpret string and object errors independently.

Longtail Forge should prefer:

```text
Explicit module registration
Clear module manifests
Predictable startup validation
Framework-owned lifecycle rules
```

over:

```text
Automatic filesystem discovery
Magic loading behavior
Hidden coupling
Hard-coded frontend menus
Feature-specific framework hacks
```

## Correctness Tooling: TypeScript, Zod, and Vitest

As of 0.33.7, the repo carries a three-part correctness foundation that never touches the production boot path (`npm start` remains `node server.js` with no compile, typecheck, or loader step):

* **TypeScript checks trusted internal shapes at development time.** `npm run typecheck` runs `tsc --noEmit` over a narrow scope; JavaScript files opt in per file with `// @ts-check`. The complete opted-in set and its monotonic floor live in `scripts/typecheck-seam-inventory.json`, and the `framework.typecheck-seams` release gate reconciles that inventory against the live first-party runtime/test files and the preserved compiler settings. The highest-value framework seams are checked against importable contract shapes in `src/types/framework-contracts.d.ts` (module manifest, view surfaces, Dashboard/Workbench contributions, work candidate/focus/resume, search, notifications, contribution shapes, public API envelopes, jobs, and the database adapter, transaction-client, dialect, and parameter-binding contracts). `DatabaseAdapter` owns provider lifecycle and transaction creation; callback-scoped `TransactionClient` owns query/get/run use and deliberately cannot typecheck a nested transaction. Dialect builder option bags and discriminated scalar/array binding entries keep malformed SQL-builder calls and wrong placeholder-property access out of checked consumers. High-fan-in Settings, Users, and Workspaces repositories declare their own input and projected-row types at the owning boundary, including nullable single-row reads. `src/types/http-contracts.d.ts` separately owns browser request sessions, API-key sessions, Support View actor/effective identity, permission resources, session rotation/invalidation state, Express request augmentation, and the raw JSON reader request/options shapes. Checked runtime typedefs in `src/utils/normalizers.js` define the canonical application-facing `TimeEntry` with string durations and tri-state billable state, while `src/utils/timezones.js` owns the accepted date inputs, parsed parts, and exact local-date edge union. The module registry's definition list is typed so every registered manifest is structurally validated. Type-only files are never imported by runtime JavaScript.
As of 0.33.32.11, all eight bundled `module.js` declarations are direct checked consumers of `ModuleManifest`. Structural declaration drift now fails the fast TypeScript gate before the unchanged generated-catalog validation and runtime activation path; the checked-seam inventory floor is 60 files.

As of 0.33.32.12, the framework-facing module registry service is also checked from manifest lookup through workspace catalog projection. Its module definitions derive from `ModuleManifest`, transaction-injected synchronization helpers accept `TransactionClient`, terminology decorators preserve their validated input shape, and API-scope/event-hook execution uses explicit internal catalog projections. The checked-seam inventory floor is 61 files; runtime catalog filtering, ordering, caching, envelopes, and lifecycle behavior are unchanged.

As of 0.33.32.13, the checked Search indexer callback boundary is canonical camelCase. `SearchReference` requires `workspaceId` and exposes optional `moduleId`, `recordType`, and `recordId` for single-record calls; rebuild calls intentionally omit the single-record fields and carry their validated declaration. The framework Help and Tasks, Time Tracking, Clients/Projects, Notes, and Lists indexers are checked consumers of that contract, raising the inventory floor to 67 files. Compatibility casing remains at queue/service normalization inputs and does not leak into first-party indexer implementations.

As of 0.33.32.14, the checked Work Resume State chain extends through the resolver registries and first-party Tasks, Lists, Notes, and Time Tracking producer assembly. Shared contracts describe producer results, per-record and batched resolver inputs, and readable/lifecycle outcomes; the inventory floor is 69 files. The contracts preserve the established dual-cased producer payload edge and the service remains authoritative for module availability, read pruning, active/history filtering, and ranking.

* **Zod validates untrusted runtime input at the edges.** `readJsonBody()` returns `unknown`; a checked consumer must narrow that value through its existing schema or an explicit shape guard before property access. Files (`src/core/files/files.contracts.js`) and Tasks (`src/modules/tasks/tasks.contracts.js`) are the proving grounds: request bodies, upload metadata, preview requests, and storage configuration are parsed at service entry points, with unknown fields stripped and per-module calibration for server-managed fields. Trusted internal objects passed between services are not re-parsed.
* **Vitest proves contracts and pure service logic quickly.** The narrow suite (`npm run test:unit`, with `test:contracts`/`test:files`/`test:tasks` filters) runs in seconds and fails `npm run check` before the slow regression suite starts. The regression suite remains the source of truth for integration, permissions, database, and browser/static behavior.

The working contract — file patterns, import rules, calibration guidance, and the verification order — lives in `docs/module-development.md` and `AGENTS.md`.

---

## What Belongs in the Framework/Core

The framework/core is the part of Longtail Forge that should exist even if most workflow modules are disabled.

Framework/core includes:

* Users
* Workspaces
* Authentication
* Sessions
* Restricted zero-workspace account-export recovery sessions
* Roles and permissions
* Workspace membership
* App shell
* Navigation framework
* Settings framework
* Module registry
* Module lifecycle
* Module manifest validation
* Public API foundation
* Browser/internal API foundation
* API key foundation
* Audit logging
* Activity-safe event summaries
* Event/hook system
* Tags framework
* Search framework
* Notifications framework
* Timezone normalization helpers
* Error handling
* Database migration runner
* Baseline checksummed SQLite/local-Files backup and destructive restore CLI, with separate Secure Notes key recovery and a disposable restore drill
* Setup/install foundation later

These systems are not optional workflow features. They are the foundation other features depend on.

The current database startup contract is documented in [database.md](database.md). New installs use the 0.33.5.18.6.5.4 consolidated fresh-start baseline instead of replaying the historical migration chain. Compatible existing local databases are adopted to that marker in place, and future migrations still run after the baseline.

Authentication normally requires an active workspace membership. The only zero-workspace exception is the framework-owned account-export recovery mode for a still-active former owner, Workspace Administrator, or installation Super Admin who just lost their last active workspace. Its nullable-workspace session is route-allowlisted to a minimal recovery page, a separate portable account profile/preferences export, session read, and logout. It cannot reach the app shell, workspace switching, workspace backups, module routes, or former workspace data, and the durable qualification stores no former workspace identifier or label.

As of 0.33.30.3, Support View is a separate framework-owned identity contract, not a user switch or general impersonation mode. The browser session retains immutable installation-administrator actor fields while the authorization-facing `user_id`, workspace, timezone, memberships, roles, permissions, module state, and record scope are replaced by the live effective target. A default-off runtime gate, Super-Admin-only `support_view.enter` permission, current-password throttle, active target membership, opaque session rotation, short expiry, and live revocation checks govern the lifecycle.

As of 0.33.32.2, that runtime identity is also represented by one checked HTTP contract shared by browser authentication and API-key authentication. Request-session `password_change_required` is always boolean, `session_mode` is the exact normal/recovery union, and Support View's actor/effective projection remains a distinct refinement. The central gate's outcome and reason classes are closed string unions, so misspelling a classification fails typecheck instead of silently changing the allow, deny-403, or deny-404 branch.

One framework middleware runs after authentication and before every protected framework/module router. It permits only cataloged GET/HEAD routes, denies every mutation before route dispatch with `support_view_read_only`, and treats an undeclared or sensitive read as generic not-found. The immutable sensitive catalog covers credential/token/recovery surfaces, exports/backups, security and integration configuration, administrative audit/session state, file content, and secure Notes/catalog operations. Modules cannot override the central method deny. Every allowed or denied attempt appends actor/effective/workspace/support-session/request/route/action/outcome/reason attribution without queries, bodies, content, credentials, or raw browser session IDs.

The framework-owned browser flow selects only active readable user/workspace targets, requires current-password verification plus reason and confirmation, and publishes Support View state through the app shell. The shared shell renders a persistent actor/target/workspace/expiry banner before page-owned code, suppresses write-looking controls including dynamically inserted controls, and retains the server boundary as authoritative. **End Support View** and **Log Out** are the only lifecycle POSTs allowed before the central gate. End rotates identity back to the actor, normalizes the saved same-origin landing path, and restores focus after dynamically rendered pages settle; Log Out ends the support record and removes the support browser session without creating a replacement normal actor session. The append-only audit read/export surface is available only outside Support View to an authorized Super Admin and applies bounded filters, page/export limits, and 365-day pruning.

### Security Event Audit Boundary

As of 0.33.16.8, security events remain framework-owned and use `audit_logs` as the one canonical persistence concern rather than adding a parallel security-log table. `security_event`/`security` entries are forced independently of ordinary audit enablement, share workspace retention and query infrastructure, and are excluded from the ordinary audit read surface. The security-only query requires both audit-read and workspace-settings administration authority. Producers pass only stable classifications and allowlisted safe metadata through `src/security/security-events.js`; prior/new payloads, record URLs, secrets, credentials, and session identifiers are not part of this contract. Event persistence is deliberately best-effort so an audit outage cannot become an authentication outage. This is an intrinsically framework-wide security exception to the Two-Module Rule.

Authentication throttle state is a separate framework security concern, not reconstructed from the audit stream. As of 0.33.17.7.17, `src/security/auth-throttle.js` owns normalization, hashed installation-scoped bucket identities, configuration, and response/event semantics, while `src/repositories/authentication-throttle.repo.js` owns transaction-serialized persistence in the dedicated expiry-indexed table. Login, current-password verification, and administrator reset retain the existing trusted-IP plus account dimensions and non-enumerating behavior across restart without persisting raw usernames, IP addresses, credentials, sessions, or tokens. SQLite support remains one app server; cross-node atomic throttling belongs to the future hosted database implementation.

As of 0.33.31.10, src/core/public-demo-perimeter.js adds a separate in-memory, one-process perimeter only while the exact public-demo profile is active. Global and trusted-client request buckets bound broad floods; hashed session buckets give ordinary shared/NAT users independent mutation and Search capacity, while login stays trusted-IP keyed and the durable authentication throttle remains authoritative. The perimeter rejects declared oversized bodies before route parsing, emits one allowlisted security crossing per bucket/window, and never stores or logs raw session keys. Caddy owns the coarser body ceiling, redacted edge record, and request UUID; Node accepts that UUID only from an explicit trusted socket peer. This does not create general multi-node rate-limit infrastructure or change non-demo defaults.

As of 0.33.31.11, `src/core/public-demo-budgets.js` adds the durable authenticated-request boundary for the exact marked public visitors. After authentication and Support View gating but before framework or module routes, one explicit stable-ID catalog classifies every current browser API read and mutation; undeclared future routes fail closed only in demo mode. Adapter transactions reserve per-visitor and per-workspace mutation units in `public_demo_budget_usage` before service work, failed responses release their reservations, and a successful request retains them across app restart until the external hourly baseline replacement. The shared JSON reader enforces bounded field, rich-text, array, object-depth, and node shapes, while registered reads enforce URL/query, list, search-text, page-size, page, and offset ceilings. Module validation, permissions, and persistence remain authoritative after admission, and normal deployments bypass the boundary.

As of 0.33.31.12, public-demo editable content has no alternate rendering architecture. Plain fields remain data through service reads and text-only DOM output; Notes and Files consume the framework Markdown service with raw HTML disabled and an explicit safe-URL policy; only named server-rendered safe-HTML fields may reach the reviewed browser HTML sinks. The shared public-demo rich-content classifier recognizes Notes snake-case and camel-case body fields, and Notes unsafe-input validation maps to the fixed safe 400 contract. The cross-role inventory and extension guardrail live in `docs/editable-content-safety.md`.

As of 0.33.22.9.1, the framework private-feed store is a workspace collection of independently identified, named, hash-only credentials. Each row is creator-bound and carries one Workspace, Client, or Project entitlement scope. The admin collection API requires `workspace_settings.manage`; administrators may list safe metadata and revoke any workspace row, but creation always belongs to the authenticated actor and only that owner may rotate and receive a new one-time URL. Public authentication retains the stable route, constant-time digest check, trusted-IP throttle, and generic rejection while additionally requiring an active owner, membership, workspace, Tasks module, active target, and exact current `tasks.view` scope. Canonical user, membership, role, module, Client, and Project lifecycle paths reconcile invalid rows, with a bounded startup repair and authoritative read-time denial preventing orphan access. Framework dispatch passes a validated immutable descriptor with no selector, digest, URL, or other secret. Tasks remains the only content provider and independently enforces the exact descriptor: its Task and recurrence-template SQL apply the Workspace/Client/current-child-Project/Project ceiling before the canonical permission evaluator runs, and title-free suppression markers cancel moved out-of-scope recurrence instances without exposing their rows. Framework code never queries Tasks storage.

As of 0.33.22.9.2, the framework-owned protected Calendar Settings view is the only browser lifecycle manager. The app shell places it at Settings → Admin → Modules → Calendar only for `workspace_settings.manage`; the protected HTML route independently enforces the same permission. The shared Settings host owns the create, one-time-secret, client guidance, and safe workspace-list anatomy, while `calendar-settings.js` owns immediate collection calls outside Save/Revert. Every workspace type reads the canonical permission-pruned Project option projection; Business workspaces additionally retain Client scope and Client-constrained Project choices, while Personal and Family discard Client options. The service independently rejects forged non-Business Client scope creation while accepting Project scope. The browser retains a raw URL only in page memory after owner create/rotate and clears it on navigation. As of 0.33.22.9.3, that one-time boundary is stated on its own danger-colored line in user language. Manual Revoke writes the lifecycle security event and removes the credential row; automatically revoked rows remain available for explicit audited Delete cleanup instead of ending in a `No actions` state. User Settings and singular lifecycle routes are retired. The page remains available for metadata review, revocation, and deletion while Tasks is disabled, but create/rotate fail closed. Calendar remains a framework authentication/security exception rather than a disableable provider module; Tasks continues to own permission-shaped RFC 5545/7986 content. Current Google testing confirms the published name and owner timezone are consumed, while Outlook collects its local name before reading the feed. Thunderbird's HEAD-based ICS discovery instead names a calendar from the final URL path segment, so new and rotated URLs append a path-safe encoded subscription-name filename after the opaque token; the legacy one-segment route remains valid. Operator testing confirms friendly titles in Thunderbird and Apple Calendar on iPhone. OAuth/provider APIs, write-back, and two-way editing remain deferred.

---

## What Belongs in First-Party Modules

First-party modules are official Longtail Forge features that ship with the app, but should still behave like modules.

First-party modules may be enabled or disabled per workspace when appropriate.

Examples:

* Client/Project Management
* Tasks
* Time Tracking
* Notes/Knowledge Base
* Support Tickets
* Creator Studio
* Calendars
* In-app Messaging
* Invoicing
* Reporting expansions
* Files/attachments
* Saved views
* Approvals/change requests

Some first-party modules may feel essential, but they should still follow the module contract wherever possible.

As of the 0.32.13 closeout, file storage, attachment metadata, download routing, scan/quarantine state, abuse reports, attachment counts, the reusable browser attachment helper, and the simple Files browse page are framework-owned. Modules declare attachable target types and choose record-screen placement, labels, and callbacks; they should not duplicate file storage, security checks, or attachment query logic.

As of the 0.33.5.9 closeout, work resume state is also framework-owned. Modules may contribute safe producer events and read resolvers, but the global `work_resume_state` table, protected `/api/work-resume` browser route, dismissal semantics, and future Workbench feed consumption belong to the framework. Resume rows are current-user recovery hints, not access grants, notifications, tags, search documents, or module-owned workflow state.

---

## Tasks and Time Tracking

Tasks and Time Tracking should not be treated as framework core.

They should be treated as bundled first-party workflow modules.

They are important, official, deeply integrated modules, but the framework should not require them to exist.

### Tasks

Tasks should be a first-party workflow module that hooks into:

* Workspaces
* Clients/projects
* Permissions
* Tags
* Search
* Dashboard widgets
* Notifications
* Activity feed
* Audit logging
* Public API scopes
* App navigation
* Time tracking where enabled

Tasks should not be hard-coded into the framework as a required feature.

A workspace should eventually be able to use Longtail Forge for notes, support tickets, client records, time tracking, or knowledge base work even if tasks are disabled.

Current Tasks behavior includes human-written next actions, blocked reasons, resume notes, task-owned `last_worked_at`, completion duration metadata, lightweight checklist progress, parent/child blocking relationships, recurrence frequencies for Daily/Weekdays/Weekends/Weekly/Monthly work, and task timer source routes. Those fields are exposed through task reads, summaries, Workbench task items, search documents, audit metadata, internal task event metadata, and the framework resume-state producer as resume-safe source context.

As of 0.33.6.12j, Tasks recurrence owns checklist structure propagation for `All Future` saves. The recurrence template stores checklist label/order structure separately from occurrence checklist completion state, applies that structure to eligible future active occurrences, and copies it unchecked into newly generated recurrence instances. Workbench Task Focus consumes the resulting task checklist read models; it does not own recurrence propagation or checklist structure editing.

As of 0.33.6.12n, Tasks recurrence also owns linked-note relationship propagation for `All Future` saves while Notes remains the owner of link visibility and note content. The recurrence template stores only note-link relationship metadata, eligible future occurrences receive normal Notes `note_links` rows with recurrence metadata, and generated recurrence instances inherit those links. Removing a source linked note and saving `All Future` removes only propagated future links for that template; note bodies, note records, manual links, past/completed/archived occurrences, checklist completion state, and timer state are not rewritten.

The global resume-state storage, protected browser API, dismissal state, producer contract, and read-guard boundary are framework-owned. Tasks supplies source context and hooks for those consumers without owning the global resume-state framework or future Workbench feed UI.

### Time Tracking

Time Tracking should also be a first-party workflow module.

Time tracking is central to the original version of Longtail Forge, but not every workspace needs it.

Examples:

* Business workspaces may use time tracking heavily.
* Personal workspaces may not need time tracking at all.
* Family workspaces may use tasks and notes but not billing/time tracking.
* Some future installs may use Longtail Forge mostly as a support ticket/knowledge base tool.

Time Tracking should hook into:

* Clients/projects
* Tasks
* Tags
* Search
* Reporting
* Invoicing
* Audit logging
* Public API scopes
* Dashboard widgets
* Notifications
* Workspace settings

Time Tracking should not be framework core.

### Shared Infrastructure Behind Tasks and Time Tracking

Reusable infrastructure used by Tasks and Time Tracking may belong in the framework.

Examples:

* Date/time normalization
* Timezone helpers
* Audit helpers
* Permission/resource helpers
* Taggable record contracts
* Searchable record contracts
* Notification helpers
* Event emission helpers
* Reminder framework later
* Recurrence framework later
* Assignment patterns later
* Status/archive conventions later

The feature is not core, but some of its reusable support systems may become core.

---

## Notifications and Messaging

Notifications are framework infrastructure.

In-app messaging is a first-party collaboration module.

This distinction is important.

Notifications tell users something happened.

Messaging is one of the things that can happen.

### Notifications Framework

The notification system should be owned by the framework because every module may need to notify users about events.

Examples:

* A task is due soon.
* A task was assigned to a user.
* A ticket received a reply.
* A note mentioned a user.
* A timer is still running.
* An invoice is overdue.
* A module was disabled.
* An integration created a record.
* A future third-party module needs to alert users.

The framework should own:

* Notification records
* Read/unread state
* Notification recipients
* Notification preferences
* Notification permissions and visibility
* Notification bell/toast UI
* Notification API
* Notification cleanup/retention rules
* Event-to-notification hooks
* Future delivery adapters

Future delivery adapters may include:

* In-app notifications
* Email
* Push notifications
* Slack
* Microsoft Teams
* Discord
* Webhooks

Modules should create notifications by emitting events or calling the framework notification service.

Modules should not each invent their own notification system.

Example flow:

```text
task.due_soon event
-> notifications framework creates notification
-> app shell shows badge/bell/toast
-> user marks notification read
```

### In-App Messaging Module

In-app messaging should be a first-party collaboration module, not framework core.

Messaging should own:

* Conversations
* Messages
* Message threads
* Participants
* Read receipts if added later
* Message-specific permissions
* Message-specific views
* Message-specific APIs
* Message search/tag hooks
* Message attachments later if needed

Messaging may use the framework notification service to alert users about new messages, replies, or mentions.

Example flow:

```text
User sends message
-> messaging module stores message
-> messaging module emits message.created
-> notifications framework alerts recipients
```

### Activity Feed Difference

Activity feed is separate from both notifications and messaging.

Audit log is the admin/security truth.

Activity feed is a user-friendly, permission-safe summary of recent events.

Notifications are directed alerts to specific users.

Messaging is a collaboration feature for user conversations.

In short:

```text
Audit log = what happened, for admins/security/history.
Activity feed = what happened, summarized for users.
Notifications = something needs a user's attention.
Messaging = users talking to each other.
```

---

## Module Categories

Longtail Forge modules should be categorized to make the app easier to understand.

Suggested categories:

```text
framework
core-admin
core-workflow
project-management
collaboration
knowledge
billing-reporting
integration
developer-example
```

### Framework Services

Framework services are not normal optional modules.

Examples:

* Auth
* Permissions
* Workspaces
* Module registry
* Tags
* Search
* Notifications
* Audit logging
* App shell
* Event/hook system

These should not appear to users as normal installable modules.

### Bundled First-Party Modules

Bundled first-party modules are official Longtail Forge modules.

Examples:

* Tasks
* Time Tracking
* Client/Project Management
* Notes
* Support Tickets
* Calendars
* In-app Messaging

These may be enabled/disabled by workspace depending on workspace type, permissions, and module dependencies.

### Third-Party Modules

Third-party modules are future externally developed modules.

They should eventually be able to declare their own:

* Routes
* Views
* Assets
* Navigation
* Settings
* Permissions
* API scopes
* Taggable record types
* Searchable record types
* Notification events/templates
* Audit record types
* Event hooks
* Migrations

Third-party module support should be built on the same contract used by first-party modules.

---

## Module Manifest Contract

Each module should have a manifest that describes how it plugs into Longtail Forge.

The manifest should be boring, explicit, and predictable.

A module manifest may support:

```js
{
  id,
  name,
  displayName,
  description,
  category,
  version,
  enabledByDefault,
  canDisable,
  historicalReadAccess,

  browserApiRoutes,
  publicApiRoutes,
  migrationsDir,
  protectedViewsDir,
  publicViewsDir,
  browserAssetsDir,

  navigation,
  dashboard,
  reporting,
  workbench,
  settings,

  protectedViews,
  publicViews,
  browserAssets,
  permissions,
  requiredPermissions,
  resourceDefinitions,
  defaultRolePermissions,
  publicApiEndpoints,
  apiScopes,

  taggableTypes,
  searchableTypes,
  attachableTypes,
  help,
  notificationEvents,
  notificationTemplates,
  notificationFollowTargets,
  auditRecordTypes,
  eventTypes,
  eventSummaries,
  timerSources,
  workItemSources,
  hooks,

  frameworkDependencies,
  moduleDependencies,
  workspaceCapabilityRequirements,

  seedHooks,
  repairHooks
}
```

Not every field needs to be active immediately. Some fields may be reserved for future framework work.

The important part is that modules declare their needs in one place instead of requiring hard-coded changes throughout the app.

---

## Module Registry

The module registry is responsible for knowing which modules exist.

Current behavior can remain explicit for now.

Future behavior should allow modules to be registered through a configuration layer, but Longtail Forge should not rely on automatic filesystem discovery.

Preferred direction:

```text
Explicit first-party module registration first.
Manifest validation second.
Configurable external module registration later.
Automatic discovery never, unless there is a strong reason.
```

The registry/service layer now provides helper methods like:

```js
listModules()
getModule(moduleId)
listEnabledModules(workspaceId)
listBrowserApiRoutes()
listPublicApiRoutes()
listModuleMigrationSources()
listModuleNavigation(workspaceId, session)
listModuleSettings(workspaceId, session)
listModulePermissions()
listModuleApiScopes()
listTaggableTypes()
listSearchableTypes()
listNotificationEvents()
listNotificationTemplates()
listAuditRecordTypes()
listModuleEventTypes()
listModuleEventSummaries()
listWorkbenchCards(workspaceId, session)
listTimerSources(workspaceId, session)
listWorkItemSources(workspaceId, session)
```

For active first-party modules, the registry/service layer is the source of truth for module contributions.

---

## Module Lifecycle

Modules should have a clear lifecycle.

Possible lifecycle states:

```text
registered
installed
enabled
disabled
archived
error
```

For now, Longtail Forge mostly needs:

```text
registered
enabled
disabled
```

### Enabling a Module

When a module is enabled:

* The module appears in navigation where permitted.
* Browser API writes are allowed.
* Public API writes are allowed if the API key has scope.
* Module settings become active.
* Module event hooks may run.
* Module records may be searchable.
* Module records may be taggable.
* Module notification hooks/templates may run.
* Module dashboard widgets may appear.

### Disabling a Module

Disabling a module should not delete data.

When a module is disabled:

* Navigation should be hidden.
* Permission-checked module Settings recovery views may remain available through `allowDisabledRead`, using the normal Settings host and a Workspace Settings recovery link instead of active module controls.
* Browser API writes should be blocked.
* Public API writes should be blocked.
* Background hooks should stop.
* New search index entries should not be created.
* New tag assignments should not be created unless explicitly allowed.
* New notifications from that module should stop.
* Historical reads may remain available only if the module allows historical read access.
* Existing notifications from that module may remain visible as historical records unless intentionally cleaned up.
* Audit logs should remain available to authorized users.

Module disable behavior should be enforced by the framework as much as possible so module authors do not need to remember to add checks everywhere.

### Module Status Reads and Row Lifecycle

As of 0.33.20.2, `workspace_modules` rows are guaranteed by lifecycle, never by reads. Startup ensures a row per registered module for every existing workspace (`app.ensure-workspace-module-rows`, after `app.sync-module-registry`), and workspace creation syncs rows through `modulesService.syncModuleRegistry(workspaceId)` before the workspace is returned. `readWorkspaceModuleContext`, `readModuleStatus`, and `readEnabledModuleIds` are pure reads: no read-path endpoint opens a write transaction for module context. A missing row reads as disabled (the historical pure-SELECT semantics), and `canDisable: false` modules always read enabled, mirroring the startup repair without writing.

The workspace module context (resolved terminology, capability filtering, contribution shaping) is cached in memory per workspace. Every read still performs one cheap indexed `workspace_modules` status query, and that row set is the cache fingerprint — so `setModuleStatus`, module install/uninstall, another process, or direct SQL row changes are all observed immediately, while the expensive context construction is reused. `modulesService.invalidateWorkspaceModuleContext(workspaceId)` remains available for explicit invalidation. Repeated per-request context reads additionally memoize through the shared request-scoped cache (`src/core/request-cache.js`, the `session.__requestCache` pattern shared with the permissions service); `settingsRepository.readWorkspaceSettings(workspaceId, session)` opts into that memo from read paths only.

---

## Workspaces

Workspaces are the main ownership and data boundary.

All user-facing records should belong to a workspace either directly or through a clear workspace-owned parent.

Workspace types may include:

* Business
* Personal
* Family

Workspace type determines available tools and behavior.

Examples:

* Business workspaces support clients, projects, time tracking, team members, permissions, billing, and reporting.
* Personal workspaces support tasks, notes, projects, and optional time tracking.
* Family workspaces support shared tasks, notes, projects, and limited family-style permissions.

Modules should declare which workspace capabilities they require.

A module should not assume every workspace supports clients, billing, team members, messaging, notifications, or time tracking.

---

## Users, Membership, and Permissions

Users should not be permanently tied to only one workspace.

A user may belong to multiple workspaces through workspace membership.

Permissions should remain framework-owned.

Modules may declare permissions, but the permission engine should remain part of the framework.

A module may declare permissions such as:

```text
tasks.create
tasks.view
tasks.edit_own
tasks.edit_all
tasks.assign
tasks.complete
tasks.archive
tasks.restore
```

The framework should register these permissions, expose them in role/permission management, and enforce them consistently.

Long-term, modules should also declare resource definitions.

Example:

```js
{
  resource: "tasks",
  operations: ["read", "create", "update", "archive", "restore", "assign"]
}
```

This avoids hard-coding every module's resource behavior into the permission service.

Notifications should also respect permissions. A user should not receive or open a notification for a record they are not allowed to see.

---

## App Shell and Navigation

The authenticated app shell should be framework-owned.

As of 0.33.20.6, the shell supports cached-context-first page loads. `navigation.js` hydrates `window.LongtailForge.workspaceContext` synchronously from the last stored localStorage copy before the app-shell bootstrap fetch resolves, pages reconcile through the `longtailforge:workspace-context-updated` event, and the bootstrap payload's `user.timezone` feeds `LongtailForge.timezones.setUserTimezone` so pages no longer issue a separate `/api/session` round-trip for the timezone. The shared `LongtailForge.cachedFetch` helper (`public/js/shared/cached-fetch.js`) provides stale-while-revalidate sessionStorage caching for near-static reads (card registry, focus modes, client/project options) with `cache: "no-cache"` so ETag revalidation works; live reads (timers, candidates, notifications) must stay uncached. The Workbench is the reference consumer: `loadWorkbench()` renders the focus-selection panel and card skeletons immediately from warm caches, fires one parallel fan-out (bootstrap, options, focus modes, card sources from the cached registry, and focus candidates using the localStorage-restored selection), refetches candidates only when validation against fresh data invalidates the restored selection, and reconciles card fetches when the fresh registry differs from the cached one. Dialog-only scripts (`task-dialog.js`, `time-entry-dialog.js`, `clients-projects.js`) load through the module-action lazy-dependency mechanism instead of static tags, the remaining workbench script tags use `defer`, and the Express app serves compressed responses through `compression()` (reverse proxies may additionally compress).

The frontend should not contain hard-coded knowledge of every module.

Instead, the backend should provide an app shell/bootstrap response that includes:

* App name
* App version
* Current user
* Active workspace
* Available workspaces
* Workspace type
* Workspace capabilities
* Enabled modules
* Navigation tree
* Notification summary/counts
* Permission-safe UI hints
* Theme/timezone basics

The frontend should render the navigation tree returned by the backend.

This allows modules to add navigation entries without editing the main frontend navigation file.

Framework-owned navigation and app shell UI may include:

* Dashboard
* Workspace settings
* User settings
* Log out
* Workspace switcher
* Notification bell
* Global search

Module-owned navigation may include:

* Tasks
* Time Tracker
* Time Entries
* Reports
* Notes
* Tickets
* Calendars
* Messaging

Navigation should be filtered by:

* Workspace type
* Workspace capabilities
* Module enabled/disabled state
* User permissions
* Historical read access rules

Login and workspace switching are framework navigation transitions, not module redirects. Each reads the signed-in user's corresponding preferred landing value and resolves it on the server for the target workspace. Dashboard and Workbench are framework destinations; Tasks, Notes, and Lists are accepted only when their module is enabled and their registered protected view passes capability and permission checks. Any invalid or unavailable preference resolves to Dashboard before the browser navigates, so switching never reloads a workspace-specific page from the prior workspace.

---

## Views and Assets

Protected module views are registered through module manifests instead of being served only because a matching HTML file exists.

Framework views:

* Login
* Public landing page
* Dashboard shell
* Workspace settings
* User settings
* User admin
* API keys
* Audit log
* Notifications page
* Search results page

Module views:

* Tasks page
* Time tracker page
* Manual entry page
* Edit entries page
* Notes pages
* Ticket pages
* Calendar pages
* Messaging pages

A module view registration should define:

```js
{
  id,
  path,
  moduleId,
  file,
  requiredPermissions,
  requiredWorkspaceCapabilities,
  allowDisabledRead
}
```

The static/view service checks:

* Is the view registered?
* Is it public or protected?
* Is the module enabled?
* Is historical read access allowed?
* Does the user have permission?
* Does the workspace type support it?

Module assets should also be declared by modules.

Common framework CSS/JS can remain global.

Module-specific JS/CSS should belong to the module whenever practical.

The notification bell/toast UI should be framework-owned app shell code, not reimplemented by every module.

---

## Settings

Workspace settings should be framework-owned.

Module settings should be module-owned.

Framework/workspace settings include:

* Workspace name
* Workspace type
* Billing defaults
* Audit settings
* Notification defaults
* Workspace capabilities
* General security settings

User framework settings may include:

* Theme
* Timezone
* Notification preferences
* Default workspace/page preferences

Module settings include:

* Whether a module is enabled
* Module-specific options
* Module-specific defaults

Example:

```js
settings: [
  {
    id: "tasksEnabled",
    label: "Tasks",
    type: "toggle",
    placement: "workspace",
    moduleStatus: true
  }
]
```

The settings UI renders module setting definitions and values from the backend `moduleSettings` payload. Shared browser helpers normalize module settings, render controls from metadata, read enabled controls back into `moduleSettings`, and standardize status messages. The shared settings renderer must not special-case first-party setting IDs.

Module settings navigation is assembled from registered module settings views rather than from app-shell first-party conditionals. Browser save payloads submit module state through `moduleSettings`, and API/browser consumers should read module availability from `enabledModules`, `modules`, and `moduleSettings` instead of deprecated top-level module flags.

As of 0.33.15.2, ordinary workspace/module setting values persist as validated JSON in `workspace_module_settings`, keyed by workspace, module namespace, and setting ID. Module and framework consumers use the workspace-scoped `settingsService.getValue(...)` / `getFrameworkValue(...)` accessors so absent values resolve from descriptor defaults and stored values follow one validation path. The reserved `framework` namespace is definition-registered by framework code; a module cannot create a framework setting merely by writing a key.

Custom persistence and post-save reactions are separate opt-in registries keyed by `<moduleId>.<settingId>`. A persistence handler bridges retained lifecycle/per-feature storage; the default path needs no handler. An on-change effect runs only after a changed value has persisted successfully and never for a rejected save. Module lifecycle status remains in `workspace_modules`.

As of 0.33.15.3, module setting descriptors are validated data-only contributions with a fixed `workspace`, `user`, `module`, or `new-workspace` placement, field metadata/defaults, optional stable handler/effect IDs, and the shared permission, capability, and enabled-module requirements. `modulesService.listSettingsContributions(...)` applies the shared eligibility and terminology pipeline without reading values or executing behavior. Module targets default to the owning module; only framework registration may create a framework-target or protected definition, and startup validation rejects module collisions with registered framework setting IDs.

As of 0.33.15.4, `LongtailForge.settingsRenderer` is the single browser path from those contribution descriptors to titled settings fieldsets, framework fields, section save actions, typed nested `moduleSettings` payloads, conditional visibility, and per-field validation messages. `visibleWhen` compares a dependent field against one same-contribution controller; validation rejects missing, self-referential, type-incompatible, or cyclic dependencies. Hidden dependents are disabled and omitted from the save payload. The adapter uses `LongtailForge.view` primitives for all settings anatomy, while modules retain validation rules, allowed values, handler/effect behavior, and domain meaning.

As of 0.33.15.5, the protected `GET /api/settings/catalog` route returns the attachment-point catalog consumed by Settings hosts. Sections are grouped under `workspace`, `user`, module-ID-keyed `module`, and `new-workspace` attachments with hydrated values/defaults only after the shared contribution eligibility pipeline and placement access checks. The framework separately includes module lifecycle controls in the workspace attachment even for disabled modules so administrators retain the recovery path; prospective new-workspace module availability remains capability-shaped by the Users service rather than the active workspace.

`views/protected/workspace-settings.html`, `user-settings.html`, `tasks-settings.html`, `time-tracking-settings.html`, `files-settings.html`, and `developer-example.html` are minimal `data-settings-host` mounts. `LongtailForge.settingsHost` builds framework-owned page headers, fields, grouped module sections, actions, status regions, operational readouts, and dialogs through `LongtailForge.view`, exposes standardized `data-settings-attachment` mounts, and leaves page adapters responsible for their owning route calls and save behavior. The app shell owns the ordered Settings -> Admin information architecture; eligible module destinations are registry-derived, and Developer Example appears last only while enabled. Tasks and Time Tracking keep their permission-checked Settings views as disabled-module recovery pages; a Workspace lifecycle save reloads app-shell bootstrap state so Admin navigation and Quick Action Capture change immediately while Workspace Settings remains reachable.

Workspace identity is a framework-wide safety boundary. A workspace type is selected only at creation and cannot be changed afterward: the Settings service rejects direct mutation attempts, and the repository verifies the stored type while omitting it from workspace updates. Only a Workspace Administrator or Super Admin may rename a workspace. The disabled Workspace Type control communicates the creation-time rule, while the existing Workspace Users dialog opens from the `Users` action in the Workspace Settings page header.

As of 0.33.15.6, Client/Projects billing defaults and period values, Time Tracking fiscal-year and rounding values, and Tasks timer enablement persist as ordinary owner-namespaced generic settings. Tasks reminder defaults and Files policy/quota values remain in their specialized tables behind owner-registered handlers. Owner accessors feed runtime behavior, and the framework Settings service, its repository, and its normalizer contain no feature-module imports, setting IDs, or module-specific branches. Secure Notes keys, Files storage-provider selection, and scanner configuration remain environment-owned and never enter the Settings catalog.

As of 0.33.15.7, `GET /api/users/permission-resources` is the authoritative browser catalog for the User Admin permission matrix. Module `resourceDefinitions` pass through the shared enabled-module, terminology, and required-permission contribution pipeline; framework-owned resources are filtered through the same permission rule. The browser renders the returned keys and operations without a first-party resource list, so enabling or disabling a module adds or removes its matrix section automatically. Stored overrides for temporarily hidden resources survive assignment edits, while route authorization, scoped role assignment, and record-level operation enforcement remain unchanged in the Users and Permissions services. This catalog is intrinsically framework-wide permission infrastructure and is an explicit Two-Module Rule exception.

As of 0.33.17.7.9, User Admin Add User is also server-shaped. `GET /api/users/add-options` returns only active workspaces the actor may administer and the role/scope combinations the actor may assign in the selected target. `POST /api/users/lookup` performs exact normalized-email matching and returns a minimum safe match without memberships or directory search; `POST /api/users` revalidates the workspace, role, and scope before activating an existing identity or creating one identity plus membership. Super Admin authority is installation-wide, while non-super administrators cannot discover or target unrelated workspaces. Personal workspaces reject additions, Family workspaces omit client roles, and Project Administrator assignments use concrete project scope. Migration 074 converts legacy client-scoped Project Administrator rows to one assignment per existing project before publishing that role contract.

As of 0.33.17.7.10, the install-level `users` row is durable identity and attribution data rather than a deletable workspace record. User Administration may deactivate another user's current-workspace membership and roles but rejects its own signed-in user ID; a last-membership removal retires the account. `DELETE /api/user/account` is the authenticated self-service retirement path and deactivates all memberships after workspace-owner transfer checks, replaces the usable password, revokes sessions and API keys, and removes role/creation grants. It preserves username, display name, the user ID, and all authored/assigned references so ordinary Tasks, Notes, Files, Lists, and audit history continue to resolve readable attribution. Authentication returns one generic denial for unknown, inactive, and retired identities.

As of 0.33.17.7.11, Tasks timer lifecycle audits persist Client/Project IDs together with their readable names. The Audit browser resolves row attribution from that metadata and may fall back only to the same permitted audit row's saved task snapshots for legacy rows; it does not perform a new cross-record lookup. Existing Audit workspace access, permission checks, record visibility, and ID-based Client/Project filtering remain authoritative.

Dashboard and Workbench are framework-owned surfaces fed by module contributions. Modules declare Dashboard panels and Workbench cards in their manifests with stable IDs, renderer IDs, module IDs, permission requirements, module-state requirements, optional data routes, and optional workspace terminology. The backend filters those contributions by workspace, module state, capabilities, and permissions before returning them to the browser.

The browser Dashboard and Workbench scripts may still contain first-party renderer implementations, but those renderers are activated by contribution metadata rather than permanent module/id conditionals. Dashboard and Workbench protected pages are minimal framework hosts; their browser adapters build the framework-owned anatomy with `LongtailForge.view` helpers and then mount available contribution renderers. As of 0.33.6.10b, Time Tracking billing panels are a concrete module-owned Dashboard example: Time Tracking declares the panel contributions, registers the browser renderers, and serves billing data from its own route while the Dashboard host owns placement and empty/status behavior. Future modules should be able to add Dashboard panels or Workbench cards by declaring contributions and supplying compatible renderer behavior without changing unrelated navigation or settings code.

As of 0.33.6.10b, Quick Action Capture is the framework-owned low-distraction capture drawer in the authenticated app shell. App-shell bootstrap returns permission-filtered quick-action descriptors, the shared footer renders the bottom-right drawer on protected pages, and modal-backed actions dispatch through `LongtailForge.moduleActions` so modules keep form and save ownership. Task, Note, and List creation are modal-backed through their existing module-owned editors. Files registers attachment-scoped File Context and File Preview openers for future framework surfaces, while generic File capture remains an explicitly labeled page fallback until a target-aware upload opener exists. Reporting and Search also remain explicitly labeled temporary page fallbacks until their opener/modal contracts ship. As of 0.33.6.12d-2, Timer is modal-backed through `time-tracking.timer.create`: QAC opens the Time Tracking Create Timer modal, and Time Tracking owns Client, Project, optional Task, Description, Billable, active-timer save, task-timer dispatch, focus completion, and host timer-refresh notification behavior.

As of 0.33.6.11, the Workbench Inspector is a Workbench-only right-side context panel on wide layouts. It renders from the same permission-shaped focus candidates already returned to Workbench, displays only safe titles/context after raw-ID fallback checks, opens Task, Note, and List records through existing module actions where available, and falls back to the Workbench candidate page handoff otherwise. It is not an embedded viewer, Files preview surface, QAC drawer, app-shell rail, or new record query surface, and it hides on narrow layouts instead of competing with QAC's bottom-right drawer space.

As of 0.33.6.12e-1, Task Focus related context is a Workbench service route for one selected task, not a browser-side reconstruction of candidate overflow. The service reads owning modules through their existing service/read-model paths, ranks linked Notes, task Files, linked Lists, same-project active Tasks, then direct shared-tag records, and returns only safe titles, reason labels, badges, and module-action or fallback descriptors. Files remains attachment-backed here; shared direct-tag Files context is not invented while Files has no taggable target contract.

As of 0.33.6.12e-2, the Task Focus Inspector consumes that selected-task related-context read model. The browser owns collapsible right-panel presentation, loading/error/empty states, and module-action dispatch; owning modules still own Notes/List/Task editor behavior and Files Preview behavior. As of 0.33.6.12m, Task Focus linked Note rows dispatch `notes.view` so Notes owns the rendered Markdown read modal and explicit Edit handoff. As of 0.33.6.12n, propagated recurring linked notes appear through the same related-context read model and `notes.view` action; Workbench still receives safe relationship rows rather than note bodies. Workbench does not render embedded previews, fetch note bodies for the Inspector, fetch unrelated focus-mode overflow candidates for Task Focus, or load the full Files browse page adapter just to preview a related attachment.

As of 0.33.6.12h, the same-project Tasks subgroup inside Task Focus related context is ordered by due-date usefulness instead of generic latest-first sorting. Dated tasks due today or already overdue lead that subgroup, future-dated tasks follow from nearest to farthest, no-due tasks stay last, and equal-date ties stay deterministic through task metadata rather than browser insertion order.

As of 0.33.6.12j, the Workbench Task Focus summary remains a browser-owned read-only presentation layer on top of the existing Tasks read route. It shows one safe Client/Project context line and uses the summary chip row for status, priority, due date/time, and direct tags instead of duplicating Client/Project context in body copy or forcing users to expand Task Details for basic task metadata.

As of 0.33.6.12f, the Pick up where I left off focus corrects its recovery recommendation by boosting the second-most-recent updated readable active task from the Tasks Workbench item source, scoped by the current Client/Project filters and ordered by canonical task `updated_at`. Running and paused timer resume rows stay first, the boosted task is deduplicated against any existing resume row, and disabled, completed, archived, unreadable, private/secure, or out-of-filter tasks remain excluded by the existing source and permission boundaries.

Notification preferences should be framework-owned, but modules may declare notification types/templates that users can enable, mute, or configure where practical.

---

## Audit Logging

Audit logging is framework-owned.

Modules should be able to declare audit record types and actions.

The audit service should remain the authoritative admin/security record.

Audit records should answer:

```text
Who did it?
What changed?
When did it change?
What workspace was affected?
What record was affected?
What was the previous value?
What is the new value?
What module/source created the change?
```

Audit logs are not the same thing as an activity feed.

Audit logs may contain admin/security detail.

Activity feeds should be user-friendly, permission-safe summaries.

Notification records are also not audit logs. Notifications are user-facing alerts. Audit logs are admin/security history.

---

## Event and Hook System

Longtail Forge should use a lightweight internal event system so modules and framework services can react to changes without hard-coding cross-module behavior.

Example events:

```text
workspace.created
workspace.updated
module.enabled
module.disabled
client.created
client.updated
project.created
project.updated
time_entry.created
time_entry.updated
task.created
task.updated
task.completed
task.archived
task.restored
notification.created
notification.read
notification.dismissed
```

Event payloads should generally include:

```js
{
  workspace_id,
  actor_user_id,
  actor_user_name,
  record_type,
  record_id,
  previous_value,
  new_value,
  source
}
```

Future event consumers may include:

* Search indexing
* Activity feed
* Notifications
* Integrations
* Webhooks
* Background jobs
* Automations

The event system should start small.

Do not refactor every service into events at once.

As of 0.33.5.21.2, durable background work has the framework-owned `jobs` table from `src/db/migrations/065_job_outbox_schema.sql` plus the v1 worker runner in `src/core/jobs/`. Job rows store workspace-scoped work with a type, payload JSON, optional active dedupe key, lifecycle status, priority, availability time, retry counters, lock fields, error summary, and lifecycle timestamps. The v1 runner polls by timer, claims due work transactionally, runs registered handlers, completes successful jobs, retries failures with bounded backoff, and moves exhausted jobs to `dead`.

As of 0.33.5.21.3, the runner also reclaims expired `running` locks through `LONGTAIL_JOB_LOCK_TTL_SECONDS` and exposes the protected `GET /api/jobs/status` readout for pending/running/failed/dead counts plus paged recent failure summaries. Event producers and module-specific job types remain later roadmap work.

As of 0.33.5.21.4, search indexing is the first durable job producer. Module mutation services still call the framework search sync helper, but the helper queues `search.index` jobs for single-record reindex/remove work instead of writing `search_index` during the request. The search job handler performs reindex, remove, and rebuild operations through the existing search service/rebuild service. The protected rebuild route queues a workspace/module rebuild job and returns `202`, and normal web startup only queues one deduped app rebuild job when the canonical index is empty.

As of 0.33.5.21.5, notification fan-out is also durable background work. Framework notification event hooks queue `notification.event` jobs for notification-producing internal events, and the worker resolves recipients before creating notification records through the existing notification service. That keeps workspace defaults, user preferences, subscriptions, actor suppression, permission checks, and module-enabled checks centralized while removing the dependency on in-process event-handler fan-out.

As of 0.33.5.21.6, task reminders, recurrence generation, file scanning, and future imports also have durable job paths. Tasks queues `task.reminder` jobs for eligible reminder occurrences and `task.recurrence` jobs when recurring tasks are completed; the worker recomputes reminder policy before firing `task.due_soon`, tolerates normal clock skew, and creates recurrence instances idempotently through the Tasks recurrence service. As of 0.33.5.21.7.2, task reminder scheduling is bounded to a documented 30-day horizon and topped up by a durable 12-hour sweep for existing active due-dated tasks. As of 0.33.5.21.7.3, reminder firing and notification fan-out share a stable delivery key so reclaimed reminder jobs and retried notification jobs do not create duplicate reminder notifications. As of 0.33.5.21.8, fired reminders pass explicit responsible recipients from the current task read so assigned tasks notify assignees, unassigned tasks notify the creator, and existing task followers remain additive in the in-app notification surface. Files queues `file.scan` jobs and exposes a worker handler for pending scan rows. As of 0.33.5.21.7.1, uploads no longer run scanners inline after queueing the job: a new attachment stays pending and unavailable until the worker completes the scan. As of 0.33.5.22.7, scanner mode resolution is configuration-owned: `none` resolves queued scans to `available`/`not_required`, `noop` is an explicit pass-through mode, and scanners resolve through Files-owned adapters. As of 0.33.5.22.8, Runtime Diagnostics exposes safe scanner health/status and disabled/pass-through warnings without exposing scanner internals. As of 0.33.5.22.9, `clamscan` is an optional executable scanner adapter; as of 0.33.5.22.11, `clamd` is an optional TCP scanner adapter. Both ClamAV adapters mark clean scans passed, quarantine/fail infected scans, quarantine/error unavailable or timed-out scanner executions, avoid automatic deletion, and keep executable paths, hostnames, ports, raw scanner output, storage keys, and protected paths out of scanner results. As of 0.33.5.21.7.4, completed and dead-letter job history is pruned by framework startup maintenance according to runtime retention windows while active pending/running/failed work is preserved. As of 0.33.5.21.7.5, Workspace Settings exposes read-only queue counts, paged recent failures, and safe worker health for users with `workspace_settings.manage`; the UI consumes bounded admin read models and does not expose payload JSON, dedupe keys, scanner internals, paths, raw environment values, or secrets. As of 0.33.5.21.7.6, the real separate worker process is validated end to end against queued search indexing, notification fan-out, task reminder, task recurrence, and file scan jobs while preserving SQLite's one-local-worker lock and schema-readiness boundary. As of 0.33.5.21.7.7, recurring-task completion responses no longer imply a synchronously created next task: `createdTask` remains `null`, `recurrenceJob.queued` signals worker handoff, and public API responses expose only that safe queued hint. `import.future` is a registered reserved no-op handler until a concrete import producer ships.

---

## Notifications Framework

Notifications should be a framework service.

Notifications should not belong to Tasks, Tickets, Notes, Messaging, or Time Tracking.

The framework should own:

* Notification records
* Notification recipients
* Read/unread state
* Dismissed/archived state
* Notification preferences
* Notification permissions and visibility checks
* Notification API
* Notification bell/toast UI
* Notification cleanup/retention
* Notification delivery adapter contracts
* Event-to-notification hooks

Notification-producing internal events queue durable `notification.event` jobs. The event hook stores the event context in `jobs`; the worker owns recipient resolution and notification record creation through the same service path used by direct framework notification creation. Disabled modules and inaccessible targets must still fail or skip at the service boundary, not in browser code.

Modules should declare notification events/templates where appropriate.

Example:

```js
notificationEvents: [
  {
    id: "task.assigned",
    label: "Task assigned",
    defaultEnabled: true,
    recipientResolver: "taskAssigneeRecipients",
    template: "You were assigned a task: {task.title}"
  }
]
```

A basic notification record may include:

```text
notification_id
workspace_id
module_id
event_type
recipient_user_id
actor_user_id
record_type
record_id
title
body
url
status
priority
created_at
read_at
dismissed_at
metadata_json
```

Notification delivery should start with in-app notifications only.

Future delivery channels may include:

* Email
* Push
* Slack
* Microsoft Teams
* Discord
* Webhooks

Modules should not send directly to every channel themselves.

Modules should ask the notification framework to notify users, and the framework should decide how to deliver.

### Notification Rules

Notifications should be:

* Workspace-scoped
* User-specific
* Permission-aware
* Module-aware
* Safe when modules are disabled
* Safe when records are archived
* Configurable by user/workspace where practical

A user should not receive or open a notification for a record they cannot access.

A disabled module should not create new notifications.

Existing notifications from a disabled module may remain as historical user records unless intentionally cleaned up.

### Notification Examples

Tasks:

```text
task.assigned
task.due_soon
task.overdue
task.completed
```

Tickets:

```text
ticket.created
ticket.assigned
ticket.client_replied
ticket.status_changed
```

Notes:

```text
note.mentioned_user
note.updated
note.shared
```

Messaging:

```text
message.created
message.mentioned_user
message.thread_replied
```

Time Tracking:

```text
timer.still_running
time_entry.needs_review
```

---

## Tags Framework

Tags should be a framework service.

Tags should not belong to any one module.

Tags should be workspace-scoped.

Tags should not be stored as comma-separated text on records.

The framework should own:

* Tag definitions
* Tag assignments
* Tag permissions
* Tag assignment validation
* Tag API
* Tag management UI
* Tag audit logging

Suggested `tags` table fields:

```text
tag_id
workspace_id
name
slug
description
color
status
created_by_user_id
created_at
updated_at
```

Suggested `tag_assignments` table fields:

```text
tag_assignment_id
workspace_id
tag_id
target_type
target_id
created_by_user_id
source
source_assignment_id
source_target_type
source_target_id
propagation_rule_id
created_at
```

Modules should declare which record types are taggable.

Example:

```js
taggableTypes: [
  {
    targetType: "task",
    moduleId: "tasks",
    tableName: "tasks",
    idField: "task_id",
    labelField: "title",
    workspaceField: "workspace_id",
    clientField: "client_id",
    projectField: "project_id",
    requiredReadPermission: "tasks.view",
    requiredTagPermission: "tags.assign"
  }
]
```

The framework should validate:

* The tag belongs to the active workspace.
* The target type is registered as taggable.
* The target record exists according to the module-declared table and field metadata.
* The target record belongs to the active workspace through the module-declared workspace field.
* The user can view the target before seeing tags.
* The user can assign/remove tags before changing tags.
* Disabled modules cannot receive new tag assignments unless explicitly allowed.

The framework browser API exposes:

```text
GET /api/tags
POST /api/tags
PUT /api/tags/:tagId
POST /api/tags/:tagId/archive
POST /api/tags/:tagId/restore
GET /api/tags/assignments
PUT /api/tags/assignments
POST /api/tags/assignments/:assignmentId/suppress
```

`tags.html` is a protected settings page contributed by the first-party `tags` module, not hard-coded into the framework static-view list. The `tags` module also contributes the shared browser helper used by first-party record pages for tag chips and reusable pickers. Record modules should integrate through those helpers and the shared tag service rather than owning tag SQL or custom tag pickers.

Tag reads should preserve assignment origin. Direct/manual tags are editable on the current record, propagated tags are inherited from related records and may be suppressed on the current record, and system tags are service-owned snapshots such as finalized time-entry effective tags. Browser payloads may keep a combined `tags` array for compatibility, but module code should prefer the explicit direct, propagated, system, and effective tag fields when it needs to render or save tag state.

### Tags Are Not Workflow State

Tags should not be used as the source of truth for behavior/security.

Use real fields for:

* Visibility
* Permissions
* Billing status
* Workflow status
* Archived/completed state
* Client-facing/internal state

Example:

```text
Correct:
note.visibility = "public"

Incorrect:
note has tag "#public" and that controls visibility
```

Tags are for classification, filtering, reporting, grouping, and discovery.

---

## Search Framework

Search should be a framework service.

Search should not belong to Tasks, Notes, Tickets, Messaging, or Time Tracking.

Longtail Forge should eventually support cross-object search.

Example:

```text
Search: "CTU Shopify fitment issue"

Possible results:
- Client
- Project
- Task
- Note
- Support ticket
- Time entry
- Message thread, if messaging is enabled and permitted
- Attachment metadata
- Activity item
```

The framework should own:

* Search service
* Search index
* Search API
* Search permission filtering
* Search module filtering
* Search tag filtering
* Search backend adapter

Modules should declare which records are searchable.

Example:

```js
searchableTypes: [
  {
    recordType: "task",
    moduleId: "tasks",
    idField: "task_id",
    titleField: "title",
    summaryField: "description",
    bodyFields: ["title", "description"],
    workspaceField: "workspace_id",
    clientField: "client_id",
    projectField: "project_id",
    readPermission: "tasks.view",
    indexer: "tasksSearchIndexer"
  }
]
```

Initial search can be simple database-backed search.

Do not require Elasticsearch/OpenSearch early.

Preferred search backend path:

```text
1. Normal indexed database search
2. SQLite FTS5 or PostgreSQL full-text search
3. External search engine only if needed later
```

Possible future external search engines:

* Meilisearch
* Typesense
* OpenSearch
* Elasticsearch

External search should be an adapter, not a hard framework dependency.

---

## Search Index

A basic `search_index` table may include:

```text
search_index_id
workspace_id
module_id
record_type
record_id
title
summary
body
tags_text
client_id
project_id
visibility
record_status
source
record_created_at
record_updated_at
indexed_at
```

Search index records are written through framework-owned single-record indexing methods. The first module-owned indexers cover Tasks, Time Entries, Clients, and Projects. Module indexers return normalized search documents, while the framework writes canonical `search_index` rows and delegates SQLite FTS synchronization/removal to the adapter. Initial event synchronization is owned by module mutation services: after successful record mutations, Tasks, Time Entries, Clients, and Projects call the framework sync helper to queue a durable `search.index` job that re-indexes or removes the affected search row, with downstream project/time-entry sync where project scope metadata changes.

Search index rebuilds are framework-owned and count-based. The rebuild service can rebuild one enabled module in an active workspace, all active searchable types in one workspace, or all workspaces through local maintenance tooling. Protected HTTP rebuilds require the active workspace context and `workspace_settings.manage`; app-wide rebuilds are not exposed through browser routes. The protected route queues a workspace/module rebuild job instead of doing the rebuild inside the HTTP request. Rebuild jobs ask module indexers for workspace documents, normalize those documents through the framework search service, upsert canonical rows idempotently, remove stale canonical rows for the rebuilt target, and then ask the active backend adapter to repair search storage for that same scope.

SQLite FTS repair stays inside the SQLite adapter. When FTS5 is available, repair rebuilds scoped FTS rows from canonical `search_index`, recreates missing FTS rows, removes orphaned FTS rows, and can report dry-run counts without mutation. When FTS5 is unavailable, repair reports a skipped result and indexed `LIKE` fallback continues to query canonical `search_index` fields. FTS repair must not mutate canonical permission, visibility, workspace, module, scope, lifecycle, or timestamp metadata.

Examples:

* Record created: index it.
* Record updated: update index.
* Record archived: update or hide index.
* Record restored: restore index.
* Module disabled: hide or stop updating index.
* Module re-enabled: rebuild module index if needed.

Reporting calculations should not depend on the search index.

The search index is for discovery, not financial/accounting truth.

---

## In-App Messaging Module

In-app messaging should be a bundled first-party collaboration module.

It should not be framework core.

Messaging should own:

* Conversations
* Messages
* Message threads
* Participants
* Read receipts if added later
* Message-specific permissions
* Message-specific views
* Message-specific APIs
* Message search hooks
* Message tag hooks
* Message attachment support later if needed

Messaging should use framework services:

* Workspaces
* Users
* Permissions
* Search
* Tags
* Notifications
* Audit logging
* Event hooks
* Public API foundation if external messaging access is later allowed

Example messaging flow:

```text
User sends message
-> messaging module stores message
-> messaging module emits message.created
-> notifications framework alerts recipients
-> search framework indexes message if permitted
-> audit/activity systems record safe summaries where appropriate
```

Messaging is a feature.

Notifications are infrastructure.

---

## Public API

The public API foundation is framework-owned.

Modules may declare public API endpoints and scopes. Each registered endpoint, scope, and declarative module action declares a known `publicDemoCapability`; public-demo catalog filtering is presentation only, while server services and routes remain authoritative.

Example:

```js
publicApiEndpoints: [
  { method: "GET", path: "/api/v1/tasks", scope: "tasks:read", publicDemoCapability: "api_keys" },
  { method: "POST", path: "/api/v1/tasks", scope: "tasks:write", publicDemoCapability: "api_keys" }
]
```

API keys should be workspace-scoped.

API scopes should be module-aware.

Disabled modules should not allow public API writes.

Existing API keys should not bypass disabled module rules.

The API should respect:

* Workspace boundaries
* API key scopes
* Module enabled/disabled state
* Permissions where applicable
* Record visibility rules
* Notification visibility rules where notification APIs are exposed
* Audit logging where appropriate

---

## Database and Migrations

The migration runner is framework-owned.

Modules may provide migrations.

The framework should know which module owns each migration.

Migrations should be:

* Ordered
* Checksum-protected
* Repeat-safe where practical
* Module-aware
* Easy to audit/debug

Long-term, Longtail Forge should move toward a database adapter layer so the app is not permanently tied to shelling out to SQLite.

SQLite can remain the lightweight local/self-hosted database.

PostgreSQL should eventually become the preferred production database.

Current runtime database behavior is documented in [database.md](database.md) and [runtime-configuration.md](runtime-configuration.md). As of 0.33.5.19.9, SQLite is still the only implemented provider, small-office SQLite mode is supported for one app process/server, `src/core/database.js` is the preferred app-facing database import, and the provider-neutral adapter exposes health/capability reporting, named-parameter support, callback transactions, and SQLite migration locking. The 0.33.5.20 bounded-query branch consumes that foundation for scale-seeded list reads, 0.33.5.21.1 adds the first checksum-tracked durable job/outbox schema migration, 0.33.5.21.2 adds the v1 inline/separate worker runner without changing migration ownership, 0.33.5.21.3 adds expired-lock reclaim plus the minimal admin job readout, 0.33.5.21.4 moves search indexing/rebuild work onto `search.index` jobs, 0.33.5.21.5 moves notification fan-out onto `notification.event` jobs, 0.33.5.21.6 adds `task.reminder`, `task.recurrence`, `file.scan`, and reserved `import.future` jobs, 0.33.5.21.7.1 makes `file.scan` the only upload scan execution path, 0.33.5.21.7.2 bounds reminder scheduling with a 30-day horizon plus a durable sweep, 0.33.5.21.7.3 hardens reminder/notification idempotency for at-least-once retries, 0.33.5.21.7.4 adds configurable completed/dead-letter job retention pruning, 0.33.5.21.7.5 surfaces safe read-only job observability in Workspace Settings, 0.33.5.21.7.6 validates `node worker.js` separate-worker operation against all current durable job handlers, 0.33.5.21.7.7 closes the recurring-task completion response contract around asynchronous worker handoff, and 0.33.5.21.8 delivers task due reminders to the in-app notification surface. The completed 0.33.5.22 storage/scanner runtime branch closes with Files scanner mode resolution through `file.scan`, safe scanner health diagnostics, optional `clamscan` executable scanning, optional `clamd` TCP scanning, S3-compatible adapter scaffolding, mocked S3 object operations, and safe S3 diagnostics plus the signed URL exception boundary without adding signed URL routes. As of 0.33.5.25.1, S3 remains deferred until a provider-specific client is wired, and selecting it fails app and worker startup. As of 0.33.5.25.2, Files enforces workspace/per-user internal storage quotas before upload persistence while keeping quota policy inside the Files service. As of 0.33.5.25.3, Files validates streamed upload signatures earlier where practical and pre-checks storage metadata before download/preview streaming so storage drift returns clean 404 responses. As of 0.33.5.25.4, malformed streamed batch file parts stay inside the per-file result model and the active storage adapter contract no longer includes unused local quarantine relocation behavior. Storage/scanner follow-ups and PostgreSQL work should keep consuming the same startup, migration, worker, and adapter boundaries instead of adding parallel database paths; provider-specific hosted S3 client rollout, actual signed URL/direct-transfer routes, stored-object relocation on quarantine, and alternate database providers remain later work.

---

## File and Folder Boundaries

Current structure may evolve, but the intended direction is:

```text
src/core/
  Framework-owned services and app foundation

src/modules/
  First-party modules

src/db/
  Database connection, migration runner, core migrations

public/
  Shared frontend assets

views/
  Public and protected HTML views

docs/
  Project documentation
```

Future possible structure:

```text
plugins/
  Optional third-party or externally developed modules
```

Third-party module support should not require editing random framework files.

---

## Framework Dependencies vs Module Dependencies

Modules may depend on framework services.

Example framework dependencies:

```text
audit-service
api-key-auth
module-access
permissions-service
timezone-normalization
workspace-settings
tags-service
search-service
notifications-service
event-bus
```

Modules may also depend on other modules.

Example module dependencies:

```text
tasks depends on client-projects optionally or conditionally
time-tracking may integrate with tasks if tasks are enabled
messaging may integrate with notifications, but notifications are framework-owned
invoicing may depend on time-tracking
knowledge-base may depend on notes
```

A module should declare dependencies clearly.

The framework should prevent enabling a module when required dependencies are missing or disabled.

Dependency failures should produce clear messages.

---

## Module Enable/Disable Rules

The framework should define what enable/disable means.

A module should not need to reinvent this behavior.

### Enabled Module

An enabled module may:

* Show navigation
* Serve views
* Accept browser API writes
* Accept public API writes with proper scopes
* Register dashboard widgets
* Register search records
* Register taggable records
* Emit and receive events
* Run hooks
* Trigger framework notifications
* Expose settings

### Disabled Module

A disabled module should:

* Hide navigation
* Block writes
* Stop hooks/background behavior
* Stop new search indexing
* Stop new notifications
* Stop new tag assignments unless explicitly allowed
* Preserve existing data
* Allow historical reads only if permitted
* Keep audit logs visible to authorized users

Disabling a module is not the same as uninstalling a module.

---

## Third-Party Module Direction

Third-party module support should come after first-party modules follow the same rules.

The correct path is:

```text
1. Make first-party modules use the formal manifest contract.
2. Make navigation/settings/views/permissions registry-driven.
3. Add module validation and lifecycle rules.
4. Add developer documentation and example module.
5. Add explicit external module registration.
6. Consider package/plugin installer behavior much later.
```

Avoid building a plugin marketplace too early.

The priority is to make the architecture clean enough that future third-party support is natural.

---

## Development Philosophy

Longtail Forge should prefer:

```text
Small framework services
Clear module boundaries
Explicit contracts
Predictable behavior
Boring code
Good audit trails
Permission-safe defaults
Workspace-safe data access
```

Longtail Forge should avoid:

```text
Hard-coded module names throughout the frontend
Feature-specific hacks in framework services
Magic discovery
Cross-workspace shortcuts
Permission checks only in the UI
Tags controlling security behavior
Search index as reporting truth
Per-module notification systems
Messaging treated as notification infrastructure
Deleting data when modules are disabled
```

---

## Practical Definition of Done for Module Readiness

Longtail Forge is module-ready when a first-party or third-party developer can add a module that contributes:

* A manifest
* Routes
* Views
* Assets
* Migrations
* Navigation
* Settings
* Permissions
* API scopes
* Taggable types
* Searchable types
* Notification events/templates
* Audit record types
* Event hooks

without editing unrelated frontend files, unrelated settings code, unrelated navigation code, unrelated permission mapping code, unrelated notification code, or unrelated search/tag code.

The framework should provide the rails.

The module should provide the train.

---

## Summary

The Longtail Forge framework is the foundation.

Tasks, Time Tracking, Notes, Tickets, Calendars, Messaging, and Invoicing are modules.

Tasks and Time Tracking are important bundled first-party modules, but they should not be treated as required framework core.

In-app messaging is a bundled first-party collaboration module, not framework core.

Tags, Search, and Notifications should be framework services because they need to work across all modules.

The long-term goal is not just to add features.

The long-term goal is to make Longtail Forge a stable, extensible platform for managing work across clients, projects, teams, and personal/family spaces.
