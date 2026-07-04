import { randomUUID } from "node:crypto";
import { db } from "../core/database.js";

async function readRoles() {
  return db.query(`
SELECT role_id, role_name, description, assignable_scope_type
FROM roles
ORDER BY sort_order, role_name;
`);
}

async function readRolePermissions() {
  return db.query(`
SELECT role_id, permission_id
FROM role_permissions
ORDER BY role_id, permission_id;
`);
}

async function ensurePermissionContracts(permissions, roleDefaults) {
  await db.transaction(async (transaction) => {
    for (const permission of permissions) {
      const params = {
        description: permission.description || permission.id,
        permissionId: permission.id,
        permissionName: permission.label || permission.id,
      };

      await transaction.run(`
INSERT OR IGNORE INTO permissions (permission_id, permission_name, description)
VALUES (:permissionId, :permissionName, :description);
`, params);
      await transaction.run(`
UPDATE permissions
SET permission_name = :permissionName,
    description = :description
WHERE permission_id = :permissionId;
`, params);
    }

    for (const mapping of roleDefaults) {
      for (const permissionId of mapping.permissions || []) {
        await transaction.run(`
INSERT OR IGNORE INTO role_permissions (role_id, permission_id)
SELECT :roleId, :permissionId
WHERE EXISTS (SELECT 1 FROM roles WHERE role_id = :roleId)
  AND EXISTS (SELECT 1 FROM permissions WHERE permission_id = :permissionId);
`, {
          permissionId,
          roleId: mapping.roleId,
        });
      }
    }
  });
}

async function readAssignmentsForWorkspace(workspaceId) {
  return db.query(`
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
WHERE workspace_id = :workspaceId
ORDER BY updated_at DESC, assignment_id;
`, { workspaceId });
}

async function readAssignmentsForUser(workspaceId, userId) {
  return db.query(`
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
WHERE workspace_id = :workspaceId
  AND user_id = :userId
ORDER BY updated_at DESC, assignment_id;
`, { userId, workspaceId });
}

async function readOldestActiveUserForRoleScope(workspaceId, roleId, scopeType, scopeId) {
  return db.get(`
SELECT
  user_role_assignments.user_id,
  users.username,
  users.display_name,
  user_role_assignments.assignment_id,
  user_role_assignments.created_at
FROM user_role_assignments
INNER JOIN users
  ON users.user_id = user_role_assignments.user_id
WHERE user_role_assignments.workspace_id = :workspaceId
  AND user_role_assignments.role_id = :roleId
  AND user_role_assignments.scope_type = :scopeType
  AND user_role_assignments.scope_id = :scopeId
  AND users.user_status = 'active'
ORDER BY user_role_assignments.created_at ASC, user_role_assignments.assignment_id ASC
LIMIT 1;
`, {
    roleId,
    scopeId,
    scopeType,
    workspaceId,
  });
}

async function replaceUserAssignments(workspaceId, userId, assignments) {
  const now = new Date().toISOString();

  await db.transaction(async (transaction) => {
    await transaction.run(`
DELETE FROM user_role_assignments
WHERE workspace_id = :workspaceId
  AND user_id = :userId;
`, { userId, workspaceId });

    for (const assignment of assignments) {
      await transaction.run(`
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
  :assignmentId,
  :workspaceId,
  :userId,
  :roleId,
  :scopeType,
  :scopeId,
  :clientId,
  :projectId,
  :permissionOverridesJson,
  :createdAt,
  :updatedAt
);
`, {
        assignmentId: randomUUID(),
        clientId: assignment.client_id || null,
        createdAt: now,
        permissionOverridesJson: assignment.permission_overrides_json || null,
        projectId: assignment.project_id || null,
        roleId: assignment.role_id,
        scopeId: assignment.scope_id || null,
        scopeType: assignment.scope_type,
        updatedAt: now,
        userId,
        workspaceId,
      });
    }
  });
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
