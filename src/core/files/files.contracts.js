// Files edge-payload contracts.
//
// Runtime Zod schemas for the Files edges: JSON upload bodies, multipart
// upload metadata, attach-existing payloads, the File Context editor payload,
// preview requests, and storage adapter configuration. These validate
// UNTRUSTED input at the boundary; trusted internal objects passed between
// service functions are not re-parsed.
//
// Contract choices (see docs/module-development.md):
// - Unknown fields are stripped, not stored.
// - Storage/scanner/integrity fields are rejected outright when a caller
//   tries to set them: they are server-owned and never accepted from input.
// - Required-ness and context checks (registration, permissions, target
//   existence) stay in the Files service, which already owns those error
//   messages; schemas only add required checks where the service already
//   rejects with the same message today.

import { z } from "zod";
import { AppError } from "../../utils/app-error.js";

const SENSITIVE_FILE_INPUT_FIELDS = Object.freeze([
  "fileSizeBytes",
  "file_size_bytes",
  "fileHash",
  "file_hash",
  "scanReason",
  "scan_reason",
  "scanStatus",
  "scan_status",
  "sha256Hash",
  "sha256_hash",
  "status",
  "storageKey",
  "storage_key",
  "storagePath",
  "storage_path",
  "storageProvider",
  "storage_provider",
  "storedFilename",
  "stored_filename",
]);

const optionalText = (/** @type {number} */ maxLength, /** @type {string} */ label) =>
  z.string({ error: `${label} must be text.` })
    .trim()
    .max(maxLength, `${label} is too long.`)
    .optional();

const attachmentMetadataObject = z.record(z.string(), z.unknown(), {
  error: "attachmentMetadata must be a JSON object.",
});

const sortOrderValue = z.union(
  [z.string().trim().max(50), z.number()],
  { error: "sortOrder must be a number or numeric text." },
).optional();

const uploadContextFields = {
  moduleId: optionalText(100, "Module ID"),
  targetType: optionalText(100, "Target type"),
  targetId: optionalText(100, "Target ID"),
};

const attachmentFields = {
  attachmentMetadata: attachmentMetadataObject.optional(),
  attachmentRole: optionalText(100, "Attachment role"),
  caption: optionalText(500, "Caption"),
  sortOrder: sortOrderValue,
  visibility: optionalText(50, "Visibility"),
};

const uploadNamingFields = {
  displayName: optionalText(180, "Display name"),
  filename: optionalText(300, "Filename"),
  mimeType: optionalText(200, "MIME type"),
  originalFilename: optionalText(300, "Original filename"),
};

/**
 * JSON (base64) upload-and-attach request body.
 * @typedef {import("zod").infer<typeof CreateFileSchema>} CreateFilePayload
 */
const CreateFileSchema = z.object({
  ...uploadContextFields,
  ...uploadNamingFields,
  ...attachmentFields,
  content: z.string({ error: "Uploaded file content must be base64 text." }).optional(),
  contentBase64: z.string({ error: "Uploaded file content must be base64 text." }).optional(),
});

/**
 * Multipart (streamed) upload metadata after route assembly, minus the stream.
 * @typedef {import("zod").infer<typeof FileMetadataSchema>} FileUploadMetadata
 */
const FileMetadataSchema = z.object({
  ...uploadContextFields,
  ...uploadNamingFields,
  ...attachmentFields,
});

/**
 * Attach-an-existing-file request body.
 * @typedef {import("zod").infer<typeof FileAttachmentSchema>} FileAttachmentPayload
 */
const FileAttachmentSchema = z.object({
  ...uploadContextFields,
  ...attachmentFields,
  fileId: optionalText(100, "File ID"),
  metadata: attachmentMetadataObject.optional(),
});

/**
 * Batch JSON upload envelope; each item revalidates through CreateFileSchema.
 * @typedef {import("zod").infer<typeof CreateFileBatchSchema>} CreateFileBatchPayload
 */
const CreateFileBatchSchema = z.object({
  ...uploadContextFields,
  ...uploadNamingFields,
  ...attachmentFields,
  files: z.array(z.record(z.string(), z.unknown()), { error: "At least one file is required." })
    .min(1, "At least one file is required."),
});

/**
 * File Context editor payload (attachment-scoped context move).
 * Required messages match the service's existing normalizeRequiredText copy.
 * @typedef {import("zod").infer<typeof UpdateFileContextSchema>} UpdateFileContextPayload
 */
const UpdateFileContextSchema = z.object({
  moduleId: optionalText(100, "Module ID"),
  module_id: optionalText(100, "Module ID"),
  targetType: optionalText(100, "Target type"),
  target_type: optionalText(100, "Target type"),
  targetId: optionalText(100, "Target ID"),
  target_id: optionalText(100, "Target ID"),
  clientId: optionalText(100, "Client ID"),
  client_id: optionalText(100, "Client ID"),
  projectId: optionalText(100, "Project ID"),
  project_id: optionalText(100, "Project ID"),
}).superRefine((payload, ctx) => {
  if (!payload.moduleId && !payload.module_id) {
    ctx.addIssue({ code: "custom", message: "Module ID is required." });
  }
  if (!payload.targetType && !payload.target_type) {
    ctx.addIssue({ code: "custom", message: "Target type is required." });
  }
  if (!payload.targetId && !payload.target_id) {
    ctx.addIssue({ code: "custom", message: "Target ID is required." });
  }
});

/**
 * Preview descriptor/content request (attachment-scoped, route-backed).
 * @typedef {import("zod").infer<typeof FilePreviewRequestSchema>} FilePreviewRequest
 */
const FilePreviewRequestSchema = z.object({
  fileAttachmentId: z.string({ error: "Attachment not found." })
    .trim()
    .min(1, "Attachment not found.")
    .max(200, "Attachment not found."),
});

/**
 * Storage adapter configuration (install-level, from runtime config).
 * @typedef {import("zod").infer<typeof FileStorageAdapterConfigSchema>} FileStorageAdapterConfig
 */
const FileStorageAdapterConfigSchema = z.object({
  provider: z.string().trim().default("local"),
  localRoot: z.string().optional(),
  s3: z.object({
    accessKeyId: z.string().optional(),
    bucket: z.string().optional(),
    endpoint: z.string().optional(),
    region: z.string().optional(),
    secretAccessKey: z.string().optional(),
  }).optional(),
});

/**
 * Validate an untrusted Files edge payload.
 *
 * Rejects server-owned storage/scanner/integrity fields, strips unknown
 * fields (Zod object default), and converts the first validation issue into
 * the existing AppError envelope.
 *
 * @template {import("zod").ZodType} Schema
 * @param {Schema} schema
 * @param {unknown} payload
 * @param {{ status?: number }} [options]
 * @returns {import("zod").output<Schema>} the parsed, stripped payload
 */
function parseFilesEdgePayload(schema, payload, options = {}) {
  const status = options.status || 400;

  if (payload !== null && typeof payload === "object" && !Array.isArray(payload)) {
    const objectPayload = /** @type {Record<string, unknown>} */ (payload);
    for (const field of SENSITIVE_FILE_INPUT_FIELDS) {
      if (objectPayload[field] !== undefined) {
        throw new AppError(`Field '${field}' is server-managed and cannot be set by file input.`, 400);
      }
    }
  }

  const result = schema.safeParse(payload);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new AppError(issue?.message || "File payload is invalid.", status);
  }

  return result.data;
}

export {
  CreateFileBatchSchema,
  CreateFileSchema,
  FileAttachmentSchema,
  FileMetadataSchema,
  FilePreviewRequestSchema,
  FileStorageAdapterConfigSchema,
  SENSITIVE_FILE_INPUT_FIELDS,
  UpdateFileContextSchema,
  parseFilesEdgePayload,
};
