# Time Tracking Module Boundary

Time Tracking is the first-party module for active timers, saved time entries, billing/reporting duration, and time-entry corrections.

Time Tracking declares its module-status control as a workspace Settings contribution. Fiscal-year month/day and billing-rounding enabled/increment are Time Tracking-owned contributions persisted in the generic store and read through `timeTrackingSettingsService`; its explicit app activation hook registers the fiscal effect after the complete module graph validates. Module lifecycle state still persists through `workspace_modules`.

When Time Tracking is disabled, its Settings route remains a permission-checked shared Settings host with a disabled message and Workspace Settings recovery link. The refreshed app shell removes Time Keeping navigation and the Capture Timer action immediately. Tasks and Workbench omit task-timer UI whenever Time Tracking is unavailable; if Time Tracking stays enabled while Tasks -> Task Timers is disabled, manual timers and the Time Tracking navigation remain available while task-sourced controls and Workbench task-timer rows are suppressed.

Owned by `src/modules/time-tracking/`:

- Browser API routes for time entries and active timers.
- Public API routes for `/api/v1/time-entries`.
- Time-entry and active-timer services and repositories.
- Unified active timer storage in `active_work_timers`, including manual timers and sourced timers such as Tasks.
- Timer capabilities consumed by the framework-owned Workbench page.
- Active-timer migrations under `src/modules/time-tracking/migrations/`.
- Browser assets for timers, the unified Time Entries screen, and time-entry rendering.
- Module metadata for navigation, dashboard panels, Workbench timer actions, settings, permissions, public API endpoints, Help articles, lifecycle events, and workspace capability requirements.

Framework dependencies:

- API key authentication for public API requests.
- Audit logging for time-entry creates, updates, deletes, and public API writes.
- Client/project records for scope resolution.
- Module access helpers for disabled-module write blocking.
- Permissions service for scoped create/edit/delete checks.
- Shared billing, formatting, and record helpers in browser code.
- Timezone normalization for persisted UTC timestamps.
- Workspace settings/bootstrap responses for module status and metadata.

Runtime write contracts and billing test seam:

As of 0.33.12.1, `src/modules/time-tracking/time-tracking.contracts.js` owns the Zod schemas for browser time-entry create/update payloads, public API time-entry create payloads, and manual active-timer save/status/finalize payloads. Browser writes continue through `timeEntriesService`, while API-key writes continue through `timeTrackingPublicApiService`; the two service paths share field definitions where their request shapes overlap without sharing response or audit behavior. Unknown and server-managed fields are stripped, wrong-typed known fields fail through the normal 400 `AppError` envelope, numeric durations retain the existing number-or-numeric-text compatibility, and service-owned required checks keep their established messages. Active-timer finalization validates its untrusted finalize body once, then passes the internally assembled entry through the trusted active-timer create path instead of parsing it again as a browser request.

Fast proof lives in `tests/contracts/time-tracking-contracts.test.mjs` and `tests/time-tracking/time-tracking-billing.test.mjs`, run together with `npm run test:time-tracking`; `npm run test:regressions:time-tracking` remains the narrow integration/regression area. Billing unit coverage pins normalization, direct leaf-project summaries, billable partitioning, range boundaries, rounding, hierarchy decoration, recursive mixed-rate/mixed-period/mixed-rounding project totals, and parent/child client ownership.

Workspace billing boundary:

As of 0.33.11.5, the Billable flag is available only in Business workspaces. Personal and Family Time Tracker cards, Create Timer dialogs, Time Entry dialogs, and Projects read surfaces omit the control. The browser still sends an explicit safe `no` where a compatibility payload requires the field, and the active-timer, browser time-entry, and public time-entry services independently force writes to `no`. Read models also normalize legacy Personal/Family `yes` values to `no`, so retained database columns cannot affect Time Tracking or billing calculations outside Business workspaces.

Dashboard effort contributions:

As of 0.33.6.13c, Time Tracking contributes compact Dashboard effort cards instead of default billing/report panels. The module declares `active-timers` and `recent-time` Dashboard contributions with Time Tracking workspace capability and enabled-module gates. `active-timers` requires `time_entries.create`, renders through `time-tracking.active-timers`, and links to Workbench without adding timer creation controls. `recent-time` requires `reporting.view`, renders through `time-tracking.recent-time`, and links to Time Entries and Reporting without showing a full table. Both cards hydrate from `/api/time-tracking/dashboard/effort-summary`, which returns safe active/paused timer counts, up to three timer rows, recent saved-time totals, and up to three recent time-entry rows. Business workspaces may include Client/Project context labels; Personal and Family workspaces must not show billable amount, invoice-ready copy, billing charts, Current Month Billables, or Client billing language.

As of 0.33.6.13d, the active/recent Time Tracking cards live in the Dashboard Module Overview grid, not the Recent Activity region. The Recent Activity region is reserved for future permission-safe activity digest rows and currently renders a quiet deferred state when no safe source exists.

As of 0.33.18.6, the Time Tracking Dashboard renderer and its new `public/css/time-tracking-dashboard.css` stylesheet are module-owned `browserAssets` targeted at Dashboard. The framework `/api/dashboard` catalog filters and returns those assets, and the native Dashboard entry loads them through the same-origin versioned compatibility bridge before dispatching panels. The protected HTML and generic Dashboard adapter do not hard-code Time Tracking asset paths or renderer IDs.

Detailed billing analysis remains outside the default Dashboard. The retired Dashboard contributions `current-month-billables` and `hours-billables-chart` must not return to default Dashboard placement. `src/modules/time-tracking/time-tracking-billing.service.js` still owns the permission-checked billing aggregation boundary for Reporting and compatible report reads. As of 0.33.6.14.1, the closeout guardrail keeps Time Tracking Dashboard cards compact and active/recent only; detailed billables, billing charts, invoice-ready copy, and full report tables belong in Reporting, while QAC remains the timer capture entry through the Time Tracking Create Timer modal.

As of 0.33.12.2, Time Tracking declares the initial `project-time-billing` report through the validated, data-only Reporting contribution contract. The definition names the future `time-tracking.project-time-billing` runner, `time-project-billing-table` renderer, supported billing-period/custom-date/scope/project/tag/descendant filters, `reporting.view` permission, Time Tracking workspace capabilities and enabled-module requirement, and the Time Tracking-owned `time-tracking-reporting-script` browser asset targeted at `framework:reporting`. This slice establishes metadata and filtering only: the current report service, page behavior, and calculations stay in place until the later runner/service-decoupling and host-conversion slices.

As of 0.33.12.3, the framework exposes this declaration through `GET /api/reporting/catalog` and dispatches registered report runners through `GET /api/reporting/reports/:reportKey/run`, with basic filter validation and safe framework envelopes around module execution.

As of 0.33.18.4, Time Tracking registers `time-tracking.project-time-billing` from `report-runners.js` only through its canonical app activation hook; importing `module.js` is declaration-only, while app/worker hooks register the appropriate report, search, and settings behavior after catalog validation. The runner, the retained `/api/reporting/project-summary` read used by the current page, and the existing dashboard billing read share `time-tracking-billing.service.js` as the canonical aggregation/calculation layer. That service owns time-entry and tag-filter reads, task-linked entry inclusion/filtering, billing-period/custom-date selection, scope/project rollups, hierarchy display rows, and result totals. It obtains readable clients/projects plus their hierarchy and billing metadata through `clientsService.readClientProjects(session)` and declares `client-projects` as an enabled-module dependency instead of duplicating its repository queries. The compatibility `/api/reporting/bootstrap` and `/api/reporting/project-summary` handlers now live in Time Tracking; `src/services/reporting.service.js` retains only framework catalog/filter/dispatch/envelope work and contains no first-party report/module imports or IDs.

As of 0.33.12.5, Project Time & Billing computes recursive totals from direct project leaves. A project first selects direct entries in its own effective current/last period (or the report’s explicit custom range), rounds its own direct duration, and prices that duration with its own effective rate. Its branch total then adds already-calculated immediate child branches; deeper descendants follow the same rule. Root report rows and root client scopes alone feed footer/overall totals, while nested `childRows` remain display-only. Clients/Projects now delivers `childScopeIds` as an array, allowing parent-client reports to include child-client projects while Time Tracking preserves those projects’ child-client rate, period, and rounding defaults. This corrected path is shared by the registered runner, retained compatibility read, and dashboard billing support.

As of 0.33.12.6, Project Time & Billing is rendered through the catalog-driven framework Reporting host. The permission-filtered `time-tracking-reporting-script` asset registers `time-project-billing-table` through `LongtailForge.reporting.registerRenderer`, hydrates readable scope/project/tag choices through the existing Time Tracking bootstrap and shared Tags read, preserves parent-before-child option ordering and legacy `client`/`scope` deep links, and validates that a scope and at least one project are selected. Result execution uses `/api/reporting/reports/:reportKey/run`; the browser asset no longer calls the compatibility project-summary route. It renders runner rows through the shared data-table/action helpers, keeps parent expansion state locally, treats child rows as display-only, and writes the runner-provided root totals into the footer without performing billing math.

As of 0.33.12.7, Time Tracking no longer defines `reporting.view`, the `reporting` resource, their role defaults, or a Reporting navigation item. Those are framework-owned contracts. The Time Tracking report and renderer asset still require `reporting.view` plus the module/capability gates declared by the contribution. The framework app shell contributes its child deep link only while that report is catalog-eligible, and disabling Time Tracking removes both the link and renderer asset despite historical time-entry read access.

Workbench timer contribution:

As of 0.33.6.12d-1, Workbench Focus Selection consumes active and paused timers as a read/control list from the Time Tracking contribution, but it does not render the manual creation row. Manual timer creation is deferred to the QAC/Time Tracking create-timer modal slice. Task-sourced timers remain backed by the same active timer storage, but readable task timers in Workbench dispatch Start/Pause/Save Time/Reset through the Tasks timer routes so task eligibility, permissions, status side effects, audit/event/search behavior, and final time-entry creation remain owned by the existing task timer service path.

As of 0.33.6.12k, Task Focus renames the lower timer panel to `Other Active Timers` and filters it through Workbench state before rendering. Manual timers and other task timers remain eligible in that panel, while the focused task's active/paused timer is represented only by the Task Timer section and still uses the same sourced active timer storage.

Create Timer modal:

As of version 0.33.6.12d-2, Time Tracking owns the Create Timer modal registered as `time-tracking.timer.create`. QAC and future framework surfaces open this module action through `LongtailForge.moduleActions` instead of navigating to the Time Tracker page. The modal supports Client, Project, optional Task, Description, and Billable controls; manual timer starts use the existing `/api/active-timers/:timerSlot` route with the next available manual slot, while selected Task timers use `PUT /api/tasks/:taskId/timer` so Tasks keeps task-timer eligibility, status-transition, audit/event/search, and task-worked side effects. After a successful start, the modal completes the host action, returns focus through the module-action host, and notifies the host that timer state changed.

As of 0.33.17.7.16, both the Create Timer modal and the Time Tracker timer cards preserve the Clients/Projects-owned option order and readable labels returned by the shared `client-project-options` helper. Workspace scope uses the readable Business, Personal, or Family workspace label; each selected scope keeps parent projects before their children, and child labels retain the shared indented `-` prefix. Timer browser code must not apply a second alphabetical sort or rebuild hierarchy labels.

Linking a running manual timer to a task:

As of 0.33.11.3, each Time Tracker manual-timer card can link its currently running, server-persisted timer to an active task in the same selected project. The browser loads the existing Tasks-owned active option payload, keeps the control disabled until the timer is running and persisted, and calls `POST /api/tasks/:taskId/timer/link`; paused timers cannot be converted. Tasks owns task readability, Time Tracking permission, task-timer enablement and eligibility, conflict checks, Open-to-In Progress transition, audit, last-worked, and search side effects. Time Tracking transactionally reclassifies the existing `active_work_timers` row instead of creating a replacement: `active_timer_id`, `created_at`, accumulated duration, current running segment, and running status stay intact while source, Client/Project, description, billable state, and source metadata become Task-owned values. Remaining numeric manual slots compact afterward. Finalizing the converted timer uses the normal Tasks finalize route and writes the selected `task_id` to the saved time entry.

Disabled-module rule:

Time Tracking keeps historical read-only access so existing entries remain visible, but create, update, delete, active-timer save, finalize, and remove operations are blocked when the module is disabled.

Active timer storage:

Version 0.31.21 makes `active_work_timers` the only active timer table. Manual timers and sourced timers such as Tasks share that table, and obsolete `active_timers` and `active_task_timers` tables are migrated forward and dropped by the cleanup migration.

As of version 0.33.5.27.12, the active timer repository uses named bound params for manual and sourced active timer reads, slot/source reads, upsert, remove, source removal, source existence checks, and manual slot compaction. Active timer upsert routes through the database conflict seam for the existing workspace/user/slot identity, pause flows keep elapsed running-segment math behind the time seam, and slot compaction preserves the two-phase temporary-slot behavior that avoids unique-slot collisions.

Timer timestamp and duration semantics:

When an active timer is finalized into a time entry, the server treats the persisted timer row as authoritative. The completed time entry stores `start_time` from the timer row's first persisted start, `end_time` from the server finalization moment, and `duration_seconds` from accumulated active seconds plus any currently running segment. Paused wall-clock time can be visible between start and end, but it does not inflate saved duration, billing, or reporting totals.

Manual time-entry create and edit flows remain separate from timer finalization. Those forms save the explicit user-entered start, end, and duration values.

As of version 0.33.5.27.13, the time entry repository uses named bound params for workspace entry reads, single-entry reads, project entry reads, create/update/remove writes, project-scope updates, and project entry counts. It preserves the existing nullable client/task storage behavior, duration integer coercion, normalized app read shape, and end-time ordering that reporting-facing reads depend on.

Resume-safe timer metadata:

Active and paused timer reads expose `resumeContext` and `resume_context` with source module/type/id, safe source label and URL, client/project context, timer status, last active start time, and accumulated elapsed seconds. Timer lifecycle events for started, paused, finalized, and discarded states emit safe metadata only. Source labels and URLs are blanked when the timer owner cannot read the linked source record, and raw source metadata is not emitted through lifecycle event metadata.

This metadata is producer-owned by Time Tracking. The future global resume feed, ranking, dismissal state, and framework-owned resume storage are not part of this module document.

Time-entry corrections:

Workspace administrators with `time_entries.edit_all` can correct workspace-scoped time entries in their permitted scope, including direct time-entry tags. The service checks access to both the original entry scope and any changed project/client destination scope before saving. Admin corrections preserve the original `user_id` and write audit metadata identifying the correction path and changed fields.

Files:

Time entries declare an attachable target and use the framework Files service. File upload, download, deletion lifecycle, storage accounting, file type policy, attachment read models, and file lifecycle events remain framework-owned. Time Tracking owns only the business meaning and placement of files attached to time entries.
