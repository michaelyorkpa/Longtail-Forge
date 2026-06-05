## Version 0.31.16 - 2026-06-05 01:12 -04:00

- Added manifest validation and registry normalization for module permission descriptors, role default mappings, resource definitions, and API scope descriptors.
- Added startup sync that inserts or updates module-declared permissions and adds missing default role permission rows without deleting existing grants.
- Added first-party permission/resource/API scope metadata for Clients/Projects, Tasks, Time Tracking, and Users.
- Updated API key scope discovery to read enabled-module scopes from the registry, hiding disabled optional module scopes from new API keys.
- Updated the API Keys browser UI to render scope labels/descriptions from registry metadata while keeping legacy string scopes compatible.
- Documented module permission, resource, API scope, and notification access expectations in `docs/module-contract.md`.
- Bumped the app and first-party module versions to `0.31.16`.

## Version 0.31.15 - 2026-06-05 00:52 -04:00

- Added module manifest support and validation for protected views, public view placeholders, and browser asset descriptors.
- Added module registry/service helpers for protected/public view and browser asset contributions.
- Registered first-party Tasks, Time Tracking, Clients/Projects, and User Admin protected views and module-specific browser assets.
- Updated protected HTML serving so module pages must be registered and pass module status, workspace capability, and permission checks before being served.
- Kept Dashboard, Workbench, Workspace Settings, User Settings, API Keys, Audit Log, Reporting, and legacy Organization Settings framework-owned.
- Documented module page and asset registration behavior in `docs/module-contract.md`, updated decisions, and bumped first-party module metadata to `0.31.15`.
- Bumped the app version to `0.31.15`.

## Version 0.31.14 - 2026-06-05 00:31 -04:00

- Added server-owned `moduleSettings` metadata to `/api/settings` so module settings pages can render registry-defined fields and current values.
- Added server-side module settings validation for unknown modules/settings, read-only fields, value types, select options, and missing writable handlers.
- Updated Workspace Settings, Tasks Settings, and Time Tracking Settings to render module controls from registry data instead of hard-coded first-party toggles.
- Kept workspace identity, billing, audit, reminder defaults, and user preferences separate from module-owned settings.
- Documented the registry-driven module settings contract in `docs/module-contract.md` and recorded the 0.31.14 decisions.
- Bumped the app version to `0.31.14`.

## Version 0.31.13 - 2026-06-04 23:52 -04:00

- Added authenticated `/api/app-shell/bootstrap` with app metadata, active workspace context, workspace switcher data, enabled modules, registry-driven navigation, notification placeholders, user theme/timezone basics, and permission hints.
- Added backend app-shell navigation assembly that combines framework links with enabled module navigation from the registry.
- Updated the browser app shell to render server-provided navigation while retaining the static navigation tree as a loading/fallback path.
- Preserved Dashboard, Workbench, Projects, Reporting, Settings, workspace switching, logout, and user settings behavior during the registry-driven navigation refactor.
- Documented the app-shell bootstrap navigation contract in `docs/module-contract.md`.
- Bumped the app version to `0.31.13`.

## Version 0.31.12 - 2026-06-04 17:12 -04:00

- Centralized module enable/disable state changes in `modulesService.setModuleStatus` with non-disableable module safety, dependency checks, lifecycle hook calls, and no-op handling for unchanged states.
- Added framework-level browser module write guards during route mounting and public API module write enforcement through API-key scope handling.
- Added module lifecycle hook support for enable, disable, install, update, and repair hook names in the manifest contract.
- Added forced audit records for `module.enabled`, `module.disabled`, `module.enable_failed`, and `module.disable_failed` events.
- Surfaced `canDisable` in workspace module metadata and documented lifecycle/disable behavior in `docs/module-contract.md`.
- Marked Clients/Projects and Users as non-disableable core modules while keeping Tasks and Time Tracking optional workflow modules.
- Updated first-party module metadata to version `0.31.12`.
- Bumped the app version to `0.31.12`.

## Version 0.31.11 - 2026-06-04 16:46 -04:00

- Refactored module registry behavior behind `modulesService` with module lookup, route lists, workspace-enabled module reads, contribution collection, permission lists, API scope lists, and reserved tag/search/notification list helpers.
- Added Workbench registry helpers for enabled Workbench cards, timer sources, work item sources, and source lookups, with module, capability, dependency, and permission filtering.
- Added dependency validation before enabling workspace modules so missing framework or module dependencies return clear errors.
- Updated Workbench bootstrap to include registry-collected Workbench cards, timer sources, and work item sources while preserving current normalized timer/task payloads.
- Updated Tasks and Time Tracking Workbench capability hints so registry filtering exposes their cards across supported workspace types.
- Documented the static registry versus framework-facing registry service split in `docs/module-contract.md`.
- Bumped the app version to `0.31.11`.

## Version 0.31.10 - 2026-06-04 16:26 -04:00

- Added startup module manifest validation for unique IDs, required fields, route arrays, navigation, dashboard, Workbench, timer source, work item source, settings, permissions, API scopes, reserved fields, dependencies, and unknown manifest fields.
- Formalized active and reserved module manifest fields in `docs/module-contract.md`, including Workbench cards, timer sources, work item sources, disable policy, notification ownership, and an example manifest.
- Updated first-party module manifests to the 0.31.10 contract with explicit `canDisable`, API scope, Workbench, timer source, and work item source declarations.
- Kept third-party plugin loading deferred while first-party modules follow the future manifest rules.
- Bumped the app version to `0.31.10`.

## Version 0.31.9.1 - 2026-06-04 15:13 -04:00

- Renamed Time Tracker stopwatch `Reset` actions to red `Discard` actions while keeping the 4-stopwatch limit.
- Renamed Workbench timer save actions to `Save & End`.
- Made Workbench manual timer billable state always re-inherit from the selected client/project and momentarily flash when changed.
- Made Workbench flash the newly activated timer after timer switching reorders the active timer to the top.
- Fixed repeated Workbench billable inheritance changes so the visible flash retriggers every time the inherited value changes.
- Renamed the Time Tracker stopwatch `Stop` action to `Save & End` to match Workbench wording.
- Compacted Time Tracker manual timer slots after save/discard so later timers move up instead of reopening with unused middle cards.
- Added a Workbench Tasks `Add Task` action that opens the existing Tasks page Add Task modal through `tasks.html?new=1`.
- Lifted Workbench manual timer slot limits while preserving the one-running-timer concurrency rule.
- Completed the documentation checkpoint before 0.31.10 by refreshing README current-state notes, the Table of Contents, changelog link, and documentation links.
- Bumped the app version to `0.31.9.1`.

## Version 0.31.9 - 2026-06-04 14:46 -04:00

- Added the authenticated Workbench page after Dashboard and before Projects in the primary navigation.
- Added `/api/workbench/bootstrap` to return normalized active timers, task workbench items, module state, and source metadata for the Workbench MVP.
- Added Workbench timer cards for manual and sourced timers, including source badges, quick start/pause switching, save/discard actions, and disabled-source recovery display.
- Added a Workbench task card with fast filters, sorting, task timer start/pause/finalize actions, and links into the full task detail/edit modal.
- Added a collapsible Quick Notes placeholder and persisted Workbench card collapsed/expanded state in the browser.
- Bumped the app version to `0.31.9`.

## Version 0.31.8 - 2026-06-04 14:11 -04:00

- Added unified `active_work_timers` storage for manual and sourced timers, including task source metadata.
- Migrated existing manual and task active timer rows into the unified table while leaving legacy active timer tables in place.
- Refactored task timer start, pause, reset, and finalize flows through the shared Time Tracking active timer service.
- Kept one running timer per user/workspace across manual and task timer sources, with regression coverage for switching directions.
- Labeled reserved Timer Concurrency settings as future/non-functional while 0.31.8 keeps single-running-timer behavior.
- Bumped the app version to `0.31.8`.

## Version 0.31.7 - 2026-06-04 11:03 -04:00

- Added dedicated Tasks and Time Tracking settings pages, including Tasks reminder defaults and placeholder Timer Concurrency checkboxes.
- Moved Projects Settings back under the Projects menu and renamed the menu entry to `Projects Settings`.
- Made Projects Settings bulk changes collapsible and made Tasks sorting/filtering plus bulk actions collapsible while keeping quick filters visible.
- Added persisted task billable flags inherited from project/client scope and used them for task timers and finalized task time entries.
- Fixed Time Tracker reset so confirmed resets discard timer state, and the clear-info preference clears client, project, description, and billable fields.
- Refined 0.31.7 settings navigation so Clients sits under Workspace and module settings sit under Workspace -> Modules.
- Added an explicit All quick filter to Projects -> Tasks and made opening Sorting and Filters select it automatically.
- Tightened Projects Settings spacing, made Bulk Changes open automatically when projects are selected, and repaired the Server Maintenance task/time-entry billable data.
- Captured 0.31.x roadmap clarifications for unified timer storage, Workbench page MVP wiring, reserved manifest fields, documentation checkpoint naming, and disabled-source timer recovery.
- Bumped the app version to `0.31.7`.

## Version 0.31.6 - 2026-06-03 18:31 -04:00

- Added public `/api/v1/tasks` read, create, update, complete, reopen, archive, and restore endpoints with `tasks:read` and `tasks:write` API key scopes.
- Added task-linked reporting filters so finalized task timer time entries can be isolated by `task_id`.
- Updated public API, module contract, and permissions matrix documentation for the completed 0.31 Tasks branch.
- Extended permission regression coverage for task API scopes, disabled Tasks public API behavior, task endpoint metadata, and task-linked reporting.
- Ran the final 0.31 review pass across task permissions, module boundaries, timezone handling, recurrence, and timer linkage.
- Bumped the app version to `0.31.6`.

## Version 0.31.5 - 2026-06-03 17:17 -04:00

- Added `active_task_timers` persistence with one task timer per user per task and server-side project/client context capture.
- Added Task Timers as a separate Tasks module sub-option in Workspace Settings, gated by both Tasks and Time Tracking availability.
- Added task timer start, pause, reset, and finalize endpoints plus task detail modal stopwatch controls for eligible project-linked tasks.
- Made task timers and normal Time Tracking timers mutually exclusive by pausing the other timer type when one starts running.
- Saved finalized task timer time into `time_entries` with the task title as the description and `task_id` preserved for future reporting.
- Blocked task completion while any active task timer record remains for that task.
- Extended permission regression coverage for task timer gating, mutual exclusion, completion blocking, and finalized task time-entry links.
- Bumped the app version to `0.31.5`.

## Version 0.31.4 - 2026-06-03 16:51 -04:00

- Added a scoped task calendar window helper and browser API payload for due-date-backed calendar integrations.
- Expanded Dashboard task output into overdue, due-soon, and assigned-to-me sections with direct links into task detail.
- Added renderer/link metadata to the Tasks dashboard module contract so future dashboard sections can consume task summaries without page-specific coupling.
- Kept the full calendar UI deferred to 0.34.0 while exposing the task payload needed by that future surface.
- Extended permission regression coverage for task calendar scope filtering and Dashboard task links.
- Bumped the app version to `0.31.4`.

## Version 0.31.3 - 2026-06-03 16:36 -04:00

- Added task recurrence templates with workspace/client/project scope, assignment defaults, due pattern metadata, RRULE storage, optional end dates, and active/paused status.
- Linked recurring task instances back to their template and added completion behavior that creates the next instance while preventing duplicate retry creation.
- Added recurrence audit events for template create/update and generated task instances.
- Added recurring task controls to the task modal, including a separate recurrence settings dialog and current-instance versus all-future edit prompts.
- Extended permission regression coverage for scoped recurring task creation, completion, and duplicate protection.
- Bumped the app version to `0.31.3`.

## Version 0.31.2 - 2026-06-03 16:02 -04:00

- Added normalized task reminder offset storage with workspace, client, project, and task scopes.
- Added reminder inheritance for Business workspaces through Workspace -> Client -> Project -> Task and Personal/Family workspaces through Workspace -> Project -> Task.
- Added Workspace Settings reminder defaults, client/project reminder default controls, and task-level reminder override controls.
- Added computed pending reminder occurrence helpers for future notification delivery without requiring every-minute scheduler behavior in 0.31.2.
- Updated due-date handling so date-only tasks remain date-only, timed task display uses the session timezone, and date-only overdue logic waits until the local day has passed.
- Bumped the app version to `0.31.2`.

## Version 0.31.1 - 2026-06-03 15:25 -04:00

- Added saved Tasks sort preferences, quick filters for common task views, and active-default list behavior that keeps completed and archived tasks readable but out of the default view.
- Added task bulk actions for status, priority, assignee add/remove, and archive using server-side task permissions for each selected task.
- Added copyable task detail links, stronger Tasks page smoke helpers, completed/archived row styling, and dashboard task counts for overdue, due-soon, and assigned-to-me work.
- Added readable task audit summaries in Audit Log detail views while keeping raw task JSON available on demand.
- Bumped the app version to `0.31.1`.

## Version 0.31.0 - 2026-06-03 13:56 -04:00

- Added the first-party Tasks module with module metadata, navigation, Workspace Settings enablement, protected Tasks page, and browser `/api/tasks` routes.
- Added task persistence with workspace/client/project scope links, multiple concrete user assignees, fixed priority/status values, due date/time handling, archive/restore, and future source-link fields.
- Added task permissions, role mappings, assignment eligibility checks, module-disabled write protection, and audit events for task lifecycle changes.
- Updated the permissions matrix and permission regression harness for task visibility, creation, assignment, completion, archive/restore, module toggles, and Personal/Family client-scope denial.
- Fixed the Tasks Add/Edit modal so workspace-project task scopes use the active workspace name and assignee labels show display name plus email address.
- Replaced generic workspace-project labels across the app with active workspace labels such as `Raymond Tec Projects`.
- Bumped the app version to `0.31.0`.

## Version 0.30.17 - 2026-06-03 11:42 -04:00

- Enforced Business-only client access in browser and public APIs while keeping workspace projects available for Personal and Family workspaces.
- Made scoped role assignment work for Client Administrators and Project Administrators inside their assigned scope.
- Kept user lifecycle management workspace-level only and repaired the seeded permission contracts accordingly.
- Fixed scoped admin time-entry list visibility for team entries inside assigned scopes.
- Added explicit `reporting.view` enforcement for reporting and dashboard reads.
- Replaced the permissions matrix with a workspace-native 0.30.17 matrix and expanded permission regression coverage to 108 checks.
- Bumped the app version to `0.30.17`.

## Version 0.30.16.1 - 2026-06-03 07:48 -04:00

- Added the workspace-native storage migration that promotes `workspaces`, `workspace_settings`, `workspace_modules`, and `workspace_id` keyed app tables to the active schema.
- Migrated runtime sessions, settings, permissions, audit logs, API keys, clients/projects, time entries, active timers, public API context, and browser payloads to workspace-first contracts.
- Replaced workspace compatibility role and permission identifiers with `workspace_admin`, `workspace` scope, and `workspace_settings.manage`.
- Replaced the storage alias regression with a workspace-native storage regression and updated the permission regression harness.
- Renamed the Workspace Settings browser controller to `workspace-settings.js` and removed browser-side organization aliases.
- Fixed Time Tracker and Manual Entry selectors so inactive clients and inactive projects are not offered for new time work.
- Bumped the app version to `0.30.16.1`.

## Version 0.30.16 - 2026-06-02 23:54 -04:00

- Moved Projects settings navigation back under Settings, added the top-right Add Project action, and labeled the Projects settings filters and bulk-change controls.
- Updated the User Admin edit modal so Configure Permissions sits above Add Role, Add Role is centered, and current roles live in a Current Assignments box.
- Closed previously opened navigation menus when a new peer menu opens and refreshed theme mode from session data after login/session bootstrap.
- Added audit-log client/project filters, clickable client/project/record-type cells, truncation titles, and IP address storage/export/detail support.
- Added session IP capture so login, logout, and later audit entries can include the user IP address.
- Updated confirmed project moves to rewrite associated time-entry client/project labels and reject unconfirmed downstream updates.
- Kept inactive/archived clients out of project reassignment controls while retaining server-side rejection for archived parent assignments.
- Fixed workspace creation so it no longer inserts duplicate owner rows into `users`, added startup repair for existing duplicate `user_id` rows, and made user/session settings read the canonical user through workspace memberships.
- Fixed Projects Settings navigation visibility for Personal and Family workspaces by treating project tools separately from business client tools.
- Added an Audit Log "All workspaces" filter and made login/logout entries visible through every active workspace membership for the actor.
- Bumped the app version to `0.30.16`.

## Version 0.30.15 - 2026-06-02 23:27 -04:00

- Added nullable `parent_client_id` and `parent_project_id` hierarchy fields with workspace/parent indexes.
- Added server-side validation for client/project self-parenting, descendant cycles, workspace scope, and project parent/client compatibility.
- Added parent selectors and indented tree labels for client and project editors, filters, and reporting project options.
- Updated reporting summaries to include descendant clients/projects by default, with a direct-only toggle.
- Added audit metadata for parent moves and expanded permission regression coverage for nesting rules.
- Fixed Clients Settings rendering by loading the shared page controller script and corrected parent selector wiring for client saves.
- Fixed Add Project parent-project options so the list populates for the default selected client/workspace scope when the modal opens.
- Fixed new-project parent option filtering so root projects are not mistaken for descendants of an unsaved project.
- Prevented inactive/archived clients and projects from appearing as parent options, and added server-side rejection for archived parent assignments.
- Bumped the app version to `0.30.15`.

## Version 0.30.14 - 2026-06-02 17:38 -04:00

- Documented the storage rename compatibility plan, including the remaining `organization_id` inventory, final migration order, alias retention rules, and legacy removal gate.
- Added `scripts/storage-alias-regression.mjs` and wired it into `npm run check` so legacy organization fields and workspace aliases stay synchronized during the compatibility phase.
- Updated workspace settings saves to write both `organizations`/`organization_settings` and `workspaces`/`workspace_settings`.
- Updated public API compatibility notes and release metadata for 0.30.14.

## Version 0.30.13 - 2026-06-02 17:11 -04:00

- Added app-level workspace creation settings tables for install-wide defaults and per-user workspace creation overrides.
- Added workspace owner transfer rules that pick the oldest active Workspace Administrator membership and block owner removal when no replacement administrator exists.
- Added Personal workspace fallback creation when membership changes leave a user with no active workspace.
- Updated user and session active-workspace repair so affected users do not point at a removed workspace membership.
- Extended the permission regression harness to cover owner transfer, owner-removal blocking, and no-workspace Personal fallback behavior.
- Bumped the app version to `0.30.13`.

## Version 0.30.12 - 2026-06-02 15:58 -04:00

- Added authenticated Reporting and Dashboard API routes backed by `reportingService`.
- Moved project/time/billing aggregation out of the Reporting and Dashboard browser controllers.
- Made Reporting workspace-type aware so personal and family workspaces default to workspace projects and hide business client scope filters.
- Converted Dashboard into a module-aware project/workspace hub while preserving Time Tracking current-month billable and chart widgets.
- Added reporting/dashboard extension metadata so future modules can contribute panels without raw page-script coupling.
- Fixed authenticated navigation so the lighter session workspace bootstrap cannot hide Time Tracking links after `/api/settings` exposes module navigation metadata.
- Added startup repair for literal `[REDACTED]` seed usernames, replacing the placeholder with the configured super admin username without editing checksum-tracked migration history.
- Bumped the app version to `0.30.12`.

## Version 0.30.11 - 2026-06-02 15:13 -04:00

- Added `public/js/shared/page-controller.js` with shared option, status, sorting, controller registration, and smoke-test helpers under `window.LongtailForge.pageController`.
- Registered Clients/Projects, Time Tracker, User Admin, and Edit Entries page controllers under `window.LongtailForge.controllers`.
- Added browser-console smoke and snapshot helpers for the four large frontend controllers.
- Updated the relevant protected pages to load the shared page-controller helper directly without adding a frontend build step.
- Bumped the app version to `0.30.11`.

## Version 0.30.10 - 2026-06-02 15:03 -04:00

- Formalized Projects as framework core and Clients as optional business context in roadmap and decisions.
- Added shared record-scope helpers for workspace/client/project validation and archived-state checks.
- Added a project update planner that centralizes move planning and downstream record behavior.
- Blocked archived clients from receiving new projects or project moves and blocked archived projects from receiving time entries or active timers while preserving read access.
- Added workspace owner lifecycle protection so owners cannot be deactivated or deleted before ownership transfer exists.
- Updated Reporting language to separate workspace project reporting scopes from client-linked project scopes.
- Extended the permission regression harness to cover archived downstream behavior and workspace owner lifecycle protection.
- Bumped the app version to `0.30.10`.

## Version 0.30.9 - 2026-06-02 14:14 -04:00

- Moved Time Tracking public API routes and service logic for `/api/v1/time-entries` into the Time Tracking module.
- Added module public API route mounting so module-owned public API paths load before browser session authentication.
- Documented Time Tracking module ownership and framework dependencies in `docs/time-tracking-module.md`.
- Updated navigation, Dashboard, and Workspace Settings to consume module metadata for Time Tracking links, dashboard panels, and module settings.
- Updated public API docs to list endpoints by module.
- Extended module-level smoke coverage for Time Tracking metadata, disabled historical reads, and disabled browser/public API write blocking.
- Bumped the app version to `0.30.9`.

## Version 0.30.8 - 2026-06-02 13:57 -04:00

- Added `docs/module-contract.md` to define the module metadata, route, asset, migration, hook, navigation, dashboard, permission, and workspace capability contract.
- Expanded existing module definitions with display names, public API placeholders, historical read policy, seed/repair hooks, navigation/dashboard contributions, required permissions, and workspace capability requirements.
- Added shared module access helpers and moved Time Tracking write enforcement onto the reusable module write guard.
- Moved workspace module decoration into `modulesService` so settings/bootstrap responses use shared framework module metadata.
- Extended the permission regression harness to verify disabled Time Tracking keeps historical reads but blocks time-entry and active-timer writes.
- Bumped the app version to `0.30.8`.

## Version 0.30.7 - 2026-06-02 13:39 -04:00

- Added a lightweight permission regression harness with fixtures for workspace admin, client admin, project admin, client user, project user, and external client user roles.
- Covered unauthenticated browser/API guards, API-key failure modes, mutation permissions, active timers, user administration, role assignments, workspace settings, and ownership/scope regressions.
- Added `LONGTAIL_DATABASE_FILE` for isolated test database runs and wired `npm run test:permissions`.
- Hardened role assignment updates so client/project scope IDs must belong to the active workspace.
- Bumped the app version to `0.30.7`.

## Version 0.30.6 - 2026-06-02 12:52 -04:00

- Completed the comprehensive code review pass and captured private findings plus drag-and-drop 0.30.7+ roadmap drafts in ignored `CODEREVIEW.md`.
- Archived completed roadmap sections into ignored `ROADMAP-ARCHIVE.md`, leaving `ROADMAP.md` focused on active and future work.
- Added `CODEREVIEW.md` and `ROADMAP-ARCHIVE.md` to `.gitignore`.
- Fixed time-entry ownership hardening so browser updates and public API creates cannot spoof `user_id`.
- Fixed project update authorization so source project scope is checked before any requested target-scope move.
- Bumped the app version to `0.30.6`.

## Version 0.30.5.6

- Reworked navigation so Reporting has a Time Reports submenu, Projects owns Time Keeping and Tasks, and Settings nests workspace administration links.
- Added permanent timer status labels for Unused, Active, and Paused states.
- Added hover titles to dashboard bar chart values.
- Reworked User Settings into two columns and moved section actions inside their fieldsets.
- Enforced duplicate workspace-name rejection in User Settings and the workspace creation API.
- Advanced workspace name suggestions to the next available per-user value and kept duplicate workspace checks scoped to the signed-in user's own workspace list.
- Added scoped duplicate project-name enforcement for workspace projects and business client projects, with clearer Projects page error messages.
- Tightened User Admin workspace membership visibility and labels, including owner email display for personal/family workspaces and a scrollable three-column membership list.
- Made Edit Entries project filtering available before a business client is selected.
- Persisted each user's last active workspace and restored it on login when the membership is still active.

## Version 0.30.5.5

- Added cached workspace bootstrap context from login/session/settings so workspace-dependent navigation and controls can draw with less first-paint flicker.
- Hid business client selectors from Time Tracker, Create Manual Entry, and Edit Entries for personal/family workspaces while preserving workspace-project selection.
- Renamed the Time Tracker checkbox to `Clear Info when Stopped/Reset` and limited it to the checked timer's elapsed-time clearing behavior.
- Replaced the active-timer browser unload warning with a red centered `Active` indicator above each running timer title.
- Added an explicit `Show UTC` Audit Log switch and a Super Admin-only workspace filter that also applies to filtered exports.
- Replaced the Edit Entry form UUID heading with a friendly project/date label.
- Moved `Log Out` to the bottom of the Settings menu.

## Version 0.30.5.4

- Widened User Settings to match the broader settings pages.
- Fixed Create Workspace name suggestions so changing the workspace type updates the generated name until the user enters a custom name.
- Added a User Settings removal modal for removing non-current workspace memberships from the signed-in user's workspace list.

## Version 0.30.5.3

- Added Audit Log pagination with Previous/Next controls and visible row-count status.
- Added a page-size selector beside Export All that defaults to 50 rows and supports 25, 50, 100, 250, and 500 rows per page.
- Kept audit filter dropdowns populated from the full workspace audit history while table rows load page-by-page.

## Version 0.30.5.2

- Widened Workspace Settings to match the broader settings/editor pages.
- Reworked Workspace Settings into two columns with Modules and Audit Log on the left and Fiscal Year and Billing Settings on the right.
- Condensed personal and family workspace billing settings to rounding-only controls.
- Added a Workspace Users modal with Edit Permissions shortcuts into User Admin.
- Added Time Tracking module toggles to workspace creation and Workspace Settings.
- Threaded Time Tracking module status through `/api/settings`, navigation visibility, and time-entry/active-timer mutation guards so disabled timekeeping keeps existing entries readable but immutable.

## Version 0.30.5.1

- Reworked the Projects page top controls so client and status filters sit side-by-side above inline bulk dropdowns.
- Moved Add Project into a centered top-list button and modal instead of an inline `Add Workspace Project` panel.
- Tightened Add Project modal layout so the name/status fields sit under the heading, billing settings stay intact, and Add/Cancel actions are centered together.
- Added a business-workspace Client selector to the Add Project modal, with Status left-aligned and an Add Client shortcut that opens the Clients page add-client modal.
- Adjusted project details so Client and Status sit side-by-side with Client first.
- Added an Add Client shortcut inside project details between the Client/Status row and Project Billing Settings.
- Made client detail Edit Projects links open the Projects page with that client preselected in the client filter.
- Reworked Projects into a checkbox table with inline bulk Status/Client/Billable dropdowns and modal-based project detail editing.
- Reworked Clients into a checkbox table with inline bulk Status/Billable dropdowns and modal-based client detail editing.
- Removed the standalone project Bulk Edit trigger after moving bulk project actions back onto the main Projects page.
- Added Edit Client and Add Client shortcuts to the project detail modal, and made client-detail URLs open the matching client editor modal.
- Updated protected page titles to use the active module and workspace name format.
- Hid client controls from personal and family workspaces while keeping status filtering available.
- Enforced personal workspaces as owner-only spaces in user creation and workspace membership assignment flows, including Super Admin assignment paths.
- Added startup repair to deactivate non-owner active memberships in existing personal workspaces.
- Simplified personal and family project billing to force non-billable projects, hide billing rate/period controls, and keep project-level rounding.
- Updated project rounding inheritance so workspace projects inherit workspace rounding while client-linked projects inherit client rounding.

## Version 0.30.5

- Scoped API key reads, revocation, authentication, and public API sessions to the key's workspace while keeping legacy organization fields backward-compatible.
- Added `workspace_id` to public API response envelopes and API key admin responses.
- Added workspace context to public API time-entry audit metadata and API key create/revoke audit metadata.
- Updated public API documentation for workspace-scoped API keys, workspace response envelopes, and compatibility expectations.
- Completed the 0.30.5 workspace behavior verification pass for API key scoping, public API workspace isolation, migrated data visibility, project-first time entries, and release checks.

## Version 0.30.4

- Added User Settings workspace creation with install-mode/type-limit rules for personal, family, and business workspace options.
- Added a workspace creation API that creates compatibility `organizations` and new `workspaces` records, settings rows, owner membership, owner role assignment, and module defaults.
- Added the `workspaces` and `workspace_settings` compatibility tables with backfills from existing organization records/settings.
- Added `workspace_id` compatibility columns/backfills and lookup indexes for projects, time entries, audit logs, API keys, role assignments, and workspace modules.
- Updated the app shell workspace selector to show the active workspace and hide unavailable navigation actions based on workspace capabilities.
- Updated package metadata, roadmap, decisions, and README bookkeeping for the 0.30.4 release.

## Version 0.30.3

- Added active workspace session storage, membership-backed session responses, and a workspace switch endpoint/UI that rejects unauthorized workspace changes.
- Scoped existing workspace reads and permission checks through the active workspace while preserving compatibility `organization_id` storage names.
- Exposed workspace memberships in User Admin and kept role/permission editing focused on the selected active workspace.
- Added assignable workspace membership controls to User Admin, allowing protected Super Admins to assign users to available workspaces while workspace admins remain limited to the active workspace.
- Added initial workspace-role assignment during user creation and workspace-type role limits for family/personal workspaces.
- Made project and time-entry client links nullable with a migration that preserves existing client/project relationships.
- Converted the Projects page to a flat workspace project list with client and status filters plus optional client assignment per project.
- Added a client `workspace_id` compatibility alias/backfill and disabled client-centric UI by default for personal and family workspaces.
- Added project multi-select bulk controls for status, client assignment, and billable state.
- Added workspace-level project creation/read support and updated Manual Entry, Time Tracker, Edit Entries, Reporting, and the public API to require projects while allowing clientless time entries.
- Bumped package metadata and roadmap/decision/API docs for the 0.30.3 release.

## Version 0.30.2

- Added `workspace_type` to the existing workspace-compatible `organizations` table with `business`, `personal`, and `family` support.
- Added workspace capability metadata for business, personal, and family tool availability and permission models.
- Exposed `workspaceType` and `workspaceCapabilities` from `/api/settings`.
- Added a Workspace Type selector to Workspace Settings.
- Enforced initial user-add rules so personal workspaces cannot add users and family workspaces are limited to 20 active users.
- Bumped package metadata and roadmap/decision bookkeeping for the 0.30.2 release.

## Version 0.30.1

- Added the `user_workspaces` membership table with app-level user IDs, workspace IDs, status, and timestamps.
- Added `owner_user_id` to the existing workspace-compatible `organizations` table.
- Backfilled existing users into workspace memberships and added startup repair so seeded users receive membership and workspaces receive an owner.
- Updated user creation, deactivation, reactivation, and deletion to keep workspace membership in sync.
- Added `workspace_membership` audit records for membership add, status, and removal changes.
- Shifted username conflict checks to app-level uniqueness in preparation for users belonging to multiple workspaces.

## Version 0.30.0

- Shifted the user-facing app language from organizations to workspaces for navigation, settings, billing inheritance labels, role scopes, and permission labels.
- Added `workspace-settings.html` as the Workspace Settings page while keeping `organization-settings.html` as a compatibility redirect.
- Added a disabled single-workspace selector to the authenticated app shell as the foundation for future workspace switching.
- Added `workspaceName` settings aliases and public API `workspace_id` response aliases while preserving legacy organization fields during migration.
- Updated workspace settings audit events to use workspace-focused record types and labels.
- Updated package metadata, README, roadmap, decisions, changelog, and public API docs for the 0.30.0 foundation release.

## Version 0.28.2

- Added shared UTC/timezone helpers for server-side timestamp normalization and browser-side local time display.
- Added startup repair for legacy database timestamps that do not include an explicit timezone.
- Added session timezone storage so authenticated requests can use the user's IANA timezone without re-querying the user row.
- Updated Manual Entry and Edit Entries to collect user-local wall-clock times and save UTC ISO timestamps.
- Updated Audit Log filtering, exports, and display to use the signed-in user's timezone while keeping stored audit rows in UTC.

## Version 0.28.1

- Added `display_name`, nullable `alt_email`, and IANA `timezone` profile fields to users.
- Migrated the existing `sadmin` and `Mike` usernames to email addresses with display names and timezone defaults.
- Added email validation for usernames in user creation, user profile saves, and User Admin edits.
- Added editable profile fields below the password form on User Settings.
- Added matching profile fields to the User Admin edit modal and surfaced display names in the user table.
- Kept user settings saves partial so appearance and profile updates do not overwrite each other.

## Version 0.28.0

- Added `active_timers` database support for running and paused timer state.
- Added authenticated `/api/active-timers` endpoints for listing, saving, finalizing, and clearing active timers.
- Updated Time Tracker timers to persist on start/resume, pause, edit, reset, timer removal, and stop without writing every second.
- Restored active timers on page load for the authenticated user and organization, including running elapsed-time reconstruction.
- Made starting one timer pause other persisted running timers for the same user and organization.
- Finalized persisted timers by creating a completed time entry and removing the active timer row.
- Cleaned up the README roadmap summary after the accidental README/ROADMAP overwrite.

## Version 0.27.0

- Expanded `public/js/shared/billing.js` into the shared calculation source for billing/reporting normalization, billing periods, effective rates, effective rounding, historic project reconciliation, date ranges, and client/project summaries.
- Reworked Dashboard current-month billables and trailing-month chart totals to use shared billing summaries.
- Reworked Reporting client/project report rows and totals to use shared billing summaries while preserving project billing-period overrides and custom date ranges.
- Kept the release frontend-first so future server-side invoice/API reporting can reuse the same calculation shape deliberately.

## Version 0.26.0

- Added `src/core/` as the shared backend infrastructure area for app bootstrap, database helpers, HTTP helpers, security exports, permissions, audit, API-key auth, and shared error handling.
- Added static module definitions and a module registry under `src/core/modules/`.
- Added `modules` and `organization_modules` tables with startup synchronization for default enabled modules.
- Made the migration runner module-aware while preserving existing checksum validation.
- Moved time-entry routes, service, and repository into `src/modules/time-tracking/`.
- Moved client/project routes, service, and repositories into `src/modules/client-projects/`.
- Added compatibility re-export shims for the old route, service, repository, and `src/app.js` paths so current behavior remains unchanged.

## Version 0.25.0

- Added stable public API routes under `/api/v1` while keeping browser routes under `/api`.
- Added API key storage with hashed keys, prefixes, active/revoked status, last-used timestamps, and separate scope rows.
- Added API key authentication for public API requests using `Authorization: Bearer` or `X-API-Key`.
- Added scoped public endpoints for clients, projects, and time entries with versioned response envelopes and pagination metadata.
- Added API key administration under Settings with create, one-time key display, scope selection, prefix display, last-used tracking, and revoke.
- Added audit records for API key creation, revocation, and public API time-entry creation.
- Added `docs/public-api.md` as the first public API contract reference.

## Version 0.24.0

- Added role, permission, role-permission, and scoped user-role-assignment database tables.
- Seeded Super Admin, Organization Administrator, Client Administrator, Project Administrator, Client User, Project User, and external Client User roles.
- Added `permissionsService` for session/action/resource permission checks and scoped client, project, and time-entry filtering.
- Applied permission checks across user administration, organization settings saves, client/project management, time entry creation/editing, reporting data reads, and audit-log viewing.
- Added role assignment management to the edit user modal with scoped client/project assignments, advanced controls, and audit logging.
- Widened the edit user modal, stacked role assignment controls, and moved per-assignment CRUD restrictions into a dedicated permissions modal.
- Changed Super Admin assignments to use `all` scope instead of an organization-specific scope.

## Version 0.23.3

- Added a protected Audit Log page under Settings.
- Added audit-log filters for date range, user, record type, and change type.
- Added audit detail and JSON viewer modals with readable previous, new, and metadata values.
- Added full and filtered audit-log CSV export routes and buttons.
- Added user-click filtering from the audit table and record links from the audit detail modal.

## Version 0.23.2

- Added audit-log settings to Organization Settings with logging enablement and retention period controls.
- Stored audit logging enablement, retention days, and audit-settings update timestamps in `organization_settings`.
- Made `auditService.record()` respect per-organization audit logging settings.
- Logged audit logging off/on transitions with forced audit records at the required point in the toggle flow.
- Added organization-scoped audit retention cleanup based on each organization's configured retention period.

## Version 0.23.1

- Added the `audit_logs` database table with indexes for organization, date, actor, record type, change type, and record ID.
- Added shared audit-log repository and `auditService.record()` infrastructure.
- Replaced active app-event CSV writes with structured database audit records.
- Added audit records for time entries, organization settings, users, clients, projects, login, logout, and password changes.
- Kept audit logs separate from future dashboard activity-feed behavior.

## Version 0.23.0

- Added granular authenticated client and project CRUD endpoints.
- Reworked client/project repository saves so one record can be created, updated, or archived without rewriting unrelated records.
- Kept `GET /api/client-projects` as the nested compatibility read model while deprecating whole-tree `PUT /api/client-projects` saves.
- Updated the client/project admin UI to use record-level client and project save endpoints.
- Added client/project lookup indexes for organization, status, client, and updated-date queries.

## Version 0.22.5.2

- Added shared plain-browser frontend helpers under `public/js/shared/` for API requests, modals, formatting, billing, and record matching.
- Wired Reporting and Dashboard to shared billing, formatting, and client/project matching helpers.
- Moved newly touched JSON request paths to the shared API client.

## Version 0.22.5.1

- Replaced browser confirmation dialogs with shared in-app confirmation modals.
- Kept the native `beforeunload` warning for unsaved timer time.
- Converted timer, client/project, edit-entry, and user-admin destructive warnings to the shared modal helper.

## Version 0.22.5.0

- Refactored Time Tracker timer-count changes so existing timers are preserved instead of rebuilding the grid.
- Appended only newly requested timers when increasing the timer count.
- Removed only timers above the selected count when decreasing the timer count.
- Added an in-app confirmation dialog before removing timers that have elapsed, paused, or running time.
- Added `window.timeTrackerDebug.snapshot()` and `window.timeTrackerDebug.runTimerCountSanityCheck()` for browser-console verification.

## Version 0.22.4

- Matched the Edit Entries page width to Dashboard and Reporting.
- Added authenticated time-entry deletion from the Edit Entries row actions.
- Show Edit Entries status as "N/A" when a time entry has no billable flag.
- Show Edit Entries status as "N/A" when the matched client or project is unbillable.
- Added editable hours, minutes, and seconds duration fields to the Edit Entry form.
- Kept project-level round-hours settings adjustable when client-level rounding is already set.
- Changed stopwatch save feedback to a concise green "Saved." message.
- Reset the stopwatch after a successful stop/save.
