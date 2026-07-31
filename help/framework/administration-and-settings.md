# Administration and Settings

Settings separate personal choices from workspace-owned administration. Pages and actions appear only when your current role, workspace type, capabilities, and enabled modules allow them.

## User settings

Open **Settings → User** for profile and preferences:

- Update display name, email where supported, theme, timezone, and other personal preferences.
- Review workspace memberships and use **Leave** when the membership can be removed safely.
- Change your password and review the sign-out effect on other sessions.
- Use **Delete Account** only when you intend to retire your identity and access across every workspace.

Private Tasks calendar subscriptions are not personal User settings. They are administrator-managed module credentials.

## User administration

Open **Settings → Admin → Users** to:

- **Add User**, use **Find Account**, and create or connect an identity to an allowed workspace.
- Edit an active member, update account or membership state, and assign roles at workspace, client, or project scope.
- Open **Permissions** for explicit operation overrides.
- Reset a password, copy the one-time generated value, and deliver it securely.
- Review **Active Sessions**, **Revoke** one session, or revoke all eligible sessions.
- Remove a role assignment or **Delete User** from the current workspace when the ownership safeguards allow it.

See **Users, Roles, and Permissions** before changing scoped access.

## Roles and permissions

Role assignments provide the normal access baseline. The permission matrix shows resources contributed by modules that are enabled and available to the administrator. Use operation overrides only for a deliberate exception; do not use tags, record assignment, or client/project labels as permission controls.

Client and Project roles require their matching scope. Personal workspaces cannot add other users, Family workspaces do not expose business Client roles, and only a Super Admin can assign Super Admin.

Client Administrators receive **Settings → Admin → Clients** and **Projects**
for their administered Client scope. Project Administrators receive
**Projects** for assigned Project scope. These scoped roles do not receive User
Admin, Workspace, API Keys, Audit Log, or the Admin Modules drawer; those
remain workspace-administrator surfaces.

| Role | Intended scope and baseline |
| --- | --- |
| Super Admin | Installation-wide administration across workspaces. |
| Workspace Administrator | Users, settings, clients, projects, workflow records, reporting, and audit controls inside one workspace. |
| Client Administrator | Client-scoped administration of permitted client details, projects, users, and workflow records. |
| Project Administrator | Scoped administration of permitted project assignments and workflow records. |
| Client User | Contribute to permitted work within one client. |
| Project User | Contribute to permitted work within one project. |
| Client User (External) | Limited external collaboration within one client. |

The permission matrix is the canonical description of the operations currently granted to a role assignment. Permission names follow consistent verbs:

- **View** reads permission-visible records; **View All** can broaden owner-based visibility but never bypass workspace or scope boundaries.
- **Create** adds a record; **Update** or **Edit Own/Edit All** changes permitted records.
- **Assign** changes offered ownership or assignees; **Manage** changes the named administrative resource.
- **Complete**, **Archive**, **Restore**, **Delete**, **Finalize**, and **Duplicate** grant only that named lifecycle operation.
- **Upload**, **Download**, and Files **Delete** apply through permission-checked attachment routes.
- **Tags Assign/Remove/Manage** classify records or manage the tag catalog; tags never grant visibility.
- **Roles Assign**, **Users Manage**, and **Workspace Settings Manage** control their named administration surfaces within the role’s allowed scope.
- **Reporting View** reads permission-shaped report output; **Billing Manage** changes offered billing controls.

Open a role assignment’s **Permissions** control to read the contributed resource and operation labels before saving an override.

## Workspace settings

Open **Settings → Admin → Workspace** to manage the current workspace’s offered controls, including:

- Workspace name, type-aware options, time and date behavior, audit retention, and security settings.
- Workspace people and **Edit Permissions** where that surface is offered.
- Runtime support and background-job health information available to administrators.
- Workspace deletion scheduling or cancellation, with the required confirmation and ownership safeguards.

Workspace changes apply only to the active workspace unless the control explicitly says otherwise.

## Modules and module settings

Workspace Administrators and Super Admins can open **Settings → Admin →
Modules** to review first-party modules, enable or disable optional modules,
and open an available module’s settings page. Disabling a module hides its
workflow and Help contributions while preserving historical-read behavior
where the module contract allows it.

Current first-party settings include:

| Module or feature | Settings and actions |
| --- | --- |
| Workbench | Configure the offered recommendation algorithm, focus, horizon, stale-work, or recovery controls. The exact controls shown depend on enabled source modules and workspace capabilities. |
| Tasks | Configure offered reminder, recurrence, calendar, and task-workflow settings. |
| Calendar subscription | Under **Settings → Admin → Modules → Calendar**, create named private read-only Tasks subscriptions; **Reveal URL**, **Copy URL**, owner-only **Rotate**, **Revoke and Remove**, or delete obsolete revoked metadata. |
| Time Tracking | Enable Time Tracking and configure fiscal-year and rounding controls that the workspace supports. |
| Notes | Configure current Notes module settings, including controls exposed by the Notes settings page. |
| Files | Configure current Files module settings and supported lifecycle controls. |
| Lists | Enable or disable Lists where the workspace allows it. |

Module settings do not grant module permissions. A module can be enabled while a user still lacks permission to view or change its records.

## Other administrator pages

- **Settings → Admin → Tags**: create, edit, archive, and manage workspace classifications.
- **Settings → Admin → API Keys**: create, review, rotate, or revoke keys and scopes when Public API administration is available.
- **Settings → Admin → Audit Log**: review permitted workspace activity and Security events.
- **Settings → Help**: search framework Help plus contributions from active modules.

For a control-by-control workflow inventory, see **Action Catalog** and the active module’s action reference.
