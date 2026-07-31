import { randomUUID } from "node:crypto";
import { db } from "../core/database.js";

const PERMISSION_INSERT_SQL = db.dialect.conflict.buildInsertOrIgnore({
  columns: ["permission_id", "permission_name", "description"],
  tableName: "permissions",
  valueExpressions: {
    description: ":description",
    permission_id: ":permissionId",
    permission_name: ":permissionName",
  },
});
const ROLE_PERMISSION_INSERT_PREFIX = db.dialect.conflict.insertOrIgnoreInto("role_permissions");

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

async function readPermissionIds() {
  const rows = await db.query(`
SELECT permission_id
FROM permissions
ORDER BY permission_id;
`);

  return rows.map((row) => row.permission_id);
}

async function hasSuperAdminAssignment(userId) {
  const row = await db.get(`
SELECT assignment_id
FROM user_role_assignments
WHERE user_id = :userId
  AND role_id = 'super_admin'
  AND scope_type = 'all'
LIMIT 1;
`, { userId });

  return Boolean(row);
}

async function ensurePermissionContracts(permissions, roleDefaults) {
  await db.transaction(async (transaction) => {
    for (const permission of permissions) {
      const params = {
        description: permission.description || permission.id,
        permissionId: permission.id,
        permissionName: permission.label || permission.id,
      };

      await transaction.run(`${PERMISSION_INSERT_SQL};`, params);
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
${ROLE_PERMISSION_INSERT_PREFIX} (role_id, permission_id)
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

async function mutateUserAssignmentsAtomically({
  actorUserId,
  planMutation,
  userId,
  workspaceId,
}) {
  return db.transaction(async (transaction) => {
    const [workspace, actor, targetUser, roles, actorAssignments, previousAssignments, clients, projects] = await Promise.all([
      transaction.get(`
SELECT workspace_id, workspace_type, status
FROM workspaces
WHERE workspace_id = :workspaceId
LIMIT 1;
`, { workspaceId }),
      transaction.get(`
SELECT
  users.user_id,
  users.username,
  users.user_status,
  users.protected_user,
  user_workspaces.status AS membership_status
FROM users
LEFT JOIN user_workspaces
  ON user_workspaces.user_id = users.user_id
  AND user_workspaces.workspace_id = :workspaceId
WHERE users.user_id = :actorUserId
LIMIT 1;
`, { actorUserId, workspaceId }),
      transaction.get(`
SELECT
  users.user_id,
  users.username,
  users.display_name,
  users.user_status,
  users.protected_user,
  user_workspaces.status AS membership_status
FROM users
LEFT JOIN user_workspaces
  ON user_workspaces.user_id = users.user_id
  AND user_workspaces.workspace_id = :workspaceId
WHERE users.user_id = :userId
LIMIT 1;
`, { userId, workspaceId }),
      transaction.query(`
SELECT role_id, role_name, description, assignable_scope_type
FROM roles
ORDER BY sort_order, role_name;
`),
      transaction.query(`
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
WHERE user_id = :actorUserId
  AND (
    workspace_id = :workspaceId
    OR (role_id = 'super_admin' AND scope_type = 'all')
  )
ORDER BY updated_at DESC, assignment_id;
`, { actorUserId, workspaceId }),
      readAssignmentsWithClient(transaction, workspaceId, userId),
      transaction.query(`
SELECT id, workspace_id, name, status
FROM clients
WHERE workspace_id = :workspaceId
ORDER BY id;
`, { workspaceId }),
      transaction.query(`
SELECT id, workspace_id, client_id, name, status
FROM projects
WHERE workspace_id = :workspaceId
ORDER BY id;
`, { workspaceId }),
    ]);
    const plan = await planMutation({
      actor,
      actorAssignments,
      clients,
      previousAssignments,
      projects,
      roles,
      targetUser,
      workspace,
    });

    for (const assignmentId of plan.assignmentIdsToDelete || []) {
      await transaction.run(`
DELETE FROM user_role_assignments
WHERE assignment_id = :assignmentId
  AND workspace_id = :workspaceId
  AND user_id = :userId;
`, { assignmentId, userId, workspaceId });
    }

    const now = new Date().toISOString();
    for (const assignment of plan.assignmentsToInsert || []) {
      await insertAssignment(transaction, {
        ...assignment,
        assignment_id: randomUUID(),
        created_at: now,
        updated_at: now,
        user_id: userId,
        workspace_id: workspaceId,
      });
    }

    return {
      actor,
      plan,
      previousAssignments,
      targetUser,
      nextAssignments: await readAssignmentsWithClient(transaction, workspaceId, userId),
    };
  });
}

function readAssignmentsWithClient(transaction, workspaceId, userId) {
  return transaction.query(`
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

async function insertAssignment(transaction, assignment) {
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
    assignmentId: assignment.assignment_id,
    clientId: assignment.client_id || null,
    createdAt: assignment.created_at,
    permissionOverridesJson: assignment.permission_overrides_json || null,
    projectId: assignment.project_id || null,
    roleId: assignment.role_id,
    scopeId: assignment.scope_id || null,
    scopeType: assignment.scope_type,
    updatedAt: assignment.updated_at,
    userId: assignment.user_id,
    workspaceId: assignment.workspace_id,
  });
}

export const permissionsRepository = {
  ensurePermissionContracts,
  hasSuperAdminAssignment,
  readAssignmentsForWorkspace,
  readAssignmentsForUser,
  readOldestActiveUserForRoleScope,
  readPermissionIds,
  readRolePermissions,
  readRoles,
  mutateUserAssignmentsAtomically,
  replaceUserAssignments,
};
