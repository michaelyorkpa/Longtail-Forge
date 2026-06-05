# Time Tracking Module Boundary

Time Tracking is the reference module for the 0.30.x framework cleanup.

Owned by `src/modules/time-tracking/`:

- Browser API routes for time entries and active timers.
- Public API routes for `/api/v1/time-entries`.
- Time-entry and active-timer services and repositories.
- Unified active timer storage in `active_work_timers`, including manual timers and sourced timers such as Tasks.
- Timer capabilities consumed by the framework-owned Workbench page.
- Active-timer migrations under `src/modules/time-tracking/migrations/`.
- Browser assets for timers, manual entry, edit entries, and time-entry rendering.
- Module metadata for navigation, dashboard panels, settings, permissions, public API endpoints, and workspace capability requirements.

Framework dependencies:

- API key authentication for public API requests.
- Audit logging for time-entry creates, updates, deletes, and public API writes.
- Client/project records for scope resolution.
- Module access helpers for disabled-module write blocking.
- Permissions service for scoped create/edit/delete checks.
- Shared billing, formatting, and record helpers in browser code.
- Timezone normalization for persisted UTC timestamps.
- Workspace settings/bootstrap responses for module status and metadata.

Disabled-module rule:

Time Tracking keeps historical read-only access so existing entries remain visible, but create, update, delete, active-timer save, finalize, and remove operations are blocked when the module is disabled.

Active timer storage:

Version 0.31.21 makes `active_work_timers` the only active timer table. Manual timers and sourced timers such as Tasks share that table, and obsolete `active_timers` and `active_task_timers` tables are migrated forward and dropped by the cleanup migration.
