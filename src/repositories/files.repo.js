// @ts-check

import { db } from "../core/database.js";
import { AppError } from "../utils/app-error.js";

/** @typedef {import("../types/database-contracts.js").DatabaseAdapter} DatabaseAdapter */
/** @typedef {import("../types/database-contracts.js").TransactionClient} TransactionClient */
/** @typedef {import("../types/database-contracts.js").DatabaseNamedParameterInput} DatabaseNamedParameterInput */
/** @typedef {import("../types/files-repository-contracts.js").AttachmentRow} AttachmentRow */
/** @typedef {import("../types/files-repository-contracts.js").AttachableTargetRow} AttachableTargetRow */
/** @typedef {import("../types/files-repository-contracts.js").FileRow} FileRow */
/** @typedef {import("../types/files-repository-contracts.js").LabelRow} LabelRow */
/** @typedef {import("../types/files-repository-contracts.js").NameRow} NameRow */
/** @typedef {import("../types/files-repository-contracts.js").StorageAccountingRow} StorageAccountingRow */
/** @typedef {import("../types/files-repository-contracts.js").StorageObjectRow} StorageObjectRow */
/** @typedef {import("../types/files-repository-contracts.js").StorageQuotaUsageRow} StorageQuotaUsageRow */
/** @typedef {import("../types/files-repository-contracts.js").TableColumnRow} TableColumnRow */
/** @typedef {import("../types/files-repository-contracts.js").WorkspaceFileSettingsRow} WorkspaceFileSettingsRow */
/** @typedef {import("../types/files-repository-contracts.js").WorkspaceTypeRow} WorkspaceTypeRow */
/** @typedef {Record<string, unknown>} LooseRecord */
/** @typedef {import("../types/framework-contracts.js").AttachableTypeContribution & {moduleId: string, targetType: string, tableName: string, idField: string, labelField: string, workspaceField: string}} AttachableType */
/** @typedef {{clientField: string, idField: string, labelField: string, projectField: string, tableName: string, workspaceField: string}} AttachableTargetFields */
/** @typedef {{limit: number, offset: number, paginate: boolean, sort: string}} AttachmentListOptions */

const ATTACHMENT_SELECT_COLUMNS = `
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
  files.created_at AS file_created_at,
  files.updated_at AS file_updated_at,
  files.uploaded_by_user_id AS file_uploaded_by_user_id,
  files.quarantine_reason,
  files.deleted_at AS file_deleted_at
`;

/**
 * @param {{canManageQuarantine: boolean, contextScope: LooseRecord, filters: LooseRecord, listOptions: AttachmentListOptions, page?: {limit: number, offset: number}, statusFilter: string, targetScopedRead: boolean, workspaceId: string}} options
 */
async function readAttachmentRows(options) {
  const { conditions, params } = buildAttachmentReadQuery(options);
  const pageSql = options.page
    ? "\nLIMIT :attachmentPageLimit\nOFFSET :attachmentPageOffset"
    : "";
  if (options.page) {
    params.attachmentPageLimit = options.page.limit;
    params.attachmentPageOffset = options.page.offset;
  }

  return /** @type {AttachmentRow[]} */ (await db.query(`
SELECT ${ATTACHMENT_SELECT_COLUMNS}
FROM file_attachments
INNER JOIN files
  ON files.workspace_id = file_attachments.workspace_id
  AND files.file_id = file_attachments.file_id
WHERE ${conditions.join("\n  AND ")}
ORDER BY ${attachmentOrderByClause(options.listOptions.sort)}${pageSql};
`, params));
}

/**
 * @param {{canManageQuarantine: boolean, contextScope: LooseRecord, filters: LooseRecord, statusFilter: string, targetScopedRead: boolean, workspaceId: string}} options
 */
function buildAttachmentReadQuery(options) {
  /** @type {Record<string, DatabaseNamedParameterInput>} */
  const params = { attachmentWorkspaceId: options.workspaceId };
  const conditions = [
    "file_attachments.workspace_id = :attachmentWorkspaceId",
    "file_attachments.removed_at IS NULL",
  ];
  const filters = options.filters;

  if (options.statusFilter === "all" && options.canManageQuarantine) {
    conditions.push("files.status IN ('pending', 'available', 'quarantined', 'deleted')");
  } else if (options.statusFilter === "quarantined" && options.canManageQuarantine) {
    conditions.push("files.status = 'quarantined'");
  } else if (options.statusFilter === "pending" && options.canManageQuarantine) {
    conditions.push("files.status = 'pending'");
  } else if (options.statusFilter === "deleted") {
    conditions.push("files.status = 'deleted'");
  } else if (options.statusFilter === "all") {
    conditions.push("files.status IN ('available', 'deleted')");
    conditions.push("files.scan_status IN ('not_required', 'passed')");
  } else if (options.targetScopedRead && !(filters.status || filters.fileStatus || filters.file_status)) {
    conditions.push(`(
      (files.status IN ('available', 'deleted') AND files.scan_status IN ('not_required', 'passed'))
      OR (files.status = 'pending' AND files.scan_status = 'pending')
    )`);
  } else {
    conditions.push("files.status = 'available'");
    conditions.push("files.scan_status IN ('not_required', 'passed')");
  }

  if (filters.fileId || filters.file_id) {
    conditions.push("file_attachments.file_id = :attachmentFileId");
    params.attachmentFileId = String(filters.fileId || filters.file_id);
  }
  if (filters.moduleId || filters.module_id) {
    conditions.push("file_attachments.module_id = :attachmentModuleId");
    params.attachmentModuleId = String(filters.moduleId || filters.module_id);
  }
  if (filters.targetType || filters.target_type) {
    conditions.push("file_attachments.target_type = :attachmentTargetType");
    params.attachmentTargetType = String(filters.targetType || filters.target_type);
  }
  if (filters.targetId || filters.target_id) {
    conditions.push("file_attachments.target_id = :attachmentTargetId");
    params.attachmentTargetId = String(filters.targetId || filters.target_id);
  }
  applyAttachmentContextScopeFilters(conditions, options.contextScope, params);
  if (filters.filename || filters.fileName || filters.q) {
    const filename = String(filters.filename || filters.fileName || filters.q || "").trim();
    if (filename) {
      params.attachmentFilenamePattern = db.dialect.comparison.likePattern(filename, { mode: "contains" });
      conditions.push(`(
        ${db.dialect.comparison.containsNoCase("files.original_filename", ":attachmentFilenamePattern")}
        OR ${db.dialect.comparison.containsNoCase("files.display_name", ":attachmentFilenamePattern")}
      )`);
    }
  }

  return { conditions, params };
}

/** @param {string} workspaceId @param {unknown} fileId */
async function readFile(workspaceId, fileId) {
  return /** @type {FileRow | null} */ (await db.get(`
SELECT *
FROM files
WHERE workspace_id = :workspaceId
  AND file_id = :fileId
LIMIT 1;
`, { fileId: String(fileId || ""), workspaceId }));
}

/** @param {string} workspaceId @param {unknown} attachmentId */
async function readAttachmentById(workspaceId, attachmentId) {
  return /** @type {AttachmentRow | null} */ (await db.get(`
SELECT ${ATTACHMENT_SELECT_COLUMNS}
FROM file_attachments
INNER JOIN files
  ON files.workspace_id = file_attachments.workspace_id
  AND files.file_id = file_attachments.file_id
WHERE file_attachments.workspace_id = :workspaceId
  AND file_attachments.file_attachment_id = :attachmentId
LIMIT 1;
`, { attachmentId: String(attachmentId || ""), workspaceId }));
}

/** @param {string} workspaceId @param {unknown} fileId */
async function readActiveAttachmentsForFile(workspaceId, fileId) {
  return /** @type {AttachmentRow[]} */ (await db.query(`
SELECT ${ATTACHMENT_SELECT_COLUMNS}
FROM file_attachments
INNER JOIN files
  ON files.workspace_id = file_attachments.workspace_id
  AND files.file_id = file_attachments.file_id
WHERE file_attachments.workspace_id = :workspaceId
  AND file_attachments.file_id = :fileId
  AND file_attachments.removed_at IS NULL;
`, { fileId: String(fileId || ""), workspaceId }));
}

/** @param {{attachmentId: string, removedAt: string, workspaceId: string}} input */
async function removeAttachment(input) {
  return db.run(`
UPDATE file_attachments
SET removed_at = :removedAt
WHERE workspace_id = :workspaceId
  AND file_attachment_id = :attachmentId;
`, input);
}

/** @param {{attachmentClientId: string|null, attachmentId: string, attachmentModuleId: string, attachmentProjectId: string|null, attachmentTargetId: string, attachmentTargetType: string, attachmentWorkspaceId: string}} input */
async function updateAttachmentContext(input) {
  return db.run(`
UPDATE file_attachments
SET module_id = :attachmentModuleId,
    target_type = :attachmentTargetType,
    target_id = :attachmentTargetId,
    client_id = :attachmentClientId,
    project_id = :attachmentProjectId
WHERE workspace_id = :attachmentWorkspaceId
  AND file_attachment_id = :attachmentId;
`, input);
}

/** @param {{deletedAt: string, fileId: string, metadataJson: string, updatedAt: string, workspaceId: string}} input */
async function softDeleteFile(input) {
  return db.run(`
UPDATE files
SET status = 'deleted',
    deleted_at = :deletedAt,
    updated_at = :updatedAt,
    metadata_json = :metadataJson
WHERE workspace_id = :workspaceId
  AND file_id = :fileId;
`, input);
}

/** @param {{fileId: string, fileStatus: string, metadataJson: string, updatedAt: string, workspaceId: string}} input */
async function restoreFile(input) {
  return db.run(`
UPDATE files
SET status = :fileStatus,
    deleted_at = NULL,
    updated_at = :updatedAt,
    metadata_json = :metadataJson
WHERE workspace_id = :workspaceId
  AND file_id = :fileId;
`, input);
}

/** @param {{fileId: string, updatedAt: string, workspaceId: string}} input */
async function markQuarantinedFileReviewed(input) {
  return db.run(`
UPDATE files
SET status = 'available',
    quarantine_reason = NULL,
    updated_at = :updatedAt
WHERE workspace_id = :workspaceId
  AND file_id = :fileId;
`, input);
}

/** @param {{fileId: string, quarantineReason: string, updatedAt: string, workspaceId: string}} input */
async function quarantineFile(input) {
  return db.run(`
UPDATE files
SET status = 'quarantined',
    quarantine_reason = :quarantineReason,
    updated_at = :updatedAt
WHERE workspace_id = :workspaceId
  AND file_id = :fileId;
`, input);
}

/** @param {{fileId: string, fileStatus: string, quarantineReason: string|null, scanStatus: string, updatedAt: string, workspaceId: string}} input */
async function updateScanResult(input) {
  return db.run(`
UPDATE files
SET status = :fileStatus,
    scan_status = :scanStatus,
    quarantine_reason = :quarantineReason,
    updated_at = :updatedAt
WHERE workspace_id = :workspaceId
  AND file_id = :fileId;
`, input);
}

/** @param {{storageKind: string, workspaceId: string}} input */
async function readStorageAccounting(input) {
  /** @type {Record<string, DatabaseNamedParameterInput>} */
  const params = { workspaceId: input.workspaceId };
  const conditions = ["workspace_id = :workspaceId"];
  if (input.storageKind) {
    conditions.push("storage_kind = :storageKind");
    params.storageKind = input.storageKind;
  }
  return /** @type {StorageAccountingRow[]} */ (await db.query(`
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
`, params));
}

/** @param {{accountingId: string, availabilityStatus: string, calculatedAt: string, externalReportedBytes: number, fileCount: number, sourceProvider: string, userId: string, workspaceId: string}} input */
async function upsertExternalStorageAccounting(input) {
  return db.run(`${db.dialect.conflict.buildInsertOnConflictDoUpdate({
    columns: [
      "storage_accounting_id", "workspace_id", "user_id", "storage_kind", "storage_provider",
      "external_source_provider", "availability_status", "file_count", "internal_bytes",
      "external_reported_bytes", "calculated_at", "metadata_json",
    ],
    conflictColumns: [
      "workspace_id", "user_id", "storage_kind", "storage_provider",
      "external_source_provider", "availability_status",
    ],
    tableName: "file_storage_accounting",
    updateColumns: ["file_count", "internal_bytes", "external_reported_bytes", "calculated_at", "metadata_json"],
    valueExpressions: {
      storage_accounting_id: ":accountingId", workspace_id: ":workspaceId", user_id: ":userId",
      storage_kind: ":storageKind", storage_provider: ":storageProvider",
      external_source_provider: ":sourceProvider", availability_status: ":availabilityStatus",
      file_count: ":fileCount", internal_bytes: ":internalBytes",
      external_reported_bytes: ":externalReportedBytes", calculated_at: ":calculatedAt",
      metadata_json: ":metadataJson",
    },
  })};`, {
    ...input,
    internalBytes: 0,
    metadataJson: JSON.stringify({ source: "external_accounting_contract" }),
    storageKind: "external",
    storageProvider: "external",
  });
}

/** @param {string} workspaceId */
async function readWorkspaceFileSettings(workspaceId) {
  return /** @type {WorkspaceFileSettingsRow | null} */ (await db.get(`
SELECT *
FROM file_workspace_settings
WHERE workspace_id = :workspaceId
LIMIT 1;
`, { workspaceId }));
}

/** @param {{allowedExtensionsJson: string, blockedExtensionsJson: string, createdAt: string, fileTypePolicyMode: string, internalStorageLimitBytes: number|null, metadataJson: string, perUserStorageLimitBytes: number|null, updatedAt: string, workspaceId: string}} input */
async function createWorkspaceFileSettingsIfMissing(input) {
  return db.run(`${db.dialect.conflict.buildInsertOrIgnore({
    columns: [
      "workspace_id", "file_type_policy_mode", "allowed_extensions_json", "blocked_extensions_json",
      "internal_storage_limit_bytes", "per_user_storage_limit_bytes", "created_at", "updated_at", "metadata_json",
    ],
    tableName: "file_workspace_settings",
    valueExpressions: {
      workspace_id: ":workspaceId", file_type_policy_mode: ":fileTypePolicyMode",
      allowed_extensions_json: ":allowedExtensionsJson", blocked_extensions_json: ":blockedExtensionsJson",
      internal_storage_limit_bytes: ":internalStorageLimitBytes", per_user_storage_limit_bytes: ":perUserStorageLimitBytes",
      created_at: ":createdAt", updated_at: ":updatedAt", metadata_json: ":metadataJson",
    },
  })};`, input);
}

/** @param {{allowedExtensionsJson: string, blockedExtensionsJson: string, createdAt: string, fileTypePolicyMode: string, internalStorageLimitBytes: number|null, metadataJson: string, perUserStorageLimitBytes: number|null, updatedAt: string, workspaceId: string}} input */
async function saveWorkspaceFileSettings(input) {
  return db.run(`${db.dialect.conflict.buildInsertOnConflictDoUpdate({
    columns: [
      "workspace_id", "file_type_policy_mode", "allowed_extensions_json", "blocked_extensions_json",
      "internal_storage_limit_bytes", "per_user_storage_limit_bytes", "created_at", "updated_at", "metadata_json",
    ],
    conflictColumns: ["workspace_id"],
    tableName: "file_workspace_settings",
    updateColumns: [
      "file_type_policy_mode", "allowed_extensions_json", "blocked_extensions_json",
      "internal_storage_limit_bytes", "per_user_storage_limit_bytes", "updated_at", "metadata_json",
    ],
    valueExpressions: {
      workspace_id: ":workspaceId", file_type_policy_mode: ":fileTypePolicyMode",
      allowed_extensions_json: ":allowedExtensionsJson", blocked_extensions_json: ":blockedExtensionsJson",
      internal_storage_limit_bytes: ":internalStorageLimitBytes", per_user_storage_limit_bytes: ":perUserStorageLimitBytes",
      created_at: ":createdAt", updated_at: ":updatedAt", metadata_json: ":metadataJson",
    },
  })};`, input);
}

/** @param {TransactionClient} transaction @param {{attachmentId: string|null, createdAt: string, fileId: string, notes: string|null, reason: string, reportedByUserId: string, reportId: string, workspaceId: string}} input */
async function createFileReport(transaction, input) {
  return transaction.run(`
INSERT INTO file_reports (
  file_report_id, workspace_id, file_id, file_attachment_id, report_reason,
  report_notes, reported_by_user_id, created_at, metadata_json
)
VALUES (
  :reportId, :workspaceId, :fileId, :attachmentId, :reason,
  :notes, :reportedByUserId, :createdAt, :metadataJson
);
`, { ...input, metadataJson: JSON.stringify({ source: "browser_api" }) });
}

/** @param {TransactionClient} transaction @param {{fileId: string, quarantineReason: string, updatedAt: string, workspaceId: string}} input */
async function markFileReported(transaction, input) {
  return transaction.run(`
UPDATE files
SET status = 'quarantined',
    quarantine_reason = :quarantineReason,
    updated_at = :updatedAt
WHERE workspace_id = :workspaceId
  AND file_id = :fileId
  AND status != 'deleted';
`, input);
}

/** @param {{createdAt: string, displayName: string, extension: string, fileId: string, fileSizeBytes: number, metadataJson: string, mimeTypeClaimed: string, mimeTypeDetected: string, originalFilename: string, sha256Hash: string, storageKey: string, storageProvider: string, storedFilename: string, uploadedByUserId: string, workspaceId: string}} input */
async function createFile(input) {
  return db.run(`
INSERT INTO files (
  file_id, workspace_id, storage_provider, storage_key, original_filename, stored_filename,
  display_name, extension, mime_type_claimed, mime_type_detected, file_size_bytes, sha256_hash,
  status, scan_status, quarantine_reason, uploaded_by_user_id, created_at, updated_at, deleted_at, metadata_json
)
VALUES (
  :fileId, :workspaceId, :storageProvider, :storageKey, :originalFilename, :storedFilename,
  :displayName, :extension, :mimeTypeClaimed, :mimeTypeDetected, :fileSizeBytes, :sha256Hash,
  'pending', 'pending', NULL, :uploadedByUserId, :createdAt, :createdAt, NULL, :metadataJson
);
`, input);
}

/** @param {TransactionClient} transaction @param {string} workspaceId @param {string} calculatedAt */
async function replaceInternalStorageAccounting(transaction, workspaceId, calculatedAt) {
  await transaction.run(`
DELETE FROM file_storage_accounting
WHERE workspace_id = :workspaceId
  AND storage_kind = 'internal';
`, { workspaceId });
  await transaction.run(`
INSERT INTO file_storage_accounting (
  storage_accounting_id, workspace_id, user_id, storage_kind, storage_provider,
  external_source_provider, availability_status, file_count, internal_bytes,
  external_reported_bytes, calculated_at, metadata_json
)
SELECT
  workspace_id || ':internal:' || COALESCE(uploaded_by_user_id, '') || ':' || COALESCE(storage_provider, 'local') || ':' || COALESCE(status, ''),
  workspace_id, COALESCE(uploaded_by_user_id, ''), 'internal', COALESCE(storage_provider, 'local'),
  '', COALESCE(status, ''), COUNT(*), COALESCE(SUM(file_size_bytes), 0), 0, :calculatedAt, '{}'
FROM files
WHERE workspace_id = :workspaceId
  AND COALESCE(storage_kind, 'internal') = 'internal'
  AND status IN (:storageStatuses)
GROUP BY workspace_id, COALESCE(uploaded_by_user_id, ''), COALESCE(storage_provider, 'local'), COALESCE(status, '');
`, {
    calculatedAt,
    storageStatuses: ["pending", "available", "quarantined", "deleted"],
    workspaceId,
  });
}

/** @param {{attachedByUserId: string, attachmentId: string, attachmentRole: string|null, caption: string|null, clientId: string|null, createdAt: string, fileId: string, metadataJson: string, moduleId: string, projectId: string|null, sortOrder: number, targetId: string, targetType: string, visibility: string, workspaceId: string}} input */
async function createAttachment(input) {
  return db.run(`
INSERT INTO file_attachments (
  file_attachment_id, workspace_id, file_id, module_id, target_type, target_id,
  client_id, project_id, visibility, attachment_role, caption, sort_order,
  attached_by_user_id, created_at, removed_at, metadata_json
)
VALUES (
  :attachmentId, :workspaceId, :fileId, :moduleId, :targetType, :targetId,
  :clientId, :projectId, :visibility, :attachmentRole, :caption, :sortOrder,
  :attachedByUserId, :createdAt, NULL, :metadataJson
);
`, input);
}

/** @param {string} workspaceId @param {string} targetId @param {AttachableTargetFields} fields */
async function readAttachableTarget(workspaceId, targetId, fields) {
  const tableName = safeSqlIdentifier(fields.tableName);
  const idField = safeSqlIdentifier(fields.idField);
  const labelField = safeSqlIdentifier(fields.labelField);
  const workspaceField = safeSqlIdentifier(fields.workspaceField);
  const clientField = fields.clientField ? safeSqlIdentifier(fields.clientField) : "";
  const projectField = fields.projectField ? safeSqlIdentifier(fields.projectField) : "";
  return /** @type {AttachableTargetRow | null} */ (await db.get(`
SELECT
  ${idField} AS target_id,
  ${labelField} AS target_label,
  ${workspaceField} AS workspace_id
  ${clientField ? `, ${clientField} AS client_id` : ", NULL AS client_id"}
  ${projectField ? `, ${projectField} AS project_id` : ", NULL AS project_id"}
FROM ${tableName}
WHERE ${workspaceField} = :attachableTargetWorkspaceId
  AND ${idField} = :attachableTargetId
LIMIT 1;
`, { attachableTargetId: targetId, attachableTargetWorkspaceId: workspaceId }));
}

/** @param {string} workspaceId @param {string} userId */
async function readInternalStorageQuotaUsage(workspaceId, userId) {
  return /** @type {StorageQuotaUsageRow | null} */ (await db.get(`
SELECT
  COALESCE(SUM(file_size_bytes), 0) AS workspace_bytes,
  COALESCE(SUM(CASE WHEN uploaded_by_user_id = :userId THEN file_size_bytes ELSE 0 END), 0) AS user_bytes
FROM files
WHERE workspace_id = :workspaceId
  AND COALESCE(storage_kind, 'internal') = 'internal'
  AND status IN (:storageStatuses);
`, { storageStatuses: ["pending", "available", "quarantined", "deleted"], userId, workspaceId }));
}

/** @param {string} workspaceId @param {DatabaseAdapter|TransactionClient} [database] */
async function readWorkspaceStorageObjects(workspaceId, database = db) {
  return /** @type {StorageObjectRow[]} */ (await database.query(`
SELECT storage_provider, storage_key, file_size_bytes
FROM files
WHERE workspace_id = :workspaceId
  AND storage_kind = 'internal'
ORDER BY file_id;
`, { workspaceId }));
}

/** @param {string} workspaceId @param {string} clientId @param {string} projectId */
async function readAttachmentContextLabels(workspaceId, clientId, projectId) {
  const [clientRow, projectRow] = await Promise.all([
    clientId
      ? /** @type {Promise<NameRow|null>} */ (db.get(`SELECT name FROM clients WHERE workspace_id = :workspaceId AND id = :recordId LIMIT 1;`, { recordId: clientId, workspaceId }))
      : Promise.resolve(null),
    projectId
      ? /** @type {Promise<NameRow|null>} */ (db.get(`SELECT name FROM projects WHERE workspace_id = :workspaceId AND id = :recordId LIMIT 1;`, { recordId: projectId, workspaceId }))
      : Promise.resolve(null),
  ]);
  return { clientLabel: clientRow?.name || "", projectLabel: projectRow?.name || "" };
}

/** @param {string} workspaceId */
async function readWorkspaceType(workspaceId) {
  return /** @type {WorkspaceTypeRow | null} */ (await db.get(`
SELECT workspace_type
FROM workspaces
WHERE workspace_id = :workspaceId
LIMIT 1;
`, { workspaceId }));
}

/** @param {string} workspaceId @param {AttachableType} attachableType @param {LooseRecord} filters @param {LooseRecord} contextScope @param {string} workspaceType @param {number} limit @param {AttachableTargetFields} fields */
async function readAttachableTargetOptionRows(workspaceId, attachableType, filters, contextScope, workspaceType, limit, fields) {
  const tableName = safeSqlIdentifier(fields.tableName);
  const idField = safeSqlIdentifier(fields.idField);
  const labelField = safeSqlIdentifier(fields.labelField);
  const workspaceField = safeSqlIdentifier(fields.workspaceField);
  const clientField = fields.clientField ? safeSqlIdentifier(fields.clientField) : "";
  const projectField = fields.projectField ? safeSqlIdentifier(fields.projectField) : "";
  const columns = await readTableColumnSet(tableName);
  const labelExpression = `COALESCE(${labelField}, '')`;
  /** @type {Record<string, DatabaseNamedParameterInput>} */
  const params = { attachableTargetLimit: limit, attachableTargetWorkspaceId: workspaceId };
  const conditions = [
    `${workspaceField} = :attachableTargetWorkspaceId`,
    ...attachableTargetActiveConditions(columns),
    ...attachableTargetFilterConditions(attachableType, contextScope, workspaceType, { clientField, idField, projectField }, params),
  ];
  if (filters.search) {
    params.attachableTargetSearchPattern = db.dialect.comparison.likePattern(filters.search, { mode: "contains" });
    conditions.push(db.dialect.comparison.containsNoCase(labelExpression, ":attachableTargetSearchPattern"));
  }
  return /** @type {AttachableTargetRow[]} */ (await db.query(`
SELECT
  ${idField} AS target_id,
  ${labelField} AS target_label,
  ${workspaceField} AS workspace_id
  ${clientField ? `, ${clientField} AS client_id` : ", NULL AS client_id"}
  ${projectField ? `, ${projectField} AS project_id` : ", NULL AS project_id"}
FROM ${tableName}
WHERE ${conditions.join("\n  AND ")}
ORDER BY ${db.dialect.comparison.orderByNoCase(labelExpression, "ASC")}, ${idField} ASC
LIMIT :attachableTargetLimit;
`, params));
}

/** @param {string} workspaceId @param {string[]} clientIds */
async function readClientLabels(workspaceId, clientIds) {
  if (clientIds.length === 0) return /** @type {LabelRow[]} */ ([]);
  return /** @type {LabelRow[]} */ (await db.query(`SELECT id, name FROM clients WHERE workspace_id = :workspaceId AND id IN (:recordIds);`, { recordIds: clientIds, workspaceId }));
}

/** @param {string} workspaceId @param {string[]} projectIds */
async function readProjectLabels(workspaceId, projectIds) {
  if (projectIds.length === 0) return /** @type {LabelRow[]} */ ([]);
  return /** @type {LabelRow[]} */ (await db.query(`SELECT id, name FROM projects WHERE workspace_id = :workspaceId AND id IN (:recordIds);`, { recordIds: projectIds, workspaceId }));
}

/** @param {string} tableName */
async function readTableColumnSet(tableName) {
  const rows = /** @type {TableColumnRow[]} */ (await db.query(db.dialect.introspection.tableInfo(safeSqlIdentifier(tableName))));
  return new Set(rows.map((row) => String(row.name || "")));
}

/** @param {{attachment: AttachmentRow, attachableType: AttachableType, target: AttachableTargetRow, workspaceId: string}} input */
async function findDuplicateActiveAttachment(input) {
  return db.get(`
SELECT file_attachment_id
FROM file_attachments
WHERE workspace_id = :attachmentWorkspaceId
  AND file_id = :attachmentFileId
  AND module_id = :attachmentModuleId
  AND target_type = :attachmentTargetType
  AND target_id = :attachmentTargetId
  AND file_attachment_id <> :attachmentId
  AND removed_at IS NULL
LIMIT 1;
`, {
    attachmentFileId: input.attachment.file_id,
    attachmentId: input.attachment.file_attachment_id,
    attachmentModuleId: input.attachableType.moduleId,
    attachmentTargetId: input.target.target_id,
    attachmentTargetType: input.attachableType.targetType,
    attachmentWorkspaceId: input.workspaceId,
  });
}

/** @param {string[]} conditions @param {LooseRecord} scope @param {Record<string, DatabaseNamedParameterInput>} params */
function applyAttachmentContextScopeFilters(conditions, scope, params) {
  if (scope.hasProjectFilter) {
    if (scope.projectFilterMode === "blank") {
      conditions.push("(file_attachments.project_id IS NULL OR file_attachments.project_id = '')");
    } else if (scope.projectFilterMode === "ids") {
      const projectIds = uniqueNonEmpty(Array.isArray(scope.projectIds) ? scope.projectIds : []);
      if (projectIds.length === 0) conditions.push("1 = 0");
      else {
        conditions.push("file_attachments.project_id IN (:attachmentProjectIds)");
        params.attachmentProjectIds = projectIds;
      }
    }
  }
  if (!scope.hasClientFilter || scope.omitClientFilterBecauseProjectSelected) return;
  if (scope.clientFilterMode === "blank") {
    conditions.push("(file_attachments.client_id IS NULL OR file_attachments.client_id = '')");
    return;
  }
  if (scope.clientFilterMode !== "ids") return;
  const clientIds = uniqueNonEmpty(Array.isArray(scope.clientIds) ? scope.clientIds : []);
  const clientProjectIds = uniqueNonEmpty(Array.isArray(scope.clientProjectIds) ? scope.clientProjectIds : []);
  if (clientIds.length === 0 && clientProjectIds.length === 0) {
    conditions.push("1 = 0");
    return;
  }
  const scopedConditions = [];
  if (clientIds.length > 0) {
    scopedConditions.push("file_attachments.client_id IN (:attachmentClientIds)");
    params.attachmentClientIds = clientIds;
  }
  if (clientProjectIds.length > 0) {
    scopedConditions.push("file_attachments.project_id IN (:attachmentClientProjectIds)");
    params.attachmentClientProjectIds = clientProjectIds;
  }
  conditions.push(`(${scopedConditions.join(" OR ")})`);
}

/** @param {Set<string>} columns */
function attachableTargetActiveConditions(columns) {
  const conditions = [];
  if (columns.has("deleted_at")) conditions.push("deleted_at IS NULL");
  if (columns.has("archived_at")) conditions.push("archived_at IS NULL");
  if (columns.has("removed_at")) conditions.push("removed_at IS NULL");
  if (columns.has("status")) conditions.push("LOWER(status) NOT IN ('archived', 'deleted', 'disabled', 'inactive')");
  return conditions;
}

/** @param {AttachableType} attachableType @param {LooseRecord} scope @param {string} workspaceType @param {{clientField: string, idField: string, projectField: string}} fields @param {Record<string, DatabaseNamedParameterInput>} params */
function attachableTargetFilterConditions(attachableType, scope, workspaceType, fields, params) {
  /** @type {string[]} */
  const conditions = [];
  applyAttachableProjectScopeFilter(conditions, attachableType, scope, fields, params);
  applyAttachableClientScopeFilter(conditions, attachableType, scope, workspaceType, fields, params);
  return conditions;
}

/** @param {string[]} conditions @param {AttachableType} attachableType @param {LooseRecord} scope @param {{clientField: string, idField: string, projectField: string}} fields @param {Record<string, DatabaseNamedParameterInput>} params */
function applyAttachableProjectScopeFilter(conditions, attachableType, scope, fields, params) {
  if (!scope.hasProjectFilter) return;
  if (scope.projectFilterMode === "blank") {
    if (attachableType.targetType === "project") conditions.push("1 = 0");
    else if (fields.projectField) conditions.push(`(${fields.projectField} IS NULL OR ${fields.projectField} = '')`);
    return;
  }
  if (scope.projectFilterMode !== "ids") return;
  const projectIds = uniqueNonEmpty(Array.isArray(scope.projectIds) ? scope.projectIds : []);
  if (projectIds.length === 0) {
    conditions.push("1 = 0");
    return;
  }
  if (attachableType.targetType === "project") {
    params.attachableTargetProjectIds = projectIds;
    conditions.push(`${fields.idField} IN (:attachableTargetProjectIds)`);
  } else if (fields.projectField) {
    params.attachableTargetProjectIds = projectIds;
    conditions.push(`${fields.projectField} IN (:attachableTargetProjectIds)`);
  } else {
    conditions.push("1 = 0");
  }
}

/** @param {string[]} conditions @param {AttachableType} attachableType @param {LooseRecord} scope @param {string} workspaceType @param {{clientField: string, idField: string, projectField: string}} fields @param {Record<string, DatabaseNamedParameterInput>} params */
function applyAttachableClientScopeFilter(conditions, attachableType, scope, workspaceType, fields, params) {
  if (workspaceType !== "business" || !scope.hasClientFilter || scope.omitClientFilterBecauseProjectSelected) return;
  if (scope.clientFilterMode === "blank") {
    if (attachableType.targetType === "client") conditions.push("1 = 0");
    else if (fields.clientField) conditions.push(`(${fields.clientField} IS NULL OR ${fields.clientField} = '')`);
    return;
  }
  if (scope.clientFilterMode !== "ids") return;
  const clientIds = uniqueNonEmpty(Array.isArray(scope.clientIds) ? scope.clientIds : []);
  const clientProjectIds = uniqueNonEmpty(Array.isArray(scope.clientProjectIds) ? scope.clientProjectIds : []);
  if (clientIds.length === 0 && clientProjectIds.length === 0) {
    conditions.push("1 = 0");
    return;
  }
  if (attachableType.targetType === "client") {
    if (clientIds.length === 0) conditions.push("1 = 0");
    else {
      params.attachableTargetClientIds = clientIds;
      conditions.push(`${fields.idField} IN (:attachableTargetClientIds)`);
    }
    return;
  }
  const scopedConditions = [];
  if (fields.clientField && clientIds.length > 0) {
    params.attachableTargetClientIds = clientIds;
    scopedConditions.push(`${fields.clientField} IN (:attachableTargetClientIds)`);
  }
  if (attachableType.targetType === "project" && clientProjectIds.length > 0) {
    params.attachableTargetClientProjectIds = clientProjectIds;
    scopedConditions.push(`${fields.idField} IN (:attachableTargetClientProjectIds)`);
  } else if (fields.projectField && clientProjectIds.length > 0) {
    params.attachableTargetClientProjectIds = clientProjectIds;
    scopedConditions.push(`${fields.projectField} IN (:attachableTargetClientProjectIds)`);
  }
  conditions.push(scopedConditions.length > 0 ? `(${scopedConditions.join(" OR ")})` : "1 = 0");
}

/** @param {unknown} value */
function safeSqlIdentifier(value) {
  const identifier = String(value || "").trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(identifier)) {
    throw new AppError("Attachable target metadata is invalid.", 500);
  }
  return identifier;
}

/** @param {unknown[]} values */
function uniqueNonEmpty(values) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

/** @param {string} sortMode */
function attachmentOrderByClause(sortMode = "newest") {
  if (sortMode === "oldest") return "file_attachments.created_at ASC, file_attachments.file_attachment_id ASC";
  if (sortMode === "filename") return `${db.dialect.comparison.orderByNoCase("COALESCE(files.display_name, files.original_filename, '')", "ASC")}, file_attachments.created_at DESC, file_attachments.file_attachment_id ASC`;
  if (sortMode === "size") return "files.file_size_bytes DESC, file_attachments.created_at DESC, file_attachments.file_attachment_id ASC";
  if (sortMode === "status") return `${db.dialect.comparison.orderByNoCase("files.status", "ASC")}, file_attachments.created_at DESC, file_attachments.file_attachment_id ASC`;
  return "file_attachments.created_at DESC, file_attachments.file_attachment_id ASC";
}

export const filesRepo = {
  createAttachment,
  createFile,
  createFileReport,
  createWorkspaceFileSettingsIfMissing,
  findDuplicateActiveAttachment,
  markFileReported,
  markQuarantinedFileReviewed,
  quarantineFile,
  readActiveAttachmentsForFile,
  readAttachableTarget,
  readAttachableTargetOptionRows,
  readAttachmentById,
  readAttachmentContextLabels,
  readAttachmentRows,
  readClientLabels,
  readFile,
  readInternalStorageQuotaUsage,
  readProjectLabels,
  readStorageAccounting,
  readWorkspaceFileSettings,
  readWorkspaceStorageObjects,
  readWorkspaceType,
  removeAttachment,
  replaceInternalStorageAccounting,
  restoreFile,
  saveWorkspaceFileSettings,
  softDeleteFile,
  updateAttachmentContext,
  updateScanResult,
  upsertExternalStorageAccounting,
};
