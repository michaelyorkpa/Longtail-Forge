import { modulesService } from "../core/modules/modules.service.js";
import { db } from "../core/database.js";
import { createRecordId } from "../core/identifiers.js";
import { normalizeSettings } from "../utils/normalizers.js";
import { normalizeWorkspaceType } from "../utils/workspaces.js";

/**
 * @typedef {Object} WorkspaceMembershipRow
 * @property {string} workspace_id
 * @property {string} workspace_name
 * @property {string} workspace_type
 * @property {string} status
 */
/**
 * @typedef {Object} OwnedWorkspaceRow
 * @property {string} workspace_id
 * @property {string} workspace_name
 * @property {string} workspace_type
 */
/**
 * @typedef {Object} WorkspaceRow
 * @property {string} workspace_id
 * @property {string} workspace_name
 * @property {string} workspace_type
 * @property {string | null} owner_user_id
 */
/**
 * @typedef {Object} OwnerTransferCandidateRow
 * @property {string} user_id
 * @property {string} username
 * @property {string | null} membership_created_at
 */
/**
 * @typedef {Object} CreateWorkspaceInput
 * @property {{ user_id: string }} ownerUser
 * @property {string} workspaceName
 * @property {string} workspaceType
 */
/**
 * @typedef {Object} CreatedWorkspace
 * @property {string} workspaceId
 * @property {string} workspaceName
 * @property {string} workspaceType
 */

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

/** @param {string} userId @returns {Promise<WorkspaceMembershipRow[]>} */
async function readForUser(userId) {
  return /** @type {Promise<WorkspaceMembershipRow[]>} */ (db.query(`
SELECT
  workspaces.workspace_id,
  workspaces.name AS workspace_name,
  workspaces.workspace_type,
  user_workspaces.status
FROM user_workspaces
INNER JOIN workspaces ON workspaces.workspace_id = user_workspaces.workspace_id
WHERE user_workspaces.user_id = :userId
ORDER BY workspaces.name;
`, { userId }));
}

/** @param {string} userId @param {string} workspaceType @returns {Promise<number>} */
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

/** @param {string} userId @returns {Promise<OwnedWorkspaceRow[]>} */
async function readOwnedForUser(userId) {
  return /** @type {Promise<OwnedWorkspaceRow[]>} */ (db.query(`
SELECT
  workspace_id,
  name AS workspace_name,
  workspace_type
FROM workspaces
WHERE owner_user_id = :userId
ORDER BY name;
`, { userId }));
}

/** @param {string} workspaceId @returns {Promise<WorkspaceRow | null>} */
async function readById(workspaceId) {
  return /** @type {Promise<WorkspaceRow | null>} */ (db.get(`
SELECT
  workspace_id,
  name AS workspace_name,
  workspace_type,
  owner_user_id
FROM workspaces
WHERE workspace_id = :workspaceId
LIMIT 1;
`, { workspaceId }));
}

/** @param {string} workspaceId @param {string} previousOwnerUserId @returns {Promise<OwnerTransferCandidateRow | null>} */
async function readOwnerTransferCandidate(workspaceId, previousOwnerUserId) {
  return /** @type {Promise<OwnerTransferCandidateRow | null>} */ (db.get(`
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
`, { previousOwnerUserId, workspaceId }));
}

/** @param {string} workspaceId @param {string} ownerUserId @returns {Promise<void>} */
async function updateOwner(workspaceId, ownerUserId) {
  const now = new Date().toISOString();

  await db.run(`
UPDATE workspaces
SET owner_user_id = :ownerUserId,
    updated_at = :updatedAt
WHERE workspace_id = :workspaceId;
`, { ownerUserId, updatedAt: now, workspaceId });
}

/** @param {CreateWorkspaceInput} input @returns {Promise<CreatedWorkspace>} */
async function createWorkspace({ ownerUser, workspaceName, workspaceType }) {
  const workspaceId = createRecordId();
  const membershipId = createRecordId();
  const assignmentId = createRecordId();
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
