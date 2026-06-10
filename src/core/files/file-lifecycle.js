const FILE_STATUSES = Object.freeze(["pending", "available", "quarantined", "deleted"]);
const FILE_SCAN_STATUSES = Object.freeze(["not_required", "pending", "passed", "failed", "error"]);
const FILE_LIFECYCLE_EVENTS = Object.freeze([
  "file.upload.requested",
  "file.upload.accepted",
  "file.upload.rejected",
  "file.scan.pending",
  "file.scan.passed",
  "file.scan.failed",
  "file.quarantined",
  "file.available",
  "file.downloaded",
  "file.reported",
  "file.deleted",
  "file.attachment.created",
  "file.attachment.removed",
]);

const FILE_LIFECYCLE_EVENT_SET = new Set(FILE_LIFECYCLE_EVENTS);
const FILE_STATUS_SET = new Set(FILE_STATUSES);
const FILE_SCAN_STATUS_SET = new Set(FILE_SCAN_STATUSES);

function isFileLifecycleEvent(eventName) {
  return FILE_LIFECYCLE_EVENT_SET.has(String(eventName || "").trim());
}

function sanitizeFileLifecyclePayload(payload = {}) {
  const safeMetadata = sanitizeMetadata(payload.metadata);

  return {
    workspaceId: payload.workspaceId || payload.workspace_id || payload.session?.workspace_id || "",
    fileId: payload.fileId || payload.file_id || "",
    attachmentId: payload.attachmentId || payload.file_attachment_id || "",
    moduleId: payload.moduleId || payload.module_id || "",
    targetType: payload.targetType || payload.target_type || "",
    targetId: payload.targetId || payload.target_id || "",
    actorUserId: payload.actorUserId || payload.actor_user_id || payload.session?.user_id || "",
    status: payload.status || "",
    scanStatus: payload.scanStatus || payload.scan_status || "",
    reason: payload.reason || "",
    metadata: safeMetadata,
  };
}

function sanitizeMetadata(metadata) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return {};
  }

  const blockedKeys = new Set(["content", "contents", "data", "buffer", "path", "storagePath", "secret", "token"]);
  return Object.fromEntries(
    Object.entries(metadata)
      .filter(([key, value]) => !blockedKeys.has(key) && isSafeMetadataValue(value)),
  );
}

function isSafeMetadataValue(value) {
  if (value === null) {
    return true;
  }

  if (["string", "number", "boolean"].includes(typeof value)) {
    return true;
  }

  if (Array.isArray(value)) {
    return value.every((item) => ["string", "number", "boolean"].includes(typeof item));
  }

  return false;
}

export {
  FILE_LIFECYCLE_EVENTS,
  FILE_SCAN_STATUSES,
  FILE_SCAN_STATUS_SET,
  FILE_STATUSES,
  FILE_STATUS_SET,
  isFileLifecycleEvent,
  sanitizeFileLifecyclePayload,
};
