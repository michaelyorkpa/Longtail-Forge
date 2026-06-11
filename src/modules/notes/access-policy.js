import {
  NOTE_LIBRARY_BUCKETS,
  NOTE_SECURITY_MODES,
  NOTE_STATUSES,
  NOTE_VISIBILITIES,
} from "./library.js";

const NOTE_PERMISSIONS = Object.freeze({
  VIEW: "notes.view",
  VIEW_ALL: "notes.view_all",
  VIEW_PRIVATE: "notes.view_private",
  CREATE: "notes.create",
  UPDATE: "notes.update",
  ARCHIVE: "notes.archive",
  RESTORE: "notes.restore",
  DELETE: "notes.delete",
  VIEW_HISTORY: "notes.view_history",
  RESTORE_REVISION: "notes.restore_revision",
  MANAGE_LINKS: "notes.manage_links",
  MANAGE_LIBRARY: "notes.manage_library",
  MANAGE_SETTINGS: "notes.manage_settings",
  PUBLISH_CLIENT_VISIBLE: "notes.publish_client_visible",
  SECURE_CREATE: "notes.secure.create",
  SECURE_VIEW: "notes.secure.view",
  SECURE_UPDATE: "notes.secure.update",
  SECURE_ARCHIVE: "notes.secure.archive",
  SECURE_RESTORE: "notes.secure.restore",
  SECURE_DELETE: "notes.secure.delete",
  SECURE_VIEW_HISTORY: "notes.secure.view_history",
  SECURE_MANAGE: "notes.secure.manage",
});

const NOTE_RESOURCE_DEFINITION = Object.freeze({
  key: "notes",
  moduleId: "notes",
  label: "Notes",
  operations: [
    "read",
    "create",
    "update",
    "archive",
    "restore",
    "delete",
    "manage",
    "view_history",
    "restore_revision",
    "manage_library",
  ],
});

const NOTE_AUDIT_RECORD_TYPES = Object.freeze([
  {
    recordType: "note",
    moduleId: "notes",
    label: "Note",
    description: "Note records and note lifecycle audit history.",
  },
  {
    recordType: "note_revision",
    moduleId: "notes",
    label: "Note Revision",
    description: "Note revision audit history without secure note body leakage.",
  },
  {
    recordType: "note_link",
    moduleId: "notes",
    label: "Note Link",
    description: "Note link and unlink audit history.",
  },
  {
    recordType: "note_library",
    moduleId: "notes",
    label: "Note Library",
    description: "Notes Library bucket and collection audit history.",
  },
]);

const NOTE_EVENT_TYPES = Object.freeze([
  eventType("note.created", "Note Created", "Emitted after a note is created."),
  eventType("note.updated", "Note Updated", "Emitted after a note title, body, metadata, or context changes."),
  eventType("note.revision_created", "Note Revision Created", "Emitted after a meaningful note revision is created.", "note_revision"),
  eventType("note.library_changed", "Note Library Changed", "Emitted after a note Library bucket changes."),
  eventType("note.archived", "Note Archived", "Emitted after a note is archived."),
  eventType("note.restored", "Note Restored", "Emitted after an archived note is restored."),
  eventType("note.deleted", "Note Deleted", "Emitted after a note is soft-deleted."),
  eventType("note.linked", "Note Linked", "Emitted after a note is linked to another record.", "note_link"),
  eventType("note.unlinked", "Note Unlinked", "Emitted after a note link is removed.", "note_link"),
  eventType("note.visibility_changed", "Note Visibility Changed", "Emitted after a note visibility value changes."),
  eventType("note.security_mode_changed", "Note Security Mode Changed", "Emitted after a note security mode changes."),
  eventType("note.attachment_added", "Note Attachment Added", "Emitted after a framework-managed attachment is added to a note."),
  eventType("note.attachment_removed", "Note Attachment Removed", "Emitted after a framework-managed attachment is removed from a note."),
]);

const NOTE_IMPORT_METADATA_FIELDS = Object.freeze([
  "import_source",
  "import_source_id",
  "import_source_path",
  "imported_at",
  "import_batch_id",
  "original_notebook",
  "original_section_group",
  "original_section",
  "original_page_id",
]);

const WRITE_OPERATIONS = new Set([
  "create",
  "update",
  "archive",
  "restore",
  "delete",
  "restore_revision",
  "manage_links",
  "manage_library",
]);

const OPERATION_PERMISSIONS = Object.freeze({
  read: NOTE_PERMISSIONS.VIEW,
  create: NOTE_PERMISSIONS.CREATE,
  update: NOTE_PERMISSIONS.UPDATE,
  archive: NOTE_PERMISSIONS.ARCHIVE,
  restore: NOTE_PERMISSIONS.RESTORE,
  delete: NOTE_PERMISSIONS.DELETE,
  view_history: NOTE_PERMISSIONS.VIEW_HISTORY,
  restore_revision: NOTE_PERMISSIONS.RESTORE_REVISION,
  manage_links: NOTE_PERMISSIONS.MANAGE_LINKS,
  manage_library: NOTE_PERMISSIONS.MANAGE_LIBRARY,
});

function eventType(event, label, description, recordType = "note") {
  return {
    event,
    moduleId: "notes",
    label,
    description,
    recordType,
  };
}

function createPermissionSet(permissions = []) {
  if (permissions instanceof Set) {
    return permissions;
  }

  return new Set((Array.isArray(permissions) ? permissions : [permissions]).filter(Boolean));
}

function canAccessNote({
  note = {},
  operation = "read",
  session = {},
  permissions = [],
  linkedRecordAccess = true,
  notesModuleEnabled = true,
  historicalReadAccess = true,
} = {}) {
  const permissionSet = createPermissionSet(permissions);
  const normalizedOperation = String(operation || "read").trim();

  if (!notesModuleEnabled && WRITE_OPERATIONS.has(normalizedOperation)) {
    return deny("module_disabled");
  }

  if (!notesModuleEnabled && !historicalReadAccess) {
    return deny("module_disabled");
  }

  if (!note.workspace_id || !session.workspace_id || note.workspace_id !== session.workspace_id) {
    return deny("workspace_mismatch");
  }

  const requiredPermission = OPERATION_PERMISSIONS[normalizedOperation] || NOTE_PERMISSIONS.VIEW;
  if (!permissionSet.has(requiredPermission) && !permissionSet.has(NOTE_PERMISSIONS.VIEW_ALL)) {
    return deny("missing_permission");
  }

  if (note.status === NOTE_STATUSES.DELETED && normalizedOperation !== "restore" && normalizedOperation !== "delete") {
    return deny("deleted_note");
  }

  if (note.status === NOTE_STATUSES.ARCHIVED && WRITE_OPERATIONS.has(normalizedOperation) && normalizedOperation !== "restore") {
    return deny("archived_read_only");
  }

  if (!linkedRecordAccess) {
    return deny("linked_record_hidden");
  }

  if (note.visibility === NOTE_VISIBILITIES.PRIVATE && !canReadPrivateNote(note, session, permissionSet)) {
    return deny("private_note");
  }

  if (note.visibility === "client_visible" && WRITE_OPERATIONS.has(normalizedOperation) && !permissionSet.has(NOTE_PERMISSIONS.PUBLISH_CLIENT_VISIBLE)) {
    return deny("client_visible_requires_permission");
  }

  if (note.security_mode === NOTE_SECURITY_MODES.SECURE) {
    const secureAccess = canAccessSecureNote(note, session, permissionSet, normalizedOperation);
    if (!secureAccess.allowed) {
      return secureAccess;
    }
  }

  if (normalizedOperation === "manage_library" && !libraryBucketCanUseContext(note.library_bucket, linkedRecordAccess)) {
    return deny("library_context_hidden");
  }

  return allow();
}

function canExposeNoteInAggregate({
  note = {},
  session = {},
  permissions = [],
  linkedRecordAccess = true,
  includeSecureMetadata = false,
} = {}) {
  const access = canAccessNote({
    note,
    operation: "read",
    session,
    permissions,
    linkedRecordAccess,
  });

  if (!access.allowed) {
    return false;
  }

  if (note.security_mode === NOTE_SECURITY_MODES.SECURE && !includeSecureMetadata) {
    return false;
  }

  return true;
}

function libraryBucketCanUseContext(libraryBucket, linkedRecordAccess = true) {
  if (!linkedRecordAccess) {
    return false;
  }

  return [
    NOTE_LIBRARY_BUCKETS.ACTIVE_WORK,
    NOTE_LIBRARY_BUCKETS.ONGOING_AREA,
    NOTE_LIBRARY_BUCKETS.REFERENCE,
  ].includes(libraryBucket || NOTE_LIBRARY_BUCKETS.REFERENCE);
}

function canReadPrivateNote(note, session, permissionSet) {
  return note.owner_user_id === session.user_id ||
    note.created_by_user_id === session.user_id ||
    permissionSet.has(NOTE_PERMISSIONS.VIEW_PRIVATE) ||
    permissionSet.has(NOTE_PERMISSIONS.VIEW_ALL);
}

function canAccessSecureNote(note, session, permissionSet, operation) {
  const securePermission = securePermissionForOperation(operation);
  if (!permissionSet.has(securePermission) && !permissionSet.has(NOTE_PERMISSIONS.SECURE_MANAGE)) {
    return deny("secure_note_permission");
  }

  const isOwner = note.owner_user_id === session.user_id || note.created_by_user_id === session.user_id;
  const isSecureAdmin = permissionSet.has(NOTE_PERMISSIONS.SECURE_MANAGE);
  if (!isOwner && !isSecureAdmin) {
    return deny("secure_note_owner_or_admin");
  }

  return allow();
}

function securePermissionForOperation(operation) {
  return {
    create: NOTE_PERMISSIONS.SECURE_CREATE,
    update: NOTE_PERMISSIONS.SECURE_UPDATE,
    archive: NOTE_PERMISSIONS.SECURE_ARCHIVE,
    restore: NOTE_PERMISSIONS.SECURE_RESTORE,
    delete: NOTE_PERMISSIONS.SECURE_DELETE,
    view_history: NOTE_PERMISSIONS.SECURE_VIEW_HISTORY,
    restore_revision: NOTE_PERMISSIONS.SECURE_VIEW_HISTORY,
    manage_links: NOTE_PERMISSIONS.SECURE_UPDATE,
    manage_library: NOTE_PERMISSIONS.SECURE_UPDATE,
  }[operation] || NOTE_PERMISSIONS.SECURE_VIEW;
}

function sanitizeNoteLifecyclePayload(payload = {}) {
  const safePayload = {
    workspace_id: textOrNull(payload.workspace_id),
    actor_user_id: textOrNull(payload.actor_user_id),
    note_id: textOrNull(payload.note_id),
    title: textOrNull(payload.title),
    body_excerpt: textOrNull(payload.body_excerpt),
    library_bucket: textOrNull(payload.library_bucket),
    visibility: textOrNull(payload.visibility),
    security_mode: textOrNull(payload.security_mode),
    client_id: textOrNull(payload.client_id),
    project_id: textOrNull(payload.project_id),
    task_id: textOrNull(payload.task_id),
    ticket_id: textOrNull(payload.ticket_id),
    previous_values: sanitizeChangeValues(payload.previous_values),
    new_values: sanitizeChangeValues(payload.new_values),
    occurred_at: textOrNull(payload.occurred_at),
  };

  return Object.fromEntries(Object.entries(safePayload).filter(([, value]) => value !== null && value !== undefined));
}

function sanitizeChangeValues(values = {}) {
  const allowed = {};

  for (const fieldName of ["title", "library_bucket", "status", "visibility", "security_mode"]) {
    if (values[fieldName] !== undefined) {
      allowed[fieldName] = textOrNull(values[fieldName]);
    }
  }

  return Object.keys(allowed).length > 0 ? allowed : undefined;
}

function textOrNull(value) {
  if (value === null || value === undefined) {
    return null;
  }

  return String(value);
}

function allow() {
  return { allowed: true, reason: "allowed" };
}

function deny(reason) {
  return { allowed: false, reason };
}

export {
  NOTE_AUDIT_RECORD_TYPES,
  NOTE_EVENT_TYPES,
  NOTE_IMPORT_METADATA_FIELDS,
  NOTE_PERMISSIONS,
  NOTE_RESOURCE_DEFINITION,
  canAccessNote,
  canExposeNoteInAggregate,
  createPermissionSet,
  sanitizeNoteLifecyclePayload,
};
