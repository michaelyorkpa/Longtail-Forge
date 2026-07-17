import { randomUUID } from "node:crypto";
import { modulesService } from "../core/modules/modules.service.js";
import { db } from "../core/database.js";
import { normalizeSettings } from "../utils/normalizers.js";
import { normalizeWorkspaceType } from "../utils/workspaces.js";

const USERS_PHYSICAL_ROW_ID = db.dialect.identity.rowId({ tableAlias: "users" });
const USER_ROWS_PHYSICAL_ROW_ID = db.dialect.identity.rowId({ tableAlias: "user_rows" });
const USER_WORKSPACE_REACTIVATE_SQL = db.dialect.conflict.buildInsertOnConflictDoUpdate({
  columns: ["user_workspace_id", "user_id", "workspace_id", "status", "created_at", "updated_at"],
  conflictColumns: ["user_id", "workspace_id"],
  tableName: "user_workspaces",
  updateColumns: ["status", "updated_at"],
  valueExpressions: {
    created_at: ":createdAt",
    status: "'active'",
    updated_at: ":updatedAt",
    user_id: ":userId",
    user_workspace_id: ":membershipId",
    workspace_id: ":workspaceId",
  },
});

async function readForUser(userId) {
  return db.query(`
SELECT
  workspaces.workspace_id,
  workspaces.name AS workspace_name,
  workspaces.workspace_type,
  user_workspaces.status
FROM user_workspaces
INNER JOIN workspaces ON workspaces.workspace_id = user_workspaces.workspace_id
WHERE user_workspaces.user_id = :userId
ORDER BY workspaces.name;
`, { userId });
}

async function countUserWorkspacesByType(userId, workspaceType) {
  const row = await db.get(`
SELECT COUNT(1) AS count
FROM user_workspaces
INNER JOIN workspaces ON workspaces.workspace_id = user_workspaces.workspace_id
WHERE user_workspaces.user_id = :userId
  AND user_workspaces.status = 'active'
  AND workspaces.workspace_type = :workspaceType;
`, { userId, workspaceType: normalizeWorkspaceType(workspaceType) });

  return Number(row?.count) || 0;
}

async function readOwnedForUser(userId) {
  return db.query(`
SELECT
  workspace_id,
  name AS workspace_name,
  workspace_type
FROM workspaces
WHERE owner_user_id = :userId
ORDER BY name;
`, { userId });
}

async function readById(workspaceId) {
  return db.get(`
SELECT
  workspace_id,
  name AS workspace_name,
  workspace_type,
  owner_user_id
FROM workspaces
WHERE workspace_id = :workspaceId
LIMIT 1;
`, { workspaceId });
}

async function readOwnerTransferCandidate(workspaceId, previousOwnerUserId) {
  return db.get(`
SELECT
  users.user_id,
  users.username,
  user_workspaces.created_at AS membership_created_at
FROM user_workspaces
INNER JOIN users
  ON users.user_id = user_workspaces.user_id
  AND ${USERS_PHYSICAL_ROW_ID} = (
    SELECT MIN(${USER_ROWS_PHYSICAL_ROW_ID})
    FROM users AS user_rows
    WHERE user_rows.user_id = user_workspaces.user_id
  )
INNER JOIN user_role_assignments
  ON user_role_assignments.user_id = user_workspaces.user_id
  AND user_role_assignments.workspace_id = user_workspaces.workspace_id
  AND user_role_assignments.role_id = 'workspace_admin'
WHERE user_workspaces.workspace_id = :workspaceId
  AND user_workspaces.status = 'active'
  AND users.user_status = 'active'
  AND user_workspaces.user_id <> :previousOwnerUserId
ORDER BY
  COALESCE(user_workspaces.created_at, '9999-12-31T23:59:59.999Z'),
  ${USERS_PHYSICAL_ROW_ID},
  lower(users.username)
LIMIT 1;
`, { previousOwnerUserId, workspaceId });
}

async function updateOwner(workspaceId, ownerUserId) {
  const now = new Date().toISOString();

  await db.run(`
UPDATE workspaces
SET owner_user_id = :ownerUserId,
    updated_at = :updatedAt
WHERE workspace_id = :workspaceId;
`, { ownerUserId, updatedAt: now, workspaceId });
}

async function createWorkspace({ ownerUser, workspaceName, workspaceType }) {
  const workspaceId = randomUUID();
  const membershipId = randomUUID();
  const assignmentId = randomUUID();
  const now = new Date().toISOString();
  const normalizedSettings = normalizeSettings({
    workspaceName,
    workspaceType,
  });
  const normalizedType = normalizeWorkspaceType(normalizedSettings.workspaceType);

  await db.transaction(async (transaction) => {
    await transaction.run(`
INSERT INTO workspaces (
  workspace_id,
  name,
  status,
  workspace_type,
  owner_user_id,
  created_at,
  updated_at
)
VALUES (
  :workspaceId,
  :workspaceName,
  'Active',
  :workspaceType,
  :ownerUserId,
  :createdAt,
  :updatedAt
);
`, {
      createdAt: now,
      ownerUserId: ownerUser.user_id,
      updatedAt: now,
      workspaceId,
      workspaceName: normalizedSettings.workspaceName,
      workspaceType: normalizedType,
    });

    await transaction.run(`
INSERT INTO workspace_settings (
  workspace_id,
  audit_logging_enabled,
  audit_retention_days,
  audit_settings_updated_at,
  created_at,
  updated_at
)
VALUES (
  :workspaceId,
  :auditLoggingEnabled,
  :auditRetentionDays,
  :auditSettingsUpdatedAt,
  :createdAt,
  :updatedAt
);
`, {
      auditLoggingEnabled: normalizedSettings.audit.loggingEnabled ? 1 : 0,
      auditRetentionDays: normalizedSettings.audit.retentionDays,
      auditSettingsUpdatedAt: now,
      createdAt: now,
      updatedAt: now,
      workspaceId,
    });

    await transaction.run(`${USER_WORKSPACE_REACTIVATE_SQL};`, {
      createdAt: now,
      membershipId,
      updatedAt: now,
      userId: ownerUser.user_id,
      workspaceId,
    });
    await transaction.run(`
DELETE FROM account_export_recovery_qualifications
WHERE user_id = :userId;
`, { userId: ownerUser.user_id });

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
  'workspace_admin',
  'workspace',
  :workspaceId,
  NULL,
  NULL,
  NULL,
  :createdAt,
  :updatedAt
);
`, {
      assignmentId,
      createdAt: now,
      updatedAt: now,
      userId: ownerUser.user_id,
      workspaceId,
    });
  });

  await modulesService.syncModuleRegistry(workspaceId);
  return {
    workspaceId,
    workspaceName: normalizedSettings.workspaceName,
    workspaceType: normalizedType,
  };
}

export const workspacesRepository = {
  countUserWorkspacesByType,
  createWorkspace,
  readById,
  readForUser,
  readOwnedForUser,
  readOwnerTransferCandidate,
  updateOwner,
};
