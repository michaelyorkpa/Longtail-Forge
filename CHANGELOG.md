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
