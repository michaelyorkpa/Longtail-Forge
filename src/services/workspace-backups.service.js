import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";
import { createOpaqueId } from "../core/identifiers.js";
import { appVersion } from "../core/version.js";
import { workspaceBackupExportsRepository } from "../repositories/workspace-backup-exports.repo.js";
import { workspacesRepository } from "../repositories/workspaces.repo.js";
import { auditService } from "./audit.service.js";
import { filesService } from "./files.service.js";
import { permissionsService } from "./permissions.service.js";
import { createWorkspaceBackupPackage } from "./workspace-backup-package.js";
import { AppError } from "../utils/app-error.js";
import { assertPublicDemoCapabilityAllowed } from "../core/public-demo-enforcement.js";

/** @typedef {import("../types/http-contracts.js").WorkspaceRequestSession & { display_name?: string | null }} WorkspaceBackupSession */
/** @typedef {import("../repositories/workspaces.repo.js").WorkspaceRow} WorkspaceRow */
/** @typedef {import("../repositories/workspace-backup-exports.repo.js").WorkspaceBackupExport} WorkspaceBackupExport */
/** @typedef {Omit<WorkspaceBackupExport, "createdByName" | "status"> & { createdByName?: string, status?: string }} WorkspaceBackupReceipt */

/** @param {WorkspaceBackupSession} session */
async function create(session) {
  assertPublicDemoCapabilityAllowed("backups.workspace");
  await assertCanManageWorkspaceBackup(session);
  const workspace = await workspacesRepository.readById(session.workspace_id);
  if (!workspace) throw new AppError("Workspace not found.", 404);
  const backupId = createOpaqueId();
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
      readFileObject: async (/** @type {{ providerId: string, storageKey: string }} */ { providerId, storageKey }) => filesService.getFileStorageAdapter(providerId).read(storageKey),
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

/** @param {WorkspaceBackupSession} session */
async function readLatest(session) {
  assertPublicDemoCapabilityAllowed("backups.workspace");
  await assertCanManageWorkspaceBackup(session);
  const workspace = await workspacesRepository.readById(session.workspace_id);
  if (!workspace) throw new AppError("Workspace not found.", 404);
  const receipt = await workspaceBackupExportsRepository.readLatest(session.workspace_id);
  return receipt ? toBrowserReceipt(receipt, workspace) : null;
}

/** @param {string} workspaceId */
async function purgeWorkspaceBackupArtifacts(workspaceId) {
  const root = path.resolve(config.workspaceBackups.root);
  const target = path.resolve(root, safeSegment(workspaceId));
  const relative = path.relative(root, target);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Workspace backup cleanup target escaped the protected backup root.");
  }
  await fs.rm(target, { force: true, recursive: true });
}

/** @param {WorkspaceBackupSession} session */
async function assertCanManageWorkspaceBackup(session) {
  if (!await permissionsService.isWorkspaceAdministrator(session)) {
    throw new AppError("Only a Workspace Administrator or Super Admin may create workspace backups.", 403);
  }
}

/** @param {WorkspaceBackupReceipt} receipt @param {WorkspaceRow} workspace */
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

/** @param {WorkspaceBackupSession} session @param {WorkspaceRow} workspace @param {string} action @param {Record<string, unknown>} metadata */
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

/** @param {unknown} value */
function safeSegment(value) {
  return String(value || "").trim().replace(/[^A-Za-z0-9._-]+/g, "-") || "workspace";
}

/**
 * @param {string | number | Date} value
 */
function formatUtcLabel(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().replace("T", " ").replace(".000Z", " UTC");
}

/**
 * @param {unknown} error
 */
function classifyFailure(error) {
  const message = error instanceof Error ? error.message : String(error || "");
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
