# Longtail Forge Permissions Matrix

Updated: 2026-06-05 for version 0.32.3

This matrix describes the active workspace-native permission model after the completed 0.31 Tasks, Workbench, module-contract, lifecycle, cleanup, accessibility, performance, notifications, and tags-foundation passes.

## Role Permission Matrix

| Role | users.manage | roles.assign | workspace_settings.manage | clients.manage | projects.manage | billing.manage | time_entries.create | time_entries.edit_all | time_entries.edit_own | tasks.create | tasks.view | tasks.edit_own | tasks.edit_all | tasks.assign | tasks.complete | tasks.archive | tasks.restore | reporting.view | audit_logs.view |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Super Admin | yes | yes | yes | yes | yes | yes | yes | yes | yes | yes | yes | yes | yes | yes | yes | yes | yes | yes | yes |
| Workspace Administrator | yes | yes | yes | yes | yes | yes | yes | yes | no | yes | yes | no | yes | yes | yes | yes | yes | yes | yes |
| Client Administrator | no | yes | no | yes | yes | yes | yes | yes | no | yes | yes | yes | yes | yes | yes | yes | yes | yes | no |
| Project Administrator | no | yes | no | no | yes | yes | yes | yes | no | yes | yes | yes | yes | yes | yes | yes | yes | yes | no |
| Client User | no | no | no | no | no | no | yes | no | yes | yes | yes | yes | no | no | yes | no | no | yes | no |
| Project User | no | no | no | no | no | no | yes | no | yes | yes | yes | yes | no | no | yes | no | no | yes | no |
| Client User (External) | no | no | no | no | no | no | yes | no | yes | yes | yes | yes | no | no | yes | no | no | no | no |

## Framework Notification And Tag Defaults

| Permission | Super Admin | Workspace Administrator | Client Administrator | Project Administrator | Client User | Project User | Client User (External) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| notifications.view_own | yes | yes | yes | yes | yes | yes | yes |
| notifications.manage_preferences | yes | yes | yes | yes | yes | yes | yes |
| notifications.manage_workspace_defaults | yes | yes | no | no | no | no | no |
| tags.manage | yes | yes | no | no | no | no | no |
| tags.view | yes | yes | yes | yes | yes | yes | yes |
| tags.assign | yes | yes | yes | yes | yes | yes | no |
| tags.remove | yes | yes | yes | yes | yes | yes | no |

The 0.32.5 tagging release makes the `tags` feature a disableable first-party module. Assignment reads require the `tags` module to be readable, `tags.view`, and the target type's declared read permission. Assignment writes require the `tags` module and source module to be enabled, plus `tags.assign` for additions or `tags.remove` for removals, along with the target type's declared tag permission.

## Role Assignment Rules

| Display Role | Role ID | Required Scope Type | Assignable By | Workspace Types |
| --- | --- | --- | --- | --- |
| Super Admin | super_admin | all | Super Admin | Business only in normal assignment UI; protected users are seeded globally |
| Workspace Administrator | workspace_admin | workspace | Super Admin, Workspace Administrator | Business, Family, Personal |
| Client Administrator | client_admin | client | Super Admin, Workspace Administrator | Business only |
| Project Administrator | project_admin | client | Super Admin, Workspace Administrator, Client Administrator | Business only |
| Client User | client_user | client | Super Admin, Workspace Administrator, Client Administrator | Business only |
| Project User | project_user | project | Super Admin, Workspace Administrator, Client Administrator, Project Administrator | Business, Family |
| Client User (External) | client_external_user | client | Super Admin, Workspace Administrator, Client Administrator | Business only |

Scoped role assignment is scope-aware. Client Administrators and Project Administrators can open the role assignment flow, but replacement payloads are accepted only when every requested role is allowed by their role limit and every requested scope is inside their assigned client/project scope.

## Workspace-Type Rules

| Area | Business | Personal / Family |
| --- | --- | --- |
| Clients | Available through browser API and public API when permission/API scope allows it. | Blocked server-side with 403. `/api/client-projects` omits clients. |
| Projects | Client projects and workspace projects are available. | Workspace projects are available without clients. |
| Tasks | Workspace-only, client-linked, and project-linked tasks are available. Project-linked tasks inherit project client context. | Workspace-only and project-linked tasks are available. Direct client task scopes are blocked server-side with 403. |
| Reporting | Client filters and workspace-project scopes are available according to readable scope. | Project reporting uses workspace-project scopes only. |
| Time entries | May attach to a client project or workspace project. | Attach to workspace projects; client fields are empty. |

## Task Rules

- Every task belongs to exactly one workspace.
- Client-linked tasks require a Business workspace.
- Project-linked tasks inherit the selected project's client context when one exists.
- A task cannot specify a client that conflicts with its selected project.
- Assignees must be active workspace users with `tasks.view` in the selected workspace, client, or project scope.
- 0.31.x assignments target concrete users only; the join table leaves room for future role/team assignment.
- 0.31.x task lifecycle is `open`, `in_progress`, `blocked`, `complete`, and `archived`.
- Task removal is soft archive/restore; true deletion is not exposed.
- Task reminders inherit from Workspace -> Client -> Project -> Task in Business workspaces and Workspace -> Project -> Task in Personal/Family workspaces.
- Recurring tasks use template records plus generated task instances; completing an instance creates the next instance when the recurrence rule still has future occurrences.
- Task timers require Tasks, Time Tracking, and the Task Timers sub-option to be enabled.
- Task timers are available only for project-linked tasks, including workspace projects in Personal and Family workspaces.
- Task timers and normal Time Tracking timers share `active_work_timers` storage and are mutually exclusive for a user.
- Finalized task timers write normal `time_entries` rows with `task_id` populated for reporting filters.
- New project-linked tasks use the project's default task assignee mode when no assignee payload is provided; explicit assignee payloads remain authoritative.
- Project-owned task defaults may define default task status, default task priority, task sort order, and default task assignee mode.

## Route Enforcement Summary

| Surface | Method | Path | Required Permission or Scope | Resource Scope | Enforcement |
| --- | --- | --- | --- | --- | --- |
| Browser | GET | /api/users | users.manage | workspace | Workspace-level only |
| Browser | GET | /api/workspaces | users.manage | workspace | Workspace-level only |
| Browser | POST | /api/users | users.manage | workspace | Workspace-level only |
| Browser | PUT/DELETE | /api/users/:userId/* | users.manage | workspace | Workspace-level only |
| Browser | GET | /api/roles | roles.assign | any assigned scope | Scope-aware |
| Browser | GET/PUT | /api/users/:userId/role-assignments | roles.assign | requested assignment scopes | Scope-aware |
| Browser | GET | /api/settings | authenticated session | workspace | Open to active workspace members because bootstrap/navigation need settings metadata |
| Browser | PUT | /api/settings | workspace_settings.manage | workspace | Enforced; includes Time Tracking, Tasks, Task Timers, and workspace task reminder defaults |
| Browser | GET/POST/PUT | /api/api-keys* | workspace_settings.manage | workspace | Enforced |
| Browser | GET | /api/client-projects | readable client/project scopes | client/project/workspace projects | Filtered; clients omitted outside Business workspaces |
| Browser | GET/POST/PUT/DELETE | /api/clients* | clients.manage plus Business workspace | client | Enforced; client task reminder defaults save with client updates |
| Browser | GET/POST | /api/clients/:clientId/projects | projects.manage plus Business workspace | client | Enforced |
| Browser | GET/POST/PUT/DELETE | /api/projects* | projects.manage | project/client/workspace | Enforced; Personal/Family projects are workspace-scoped; project task reminder defaults save with project updates |
| Browser | GET | /api/tasks | tasks.view | workspace/client/project | Filtered by readable task scopes; disabled Tasks keeps historical reads |
| Browser | GET | /api/tasks/calendar | tasks.view | workspace/client/project | Filtered by readable task scopes and due date window |
| Browser | GET | /api/tasks/timers | authenticated user plus task visibility | self/task workspace/client/project | Self-only active task timer state filtered by visible tasks |
| Browser | POST | /api/tasks | tasks.create | workspace/client/project | Enforced; module write must be enabled |
| Browser | POST | /api/tasks/bulk | task action permission per selected task | task workspace/client/project | Enforced task-by-task; module write must be enabled |
| Browser | GET | /api/tasks/:taskId | tasks.view | task workspace/client/project | Enforced |
| Browser | PUT | /api/tasks/:taskId | tasks.edit_own or tasks.edit_all | task workspace/client/project | Enforced; status transitions require matching lifecycle permissions; task reminder overrides save with task updates |
| Browser | POST | /api/tasks/:taskId/complete | tasks.complete | task workspace/client/project | Enforced |
| Browser | POST | /api/tasks/:taskId/reopen | tasks.complete | task workspace/client/project | Enforced |
| Browser | POST | /api/tasks/:taskId/archive | tasks.archive | task workspace/client/project | Enforced |
| Browser | POST | /api/tasks/:taskId/restore | tasks.restore | task workspace/client/project | Enforced |
| Browser | PUT/POST/DELETE | /api/tasks/:taskId/timer* | tasks.view plus time_entries.create on linked project | task project/client/self | Enforced; Tasks, Time Tracking, and Task Timers must be enabled |
| Browser | GET | /api/time-entries | readable time scopes | client/project | Filtered; scoped admins with edit_all see team entries in scope |
| Browser | POST | /api/time-entries | time_entries.create | project/client | Enforced; module write must be enabled |
| Browser | PUT/DELETE | /api/time-entries/:entryId | time_entries.edit_own or time_entries.edit_all | entry project/client | Enforced |
| Browser | GET | /api/active-timers | own timers | self | Self-only |
| Browser | PUT/POST/DELETE | /api/active-timers/:timerSlot* | time_entries.create for save/finalize, own timer for delete | project/client/self | Enforced |
| Browser | GET | /api/workbench/bootstrap | authenticated user plus underlying readable scopes | self/task/project/client | Returns normalized active timers and enabled-module workbench items |
| Browser | GET | /api/active-timers/all | authenticated user plus timer/source visibility | self/task/project/client | Lists unified manual and sourced active timers for Workbench |
| Browser | PUT | /api/workbench/timers/:timerSlot/status | time_entries.create on linked project | project/client/self | Preserves timer source metadata while switching timer state |
| Browser | GET | /api/notifications | notifications.view_own in any assigned scope | current user/workspace | Returns only the active user's notifications; target URLs are hidden when target access fails |
| Browser | GET | /api/notifications/unread-count | notifications.view_own in any assigned scope | current user/workspace | Counts only unread notifications addressed to the active user |
| Browser | GET/PUT | /api/notifications/preferences | notifications.manage_preferences in any assigned scope | current user/workspace | Reads or saves the active user's notification type preferences |
| Browser | PUT | /api/notifications/workspace-defaults | notifications.manage_workspace_defaults in any assigned scope | workspace | Saves workspace-level notification defaults and priority overrides |
| Browser | POST | /api/notifications/:notificationId/read | notifications.view_own in any assigned scope | current user/workspace | Marks only the active user's notification read |
| Browser | POST | /api/notifications/read-all | notifications.view_own in any assigned scope | current user/workspace | Marks only the active user's unread notifications read |
| Browser | POST | /api/notifications/:notificationId/dismiss | notifications.view_own in any assigned scope | current user/workspace | Dismisses only the active user's notification |
| Browser | GET | /api/reporting/bootstrap | reporting.view | any assigned reporting scope | Enforced, then filtered by readable scope |
| Browser | GET | /api/reporting/project-summary | reporting.view | any assigned reporting scope | Enforced, then filtered by readable scope |
| Browser | GET | /api/dashboard | reporting.view | any assigned reporting scope | Enforced, then filtered by readable scope |
| Browser | GET | /api/audit-logs* | audit_logs.view | workspace | Enforced |
| Public API | GET | /api/v1/clients* | clients:read plus Business workspace | API key workspace | Enforced |
| Public API | GET | /api/v1/projects* | projects:read | API key workspace | Enforced |
| Public API | GET | /api/v1/tasks* | tasks:read | API key workspace | Enforced; disabled Tasks keeps historical reads |
| Public API | POST/PUT | /api/v1/tasks* | tasks:write | API key workspace | Enforced; module write must be enabled |
| Public API | GET | /api/v1/time-entries | time_entries:read | API key workspace | Enforced |
| Public API | POST | /api/v1/time-entries | time_entries:write | API key workspace | Enforced; module write must be enabled; accepts optional `task_id` |

## Permission Overrides

| Override Field | Resource / Permission | Effect |
| --- | --- | --- |
| operationAccess.clients | read/create/update/delete | `false` denies matching `clients.manage` operation. |
| operationAccess.projects | read/create/update/delete | `false` denies matching `projects.manage` operation. |
| operationAccess.tasks | read/create/update/delete | `false` denies matching task read/create/update/archive operations. |
| operationAccess.time_entries | create/update/delete/read | `false` denies matching time-entry operation. |
| operationAccess.workspace_settings | read/update | `false` denies matching workspace-settings operation. |
| operationAccess.users | read/create/update/delete | `false` denies matching user or role-assignment operation. |
| operationAccess.reporting | read | `false` denies reporting reads. |
| operationAccess.audit_logs | read | `false` denies audit log read/export. |
| restrictBilling | billing.manage | `true` denies billing changes. |
| allowManualTime | time_entries.create | `false` denies manual entries and timer finalization. |
| allowEditTime | time_entries.edit_all / time_entries.edit_own | `false` denies own and all time edit/delete actions. |

## Regression Coverage

`npm run test:permissions` covers the current critical matrix paths, including:

- unauthenticated API and protected-page guards
- API key scope, revocation, public project reads, Business-only public client reads, and public task read/write lifecycle endpoints
- client and project mutation permissions, hierarchy validation, archive restrictions, and Personal workspace project creation without clients
- Personal workspace client denial and `/api/client-projects` client omission
- scoped role assignment by Client Administrator and Project Administrator
- user lifecycle permissions remaining Workspace Administrator-only
- scoped time-entry create/edit/delete/list visibility, including scoped admin visibility into team entries
- task creation, scoped listing, project-client inheritance, assignment eligibility, completion, archive/restore, recurrence generation, calendar payload filtering, Dashboard task summaries, bulk route permission reuse, reminder-default saves, module-disabled write denial, and Personal/Family direct-client denial
- task timer gating, unified active timer storage, Workbench bootstrap/status actions, mutual exclusion with normal timers, completion blocking, finalization into time entries, and disabled Task Timers behavior
- reporting denial for External Client Users, allow for scoped users with `reporting.view`, and task-linked reporting filters
- Time Tracking and Tasks disabled-module read/write behavior, including public API reads/writes
- workspace owner transfer, owner-removal blocking, and Personal fallback workspace creation
- fresh database tag permission seeding and module sanity checks for taggable target type declarations
