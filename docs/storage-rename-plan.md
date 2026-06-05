# Workspace Storage Migration

Version 0.30.16.1 completed the active storage migration to workspace-first names. Version 0.31.21 removes the remaining active compatibility surfaces while preserving historical migration files for existing upgrade paths.

## Active Schema

- `workspaces` and `workspace_settings` are the active workspace and settings tables.
- `workspace_modules` stores per-workspace module enablement.
- App data tables use `workspace_id` as the scoped key: users, sessions, clients, projects, time entries, active timers, audit logs, API keys, role assignments, and module enablement.
- Runtime sessions expose `workspace_id`, `active_workspace_id`, and `home_workspace_id`.
- Role and permission contracts use `workspace_admin`, `workspace` scope, and `workspace_settings.manage`.
- Browser payloads and public API responses use workspace fields as canonical values.
- Version 0.30.17 removes remaining active permission-matrix organization terms, keeps user lifecycle management workspace-level, and allows scoped role assignment only inside the actor's assigned client/project scope.

## Historical Migrations

Earlier checksum-tracked migration files are preserved so existing installations can upgrade safely. Those files still describe the original pre-0.30.16.1 schema and should not be edited in place. A future migration-history squash can produce a zero-legacy baseline once backward upgrade support no longer needs the historical files.

## Verification

- `npm run check` runs JavaScript syntax checks, the workspace storage regression, and ESLint.
- `npm run test:permissions` verifies workspace-native roles, scopes, permissions, Business-only client access, scoped role assignment, reporting permission enforcement, user lifecycle rules, and workspace ownership transfer.
- SQLite `PRAGMA integrity_check` should return `ok` after migration.
