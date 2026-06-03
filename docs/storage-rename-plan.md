# Storage Rename Plan

Version 0.30.14 keeps Longtail Forge in a compatibility phase while the app finishes moving from organization language to workspace language.

## Current Inventory

`rg` found 56 files with remaining legacy organization compatibility usage across server code, migrations, browser assets, docs, and test scripts.

- Core storage still uses legacy tables and columns as the authoritative write target in many services: `organizations`, `organization_settings`, `organization_modules`, and `organization_id`.
- Workspace aliases already exist for the primary workspace tables and scoped records: `workspaces`, `workspace_settings`, and `workspace_id` on clients, projects, time entries, audit logs, API keys, role assignments, and module status rows.
- Browser and public API responses intentionally accept or emit compatibility aliases such as `organizationName` and `organization_id` while new surfaces prefer `workspaceName`, `workspaceId`, and `workspace_id`.
- Module and permission ids such as `organization_settings.manage` remain compatibility identifiers until permission contracts are renamed and migrated together.

## Migration Order

1. Keep dual writes active for the compatibility phase. Any write that changes a legacy organization-scoped row must also update the corresponding workspace alias row or column.
2. Move browser payloads and page controllers to workspace-first field names while continuing to accept old aliases.
3. Move internal services and repositories from `session.organization_id` parameters to workspace-first names without changing the stored legacy keys yet.
4. Rename permission ids and module registry identifiers only after browser routes, public API docs, and role assignment migrations are ready to move together.
5. Promote `workspaces`, `workspace_settings`, and `workspace_id` columns to the source of truth in a dedicated storage migration.
6. Drop legacy organization tables, columns, and response aliases only after a release has shipped with no required legacy readers or writers.

## Compatibility Rules

- During 0.30.x, `organization_id` and `workspace_id` must remain synchronized on scoped records that have both columns.
- `organizations` and `workspaces` must mirror workspace name, status, type, owner, and timestamps when those fields are written.
- `organization_settings` and `workspace_settings` must mirror settings writes.
- Public API integrations should use `workspace_id`; `organization_id` remains available only as a backward-compatible alias.

## Removal Gate

Legacy organization names can be removed after all of these are true:

- Browser code no longer depends on `organizationName`, `organization_id`, `organizations`, or organization-named routes.
- Public API documentation has announced the removal window and one compatibility release has shipped after that announcement.
- Services and repositories use workspace-first parameter and payload names internally.
- Permission ids and audit metadata have workspace-first replacements or documented compatibility mappings.
- `npm run check` includes alias synchronization tests and they pass on a fresh migrated database.
