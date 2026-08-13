import { createHash } from "node:crypto";
import { enqueueJob } from "../core/jobs/job-queue.js";
import { getJobHandler, registerJobHandler } from "../core/jobs/index.js";
import { db } from "../core/database.js";
import { createOpaqueId, createRecordId } from "../core/identifiers.js";
import { WORKSPACE_PURGE_JOB_TYPE } from "../core/jobs/job-types.js";
import { workspaceDeletionLifecycleRepository } from "../repositories/workspace-deletion-lifecycle.repo.js";
import { workspacePurgeRepository } from "../repositories/workspace-purge.repo.js";
import { filesService } from "./files.service.js";
import { workspaceBackupsService } from "./workspace-backups.service.js";
import { AppError } from "../utils/app-error.js";

const WORKSPACE_PURGE_JOB_PRIORITY = 1000;
const WORKSPACE_PURGE_MAX_ATTEMPTS = 10;
let workspacePurgeHandlerRegistered = false;

/** @typedef {import("../types/framework-contracts.js").JobHandlerContext} JobHandlerContext */
/** @typedef {{ job: Pick<import("../types/framework-contracts.js").JobExecutionRecord, "jobId" | "workspaceId"> & Partial<import("../types/framework-contracts.js").JobExecutionRecord>, payload?: Record<string, unknown> }} WorkspacePurgeJobContext */
/** @typedef {import("../repositories/workspace-purge.repo.js").WorkspacePurgeTombstone} WorkspacePurgeTombstone */
/** @typedef {{ replace?: boolean }} WorkspacePurgeRegistrationOptions */
/** @typedef {{ workspaceId?: unknown, workspace_id?: unknown, now?: unknown, source?: unknown }} QueueWorkspacePurgeOptions */
/** @typedef {{ afterFence?: (context: { workspaceId: string }) => unknown | Promise<unknown>, afterStorage?: (context: { files: { deletedBytes: number, deletedCount: number }, workspaceId: string }) => unknown | Promise<unknown> }} WorkspacePurgeHooks */
/** @typedef {{ workspaceId?: unknown, now?: unknown, purgeJobId?: unknown, hooks?: WorkspacePurgeHooks }} WorkspacePurgeOptions */

/** @param {WorkspacePurgeRegistrationOptions} [options] */
function registerWorkspacePurgeJobHandlers(options = {}) {
  if (workspacePurgeHandlerRegistered && !options.replace && getJobHandler(WORKSPACE_PURGE_JOB_TYPE)) return;
  registerJobHandler(WORKSPACE_PURGE_JOB_TYPE, handleWorkspacePurgeJob, { publicDemoCapability: "administration.workspace_lifecycle", replace: true });
  workspacePurgeHandlerRegistered = true;
}

/** @param {QueueWorkspacePurgeOptions} [options] */
async function queueWorkspacePurge(options = {}) {
  const workspaceId = normalizeWorkspaceId(options.workspaceId || options.workspace_id);
  const now = normalizeDate(options.now).toISOString();
  const workspaceFingerprint = fingerprintWorkspaceId(workspaceId);
  const tombstone = await workspacePurgeRepository.readTombstone(workspaceFingerprint);
  if (tombstone?.status === "complete") {
    return { alreadyComplete: true, queued: false, status: "complete" };
  }

  const lifecycle = await workspaceDeletionLifecycleRepository.read(workspaceId);
  if (!lifecycle) throw new AppError("Workspace has no pending deletion lifecycle.", 409);
  if (new Date(now).getTime() < new Date(lifecycle.purgeAfter).getTime()) {
    throw new AppError("Workspace deletion grace period has not ended.", 409);
  }

  const enqueued = await enqueueJob({
    availableAt: now,
    dedupeKey: `workspace:purge:${workspaceId}`,
    jobType: WORKSPACE_PURGE_JOB_TYPE,
    maxAttempts: WORKSPACE_PURGE_MAX_ATTEMPTS,
    payload: {
      operation: "purge_workspace",
      source: String(options.source || "operator-maintenance").trim(),
      workspaceId,
    },
    priority: WORKSPACE_PURGE_JOB_PRIORITY,
    workspaceId,
  });
  return {
    alreadyComplete: false,
    jobId: enqueued?.job?.jobId || "",
    queueAction: enqueued?.action || "",
    queued: ["inserted", "updated", "deduped_running"].includes(enqueued?.action),
    status: lifecycle.status || "pending_deletion",
  };
}

/** @param {WorkspacePurgeJobContext} context @param {{ hooks?: WorkspacePurgeHooks, now?: unknown }} [options] */
async function handleWorkspacePurgeJob({ job, payload = {} }, options = {}) {
  const workspaceId = normalizeWorkspaceId(payload.workspaceId || job?.workspaceId);
  if (workspaceId !== job?.workspaceId) throw new Error("Workspace purge job scope does not match its payload.");
  return purgeWorkspace({
    hooks: options.hooks,
    now: options.now,
    purgeJobId: job.jobId,
    workspaceId,
  });
}

/** @param {WorkspacePurgeOptions} [options] */
async function purgeWorkspace(options = {}) {
  const workspaceId = normalizeWorkspaceId(options.workspaceId);
  const workspaceFingerprint = fingerprintWorkspaceId(workspaceId);
  const now = normalizeDate(options.now).toISOString();
  const completed = await workspacePurgeRepository.readTombstone(workspaceFingerprint);
  if (completed?.status === "complete") return shapeCompletedTombstone(completed, true);

  const fence = await workspacePurgeRepository.beginFence({
    now,
    purgeJobId: String(options.purgeJobId || "").trim(),
    purgeToken: createOpaqueId(),
    purgeTombstoneId: createRecordId(),
    workspaceFingerprint,
    workspaceId,
  });
  if (fence.alreadyComplete) {
    return shapeCompletedTombstone(await workspacePurgeRepository.readTombstone(workspaceFingerprint), true);
  }
  if (fence.tooEarly) throw new AppError("Workspace deletion grace period has not ended.", 409);
  if (fence.missingLifecycle) throw new AppError("Workspace purge lifecycle is unavailable.", 409);

  try {
    if (Number(fence.runningWorkspaceJobs) > 0) {
      throw new Error("Workspace workers are still draining behind the purge fence.");
    }
    await options.hooks?.afterFence?.({ workspaceId });
    if (!fence.purgeToken) {
      throw new AppError("Workspace purge lifecycle is unavailable.", 409);
    }
    const finalized = await workspacePurgeRepository.finalize({
      now: new Date().toISOString(),
      prepareArtifacts: async (transaction) => {
        const files = await filesService.purgeWorkspaceStorageObjects(workspaceId, transaction);
        await workspaceBackupsService.purgeWorkspaceBackupArtifacts(workspaceId);
        await options.hooks?.afterStorage?.({ files, workspaceId });
        return {
          fileObjectBytes: files.deletedBytes,
          fileObjectCount: files.deletedCount,
        };
      },
      purgeToken: fence.purgeToken,
      workspaceFingerprint,
      workspaceId,
    });
    const integrity = await db.query(db.dialect.introspection.integrityCheck());
    if (integrity.length !== 1 || integrity[0].integrity_check !== "ok") {
      throw new Error("Workspace purge completed but database integrity verification failed.");
    }
    const tombstone = await workspacePurgeRepository.readTombstone(workspaceFingerprint);
    return shapeCompletedTombstone(tombstone, finalized.alreadyComplete);
  } catch (error) {
    await workspacePurgeRepository.markFailure(
      workspaceFingerprint,
      classifyPurgeFailure(error),
      new Date().toISOString(),
    ).catch(() => {});
    throw error;
  }
}

/**
 * @param {WorkspacePurgeTombstone | null} tombstone
 * @param {boolean} alreadyComplete
 */
function shapeCompletedTombstone(tombstone, alreadyComplete) {
  return {
    alreadyComplete: Boolean(alreadyComplete),
    attemptCount: Number(tombstone?.attempt_count) || 0,
    databaseRowCount: Number(tombstone?.database_row_count) || 0,
    fileObjectBytes: Number(tombstone?.file_object_bytes) || 0,
    fileObjectCount: Number(tombstone?.file_object_count) || 0,
    purgedAt: tombstone?.purged_at || null,
    status: tombstone?.status || "complete",
  };
}

/**
 * @param {string} workspaceId
 */
function fingerprintWorkspaceId(workspaceId) {
  return createHash("sha256").update(workspaceId, "utf8").digest("hex");
}

/** @param {unknown} value */
function normalizeWorkspaceId(value) {
  const workspaceId = String(value || "").trim();
  if (!workspaceId) throw new AppError("Workspace purge requires a workspace ID.", 400);
  return workspaceId;
}

/**
 * @param {unknown} value
 */
function normalizeDate(value) {
  const date = value instanceof Date
    ? value
    : typeof value === "string" || typeof value === "number"
      ? new Date(value)
      : new Date();
  if (Number.isNaN(date.getTime())) throw new AppError("Workspace purge requires a valid time.", 400);
  return date;
}

/**
 * @param {unknown} error
 */
function classifyPurgeFailure(error) {
  const message = error instanceof Error ? error.message : String(error || "");
  if (/workers are still draining/i.test(message)) return "worker_drain_pending";
  if (/grace period|lifecycle|fence/i.test(message)) return "lifecycle_refusal";
  if (/storage|file|object|backup/i.test(message)) return "artifact_cleanup_failed";
  if (/foreign-key|integrity/i.test(message)) return "integrity_validation_failed";
  return "purge_interrupted";
}

export const workspacePurgeService = {
  handleWorkspacePurgeJob,
  purgeWorkspace,
  queueWorkspacePurge,
  registerWorkspacePurgeJobHandlers,
};

export {
  WORKSPACE_PURGE_JOB_PRIORITY,
  WORKSPACE_PURGE_JOB_TYPE,
  fingerprintWorkspaceId,
};
