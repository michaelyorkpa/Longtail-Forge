import { randomUUID } from "node:crypto";
import { querySql, runSql, sqlText, sqlNullableText } from "../db/index.js";

async function readRoles() {
  const roles = await querySql(`
SELECT role_id, role_name, description, assignable_scope_type
FROM roles
ORDER BY sort_order, role_name;
`);

  return roles;
}

async function readRolePermissions() {
  return querySql(`
SELECT role_id, permission_id
FROM role_permissions
ORDER BY role_id, permission_id;
`);
}

async function ensurePermissionContracts(permissions, roleDefaults) {
  const permissionStatements = permissions.map((permission) => `
INSERT OR IGNORE INTO permissions (permission_id, permission_name, description)
VALUES (
  ${sqlText(permission.id)},
  ${sqlText(permission.label || permission.id)},
  ${sqlText(permission.description || permission.id)}
);

UPDATE permissions
SET permission_name = ${sqlText(permission.label || permission.id)},
    description = ${sqlText(permission.description || permission.id)}
WHERE permission_id = ${sqlText(permission.id)};
`).join("\n");
  const rolePermissionStatements = roleDefaults.flatMap((mapping) => (
    mapping.permissions || []
  ).map((permissionId) => `
INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
SELECT ${sqlText(mapping.roleId)}, ${sqlText(permissionId)}
WHERE EXISTS (SELECT 1 FROM roles WHERE role_id = ${sqlText(mapping.roleId)})
  AND EXISTS (SELECT 1 FROM permissions WHERE permission_id = ${sqlText(permissionId)});
`)).join("\n");

  await runSql([permissionStatements, rolePermissionStatements].filter(Boolean).join("\n"));
}

async function readAssignmentsForWorkspace(workspaceId) {
  return querySql(`
SELECT
  assignment_id,
  workspace_id,
  user_id,
  role_id,
  scope_type,
  scope_id,
  client_id,
  project_id,
  permission_overrides_json,
  created_at,
  updated_at
FROM user_role_assignments
WHERE workspace_id = ${sqlText(workspaceId)}
ORDER BY updated_at DESC, assignment_id;
`);
}

async function readAssignmentsForUser(workspaceId, userId) {
  return querySql(`
SELECT
  assignment_id,
  workspace_id,
  user_id,
  role_id,
  scope_type,
  scope_id,
  client_id,
  project_id,
  permission_overrides_json,
  created_at,
  updated_at
FROM user_role_assignments
WHERE workspace_id = ${sqlText(workspaceId)}
  AND user_id = ${sqlText(userId)}
ORDER BY updated_at DESC, assignment_id;
`);
}

async function readOldestActiveUserForRoleScope(workspaceId, roleId, scopeType, scopeId) {
  const rows = await querySql(`
SELECT
  user_role_assignments.user_id,
  users.username,
  users.display_name,
  user_role_assignments.assignment_id,
  user_role_assignments.created_at
FROM user_role_assignments
INNER JOIN users
  ON users.user_id = user_role_assignments.user_id
WHERE user_role_assignments.workspace_id = ${sqlText(workspaceId)}
  AND user_role_assignments.role_id = ${sqlText(roleId)}
  AND user_role_assignments.scope_type = ${sqlText(scopeType)}
  AND user_role_assignments.scope_id = ${sqlText(scopeId)}
  AND users.user_status = 'active'
ORDER BY user_role_assignments.created_at ASC, user_role_assignments.assignment_id ASC
LIMIT 1;
`);

  return rows[0] || null;
}

async function replaceUserAssignments(workspaceId, userId, assignments) {
  const now = new Date().toISOString();
  const inserts = assignments.map((assignment) => `
INSERT INTO user_role_assignments (
  assignment_id,
  workspace_id,
  user_id,
  role_id,
  scope_type,
  scope_id,
  client_id,
  project_id,
  permission_overrides_json,
  created_at,
  updated_at
)
VALUES (
  ${sqlText(randomUUID())},
  ${sqlText(workspaceId)},
  ${sqlText(userId)},
  ${sqlText(assignment.role_id)},
  ${sqlText(assignment.scope_type)},
  ${sqlNullableText(assignment.scope_id)},
  ${sqlNullableText(assignment.client_id)},
  ${sqlNullableText(assignment.project_id)},
  ${sqlNullableText(assignment.permission_overrides_json)},
  ${sqlText(now)},
  ${sqlText(now)}
);
`).join("\n");

  await runSql(`
BEGIN TRANSACTION;
DELETE FROM user_role_assignments
WHERE workspace_id = ${sqlText(workspaceId)}
  AND user_id = ${sqlText(userId)};
${inserts}
COMMIT;
`);
}

export const permissionsRepository = {
  ensurePermissionContracts,
  readAssignmentsForWorkspace,
  readAssignmentsForUser,
  readOldestActiveUserForRoleScope,
  readRolePermissions,
  readRoles,
  replaceUserAssignments,
};
