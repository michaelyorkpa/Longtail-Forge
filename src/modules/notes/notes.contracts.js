// @ts-check
// Notes edge-payload contracts.
//
// Notes accepts a deliberately liberal workflow shape: browser and trusted
// module callers use both camelCase and snake_case names, nullable context
// identifiers clear saved context, and a few long-lived helpers accept numeric
// identifiers or counts before the service normalizes them. Zod owns only the
// untrusted shape boundary here; required values, enum membership, permissions,
// Markdown safety, context visibility, collection scope, and existing error
// copy remain in the Notes services.
//
// Unknown and ordinary server-managed fields are stripped for round-trip
// compatibility. Secure-note plaintext derivatives, encryption envelopes, and
// effective-security projections are different: attempts to submit them are
// rejected before parsing so callers cannot mistake them for writable state.

import { z } from "zod";
import { AppError } from "../../utils/app-error.js";

const SENSITIVE_NOTE_INPUT_FIELDS = Object.freeze([
  "encrypted_at",
  "encrypted_data_key",
  "encryption_algorithm",
  "encryption_auth_tag",
  "encryption_key_version",
  "encryption_nonce",
  "key_wrapping_algorithm",
  "key_wrapping_auth_tag",
  "key_wrapping_nonce",
  "secure_body_decrypted",
  "secure_payload",
  "secure_payload_version",
]);

/** @param {string} label */
const optionalWorkflowText = (label) => z.union([
  z.string().trim(),
  z.number(),
  z.boolean(),
], { error: `${label} must be text or a scalar value.` }).nullable().optional();

/** @param {string} label */
const optionalStrictText = (label) => z.string({ error: `${label} must be text.` }).optional();

/** @param {string} label */
const optionalIdList = (label) => z.array(
  z.union([z.string().trim(), z.number(), z.boolean(), z.null(), z.undefined()], {
    error: `${label} entries must be scalar IDs.`,
  }),
  { error: `${label} must be a list.` },
).optional();

/** @param {string} label */
const optionalIdListOrText = (label) => z.union([
  z.array(z.union([z.string().trim(), z.number(), z.boolean(), z.null(), z.undefined()])),
  z.string().trim(),
  z.number(),
], { error: `${label} must be a list or comma-separated text.` }).optional();

/** @param {string} label */
const optionalMetadata = (label) => z.union([
  z.record(z.string(), z.unknown()),
  z.string(),
  z.null(),
], { error: `${label} must be an object or JSON text.` }).optional();

const NoteLinkSchema = z.object({
  linkRole: optionalWorkflowText("Link role"),
  link_role: optionalWorkflowText("Link role"),
  metadata: optionalMetadata("Link metadata"),
  metadata_json: optionalMetadata("Link metadata"),
  moduleId: optionalWorkflowText("Module ID"),
  module_id: optionalWorkflowText("Module ID"),
  noteLinkId: optionalWorkflowText("Note link ID"),
  note_link_id: optionalWorkflowText("Note link ID"),
  scopeRole: optionalWorkflowText("Link scope role"),
  scope_role: optionalWorkflowText("Link scope role"),
  targetId: optionalWorkflowText("Target ID"),
  targetType: optionalWorkflowText("Target type"),
  target_id: optionalWorkflowText("Target ID"),
  target_type: optionalWorkflowText("Target type"),
  workspaceId: optionalWorkflowText("Workspace ID"),
  workspace_id: optionalWorkflowText("Workspace ID"),
});

const noteWriteFields = {
  bodyMarkdown: optionalWorkflowText("Note body"),
  body_markdown: optionalWorkflowText("Note body"),
  clientId: optionalWorkflowText("Client ID"),
  clientIds: optionalIdListOrText("Client IDs"),
  client_id: optionalWorkflowText("Client ID"),
  client_ids: optionalIdListOrText("Client IDs"),
  collectionId: optionalWorkflowText("Collection ID"),
  collection_id: optionalWorkflowText("Collection ID"),
  import_batch_id: optionalWorkflowText("Import batch ID"),
  import_source: optionalWorkflowText("Import source"),
  import_source_id: optionalWorkflowText("Import source ID"),
  import_source_path: optionalWorkflowText("Import source path"),
  imported_at: optionalWorkflowText("Imported at"),
  libraryBucket: optionalWorkflowText("Library bucket"),
  library_bucket: optionalWorkflowText("Library bucket"),
  linkedUserId: optionalWorkflowText("Linked user ID"),
  linked_user_id: optionalWorkflowText("Linked user ID"),
  links: z.array(NoteLinkSchema, { error: "Links must be a list." }).optional(),
  metadata: optionalMetadata("Note metadata"),
  metadata_json: optionalMetadata("Note metadata"),
  noteCollectionId: optionalWorkflowText("Collection ID"),
  noteId: optionalWorkflowText("Note ID"),
  noteType: optionalWorkflowText("Note Kind"),
  note_collection_id: optionalWorkflowText("Collection ID"),
  note_id: optionalWorkflowText("Note ID"),
  note_type: optionalWorkflowText("Note Kind"),
  original_notebook: optionalWorkflowText("Original notebook"),
  original_page_id: optionalWorkflowText("Original page ID"),
  original_section: optionalWorkflowText("Original section"),
  original_section_group: optionalWorkflowText("Original section group"),
  ownerUserId: optionalWorkflowText("Owner user ID"),
  owner_user_id: optionalWorkflowText("Owner user ID"),
  projectId: optionalWorkflowText("Project ID"),
  projectIds: optionalIdListOrText("Project IDs"),
  project_id: optionalWorkflowText("Project ID"),
  project_ids: optionalIdListOrText("Project IDs"),
  securityMode: optionalWorkflowText("Note security mode"),
  security_mode: optionalWorkflowText("Note security mode"),
  slug: optionalWorkflowText("Note slug"),
  status: optionalWorkflowText("Note status"),
  tagIds: optionalIdList("Tags"),
  tag_ids: optionalIdList("Tags"),
  taskId: optionalWorkflowText("Task ID"),
  taskIds: optionalIdListOrText("Task IDs"),
  task_id: optionalWorkflowText("Task ID"),
  task_ids: optionalIdListOrText("Task IDs"),
  ticketId: optionalWorkflowText("Ticket ID"),
  ticketIds: optionalIdListOrText("Ticket IDs"),
  ticket_id: optionalWorkflowText("Ticket ID"),
  ticket_ids: optionalIdListOrText("Ticket IDs"),
  title: optionalWorkflowText("Note title"),
  visibility: optionalWorkflowText("Note visibility"),
};

/** Browser and module-service note creation payload. */
const CreateNoteSchema = z.object(noteWriteFields);

/** Browser and module-service note update payload. */
const UpdateNoteSchema = z.object(noteWriteFields);

/** Notes Markdown preview body. */
const NoteMarkdownPreviewSchema = z.object({
  bodyMarkdown: optionalWorkflowText("Note body"),
  body_markdown: optionalWorkflowText("Note body"),
});

const noteBulkChangeFields = {
  libraryBucket: optionalWorkflowText("Library bucket"),
  library_bucket: optionalWorkflowText("Library bucket"),
  noteCollectionId: optionalWorkflowText("Collection ID"),
  noteType: optionalWorkflowText("Note Kind"),
  note_collection_id: optionalWorkflowText("Collection ID"),
  note_type: optionalWorkflowText("Note Kind"),
  visibility: optionalWorkflowText("Note visibility"),
};

const NoteBulkChangesSchema = z.object(noteBulkChangeFields);

/** Notes bulk-edit request, including the legacy flat-change shape. */
const NoteBulkUpdateSchema = z.object({
  ...noteBulkChangeFields,
  changes: NoteBulkChangesSchema.optional(),
  noteIds: optionalIdListOrText("Note IDs"),
  note_ids: optionalIdListOrText("Note IDs"),
});

/** Dedicated Library-change body. */
const NoteLibraryChangeSchema = z.object({
  libraryBucket: optionalWorkflowText("Library bucket"),
  library_bucket: optionalWorkflowText("Library bucket"),
});

/** Dedicated collection-assignment body. */
const NoteCollectionAssignmentSchema = z.object({
  collectionId: optionalWorkflowText("Collection ID"),
  collection_id: optionalWorkflowText("Collection ID"),
  noteCollectionId: optionalWorkflowText("Collection ID"),
  note_collection_id: optionalWorkflowText("Collection ID"),
});

const collectionWriteFields = {
  collectionSource: optionalWorkflowText("Collection source"),
  collection_source: optionalWorkflowText("Collection source"),
  description: optionalWorkflowText("Collection description"),
  libraryBucket: optionalWorkflowText("Library bucket"),
  library_bucket: optionalWorkflowText("Library bucket"),
  metadata: optionalMetadata("Collection metadata"),
  metadata_json: optionalMetadata("Collection metadata"),
  name: optionalWorkflowText("Collection name"),
  noteLibraryCollectionId: optionalWorkflowText("Collection ID"),
  note_library_collection_id: optionalWorkflowText("Collection ID"),
  parentCollectionId: optionalWorkflowText("Parent collection ID"),
  parent_collection_id: optionalWorkflowText("Parent collection ID"),
  slug: optionalWorkflowText("Collection slug"),
  sortOrder: z.union([z.number(), z.string().trim()], {
    error: "Collection sort order must be a number or numeric text.",
  }).optional(),
  sort_order: z.union([z.number(), z.string().trim()], {
    error: "Collection sort order must be a number or numeric text.",
  }).optional(),
  title: optionalWorkflowText("Collection name"),
};

const CreateNoteCollectionSchema = z.object(collectionWriteFields);
const UpdateNoteCollectionSchema = z.object(collectionWriteFields);

/** Collection move body; the update service supplies the saved remainder. */
const MoveNoteCollectionSchema = z.object({
  description: optionalWorkflowText("Collection description"),
  name: optionalWorkflowText("Collection name"),
  parentCollectionId: optionalWorkflowText("Parent collection ID"),
  parent_collection_id: optionalWorkflowText("Parent collection ID"),
  sortOrder: collectionWriteFields.sortOrder,
  sort_order: collectionWriteFields.sort_order,
  title: optionalWorkflowText("Collection name"),
});

/** Import-path-to-collection request body. */
const NoteImportCollectionPathSchema = z.object({
  importPath: optionalWorkflowText("Import path"),
  importSource: optionalWorkflowText("Import source"),
  importSourcePath: optionalWorkflowText("Import source path"),
  import_path: optionalWorkflowText("Import path"),
  import_source: optionalWorkflowText("Import source"),
  import_source_path: optionalWorkflowText("Import source path"),
  libraryBucket: optionalWorkflowText("Library bucket"),
  library_bucket: optionalWorkflowText("Library bucket"),
  originalNotebook: optionalWorkflowText("Original notebook"),
  originalSection: optionalWorkflowText("Original section"),
  originalSectionGroup: optionalWorkflowText("Original section group"),
  original_notebook: optionalWorkflowText("Original notebook"),
  original_section: optionalWorkflowText("Original section"),
  original_section_group: optionalWorkflowText("Original section group"),
  parts: z.array(z.union([z.string().trim(), z.number(), z.boolean(), z.null(), z.undefined()]), {
    error: "Import path parts must be a list.",
  }).optional(),
  path: optionalWorkflowText("Import path"),
});

/** Notes Settings catalog bulk action. */
const NoteCatalogBulkActionSchema = z.object({
  action: optionalWorkflowText("Catalog bulk action"),
  catalogIds: optionalIdListOrText("Catalog IDs"),
  catalog_ids: optionalIdListOrText("Catalog IDs"),
});

/** Catalog security enable/remove/retry mutation body. */
const NoteCatalogSecurityTransitionSchema = z.object({
  confirmAction: optionalStrictText("Confirmation action"),
  confirmAffectedNoteCount: z.union([z.number(), z.string().trim(), z.null()], {
    error: "Affected note count must be a number or numeric text.",
  }).optional(),
  confirmCatalogId: optionalStrictText("Confirmation catalog ID"),
  confirm_action: optionalStrictText("Confirmation action"),
  confirm_affected_note_count: z.union([z.number(), z.string().trim(), z.null()], {
    error: "Affected note count must be a number or numeric text.",
  }).optional(),
  confirm_catalog_id: optionalStrictText("Confirmation catalog ID"),
  currentPassword: optionalStrictText("Current password"),
  current_password: optionalStrictText("Current password"),
});

/**
 * Parse one untrusted Notes edge payload.
 *
 * Zod objects strip ordinary unknown fields. Secure-note derived/storage
 * fields are rejected before parsing, and the first validation failure keeps
 * the existing 400 AppError envelope without reflecting submitted values.
 *
 * @template Output
 * @param {import("zod").ZodType<Output>} schema
 * @param {unknown} payload
 * @returns {Output}
 */
function parseNotesEdgePayload(schema, payload) {
  if (payload !== null && typeof payload === "object" && !Array.isArray(payload)) {
    const objectPayload = /** @type {Record<string, unknown>} */ (payload);
    const nestedChanges = objectPayload.changes !== null && typeof objectPayload.changes === "object" && !Array.isArray(objectPayload.changes)
      ? /** @type {Record<string, unknown>} */ (objectPayload.changes)
      : null;
    if (SENSITIVE_NOTE_INPUT_FIELDS.some((field) => (
      Object.hasOwn(objectPayload, field) || Boolean(nestedChanges && Object.hasOwn(nestedChanges, field))
    ))) {
      throw new AppError("Secure-note derived and encryption fields are server-managed and cannot be set by Notes input.", 400);
    }
  }

  const result = schema.safeParse(payload ?? {});
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new AppError(issue?.message || "Notes payload is invalid.", 400);
  }

  return result.data;
}

export {
  CreateNoteCollectionSchema,
  CreateNoteSchema,
  MoveNoteCollectionSchema,
  NoteBulkChangesSchema,
  NoteBulkUpdateSchema,
  NoteCatalogBulkActionSchema,
  NoteCatalogSecurityTransitionSchema,
  NoteCollectionAssignmentSchema,
  NoteImportCollectionPathSchema,
  NoteLibraryChangeSchema,
  NoteLinkSchema,
  NoteMarkdownPreviewSchema,
  SENSITIVE_NOTE_INPUT_FIELDS,
  UpdateNoteCollectionSchema,
  UpdateNoteSchema,
  parseNotesEdgePayload,
};
