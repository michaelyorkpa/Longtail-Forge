// @ts-check

import path from "node:path";
import { renderMarkdownToHtml } from "../core/markdown/markdown.service.js";
import { AppError } from "../utils/app-error.js";

/** @typedef {import("../types/files-repository-contracts.js").AttachmentRow} AttachmentRow */
/** @typedef {import("../types/files-preview-contracts.js").FilePreviewAvailability} FilePreviewAvailability */
/** @typedef {import("../types/files-preview-contracts.js").FilePreviewAvailabilityOptions} FilePreviewAvailabilityOptions */
/** @typedef {import("../types/files-preview-contracts.js").FilePreviewContentResponse} FilePreviewContentResponse */
/** @typedef {import("../types/files-preview-contracts.js").FilePreviewDescriptor} FilePreviewDescriptor */
/** @typedef {import("../types/files-preview-contracts.js").FilePreviewKind} FilePreviewKind */
/** @typedef {import("../types/files-preview-contracts.js").FilesPreviewService} FilesPreviewService */

const MAX_TEXT_PREVIEW_BYTES = 512 * 1024;
const IMAGE_PREVIEW_EXTENSIONS = new Set([".gif", ".jpg", ".jpeg", ".png"]);
const MARKDOWN_PREVIEW_EXTENSIONS = new Set([".md"]);
const TEXT_PREVIEW_EXTENSIONS = new Set([".txt"]);

/** @param {AttachmentRow} attachment @param {FilePreviewAvailabilityOptions} [options] @returns {FilePreviewAvailability} */
function previewAvailabilityForAttachment(attachment, options = {}) {
  const kind = previewKindForAttachment(attachment);
  const fileStatus = String(attachment.file_status || "").trim();
  const scanStatus = String(attachment.scan_status || "").trim();
  const reviewPreviewAllowed = fileStatus === "quarantined" && options.canPreviewInReview === true;

  if ((fileStatus !== "available" && !reviewPreviewAllowed) || !["not_required", "passed"].includes(scanStatus)) {
    return {
      kind,
      reason: fileStatus !== "available" && !reviewPreviewAllowed
        ? `file_${fileStatus || "unavailable"}`
        : `scan_${scanStatus || "unavailable"}`,
      state: "unavailable",
    };
  }

  if (kind === "unsupported") {
    return { kind, reason: "unsupported_file_type", state: "download_only" };
  }

  if ((kind === "text" || kind === "markdown") && Number(attachment.file_size_bytes || 0) > MAX_TEXT_PREVIEW_BYTES) {
    return { kind, reason: "too_large_for_preview", state: "too_large_for_preview" };
  }

  return { kind, reason: "", state: "previewable" };
}

/** @param {AttachmentRow} attachment @returns {FilePreviewKind} */
function previewKindForAttachment(attachment) {
  const extension = String(attachment.extension || "").toLowerCase();
  if (IMAGE_PREVIEW_EXTENSIONS.has(extension)) return "image";
  if (MARKDOWN_PREVIEW_EXTENSIONS.has(extension)) return "markdown";
  if (TEXT_PREVIEW_EXTENSIONS.has(extension)) return "text";
  return "unsupported";
}

/** @param {AttachmentRow} attachment @param {FilePreviewAvailability} availability @returns {FilePreviewDescriptor} */
function shapeAttachmentPreviewDescriptor(attachment, availability) {
  const extension = String(attachment.extension || "").trim();
  const filename = attachment.display_name || attachment.original_filename || "File";
  const state = availability.state;
  const kind = availability.kind;
  const contentAvailable = state === "previewable";
  const contentUrl = previewContentUrlForAttachment(attachment);
  /** @type {FilePreviewDescriptor} */
  const descriptor = {
    fileAttachmentId: attachment.file_attachment_id,
    file_attachment_id: attachment.file_attachment_id,
    fileId: attachment.file_id,
    file_id: attachment.file_id,
    moduleId: attachment.module_id,
    module_id: attachment.module_id,
    targetType: attachment.target_type,
    target_type: attachment.target_type,
    targetId: attachment.target_id,
    target_id: attachment.target_id,
    state,
    previewState: state,
    preview_state: state,
    kind,
    previewKind: kind,
    preview_kind: kind,
    reason: availability.reason,
    filename,
    fileName: filename,
    file_name: filename,
    fileType: fileTypeLabel(extension, attachment.mime_type_detected),
    file_type: fileTypeLabel(extension, attachment.mime_type_detected),
    extension,
    mimeType: attachment.mime_type_detected || "",
    mime_type: attachment.mime_type_detected || "",
    fileSizeBytes: Number(attachment.file_size_bytes || 0),
    file_size_bytes: Number(attachment.file_size_bytes || 0),
    status: attachment.file_status,
    scanStatus: attachment.scan_status,
    scan_status: attachment.scan_status,
    contentAvailable,
    content_available: contentAvailable,
  };
  if (contentAvailable) {
    descriptor.contentUrl = contentUrl;
    descriptor.content_url = contentUrl;
  }
  return descriptor;
}

/** @param {AttachmentRow} attachment @param {FilePreviewAvailability} availability @param {import("node:stream").Readable} stream @returns {Promise<FilePreviewContentResponse>} */
async function readAttachmentPreviewContent(attachment, availability, stream) {
  assertPreviewContentAvailable(availability);
  const preview = shapeAttachmentPreviewDescriptor(attachment, availability);

  if (availability.kind === "image") {
    return { headers: buildPreviewImageHeaders(attachment), kind: "image", preview, stream };
  }

  const text = await readPreviewTextContent(stream);
  if (availability.kind === "markdown") {
    return {
      content: {
        bodyFormat: "markdown",
        bodyHtml: renderMarkdownToHtml(text),
        bodyHtmlFormat: "html",
        bodyMarkdown: text,
        kind: "markdown",
      },
      preview,
    };
  }
  return { content: { encoding: "utf-8", kind: "text", text }, preview };
}

/** @param {FilePreviewAvailability} availability */
function assertPreviewContentAvailable(availability) {
  if (availability.state === "previewable") return;
  throw new AppError(
    availability.state === "unauthorized"
      ? "You do not have permission to preview that file."
      : "Preview content is not available for that file.",
    availability.state === "unauthorized" ? 403 : 409,
  );
}

/** @param {AttachmentRow} attachment */
function buildPreviewImageHeaders(attachment) {
  const filename = sanitizeFilename(attachment.original_filename || attachment.display_name || "preview");
  const mimeTypes = new Map([
    [".gif", "image/gif"], [".jpg", "image/jpeg"], [".jpeg", "image/jpeg"], [".png", "image/png"],
  ]);
  return {
    "Cache-Control": "no-store",
    "Content-Disposition": `inline; filename="${filename.replaceAll("\"", "")}"`,
    "Content-Length": String(attachment.file_size_bytes || 0),
    "Content-Security-Policy": "sandbox",
    "Content-Type": mimeTypes.get(String(attachment.extension || "").toLowerCase()) || attachment.mime_type_detected || "application/octet-stream",
    "X-Content-Type-Options": "nosniff",
  };
}

/** @param {import("node:stream").Readable} stream */
async function readPreviewTextContent(stream) {
  /** @type {Buffer[]} */
  const chunks = [];
  let totalBytes = 0;
  for await (const chunk of stream) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.length;
    if (totalBytes > MAX_TEXT_PREVIEW_BYTES) {
      stream.destroy();
      throw new AppError("Preview content is too large.", 413);
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/** @param {AttachmentRow} attachment */
function previewContentUrlForAttachment(attachment) {
  return `/api/files/attachments/${encodeURIComponent(attachment.file_attachment_id)}/preview/content`;
}

/** @param {unknown} extension @param {unknown} [mimeType] */
function fileTypeLabel(extension, mimeType = "") {
  const normalizedExtension = String(extension || "").replace(/^\./, "").trim();
  return normalizedExtension ? normalizedExtension.toUpperCase() : String(mimeType || "file").trim();
}

/** @param {unknown} value */
function sanitizeFilename(value) {
  const filename = path.basename(String(value || "").replaceAll("\\", "/")).trim();
  if (!filename || filename === "." || filename === "..") {
    throw new AppError("Original filename is required.", 400);
  }
  return filename.replace(/[^\w .()[\]-]+/g, "_").slice(0, 180);
}

/** @type {FilesPreviewService} */
export const filesPreviewService = {
  availabilityForAttachment: previewAvailabilityForAttachment,
  assertContentAvailable: assertPreviewContentAvailable,
  kindForAttachment: previewKindForAttachment,
  readContent: readAttachmentPreviewContent,
  shapeDescriptor: shapeAttachmentPreviewDescriptor,
};

export {
  assertPreviewContentAvailable,
  previewAvailabilityForAttachment,
  previewKindForAttachment,
  readAttachmentPreviewContent,
  shapeAttachmentPreviewDescriptor,
};
