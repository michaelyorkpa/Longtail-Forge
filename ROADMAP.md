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

- [ ] Increase the size to 80% of desktop viewport for the Reporting screen
- [ ] Add filters to the edit entries screen for:
  - [ ] Entry status (Billed/Unbilled)
  - [ ] Dates (Last billing period, current billing period, custom)
  - [ ] User(s)

## Version 0.22.4

- [ ] On the Edit Entries screen, add a delete button next to the edit-entry button in the columned display
- [ ] Update the columned section of the Edit Entries screen to fit within content columns
- [ ] Update Edit Entries screen to show status "N/A" when billable flag is not set
- [ ] Change saved message on time tracker to a simple green "Saved."

## Version 0.22.5 - Frontend Utilities and Timer State Refactor

- [ ] Refactor timer count changes so adding timers does not stop, reset, delete, or rebuild existing running timers
  - [ ] Do not clear and rebuild the entire timer grid when the selected timer count changes
  - [ ] When increasing the timer count, append only the newly needed timer cards and timer instances
  - [ ] When decreasing the timer count, only remove timer cards above the new selected count
  - [ ] If a removed timer has elapsed, paused, or running time, show an in-app confirmation modal before removing it
  - [ ] Existing timers below the new selected count must keep their current client, project, description, billable flag, elapsed time, running/paused state, and status message
  - [ ] Add a browser-console debug helper or unit-style sanity function that confirms:
    - [ ] Existing timer object identities are preserved when adding timers
    - [ ] Existing running timers remain running after adding timers
    - [ ] Removed timers are disposed cleanly when confirmed
- [ ] Convert warning pop-ups to in-app modal windows instead of browser `alert()` / `confirm()` dialogs
  - [ ] Create a shared modal/confirm helper that can be reused across timer, client/project, user, settings, edit-entry, and future admin screens
  - [ ] Use accessible markup:
    - [ ] `role="dialog"`
    - [ ] `aria-modal="true"`
    - [ ] Focus moves into the modal when opened
    - [ ] Escape key and Cancel button close the modal
    - [ ] Focus returns to the triggering control when closed
  - [ ] Keep the native `beforeunload` browser warning where required, because browsers restrict custom unload modals
- [ ] Create shared frontend helper modules under `public/js/shared/` or similar
  - [ ] `api-client.js`
    - Wrapper around `fetch()`
    - Handles JSON request/response boilerplate
    - Handles non-OK responses consistently
    - Provides `getJson()`, `postJson()`, `putJson()`, `deleteJson()` helpers
  - [ ] `modal.js`
    - Shared in-app modal and confirmation helper
  - [ ] `formatters.js`
    - Currency, hours, dates, names, and statuses
  - [ ] `billing.js`
    - Shared billing and rounding calculations used by reporting and dashboard screens
  - [ ] `records.js` or `matching.js`
    - Shared client/project matching helpers currently duplicated between reporting, dashboard, and edit-entry pages
  - [ ] Keep this as plain browser JavaScript with no build step for now

## Version 0.23.0 - Client and Project CRUD Foundation

- [ ] Replace whole-tree client/project saves with granular CRUD
  - Current risk:
    - The current client/project save path deletes and reinserts all clients/projects for an organization
    - That is acceptable for early app data, but it becomes dangerous once tasks, notes, tickets, roles, audit logs, API integrations, and external references point at client/project IDs
  - Goal:
    - Client and project records should be created, updated, archived/deactivated, and deleted individually
    - Existing IDs must be preserved
    - Saving one project must not rewrite unrelated clients/projects
- [ ] Add granular client endpoints
  - [ ] `GET /api/clients`
  - [ ] `POST /api/clients`
  - [ ] `GET /api/clients/:clientId`
  - [ ] `PUT /api/clients/:clientId`
  - [ ] `DELETE /api/clients/:clientId` or archive/deactivate equivalent
- [ ] Add granular project endpoints
  - [ ] `GET /api/projects`
  - [ ] `GET /api/clients/:clientId/projects`
  - [ ] `POST /api/clients/:clientId/projects`
  - [ ] `GET /api/projects/:projectId`
  - [ ] `PUT /api/projects/:projectId`
  - [ ] `DELETE /api/projects/:projectId` or archive/deactivate equivalent
- [ ] Keep `GET /api/client-projects` as a compatibility/read endpoint for screens that still need the nested client/project tree
- [ ] Retire or restrict `PUT /api/client-projects`
  - [ ] Do not allow it to delete and reinsert all clients/projects long term
  - [ ] If temporarily retained for compatibility, document it as deprecated
  - [ ] Make sure it cannot break task/note/ticket/role references once those exist
- [ ] Add repository methods instead of replace-all methods
  - [ ] `clientsRepository.create()`
  - [ ] `clientsRepository.update()`
  - [ ] `clientsRepository.archive()` or `clientsRepository.delete()`
  - [ ] `projectsRepository.create()`
  - [ ] `projectsRepository.update()`
  - [ ] `projectsRepository.archive()` or `projectsRepository.delete()`
- [ ] Prefer archive/deactivate over hard delete for clients and projects
  - [ ] Add `archived_at`, `deleted_at`, or consistent `status` behavior if needed
  - [ ] Preserve old clients/projects for historic time entries, audit logs, notes, tickets, and tasks
- [ ] Add or verify database constraints and indexes
  - [ ] Clients remain scoped by `organization_id`
  - [ ] Projects remain scoped by `organization_id` and linked to clients
  - [ ] Add indexes for common lookups by organization, client, status, and updated date
- [ ] Update client/project admin UI to use granular endpoints
  - [ ] Creating a client calls the client create endpoint
  - [ ] Editing a client calls the client update endpoint
  - [ ] Creating a project calls the project create endpoint
  - [ ] Editing a project calls the project update endpoint
  - [ ] Archiving/deleting a client or project affects only that one record
- [ ] Preserve denormalized time-entry names for historical reporting, but keep IDs stable
  - [ ] Time entries may continue storing `client_name` and `project_name` as historical display values
  - [ ] Future joins and links should rely on stable `client_id` and `project_id`

## Version 0.23.1 - Database Audit Logging

- [ ] Move audit logging to database
  - Server/error logging should still be written to files in the logs/ directory
  - Replace app-event CSV logging with a database-backed audit log for application-level changes
  - Treat audit logging as core app infrastructure, not as a time-tracking-specific feature
  - Include the following fields:
    - audit_id
    - organization_id (Foreign Key)
    - created_at
    - actor_user_id
    - actor_user_name <- On the front end, I want to make this clickable
    - action, change_type
    - record_type, record_id, record_label, record_url <- On the front end, I want to make this clickable
    - previous_value_json, new_value_json, metadata_json
- [ ] Create an `audit_logs` table
  - [ ] `audit_id TEXT PRIMARY KEY`
  - [ ] `organization_id TEXT NOT NULL`
  - [ ] `created_at TEXT NOT NULL`
  - [ ] `actor_user_id TEXT`
  - [ ] `actor_user_name TEXT`
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
  - [ ] `organization_id, created_at`
  - [ ] `organization_id, actor_user_id`
  - [ ] `organization_id, record_type`
  - [ ] `organization_id, change_type`
  - [ ] `organization_id, record_id`
- [ ] Create a shared `auditService.record()` function
  - [ ] Services call `auditService.record()` after successful create/update/delete/archive actions
  - [ ] Routes should not manually assemble audit rows unless there is no better service layer location
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
  - [ ] `organization`
  - [ ] `organization_setting`
  - [ ] `user`
  - [ ] `client`
  - [ ] `project`
  - [ ] `time_entry`
  - [ ] Future:
    - [ ] `task`
    - [ ] `note`
    - [ ] `support_ticket`
    - [ ] `invoice`
    - [ ] `api_key`
- [ ] Add audit logging for current app records
  - [ ] Time entries:
    - [ ] Create
    - [ ] Update
    - [ ] Delete when delete exists
  - [ ] Organization settings:
    - [ ] Update
  - [ ] Users:
    - [ ] Create
    - [ ] Username update
    - [ ] Password reset
    - [ ] Deactivate
    - [ ] Reactivate
    - [ ] Delete
  - [ ] Clients:
    - [ ] Create
    - [ ] Update
    - [ ] Archive/delete
  - [ ] Projects:
    - [ ] Create
    - [ ] Update
    - [ ] Archive/delete
- [ ] Keep audit log and activity feed conceptually separate
  - [ ] Audit log is for admin/security/history/verification
  - [ ] Activity feed is for dashboard-friendly “latest updates”
  - [ ] The activity feed may use audit events as a source, but should not force the audit table to become a general UX feed forever

## Version 0.23.2 - Audit Log Settings

- [ ] Add audit log settings to Organization settings below billing settings
  - [ ] App audit logging checkbox (checked = on)
    - [ ] Log when audit logging is turned off and on
    - [ ] The act of turning audit logging off should still create an audit record before logging is disabled
    - [ ] The act of turning audit logging back on should create an audit record after logging is enabled
  - [ ] Retention period:
    - 7 days
    - 14 days
    - 30 days
    - 60 days
    - 90 days
    - 180 days
    - 1 year
  - [ ] Default logging period to 30 days
- [ ] Store audit settings in the database
  - [ ] Add fields to `organization_settings` or create a dedicated `organization_audit_settings` table
  - [ ] Recommended fields:
    - [ ] `audit_logging_enabled`
    - [ ] `audit_retention_days`
    - [ ] `audit_settings_updated_at`
- [ ] Add audit retention cleanup
  - [ ] Cleanup should be organization-scoped
  - [ ] Cleanup should respect each organization's configured retention period
  - [ ] Cleanup may run on app startup, on a scheduled/admin-triggered path, or before audit-log reads
  - [ ] Do not delete logs newer than the configured retention period

## Version 0.23.3 - Admin Audit Log Viewer

- [ ] Add admin page for audit log (Settings menu, below User)
- [ ] Show columns Date, User, Client, Project, Record Type, Change Type
- [ ] Filter by date, user, record type, change type
- [ ] Link each row to modal that displays full audit data, except JSON details
- [ ] Create JSON modal viewer (make the JSON human readable)
  - [ ] Pretty-print `previous_value_json`
  - [ ] Pretty-print `new_value_json`
  - [ ] Pretty-print `metadata_json`
  - [ ] Collapse/expand large JSON objects
  - [ ] Show empty/null JSON fields as “None”

## Version 0.23.3.1 - Admin Audit Log Viewer Refinements

- [ ] Clicking on a user in the column view filters by user automatically
- [ ] Clicking on a record in the modal view takes admin to edit page for that record
- [ ] Full audit log export (CSV?)
- [ ] Filtered audit log export (CSV?)

## Version 0.24.0 - Roles and Permissions Foundation

- [ ] Add roles
  - [ ] Users can be assigned multiple roles
    - Example: User 1 can be a client administrator for one client, project administrator for a different client, and a project user for another client
  - [ ] Super Admin
    - Controls all organizations within the app
    - Can edit clients, projects, and users in each organization
    - Has full access to assign anyone to anything, while respecting role limits below
  - [ ] Organization Administrator
    - Controls all clients, projects, and users within the organization
    - Cannot see clients/projects that belong to other organizations
  - [ ] Client Administrator
    - Controls all client details, projects, and users for a specific client
  - [ ] Project Administrator
    - Controls all projects and project details for a specific client
    - Can assign users to projects within the client
  - [ ] Client User
    - Can contribute time to any projects within a client
  - [ ] Project User
    - Can contribute time to a specific project
  - [ ] Client Users (External)
    - For clients to collaborate with users within organizations
- [ ] Add database tables for roles and scoped assignments
  - [ ] `roles`
  - [ ] `permissions`
  - [ ] `role_permissions`
  - [ ] `user_role_assignments`
  - [ ] `user_role_assignments` should support scope fields:
    - [ ] `organization_id`
    - [ ] `client_id`
    - [ ] `project_id`
    - [ ] `scope_type`
    - [ ] `scope_id`
- [ ] Add permission-checking service
  - [ ] Create a shared permission helper, for example `permissionsService.can(session, action, resource)`
  - [ ] Services should call permission checks before changing data
  - [ ] Routes may use middleware for broad permission checks, but record-specific checks should live close to the service logic
- [ ] Add granular CRUD control once a user is assigned to a client or project
  - [ ] Client admins can be restricted from editing billing details by the org admin
  - [ ] Project admins can be restricted from editing billing details by the client/org admins
  - [ ] Add ability to control access to manual time entry and edit time entries
  - [ ] For client user and project user roles, users can only access their own times
  - [ ] Put granular controls behind an Advanced button
- [ ] Assign users to roles and specific clients/projects from within the edit user modal window
  - [ ] The edit user modal should show existing role assignments
  - [ ] Admins should be able to add/remove assignments without deleting the user
  - [ ] Role assignments should be audit logged
- [ ] Apply permissions to existing areas
  - [ ] User administration
  - [ ] Organization settings
  - [ ] Client management
  - [ ] Project management
  - [ ] Time tracking
  - [ ] Manual time entry
  - [ ] Edit entries
  - [ ] Reporting
  - [ ] Audit log viewer
- [ ] Prepare role checks for future areas
  - [ ] Tasks
  - [ ] Notes/knowledge base
  - [ ] Support tickets
  - [ ] Invoicing
  - [ ] Public API keys

## Version 0.25.0 - Public API and API Key Foundation

- [ ] Create public-facing API foundation
  - [ ] Do not expose the current browser `/api` routes as the long-term public API
  - [ ] Keep browser/internal routes under `/api`
  - [ ] Add stable external routes under `/api/v1`
  - [ ] Public API responses should be consistent, documented, and versioned
- [ ] Add API key database support
  - [ ] `api_keys` table
    - [ ] `api_key_id`
    - [ ] `organization_id`
    - [ ] `created_by_user_id`
    - [ ] `name`
    - [ ] `key_hash`
    - [ ] `key_prefix`
    - [ ] `status`
    - [ ] `created_at`
    - [ ] `last_used_at`
    - [ ] `revoked_at`
  - [ ] Store only hashed API keys
  - [ ] Show the raw API key only once at creation time
- [ ] Add API key scopes
  - [ ] `api_key_scopes` table or JSON scope field
  - [ ] Scopes should map to high-level permissions, for example:
    - [ ] `clients:read`
    - [ ] `clients:write`
    - [ ] `projects:read`
    - [ ] `projects:write`
    - [ ] `time_entries:read`
    - [ ] `time_entries:write`
    - [ ] `tasks:read`
    - [ ] `tasks:write`
    - [ ] `notes:read`
    - [ ] `notes:write`
    - [ ] `tickets:read`
    - [ ] `tickets:write`
- [ ] Add API key authentication middleware
  - [ ] API key auth should be separate from browser session cookie auth
  - [ ] API key auth should resolve organization context
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
  - [ ] Organization scoping
  - [ ] Permission/scope checks
- [ ] Add API key admin UI
  - [ ] Create key
  - [ ] Name key
  - [ ] Select scopes
  - [ ] Revoke key
  - [ ] Show created date and last-used date
  - [ ] Show only key prefix after creation

## Version 0.26.0 - Module-Ready Architecture

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
- [ ] Each module should be able to own:
  - [ ] Routes
  - [ ] Services
  - [ ] Repositories
  - [ ] Normalizers/validators
  - [ ] Migrations
  - [ ] Public/browser JS where appropriate
  - [ ] Protected views where appropriate
  - [ ] Seed/default data where appropriate
- [ ] Add a module registry
  - [ ] The app should know which modules exist
  - [ ] The app should know which modules are enabled for an organization
  - [ ] The registry can be simple at first, for example a static JavaScript module exporting module definitions
- [ ] Add database support for enabled modules
  - [ ] `modules` table or equivalent
  - [ ] `organization_modules` table or equivalent
  - [ ] Track enabled/disabled state per organization when the app supports organization-level modules
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

## Version 0.27.0 - Shared Billing and Reporting Services

- [ ] Consolidate billing, rounding, and date-range calculations
  - [ ] Reporting and Dashboard should not maintain separate versions of the same billing logic
  - [ ] Create shared browser helper first if staying frontend-only
  - [ ] Consider moving billing calculations server-side later for API consistency
- [ ] Shared billing logic should support:
  - [ ] Organization defaults
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

## Version 0.30.0 - Core Time Tracking Maturity

- [ ] Add timer persistence
  - [ ] Timers should survive page refresh where reasonable
  - [ ] Timers should survive accidental navigation where reasonable
  - [ ] Store enough state to restore:
    - [ ] Timer number
    - [ ] Client
    - [ ] Project
    - [ ] Description
    - [ ] Billable flag
    - [ ] Elapsed time
    - [ ] Active start time
    - [ ] Running/paused state
  - [ ] Timer persistence should build on the timer state refactor from Version 0.22.5
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
