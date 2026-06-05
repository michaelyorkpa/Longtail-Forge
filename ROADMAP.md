# Longtail Forge Roadmap

This file is the detailed per-version changelog and forward plan for Longtail Forge. README.md should stay cursory and point here for version-level detail.

### Version 0.31.24.1 - UI Tweaks and Clean up

- Do not hard code any of these changes. They should all be adjusted properly through views, routes, and best practices to maintain the integrity of the framework.

#### Appearance

- [x] There is no need for scope/client in Personal or Family Workspaces at all. Clients should not appear anywhere. 
  - [x] All projects, are workspace scoped in Personal/Family Workspaces
  - [x] Tasks can be Workspace scoped or project scoped
  - [x] Time entries can be project scoped

- [x] Personal and Family workspaces should NOT have an option for "Default Billing Rate"
  - It should be removed from all UI
  - It should be nullable in the database

- In Workspace Settings, Personal and Family workspaces:
  - [x] Should change "Billing Period" to "Time Reporting Period"
  - [x] Should not display Fiscal Year selection (This should simply default to January 1)

- [x] In Business workspaces, workspace projects should be displayed with the scope of the Workspace Name. Do not add " Projects" to the end
- [x] In all locations that include client/scope, the Workspace Projects should be at the top (with the workspace name, only)

- In add/edit task modals:
  - [x] Recurrence should be collapsible

- In Projects -> Tasks truncate with hover over for full reveal for: 
  - [x] Scope
  - [x] Asignees

- [x] Settings -> Workspace -> Clients -> Edit client modal footer doesn't go all the way to the bottom of the modal window

#### Behavior

- [x] The Client (Scope) and Project selection boxes need to be organized
  - [x] Alphabetically
  - [x] Child items should be indented below parent items
  - [x] Child items should be organized alphabetically
  - [x] These settings also need to apply to the Parent Client drop down box in Settings -> Add/Edit Client
  - Client List in Settings -> Workspace -> Clients is properly organized, good work!

- [x] New tasks should default Assignee to task creator

- [x] Add "Project Defaults" section to Project settings
  - This should start collapsed in the project settings
  - [x] Add "default priority" and "default status" for tasks to Project settings
  - [x] Add "default sort order" to Project settings
    - This should be a re-arrangable box
    - This should default to: Due Date, Priority, Status

- [x] Fix historical records
  - When parent clients are added, all existing projects need to be updated
  - Individual items don't need to be updated, because they should still have the project assigned and be accessible by reporting
  - I recently moved three clients under the parent client of "Steven Spohn" and no projects or time entries show up
    - [x] Please correct the affected projects for this move and make the change permanent in code

### Version 0.31.24.2 - Database speed up

Database calls have begun slowing down. I'm unsure what the cause is, but it's creating a noticable lag on the front end. Please do some testing and fill this ROADMAP section with the actions to take with the results of your tests.

## Version 0.32.0 - Notifications Framework Foundation

* [ ] Add framework-owned notification tables

  * [ ] Notifications should be framework-owned, not owned by Tasks, Tickets, Notes, Messaging, or Time Tracking
  * [ ] Notifications should be workspace-scoped
  * [ ] Notifications should be recipient-specific
  * [ ] Notifications should be permission-aware
  * [ ] Notifications should be module-aware
  * [ ] Notifications should be safe when modules are disabled

* [ ] Add `notifications` table

  * [ ] `notification_id`
  * [ ] `workspace_id`
  * [ ] `module_id`
  * [ ] `event_type`
  * [ ] `recipient_user_id`
  * [ ] `actor_user_id`
  * [ ] `record_type`
  * [ ] `record_id`
  * [ ] `title`
  * [ ] `body`
  * [ ] `url`
  * [ ] `status`
  * [ ] `priority`
  * [ ] `created_at`
  * [ ] `read_at`
  * [ ] `dismissed_at`
  * [ ] `metadata_json`

* [ ] Add notification indexes

  * [ ] Workspace + recipient + status + created date
  * [ ] Workspace + module ID
  * [ ] Workspace + record type + record ID
  * [ ] Workspace + event type
  * [ ] Created date for cleanup/retention

* [ ] Add notification statuses

  * [ ] `unread`
  * [ ] `read`
  * [ ] `dismissed`
  * [ ] `archived` if needed later

* [ ] Add notification priorities

  * [ ] `low`
  * [ ] `normal`
  * [ ] `high`
  * [ ] `urgent`

* [ ] Add module-declared notification event/template contract

  * [ ] Modules should declare notification event types
  * [ ] Modules may declare notification templates
  * [ ] Notification declarations should include:

    * `id`
    * `moduleId`
    * `label`
    * `description`
    * `defaultEnabled`
    * `defaultPriority`
    * recipient resolver name or framework-recognized recipient mode
    * title template
    * body template
    * URL/record link pattern if applicable
  * [ ] Framework should not maintain a permanent hard-coded list of notification event types

* [ ] Add core notification permissions

  * [ ] `notifications.view_own`
  * [ ] `notifications.manage_preferences`
  * [ ] `notifications.manage_workspace_defaults`
  * [ ] Add default role mappings for users/workspace admins where appropriate

## Version 0.32.1 - Notification Service and API

* [ ] Create shared notification repository/service methods

  * [ ] Create notification
  * [ ] Create notification for multiple recipients
  * [ ] List notifications for current user
  * [ ] Count unread notifications for current user
  * [ ] Mark notification as read
  * [ ] Mark all notifications as read
  * [ ] Dismiss notification
  * [ ] Archive/cleanup old notifications
  * [ ] Read notification target metadata safely

* [ ] Validate notification operations through the framework

  * [ ] Validate notification belongs to active workspace
  * [ ] Validate notification recipient is the current user
  * [ ] Validate target module is registered
  * [ ] Validate target record type is registered where applicable
  * [ ] Validate target record still belongs to active workspace where practical
  * [ ] Validate user can access the target before opening/following notification link
  * [ ] Validate disabled modules cannot create new notifications

* [ ] Add browser API routes for notifications

  * [ ] `GET /api/notifications`
  * [ ] `GET /api/notifications/unread-count`
  * [ ] `POST /api/notifications/:notificationId/read`
  * [ ] `POST /api/notifications/read-all`
  * [ ] `POST /api/notifications/:notificationId/dismiss`

* [ ] Add notification event integration

  * [ ] Framework event bus can trigger notification creation
  * [ ] Modules can emit events that notification rules consume
  * [ ] Keep first implementation simple and synchronous unless it becomes slow
  * [ ] Leave room for background jobs later

* [ ] Add audit/activity considerations

  * [ ] Creating a normal user notification does not need full audit logging every time
  * [ ] Notification preference changes should be audit logged where appropriate
  * [ ] Workspace-level notification default changes should be audit logged
  * [ ] Security-sensitive notifications can be audit logged later if needed

## Version 0.32.2 - In-App Notification UI and Preferences

* [ ] Add framework-owned notification UI

  * [ ] Add notification bell to the authenticated app shell
  * [ ] Show unread notification count
  * [ ] Show recent notifications dropdown/panel
  * [ ] Allow notifications to be marked read
  * [ ] Allow notifications to be dismissed
  * [ ] Link notifications to registered record URLs where safe
  * [ ] Do not duplicate notification UI inside individual modules

* [ ] Add notification page if needed

  * [ ] List user notifications
  * [ ] Filter by unread/read/dismissed
  * [ ] Filter by module/source if useful
  * [ ] Support pagination
  * [ ] Support empty states

* [ ] Add notification preferences groundwork

  * [ ] User-level notification preferences
  * [ ] Workspace-level notification defaults
  * [ ] Allow modules to declare configurable notification types
  * [ ] Users can mute notification types where permitted
  * [ ] Workspace admins can set default behavior where appropriate

* [ ] Add initial notification events

  * [ ] `task.assigned`
  * [ ] `task.due_soon`
  * [ ] `task.overdue`
  * [ ] `timer.still_running` if practical
  * [ ] `module.disabled` for admins if useful

* [ ] Add regression tests

  * [ ] Users only see their own notifications
  * [ ] Notifications cannot cross workspace boundaries
  * [ ] Notifications do not open records the user cannot access
  * [ ] Disabled modules do not create new notifications
  * [ ] Unread count updates after read/dismiss actions
  * [ ] Notification bell does not break unauthenticated/public pages

## Version 0.32.3 - Tags Framework Foundation

* [ ] Add framework-owned tagging tables

  * [ ] Create shared `tags` table for tag definitions
  * [ ] Create shared `tag_assignments` table for assigning tags to records
  * [ ] Tags should be workspace-scoped using `workspace_id`
  * [ ] Tags should not be stored as comma-separated text on records

* [ ] `tags` table should support:

  * `tag_id`
  * `workspace_id`
  * `name`
  * `slug`
  * `description`
  * `color`
  * `status`
  * `created_by_user_id`
  * `created_at`
  * `updated_at`

* [ ] `tag_assignments` table should support:

  * `tag_assignment_id`
  * `workspace_id`
  * `tag_id`
  * `target_type`
  * `target_id`
  * `created_by_user_id`
  * `source`
  * `created_at`

* [ ] Add indexes for common tag lookup patterns

  * [ ] Workspace + tag slug
  * [ ] Workspace + tag status
  * [ ] Workspace + target type + target ID
  * [ ] Workspace + tag ID + target type
  * [ ] Prevent duplicate active assignment of the same tag to the same target

* [ ] Add module-declared taggable type contract

  * [ ] Modules should declare which record types are taggable
  * [ ] Taggable type declarations should include:

    * `targetType`
    * `moduleId`
    * `idField`
    * `labelField`
    * `workspaceField`
    * `clientField` if applicable
    * `projectField` if applicable
    * required read permission
    * required tag/edit permission
  * [ ] Framework should not maintain a permanent hard-coded list of taggable target types

* [ ] Add core tag permissions

  * [ ] `tags.manage`
  * [ ] `tags.view`
  * [ ] `tags.assign`
  * [ ] `tags.remove`
  * [ ] Add default role mappings for workspace admins and appropriate scoped roles

* [ ] Define system tag policy

  * [ ] Manual tags come first
  * [ ] System/automatic tags should wait until manual tagging is stable
  * [ ] Use real fields for behavior/security
  * [ ] Do not use tags as the source of truth for visibility, permissions, billing status, workflow status, or archival state
  * [ ] Example: note visibility should eventually be stored as a `visibility` field, not enforced by `#public`

## Version 0.32.4 - Tag Service and API

* [ ] Create shared tag repository/service methods

  * [ ] Create tag
  * [ ] Update tag
  * [ ] Archive/disable tag
  * [ ] Restore tag
  * [ ] List workspace tags
  * [ ] Search workspace tags by name/slug
  * [ ] Read tags assigned to a target
  * [ ] Assign tag to target
  * [ ] Remove tag from target
  * [ ] Replace target tags in one save operation

* [ ] Validate tag operations through the framework

  * [ ] Validate tag belongs to active workspace
  * [ ] Validate target type is registered as taggable
  * [ ] Validate target record exists
  * [ ] Validate target record belongs to active workspace
  * [ ] Validate user can view target before showing assigned tags
  * [ ] Validate user can assign/remove tags before changing assignments
  * [ ] Validate disabled modules cannot receive new tag assignments unless explicitly allowed

* [ ] Add browser API routes for tagging

  * [ ] `GET /api/tags`
  * [ ] `POST /api/tags`
  * [ ] `PUT /api/tags/:tagId`
  * [ ] `POST /api/tags/:tagId/archive`
  * [ ] `POST /api/tags/:tagId/restore`
  * [ ] `GET /api/tags/assignments`
  * [ ] `PUT /api/tags/assignments`

* [ ] Add audit logging for tag changes

  * [ ] Tag created
  * [ ] Tag updated
  * [ ] Tag archived
  * [ ] Tag restored
  * [ ] Tag assigned to target
  * [ ] Tag removed from target
  * [ ] Bulk tag assignment changes

* [ ] Add basic tag management UI

  * [ ] Add tag management under workspace settings or a dedicated admin page
  * [ ] List active tags
  * [ ] Add/edit/archive tags
  * [ ] Keep UI simple until tagging is proven across several modules

## Version 0.32.5 - Tagging Core Records

* [ ] Register initial taggable types through module manifests

  * [ ] `time_entry`
  * [ ] `client`
  * [ ] `project`
  * [ ] `task`

* [ ] Add tag picker/search UI helper

  * [ ] Reusable frontend helper for selecting tags
  * [ ] Reusable frontend helper for displaying assigned tags
  * [ ] Reusable frontend helper for saving target tag assignments
  * [ ] Avoid building separate custom tag pickers for every module

* [ ] Add tagging to Tasks

  * [ ] Add tag display to task list
  * [ ] Add tag picker to create/edit task modal
  * [ ] Add tag filters to task list
  * [ ] Include tags in task read/list API responses
  * [ ] Audit tag changes separately from normal task field edits

* [ ] Add tagging to Time Entries

  * [ ] Add tag picker/search UI to time tracker finalization flow where practical
  * [ ] Add tag picker/search UI to manual time entry
  * [ ] Add tag picker/search UI to edit entries
  * [ ] Add reporting filters by direct time-entry tags
  * [ ] Include tags in time entry read/list/reporting responses where useful

* [ ] Add tagging to Clients and Projects

  * [ ] Allow clients to be tagged
  * [ ] Allow projects to be tagged
  * [ ] Show client/project tags as context on related records where useful
  * [ ] Do not automatically copy client/project tags onto time entries or tasks
  * [ ] Later reporting can optionally include records under clients/projects with matching tags

## Version 0.32.6 - Search Framework Contract

* [ ] Add framework-owned search service

  * [ ] Search should be a framework service, not a feature owned by Tasks, Notes, Tickets, Messaging, or Time Tracking
  * [ ] Search should be permission-aware
  * [ ] Search should be workspace-aware
  * [ ] Search should be module-aware
  * [ ] Search should be tag-aware
  * [ ] Search should be notification-aware only where notification records themselves are searchable later

* [ ] Add search backend adapter contract

  * [ ] Start with a simple database-backed adapter
  * [ ] Leave room for SQLite FTS5
  * [ ] Leave room for PostgreSQL full-text search
  * [ ] Leave room for external search engines later
  * [ ] Do not require Elasticsearch/OpenSearch at this stage

* [ ] Add initial `search_index` table

  * [ ] `search_index_id`
  * [ ] `workspace_id`
  * [ ] `module_id`
  * [ ] `record_type`
  * [ ] `record_id`
  * [ ] `title`
  * [ ] `summary`
  * [ ] `body`
  * [ ] `tags_text`
  * [ ] `client_id`
  * [ ] `project_id`
  * [ ] `visibility`
  * [ ] `record_status`
  * [ ] `source`
  * [ ] `record_created_at`
  * [ ] `record_updated_at`
  * [ ] `indexed_at`

* [ ] Add indexes for basic search/filtering

  * [ ] Workspace + record type
  * [ ] Workspace + module ID
  * [ ] Workspace + client ID
  * [ ] Workspace + project ID
  * [ ] Workspace + record status
  * [ ] Workspace + indexed timestamp
  * [ ] Basic title/body lookup appropriate for current SQLite approach

* [ ] Add module-declared searchable type contract

  * [ ] Modules should declare which record types are searchable
  * [ ] Searchable type declarations should include:

    * `recordType`
    * `moduleId`
    * `idField`
    * `titleField`
    * `summaryField`
    * `bodyFields`
    * `workspaceField`
    * `clientField` if applicable
    * `projectField` if applicable
    * required read permission
    * indexer function/reference
  * [ ] Framework should not maintain a permanent hard-coded list of searchable record types

## Version 0.32.7 - Search Indexing and Rebuild Tools

* [ ] Add search indexing methods

  * [ ] Index one record
  * [ ] Remove one record from index
  * [ ] Re-index one record
  * [ ] Re-index all records for one module
  * [ ] Re-index all records for one workspace
  * [ ] Re-index all records for the app if needed

* [ ] Connect search indexing to framework events

  * [ ] Index records on create
  * [ ] Update index records on update
  * [ ] Update or remove index records on archive
  * [ ] Restore index records on restore
  * [ ] Remove index records when a module is disabled if historical search should be hidden
  * [ ] Rebuild index records when a module is re-enabled

* [ ] Add initial searchable records

  * [ ] Tasks
  * [ ] Time entries
  * [ ] Clients
  * [ ] Projects

* [ ] Add search rebuild admin/tooling path

  * [ ] Add safe server-side method to rebuild search index
  * [ ] Add admin-only endpoint or script for rebuilding search index
  * [ ] Do not expose broad rebuild tools to normal users
  * [ ] Log rebuild activity clearly

* [ ] Keep search indexing boring at first

  * [ ] No external search engine yet
  * [ ] No fuzzy search yet
  * [ ] No synonyms yet
  * [ ] No advanced relevance tuning yet
  * [ ] Build the contract first so the backend can improve later

## Version 0.32.8 - Search API and Global Search UI

* [ ] Add browser API search endpoint

  * [ ] `GET /api/search`
  * [ ] Support query text
  * [ ] Support module filter
  * [ ] Support record type filter
  * [ ] Support client filter
  * [ ] Support project filter
  * [ ] Support tag filter
  * [ ] Support pagination
  * [ ] Respect workspace and permissions

* [ ] Add public API search endpoint only if safe

  * [ ] Consider `GET /api/v1/search`
  * [ ] Require API key scopes
  * [ ] Respect workspace and module permissions
  * [ ] Do not expose records from disabled modules unless explicitly allowed
  * [ ] This can be deferred if browser search is enough for now

* [ ] Add global search UI

  * [ ] Add simple search box to the authenticated app shell
  * [ ] Show grouped results by record type
  * [ ] Show record title
  * [ ] Show short summary/snippet
  * [ ] Show module/source label
  * [ ] Show client/project context where useful
  * [ ] Show tags where useful
  * [ ] Link search result to the registered record URL when available
  * [ ] Keep global search UI framework-owned

* [ ] Add search results page

  * [ ] Support filters
  * [ ] Support pagination
  * [ ] Support empty states
  * [ ] Support permission-safe result display
  * [ ] Avoid making dashboard search too complex

## Version 0.32.9 - Framework Integration Tests and Reporting Hooks

* [ ] Add tag filters to reporting where useful

  * [ ] Filter time reports by direct time-entry tags
  * [ ] Filter task lists/reports by direct task tags
  * [ ] Consider client/project tag filters as optional context filters
  * [ ] Do not automatically treat client/project tags as tags on child records unless explicitly selected

* [ ] Add search-aware reporting helpers

  * [ ] Allow reports to link to filtered search results where useful
  * [ ] Allow dashboard sections to link to search results where useful
  * [ ] Keep reporting calculations based on real records, not the search index

* [ ] Add notification-aware dashboard helpers

  * [ ] App shell can show unread notification count
  * [ ] Dashboard can eventually show user-specific notification summaries
  * [ ] Notification summaries should respect permissions
  * [ ] Notification summaries should not expose raw audit JSON
  * [ ] Do not build full activity feed here unless already stable

* [ ] Add saved filter groundwork if useful

  * [ ] This does not need full saved views yet
  * [ ] Leave room for future saved views in the project-management expansion
  * [ ] Search filters and report filters should use compatible naming where practical

* [ ] Add regression tests

  * [ ] Tags cannot cross workspace boundaries
  * [ ] Tags cannot be assigned to records the user cannot access
  * [ ] Search does not return records the user cannot access
  * [ ] Search does not return disabled-module records unless historical access allows it
  * [ ] Search results update after record edits
  * [ ] Search index rebuild does not duplicate records
  * [ ] Reporting tag filters return expected records
  * [ ] Notifications cannot cross workspace boundaries
  * [ ] Notifications are only visible to intended recipients
  * [ ] Notifications do not expose records the user cannot access
  * [ ] Disabled modules do not create new notifications

## Version 0.33.0 - Support Tickets

- [ ] Support tickets
  - [ ] Consult with existing support ticket solutions for best path here
  - [ ] Tickets should be assignable to clients and projects
  - [ ] Tickets should support internal notes
  - [ ] Tickets should support external/client-visible responses later
  - [ ] Ticket visibility and edit access should respect the roles/permissions system

## Version 0.34.0 - Notes/Knowledge Base foundations

- [ ] Notes/knowledge base
  - [ ] Notes should be linkable with either markdown or wiki-style linking
  - [ ] Notes should form the basis of the knowledge base
  - [ ] Knowledge base should build automatically from notes, tasks, and support tickets
    - Knowledge base will be a self-building "site" like SharePoint for working on tasks
  - [ ] Notes can be marked as specific to a client, project, or entire org
  - [ ] Notes should be marked as internal only or external visible
  - [ ] Notes should have a changelog table, can be reused from the audit log, but remains persistent
  - [ ] Note visibility and edit access should respect the roles/permissions system

## Version 0.35.0 - Calendars and Calendar Views

- [ ] Calendars

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

## Version 0.37.0 - Expanded Reporting and Invoicing

- [ ] Expanded reporting
- [ ] Invoicing

## Version 0.38.0 - User Account Security Upgrades and Database/Settings File Backup/Restore

### Two Factor Authentication (TOTP) (2FA)

- [ ] Add optional 2FA for users. Can be turned on in the Settings -> User dialog
- [ ] Super admins should be able to turn on a setting that requires 2FA setup on next login for individual users
- [ ] Workspace admins can require users have 2FA to join workspace

### Version 0.38.1 - Passkeys

- [ ] Passkeys

### Version 0.38.2 - User Sessions

- [ ] Sessions should expire after 1 day
- [ ] Super Admins should have ability to log users out
- [ ] Workspace admins should have ability to log users out

## Version 0.38.3 - Login Security Monitoring and Risk Scoring

- [ ] Add `user_login_events` table:
  - [ ] `login_event_id`
  - [ ] `user_id`
  - [ ] `occurred_at`
  - [ ] `success`
  - [ ] `failure_reason`
  - [ ] `ip_address`
  - [ ] `ip_hash`
  - [ ] `user_agent`
  - [ ] `user_agent_hash`
  - [ ] `browser_family`
  - [ ] `os_family`
  - [ ] `device_type`
  - [ ] `country`
  - [ ] `region`
  - [ ] `risk_score`
  - [ ] `risk_reason`
  - [ ] `session_id_hash`
  - [ ] `metadata_json`
- [ ] Log authentication events:
  - [ ] Successful login.
  - [ ] Failed login.
  - [ ] Password reset requested.
  - [ ] Password reset completed.
  - [ ] 2FA challenge success/failure.
  - [ ] Passkey registration/removal.
  - [ ] New device/session.
  - [ ] Logout.
  - [ ] Admin-forced logout.
- [ ] Add login risk checks:
  - [ ] New device/browser.
  - [ ] New country or impossible travel.
  - [ ] IP reputation check if available.
  - [ ] Many failures for same account.
  - [ ] Many failures from same IP.
  - [ ] Successful login after many failures.
  - [ ] Login from TOR/VPN/proxy if detectable.
- [ ] Add risk-based responses:
  - [ ] Low risk: allow login and log event.
  - [ ] Medium risk: allow login and notify user.
  - [ ] High risk: require 2FA/passkey reauthentication if available.
  - [ ] Critical risk: temporarily block or require password reset/admin review.
- [ ] Add user-facing security tools:
  - [ ] Show recent login history in user settings.
  - [ ] Allow user to revoke sessions.
  - [ ] Email/in-app notification for new device login.
  - [ ] Email/in-app notification for suspicious login.
- [ ] Add admin security tools:
  - [ ] View recent failed login patterns.
  - [ ] Force logout user sessions.
  - [ ] Temporarily disable account.
  - [ ] Require password reset.
  - [ ] Require 2FA setup.
- [ ] Privacy rules:
  - [ ] Do not log passwords, tokens, reset tokens, or full session IDs.
  - [ ] Consider hashing or truncating IP addresses for long-term retention.
  - [ ] Define retention period for login events.
  - [ ] Restrict access to login security logs.

### Version 0.38.4

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

### Version 0.39.0 - Shopping / Procurement Lists Module

- [ ] Add optional first-party lists module for personal/family and business workspaces.
- [ ] Use workspace-aware labels:
  - [ ] Personal/family workspaces: "Shopping Lists"
  - [ ] Business workspaces: "Procurement Lists"
- [ ] Core list fields:
  - [ ] `list_id`
  - [ ] `workspace_id`
  - [ ] `client_id` optional
  - [ ] `project_id` optional
  - [ ] `title`
  - [ ] `description`
  - [ ] `list_type`
  - [ ] `status`
  - [ ] `created_by_user_id`
  - [ ] `created_at`
  - [ ] `updated_at`
- [ ] List item fields:
  - [ ] Item name.
  - [ ] Quantity.
  - [ ] Unit.
  - [ ] Needed by date.
  - [ ] Vendor/store.
  - [ ] URL.
  - [ ] Estimated cost.
  - [ ] Actual cost.
  - [ ] Purchase/order status.
  - [ ] Notes.
  - [ ] Assigned user.
  - [ ] Sort order.
  - [ ] Checked/completed state.
- [ ] Business use cases:
  - [ ] Project parts list.
  - [ ] R&D purchasing list.
  - [ ] Office supply list.
  - [ ] Client/project procurement checklist.
- [ ] Personal/family use cases:
  - [ ] Grocery list.
  - [ ] Household shopping list.
  - [ ] Trip packing/shopping list.
  - [ ] Family project supply list.
- [ ] Integrations:
  - [ ] Lists should support tags once tagging is stable.
  - [ ] Lists should be searchable once framework search is stable.
  - [ ] List activity should be able to appear in dashboard/activity feed later.

### Version 0.39.1 - Creator Studio / Content Studio Module

- [ ] Add optional first-party `creator-studio` module.
- [ ] Core records:
  - [ ] Content ideas.
  - [ ] Content drafts.
  - [ ] Campaigns/series.
  - [ ] Publishing channels.
  - [ ] Assets/media.
  - [ ] Content templates.
  - [ ] Repurposing tasks.
- [ ] Content idea fields:
  - [ ] Title.
  - [ ] Description/angle.
  - [ ] Workspace.
  - [ ] Client/project if applicable.
  - [ ] Channel(s).
  - [ ] Format: blog, short, long video, email, social post, product page, course material, etc.
  - [ ] Status: idea, planned, drafting, editing, scheduled, published, archived.
  - [ ] Priority.
  - [ ] Target publish date.
  - [ ] Assigned user.
  - [ ] Tags.
  - [ ] Related notes/tasks/assets.
- [ ] Editorial calendar:
  - [ ] Calendar view by publish date.
  - [ ] List view by status.
  - [ ] Kanban view by production stage.
  - [ ] Filter by brand/site/channel/project/tag.
- [ ] Publishing channels:
  - [ ] Website/blog.
  - [ ] YouTube.
  - [ ] Shorts/Reels/TikTok.
  - [ ] Newsletter.
  - [ ] Facebook/Instagram/X/LinkedIn/Mastodon.
  - [ ] Podcast if needed later.
- [ ] Asset library:
  - [ ] Attach images, video, audio, documents, thumbnails, captions, and scripts.
  - [ ] Track asset usage across content items.
  - [ ] Store alt text, captions, source/license notes, and credit requirements.
- [ ] Repurposing workflow:
  - [ ] One long-form item can spawn shorts, social posts, newsletter blurbs, blog excerpts, and follow-up tasks.
  - [ ] Track each derivative item separately but link it to the source content.
- [ ] Analytics groundwork:
  - [ ] Store published URL.
  - [ ] Store basic performance notes manually at first.
  - [ ] Later: integrate platform analytics where APIs allow.
- [ ] Permissions:
  - [ ] Creator Studio records are workspace-scoped.
  - [ ] Client/project-linked content respects existing permissions.
  - [ ] External clients may be allowed to review/comment only if explicitly enabled.


## Final checkpoint for documentation update before 0.40.0

## Version 0.40.0 - Project Tools expansion & Database extraction layer for use with SQLite or PostGRES

Now that we have the base layer of a complete project management tool, we can begin expanding actual project management with milestones, dependencies, status reporting, budgeting, estimation, views, templates, etc.

Allowing the app to run on SQLite OR PostGRES makes it more flexible for self-hosted installs; I want the database layer to be able to handle either one, based on the settings/.env file

Below is a rough road map for all of the 0.40 branch, this is not finalized yet

- [ ] Add topics to GitHub for discovery

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
  - More formal task workflow, such as `backlog`, `ready`, `in_progress`, `waiting`, `blocked`, `in_review`, `approved`, `complete`, `canceled`, and `archived`, often with rules about which statuses can move to which next statuses.

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
  - [ ] Merge all previous migrations to make unified initial SQL
- [ ] Migration tools to switch between database backends
- [ ] Export/Import database tools
  - [ ] Allow users to export their workspaces

### App Decisions

- [ ] Define archival period
- [ ] Define lifecycle of tasks, notes, tickets, etc.

## Version 0.45.0 - Phone/Tablet/TV app prep

- Prepare APIs for Phone/Tablet/TV apps

- Universal Longtail Forge app for iOS

- Universal Longtail Forge app for Android (Latest)

- Roku apps for coordinating teams/families
  - Displays Calendar/Task Lists/Current-Upcoming Day Events

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

### Guidelines/Notes for Integrations

- [ ] Integration architecture
  - [ ] Integrations should authenticate through API keys, OAuth, or integration-specific credentials as appropriate
  - [ ] Integrations should respect workspace, client, project, and user permissions
  - [ ] Integration events should be audit logged where appropriate
  - [ ] Integration-created records should identify their source in metadata
  - [ ] Avoid integration-specific logic leaking into core services where a module or adapter would be cleaner

### Potential Integrations List

### Support tickets

- [ ] ZenDesk
- [ ] FreshDesk

### Calendars

- [ ] Google Calendar
- [ ] Outlook Calendar

### Task App Integrations

- [ ] Microsoft To Do
- [ ] Google Tasks


### File Sharing and Storage

Is it possible to get notifications from any of these sources?

- [ ] Microsoft OneDrive 
- [ ] Google Drive
- [ ] DropBox
- [ ] Microsoft SharePoint
  - File sharing
  - Knowledgebase pages
  - Input for tickets/notes/tasks/etc.

### Email integrations

Auto-routing communications/messaging

- [ ] Google Workspace email
- [ ] Outlook

### eCommerce Plugins

- [ ] Knowledge Base plugin
- [ ] Support ticket plugin
  - Would include notes plugin for Shopify Admin
- [ ] Automated task creation from:
  - Front-end support tickets
  - Order issues (fulfillment failure, etc.)

- [ ] WordPress/WooCommerce
- [ ] Shopify
- [ ] Magento
- [ ] BigCommerce

### Personal/Family Workspace Integrations

- [ ] Create grocery/shopping list items from Home Assistant (voice commands inputs)
- [ ] Update/create project tasks from Home Assistant (voice commands inputs)

- [ ] Home Assistant
- [ ] Apple Home
- [ ] Google Assistant (Google Home?)

## Version 0.71.0

- [ ] Buy domain name
  - [ ] Launch website

- [ ] Launch Social Media
