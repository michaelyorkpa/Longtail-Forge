import { db } from "../core/database.js";

async function create(value) {
  await db.run(`
INSERT INTO workspace_backup_exports (
  backup_id,
  workspace_id,
  archive_filename,
  archive_sha256,
  app_version,
  created_by_user_id,
  status,
  secure_notes_recovery_required,
  file_object_count,
  file_object_bytes,
  created_at
)
VALUES (
  :backupId,
  :workspaceId,
  :archiveFilename,
  :archiveSha256,
  :appVersion,
  :createdByUserId,
  'created',
  :secureNotesRecoveryRequired,
  :fileObjectCount,
  :fileObjectBytes,
  :createdAt
);
`, {
    appVersion: value.appVersion,
    archiveFilename: value.archiveFilename,
    archiveSha256: value.archiveSha256,
    backupId: value.backupId,
    createdAt: value.createdAt,
    createdByUserId: value.createdByUserId || null,
    fileObjectBytes: Number(value.fileObjectBytes) || 0,
    fileObjectCount: Number(value.fileObjectCount) || 0,
    secureNotesRecoveryRequired: value.secureNotesRecoveryRequired ? 1 : 0,
    workspaceId: value.workspaceId,
  });
}

async function readLatest(workspaceId) {
  const row = await db.get(`
SELECT
  workspace_backup_exports.backup_id,
  workspace_backup_exports.workspace_id,
  workspace_backup_exports.archive_filename,
  workspace_backup_exports.archive_sha256,
  workspace_backup_exports.app_version,
  workspace_backup_exports.created_by_user_id,
  workspace_backup_exports.status,
  workspace_backup_exports.secure_notes_recovery_required,
  workspace_backup_exports.file_object_count,
  workspace_backup_exports.file_object_bytes,
  workspace_backup_exports.created_at,
  COALESCE(users.display_name, users.username, '') AS created_by_name
FROM workspace_backup_exports
LEFT JOIN users ON users.user_id = workspace_backup_exports.created_by_user_id
WHERE workspace_backup_exports.workspace_id = :workspaceId
  AND workspace_backup_exports.status = 'created'
ORDER BY workspace_backup_exports.created_at DESC, workspace_backup_exports.backup_id DESC
LIMIT 1;
`, { workspaceId });

  return row ? {
    appVersion: row.app_version,
    archiveFilename: row.archive_filename,
    archiveSha256: row.archive_sha256,
    backupId: row.backup_id,
    createdAt: row.created_at,
    createdByName: row.created_by_name,
    createdByUserId: row.created_by_user_id,
    fileObjectBytes: Number(row.file_object_bytes) || 0,
    fileObjectCount: Number(row.file_object_count) || 0,
    secureNotesRecoveryRequired: Boolean(row.secure_notes_recovery_required),
    status: row.status,
    workspaceId: row.workspace_id,
  } : null;
}

export const workspaceBackupExportsRepository = {
  create,
  readLatest,
};
