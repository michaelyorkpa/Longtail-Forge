# Time Tracking Module Boundary

Time Tracking is the first-party module for active timers, saved time entries, billing/reporting duration, and time-entry corrections.

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

Workspace billing boundary:

As of 0.33.11.5, the Billable flag is available only in Business workspaces. Personal and Family Time Tracker cards, Create Timer dialogs, Time Entry dialogs, and Projects read surfaces omit the control. The browser still sends an explicit safe `no` where a compatibility payload requires the field, and the active-timer, browser time-entry, and public time-entry services independently force writes to `no`. Read models also normalize legacy Personal/Family `yes` values to `no`, so retained database columns cannot affect Time Tracking or billing calculations outside Business workspaces.

Dashboard effort contributions:

As of 0.33.6.13c, Time Tracking contributes compact Dashboard effort cards instead of default billing/report panels. The module declares `active-timers` and `recent-time` Dashboard contributions with Time Tracking workspace capability and enabled-module gates. `active-timers` requires `time_entries.create`, renders through `time-tracking.active-timers`, and links to Workbench without adding timer creation controls. `recent-time` requires `reporting.view`, renders through `time-tracking.recent-time`, and links to Time Entries and Reporting without showing a full table. Both cards hydrate from `/api/time-tracking/dashboard/effort-summary`, which returns safe active/paused timer counts, up to three timer rows, recent saved-time totals, and up to three recent time-entry rows. Business workspaces may include Client/Project context labels; Personal and Family workspaces must not show billable amount, invoice-ready copy, billing charts, Current Month Billables, or Client billing language.

As of 0.33.6.13d, the active/recent Time Tracking cards live in the Dashboard Module Overview grid, not the Recent Activity region. The Recent Activity region is reserved for future permission-safe activity digest rows and currently renders a quiet deferred state when no safe source exists.

Detailed billing analysis remains outside the default Dashboard. The retired Dashboard contributions `current-month-billables` and `hours-billables-chart` must not return to default Dashboard placement. `src/modules/time-tracking/time-tracking-billing.service.js` still owns the permission-checked billing aggregation boundary for Reporting and compatible report reads. As of 0.33.6.14.1, the closeout guardrail keeps Time Tracking Dashboard cards compact and active/recent only; detailed billables, billing charts, invoice-ready copy, and full report tables belong in Reporting, while QAC remains the timer capture entry through the Time Tracking Create Timer modal.

Workbench timer contribution:

As of 0.33.6.12d-1, Workbench Focus Selection consumes active and paused timers as a read/control list from the Time Tracking contribution, but it does not render the manual creation row. Manual timer creation is deferred to the QAC/Time Tracking create-timer modal slice. Task-sourced timers remain backed by the same active timer storage, but readable task timers in Workbench dispatch Start/Pause/Save Time/Reset through the Tasks timer routes so task eligibility, permissions, status side effects, audit/event/search behavior, and final time-entry creation remain owned by the existing task timer service path.

As of 0.33.6.12k, Task Focus renames the lower timer panel to `Other Active Timers` and filters it through Workbench state before rendering. Manual timers and other task timers remain eligible in that panel, while the focused task's active/paused timer is represented only by the Task Timer section and still uses the same sourced active timer storage.

Create Timer modal:

As of version 0.33.6.12d-2, Time Tracking owns the Create Timer modal registered as `time-tracking.timer.create`. QAC and future framework surfaces open this module action through `LongtailForge.moduleActions` instead of navigating to the Time Tracker page. The modal supports Client, Project, optional Task, Description, and Billable controls; manual timer starts use the existing `/api/active-timers/:timerSlot` route with the next available manual slot, while selected Task timers use `PUT /api/tasks/:taskId/timer` so Tasks keeps task-timer eligibility, status-transition, audit/event/search, and task-worked side effects. After a successful start, the modal completes the host action, returns focus through the module-action host, and notifies the host that timer state changed.

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
