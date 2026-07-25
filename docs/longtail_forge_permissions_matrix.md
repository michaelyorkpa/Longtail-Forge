# Longtail Forge Permissions Matrix

Updated: 2026-07-25 for version 0.33.22.9

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
| Project Administrator | project_admin | project | Super Admin, Workspace Administrator, Client Administrator | Business only |
| Client User | client_user | client | Super Admin, Workspace Administrator, Client Administrator | Business only |
| Project User | project_user | project | Super Admin, Workspace Administrator, Client Administrator, Project Administrator | Business, Family |
| Client User (External) | client_external_user | client | Super Admin, Workspace Administrator, Client Administrator | Business only |

Scoped role assignment is scope-aware. Client Administrators and Project Administrators can open the role assignment flow, but replacement payloads are accepted only when every requested role is allowed by their role limit and every requested scope is inside their assigned client/project scope.

Workspace backup creation and latest-receipt reads are administrative capabilities, not a new assignable permission key. The service requires the existing effective Workspace Administrator boundary for the active workspace or installation Super Admin authority. Client Administrators, Project Administrators, Client Users, Project Users, and external users cannot invoke either route even if they hold unrelated record permissions. A successful response contains only the safe receipt/checksum summary; archive access stays on the protected host operator boundary.

Workspace-deletion lifecycle reads, requests, and cancellation use that same non-assignable active-workspace administrator boundary. The request additionally requires the exact workspace name and either a successful backup from the previous 24 hours or the exact no-current-backup acknowledgement. The service never accepts a browser-supplied workspace ID, and the safe response exposes no workspace, requester, or backup IDs. Pending state does not broaden or narrow any existing record permission.

Named calendar-subscription collection operations reuse `workspace_settings.manage`; no new role permission is introduced. Creation binds the credential to the current actor, any workspace administrator may list safe metadata or revoke a row, and rotation additionally requires that actor to be the owner. Public bearer reads require an active user, membership, workspace, Tasks module, active target, and exact current `tasks.view` at the stored Workspace/Client/Project scope. Workspace requires workspace authority; Client includes direct Client Tasks and current child Projects; Project includes that Project and accepts broader live Workspace/Client authority. Tasks applies the stored ceiling in SQL and intersects it with current record permissions. Role replacement and other canonical lifecycle changes revoke rows that no longer qualify; read-time denial remains authoritative.

Add User uses the same service-owned assignment rules. Its workspace catalog contains only active workspaces where the actor has `users.manage` (or every active workspace for an installation Super Admin), and its role catalog contains only assignable roles with authorized concrete scopes. Exact-email lookup returns no suggestions or membership inventory. Personal workspaces cannot add users; Family workspaces can offer Workspace Administrator and Project User but never a client-scoped role. Only a Super Admin can assign Super Admin.

Delete User is workspace-scoped and rejects the signed-in user's own ID. It deactivates the target's current membership and removes current-workspace roles. When no active membership remains, a former Workspace Administrator, workspace owner, or installation Super Admin keeps an active identity but has every ordinary session revoked and may authenticate only into portable account-export recovery; Client/Project Administrators and users instead have their credentials and sessions retired. Self-service Delete Account always retires every membership plus access credential after workspace-owner transfer checks and never grants recovery mode. None of these paths nulls readable Task, Note, File, List, or audit attribution. Recovery qualification does not grant workspace backup authority or access to former workspace records.

## Workspace-Type Rules

| Area | Business | Personal / Family |
| --- | --- | --- |
| Clients | Available through browser API and public API when permission/API scope allows it. | Blocked server-side with 403. `/api/client-projects` omits clients. |
| Projects | Client projects and workspace projects are available; Project Settings contributes Client filters, columns, labels, and assignment controls. | Workspace projects are available without clients; Project Settings contributes no Client filter, column, label, or assignment control, and nonblank Client writes are rejected with 403. |
| Tasks | Workspace-only, client-linked, and project-linked tasks are available. Project-linked tasks inherit project client context. | Workspace-only and project-linked tasks are available. Direct client task scopes are blocked server-side with 403. |
| Reporting | Client filters and workspace-project scopes are available according to readable scope. | Project reporting uses workspace-project scopes only. |
| Time entries | May attach to a client project or workspace project. | Attach to workspace projects; client fields are empty. |
| Billable state | Billable defaults and per-record flags are available. | Billable controls are omitted; Tasks, timers, and time entries are treated as non-billable even if a legacy row still stores `yes`. |
| Workspace people | Active users with active workspace memberships appear in administration and assignable-person options. | Same active-user and active-membership rule. |

## Task Rules

- Every task belongs to exactly one workspace.
- Client-linked tasks require a Business workspace.
- Project-linked tasks inherit the selected project's client context when one exists.
- A task cannot specify a client that conflicts with its selected project.
- Assignees must have both an active user state and an active membership in the workspace, plus `tasks.view` in the selected workspace, client, or project scope.
- 0.31.x assignments target concrete users only; the join table leaves room for future role/team assignment.
- 0.31.x task lifecycle is `open`, `in_progress`, `blocked`, `complete`, and `archived`.
- Task removal is soft archive/restore; true deletion is not exposed.
- Task reminders inherit from Workspace -> Client -> Project -> Task in Business workspaces and Workspace -> Project -> Task in Personal/Family workspaces.
- Recurring tasks use template records plus generated task instances; completing an instance creates the next instance when the recurrence rule still has future occurrences.
- Task timers require Tasks, Time Tracking, and the Task Timers sub-option to be enabled.
- Task timers are available only for project-linked tasks, including workspace projects in Personal and Family workspaces.
- Task timers and normal Time Tracking timers share `active_work_timers` storage and are mutually exclusive for a user.
- Finalized task timers write normal `time_entries` rows with `task_id` populated for reporting filters.
- The bounded Dashboard effort summary preserves the normal time-entry visibility rule in SQL: workspace-wide `time_entries.edit_all` can read every entry in the active workspace; otherwise an entry must be inside an assigned readable Client/Project scope and must either belong to the current user or be inside a scope carrying `time_entries.edit_all`. The service rechecks only the at-most-three displayed rows, and inaccessible recent entries do not contribute to counts or duration totals.
- New project-linked tasks use the project's default task assignee mode when no assignee payload is provided; explicit assignee payloads remain authoritative.
- Project-owned task defaults may define default task status, default task priority, task sort order, and default task assignee mode.

## Route Enforcement Summary

| Surface | Method | Path | Required Permission or Scope | Resource Scope | Enforcement |
| --- | --- | --- | --- | --- | --- |
| Browser | GET | /api/users | users.manage | workspace | Workspace-level only; returns active users with active current-workspace memberships |
| Browser | GET | /api/workspaces | users.manage | administrable active workspaces | Super Admin receives all active workspaces; other actors receive only active memberships where they can manage users |
| Browser | GET | /api/users/add-options | users.manage plus roles.assign | selected administrable workspace and authorized role scopes | Server-shaped; excludes unauthorized workspaces, roles, and scopes |
| Browser | POST | /api/users/lookup | users.manage | selected administrable workspace plus exact normalized email | Returns only username, display name, and target-membership state for an exact match; no directory or unrelated memberships |
| Browser | POST | /api/users | users.manage plus roles.assign when an initial role is requested | selected administrable workspace and requested role scope | Revalidates workspace/type/role/scope, activates existing identity or creates one, and limits Super Admin assignment to Super Admin |
| Browser | PUT/DELETE | /api/users/:userId/* | users.manage | workspace | Workspace-level only |
| Browser | DELETE | /api/user/account | authenticated active account | self across memberships | Self only; transfers or blocks owned workspaces, retires credentials/sessions/API keys/roles/grants and every membership, and preserves durable identity/attribution |
| Browser | GET | /api/roles | roles.assign | any assigned scope | Scope-aware |
| Browser | GET/PUT | /api/users/:userId/role-assignments | roles.assign | requested assignment scopes | Scope-aware |
| Browser | GET | /api/settings | authenticated session | workspace | Open to active workspace members because bootstrap/navigation need settings metadata |
| Browser | PUT | /api/settings | workspace_settings.manage | workspace | Enforced; workspace type is immutable, workspace rename additionally requires Workspace Administrator or Super Admin, and module/audit setting writes retain their owner rules |
| Browser | GET/POST | /api/settings/workspace-backups* | Workspace Administrator or Super Admin | active workspace | Creates or reads only a safe protected-host package receipt; no browser archive access |
| Browser | GET/POST | /api/settings/workspace-deletion* | Workspace Administrator or Super Admin | active workspace | Reads, schedules, or cancels the dedicated 30-day lifecycle; no browser route performs final purge |
| Operator CLI/job | queue/run | `workspace.purge` | protected-host operator after an authorized lifecycle | exact expired workspace | Fences sessions, API keys, and jobs, drains running work, then irreversibly removes only that workspace's records and artifacts |
| Browser | GET/POST/PUT | /api/api-keys* | workspace_settings.manage | workspace | Enforced |
| Browser | GET/POST/DELETE | /api/private-feeds/calendar-subscriptions* | workspace_settings.manage; rotate also requires owner | workspace plus stored workspace/Client/Project entitlement | Safe metadata list, self-bound creation, owner-only rotation, and administrator revocation |
| Public bearer | GET | /feeds/calendar/:token.ics | active owner plus exact tasks.view entitlement | stored Workspace/Client/Project scope intersected with live record access | Tasks-owned SQL ceiling and permission evaluator; generic rejection when the required scope is invalid or unauthorized |
| Browser | GET | /api/client-projects | readable client/project scopes | client/project/workspace projects | Filtered; clients omitted outside Business workspaces |
| Browser | GET/POST/PUT/DELETE | /api/clients* | clients.manage plus Business workspace | client | Enforced; client task reminder defaults save with client updates |
| Browser | GET/POST | /api/clients/:clientId/projects | projects.manage plus Business workspace | client | Enforced |
| Browser | GET/POST/PUT/DELETE | /api/projects* | projects.manage | project/client/workspace | Enforced; Personal/Family list/detail reads expose project-only context and nonblank Client assignment payloads are rejected with 403; project task reminder defaults save with project updates |
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
| Browser | GET | /api/notes* | notes.view plus record-level Notes access | workspace/client/project | Enforced; Personal visibility filters and Family Client-visible filters are rejected, and legacy inapplicable values are normalized in the read model |
| Browser | POST/PUT | /api/notes* | notes.create/notes.update plus record-level Notes access | workspace/client/project | Enforced; Personal accepts only the implicit `internal` default, Family rejects Client Visible, and Business Client Visible retains notes.publish_client_visible |
| Browser | GET | /api/time-entries | readable time scopes | client/project | Filtered; scoped admins with edit_all see team entries in scope |
| Browser | POST | /api/time-entries | time_entries.create | project/client | Enforced; module write must be enabled |
| Browser | PUT/DELETE | /api/time-entries/:entryId | time_entries.edit_own or time_entries.edit_all | entry project/client | Enforced |
| Browser | GET | /api/active-timers | own timers | self | Self-only |
| Browser | PUT/POST/DELETE | /api/active-timers/:timerSlot* | time_entries.create for save/finalize, own timer for delete | project/client/self | Enforced |
| Browser | GET | /api/workbench/bootstrap | authenticated user plus underlying readable scopes | self/task/project/client | Returns normalized active timers and enabled-module workbench items |
| Browser | GET | /api/workbench/focus-modes | authenticated user plus workspace-type gating | workspace/client/project | Returns the available Workbench focus question descriptors; Client focus is hidden outside Business workspaces |
| Browser | GET | /api/workbench/focus-candidates | authenticated user plus underlying candidate source visibility | self/task/project/client | Resolves the selected focus through the shared candidate service and returns permission-safe ranked candidates |
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
| Browser | GET | /api/dashboard | authenticated user plus contribution permission filters | workspace/module contributions | Returns framework Dashboard pulse, layout, safe warnings, and permission-filtered contribution metadata |
| Browser | GET | /api/tasks/dashboard-summary | tasks.view | self/task/project/client | Module-owned Dashboard data route, filtered by readable task scope |
| Browser | GET | /api/audit-logs* | audit_logs.view | workspace | Enforced |
| Browser | GET | /api/security-events* | audit_logs.view plus workspace_settings.manage | workspace | Owner/Workspace Administrator surface; workspace-filtered, with all-workspace reads limited to Super Admin |
| Browser | GET | /api/users/permission-resources | users.manage plus contributed resource visibility permissions | workspace | Returns enabled-module and permission-filtered matrix resources only |
| Public API | GET | /api/v1/clients* | clients:read plus Business workspace | API key workspace | Enforced |
| Public API | GET | /api/v1/projects* | projects:read | API key workspace | Enforced |
| Public API | GET | /api/v1/tasks* | tasks:read | API key workspace | Enforced; disabled Tasks keeps historical reads |
| Public API | POST/PUT | /api/v1/tasks* | tasks:write | API key workspace | Enforced; module write must be enabled |
| Public API | GET | /api/v1/time-entries | time_entries:read | API key workspace | Enforced |
| Public API | POST | /api/v1/time-entries | time_entries:write | API key workspace | Enforced; module write must be enabled; accepts optional `task_id` |

## Permission Overrides

User Admin builds its matrix from `GET /api/users/permission-resources`, not a browser-owned resource list. Enabled modules contribute validated `resourceDefinitions`; disabled modules drop out, required permissions prune unavailable resources, and the framework catalog retains Reporting, Workspace Settings, and Audit Logs. Hidden resource overrides remain stored so a temporary module disable does not erase assignment intent. The operation effects below remain enforced by the existing record-level permission service paths.

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
- Add User workspace discovery, exact-account minimum disclosure, existing-identity reuse, client/project initial scopes, Personal/Family shaping, and Super Admin escalation limits
- user lifecycle permissions remaining Workspace Administrator-only
- inactive users and inactive workspace memberships omitted from workspace administration and task assignment options
- Personal/Family Billable controls omitted and server/API reads and writes coerced to non-billable
- scoped time-entry create/edit/delete/list visibility, including scoped admin visibility into team entries
- task creation, scoped listing, project-client inheritance, assignment eligibility, completion, archive/restore, recurrence generation, calendar payload filtering, Dashboard task summaries, bulk route permission reuse, reminder-default saves, module-disabled write denial, and Personal/Family direct-client denial
- task timer gating, unified active timer storage, Workbench bootstrap/status actions, mutual exclusion with normal timers, completion blocking, finalization into time entries, and disabled Task Timers behavior
- reporting denial for External Client Users, allow for scoped users with `reporting.view`, and task-linked reporting filters
- contributed permission-resource catalog delivery, User Admin route authorization, disabled-module removal/re-enable restoration, and browser de-hardcoding
- Time Tracking and Tasks disabled-module read/write behavior, including public API reads/writes
- workspace owner transfer, owner-removal blocking, and Personal fallback workspace creation
- workspace-deletion non-admin denial, current-backup and typed-acknowledgement paths, safe response shaping, unchanged sessions/memberships/navigation/modules, grace cancellation, restart durability, exact-boundary refusal, and database integrity
- final-purge too-early refusal, exact-time queueing, worker/session/API-key fencing, interrupted restart retry, exactly-once tombstone, Files/backup cleanup, retained identities, complete target-scope removal, cross-workspace byte preservation, and database integrity
- fresh database tag permission seeding and module sanity checks for taggable target type declarations
