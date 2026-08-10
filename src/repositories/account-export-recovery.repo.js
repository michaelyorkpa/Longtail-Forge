// @ts-check
import { db } from "../core/database.js";

/** @typedef {import("../types/framework-contracts.js").TransactionClient} TransactionClient */

const QUALIFICATION_BASIS = "former_workspace_administrator";
const QUALIFICATION_UPSERT_SQL = db.dialect.conflict.buildInsertOnConflictDoUpdate({
  columns: ["user_id", "qualification_basis", "qualification_source", "qualified_at", "updated_at"],
  conflictColumns: ["user_id"],
  tableName: "account_export_recovery_qualifications",
  updateColumns: ["qualification_basis", "qualification_source", "qualified_at", "updated_at"],
  valueExpressions: {
    qualification_basis: ":qualificationBasis",
    qualification_source: ":qualificationSource",
    qualified_at: ":qualifiedAt",
    updated_at: ":updatedAt",
    user_id: ":userId",
  },
});

/**
 * @param {string} userId
 * @param {TransactionClient} [database]
 */
async function readForUser(userId, database = db) {
  return database.get(`
SELECT
  user_id,
  qualification_basis,
  qualification_source,
  qualified_at,
  updated_at
FROM account_export_recovery_qualifications
WHERE user_id = :userId
LIMIT 1;
`, { userId });
}

/**
 * @param {string} userId
 * @param {TransactionClient} [database]
 */
async function hasActiveWorkspace(userId, database = db) {
  const row = await database.get(`
SELECT COUNT(1) AS count
FROM user_workspaces
INNER JOIN workspaces ON workspaces.workspace_id = user_workspaces.workspace_id
WHERE user_workspaces.user_id = :userId
  AND user_workspaces.status = 'active'
  AND lower(workspaces.status) = 'active';
`, { userId });
  return Number(row?.count || 0) > 0;
}

/**
 * @param {string} userId
 * @param {TransactionClient} [database]
 */
async function clear(userId, database = db) {
  await database.run(`
DELETE FROM account_export_recovery_qualifications
WHERE user_id = :userId;
`, { userId });
}

/**
 * @param {any} input
 * @param {TransactionClient} [database]
 */
async function recordWorkspaceAccessLoss({ userId, workspaceId, source }, database = db) {
  const remaining = await database.get(`
SELECT COUNT(1) AS count
FROM user_workspaces
INNER JOIN workspaces ON workspaces.workspace_id = user_workspaces.workspace_id
WHERE user_workspaces.user_id = :userId
  AND user_workspaces.workspace_id <> :workspaceId
  AND user_workspaces.status = 'active'
  AND lower(workspaces.status) = 'active';
`, { userId, workspaceId });
  if (Number(remaining?.count || 0) > 0) {
    await clear(userId, database);
    return false;
  }

  const administrator = await database.get(`
SELECT 1 AS eligible
FROM workspaces
WHERE workspace_id = :workspaceId
  AND (
    owner_user_id = :userId
    OR EXISTS (
      SELECT 1
      FROM user_role_assignments
      WHERE user_role_assignments.workspace_id = workspaces.workspace_id
        AND user_role_assignments.user_id = :userId
        AND user_role_assignments.role_id IN ('workspace_admin', 'super_admin')
        AND user_role_assignments.scope_type = 'workspace'
    )
  )
LIMIT 1;
`, { userId, workspaceId });
  if (!administrator) {
    await clear(userId, database);
    return false;
  }

  const now = new Date().toISOString();
  await database.run(QUALIFICATION_UPSERT_SQL, {
    qualificationBasis: QUALIFICATION_BASIS,
    qualificationSource: source,
    qualifiedAt: now,
    updatedAt: now,
    userId,
  });
  return true;
}

/**
 * @param {string} workspaceId
 * @param {TransactionClient} [database]
 */
async function prepareWorkspacePurge(workspaceId, database = db) {
  const users = await database.query(`
SELECT DISTINCT user_id
FROM (
  SELECT user_id
  FROM user_workspaces
  WHERE workspace_id = :workspaceId
    AND status = 'active'
  UNION
  SELECT owner_user_id AS user_id
  FROM workspaces
  WHERE workspace_id = :workspaceId
)
WHERE user_id IS NOT NULL
ORDER BY user_id;
`, { workspaceId });
  for (const user of users) {
    await recordWorkspaceAccessLoss({
      source: "workspace_purge",
      userId: user.user_id,
      workspaceId,
    }, database);
  }
}

export const accountExportRecoveryRepository = {
  clear,
  hasActiveWorkspace,
  prepareWorkspacePurge,
  readForUser,
  recordWorkspaceAccessLoss,
};
