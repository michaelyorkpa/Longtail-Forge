import { randomUUID } from "node:crypto";
import { db } from "../core/database.js";

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
ORDER BY name;
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

  await db.run(`
INSERT INTO user_workspaces (
  user_workspace_id,
  user_id,
  workspace_id,
  status,
  created_at,
  updated_at
)
VALUES (
  :userWorkspaceId,
  :userId,
  :workspaceId,
  :status,
  :createdAt,
  :updatedAt
)
ON CONFLICT(user_id, workspace_id) DO UPDATE SET
  status = excluded.status,
  updated_at = excluded.updated_at;
`, {
    createdAt: now,
    status: normalizeStatus(status),
    updatedAt: now,
    userId,
    userWorkspaceId: randomUUID(),
    workspaceId,
  });

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

async function remove(userId, workspaceId) {
  await db.run(`
DELETE FROM user_workspaces
WHERE user_id = :userId
  AND workspace_id = :workspaceId;
`, { userId, workspaceId });
}

function normalizeStatus(status) {
  return status === "inactive" ? "inactive" : "active";
}

export const userWorkspacesRepository = {
  readAllWorkspaces,
  readActiveForUser,
  readByUserAndWorkspace,
  readForUser,
  countActiveForWorkspace,
  remove,
  updateStatus,
  upsert,
};
