# Longtail Forge Roadmap

This file is the detailed per-version changelog and forward plan for Longtail Forge. README.md should stay cursory and point here for version-level detail.

## Version 0.31.15 - Module Views, Assets, and Page Registration

* [x] Add framework-owned view/page registration

  * [x] Modules can register protected views
  * [x] Modules can register public views later if needed
  * [x] Each registered view should define:

    * View ID
    * URL/path
    * Module ID
    * View file
    * Required permission
    * Required workspace capability
    * Whether disabled modules can show historical views
  * [x] Unknown protected views should not be served just because an HTML file exists

* [x] Update static/view serving to respect module registration

  * [x] Public pages remain framework-owned
  * [x] Protected framework pages remain framework-owned
  * [x] Protected module pages are served only when registered
  * [x] Disabled module views should return a clear disabled-module page or redirect
  * [x] Unauthorized module views should return the standard unauthorized behavior

* [x] Add module asset registration

  * [x] Allow modules to declare JS/CSS asset paths
  * [x] Keep common framework CSS/JS global
  * [x] Keep module-specific JS/CSS module-owned
  * [x] Avoid loading module-specific frontend code globally unless needed

* [x] Keep framework UI assets in framework/app-shell space

  * [x] Notification bell/toast UI is framework-owned
  * [x] Global search UI is framework-owned
  * [x] Workspace switcher is framework-owned
  * [x] Module pages should not duplicate app shell UI

* [x] Add basic module page documentation

  * [x] Explain how a module registers a protected page
  * [x] Explain how the navigation entry links to the page
  * [x] Explain permission and enabled/disabled behavior

* [x] Register the Workbench page as a framework-owned protected view

  * [x] Workbench page is not owned by Tasks, Time Tracking, Notes, or Support Tickets
  * [x] Workbench page can load module-contributed cards only when those modules are enabled and authorized
  * [x] Workbench page assets should be framework-owned
  * [x] Module-specific Workbench card renderers should be module-owned where practical
  * [x] Unknown/unregistered Workbench card renderers should fail safely with a clear placeholder

## Version 0.31.16 - Module Permissions and API Scope Contracts

* [ ] Make permissions more module-declarative

  * [ ] Modules declare their required permissions in the manifest
  * [ ] Modules declare user-facing permission labels/descriptions
  * [ ] Modules declare default role permission mappings where practical
  * [ ] Framework sync registers module permissions in the database
  * [ ] Framework sync should not duplicate permissions

* [ ] Add module resource definitions

  * [ ] Modules should be able to declare resource keys such as `tasks`, `time_entries`, `tickets`, `notes`, or `messages`
  * [ ] Resource definitions should include supported operations:

    * `read`
    * `create`
    * `update`
    * `delete`
    * `archive`
    * `restore`
    * `assign`
    * `manage`
  * [ ] Permission checking should gradually move away from hard-coded resource key mapping

* [ ] Add framework-owned permission expectations for notifications

  * [ ] Notifications should never expose records the user cannot access
  * [ ] Opening a notification should re-check access to the underlying record
  * [ ] Notification APIs should only return notifications for the authenticated user/workspace
  * [ ] Workspace admins may eventually manage notification defaults but should not read private user notifications unless explicitly designed later

* [ ] Make public API scopes more module-declarative

  * [ ] Modules declare public API scopes
  * [ ] Modules declare public API endpoints
  * [ ] API key UI reads available scopes from framework/module registry
  * [ ] Disabled module scopes should not be offered for new API keys
  * [ ] Existing API keys should not be able to write to disabled modules

* [ ] Add tests for permission and scope registration

  * [ ] Verify module permissions are registered
  * [ ] Verify role permission defaults are applied
  * [ ] Verify module API scopes appear in API key settings
  * [ ] Verify disabled modules block public API writes
  * [ ] Verify unauthorized users do not see module navigation
  * [ ] Verify users cannot read notifications for records they cannot access

## Version 0.31.17 - Internal Event and Hook System

* [ ] Add a lightweight internal event bus

  * [ ] Framework services can emit events
  * [ ] Modules can subscribe to events through declared hooks
  * [ ] Hooks should run server-side only
  * [ ] Hook failures should be logged clearly
  * [ ] Hook failures should not silently corrupt core record saves

* [ ] Define core event naming conventions

  * Examples:

    * `workspace.created`
    * `workspace.updated`
    * `module.enabled`
    * `module.disabled`
    * `client.created`
    * `client.updated`
    * `project.created`
    * `project.updated`
    * `time_entry.created`
    * `time_entry.updated`
    * `task.created`
    * `task.updated`
    * `task.completed`
    * `task.archived`
    * `task.restored`
    * `notification.created`
    * `notification.read`
    * `notification.dismissed`

* [ ] Add event payload conventions

  * [ ] Include `workspace_id`
  * [ ] Include actor/session where available
  * [ ] Include `record_type`
  * [ ] Include `record_id`
  * [ ] Include previous value where appropriate
  * [ ] Include new value where appropriate
  * [ ] Include source such as manual, system, import, public_api, integration
  * [ ] Include module ID where applicable

* [ ] Use events for future cross-module behavior

  * [ ] Search indexing
  * [ ] Activity feed
  * [ ] Notifications
  * [ ] Integrations
  * [ ] Webhooks later
  * [ ] Background jobs later

* [ ] Do not refactor every service into events at once

  * Start with module lifecycle events and Tasks events
  * Add Time Tracking events after the event bus is stable
  * Keep this version focused on the event framework, not every future event consumer

## Version 0.31.18 - Audit, Activity, and Notification Extensibility

* [ ] Make audit record types extensible

  * [ ] Modules can declare audit record types
  * [ ] Framework validates module-declared record types
  * [ ] Audit service accepts registered module record types
  * [ ] Unknown record types should still be rejected unless explicitly allowed

* [ ] Make audit change types extensible only where needed

  * [ ] Keep common change types framework-owned
  * [ ] Avoid letting modules create confusing one-off change types unnecessarily
  * [ ] Prefer module-specific actions with common change types

* [ ] Prepare activity feed groundwork

  * [ ] Define difference between audit logs and activity feed
  * [ ] Audit log remains the authoritative security/admin record
  * [ ] Activity feed should be user-friendly and safe for dashboard display
  * [ ] Activity feed should never expose raw audit JSON by default
  * [ ] Activity feed should respect permissions

* [ ] Prepare notification-safe event summaries

  * [ ] Define difference between activity feed and notifications
  * [ ] Notifications are directed user alerts
  * [ ] Activity feed is a permission-safe timeline
  * [ ] Audit log is the admin/security record
  * [ ] Notification payloads should not expose sensitive audit JSON

* [ ] Add helper for activity-safe event summaries

  * [ ] Module can provide a human-readable label
  * [ ] Module can provide a safe record URL
  * [ ] Module can provide dashboard-safe summary text
  * [ ] Activity feed implementation can come later

* [ ] Add helper for notification-safe event summaries

  * [ ] Module can provide a notification title
  * [ ] Module can provide a notification body
  * [ ] Module can provide a safe record URL
  * [ ] Module can provide recipient resolution hints
  * [ ] Full notification implementation starts in 0.32.x

* [ ] Clarify activity feed vs Workbench page terminology

  * [ ] Workbench page is the user's live workflow desktop/workbench
  * [ ] Activity feed is a permission-safe historical timeline
  * [ ] Audit log remains the authoritative security/admin record
  * [ ] Notifications are directed user alerts
  * [ ] Do not use "Activity" as the main navigation label for the Workbench page unless the activity feed is renamed later

## Version 0.31.19 - Developer Module Example and Documentation

* [ ] Add an example first-party stub module

  * [ ] Keep it disabled by default
  * [ ] Keep it simple and clearly marked as a developer example
  * [ ] Include example browser API route
  * [ ] Include example public API route if useful
  * [ ] Include example navigation entry
  * [ ] Include example settings field
  * [ ] Include example permission declaration
  * [ ] Include example view registration
  * [ ] Include example event hook
  * [ ] Include example notification event/template declaration
  * [ ] Do not add business functionality to the stub module

* [ ] Add developer documentation

  * [ ] How to create a module manifest
  * [ ] How to register module routes
  * [ ] How module settings work
  * [ ] How module permissions work
  * [ ] How module navigation works
  * [ ] How module views/assets work
  * [ ] How module migrations work
  * [ ] How events/hooks work
  * [ ] How module enable/disable works
  * [ ] How framework notifications work
  * [ ] How modules declare notification events/templates
  * [ ] How tags/search will hook into modules starting in 0.32.x

* [ ] Add a framework sanity check script

  * [ ] Validate registered modules
  * [ ] Validate duplicate module IDs
  * [ ] Validate duplicate routes where practical
  * [ ] Validate duplicate permission IDs
  * [ ] Validate duplicate API scopes
  * [ ] Validate duplicate notification event IDs
  * [ ] Validate malformed notification templates
  * [ ] Validate missing module dependencies
  * [ ] Add the script to `npm run check`

## Version 0.31.20 - Timer Sources and Workbench Item Integration Cleanup

* [ ] Formalize first-party timer source routes

  * [ ] Time Tracking should expose shared active timer routes for:
    * Listing active/paused timers
    * Starting a timer
    * Pausing a timer
    * Finalizing a timer into a time entry
    * Removing/discarding a timer
  * [ ] Source modules should expose source-specific workbench item routes where needed
  * [ ] Tasks should expose trackable task records through the timer/workbench item source contract
  * [ ] Support Tickets should later use the same contract instead of creating a separate timer system

* [ ] Normalize Workbench page timer behavior

  * [ ] Workbench page should list manual timers and sourced timers together
  * [ ] Workbench page should display the timer source clearly
  * [ ] Workbench page should allow quick switching between manual timers, task timers, and future ticket timers
  * [ ] Time Tracker stopwatch page should be able to selectively pull in saved manual timers and sourced timers such as task timers
  * [ ] Workbench page should not need to know whether a timer came from Tasks, Tickets, or another future module
  * [ ] Workbench page should handle disabled modules gracefully

* [ ] Keep Time Tracking and Tasks separate but integrated

  * [ ] Time Tracking remains usable when Tasks is disabled
  * [ ] Tasks remains usable when Time Tracking is disabled, but task timers are unavailable
  * [ ] Task timers require both Tasks and Time Tracking to be enabled
  * [ ] Task timer permissions should require task read access and time entry create access
  * [ ] Finalized task timers should create normal time entries with `task_id`
  * [ ] Task completion should continue to block or warn when an active task timer exists

* [ ] Prepare Support Ticket timer integration

  * [ ] Define expected source values for tickets:
    * `source_module_id = support-tickets`
    * `source_type = ticket`
    * `source_id = ticket_id`
  * [ ] Tickets should eventually appear in the Workbench page as trackable workbench items
  * [ ] Ticket timers should finalize into normal time entries with `ticket_id` or equivalent source metadata
  * [ ] Ticket timer behavior should reuse the same active timer engine as manual and task timers

* [ ] Add developer documentation

  * [ ] Explain how a module exposes timer-capable records
  * [ ] Explain how a module exposes Workbench page cards
  * [ ] Explain how source metadata flows into active timers
  * [ ] Explain how finalized timers become time entries
  * [ ] Include examples for manual timers, task timers, and future ticket timers

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

### Version 0.38.3

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

### Version 0.39.0

Final code refactor for modularization and standardization

Final checkpoint for documentation update before standardization of database tools

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
