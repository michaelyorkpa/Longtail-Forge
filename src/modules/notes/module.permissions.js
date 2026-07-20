import { NOTE_AUDIT_RECORD_TYPES, NOTE_PERMISSIONS, NOTE_RESOURCE_DEFINITION } from "./access-policy.js";

const NOTE_PERMISSION_DEFINITIONS = [
  {
    id: NOTE_PERMISSIONS.VIEW,
    label: "View Notes",
    description: "View notes in an authorized workspace, client, project, task, ticket, or user scope.",
    operation: "read",
  },
  {
    id: NOTE_PERMISSIONS.VIEW_ALL,
    label: "View All Notes",
    description: "View all non-secure notes in an authorized workspace scope.",
    operation: "read",
  },
  {
    id: NOTE_PERMISSIONS.VIEW_PRIVATE,
    label: "View Private Notes",
    description: "View private notes in authorized scopes.",
    operation: "read",
  },
  {
    id: NOTE_PERMISSIONS.CREATE,
    label: "Create Notes",
    description: "Create notes in authorized Library and linked-record scopes.",
    operation: "create",
  },
  {
    id: NOTE_PERMISSIONS.UPDATE,
    label: "Update Notes",
    description: "Update note title, body, metadata, and linked context in authorized scopes.",
    operation: "update",
  },
  {
    id: NOTE_PERMISSIONS.ARCHIVE,
    label: "Archive Notes",
    description: "Archive notes while preserving their original Library bucket.",
    operation: "archive",
  },
  {
    id: NOTE_PERMISSIONS.RESTORE,
    label: "Restore Notes",
    description: "Restore archived notes to their previous Library bucket.",
    operation: "restore",
  },
  {
    id: NOTE_PERMISSIONS.DELETE,
    label: "Delete Notes",
    description: "Soft-delete notes where allowed.",
    operation: "delete",
  },
  {
    id: NOTE_PERMISSIONS.VIEW_HISTORY,
    label: "View Note History",
    description: "View note revision history and user-friendly note changelog entries.",
    operation: "view_history",
  },
  {
    id: NOTE_PERMISSIONS.RESTORE_REVISION,
    label: "Restore Note Revisions",
    description: "Restore earlier note revisions where edit and history access allow it.",
    operation: "restore_revision",
  },
  {
    id: NOTE_PERMISSIONS.MANAGE_LINKS,
    label: "Manage Note Links",
    description: "Link and unlink notes to authorized workspace records.",
    operation: "manage",
  },
  {
    id: NOTE_PERMISSIONS.MANAGE_LIBRARY,
    label: "Manage Notes Library",
    description: "Manage Library buckets and Library collections without bypassing note access rules.",
    operation: "manage_library",
  },
  {
    id: NOTE_PERMISSIONS.MANAGE_SETTINGS,
    label: "Manage Notes Settings",
    description: "Manage workspace-level Notes settings.",
    operation: "manage",
  },
  {
    id: NOTE_PERMISSIONS.PUBLISH_CLIENT_VISIBLE,
    label: "Publish Client-Visible Notes",
    description: "Expose permitted notes to authorized client-visible surfaces when those surfaces exist.",
    operation: "manage",
  },
  {
    id: NOTE_PERMISSIONS.SECURE_CREATE,
    label: "Create Secure Notes",
    description: "Create encrypted secure notes when secure-note storage is configured.",
    operation: "create",
  },
  {
    id: NOTE_PERMISSIONS.SECURE_VIEW,
    label: "View Secure Notes",
    description: "View secure note metadata and decrypted secure-note bodies when allowed.",
    operation: "read",
  },
  {
    id: NOTE_PERMISSIONS.SECURE_UPDATE,
    label: "Update Secure Notes",
    description: "Update encrypted secure-note bodies and metadata when allowed.",
    operation: "update",
  },
  {
    id: NOTE_PERMISSIONS.SECURE_ARCHIVE,
    label: "Archive Secure Notes",
    description: "Archive secure notes without exposing secure body content.",
    operation: "archive",
  },
  {
    id: NOTE_PERMISSIONS.SECURE_RESTORE,
    label: "Restore Secure Notes",
    description: "Restore archived secure notes without exposing secure body content.",
    operation: "restore",
  },
  {
    id: NOTE_PERMISSIONS.SECURE_DELETE,
    label: "Delete Secure Notes",
    description: "Soft-delete secure notes without exposing secure body content.",
    operation: "delete",
  },
  {
    id: NOTE_PERMISSIONS.SECURE_VIEW_HISTORY,
    label: "View Secure Note History",
    description: "View secure note revision metadata and decrypt secure revisions when allowed.",
    operation: "view_history",
  },
  {
    id: NOTE_PERMISSIONS.SECURE_MANAGE,
    label: "Manage Secure Notes",
    description: "Administrative secure-note access for users with explicit secure-note responsibility.",
    operation: "manage",
  },
].map((permission) => ({
  ...permission,
  moduleId: "notes",
  resource: "notes",
}));

const ALL_NOTE_PERMISSION_IDS = NOTE_PERMISSION_DEFINITIONS.map((permission) => permission.id);

const INTERNAL_NOTE_PERMISSION_IDS = [
  NOTE_PERMISSIONS.VIEW,
  NOTE_PERMISSIONS.CREATE,
  NOTE_PERMISSIONS.UPDATE,
  NOTE_PERMISSIONS.ARCHIVE,
  NOTE_PERMISSIONS.RESTORE,
  NOTE_PERMISSIONS.VIEW_HISTORY,
  NOTE_PERMISSIONS.MANAGE_LINKS,
  NOTE_PERMISSIONS.MANAGE_LIBRARY,
];

const notesPermissions = {
  requiredPermissions: ALL_NOTE_PERMISSION_IDS,
  permissions: NOTE_PERMISSION_DEFINITIONS,
  defaultRolePermissions: [
      { roleId: "super_admin", permissions: ALL_NOTE_PERMISSION_IDS },
      { roleId: "workspace_admin", permissions: ALL_NOTE_PERMISSION_IDS },
      { roleId: "client_admin", permissions: INTERNAL_NOTE_PERMISSION_IDS },
      { roleId: "project_admin", permissions: INTERNAL_NOTE_PERMISSION_IDS },
      { roleId: "client_user", permissions: [NOTE_PERMISSIONS.VIEW, NOTE_PERMISSIONS.CREATE, NOTE_PERMISSIONS.UPDATE, NOTE_PERMISSIONS.MANAGE_LINKS] },
      { roleId: "project_user", permissions: [NOTE_PERMISSIONS.VIEW, NOTE_PERMISSIONS.CREATE, NOTE_PERMISSIONS.UPDATE, NOTE_PERMISSIONS.MANAGE_LINKS] },
      { roleId: "client_external_user", permissions: [] },
    ],
  resourceDefinitions: [NOTE_RESOURCE_DEFINITION],
  auditRecordTypes: NOTE_AUDIT_RECORD_TYPES,
};

export { notesPermissions };
