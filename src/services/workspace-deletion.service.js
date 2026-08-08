import { workspaceBackupExportsRepository } from "../repositories/workspace-backup-exports.repo.js";
import { workspaceDeletionLifecycleRepository } from "../repositories/workspace-deletion-lifecycle.repo.js";
import { workspacesRepository } from "../repositories/workspaces.repo.js";
import { auditService } from "./audit.service.js";
import { permissionsService } from "./permissions.service.js";
import { AppError } from "../utils/app-error.js";
import { assertPublicDemoCapabilityAllowed } from "../core/public-demo-enforcement.js";

const DELETION_GRACE_DAYS = 30;
const RECENT_BACKUP_WINDOW_HOURS = 24;
const NO_CURRENT_BACKUP_ACKNOWLEDGEMENT = "DELETE WITHOUT CURRENT BACKUP";

async function read(session) {
  assertPublicDemoCapabilityAllowed("administration.workspace_lifecycle");
  await assertCanManageWorkspaceDeletion(session);
  const workspace = await requireWorkspace(session.workspace_id);
  const [lifecycle, latestBackup] = await Promise.all([
    workspaceDeletionLifecycleRepository.read(session.workspace_id),
    workspaceBackupExportsRepository.readLatest(session.workspace_id),
  ]);
  return toBrowserState({ lifecycle, latestBackup, workspace });
}

async function request(payload, session, options = {}) {
  assertPublicDemoCapabilityAllowed("administration.workspace_lifecycle");
  await assertCanManageWorkspaceDeletion(session);
  const workspace = await requireWorkspace(session.workspace_id);
  const existing = await workspaceDeletionLifecycleRepository.read(session.workspace_id);
  if (existing) {
    throw new AppError("Workspace deletion is already pending.", 409);
  }
  if (String(payload?.workspaceName || "").trim() !== workspace.workspace_name) {
    throw new AppError("Type the workspace name exactly to schedule deletion.", 400);
  }

  const now = readNow(options.now);
  const latestBackup = await workspaceBackupExportsRepository.readLatest(session.workspace_id);
  const recentBackup = isRecentBackup(latestBackup, now);
  if (!recentBackup && String(payload?.acknowledgement || "").trim() !== NO_CURRENT_BACKUP_ACKNOWLEDGEMENT) {
    throw new AppError(`Type '${NO_CURRENT_BACKUP_ACKNOWLEDGEMENT}' to continue without a current workspace backup.`, 400);
  }

  const requestedAt = now.toISOString();
  const purgeAfter = new Date(now.getTime() + DELETION_GRACE_DAYS * 24 * 60 * 60 * 1000).toISOString();
  await workspaceDeletionLifecycleRepository.create({
    backupId: recentBackup?.backupId || null,
    noCurrentBackupAcknowledged: !recentBackup,
    purgeAfter,
    requestedAt,
    requestedByUserId: session.user_id,
    workspaceId: session.workspace_id,
  });
  const lifecycle = await workspaceDeletionLifecycleRepository.read(session.workspace_id);
  await recordLifecycleAudit(session, workspace, "workspace_deletion_requested", "delete", {
    backup_requirement: recentBackup ? "recent_backup" : "typed_no_current_backup_acknowledgement",
    purge_after: purgeAfter,
  });
  return toBrowserState({ lifecycle, latestBackup, workspace });
}

async function cancel(session, options = {}) {
  assertPublicDemoCapabilityAllowed("administration.workspace_lifecycle");
  await assertCanManageWorkspaceDeletion(session);
  const workspace = await requireWorkspace(session.workspace_id);
  const lifecycle = await workspaceDeletionLifecycleRepository.read(session.workspace_id);
  if (!lifecycle) {
    throw new AppError("Workspace deletion is not pending.", 409);
  }
  if (lifecycle.status === "purging") {
    throw new AppError("Workspace purge has begun and can no longer be canceled.", 409);
  }
  const now = readNow(options.now);
  if (now.getTime() >= new Date(lifecycle.purgeAfter).getTime()) {
    throw new AppError("The 30-day cancellation period has ended.", 409);
  }
  await workspaceDeletionLifecycleRepository.remove(session.workspace_id);
  await recordLifecycleAudit(session, workspace, "workspace_deletion_canceled", "restore", {
    canceled_at: now.toISOString(),
    originally_requested_at: lifecycle.requestedAt,
    purge_after: lifecycle.purgeAfter,
  });
  return toBrowserState({
    lifecycle: null,
    latestBackup: await workspaceBackupExportsRepository.readLatest(session.workspace_id),
    workspace,
  });
}

async function readBootstrapState(workspaceId) {
  const lifecycle = await workspaceDeletionLifecycleRepository.read(workspaceId);
  return lifecycle ? toLifecycleSummary(lifecycle) : null;
}

async function assertCanManageWorkspaceDeletion(session) {
  if (!await permissionsService.isWorkspaceAdministrator(session)) {
    throw new AppError("Only a Workspace Administrator or Super Admin may manage workspace deletion.", 403);
  }
}

async function requireWorkspace(workspaceId) {
  const workspace = await workspacesRepository.readById(workspaceId);
  if (!workspace) throw new AppError("Workspace not found.", 404);
  return workspace;
}

function toBrowserState({ lifecycle, latestBackup, workspace }) {
  const recentBackup = isRecentBackup(latestBackup, new Date());
  return {
    acknowledgementPhrase: recentBackup ? null : NO_CURRENT_BACKUP_ACKNOWLEDGEMENT,
    backup: {
      current: Boolean(recentBackup),
      createdAt: latestBackup?.createdAt || null,
      createdByName: latestBackup?.createdByName || null,
      requirement: recentBackup ? "recent_backup" : "typed_acknowledgement_required",
      windowHours: RECENT_BACKUP_WINDOW_HOURS,
    },
    lifecycle: lifecycle ? toLifecycleSummary(lifecycle) : null,
    pending: Boolean(lifecycle),
    workspaceName: workspace.workspace_name,
  };
}

function toLifecycleSummary(lifecycle) {
  return {
    backupProtected: Boolean(lifecycle.backupId),
    noCurrentBackupAcknowledged: lifecycle.noCurrentBackupAcknowledged,
    purgeAfter: lifecycle.purgeAfter,
    requestedAt: lifecycle.requestedAt,
    requestedByName: lifecycle.requestedByName,
    status: lifecycle.status || "pending_deletion",
  };
}

function isRecentBackup(receipt, now) {
  if (!receipt?.createdAt) return null;
  const createdAt = new Date(receipt.createdAt);
  const age = now.getTime() - createdAt.getTime();
  return Number.isFinite(age) && age >= 0 && age <= RECENT_BACKUP_WINDOW_HOURS * 60 * 60 * 1000 ? receipt : null;
}

function readNow(value) {
  const now = value instanceof Date ? value : new Date();
  if (Number.isNaN(now.getTime())) throw new AppError("A valid deletion request time is required.", 500);
  return now;
}

async function recordLifecycleAudit(session, workspace, action, changeType, metadata) {
  return auditService.record({
    session,
    action,
    changeType,
    recordType: "workspace",
    recordId: session.workspace_id,
    recordLabel: workspace.workspace_name,
    recordUrl: "workspace-settings.html",
    metadata,
    force: true,
  });
}

export const workspaceDeletionService = {
  cancel,
  read,
  readBootstrapState,
  request,
};

export {
  DELETION_GRACE_DAYS,
  NO_CURRENT_BACKUP_ACKNOWLEDGEMENT,
  RECENT_BACKUP_WINDOW_HOURS,
};
