# Longtail Forge Roadmap

Last updated for roadmap version 0.21.1.

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
- [x] Home screen
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

- [ ] Add app version display to the shared footer
- [ ] Use package.json version as the single source of truth
- [ ] Add appName and appVersion to src/config.js by reading package.json
- [ ] While updating config.js, preserve/add the existing path settings needed by db/static services: root, dataDir, logsDir, migrationsDir, sqliteCommand, databaseFile, settingsFile, clientProjectFile, and timeEntriesFile
- [ ] Create src/routes/app-info.routes.js with GET /api/app-info returning { name, version } and Cache-Control: no-store
- [ ] Mount the app-info route in src/app.js before requireAuth so the footer can load on public and authenticated pages
- [ ] Update public/js/footer.js so the brand line displays "Longtail Forge vX.Y.Z" using /api/app-info
- [ ] Gracefully fall back to "Longtail Forge" if the app-info request fails
- [ ] Do not hard-code the version in footer.js
- [ ] Do not change unrelated behavior

## Version 0.21.2 - Frontend Organization

- [ ] Clean up loose .html files in root
- [ ] Move toward:
  - public/
    - css/
    - js/
    - assets/
  - views/
    - Protected HTML

## Version 0.21.3

- [ ] Add checksums to database migrations to avoid older migrations being silently changed after being applied
- [ ] Rename the session cookie to longtail_forge_session
- [ ] Add config-driven cookie behavior
  - [ ] HttpOnly
  - [ ] SameSite=Lax

## Version 0.21.4

- [ ] Add real LICENSE file per description in README and footer
- [ ] Add "Getting Started" section to README
  - [ ] Requirements
  - [ ] Setup
  - [ ] Optional environment variables
  - [ ] Start
  - [ ] Open
- [ ] Change database file name to longtail-forge.db

## Version 0.22.1 - Final Tweaks to 0.2x Branch

- [ ] Move all app logging to database
  - Server/error logging should still be written to files in the logs/ directory
  - Include the following fields:
    - [ ] Datetime
    - [ ] Action
    - [ ] User doing the change
    - [ ] Record type affected (time entry, organization setting, client setting, project setting)
    - [ ] Record affected (clickable link)
    - [ ] Change type (Create, Update, Delete)
    - [ ] Previous record value (stored as JSON)

## Version 0.22.2

- [ ] Add logging settings options box to Organization settings below billing settings
  - [ ] Allow app logging to be turned off
  - [ ] Add period dropdown selector with options for:
    - 7 days
    - 14 days
    - 30 days
    - 60 days
    - 90 days
    - 180 days
    - 1 year
  - [ ] Default logging period to 30 days

## Version 0.22.3

- [ ] Hours on reporting screen do not round when a client is not billable
- [ ] Decide what the intended non-billable rounding behavior should be

## Version 0.22.4

- [ ] Add filters to the edit entries screen for:
  - [ ] Entry status (Billed/Unbilled)
  - [ ] Dates (Last billing period, current billing period, custom)
  - [ ] User(s)

## Version 0.22.5

- [ ] On the Edit Entries screen, add a delete button next to the edit-entry button in the columned display
- [ ] Update the columned section of the Edit Entries screen to fit within content columns
- [ ] Update Edit Entries screen to show status "N/A" when billable flag is not set
- [ ] Change saved message on time tracker to a simple green "Saved."

## Version 0.22.6

- [ ] Login username and password box are aligned near the bottom (not at the bottom) instead of the middle of the screen

## Version 0.30 - Final Time Tracker Only Version

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
  - [ ] Assign users to roles and specific clients/projects from within the edit user modal window
  - [ ] Add granular CRUD control once a user is assigned to a client or project
    - [ ] Client admins can be restricted from editing billing details by the org admin
    - [ ] Project admins can be restricted from editing billing details by the client/org admins
    - [ ] Add ability to control access to manual time entry and edit time entries
    - [ ] For client user and project user roles, users can only access their own times
    - [ ] Put granular controls behind an Advanced button
  - [ ] Client Users (External)
    - For clients to collaborate with users within organizations
- [ ] Create nested clients
- [ ] Create nested projects
- [ ] Add backups/export/import
- [ ] Email delivery
- [ ] Invite links

## Version 0.40

- [ ] Tasks
  - [ ] Tasks are assigned to projects and clients
  - [ ] Tasks offer due dates with adjustable reminders
    - [ ] Reminders default to a configurable number of days prior
    - [ ] Reminder defaults can be configurable at the client and project levels
  - [ ] Tasks offer recurrence
  - [ ] Tasks appear on calendars
  - [ ] Tasks are assignable to users/admins within client/project as appropriate per user permissions
- [ ] Support tickets
- [ ] Expanded reporting
- [ ] Notes/knowledge base
  - [ ] Notes should be linkable with either markdown or wiki-style linking
  - [ ] Notes should form the basis of the knowledge base
  - [ ] Knowledge base should build automatically
  - [ ] Notes can be marked as specific to a client, project, or entire org
  - [ ] Notes should be marked as internal only or external
- [ ] Calendars
- [ ] Invoicing
- [ ] Add production cookie flags
- [ ] Two Factor Authentication (TOTP)
- [ ] Passkeys
- [ ] SSO

## Version 0.50

- [ ] Move to a demo production environment
- [ ] Add PostgreSQL support
- [ ] Docker Compose
- [ ] Setup wizard
- [ ] Admin docs
- [ ] Self-hosted release
- [ ] Expand project management tools

## Version 0.55

- [ ] Create Personal version
  - Allows family organizations
  - No clients
  - Unlimited projects, tasks, notes/knowledge base, and calendars
  - Includes 2FA, passkeys, and SSO
  - Allows collaborators, similar to client users
- [ ] Incorporate personal/private per-user tasks, projects, and related records for organization users

## Version 0.60

- [ ] SaaS wrapper
- [ ] Hosted PostgreSQL
- [ ] Tenant signup
- [ ] Billing
- [ ] Monitoring
