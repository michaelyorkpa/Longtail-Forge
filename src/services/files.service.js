import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { modulesService } from "../core/modules/modules.service.js";
import {
  FILE_LIFECYCLE_EVENTS,
  FILE_SCAN_STATUS_SET,
  FILE_STATUS_SET,
  isFileLifecycleEvent,
  sanitizeFileLifecyclePayload,
} from "../core/files/file-lifecycle.js";
import { createLocalFileStorageAdapter } from "../core/files/local-storage-adapter.js";
import { createNoopFileScannerAdapter } from "../core/files/scanner-adapter.js";
import { querySql, runSql, sqlInteger, sqlNullableText, sqlText } from "../db/index.js";
import { permissionsService } from "./permissions.service.js";
import { auditService } from "./audit.service.js";
import { AppError } from "../utils/app-error.js";
import { notesService } from "../modules/notes/notes.service.js";
import { NOTE_SECURITY_MODES } from "../modules/notes/library.js";

const DEFAULT_MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const DEFAULT_ALLOWED_VISIBILITY = new Set(["private", "workspace", "client"]);
const DEFAULT_ATTACHMENT_LIMIT = 50;
const MAX_ATTACHMENT_LIMIT = 200;
const ATTACHMENT_SORT_MODES = new Set(["newest", "oldest", "filename", "size", "status"]);
const FILE_TYPE_POLICY_MODES = new Set(["safe_default", "allowlist", "blocklist"]);
const ALLOWED_EXTENSIONS = new Map([
  [".csv", { category: "spreadsheet", mime: "text/csv", risky: false }],
  [".doc", { category: "document", mime: "application/msword", risky: true }],
  [".docx", { category: "document", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", risky: true }],
  [".gif", { category: "image", mime: "image/gif", risky: false }],
  [".jpg", { category: "image", mime: "image/jpeg", risky: false }],
  [".jpeg", { category: "image", mime: "image/jpeg", risky: false }],
  [".md", { category: "text", mime: "text/markdown", risky: false }],
  [".pdf", { category: "pdf", mime: "application/pdf", risky: false }],
  [".png", { category: "image", mime: "image/png", risky: false }],
  [".ppt", { category: "presentation", mime: "application/vnd.ms-powerpoint", risky: true }],
  [".pptx", { category: "presentation", mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation", risky: true }],
  [".txt", { category: "text", mime: "text/plain", risky: false }],
  [".xls", { category: "spreadsheet", mime: "application/vnd.ms-excel", risky: true }],
  [".xlsx", { category: "spreadsheet", mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", risky: true }],
  [".zip", { category: "archive", mime: "application/zip", risky: true }],
]);
const DEFAULT_SAFE_ALLOWED_EXTENSIONS = Object.freeze([
  ".csv",
  ".doc",
  ".docx",
  ".gif",
  ".jpg",
  ".jpeg",
  ".md",
  ".pdf",
  ".png",
  ".ppt",
  ".pptx",
  ".txt",
  ".xls",
  ".xlsx",
]);
const DEFAULT_BLOCKED_EXTENSIONS = Object.freeze([
  ".exe",
  ".bat",
  ".cmd",
  ".com",
  ".msi",
  ".ps1",
  ".sh",
  ".js",
  ".vbs",
  ".jar",
  ".dll",
  ".zip",
  ".rar",
  ".7z",
  ".tar",
  ".gz",
]);

const storageAdapters = new Map([
  ["local", createLocalFileStorageAdapter()],
]);
let scannerAdapter = createNoopFileScannerAdapter();

function listFileStatuses() {
  return [...FILE_STATUS_SET];
}

function listScanStatuses() {
  return [...FILE_SCAN_STATUS_SET];
}

function listFileLifecycleEvents() {
  return [...FILE_LIFECYCLE_EVENTS];
}

function registerFileStorageAdapter(providerId, adapter) {
  const normalizedProviderId = String(providerId || "").trim();

  if (!normalizedProviderId) {
    throw new TypeError("File storage provider ID is required.");
  }

  for (const methodName of ["save", "read", "metadata", "delete", "health"]) {
    if (typeof adapter?.[methodName] !== "function") {
      throw new TypeError(`File storage adapter '${normalizedProviderId}' must implement ${methodName}().`);
    }
  }

  storageAdapters.set(normalizedProviderId, adapter);
  return normalizedProviderId;
}

function registerFileScannerAdapter(adapter) {
  if (typeof adapter?.scan !== "function") {
    throw new TypeError("File scanner adapter must implement scan().");
  }

  scannerAdapter = adapter;
  return adapter.id || "custom";
}

function getFileStorageAdapter(providerId = "local") {
  const normalizedProviderId = String(providerId || "local").trim();
  const adapter = storageAdapters.get(normalizedProviderId);

  if (!adapter) {
    throw new AppError(`File storage provider '${normalizedProviderId}' is not configured.`, 500);
  }

  return adapter;
}

function listAttachableTypes() {
  return modulesService.listAttachableTypes();
}

async function listActiveAttachableTypes(workspaceId) {
  return modulesService.listActiveAttachableTypes(workspaceId);
}

async function resolveAttachableType(workspaceId, moduleId, targetType) {
  const normalizedModuleId = String(moduleId || "").trim();
  const normalizedTargetType = String(targetType || "").trim();
  const attachableTypes = workspaceId
    ? await listActiveAttachableTypes(workspaceId)
    : listAttachableTypes();
  const attachableType = attachableTypes.find((candidate) => (
    candidate.moduleId === normalizedModuleId &&
    candidate.targetType === normalizedTargetType
  ));

  if (!attachableType) {
    throw new AppError("That record type is not registered for file attachments.", 400);
  }

  return attachableType;
}

async function uploadAndAttach(session, payload = {}) {
  await emitFileLifecycleEvent("file.upload.requested", {
    session,
    moduleId: payload.moduleId,
    targetType: payload.targetType,
    targetId: payload.targetId,
    status: "pending",
    scanStatus: "pending",
  });

  try {
    const attachableType = await resolveAttachableType(session.workspace_id, payload.moduleId, payload.targetType);
    const target = await readAttachableTarget(session.workspace_id, attachableType, payload.targetId);
    await assertCanUseAttachableTarget(session, attachableType, "upload", target);

    const fileSettings = await readWorkspaceFileSettingsForWorkspace(session.workspace_id);
    const prepared = prepareUpload(payload, attachableType, fileSettings);
    const storageAdapter = getFileStorageAdapter("local");
    const storage = await storageAdapter.save(prepared.buffer, { workspaceId: session.workspace_id });
    const file = await createFileRecord(session, {
      ...prepared,
      storageProvider: "local",
      storageKey: storage.storageKey,
      storedFilename: storage.storedFilename,
    });
    const scanResult = await scanFile(session, file);
    const attachment = await attachFile(session, {
      attachmentRole: payload.attachmentRole,
      caption: payload.caption,
      fileId: file.file_id,
      metadata: payload.attachmentMetadata,
      moduleId: attachableType.moduleId,
      sortOrder: payload.sortOrder,
      targetId: target.target_id,
      targetRecord: target,
      targetType: attachableType.targetType,
      visibility: payload.visibility,
    }, { attachableType });

    await emitFileLifecycleEvent("file.upload.accepted", {
      session,
      attachmentId: attachment.file_attachment_id,
      fileId: file.file_id,
      moduleId: attachableType.moduleId,
      targetId: target.target_id,
      targetType: attachableType.targetType,
      status: scanResult.status,
      scanStatus: scanResult.scanStatus,
    });

    return {
      attachment,
      file: await readFileForSession(session, file.file_id),
    };
  } catch (error) {
    await emitFileLifecycleEvent("file.upload.rejected", {
      session,
      moduleId: payload.moduleId,
      targetType: payload.targetType,
      targetId: payload.targetId,
      status: "deleted",
      scanStatus: "error",
      reason: error?.message || String(error),
    });
    await recordFileAudit(session, {
      action: "file.upload_rejected",
      changeType: "create",
      recordId: "",
      recordLabel: payload.originalFilename || payload.displayName || "File upload",
      metadata: {
        reason: error?.message || String(error),
        target_id: payload.targetId || "",
        target_type: payload.targetType || "",
      },
    });
    throw error;
  }
}

async function uploadBatchAndAttach(session, payload = {}) {
  const files = Array.isArray(payload.files) ? payload.files : [];

  if (files.length === 0) {
    throw new AppError("At least one file is required.", 400);
  }

  const attachableType = await resolveAttachableType(session.workspace_id, payload.moduleId, payload.targetType);
  const target = await readAttachableTarget(session.workspace_id, attachableType, payload.targetId);
  await assertCanUseAttachableTarget(session, attachableType, "upload", target);

  const results = [];

  for (const [index, filePayload] of files.entries()) {
    const uploadPayload = {
      ...payload,
      ...filePayload,
      attachmentMetadata: {
        ...(payload.attachmentMetadata || {}),
        ...(filePayload.attachmentMetadata || {}),
        batch_index: index,
      },
      files: undefined,
      moduleId: attachableType.moduleId,
      targetId: target.target_id,
      targetType: attachableType.targetType,
    };

    try {
      const result = await uploadAndAttach(session, uploadPayload);
      results.push({
        attachment: result.attachment,
        file: result.file,
        index,
        ok: true,
        originalFilename: uploadPayload.originalFilename || uploadPayload.filename || "",
      });
    } catch (error) {
      results.push({
        error: error?.message || "Upload failed.",
        index,
        ok: false,
        originalFilename: uploadPayload.originalFilename || uploadPayload.filename || "",
        status: error?.status || error?.statusCode || 400,
      });
    }
  }

  const succeeded = results.filter((result) => result.ok).length;
  const failed = results.length - succeeded;

  return {
    failed,
    ok: failed === 0,
    results,
    succeeded,
    total: results.length,
  };
}

async function attachExistingFile(session, payload = {}) {
  const file = await readFileRow(session.workspace_id, payload.fileId);
  if (!file || file.status === "deleted") {
    throw new AppError("File not found.", 404);
  }
  if (file.status === "quarantined") {
    throw new AppError("Quarantined files cannot be attached.", 400);
  }

  const attachableType = await resolveAttachableType(session.workspace_id, payload.moduleId, payload.targetType);
  const target = await readAttachableTarget(session.workspace_id, attachableType, payload.targetId);
  await assertCanUseAttachableTarget(session, attachableType, "attach", target);

  const attachment = await attachFile(session, {
    ...payload,
    fileId: file.file_id,
    targetRecord: target,
  }, { attachableType });

  return {
    attachment,
    file: shapeFile(file),
  };
}

async function listAttachments(session, filters = {}) {
  const canManageQuarantine = await permissionsService.can(session, "files.manage_quarantine", {
    workspace_id: session.workspace_id,
    operation: "read",
  });
  const listOptions = normalizeAttachmentListOptions(filters);
  await assertTargetScopedAttachmentRead(session, filters);
  const statusFilter = normalizeFileStatusFilter(filters.status || filters.fileStatus || filters.file_status);
  const targetScopedRead = Boolean(filters.targetId || filters.target_id);
  const conditions = [
    `file_attachments.workspace_id = ${sqlText(session.workspace_id)}`,
    "file_attachments.removed_at IS NULL",
  ];

  if (statusFilter === "all" && canManageQuarantine) {
    conditions.push("files.status IN ('pending', 'available', 'quarantined', 'deleted')");
  } else if (statusFilter === "quarantined" && canManageQuarantine) {
    conditions.push("files.status = 'quarantined'");
  } else if (statusFilter === "pending" && canManageQuarantine) {
    conditions.push("files.status = 'pending'");
  } else if (statusFilter === "deleted") {
    conditions.push("files.status = 'deleted'");
  } else if (statusFilter === "all") {
    conditions.push("files.status IN ('available', 'deleted')");
    conditions.push("files.scan_status IN ('not_required', 'passed')");
  } else if (targetScopedRead && !(filters.status || filters.fileStatus || filters.file_status)) {
    conditions.push("files.status IN ('available', 'deleted')");
    conditions.push("files.scan_status IN ('not_required', 'passed')");
  } else {
    conditions.push("files.status = 'available'");
    conditions.push("files.scan_status IN ('not_required', 'passed')");
  }
  if (filters.fileId || filters.file_id) {
    conditions.push(`file_attachments.file_id = ${sqlText(filters.fileId || filters.file_id)}`);
  }
  if (filters.moduleId || filters.module_id) {
    conditions.push(`file_attachments.module_id = ${sqlText(filters.moduleId || filters.module_id)}`);
  }
  if (filters.targetType || filters.target_type) {
    conditions.push(`file_attachments.target_type = ${sqlText(filters.targetType || filters.target_type)}`);
  }
  if (filters.targetId || filters.target_id) {
    conditions.push(`file_attachments.target_id = ${sqlText(filters.targetId || filters.target_id)}`);
  }
  if (filters.clientId || filters.client_id) {
    conditions.push(`file_attachments.client_id = ${sqlText(filters.clientId || filters.client_id)}`);
  }
  if (filters.projectId || filters.project_id) {
    conditions.push(`file_attachments.project_id = ${sqlText(filters.projectId || filters.project_id)}`);
  }
  if (filters.filename || filters.fileName || filters.q) {
    const filename = String(filters.filename || filters.fileName || filters.q || "").trim().toLowerCase();
    if (filename) {
      conditions.push(`(
        LOWER(files.original_filename) LIKE ${sqlText(`%${filename}%`)}
        OR LOWER(files.display_name) LIKE ${sqlText(`%${filename}%`)}
      )`);
    }
  }

  const rows = await querySql(`
SELECT ${attachmentSelectColumns()}
FROM file_attachments
INNER JOIN files
  ON files.workspace_id = file_attachments.workspace_id
  AND files.file_id = file_attachments.file_id
WHERE ${conditions.join("\n  AND ")}
ORDER BY file_attachments.created_at DESC, file_attachments.file_attachment_id;
`);
  const visible = [];

  for (const row of rows) {
    if (await canReadAttachment(session, row)) {
      visible.push(await shapeAttachmentForRead(session, row));
    }
  }

  const sorted = sortAttachmentsForReadModel(visible, listOptions.sort);
  const paged = listOptions.paginate ? sorted.slice(listOptions.offset, listOptions.offset + listOptions.limit) : sorted;

  return {
    attachments: paged,
    pagination: {
      hasMore: listOptions.offset + paged.length < sorted.length,
      limit: listOptions.limit,
      offset: listOptions.offset,
      returned: paged.length,
      total: sorted.length,
    },
    sort: listOptions.sort,
  };
}

async function countAttachmentsForTargets(session, filters = {}) {
  const moduleId = String(filters.moduleId || filters.module_id || "").trim();
  const targetType = String(filters.targetType || filters.target_type || "").trim();
  const targetIds = normalizeTargetIds(filters.targetIds || filters.target_ids || filters.targetId || filters.target_id);

  if (!moduleId || !targetType || targetIds.length === 0) {
    return { counts: {} };
  }

  const accessibleTargetIds = await readableAttachmentTargetIds(session, moduleId, targetType, targetIds);
  const result = await listAttachments(session, {
    allPages: true,
    limit: MAX_ATTACHMENT_LIMIT,
    moduleId,
    targetType,
    status: "available",
  });
  const allowedTargetIds = new Set(targetIds);
  const counts = {};

  targetIds.forEach((targetId) => {
    counts[targetId] = 0;
  });
  result.attachments.forEach((attachment) => {
    const targetId = attachment.targetId || attachment.target_id || "";
    if (allowedTargetIds.has(targetId) && accessibleTargetIds.has(targetId)) {
      counts[targetId] = (counts[targetId] || 0) + 1;
    }
  });

  return {
    counts,
    meta: {
      moduleId,
      targetType,
      checkedTargets: targetIds.length,
      readableTargets: accessibleTargetIds.size,
    },
  };
}

async function readFileForSession(session, fileId) {
  const file = await readFileRow(session.workspace_id, fileId);

  if (!file || file.status === "deleted") {
    throw new AppError("File not found.", 404);
  }

  const attachments = await readActiveAttachmentsForFile(session.workspace_id, file.file_id);
  if (attachments.length > 0 && !(await canReadAnyAttachment(session, attachments))) {
    throw new AppError("You do not have permission to view that file.", 403);
  }

  if (file.status === "quarantined") {
    await permissionsService.assertCan(session, "files.manage_quarantine", {
      workspace_id: session.workspace_id,
      operation: "read",
    });
  }

  return shapeFile(file);
}

async function downloadFile(session, fileId) {
  const file = await readFileRow(session.workspace_id, fileId);

  if (!file || file.status === "deleted") {
    throw new AppError("File not found.", 404);
  }
  if (file.status !== "available" || !["not_required", "passed"].includes(file.scan_status)) {
    throw new AppError("That file is not available for download.", 403);
  }

  const attachments = await readActiveAttachmentsForFile(session.workspace_id, file.file_id);
  if (attachments.length === 0 || !(await canReadAnyAttachment(session, attachments))) {
    throw new AppError("You do not have permission to download that file.", 403);
  }

  await permissionsService.assertCan(session, "files.download", {
    workspace_id: session.workspace_id,
    operation: "download",
  });

  const stream = await getFileStorageAdapter(file.storage_provider).read(file.storage_key);
  await emitFileLifecycleEvent("file.downloaded", {
    session,
    fileId: file.file_id,
    moduleId: attachments[0].module_id,
    targetId: attachments[0].target_id,
    targetType: attachments[0].target_type,
    status: file.status,
    scanStatus: file.scan_status,
  });
  await recordFileAudit(session, {
    action: "file.downloaded",
    changeType: "update",
    recordId: file.file_id,
    recordLabel: file.display_name,
    metadata: {
      attachment_id: attachments[0].file_attachment_id,
      target_id: attachments[0].target_id,
      target_type: attachments[0].target_type,
    },
  });

  return {
    file: shapeFile(file),
    headers: buildDownloadHeaders(file),
    stream,
  };
}

async function removeAttachment(session, attachmentId) {
  const attachment = await readAttachmentById(session.workspace_id, attachmentId);

  if (!attachment || attachment.removed_at) {
    throw new AppError("Attachment not found.", 404);
  }

  const attachableType = await resolveAttachableType(
    session.workspace_id,
    attachment.module_id,
    attachment.target_type,
  );
  const target = await readAttachableTarget(session.workspace_id, attachableType, attachment.target_id);
  await assertCanUseAttachableTarget(session, attachableType, "remove", target);

  const now = new Date().toISOString();
  await runSql(`
UPDATE file_attachments
SET removed_at = ${sqlText(now)}
WHERE workspace_id = ${sqlText(session.workspace_id)}
  AND file_attachment_id = ${sqlText(attachment.file_attachment_id)};
`);

  await emitFileLifecycleEvent("file.attachment.removed", {
    session,
    attachmentId: attachment.file_attachment_id,
    fileId: attachment.file_id,
    moduleId: attachment.module_id,
    targetId: attachment.target_id,
    targetType: attachment.target_type,
    status: attachment.file_status,
    scanStatus: attachment.scan_status,
  });
  await recordFileAudit(session, {
    action: "file.attachment_removed",
    changeType: "delete",
    recordId: attachment.file_attachment_id,
    recordLabel: attachment.display_name,
    metadata: {
      file_id: attachment.file_id,
      target_id: attachment.target_id,
      target_type: attachment.target_type,
    },
  });

  return { attachment: { ...shapeAttachment(attachment), removedAt: now, removed_at: now } };
}

async function deleteFile(session, fileId) {
  const file = await readFileRow(session.workspace_id, fileId);

  if (!file || file.status === "deleted") {
    throw new AppError("File not found.", 404);
  }

  const attachments = await readActiveAttachmentsForFile(session.workspace_id, file.file_id);
  await assertCanDeleteFile(session, file, attachments);

  const now = new Date().toISOString();
  const metadata = mergeFileMetadata(file.metadata_json, {
    deletion: {
      deleted_at: now,
      deleted_by_user_id: session.user_id,
      previous_status: file.status,
      purge_after_days: 7,
      automatic_purge_after_days: 30,
      staged: true,
    },
  });

  await runSql(`
UPDATE files
SET status = 'deleted',
    deleted_at = ${sqlText(now)},
    updated_at = ${sqlText(now)},
    metadata_json = ${sqlText(JSON.stringify(metadata))}
WHERE workspace_id = ${sqlText(session.workspace_id)}
  AND file_id = ${sqlText(file.file_id)};
`);

  for (const attachment of attachments) {
    await emitFileLifecycleEvent("file.attachment.removed", {
      session,
      attachmentId: attachment.file_attachment_id,
      fileId: attachment.file_id,
      metadata: { staged_delete: true },
      moduleId: attachment.module_id,
      targetId: attachment.target_id,
      targetType: attachment.target_type,
      status: "deleted",
      scanStatus: attachment.scan_status,
    });
  }

  await emitFileLifecycleEvent("file.deleted", {
    session,
    fileId: file.file_id,
    metadata: {
      automatic_purge_after_days: 30,
      purge_after_days: 7,
      staged_delete: true,
    },
    status: "deleted",
    scanStatus: file.scan_status,
  });
  await recordFileAudit(session, {
    action: "file.deleted",
    changeType: "delete",
    recordId: file.file_id,
    recordLabel: file.display_name,
    metadata: {
      automatic_purge_after_days: 30,
      purge_after_days: 7,
      staged_delete: true,
    },
  });
  await refreshStorageAccounting(session.workspace_id);

  return { file: await readFileForAdmin(session, file.file_id) };
}

async function restoreFile(session, fileId) {
  const file = await readFileRow(session.workspace_id, fileId);

  if (!file || file.status !== "deleted") {
    throw new AppError("Deleted file not found.", 404);
  }

  const attachments = await readActiveAttachmentsForFile(session.workspace_id, file.file_id);
  await assertCanDeleteFile(session, file, attachments, { operation: "restore" });

  const metadata = parseJsonObject(file.metadata_json);
  const previousStatus = normalizeRestorableStatus(metadata.deletion?.previous_status, file.scan_status);
  const now = new Date().toISOString();
  const nextMetadata = {
    ...metadata,
    deletion: {
      ...(metadata.deletion || {}),
      restored_at: now,
      restored_by_user_id: session.user_id,
    },
  };

  await runSql(`
UPDATE files
SET status = ${sqlText(previousStatus)},
    deleted_at = NULL,
    updated_at = ${sqlText(now)},
    metadata_json = ${sqlText(JSON.stringify(nextMetadata))}
WHERE workspace_id = ${sqlText(session.workspace_id)}
  AND file_id = ${sqlText(file.file_id)};
`);

  await emitFileLifecycleEvent("file.restored", {
    session,
    fileId: file.file_id,
    metadata: { previous_status: file.status },
    status: previousStatus,
    scanStatus: file.scan_status,
  });
  await recordFileAudit(session, {
    action: "file.restored",
    changeType: "update",
    recordId: file.file_id,
    recordLabel: file.display_name,
    metadata: { restored_from_status: file.status },
  });
  await refreshStorageAccounting(session.workspace_id);

  return { file: await readFileForAdmin(session, file.file_id) };
}

async function readStorageAccounting(session, filters = {}) {
  await permissionsService.assertCan(session, "files.manage_workspace_settings", {
    workspace_id: session.workspace_id,
    operation: "read",
  });
  await refreshStorageAccounting(session.workspace_id);

  const storageKind = normalizeStorageKind(filters.storageKind || filters.storage_kind);
  const conditions = [`workspace_id = ${sqlText(session.workspace_id)}`];

  if (storageKind) {
    conditions.push(`storage_kind = ${sqlText(storageKind)}`);
  }

  const rows = await querySql(`
SELECT
  storage_accounting_id,
  workspace_id,
  user_id,
  storage_kind,
  storage_provider,
  external_source_provider,
  availability_status,
  file_count,
  internal_bytes,
  external_reported_bytes,
  calculated_at
FROM file_storage_accounting
WHERE ${conditions.join("\n  AND ")}
ORDER BY storage_kind, user_id, storage_provider, external_source_provider, availability_status;
`);
  const entries = rows.map(shapeStorageAccountingRow);

  return {
    entries,
    totals: summarizeStorageAccounting(entries),
  };
}

async function recordExternalStorageAccounting(session, payload = {}) {
  await permissionsService.assertCan(session, "files.manage_workspace_settings", {
    workspace_id: session.workspace_id,
    operation: "update",
  });

  const sourceProvider = normalizeRequiredText(payload.externalSourceProvider || payload.external_source_provider, "External source provider is required.");
  const availabilityStatus = normalizeOptionalText(payload.availabilityStatus || payload.availability_status, { maxLength: 80 }) || "unknown";
  const userId = normalizeOptionalText(payload.userId || payload.user_id, { maxLength: 120 });
  const fileCount = clampInteger(payload.fileCount || payload.file_count, 0, 0, Number.MAX_SAFE_INTEGER);
  const externalReportedBytes = clampInteger(
    payload.externalReportedBytes || payload.external_reported_bytes,
    0,
    0,
    Number.MAX_SAFE_INTEGER,
  );
  const now = new Date().toISOString();
  const accountingId = storageAccountingId({
    availabilityStatus,
    externalSourceProvider: sourceProvider,
    storageKind: "external",
    storageProvider: "external",
    userId,
    workspaceId: session.workspace_id,
  });

  await runSql(`
INSERT INTO file_storage_accounting (
  storage_accounting_id,
  workspace_id,
  user_id,
  storage_kind,
  storage_provider,
  external_source_provider,
  availability_status,
  file_count,
  internal_bytes,
  external_reported_bytes,
  calculated_at,
  metadata_json
)
VALUES (
  ${sqlText(accountingId)},
  ${sqlText(session.workspace_id)},
  ${sqlText(userId)},
  'external',
  'external',
  ${sqlText(sourceProvider)},
  ${sqlText(availabilityStatus)},
  ${sqlInteger(fileCount)},
  0,
  ${sqlInteger(externalReportedBytes)},
  ${sqlText(now)},
  ${sqlText(JSON.stringify({ source: "external_accounting_contract" }))}
)
ON CONFLICT (
  workspace_id,
  user_id,
  storage_kind,
  storage_provider,
  external_source_provider,
  availability_status
)
DO UPDATE SET
  file_count = excluded.file_count,
  internal_bytes = 0,
  external_reported_bytes = excluded.external_reported_bytes,
  calculated_at = excluded.calculated_at,
  metadata_json = excluded.metadata_json;
`);

  return readStorageAccounting(session, { storageKind: "external" });
}

async function readWorkspaceFileSettings(session) {
  await permissionsService.assertCan(session, "files.manage_workspace_settings", {
    workspace_id: session.workspace_id,
    operation: "read",
  });

  const settings = await readWorkspaceFileSettingsForWorkspace(session.workspace_id);
  const accounting = await readStorageAccounting(session);

  return {
    accounting,
    settings: shapeWorkspaceFileSettings(settings),
  };
}

async function saveWorkspaceFileSettings(session, payload = {}) {
  await permissionsService.assertCan(session, "files.manage_workspace_settings", {
    workspace_id: session.workspace_id,
    operation: "update",
  });

  const previous = await readWorkspaceFileSettingsForWorkspace(session.workspace_id);
  const next = normalizeWorkspaceFileSettingsPayload(payload, previous);
  const now = new Date().toISOString();

  await runSql(`
INSERT INTO file_workspace_settings (
  workspace_id,
  file_type_policy_mode,
  allowed_extensions_json,
  blocked_extensions_json,
  internal_storage_limit_bytes,
  per_user_storage_limit_bytes,
  created_at,
  updated_at,
  metadata_json
)
VALUES (
  ${sqlText(session.workspace_id)},
  ${sqlText(next.fileTypePolicyMode)},
  ${sqlText(JSON.stringify(next.allowedExtensions))},
  ${sqlText(JSON.stringify(next.blockedExtensions))},
  ${sqlNullableInteger(next.internalStorageLimitBytes)},
  ${sqlNullableInteger(next.perUserStorageLimitBytes)},
  ${sqlText(now)},
  ${sqlText(now)},
  ${sqlText(JSON.stringify({ source: "files_settings" }))}
)
ON CONFLICT (workspace_id)
DO UPDATE SET
  file_type_policy_mode = excluded.file_type_policy_mode,
  allowed_extensions_json = excluded.allowed_extensions_json,
  blocked_extensions_json = excluded.blocked_extensions_json,
  internal_storage_limit_bytes = excluded.internal_storage_limit_bytes,
  per_user_storage_limit_bytes = excluded.per_user_storage_limit_bytes,
  updated_at = excluded.updated_at,
  metadata_json = excluded.metadata_json;
`);

  const saved = await readWorkspaceFileSettingsForWorkspace(session.workspace_id);
  await recordFileAudit(session, {
    action: "file.workspace_settings_updated",
    changeType: "settings_change",
    recordId: session.workspace_id,
    recordLabel: "Files settings",
    metadata: {
      next: shapeWorkspaceFileSettings(saved),
      previous: shapeWorkspaceFileSettings(previous),
    },
  });

  return readWorkspaceFileSettings(session);
}

async function reportFile(session, fileId, payload = {}) {
  const file = await readFileRow(session.workspace_id, fileId);

  if (!file || file.status === "deleted") {
    throw new AppError("File not found.", 404);
  }

  const attachments = await readActiveAttachmentsForFile(session.workspace_id, file.file_id);
  if (attachments.length > 0 && !(await canReadAnyAttachment(session, attachments))) {
    throw new AppError("You do not have permission to report that file.", 403);
  }

  const reason = normalizeReportReason(payload.reason || payload.reportReason);
  const notes = normalizeOptionalText(payload.notes || payload.reportNotes, { maxLength: 1000 });
  const now = new Date().toISOString();
  const reportId = randomUUID();
  const attachmentId = normalizeOptionalText(payload.attachmentId || payload.fileAttachmentId);

  await runSql(`
INSERT INTO file_reports (
  file_report_id,
  workspace_id,
  file_id,
  file_attachment_id,
  report_reason,
  report_notes,
  reported_by_user_id,
  created_at,
  metadata_json
)
VALUES (
  ${sqlText(reportId)},
  ${sqlText(session.workspace_id)},
  ${sqlText(file.file_id)},
  ${sqlNullableText(attachmentId)},
  ${sqlText(reason)},
  ${sqlNullableText(notes)},
  ${sqlText(session.user_id)},
  ${sqlText(now)},
  ${sqlText(JSON.stringify({ source: "browser_api" }))}
);

UPDATE files
SET status = 'quarantined',
    quarantine_reason = ${sqlText(`reported:${reason}`)},
    updated_at = ${sqlText(now)}
WHERE workspace_id = ${sqlText(session.workspace_id)}
  AND file_id = ${sqlText(file.file_id)}
  AND status != 'deleted';
`);

  await emitFileLifecycleEvent("file.reported", {
    session,
    attachmentId,
    fileId: file.file_id,
    status: "quarantined",
    scanStatus: file.scan_status,
    reason,
  });
  await emitFileLifecycleEvent("file.quarantined", {
    session,
    attachmentId,
    fileId: file.file_id,
    status: "quarantined",
    scanStatus: file.scan_status,
    reason: `reported:${reason}`,
  });
  await recordFileAudit(session, {
    action: "file.reported",
    changeType: "update",
    recordId: file.file_id,
    recordLabel: file.display_name,
    metadata: {
      attachment_id: attachmentId,
      reason,
      report_id: reportId,
    },
  });

  return {
    report: {
      createdAt: now,
      created_at: now,
      fileId: file.file_id,
      fileReportId: reportId,
      file_report_id: reportId,
      reason,
    },
    file: await readFileForAdmin(session, file.file_id),
  };
}

async function quarantineFile(session, fileId, payload = {}) {
  await permissionsService.assertCan(session, "files.manage_quarantine", {
    workspace_id: session.workspace_id,
    operation: "update",
  });

  const file = await readFileRow(session.workspace_id, fileId);
  if (!file || file.status === "deleted") {
    throw new AppError("File not found.", 404);
  }

  const reason = normalizeOptionalText(payload.reason, { maxLength: 250 }) || "manual_quarantine";
  const now = new Date().toISOString();

  await runSql(`
UPDATE files
SET status = 'quarantined',
    quarantine_reason = ${sqlText(reason)},
    updated_at = ${sqlText(now)}
WHERE workspace_id = ${sqlText(session.workspace_id)}
  AND file_id = ${sqlText(file.file_id)};
`);
  await emitFileLifecycleEvent("file.quarantined", {
    session,
    fileId: file.file_id,
    status: "quarantined",
    scanStatus: file.scan_status,
    reason,
  });
  await recordFileAudit(session, {
    action: "file.quarantined",
    changeType: "update",
    recordId: file.file_id,
    recordLabel: file.display_name,
    metadata: { reason },
  });

  return { file: await readFileForAdmin(session, file.file_id) };
}

async function readFileForAdmin(session, fileId) {
  const file = await readFileRow(session.workspace_id, fileId);
  return shapeFile(file);
}

async function assertCanUseAttachableTarget(session, attachableType, operation, target = null) {
  const permissionId = permissionForOperation(attachableType, operation);

  if (!permissionId) {
    return;
  }

  await permissionsService.assertCan(session, permissionId, {
    workspace_id: session.workspace_id,
    client_id: resolvePermissionClientId(attachableType, target),
    project_id: resolvePermissionProjectId(attachableType, target),
    operation,
  });

  await assertModuleTargetAccess(session, attachableType, operation, target);
}

async function emitFileLifecycleEvent(eventName, payload = {}) {
  if (!isFileLifecycleEvent(eventName)) {
    throw new AppError(`Unknown file lifecycle event '${eventName}'.`, 400);
  }

  const safePayload = sanitizeFileLifecyclePayload(payload);

  return modulesService.emitInternalEvent(eventName, {
    session: payload.session || null,
    workspaceId: safePayload.workspaceId,
    actorUserId: safePayload.actorUserId,
    moduleId: safePayload.moduleId,
    recordType: safePayload.targetType || "file",
    recordId: safePayload.targetId || safePayload.fileId,
    newValue: {
      file_id: safePayload.fileId,
      file_attachment_id: safePayload.attachmentId,
      status: safePayload.status,
      scan_status: safePayload.scanStatus,
    },
    source: payload.source || "files-service",
    metadata: {
      attachment_id: safePayload.attachmentId,
      file_id: safePayload.fileId,
      module_id: safePayload.moduleId,
      reason: safePayload.reason,
      scan_status: safePayload.scanStatus,
      status: safePayload.status,
      target_id: safePayload.targetId,
      target_type: safePayload.targetType,
      ...safePayload.metadata,
    },
  });
}

async function createFileRecord(session, prepared) {
  const now = new Date().toISOString();
  const fileId = randomUUID();

  await runSql(`
INSERT INTO files (
  file_id,
  workspace_id,
  storage_provider,
  storage_key,
  original_filename,
  stored_filename,
  display_name,
  extension,
  mime_type_claimed,
  mime_type_detected,
  file_size_bytes,
  sha256_hash,
  status,
  scan_status,
  quarantine_reason,
  uploaded_by_user_id,
  created_at,
  updated_at,
  deleted_at,
  metadata_json
)
VALUES (
  ${sqlText(fileId)},
  ${sqlText(session.workspace_id)},
  ${sqlText(prepared.storageProvider)},
  ${sqlText(prepared.storageKey)},
  ${sqlText(prepared.originalFilename)},
  ${sqlText(prepared.storedFilename)},
  ${sqlText(prepared.displayName)},
  ${sqlText(prepared.extension)},
  ${sqlText(prepared.mimeTypeClaimed)},
  ${sqlText(prepared.mimeTypeDetected)},
  ${sqlInteger(prepared.fileSizeBytes)},
  ${sqlText(prepared.sha256Hash)},
  'pending',
  'pending',
  NULL,
  ${sqlText(session.user_id)},
  ${sqlText(now)},
  ${sqlText(now)},
  NULL,
  ${sqlText(JSON.stringify(prepared.metadata || {}))}
);
`);

  await recordFileAudit(session, {
    action: "file.uploaded",
    changeType: "create",
    recordId: fileId,
    recordLabel: prepared.displayName,
    metadata: {
      file_size_bytes: prepared.fileSizeBytes,
      mime_type_detected: prepared.mimeTypeDetected,
      sha256_hash: prepared.sha256Hash,
    },
  });

  await refreshStorageAccounting(session.workspace_id);
  return readFileRow(session.workspace_id, fileId);
}

async function refreshStorageAccounting(workspaceId) {
  const now = new Date().toISOString();

  await runSql(`
DELETE FROM file_storage_accounting
WHERE workspace_id = ${sqlText(workspaceId)}
  AND storage_kind = 'internal';

INSERT INTO file_storage_accounting (
  storage_accounting_id,
  workspace_id,
  user_id,
  storage_kind,
  storage_provider,
  external_source_provider,
  availability_status,
  file_count,
  internal_bytes,
  external_reported_bytes,
  calculated_at,
  metadata_json
)
SELECT
  workspace_id || ':internal:' || COALESCE(uploaded_by_user_id, '') || ':' || COALESCE(storage_provider, 'local') || ':' || COALESCE(status, ''),
  workspace_id,
  COALESCE(uploaded_by_user_id, ''),
  'internal',
  COALESCE(storage_provider, 'local'),
  '',
  COALESCE(status, ''),
  COUNT(*),
  COALESCE(SUM(file_size_bytes), 0),
  0,
  ${sqlText(now)},
  '{}'
FROM files
WHERE workspace_id = ${sqlText(workspaceId)}
  AND COALESCE(storage_kind, 'internal') = 'internal'
  AND status IN ('pending', 'available', 'quarantined', 'deleted')
GROUP BY workspace_id, COALESCE(uploaded_by_user_id, ''), COALESCE(storage_provider, 'local'), COALESCE(status, '');
`);
}

async function scanFile(session, file) {
  await emitFileLifecycleEvent("file.scan.pending", {
    session,
    fileId: file.file_id,
    status: "pending",
    scanStatus: "pending",
  });

  const scanResult = await scannerAdapter.scan(file);
  const scanStatus = FILE_SCAN_STATUS_SET.has(scanResult.scanStatus) ? scanResult.scanStatus : "error";
  const status = FILE_STATUS_SET.has(scanResult.status) ? scanResult.status : "quarantined";
  const reason = normalizeOptionalText(scanResult.reason, { maxLength: 250 });
  const now = new Date().toISOString();

  await runSql(`
UPDATE files
SET status = ${sqlText(status)},
    scan_status = ${sqlText(scanStatus)},
    quarantine_reason = ${sqlNullableText(status === "quarantined" ? reason || "scan_failed" : null)},
    updated_at = ${sqlText(now)}
WHERE workspace_id = ${sqlText(session.workspace_id)}
  AND file_id = ${sqlText(file.file_id)};
`);

  if (scanStatus === "passed") {
    await emitFileLifecycleEvent("file.scan.passed", {
      session,
      fileId: file.file_id,
      status,
      scanStatus,
      metadata: scanResult.metadata,
    });
    await emitFileLifecycleEvent("file.available", {
      session,
      fileId: file.file_id,
      status,
      scanStatus,
    });
  } else if (scanStatus === "failed") {
    await emitFileLifecycleEvent("file.scan.failed", {
      session,
      fileId: file.file_id,
      status,
      scanStatus,
      reason,
      metadata: scanResult.metadata,
    });
    await emitFileLifecycleEvent("file.quarantined", {
      session,
      fileId: file.file_id,
      status,
      scanStatus,
      reason,
    });
  } else {
    await emitFileLifecycleEvent("file.scan.failed", {
      session,
      fileId: file.file_id,
      status,
      scanStatus,
      reason: reason || "scan_error",
      metadata: scanResult.metadata,
    });
  }

  if (status === "quarantined" || scanStatus !== "passed") {
    await recordFileAudit(session, {
      action: status === "quarantined" ? "file.quarantined" : "file.scan_failed",
      changeType: "update",
      recordId: file.file_id,
      recordLabel: file.display_name,
      metadata: {
        reason,
        scan_status: scanStatus,
        scanner: scanResult.metadata?.scanner || "",
      },
    });
  }

  return { scanStatus, status };
}

async function attachFile(session, payload = {}, context = {}) {
  const attachableType = context.attachableType || await resolveAttachableType(
    session.workspace_id,
    payload.moduleId,
    payload.targetType,
  );
  const target = payload.targetRecord || await readAttachableTarget(session.workspace_id, attachableType, payload.targetId);
  const visibility = normalizeVisibility(payload.visibility, attachableType);
  const now = new Date().toISOString();
  const attachmentId = randomUUID();

  await runSql(`
INSERT INTO file_attachments (
  file_attachment_id,
  workspace_id,
  file_id,
  module_id,
  target_type,
  target_id,
  client_id,
  project_id,
  visibility,
  attachment_role,
  caption,
  sort_order,
  attached_by_user_id,
  created_at,
  removed_at,
  metadata_json
)
VALUES (
  ${sqlText(attachmentId)},
  ${sqlText(session.workspace_id)},
  ${sqlText(payload.fileId)},
  ${sqlText(attachableType.moduleId)},
  ${sqlText(attachableType.targetType)},
  ${sqlText(target.target_id)},
  ${sqlNullableText(target.client_id)},
  ${sqlNullableText(target.project_id)},
  ${sqlText(visibility)},
  ${sqlNullableText(normalizeOptionalText(payload.attachmentRole, { maxLength: 80 }))},
  ${sqlNullableText(normalizeOptionalText(payload.caption, { maxLength: 500 }))},
  ${sqlInteger(payload.sortOrder)},
  ${sqlText(session.user_id)},
  ${sqlText(now)},
  NULL,
  ${sqlText(JSON.stringify(payload.metadata || {}))}
);
`);

  const attachment = await readAttachmentById(session.workspace_id, attachmentId);
  await emitFileLifecycleEvent("file.attachment.created", {
    session,
    attachmentId,
    fileId: payload.fileId,
    moduleId: attachableType.moduleId,
    targetId: target.target_id,
    targetType: attachableType.targetType,
    status: attachment.file_status,
    scanStatus: attachment.scan_status,
  });
  await recordFileAudit(session, {
    action: "file.attachment_created",
    changeType: "create",
    recordId: attachmentId,
    recordLabel: attachment.display_name,
    metadata: {
      file_id: payload.fileId,
      target_id: target.target_id,
      target_type: attachableType.targetType,
    },
  });

  return shapeAttachment(attachment);
}

async function readAttachableTarget(workspaceId, attachableType, targetId) {
  const normalizedTargetId = normalizeRequiredText(targetId, "Target ID is required.");
  const rows = await querySql(`
SELECT
  ${attachableType.idField} AS target_id,
  ${attachableType.labelField} AS target_label,
  ${attachableType.workspaceField} AS workspace_id
  ${attachableType.clientField ? `, ${attachableType.clientField} AS client_id` : ", NULL AS client_id"}
  ${attachableType.projectField ? `, ${attachableType.projectField} AS project_id` : ", NULL AS project_id"}
FROM ${attachableType.tableName}
WHERE ${attachableType.workspaceField} = ${sqlText(workspaceId)}
  AND ${attachableType.idField} = ${sqlText(normalizedTargetId)}
LIMIT 1;
`);

  if (!rows[0]) {
    throw new AppError("Attachment target not found in this workspace.", 404);
  }

  return rows[0];
}

function prepareUpload(payload = {}, attachableType = {}, fileSettings = defaultWorkspaceFileSettings("")) {
  const originalFilename = sanitizeFilename(payload.originalFilename || payload.filename || "");
  const extension = path.extname(originalFilename).toLowerCase();
  const extensionRule = ALLOWED_EXTENSIONS.get(extension);

  if (!extensionRule) {
    throw new AppError("That file extension is not allowed.", 400);
  }
  assertExtensionAllowedByWorkspacePolicy(extension, fileSettings);
  if (!isCategoryAllowed(extensionRule.category, attachableType.allowedFileCategories)) {
    throw new AppError("That file category is not allowed for this record type.", 400);
  }

  const buffer = decodeBase64(payload.contentBase64 || payload.content || "");
  const maxSize = Math.min(
    Number.parseInt(attachableType.maxFileSizeBytes, 10) || DEFAULT_MAX_FILE_SIZE_BYTES,
    DEFAULT_MAX_FILE_SIZE_BYTES,
  );

  if (buffer.length < 1) {
    throw new AppError("Uploaded file content is required.", 400);
  }
  if (buffer.length > maxSize) {
    throw new AppError("Uploaded file exceeds the allowed size.", 413);
  }

  const detected = detectFileType(buffer, extension, extensionRule);
  if (!detected.ok) {
    throw new AppError("Uploaded file content does not match the allowed file type.", 400);
  }

  return {
    buffer,
    displayName: normalizeOptionalText(payload.displayName, { maxLength: 180 }) || originalFilename,
    extension,
    fileSizeBytes: buffer.length,
    mimeTypeClaimed: normalizeOptionalText(payload.mimeType, { maxLength: 200 }) || "",
    mimeTypeDetected: detected.mimeType,
    metadata: {
      category: extensionRule.category,
      risky_extension: extensionRule.risky,
    },
    originalFilename,
    sha256Hash: createHash("sha256").update(buffer).digest("hex"),
  };
}

function decodeBase64(value) {
  const text = String(value || "").trim();

  if (!text || !/^[A-Za-z0-9+/=\r\n]+$/.test(text)) {
    throw new AppError("Uploaded file content must be base64 encoded.", 400);
  }

  return Buffer.from(text, "base64");
}

function detectFileType(buffer, extension, extensionRule) {
  if (extension === ".pdf") {
    return { ok: buffer.subarray(0, 4).toString("ascii") === "%PDF", mimeType: "application/pdf" };
  }
  if ([".jpg", ".jpeg"].includes(extension)) {
    return { ok: buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff, mimeType: "image/jpeg" };
  }
  if (extension === ".png") {
    return { ok: buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), mimeType: "image/png" };
  }
  if (extension === ".gif") {
    const header = buffer.subarray(0, 6).toString("ascii");
    return { ok: header === "GIF87a" || header === "GIF89a", mimeType: "image/gif" };
  }
  if (extension === ".zip" || [".docx", ".xlsx", ".pptx"].includes(extension)) {
    return { ok: buffer[0] === 0x50 && buffer[1] === 0x4b, mimeType: extensionRule.mime };
  }
  if ([".txt", ".md", ".csv"].includes(extension)) {
    return { ok: isMostlyText(buffer), mimeType: extensionRule.mime };
  }

  return { ok: true, mimeType: extensionRule.mime };
}

function isMostlyText(buffer) {
  const sample = buffer.subarray(0, Math.min(buffer.length, 1024));
  return [...sample].every((byte) => byte === 9 || byte === 10 || byte === 13 || (byte >= 32 && byte <= 126));
}

function buildDownloadHeaders(file) {
  const extensionRule = ALLOWED_EXTENSIONS.get(String(file.extension || "").toLowerCase());
  const dispositionType = extensionRule?.risky ? "attachment" : "inline";
  const filename = sanitizeFilename(file.original_filename || file.display_name || "download");

  return {
    "Cache-Control": "no-store",
    "Content-Disposition": `${dispositionType}; filename="${filename.replaceAll("\"", "")}"`,
    "Content-Length": String(file.file_size_bytes || 0),
    "Content-Security-Policy": "sandbox",
    "Content-Type": file.mime_type_detected || "application/octet-stream",
    "X-Content-Type-Options": "nosniff",
  };
}

async function readFileRow(workspaceId, fileId) {
  const rows = await querySql(`
SELECT *
FROM files
WHERE workspace_id = ${sqlText(workspaceId)}
  AND file_id = ${sqlText(fileId)}
LIMIT 1;
`);

  return rows[0] || null;
}

async function readWorkspaceFileSettingsForWorkspace(workspaceId) {
  const rows = await querySql(`
SELECT *
FROM file_workspace_settings
WHERE workspace_id = ${sqlText(workspaceId)}
LIMIT 1;
`);

  if (rows[0]) {
    return normalizeWorkspaceFileSettingsRow(rows[0]);
  }

  const defaults = defaultWorkspaceFileSettings(workspaceId);
  const now = new Date().toISOString();
  await runSql(`
INSERT OR IGNORE INTO file_workspace_settings (
  workspace_id,
  file_type_policy_mode,
  allowed_extensions_json,
  blocked_extensions_json,
  internal_storage_limit_bytes,
  per_user_storage_limit_bytes,
  created_at,
  updated_at,
  metadata_json
)
VALUES (
  ${sqlText(workspaceId)},
  ${sqlText(defaults.fileTypePolicyMode)},
  ${sqlText(JSON.stringify(defaults.allowedExtensions))},
  ${sqlText(JSON.stringify(defaults.blockedExtensions))},
  NULL,
  NULL,
  ${sqlText(now)},
  ${sqlText(now)},
  '{}'
);
`);

  return defaults;
}

async function readAttachmentById(workspaceId, attachmentId) {
  const rows = await querySql(`
SELECT ${attachmentSelectColumns()}
FROM file_attachments
INNER JOIN files
  ON files.workspace_id = file_attachments.workspace_id
  AND files.file_id = file_attachments.file_id
WHERE file_attachments.workspace_id = ${sqlText(workspaceId)}
  AND file_attachments.file_attachment_id = ${sqlText(attachmentId)}
LIMIT 1;
`);

  return rows[0] || null;
}

async function readActiveAttachmentsForFile(workspaceId, fileId) {
  return querySql(`
SELECT ${attachmentSelectColumns()}
FROM file_attachments
INNER JOIN files
  ON files.workspace_id = file_attachments.workspace_id
  AND files.file_id = file_attachments.file_id
WHERE file_attachments.workspace_id = ${sqlText(workspaceId)}
  AND file_attachments.file_id = ${sqlText(fileId)}
  AND file_attachments.removed_at IS NULL;
`);
}

async function canReadAnyAttachment(session, attachments) {
  for (const attachment of attachments) {
    if (await canReadAttachment(session, attachment)) {
      return true;
    }
  }

  return false;
}

async function canReadAttachment(session, attachment) {
  let attachableType;

  try {
    attachableType = await resolveAttachableType(
      session.workspace_id,
      attachment.module_id,
      attachment.target_type,
    );
  } catch {
    return false;
  }

  const hasPermission = await permissionsService.can(session, attachableType.requiredReadPermission, {
    workspace_id: session.workspace_id,
    client_id: attachment.client_id || "",
    project_id: attachment.project_id || "",
    operation: "read",
  });

  if (!hasPermission) {
    return false;
  }

  return canReadModuleTargetAttachment(session, attachableType, attachment);
}

async function assertCanDeleteFile(session, file, attachments = [], options = {}) {
  const operation = options.operation || "delete";
  const hasDeletePermission = await permissionsService.can(session, "files.delete", {
    workspace_id: session.workspace_id,
    operation,
  });
  const isOwner = file.uploaded_by_user_id && file.uploaded_by_user_id === session.user_id;

  if (!hasDeletePermission && !isOwner) {
    throw new AppError("You do not have permission to delete that file.", 403);
  }

  if (attachments.length === 0) {
    if (hasDeletePermission) {
      return;
    }
    throw new AppError("You do not have permission to delete that file.", 403);
  }

  if (hasDeletePermission) {
    for (const attachment of attachments) {
      if (await canReadAttachment(session, attachment)) {
        return;
      }
    }
    throw new AppError("You do not have permission to delete that file.", 403);
  }

  for (const attachment of attachments) {
    if (await canReadAttachment(session, attachment)) {
      return;
    }
  }

  throw new AppError("You do not have permission to delete that file.", 403);
}

async function assertTargetScopedAttachmentRead(session, filters = {}) {
  const moduleId = normalizeOptionalText(filters.moduleId || filters.module_id);
  const targetType = normalizeOptionalText(filters.targetType || filters.target_type);
  const targetId = normalizeOptionalText(filters.targetId || filters.target_id);

  if (!targetId) {
    return;
  }
  if (!targetType) {
    throw new AppError("Target type and target ID are required for target-scoped attachment reads.", 400);
  }

  const attachableType = await resolveAttachableTypeForTargetRead(session.workspace_id, moduleId, targetType);
  const target = await readAttachableTarget(session.workspace_id, attachableType, targetId);
  await assertCanUseAttachableTarget(session, attachableType, "read", target);
}

async function resolveAttachableTypeForTargetRead(workspaceId, moduleId, targetType) {
  if (moduleId) {
    return resolveAttachableType(workspaceId, moduleId, targetType);
  }

  const matches = (await listActiveAttachableTypes(workspaceId))
    .filter((candidate) => candidate.targetType === targetType);

  if (matches.length !== 1) {
    throw new AppError("Module ID is required for that attachment target type.", 400);
  }

  return matches[0];
}

async function readableAttachmentTargetIds(session, moduleId, targetType, targetIds = []) {
  const attachableType = await resolveAttachableType(session.workspace_id, moduleId, targetType);
  const readable = new Set();

  for (const targetId of targetIds) {
    try {
      const target = await readAttachableTarget(session.workspace_id, attachableType, targetId);
      await assertCanUseAttachableTarget(session, attachableType, "read", target);
      readable.add(targetId);
    } catch {
      // Counts must not reveal missing or inaccessible target records.
    }
  }

  return readable;
}

async function assertModuleTargetAccess(session, attachableType, operation, target = null) {
  if (attachableType.moduleId !== "notes" || attachableType.targetType !== "note") {
    return;
  }

  const accessOperation = operation === "read" || operation === "download" ? "read" : "update";
  const note = await notesService.readForAttachmentAccess(session, target?.target_id || "", accessOperation);

  if (note.security_mode === NOTE_SECURITY_MODES.SECURE) {
    throw new AppError("Secure notes do not allow framework file attachments yet.", 403);
  }
}

async function canReadModuleTargetAttachment(session, attachableType, attachment) {
  if (attachableType.moduleId !== "notes" || attachableType.targetType !== "note") {
    return true;
  }

  try {
    const note = await notesService.readForAttachmentAccess(session, attachment.target_id || "", "read");
    return note.security_mode !== NOTE_SECURITY_MODES.SECURE;
  } catch {
    return false;
  }
}

function attachmentSelectColumns() {
  return `
  file_attachments.file_attachment_id,
  file_attachments.workspace_id,
  file_attachments.file_id,
  file_attachments.module_id,
  file_attachments.target_type,
  file_attachments.target_id,
  file_attachments.client_id,
  file_attachments.project_id,
  file_attachments.visibility,
  file_attachments.attachment_role,
  file_attachments.caption,
  file_attachments.sort_order,
  file_attachments.attached_by_user_id,
  file_attachments.created_at,
  file_attachments.removed_at,
  file_attachments.metadata_json,
  files.original_filename,
  files.display_name,
  files.extension,
  files.mime_type_detected,
  files.file_size_bytes,
  files.status AS file_status,
  files.scan_status,
  files.quarantine_reason,
  files.deleted_at AS file_deleted_at
`;
}

function shapeFile(file) {
  if (!file) {
    return null;
  }

  return {
    fileId: file.file_id,
    file_id: file.file_id,
    workspaceId: file.workspace_id,
    storageProvider: file.storage_provider,
    originalFilename: file.original_filename,
    displayName: file.display_name,
    extension: file.extension,
    mimeTypeDetected: file.mime_type_detected,
    fileSizeBytes: Number(file.file_size_bytes || 0),
    sha256Hash: file.sha256_hash,
    status: file.status,
    scanStatus: file.scan_status,
    quarantineReason: file.quarantine_reason,
    createdAt: file.created_at,
    updatedAt: file.updated_at,
    deletedAt: file.deleted_at,
  };
}

function shapeAttachment(attachment) {
  return {
    fileAttachmentId: attachment.file_attachment_id,
    file_attachment_id: attachment.file_attachment_id,
    fileId: attachment.file_id,
    file_id: attachment.file_id,
    moduleId: attachment.module_id,
    targetType: attachment.target_type,
    targetId: attachment.target_id,
    clientId: attachment.client_id || "",
    projectId: attachment.project_id || "",
    visibility: attachment.visibility,
    attachmentRole: attachment.attachment_role || "",
    caption: attachment.caption || "",
    sortOrder: Number(attachment.sort_order || 0),
    createdAt: attachment.created_at,
    removedAt: attachment.removed_at || null,
    file: {
      displayName: attachment.display_name,
      extension: attachment.extension,
      fileSizeBytes: Number(attachment.file_size_bytes || 0),
      mimeTypeDetected: attachment.mime_type_detected,
      originalFilename: attachment.original_filename,
      scanStatus: attachment.scan_status,
      status: attachment.file_status,
      deletedAt: attachment.file_deleted_at || null,
      deleted_at: attachment.file_deleted_at || null,
    },
  };
}

async function shapeAttachmentForRead(session, attachment) {
  const shaped = shapeAttachment(attachment);
  const [target, contextLabels] = await Promise.all([
    readAttachmentTargetLabel(session.workspace_id, attachment),
    readAttachmentContextLabels(session.workspace_id, attachment),
  ]);

  return {
    ...shaped,
    target: target
      ? {
          id: shaped.targetId,
          label: target.label,
          type: shaped.targetType,
        }
      : null,
    targetLabel: target?.label || "",
    target_label: target?.label || "",
    clientLabel: contextLabels.clientLabel,
    client_label: contextLabels.clientLabel,
    projectLabel: contextLabels.projectLabel,
    project_label: contextLabels.projectLabel,
  };
}

async function readAttachmentTargetLabel(workspaceId, attachment) {
  try {
    const attachableType = await resolveAttachableType(
      workspaceId,
      attachment.module_id,
      attachment.target_type,
    );
    const target = await readAttachableTarget(workspaceId, attachableType, attachment.target_id);

    return {
      label: target.target_label || "",
    };
  } catch {
    return null;
  }
}

async function readAttachmentContextLabels(workspaceId, attachment) {
  const clientId = attachment.client_id || "";
  const projectId = attachment.project_id || "";
  const [clientRows, projectRows] = await Promise.all([
    clientId
      ? querySql(`
SELECT name
FROM clients
WHERE workspace_id = ${sqlText(workspaceId)}
  AND id = ${sqlText(clientId)}
LIMIT 1;
`)
      : Promise.resolve([]),
    projectId
      ? querySql(`
SELECT name
FROM projects
WHERE workspace_id = ${sqlText(workspaceId)}
  AND id = ${sqlText(projectId)}
LIMIT 1;
`)
      : Promise.resolve([]),
  ]);

  return {
    clientLabel: clientRows[0]?.name || "",
    projectLabel: projectRows[0]?.name || "",
  };
}

function resolvePermissionClientId(attachableType, target) {
  if (attachableType.targetType === "client") {
    return target?.target_id || "";
  }

  return target?.client_id || "";
}

function resolvePermissionProjectId(attachableType, target) {
  if (attachableType.targetType === "project") {
    return target?.target_id || "";
  }

  return target?.project_id || "";
}

function normalizeVisibility(value, attachableType) {
  const visibility = String(value || "private").trim();
  const allowed = new Set(attachableType.allowedVisibilityValues || DEFAULT_ALLOWED_VISIBILITY);

  if (!allowed.has(visibility)) {
    throw new AppError("That file visibility is not allowed for this record type.", 400);
  }

  return visibility;
}

function normalizeFileStatusFilter(value) {
  const status = String(value || "available").trim().toLowerCase();

  return ["all", "available", "deleted", "pending", "quarantined"].includes(status) ? status : "available";
}

function normalizeStorageKind(value) {
  const storageKind = String(value || "").trim().toLowerCase();

  return ["internal", "external"].includes(storageKind) ? storageKind : "";
}

function assertExtensionAllowedByWorkspacePolicy(extension, settings) {
  const normalizedExtension = normalizeExtension(extension);
  const mode = settings.fileTypePolicyMode || "safe_default";
  const allowed = new Set(settings.allowedExtensions || DEFAULT_SAFE_ALLOWED_EXTENSIONS);
  const blocked = new Set(settings.blockedExtensions || DEFAULT_BLOCKED_EXTENSIONS);

  if (blocked.has(normalizedExtension)) {
    throw new AppError("That file type is blocked by workspace Files settings.", 400);
  }
  if ((mode === "safe_default" || mode === "allowlist") && !allowed.has(normalizedExtension)) {
    throw new AppError("That file type is not allowed by workspace Files settings.", 400);
  }
}

function normalizeAttachmentListOptions(filters = {}) {
  const paginate = filters.allPages !== true && filters.all_pages !== "true";
  const limit = clampInteger(filters.limit || filters.pageSize || filters.page_size, DEFAULT_ATTACHMENT_LIMIT, 1, MAX_ATTACHMENT_LIMIT);
  const offset = clampInteger(filters.offset, 0, 0, Number.MAX_SAFE_INTEGER);
  const sort = normalizeOptionalText(filters.sort || filters.sortMode || filters.sort_mode) || "newest";

  return {
    limit,
    offset,
    paginate,
    sort: ATTACHMENT_SORT_MODES.has(sort) ? sort : "newest",
  };
}

function sortAttachmentsForReadModel(attachments = [], sortMode = "newest") {
  return [...attachments].sort((left, right) => {
    if (sortMode === "oldest") {
      return compareCreatedAsc(left, right) || compareFilenameAsc(left, right);
    }
    if (sortMode === "filename") {
      return compareFilenameAsc(left, right) || compareCreatedDesc(left, right);
    }
    if (sortMode === "size") {
      return compareFileSizeDesc(left, right) || compareCreatedDesc(left, right);
    }
    if (sortMode === "status") {
      return compareFileStatusAsc(left, right) || compareCreatedDesc(left, right);
    }

    return compareCreatedDesc(left, right) || compareFilenameAsc(left, right);
  });
}

function compareCreatedDesc(left = {}, right = {}) {
  return String(right.createdAt || right.created_at || "").localeCompare(String(left.createdAt || left.created_at || ""));
}

function compareCreatedAsc(left = {}, right = {}) {
  return String(left.createdAt || left.created_at || "").localeCompare(String(right.createdAt || right.created_at || ""));
}

function compareFilenameAsc(left = {}, right = {}) {
  return String(left.file?.displayName || left.file?.originalFilename || "").localeCompare(
    String(right.file?.displayName || right.file?.originalFilename || ""),
    undefined,
    { sensitivity: "base" },
  );
}

function compareFileSizeDesc(left = {}, right = {}) {
  return Number(right.file?.fileSizeBytes || 0) - Number(left.file?.fileSizeBytes || 0);
}

function compareFileStatusAsc(left = {}, right = {}) {
  return String(left.file?.status || "").localeCompare(String(right.file?.status || ""), undefined, { sensitivity: "base" });
}

function clampInteger(value, fallback, minimum, maximum) {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(Math.max(parsed, minimum), maximum);
}

function normalizeTargetIds(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  }

  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function isCategoryAllowed(category, allowedCategories = []) {
  return allowedCategories.length === 0 || allowedCategories.includes(category) || allowedCategories.includes("other");
}

function permissionForOperation(attachableType, operation) {
  if (operation === "read" || operation === "download") {
    return attachableType.requiredReadPermission || "files.view";
  }

  if (operation === "upload" || operation === "attach") {
    return attachableType.requiredAttachPermission || "files.upload";
  }

  if (operation === "delete" || operation === "remove") {
    return attachableType.requiredRemovePermission || attachableType.requiredAttachPermission || "files.delete";
  }

  return "";
}

function sanitizeFilename(value) {
  const filename = path.basename(String(value || "").replaceAll("\\", "/")).trim();

  if (!filename || filename === "." || filename === "..") {
    throw new AppError("Original filename is required.", 400);
  }

  return filename.replace(/[^\w .()[\]-]+/g, "_").slice(0, 180);
}

function normalizeRequiredText(value, message) {
  const text = String(value || "").trim();

  if (!text) {
    throw new AppError(message, 400);
  }

  return text;
}

function normalizeOptionalText(value, options = {}) {
  if (value === null || value === undefined) {
    return "";
  }

  const text = String(value).trim();
  return options.maxLength ? text.slice(0, options.maxLength) : text;
}

function normalizeReportReason(value) {
  const reason = normalizeOptionalText(value, { maxLength: 80 });
  const allowedReasons = new Set(["illegal", "abusive", "inappropriate", "security", "other"]);

  if (!allowedReasons.has(reason)) {
    throw new AppError("Report reason must be illegal, abusive, inappropriate, security, or other.", 400);
  }

  return reason;
}

function parseJsonObject(value) {
  if (!value) {
    return {};
  }

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function parseJsonArray(value) {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function defaultWorkspaceFileSettings(workspaceId) {
  return {
    allowedExtensions: [...DEFAULT_SAFE_ALLOWED_EXTENSIONS],
    blockedExtensions: [...DEFAULT_BLOCKED_EXTENSIONS],
    createdAt: "",
    fileTypePolicyMode: "safe_default",
    internalStorageLimitBytes: null,
    perUserStorageLimitBytes: null,
    updatedAt: "",
    workspaceId,
  };
}

function normalizeWorkspaceFileSettingsRow(row = {}) {
  return {
    allowedExtensions: normalizeExtensionList(parseJsonArray(row.allowed_extensions_json), DEFAULT_SAFE_ALLOWED_EXTENSIONS),
    blockedExtensions: normalizeExtensionList(parseJsonArray(row.blocked_extensions_json), DEFAULT_BLOCKED_EXTENSIONS),
    createdAt: row.created_at || "",
    fileTypePolicyMode: FILE_TYPE_POLICY_MODES.has(row.file_type_policy_mode) ? row.file_type_policy_mode : "safe_default",
    internalStorageLimitBytes: nullableInteger(row.internal_storage_limit_bytes),
    perUserStorageLimitBytes: nullableInteger(row.per_user_storage_limit_bytes),
    updatedAt: row.updated_at || "",
    workspaceId: row.workspace_id || "",
  };
}

function normalizeWorkspaceFileSettingsPayload(payload = {}, previous = defaultWorkspaceFileSettings("")) {
  const mode = String(payload.fileTypePolicyMode || payload.file_type_policy_mode || previous.fileTypePolicyMode || "safe_default").trim();

  return {
    allowedExtensions: normalizeExtensionList(payload.allowedExtensions || payload.allowed_extensions, previous.allowedExtensions),
    blockedExtensions: normalizeExtensionList(payload.blockedExtensions || payload.blocked_extensions, previous.blockedExtensions),
    fileTypePolicyMode: FILE_TYPE_POLICY_MODES.has(mode) ? mode : "safe_default",
    internalStorageLimitBytes: nullableInteger(payload.internalStorageLimitBytes ?? payload.internal_storage_limit_bytes ?? previous.internalStorageLimitBytes),
    perUserStorageLimitBytes: nullableInteger(payload.perUserStorageLimitBytes ?? payload.per_user_storage_limit_bytes ?? previous.perUserStorageLimitBytes),
  };
}

function normalizeExtensionList(value, fallback = []) {
  const source = Array.isArray(value) ? value : String(value || "").split(/[\s,]+/);
  const normalized = source
    .map(normalizeExtension)
    .filter(Boolean)
    .filter((extension, index, list) => list.indexOf(extension) === index);

  return normalized.length > 0 ? normalized : [...fallback];
}

function normalizeExtension(value) {
  const text = String(value || "").trim().toLowerCase();

  if (!text) {
    return "";
  }

  const extension = text.startsWith(".") ? text : `.${text}`;
  return /^\.[a-z0-9]+$/.test(extension) ? extension : "";
}

function nullableInteger(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function sqlNullableInteger(value) {
  const parsed = nullableInteger(value);
  return parsed === null ? "NULL" : sqlInteger(parsed);
}

function shapeWorkspaceFileSettings(settings) {
  return {
    allowedExtensions: settings.allowedExtensions || [],
    blockedExtensions: settings.blockedExtensions || [],
    createdAt: settings.createdAt || "",
    fileTypePolicyMode: settings.fileTypePolicyMode || "safe_default",
    internalStorageLimitBytes: settings.internalStorageLimitBytes,
    perUserStorageLimitBytes: settings.perUserStorageLimitBytes,
    policyModes: [...FILE_TYPE_POLICY_MODES],
    updatedAt: settings.updatedAt || "",
    workspaceId: settings.workspaceId || "",
  };
}

function mergeFileMetadata(value, patch = {}) {
  return {
    ...parseJsonObject(value),
    ...patch,
  };
}

function normalizeRestorableStatus(previousStatus, scanStatus) {
  if (previousStatus === "quarantined") {
    return "quarantined";
  }
  if (previousStatus === "pending") {
    return "pending";
  }
  if (["not_required", "passed"].includes(scanStatus)) {
    return "available";
  }

  return "pending";
}

function shapeStorageAccountingRow(row) {
  return {
    availabilityStatus: row.availability_status || "",
    calculatedAt: row.calculated_at,
    externalReportedBytes: Number(row.external_reported_bytes || 0),
    externalSourceProvider: row.external_source_provider || "",
    fileCount: Number(row.file_count || 0),
    internalBytes: Number(row.internal_bytes || 0),
    storageAccountingId: row.storage_accounting_id,
    storageKind: row.storage_kind,
    storageProvider: row.storage_provider || "",
    userId: row.user_id || "",
    workspaceId: row.workspace_id,
  };
}

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

function storageAccountingId(scope = {}) {
  return [
    scope.workspaceId || "",
    scope.storageKind || "",
    scope.userId || "",
    scope.storageProvider || "",
    scope.externalSourceProvider || "",
    scope.availabilityStatus || "",
  ].join(":");
}

async function recordFileAudit(session, event = {}) {
  return auditService.record({
    session,
    action: event.action,
    changeType: event.changeType || "update",
    recordType: "file",
    recordId: event.recordId,
    recordLabel: event.recordLabel,
    recordUrl: "files",
    metadata: event.metadata || {},
    allowUnknownRecordType: true,
    force: true,
  });
}

export const filesService = {
  attachExistingFile,
  assertCanUseAttachableTarget,
  countAttachmentsForTargets,
  deleteFile,
  downloadFile,
  emitFileLifecycleEvent,
  getFileStorageAdapter,
  listActiveAttachableTypes,
  listAttachableTypes,
  listAttachments,
  listFileLifecycleEvents,
  listFileStatuses,
  listScanStatuses,
  quarantineFile,
  readFileForSession,
  readWorkspaceFileSettings,
  readStorageAccounting,
  recordExternalStorageAccounting,
  registerFileScannerAdapter,
  registerFileStorageAdapter,
  removeAttachment,
  reportFile,
  resolveAttachableType,
  restoreFile,
  refreshStorageAccounting,
  saveWorkspaceFileSettings,
  uploadAndAttach,
  uploadBatchAndAttach,
};
