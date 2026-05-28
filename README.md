# Longtail Forge Roadmap

This file is the detailed per-version changelog and forward plan for Longtail Forge. README.md should stay cursory and point here for version-level detail.

## Version 0.1

- [x] One stopwatch
- [x] Clients are saved in a custom, writable YAML or JSON file
- [x] Each client has projects
- [x] Clients and projects are pulled into dropdowns in stopwatches
- [ ] ~Changing the client/project warns then resets the stopwatch~
- [x] Each time a stopwatch stops, a line is written to a CSV file for reporting
  - [x] Current date
  - [x] Hours recorded by the stopwatch
  - [x] Client
  - [x] Project
  - [x] Description
  - [ ] ~User (this can be hard-coded in phase 1)~

## Version 0.11

- [x] Multiple stopwatches on screen (3)
  - [x] Each stopwatch can be started, stopped, paused, and reset independently
  - [x] When one stopwatch starts, the others stop automatically
  - [x] Each stopwatch is assigned to a client and project and has a description field for the work being done
- [x] Reporting
- [x] Client/project editing on the front end
- [x] Time editing on the front end
- [x] Manual time entry
- [x] Dashboard screen
  - [x] Active clients
    - Shows total number with dropdown to go to clients reporting
  - [x] Table with current month's billables
    - Only shows clients with billables for the month
  - [x] Bar graph showing previous 12 months' hours and billables versus current month's hours and billables
    - Left side is total hours
    - Right side is dollars
    - Bottom is MM/YY with current month at far right, -12 months at far left

## Version 0.12

- [x] Migrate to SQLite database
- [x] Add users and full login with passwords
  - [x] Secure the app so that only the login page is accessible without login
  - [x] Create a splash page with link to login
- [x] Break project and client UI apart
- [x] Add billable flags to:
  - [x] Time tracker
  - [x] Client UI
  - [x] Project UI
  - [x] Have reporting respect billable flag
  - [x] Billable does not uncheck on the time tracker when a non-billable client/project is selected
- [x] Add a fourth timer
- [x] Dark mode
- [x] Add user admin screen for adding users
  - [x] Include buttons for Edit, Delete, Deactivate, Reactivate, and Reset Password
  - [x] Make the edit user modal real

## Version 0.20

- [x] Refactor server.js
  - [x] Use src/app.js style structure
- [x] Incorporate Express
- [x] Move browser JavaScript and styles into public assets

## Version 0.20.1

- [x] Move database logic out of legacy/handler.js into appropriate repos
  - [x] src/db/index.js
  - [x] src/db/sqlite.js
  - [x] src/db/migrations.js
  - [x] src/repositories/users.repo.js
  - [x] src/repositories/clients.repo.js
  - [x] src/repositories/projects.repo.js
  - [x] src/repositories/settings.repo.js
  - [x] src/repositories/time-entries.repo.js
- [x] Move these first:
  - [x] querySql()
  - [x] runSql()
  - [x] ensureDatabase()
  - [x] ensureColumnExists()
  - [x] readUserById()
  - [x] readUsers()
  - [x] readTimeEntries()
  - [x] saveTimeEntry()
  - [x] updateTimeEntry()
  - [x] readClientProjectData()
  - [x] saveClientProjectData()

## Version 0.20.2

- [x] Replace inline schema creation with migrations
  - [x] src/db/migrations/001_initial_schema.sql
  - [x] src/db/migrations/002_add_user_theme_status_protection.sql
  - [x] src/db/migrations/003_add_billable_flags.sql
  - [ ] Additional migrations as needed
- [x] Add schema_migrations tracking table
- [x] Baseline existing database without replaying destructive changes

## Version 0.20.3

- [x] Pull session/auth into a real auth module
  - [x] Move password helpers into src/security/passwords.js
  - [x] Move in-memory session helpers into src/security/sessions.js
  - [x] Make sessions database-backed instead of in-memory maps

## Version 0.20.4

- [x] Stop using legacy URL parsing inside Express routes
  - [x] Replace request.url service parsing with explicit route params/body/session inputs
  - [x] User routes now pass request.params user/action values
  - [x] Time-entry update route now passes request.params.entryId

## Version 0.20.5

- [x] Move response handling out of services
  - [x] Services return data or throw errors
  - [x] Routes parse request bodies, set cookies/status codes, and send HTTP responses
  - [x] Remove legacy handler delegation from active API routes

## Version 0.20.6

- [x] Add real error types and central API error handling
  - [x] Add src/utils/app-error.js
  - [x] Add src/middleware/error-handler.js
  - [x] Services can throw AppError instances with status codes

## Version 0.20.7

- [x] Fix the npm run check script
  - [x] Replace "node --check server.js" with a project-wide JavaScript syntax check
  - [x] Add scripts/check-js.mjs

## Version 0.20.8

- [x] Decide whether cookie-parser is needed
  - [x] package.json includes cookie-parser
  - [x] Use cookie-parser in Express and simplify cookie/session parsing

## Version 0.21.0 - Final Legacy Refactor

- [x] Fix require-auth.js
  - [x] Refactor require-auth.js to import directly from src/security/sessions.js and await the session lookup
- [x] Stop defaulting time entries to the default org/user
  - [x] Pass request.session into time-entry routes
  - [x] Create/list/update time entries using the authenticated session organization_id
  - [x] Create time entries using the authenticated session user_id
- [x] Finish killing the legacy bridge
  - [x] Remove legacy auth/session imports
  - [x] Remove route-utils
  - [x] Delete src/legacy once nothing imports it
- [x] Fix npm run check
  - [x] Add ESLint
  - [x] Run JavaScript syntax checks and ESLint from npm run check

## Version 0.21.0.1

- [x] Remove unnecessary config values from src/config.js
  - [x] config.settingsFile
  - [x] config.clientProjectFile
  - [x] config.timeEntriesFile
- [x] Preserve AppError status codes and response bodies through the central Express error handler in src/app.js
- [x] Scope clients/projects and settings to the authenticated organization
  - [x] clients.routes.js passes request.session before calling clientsService.readClientProjects()
  - [x] clients.routes.js passes request.session before calling saveClientProjects()
  - [x] clients.service.js uses session.organization_id
  - [x] Organization settings routes pass the session
  - [x] Organization settings repository reads/saves by session.organization_id instead of "ORDER BY created_at LIMIT 1"

## Version 0.21.1

- [x] Add app version display to the shared footer
- [x] Use package.json version as the single source of truth
- [x] Add appName and appVersion to src/config.js by reading package.json
- [x] While updating config.js, preserve/add the existing path settings needed by db/static services: root, dataDir, logsDir, migrationsDir, sqliteCommand, databaseFile, settingsFile, clientProjectFile, and timeEntriesFile
- [x] Create src/routes/app-info.routes.js with GET /api/app-info returning { name, version } and Cache-Control: no-store
- [x] Mount the app-info route in src/app.js before requireAuth so the footer can load on public and authenticated pages
- [x] Update public/js/footer.js so the brand line displays "Longtail Forge vX.Y.Z" using /api/app-info
- [x] Gracefully fall back to "Longtail Forge" if the app-info request fails
- [x] Do not hard-code the version in footer.js
- [x] Do not change unrelated behavior

## Version 0.21.2 - Frontend Organization

- [x] Clean up loose .html files in root
- [x] Move toward:
  - public/
    - css/
    - js/
    - assets/
  - views/
    - Protected HTML
- [x] Fix the public splash page after frontend organization
  - [x] Remove the hard-coded Version 0.12 label
  - [x] Use /api/app-info for the splash version display
  - [x] Show Open App instead of Log In when an existing session is still valid

## Version 0.21.3

- [x] Add checksums to database migrations to avoid older migrations being silently changed after being applied
- [x] Rename the session cookie to longtail_forge_session
- [x] Add config-driven cookie behavior
  - [x] HttpOnly
  - [x] SameSite=Lax

## Version 0.21.4

- [x] Add real LICENSE file per description in README and footer
- [x] Add "Getting Started" section to README
  - [x] Requirements
  - [x] Setup
  - [x] Optional environment variables
  - [x] Start
  - [x] Open
- [x] Change database file name to longtail-forge.db

## Version 0.22.1

- [x] Login username and password box are aligned near the bottom (not at the bottom) instead of the middle of the screen
- [x] Rename the main summary screen to "Dashboard" everywhere

## Version 0.22.2

- [x] Hours on reporting screen do not round when a client is not billable
- [x] If a client/project is marked as "Unbillable" in settings screen, allow a checkbox below "Rounding" heading that says "Round hours?"
- [x] Adjust reporting and Dashboard information so that it respects the "Round hours?" selection

## Version 0.22.2.1

- In Client Settings
  - [x] Get rid of the "Save Client" button next to Status
  - [x] Get rid of the "Save Contact" button and wire the "Save Client" button to save everything each time
  - [x] Get rid of the "Save Billing" button and wire the "Save Client" button to save everything each time

## Version 0.22.3

- [x] Increase the size of the reporting screen to the same size as the Dashboard
- [x] Add filters to the edit entries screen for:
  - [x] Entry status (Billed/Unbilled)
  - [x] Dates (Last billing period, current billing period, custom)
  - [x] User(s)

## Version 0.22.4

- [x] Increase the size of the edit entries screen to the same width as the Dashboard and Reporting screens
- [x] On the Edit Entries screen, add a delete button next to the edit-entry button in the columned display
- [x] Update Edit Entries screen to show status "N/A" in the column when billable flag is not set for time entry
- [x] Treat unbillable client/project context as "N/A" in the Edit Entries status column
- [x] Make duration editable on the Edit Entry form as hours, minutes, and seconds
- [x] Change saved message on time tracker stop watch to a simple green "Saved." rather than "Saved {{UUID}} to database"
- [x] Make timer reset when stop is pressed
- [x] Allow project-level round-hours settings to override client-level round-hours settings

## Version 0.22.5.0 - Frontend Utilities and Timer State Refactor

- [x] Refactor timer count changes so adding timers does not stop, reset, delete, or rebuild existing running timers
  - [x] Do not clear and rebuild the entire timer grid when the selected timer count changes
  - [x] When increasing the timer count, append only the newly needed timer cards and timer instances
  - [x] When decreasing the timer count, only remove timer cards above the new selected count
  - [x] If a removed timer has elapsed, paused, or running time, show an in-app confirmation modal before removing it
  - [x] Existing timers below the new selected count must keep their current client, project, description, billable flag, elapsed time, running/paused state, and status message
  - [x] Add a browser-console debug helper or unit-style sanity function that confirms:
    - [x] Existing timer object identities are preserved when adding timers
    - [x] Existing running timers remain running after adding timers
    - [x] Removed timers are disposed cleanly when confirmed

## Version 0.22.5.1

- [x] Convert warning pop-ups to in-app modal windows instead of browser `alert()` / `confirm()` dialogs
  - [x] Create a shared modal/confirm helper that can be reused across timer, client/project, user, settings, edit-entry, and future admin screens
  - [x] Use accessible markup:
    - [x] `role="dialog"`
    - [x] `aria-modal="true"`
    - [x] Focus moves into the modal when opened
    - [x] Escape key and Cancel button close the modal
    - [x] Focus returns to the triggering control when closed
  - [x] Keep the native `beforeunload` browser warning where required, because browsers restrict custom unload modals

## Version 0.22.5.2

- [x] Create shared frontend helper modules under `public/js/shared/` or similar
  - [x] `api-client.js`
    - Wrapper around `fetch()`
    - Handles JSON request/response boilerplate
    - Handles non-OK responses consistently
    - Provides `getJson()`, `postJson()`, `putJson()`, `deleteJson()` helpers
  - [x] `modal.js`
    - Shared in-app modal and confirmation helper
  - [x] `formatters.js`
    - Currency, hours, dates, names, and statuses
  - [x] `billing.js`
    - Shared billing and rounding calculations used by reporting and dashboard screens
  - [x] `records.js` or `matching.js`
    - Shared client/project matching helpers currently duplicated between reporting, dashboard, and edit-entry pages
  - [x] Keep this as plain browser JavaScript with no build step for now

## Version 0.23.0 - Client and Project CRUD Foundation

- [x] Replace whole-tree client/project saves with granular CRUD
  - Current risk:
    - The current client/project save path deletes and reinserts all clients/projects for an organization
    - That is acceptable for early app data, but it becomes dangerous once tasks, notes, tickets, roles, audit logs, API integrations, and external references point at client/project IDs
  - Goal:
    - [x] Client and project records should be created, updated, archived/deactivated, and deleted individually
    - [x] Existing IDs must be preserved
    - [x] Saving one project must not rewrite unrelated clients/projects
- [x] Add granular client endpoints
  - [x] `GET /api/clients`
  - [x] `POST /api/clients`
  - [x] `GET /api/clients/:clientId`
  - [x] `PUT /api/clients/:clientId`
  - [x] `DELETE /api/clients/:clientId` archive/deactivate equivalent
- [x] Add granular project endpoints
  - [x] `GET /api/projects`
  - [x] `GET /api/clients/:clientId/projects`
  - [x] `POST /api/clients/:clientId/projects`
  - [x] `GET /api/projects/:projectId`
  - [x] `PUT /api/projects/:projectId`
  - [x] `DELETE /api/projects/:projectId` archive/deactivate equivalent
- [x] Keep `GET /api/client-projects` as a compatibility/read endpoint for screens that still need the nested client/project tree
- [x] Retire or restrict `PUT /api/client-projects`
  - [x] Do not allow it to delete and reinsert all clients/projects long term
  - [x] If temporarily retained for compatibility, document it as deprecated
  - [x] Make sure it cannot break task/note/ticket/role references once those exist
- [x] Add repository methods instead of replace-all methods
  - [x] `clientsRepository.create()`
  - [x] `clientsRepository.update()`
  - [x] `clientsRepository.archive()` or `clientsRepository.delete()`
  - [x] `projectsRepository.create()`
  - [x] `projectsRepository.update()`
  - [x] `projectsRepository.archive()` or `projectsRepository.delete()`
- [x] Prefer archive/deactivate over hard delete for clients and projects
  - [x] Add `archived_at`, `deleted_at`, or consistent `status` behavior if needed
  - [x] Preserve old clients/projects for historic time entries, audit logs, notes, tickets, and tasks
- [x] Add or verify database constraints and indexes
  - [x] Clients remain scoped by `organization_id`
  - [x] Projects remain scoped by `organization_id` and linked to clients
  - [x] Add indexes for common lookups by organization, client, status, and updated date
- [x] Update client/project admin UI to use granular endpoints
  - [x] Creating a client calls the client create endpoint
  - [x] Editing a client calls the client update endpoint
  - [x] Creating a project calls the project create endpoint
  - [x] Editing a project calls the project update endpoint
  - [x] Archiving/deleting a client or project affects only that one record
- [x] Preserve denormalized time-entry names for historical reporting, but keep IDs stable
  - [x] Time entries may continue storing `client_name` and `project_name` as historical display values
  - [x] Future joins and links should rely on stable `client_id` and `project_id`

## Version 0.23.1 - Immediate UX and Documentation Cleanup

- [ ] Clean up small front-end issues before the workspace shift begins
  - [ ] On the Edit Entries screen, stop displaying the full UUID when an entry is selected for editing
  - [ ] Show a friendly selected-entry label that includes the date, client/project context where available, duration, and shortened ID only if needed for disambiguation
  - [ ] Keep the full UUID available internally for updates/deletes, but do not make it the primary user-facing label
- [ ] Add visible required-field markers to forms
  - [ ] Add a consistent asterisk or required indicator next to required fields
  - [ ] Apply the pattern to login, user admin, user settings, workspace/settings, client settings, project settings, time tracker, manual time entry, and edit-entry forms where applicable
  - [ ] Do not rely only on placeholder text to communicate required fields
- [ ] Add a table of contents to README.md
  - [ ] Link to major README sections
  - [ ] Keep README cursory and continue pointing detailed version planning to ROADMAP.md
- [ ] Run the project checks after the cleanup
  - [ ] `npm run check`

## Version 0.23.2 - User Identity and Email Login Preparation

- [ ] Add a display-name field to users
  - [ ] Add a nullable or defaulted `display_name` field to the users table
  - [ ] Show display name in User Settings
  - [ ] Show and edit display name in user administration
  - [ ] Use display name in user-facing labels where available
  - [ ] Fall back gracefully to the email/username value when display name is blank
- [ ] Treat the existing username field as the user's primary email address
  - [ ] Keep the underlying column name if that avoids a risky migration, but update the service/UI language to "Email Address"
  - [ ] Add validation so the value must be a syntactically valid email address
  - [ ] Prevent duplicate primary email addresses
  - [ ] Update front-end labels, help text, validation messages, and user-admin wording from "Username" to "Email Address"
  - [ ] Migrate the current super admin login to `[REDACTED]` if that account exists in the local data set
- [ ] Add backup email support
  - [ ] Add a backup/personal email field to the user profile
  - [ ] Allow login with either the primary email address or backup email address
  - [ ] Prevent backup email collisions with any other user's primary or backup email
  - [ ] Keep backup email optional
  - [ ] Do not add outbound email sending yet
- [ ] Preserve existing sessions and passwords
  - [ ] Do not force password resets during this migration
  - [ ] Keep existing password verification behavior unchanged
  - [ ] Run `npm run check`

## Version 0.23.3 - Timezone and UTC Date Foundation

- [ ] Add timezone fields before adding calendars, reminders, recurring tasks, and scheduled notifications
  - [ ] Add timezone to workspace settings
  - [ ] Add timezone to client settings
  - [ ] Add timezone to user settings
  - [ ] Use a validated IANA timezone string where practical
  - [ ] Provide safe defaults for existing installs
- [ ] Normalize stored timestamps
  - [ ] Store new timestamps in UTC
  - [ ] Keep API/database timestamp values consistently ISO-formatted
  - [ ] Convert timestamps for display using the active user's timezone, falling back to workspace timezone, then server default if needed
  - [ ] Do not destructively rewrite historical time entries without a deliberate migration plan
- [ ] Prepare date handling for future features
  - [ ] Make due dates, due times, reminders, calendar entries, audit logs, and recurring tasks use the same date/time utility patterns
  - [ ] Avoid duplicating timezone conversion logic across screens
  - [ ] Run `npm run check`

## Version 0.24.0 - Workspace Terminology Migration

- [ ] Rename Organization/organization to Workspace/workspace throughout the user-facing app
  - [ ] Update navigation, settings labels, forms, headings, button text, table labels, and validation messages
  - [ ] Update docs/comments where they are user-facing or developer-facing roadmap guidance
  - [ ] Keep compatibility naming where required to avoid breaking existing data in one risky pass
- [ ] Migrate database naming carefully
  - [ ] Move toward `workspaces` and `workspace_id`
  - [ ] Preserve existing data from organization-based tables
  - [ ] Use migrations that can run safely on existing installs
  - [ ] Avoid dropping old columns/tables until compatibility paths are no longer needed
- [ ] Update service and repository naming gradually
  - [ ] Prefer workspace language in new code
  - [ ] Keep compatibility wrappers where old route names still exist
  - [ ] Do not change unrelated behavior while renaming
- [ ] Add a self-hosted configuration option for workspace availability
  - [ ] Allow self-hosted installs to limit workspace creation to business-only mode later
  - [ ] Default behavior should remain compatible with the current single-workspace install
- [ ] Run `npm run check`

## Version 0.24.1 - User Workspace Memberships and Active Workspace Sessions

- [ ] Separate users from direct workspace ownership/assignment
  - [ ] Create a `user_workspaces` table to track which users can access which workspaces
  - [ ] Preserve existing users by creating memberships for their current workspace during migration
  - [ ] Add role/status-ready fields where useful, but do not fully implement permissions in this version
- [ ] Add primary workspace ownership
  - [ ] Add a workspace owner field such as `owner_user_id`
  - [ ] Use it to identify the primary administrator of the workspace
  - [ ] Leave room to reassign ownership later
- [ ] Update sessions
  - [ ] Add `active_workspace_id` to session data
  - [ ] Resolve all workspace-scoped reads/writes from the active workspace
  - [ ] Stop assuming each user belongs to exactly one workspace
- [ ] Add workspace switching
  - [ ] Add a basic workspace switcher to the authenticated UI
  - [ ] Only show workspaces the current user can access
  - [ ] Persist the selected active workspace in the session
  - [ ] Reload workspace-scoped data after a switch
- [ ] Update user administration
  - [ ] Super administrators can assign users to workspaces
  - [ ] Workspace administrators can manage users for their active workspace once permissions support is added
  - [ ] Keep the advanced permissions UI out of scope until roles/permissions are implemented
- [ ] Run `npm run check`

## Version 0.24.2 - Workspace Types and Workspace Creation

- [ ] Add workspace types
  - [ ] Add a workspace type field with at least `business`, `personal`, and `family`
  - [ ] Default existing workspaces to `business`
  - [ ] Make business workspaces support the full project/client/time-tracking/reporting toolset
  - [ ] Make personal workspaces support tasks, notes/knowledge base, optional time tracking, and projects
  - [ ] Make family workspaces support tasks, notes/knowledge base, optional time tracking, projects, limited team members, and family-focused permissions later
- [ ] Add workspace creation from User Settings
  - [ ] Add buttons/actions for creating new workspaces
  - [ ] Keep creation rules simple for self-hosted installs
  - [ ] Leave room for SaaS account-type limits later
- [ ] Add workspace creation defaults
  - [ ] Business workspace name defaults to the organization/business name where available
  - [ ] Personal workspace name defaults to "Personal"
  - [ ] Family workspace name defaults to "Family"
- [ ] Respect workspace type in navigation
  - [ ] Do not show client-only features in personal workspaces if clients are not supported there
  - [ ] Keep time tracking optional where the workspace type allows it
- [ ] Run `npm run check`

## Version 0.24.3 - Project and Client Relationship Refactor

- [ ] Make projects workspace-owned first and client-linked second
  - [ ] Projects must always have a `workspace_id`
  - [ ] Make `client_id` nullable on projects
  - [ ] Preserve existing project/client relationships during migration
  - [ ] Do not break historical time entries or reports
- [ ] Update Project Settings
  - [ ] Convert the project settings screen to a single list of all projects in the active workspace
  - [ ] Add a "Filter by Client" dropdown
  - [ ] Add a "Filter by Status" dropdown
  - [ ] Add an optional client assignment field to the project form
  - [ ] Support projects that are not assigned to any client
- [ ] Prepare for later bulk project editing
  - [ ] Keep the data model and UI structure compatible with future multi-select bulk actions
  - [ ] Do not implement bulk editing yet unless it naturally falls out of the refactor
- [ ] Run `npm run check`

## Version 0.24.4 - Project-First Time Entry Refactor

- [ ] Shift time entries away from requiring a client
  - [ ] Keep project required for timer and manual entries
  - [ ] Make client optional on timer/manual/edit-entry workflows
  - [ ] Preserve client context where a selected project has an assigned client
- [ ] Update timer selection behavior
  - [ ] Turn client into a filter for project selection instead of a required selector that controls the project dropdown
  - [ ] Allow selecting projects without clients
  - [ ] Keep existing project-level billable and rounding behavior intact
- [ ] Update edit-entry and reporting screens
  - [ ] Handle entries with no client cleanly
  - [ ] Continue showing historical client/project names where they exist
  - [ ] Update filters so client filtering is optional and project filtering remains available
- [ ] Run `npm run check`

## Version 0.25.0 - Database Audit Logging

- [ ] Move audit logging to the database
  - [ ] Server/error logging should still be written to files in the logs/ directory
  - [ ] Replace app-event CSV logging with a database-backed audit log for application-level changes
  - [ ] Treat audit logging as core app infrastructure, not as a time-tracking-specific feature
- [ ] Create an `audit_logs` table
  - [ ] `audit_id TEXT PRIMARY KEY`
  - [ ] `workspace_id TEXT NOT NULL`
  - [ ] `created_at TEXT NOT NULL`
  - [ ] `actor_user_id TEXT`
  - [ ] `actor_user_display_name TEXT`
  - [ ] `action TEXT NOT NULL`
  - [ ] `change_type TEXT NOT NULL`
  - [ ] `record_type TEXT NOT NULL`
  - [ ] `record_id TEXT`
  - [ ] `record_label TEXT`
  - [ ] `record_url TEXT`
  - [ ] `previous_value_json TEXT`
  - [ ] `new_value_json TEXT`
  - [ ] `metadata_json TEXT`
- [ ] Add audit-log indexes
  - [ ] `workspace_id, created_at`
  - [ ] `workspace_id, actor_user_id`
  - [ ] `workspace_id, record_type`
  - [ ] `workspace_id, change_type`
  - [ ] `workspace_id, record_id`
- [ ] Create a shared `auditService.record()` function
  - [ ] Services call `auditService.record()` after successful create/update/delete/archive actions
  - [ ] Routes should not manually assemble audit rows unless there is no better service-layer location
  - [ ] Audit service should accept structured values and stringify JSON internally
  - [ ] Audit service should gracefully handle null previous/new values for create/delete events
- [ ] Use consistent audit `change_type` values
  - [ ] `create`
  - [ ] `update`
  - [ ] `delete`
  - [ ] `archive`
  - [ ] `restore`
  - [ ] `login`
  - [ ] `logout`
  - [ ] `settings_change`
- [ ] Use consistent audit `record_type` values
  - [ ] `workspace`
  - [ ] `workspace_setting`
  - [ ] `user`
  - [ ] `client`
  - [ ] `project`
  - [ ] `time_entry`
  - [ ] Future:
    - [ ] `tag`
    - [ ] `tag_assignment`
    - [ ] `milestone`
    - [ ] `task`
    - [ ] `note`
    - [ ] `support_ticket`
    - [ ] `invoice`
    - [ ] `api_key`
    - [ ] `attachment`
- [ ] Add audit logging for current app records
  - [ ] Time entries: create, update, delete when delete exists
  - [ ] Workspace settings: update
  - [ ] Users: create, email/display-name update, password reset, deactivate, reactivate, delete
  - [ ] Workspace memberships: create, update, remove
  - [ ] Clients: create, update, archive/delete
  - [ ] Projects: create, update, archive/delete
- [ ] Keep audit log and activity feed conceptually separate
  - [ ] Audit log is for admin/security/history/verification
  - [ ] Activity feed is for dashboard-friendly "latest updates"
  - [ ] The activity feed may use audit events as a source, but should not force the audit table to become a general UX feed forever
- [ ] Run `npm run check`

## Version 0.25.1 - Audit Log Settings

- [ ] Add audit log settings to Workspace Settings below billing settings
  - [ ] App audit logging checkbox where checked means audit logging is on
  - [ ] Log when audit logging is turned off and on
  - [ ] Turning audit logging off should create an audit record before logging is disabled
  - [ ] Turning audit logging back on should create an audit record after logging is enabled
- [ ] Add retention settings
  - [ ] 7 days
  - [ ] 14 days
  - [ ] 30 days
  - [ ] 60 days
  - [ ] 90 days
  - [ ] 180 days
  - [ ] 1 year
  - [ ] Default retention to 30 days
- [ ] Store audit settings in the database
  - [ ] Add fields to workspace settings or create a dedicated `workspace_audit_settings` table
  - [ ] Recommended fields: `audit_logging_enabled`, `audit_retention_days`, `audit_settings_updated_at`
- [ ] Add audit retention cleanup
  - [ ] Cleanup should be workspace-scoped
  - [ ] Cleanup should respect each workspace's configured retention period
  - [ ] Cleanup may run on app startup, on a scheduled/admin-triggered path, or before audit-log reads
  - [ ] Do not delete logs newer than the configured retention period
- [ ] Run `npm run check`

## Version 0.25.2 - Admin Audit Log Viewer

- [ ] Add an admin page for audit logs
  - [ ] Place the page in Settings, below User Administration
  - [ ] Restrict access to users with the appropriate admin rights
- [ ] Show a readable audit table
  - [ ] Date
  - [ ] User
  - [ ] Client
  - [ ] Project
  - [ ] Record Type
  - [ ] Change Type
  - [ ] Record Label
- [ ] Add filters
  - [ ] Date range
  - [ ] User
  - [ ] Record type
  - [ ] Change type
  - [ ] Client/project where available
- [ ] Add details modal
  - [ ] Link each row to a modal that displays full audit details
  - [ ] Pretty-print `previous_value_json`
  - [ ] Pretty-print `new_value_json`
  - [ ] Pretty-print `metadata_json`
  - [ ] Collapse/expand large JSON objects
  - [ ] Show empty/null JSON fields as "None"
- [ ] Add useful navigation
  - [ ] Clicking a user in the table filters by that user
  - [ ] Clicking a record in the modal opens that record's edit/details screen when a safe route exists
- [ ] Add exports
  - [ ] Full audit log export as CSV
  - [ ] Filtered audit log export as CSV
- [ ] Run `npm run check`

## Version 0.26.0 - Roles, Permissions, and Team Foundation

- [ ] Add roles
  - [ ] Users can be assigned multiple roles
  - [ ] Super Admin controls all workspaces in the app
  - [ ] Workspace Administrator controls users, clients, projects, settings, and records within a workspace
  - [ ] Client Administrator controls client details, client projects, and assigned users for a specific client
  - [ ] Project Administrator controls project details and assigned users for a specific project
  - [ ] Client User can contribute to permitted client/project areas
  - [ ] Project User can contribute to a specific project
  - [ ] External Client User can collaborate with limited access
- [ ] Add database tables for roles and scoped assignments
  - [ ] `roles`
  - [ ] `permissions`
  - [ ] `role_permissions`
  - [ ] `user_role_assignments`
  - [ ] Support `workspace_id`, `client_id`, `project_id`, `scope_type`, and `scope_id`
- [ ] Add group/team permissions
  - [ ] Add groups/teams that belong to a workspace
  - [ ] Allow admins to add/remove users from groups
  - [ ] Allow groups to receive roles/permissions at workspace, client, or project scope
  - [ ] Keep group permissions compatible with direct user role assignments
- [ ] Add permission-checking service
  - [ ] Create a shared permission helper such as `permissionsService.can(session, action, resource)`
  - [ ] Services should call permission checks before changing data
  - [ ] Routes may use middleware for broad permission checks
  - [ ] Record-specific checks should live close to service logic
- [ ] Add granular CRUD controls
  - [ ] Client admins can be restricted from editing billing details by workspace admins
  - [ ] Project admins can be restricted from editing billing details by client/workspace admins
  - [ ] Add controls for manual time entry and edit time entries
  - [ ] Client/project users should only access their own time entries unless granted broader permission
  - [ ] Put granular controls behind an Advanced button
- [ ] Update user administration
  - [ ] Assign users to roles and specific workspaces/clients/projects from the edit user modal
  - [ ] Show existing role assignments in the edit user modal
  - [ ] Allow admins to add/remove assignments without deleting the user
  - [ ] Audit log role and group assignment changes
- [ ] Apply permissions to existing areas
  - [ ] User administration
  - [ ] Workspace settings
  - [ ] Client management
  - [ ] Project management
  - [ ] Time tracking
  - [ ] Manual time entry
  - [ ] Edit entries
  - [ ] Reporting
  - [ ] Audit log viewer
- [ ] Prepare role checks for future areas
  - [ ] Tags
  - [ ] Milestones
  - [ ] Tasks
  - [ ] Notes/knowledge base
  - [ ] Support tickets
  - [ ] Invoicing
  - [ ] Attachments
  - [ ] Public API keys
- [ ] Run `npm run check`

## Version 0.27.0 - Public API and API Key Foundation

- [ ] Create public-facing API foundation
  - [ ] Do not expose the current browser `/api` routes as the long-term public API
  - [ ] Keep browser/internal routes under `/api`
  - [ ] Add stable external routes under `/api/v1`
  - [ ] Public API responses should be consistent, documented, and versioned
- [ ] Add API key database support
  - [ ] `api_keys` table with `api_key_id`, `workspace_id`, `created_by_user_id`, `name`, `key_hash`, `key_prefix`, `status`, `created_at`, `last_used_at`, and `revoked_at`
  - [ ] Store only hashed API keys
  - [ ] Show the raw API key only once at creation time
- [ ] Add API key scopes
  - [ ] `api_key_scopes` table or JSON scope field
  - [ ] Include initial scopes for clients, projects, time entries, tasks, notes, tickets, and tags
- [ ] Add API key authentication middleware
  - [ ] API key auth should be separate from browser session cookie auth
  - [ ] API key auth should resolve workspace context
  - [ ] API key auth should enforce scopes
  - [ ] API key use should update `last_used_at`
  - [ ] API key create/revoke/use failures should be audit logged where appropriate
- [ ] Add first public API endpoints
  - [ ] `GET /api/v1/clients`
  - [ ] `GET /api/v1/clients/:clientId`
  - [ ] `GET /api/v1/projects`
  - [ ] `GET /api/v1/projects/:projectId`
  - [ ] `GET /api/v1/time-entries`
  - [ ] `POST /api/v1/time-entries`
- [ ] Add API response basics
  - [ ] Pagination for list endpoints
  - [ ] Consistent error response shape
  - [ ] Stable IDs
  - [ ] ISO timestamps
  - [ ] Workspace scoping
  - [ ] Permission/scope checks
- [ ] Add API key admin UI
  - [ ] Create key
  - [ ] Name key
  - [ ] Select scopes
  - [ ] Revoke key
  - [ ] Show created date and last-used date
  - [ ] Show only key prefix after creation
- [ ] Run `npm run check`

## Version 0.28.0 - Module-Ready Architecture

- [ ] Create module-ready backend structure
  - [ ] Goal is not full plugin install/uninstall yet
  - [ ] Goal is to prevent the app from becoming one giant time-tracker-shaped codebase before notes, tasks, support tickets, invoicing, and integrations are added
- [ ] Introduce a `src/core/` area for shared infrastructure
  - [ ] App creation/bootstrap
  - [ ] Database helpers
  - [ ] Migration runner
  - [ ] Auth/session helpers
  - [ ] Permission helpers
  - [ ] Audit service
  - [ ] API key auth
  - [ ] Shared AppError/error handling
- [ ] Introduce a `src/modules/` area
  - [ ] `src/modules/time-tracking/`
  - [ ] `src/modules/clients/` or `src/modules/client-projects/`
  - [ ] `src/modules/users/`
  - [ ] Future:
    - [ ] `src/modules/tasks/`
    - [ ] `src/modules/notes/`
    - [ ] `src/modules/support-tickets/`
    - [ ] `src/modules/invoicing/`
    - [ ] `src/modules/integrations/`
    - [ ] `src/modules/files/`
- [ ] Each module should be able to own routes, services, repositories, validators, migrations, browser JS, protected views, and seed/default data where appropriate
- [ ] Add a module registry
  - [ ] The app should know which modules exist
  - [ ] The app should know which modules are enabled for a workspace
  - [ ] The registry can be simple at first, such as a static JavaScript module exporting module definitions
- [ ] Add database support for enabled modules
  - [ ] `modules` table or equivalent
  - [ ] `workspace_modules` table or equivalent
  - [ ] Track enabled/disabled state per workspace when workspace-level modules are supported
- [ ] Make migrations module-aware
  - [ ] Core migrations should still run first
  - [ ] Module migrations should run after core migrations
  - [ ] Migration checksums should continue to work
  - [ ] Applied migrations should record enough information to identify the owning module
- [ ] Move existing code gradually
  - [ ] Do not do a risky all-at-once restructure
  - [ ] Move time tracking into a module first
  - [ ] Move clients/projects into a module or shared domain module
  - [ ] Keep route behavior unchanged while moving files
  - [ ] Run `npm run check` after each move
- [ ] Prepare for installable modules later
  - [ ] Time-tracking/billing/invoicing module
  - [ ] Notes/knowledge base module
  - [ ] Support tickets module
  - [ ] Tasks module
  - [ ] Integrations module
- [ ] Run `npm run check`

## Version 0.29.0 - Shared Billing and Reporting Services

- [ ] Consolidate billing, rounding, and date-range calculations
  - [ ] Reporting and Dashboard should not maintain separate versions of the same billing logic
  - [ ] Create shared browser helper first if staying frontend-only
  - [ ] Consider moving billing calculations server-side later for API consistency
- [ ] Shared billing logic should support:
  - [ ] Workspace defaults
  - [ ] Client overrides
  - [ ] Project overrides
  - [ ] Billable/non-billable status
  - [ ] Round-hours setting for unbillable clients/projects
  - [ ] Billing periods
  - [ ] Custom date ranges
- [ ] Reporting and Dashboard should use the same calculation source
  - [ ] Current month billables
  - [ ] Previous 12 months chart
  - [ ] Client report
  - [ ] Future invoice calculations
  - [ ] Future API reporting endpoints
- [ ] Run `npm run check`

## Version 0.29.1 - Core Time Tracking Maturity

- [ ] Add timer persistence
  - [ ] Timers should survive page refresh where reasonable
  - [ ] Timers should survive accidental navigation where reasonable
  - [ ] Timer state should be scoped to user and active workspace
- [ ] Store enough state to restore:
  - [ ] Timer number
  - [ ] Client filter/context where present
  - [ ] Project
  - [ ] Description
  - [ ] Billable flag
  - [ ] Elapsed time
  - [ ] Active start time
  - [ ] Running/paused state
- [ ] Build on the timer state refactor from Version 0.22.5
- [ ] Warn about running timers through the notification/toast system when that exists
- [ ] Run `npm run check`

## Version 0.30.0 - Project Management Foundation

- [ ] Add project status and project health fields
  - [ ] Project status values: `active`, `paused`, `completed`, `archived`
  - [ ] Project health values: `on_track`, `at_risk`, `blocked`, `waiting_on_client`
  - [ ] Surface project health on project settings/details screens
  - [ ] Prepare dashboard support for project health summaries
- [ ] Add owner/responsible-user fields
  - [ ] Workspace owner should already exist from the workspace migration
  - [ ] Add client/account owner
  - [ ] Add project owner
  - [ ] Keep task assignee separate from project ownership
  - [ ] Respect permissions when assigning owners
- [ ] Add milestones/phases/deliverables
  - [ ] Milestones belong to a workspace and may optionally link to a client and/or project
  - [ ] Milestones include title, description, status, due date, sort order, and optional completed date
  - [ ] Do not require tasks, notes, tickets, time entries, or files to link to milestones yet
  - [ ] Leave clear foreign-key/path support for those future links
- [ ] Add milestone CRUD
  - [ ] Create/list/update/archive milestones
  - [ ] Add basic project-level milestone display
  - [ ] Keep UI simple and compatible with future task linking
- [ ] Run `npm run check`

## Version 0.31.0 - Shared Tagging Foundation

- [ ] Replace any time-entry-only tag plan with a shared tagging foundation
  - [ ] Tags should be workspace-scoped
  - [ ] Tags should not be stored as comma-separated text on records
- [ ] Create shared tag tables
  - [ ] `tags` table for tag definitions
  - [ ] `tag_assignments` table for assigning tags to records
  - [ ] `tag_assignments` should support `workspace_id`, `tag_id`, `target_type`, `target_id`, `created_by_user_id`, `source`, and `created_at`
- [ ] Support initial `target_type` values
  - [ ] `time_entry`
  - [ ] `client`
  - [ ] `project`
  - [ ] `milestone`
- [ ] Reserve future `target_type` values
  - [ ] `task`
  - [ ] `note`
  - [ ] `support_ticket`
  - [ ] `invoice`
  - [ ] `attachment`
- [ ] Create shared tag repository/service methods
  - [ ] Validate that tagged records belong to the active workspace
  - [ ] Audit log tag create/update/delete and tag assignment changes
  - [ ] Keep tag logic reusable for future tasks, notes, tickets, and invoices
- [ ] Add basic tag management inside workspace settings or a simple admin page
- [ ] Run `npm run check`

## Version 0.31.1 - Time Entry Tagging and Tag Reporting

- [ ] Add tags to time entries first
  - [ ] Add tag picker/search UI to time tracker cards
  - [ ] Add tag picker/search UI to manual time entry
  - [ ] Add tag picker/search UI to edit-entry screens
  - [ ] Save tag assignments through the shared tagging service
- [ ] Add reporting filters by direct time-entry tags
  - [ ] Filter reports by one or more tags
  - [ ] Keep filtering scoped to direct time-entry tags in this version
  - [ ] Do not automatically infer tags from clients/projects yet
- [ ] Run `npm run check`

## Version 0.31.2 - Client and Project Tagging

- [ ] Allow clients and projects to be tagged as records
  - [ ] Add tag UI to client settings
  - [ ] Add tag UI to project settings
  - [ ] Show client/project tags as context on time entries
- [ ] Do not automatically copy client/project tags onto time entries
  - [ ] Keep direct time-entry tags separate from contextual client/project tags
  - [ ] Later reporting can optionally include records under clients/projects with matching tags
- [ ] Add optional system tag groundwork
  - [ ] Add system/automatic tags only after manual tagging works
  - [ ] Use real fields for behavior/security, then optionally expose them as system tags
  - [ ] Example: note visibility should be stored as `visibility`, not enforced by `#public`
  - [ ] System tags should be locked or protected from accidental deletion
- [ ] Run `npm run check`

## Version 0.32.0 - Toasts, Notifications, and Alerts

- [ ] Add toast and notification infrastructure
  - [ ] Add a reusable toast component
  - [ ] Add a notification store/table if persistence is needed
  - [ ] Keep transient toasts and persistent notifications conceptually separate
- [ ] Add timer-related warnings
  - [ ] Warn about running timers once DB timer persistence exists
  - [ ] Use in-app UI instead of browser alert modals
- [ ] Prepare future notification types
  - [ ] Task notifications
  - [ ] Task reminders
  - [ ] Assignment notifications
  - [ ] Support ticket notifications
  - [ ] Slack, Discord, and Teams integration notifications later
- [ ] Run `npm run check`

## Version 0.32.1 - In-App Messaging and Invitations

- [ ] Create a dedicated Messages area in the main menu
  - [ ] The first version is only for system-generated requests and invites
  - [ ] Do not build general user-to-user chat yet
- [ ] Add automated invite/request messages
  - [ ] Workspace join requests
  - [ ] Workspace invites
  - [ ] Client/project access requests where permissions allow
  - [ ] Client/project invites where permissions allow
- [ ] Connect messages to notifications
  - [ ] Use toast notifications for new invites/requests
  - [ ] Keep a persistent message record for review and action
- [ ] Add assignment messages later-ready support
  - [ ] Prepare for notifications when users are assigned a task, note, workspace, client, project, or ticket
  - [ ] Do not implement task/note assignment messages until those records exist
- [ ] Run `npm run check`

## Version 0.33.0 - Basic Tasks

- [ ] Add task database support
  - [ ] Task title
  - [ ] Task description
  - [ ] Workspace link
  - [ ] Optional client link
  - [ ] Optional project link
  - [ ] Optional milestone link
  - [ ] Creator user ID
  - [ ] Status: `open`, `in_progress`, `blocked`, `completed`, `archived`
  - [ ] Optional due date
  - [ ] Optional due time
  - [ ] Parent task ID
  - [ ] Sort order
  - [ ] Tags through the shared tagging service
- [ ] Add parent/child task support
  - [ ] Parent task ID gives the parent task a progress bar
  - [ ] Task progress bars can be turned off in the parent task details or project/client/workspace settings later
  - [ ] Prevent loops by disallowing tasks to become a child of themselves or descendants
- [ ] Add basic recurrence fields
  - [ ] `recurrence_enabled`
  - [ ] `recurrence_rule`
  - [ ] `recurrence_anchor_date`
  - [ ] `recurrence_next_due_at`
  - [ ] `recurrence_end_date`
  - [ ] `recurrence_task_template_id`
- [ ] Add basic task UI
  - [ ] List tasks by active workspace
  - [ ] Filter tasks by client, project, status, assignee when available, tag, due date, and milestone where available
  - [ ] Create/edit/archive tasks
  - [ ] Respect roles and permissions
- [ ] Run `npm run check`

## Version 0.33.1 - Task Assignments, Reminders, Templates, and Checklists

- [ ] Add multi-person task assignment support
  - [ ] Create a task assignment join table
  - [ ] Allow one or more users to be assigned to a task
  - [ ] Respect workspace/client/project permissions when assigning users
- [ ] Add task reminders
  - [ ] Reminders should work in addition to tasks appearing on calendars/notifications
  - [ ] Reminder defaults can later be configurable at workspace, client, and project levels
- [ ] Add recurrence task templates
  - [ ] Create a separate recurrence task template table
  - [ ] Preserve the original completed task
  - [ ] Generate a new standard task from the template when recurrence rules require it
- [ ] Add task checklists
  - [ ] Checklist items belong to a task
  - [ ] Items can be checked/unchecked and sorted
  - [ ] Checklist completion can optionally contribute to task progress
- [ ] Add assignment notifications through the notification/message system where possible
- [ ] Run `npm run check`

## Version 0.33.2 - Task Dependencies and Blockers

- [ ] Add task dependencies/blockers
  - [ ] Allow one task to depend on another task
  - [ ] Show blocked tasks clearly
  - [ ] Prevent circular dependencies
  - [ ] Allow blocked-by relationships across the same project
  - [ ] Leave room for cross-project blockers later
- [ ] Connect dependency state to task status carefully
  - [ ] Do not automatically overwrite a user's chosen status unless the rule is explicit and predictable
  - [ ] Provide clear blocked-by context in task details
- [ ] Run `npm run check`

## Version 0.34.0 - Project and Task Views

- [ ] Add task list view first
  - [ ] Provide fast filters for workspace, client, project, milestone, status, assignee, tags, and due date
  - [ ] Keep the view usable before Kanban/calendar/timeline features exist
- [ ] Add saved filters/views
  - [ ] Saved views are user-specific first
  - [ ] Saved views may apply to tasks, time entries, tickets, notes, and dashboard sections later
  - [ ] Workspace-shared views can come later
- [ ] Add Kanban board view
  - [ ] Group tasks by status
  - [ ] Allow drag/drop only if it can update status safely and accessibly
  - [ ] Respect permissions before allowing status changes
- [ ] Add calendar view for tasks with due dates
  - [ ] Use timezone utilities from the UTC/timezone foundation
  - [ ] Keep external calendar sync out of scope for this version
- [ ] Consider timeline/Gantt-style view later
  - [ ] Do not build Gantt charts until dependencies, milestones, due dates, and task duration assumptions are stable
- [ ] Run `npm run check`

## Version 0.35.0 - Dashboard as Project Hub

- [ ] Make Dashboard the hub for managing work across workspaces
  - [ ] Dashboard is per user
  - [ ] Display the user's workspaces, clients, projects, and current responsibilities
  - [ ] Respect permissions across every section
- [ ] Add Past Due/Due Soon section
  - [ ] Show past-due and upcoming tasks sorted by workspace, then client, then project
  - [ ] Include due date/time and assignment context
- [ ] Add Latest Updates section
  - [ ] Newest clients
  - [ ] Newest projects
  - [ ] Newest tasks
  - [ ] Newest notes
  - [ ] Newest support tickets
  - [ ] Recent time entries if useful
- [ ] Add project health summaries
  - [ ] Show active projects that are blocked, at risk, or waiting on client
  - [ ] Keep summaries scoped to records the user can see
- [ ] Add activity feed support
  - [ ] Activity feed may be derived from audit events where appropriate
  - [ ] Activity feed should not expose sensitive audit JSON by default
  - [ ] Activity feed should be user-friendly and dashboard-focused
  - [ ] Keep audit log as the authoritative admin/security record
- [ ] Run `npm run check`

## Version 0.36.0 - Knowledge Base and Notes

- [ ] Add basic notes
  - [ ] Markdown body
  - [ ] Title
  - [ ] Workspace assignment
  - [ ] Optional client assignment
  - [ ] Optional project assignment
  - [ ] Optional milestone/task/ticket links later
  - [ ] Internal/public/client visibility field, even if public rendering does not exist yet
  - [ ] Draft/published/archived status
  - [ ] Basic editor
  - [ ] Hideable Markdown cheat sheet
  - [ ] Note list by workspace, client, and project
- [ ] Add note changelog behavior
  - [ ] Notes should have persistent change history
  - [ ] Audit logs may provide source events, but note history should remain available according to note/history rules rather than short audit retention
- [ ] Apply tags through the shared tagging service
- [ ] Respect permissions and visibility rules
- [ ] Run `npm run check`

## Version 0.36.1 - Automatic Internal Knowledge Base Pages

- [ ] Add auto-generated internal pages
  - [ ] Workspace home
  - [ ] Client home
  - [ ] Project home
  - [ ] Workspace notes list
  - [ ] Client notes list
  - [ ] Project notes list
- [ ] Add activity-aware home page sections
  - [ ] Latest notes
  - [ ] Latest tasks
  - [ ] Latest tickets
  - [ ] Latest project changes
  - [ ] To-do list
  - [ ] Open tickets
- [ ] Use a friendly activity feed, not raw audit JSON
- [ ] Run `npm run check`

## Version 0.36.2 - Manual Knowledge Base Pages and Wiki Links

- [ ] Let users create manual knowledge base pages
  - [ ] Under workspace
  - [ ] Under client
  - [ ] Under project
  - [ ] Under another manual page
- [ ] Add manual page fields
  - [ ] Title
  - [ ] Slug
  - [ ] Markdown body
  - [ ] Parent page
  - [ ] Sort order
  - [ ] Visibility
  - [ ] Status
- [ ] Add wiki-link support
  - [ ] `[[Page Title]]`
  - [ ] `[[Page Title|label]]`
  - [ ] Broken-link detection
  - [ ] Backlinks
  - [ ] Tags where useful
- [ ] Run `npm run check`

## Version 0.36.3 - Public Knowledge Base

- [ ] Add public knowledge base routes
  - [ ] `/kb/:workspaceSlug`
  - [ ] `/kb/:workspaceSlug/:pageSlug`
  - [ ] Leave custom domains/subdomains for later
- [ ] Add public rendering safeguards
  - [ ] Public/private visibility checks
  - [ ] Public page renderer
  - [ ] SEO fields
  - [ ] Search
  - [ ] Sitemap
  - [ ] Public-safe attachments
- [ ] Do not expose internal notes, audit details, private files, or client-only records publicly
- [ ] Run `npm run check`

## Version 0.37.0 - Support Tickets

- [ ] Research and define the support ticket model before implementation
  - [ ] Review the minimum fields and flows expected from common support ticket systems
  - [ ] Keep the first version small enough to support client/project work without becoming a full helpdesk clone
- [ ] Add ticket database support
  - [ ] Tickets belong to a workspace
  - [ ] Tickets may link to a client, project, milestone, task, and tags
  - [ ] Tickets have status, priority, subject/title, description, requester, owner/assignee, and timestamps
- [ ] Add ticket UI
  - [ ] Create/list/update/archive tickets
  - [ ] Filter by status, priority, client, project, owner, tag, and date
  - [ ] Respect roles and permissions
- [ ] Add internal notes/comments for tickets
  - [ ] Internal notes are not client-visible
  - [ ] External/client-visible responses come later
- [ ] Prepare public-facing intake
  - [ ] Include CAPTCHA or equivalent protection for public-facing forms
  - [ ] Do not expose public ticket forms until visibility, permissions, spam protection, and rate limiting are ready
- [ ] Run `npm run check`

## Version 0.37.1 - Record Comments and Discussions

- [ ] Add comments to records
  - [ ] Tasks
  - [ ] Projects
  - [ ] Support tickets
  - [ ] Notes where appropriate
- [ ] Comments should respect permissions and visibility
  - [ ] Internal-only comments must not leak to client-visible or public contexts
  - [ ] Comments should identify author, created date, updated date, and edited state where applicable
- [ ] Comments should appear in activity feeds where appropriate
- [ ] Audit log create/update/delete comment actions where appropriate
- [ ] Run `npm run check`

## Version 0.38.0 - Files and Attachments Foundation

- [ ] Add file attachment foundation for notes, tasks, support tickets, projects, and milestones
  - [ ] Store file metadata in the database
  - [ ] Link attachments to records through a generic attachment assignment table
  - [ ] Respect workspace/client/project permissions
- [ ] Decide storage strategy behind a clear abstraction
  - [ ] Support local storage first if simplest for self-hosted installs
  - [ ] Leave room for object storage later
  - [ ] Do not hard-code storage paths throughout feature modules
- [ ] Add public-safe attachment rules
  - [ ] Public-safe attachments are required before public KB/client portal features
  - [ ] Internal/private attachments must not be exposed through public routes
- [ ] Add basic attachment UI
  - [ ] Upload
  - [ ] List
  - [ ] Download/open where safe
  - [ ] Delete/archive according to permissions
- [ ] Run `npm run check`

## Version 0.39.0 - Project Budgets, Estimates, and Expanded Reporting

- [ ] Add project estimates and budgets
  - [ ] Add estimated hours to projects
  - [ ] Add optional budgeted hours to projects
  - [ ] Add optional budgeted dollars to projects
- [ ] Compare estimates and budgets against actual tracked time
  - [ ] Show estimated vs actual tracked hours
  - [ ] Show budget/burn progress on project pages
  - [ ] Show project budget/burn progress on dashboard where useful
- [ ] Expand reporting
  - [ ] Report by workspace
  - [ ] Report by client
  - [ ] Report by project
  - [ ] Report by milestone
  - [ ] Report by tag
  - [ ] Report by date range
  - [ ] Keep billing logic centralized through the shared billing/reporting service
- [ ] Run `npm run check`

## Version 0.39.1 - Client Approvals and Change Requests

- [ ] Add lightweight approval records
  - [ ] Track requested_by, approved_by, approved_at, status, and notes
  - [ ] Link approvals to clients, projects, milestones, tasks, notes, tickets, or files where appropriate
- [ ] Add change request records
  - [ ] Track request details, status, requester, approver, and related records
  - [ ] Link change requests to client/project scope
  - [ ] Make the feature useful for project history and billing justification without requiring a full contract-management system
- [ ] Keep client-facing approval actions out of scope until permissions/client portal features are ready
- [ ] Run `npm run check`

## Version 0.40.0 - Calendars

- [ ] Add internal calendar support
  - [ ] Show tasks with due dates
  - [ ] Show milestones with due dates
  - [ ] Show reminders where appropriate
  - [ ] Respect timezone settings
  - [ ] Respect permissions
- [ ] Add calendar filters
  - [ ] Workspace
  - [ ] Client
  - [ ] Project
  - [ ] User/assignee
  - [ ] Record type
- [ ] Keep external calendar sync out of scope for this version
- [ ] Run `npm run check`

## Version 0.41.0 - Technical Strategy Spikes

- [ ] Evaluate full-text search needs
  - [ ] Decide when basic SQL search is sufficient
  - [ ] Decide when to add a dedicated search technology
  - [ ] Compare options such as SQLite FTS, PostgreSQL full-text search, and external search services before adding operational complexity
- [ ] Evaluate caching needs
  - [ ] Identify slow or expensive reads first
  - [ ] Decide whether Redis or another cache is justified
  - [ ] Avoid adding caching before there is a measured performance reason
- [ ] Evaluate front-end framework needs
  - [ ] Decide whether plain browser JavaScript remains practical
  - [ ] Identify the point where a JS framework would reduce complexity rather than add it
- [ ] Add geolocation settings if there is a clear feature need
  - [ ] Keep geolocation settings separate from timezone settings
- [ ] Run `npm run check` after any code changes from these spikes

## Version 0.42.0 - Update Checks and Self-Hosted Upgrade Prep

- [ ] Add automated checks for updates from GitHub Releases
  - [ ] Make newer-version discovery available to self-hosted administrators
  - [ ] Display current installed version and latest available version
  - [ ] Do not auto-update without explicit administrator action
- [ ] Prepare install/update scripts
  - [ ] Make updating to newer versions as painless as possible for self-hosted users
  - [ ] Create installation/update scripts that can eventually be run from the front end
  - [ ] Ensure migrations/checksums remain safe during updates
- [ ] Run `npm run check`

## Version 0.43.0 - UI Polish and Administration Documentation

- [ ] Start developing administration documentation
  - [ ] User setup
  - [ ] Workspace setup
  - [ ] Backups
  - [ ] Updates
  - [ ] Audit logs
  - [ ] Roles and permissions
  - [ ] API keys
- [ ] Improve the UI presentation
  - [ ] Make the interface cleaner and more consistent
  - [ ] Fix poor dark-mode color choices
  - [ ] Keep accessibility in mind for contrast, focus states, and keyboard navigation
- [ ] Run `npm run check`

## Version 0.44.0 - External Publishing and Plugins

- [ ] Build external publishing only after public API/auth/scopes are in good shape
- [ ] Add WordPress knowledge base plugin support
  - [ ] Sync public-safe knowledge base content by API key
  - [ ] Respect visibility and workspace/client/project permissions
- [ ] Add Shopify knowledge base/product-support plugin support
  - [ ] Sync public-safe knowledge base/product support content by API key
  - [ ] Respect product-support use cases without exposing internal records
- [ ] Add optional embeddable widgets later
- [ ] Run `npm run check`

## Version 0.45.0 - Integrations and Plugin Readiness

- [ ] Build integrations only after public API, API keys/scopes, roles/permissions, and module boundaries are in place
- [ ] Google Calendar
  - [ ] Support scheduling/syncing tasks after internal calendar support is stable
- [ ] Outlook Calendar
  - [ ] Support scheduling/syncing tasks after internal calendar support is stable
- [ ] ZenDesk
  - [ ] Add import support
  - [ ] Consider sync later
- [ ] Google Tasks
  - [ ] Add import support
  - [ ] Consider sync later
- [ ] Microsoft To Do
  - [ ] Add import support
  - [ ] Consider sync later
- [ ] Microsoft SharePoint
  - [ ] Research document/KB/project use cases before implementation
- [ ] WordPress/WooCommerce
  - [ ] Support ticket plugin
  - [ ] Knowledge base plugin
- [ ] Shopify
  - [ ] Knowledge base plugin
  - [ ] Support ticket plugin
  - [ ] Consider Shopify Admin notes integration where useful
- [ ] BigCommerce
  - [ ] Same general support/KB direction as WordPress and Shopify
- [ ] Magento
  - [ ] Same general support/KB direction as WordPress and Shopify
- [ ] Slack
  - [ ] Task reminders
  - [ ] Support ticket notifications
- [ ] Discord
  - [ ] Same general notification direction as Slack
- [ ] Microsoft Teams
  - [ ] Same general notification direction as Slack
- [ ] QuickBooks
  - [ ] Bring in invoice details
- [ ] Other accounting software
  - [ ] Research after QuickBooks direction is clearer
- [ ] Integration architecture
  - [ ] Integrations should authenticate through API keys, OAuth, or integration-specific credentials as appropriate
  - [ ] Integrations should respect workspace, client, project, and user permissions
  - [ ] Integration events should be audit logged where appropriate
  - [ ] Integration-created records should identify their source in metadata
  - [ ] Avoid integration-specific logic leaking into core services where a module or adapter would be cleaner
- [ ] Run `npm run check`

## Version 0.50.0 - Production, Packaging, and Self-Hosting

- [ ] Move to a demo production environment
- [ ] Add PostgreSQL support
  - [ ] Add a database adapter layer so the app is not permanently tied to shelling out to the SQLite CLI
  - [ ] Keep SQLite support for local/self-hosted lightweight installs if practical
  - [ ] PostgreSQL should become the preferred production database
- [ ] Add backups/export/import
  - [ ] Workspace export
  - [ ] Workspace import
  - [ ] Database backup guidance
  - [ ] Attachment backup guidance when files exist
- [ ] Add email delivery
  - [ ] Support invite links
  - [ ] Support future notifications and account recovery workflows
  - [ ] Do not require outbound email for local-only self-hosted use if avoidable
- [ ] Docker Compose
- [ ] Setup wizard
- [ ] Admin docs
- [ ] Self-hosted release
- [ ] Run `npm run check`

## Version 0.55.0 - Personal and Family Workspaces

- [ ] Strengthen personal workspace support
  - [ ] Personal workspaces have no clients by default
  - [ ] Personal workspaces support unlimited projects, tasks, notes/knowledge base, and calendars
  - [ ] Personal workspaces may support optional time tracking
- [ ] Strengthen family workspace support
  - [ ] Family workspaces support collaborators
  - [ ] Add family-focused permissions such as adult/child account patterns when appropriate
  - [ ] Keep user privacy and account ownership clear
- [ ] Incorporate personal/private per-user tasks, projects, and related records for users who also belong to business workspaces
- [ ] Include advanced auth options when mature enough
  - [ ] Two Factor Authentication (TOTP)
  - [ ] Passkeys
  - [ ] SSO
- [ ] Run `npm run check`

## Version 0.60.0 - SaaS Wrapper

- [ ] Add SaaS wrapper
- [ ] Use hosted PostgreSQL
- [ ] Add tenant signup
- [ ] Add account-type rules
  - [ ] Personal users can create a single personal workspace
  - [ ] Family users can create a single personal workspace and use the shared family workspace
  - [ ] Business users can create business workspaces plus allowed personal/family workspaces
- [ ] Add hosted billing
- [ ] Add monitoring
- [ ] Keep self-hosted deployment viable unless explicitly dropped later

