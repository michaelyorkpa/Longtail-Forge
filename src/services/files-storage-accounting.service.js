import { db } from "../core/database.js";
import { filesRepo } from "../repositories/files.repo.js";
import { AppError } from "../utils/app-error.js";

/** @typedef {import("../types/files-storage-accounting-contracts.js").ExternalStorageAccountingInput} ExternalStorageAccountingInput */
/** @typedef {import("../types/files-storage-accounting-contracts.js").FileUploadLimit} FileUploadLimit */
/** @typedef {import("../types/files-storage-accounting-contracts.js").StorageAccountingEntry} StorageAccountingEntry */
/** @typedef {import("../types/files-storage-accounting-contracts.js").StorageAccountingIdentity} StorageAccountingIdentity */
/** @typedef {import("../types/files-storage-accounting-contracts.js").StorageAccountingReadInput} StorageAccountingReadInput */
/** @typedef {import("../types/files-storage-accounting-contracts.js").StorageAccountingResult} StorageAccountingResult */
/** @typedef {import("../types/files-storage-accounting-contracts.js").StorageAccountingSummary} StorageAccountingSummary */
/** @typedef {import("../types/files-storage-accounting-contracts.js").StorageQuotaCheckInput} StorageQuotaCheckInput */
/** @typedef {import("../types/files-storage-accounting-contracts.js").StorageQuotaLimit} StorageQuotaLimit */
/** @typedef {import("../types/files-storage-accounting-contracts.js").StorageQuotaReadInput} StorageQuotaReadInput */
/** @typedef {import("../types/files-storage-accounting-contracts.js").StorageQuotaState} StorageQuotaState */
/** @typedef {import("../types/files-storage-accounting-contracts.js").StorageQuotaScope} StorageQuotaScope */
/** @typedef {import("../types/files-storage-accounting-contracts.js").StreamedUploadLimitInput} StreamedUploadLimitInput */
/** @typedef {import("../types/files-repository-contracts.js").StorageAccountingRow} StorageAccountingRow */

/** @param {string} workspaceId */
async function refreshStorageAccounting(workspaceId) {
  const calculatedAt = new Date().toISOString();

  await db.transaction(async (transaction) => {
    await filesRepo.replaceInternalStorageAccounting(transaction, workspaceId, calculatedAt);
  });
}

/** @param {StorageAccountingReadInput} input @returns {Promise<StorageAccountingResult>} */
async function readStorageAccounting(input) {
  await refreshStorageAccounting(input.workspaceId);
  const rows = await filesRepo.readStorageAccounting({
    storageKind: input.storageKind || "",
    workspaceId: input.workspaceId,
  });
  const entries = rows.map(shapeStorageAccountingRow);

  return {
    entries,
    totals: summarizeStorageAccounting(entries),
  };
}

/** @param {ExternalStorageAccountingInput} input */
async function recordExternalStorageAccounting(input) {
  const calculatedAt = new Date().toISOString();
  const accountingId = storageAccountingId({
    availabilityStatus: input.availabilityStatus,
    externalSourceProvider: input.sourceProvider,
    storageKind: "external",
    storageProvider: "external",
    userId: input.userId,
    workspaceId: input.workspaceId,
  });

  await filesRepo.upsertExternalStorageAccounting({
    accountingId,
    availabilityStatus: input.availabilityStatus,
    calculatedAt,
    externalReportedBytes: input.externalReportedBytes,
    fileCount: input.fileCount,
    sourceProvider: input.sourceProvider,
    userId: input.userId,
    workspaceId: input.workspaceId,
  });
}

/** @param {StorageQuotaCheckInput} input */
async function assertStorageQuotaAllowsUpload(input) {
  const quota = await readStorageQuotaState(input);

  if (!quota.limitsActive) {
    return;
  }

  if (quota.workspaceLimitBytes !== null && quota.workspaceBytes + input.uploadBytes > quota.workspaceLimitBytes) {
    throw storageQuotaExceededError("workspace");
  }

  if (quota.perUserLimitBytes !== null && quota.userBytes + input.uploadBytes > quota.perUserLimitBytes) {
    throw storageQuotaExceededError("user");
  }
}

/** @param {StreamedUploadLimitInput} input @returns {Promise<FileUploadLimit>} */
async function resolveStreamedUploadLimit(input) {
  const quotaLimit = await readStorageQuotaUploadLimit(input);
  const fileSizeLimit = /** @type {FileUploadLimit} */ ({
    exceededMessage: "Uploaded file exceeds the allowed size.",
    maxBytes: input.maxFileSizeBytes,
    statusCode: 413,
  });

  if (!quotaLimit || quotaLimit.remainingBytes >= input.maxFileSizeBytes) {
    return fileSizeLimit;
  }

  return {
    exceededMessage: storageQuotaExceededMessage(quotaLimit.scope),
    maxBytes: quotaLimit.remainingBytes,
    statusCode: 413,
  };
}

/** @param {StorageQuotaReadInput} input @returns {Promise<StorageQuotaLimit | null>} */
async function readStorageQuotaUploadLimit(input) {
  const quota = await readStorageQuotaState(input);

  if (!quota.limitsActive) {
    return null;
  }

  /** @type {StorageQuotaLimit[]} */
  const candidates = [];
  if (quota.workspaceLimitBytes !== null) {
    candidates.push({
      remainingBytes: Math.max(0, quota.workspaceLimitBytes - quota.workspaceBytes),
      scope: "workspace",
    });
  }
  if (quota.perUserLimitBytes !== null) {
    candidates.push({
      remainingBytes: Math.max(0, quota.perUserLimitBytes - quota.userBytes),
      scope: "user",
    });
  }

  return candidates.sort((left, right) => left.remainingBytes - right.remainingBytes)[0] || null;
}

/** @param {StorageQuotaReadInput} input @returns {Promise<StorageQuotaState>} */
async function readStorageQuotaState(input) {
  const workspaceLimitBytes = input.fileSettings.internalStorageLimitBytes;
  const perUserLimitBytes = input.fileSettings.perUserStorageLimitBytes;

  if (workspaceLimitBytes === null && perUserLimitBytes === null) {
    return {
      limitsActive: false,
      perUserLimitBytes,
      userBytes: 0,
      workspaceBytes: 0,
      workspaceLimitBytes,
    };
  }

  const row = await filesRepo.readInternalStorageQuotaUsage(input.workspaceId, input.userId);

  return {
    limitsActive: true,
    perUserLimitBytes,
    userBytes: Number(row?.user_bytes || 0),
    workspaceBytes: Number(row?.workspace_bytes || 0),
    workspaceLimitBytes,
  };
}

/** @param {StorageAccountingRow} row @returns {StorageAccountingEntry} */
function shapeStorageAccountingRow(row) {
  return {
    availabilityStatus: String(row.availability_status || ""),
    calculatedAt: String(row.calculated_at || ""),
    externalReportedBytes: Number(row.external_reported_bytes || 0),
    externalSourceProvider: String(row.external_source_provider || ""),
    fileCount: Number(row.file_count || 0),
    internalBytes: Number(row.internal_bytes || 0),
    storageAccountingId: String(row.storage_accounting_id || ""),
    storageKind: String(row.storage_kind || ""),
    storageProvider: String(row.storage_provider || ""),
    userId: String(row.user_id || ""),
    workspaceId: String(row.workspace_id || ""),
  };
}

/** @param {StorageAccountingEntry[]} [entries] @returns {StorageAccountingSummary} */
function summarizeStorageAccounting(entries = []) {
  return entries.reduce((totals, entry) => {
    totals.fileCount += entry.fileCount;
    totals.internalBytes += entry.internalBytes;
    totals.externalReportedBytes += entry.externalReportedBytes;
    if (entry.storageKind === "internal") {
      totals.internalFileCount += entry.fileCount;
    }
    if (entry.storageKind === "external") {
      totals.externalFileCount += entry.fileCount;
    }
    return totals;
  }, {
    externalFileCount: 0,
    externalReportedBytes: 0,
    fileCount: 0,
    internalBytes: 0,
    internalFileCount: 0,
  });
}

/** @param {StorageAccountingIdentity} scope */
function storageAccountingId(scope) {
  return [
    scope.workspaceId,
    scope.storageKind,
    scope.userId,
    scope.storageProvider,
    scope.externalSourceProvider,
    scope.availabilityStatus,
  ].map((value) => String(value || "")).join(":");
}

/** @param {StorageQuotaScope} scope */
function storageQuotaExceededError(scope) {
  return new AppError(storageQuotaExceededMessage(scope), 413);
}

/** @param {StorageQuotaScope} scope */
function storageQuotaExceededMessage(scope) {
  return scope === "workspace"
    ? "Upload would exceed the workspace storage quota."
    : "Upload would exceed your per-user storage quota.";
}

export const filesStorageAccountingService = {
  assertStorageQuotaAllowsUpload,
  readStorageAccounting,
  readStorageQuotaState,
  recordExternalStorageAccounting,
  refreshStorageAccounting,
  resolveStreamedUploadLimit,
};

export {
  shapeStorageAccountingRow,
  storageAccountingId,
  storageQuotaExceededMessage,
  summarizeStorageAccounting,
};
