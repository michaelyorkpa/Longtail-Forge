import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";
import { appVersion } from "../core/version.js";
import { workspaceBackupExportsRepository } from "../repositories/workspace-backup-exports.repo.js";
import { workspacesRepository } from "../repositories/workspaces.repo.js";
import { auditService } from "./audit.service.js";
import { filesService } from "./files.service.js";
import { permissionsService } from "./permissions.service.js";
import { createWorkspaceBackupPackage } from "./workspace-backup-package.js";
import { AppError } from "../utils/app-error.js";

async function create(session) {
  await assertCanManageWorkspaceBackup(session);
  const workspace = await workspacesRepository.readById(session.workspace_id);
  if (!workspace) throw new AppError("Workspace not found.", 404);
  const backupId = randomUUID();
  const archiveFilename = `${backupId}.ltfworkspace.tgz`;
  const outputPath = path.join(config.workspaceBackups.root, safeSegment(session.workspace_id), archiveFilename);

  await recordBackupAudit(session, workspace, "workspace_backup_requested", {
    backup_id: backupId,
    outcome: "requested",
  });

  try {
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    const result = await createWorkspaceBackupPackage({
      appVersion,
      backupId,
      databaseFile: config.databaseFile,
      outputPath,
      readFileObject: async ({ providerId, storageKey }) => filesService.getFileStorageAdapter(providerId).read(storageKey),
      workspaceId: session.workspace_id,
    });
    const receipt = {
      appVersion,
      archiveFilename,
      archiveSha256: result.archiveSha256,
      backupId,
      createdAt: result.manifest.createdAt,
      createdByUserId: session.user_id,
      fileObjectBytes: result.manifest.storage.objectBytes,
      fileObjectCount: result.manifest.storage.objectCount,
      secureNotesRecoveryRequired: result.manifest.secureNotes.recoveryPrerequisiteRequired,
      workspaceId: session.workspace_id,
    };
    await workspaceBackupExportsRepository.create(receipt);
    await recordBackupAudit(session, workspace, "workspace_backup_created", {
      archive_sha256: receipt.archiveSha256,
      backup_id: backupId,
      file_object_bytes: receipt.fileObjectBytes,
      file_object_count: receipt.fileObjectCount,
      outcome: "success",
      secure_notes_recovery_required: receipt.secureNotesRecoveryRequired,
    });
    return toBrowserReceipt({ ...receipt, createdByName: session.display_name || session.username }, workspace);
  } catch (error) {
    await recordBackupAudit(session, workspace, "workspace_backup_failed", {
      backup_id: backupId,
      outcome: "failure",
      reason_class: classifyFailure(error),
    }).catch(() => {});
    throw error;
  }
}

async function readLatest(session) {
  await assertCanManageWorkspaceBackup(session);
  const workspace = await workspacesRepository.readById(session.workspace_id);
  if (!workspace) throw new AppError("Workspace not found.", 404);
  const receipt = await workspaceBackupExportsRepository.readLatest(session.workspace_id);
  return receipt ? toBrowserReceipt(receipt, workspace) : null;
}

async function purgeWorkspaceBackupArtifacts(workspaceId) {
  const root = path.resolve(config.workspaceBackups.root);
  const target = path.resolve(root, safeSegment(workspaceId));
  const relative = path.relative(root, target);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Workspace backup cleanup target escaped the protected backup root.");
  }
  await fs.rm(target, { force: true, recursive: true });
}

async function assertCanManageWorkspaceBackup(session) {
  if (!await permissionsService.isWorkspaceAdministrator(session)) {
    throw new AppError("Only a Workspace Administrator or Super Admin may create workspace backups.", 403);
  }
}

function toBrowserReceipt(receipt, workspace) {
  return {
    appVersion: receipt.appVersion,
    archiveSha256: receipt.archiveSha256,
    createdAt: receipt.createdAt,
    createdByName: receipt.createdByName || "Workspace administrator",
    fileObjectBytes: Number(receipt.fileObjectBytes) || 0,
    fileObjectCount: Number(receipt.fileObjectCount) || 0,
    packageLabel: `Workspace backup created ${formatUtcLabel(receipt.createdAt)}`,
    secureNotesKeyIncluded: false,
    secureNotesRecoveryRequired: Boolean(receipt.secureNotesRecoveryRequired),
    status: "created",
    workspaceName: workspace.workspace_name,
  };
}

async function recordBackupAudit(session, workspace, action, metadata) {
  return auditService.record({
    session,
    action,
    changeType: action === "workspace_backup_failed" ? "security" : "create",
    recordType: "workspace",
    recordId: session.workspace_id,
    recordLabel: workspace.workspace_name,
    recordUrl: "workspace-settings.html",
    metadata,
    force: true,
  });
}

function safeSegment(value) {
  return String(value || "").trim().replace(/[^A-Za-z0-9._-]+/g, "-") || "workspace";
}

function formatUtcLabel(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().replace("T", " ").replace(".000Z", " UTC");
}

function classifyFailure(error) {
  const message = String(error?.message || "");
  if (/permission|administrator/i.test(message)) return "authorization";
  if (/checksum|integrity|foreign.key/i.test(message)) return "integrity_validation";
  if (/Files object|storage|provider/i.test(message)) return "storage_validation";
  if (/archive|path|tar|output/i.test(message)) return "archive_validation";
  return "operation_failed";
}

export const workspaceBackupsService = {
  create,
  purgeWorkspaceBackupArtifacts,
  readLatest,
};
