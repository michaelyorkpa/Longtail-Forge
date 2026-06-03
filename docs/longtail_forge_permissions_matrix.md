# Longtail Forge Permissions Matrix

Updated: 2026-06-03 for version 0.30.17

This matrix describes the active workspace-native permission model after the 0.30.17 review fixes.

## Role Permission Matrix

| Role | users.manage | roles.assign | workspace_settings.manage | clients.manage | projects.manage | billing.manage | time_entries.create | time_entries.edit_all | time_entries.edit_own | reporting.view | audit_logs.view |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Super Admin | yes | yes | yes | yes | yes | yes | yes | yes | yes | yes | yes |
| Workspace Administrator | yes | yes | yes | yes | yes | yes | yes | yes | no | yes | yes |
| Client Administrator | no | yes | no | yes | yes | yes | yes | yes | no | yes | no |
| Project Administrator | no | yes | no | no | yes | yes | yes | yes | no | yes | no |
| Client User | no | no | no | no | no | no | yes | no | yes | yes | no |
| Project User | no | no | no | no | no | no | yes | no | yes | yes | no |
| Client User (External) | no | no | no | no | no | no | yes | no | yes | no | no |

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
| Reporting | Client filters and workspace-project scopes are available according to readable scope. | Project reporting uses workspace-project scopes only. |
| Time entries | May attach to a client project or workspace project. | Attach to workspace projects; client fields are empty. |

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
| Browser | PUT | /api/settings | workspace_settings.manage | workspace | Enforced |
| Browser | GET/POST/PUT | /api/api-keys* | workspace_settings.manage | workspace | Enforced |
| Browser | GET | /api/client-projects | readable client/project scopes | client/project/workspace projects | Filtered; clients omitted outside Business workspaces |
| Browser | GET/POST/PUT/DELETE | /api/clients* | clients.manage plus Business workspace | client | Enforced |
| Browser | GET/POST | /api/clients/:clientId/projects | projects.manage plus Business workspace | client | Enforced |
| Browser | GET/POST/PUT/DELETE | /api/projects* | projects.manage | project/client/workspace | Enforced; Personal/Family projects are workspace-scoped |
| Browser | GET | /api/time-entries | readable time scopes | client/project | Filtered; scoped admins with edit_all see team entries in scope |
| Browser | POST | /api/time-entries | time_entries.create | project/client | Enforced; module write must be enabled |
| Browser | PUT/DELETE | /api/time-entries/:entryId | time_entries.edit_own or time_entries.edit_all | entry project/client | Enforced |
| Browser | GET | /api/active-timers | own timers | self | Self-only |
| Browser | PUT/POST/DELETE | /api/active-timers/:timerSlot* | time_entries.create for save/finalize, own timer for delete | project/client/self | Enforced |
| Browser | GET | /api/reporting/bootstrap | reporting.view | any assigned reporting scope | Enforced, then filtered by readable scope |
| Browser | GET | /api/reporting/project-summary | reporting.view | any assigned reporting scope | Enforced, then filtered by readable scope |
| Browser | GET | /api/dashboard | reporting.view | any assigned reporting scope | Enforced, then filtered by readable scope |
| Browser | GET | /api/audit-logs* | audit_logs.view | workspace | Enforced |
| Public API | GET | /api/v1/clients* | clients:read plus Business workspace | API key workspace | Enforced |
| Public API | GET | /api/v1/projects* | projects:read | API key workspace | Enforced |
| Public API | GET | /api/v1/time-entries | time_entries:read | API key workspace | Enforced |
| Public API | POST | /api/v1/time-entries | time_entries:write | API key workspace | Enforced; module write must be enabled |

## Permission Overrides

| Override Field | Resource / Permission | Effect |
| --- | --- | --- |
| operationAccess.clients | read/create/update/delete | `false` denies matching `clients.manage` operation. |
| operationAccess.projects | read/create/update/delete | `false` denies matching `projects.manage` operation. |
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
- API key scope, revocation, public project reads, and Business-only public client reads
- client and project mutation permissions, hierarchy validation, archive restrictions, and Personal workspace project creation without clients
- Personal workspace client denial and `/api/client-projects` client omission
- scoped role assignment by Client Administrator and Project Administrator
- user lifecycle permissions remaining Workspace Administrator-only
- scoped time-entry create/edit/delete/list visibility, including scoped admin visibility into team entries
- reporting denial for External Client Users and allow for scoped users with `reporting.view`
- Time Tracking disabled-module read/write behavior
- workspace owner transfer, owner-removal blocking, and Personal fallback workspace creation
