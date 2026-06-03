# Longtail Forge Roadmap

This file is the detailed per-version changelog and forward plan for Longtail Forge. README.md should stay cursory and point here for version-level detail.

### Version 0.30.17 - Final Code Review of 0.30

#### Final Review Goals

- [x] Ensure organizations language is completely removed from the codebase in the backend, frontend, and database structures.
- [x] Ensure projects can stand on their own with only hooks to workspace context.
- [x] Ensure clients are a first-class module, only available in Business workspace contexts, and projects, reporting, audit logs, and time entries aren't required to have them to function.
  - [x] The "Client Module" doesn't need to be separately checked or unchecked like time tracking, because it is only necessary in business workspace contexts. But I want it treated as a module based on whether the workspace is business or not.
- [x] Ensure Personal/Family workspaces are functional and respect permissions boundaries.
- [x] Verify permissions routing for both the site and API are functional per the permissions matrix in `docs/longtail_forge_permissions_matrix.md`.
- [x] Verify all items are in place to begin adding Tasks module in 0.31.

#### Code Review Findings

- [x] Update `docs/longtail_forge_permissions_matrix.md` to workspace-native role, scope, and permission names. The current matrix still uses `organization_admin`, `organization` scope, `organization_settings.manage`, and organization-scoped resource text even though 0.30.16.1 migrated active contracts to workspace naming.
- [x] Enforce Business-only client access in backend services and module status, not just navigation. Client UI links are hidden by workspace capabilities, but `client-projects` is still enabled by default for every workspace and client create/update/read routes only check `clients.manage`, so Personal/Family workspace administrators can still reach client APIs directly.
- [x] Add regression coverage for Personal/Family client denial and workspace-project allow paths. Personal/Family projects should remain available without clients, while client APIs should be unavailable outside Business workspace contexts.
- [x] Fix scoped admin role-assignment routing. `client_admin` and `project_admin` are allowed by `ROLE_LIMITS` to assign lower roles, but role option/read/replace entrypoints assert `roles.assign` against workspace-only resources, so client/project-scoped admins cannot reach the role assignment flow.
- [x] Decide and implement scoped admin user-management rules. The current users service checks `users.manage` against the workspace resource, while matrix notes imply client-scoped user management may be intended for `client_admin`.
- [x] Fix scoped admin time-entry list visibility. Scoped admins with `time_entries.edit_all` can update someone else's scoped entry when they know its ID, but `filterReadableTimeEntries` only returns all entries for workspace-level `edit_all` and otherwise filters to the current user's entries.
- [x] Enforce `reporting.view` explicitly on reporting and dashboard routes, or document the deliberate readable-scope-only rule. Current reporting reads are filtered through readable client/project/time scopes, but the route/service path does not assert `reporting.view`, so permission overrides cannot reliably deny reporting reads.
- [x] Refresh `docs/longtail_forge_permissions_matrix.md` after fixes and mark the relevant permission scenarios tested instead of "Untested".

## Version 0.31.0 - Tasks Module Foundation

0.31+ is the beginning of true project functionality. By the end of 0.3x there will be integrated modules for tasks, notes, tickets, calendars, and collaboration. The 0.31 branch should ship Tasks as a real first-party module while keeping later modules able to link into the same task foundation.

### Scope

0.31.0 should create the task module, persistence model, permissions, API surface, and first usable task list/detail experience. Later 0.31.x releases add richer task behavior in smaller slices.

### Data Model and Migration

- [ ] Create a first-party Tasks module definition with module metadata, navigation, settings metadata, browser routes, API routes, migrations, and permission declarations.
- [ ] Add a `tasks` table with:
  - [ ] `id`
  - [ ] `workspace_id` as the required owning scope
  - [ ] nullable `client_id` for Business workspace client-linked tasks
  - [ ] nullable `project_id` for project-linked tasks
  - [ ] nullable assignee user field or assignment join table, depending on the design decision below
  - [ ] title, description, status, priority, due date, optional due time, completed timestamp, archived timestamp
  - [ ] created/updated/completed user metadata and timestamps
  - [ ] source fields for future tickets, templates, integrations, imports, and rules
- [ ] Add indexes for workspace, client, project, assignee, status, due date, due date plus due time, and updated date.
- [ ] Decide whether task assignment is one user per task or many users per task before writing the migration.
  - tasks will need to be assignable to multiple users
- [ ] Keep task due date and due time separable so date-only tasks remain first-class and do not silently become midnight tasks.
- [ ] Store due date/time in a timezone-aware way consistent with the 0.28.2 UTC/session-timezone model.
- [ ] Add startup/module seed and repair behavior needed for the Tasks module.

### Linking Rules

- [ ] Tasks always belong to exactly one workspace.
- [ ] Tasks may be workspace-only.
- [ ] Tasks may be linked directly to a project.
- [ ] Tasks may be linked directly to a client in Business workspaces.
- [ ] If a task is linked to a project that belongs to a client, the task inherits that client context from the project.
- [ ] Do not allow a task to specify a client that conflicts with the selected project's client.
- [ ] Personal and Family workspaces never expose client task controls and use workspace/project task scopes only.
- [ ] Leave a stable linking hook for future tickets to create and link tasks automatically.

### Permissions

- [ ] Add task permissions to the permission model:
  - [ ] `tasks.create`
  - [ ] `tasks.view`
  - [ ] `tasks.edit_own`
  - [ ] `tasks.edit_all`
  - [ ] `tasks.assign`
  - [ ] `tasks.complete`
  - [ ] `tasks.delete` or `tasks.archive`
- [ ] Map task permissions onto existing Super Admin, Workspace Administrator, Client Administrator, Project Administrator, Client User, Project User, and External Client User roles.
- [ ] Task visibility must respect workspace/client/project scope assignments using the same resource-scope model as projects, reporting, and time entries.
- [ ] Task assignment choices must be limited to users/admins who are active in the workspace and are allowed in the selected client/project scope.
- [ ] External Client Users should not see internal-only task fields if external visibility is added later.
- [ ] Update `docs/longtail_forge_permissions_matrix.md` with the task permission contract.
- [ ] Extend `npm run test:permissions` for task visibility, creation, assignment, edit, complete, archive/delete, and Personal/Family client denial.

### Backend and API

- [ ] Add task repository/service/route files under `src/modules/tasks/`.
- [ ] Add browser API endpoints for task list, create, detail, update, complete/reopen, archive/delete, and assignment updates.
- [ ] Keep service-layer validation authoritative for workspace type, project/client relationship, assignment eligibility, module enablement, and permissions.
- [ ] Add audit log events for task create/update/complete/reopen/archive/delete/assignment changes.
- [ ] Add `/api/settings` and session/bootstrap metadata so navigation can show Tasks only when available.
- [ ] Decide whether public `/api/v1/tasks` belongs in 0.31.0 or should wait until the browser workflow is stable.

### Browser UI

- [ ] Add a Tasks page under Projects navigation.
- [ ] Add task list filters for status, assignee, client/project scope, due date, and overdue/due soon.
- [ ] Add task create/edit modal with workspace-aware client/project selectors.
- [ ] Add task detail modal or detail panel with title, description, status, priority, assignee, due date, optional due time, linked client/project, and completion controls.
- [ ] Add row actions for complete/reopen, edit, and archive/delete based on permissions.
- [ ] Add empty/loading/error states and avoid visible controls the current user cannot use.
- [ ] Make the page usable for Business, Personal, and Family workspaces.

### Verification

- [ ] Run `npm run check`.
- [ ] Run `npm run test:permissions`.
- [ ] Verify `/api/app-info` after restart.
- [ ] Smoke task creation/list/update/complete/archive flows through HTTP or browser automation.
- [ ] Smoke Personal/Family project-linked tasks and Business client/project-linked tasks.
- [ ] Run SQLite `PRAGMA integrity_check`.

## Version 0.31.1 - Task List, Detail, and Workflow Polish

0.31.1 should make the first task module feel like a real working surface instead of a bare CRUD page.

- [ ] Add saved user-facing sort defaults for due date, priority, status, and newest/oldest.
- [ ] Add quick filters for My Tasks, Unassigned, Overdue, Due Today, Due This Week, Completed, and Archived.
- [ ] Add bulk actions where permissions allow:
  - [ ] status change
  - [ ] assignee change
  - [ ] priority change
  - [ ] archive
- [ ] Add task counts to navigation/dashboard module metadata for overdue and due-soon tasks.
- [ ] Add task detail links that can be copied and opened directly.
- [ ] Keep completed tasks readable but visually distinct and excluded from active default views.
- [ ] Add frontend smoke helpers for task list and modal behavior under `window.LongtailForge.controllers`.
- [ ] Expand audit details so task changes are readable in Audit Log without exposing noisy JSON by default.

## Version 0.31.2 - Task Due Dates and Reminder Defaults

0.31.2 should store reminder intent and make due-date behavior configurable. Actual cross-module notification delivery can wait for the 0.35 notification system, but Tasks should be ready to feed it.

### Due Date Rules

- [ ] Date is required only when the user chooses a due date.
- [ ] Time is optional and nullable.
- [ ] Date-only tasks are displayed as date-only tasks.
- [ ] Date-plus-time tasks are displayed in the user's session timezone.
- [ ] Overdue logic should treat date-only tasks as overdue after the local day has passed, not at the start of the day.

### Reminder Defaults

- [ ] Add reminder-default settings at workspace level.
- [ ] Add reminder-default settings at client level for Business workspaces.
- [ ] Add reminder-default settings at project level.
- [ ] Implement inheritance:
  - [ ] Business: Workspace -> Client -> Project -> Task
  - [ ] Personal/Family: Workspace -> Project -> Task
- [ ] If no inherited or task-specific defaults exist, use:
  - [ ] Date-plus-time due dates: 2 hours before and 24 hours before
  - [ ] Date-only due dates: 3 days before and 1 day before
- [ ] Let individual tasks override inherited reminder defaults.
- [ ] Store reminder offsets in a normalized table rather than packed text.
- [ ] Add service methods that return the effective reminder policy for a task.

### Notification-Ready Records

- [ ] Add task reminder occurrence rows or computed reminder-read helpers, depending on final delivery design.
- [ ] Mark reminder records as pending/sent/dismissed/suppressed if occurrence rows are created.
- [ ] Do not require every-minute cron behavior yet; document what the future notification dispatcher will need.

### UI

- [ ] Add reminder defaults to Workspace Settings.
- [ ] Add client/project reminder defaults in the appropriate existing client/project settings surfaces.
- [ ] Add task reminder override controls in the task detail modal.
- [ ] Hide client reminder defaults outside Business workspaces.

## Version 0.31.3 - Task Recurrence

0.31.3 should add recurrence templates and recurring-instance creation using iCalendar-style RRULE logic.

### Recurrence Model

- [ ] Add a task recurrence template table where recurring tasks live.
- [ ] Store:
  - [ ] workspace/client/project scope
  - [ ] task title/description/status/priority/assignment defaults
  - [ ] due date/time pattern metadata
  - [ ] RRULE string
  - [ ] optional recurrence end date
  - [ ] active/paused status
  - [ ] created/updated metadata
- [ ] Link generated task instances back to their recurrence template.
- [ ] Let recurrence end dates be set when the first recurring task is created.
- [ ] Let recurrence end dates be updated or removed on future tasks.
- [ ] Use an iCalendar-style RRULE implementation or narrowly scoped RRULE parser/serializer rather than hand-rolled recurrence math where practical.

### Completion Behavior

- [ ] When a recurring task instance is completed, consult the recurrence template.
- [ ] Automatically create the next task instance when the recurrence rule has a next occurrence.
- [ ] Do not create a next instance after the recurrence end date.
- [ ] Prevent duplicate next-instance creation if completion is retried.
- [ ] Audit recurring instance creation and recurrence template changes.

### UI

- [ ] Add a `Recurring?` checkbox to the task modal.
- [ ] Add a recurrence detail button next to `Recurring?`.
- [ ] Keep the detail button disabled until `Recurring?` is checked.
- [ ] Open recurrence settings in a separate modal.
- [ ] Provide friendly recurrence fields that produce RRULE-compatible data.
- [ ] On save of a recurring task, prompt whether changes apply only to this task or to all future tasks.
- [ ] If all future tasks is selected, update the recurrence template.
- [ ] If only this task is selected, update only the current task instance.

## Version 0.31.4 - Task Calendar and Dashboard Hooks

0.31.4 should make Tasks available to the future calendar/dashboard system without building the full 0.34 calendar product early.

- [ ] Add backend task query helpers for calendar windows by due date.
- [ ] Add Dashboard task panels for overdue, due soon, and assigned-to-me tasks.
- [ ] Add module dashboard metadata so future dashboard sections can render task summaries without page-specific coupling.
- [ ] Add a simple calendar-ready API payload for tasks with due dates.
- [ ] Add task links from Dashboard rows into task detail.
- [ ] Keep full calendar views scheduled for 0.34.0.
- [ ] Ensure dashboard task sections respect task permissions and scope filtering.

## Version 0.31.5 - Task Timers

0.31.5 should connect Tasks to Time Tracking without making time tracking mandatory for every task.

### Enablement Rules

- [ ] Task timers require the Tasks module to be enabled.
- [ ] Task timers require the Time Tracking module to be enabled.
- [ ] Task timers should be a separate Tasks module sub-option in Workspace Settings.
- [ ] Only tasks linked to a project and/or Business client can use task timers.
- [ ] Personal/Family tasks can use task timers only when linked to workspace projects.
- [ ] Tasks cannot be completed while they have active task timers.

### Timer Persistence

- [ ] Add an `active_task_timers` table for task timer persistence.
- [ ] Model it after `active_timers`, with one active task timer per user per task.
- [ ] Store the linked `task_id` and the project/client context needed to write a final time entry.
- [ ] Pause or prevent conflicting timers using the existing time-tracking rule for one running timer per user.
- [ ] Decide whether task timers and normal timers are mutually exclusive globally per user or only within their own timer type.

### Time Entry Creation

- [ ] Stopping/saving a task timer writes to the existing `time_entries` table.
- [ ] The saved time entry includes `task_id` or a task-link metadata field for future reporting.
- [ ] Time entry project/client labels are derived server-side from the task's current linked project/client scope.
- [ ] Audit task timer start/pause/finalize/delete behavior at the same level as active timers where useful.

### UI

- [ ] Add task stopwatch controls to eligible task detail views.
- [ ] Hide or disable task timer controls when Time Tracking is disabled, task timers are disabled, or the task is not linked to an eligible scope.
- [ ] Show active task timer state on the task row/detail.
- [ ] Add clear messaging when completion is blocked by an active task timer.

## Version 0.31.6 - Task API, Reporting, and Documentation Hardening

0.31.6 should close the Tasks branch with stable contracts and cleanup before Support Tickets begin.

- [ ] Decide and add `/api/v1/tasks` endpoints if they were not shipped in 0.31.0.
- [ ] Add public API scopes for task read/write if public task endpoints are added.
- [ ] Add task-linked reporting filters for time entries created from task timers.
- [ ] Update `docs/public-api.md` for task endpoints and scopes.
- [ ] Update `docs/module-contract.md` with anything learned from adding the Tasks module.
- [ ] Update `docs/longtail_forge_permissions_matrix.md` with final 0.31 task coverage and tested scenarios.
- [ ] Add any task lifecycle decisions to `DECISIONS.md`.
- [ ] Run a final 0.31 code review focused on permissions, module boundaries, timezone handling, recurrence, and timer linkage.
- [ ] Archive completed 0.31 roadmap sections after the branch is complete, leaving 0.32+ active.

## 0.31.x Open Design Decisions

These are the decisions I should ask about before implementing the affected slice:

- [ ] Should a task have exactly one assignee, or support multiple assignees from the start?
- [ ] Should task assignment include groups/roles later, or only concrete users for 0.31.x?
- [ ] Should task statuses start simple (`open`, `in_progress`, `blocked`, `complete`, `archived`) or match a more formal workflow?
- [ ] Should priorities be a fixed set (`low`, `normal`, `high`, `urgent`) or user/workspace configurable?
- [ ] Should task delete be true delete, soft archive, or both with different permissions?
- [ ] Should public `/api/v1/tasks` launch with the first task release or wait until the browser task workflow stabilizes?
- [ ] Should task timers be mutually exclusive with normal Time Tracking timers for a user?

## Version 0.32.0 - Support Tickets

- [ ] Support tickets
  - [ ] Consult with existing support ticket solutions for best path here
  - [ ] Tickets should be assignable to clients and projects
  - [ ] Tickets should support internal notes
  - [ ] Tickets should support external/client-visible responses later
  - [ ] Ticket visibility and edit access should respect the roles/permissions system

## Version 0.33.0 - Notes/Knowledge Base foundations

- [ ] Notes/knowledge base
  - [ ] Notes should be linkable with either markdown or wiki-style linking
  - [ ] Notes should form the basis of the knowledge base
  - [ ] Knowledge base should build automatically from notes, tasks, and support tickets
    - Knowledge base will be a self-building "site" like SharePoint for working on tasks
  - [ ] Notes can be marked as specific to a client, project, or entire org
  - [ ] Notes should be marked as internal only or external visible
  - [ ] Notes should have a changelog table, can be reused from the audit log, but remains persistent
  - [ ] Note visibility and edit access should respect the roles/permissions system

## Version 0.34.0 - Calendars and Calendar Views

- [ ] Calendars

## Version 0.35.0 - Collaboration Tools

- [ ] Add in-app messaging between users
- [ ] UI Notifications (Toast? Bell at top?)
  - [ ] Should be built so any module can hook to notifications
  - future: this will incorporate into integrations like Slack, Teams, and Discord for sending notifications via chat messages

- will I need every minute cronjobs or something similar to make the notifications work?
- [ ] Add notifications hook to Tasks
- [ ] Add notifications hook to Tickets
- [ ] Add notifications hook to Notes

## Version 0.36.0 - Dashboard as Project Hub

- [ ] Dashboard should become the hub for managing projects
  - [ ] Add "Past Due/Due Soon" section that shows past due and upcoming tasks sorted by client and project
  - [ ] Add "Latest Updates" section
    - [ ] Newest clients
    - [ ] Newest projects
    - [ ] Newest tasks
    - [ ] Newest notes
    - [ ] Newest support tickets
    - [ ] Recent time entries if useful
- [ ] Add activity feed support (can be built onto notifications hooks)
  - [ ] Activity feed may be derived from audit events where appropriate
  - [ ] Activity feed should not expose sensitive audit JSON by default
  - [ ] Activity feed should be user-friendly and dashboard-focused
  - [ ] Keep audit log as the authoritative admin/security record
- [ ] Dashboard sections should respect permissions
  - [ ] Users should only see clients/projects/tasks/notes/tickets they are allowed to see
  - [ ] External client users should not see internal-only notes or admin-only audit details

## Version 0.37.0 - Tags

## Tagging Foundation

- Tags should be workspace-scoped, using `workspace_id`
- Tags should not be stored as comma-separated text on records
- Create a shared `tags` table for the tag definitions
- Create a shared `tag_assignments` table for assigning tags to records
- `tag_assignments` should support:
  - `workspace_id`
  - `tag_id`
  - `target_type`
  - `target_id`
  - `created_by_user_id`
  - `source` such as manual, system, import, rule
  - `created_at`
- Supported initial `target_type` values:
  - `time_entry`
  - `client`
  - `project`
  - `task`
  - `note`
  - `support_ticket`
- Future `target_type` values:
  - `invoice`

- [ ] Phase 1: Time entry tagging
  - Add tags to time entries first
  - Add tag picker/search UI to time tracker, manual time entry, and edit-entry screens
  - Add reporting filters by direct time-entry tags
  - Add basic tag management inside workspace settings or a simple admin page

- [ ] Phase 2: Client/project tagging
  - Allow clients and projects to be tagged as records
  - Show client/project tags as context on time entries
  - Do not automatically copy client/project tags onto time entries
  - Later reporting can optionally include records under clients/projects with matching tags

### Version 0.37.1

- [ ] Phase 3: Shared tagging service
  - Create shared tag repository/service methods
  - Validate that tagged records belong to the active workspace
  - Audit log tag create/update/delete and tag assignment changes
  - Keep tag logic reusable for future tasks, notes, tickets, and invoices

### Version 0.37.2

- [ ] Add tagging to Tasks
- [ ] Add tagging to Notes
- [ ] Add tagging to Tickets

## Version 0.38.0 - Expanded Reporting and Invoicing

- [ ] Expanded reporting
- [ ] Invoicing

## Version 0.39.0 - User Account Security Upgrades and Database/Settings File Backup/Restore

### Two Factor Authentication (TOTP) (2FA)

- [ ] Add optional 2FA for users. Can be turned on in the Settings -> User dialog
- [ ] Super admins should be able to turn on a setting that requires 2FA setup on next login for individual users
- [ ] Workspace admins can require users have 2FA to join workspace

### Version 0.39.1 - Passkeys

- [ ] Passkeys

### Version 0.39.2 - User Sessions

- [ ] Sessions should expire after 1 day
- [ ] Super Admins should have ability to log users out
- [ ] Workspace admins should have ability to log users out


### Version 0.39.3

Super Admins should have a backup/restore function on the dashboard that dumps the current database into a clean file with an app meta data file that has app version stamped and datetime (UTC) of backup in it and zips it into a zip file along with any physical settings files on disk (this will be necessary after packaging for self-hosting and may not yet be necessary, but I want uniform functions for backup/restore that can be easily modified in the future)

- [ ] Create backup function to grab and zip:
  - [ ] Database dump
  - [ ] App meta data file to include app version and datetime stamp of backup
  - [ ] Setup files (can be blank for now)
- [ ] Add backup to user interface for Super Admins in Settings menu
  - Label should be "App Backup"
  - Should only be visible if user is Super Admin (utilize session auth variables to keep from adding/hiding the option)
  - [ ] "Perform backup" button
    - this should then provide a link to the downloadable zip file
    - download should be a temporary file on the server in a "downloads" directory
    - backup should have checksum
    - backup shouldn't delete temporary file until checksum is confirmed
  - [ ] "Perform restore" button
    - this should only accept zip files
    - this should verify files, checksum, etc. before installing/overwriting current data

## Version 0.40.0 - Project Tools expansion & Database extraction layer for use with SQLite or PostGRES

Now that we have the base layer of a complete project management tool, we can begin expanding actual project management with milestones, dependencies, status reporting, budgeting, estimation, views, templates, etc.

Allowing the app to run on SQLite OR PostGRES makes it more flexible for self-hosted installs; I want the database layer to be able to handle either one, based on the settings/.env file

Below is a rough road map for all of the 0.40 branch, this is not finalized yet

### Project Tools expansion

- [ ] Project Milestones/Phases/Deliverables
  - Milestones belong to a workspace and optionally a client/project
  - Tasks, notes, tickets, time entries, and files may eventually link to a milestone
  - Milestones should have a title, description, status, due date, sort order, and optional completion/completed date
  - This should not block basic tasks, but the data model should leave room for it

- [ ] Task dependencies/blockers
  - Allow one task to depend on another task
  - Show blocked tasks clearly
  - Prevent circular dependencies
  - Allow blocked-by relationships across the same project, and maybe later across projects

- [ ] Project Status/Health
  - Project status: active, paused, completed, archived
  - Project heatlh: on_track, at_risk, blocked, waiting_on_client
  - Dashboard should eventually surface project health

- [ ] Project budgeting/estimation/actuals
  - should be optional for personal/family projects
  - [ ] Add estimated hours to projects
  - [ ] Add optional budgeted hours/dollars to projects
  - [ ] Compare estimated vs actual tracked time
  - [ ] Show budget/burn progress on project pages and dashboard
  - [ ] Allow reporting by client, project, milestone, tag, and date range

- [ ] List/Kanban/Calendar views
  - [ ] Add list view for tasks
  - [ ] Add Kanban board view for tasks grouped by status
  - [ ] Add calendar view for tasks with due dates

- [ ] Project/task templates
  - should have hard-coded, initial examples that can be used as well as saved templates
  - [ ] Add task templates
  - [ ] Add project templates
  - [ ] Allow project templates to create default milestones, tasks, notes, and checklists
  - [ ] Allow workspace-level templates first
  - [ ] Later: allow client-specific templates

- [ ] Task checklists (tasks can have sub-item checklists)
  - Checklist items belong to a task
  - Items can be checked/unchecked and sorted
    - sort by: due date, importance, etc.
  - Checklist completion can optionally contribute to task progress

- [ ] Task/Project discussions
  - [ ] Add comments to tasks
  - [ ] Add comments to projects
  - [ ] Add internal comments to support tickets
  - [ ] Comments should respect permissions and visibility
  - [ ] Comments should appear in activity feeds where appropriate

- [ ] Files/attachments foundation
  - [ ] Add file attachment foundation for notes/tasks/support tickets/projects
  - [ ] Store file metadata in database
  - [ ] Decide local storage vs object storage later
  - [ ] Respect workspace/client/project permissions
  - [ ] Public-safe attachments required before public KB/client portal features

- [ ] Project Owner/Responsible-user fields
  - [ ] Workspace owner
  - [ ] Client/account owner
  - [ ] Project owner
  - [ ] Ticket owner
  - [ ] Task/ticket assignee remains separate from project ownership

- [ ] Saved views
  - people will want views like: "Tasks due this week," "Waiting on client," "Client open tickets," etc.
  - [ ] Allow users to save commenly used filters
  - [ ] Saved views may apply to tasks, time entries, tickets, notes, and dashboard sections
  - [ ] Views should be user-specific first
  - [ ] Workspace-share views can come later

- [ ] Client approvals/change requests
  - [ ] Add lightweight approval records
  - [ ] Add change request records
  - [ ] Link approvals/change requests to clients, projects, milestones, tasks, notes, or tickets
  - [ ] Track requested_by, approved_by, approved_at, status, and notes
  - [ ] Consider client-facing approvals only after permissions/client portal features exist

- [ ] Timeline/Gannt-style view

- [ ] Workload/capacity planning

- [ ] Portfolio-level reporting across clients/projects/workspaces

### Database Tools

- [ ] Configuration files for initial configuration
- [ ] Migration tools to switch between database backends
- [ ] Export/Import database tools
  - [ ] Allow users to export their workspaces

### App Decisions

- [ ] Define archival period
- [ ] Define lifecycle of tasks, notes, tickets, etc.

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
- [ ] Add production cookie flags
- [ ] Self-hosted release
- [ ] Expand project management tools

### Added during 0.30.6 Code Review

- Verify runtime data directory permissions for `data/`, `logs/`, and `archive/`.
- Ensure the SQLite database file is not web-served under any configuration.
- Add startup warnings when data/log directories are world-readable or world-writable on platforms where that can be checked reliably.
- Add backup/restore path validation that prevents writing outside approved runtime directories.
- Consider an install health-check endpoint or CLI command that reports filesystem lockdown status without exposing sensitive paths to normal users.

## Version 0.55.0

- [ ] Email delivery
- [ ] Invite links
- [ ] Single Sign-On (SSO)

## Version 0.60.0 - SaaS Wrapper

- [ ] SaaS wrapper
- [ ] Hosted PostgreSQL
- [ ] Tenant signup
- [ ] Billing
- [ ] Monitoring

## Version 0.70.0 - Integrations and Plugin Readiness

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
  - [ ] Integrations should respect workspace, client, project, and user permissions
  - [ ] Integration events should be audit logged where appropriate
  - [ ] Integration-created records should identify their source in metadata
  - [ ] Avoid integration-specific logic leaking into core services where a module or adapter would be cleaner
