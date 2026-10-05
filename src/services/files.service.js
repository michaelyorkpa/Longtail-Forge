import { createHash } from "node:crypto";
import path from "node:path";
import { Transform } from "node:stream";
import { modulesService } from "../core/modules/modules.service.js";
import {
  FILE_LIFECYCLE_EVENTS,
  FILE_SCAN_STATUS_SET,
  FILE_STATUS_SET,
  isFileLifecycleEvent,
  sanitizeFileLifecyclePayload,
} from "../core/files/file-lifecycle.js";
import { boundedPaginationEnvelope, normalizeBoundedPagination } from "../core/bounded-pagination.js";
import { createRecordId } from "../core/identifiers.js";
import { createLocalFileStorageAdapter } from "../core/files/local-storage-adapter.js";
import { createS3FileStorageAdapter } from "../core/files/s3-storage-adapter.js";
import {
  CreateFileBatchSchema,
  CreateFileSchema,
  FileAttachmentSchema,
  FileMetadataSchema,
  FilePreviewRequestSchema,
  FileStorageAdapterConfigSchema,
  UpdateFileContextSchema,
  parseFilesEdgePayload,
} from "../core/files/files.contracts.js";
import { config } from "../config.js";
import { db } from "../core/database.js";
import { filesRepo } from "../repositories/files.repo.js";
import { permissionsService } from "./permissions.service.js";
import { auditService } from "./audit.service.js";
import { FILE_SCAN_JOB_TYPE, filesScannerJobService } from "./files-scanner-job.service.js";
import { filesPreviewService } from "./files-preview.service.js";
import { filesStorageAccountingService } from "./files-storage-accounting.service.js";
import { AppError } from "../utils/app-error.js";
import { notesService } from "../modules/notes/notes.service.js";
import { resolveClientProjectFilterScope } from "../core/client-project-filter-scope.js";
import { registerFrameworkSettingDefinition } from "../core/settings/framework-settings-registry.js";
import { registerPersistenceHandler } from "../core/settings/settings-behavior-registry.js";
import { assertPublicDemoCapabilityAllowed } from "../core/public-demo-enforcement.js";

/** @typedef {import("../types/http-contracts.js").WorkspaceRequestSession} FileSession */
/** @typedef {import("../types/http-contracts.js").PermissionSession} PermissionSession */
/** @typedef {import("../types/framework-contracts.js").AttachableTypeContribution & {moduleId: string, targetType: string, label: string, description: string, tableName: string, idField: string, labelField: string, workspaceField: string, requiredReadPermission: string, requiredAttachPermission: string}} AttachableType */
/** @typedef {import("../types/database-contracts.js").DatabaseRow} DatabaseRow */
/** @typedef {Record<string, unknown>} LooseRecord */
/** @typedef {{displayName?: unknown, moduleId?: unknown, originalFilename?: unknown, targetId?: unknown, targetType?: unknown}} RawUploadEventFields */
/** @typedef {{allowedExtensions: string[], blockedExtensions: string[], createdAt: string, fileTypePolicyMode: string, internalStorageLimitBytes: number|null, perUserStorageLimitBytes: number|null, updatedAt: string, workspaceId: string}} WorkspaceFileSettings */
/** @typedef {{storageKey: string, storedFilename: string}} FileStorageWriteResult */
/** @typedef {{workspaceId?: string}} FileStorageWriteOptions */
/** @typedef {{available?: boolean, ok?: boolean, status?: string, [key: string]: unknown}} FileAdapterHealth */
/** @typedef {{id: string, save: (buffer: Buffer, options?: FileStorageWriteOptions) => Promise<FileStorageWriteResult>, saveStream: (readable: import("node:stream").Readable, options?: FileStorageWriteOptions) => Promise<FileStorageWriteResult>, read: (storageKey: string) => Promise<import("node:stream").Readable>, metadata: (storageKey: string) => Promise<{size: number, updatedAt: string}>, delete: (storageKey: string) => Promise<void>, health: () => Promise<FileAdapterHealth>, resolveStoragePath?: (storageKey: string) => string}} FileStorageAdapter */
/** @typedef {import("../types/files-scanner-job-contracts.js").FileScannerAdapter} FileScannerAdapter */
/** @typedef {import("../types/files-scanner-job-contracts.js").FileScannerJobContext} FileScannerJobContext */
/** @typedef {import("../types/files-scanner-job-contracts.js").FileScannerQueueOptions} FileScannerQueueOptions */
/** @typedef {import("../types/files-scanner-job-contracts.js").FilesScannerJobDependencies} FilesScannerJobDependencies */
/** @typedef {import("../types/files-scanner-job-contracts.js").FilesScannerJobFile} FilesScannerJobFile */
/** @typedef {"allowedExtensions"|"blockedExtensions"|"fileTypePolicyMode"|"internalStorageLimitBytes"|"perUserStorageLimitBytes"} FileSettingField */
/** @typedef {import("../types/files-repository-contracts.js").FileRow} FileRow */
/** @typedef {import("../types/files-repository-contracts.js").AttachmentRow} AttachmentRow */
/** @typedef {import("../types/files-repository-contracts.js").AttachableTargetRow} AttachableTargetRow */
/** @typedef {LooseRecord & {label: string, moduleId: string, moduleLabel: string, targetId: string, targetType: string, targetTypeLabel: string, clientId?: string, clientLabel?: string, projectId?: string, projectLabel?: string, contextLabel?: string, value: LooseRecord & {moduleId: string, targetId: string, targetType: string, clientId?: string, projectId?: string}}} AttachableTargetOption */
/** @typedef {{displayName: string, extension: string, fileSizeBytes: number, mimeTypeClaimed: string, mimeTypeDetected: string, metadata: LooseRecord, originalFilename: string, sha256Hash: string, storageKey?: string, storageProvider?: string, storedFilename?: string, buffer?: Buffer}} PreparedUpload */
/** @typedef {PreparedUpload & {buffer: Buffer}} BufferedPreparedUpload */
/** @typedef {ReturnType<typeof normalizeAttachmentListOptions>} AttachmentListOptions */
/** @typedef {Record<string, string>} FileResponseHeaders */
/** @typedef {import("../types/files-preview-contracts.js").FilePreviewAvailability} FilePreviewAvailability */
/** @typedef {import("../types/files-preview-contracts.js").FilePreviewContentResponse} FilePreviewContentResponse */

const DEFAULT_MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024;
const DEFAULT_ALLOWED_VISIBILITY = new Set(["private", "workspace", "client"]);
const DEFAULT_ATTACHMENT_LIMIT = 50;
const MAX_ATTACHMENT_LIMIT = 200;
const ATTACHMENT_SCAN_BATCH_MULTIPLIER = 4;
const DEFAULT_ATTACHABLE_TARGET_LIMIT = 50;
const MAX_ATTACHABLE_TARGET_LIMIT = 100;
const ATTACHMENT_SORT_MODES = new Set(["newest", "oldest", "filename", "size", "status"]);
const FILE_TYPE_POLICY_MODES = new Set(["safe_default", "allowlist", "blocklist"]);
const STREAM_SAMPLE_LIMIT_BYTES = 1024;
const STREAM_SIGNATURE_SAMPLE_BYTES = new Map([
  [".docx", 2],
  [".gif", 6],
  [".jpeg", 3],
  [".jpg", 3],
  [".pdf", 4],
  [".png", 8],
  [".pptx", 2],
  [".xlsx", 2],
  [".zip", 2],
]);
const STREAM_TEXT_SAMPLE_EXTENSIONS = new Set([".csv", ".md", ".txt"]);
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

registerFilesSettingsContributions();

/** @type {Map<string, FileStorageAdapter>} */
const storageAdapters = new Map();
storageAdapters.set("local", createLocalFileStorageAdapter());
storageAdapters.set("s3", createS3FileStorageAdapter(/** @type {Parameters<typeof createS3FileStorageAdapter>[0]} */ (config.storage?.s3)));

function listFileStatuses() {
  return [...FILE_STATUS_SET];
}

function registerFilesSettingsContributions() {
  const definitions = [
    {
      id: "files.fileTypePolicyMode",
      fieldId: "fileTypePolicyMode",
      label: "Policy Mode",
      type: "select",
      default: "safe_default",
      options: [
        { value: "safe_default", label: "Safe default" },
        { value: "allowlist", label: "Allow-list only" },
        { value: "blocklist", label: "Block-list only" },
      ],
    },
    {
      id: "files.allowedExtensions",
      fieldId: "allowedExtensions",
      label: "Allowed Extensions",
      type: "textarea",
      default: DEFAULT_SAFE_ALLOWED_EXTENSIONS.join(", "),
      rows: 4,
      spellcheck: false,
    },
    {
      id: "files.blockedExtensions",
      fieldId: "blockedExtensions",
      label: "Blocked Extensions",
      type: "textarea",
      default: DEFAULT_BLOCKED_EXTENSIONS.join(", "),
      rows: 4,
      spellcheck: false,
    },
    {
      id: "files.internalStorageLimitBytes",
      fieldId: "internalStorageLimitBytes",
      label: "Workspace Storage Limit (bytes)",
      type: "text",
      default: "",
      inputmode: "numeric",
      description: "Leave blank for unlimited internal storage.",
    },
    {
      id: "files.perUserStorageLimitBytes",
      fieldId: "perUserStorageLimitBytes",
      label: "Per-user Storage Limit (bytes)",
      type: "text",
      default: "",
      inputmode: "numeric",
      description: "Leave blank for unlimited internal storage per user.",
    },
  ];

  for (const definition of definitions) {
    registerFrameworkSettingDefinition({
      ...definition,
      moduleId: "files",
      moduleName: "Files",
      placement: "module",
      protected: true,
      requiredPermissions: ["files.manage_workspace_settings"],
    });
    registerPersistenceHandler(`framework.${definition.id}`, {
      async read(/** @type {{workspaceId: string}} */ { workspaceId }) {
        const settings = shapeWorkspaceFileSettings(await readWorkspaceFileSettingsForWorkspace(workspaceId));
        return filesSettingValue(settings, /** @type {FileSettingField} */ (definition.fieldId));
      },
      async write({ context, value }) {
        await saveWorkspaceFileSettings(/** @type {FileSession} */ (context), filesSettingPayload(/** @type {FileSettingField} */ (definition.fieldId), value));
      },
      recordUrl: "files-settings.html",
    });
  }
}

/** @param {WorkspaceFileSettings} settings @param {FileSettingField} fieldId */
function filesSettingValue(settings, fieldId) {
  if (fieldId === "allowedExtensions" || fieldId === "blockedExtensions") {
    return (settings[fieldId] || []).join(", ");
  }
  if (fieldId === "internalStorageLimitBytes" || fieldId === "perUserStorageLimitBytes") {
    return settings[fieldId] ?? "";
  }
  return settings[fieldId];
}

/**
 * @param {FileSettingField} fieldId
 * @param {unknown} value
 */
function filesSettingPayload(fieldId, value) {
  if (fieldId === "allowedExtensions" || fieldId === "blockedExtensions") {
    return { [fieldId]: String(value || "").split(/[\s,]+/).filter(Boolean) };
  }
  if (fieldId === "internalStorageLimitBytes" || fieldId === "perUserStorageLimitBytes") {
    return { [fieldId]: nullableInteger(value) };
  }
  return { [fieldId]: value };
}

function listScanStatuses() {
  return [...FILE_SCAN_STATUS_SET];
}

function listFileLifecycleEvents() {
  return [...FILE_LIFECYCLE_EVENTS];
}

/** @param {unknown} providerId @param {FileStorageAdapter} adapter */
function registerFileStorageAdapter(providerId, adapter) {
  const normalizedProviderId = String(providerId || "").trim();

  if (!normalizedProviderId) {
    throw new TypeError("File storage provider ID is required.");
  }

  for (const methodName of /** @type {const} */ (["save", "saveStream", "read", "metadata", "delete", "health"])) {
    if (typeof adapter?.[methodName] !== "function") {
      throw new TypeError(`File storage adapter '${normalizedProviderId}' must implement ${methodName}().`);
    }
  }

  storageAdapters.set(normalizedProviderId, adapter);
  return normalizedProviderId;
}

/**
 * @param {string | FileScannerAdapter} modeOrAdapter
 * @param {FileScannerAdapter | null} [maybeAdapter]
 */
function registerFileScannerAdapter(modeOrAdapter, maybeAdapter = null) {
  return filesScannerJobService.registerFileScannerAdapter(modeOrAdapter, maybeAdapter);
}

function getFileStorageAdapter(providerId = "local") {
  const normalizedProviderId = String(providerId || "local").trim();
  const adapter = storageAdapters.get(normalizedProviderId);

  if (!adapter) {
    throw new AppError(`File storage provider '${normalizedProviderId}' is not configured.`, 500);
  }

  return adapter;
}

function resolveConfiguredFileStorageProvider() {
  const storageConfig = parseFilesEdgePayload(
    FileStorageAdapterConfigSchema,
    config.storage || {},
    { status: 500 },
  );
  const providerId = storageConfig.provider || "local";

  return {
    adapter: getFileStorageAdapter(providerId),
    providerId,
  };
}

async function assertConfiguredFileStorageProviderReady() {
  const { adapter, providerId } = resolveConfiguredFileStorageProvider();
  let health;

  try {
    health = await adapter.health();
  } catch {
    throw new Error(storageProviderStartupError(providerId, "unavailable"));
  }

  if (health?.ok !== true && health?.available !== true) {
    throw new Error(storageProviderStartupError(providerId, health?.status));
  }

  return {
    providerId,
    status: sanitizeStorageProviderStatus(health?.status || "ok"),
  };
}

/** @param {{required?: boolean, scannerMode?: string}} [options] */
async function assertConfiguredFileScannerReady(options = {}) {
  return filesScannerJobService.assertConfiguredFileScannerReady(options);
}

/**
 * @param {string} providerId
 * @param {unknown} status
 */
function storageProviderStartupError(providerId, status) {
  const safeProviderId = String(providerId || "local").trim() || "local";
  const safeStatus = sanitizeStorageProviderStatus(status || "unavailable");

  if (safeProviderId === "s3") {
    return `File storage provider 's3' is not available at startup (${safeStatus}). S3 storage is deferred until a provider-specific client is wired; set LONGTAIL_STORAGE_PROVIDER=local.`;
  }

  return `File storage provider '${safeProviderId}' is not available at startup (${safeStatus}). Set LONGTAIL_STORAGE_PROVIDER to a configured provider.`;
}

/**
 * @param {unknown} status
 */
function sanitizeStorageProviderStatus(status) {
  return String(status || "unavailable")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "_")
    .slice(0, 80) || "unavailable";
}

function getFileScannerAdapter(scannerMode = "none") {
  return filesScannerJobService.getFileScannerAdapter(scannerMode);
}

function resolveConfiguredFileScannerAdapter() {
  return filesScannerJobService.resolveConfiguredFileScannerAdapter();
}

function listAttachableTypes() {
  return /** @type {AttachableType[]} */ (modulesService.listAttachableTypes());
}

/**
 * @param {string} workspaceId
 */
async function listActiveAttachableTypes(workspaceId) {
  return /** @type {Promise<AttachableType[]>} */ (modulesService.listActiveAttachableTypes(workspaceId));
}

/**
 * @param {string} workspaceId
 * @param {unknown} moduleId
 * @param {unknown} targetType
 */
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

  return /** @type {AttachableType} */ (attachableType);
}

/** @param {FileSession} session @param {unknown} [payload] */
async function uploadAndAttach(session, payload = {}) {
  assertFileIngressAllowed();
  const rawEventFields = readRawUploadEventFields(payload);
  await emitFileLifecycleEvent("file.upload.requested", {
    session,
    moduleId: rawEventFields.moduleId,
    targetType: rawEventFields.targetType,
    targetId: rawEventFields.targetId,
    status: "pending",
    scanStatus: "pending",
  });

  try {
    const parsed = parseFilesEdgePayload(CreateFileSchema, payload);
    const { attachableType, fileSettings, target } = await resolveUploadTarget(session, parsed);

    const prepared = prepareUpload(parsed, attachableType, fileSettings);
    await filesStorageAccountingService.assertStorageQuotaAllowsUpload({
      fileSettings,
      uploadBytes: prepared.fileSizeBytes,
      userId: session.user_id,
      workspaceId: session.workspace_id,
    });
    const storageProvider = resolveConfiguredFileStorageProvider();
    const storage = await storageProvider.adapter.save(prepared.buffer, { workspaceId: session.workspace_id });

    return finishUploadedFileAttachment(session, parsed, attachableType, target, {
      ...prepared,
      storageProvider: storageProvider.providerId,
      storageKey: storage.storageKey,
      storedFilename: storage.storedFilename,
    });
  } catch (error) {
    await recordUploadRejected(session, payload, error);
    throw error;
  }
}

/**
 * @param {FileSession} session
 * @param {LooseRecord & {fileStream?: import("node:stream").Readable}} [payload]
 */
async function uploadStreamAndAttach(session, payload = {}) {
  assertFileIngressAllowed();
  await emitFileLifecycleEvent("file.upload.requested", {
    session,
    moduleId: payload.moduleId,
    targetType: payload.targetType,
    targetId: payload.targetId,
    status: "pending",
    scanStatus: "pending",
  });

  try {
    const { fileStream, ...metadataFields } = payload;
    const parsed = { ...parseFilesEdgePayload(FileMetadataSchema, metadataFields), fileStream };
    const { attachableType, fileSettings, target } = await resolveUploadTarget(session, parsed);
    const prepared = await prepareStreamedUpload(session, parsed, attachableType, fileSettings);

    return finishUploadedFileAttachment(session, parsed, attachableType, target, prepared);
  } catch (error) {
    await recordUploadRejected(session, payload, error);
    throw error;
  }
}

/**
 * @param {FileSession} session
 * @param {LooseRecord} payload
 */
async function resolveUploadTarget(session, payload = {}) {
  const attachableType = await resolveAttachableType(session.workspace_id, payload.moduleId, payload.targetType);
  const target = await readAttachableTarget(session.workspace_id, attachableType, payload.targetId);
  await assertCanUseAttachableTarget(session, attachableType, "upload", target);

  return {
    attachableType,
    fileSettings: await readWorkspaceFileSettingsForWorkspace(session.workspace_id),
    target,
  };
}

/** @param {FileSession} session @param {LooseRecord} payload @param {AttachableType} attachableType @param {AttachableTargetRow} target @param {PreparedUpload} prepared */
async function finishUploadedFileAttachment(session, payload, attachableType, target, prepared) {
  const file = await createFileRecord(session, prepared);
  await queueFileScanJob(session, file, {
    source: "file_upload",
  });
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
    status: file.status,
    scanStatus: file.scan_status,
  });

  return {
    attachment,
    file: await readFileForSession(session, file.file_id),
  };
}

/**
 * @param {FileSession} session
 * @param {unknown} payload
 * @param {unknown} error
 */
async function recordUploadRejected(session, payload, error) {
  const rawEventFields = readRawUploadEventFields(payload);
  const failure = /** @type {{message?: string}} */ (error);
  await emitFileLifecycleEvent("file.upload.rejected", {
    session,
    moduleId: rawEventFields.moduleId,
    targetType: rawEventFields.targetType,
    targetId: rawEventFields.targetId,
    status: "deleted",
    scanStatus: "error",
    reason: failure?.message || String(error),
  });
  await recordFileAudit(session, {
    action: "file.upload_rejected",
    changeType: "create",
    recordId: "",
    recordLabel: rawEventFields.originalFilename || rawEventFields.displayName || "File upload",
    metadata: {
      reason: failure?.message || String(error),
      target_id: rawEventFields.targetId || "",
      target_type: rawEventFields.targetType || "",
    },
  });
}

/** @param {unknown} value @returns {value is LooseRecord} */
function isRawObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** @param {unknown} payload @returns {RawUploadEventFields} */
function readRawUploadEventFields(payload) {
  if (!isRawObject(payload)) {
    return {};
  }

  return {
    displayName: payload.displayName,
    moduleId: payload.moduleId,
    originalFilename: payload.originalFilename,
    targetId: payload.targetId,
    targetType: payload.targetType,
  };
}

/** @param {FileSession} session @param {unknown} rawPayload */
async function uploadBatchAndAttach(session, rawPayload = {}) {
  assertFileIngressAllowed();
  const payload = parseFilesEdgePayload(CreateFileBatchSchema, rawPayload);
  const files = payload.files;

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
      const failure = /** @type {{message?: string, status?: number, statusCode?: number}} */ (error);
      results.push({
        error: failure?.message || "Upload failed.",
        index,
        ok: false,
        originalFilename: uploadPayload.originalFilename || uploadPayload.filename || "",
        status: failure?.status || failure?.statusCode || 400,
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

/** @param {FileSession} session @param {unknown} rawPayload */
async function attachExistingFile(session, rawPayload = {}) {
  assertFileIngressAllowed();
  const payload = parseFilesEdgePayload(FileAttachmentSchema, rawPayload);
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

/**
 * @param {FileSession} session
 * @param {LooseRecord} [filters]
 */
async function listAttachments(session, filters = {}) {
  const canManageQuarantine = await permissionsService.can(session, "files.manage_quarantine", {
    workspace_id: session.workspace_id,
    operation: "read",
  });
  const listOptions = normalizeAttachmentListOptions(filters);
  await assertTargetScopedAttachmentRead(session, filters);
  const contextScope = await resolveClientProjectFilterScope(session, {
    clientId: normalizeOptionalText(filters.clientId ?? filters.client_id),
    hasClientFilter: hasFilterParameter(filters, ["clientId", "client_id"]),
    hasProjectFilter: hasFilterParameter(filters, ["projectId", "project_id"]),
    projectId: normalizeOptionalText(filters.projectId ?? filters.project_id),
  });
  const statusFilter = normalizeFileStatusFilter(filters.status || filters.fileStatus || filters.file_status);
  const targetScopedRead = Boolean(filters.targetId || filters.target_id);
  const repositoryQuery = {
    canManageQuarantine,
    contextScope,
    filters,
    listOptions,
    statusFilter,
    targetScopedRead,
    workspaceId: session.workspace_id,
  };

  if (listOptions.paginate) {
    const visiblePage = await readVisibleAttachmentPage(session, repositoryQuery, listOptions);
    const knownTotal = visiblePage.hasMore ? null : listOptions.offset + visiblePage.attachments.length;

    return {
      attachments: visiblePage.attachments,
      pagination: boundedPaginationEnvelope({
        ...listOptions,
        hasMore: visiblePage.hasMore,
        returned: visiblePage.attachments.length,
        total: knownTotal,
      }),
      sort: listOptions.sort,
    };
  }

  const rows = await filesRepo.readAttachmentRows(repositoryQuery);
  /** @type {Array<Awaited<ReturnType<typeof shapeAttachmentForRead>>>} */
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
    pagination: boundedPaginationEnvelope({
      hasMore: listOptions.offset + paged.length < sorted.length,
      limit: listOptions.limit,
      maxPageSize: listOptions.maxPageSize,
      offset: listOptions.offset,
      returned: paged.length,
      total: sorted.length,
    }),
    sort: listOptions.sort,
  };
}

/** @param {FileSession} session @param {{canManageQuarantine: boolean, contextScope: LooseRecord, filters: LooseRecord, listOptions: AttachmentListOptions, statusFilter: string, targetScopedRead: boolean, workspaceId: string}} repositoryQuery @param {AttachmentListOptions} listOptions */
async function readVisibleAttachmentPage(session, repositoryQuery, listOptions) {
  const targetVisibleCount = listOptions.offset + listOptions.limit + 1;
  const batchLimit = Math.min(
    Math.max(listOptions.limit + 1, listOptions.limit * ATTACHMENT_SCAN_BATCH_MULTIPLIER),
    MAX_ATTACHMENT_LIMIT,
  );
  const maxRawRowsToScan = Math.min(
    Math.max(500, listOptions.offset + (listOptions.limit + 1) * 10),
    Math.max(500, listOptions.offset + MAX_ATTACHMENT_LIMIT * ATTACHMENT_SCAN_BATCH_MULTIPLIER),
  );
  /** @type {Array<Awaited<ReturnType<typeof shapeAttachmentForRead>>>} */
  const visible = [];
  let visibleSeen = 0;
  let rawOffset = 0;
  let scanned = 0;
  let exhaustedCandidates = false;

  while (visibleSeen < targetVisibleCount && scanned < maxRawRowsToScan) {
    const rows = await filesRepo.readAttachmentRows({
      ...repositoryQuery,
      page: { limit: batchLimit, offset: rawOffset },
    });

    if (rows.length === 0) {
      exhaustedCandidates = true;
      break;
    }

    for (const row of rows) {
      scanned += 1;

      if (!(await canReadAttachment(session, row))) {
        continue;
      }

      if (visibleSeen >= listOptions.offset) {
        visible.push(await shapeAttachmentForRead(session, row));

        if (visible.length > listOptions.limit) {
          return {
            attachments: visible.slice(0, listOptions.limit),
            hasMore: true,
          };
        }
      }

      visibleSeen += 1;
    }

    rawOffset += rows.length;

    if (rows.length < batchLimit) {
      exhaustedCandidates = true;
      break;
    }
  }

  return {
    attachments: visible,
    hasMore: !exhaustedCandidates && visible.length > 0,
  };
}

/**
 * @param {FileSession} session
 * @param {LooseRecord} [filters]
 */
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
  /** @type {Record<string, number>} */
  const counts = {};

  targetIds.forEach((targetId) => {
    counts[targetId] = 0;
  });
  result.attachments.forEach((attachment) => {
    const targetId = String(attachment.targetId || "");
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

/**
 * @param {FileSession} session
 * @param {unknown} fileId
 */
async function readFileForSession(session, fileId) {
  const file = await readFileRow(session.workspace_id, fileId);

  if (!file || file.status === "deleted") {
    throw new AppError("File not found.", 404);
  }

  const attachments = await readActiveAttachmentsForFile(session.workspace_id, file.file_id);
  if (attachments.length > 0 && !(await findReadableAttachment(session, attachments))) {
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

/** @param {FileSession} session @param {unknown} fileId @returns {Promise<{file: ReturnType<typeof shapeFile>, headers: FileResponseHeaders, stream: NodeJS.ReadableStream}>} */
async function downloadFile(session, fileId) {
  const file = await readFileRow(session.workspace_id, fileId);

  if (!file || file.status === "deleted") {
    throw new AppError("File not found.", 404);
  }
  if (file.status !== "available" || !["not_required", "passed"].includes(file.scan_status)) {
    throw new AppError("That file is not available for download.", 403);
  }

  const attachments = await readActiveAttachmentsForFile(session.workspace_id, file.file_id);
  const readableAttachment = await findReadableAttachment(session, attachments);
  if (!readableAttachment) {
    throw new AppError("You do not have permission to download that file.", 403);
  }

  await permissionsService.assertCan(session, "files.download", {
    client_id: readableAttachment.client_id || "",
    project_id: readableAttachment.project_id || "",
    workspace_id: session.workspace_id,
    operation: "download",
  });

  const storageAdapter = await assertStoredFileObjectExists(file, "download");
  const stream = await storageAdapter.read(file.storage_key);
  await emitFileLifecycleEvent("file.downloaded", {
    session,
    fileId: file.file_id,
    moduleId: readableAttachment.module_id,
    targetId: readableAttachment.target_id,
    targetType: readableAttachment.target_type,
    status: file.status,
    scanStatus: file.scan_status,
  });
  await recordFileAudit(session, {
    action: "file.downloaded",
    changeType: "update",
    recordId: file.file_id,
    recordLabel: file.display_name,
    metadata: {
      attachment_id: readableAttachment.file_attachment_id,
      target_id: readableAttachment.target_id,
      target_type: readableAttachment.target_type,
    },
  });

  return {
    file: shapeFile(file),
    headers: buildDownloadHeaders(file),
    stream,
  };
}

/** @param {FileSession} session @param {unknown} attachmentId */
async function readAttachmentPreviewDescriptor(session, attachmentId) {
  const previewRequest = parseFilesEdgePayload(
    FilePreviewRequestSchema,
    { fileAttachmentId: attachmentId },
    { status: 404 },
  );
  const { attachment, availability } = await readAttachmentPreviewAccess(session, previewRequest.fileAttachmentId);

  return {
    preview: filesPreviewService.shapeDescriptor(attachment, availability),
  };
}

/** @param {FileSession} session @param {unknown} attachmentId @returns {Promise<FilePreviewContentResponse>} */
async function readAttachmentPreviewContent(session, attachmentId) {
  const previewRequest = parseFilesEdgePayload(
    FilePreviewRequestSchema,
    { fileAttachmentId: attachmentId },
    { status: 404 },
  );
  const { attachment, availability } = await readAttachmentPreviewAccess(session, previewRequest.fileAttachmentId);
  filesPreviewService.assertContentAvailable(availability);

  const file = await readFileRow(session.workspace_id, attachment.file_id);

  if (!file) {
    throw new AppError("File not found.", 404);
  }

  const storageAdapter = await assertStoredFileObjectExists(file, "preview");
  const stream = await storageAdapter.read(file.storage_key);
  return filesPreviewService.readContent(attachment, availability, stream);
}

/**
 * @param {import("../types/http-contracts.js").PermissionSession | null | undefined} session
 * @param {string} attachmentId
 */
/** @param {FileSession} session @param {unknown} attachmentId @returns {Promise<{attachment: AttachmentRow, availability: FilePreviewAvailability}>} */
async function readAttachmentPreviewAccess(session, attachmentId) {
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
  await assertCanUseAttachableTarget(session, attachableType, "read", target);

  const canDownload = await permissionsService.can(session, "files.download", {
    client_id: String(attachment.client_id || ""),
    project_id: String(attachment.project_id || ""),
    workspace_id: session.workspace_id,
    operation: "preview",
  });

  if (!canDownload) {
    return {
      attachment,
      availability: {
        kind: filesPreviewService.kindForAttachment(attachment),
        reason: "files_download_permission_required",
        state: "unauthorized",
      },
    };
  }

  const canPreviewInReview = await permissionsService.can(session, "files.manage_quarantine", {
    client_id: String(attachment.client_id || ""),
    project_id: String(attachment.project_id || ""),
    workspace_id: session.workspace_id,
    operation: "preview_review",
  });

  return {
    attachment,
    availability: filesPreviewService.availabilityForAttachment(attachment, { canPreviewInReview }),
  };
}

/**
 * @param {import("../types/http-contracts.js").WorkspaceRequestSession} session
 * @param {unknown} attachmentId
 */
/** @param {FileSession} session @param {unknown} attachmentId */
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
  await filesRepo.removeAttachment({
    attachmentId: attachment.file_attachment_id,
    removedAt: now,
    workspaceId: session.workspace_id,
  });

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

/** @param {import("../types/http-contracts.js").WorkspaceRequestSession} session @param {string} attachmentId @param {unknown} rawPayload */
/** @param {FileSession} session @param {unknown} attachmentId @param {unknown} rawPayload */
async function updateAttachmentContext(session, attachmentId, rawPayload = {}) {
  const attachment = await readAttachmentById(session.workspace_id, attachmentId);

  if (!attachment || attachment.removed_at) {
    throw new AppError("Attachment not found.", 404);
  }

  const payload = parseFilesEdgePayload(UpdateFileContextSchema, rawPayload);
  const previousContext = attachmentContextFromRow(attachment);
  const previousAttachableType = await resolveAttachableType(
    session.workspace_id,
    attachment.module_id,
    attachment.target_type,
  );
  const previousTarget = await readAttachableTarget(session.workspace_id, previousAttachableType, attachment.target_id);
  await assertCanUseAttachableTarget(session, previousAttachableType, "remove", previousTarget);

  const nextModuleId = normalizeRequiredText(payload.moduleId || payload.module_id, "Module ID is required.");
  const nextTargetType = normalizeRequiredText(payload.targetType || payload.target_type, "Target type is required.");
  const nextTargetId = normalizeRequiredText(payload.targetId || payload.target_id, "Target ID is required.");
  const nextAttachableType = await resolveAttachableType(session.workspace_id, nextModuleId, nextTargetType);
  const nextTarget = await readAttachableTarget(session.workspace_id, nextAttachableType, nextTargetId);

  assertAttachmentContextPayloadMatchesTarget(nextAttachableType, nextTarget, payload);
  await assertCanUseAttachableTarget(session, nextAttachableType, "attach", nextTarget);
  await assertNoDuplicateActiveAttachmentContext(session.workspace_id, attachment, nextAttachableType, nextTarget);

  const nextContextIds = attachmentTargetContextIds(nextAttachableType, nextTarget);
  const nextContext = {
    clientId: nextContextIds.clientId,
    moduleId: nextAttachableType.moduleId,
    projectId: nextContextIds.projectId,
    targetId: nextTarget.target_id,
    targetType: nextAttachableType.targetType,
  };

  if (attachmentContextsEqual(previousContext, nextContext)) {
    return { attachment: await shapeAttachmentForRead(session, attachment) };
  }

  await filesRepo.updateAttachmentContext({
    attachmentClientId: nextContext.clientId || null,
    attachmentId: attachment.file_attachment_id,
    attachmentModuleId: nextContext.moduleId,
    attachmentProjectId: nextContext.projectId || null,
    attachmentTargetId: nextContext.targetId,
    attachmentTargetType: nextContext.targetType,
    attachmentWorkspaceId: session.workspace_id,
  });

  const updatedAttachment = await readAttachmentById(session.workspace_id, attachment.file_attachment_id);
  if (!updatedAttachment) {
    throw new AppError("Updated attachment could not be read.", 500);
  }
  await emitAttachmentContextUpdateEvents(session, updatedAttachment, previousContext, nextContext);
  await recordFileAudit(session, {
    action: "file.attachment_context_updated",
    changeType: "update",
    recordId: attachment.file_attachment_id,
    recordLabel: attachment.display_name,
    metadata: {
      file_id: attachment.file_id,
      next_context: auditAttachmentContext(nextContext),
      previous_context: auditAttachmentContext(previousContext),
    },
  });

  return { attachment: await shapeAttachmentForRead(session, updatedAttachment) };
}

/**
 * @param {import("./search.service.js").WorkspaceRequestSession} session
 */
/** @param {FileSession} session @param {LooseRecord} [filters] */
async function listAttachableTargetOptions(session, filters = {}) {
  const normalizedFilters = normalizeAttachableTargetOptionFilters(filters);
  const workspaceType = await readWorkspaceType(session.workspace_id);
  const contextScope = await resolveClientProjectFilterScope(session, {
    clientId: normalizedFilters.clientId,
    hasClientFilter: hasFilterParameter(filters, ["clientId", "client_id"]),
    hasProjectFilter: hasFilterParameter(filters, ["projectId", "project_id"]),
    projectId: normalizedFilters.projectId,
  });
  const filteredTypes = (await listActiveAttachableTypes(session.workspace_id))
    .filter((attachableType) => {
      if (normalizedFilters.moduleId && attachableType.moduleId !== normalizedFilters.moduleId) {
        return false;
      }
      if (normalizedFilters.targetType && attachableType.targetType !== normalizedFilters.targetType) {
        return false;
      }
      return true;
    });
  /** @type {AttachableTargetOption[]} */
  const options = [];

  for (const attachableType of filteredTypes) {
    const remaining = normalizedFilters.limit - options.length;

    if (remaining <= 0) {
      break;
    }

    const rows = await readAttachableTargetOptionRows(
      session.workspace_id,
      attachableType,
      normalizedFilters,
      contextScope,
      workspaceType,
      Math.min(remaining * 3, MAX_ATTACHABLE_TARGET_LIMIT),
    );

    for (const row of rows) {
      if (options.length >= normalizedFilters.limit) {
        break;
      }

      const option = await shapePermittedAttachableTargetOption(session, attachableType, row, workspaceType);

      if (option) {
        options.push(option);
      }
    }
  }

  const decoratedOptions = await decorateAttachableTargetOptions(session.workspace_id, options, workspaceType);
  decoratedOptions.sort(compareAttachableTargetOptions);

  return {
    count: decoratedOptions.length,
    filters: buildAttachableTargetOptionFilters(decoratedOptions, workspaceType),
    options: decoratedOptions,
    targetTypes: buildAttachableTargetTypeOptions(decoratedOptions),
    workspaceType,
  };
}

/**
 * @param {import("../types/http-contracts.js").NormalRequestSession | import("../types/http-contracts.js").SupportViewRequestSession | import("../types/http-contracts.js").PrivateFeedAuthorizationSession | null | undefined} session
 * @param {unknown} fileId
 */
/** @param {FileSession} session @param {unknown} fileId */
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

  await filesRepo.softDeleteFile({
    deletedAt: now,
    fileId: file.file_id,
    metadataJson: JSON.stringify(metadata),
    updatedAt: now,
    workspaceId: session.workspace_id,
  });

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

/**
 * @param {import("../types/http-contracts.js").NormalRequestSession | import("../types/http-contracts.js").SupportViewRequestSession | import("../types/http-contracts.js").PrivateFeedAuthorizationSession | null | undefined} session
 * @param {unknown} fileId
 */
/** @param {FileSession} session @param {unknown} fileId */
async function restoreFile(session, fileId) {
  const file = await readFileRow(session.workspace_id, fileId);

  if (!file || !["deleted", "quarantined"].includes(file.status)) {
    throw new AppError("Recoverable file not found.", 404);
  }

  if (file.status === "quarantined") {
    return markQuarantinedFileReviewed(session, file);
  }

  const attachments = await readActiveAttachmentsForFile(session.workspace_id, file.file_id);
  await assertCanDeleteFile(session, file, attachments, { operation: "restore" });

  const metadata = parseJsonObject(file.metadata_json);
  const deletionMetadata = parseJsonObject(metadata.deletion);
  const previousStatus = normalizeRestorableStatus(deletionMetadata.previous_status, file.scan_status);
  const now = new Date().toISOString();
  const nextMetadata = {
    ...metadata,
    deletion: {
      ...deletionMetadata,
      restored_at: now,
      restored_by_user_id: session.user_id,
    },
  };

  await filesRepo.restoreFile({
    fileId: file.file_id,
    fileStatus: previousStatus,
    metadataJson: JSON.stringify(nextMetadata),
    updatedAt: now,
    workspaceId: session.workspace_id,
  });

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

/**
 * @param {import("../types/http-contracts.js").PermissionSession | null | undefined} session
 * @param {import("../types/database-contracts.js").DatabaseRow} file
 */
/** @param {FileSession} session @param {FileRow} file */
async function markQuarantinedFileReviewed(session, file) {
  await permissionsService.assertCan(session, "files.manage_quarantine", {
    workspace_id: session.workspace_id,
    operation: "restore",
  });

  if (!["not_required", "passed"].includes(file.scan_status)) {
    throw new AppError("File review cannot be completed until the file scan has passed.", 409);
  }

  const now = new Date().toISOString();

  await filesRepo.markQuarantinedFileReviewed({
    fileId: file.file_id,
    updatedAt: now,
    workspaceId: session.workspace_id,
  });

  await emitFileLifecycleEvent("file.restored", {
    session,
    fileId: file.file_id,
    metadata: { previous_status: file.status, review_action: "mark_reviewed" },
    status: "available",
    scanStatus: file.scan_status,
  });
  await recordFileAudit(session, {
    action: "file.restored",
    changeType: "update",
    recordId: file.file_id,
    recordLabel: file.display_name,
    metadata: { restored_from_status: file.status, review_action: "mark_reviewed" },
  });
  await refreshStorageAccounting(session.workspace_id);

  return { file: await readFileForAdmin(session, file.file_id) };
}

/**
 * @param {import("../types/http-contracts.js").PermissionSession | null | undefined} session
 */
/** @param {FileSession} session @param {LooseRecord} [filters] */
async function readStorageAccounting(session, filters = {}) {
  await permissionsService.assertCan(session, "files.manage_workspace_settings", {
    workspace_id: session.workspace_id,
    operation: "read",
  });
  const storageKind = normalizeStorageKind(filters.storageKind || filters.storage_kind);
  return filesStorageAccountingService.readStorageAccounting({
    storageKind,
    workspaceId: session.workspace_id,
  });
}

/**
 * @param {import("../types/http-contracts.js").PermissionSession | null | undefined} session
 */
/** @param {FileSession} session @param {LooseRecord} [payload] */
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
  await filesStorageAccountingService.recordExternalStorageAccounting({
    availabilityStatus,
    externalReportedBytes,
    fileCount,
    sourceProvider,
    userId,
    workspaceId: session.workspace_id,
  });

  return readStorageAccounting(session, { storageKind: "external" });
}

/**
 * @param {import("../types/http-contracts.js").PermissionSession | null | undefined} session
 */
/** @param {FileSession} session */
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

/**
 * @param {import("../types/http-contracts.js").PermissionSession | null | undefined} session
 */
/** @param {FileSession} session @param {LooseRecord} [payload] */
async function saveWorkspaceFileSettings(session, payload = {}) {
  await permissionsService.assertCan(session, "files.manage_workspace_settings", {
    workspace_id: session.workspace_id,
    operation: "update",
  });

  const previous = await readWorkspaceFileSettingsForWorkspace(session.workspace_id);
  const next = normalizeWorkspaceFileSettingsPayload(payload, previous);
  const now = new Date().toISOString();

  await filesRepo.saveWorkspaceFileSettings({
    allowedExtensionsJson: JSON.stringify(next.allowedExtensions),
    blockedExtensionsJson: JSON.stringify(next.blockedExtensions),
    createdAt: now,
    fileTypePolicyMode: next.fileTypePolicyMode,
    internalStorageLimitBytes: nullableInteger(next.internalStorageLimitBytes),
    metadataJson: JSON.stringify({ source: "files_settings" }),
    perUserStorageLimitBytes: nullableInteger(next.perUserStorageLimitBytes),
    updatedAt: now,
    workspaceId: session.workspace_id,
  });

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

/**
 * @param {import("../types/http-contracts.js").WorkspaceRequestSession} session
 * @param {unknown} fileId
 */
/** @param {FileSession} session @param {unknown} fileId @param {LooseRecord} [payload] */
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
  const reportId = createRecordId();
  const attachmentId = normalizeOptionalText(payload.attachmentId || payload.fileAttachmentId);

  await db.transaction(async (transaction) => {
    await filesRepo.createFileReport(transaction, {
      attachmentId: attachmentId || null,
      createdAt: now,
      fileId: file.file_id,
      notes: notes || null,
      reason,
      reportedByUserId: session.user_id,
      reportId,
      workspaceId: session.workspace_id,
    });

    await filesRepo.markFileReported(transaction, {
      fileId: file.file_id,
      quarantineReason: `reported:${reason}`,
      updatedAt: now,
      workspaceId: session.workspace_id,
    });
  });

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

/**
 * @param {import("../types/http-contracts.js").NormalRequestSession | import("../types/http-contracts.js").SupportViewRequestSession | import("../types/http-contracts.js").PrivateFeedAuthorizationSession | null | undefined} session
 * @param {unknown} fileId
 */
/** @param {FileSession} session @param {unknown} fileId @param {LooseRecord} [payload] */
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

  await filesRepo.quarantineFile({
    fileId: file.file_id,
    quarantineReason: reason,
    updatedAt: now,
    workspaceId: session.workspace_id,
  });
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

/**
 * @param {import("../types/http-contracts.js").PermissionSession | null | undefined} session
 * @param {unknown} fileId
 */
/** @param {FileSession} session @param {unknown} fileId */
async function readFileForAdmin(session, fileId) {
  const file = await readFileRow(session.workspace_id, fileId);
  if (!file) {
    throw new AppError("File not found.", 404);
  }
  return shapeFile(file);
}

/**
 * @param {import("../types/http-contracts.js").NormalRequestSession | import("../types/http-contracts.js").SupportViewRequestSession | import("../types/http-contracts.js").PrivateFeedAuthorizationSession | null | undefined} session
 * @param {{ moduleId: string; }} attachableType
 * @param {string} operation
 */
/** @param {FileSession} session @param {AttachableType} attachableType @param {string} operation @param {AttachableTargetRow | null} [target] */
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

/**
 * @param {string} eventName
 */
/** @param {string} eventName @param {LooseRecord & {session?: FileSession|null, source?: string}} [payload] */
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

/** @param {FileSession} session @param {PreparedUpload} prepared @returns {Promise<FileRow>} */
async function createFileRecord(session, prepared) {
  const now = new Date().toISOString();
  const fileId = createRecordId();
  if (!prepared.storageKey || !prepared.storageProvider || !prepared.storedFilename) {
    throw new AppError("Uploaded file could not be stored.", 500);
  }

  await filesRepo.createFile({
    createdAt: now,
    displayName: prepared.displayName,
    extension: prepared.extension,
    fileId,
    fileSizeBytes: prepared.fileSizeBytes,
    metadataJson: JSON.stringify(prepared.metadata || {}),
    mimeTypeClaimed: prepared.mimeTypeClaimed,
    mimeTypeDetected: prepared.mimeTypeDetected,
    originalFilename: prepared.originalFilename,
    sha256Hash: prepared.sha256Hash,
    storageKey: prepared.storageKey,
    storageProvider: prepared.storageProvider,
    storedFilename: prepared.storedFilename,
    uploadedByUserId: session.user_id,
    workspaceId: session.workspace_id,
  });

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
  const file = await readFileRow(session.workspace_id, fileId);
  if (!file) {
    throw new AppError("File creation did not return the created file.", 500);
  }
  return file;
}

/**
 * @param {string | null} workspaceId
 */
/** @param {string} workspaceId */
async function refreshStorageAccounting(workspaceId) {
  return filesStorageAccountingService.refreshStorageAccounting(workspaceId);
}

/** @param {{replace?: boolean}} [options] */
function registerFileScanJobHandlers(options = {}) {
  return filesScannerJobService.registerFileScanJobHandlers(fileScannerJobDependencies(), options);
}

/** @param {FileSession} session @param {FileRow} file @param {FileScannerQueueOptions} [options] */
async function queueFileScanJob(session, file, options = {}) {
  return filesScannerJobService.queueFileScanJob(session, file, options);
}

/** @param {FileScannerJobContext} context */
async function handleFileScanJob(context) {
  return filesScannerJobService.handleFileScanJob(context, fileScannerJobDependencies());
}

/** @returns {FilesScannerJobDependencies} */
function fileScannerJobDependencies() {
  return {
    async emitLifecycleEvent(eventName, payload) {
      return emitFileLifecycleEvent(eventName, { ...payload });
    },
    readFile: readFileForScannerJob,
    async recordAudit(session, event) {
      return recordFileAudit(session, { ...event });
    },
    async updateScanResult(input) {
      return filesRepo.updateScanResult(input);
    },
  };
}

/** @param {{fileId: string, workspaceId: string}} lookup @returns {Promise<FilesScannerJobFile | null>} */
async function readFileForScannerJob({ fileId, workspaceId }) {
  const file = await readFileRow(workspaceId, fileId);
  if (!file) {
    return null;
  }

  return {
    displayName: file.display_name,
    extension: file.extension,
    fileId: file.file_id,
    fileSizeBytes: Number(file.file_size_bytes) || 0,
    mimeTypeClaimed: file.mime_type_claimed,
    mimeTypeDetected: file.mime_type_detected,
    originalFilename: file.original_filename,
    scanStatus: file.scan_status,
    status: file.status,
    storageProvider: file.storage_provider || "local",
    workspaceId: file.workspace_id,
    async openReadStream() {
      const adapter = getFileStorageAdapter(file.storage_provider || "local");
      return adapter.read(file.storage_key);
    },
  };
}

/**
 * @param {import("../types/http-contracts.js").WorkspaceRequestSession} session
 */
/** @param {FileSession} session @param {LooseRecord} [payload] @param {{attachableType?: AttachableType}} [context] */
async function attachFile(session, payload = {}, context = {}) {
  const attachableType = context.attachableType || await resolveAttachableType(
    session.workspace_id,
    payload.moduleId,
    payload.targetType,
  );
  const target = payload.targetRecord && typeof payload.targetRecord === "object"
    ? /** @type {AttachableTargetRow} */ (payload.targetRecord)
    : await readAttachableTarget(session.workspace_id, attachableType, payload.targetId);
  const visibility = normalizeVisibility(payload.visibility, attachableType);
  const now = new Date().toISOString();
  const attachmentId = createRecordId();

  await filesRepo.createAttachment({
    attachedByUserId: session.user_id,
    attachmentId,
    attachmentRole: normalizeOptionalText(payload.attachmentRole, { maxLength: 80 }) || null,
    caption: normalizeOptionalText(payload.caption, { maxLength: 500 }) || null,
    clientId: target.client_id || null,
    createdAt: now,
    fileId: String(payload.fileId || ""),
    metadataJson: JSON.stringify(payload.metadata || {}),
    moduleId: attachableType.moduleId,
    projectId: target.project_id || null,
    sortOrder: clampInteger(payload.sortOrder, 0, 0, Number.MAX_SAFE_INTEGER),
    targetId: target.target_id,
    targetType: attachableType.targetType,
    visibility,
    workspaceId: session.workspace_id,
  });

  const attachment = await readAttachmentById(session.workspace_id, attachmentId);
  if (!attachment) {
    throw new AppError("Attachment creation did not return the created attachment.", 500);
  }
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

/** @param {string} workspaceId @param {AttachableType} attachableType @param {unknown} targetId @returns {Promise<AttachableTargetRow>} */
async function readAttachableTarget(workspaceId, attachableType, targetId) {
  const normalizedTargetId = normalizeRequiredText(targetId, "Target ID is required.");
  const row = await filesRepo.readAttachableTarget(workspaceId, normalizedTargetId, attachableTargetFields(attachableType));

  if (!row) {
    throw new AppError("Attachment target not found in this workspace.", 404);
  }

  return row;
}

/** @param {AttachableType} attachableType */
function attachableTargetFields(attachableType) {
  return {
    clientField: String(attachableType.clientField || ""),
    idField: String(attachableType.idField || ""),
    labelField: String(attachableType.labelField || ""),
    projectField: String(attachableType.projectField || ""),
    tableName: String(attachableType.tableName || ""),
    workspaceField: String(attachableType.workspaceField || ""),
  };
}

/** @param {LooseRecord} payload @param {AttachableType} attachableType @param {WorkspaceFileSettings} fileSettings @returns {BufferedPreparedUpload} */
function prepareUpload(payload, attachableType, fileSettings) {
  const policy = prepareUploadPolicy(payload, attachableType, fileSettings);
  const buffer = decodeBase64(payload.contentBase64 || payload.content || "");

  if (buffer.length < 1) {
    throw new AppError("Uploaded file content is required.", 400);
  }
  if (buffer.length > policy.maxSize) {
    throw new AppError("Uploaded file exceeds the allowed size.", 413);
  }

  const detected = detectFileType(buffer, policy.extension, policy.extensionRule);
  if (!detected.ok) {
    throw new AppError("Uploaded file content does not match the allowed file type.", 400);
  }

  return {
    buffer,
    displayName: policy.displayName,
    extension: policy.extension,
    fileSizeBytes: buffer.length,
    mimeTypeClaimed: policy.mimeTypeClaimed,
    mimeTypeDetected: detected.mimeType,
    metadata: policy.metadata,
    originalFilename: policy.originalFilename,
    sha256Hash: createHash("sha256").update(buffer).digest("hex"),
  };
}

/** @param {FileSession} session @param {LooseRecord & {fileStream?: import("node:stream").Readable}} payload @param {AttachableType} attachableType @param {WorkspaceFileSettings} fileSettings @returns {Promise<PreparedUpload>} */
async function prepareStreamedUpload(session, payload, attachableType, fileSettings) {
  const policy = prepareUploadPolicy(payload, attachableType, fileSettings);
  const fileStream = payload.fileStream;

  if (!fileStream || typeof fileStream.pipe !== "function") {
    throw new AppError("Uploaded file stream is required.", 400);
  }

  const storageProvider = resolveConfiguredFileStorageProvider();
  const uploadLimit = await filesStorageAccountingService.resolveStreamedUploadLimit({
    fileSettings,
    maxFileSizeBytes: policy.maxSize,
    userId: session.user_id,
    workspaceId: session.workspace_id,
  });
  const tracker = createStreamUploadTracker(uploadLimit, {
    extension: policy.extension,
    extensionRule: policy.extensionRule,
  });
  tracker.stream.on("error", () => {});
  fileStream.on("error", (/** @type {Error | undefined} */ error) => {
    tracker.stream.destroy(error);
  });
  const guardedStream = fileStream.pipe(tracker.stream);
  let storage;
  try {
    storage = await storageProvider.adapter.saveStream(guardedStream, { workspaceId: session.workspace_id });
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError("Uploaded file could not be stored.", 500);
  }
  const streamed = tracker.result();

  if (streamed.fileSizeBytes < 1) {
    await deleteRejectedUploadStorage(storageProvider, storage, "empty_stream");
    throw new AppError("Uploaded file content is required.", 400);
  }

  const detected = detectFileType(streamed.sampleBuffer, policy.extension, policy.extensionRule);
  if (!detected.ok) {
    await deleteRejectedUploadStorage(storageProvider, storage, "file_type_mismatch");
    throw new AppError("Uploaded file content does not match the allowed file type.", 400);
  }
  try {
    await filesStorageAccountingService.assertStorageQuotaAllowsUpload({
      fileSettings,
      uploadBytes: streamed.fileSizeBytes,
      userId: session.user_id,
      workspaceId: session.workspace_id,
    });
  } catch (error) {
    await deleteRejectedUploadStorage(storageProvider, storage, "quota_rejected_after_stream");
    throw error;
  }

  return {
    displayName: policy.displayName,
    extension: policy.extension,
    fileSizeBytes: streamed.fileSizeBytes,
    mimeTypeClaimed: policy.mimeTypeClaimed,
    mimeTypeDetected: detected.mimeType,
    metadata: policy.metadata,
    originalFilename: policy.originalFilename,
    sha256Hash: streamed.sha256Hash,
    storageKey: storage.storageKey,
    storageProvider: storageProvider.providerId,
    storedFilename: storage.storedFilename,
  };
}

/** @param {LooseRecord} payload @param {AttachableType} attachableType @param {WorkspaceFileSettings} fileSettings */
function prepareUploadPolicy(payload, attachableType, fileSettings) {
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

  return {
    displayName: normalizeOptionalText(payload.displayName, { maxLength: 180 }) || originalFilename,
    extension,
    extensionRule,
    maxSize: Math.min(
      Number.parseInt(String(attachableType.maxFileSizeBytes || ""), 10) || DEFAULT_MAX_FILE_SIZE_BYTES,
      DEFAULT_MAX_FILE_SIZE_BYTES,
    ),
    metadata: {
      category: extensionRule.category,
      risky_extension: extensionRule.risky,
    },
    mimeTypeClaimed: normalizeOptionalText(payload.mimeType, { maxLength: 200 }) || "",
    originalFilename,
  };
}

/**
 * @param {import("../types/database-contracts.js").DatabaseRow} file
 */
/** @param {FileRow} file @param {string} [operation] */
async function assertStoredFileObjectExists(file, operation = "read") {
  const adapter = getFileStorageAdapter(file.storage_provider);

  try {
    await adapter.metadata(file.storage_key);
  } catch (error) {
    throw storageObjectUnavailableError(error, operation);
  }

  return adapter;
}

/**
 * @param {unknown} error
 * @param {string} operation
 */
/** @param {unknown} error @param {string} operation */
function storageObjectUnavailableError(error, operation) {
  if (isStorageObjectNotFoundError(error)) {
    return new AppError("File content is no longer available.", 404);
  }

  if (error instanceof AppError) {
    return error;
  }

  const message = operation === "download"
    ? "File content is not available for download."
    : "Preview content is not available for that file.";
  return new AppError(message, 502);
}

/**
 * @param {unknown} error
 */
/** @param {unknown} error */
function isStorageObjectNotFoundError(error) {
  const failure = /** @type {{statusCode?: unknown, status?: unknown, code?: unknown, name?: unknown}} */ (error);
  const statusCode = Number(failure?.statusCode || failure?.status || failure?.code);
  if (statusCode === 404) {
    return true;
  }

  return ["ENOENT", "NoSuchKey", "NotFound", "NotFoundError"].includes(String(failure?.code || failure?.name || ""));
}

/** @param {{adapter: FileStorageAdapter, providerId: string}} storageProvider @param {{storageKey?: string}} storage @param {string} reason */
async function deleteRejectedUploadStorage(storageProvider, storage, reason) {
  if (!storage?.storageKey) {
    return;
  }

  try {
    await storageProvider.adapter.delete(storage.storageKey);
  } catch (error) {
    console.warn("[files] Rejected upload storage cleanup failed.", {
      error: safeLogErrorMessage(error),
      provider: sanitizeStorageProviderStatus(storageProvider.providerId),
      reason: sanitizeStorageProviderStatus(reason),
    });
  }
}

/** @param {string} workspaceId @param {import("../types/database-contracts.js").TransactionClient} [database] */
/** @param {string} workspaceId @param {typeof db | import("../types/database-contracts.js").TransactionClient} [database] */
async function purgeWorkspaceStorageObjects(workspaceId, database = db) {
  const files = await filesRepo.readWorkspaceStorageObjects(workspaceId, database);
  let deletedBytes = 0;
  let deletedCount = 0;

  for (const file of files) {
    const adapter = getFileStorageAdapter(file.storage_provider);
    try {
      await adapter.delete(file.storage_key);
    } catch (error) {
      if (!isStorageObjectNotFoundError(error)) throw error;
    }
    deletedCount += 1;
    deletedBytes += Number(file.file_size_bytes) || 0;
  }

  return { deletedBytes, deletedCount };
}

/**
 * @param {unknown} error
 */
/** @param {unknown} error */
function safeLogErrorMessage(error) {
  const failure = /** @type {{message?: unknown}} */ (error);
  return String(failure?.message || error || "storage cleanup failed")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 200) || "storage cleanup failed";
}

/** @param {{maxBytes: number, exceededMessage: string, statusCode: number}} limit @param {LooseRecord} [options] */
function createStreamUploadTracker(limit, options = {}) {
  const normalizedLimit = normalizeUploadLimit(limit);
  const hash = createHash("sha256");
  /** @type {Buffer[]} */
  const sampleChunks = [];
  const sampleLimit = STREAM_SAMPLE_LIMIT_BYTES;
  let fileSizeBytes = 0;
  let sampleBytes = 0;
  let sampleValidationComplete = false;

  const stream = new Transform({
    transform(chunk, encoding, callback) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding);
      const nextSize = fileSizeBytes + buffer.length;

      if (nextSize > normalizedLimit.maxBytes) {
        callback(new AppError(normalizedLimit.exceededMessage, normalizedLimit.statusCode));
        return;
      }

      fileSizeBytes = nextSize;
      hash.update(buffer);

      if (sampleBytes < sampleLimit) {
        const remaining = sampleLimit - sampleBytes;
        const sample = buffer.subarray(0, Math.min(buffer.length, remaining));
        sampleChunks.push(sample);
        sampleBytes += sample.length;
      }

      if (!sampleValidationComplete && sampleBytes > 0) {
        const validation = validateStreamedUploadSample(Buffer.concat(sampleChunks), options, sampleLimit);
        if (!validation.ok) {
          callback(new AppError("Uploaded file content does not match the allowed file type.", 400));
          return;
        }
        sampleValidationComplete = validation.complete;
      }

      callback(null, buffer);
    },
  });

  return {
    result() {
      return {
        fileSizeBytes,
        sampleBuffer: Buffer.concat(sampleChunks),
        sha256Hash: hash.digest("hex"),
      };
    },
    stream,
  };
}

/** @param {Buffer} sampleBuffer @param {LooseRecord} [options] @param {number} [sampleLimit] */
function validateStreamedUploadSample(sampleBuffer, options = {}, sampleLimit = STREAM_SAMPLE_LIMIT_BYTES) {
  const extension = String(options.extension || "").toLowerCase();
  const extensionRule = options.extensionRule && typeof options.extensionRule === "object"
    ? /** @type {{category: string, mime: string, risky: boolean}} */ (options.extensionRule)
    : ALLOWED_EXTENSIONS.get(extension);

  if (!extensionRule) {
    return { complete: true, ok: true };
  }

  if (STREAM_TEXT_SAMPLE_EXTENSIONS.has(extension)) {
    const detected = detectFileType(sampleBuffer, extension, extensionRule);
    return {
      complete: sampleBuffer.length >= sampleLimit,
      ok: detected.ok,
    };
  }

  const requiredBytes = STREAM_SIGNATURE_SAMPLE_BYTES.get(extension);
  if (!requiredBytes) {
    return { complete: true, ok: true };
  }
  if (sampleBuffer.length < requiredBytes) {
    return { complete: false, ok: true };
  }

  const detected = detectFileType(sampleBuffer, extension, extensionRule);
  return {
    complete: true,
    ok: detected.ok,
  };
}

/**
 * @param {string} limit
 */
/** @param {LooseRecord} limit */
function normalizeUploadLimit(limit) {
  if (limit && typeof limit === "object") {
    return {
      exceededMessage: normalizeOptionalText(limit.exceededMessage, { maxLength: 200 }) || "Uploaded file exceeds the allowed size.",
      maxBytes: clampInteger(limit.maxBytes, DEFAULT_MAX_FILE_SIZE_BYTES, 0, Number.MAX_SAFE_INTEGER),
      statusCode: clampInteger(limit.statusCode, 413, 400, 599),
    };
  }

  return {
    exceededMessage: "Uploaded file exceeds the allowed size.",
    maxBytes: clampInteger(limit, DEFAULT_MAX_FILE_SIZE_BYTES, 0, Number.MAX_SAFE_INTEGER),
    statusCode: 413,
  };
}

/** @param {unknown} value */
function decodeBase64(value) {
  const text = String(value || "").trim();

  if (!text || !/^[A-Za-z0-9+/=\r\n]+$/.test(text)) {
    throw new AppError("Uploaded file content must be base64 encoded.", 400);
  }

  return Buffer.from(text, "base64");
}

/** @param {Buffer} buffer @param {string} extension @param {{category: string, mime: string, risky: boolean}} extensionRule */
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

/**
 * @param {Buffer} buffer
 */
/** @param {Buffer} buffer */
function isMostlyText(buffer) {
  const sample = buffer.subarray(0, Math.min(buffer.length, 1024));
  return [...sample].every((byte) => byte === 9 || byte === 10 || byte === 13 || (byte >= 32 && byte <= 126));
}

/**
 * @param {import("../types/database-contracts.js").DatabaseRow} file
 */
/** @param {FileRow} file @returns {FileResponseHeaders} */
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

/**
 * @param {import("../types/database-contracts.js").DatabaseRow} attachment
 */
/**
 * @param {string} workspaceId
 * @param {unknown} fileId
 */
async function readFileRow(workspaceId, fileId) {
  return filesRepo.readFile(workspaceId, fileId);
}

/**
 * @param {string} workspaceId
 */
async function readWorkspaceFileSettingsForWorkspace(workspaceId) {
  const row = await filesRepo.readWorkspaceFileSettings(workspaceId);

  if (row) {
    return normalizeWorkspaceFileSettingsRow(row);
  }

  const defaults = defaultWorkspaceFileSettings(workspaceId);
  const now = new Date().toISOString();
  await filesRepo.createWorkspaceFileSettingsIfMissing({
    allowedExtensionsJson: JSON.stringify(defaults.allowedExtensions),
    blockedExtensionsJson: JSON.stringify(defaults.blockedExtensions),
    createdAt: now,
    fileTypePolicyMode: defaults.fileTypePolicyMode,
    internalStorageLimitBytes: null,
    metadataJson: "{}",
    perUserStorageLimitBytes: null,
    updatedAt: now,
    workspaceId,
  });

  return defaults;
}

/**
 * @param {string} workspaceId
 * @param {unknown} attachmentId
 */
async function readAttachmentById(workspaceId, attachmentId) {
  return filesRepo.readAttachmentById(workspaceId, attachmentId);
}

/**
 * @param {string} workspaceId
 * @param {unknown} fileId
 */
async function readActiveAttachmentsForFile(workspaceId, fileId) {
  return filesRepo.readActiveAttachmentsForFile(workspaceId, fileId);
}

/**
 * @param {FileSession} session
 * @param {AttachmentRow[]} attachments
 */
async function findReadableAttachment(session, attachments) {
  for (const attachment of attachments) {
    if (await canReadAttachment(session, attachment)) {
      return attachment;
    }
  }

  return null;
}

/** @param {FileSession} session @param {AttachmentRow[]} attachments */
async function canReadAnyAttachment(session, attachments) {
  return Boolean(await findReadableAttachment(session, attachments));
}

/**
 * @param {FileSession} session
 * @param {AttachmentRow} attachment
 */
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

/**
 * @param {import("../types/http-contracts.js").PermissionSession | null | undefined} session
 * @param {import("../types/database-contracts.js").DatabaseRow} file
 */
/** @param {FileSession} session @param {FileRow} file @param {AttachmentRow[]} [attachments] @param {LooseRecord} [options] */
async function assertCanDeleteFile(session, file, attachments = [], options = {}) {
  const operation = String(options.operation || "delete");
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

/**
 * @param {import("../types/http-contracts.js").NormalRequestSession | import("../types/http-contracts.js").SupportViewRequestSession | import("../types/http-contracts.js").PrivateFeedAuthorizationSession | null | undefined} session
 */
/** @param {FileSession} session @param {LooseRecord} [filters] */
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

/**
 * @param {string} workspaceId
 * @param {unknown} moduleId
 * @param {unknown} targetType
 */
/** @param {string} workspaceId @param {unknown} moduleId @param {unknown} targetType */
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

/**
 * @param {{ workspace_id: string; }} session
 * @param {unknown} moduleId
 * @param {unknown} targetType
 */
/** @param {FileSession} session @param {string} moduleId @param {string} targetType @param {string[]} [targetIds] */
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

/** @param {FileSession} session @param {AttachableType} attachableType @param {string} operation @param {AttachableTargetRow | null} [target] */
async function assertModuleTargetAccess(session, attachableType, operation, target = null) {
  if (attachableType.moduleId !== "notes" || attachableType.targetType !== "note") {
    return;
  }

  const accessOperation = operation === "read" || operation === "download" ? "read" : "update";
  await notesService.readForAttachmentAccess(session, target?.target_id || "", accessOperation);
}

/** @param {FileSession} session @param {AttachableType} attachableType @param {AttachmentRow} attachment */
async function canReadModuleTargetAttachment(session, attachableType, attachment) {
  if (attachableType.moduleId !== "notes" || attachableType.targetType !== "note") {
    return true;
  }

  try {
    await notesService.readForAttachmentAccess(session, attachment.target_id || "", "read");
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {import("../types/database-contracts.js").DatabaseRow | null} file
 */
/** @param {FileRow} file */
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

/**
 * @param {import("../types/database-contracts.js").DatabaseRow | null} attachment
 */
/** @param {AttachmentRow} attachment */
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
      createdAt: attachment.file_created_at || null,
      created_at: attachment.file_created_at || null,
      updatedAt: attachment.file_updated_at || null,
      updated_at: attachment.file_updated_at || null,
      deletedAt: attachment.file_deleted_at || null,
      deleted_at: attachment.file_deleted_at || null,
    },
  };
}

/**
 * @param {import("../types/http-contracts.js").WorkspaceRequestSession} session
 * @param {import("../types/database-contracts.js").DatabaseRow | null} attachment
 */
/** @param {FileSession} session @param {AttachmentRow} attachment */
async function shapeAttachmentForRead(session, attachment) {
  const shaped = shapeAttachment(attachment);
  const uploadedByLabel = uploadedByLabelForSession(session, attachment.file_uploaded_by_user_id);
  const [target, contextLabels] = await Promise.all([
    readAttachmentTargetLabel(session.workspace_id, attachment),
    readAttachmentContextLabels(session.workspace_id, attachment),
  ]);

  return {
    ...shaped,
    file: {
      ...shaped.file,
      uploadedByLabel,
      uploaded_by_label: uploadedByLabel,
    },
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

/**
 * @param {import("../types/http-contracts.js").WorkspaceRequestSession} session
 * @param {unknown} uploadedByUserId
 */
/** @param {FileSession} session @param {unknown} uploadedByUserId */
function uploadedByLabelForSession(session, uploadedByUserId) {
  if (!uploadedByUserId || uploadedByUserId !== session.user_id) {
    return "";
  }

  const profile = /** @type {LooseRecord} */ (/** @type {unknown} */ (session));
  return String(profile.display_name || profile.displayName || session.username || "Current user");
}

/**
 * @param {string} workspaceId
 * @param {import("../types/database-contracts.js").DatabaseRow | null} attachment
 */
/** @param {string} workspaceId @param {AttachmentRow} attachment */
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

/**
 * @param {string} workspaceId
 * @param {import("../types/database-contracts.js").DatabaseRow | null} attachment
 */
/** @param {string} workspaceId @param {AttachmentRow} attachment */
async function readAttachmentContextLabels(workspaceId, attachment) {
  return filesRepo.readAttachmentContextLabels(
    workspaceId,
    attachment.client_id || "",
    attachment.project_id || "",
  );
}

/**
 * @param {string} workspaceId
 */
/** @param {string} workspaceId */
async function readWorkspaceType(workspaceId) {
  const row = await filesRepo.readWorkspaceType(workspaceId);

  return normalizeWorkspaceType(row?.workspace_type);
}

/** @param {LooseRecord} [filters] */
function normalizeAttachableTargetOptionFilters(filters = {}) {
  return {
    clientId: normalizeOptionalText(filters.clientId ?? filters.client_id),
    limit: clampInteger(filters.limit || filters.pageSize || filters.page_size, DEFAULT_ATTACHABLE_TARGET_LIMIT, 1, MAX_ATTACHABLE_TARGET_LIMIT),
    moduleId: normalizeOptionalText(filters.moduleId ?? filters.module_id),
    projectId: normalizeOptionalText(filters.projectId ?? filters.project_id),
    search: normalizeOptionalText(filters.q ?? filters.search ?? filters.query, { maxLength: 120 }),
    targetType: normalizeOptionalText(filters.targetType ?? filters.target_type),
  };
}

/** @param {string} workspaceId @param {AttachableType} attachableType @param {LooseRecord} filters @param {LooseRecord} contextScope @param {string} workspaceType @param {number} limit */
async function readAttachableTargetOptionRows(workspaceId, attachableType, filters, contextScope, workspaceType, limit) {
  return filesRepo.readAttachableTargetOptionRows(
    workspaceId,
    attachableType,
    filters,
    contextScope,
    workspaceType,
    limit,
    attachableTargetFields(attachableType),
  );
}

/** @param {FileSession} session @param {AttachableType} attachableType @param {AttachableTargetRow} row @param {string} workspaceType */
async function shapePermittedAttachableTargetOption(session, attachableType, row, workspaceType) {
  try {
    await assertCanUseAttachableTarget(session, attachableType, "read", row);
    await assertCanUseAttachableTarget(session, attachableType, "attach", row);
  } catch {
    return null;
  }

  const moduleLabel = moduleLabelForAttachableType(attachableType);
  const targetTypeLabel = safeDisplayLabel(attachableType.label, "Record");
  const targetLabel = safeDisplayLabel(row.target_label, `Untitled ${targetTypeLabel}`, [
    row.target_id,
    row.workspace_id,
    row.client_id,
    row.project_id,
  ]);
  const contextIds = attachmentTargetContextIds(attachableType, row);
  /** @type {AttachableTargetOption} */
  const option = {
    label: targetLabel,
    moduleId: attachableType.moduleId,
    moduleLabel,
    targetId: row.target_id || "",
    targetType: attachableType.targetType,
    targetTypeLabel,
    value: {
      moduleId: attachableType.moduleId,
      targetId: row.target_id || "",
      targetType: attachableType.targetType,
    },
  };

  if (workspaceType === "business" && contextIds.clientId) {
    option.clientId = contextIds.clientId;
    option.value.clientId = contextIds.clientId;
  }
  if (contextIds.projectId) {
    option.projectId = contextIds.projectId;
    option.value.projectId = contextIds.projectId;
  }

  return option;
}

/** @param {string} workspaceId @param {AttachableTargetOption[]} options @param {string} workspaceType @returns {Promise<AttachableTargetOption[]>} */
async function decorateAttachableTargetOptions(workspaceId, options, workspaceType) {
  const clientIds = workspaceType === "business"
    ? uniqueNonEmpty(options.map((option) => option.clientId))
    : [];
  const projectIds = uniqueNonEmpty(options.map((option) => option.projectId));
  const [clientLabels, projectLabels] = await Promise.all([
    readClientLabelMap(workspaceId, clientIds),
    readProjectLabelMap(workspaceId, projectIds),
  ]);

  return options.map((option) => {
    /** @type {AttachableTargetOption} */
    const decorated = {
      ...option,
      value: { ...option.value },
    };
    const projectLabel = safeDisplayLabel(projectLabels.get(option.projectId || ""), "", [option.projectId]);
    const contextParts = [];

    if (workspaceType === "business" && option.clientId) {
      const clientLabel = safeDisplayLabel(clientLabels.get(option.clientId), "", [option.clientId]);

      if (clientLabel) {
        decorated.clientLabel = clientLabel;
        contextParts.push(clientLabel);
      }
    } else {
      delete decorated.clientId;
      delete decorated.value.clientId;
    }

    if (option.projectId && projectLabel) {
      decorated.projectLabel = projectLabel;
      contextParts.push(projectLabel);
    }

    decorated.contextLabel = contextParts.join(" / ");
    return decorated;
  });
}

/** @param {LooseRecord[]} options @param {string} workspaceType */
function buildAttachableTargetOptionFilters(options, workspaceType) {
  const filters = {
    client: workspaceType === "business"
      ? { options: buildContextFilterOptions(options, "clientId", "clientLabel"), visible: true }
      : { visible: false },
    module: {
      options: uniqueBy(options.map((option) => ({
        label: option.moduleLabel,
        value: option.moduleId,
      })), "value"),
      visible: true,
    },
    project: {
      options: buildContextFilterOptions(options, "projectId", "projectLabel"),
      visible: true,
    },
    targetType: {
      options: buildAttachableTargetTypeOptions(options),
      visible: true,
    },
  };

  return filters;
}

/** @param {LooseRecord[]} options @param {string} idField @param {string} labelField */
function buildContextFilterOptions(options, idField, labelField) {
  return uniqueBy(
    options
      .filter((option) => option[idField] && option[labelField])
      .map((option) => ({
        label: option[labelField],
        value: option[idField],
      })),
    "value",
  ).sort(compareLabels);
}

/** @param {LooseRecord[]} options */
function buildAttachableTargetTypeOptions(options) {
  return uniqueBy(options.map((option) => ({
    label: `${option.moduleLabel}: ${option.targetTypeLabel}`,
    moduleId: option.moduleId,
    moduleLabel: option.moduleLabel,
    targetType: option.targetType,
    targetTypeLabel: option.targetTypeLabel,
    value: `${option.moduleId}:${option.targetType}`,
  })), "value").sort(compareLabels);
}

/** @param {LooseRecord} left @param {LooseRecord} right */
function compareAttachableTargetOptions(left, right) {
  return String(left.moduleLabel || "").localeCompare(String(right.moduleLabel || ""), undefined, { sensitivity: "base" }) ||
    String(left.targetTypeLabel || "").localeCompare(String(right.targetTypeLabel || ""), undefined, { sensitivity: "base" }) ||
    String(left.label || "").localeCompare(String(right.label || ""), undefined, { sensitivity: "base" });
}

/** @param {LooseRecord} left @param {LooseRecord} right */
function compareLabels(left, right) {
  return String(left.label || "").localeCompare(String(right.label || ""), undefined, { sensitivity: "base" });
}

/**
 * @param {object} filters
 * @param {PropertyKey[]} keys
 */
/** @param {LooseRecord} filters @param {string[]} keys */
function hasFilterParameter(filters, keys) {
  if (!filters || typeof filters !== "object") {
    return false;
  }

  return keys.some((/** @type {PropertyKey} */ key) => Object.hasOwn(filters, key));
}

/** @param {string} workspaceId @param {string[]} clientIds */
async function readClientLabelMap(workspaceId, clientIds) {
  const rows = await filesRepo.readClientLabels(workspaceId, clientIds);

  return new Map(rows.map((row) => [row.id, row.name || ""]));
}

/** @param {string} workspaceId @param {string[]} projectIds */
async function readProjectLabelMap(workspaceId, projectIds) {
  const rows = await filesRepo.readProjectLabels(workspaceId, projectIds);

  return new Map(rows.map((row) => [row.id, row.name || ""]));
}

/**
 * @param {{ moduleId: string; }} attachableType
 */
/** @param {AttachableType} attachableType */
function moduleLabelForAttachableType(attachableType) {
  const moduleDefinition = modulesService.getModule(attachableType.moduleId);
  return safeDisplayLabel(moduleDefinition?.displayName || moduleDefinition?.name, attachableType.moduleId || "Module");
}

/**
 * @param {unknown} value
 */
/** @param {unknown} value */
function normalizeWorkspaceType(value) {
  const workspaceType = String(value || "").trim().toLowerCase();
  return ["business", "personal", "family"].includes(workspaceType) ? workspaceType : "business";
}

/**
 * @param {string | undefined} value
 */
/** @param {unknown} value @param {unknown} [fallback] @param {unknown[]} [hiddenIds] */
function safeDisplayLabel(value, fallback = "", hiddenIds = []) {
  const label = normalizeOptionalText(value, { maxLength: 180 });

  if (!label || looksLikeRawIdentifier(label) || hiddenIds.some((id) => id && String(id).toLowerCase() === label.toLowerCase())) {
    return normalizeOptionalText(fallback, { maxLength: 180 });
  }

  return label;
}

/**
 * @param {string} value
 */
/** @param {unknown} value */
function looksLikeRawIdentifier(value) {
  const text = String(value || "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(text) ||
    /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}/i.test(text);
}

/** @param {unknown[]} values */
function uniqueNonEmpty(values) {
  return [...new Set(values.map((value) => String(value || "").trim()).filter(Boolean))];
}

/** @param {LooseRecord[]} items @param {string} keyField */
function uniqueBy(items, keyField) {
  const seen = new Set();
  const unique = [];

  for (const item of items) {
    const key = String(item[keyField] || "");

    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
    unique.push(item);
  }

  return unique;
}

/** @param {AttachableType} attachableType @param {AttachableTargetRow | null} target */
function resolvePermissionClientId(attachableType, target) {
  if (attachableType.targetType === "client") {
    return target?.target_id || "";
  }

  return target?.client_id || "";
}

/** @param {AttachableType} attachableType @param {AttachableTargetRow | null} target */
function resolvePermissionProjectId(attachableType, target) {
  if (attachableType.targetType === "project") {
    return target?.target_id || "";
  }

  return target?.project_id || "";
}

/**
 * @param {{ targetType: string; }} attachableType
 */
/** @param {AttachableType} attachableType @param {AttachableTargetRow} [target] */
function attachmentTargetContextIds(attachableType, target = /** @type {AttachableTargetRow} */ ({})) {
  return {
    clientId: attachableType.targetType === "client" ? target.target_id || "" : target.client_id || "",
    projectId: attachableType.targetType === "project" ? target.target_id || "" : target.project_id || "",
  };
}

/** @param {Partial<AttachmentRow>} [row] */
function attachmentContextFromRow(row = {}) {
  return {
    clientId: row.client_id || "",
    moduleId: row.module_id || "",
    projectId: row.project_id || "",
    targetId: row.target_id || "",
    targetType: row.target_type || "",
  };
}

/**
 * @param {{ moduleId?: string; targetType?: string; }} attachableType
 * @param {{} | undefined} target
 */
/** @param {AttachableType} attachableType @param {AttachableTargetRow} target @param {LooseRecord} [payload] */
function assertAttachmentContextPayloadMatchesTarget(attachableType, target, payload = {}) {
  const providedClientId = normalizeOptionalText(payload.clientId ?? payload.client_id);
  const providedProjectId = normalizeOptionalText(payload.projectId ?? payload.project_id);
  const expected = attachmentTargetContextIds(attachableType, target);

  if (providedClientId && providedClientId !== expected.clientId) {
    throw new AppError("Selected Client does not match the selected attachment target.", 400);
  }
  if (providedProjectId && providedProjectId !== expected.projectId) {
    throw new AppError("Selected Project does not match the selected attachment target.", 400);
  }
}

/** @param {string} workspaceId @param {AttachmentRow} attachment @param {AttachableType} attachableType @param {AttachableTargetRow} target */
async function assertNoDuplicateActiveAttachmentContext(workspaceId, attachment, attachableType, target) {
  const row = await filesRepo.findDuplicateActiveAttachment({
    attachableType,
    attachment,
    target,
    workspaceId,
  });

  if (row) {
    throw new AppError("That file is already attached to the selected target.", 409);
  }
}

/** @param {LooseRecord} left @param {LooseRecord} right */
function attachmentContextsEqual(left, right) {
  return ["moduleId", "targetType", "targetId", "clientId", "projectId"]
    .every((key) => String(left?.[key] || "") === String(right?.[key] || ""));
}

/** @param {FileSession} session @param {AttachmentRow} updatedAttachment @param {LooseRecord} previousContext @param {LooseRecord} nextContext */
async function emitAttachmentContextUpdateEvents(session, updatedAttachment, previousContext, nextContext) {
  const sharedMetadata = {
    context_update: true,
    next_client_id: nextContext.clientId,
    next_module_id: nextContext.moduleId,
    next_project_id: nextContext.projectId,
    next_target_id: nextContext.targetId,
    next_target_type: nextContext.targetType,
    previous_client_id: previousContext.clientId,
    previous_module_id: previousContext.moduleId,
    previous_project_id: previousContext.projectId,
    previous_target_id: previousContext.targetId,
    previous_target_type: previousContext.targetType,
  };
  const events = [{ context: previousContext, scope: "previous" }];

  if (!attachmentContextsEqual(previousContext, nextContext)) {
    events.push({ context: nextContext, scope: "next" });
  }

  for (const event of events) {
    await emitFileLifecycleEvent("file.attachment.context_updated", {
      session,
      attachmentId: updatedAttachment.file_attachment_id,
      fileId: updatedAttachment.file_id,
      metadata: {
        ...sharedMetadata,
        context_scope: event.scope,
      },
      moduleId: event.context.moduleId,
      scanStatus: updatedAttachment.scan_status,
      status: updatedAttachment.file_status,
      targetId: event.context.targetId,
      targetType: event.context.targetType,
    });
  }
}

/** @param {LooseRecord} [context] */
function auditAttachmentContext(context = {}) {
  return {
    client_id: context.clientId || "",
    module_id: context.moduleId || "",
    project_id: context.projectId || "",
    target_id: context.targetId || "",
    target_type: context.targetType || "",
  };
}

/** @param {unknown} value @param {AttachableType} attachableType */
function normalizeVisibility(value, attachableType) {
  const visibility = String(value || "private").trim();
  const allowed = new Set(attachableType.allowedVisibilityValues || DEFAULT_ALLOWED_VISIBILITY);

  if (!allowed.has(visibility)) {
    throw new AppError("That file visibility is not allowed for this record type.", 400);
  }

  return visibility;
}

/** @param {unknown} value */
function normalizeFileStatusFilter(value) {
  const status = String(value || "available").trim().toLowerCase();

  return ["all", "available", "deleted", "pending", "quarantined"].includes(status) ? status : "available";
}

/** @param {unknown} value */
function normalizeStorageKind(value) {
  const storageKind = String(value || "").trim().toLowerCase();

  return ["internal", "external"].includes(storageKind) ? storageKind : "";
}

/** @param {string} extension @param {WorkspaceFileSettings} settings */
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

/** @param {LooseRecord} [filters] */
function normalizeAttachmentListOptions(filters = {}) {
  const paginate = filters.allPages !== true && filters.all_pages !== "true";
  const pagination = normalizeBoundedPagination(filters, {
    defaultLimit: DEFAULT_ATTACHMENT_LIMIT,
    maxLimit: MAX_ATTACHMENT_LIMIT,
  });
  const sort = normalizeOptionalText(filters.sort || filters.sortMode || filters.sort_mode) || "newest";

  return {
    ...pagination,
    paginate,
    sort: ATTACHMENT_SORT_MODES.has(sort) ? sort : "newest",
  };
}

/** @template T @param {T[]} [attachments] @param {string} [sortMode] @returns {T[]} */
function sortAttachmentsForReadModel(attachments = [], sortMode = "newest") {
  return [...attachments].sort((left, right) => {
    const leftRecord = /** @type {LooseRecord} */ (left);
    const rightRecord = /** @type {LooseRecord} */ (right);
    if (sortMode === "oldest") {
      return compareCreatedAsc(leftRecord, rightRecord) || compareFilenameAsc(leftRecord, rightRecord);
    }
    if (sortMode === "filename") {
      return compareFilenameAsc(leftRecord, rightRecord) || compareCreatedDesc(leftRecord, rightRecord);
    }
    if (sortMode === "size") {
      return compareFileSizeDesc(leftRecord, rightRecord) || compareCreatedDesc(leftRecord, rightRecord);
    }
    if (sortMode === "status") {
      return compareFileStatusAsc(leftRecord, rightRecord) || compareCreatedDesc(leftRecord, rightRecord);
    }

    return compareCreatedDesc(leftRecord, rightRecord) || compareFilenameAsc(leftRecord, rightRecord);
  });
}

/** @param {LooseRecord} [left] @param {LooseRecord} [right] */
function compareCreatedDesc(left = {}, right = {}) {
  return String(right.createdAt || right.created_at || "").localeCompare(String(left.createdAt || left.created_at || ""));
}

/** @param {LooseRecord} [left] @param {LooseRecord} [right] */
function compareCreatedAsc(left = {}, right = {}) {
  return String(left.createdAt || left.created_at || "").localeCompare(String(right.createdAt || right.created_at || ""));
}

/** @param {LooseRecord} [left] @param {LooseRecord} [right] */
function compareFilenameAsc(left = {}, right = {}) {
  const leftFile = parseJsonObject(left.file);
  const rightFile = parseJsonObject(right.file);
  return String(leftFile.displayName || leftFile.originalFilename || "").localeCompare(
    String(rightFile.displayName || rightFile.originalFilename || ""),
    undefined,
    { sensitivity: "base" },
  );
}

/** @param {LooseRecord} [left] @param {LooseRecord} [right] */
function compareFileSizeDesc(left = {}, right = {}) {
  return Number(parseJsonObject(right.file).fileSizeBytes || 0) - Number(parseJsonObject(left.file).fileSizeBytes || 0);
}

/** @param {LooseRecord} [left] @param {LooseRecord} [right] */
function compareFileStatusAsc(left = {}, right = {}) {
  return String(parseJsonObject(left.file).status || "").localeCompare(String(parseJsonObject(right.file).status || ""), undefined, { sensitivity: "base" });
}

/**
 * @param {string} value
 * @param {number} fallback
 * @param {number} minimum
 * @param {number} maximum
 */
/** @param {unknown} value @param {number} fallback @param {number} minimum @param {number} maximum */
function clampInteger(value, fallback, minimum, maximum) {
  const parsed = Number.parseInt(String(value || ""), 10);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(Math.max(parsed, minimum), maximum);
}

/** @param {unknown} value @returns {string[]} */
function normalizeTargetIds(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  }

  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

/**
 * @param {string} category
 */
/** @param {unknown} category @param {string[]} [allowedCategories] */
function isCategoryAllowed(category, allowedCategories = []) {
  return allowedCategories.length === 0 || allowedCategories.includes(String(category || "")) || allowedCategories.includes("other");
}

/** @param {AttachableType} attachableType @param {string} operation */
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

/**
 * @param {{}} value
 */
/** @param {unknown} value */
function sanitizeFilename(value) {
  const filename = path.basename(String(value || "").replaceAll("\\", "/")).trim();

  if (!filename || filename === "." || filename === "..") {
    throw new AppError("Original filename is required.", 400);
  }

  return filename.replace(/[^\w .()[\]-]+/g, "_").slice(0, 180);
}

/**
 * @param {string | undefined} value
 * @param {string} message
 */
/** @param {unknown} value @param {string} message */
function normalizeRequiredText(value, message) {
  const text = String(value || "").trim();

  if (!text) {
    throw new AppError(message, 400);
  }

  return text;
}

/**
 * @param {string | null | undefined} value
 */
/** @param {unknown} value @param {{maxLength?: number}} [options] */
function normalizeOptionalText(value, options = {}) {
  if (value === null || value === undefined) {
    return "";
  }

  const text = String(value).trim();
  return options.maxLength ? text.slice(0, options.maxLength) : text;
}

/**
 * @param {string | null | undefined} value
 */
/** @param {unknown} value */
function normalizeReportReason(value) {
  const reason = normalizeOptionalText(value, { maxLength: 80 });
  const allowedReasons = new Set(["illegal", "abusive", "inappropriate", "security", "other"]);

  if (!allowedReasons.has(reason)) {
    throw new AppError("Report reason must be illegal, abusive, inappropriate, security, or other.", 400);
  }

  return reason;
}

/**
 * @param {unknown} value
 */
/** @param {unknown} value @returns {LooseRecord} */
function parseJsonObject(value) {
  if (!value) {
    return {};
  }

  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * @param {string} value
 */
/** @param {unknown} value @returns {unknown[]} */
function parseJsonArray(value) {
  if (!value) {
    return [];
  }

  try {
    const parsed = JSON.parse(String(value));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * @param {string} workspaceId
 */
/** @param {string} workspaceId @returns {WorkspaceFileSettings} */
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

/** @param {LooseRecord} [row] @returns {WorkspaceFileSettings} */
function normalizeWorkspaceFileSettingsRow(row = {}) {
  return {
    allowedExtensions: normalizeExtensionList(parseJsonArray(row.allowed_extensions_json), [...DEFAULT_SAFE_ALLOWED_EXTENSIONS]),
    blockedExtensions: normalizeExtensionList(parseJsonArray(row.blocked_extensions_json), [...DEFAULT_BLOCKED_EXTENSIONS]),
    createdAt: String(row.created_at || ""),
    fileTypePolicyMode: FILE_TYPE_POLICY_MODES.has(String(row.file_type_policy_mode || "")) ? String(row.file_type_policy_mode) : "safe_default",
    internalStorageLimitBytes: nullableInteger(row.internal_storage_limit_bytes),
    perUserStorageLimitBytes: nullableInteger(row.per_user_storage_limit_bytes),
    updatedAt: String(row.updated_at || ""),
    workspaceId: String(row.workspace_id || ""),
  };
}

/** @param {LooseRecord} [payload] @param {WorkspaceFileSettings} [previous] @returns {WorkspaceFileSettings} */
function normalizeWorkspaceFileSettingsPayload(payload = {}, previous = defaultWorkspaceFileSettings("")) {
  const mode = String(payload.fileTypePolicyMode || payload.file_type_policy_mode || previous.fileTypePolicyMode || "safe_default").trim();
  const internalStorageLimitBytes = Object.prototype.hasOwnProperty.call(payload, "internalStorageLimitBytes")
    ? payload.internalStorageLimitBytes
    : Object.prototype.hasOwnProperty.call(payload, "internal_storage_limit_bytes")
      ? payload.internal_storage_limit_bytes
      : previous.internalStorageLimitBytes;
  const perUserStorageLimitBytes = Object.prototype.hasOwnProperty.call(payload, "perUserStorageLimitBytes")
    ? payload.perUserStorageLimitBytes
    : Object.prototype.hasOwnProperty.call(payload, "per_user_storage_limit_bytes")
      ? payload.per_user_storage_limit_bytes
      : previous.perUserStorageLimitBytes;

  return {
    allowedExtensions: normalizeExtensionList(payload.allowedExtensions || payload.allowed_extensions, previous.allowedExtensions),
    blockedExtensions: normalizeExtensionList(payload.blockedExtensions || payload.blocked_extensions, previous.blockedExtensions),
    createdAt: previous.createdAt,
    fileTypePolicyMode: FILE_TYPE_POLICY_MODES.has(mode) ? mode : "safe_default",
    internalStorageLimitBytes: nullableInteger(internalStorageLimitBytes),
    perUserStorageLimitBytes: nullableInteger(perUserStorageLimitBytes),
    updatedAt: previous.updatedAt,
    workspaceId: previous.workspaceId,
  };
}

/** @param {unknown} value @param {string[]} [fallback] @returns {string[]} */
function normalizeExtensionList(value, fallback = []) {
  const source = Array.isArray(value) ? value : String(value || "").split(/[\s,]+/);
  const normalized = source
    .map(normalizeExtension)
    .filter(Boolean)
    .filter((extension, index, list) => list.indexOf(extension) === index);

  return normalized.length > 0 ? normalized : [...fallback];
}

/** @param {unknown} value */
function normalizeExtension(value) {
  const text = String(value || "").trim().toLowerCase();

  if (!text) {
    return "";
  }

  const extension = text.startsWith(".") ? text : `.${text}`;
  return /^\.[a-z0-9]+$/.test(extension) ? extension : "";
}

/**
 * @param {string | number | null | undefined} value
 */
/** @param {unknown} value */
function nullableInteger(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const parsed = Number.parseInt(String(value || ""), 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

/** @param {WorkspaceFileSettings} settings */
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

/**
 * @param {unknown} value
 */
/** @param {unknown} value @param {LooseRecord} [patch] */
function mergeFileMetadata(value, patch = {}) {
  return {
    ...parseJsonObject(value),
    ...patch,
  };
}

/**
 * @param {string} previousStatus
 * @param {unknown} scanStatus
 */
/** @param {unknown} previousStatus @param {unknown} scanStatus */
function normalizeRestorableStatus(previousStatus, scanStatus) {
  if (previousStatus === "quarantined") {
    return "quarantined";
  }
  if (previousStatus === "pending") {
    return "pending";
  }
  if (["not_required", "passed"].includes(String(scanStatus || ""))) {
    return "available";
  }

  return "pending";
}

/**
 * @param {import("../types/http-contracts.js").WorkspaceRequestSession} session
 */
/** @param {FileSession} session @param {LooseRecord} [event] */
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

function assertFileIngressAllowed() {
  return assertPublicDemoCapabilityAllowed("files.ingress");
}

const filesServiceInternal = {
  assertConfiguredFileScannerReady,
  assertFileIngressAllowed,
  assertConfiguredFileStorageProviderReady,
  attachExistingFile,
  assertCanUseAttachableTarget,
  countAttachmentsForTargets,
  deleteFile,
  downloadFile,
  emitFileLifecycleEvent,
  getFileScannerAdapter,
  getFileStorageAdapter,
  listActiveAttachableTypes,
  listAttachableTargetOptions,
  listAttachableTypes,
  listAttachments,
  listFileLifecycleEvents,
  listFileStatuses,
  listScanStatuses,
  queueFileScanJob,
  purgeWorkspaceStorageObjects,
  quarantineFile,
  readAttachmentPreviewContent,
  readAttachmentPreviewDescriptor,
  readFileForSession,
  readWorkspaceFileSettings,
  readStorageAccounting,
  recordExternalStorageAccounting,
  registerFileScanJobHandlers,
  registerFileScannerAdapter,
  registerFileStorageAdapter,
  removeAttachment,
  reportFile,
  resolveConfiguredFileScannerAdapter,
  resolveConfiguredFileStorageProvider,
  resolveAttachableType,
  restoreFile,
  refreshStorageAccounting,
  saveWorkspaceFileSettings,
  updateAttachmentContext,
  uploadAndAttach,
  uploadBatchAndAttach,
  uploadStreamAndAttach,
};

export const filesService = filesServiceInternal;

export {
  FILE_SCAN_JOB_TYPE,
  handleFileScanJob,
  queueFileScanJob,
  registerFileScanJobHandlers,
};
