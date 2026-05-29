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

## Version 0.23.1 - Database Audit Logging

- [x] Move audit logging to database
  - [x] Server/error logging should still be written to files in the logs/ directory
  - [x] Replace app-event CSV logging with a database-backed audit log for application-level changes
  - [x] Treat audit logging as core app infrastructure, not as a time-tracking-specific feature
  - [x] Include the following fields:
    - [x] audit_id
    - [x] organization_id (Foreign Key)
    - [x] created_at
    - [x] actor_user_id
    - [x] actor_user_name <- On the front end, I want to make this clickable
    - [x] action, change_type
    - [x] record_type, record_id, record_label, record_url <- On the front end, I want to make this clickable
    - [x] previous_value_json, new_value_json, metadata_json
- [x] Create an `audit_logs` table
  - [x] `audit_id TEXT PRIMARY KEY`
  - [x] `organization_id TEXT NOT NULL`
  - [x] `created_at TEXT NOT NULL`
  - [x] `actor_user_id TEXT`
  - [x] `actor_user_name TEXT`
  - [x] `action TEXT NOT NULL`
  - [x] `change_type TEXT NOT NULL`
  - [x] `record_type TEXT NOT NULL`
  - [x] `record_id TEXT`
  - [x] `record_label TEXT`
  - [x] `record_url TEXT`
  - [x] `previous_value_json TEXT`
  - [x] `new_value_json TEXT`
  - [x] `metadata_json TEXT`
- [x] Add audit-log indexes
  - [x] `organization_id, created_at`
  - [x] `organization_id, actor_user_id`
  - [x] `organization_id, record_type`
  - [x] `organization_id, change_type`
  - [x] `organization_id, record_id`
- [x] Create a shared `auditService.record()` function
  - [x] Services call `auditService.record()` after successful create/update/delete/archive actions
  - [x] Routes should not manually assemble audit rows unless there is no better service layer location
  - [x] Audit service should accept structured values and stringify JSON internally
  - [x] Audit service should gracefully handle null previous/new values for create/delete events
- [x] Use consistent audit `change_type` values
  - [x] `create`
  - [x] `update`
  - [x] `delete`
  - [x] `archive`
  - [x] `restore`
  - [x] `login`
  - [x] `logout`
  - [x] `settings_change`
- [x] Use consistent audit `record_type` values
  - [x] `organization`
  - [x] `organization_setting`
  - [x] `user`
  - [x] `client`
  - [x] `project`
  - [x] `time_entry`
  - [ ] Future:
    - [ ] `task`
    - [ ] `note`
    - [ ] `support_ticket`
    - [ ] `invoice`
    - [ ] `api_key`
- [x] Add audit logging for current app records
  - [x] Time entries:
    - [x] Create
    - [x] Update
    - [x] Delete when delete exists
  - [x] Organization settings:
    - [x] Update
  - [x] Users:
    - [x] Create
    - [x] Username update
    - [x] Password reset
    - [x] Deactivate
    - [x] Reactivate
    - [x] Delete
  - [x] Clients:
    - [x] Create
    - [x] Update
    - [x] Archive/delete
  - [x] Projects:
    - [x] Create
    - [x] Update
    - [x] Archive/delete
- [x] Keep audit log and activity feed conceptually separate
  - [x] Audit log is for admin/security/history/verification
  - [x] Activity feed is for dashboard-friendly "latest updates"
  - [x] The activity feed may use audit events as a source, but should not force the audit table to become a general UX feed forever

## Version 0.23.2 - Audit Log Settings

- [x] Add audit log settings to Organization settings below billing settings
  - [x] App audit logging checkbox (checked = on)
    - [x] Log when audit logging is turned off and on
    - [x] The act of turning audit logging off should still create an audit record before logging is disabled
    - [x] The act of turning audit logging back on should create an audit record after logging is enabled
  - [x] Retention period:
    - 7 days
    - 14 days
    - 30 days
    - 60 days
    - 90 days
    - 180 days
    - 1 year
  - [x] Default logging period to 30 days
- [x] Store audit settings in the database
  - [x] Add fields to `organization_settings` or create a dedicated `organization_audit_settings` table
  - [x] Recommended fields:
    - [x] `audit_logging_enabled`
    - [x] `audit_retention_days`
    - [x] `audit_settings_updated_at`
- [x] Add audit retention cleanup
  - [x] Cleanup should be organization-scoped
  - [x] Cleanup should respect each organization's configured retention period
  - [x] Cleanup may run on app startup, on a scheduled/admin-triggered path, or before audit-log reads
  - [x] Do not delete logs newer than the configured retention period

## Version 0.23.3 - Admin Audit Log Viewer

- [x] Add admin page for audit log (Settings menu, below User)
- [x] Show columns Date, User, Client, Project, Record Type, Change Type
- [x] Filter by date, user, record type, change type
- [x] Link each row to modal that displays full audit data, except JSON details
- [x] Create JSON modal viewer (make the JSON human readable)
  - [x] Pretty-print `previous_value_json`
  - [x] Pretty-print `new_value_json`
  - [x] Pretty-print `metadata_json`
  - [x] Collapse/expand large JSON objects
  - [x] Show empty/null JSON fields as “None”
- [x] Clicking on a user in the column view filters by user automatically
- [x] Clicking on a record in the modal view takes admin to edit page for that record
- [x] Full audit log export (CSV?)
- [x] Filtered audit log export (CSV?)

## Version 0.24.0 - Roles and Permissions Foundation

- [x] Add roles
  - [x] Users can be assigned multiple roles
    - Example: User 1 can be a client administrator for one client, project administrator for a different client, and a project user for another client
  - [x] Super Admin
    - Controls all organizations within the app
    - Can edit clients, projects, and users in each organization
    - Has full access to assign anyone to anything, while respecting role limits below
  - [x] Organization Administrator
    - Controls all clients, projects, and users within the organization
    - Cannot see clients/projects that belong to other organizations
  - [x] Client Administrator
    - Controls all client details, projects, and users for a specific client
  - [x] Project Administrator
    - Controls all projects and project details for a specific client
    - Can assign users to projects within the client
  - [x] Client User
    - Can contribute time to any projects within a client
  - [x] Project User
    - Can contribute time to a specific project
  - [x] Client Users (External)
    - For clients to collaborate with users within organizations
- [x] Add database tables for roles and scoped assignments
  - [x] `roles`
  - [x] `permissions`
  - [x] `role_permissions`
  - [x] `user_role_assignments`
  - [x] `user_role_assignments` should support scope fields:
    - [x] `organization_id`
    - [x] `client_id`
    - [x] `project_id`
    - [x] `scope_type`
    - [x] `scope_id`
- [x] Add permission-checking service
  - [x] Create a shared permission helper, for example `permissionsService.can(session, action, resource)`
  - [x] Services should call permission checks before changing data
  - [x] Routes may use middleware for broad permission checks, but record-specific checks should live close to the service logic
- [x] Add granular CRUD control once a user is assigned to a client or project
  - [x] Client admins can be restricted from editing billing details by the org admin
  - [x] Project admins can be restricted from editing billing details by the client/org admins
  - [x] Add ability to control access to manual time entry and edit time entries
  - [x] For client user and project user roles, users can only access their own times
  - [x] Put granular controls behind an Advanced button
- [x] Assign users to roles and specific clients/projects from within the edit user modal window
  - [x] The edit user modal should show existing role assignments
  - [x] Admins should be able to add/remove assignments without deleting the user
  - [x] Role assignments should be audit logged
- [x] Apply permissions to existing areas
  - [x] User administration
  - [x] Organization settings
  - [x] Client management
  - [x] Project management
  - [x] Time tracking
  - [x] Manual time entry
  - [x] Edit entries
  - [x] Reporting
  - [x] Audit log viewer
- [x] Prepare role checks for future areas
  - [x] Tasks
  - [x] Notes/knowledge base
  - [x] Support tickets
  - [x] Invoicing
  - [x] Public API keys

## Version 0.25.0 - Public API and API Key Foundation

- [x] Create public-facing API foundation
  - [x] Do not expose the current browser `/api` routes as the long-term public API
  - [x] Keep browser/internal routes under `/api`
  - [x] Add stable external routes under `/api/v1`
  - [x] Public API responses should be consistent, documented, and versioned
  - [x] Document the first public API contract in `docs/public-api.md`
- [x] Add API key database support
  - [x] `api_keys` table
    - [x] `api_key_id`
    - [x] `organization_id`
    - [x] `created_by_user_id`
    - [x] `name`
    - [x] `key_hash`
    - [x] `key_prefix`
    - [x] `status`
    - [x] `created_at`
    - [x] `last_used_at`
    - [x] `revoked_at`
  - [x] Store only hashed API keys
  - [x] Show the raw API key only once at creation time
- [x] Add API key scopes
  - [x] `api_key_scopes` table or JSON scope field
  - [ ] Scopes should map to high-level permissions, for example:
    - [x] `clients:read`
    - [x] `clients:write`
    - [x] `projects:read`
    - [x] `projects:write`
    - [x] `time_entries:read`
    - [x] `time_entries:write`
    - [x] `tasks:read`
    - [x] `tasks:write`
    - [x] `notes:read`
    - [x] `notes:write`
    - [x] `tickets:read`
    - [x] `tickets:write`
- [x] Add API key authentication middleware
  - [x] API key auth should be separate from browser session cookie auth
  - [x] API key auth should resolve organization context
  - [x] API key auth should enforce scopes
  - [x] API key use should update `last_used_at`
  - [x] API key create/revoke/use failures should be audit logged where appropriate
- [x] Add first public API endpoints
  - [x] `GET /api/v1/clients`
  - [x] `GET /api/v1/clients/:clientId`
  - [x] `GET /api/v1/projects`
  - [x] `GET /api/v1/projects/:projectId`
  - [x] `GET /api/v1/time-entries`
  - [x] `POST /api/v1/time-entries`
- [x] Add API response basics
  - [x] Pagination for list endpoints
  - [x] Consistent error response shape
  - [x] Stable IDs
  - [x] ISO timestamps
  - [x] Organization scoping
  - [x] Permission/scope checks
- [x] Add API key admin UI
  - [x] Create key
  - [x] Name key
  - [x] Select scopes
  - [x] Revoke key
  - [x] Show created date and last-used date
  - [x] Show only key prefix after creation

## Version 0.26.0 - Module-Ready Architecture

- [x] Create module-ready backend structure
  - [x] Goal is not full plugin install/uninstall yet
  - [x] Goal is to prevent the app from becoming one giant time-tracker-shaped codebase before notes, tasks, support tickets, invoicing, and integrations are added
- [x] Introduce a `src/core/` area for shared infrastructure
  - [x] App creation/bootstrap
  - [x] Database helpers
  - [x] Migration runner
  - [x] Auth/session helpers
  - [x] Permission helpers
  - [x] Audit service
  - [x] API key auth
  - [x] Shared AppError/error handling
- [x] Introduce a `src/modules/` area
  - [x] `src/modules/time-tracking/`
  - [x] `src/modules/clients/` or `src/modules/client-projects/`
  - [x] `src/modules/users/`
  - [x] Future:
    - [x] `src/modules/tasks/`
    - [x] `src/modules/notes/`
    - [x] `src/modules/support-tickets/`
    - [x] `src/modules/invoicing/`
    - [x] `src/modules/integrations/`
- [x] Each module should be able to own:
  - [x] Routes
  - [x] Services
  - [x] Repositories
  - [x] Normalizers/validators
  - [x] Migrations
  - [x] Public/browser JS where appropriate
  - [x] Protected views where appropriate
  - [x] Seed/default data where appropriate
- [x] Add a module registry
  - [x] The app should know which modules exist
  - [x] The app should know which modules are enabled for an organization
  - [x] The registry can be simple at first, for example a static JavaScript module exporting module definitions
- [x] Add database support for enabled modules
  - [x] `modules` table or equivalent
  - [x] `organization_modules` table or equivalent
  - [x] Track enabled/disabled state per organization when the app supports organization-level modules
- [x] Make migrations module-aware
  - [x] Core migrations should still run first
  - [x] Module migrations should run after core migrations
  - [x] Migration checksums should continue to work
  - [x] Applied migrations should record enough information to identify the owning module
- [x] Move existing code gradually
  - [x] Do not do a risky all-at-once restructure
  - [x] Move time tracking into a module first
  - [x] Move clients/projects into a module or shared domain module
  - [x] Keep route behavior unchanged while moving files
  - [x] Run `npm run check` after each move
- [x] Prepare for installable modules later
  - [x] Time-tracking/billing/invoicing module
  - [x] Notes/knowledge base module
  - [x] Support tickets module
  - [x] Tasks module
  - [x] Integrations module

## Version 0.27.0 - Shared Billing and Reporting Services

- [x] Consolidate billing, rounding, and date-range calculations
  - [x] Reporting and Dashboard should not maintain separate versions of the same billing logic
  - [x] Create shared browser helper first if staying frontend-only
  - [x] Consider moving billing calculations server-side later for API consistency
- [x] Shared billing logic should support:
  - [x] Organization defaults
  - [x] Client overrides
  - [x] Project overrides
  - [x] Billable/non-billable status
  - [x] Round-hours setting for unbillable clients/projects
  - [x] Billing periods
  - [x] Custom date ranges
- [x] Reporting and Dashboard should use the same calculation source
  - [x] Current month billables
  - [x] Previous 12 months chart
  - [x] Client report
  - [x] Future invoice calculations
  - [x] Future API reporting endpoints

## Version 0.28.0 - Core Time Tracking Maturity

- [x] Add database-backed timer persistence
  - [x] Create `active_timers` table for running/paused timer state
  - [x] Do not store in-progress timers directly as completed `time_entries`
  - [x] Create active timer row when a timer starts
  - [x] Update active timer row when timer is paused, resumed, edited, or reset
  - [x] Do not update the database every second
  - [x] Store enough state to restore:
    - [x] User
    - [x] Workspace/organization
    - [x] Timer slot/card identity
    - [x] Client, optional
    - [x] Project, required
    - [x] Description
    - [x] Billable flag
    - [x] Accumulated elapsed seconds
    - [x] Last active start time
    - [x] Running/paused state
  - [x] On page load, restore active timers for the authenticated user and active workspace
  - [x] If timer was running, calculate displayed time from accumulated elapsed seconds plus time since last active start
  - [x] If timer was paused, display accumulated elapsed seconds only
  - [x] On stop, create final `time_entries` row and remove/archive the active timer row
  - [x] Starting one timer should pause any other running timer for that user/workspace
  - [x] Timer persistence should build on the timer state refactor from Version 0.22.5
  - [x] Update the README file to reflect an accurate roadmap summary (I previously overwrote the README by accident)

## Version 0.28.1

Shift usernames to email addresses, add display name and timezone to users table

- [ ] Require that validates as email address
- [ ] Add display_name column to users table for use in the app
- [ ] Add alternate email address column to users table (alt_email, Can be NULL)
- [ ] Add timezone column
  - Use IANA timezone values (e.g. "America/New_York")
- [ ] Update existing usernames
  - There's currently 2 users in the database
    - For current username "sadmin": 
      - change username to "[REDACTED]" 
      - add display_name of "Super Admin"
      - set timezone to "America/New_York"
    - For current username "Mike"
      - change username to "[REDACTED]" 
      - add display_name of "Mike York"
      - add alternate email address of "[REDACTED]"
      - set timezone to "America/New_York"
  - After completing this task, delete these lines and replace with: "   - [x] Update existing usernames"
- [ ] Add relevant fields to User settings (all of these BELOW the password box)
  - [ ] Add relevant checks to username field to ensure valid email addresses (no emails sent yet, just validate it could be a valid email address)
  - [ ] Add Display Name field and wire it to display_name column
  - [ ] Add Alternate email address field and wire it to the user table's "alt_email" column
  - [ ] Add Timezone field and wire it to the user table's "timezone" column
- [ ] Add relevant fields to User Admin settings
  - [ ] Put them in the "Edit User" modal below Username
  - [ ] Same as for the User settings

## Version 0.28.2 - Time standardization

- [ ] Convert all dates/times stored in database to UTC (They are currently in my PC's timezone of "America/New_York")
  - [ ] Update all time_entries to use UTC in the database
  - [ ] Update all audit logs to UTC in the database
  - [ ] Update all active_timers to UTC in the database
  - [ ] Update any other time references in the database
- [ ] Update time display on the front end to record in UTC but display in user's timezone
  - [ ] On Create Manual Entry screen, user should input local time and it should be converted to UTC
  - [ ] Same thing for the edit entry screen
  - [ ] Audit log should record and be stored in UTC but the Audit Log viewer in Settings should be in local user's timezone

## Version 0.30.0 - Workspace Model Shift

This update and all of 0.30.x marks a shift from referring to "Organizations" to "Workspaces" to allow for expansion of the system to be useful in business and personal contexts. Users no longer belong to a single organization. Users will shift to being independent entities within the overall framework.

Users are then assigned to workspaces via a separate table in the database.

Super Admins retain control and access to all workspaces within the app.

Groundwork is laid for users to create their own workspaces of various types. This includes business, personal, and family workspaces.

Business workspaces include clients, projects, and multiple users.

Personal workspaces are single user, owner-only spaces.

Family workspaces are multi-user workspaces with granular permissions and roles aimed at "Adult" and "Child" roles.

- [ ] Rename Organization/organization to Workspace/workspace everywhere
  - [ ] Rename user-facing labels from Organization to Workspace
  - [ ] Rename Organization Settings to Workspace Settings
  - [ ] Rename organization-related route names, service names, repository names, and helper names
  - [ ] Update database references where practical
    - [ ] Existing `organization_id` columns may remain temporarily during migration if needed
    - [ ] Long-term naming should become `workspace_id`
  - [ ] Update audit log record types and labels from organization-focused language to workspace-focused language
  - [ ] Update public API documentation and browser/API response field names where appropriate
  - [ ] Preserve backward compatibility where needed until existing screens and services are fully migrated

## Version 0.30.1

- [ ] Add workspace ownership and user/workspace membership foundation
  - [ ] Create `user_workspaces` table to track which users can access which workspaces
    - [ ] `user_workspace_id`
    - [ ] `user_id`
    - [ ] `workspace_id`
    - [ ] `status`
    - [ ] `created_at`
    - [ ] `updated_at`
  - [ ] Dissociate users from belonging to only one workspace
    - [ ] Users become independent app-level records
    - [ ] Users can belong to multiple workspaces
    - [ ] Remove or deprecate direct `users.organization_id` / `users.workspace_id` behavior
  - [ ] Add `owner_user_id` or similar field to the `workspaces` table
    - [ ] Identifies the primary administrator/owner of the workspace
    - [ ] Supports future ownership transfer for business use cases
  - [ ] Make sure workspace membership changes are audit logged

## Version 0.30.2

- [ ] Add workspace type support
  - [ ] Add `workspace_type` to the workspace table
    - [ ] `business`
    - [ ] `personal`
    - [ ] `family`
  - [ ] Business workspaces
    - [ ] Default workspace name should use the organization/business name
    - [ ] Full project/client/business tool suite available:
      - [ ] Tasks
      - [ ] Notes/knowledge base
      - [ ] Time tracking
      - [ ] Clients/projects
      - [ ] Billing/invoicing/reporting
      - [ ] Team members
      - [ ] Permissions
  - [ ] Personal workspaces
    - [ ] Default workspace name should be `Personal`
    - [ ] User can rename the workspace
    - [ ] Available tools:
      - [ ] Tasks
      - [ ] Notes/knowledge base
      - [ ] Time tracking, optional
      - [ ] Projects
    - [ ] Owner-only permissions
    - [ ] Personal workspaces cannot add other users
  - [ ] Family workspaces
    - [ ] Default workspace name should be `Family`
    - [ ] Workspace admin can rename the workspace
    - [ ] Available tools:
      - [ ] Tasks
      - [ ] Notes/knowledge base
      - [ ] Time tracking, optional
      - [ ] Projects
      - [ ] Team members
      - [ ] Family-focused permissions
    - [ ] Add family-focused account concepts
      - [ ] Adult accounts
      - [ ] Child accounts
      - [ ] Limited number of users (20)

- [ ] Update sessions for active workspace support
  - [ ] Add `active_workspace_id` to authenticated session data
  - [ ] Replace session assumptions that use one fixed organization/workspace
  - [ ] Load user workspace memberships during login/session refresh
  - [ ] Add workspace switching functionality
    - [ ] User can switch active workspace from the UI
    - [ ] App reloads workspace-scoped data after switching
    - [ ] User cannot switch into a workspace they do not belong to
  - [ ] Update authorization checks to use `active_workspace_id`

- [ ] Update user administration for workspace membership
  - [ ] Super administrator user creation/editing
    - [ ] Can assign users to one or more workspaces
    - [ ] Can assign workspace roles during user setup
    - [ ] Can move users between workspaces
  - [ ] Workspace administrator user creation/editing
    - [ ] Can create users within the active workspace, if permitted
    - [ ] Can assign groups/teams/roles
    - [ ] Can use an Advanced button for granular permissions
    - [ ] Cannot assign users to unrelated workspaces
  - [ ] User edit modal should show workspace memberships
  - [ ] User edit modal should show roles/permissions within the selected workspace

- [ ] Update roles and permissions for workspace scope
  - [ ] Rename Organization Administrator to Workspace Administrator
  - [ ] Update permission checks from organization scope to workspace scope
  - [ ] Ensure existing client/project/time-entry permissions are evaluated inside the active workspace
  - [ ] Add workspace type limits to permission checks
    - [ ] Personal workspace users cannot add team members
    - [ ] Family workspace permissions use family-focused role rules
    - [ ] Business workspaces use full role/permission rules

- [ ] Shift clients to workspace scope
  - [ ] Clients should continue to require a `workspace_id`
  - [ ] Business workspaces use clients normally
  - [ ] Personal and family workspaces may hide or disable clients by default
  - [ ] Existing clients must migrate from `organization_id` to `workspace_id`
  - [ ] Client screens should only show clients for the active workspace

- [ ] Shift projects away from requiring a client
  - [ ] Projects must still require a `workspace_id`
  - [ ] Make `client_id` nullable
  - [ ] Projects can exist directly under a workspace without a client
  - [ ] Update project settings UI
    - [ ] Convert the project settings screen to a single list of all projects in the active workspace
    - [ ] Add `Filter by: Client` dropdown above the project list
    - [ ] Add `Filter by: Status` dropdown next to the client filter
    - [ ] Add field to optionally assign a project to a client
  - [ ] Preserve client/project relationships for existing projects during migration
  - [ ] Prepare for future bulk project editing
    - [ ] Multi-select projects
    - [ ] Bulk edit status
    - [ ] Bulk assign client
    - [ ] Bulk update other shared fields where safe

- [ ] Shift time entries away from requiring a client
  - [ ] Time entries must require a `workspace_id`
  - [ ] Time entries must require a `project_id`
  - [ ] Make `client_id` optional
  - [ ] Stopwatch UI should require project selection
  - [ ] Stopwatch UI should allow optional client selection when relevant
  - [ ] If selected project belongs to a client, client may auto-fill
  - [ ] Reporting should handle:
    - [ ] Workspace-only projects
    - [ ] Client-linked projects
    - [ ] Time entries with no client
  - [ ] Preserve historical client/project display names for old time entries

- [ ] Add workspace creation buttons to User Settings
  - [ ] Add button to create a new workspace
  - [ ] Available workspace types should depend on install mode and account type
  - [ ] SaaS account type rules:
    - [ ] Personal users can create one personal workspace
    - [ ] Family users can create one personal workspace and use one shared family workspace
    - [ ] Business users can create personal, family, and business workspaces as allowed by plan
  - [ ] Self-hosted rules:
    - [ ] Allow all workspace types by default unless limited by config/setup
    - [ ] Support business-only installs

- [ ] Update workspace-aware navigation and UI behavior
  - [ ] Add active workspace selector to the app shell/header
  - [ ] Clearly show which workspace the user is currently using
  - [ ] Hide unavailable modules based on workspace type
  - [ ] Hide unavailable actions based on workspace permissions
  - [ ] Make empty states workspace-aware
    - [ ] Personal workspace project/task messaging should not mention clients by default
    - [ ] Business workspace messaging can continue to reference clients/projects

- [ ] Update database migrations and data migration path
  - [ ] Rename or create workspace table from existing organization table
  - [ ] Migrate existing organization records into workspaces
  - [ ] Migrate existing organization settings into workspace settings
  - [ ] Migrate existing users into `user_workspaces`
  - [ ] Set existing users' active/default workspace based on current organization membership
  - [ ] Migrate existing clients, projects, time entries, audit logs, API keys, roles, and settings to workspace scope
  - [ ] Add indexes for common workspace lookups
    - [ ] `workspace_id`
    - [ ] `user_id, workspace_id`
    - [ ] `workspace_type`
    - [ ] `owner_user_id`

- [ ] Update public API and API key behavior for workspaces
  - [ ] API keys should be scoped to a workspace
  - [ ] API responses should use workspace language
  - [ ] Existing organization-scoped API behavior should either migrate cleanly or remain temporarily backward-compatible
  - [ ] API documentation should explain workspace scoping
  - [ ] API audit logs should record workspace context

- [ ] Update tests/checks for workspace behavior
  - [ ] User with one workspace logs in normally
  - [ ] User with multiple workspaces can switch active workspace
  - [ ] User cannot access records from a workspace they do not belong to
  - [ ] Business workspace supports clients/projects/time tracking/reporting
  - [ ] Personal workspace supports projects without clients
  - [ ] Family workspace supports limited team members and family permissions
  - [ ] Time entries require project but not client
  - [ ] Projects require workspace but not client
  - [ ] Existing migrated data remains visible after migration
  - [ ] `npm run check` passes after migration

## Version 0.31.0 - User, client, and project functionality expansion

With

- [ ] Create nested clients
- [ ] Create nested projects
- [ ] Add backups/export/import
- [ ] Email delivery
- [ ] Invite links

## Version 0.35.0 - Dashboard as Project Hub

- [ ] Dashboard should become the hub for managing projects
  - [ ] Add "Past Due/Due Soon" section that shows past due and upcoming tasks sorted by client and project
  - [ ] Add "Latest Updates" section
    - [ ] Newest clients
    - [ ] Newest projects
    - [ ] Newest tasks
    - [ ] Newest notes
    - [ ] Newest support tickets
    - [ ] Recent time entries if useful
- [ ] Add activity feed support
  - [ ] Activity feed may be derived from audit events where appropriate
  - [ ] Activity feed should not expose sensitive audit JSON by default
  - [ ] Activity feed should be user-friendly and dashboard-focused
  - [ ] Keep audit log as the authoritative admin/security record
- [ ] Dashboard sections should respect permissions
  - [ ] Users should only see clients/projects/tasks/notes/tickets they are allowed to see
  - [ ] External client users should not see internal-only notes or admin-only audit details

## Version 0.40.0 - Tasks, Notes, Tickets, and Collaboration

- [ ] Tasks
  - [ ] Tasks are assigned to projects and clients
  - [ ] Tasks offer due dates with adjustable reminders
    - [ ] Reminders default to a configurable number of days prior
    - [ ] Reminder defaults can be configurable at the client and project levels
  - [ ] Tasks offer recurrence
  - [ ] Tasks appear on calendars
  - [ ] Tasks are assignable to users/admins within client/project as appropriate per user permissions
  - [ ] Task visibility and edit access should respect the roles/permissions system
- [ ] Support tickets
  - [ ] Consult with existing support ticket solutions for best path here
  - [ ] Tickets should be assignable to clients and projects
  - [ ] Tickets should support internal notes
  - [ ] Tickets should support external/client-visible responses later
  - [ ] Ticket visibility and edit access should respect the roles/permissions system
- [ ] Expanded reporting
- [ ] Notes/knowledge base
  - [ ] Notes should be linkable with either markdown or wiki-style linking
  - [ ] Notes should form the basis of the knowledge base
  - [ ] Knowledge base should build automatically from notes, tasks, and support tickets
    - Knowledge base will be a self-building "site" like SharePoint for working on tasks
  - [ ] Notes can be marked as specific to a client, project, or entire org
  - [ ] Notes should be marked as internal only or external visible
  - [ ] Notes should have a changelog table, can be reused from the audit log, but remains persistent
  - [ ] Note visibility and edit access should respect the roles/permissions system
- [ ] Calendars
- [ ] Invoicing
- [ ] Add production cookie flags
- [ ] Add in-app messaging between users
- [ ] Two Factor Authentication (TOTP)
- [ ] Passkeys
- [ ] SSO

## Version 0.45.0 - Integrations and Plugin Readiness

- [ ] Build integrations only after public API, API keys/scopes, roles/permissions, and module boundaries are in place
- [ ] ZenDesk
- [ ] Google Tasks
- [ ] Microsoft To Do
- [ ] Microsoft SharePoint
- [ ] WordPress
  - [ ] Support Ticket plugin
  - [ ] Knowledge Base plugin
- [ ] Shopify
  - [ ] Knowledge Base plugin
  - [ ] Support ticket plugin
    - Would include notes plugin for Shopify Admin
- [ ] Integration architecture
  - [ ] Integrations should authenticate through API keys, OAuth, or integration-specific credentials as appropriate
  - [ ] Integrations should respect organization, client, project, and user permissions
  - [ ] Integration events should be audit logged where appropriate
  - [ ] Integration-created records should identify their source in metadata
  - [ ] Avoid integration-specific logic leaking into core services where a module or adapter would be cleaner

## Version 0.50.0 - Production, Packaging, and Self-Hosting

- [ ] Move to a demo production environment
- [ ] Add PostgreSQL support
  - [ ] Add a database adapter layer so the app is not permanently tied to shelling out to the SQLite CLI
  - [ ] Keep SQLite support for local/self-hosted lightweight installs if practical
  - [ ] PostgreSQL should become the preferred production database
- [ ] Add file attachment abilities to notes/tasks/support tickets
- [ ] Docker Compose
- [ ] Setup wizard
- [ ] Admin docs
- [ ] Self-hosted release
- [ ] Expand project management tools

## Version 0.55.0 - Personal Version

- [ ] Create Personal version
  - Allows family organizations
  - No clients
  - Unlimited projects, tasks, notes/knowledge base, and calendars
  - Includes 2FA, passkeys, and SSO
  - Allows collaborators, similar to client users
- [ ] Incorporate personal/private per-user tasks, projects, and related records for organization users

## Version 0.60.0 - SaaS Wrapper

- [ ] SaaS wrapper
- [ ] Hosted PostgreSQL
- [ ] Tenant signup
- [ ] Billing
- [ ] Monitoring
