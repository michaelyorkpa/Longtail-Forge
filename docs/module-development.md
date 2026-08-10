# Module Development Guide

This guide explains how to build against the current first-party module contract. The contract source of truth is `docs/module-contract.md`; the disabled-by-default `developer-example` module shows a compact working manifest.

For current first-party workflow modules, see `docs/tasks-module.md` for Tasks, `docs/notes-module.md` for Notes, and `docs/lists-module.md` for Lists. Tasks demonstrates commitments, next actions, blocked reasons, resume notes, activity/completion metadata, lightweight checklists, parent/child blocking relationships, recurrence, timers, search/tags/files declarations, Help, resume-safe context, and consuming a Notes-owned Linked Context panel without owning Notes permission logic. Notes demonstrates Library behavior, revisions, Markdown, secure-note boundaries, Primary Context and Linked Context contracts, safe Active Work resume-context candidates, tags, search, files, and Help. Lists demonstrates operational list storage, item execution, reusable workflows, catalog suggestions, linked records, search/tags/files declarations, Help, and resume-safe context. Shared workflow context terminology lives in `docs/workflow-context-contract.md`.

## Create A Module Manifest

Create `src/modules/<module-id>/module.js` and export a canonical `moduleEntry` with `createModuleEntry({ manifest, activateApp?, activateWorker? })`. The directory name and manifest `id` must match. Run `npm run modules:registry:generate`; never hand-edit `src/core/modules/registry.js` or the generated catalog. `npm run modules:registry:check` rejects missing, extra, reordered, or stale catalog output. Discovery is limited to repository-owned first-party source entries; third-party and operator-writable runtime discovery remain deferred.

Required fields include `id`, `name`, `displayName`, `description`, `category`, `version`, and `enabledByDefault`. Keep `id` stable and kebab-case because it is used in `modules`, `workspace_modules`, route guards, settings, dependencies, and contribution filtering.

Use `enabledByDefault: false` for examples or optional features that should not appear in new workspaces automatically. Use `canDisable: false` only for framework-core modules.

Keep entry imports side-effect free. Search indexers, report runners, setting persistence/effects, job handlers, and module-owned startup work belong in `activateApp` and/or `activateWorker`, not at module scope. Activation hooks must remain synchronous and data-free; register later startup work through `context.registerStartupTask(...)`. The framework validates the entire manifest graph first, then activates dependencies before dependents with module-ID ordering as the deterministic tie-breaker. App and worker bootstrap must call the generic module runtime rather than import a specific module's handlers or sweeps.

### Concern-Based Manifest Source Composition

As of 0.33.18.5, Tasks and Notes prove the concern-composition pattern. The runtime contract is still one validated manifest and one canonical `moduleEntry` exported from `module.js`; concern files export data used by that composition point and are never registry entries themselves. The generated catalog, startup validator, dependency ordering, and activation lifecycle are unchanged.

Use these review heuristics rather than creating mandatory boilerplate:

- Consider composition when `module.js` is roughly 500 lines or longer, or when unrelated permissions, events, Help, integration, and settings declarations make identity, routes, views, or activation difficult to review.
- Add a concern file only when it owns substantial cohesive content: normally about 75 or more lines, several closely related manifest fields, or one behavior-rich declaration set such as Tasks settings. Keep small arrays next to the composition unless separating them materially improves review.
- Use repository-conventional names such as `module.permissions.js`, `module.events.js`, `module.integrations.js`, `module.help.js`, `module.views.js`, `module.dashboard.js`, `module.workbench.js`, `module.api.js`, or `module.settings.js`. The filename should describe the actual content; no module needs every file.
- Keep route objects, activation hooks, and the canonical `createModuleEntry(...)` call in `module.js` unless a later contract deliberately says otherwise. Importing any concern must remain side-effect free.
- Assign each composed field explicitly so reviewers can see the complete manifest shape and preserve contribution array order. Update source-level tests to read the owning concern file rather than copying declarations back into `module.js` for a test.
- Before and after movement, compare the complete normalized manifest inventory and run the ordinary startup validator. IDs, routes, permissions, dependencies, contribution order, executable registration, and runtime behavior must not change in an organization-only slice.

Tasks uses permissions, events/notifications, integrations, and settings concerns; Notes uses permissions, events/notifications, integrations, and Help concerns. Their view declarations remain in `module.js` because those composition points are still digestible and existing review/test ownership is view-centered. A future Support Tickets, Knowledge Base, or Creator Studio module should start compact, apply the same thresholds as it grows, and use only the concerns it actually needs.

Complete pattern:

```js
// src/modules/support-tickets/module.permissions.js
const supportTicketPermissions = {
  requiredPermissions: ["support_tickets.view"],
  permissions: [
    {
      id: "support_tickets.view",
      moduleId: "support-tickets",
      label: "View Support Tickets",
      description: "View authorized support tickets.",
      resource: "support_tickets",
      operation: "read",
    },
  ],
};

export { supportTicketPermissions };
```

```js
// src/modules/support-tickets/module.js
import { supportTicketPermissions } from "./module.permissions.js";
import { createModuleEntry } from "../../core/modules/module-entry.js";
import { appVersion } from "../../core/version.js";

const supportTicketsModule = {
  id: "support-tickets",
  name: "Support Tickets",
  displayName: "Support Tickets",
  description: "Support request tracking.",
  category: "workflow",
  version: appVersion,
  enabledByDefault: true,
  requiredPermissions: supportTicketPermissions.requiredPermissions,
  permissions: supportTicketPermissions.permissions,
};

const moduleEntry = createModuleEntry({ manifest: supportTicketsModule });

export { moduleEntry, supportTicketsModule };
```

This is source organization, not third-party plugin discovery or a loader redesign. Small modules should remain small single files.

Before adding a framework primitive, manifest field, registry, contribution type, or generalized service, apply the Two-Module Rule: name two real first-party consumers with materially similar behavior and contract requirements. Do not invent a second consumer or generalize appearance alone. Keep a one-module requirement inside that module until the shared contract is understood. Intrinsically framework-wide authentication, security, permissions, workspace isolation, deployment, database, and app-shell work is an explicit documented exception.

Persistent record identity is another explicit framework-wide exception. Server-side module code must import `createRecordId()` from `src/core/identifiers.js` for newly generated ordinary database record IDs, keep one authoritative generator layer per record family, and preserve accepted caller-supplied UUIDv4 or UUIDv7 values used by imports, public APIs, restoration, or idempotent retries. A future module must treat IDs as opaque across reads, updates, relationships, Search, exports, audit metadata, URLs, JSON, and recovery; it must not normalize existing UUIDv4 fixtures or add an identifier-rewrite migration. Do not import the `uuid` package, call Node `randomUUID()`, implement UUIDv7 in browser code, validate UUIDv7 exclusively, or replace module-owned timestamp, due-date, sequence, sort, paging, or cursor rules with ID order. UUIDv7 provides approximate insertion locality only, not trusted chronology under distributed clock skew. Tokens, credentials, and cryptographic material use their dedicated security helpers rather than either identifier operation. The complete contract lives in [database.md](database.md#identifier-authority-and-forward-uuidv7-policy).

The 0.33.18 closeout records the actual qualifications in `docs/architecture.md`: all eight bundled modules consume the canonical entry/catalog contract; Tasks and Notes consume concern composition; Tasks and Time Tracking consume Dashboard contribution asset loading; and database startup plus release tooling are explicit framework-wide exceptions. `LongtailForge.esModuleBridge` remains Dashboard page-local compatibility machinery, not a new general extension API. Future modules may consume the settled manifest and contribution contracts, but a second converted page must prove materially similar loading needs before the bridge is extracted or broadened.

Browser modernization is gradual native ES-module adoption, not a framework rewrite. Dashboard is the first settled conversion: one `<script type="module">` page entry owns an explicit compatibility import list; all imported local assets are same-origin, application-versioned, and deduplicated; and existing `LongtailForge` globals survive temporarily behind `LongtailForge.esModuleBridge`. A converted page must not retain ordered body-level implementation scripts or introduce a new global ordering dependency.

Keep the framework page entry generic. Permission-filtered module scripts and styles must be declared in `browserAssets`, returned by the host's contribution catalog, and loaded through `loadContributedAssets(...)`; do not hard-code a module renderer path into the protected HTML or framework host. A module asset may use `importScripts(...)` only to bridge an existing dependency while it is converted. New module code should use real imports/exports where its dependency is already modular. Keep CSS ownership parallel to behavior ownership: page anatomy belongs in a framework page stylesheet, while module panels belong in module-owned styles. Every converted entry needs missing-file/import, same-origin/versioning, behavior, accessibility, keyboard, responsive, and CSP-safe regression proof. Workbench remains unconverted until its scheduled performance restructuring.

## Register Routes

Browser/session routes go in `browserApiRoutes` and are mounted under `/api` after authentication. The framework wraps optional module browser routes with write protection so disabled modules cannot receive normal writes.

Every new authenticated browser route must also receive an exact template under a stable ID in `src/core/public-demo-budget-catalog.js`. Choose the read or mutation catalog deliberately, declare bulk collection keys when one request can create multiple records, and add a service-level `reserveAdditionalPublicDemoBudgetUnits(...)` call before persistence when output growth depends on stored state rather than the request body. Do not use a broad prefix: undeclared future routes must fail closed for marked demo visitors. Capability, permission, workspace, validation, and module behavior remain separate authoritative checks after budget admission.

Public API routes go in `publicApiRoutes` and should use API key middleware with a module-declared scope. Describe those endpoints in `publicApiEndpoints` so docs and sanity checks can discover them.

## Handle Route Failures

Use `AppError` for expected route failures and prefer the registered code for the chosen HTTP status. A new workflow-specific code must be stable lowercase `snake_case`, documented in the module or API contract, and regression-pinned. Let unexpected errors reach the final framework error middleware exactly once; do not hand-roll framework error JSON/HTML or return raw exception messages, stacks, SQL, paths, bodies, credentials, or protected identifiers.

Preserve each route's permission, workspace-isolation, and non-enumeration decisions. New browser entries must live under `views/`, contain a `<head>` injection point, and be served through `staticService` so the shared recovery boundary loads before page-owned scripts. The complete envelope, middleware-order, browser-recovery, diagnostic, and support-correlation contract lives in [http-errors.md](http-errors.md).

## Public Entry Points And Import Boundaries

As of 0.33.7.2, modules with cross-module consumers expose a public entry point at `src/modules/<module>/index.js`: Tasks, Notes, Lists, Clients/Projects, and Time Tracking. The entry point re-exports the module's supported cross-module capabilities (manifest, service, repository, and contract constants). Files has no `src/modules/files/` entry because Files is framework-owned; its public seam is `src/services/files.service.js` plus the `src/core/files/` adapters.

The import rule:

- Framework/shared code should import module capabilities from the module's public entry point.
- One module must not import another module's internal repositories, services, routes, or helpers directly. Import the other module's `index.js`, or extend that entry point (in the owning module's slice) when a capability is genuinely public.
- Imports inside a module's own directory remain unrestricted.

As of 0.33.32.5, the checked Tasks timer service consumes `activeTimersService` through Time Tracking's public `index.js` entry instead of its historical deep service import, and that resolved baseline exception has been removed. Sourced timer billable handoffs use the canonical checked `normalizeTimeEntryBillable()` helper so boolean `false` and string `"no"` retain the same non-billable meaning without adding another Tasks-to-Time-Tracking dependency.

The `framework.module-import-boundaries` regression enforces this statically. Pre-0.33.7.2 deep imports are recorded in `scripts/baselines/module-internal-import-baseline.json` and are tolerated but frozen: new cross-module deep imports fail the suite. Do not add entries to the baseline in feature work; shrink it when a touched file can switch to the entry point, or in a dedicated cleanup slice. Framework-to-module deep imports are not yet blocked — converting them is future work — but new framework code should still prefer the entry points.

## Contracts, Schemas, And Tests

As of 0.33.7.2, module contracts follow one pattern:

- Runtime Zod schemas and JSDoc-backed types live in `*.contracts.js` or `*.schema.js` files owned by the module. Files that runtime JavaScript imports stay JavaScript; runtime code must not import `.ts` files.
- Type-only definitions may live in `*.types.ts` or shared `.d.ts` files, but nothing imported at runtime may depend on them.
- Vitest tests live beside the contract they prove or under `tests/` (discovered as `tests/**/*.test.mjs`); run them with `npm run test:unit` or the filtered `test:contracts`/`test:files`/`test:tasks` commands.

As of 0.33.7.6, Tasks is the second proving ground: `src/modules/tasks/tasks.contracts.js` (module-owned) validates the Tasks edges — create/update bodies (shared by browser and public API callers), checklist item create/update/reorder, child-relationship payloads, and the embedded recurrence payload whose `applyTo` mode is strictly `future`/`instance`. Tasks' calibration differs from Files in one documented way: server-managed audit fields are stripped rather than rejected, because the Tasks service already ignores them and API callers legitimately echo fetched tasks back on update, while Files' server-managed fields are storage/scanner security controls that must never be accepted. List entries (assignees, tags, checklist ids) stay liberal for in-process callers; only structured junk is rejected. Fast proof lives in `tests/contracts/tasks-contracts.test.mjs` (`npm run test:tasks`).

As of 0.33.12.1, Time Tracking applies the same edge-validation pattern to its distinct browser and public API time-entry services plus manual active-timer save/status/finalize bodies. `src/modules/time-tracking/time-tracking.contracts.js` shares field definitions where wire shapes overlap while preserving separate service parsing, response, and audit boundaries. Numeric duration fields accept numbers or numeric text to match the existing normalizers; wrong-typed known fields fail 400, unknown/server-managed fields are stripped, and required-ness stays with the service. Timer finalization validates the route body once and does not re-parse the trusted time-entry object assembled from that body and the authoritative stored timer. Fast contract and pure billing proof runs through `npm run test:time-tracking`.

As of 0.33.12.2, modules can contribute reports through the validated `reporting` manifest field. Keep definitions data-only: stable report, runner, and renderer IDs; label/description/category/sort metadata; permissions, capabilities, required modules; validated filter descriptors; and IDs of same-module browser assets targeted at `framework:reporting`. Register executable runners and browser renderers outside the manifest. Framework code lists contributions through `modulesService.listReportingReports(...)`, which filters disabled modules, missing dependencies/capabilities, and missing permissions without executing report code. The framework-owned host uses a narrow `LongtailForge.view` adapter rather than a fake Reporting module or report-specific `viewSurfaces` escape hatches.

As of 0.33.12.3, server report behavior registers through `registerReportRunner(runnerId, runner)` from `src/core/reporting/report-runner-registry.js`. A runner receives `{ session, workspaceId, reportKey, report, filters }`; use the session and module-owned services for record-level permission safety, and return a JSON-safe module-owned result shape. Do not query the catalog from inside a runner, place functions in the manifest, expose runner IDs to browser code, or return raw database/storage/internal errors. The framework catalog and execution route re-check contribution availability, normalize basic filter wire shapes, and wrap success/failure. Declaring a runner ID does not register it: a missing handler intentionally produces the safe 503 `report_unavailable` envelope until module startup performs registration.

As of 0.33.12.4, Time Tracking is the production example. `src/modules/time-tracking/report-runners.js` registers the stable runner during module startup and lazily resolves the owning service when execution begins so registration does not create a module-registry initialization cycle. Its runner delegates to the same `time-tracking-billing.service.js` method used by the retained compatibility read. Cross-module hierarchy and billing metadata comes from the Clients/Projects-owned `clientsService.readClientProjects(session)` contract plus an explicit `client-projects` contribution dependency; framework Reporting never imports either module. New report runners should follow the same separation: synchronous data-free registration, module-owned permission/query/calculation code, declared dependencies, and no parallel compatibility calculation.

As of 0.33.12.5, hierarchical billing uses a direct-leaf then recursive-add contract. Do not query a parent project’s descendants into one bucket and apply the parent settings. Calculate each project’s direct time with its own effective period, rounding, and rate; add immediate child branch totals after those children have done the same; and sum only root branches for footers. Clients/Projects provider shapes must use JSON-safe arrays for descendant IDs, and consuming modules should retain the owning client’s effective billing defaults on its projects rather than substituting the selected parent scope’s defaults. Fast unit fixtures must cover mixed project rates/rounding/periods and parent/child clients; focused runner regressions must prove the same service path and display-only child-row non-duplication.

As of 0.33.12.6, report browser behavior follows the same stable-ID split as server runners. The framework Reporting host creates common filter controls from catalog metadata, loads only catalog-returned assets for the selected report, executes the namespaced framework route, and dispatches the returned renderer ID. A module asset registers `render(result, context)` through `LongtailForge.reporting.registerRenderer`; it may also register option initialization, dependent-filter synchronization, and domain-combination validation hooks. Keep module routes, readable option shaping, result interpretation, hierarchy expansion, and footer meanings in that module asset. Do not hard-code the module report ID/path in `reporting.html` or `public/js/reporting.js`, call compatibility result routes from a converted renderer, recalculate runner totals in the browser, or build a second page shell/filter/status/result host inside the module asset.

As of 0.33.7.3, Files is the first proving ground: `src/core/files/files.contracts.js` holds the runtime Zod schemas for the Files edges (JSON/batch upload bodies, multipart upload metadata, attach-existing payloads, the File Context editor payload, preview requests, and storage adapter configuration), wired at the Files service entry points through `parseFilesEdgePayload`. The contract choices there are the template for later modules: unknown fields are stripped, wrong-typed known fields fail with a 400 `AppError`, server-managed storage/scanner/integrity fields are rejected outright, required-ness stays with the service where its error copy already exists, and trusted internal objects are never re-parsed. Fast proof lives in `tests/contracts/files-contracts.test.mjs` (`npm run test:files` / `npm run test:contracts`).

As of 0.33.18.4, the highest-value framework contracts have importable type definitions in `src/types/framework-contracts.d.ts`, including the module manifest, canonical module entry/activation/startup-task shapes, view-surface descriptor, Dashboard/Workbench contributions, work candidate, focus mode, resume-state payload, search record/reference/result/indexer, notification event payload, taggable/searchable/attachable contributions, public API envelopes, job enqueue/handler/record, and the database seam. High-value seam files carry `// @ts-check`, and the generated catalog, registry engine, entry validator, and runtime activation layer are structurally checked at development time. Dual-cased shapes (resume payloads, job options, search filters) are modeled with both casings on purpose.

As of 0.33.32.8, `scripts/typecheck-seam-inventory.json` is the one reviewable inventory of every first-party runtime/test JavaScript file opted in with a first-line `// @ts-check` pragma. Its 47-file floor includes the browser/API authentication middleware, request-session resolver, central Support View gate, raw JSON reader and checked route consumer, canonical normalizers and timezone math, the Time Tracking time-entry, active-timer, billing, and Dashboard service/repository seams, the public API service, the Tasks timer bridge, the SQLite adapter/provider/driver/literal cluster, three injected-client repositories, and one checked utility contract test. Active-timer persistence owns one importable `ActiveTimer` record; its service consumes that record with Zod-inferred save/status/finalize payloads and canonical Time Entry finalization inputs. Billing and Dashboard calendar windows consume the shared checked local-date-key/day arithmetic and local-date-to-UTC helpers; do not derive those boundaries from the application server's local `Date` getters or constructors. The database contract separates the full `DatabaseAdapter` from callback-scoped `TransactionClient`: repository functions that open transactions require the adapter, while injected helpers that can participate in one accept the client and cannot typecheck a nested transaction. Later slices add their checked seams to the sorted inventory and raise the floor, while removing a pragma, dropping an inventoried file, or weakening the typecheck scope fails `framework.typecheck-seams`. The checking dials live in `tsconfig.json`: `strict` stays on so real type conflicts fire, `noImplicitAny` is off so unannotated legacy helpers do not drown the signal, and `checkJs` stays per-file opt-in. The nominal `tests/**/*.mjs` include makes tests eligible for explicit opt-in; it does not claim type coverage for unchecked test files. Do not remove an existing `// @ts-check` pragma, add `@ts-nocheck`/`@ts-ignore` to runtime files, import `.ts` files from runtime JavaScript, or add `scripts/` to the typecheck program — the release gate rejects those escapes and scope changes.

Use `src/types/http-contracts.d.ts` as the trusted identity vocabulary for browser request sessions, API-key sessions, Support View actor/effective identity, permission resources, and session rotation/invalidation fields added to `Express.Request`. Keep ordinary and Support View identities distinct, and preserve the exact Support View outcome/reason unions. This contract does not make request bodies trusted: raw JSON remains `unknown` until its owning runtime validator or explicit guard narrows it.

`readJsonBody()` is the shared streaming parser and deliberately returns `Promise<unknown>`. Do not annotate it with a caller payload type or cast its result at a checked route. Narrow through the route's existing Zod/schema owner or an explicit object/field guard first. The Support View start route uses the smallest explicit object guard so JSON `null`, arrays, strings, and numbers receive the existing generic confirmation 400 while valid object payloads continue through the service-owned validation and session-rotation path.

`normalizeTimeEntry()` is the canonical application-record boundary for Time Tracking consumers. Import its `TimeEntry` JSDoc type rather than restating the record: duration seconds and hours intentionally remain strings, billable is `"yes" | "no" | ""`, and invoice status is the exact persisted union. `normalizeTimeEntryBillable()` is the shared trusted-value bridge when an internal caller must convert boolean or string billable intent before constructing that record; an empty result still leaves the owning workflow responsible for its default. Convert duration strings to numbers only at a persistence or calculation boundary that owns the numeric semantics. The checked timezone utility accepts its documented date/fallback unions, returns ISO text, and restricts local-date bounds to `"start" | "end"`; empty input intentionally means the supplied fallback or current call time, while invalid timezone-free text falls back and an invalid named timezone still throws.

Each tool has one job, and they do not substitute for each other:

- TypeScript types describe trusted internal shapes and catch drift at development time (`npm run typecheck`).
- Zod validates untrusted runtime input at the edges: request bodies, query params, upload metadata, and configuration. Do not Zod-parse trusted internal objects between service functions.
- Vitest proves contracts and pure service behavior quickly, before the slow suite.
- The existing regression suite still proves integration, permissions, database behavior, and browser/static guardrails; Vitest coverage never justifies retiring a regression outside the coverage-ratchet rules.

## Module Settings

Declare settings in `settings` with an `id`, `label`, supported field `type`, and one fixed `placement`: `workspace`, `user`, `module`, or `new-workspace`. Omitted `target` values default to `module`. Use the standard permission, workspace-capability, and enabled-module requirement arrays to control catalog eligibility. `modulesService.listSettingsContributions(workspaceId, session)` applies those filters and resolves terminology without reading values or running behavior.

The browser reads eligible, hydrated sections from `GET /api/settings/catalog`; do not add a page-specific settings endpoint or a new DOM anchor. The catalog groups `workspace`, `user`, `module`, and `new-workspace` attachments, with module attachments keyed by the owning module ID. Current protected Settings pages are minimal `data-settings-host` mounts, and `LongtailForge.settingsHost` supplies the standardized `data-settings-attachment` regions.

A module manifest may name a persistence `handler` or `onChangeEffect` only by stable string ID. Register the executable behavior separately; never put functions in a settings descriptor. Module settings cannot target `framework`, set `protected: true`, or reuse a framework-registered setting ID. Framework code owns those definitions through the protected registry.

Use `visibleWhen: { settingId, equals }` when one setting should appear only for a matching value of another setting in the same contribution. The comparison value must match the controller type, and dependency chains must not contain self-references or cycles. Hidden fields are disabled and omitted from saves, so do not use visibility as a permission or persistence rule.

A setting with `moduleStatus: true` controls the module enablement row in `workspace_modules`. An ordinary writable non-status value is type-validated from its descriptor and persists automatically in `workspace_module_settings`; module code reads it with `settingsService.getValue(context, moduleId, settingId)`. It does not need a `workspace_settings` column, a `normalizeSettings` branch, or a handler.

Register a persistence handler by `<moduleId>.<settingId>` only when the setting owns specialized storage or needs a temporary legacy bridge. Register an on-change effect separately when successful changed persistence must invalidate or refresh other state. Effects are not persistence handlers and do not run for rejected or unchanged values. Module status remains on the module lifecycle path rather than generic value storage.

Use `info` settings for documentation-only or read-only example fields.

The browser `LongtailForge.settingsRenderer` creates the titled section, fields, and save action through framework view primitives and collects values into `moduleSettings[moduleId]`. Native constraint failures and server field errors use the framework field message channel. Modules own option meaning, validation, error wording, persistence handlers, and effects; they do not provide custom settings field DOM.

## Permissions

Declare user-facing permission metadata in `permissions`, and keep `requiredPermissions` as the compact compatibility list used by navigation, view, and contribution filters.

Use `defaultRolePermissions` for additive default grants. Startup sync inserts missing permissions and role mappings but does not remove existing grants.

Declare each role-override matrix resource in `resourceDefinitions` with a stable `key`, user-facing `label`, supported `operations`, and `requiredPermissions` for catalog visibility. The required permission IDs are validated against the registered permission catalog. `modulesService.listActiveResourceDefinitions(workspaceId, session)` applies module status, terminology, and permission filtering, and User Admin consumes the result through `GET /api/users/permission-resources`. Do not add a module resource or future placeholder to `public/js/user-admin.js`; enabling or disabling the module must be sufficient to add or remove its matrix section. Resource definitions describe the assignment UI catalog and do not replace module/service record-level checks.

## Navigation

Declare app-shell links in `navigation`. Navigation is returned through `/api/app-shell/bootstrap` and is filtered by module status, workspace capabilities, dependencies, and user permissions.

Disabled modules should not contribute normal navigation.

## Workbench And Timers

Declare Workbench cards in `workbench` when a module has a live workflow surface. Cards identify the renderer and basic filtering metadata; the Workbench page stays framework-owned.

Declare actionable records in `workItemSources`. A source module should expose its own list route, such as `/api/tasks/workbench-items`, that returns normalized records with `source_module_id`, `source_type`, `source_id`, `source_label`, `source_url`, project context, status, assignment fields, and any attached timer summary. When a candidate must open a module-owned modal instead of its page fallback, the item may include a sanitized `primary_action` descriptor with `type: "module-action"`, the stable registered action ID, and safe params; the Workbench dispatcher owns dispatch and focus return while the source module still owns the editor and save behavior.

Declare timer-capable records in `timerSources`. Each timer source should publish lifecycle routes for listing, starting, pausing, finalizing, and removing timers. Time Tracking owns active timer persistence and time-entry finalization; source modules provide record context and source-specific permission checks.

Manual timers use `source_type: "manual"` and the shared active timer routes. Task timers use `source_module_id: "tasks"`, `source_type: "task"`, and `source_id: task_id`; they require both Tasks and Time Tracking plus `tasks.view` and `time_entries.create`. Future Support Ticket timers should use `source_module_id: "support-tickets"`, `source_type: "ticket"`, and `source_id: ticket_id` while reusing the same active timer engine.

Finalized sourced timers should create normal time entries with any source-specific metadata the Time Entries module already understands, such as `task_id` for task timers. If a source module is disabled, existing active timers should remain visible in a recovery state so time is not stranded.

## Resume State

Use resume state when a module has work the current user may need to pick back up later. The framework owns `work_resume_state`, `/api/work-resume`, dismissal, read filtering, and Workbench's Pick up where I left off consumption. Modules own only the decision that a lifecycle event is resumable and the safe snapshot fields for their source records.

To participate:

1. Emit safe internal lifecycle events from the module service after successful writes.
2. Register a resume-state producer in service code with `registerResumeStateProducer()`.
3. Shape explicit recovery fields in the producer payload, such as title, source URL, status, priority, due date, next action, handoff note, blocked reason, and safe metadata.
4. Register a read resolver with `registerResumeStateReadResolver()` so the framework can re-check source visibility before returning a row.
5. Optionally register a batch read resolver with `registerResumeStateBatchReadResolver()` (`{ recordIds, rows, session, workspaceId } → Map<recordId, readCheck>`) so list scans answer the same check with one IN-query per record type instead of one read per row; modules without one keep the per-row fallback, and re-registering a per-row resolver for a key supersedes its batch shortcut so both paths always share one policy. The first-party Tasks, Lists, Notes, and Time Tracking resolvers are batched this way as of 0.33.20.4 (Notes batches only its safe lifecycle pre-filter — eligible notes still go through `notesService.read` because Notes owns its access and secure-content policy).
6. Add regressions for workspace scope, disabled modules, permission-denied reads, deleted/completed/archived/finalized filtering, dismissal refresh, and unsafe metadata exclusion.

Do not copy freeform bodies, comments, rendered HTML, secure/encrypted fields, attachment internals, protected storage paths, scanner details, private-note hints, or inaccessible linked-record labels into resume state. Private and secure Notes are excluded from global resume-state rows in the current foundation. Time Tracking should update sourced task timer resume state on the source task record; manual active timers remain Time Tracking-owned. For recurring task instances, include recurrence template/instance metadata when available so framework ranking can avoid surfacing far-future instances whose only resume signal is creation.

## Views And Assets

Register authenticated module pages through `protectedViews`. Protected module pages are served only when a registered descriptor matches the requested path.

Declare module-specific browser scripts or styles in `browserAssets`. Shared app-shell assets remain framework-owned. For a converted contribution host such as Dashboard, target both script and style descriptors at the host view and let the permission-filtered catalog load them; the host HTML and framework adapter must not name the owning module's file. Keep prerequisite imports inside the module asset through the temporary versioned bridge until those prerequisites expose native exports.

## Shared UI Surfaces

Use `docs/ui-surface-contract.md` and `docs/ui-layout-guide.md` before adding or converting module UI. Framework-owned surface classes cover modal groups, modal section headings and bodies, modal footers, overlay hosts, drawers, slideouts, main-screen internal panels, chips, dividers, focus states, and dense row/list action clusters. Modules should use those shared classes for shell structure and theme behavior while keeping record fields, picker bodies, validation, save payloads, permissions, and business meaning module-owned.

Use `LongtailForge.overlayHost.create({ host })` for small module-owned panels opened from compact row actions or other non-modal utility controls. The overlay host owns placement, Escape/click-away handling, focus handling, responsive bottom-sheet behavior, and one-open-overlay state; the module or framework service still owns picker/upload content and persistence. Converted add/edit modal utilities that open substantial picker or upload content, such as Tags and Files, should use stacked child dialogs through `LongtailForge.view.showModal()` / `closeModal()` so the parent editor body does not grow or shift.

Use `LongtailForge.view.showModal()` and `LongtailForge.view.closeModal()` for converted add/edit dialogs that may open stacked secondary dialogs above the parent editor. The framework owns parent/child stack guardrails and safe child closure; the module owns staged state, validation, save payloads, and the secondary dialog body.

For manifest-declared modal forms, set `size: "wide"` when the workflow needs the framework wide shell, and use descriptor field `width` hints (`narrow`, `compact`, `wide`, or `full`) for field placement. Do not replace those contracts with a module-owned modal `max-width` or fixed multi-column form grid.

Use `.surface-main-panel` for main-screen filters, bulk toolbars, settings groups, notification/timer panels, and contextual work panels. Use `.surface-dense-actions` for row-local action clusters instead of reusing modal footer classes. Drawer and slideout shells are available for future side panels and become full-screen overlays on narrow screens.

## View-Building Helpers

Use `docs/view-building-contract.md` before adopting or extending `LongtailForge.view`. The view-building helper layer is for common DOM anatomy: page headers, status messages, empty states, filter panels, collapsible selector/index panels, split list/detail workspaces, data tables with overflow wrappers, detail headers, metadata/badge rows, action strips, summary panels, modal shells/forms/footers, field grids, and inline item/action rows.

Keep helper usage boring and behavior-preserving. Helpers may create accessible DOM nodes, apply framework surface classes, wire button types and labels, and return elements for module callbacks. Modules still own data loading, state, validation, API calls, save payloads, route permissions, labels, and record-specific workflow behavior. Do not move module storage rules, permission rules, or save semantics into `LongtailForge.view`.

Before converting a module view, identify which pieces are framework-owned anatomy and which pieces are module-owned behavior. Convert the shell, filters, tables, detail headers, field grids, modal shells, modal footers, and action rows through helpers where they fit, then keep existing module services, routes, payload readers, permission checks, and workflow labels in the module file.

Do not call `document.createElement("dialog")` directly in converted surfaces when `createModal` or `createModalForm` fits. Do not overwrite helper-built modal footer/action classes with one-off class strings, and do not add hard-coded light backgrounds or non-wrapping action rows to converted helper-owned structures. If a surface still needs custom behavior, leave that surface explicitly unconverted until a later roadmap slice can name and test the custom boundary.

For manifest-driven protected views, read `docs/declarative-view-surfaces.md` before adding or tightening a `viewSurfaces` descriptor. Declarative surfaces move framework-owned anatomy into manifest data and renderer helpers, while module adapters keep behavior handlers, validation, payload construction, permissions, and workflow calls. As of 0.33.5.18.15, strict declarative guardrails enforce `lists.workspace`, `notes.workspace`, `tasks.workspace`, `files.browse`, `client-projects.clients`, and `client-projects.projects`. Tags management and Developer Example descriptors remain reported descriptor proofs. Reporting now uses its separate catalog-driven narrow framework host rather than `viewSurfaces`, with its strict inventory/closeout guardrails assigned to 0.33.12.7; Admin/Settings, pagination/server-side paging, Inspector behavior, and unrelated non-view workflow changes remain deferred until a later roadmap slice explicitly converts or changes them.

## Shared Icon And Action Controls

Use `window.LongtailForge.icons` for common action icons and compact action buttons. The shared helper is framework-owned, uses a local Lucide-derived inline SVG subset, and renders by stable semantic names such as `add`, `edit`, `archive`, `restore`, `delete`, `start`, `pause`, `save`, `close`, `copy`, `refresh`, `more`, `link`, `eye`, `list`, and `list-checks`.

Modules may use `createIcon`, `createIconButton`, or `decorateButton` for common actions, but module behavior, permission checks, API calls, and confirmation flows should remain in the owning module. Icon-only controls need an accessible label, and destructive controls should pass the danger variant or keep the existing `danger-button` class.

Do not ship duplicate icon registries for common app actions. Module-specific icons may be added later through a documented extension point; until then, add common icons to the shared registry instead of loading remote icon fonts, CDN icon scripts, or module-local copies.

## Cross-screen Dialog Actions

Use `window.LongtailForge.moduleActions.register()` when a module needs an add/edit dialog that can open from another framework-owned surface such as Workbench. The framework owns action discovery, availability checks, dispatch, focus return, and completion callbacks. The module owns the dialog markup, form state, validation, API calls, save/reset behavior, and record-specific permission handling. Action dispatch is callback-only: do not register page URLs for embedded frames, and do not make framework code import module-specific form internals.

Dialog-backed actions should register metadata plus an opener callback:

```js
window.LongtailForge.moduleActions.register({
  actionId: "example-work.add",
  moduleId: "example-work",
  recordType: "example-work-item",
  mode: "add",
  label: "Add Example Work",
  requiredModules: ["example-work"],
  requiredPermissions: ["example.create"],
  requiredWorkspaceCapabilities: ["projects"],
  open: async (params, hostContext) => {
    // Render a module-owned dialog, save through module-owned APIs, then call:
    hostContext.complete({ recordId: "created-record-id" });
  },
});
```

Use `canOpen(params, hostContext)` for module-specific checks that cannot be described by module state or workspace capability metadata alone. Call `hostContext.cancel()` when the user cancels and `hostContext.setStatus(message, { isError })` to hand status text back to the host.

Do not use this contract for settings or setting modals. Those stay in their settings pages and menus.

The current registry is browser-side. Future manifest metadata may describe action labels, record types, permissions, modules, and workspace capabilities declaratively, but opener functions should remain module-owned browser code rather than framework imports of module form internals.

## Database Access

As of 0.33.5.28.2, module database code starts from the completed agnostic contract. Import database access from `src/core/database.js`, bind values with named params through `db.query(...)`, `db.get(...)`, `db.run(...)`, and `db.transaction(callback)`, and keep table names, column names, conflict targets, operators, sort clauses, and SQL fragments static or explicitly allowlisted.

Do not call `sqlText()`, `sqlInteger()`, `sqlNullableText()`, or `sqlNullableInteger()` from new module runtime code. Do not hardcode raw SQLite dialect at application call sites when a `db.dialect` seam owns the operation. Conflict writes, case-insensitive comparison/order, booleans, timestamp math, search/FTS, JSON access, returned rows/identity, physical identity, and PRAGMA/introspection should go through `db.dialect` or provider-owned framework services.

Browser scripts, view descriptors, and module adapters must not become database access layers. Keep canonical filtering, paging, permission pruning, readable-label shaping, and persistence in server-side routes, services, and repositories.

## Migrations

Set `migrationsDir` only when the module owns database migrations. Keep example modules migration-free unless the example specifically needs schema behavior. Core migrations still run before module migrations.

## Events And Hooks

Declare event metadata in `eventTypes`. Subscribe to internal events through `hooks.events`.

Internal events are server-side only. Hook failures are logged and reported by dispatch results, but they do not interrupt the save that emitted the event.

Lifecycle hooks remain direct functions such as `hooks.onModuleEnabled` and `hooks.onModuleDisabled`.

## Enable And Disable

Use `modulesService.setModuleStatus` for module state changes. Do not update `workspace_modules` directly.

Disabling a module hides normal navigation and blocks normal browser/public API writes. Disabled modules may keep historical reads only when `historicalReadAccess` allows it.

As of 0.33.20.2, `workspace_modules` rows are created by the startup and workspace-creation lifecycle, and module status reads (`readModuleStatus`, `readWorkspaceModuleContext`, `readEnabledModuleIds`) are pure reads served through a per-workspace in-memory context cache. The cache fingerprints the status rows on every read, so `setModuleStatus` and even direct row changes from another process are observed immediately; test fixtures that write `workspace_modules` directly keep working, but product code must still go through `setModuleStatus`.

## Framework Notifications

Notifications are framework-owned. Modules may declare notification metadata in `notificationEvents`, `notificationTemplates`, and `notificationFollowTargets`, but modules should not create duplicate notification UI. Follow targets describe which module records a user may subscribe to individually; the framework owns subscription storage, APIs, permission checks, and delivery expansion. Notification-producing internal events are queued as durable jobs: modules emit the internal event, the framework stores a `notification.event` job, and the worker resolves recipients and creates notification records through the notification service. Modules should not bypass this by writing notification records directly during normal event fan-out. As of 0.33.5.20.5, `GET /api/notifications` is a bounded recipient read with status/module/event/priority filtering, stable created-at ordering, server-owned module filter options, permission-checked recipient scope, and next-cursor metadata.

## Durable Background Jobs

Long-running, time-sensitive, or retryable side effects should use the framework job runner instead of module-owned timers or ad hoc background loops. Search indexing side effects queue `search.index` jobs, notification fan-out queues `notification.event` jobs, and Tasks owns `task.reminder` and `task.recurrence` job producers while Files owns the `file.scan` handler. As of 0.33.5.21.7.2, task reminder producers only pre-enqueue occurrences inside the documented 30-day scheduling horizon, and the durable `task.reminder` sweep tops up existing active due-dated tasks every 12 hours through the jobs table. As of 0.33.5.21.8, fired task reminders deliver in-app notifications through `task.due_soon`, with the reminder job passing assignees or the unassigned task creator as explicit responsible recipients while followers remain additive through notification subscriptions. As of 0.33.5.21.7.1, Files upload requests queue `file.scan` and leave the attachment pending/unavailable until the worker completes scanning. `import.future` is a reserved framework job type for later import producers.

As of 0.33.5.21.7.3, job handlers must be safe for normal at-least-once worker behavior. A handler should re-read current state before side effects, skip stale work, use active dedupe keys for replaceable pending/running/failed work, and make irreversible side effects idempotent when a retry can repeat them. Current examples are `search.index` canonical upsert/delete work, `notification.event` deterministic recipient notification IDs for delivery-keyed fan-out, `task.reminder` stable reminder delivery keys, `task.recurrence` existing-instance checks, `file.scan` pending-row checks, and the reserved no-op `import.future` handler.

As of 0.33.5.21.7.4, completed and dead-letter job rows are bounded history, not durable module state. Framework startup maintenance prunes old `completed` and `dead` rows according to runtime retention windows while preserving active `pending`, `running`, and `failed` work. Module producers should keep dedupe and idempotency decisions in active jobs or owner records rather than requiring completed/dead history to exist forever.

Job handlers should stay close to the owner of the business meaning. A module service may queue work after a successful mutation, but the handler should re-read current state, skip stale work, and rely on durable runner retries for transient failures. Do not create module-specific worker loops, direct notification writes, direct search table writes, or scanner/import flows that bypass the `jobs` table.

Notification summaries should use safe event summary helpers rather than raw event or audit JSON.

## Tags And Search

Tags are framework-owned classification metadata. Modules declare taggable records in `taggableTypes`; each descriptor identifies the target type, owning module, ID field, display label field, workspace field, optional client/project fields, and required read/tag permissions. Do not add module-owned tag tables or comma-separated tag text columns.

Use the tag service for all record tag reads and writes. Record list/read flows should call `decorateRecordsForTarget()` or `decorateRecordsWithEffectiveTags()` so browser payloads include `directTags`, `propagatedTags`, `effectiveTags`, and the compatibility `tags` array. Save flows should call `replaceAssignments()` only with direct/manual tag IDs from the shared picker; propagated and system tags are read-only context on that record. Simple "No Tags" filters should pass the shared no-effective-tags sentinel through `filterRecordsByTags()` instead of hand-filtering module data.

Modules that participate in tag propagation declare `tagPropagation` descriptors and register relationship resolvers by stable ID. Let the tag service handle materialization, suppression, repair, and event emission. Consuming modules should request refreshes around stable relationship changes, but should not copy parent tags themselves or treat tags as permissions, visibility, billing, workflow, or archive state.

Search is framework-owned. Modules may provide `searchableTypes` descriptors with record fields, required read permission, and a stable string `indexer` ID that the framework search indexer registry resolves internally. Required fields are `recordType`, `moduleId`, `idField`, `titleField`, `summaryField`, `bodyFields`, `workspaceField`, `requiredReadPermission`, and `indexer`; `clientField`, `projectField`, tag text, visibility, record status, and source metadata are optional. Do not put direct function references in manifests, and do not build module-owned global search routes or duplicate search UI. Active searchable type lookup filters out disabled modules and unmet required modules, and active search request shaping carries each target's declared read permission. Module-owned indexers should read records through the owning module service/repository and return data that can be passed through `searchService.normalizeSearchDocument()`; they should not write directly to search tables. Search indexing side effects are queued as durable jobs: after successful create/update/archive/restore/delete flows, modules should call `searchIndexSyncService` so the framework queues a `search.index` job and the worker performs canonical `search_index` and backend FTS writes. Framework search service methods such as `indexSearchDocument()`, `removeSearchDocument()`, and `reindexSearchRecord()` remain direct persistence methods for worker handlers, focused tests, and maintenance tools, not normal module mutation side effects. Rebuild-capable indexers should also return workspace documents when called without a `recordId` in rebuild mode so framework rebuild tooling can upsert canonical rows, remove stale rows, clean up inactive module/type rows, and ask the active adapter to repair backend storage. Keep module search declarations backend-neutral: SQLite FTS and future PostgreSQL full-text syntax belong in adapters. Treat visibility, record status, and source as search metadata, not permission or workflow authority. Exact tag filters use canonical tag assignments; denormalized tag text is only for text matching/ranking. Initial first-party indexers cover Tasks, Time Entries, Clients, and Projects; browser search routes, the shared authenticated-shell search entry, and the `search.html` results page are framework-owned and return or route to permission-shaped search results, with workflow regressions covering discovery, edits, pagination, permissions, Help article search, and UI states. Public API search remains separate roadmap work.

## Markdown Rendering

Markdown rendering is framework-owned. Use `src/core/markdown/markdown.service.js` for generic Markdown rendering, plain-text extraction, excerpts, source normalization, and safe URL checks. If a module needs module-specific behavior, such as Notes wiki links or secure-note placeholders, keep that behavior in a thin module adapter over the framework service instead of adding another parser or regex renderer.

The approved syntax set is CommonMark plus explicitly supported tables, task lists, and safe underline using the `++text++` token. Raw HTML, raw underline tags, scriptable links, unsafe image sources, automatic URL linking, typographer replacements, broad extension bundles, and renderer rewrites of saved source are not part of the current contract. Saved Markdown should remain unchanged; render/search/preview output is where normalization and safety handling happen.

The framework service supports default document rendering and explicit `user-authored` rendering. Document rendering keeps CommonMark soft-line behavior for repo-authored Help and future documentation-style content. Notes is the reference module for user-authored Markdown and opts into `user-authored` rendering so single newlines in note bodies display as visible line breaks in both saved reads and draft preview without rewriting stored Markdown.

Editable-content contributions must follow [editable-content-safety.md](editable-content-safety.md): declare the source format, input ceiling, writer/reader permission scope, and output sink; default browser output to `textContent`; and reserve HTML sinks for explicitly named server-rendered safe-HTML fields. New editable renderers, URL schemes, or HTML sinks require cross-role hostile-input coverage and an update to the frozen sink inventory. Public-demo reset is recovery depth, never permission to relax this contract.

`src/modules/notes/markdown.js` validates unsafe note input, preserves wiki-link handling, and delegates safe rendering/plain text/excerpts to the framework service. Saved Notes detail reads expose `body_html`, while draft preview uses the protected `POST /api/notes/preview` route so browser preview stays aligned with saved rendering. The browser editor remains a textarea with authoring helpers in `public/js/shared/notes-editor.js`; do not replace it with WYSIWYG behavior unless a later roadmap version explicitly changes that product decision.

Help is the reference framework-owned Markdown content consumer. Repo-authored Help files live under `help/`, article detail payloads include Markdown source fields plus safe rendered HTML fields, and Help search text comes from the shared Markdown plain-text path. Future Knowledge Base articles should consume the same service while keeping publication status, review workflow, source snapshots, and visibility rules inside the Knowledge Base module.

Files are framework-owned. Modules that can receive attachments should declare `attachableTypes` with the target type, owning module, table and field metadata, workspace/client/project fields where relevant, required read/attach/remove permissions, allowed file categories, allowed visibility values, and optional file lifecycle subscriptions. Do not create module-owned file metadata tables, direct static download routes, local storage paths, scan/quarantine state, upload routes, report flows, or download UI that bypasses `filesService`. As of the 0.32.13 closeout, the framework supplies schema, manifest validation, active target lookup, protected local storage, core file permissions, authenticated browser file routes, JSON/base64 upload handling, no-op scanner hooks for the trusted/admin-oriented upload surface, report-driven quarantine, safe download headers, audit logging, lifecycle events, a reusable `LongtailForge.fileAttachments.mount()` browser helper, framework attachment count reads, and a simple Files browse surface. As of 0.33.5.22.15, the framework exposes single-file and batch multipart upload routes for local/self-hosted mode, and the shared attachment helper uses the streamed batch route for normal browser uploads while the existing base64 compatibility routes remain available through the 0.33.5.22 storage/scanner branch and are retired no earlier than 0.33.5.23.0 by a later explicit roadmap slice. Both transports still create the normal pending file row, queue `file.scan`, and attach through `filesService`, so modules should treat them as byte transports for the same Files lifecycle rather than module-owned upload workflows. Streamed upload cancellation, parser, storage, and size-limit failures should not leave active file records, attachments, or usable partial local files. As of 0.33.5.25.2, workspace and per-user storage quotas are also service-owned: `filesService` enforces `internal_storage_limit_bytes` and `per_user_storage_limit_bytes` for buffered and streamed uploads, treats `NULL` as unlimited, and rejects over-quota uploads without active file rows, attachments, or usable partial local files. As of 0.33.5.25.3, streamed upload signature validation and download/preview metadata pre-checks are also service-owned: wrong-type streamed content can fail during the stream before storage commit where practical, rejected-upload cleanup is awaited/logged, and missing stored objects return clean 404 responses before download or preview routes start streaming. As of 0.33.5.25.4, multipart batch uploads keep malformed file parts inside the per-file result model when the request itself remains parseable, and the storage adapter contract exposes only wired methods: `save()`, `saveStream()`, `read()`, `metadata()`, `delete()`, and `health()`. Quarantine remains a service-owned database lifecycle transition; stored-object relocation is not implemented. Storage provider selection is Files-owned: `local` remains the default and only bootable provider in 0.33.5.25.1; `s3` keeps S3-compatible adapter object operations covered through a mocked client proof while real provider-client rollout stays behind the Files storage adapter boundary. Selecting `LONGTAIL_STORAGE_PROVIDER=s3` fails app and worker startup until that future client path exists. S3 diagnostics expose only provider id and safe availability in adapter tests and future client-backed paths. Normal module payloads, attachment helper payloads, lifecycle metadata, and audit metadata must not expose signed URLs, bucket names, endpoints, credential values, storage keys, raw provider responses, or protected paths. A future signed URL exception must be route-designed, permission-checked, short-expiring, and explicit in its route contract. Scanner mode selection is Files-owned: `none` completes queued `file.scan` jobs as `not_required`/`available`, `noop` is an explicit pass-through mode, `clamscan` is an optional executable scanner adapter, and `clamd` is an optional TCP scanner adapter; both ClamAV adapters quarantine infected, unavailable, or timed-out scans without exposing scanner configuration, storage paths, storage keys, or scanner output, and neither auto-deletes stored files. Module screens should pass their manifest-declared module ID, target type, target ID, optional client/project context, accepted categories, and display callbacks into the shared helper, then keep business wording and placement local to the module.

Before adding a new first-party module that consumes files, read `docs/0.32-module-file-closeout.md` and confirm the existing attachable target, shared browser helper, lifecycle event, and permission contracts cover the use case.

## Help Contributions

Help Center is framework-owned product/module documentation. Modules may declare help pages through `help.sections` and `help.articles`, but modules should not create duplicate Help Center routes, browser chrome, or search integration. The framework-owned `help.html` page and `/api/help` routes discover active module help declarations for the current workspace, alongside the baseline framework-owned Help articles. Active Help articles are indexed by the framework as `record_type = help_article` with Markdown-derived body text and `source = Help`; framework articles use `module_id = framework`, while module-authored articles keep the declaring module ID. Search rebuilds re-read Help content through the Help service, so repo-authored Markdown changes are picked up during rebuild without module-owned search writers or file watchers.

Each help section needs `id`, `moduleId`, and `title`; optional fields include `description`, `sortOrder`, `audience`, `tags`, `requiredPermissions`, `requiredWorkspaceCapabilities`, `requiredModules`, and terminology. Each article needs `id`, `moduleId`, `title`, summary or description, and either inline `body` or a safe relative Markdown `contentPath`; first-party product Help should use `contentPath` under the repo-owned `help/` tree. Optional article fields include `slug`, `sectionId`, `sortOrder`, `audience`, `tags`, `relatedArticleIds`, `requiredPermissions`, `requiredWorkspaceCapabilities`, `requiredModules`, and terminology. Disabled modules are excluded from active Help discovery, so module-authored help should not be the only place a framework-critical behavior is documented.

The visible Help navigation is authored in `help/toc.md`. Use an explicit `default: relative/article.md` directive for the first article, headings for collapsible groups, and Markdown links to article files for visible article targets. Framework article files live under `help/framework/`; first-party module article files live under `help/modules/<module-id>/`. Keep each manifest `contentPath` aligned with the Markdown file and keep article IDs/slugs stable so existing Help URLs and search rows stay stable. Valid active articles that are not listed in `toc.md` appear in fallback navigation so module Help is still discoverable without leaking disabled-module content.

The Help service renders article Markdown through the shared framework Markdown service and returns safe rendered `bodyHtml` plus `bodyHtmlFormat: "html"` on article detail payloads. Article details keep the compatibility `body` field and also return `bodyFormat: "markdown"` plus `bodyMarkdown` so callers do not have to infer or rewrite the source format. The Help browser renders server-provided HTML through an allowlisted importer and keeps its client Markdown renderer only as a fallback for older payloads. Help search rebuilds read article text through the same shared Markdown plain-text path in the Help service, so after editing Markdown content, run the Help/search regressions or `npm run check` to re-index and verify the current file-backed article bodies.

Keep Help Center content about current product/module usage. Do not put roadmap promises, in-app authoring workflows, rich embeds, raw HTML, scripts, medical or diagnostic positioning, or workspace-authored operational knowledge into manifest-declared product Help. User-authored operational articles belong to the future Knowledge Base module, not to manifest-declared product help.

## Sanity Checks

Run `npm run check` before relying on a module change. The check suite validates JavaScript syntax, storage behavior, event bus behavior, audit extensibility, registered module uniqueness, route descriptors, permissions, API scopes, notification declarations, taggable type declarations, searchable type declarations, help declarations, and dependency references.
