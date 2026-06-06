# Longtail Forge Architecture

Longtail Forge started as a time tracker and is growing into a small-project operations hub for freelancers, small agencies, self-hosted teams, and eventually personal/family workspaces.

The long-term architecture goal is for Longtail Forge to behave like a framework with bundled first-party modules, rather than a single tightly-coupled app where every feature is hard-coded into the frontend, backend, and database.

This document explains the intended architecture direction so future development stays consistent.

---

## Core Principle

Longtail Forge should be built around this distinction:

```text
Framework/Core = the system that lets modules exist and work together.

Modules = workflow tools that plug into the framework.
```

The framework should provide shared services such as users, workspaces, authentication, permissions, navigation, module lifecycle, tags, search, notifications, audit logging, settings, events/hooks, and APIs.

Modules should provide business/workflow functionality such as tasks, time tracking, notes, support tickets, calendars, in-app messaging, invoicing, and reporting expansions.

---

## Current Architecture Direction

As of version 0.31.25, Longtail Forge has an active first-party module architecture with display-only workspace-aware terminology for framework/module-registry surfaces.

Current first-party modules include:

* Users
* Client/Project Management
* Tasks
* Time Tracking

These modules are registered explicitly in the static module registry. The current manifest contract includes startup validation, registry-driven navigation, settings, protected views, browser assets, permissions, API scopes, audit record types, internal events, event summaries, Workbench cards, timer sources, work item sources, lifecycle hooks, dependency checks, notification declarations, taggable type declarations, and reserved search declarations.

The next architecture step is not automatic plugin discovery. The next step is to continue building the framework-owned services declared in the roadmap, moving from notifications and tags foundations toward tag APIs, tag UI, and search while keeping first-party modules on the same manifest rails future modules will use.

Longtail Forge should prefer:

```text
Explicit module registration
Clear module manifests
Predictable startup validation
Framework-owned lifecycle rules
```

over:

```text
Automatic filesystem discovery
Magic loading behavior
Hidden coupling
Hard-coded frontend menus
Feature-specific framework hacks
```

---

## What Belongs in the Framework/Core

The framework/core is the part of Longtail Forge that should exist even if most workflow modules are disabled.

Framework/core includes:

* Users
* Workspaces
* Authentication
* Sessions
* Roles and permissions
* Workspace membership
* App shell
* Navigation framework
* Settings framework
* Module registry
* Module lifecycle
* Module manifest validation
* Public API foundation
* Browser/internal API foundation
* API key foundation
* Audit logging
* Activity-safe event summaries
* Event/hook system
* Tags framework
* Search framework
* Notifications framework
* Timezone normalization helpers
* Error handling
* Database migration runner
* Backup/restore foundation later
* Setup/install foundation later

These systems are not optional workflow features. They are the foundation other features depend on.

The current database startup contract is documented in [database.md](database.md). New installs use the 0.31.22 fresh-start baseline instead of replaying the historical migration chain, while future migrations still run after that baseline.

---

## What Belongs in First-Party Modules

First-party modules are official Longtail Forge features that ship with the app, but should still behave like modules.

First-party modules may be enabled or disabled per workspace when appropriate.

Examples:

* Client/Project Management
* Tasks
* Time Tracking
* Notes/Knowledge Base
* Support Tickets
* Calendars
* In-app Messaging
* Invoicing
* Reporting expansions
* Files/attachments
* Saved views
* Approvals/change requests

Some first-party modules may feel essential, but they should still follow the module contract wherever possible.

---

## Tasks and Time Tracking

Tasks and Time Tracking should not be treated as framework core.

They should be treated as bundled first-party workflow modules.

They are important, official, deeply integrated modules, but the framework should not require them to exist.

### Tasks

Tasks should be a first-party workflow module that hooks into:

* Workspaces
* Clients/projects
* Permissions
* Tags
* Search
* Dashboard widgets
* Notifications
* Activity feed
* Audit logging
* Public API scopes
* App navigation
* Time tracking where enabled

Tasks should not be hard-coded into the framework as a required feature.

A workspace should eventually be able to use Longtail Forge for notes, support tickets, client records, time tracking, or knowledge base work even if tasks are disabled.

### Time Tracking

Time Tracking should also be a first-party workflow module.

Time tracking is central to the original version of Longtail Forge, but not every workspace needs it.

Examples:

* Business workspaces may use time tracking heavily.
* Personal workspaces may not need time tracking at all.
* Family workspaces may use tasks and notes but not billing/time tracking.
* Some future installs may use Longtail Forge mostly as a support ticket/knowledge base tool.

Time Tracking should hook into:

* Clients/projects
* Tasks
* Tags
* Search
* Reporting
* Invoicing
* Audit logging
* Public API scopes
* Dashboard widgets
* Notifications
* Workspace settings

Time Tracking should not be framework core.

### Shared Infrastructure Behind Tasks and Time Tracking

Reusable infrastructure used by Tasks and Time Tracking may belong in the framework.

Examples:

* Date/time normalization
* Timezone helpers
* Audit helpers
* Permission/resource helpers
* Taggable record contracts
* Searchable record contracts
* Notification helpers
* Event emission helpers
* Reminder framework later
* Recurrence framework later
* Assignment patterns later
* Status/archive conventions later

The feature is not core, but some of its reusable support systems may become core.

---

## Notifications and Messaging

Notifications are framework infrastructure.

In-app messaging is a first-party collaboration module.

This distinction is important.

Notifications tell users something happened.

Messaging is one of the things that can happen.

### Notifications Framework

The notification system should be owned by the framework because every module may need to notify users about events.

Examples:

* A task is due soon.
* A task was assigned to a user.
* A ticket received a reply.
* A note mentioned a user.
* A timer is still running.
* An invoice is overdue.
* A module was disabled.
* An integration created a record.
* A future third-party module needs to alert users.

The framework should own:

* Notification records
* Read/unread state
* Notification recipients
* Notification preferences
* Notification permissions and visibility
* Notification bell/toast UI
* Notification API
* Notification cleanup/retention rules
* Event-to-notification hooks
* Future delivery adapters

Future delivery adapters may include:

* In-app notifications
* Email
* Push notifications
* Slack
* Microsoft Teams
* Discord
* Webhooks

Modules should create notifications by emitting events or calling the framework notification service.

Modules should not each invent their own notification system.

Example flow:

```text
task.due_soon event
-> notifications framework creates notification
-> app shell shows badge/bell/toast
-> user marks notification read
```

### In-App Messaging Module

In-app messaging should be a first-party collaboration module, not framework core.

Messaging should own:

* Conversations
* Messages
* Message threads
* Participants
* Read receipts if added later
* Message-specific permissions
* Message-specific views
* Message-specific APIs
* Message search/tag hooks
* Message attachments later if needed

Messaging may use the framework notification service to alert users about new messages, replies, or mentions.

Example flow:

```text
User sends message
-> messaging module stores message
-> messaging module emits message.created
-> notifications framework alerts recipients
```

### Activity Feed Difference

Activity feed is separate from both notifications and messaging.

Audit log is the admin/security truth.

Activity feed is a user-friendly, permission-safe summary of recent events.

Notifications are directed alerts to specific users.

Messaging is a collaboration feature for user conversations.

In short:

```text
Audit log = what happened, for admins/security/history.
Activity feed = what happened, summarized for users.
Notifications = something needs a user's attention.
Messaging = users talking to each other.
```

---

## Module Categories

Longtail Forge modules should be categorized to make the app easier to understand.

Suggested categories:

```text
framework
core-admin
core-workflow
project-management
collaboration
knowledge
billing-reporting
integration
developer-example
```

### Framework Services

Framework services are not normal optional modules.

Examples:

* Auth
* Permissions
* Workspaces
* Module registry
* Tags
* Search
* Notifications
* Audit logging
* App shell
* Event/hook system

These should not appear to users as normal installable modules.

### Bundled First-Party Modules

Bundled first-party modules are official Longtail Forge modules.

Examples:

* Tasks
* Time Tracking
* Client/Project Management
* Notes
* Support Tickets
* Calendars
* In-app Messaging

These may be enabled/disabled by workspace depending on workspace type, permissions, and module dependencies.

### Third-Party Modules

Third-party modules are future externally developed modules.

They should eventually be able to declare their own:

* Routes
* Views
* Assets
* Navigation
* Settings
* Permissions
* API scopes
* Taggable record types
* Searchable record types
* Notification events/templates
* Audit record types
* Event hooks
* Migrations

Third-party module support should be built on the same contract used by first-party modules.

---

## Module Manifest Contract

Each module should have a manifest that describes how it plugs into Longtail Forge.

The manifest should be boring, explicit, and predictable.

A module manifest may support:

```js
{
  id,
  name,
  displayName,
  description,
  category,
  version,
  enabledByDefault,
  canDisable,
  historicalReadAccess,

  browserApiRoutes,
  publicApiRoutes,
  migrationsDir,
  protectedViewsDir,
  publicViewsDir,
  browserAssetsDir,

  navigation,
  dashboard,
  reporting,
  workbench,
  settings,

  protectedViews,
  publicViews,
  browserAssets,
  permissions,
  requiredPermissions,
  resourceDefinitions,
  defaultRolePermissions,
  publicApiEndpoints,
  apiScopes,

  taggableTypes,
  searchableTypes,
  notificationEvents,
  notificationTemplates,
  auditRecordTypes,
  eventTypes,
  eventSummaries,
  timerSources,
  workItemSources,
  hooks,

  frameworkDependencies,
  moduleDependencies,
  workspaceCapabilityRequirements,

  seedHooks,
  repairHooks
}
```

Not every field needs to be active immediately. Some fields may be reserved for future framework work.

The important part is that modules declare their needs in one place instead of requiring hard-coded changes throughout the app.

---

## Module Registry

The module registry is responsible for knowing which modules exist.

Current behavior can remain explicit for now.

Future behavior should allow modules to be registered through a configuration layer, but Longtail Forge should not rely on automatic filesystem discovery.

Preferred direction:

```text
Explicit first-party module registration first.
Manifest validation second.
Configurable external module registration later.
Automatic discovery never, unless there is a strong reason.
```

The registry/service layer now provides helper methods like:

```js
listModules()
getModule(moduleId)
listEnabledModules(workspaceId)
listBrowserApiRoutes()
listPublicApiRoutes()
listModuleMigrationSources()
listModuleNavigation(workspaceId, session)
listModuleSettings(workspaceId, session)
listModulePermissions()
listModuleApiScopes()
listTaggableTypes()
listSearchableTypes()
listNotificationEvents()
listNotificationTemplates()
listAuditRecordTypes()
listModuleEventTypes()
listModuleEventSummaries()
listWorkbenchCards(workspaceId, session)
listTimerSources(workspaceId, session)
listWorkItemSources(workspaceId, session)
```

For active first-party modules, the registry/service layer is the source of truth for module contributions.

---

## Module Lifecycle

Modules should have a clear lifecycle.

Possible lifecycle states:

```text
registered
installed
enabled
disabled
archived
error
```

For now, Longtail Forge mostly needs:

```text
registered
enabled
disabled
```

### Enabling a Module

When a module is enabled:

* The module appears in navigation where permitted.
* Browser API writes are allowed.
* Public API writes are allowed if the API key has scope.
* Module settings become active.
* Module event hooks may run.
* Module records may be searchable.
* Module records may be taggable.
* Module notification hooks/templates may run.
* Module dashboard widgets may appear.

### Disabling a Module

Disabling a module should not delete data.

When a module is disabled:

* Navigation should be hidden.
* Browser API writes should be blocked.
* Public API writes should be blocked.
* Background hooks should stop.
* New search index entries should not be created.
* New tag assignments should not be created unless explicitly allowed.
* New notifications from that module should stop.
* Historical reads may remain available only if the module allows historical read access.
* Existing notifications from that module may remain visible as historical records unless intentionally cleaned up.
* Audit logs should remain available to authorized users.

Module disable behavior should be enforced by the framework as much as possible so module authors do not need to remember to add checks everywhere.

---

## Workspaces

Workspaces are the main ownership and data boundary.

All user-facing records should belong to a workspace either directly or through a clear workspace-owned parent.

Workspace types may include:

* Business
* Personal
* Family

Workspace type determines available tools and behavior.

Examples:

* Business workspaces support clients, projects, time tracking, team members, permissions, billing, and reporting.
* Personal workspaces support tasks, notes, projects, and optional time tracking.
* Family workspaces support shared tasks, notes, projects, and limited family-style permissions.

Modules should declare which workspace capabilities they require.

A module should not assume every workspace supports clients, billing, team members, messaging, notifications, or time tracking.

---

## Users, Membership, and Permissions

Users should not be permanently tied to only one workspace.

A user may belong to multiple workspaces through workspace membership.

Permissions should remain framework-owned.

Modules may declare permissions, but the permission engine should remain part of the framework.

A module may declare permissions such as:

```text
tasks.create
tasks.view
tasks.edit_own
tasks.edit_all
tasks.assign
tasks.complete
tasks.archive
tasks.restore
```

The framework should register these permissions, expose them in role/permission management, and enforce them consistently.

Long-term, modules should also declare resource definitions.

Example:

```js
{
  resource: "tasks",
  operations: ["read", "create", "update", "archive", "restore", "assign"]
}
```

This avoids hard-coding every module's resource behavior into the permission service.

Notifications should also respect permissions. A user should not receive or open a notification for a record they are not allowed to see.

---

## App Shell and Navigation

The authenticated app shell should be framework-owned.

The frontend should not contain hard-coded knowledge of every module.

Instead, the backend should provide an app shell/bootstrap response that includes:

* App name
* App version
* Current user
* Active workspace
* Available workspaces
* Workspace type
* Workspace capabilities
* Enabled modules
* Navigation tree
* Notification summary/counts
* Permission-safe UI hints
* Theme/timezone basics

The frontend should render the navigation tree returned by the backend.

This allows modules to add navigation entries without editing the main frontend navigation file.

Framework-owned navigation and app shell UI may include:

* Dashboard
* Workspace settings
* User settings
* Log out
* Workspace switcher
* Notification bell
* Global search

Module-owned navigation may include:

* Tasks
* Time Tracker
* Manual Entry
* Edit Entries
* Reports
* Notes
* Tickets
* Calendars
* Messaging

Navigation should be filtered by:

* Workspace type
* Workspace capabilities
* Module enabled/disabled state
* User permissions
* Historical read access rules

---

## Views and Assets

Protected module views are registered through module manifests instead of being served only because a matching HTML file exists.

Framework views:

* Login
* Public landing page
* Dashboard shell
* Workspace settings
* User settings
* User admin
* API keys
* Audit log
* Notifications page
* Search results page

Module views:

* Tasks page
* Time tracker page
* Manual entry page
* Edit entries page
* Notes pages
* Ticket pages
* Calendar pages
* Messaging pages

A module view registration should define:

```js
{
  id,
  path,
  moduleId,
  file,
  requiredPermissions,
  requiredWorkspaceCapabilities,
  allowDisabledRead
}
```

The static/view service checks:

* Is the view registered?
* Is it public or protected?
* Is the module enabled?
* Is historical read access allowed?
* Does the user have permission?
* Does the workspace type support it?

Module assets should also be declared by modules.

Common framework CSS/JS can remain global.

Module-specific JS/CSS should belong to the module whenever practical.

The notification bell/toast UI should be framework-owned app shell code, not reimplemented by every module.

---

## Settings

Workspace settings should be framework-owned.

Module settings should be module-owned.

Framework/workspace settings include:

* Workspace name
* Workspace type
* Billing defaults
* Audit settings
* Notification defaults
* Workspace capabilities
* General security settings

User framework settings may include:

* Theme
* Timezone
* Notification preferences
* Default workspace/page preferences

Module settings include:

* Whether a module is enabled
* Module-specific options
* Module-specific defaults

Example:

```js
settings: [
  {
    id: "tasksEnabled",
    label: "Tasks",
    type: "boolean",
    moduleStatus: true
  }
]
```

The settings UI renders module setting definitions and values from the backend `moduleSettings` payload. Shared browser helpers normalize module settings, render controls from metadata, read enabled controls back into `moduleSettings`, and standardize status messages. The shared settings renderer must not special-case first-party setting IDs.

Module settings navigation is assembled from registered module settings views rather than from app-shell first-party conditionals. Deprecated top-level module flags may remain in API responses as compatibility fields, but browser save payloads should submit module state through `moduleSettings`.

The settings save logic should not hard-code each module toggle.

Dashboard and Workbench are framework-owned surfaces fed by module contributions. Modules declare Dashboard panels and Workbench cards in their manifests with stable IDs, renderer IDs, module IDs, permission requirements, module-state requirements, and optional workspace terminology. The backend filters those contributions by workspace, module state, capabilities, and permissions before returning them to the browser.

The browser Dashboard and Workbench scripts may still contain first-party renderer implementations, but those renderers are activated by contribution metadata rather than permanent module/id conditionals. Future modules should be able to add Dashboard panels or Workbench cards by declaring contributions and supplying compatible renderer behavior without changing unrelated navigation or settings code.

Notification preferences should be framework-owned, but modules may declare notification types/templates that users can enable, mute, or configure where practical.

---

## Audit Logging

Audit logging is framework-owned.

Modules should be able to declare audit record types and actions.

The audit service should remain the authoritative admin/security record.

Audit records should answer:

```text
Who did it?
What changed?
When did it change?
What workspace was affected?
What record was affected?
What was the previous value?
What is the new value?
What module/source created the change?
```

Audit logs are not the same thing as an activity feed.

Audit logs may contain admin/security detail.

Activity feeds should be user-friendly, permission-safe summaries.

Notification records are also not audit logs. Notifications are user-facing alerts. Audit logs are admin/security history.

---

## Event and Hook System

Longtail Forge should use a lightweight internal event system so modules and framework services can react to changes without hard-coding cross-module behavior.

Example events:

```text
workspace.created
workspace.updated
module.enabled
module.disabled
client.created
client.updated
project.created
project.updated
time_entry.created
time_entry.updated
task.created
task.updated
task.completed
task.archived
task.restored
notification.created
notification.read
notification.dismissed
```

Event payloads should generally include:

```js
{
  workspace_id,
  actor_user_id,
  actor_user_name,
  record_type,
  record_id,
  previous_value,
  new_value,
  source
}
```

Future event consumers may include:

* Search indexing
* Activity feed
* Notifications
* Integrations
* Webhooks
* Background jobs
* Automations

The event system should start small.

Do not refactor every service into events at once.

---

## Notifications Framework

Notifications should be a framework service.

Notifications should not belong to Tasks, Tickets, Notes, Messaging, or Time Tracking.

The framework should own:

* Notification records
* Notification recipients
* Read/unread state
* Dismissed/archived state
* Notification preferences
* Notification permissions and visibility checks
* Notification API
* Notification bell/toast UI
* Notification cleanup/retention
* Notification delivery adapter contracts
* Event-to-notification hooks

Modules should declare notification events/templates where appropriate.

Example:

```js
notificationEvents: [
  {
    id: "task.assigned",
    label: "Task assigned",
    defaultEnabled: true,
    recipientResolver: "taskAssigneeRecipients",
    template: "You were assigned a task: {task.title}"
  }
]
```

A basic notification record may include:

```text
notification_id
workspace_id
module_id
event_type
recipient_user_id
actor_user_id
record_type
record_id
title
body
url
status
priority
created_at
read_at
dismissed_at
metadata_json
```

Notification delivery should start with in-app notifications only.

Future delivery channels may include:

* Email
* Push
* Slack
* Microsoft Teams
* Discord
* Webhooks

Modules should not send directly to every channel themselves.

Modules should ask the notification framework to notify users, and the framework should decide how to deliver.

### Notification Rules

Notifications should be:

* Workspace-scoped
* User-specific
* Permission-aware
* Module-aware
* Safe when modules are disabled
* Safe when records are archived
* Configurable by user/workspace where practical

A user should not receive or open a notification for a record they cannot access.

A disabled module should not create new notifications.

Existing notifications from a disabled module may remain as historical user records unless intentionally cleaned up.

### Notification Examples

Tasks:

```text
task.assigned
task.due_soon
task.overdue
task.completed
```

Tickets:

```text
ticket.created
ticket.assigned
ticket.client_replied
ticket.status_changed
```

Notes:

```text
note.mentioned_user
note.updated
note.shared
```

Messaging:

```text
message.created
message.mentioned_user
message.thread_replied
```

Time Tracking:

```text
timer.still_running
time_entry.needs_review
```

---

## Tags Framework

Tags should be a framework service.

Tags should not belong to any one module.

Tags should be workspace-scoped.

Tags should not be stored as comma-separated text on records.

The framework should own:

* Tag definitions
* Tag assignments
* Tag permissions
* Tag assignment validation
* Tag API
* Tag management UI
* Tag audit logging

Suggested `tags` table fields:

```text
tag_id
workspace_id
name
slug
description
color
status
created_by_user_id
created_at
updated_at
```

Suggested `tag_assignments` table fields:

```text
tag_assignment_id
workspace_id
tag_id
target_type
target_id
created_by_user_id
source
created_at
```

Modules should declare which record types are taggable.

Example:

```js
taggableTypes: [
  {
    targetType: "task",
    moduleId: "tasks",
    idField: "task_id",
    labelField: "title",
    workspaceField: "workspace_id",
    clientField: "client_id",
    projectField: "project_id",
    requiredReadPermission: "tasks.view",
    requiredTagPermission: "tags.assign"
  }
]
```

The framework should validate:

* The tag belongs to the active workspace.
* The target type is registered as taggable.
* The target record exists.
* The target record belongs to the active workspace.
* The user can view the target before seeing tags.
* The user can assign/remove tags before changing tags.
* Disabled modules cannot receive new tag assignments unless explicitly allowed.

### Tags Are Not Workflow State

Tags should not be used as the source of truth for behavior/security.

Use real fields for:

* Visibility
* Permissions
* Billing status
* Workflow status
* Archived/completed state
* Client-facing/internal state

Example:

```text
Correct:
note.visibility = "public"

Incorrect:
note has tag "#public" and that controls visibility
```

Tags are for classification, filtering, reporting, grouping, and discovery.

---

## Search Framework

Search should be a framework service.

Search should not belong to Tasks, Notes, Tickets, Messaging, or Time Tracking.

Longtail Forge should eventually support cross-object search.

Example:

```text
Search: "CTU Shopify fitment issue"

Possible results:
- Client
- Project
- Task
- Note
- Support ticket
- Time entry
- Message thread, if messaging is enabled and permitted
- Attachment metadata
- Activity item
```

The framework should own:

* Search service
* Search index
* Search API
* Search permission filtering
* Search module filtering
* Search tag filtering
* Search backend adapter

Modules should declare which records are searchable.

Example:

```js
searchableTypes: [
  {
    recordType: "task",
    moduleId: "tasks",
    idField: "task_id",
    titleField: "title",
    summaryField: "description",
    bodyFields: ["title", "description"],
    workspaceField: "workspace_id",
    clientField: "client_id",
    projectField: "project_id",
    readPermission: "tasks.view",
    indexer: "tasksSearchIndexer"
  }
]
```

Initial search can be simple database-backed search.

Do not require Elasticsearch/OpenSearch early.

Preferred search backend path:

```text
1. Normal indexed database search
2. SQLite FTS5 or PostgreSQL full-text search
3. External search engine only if needed later
```

Possible future external search engines:

* Meilisearch
* Typesense
* OpenSearch
* Elasticsearch

External search should be an adapter, not a hard framework dependency.

---

## Search Index

A basic `search_index` table may include:

```text
search_index_id
workspace_id
module_id
record_type
record_id
title
summary
body
tags_text
client_id
project_id
visibility
record_status
source
record_created_at
record_updated_at
indexed_at
```

Search index records should be updated by framework events.

Examples:

* Record created: index it.
* Record updated: update index.
* Record archived: update or hide index.
* Record restored: restore index.
* Module disabled: hide or stop updating index.
* Module re-enabled: rebuild module index if needed.

Reporting calculations should not depend on the search index.

The search index is for discovery, not financial/accounting truth.

---

## In-App Messaging Module

In-app messaging should be a bundled first-party collaboration module.

It should not be framework core.

Messaging should own:

* Conversations
* Messages
* Message threads
* Participants
* Read receipts if added later
* Message-specific permissions
* Message-specific views
* Message-specific APIs
* Message search hooks
* Message tag hooks
* Message attachment support later if needed

Messaging should use framework services:

* Workspaces
* Users
* Permissions
* Search
* Tags
* Notifications
* Audit logging
* Event hooks
* Public API foundation if external messaging access is later allowed

Example messaging flow:

```text
User sends message
-> messaging module stores message
-> messaging module emits message.created
-> notifications framework alerts recipients
-> search framework indexes message if permitted
-> audit/activity systems record safe summaries where appropriate
```

Messaging is a feature.

Notifications are infrastructure.

---

## Public API

The public API foundation is framework-owned.

Modules may declare public API endpoints and scopes.

Example:

```js
publicApiEndpoints: [
  { method: "GET", path: "/api/v1/tasks", scope: "tasks:read" },
  { method: "POST", path: "/api/v1/tasks", scope: "tasks:write" }
]
```

API keys should be workspace-scoped.

API scopes should be module-aware.

Disabled modules should not allow public API writes.

Existing API keys should not bypass disabled module rules.

The API should respect:

* Workspace boundaries
* API key scopes
* Module enabled/disabled state
* Permissions where applicable
* Record visibility rules
* Notification visibility rules where notification APIs are exposed
* Audit logging where appropriate

---

## Database and Migrations

The migration runner is framework-owned.

Modules may provide migrations.

The framework should know which module owns each migration.

Migrations should be:

* Ordered
* Checksum-protected
* Repeat-safe where practical
* Module-aware
* Easy to audit/debug

Long-term, Longtail Forge should move toward a database adapter layer so the app is not permanently tied to shelling out to SQLite.

SQLite can remain the lightweight local/self-hosted database.

PostgreSQL should eventually become the preferred production database.

---

## File and Folder Boundaries

Current structure may evolve, but the intended direction is:

```text
src/core/
  Framework-owned services and app foundation

src/modules/
  First-party modules

src/db/
  Database connection, migration runner, core migrations

public/
  Shared frontend assets

views/
  Public and protected HTML views

docs/
  Project documentation
```

Future possible structure:

```text
plugins/
  Optional third-party or externally developed modules
```

Third-party module support should not require editing random framework files.

---

## Framework Dependencies vs Module Dependencies

Modules may depend on framework services.

Example framework dependencies:

```text
audit-service
api-key-auth
module-access
permissions-service
timezone-normalization
workspace-settings
tags-service
search-service
notifications-service
event-bus
```

Modules may also depend on other modules.

Example module dependencies:

```text
tasks depends on client-projects optionally or conditionally
time-tracking may integrate with tasks if tasks are enabled
messaging may integrate with notifications, but notifications are framework-owned
invoicing may depend on time-tracking
knowledge-base may depend on notes
```

A module should declare dependencies clearly.

The framework should prevent enabling a module when required dependencies are missing or disabled.

Dependency failures should produce clear messages.

---

## Module Enable/Disable Rules

The framework should define what enable/disable means.

A module should not need to reinvent this behavior.

### Enabled Module

An enabled module may:

* Show navigation
* Serve views
* Accept browser API writes
* Accept public API writes with proper scopes
* Register dashboard widgets
* Register search records
* Register taggable records
* Emit and receive events
* Run hooks
* Trigger framework notifications
* Expose settings

### Disabled Module

A disabled module should:

* Hide navigation
* Block writes
* Stop hooks/background behavior
* Stop new search indexing
* Stop new notifications
* Stop new tag assignments unless explicitly allowed
* Preserve existing data
* Allow historical reads only if permitted
* Keep audit logs visible to authorized users

Disabling a module is not the same as uninstalling a module.

---

## Third-Party Module Direction

Third-party module support should come after first-party modules follow the same rules.

The correct path is:

```text
1. Make first-party modules use the formal manifest contract.
2. Make navigation/settings/views/permissions registry-driven.
3. Add module validation and lifecycle rules.
4. Add developer documentation and example module.
5. Add explicit external module registration.
6. Consider package/plugin installer behavior much later.
```

Avoid building a plugin marketplace too early.

The priority is to make the architecture clean enough that future third-party support is natural.

---

## Development Philosophy

Longtail Forge should prefer:

```text
Small framework services
Clear module boundaries
Explicit contracts
Predictable behavior
Boring code
Good audit trails
Permission-safe defaults
Workspace-safe data access
```

Longtail Forge should avoid:

```text
Hard-coded module names throughout the frontend
Feature-specific hacks in framework services
Magic discovery
Cross-workspace shortcuts
Permission checks only in the UI
Tags controlling security behavior
Search index as reporting truth
Per-module notification systems
Messaging treated as notification infrastructure
Deleting data when modules are disabled
```

---

## Practical Definition of Done for Module Readiness

Longtail Forge is module-ready when a first-party or third-party developer can add a module that contributes:

* A manifest
* Routes
* Views
* Assets
* Migrations
* Navigation
* Settings
* Permissions
* API scopes
* Taggable types
* Searchable types
* Notification events/templates
* Audit record types
* Event hooks

without editing unrelated frontend files, unrelated settings code, unrelated navigation code, unrelated permission mapping code, unrelated notification code, or unrelated search/tag code.

The framework should provide the rails.

The module should provide the train.

---

## Summary

The Longtail Forge framework is the foundation.

Tasks, Time Tracking, Notes, Tickets, Calendars, Messaging, and Invoicing are modules.

Tasks and Time Tracking are important bundled first-party modules, but they should not be treated as required framework core.

In-app messaging is a bundled first-party collaboration module, not framework core.

Tags, Search, and Notifications should be framework services because they need to work across all modules.

The long-term goal is not just to add features.

The long-term goal is to make Longtail Forge a stable, extensible platform for managing work across clients, projects, teams, and personal/family spaces.
