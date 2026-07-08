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

Dashboard billing contributions:

As of 0.33.6.10b, Time Tracking owns the Dashboard billing panels. The module declares `current-month-billables` and `hours-billables-chart` dashboard contributions with `reporting.view`, Time Tracking workspace capability, and enabled-module gates. `public/js/time-tracking-dashboard.js` registers the `time-tracking.current-month-billables` and `time-tracking.hours-billables-chart` renderers with the framework Dashboard host, and both renderers fetch `/api/time-tracking/dashboard/billing-summary`. `src/modules/time-tracking/time-tracking-billing.service.js` owns the permission-checked billing aggregation for the current-month billable table and trailing hours/billables chart so later project time/billing work can reuse the same calculation boundary. Dashboard remains responsible only for contribution filtering, panel placement, status, and empty states.

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
