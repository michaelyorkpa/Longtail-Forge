// @ts-check

import { db } from "../core/database.js";
import { createRecordId } from "../core/identifiers.js";

/** @typedef {import("../types/database-contracts.js").DatabaseRow} DatabaseRow */
/** @typedef {import("../types/database-contracts.js").TransactionClient} TransactionClient */
/** @typedef {{ id: string, label?: string, description?: string }} PermissionContractInput */
/** @typedef {{ roleId: string, permissions?: string[] }} RolePermissionDefaultInput */
/** @typedef {{ role_id: string, scope_type: string, scope_id?: string | null, client_id?: string | null, project_id?: string | null, permission_overrides_json?: string | null }} PermissionAssignmentInput */
/** @typedef {PermissionAssignmentInput & { assignment_id: string, workspace_id: string, user_id: string, created_at: string, updated_at: string }} PermissionAssignmentInsertRow */
/** @typedef {DatabaseRow & { assignment_id: string }} SuperAdminAssignmentRow */
/** @typedef {DatabaseRow & { user_id: string, username: string, display_name: string | null, assignment_id: string, created_at: string }} OldestRoleAssignmentRow */
/** @typedef {DatabaseRow & { workspace_id: string, workspace_type: string, status: string }} PermissionWorkspaceRow */
/** @typedef {DatabaseRow & { user_id: string, username: string, display_name?: string | null, user_status: string, protected_user: string, membership_status: string | null }} PermissionUserRow */
/** @typedef {DatabaseRow & { id: string, workspace_id: string, name: string, status: string }} PermissionClientRow */
/** @typedef {DatabaseRow & { id: string, workspace_id: string, client_id: string, name: string, status: string }} PermissionProjectRow */
/** @typedef {{ actor: PermissionUserRow | null, actorAssignments: PermissionAssignmentRow[], clients: PermissionClientRow[], previousAssignments: PermissionAssignmentRow[], projects: PermissionProjectRow[], roles: PermissionRoleRow[], targetUser: PermissionUserRow | null, workspace: PermissionWorkspaceRow | null }} PermissionMutationState */
/** @typedef {{ assignmentIdsToDelete?: string[], assignmentsToInsert?: PermissionAssignmentInput[], fullAdministrator: boolean, manageableKeys: Set<string>, safePreviousAssignments: unknown[] }} PermissionMutationPlan */
/** @typedef {{ actorUserId: string, planMutation: (state: PermissionMutationState) => PermissionMutationPlan | Promise<PermissionMutationPlan>, userId: string, workspaceId: string }} PermissionMutationOptions */
/** @typedef {DatabaseRow & { permission_id: string }} PermissionIdRow */
/** @typedef {DatabaseRow & { permission_id: string, role_id: string }} RolePermissionRow */
/** @typedef {DatabaseRow & { role_id: string, role_name: string, description: string, assignable_scope_type: string }} PermissionRoleRow */
/** @typedef {DatabaseRow & { assignment_id: string, workspace_id: string, user_id: string, role_id: string, scope_type: string, scope_id: string | null, client_id: string | null, project_id: string | null, permission_overrides_json: string | null, created_at: string, updated_at: string }} PermissionAssignmentRow */

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

/** @returns {Promise<PermissionRoleRow[]>} */
async function readRoles() {
  return /** @type {Promise<PermissionRoleRow[]>} */ (db.query(`
SELECT role_id, role_name, description, assignable_scope_type
FROM roles
ORDER BY sort_order, role_name;
`));
}

/** @returns {Promise<RolePermissionRow[]>} */
async function readRolePermissions() {
  return /** @type {Promise<RolePermissionRow[]>} */ (db.query(`
SELECT role_id, permission_id
FROM role_permissions
ORDER BY role_id, permission_id;
`));
}

/** @returns {Promise<string[]>} */
async function readPermissionIds() {
  const rows = /** @type {PermissionIdRow[]} */ (await db.query(`
SELECT permission_id
FROM permissions
ORDER BY permission_id;
`));

  return rows.map((row) => row.permission_id);
}

/** @param {string} userId */
async function hasSuperAdminAssignment(userId) {
  const row = /** @type {SuperAdminAssignmentRow | null} */ (await db.get(`
SELECT assignment_id
FROM user_role_assignments
WHERE user_id = :userId
  AND role_id = 'super_admin'
  AND scope_type = 'all'
LIMIT 1;
`, { userId }));

  return Boolean(row);
}

/** @param {PermissionContractInput[]} permissions @param {RolePermissionDefaultInput[]} roleDefaults */
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

/** @param {string} workspaceId @returns {Promise<PermissionAssignmentRow[]>} */
async function readAssignmentsForWorkspace(workspaceId) {
  return /** @type {Promise<PermissionAssignmentRow[]>} */ (db.query(`
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
`, { workspaceId }));
}

/** @param {string} workspaceId @param {string} userId @returns {Promise<PermissionAssignmentRow[]>} */
async function readAssignmentsForUser(workspaceId, userId) {
  return /** @type {Promise<PermissionAssignmentRow[]>} */ (db.query(`
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
`, { userId, workspaceId }));
}

/** @param {string} workspaceId @param {string} roleId @param {string} scopeType @param {string | null} scopeId @returns {Promise<OldestRoleAssignmentRow | null>} */
async function readOldestActiveUserForRoleScope(workspaceId, roleId, scopeType, scopeId) {
  return /** @type {Promise<OldestRoleAssignmentRow | null>} */ (db.get(`
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
  }));
}

/** @param {string} workspaceId @param {string} userId @param {PermissionAssignmentInput[]} assignments */
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
        assignmentId: createRecordId(),
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

/** @param {PermissionMutationOptions} options */
async function mutateUserAssignmentsAtomically({
  actorUserId,
  planMutation,
  userId,
  workspaceId,
}) {
  return db.transaction(async (transaction) => {
    const [workspace, actor, targetUser, roles, actorAssignments, previousAssignments, clients, projects] = await Promise.all([
      /** @type {Promise<PermissionWorkspaceRow | null>} */ (transaction.get(`
SELECT workspace_id, workspace_type, status
FROM workspaces
WHERE workspace_id = :workspaceId
LIMIT 1;
`, { workspaceId })),
      /** @type {Promise<PermissionUserRow | null>} */ (transaction.get(`
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
`, { actorUserId, workspaceId })),
      /** @type {Promise<PermissionUserRow | null>} */ (transaction.get(`
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
`, { userId, workspaceId })),
      /** @type {Promise<PermissionRoleRow[]>} */ (transaction.query(`
SELECT role_id, role_name, description, assignable_scope_type
FROM roles
ORDER BY sort_order, role_name;
`)),
      /** @type {Promise<PermissionAssignmentRow[]>} */ (transaction.query(`
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
`, { actorUserId, workspaceId })),
      readAssignmentsWithClient(transaction, workspaceId, userId),
      /** @type {Promise<PermissionClientRow[]>} */ (transaction.query(`
SELECT id, workspace_id, name, status
FROM clients
WHERE workspace_id = :workspaceId
ORDER BY id;
`, { workspaceId })),
      /** @type {Promise<PermissionProjectRow[]>} */ (transaction.query(`
SELECT id, workspace_id, client_id, name, status
FROM projects
WHERE workspace_id = :workspaceId
ORDER BY id;
`, { workspaceId })),
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
        assignment_id: createRecordId(),
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

/** @param {TransactionClient} transaction @param {string} workspaceId @param {string} userId @returns {Promise<PermissionAssignmentRow[]>} */
function readAssignmentsWithClient(transaction, workspaceId, userId) {
  return /** @type {Promise<PermissionAssignmentRow[]>} */ (transaction.query(`
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
`, { userId, workspaceId }));
}

/** @param {TransactionClient} transaction @param {PermissionAssignmentInsertRow} assignment */
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
