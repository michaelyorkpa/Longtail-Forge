import { randomUUID } from "node:crypto";
import { db } from "../core/database.js";

const USER_WORKSPACE_UPSERT_SQL = db.dialect.conflict.buildInsertOnConflictDoUpdate({
  columns: ["user_workspace_id", "user_id", "workspace_id", "status", "created_at", "updated_at"],
  conflictColumns: ["user_id", "workspace_id"],
  tableName: "user_workspaces",
  updateColumns: ["status", "updated_at"],
  valueExpressions: {
    created_at: ":createdAt",
    status: ":status",
    updated_at: ":updatedAt",
    user_id: ":userId",
    user_workspace_id: ":userWorkspaceId",
    workspace_id: ":workspaceId",
  },
});

async function readByUserAndWorkspace(userId, workspaceId) {
  return db.get(`
SELECT
  user_workspace_id,
  user_id,
  workspace_id,
  status,
  created_at,
  updated_at
FROM user_workspaces
WHERE user_id = :userId
  AND workspace_id = :workspaceId
LIMIT 1;
`, { userId, workspaceId });
}

async function readForUser(userId) {
  return db.query(`
SELECT
  user_workspaces.user_workspace_id,
  user_workspaces.user_id,
  user_workspaces.workspace_id,
  workspaces.name AS workspace_name,
  user_workspaces.status,
  user_workspaces.created_at,
  user_workspaces.updated_at
FROM user_workspaces
INNER JOIN workspaces ON workspaces.workspace_id = user_workspaces.workspace_id
WHERE user_workspaces.user_id = :userId
  AND lower(workspaces.status) = 'active'
ORDER BY workspaces.name;
`, { userId });
}

async function readActiveForUser(userId) {
  const rows = await readForUser(userId);
  return rows.filter((membership) => membership.status === "active");
}

async function readAllWorkspaces() {
  return db.query(`
SELECT
  workspaces.workspace_id,
  workspaces.name AS workspace_name,
  workspaces.workspace_type,
  workspaces.owner_user_id,
  owner.username AS owner_username
FROM workspaces
LEFT JOIN users AS owner
  ON owner.user_id = workspaces.owner_user_id
WHERE lower(workspaces.status) = 'active'
ORDER BY name;
`);
}

async function readInstallSecurityWorkspace() {
  return db.get(`
SELECT
  workspaces.workspace_id,
  workspaces.name AS workspace_name
FROM workspaces
LEFT JOIN users AS owner
  ON owner.user_id = workspaces.owner_user_id
WHERE lower(workspaces.status) = 'active'
ORDER BY
  CASE WHEN owner.protected_user = 'yes' THEN 0 ELSE 1 END,
  workspaces.created_at,
  workspaces.workspace_id
LIMIT 1;
`);
}

async function countActiveForWorkspace(workspaceId) {
  const row = await db.get(`
SELECT COUNT(1) AS count
FROM user_workspaces
WHERE workspace_id = :workspaceId
  AND status = 'active';
`, { workspaceId });

  return Number(row?.count) || 0;
}

async function upsert({ userId, workspaceId, status = "active" }) {
  const now = new Date().toISOString();
  const normalizedStatus = normalizeStatus(status);

  await db.run(`${USER_WORKSPACE_UPSERT_SQL};`, {
    createdAt: now,
    status: normalizedStatus,
    updatedAt: now,
    userId,
    userWorkspaceId: randomUUID(),
    workspaceId,
  });
  if (normalizedStatus === "active") {
    await db.run(`
DELETE FROM account_export_recovery_qualifications
WHERE user_id = :userId;
`, { userId });
  }

  return readByUserAndWorkspace(userId, workspaceId);
}

async function updateStatus(userId, workspaceId, status) {
  const now = new Date().toISOString();

  await db.run(`
UPDATE user_workspaces
SET status = :status,
    updated_at = :updatedAt
WHERE user_id = :userId
  AND workspace_id = :workspaceId;
`, {
    status: normalizeStatus(status),
    updatedAt: now,
    userId,
    workspaceId,
  });

  return readByUserAndWorkspace(userId, workspaceId);
}

async function deactivateAccess(userId, workspaceId) {
  const updatedAt = new Date().toISOString();

  await db.transaction(async (transaction) => {
    await transaction.run(`
UPDATE user_workspaces
SET status = 'inactive',
    updated_at = :updatedAt
WHERE user_id = :userId
  AND workspace_id = :workspaceId;
`, { updatedAt, userId, workspaceId });
    await transaction.run(`
DELETE FROM user_role_assignments
WHERE user_id = :userId
  AND workspace_id = :workspaceId;
`, { userId, workspaceId });
  });

  return readByUserAndWorkspace(userId, workspaceId);
}

async function remove(userId, workspaceId) {
  await db.transaction(async (transaction) => {
    await transaction.run(`
DELETE FROM user_role_assignments
WHERE user_id = :userId
  AND workspace_id = :workspaceId;
`, { userId, workspaceId });
    await transaction.run(`
DELETE FROM user_workspaces
WHERE user_id = :userId
  AND workspace_id = :workspaceId;
`, { userId, workspaceId });
  });
}

function normalizeStatus(status) {
  return status === "inactive" ? "inactive" : "active";
}

export const userWorkspacesRepository = {
  deactivateAccess,
  readAllWorkspaces,
  readInstallSecurityWorkspace,
  readActiveForUser,
  readByUserAndWorkspace,
  readForUser,
  countActiveForWorkspace,
  remove,
  updateStatus,
  upsert,
};
