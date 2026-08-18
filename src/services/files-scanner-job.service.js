import { FILE_SCAN_STATUS_SET, FILE_STATUS_SET } from "../core/files/file-lifecycle.js";
import {
  createClamdFileScannerAdapter,
  createClamscanFileScannerAdapter,
  createNoneFileScannerAdapter,
  createNoopFileScannerAdapter,
} from "../core/files/scanner-adapter.js";
import { enqueueJob } from "../core/jobs/job-queue.js";
import { getJobHandler, registerJobHandler } from "../core/jobs/index.js";
import { config } from "../config.js";
import { AppError } from "../utils/app-error.js";

/** @typedef {import("../types/files-scanner-job-contracts.js").FileScannerAdapter} FileScannerAdapter */
/** @typedef {import("../types/files-scanner-job-contracts.js").FileScannerDisposition} FileScannerDisposition */
/** @typedef {import("../types/files-scanner-job-contracts.js").FileScannerJobContext} FileScannerJobContext */
/** @typedef {import("../types/files-scanner-job-contracts.js").FileScannerJobSession} FileScannerJobSession */
/** @typedef {import("../types/files-scanner-job-contracts.js").FileScannerMode} FileScannerMode */
/** @typedef {import("../types/files-scanner-job-contracts.js").FileScannerQueueOptions} FileScannerQueueOptions */
/** @typedef {import("../types/files-scanner-job-contracts.js").FileScannerResult} FileScannerResult */
/** @typedef {import("../types/files-scanner-job-contracts.js").FilesScannerJobDependencies} FilesScannerJobDependencies */
/** @typedef {import("../types/files-scanner-job-contracts.js").FilesScannerJobFile} FilesScannerJobFile */
/** @typedef {import("../types/http-contracts.js").WorkspaceRequestSession} FileSession */

export const FILE_SCAN_JOB_TYPE = "file.scan";
const FILE_SCAN_JOB_PRIORITY = 10;
/** @type {Set<FileScannerMode>} */
const FILE_SCANNER_MODES = new Set(["none", "noop", "clamd", "clamscan"]);
/** @type {Map<FileScannerMode, FileScannerAdapter>} */
const scannerAdapters = new Map([
  ["clamd", /** @type {FileScannerAdapter} */ (createClamdFileScannerAdapter({ host: config.scanner?.clamdHost, port: config.scanner?.clamdPort }))],
  ["clamscan", /** @type {FileScannerAdapter} */ (createClamscanFileScannerAdapter({ executablePath: config.scanner?.clamscanPath }))],
  ["noop", /** @type {FileScannerAdapter} */ (createNoopFileScannerAdapter())],
]);
let fileScanJobHandlersRegistered = false;

/**
 * @param {string | FileScannerAdapter} modeOrAdapter
 * @param {FileScannerAdapter | null} [maybeAdapter]
 */
function registerFileScannerAdapter(modeOrAdapter, maybeAdapter = null) {
  const adapter = maybeAdapter || (typeof modeOrAdapter === "string" ? null : modeOrAdapter);
  if (!adapter) {
    throw new TypeError("File scanner adapter is required.");
  }
  const scannerMode = maybeAdapter
    ? normalizeFileScannerMode(String(modeOrAdapter))
    : normalizeFileScannerMode(adapter.id || "");

  if (scannerMode === "none") {
    throw new TypeError("The 'none' file scanner mode is built in and cannot be replaced.");
  }
  if (typeof adapter.scan !== "function") {
    throw new TypeError(`File scanner adapter '${scannerMode}' must implement scan().`);
  }

  scannerAdapters.set(scannerMode, adapter);
  return scannerMode;
}

/** @param {{required?: boolean, scannerMode?: string}} [options] */
async function assertConfiguredFileScannerReady(options = {}) {
  const required = options.required ?? (
    config.environment === "production" && config.security?.allowUnscannedUploads !== true
  );
  const scannerMode = options.scannerMode
    ? normalizeFileScannerMode(options.scannerMode)
    : normalizeFileScannerMode(config.scanner?.mode || "none");
  const adapter = getFileScannerAdapter(scannerMode);

  if (!required) {
    return { scannerMode, status: "not_required" };
  }

  let health;
  try {
    health = await adapter.health();
  } catch {
    throw new Error(fileScannerStartupError(scannerMode));
  }

  if (health.ok !== true && health.available !== true) {
    throw new Error(fileScannerStartupError(scannerMode));
  }

  return {
    scannerMode,
    status: sanitizeScannerStatus(health.status || "ok"),
  };
}

/** @param {FileScannerMode} scannerMode */
function fileScannerStartupError(scannerMode) {
  const safeMode = FILE_SCANNER_MODES.has(scannerMode) ? scannerMode : "unavailable";
  return `File scanner '${safeMode}' is not available at startup. Production uploads require a healthy clamd or clamscan scanner.`;
}

/** @param {FileScannerMode | string} [scannerMode] */
function getFileScannerAdapter(scannerMode = "none") {
  const normalizedMode = normalizeFileScannerMode(scannerMode || "none");

  if (normalizedMode === "none") {
    return /** @type {FileScannerAdapter} */ (createNoneFileScannerAdapter());
  }

  const adapter = scannerAdapters.get(normalizedMode);
  if (!adapter) {
    throw new AppError(`File scanner mode '${normalizedMode}' is not configured.`, 500);
  }

  return adapter;
}

function resolveConfiguredFileScannerAdapter() {
  const scannerMode = normalizeFileScannerMode(config.scanner?.mode || "none");
  return {
    adapter: getFileScannerAdapter(scannerMode),
    scannerMode,
  };
}

/** @param {string} value @returns {FileScannerMode} */
function normalizeFileScannerMode(value) {
  const scannerMode = String(value || "").trim();
  if (!FILE_SCANNER_MODES.has(/** @type {FileScannerMode} */ (scannerMode))) {
    throw new AppError(`File scanner mode '${scannerMode || "unknown"}' is not supported.`, 500);
  }
  return /** @type {FileScannerMode} */ (scannerMode);
}

/** @param {FilesScannerJobDependencies} dependencies @param {{replace?: boolean}} [options] */
function registerFileScanJobHandlers(dependencies, options = {}) {
  if (fileScanJobHandlersRegistered && !options.replace && getJobHandler(FILE_SCAN_JOB_TYPE)) {
    return;
  }

  registerJobHandler(FILE_SCAN_JOB_TYPE, (context) => handleFileScanJob(context, dependencies), {
    publicDemoCapability: "records.workspace",
    replace: true,
  });
  fileScanJobHandlersRegistered = true;
}

/** @param {FileSession} session @param {{file_id: string, workspace_id: string}} file @param {FileScannerQueueOptions} [options] */
async function queueFileScanJob(session, file, options = {}) {
  const workspaceId = normalizeRequiredText(file?.workspace_id || session?.workspace_id || options.workspaceId || options.workspace_id, "File scan job requires a workspace.");
  const fileId = normalizeRequiredText(file?.file_id || options.fileId || options.file_id, "File scan job requires a file.");
  const enqueued = await enqueueJob({
    availableAt: String(options.availableAt || options.available_at || new Date().toISOString()),
    dedupeKey: `file:scan:${workspaceId}:${fileId}`,
    jobType: FILE_SCAN_JOB_TYPE,
    maxAttempts: Number(options.maxAttempts || options.max_attempts || 3),
    priority: Number(options.priority ?? FILE_SCAN_JOB_PRIORITY),
    workspaceId,
    payload: {
      fileId,
      operation: "scan_file",
      requestedByUserId: normalizeOptionalText(session?.user_id || options.requestedByUserId || options.requested_by_user_id),
      source: normalizeOptionalText(options.source) || "files-service",
      workspaceId,
    },
  });

  return {
    ok: true,
    operation: "queue_file_scan",
    queued: enqueued?.action === "inserted" || enqueued?.action === "updated",
    deduped: enqueued?.action === "deduped_running",
    queueAction: enqueued?.action || "",
    job: enqueued?.job || null,
    jobId: enqueued?.job?.jobId || "",
    fileId,
    workspaceId,
  };
}

/** @param {FileScannerJobContext} context @param {FilesScannerJobDependencies} dependencies */
async function handleFileScanJob({ payload = {} }, dependencies) {
  const operation = normalizeOptionalText(payload.operation || "scan_file");
  if (operation !== "scan_file") {
    throw new Error(`Unknown file scan job operation "${operation}".`);
  }

  const workspaceId = normalizeRequiredText(payload.workspaceId || payload.workspace_id, "File scan job requires a workspace.");
  const fileId = normalizeRequiredText(payload.fileId || payload.file_id, "File scan job requires a file.");
  const file = await dependencies.readFile({ fileId, workspaceId });

  if (!file) {
    return { scanned: false, skipped: true, reason: "file_not_found", fileId, workspaceId };
  }
  if (file.status !== "pending" || file.scanStatus !== "pending") {
    return {
      scanned: false,
      skipped: true,
      reason: "file_not_pending_scan",
      fileId,
      scanStatus: file.scanStatus,
      status: file.status,
      workspaceId,
    };
  }

  const result = await scanFile(fileJobSession({
    userId: payload.requestedByUserId || payload.requested_by_user_id,
    workspaceId,
  }), file, dependencies);

  return { ...result, fileId, scanned: true, workspaceId };
}

/** @param {FileScannerJobSession} session @param {FilesScannerJobFile} file @param {FilesScannerJobDependencies} dependencies */
async function scanFile(session, file, dependencies) {
  await dependencies.emitLifecycleEvent("file.scan.pending", {
    session,
    fileId: file.fileId,
    status: "pending",
    scanStatus: "pending",
  });

  const scanner = resolveConfiguredFileScannerAdapter();
  const disposition = normalizeFileScanDisposition(await scanner.adapter.scan(createFileScanContext(file, scanner.scannerMode)));
  const now = new Date().toISOString();

  await dependencies.updateScanResult({
    fileId: file.fileId,
    fileStatus: disposition.status,
    quarantineReason: disposition.status === "quarantined" ? disposition.reason || "scan_failed" : null,
    scanStatus: disposition.scanStatus,
    updatedAt: now,
    workspaceId: session.workspace_id,
  });

  if (disposition.successfulScan) {
    await dependencies.emitLifecycleEvent("file.scan.passed", {
      session,
      fileId: file.fileId,
      status: disposition.status,
      scanStatus: disposition.scanStatus,
      metadata: disposition.metadata,
    });
    await dependencies.emitLifecycleEvent("file.available", {
      session,
      fileId: file.fileId,
      status: disposition.status,
      scanStatus: disposition.scanStatus,
    });
  } else if (disposition.scanStatus === "failed") {
    await dependencies.emitLifecycleEvent("file.scan.failed", {
      session,
      fileId: file.fileId,
      status: disposition.status,
      scanStatus: disposition.scanStatus,
      reason: disposition.reason,
      metadata: disposition.metadata,
    });
    await dependencies.emitLifecycleEvent("file.quarantined", {
      session,
      fileId: file.fileId,
      status: disposition.status,
      scanStatus: disposition.scanStatus,
      reason: disposition.reason,
    });
  } else {
    await dependencies.emitLifecycleEvent("file.scan.failed", {
      session,
      fileId: file.fileId,
      status: disposition.status,
      scanStatus: disposition.scanStatus,
      reason: disposition.reason || "scan_error",
      metadata: disposition.metadata,
    });
  }

  if (disposition.status === "quarantined" || !["not_required", "passed"].includes(disposition.scanStatus)) {
    await dependencies.recordAudit(session, {
      action: disposition.status === "quarantined" ? "file.quarantined" : "file.scan_failed",
      changeType: "update",
      recordId: file.fileId,
      recordLabel: file.displayName,
      metadata: {
        reason: disposition.reason,
        scan_status: disposition.scanStatus,
        scanner: safeScannerMetadataValue(disposition.metadata.scanner),
      },
    });
  }

  return { scanStatus: disposition.scanStatus, status: disposition.status };
}

/** @param {FilesScannerJobFile} file @param {FileScannerMode} scannerMode */
function createFileScanContext(file, scannerMode) {
  return {
    displayName: file.displayName,
    extension: file.extension,
    fileId: file.fileId,
    fileSizeBytes: file.fileSizeBytes,
    mimeTypeClaimed: file.mimeTypeClaimed,
    mimeTypeDetected: file.mimeTypeDetected,
    originalFilename: file.originalFilename,
    scannerMode,
    storageProvider: file.storageProvider,
    workspaceId: file.workspaceId,
    openReadStream: file.openReadStream,
  };
}

/** @param {FileScannerResult} result @returns {FileScannerDisposition} */
function normalizeFileScanDisposition(result) {
  const scanStatus = FILE_SCAN_STATUS_SET.has(result.scanStatus) ? result.scanStatus : "error";
  const status = FILE_STATUS_SET.has(result.status) ? result.status : "quarantined";
  return {
    metadata: sanitizeScannerMetadata(result.metadata),
    reason: normalizeOptionalText(result.reason, { maxLength: 250 }),
    scanStatus,
    status,
    successfulScan: status === "available" && ["not_required", "passed"].includes(scanStatus),
  };
}

/** @param {{userId?: unknown, workspaceId?: unknown}} [context] @returns {FileScannerJobSession} */
function fileJobSession({ userId = "", workspaceId = "" } = {}) {
  const normalizedWorkspaceId = normalizeOptionalText(workspaceId);
  return {
    active_workspace_id: normalizedWorkspaceId,
    home_workspace_id: normalizedWorkspaceId,
    ip_address: "",
    password_change_required: false,
    role: "system",
    session_mode: "normal",
    timezone: "UTC",
    user_id: normalizeOptionalText(userId),
    username: "Job Worker",
    workspace_id: normalizedWorkspaceId,
  };
}

/** @param {unknown} value @param {string} message */
function normalizeRequiredText(value, message) {
  const text = normalizeOptionalText(value);
  if (!text) {
    throw new AppError(message, 400);
  }
  return text;
}

/** @param {unknown} value @param {{maxLength?: number}} [options] */
function normalizeOptionalText(value, options = {}) {
  if (value === null || value === undefined) {
    return "";
  }
  const text = String(value).trim();
  return options.maxLength ? text.slice(0, options.maxLength) : text;
}

/** @param {unknown} value */
function sanitizeScannerStatus(value) {
  return String(value || "unavailable")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "_")
    .slice(0, 80) || "unavailable";
}

/** @param {unknown} value */
function safeScannerMetadataValue(value) {
  const candidate = normalizeOptionalText(value, { maxLength: 40 }).toLowerCase();
  return FILE_SCANNER_MODES.has(/** @type {FileScannerMode} */ (candidate)) ? candidate : "unavailable";
}

/** @param {unknown} value */
function sanitizeScannerMetadata(value) {
  const source = value && typeof value === "object" && !Array.isArray(value)
    ? /** @type {Record<string, unknown>} */ (value)
    : {};
  const scanner = safeScannerMetadataValue(source.scanner);
  const result = normalizeOptionalText(source.result, { maxLength: 40 }).toLowerCase();
  const exitCode = Number(source.exitCode);

  return {
    scanner,
    ...(["clean", "infected", "timeout", "unavailable"].includes(result) ? { result } : {}),
    ...(Number.isInteger(exitCode) && exitCode >= -255 && exitCode <= 255 ? { exitCode } : {}),
  };
}

export const filesScannerJobService = {
  assertConfiguredFileScannerReady,
  getFileScannerAdapter,
  handleFileScanJob,
  queueFileScanJob,
  registerFileScanJobHandlers,
  registerFileScannerAdapter,
  resolveConfiguredFileScannerAdapter,
};

export {
  createFileScanContext,
  fileJobSession,
  normalizeFileScanDisposition,
  sanitizeScannerMetadata,
};
