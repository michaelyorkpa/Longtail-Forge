# Longtail Forge Roadmap

This file is the detailed per-version changelog and forward plan for Longtail Forge. README.md should stay cursory and point here for version-level detail.

### Verion 0.30.6 - Code Review

Complete a code review to ensure all items necessary are in place to continue moving forward with modularization and expansion of app functionality.

Goals for remainder of 0.30.x:

- [x] Add CODEREVIEW.md to .gitignore
  - [x] Put human readable notes and potential ROADMAP for remainder of clean up (0.30.7+) into CODEREVIEW.md for this step only
  - [x] Add ROADMAP section to CODEREVIEW.md in the form of this ROADMAP so I can drag and drop it into place for remainder of 0.30.7+ to complete clean up
  - [x] In CODEREVIEW.md, create a section specifically, for instructions for completing overall framework and modularization
    - [x] Break tasks down into logical sections
    - [x] Go as deep into sub-versions as necessary, e.g. 0.30.7.x.x
  - [x] Document steps needed to finish modularization before integrating new task, notes, knowledge base, and support ticket modules
    - 0.31 forward will be adding of additional modules (tasks, notes, tickets, etc.)
    - 0.30.x is the final steps of the clean up to move this from a bloated time tracker to a project management framework with an already mature time tracker module
  - [x] Look at 0.30.final which is for creating nested clients and nested projects (A client might have multiple sub-clients, a project might have multiple sub-projects)
    - [x] Create a ROADMAP style set of instructions for 0.30.final and add that to the end of the ROADMAP section in CODEREVIEW.md
      - I will rename the .final with the appropriate number once this code review is complete
    - avoid circular client/project logic (a parent cannot become a child of a child client/project)
    - check for any other pitfalls and put in language to avoid them

- [x] Ensure all necessary code changes are in place to create true separtion between the framework and time tracking module

- [x] Verify permissions are being respected, document where changes need to be made

- [x] Verify roles apply correct default permissions

- [x] Verify there are no bugs/omissisions that could allow access by unauthenticated users
  - [x] Add tasks to CODEREVIEW.md that indicate where it will become necessary to begin checking file system permissions for lockdown
    - this will likely be in the 0.50 release, and does NOT need to be included in the 0.30.x section

- [x] Confirm code currently conforms to best practices for ease of maintenance, functionality, and modularity

- [x] Add ROADMAP-ARCHIVE.md to .gitignore
  - [x] Archive all completed ROADMAP sections to ROADMAP-ARCHIVE.md in this step
  - [x] Add instruction to AGENTS.md to perform this archival task automatically moving forward

### Version 0.30.7 - Permission Regression Hardening

- [ ] Add a lightweight automated permission test harness
  - [ ] Seed or fixture at least one workspace admin, client admin, project admin, client user, project user, and external client user
  - [ ] Verify unauthenticated browser API requests return 401
  - [ ] Verify protected HTML redirects unauthenticated users to login
  - [ ] Verify API-key routes reject missing, invalid, revoked, and underscoped keys
- [ ] Add mutation permission tests
  - [ ] Clients create/update/archive
  - [ ] Projects create/update/archive
  - [ ] Project move across clients and workspace projects
  - [ ] Time-entry create/update/delete
  - [ ] Active timer save/finalize/remove
  - [ ] User create/update/deactivate/reactivate/remove
  - [ ] Role assignment update
  - [ ] Workspace settings update
  - [ ] API key create/revoke
- [ ] Add ownership and scope regression tests
  - [ ] Time-entry update cannot change `user_id`
  - [ ] Public API time-entry create cannot spoof `user_id`
  - [ ] Project update requires permission on the current project scope before checking the target scope
  - [ ] Role assignment scope IDs must belong to the active workspace

### Version 0.30.8 - Module Contract Cleanup

- [ ] Define a module contract document in code or docs
  - [ ] Module id, display name, category, version
  - [ ] Browser API routes
  - [ ] Public API routes if any
  - [ ] Protected views
  - [ ] Browser assets
  - [ ] Migrations
  - [ ] Seed/repair hooks
  - [ ] Navigation contributions
  - [ ] Dashboard contributions
  - [ ] Required permissions
  - [ ] Workspace capability requirements
- [ ] Move module status enforcement into reusable middleware/helper functions
- [ ] Ensure disabled modules consistently block write paths and hide navigation
- [ ] Decide whether disabled modules should allow historical read-only access per module
- [ ] Move remaining module-aware bootstrap logic into shared framework services

### Version 0.30.9 - Time Tracking Module Boundary

- [ ] Treat Time Tracking as the reference module
  - [ ] Keep timers, manual entry, edit entries, time-entry repos/services/routes, active timers, and time-entry public API paths together
  - [ ] Move time-tracking migrations fully under the module migration folder
  - [ ] Document which framework services Time Tracking depends on
- [ ] Remove time-tracking assumptions from framework surfaces
  - [ ] Reporting menu and Dashboard should ask modules for available panels/links
  - [ ] Workspace Settings should render module settings through a module metadata pattern
  - [ ] Public API docs should list endpoints by module
- [ ] Add module-level smoke checks for enabled/disabled Time Tracking behavior

### Version 0.30.10 - Client/Project Domain Cleanup

- [ ] Decide whether Clients/Projects is framework core or a first-class module
- [ ] Extract shared record-scope helpers for workspace/client/project validation
- [ ] Extract project move/update record propagation planning into one service
- [ ] Add explicit behavior for archived clients/projects and downstream records
- [ ] Add explicit behavior for removing/deactivating workspace owners and creators
- [ ] Finish separating workspace projects from business client-linked projects in reporting and filters

### Version 0.30.11 - Frontend Controller Split

- [ ] Split large browser controllers into page controllers plus shared helpers
  - [ ] `public/js/clients-projects.js`
  - [ ] `public/js/stop-watch.js`
  - [ ] `public/js/user-admin.js`
  - [ ] `public/js/edit-entries.js`
- [ ] Keep shared helpers as browser globals under `window.LongtailForge`
- [ ] Avoid a frontend build step until the module structure is stable
- [ ] Add page-level smoke tests or browser-console verification helpers for critical workflows

### Version 0.30.12 - Reporting And Dashboard Framework Prep

- [ ] Move report aggregation behind backend services
- [ ] Make Reporting module-aware
  - [ ] Hide business client filters for personal/family workspaces
  - [ ] Default personal/family reporting to workspace projects
  - [ ] Allow future modules to add report panels
- [ ] Make Dashboard module-aware
  - [ ] Convert Dashboard into a project/workspace hub
  - [ ] Let Time Tracking contribute current-month/time/billing widgets
  - [ ] Reserve extension points for tasks, notes, tickets, notifications, and activity feed

### Version 0.30.13 - Workspace Lifecycle Hardening

- [ ] Define behavior when a user is removed from all workspaces
- [ ] Define behavior when a workspace owner is deactivated or removed
- [ ] Add owner transfer rules
- [ ] Add workspace creation permission controls per user
- [ ] Add self-hosted workspace type limit UI or setup guidance
- [ ] Verify personal/family/business workspace rules through tests

### Version 0.30.14 - Storage Rename Plan

- [ ] Inventory remaining `organization_id` compatibility usage
- [ ] Decide the final migration order for replacing legacy organization names with workspace names
- [ ] Keep backward-compatible aliases until public API and browser code have moved
- [ ] Add tests that old aliases and new workspace fields remain synchronized during the compatibility phase
- [ ] Document when legacy organization names can be removed

### Version 0.30.15 - Client and project nesting expansion

Now that clients and projects are separated, there is a need to create nested clients and nested projects.

The preferred starting model is adjacency-list storage with `parent_client_id` on clients and `parent_project_id` on projects. A join table is not necessary for single-parent trees. Use a closure table only if reporting queries become too slow or if multi-parent relationships become a real requirement. Multi-parent client/project graphs are not recommended for the first version because they make permissions, rollups, archival, and cycle prevention harder.

- [ ] Add parent fields
  - [ ] Add nullable `parent_client_id` to clients
  - [ ] Add nullable `parent_project_id` to projects
  - [ ] Add indexes for workspace plus parent fields
  - [ ] Ensure parent and child records belong to the same workspace
  - [ ] For projects, ensure parent and child client relationships are compatible
- [ ] Prevent circular nesting
  - [ ] A client cannot become its own parent
  - [ ] A project cannot become its own parent
  - [ ] A parent cannot be assigned to one of its descendants
  - [ ] Validate cycles server-side before save
  - [ ] Keep UI safeguards as helpful hints only; server validation is authoritative
- [ ] Define nesting permissions
  - [ ] Moving a client requires permission on the current client scope and the target parent scope
  - [ ] Moving a project requires permission on the current project scope and the target parent/project/client scope
  - [ ] Workspace admins can manage all nesting inside a workspace
  - [ ] Client/project admins remain constrained to their assigned scope
- [ ] Update reporting rollups
  - [ ] Reports can include descendants of selected clients
  - [ ] Reports can include descendants of selected projects
  - [ ] Add filters for direct records only versus include descendants
  - [ ] Preserve historical time-entry client/project names while matching by stable IDs
- [ ] Update UI
  - [ ] Add parent selectors for clients and projects
  - [ ] Display nested records as indented lists or collapsible tree rows
  - [ ] Keep flat filters available for fast lookup
  - [ ] Show clear warnings before moving a client/project with existing records
- [ ] Update audit and downstream records
  - [ ] Audit parent changes with old/new parent IDs and names
  - [ ] Decide whether moving a client/project updates historical records or only affects future rollups
  - [ ] Add explicit confirmation before applying any downstream record propagation

## Version 0.31.0 - Tasks

0.31+ is the beginnings of true project functionality. By the end of 0.3x there will be integrated modules for tasks, notes, tickets, and collaboration.

- [ ] Tasks
  - [ ] Tasks are assigned to workspaces
    - [ ] Project assignation is optional
    - [ ] Client assignation is optional, based on the project it's assigned to  (inherits client from project)
  - [ ] Tasks offer due dates with adjustable reminders
    - [ ] Time should be an optional (NULLable) field in due dates
    - [ ] Reminder notifications default to a configurable number of days/hours prior
    - [ ] Reminder defaults can be configurable at the workspace, client, and project levels
      - [ ] These settings should respect default inheritence (Workspace, Client, Project for Business; Workspace, Project for Personal/Family)
      - [ ] If unset, the defaults should be:
        - If time is NOT NULL in the due date, default reminders are:
          - [ ] 2 hours before
          - [ ] 24 hours before
        - If time is NULL in the due date, default reminders are:
          - [ ] 3 days before
          - [ ] 1 day before
  - [ ] Tasks offer recurrence
    - [ ] Recurrence fields should be in a separate modal window
    - [ ] Tasks should have checkbox with "Recurring?" next to it
    - [ ] Recurrence Detail modal is opened with button next to "Recurring?" checkbox
      - [ ] "Detail" button should be grayed out until "Recurring?" is checked
    - [ ] Task recurrence should conform to iCalendar-style RRULE logic
    - [ ] UI displays user-friendly fields to build recurrence
  - [ ] Tasks appear on calendars
  - [ ] Tasks are assignable to users/admins within client/project as appropriate per user permissions
  - [ ] Task visibility and edit access should respect the roles/permissions system

### Version 0.31.1 - Task Recurrence

A task recurrence template table should be built.

When a task is marked as recurring it should automatcally create a recurring task template

When a recurring task is marked complete, the recurring task template is consulted

Use iCalendar-style RRULE logic.

- [ ] Recurrence table
  - this will be where recurring tasks "live"
  - when a task is completed, if it is marked as recurring, the recurring task template is consulted
    - new task is then created automatically from template based on recurrence rules
  - recurring tasks can have an optional end date, set as soon as the first instance of the recurring task and can be updated on any future task
    - end dates can be removed
  - recurring task templates can be modified at any point
    - when changing a recurring task, after clicking "Save" user is prompted whether they want to change only this task or all future tasks. If all future tasks, recurring template is updated, otherwise only the current task is changed.

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
