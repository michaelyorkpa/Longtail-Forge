import { db } from "../core/database.js";

async function create(value) {
  await db.run(`
INSERT INTO workspace_deletion_lifecycle (
  workspace_id,
  requested_by_user_id,
  requested_at,
  purge_after,
  backup_id,
  no_current_backup_acknowledged
)
VALUES (
  :workspaceId,
  :requestedByUserId,
  :requestedAt,
  :purgeAfter,
  :backupId,
  :noCurrentBackupAcknowledged
);
`, {
    backupId: value.backupId || null,
    noCurrentBackupAcknowledged: value.noCurrentBackupAcknowledged ? 1 : 0,
    purgeAfter: value.purgeAfter,
    requestedAt: value.requestedAt,
    requestedByUserId: value.requestedByUserId || null,
    workspaceId: value.workspaceId,
  });
}

async function read(workspaceId) {
  const row = await db.get(`
SELECT
  workspace_deletion_lifecycle.workspace_id,
  workspace_deletion_lifecycle.requested_by_user_id,
  workspace_deletion_lifecycle.requested_at,
  workspace_deletion_lifecycle.purge_after,
  workspace_deletion_lifecycle.backup_id,
  workspace_deletion_lifecycle.no_current_backup_acknowledged,
  workspace_deletion_lifecycle.status,
  workspace_deletion_lifecycle.purge_started_at,
  workspace_deletion_lifecycle.purge_token,
  COALESCE(users.display_name, users.username, '') AS requested_by_name
FROM workspace_deletion_lifecycle
LEFT JOIN users ON users.user_id = workspace_deletion_lifecycle.requested_by_user_id
WHERE workspace_deletion_lifecycle.workspace_id = :workspaceId
LIMIT 1;
`, { workspaceId });

  return row ? {
    backupId: row.backup_id,
    noCurrentBackupAcknowledged: Boolean(row.no_current_backup_acknowledged),
    purgeAfter: row.purge_after,
    requestedAt: row.requested_at,
    requestedByName: row.requested_by_name || "Workspace administrator",
    requestedByUserId: row.requested_by_user_id,
    status: row.status,
    purgeStartedAt: row.purge_started_at,
    purgeToken: row.purge_token,
    workspaceId: row.workspace_id,
  } : null;
}

async function remove(workspaceId) {
  await db.run(`
DELETE FROM workspace_deletion_lifecycle
WHERE workspace_id = :workspaceId;
`, { workspaceId });
}

export const workspaceDeletionLifecycleRepository = {
  create,
  read,
  remove,
};
