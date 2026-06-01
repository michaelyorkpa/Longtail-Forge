import { randomUUID } from "node:crypto";
import { querySql, runSql, sqlText } from "../db/index.js";

async function readByUserAndWorkspace(userId, workspaceId) {
  const rows = await querySql(`
SELECT
  user_workspace_id,
  user_id,
  workspace_id,
  status,
  created_at,
  updated_at
FROM user_workspaces
WHERE user_id = ${sqlText(userId)}
  AND workspace_id = ${sqlText(workspaceId)}
LIMIT 1;
`);

  return rows[0] || null;
}

async function readForUser(userId) {
  return querySql(`
SELECT
  user_workspaces.user_workspace_id,
  user_workspaces.user_id,
  user_workspaces.workspace_id,
  organizations.name AS workspace_name,
  user_workspaces.status,
  user_workspaces.created_at,
  user_workspaces.updated_at
FROM user_workspaces
INNER JOIN organizations ON organizations.id = user_workspaces.workspace_id
WHERE user_workspaces.user_id = ${sqlText(userId)}
ORDER BY organizations.name;
`);
}

async function readAllWorkspaces() {
  return querySql(`
SELECT
  id AS workspace_id,
  name AS workspace_name,
  workspace_type,
  owner_user_id
FROM organizations
ORDER BY name;
`);
}

async function countActiveForWorkspace(workspaceId) {
  const rows = await querySql(`
SELECT COUNT(1) AS count
FROM user_workspaces
WHERE workspace_id = ${sqlText(workspaceId)}
  AND status = 'active';
`);

  return Number(rows[0]?.count) || 0;
}

async function upsert({ userId, workspaceId, status = "active" }) {
  const now = new Date().toISOString();

  await runSql(`
INSERT INTO user_workspaces (
  user_workspace_id,
  user_id,
  workspace_id,
  status,
  created_at,
  updated_at
)
VALUES (
  ${sqlText(randomUUID())},
  ${sqlText(userId)},
  ${sqlText(workspaceId)},
  ${sqlText(normalizeStatus(status))},
  ${sqlText(now)},
  ${sqlText(now)}
)
ON CONFLICT(user_id, workspace_id) DO UPDATE SET
  status = excluded.status,
  updated_at = excluded.updated_at;
`);

  return readByUserAndWorkspace(userId, workspaceId);
}

async function updateStatus(userId, workspaceId, status) {
  const now = new Date().toISOString();

  await runSql(`
UPDATE user_workspaces
SET status = ${sqlText(normalizeStatus(status))},
    updated_at = ${sqlText(now)}
WHERE user_id = ${sqlText(userId)}
  AND workspace_id = ${sqlText(workspaceId)};
`);

  return readByUserAndWorkspace(userId, workspaceId);
}

async function remove(userId, workspaceId) {
  await runSql(`
DELETE FROM user_workspaces
WHERE user_id = ${sqlText(userId)}
  AND workspace_id = ${sqlText(workspaceId)};
`);
}

function normalizeStatus(status) {
  return status === "inactive" ? "inactive" : "active";
}

export const userWorkspacesRepository = {
  readAllWorkspaces,
  readByUserAndWorkspace,
  readForUser,
  countActiveForWorkspace,
  remove,
  updateStatus,
  upsert,
};
