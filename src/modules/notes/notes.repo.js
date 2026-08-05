import { createRecordId } from "../../core/identifiers.js";
import { db } from "../../core/database.js";
import {
  resolveCollectionEffectiveSecurity,
  resolveNoteEffectiveSecurity,
} from "./effective-security.js";

const NOTE_COLUMNS = [
  "note_id",
  "workspace_id",
  "title",
  "slug",
  "body_markdown",
  "body_excerpt",
  "body_plaintext_index",
  "note_type",
  "library_bucket",
  "library_bucket_source",
  "status",
  "visibility",
  "security_mode",
  "secure_payload",
  "secure_payload_version",
  "encrypted_data_key",
  "encryption_key_version",
  "encryption_algorithm",
  "key_wrapping_algorithm",
  "encryption_nonce",
  "encryption_auth_tag",
  "key_wrapping_nonce",
  "key_wrapping_auth_tag",
  "encrypted_at",
  "client_id",
  "project_id",
  "task_id",
  "ticket_id",
  "linked_user_id",
  "note_collection_id",
  "owner_user_id",
  "created_by_user_id",
  "updated_by_user_id",
  "created_at",
  "updated_at",
  "archived_at",
  "deleted_at",
  "metadata_json",
  "import_source",
  "import_source_id",
  "import_source_path",
  "imported_at",
  "import_batch_id",
  "original_notebook",
  "original_section_group",
  "original_section",
  "original_page_id",
];

const NOTE_LIST_COLUMNS = [
  "note_id",
  "workspace_id",
  "title",
  "slug",
  "body_excerpt",
  "note_type",
  "library_bucket",
  "library_bucket_source",
  "status",
  "visibility",
  "security_mode",
  "client_id",
  "project_id",
  "task_id",
  "ticket_id",
  "linked_user_id",
  "note_collection_id",
  "owner_user_id",
  "created_by_user_id",
  "updated_by_user_id",
  "created_at",
  "updated_at",
  "archived_at",
  "deleted_at",
  "import_source",
  "import_source_id",
  "imported_at",
];

const COLLECTION_COLUMNS = [
  "note_library_collection_id",
  "workspace_id",
  "title",
  "slug",
  "description",
  "library_bucket",
  "parent_collection_id",
  "path_cache",
  "depth",
  "sort_order",
  "collection_source",
  "status",
  "security_policy",
  "security_transition_state",
  "security_transition_action",
  "security_transition_version",
  "security_transition_job_id",
  "security_transition_actor_user_id",
  "security_transition_started_at",
  "security_transition_error_code",
  "created_by_user_id",
  "updated_by_user_id",
  "created_at",
  "updated_at",
  "archived_at",
  "deleted_at",
  "metadata_json",
];

async function list(workspaceId, filters = {}) {
  const clauses = ["workspace_id = :workspaceId"];
  const params = { workspaceId };

  if (!filters.includeDeleted) {
    clauses.push("status != 'deleted'");
  }

  if (filters.status) {
    clauses.push("status = :status");
    params.status = filters.status;
  }

  if (filters.libraryBucket) {
    clauses.push("library_bucket = :libraryBucket");
    params.libraryBucket = filters.libraryBucket;
  }

  for (const [filterKey, columnName] of Object.entries({
    clientId: "client_id",
    projectId: "project_id",
    taskId: "task_id",
    ticketId: "ticket_id",
    linkedUserId: "linked_user_id",
    ownerUserId: "owner_user_id",
    noteCollectionId: "note_collection_id",
  })) {
    if (filters[filterKey]) {
      clauses.push(`${columnName} = :${filterKey}`);
      params[filterKey] = filters[filterKey];
    }
  }

  const rows = await db.query(`
SELECT ${NOTE_COLUMNS.join(", ")}
FROM notes
WHERE ${clauses.join("\n  AND ")}
ORDER BY updated_at DESC, ${db.dialect.comparison.orderByNoCase("title", "ASC")};
`, params);

  return projectNoteSecurity(workspaceId, rows.map(noteRowToAppValue));
}

async function queryList(workspaceId, options = {}) {
  const normalizedLimit = normalizePositiveInteger(options.limit, 0);
  const normalizedOffset = normalizePositiveInteger(options.offset, 0);
  const params = {
    workspaceId,
  };
  const whereSql = noteListWhereSql(options, params);
  const orderSql = noteListOrderSql(options.sort);
  const limitSql = normalizedLimit > 0 ? "\nLIMIT :limit OFFSET :offset" : "";

  if (normalizedLimit > 0) {
    params.limit = normalizedLimit + 1;
    params.offset = normalizedOffset;
  }

  const rows = await db.query(`
SELECT ${NOTE_LIST_COLUMNS.map((column) => `notes.${column}`).join(", ")}
FROM notes
LEFT JOIN note_library_collections
  ON note_library_collections.workspace_id = notes.workspace_id
  AND note_library_collections.note_library_collection_id = notes.note_collection_id
${whereSql}
${orderSql}${limitSql};
`, params);
  const hasMore = normalizedLimit > 0 && rows.length > normalizedLimit;
  const noteRows = hasMore ? rows.slice(0, normalizedLimit) : rows;

  return {
    hasMore,
    nextOffset: normalizedOffset + noteRows.length,
    notes: await projectNoteSecurity(workspaceId, noteRows.map(noteRowToAppValue)),
  };
}

async function readById(workspaceId, noteId) {
  const row = await db.get(`
SELECT ${NOTE_COLUMNS.join(", ")}
FROM notes
WHERE workspace_id = :workspaceId
  AND note_id = :noteId
LIMIT 1;
`, { noteId, workspaceId });

  if (!row) {
    return null;
  }

  return (await projectNoteSecurity(workspaceId, [noteRowToAppValue(row)]))[0];
}

async function readByIds(workspaceId, noteIds = []) {
  const ids = [...new Set((Array.isArray(noteIds) ? noteIds : [])
    .map((noteId) => String(noteId || "").trim())
    .filter(Boolean))];

  if (ids.length === 0) {
    return [];
  }

  const rows = await db.query(`
SELECT ${NOTE_COLUMNS.join(", ")}
FROM notes
WHERE workspace_id = :workspaceId
  AND note_id IN (:noteIds)
ORDER BY updated_at DESC, ${db.dialect.comparison.orderByNoCase("title", "ASC")}, note_id ASC;
`, { noteIds: ids, workspaceId });

  return projectNoteSecurity(workspaceId, rows.map(noteRowToAppValue));
}

async function create(workspaceId, note) {
  const noteId = note.note_id || createRecordId();
  const now = note.created_at || new Date().toISOString();

  await insertNote(db, workspaceId, note, noteId, now);
  return readById(workspaceId, noteId);
}

async function createWithLinks(workspaceId, note, links = [], options = null) {
  const noteId = note.note_id || createRecordId();
  const now = note.created_at || new Date().toISOString();

  await db.transaction(async (transaction) => {
    await insertNote(transaction, workspaceId, note, noteId, now);

    for (const link of links) {
      await insertNoteLink(transaction, workspaceId, {
        ...link,
        note_id: noteId,
      }, link.note_link_id || createRecordId(), link.created_at || now);
    }

    if (options?.initialRevision) {
      await insertRevision(
        transaction,
        workspaceId,
        { ...options.initialRevision, note_id: noteId },
        options.initialRevision.note_revision_id,
      );
    }
  });

  return readById(workspaceId, noteId);
}

async function insertNote(databaseClient, workspaceId, note, noteId, now) {
  await databaseClient.run(`
INSERT INTO notes (
  note_id,
  workspace_id,
  title,
  slug,
  body_markdown,
  body_excerpt,
  body_plaintext_index,
  note_type,
  library_bucket,
  library_bucket_source,
  status,
  visibility,
  security_mode,
  secure_payload,
  secure_payload_version,
  encrypted_data_key,
  encryption_key_version,
  encryption_algorithm,
  key_wrapping_algorithm,
  encryption_nonce,
  encryption_auth_tag,
  key_wrapping_nonce,
  key_wrapping_auth_tag,
  encrypted_at,
  client_id,
  project_id,
  task_id,
  ticket_id,
  linked_user_id,
  note_collection_id,
  owner_user_id,
  created_by_user_id,
  updated_by_user_id,
  created_at,
  updated_at,
  archived_at,
  deleted_at,
  metadata_json,
  import_source,
  import_source_id,
  import_source_path,
  imported_at,
  import_batch_id,
  original_notebook,
  original_section_group,
  original_section,
  original_page_id
)
VALUES (
  :noteId,
  :workspaceId,
  :title,
  :slug,
  :bodyMarkdown,
  :bodyExcerpt,
  :bodyPlaintextIndex,
  :noteType,
  :libraryBucket,
  :libraryBucketSource,
  :status,
  :visibility,
  :securityMode,
  :securePayload,
  :securePayloadVersion,
  :encryptedDataKey,
  :encryptionKeyVersion,
  :encryptionAlgorithm,
  :keyWrappingAlgorithm,
  :encryptionNonce,
  :encryptionAuthTag,
  :keyWrappingNonce,
  :keyWrappingAuthTag,
  :encryptedAt,
  :clientId,
  :projectId,
  :taskId,
  :ticketId,
  :linkedUserId,
  :noteCollectionId,
  :ownerUserId,
  :createdByUserId,
  :updatedByUserId,
  :createdAt,
  :updatedAt,
  :archivedAt,
  :deletedAt,
  :metadataJson,
  :importSource,
  :importSourceId,
  :importSourcePath,
  :importedAt,
  :importBatchId,
  :originalNotebook,
  :originalSectionGroup,
  :originalSection,
  :originalPageId
);
`, noteInsertPersistenceParams(workspaceId, note, {
    createdAt: now,
    noteId,
    updatedAt: note.updated_at || now,
  }));
}

async function update(workspaceId, note) {
  const updatedAt = note.updated_at || new Date().toISOString();

  await updateNote(db, workspaceId, note, updatedAt);
  return readById(workspaceId, note.note_id);
}

async function secureNoteAndRevisions(workspaceId, note, revisions = [], transitionRevision = null) {
  const updatedAt = note.updated_at || new Date().toISOString();

  await db.transaction(async (transaction) => {
    await updateNote(transaction, workspaceId, note, updatedAt);

    for (const revision of revisions) {
      await updateRevisionSecurity(transaction, workspaceId, revision);
    }

    if (transitionRevision) {
      await insertRevision(
        transaction,
        workspaceId,
        transitionRevision,
        transitionRevision.note_revision_id,
      );
    }
  });

  return readById(workspaceId, note.note_id);
}

async function updateNote(databaseClient, workspaceId, note, updatedAt) {
  await databaseClient.run(`
UPDATE notes
SET
  title = :title,
  slug = :slug,
  body_markdown = :bodyMarkdown,
  body_excerpt = :bodyExcerpt,
  body_plaintext_index = :bodyPlaintextIndex,
  note_type = :noteType,
  library_bucket = :libraryBucket,
  library_bucket_source = :libraryBucketSource,
  status = :status,
  visibility = :visibility,
  security_mode = :securityMode,
  secure_payload = :securePayload,
  secure_payload_version = :securePayloadVersion,
  encrypted_data_key = :encryptedDataKey,
  encryption_key_version = :encryptionKeyVersion,
  encryption_algorithm = :encryptionAlgorithm,
  key_wrapping_algorithm = :keyWrappingAlgorithm,
  encryption_nonce = :encryptionNonce,
  encryption_auth_tag = :encryptionAuthTag,
  key_wrapping_nonce = :keyWrappingNonce,
  key_wrapping_auth_tag = :keyWrappingAuthTag,
  encrypted_at = :encryptedAt,
  client_id = :clientId,
  project_id = :projectId,
  task_id = :taskId,
  ticket_id = :ticketId,
  linked_user_id = :linkedUserId,
  note_collection_id = :noteCollectionId,
  owner_user_id = :ownerUserId,
  updated_by_user_id = :updatedByUserId,
  updated_at = :updatedAt,
  archived_at = :archivedAt,
  deleted_at = :deletedAt,
  metadata_json = :metadataJson,
  import_source = :importSource,
  import_source_id = :importSourceId,
  import_source_path = :importSourcePath,
  imported_at = :importedAt,
  import_batch_id = :importBatchId,
  original_notebook = :originalNotebook,
  original_section_group = :originalSectionGroup,
  original_section = :originalSection,
  original_page_id = :originalPageId
WHERE workspace_id = :workspaceId
  AND note_id = :noteId;
`, notePersistenceParams(workspaceId, note, {
    createdAt: note.created_at || updatedAt,
    noteId: note.note_id,
    updatedAt,
  }));
}

async function createRevision(workspaceId, revision) {
  const revisionId = revision.note_revision_id || createRecordId();

  await insertRevision(db, workspaceId, revision, revisionId);
  return readRevisionById(workspaceId, revision.note_id, revisionId);
}

async function insertRevision(databaseClient, workspaceId, revision, revisionId) {
  await databaseClient.run(`
INSERT INTO note_revisions (
  note_revision_id,
  workspace_id,
  note_id,
  revision_number,
  title,
  body_markdown,
  body_excerpt,
  note_type,
  library_bucket,
  status,
  visibility,
  security_mode,
  secure_payload,
  secure_payload_version,
  encrypted_data_key,
  encryption_key_version,
  encryption_algorithm,
  key_wrapping_algorithm,
  encryption_nonce,
  encryption_auth_tag,
  key_wrapping_nonce,
  key_wrapping_auth_tag,
  encrypted_at,
  changed_by_user_id,
  change_summary,
  change_reason,
  created_at,
  metadata_json,
  import_source,
  import_source_id,
  import_source_path,
  imported_at,
  import_batch_id,
  original_notebook,
  original_section_group,
  original_section,
  original_page_id
)
VALUES (
  :revisionId,
  :workspaceId,
  :noteId,
  :revisionNumber,
  :title,
  :bodyMarkdown,
  :bodyExcerpt,
  :noteType,
  :libraryBucket,
  :status,
  :visibility,
  :securityMode,
  :securePayload,
  :securePayloadVersion,
  :encryptedDataKey,
  :encryptionKeyVersion,
  :encryptionAlgorithm,
  :keyWrappingAlgorithm,
  :encryptionNonce,
  :encryptionAuthTag,
  :keyWrappingNonce,
  :keyWrappingAuthTag,
  :encryptedAt,
  :changedByUserId,
  :changeSummary,
  :changeReason,
  :createdAt,
  :metadataJson,
  :importSource,
  :importSourceId,
  :importSourcePath,
  :importedAt,
  :importBatchId,
  :originalNotebook,
  :originalSectionGroup,
  :originalSection,
  :originalPageId
);
`, {
    bodyExcerpt: nullableText(revision.body_excerpt),
    bodyMarkdown: text(revision.body_markdown),
    changeReason: nullableText(revision.change_reason),
    changeSummary: nullableText(revision.change_summary),
    changedByUserId: nullableText(revision.changed_by_user_id),
    createdAt: text(revision.created_at || new Date().toISOString()),
    encryptedAt: nullableText(revision.encrypted_at),
    encryptedDataKey: nullableText(revision.encrypted_data_key),
    encryptionAlgorithm: nullableText(revision.encryption_algorithm),
    encryptionAuthTag: nullableText(revision.encryption_auth_tag),
    encryptionKeyVersion: nullableText(revision.encryption_key_version),
    encryptionNonce: nullableText(revision.encryption_nonce),
    importBatchId: nullableText(revision.import_batch_id),
    importedAt: nullableText(revision.imported_at),
    importSource: nullableText(revision.import_source),
    importSourceId: nullableText(revision.import_source_id),
    importSourcePath: nullableText(revision.import_source_path),
    keyWrappingAlgorithm: nullableText(revision.key_wrapping_algorithm),
    keyWrappingAuthTag: nullableText(revision.key_wrapping_auth_tag),
    keyWrappingNonce: nullableText(revision.key_wrapping_nonce),
    libraryBucket: text(revision.library_bucket || "reference"),
    metadataJson: nullableText(revision.metadata_json),
    noteId: text(revision.note_id),
    noteType: text(revision.note_type || "general"),
    originalNotebook: nullableText(revision.original_notebook),
    originalPageId: nullableText(revision.original_page_id),
    originalSection: nullableText(revision.original_section),
    originalSectionGroup: nullableText(revision.original_section_group),
    revisionId: text(revisionId),
    revisionNumber: integer(revision.revision_number),
    securePayload: nullableText(revision.secure_payload),
    securePayloadVersion: nullableText(revision.secure_payload_version),
    securityMode: text(revision.security_mode || "normal"),
    status: text(revision.status || "active"),
    title: text(revision.title),
    visibility: text(revision.visibility || "internal"),
    workspaceId: text(workspaceId),
  });
}

async function updateRevisionSecurity(databaseClient, workspaceId, revision) {
  await databaseClient.run(`
UPDATE note_revisions
SET
  body_markdown = :bodyMarkdown,
  body_excerpt = :bodyExcerpt,
  security_mode = :securityMode,
  secure_payload = :securePayload,
  secure_payload_version = :securePayloadVersion,
  encrypted_data_key = :encryptedDataKey,
  encryption_key_version = :encryptionKeyVersion,
  encryption_algorithm = :encryptionAlgorithm,
  key_wrapping_algorithm = :keyWrappingAlgorithm,
  encryption_nonce = :encryptionNonce,
  encryption_auth_tag = :encryptionAuthTag,
  key_wrapping_nonce = :keyWrappingNonce,
  key_wrapping_auth_tag = :keyWrappingAuthTag,
  encrypted_at = :encryptedAt
WHERE workspace_id = :workspaceId
  AND note_id = :noteId
  AND note_revision_id = :revisionId;
`, {
    bodyExcerpt: nullableText(revision.body_excerpt),
    bodyMarkdown: text(revision.body_markdown),
    encryptedAt: nullableText(revision.encrypted_at),
    encryptedDataKey: nullableText(revision.encrypted_data_key),
    encryptionAlgorithm: nullableText(revision.encryption_algorithm),
    encryptionAuthTag: nullableText(revision.encryption_auth_tag),
    encryptionKeyVersion: nullableText(revision.encryption_key_version),
    encryptionNonce: nullableText(revision.encryption_nonce),
    keyWrappingAlgorithm: nullableText(revision.key_wrapping_algorithm),
    keyWrappingAuthTag: nullableText(revision.key_wrapping_auth_tag),
    keyWrappingNonce: nullableText(revision.key_wrapping_nonce),
    noteId: text(revision.note_id),
    revisionId: text(revision.note_revision_id),
    securePayload: nullableText(revision.secure_payload),
    securePayloadVersion: nullableText(revision.secure_payload_version),
    securityMode: text(revision.security_mode || "secure"),
    workspaceId: text(workspaceId),
  });
}

async function nextRevisionNumber(workspaceId, noteId) {
  const row = await db.get(`
SELECT COALESCE(MAX(revision_number), 0) + 1 AS revision_number
FROM note_revisions
WHERE workspace_id = :workspaceId
  AND note_id = :noteId;
`, { noteId, workspaceId });

  return Number(row?.revision_number || 1);
}

async function listRevisions(workspaceId, noteId) {
  const rows = await db.query(`
SELECT *
FROM note_revisions
WHERE workspace_id = :workspaceId
  AND note_id = :noteId
ORDER BY revision_number DESC;
`, { noteId, workspaceId });

  return rows.map(revisionRowToAppValue);
}

async function readRevisionById(workspaceId, noteId, revisionId) {
  const row = await db.get(`
SELECT *
FROM note_revisions
WHERE workspace_id = :workspaceId
  AND note_id = :noteId
  AND note_revision_id = :revisionId
LIMIT 1;
`, { noteId, revisionId, workspaceId });

  return row ? revisionRowToAppValue(row) : null;
}

async function createLink(workspaceId, link) {
  const linkId = link.note_link_id || createRecordId();
  const now = link.created_at || new Date().toISOString();

  await insertNoteLink(db, workspaceId, link, linkId, now);
  return readLinkById(workspaceId, link.note_id, linkId);
}

async function insertNoteLink(databaseClient, workspaceId, link, linkId, now) {
  await databaseClient.run(`
INSERT INTO note_links (
  note_link_id,
  workspace_id,
  note_id,
  module_id,
  target_type,
  target_id,
  link_role,
  scope_role,
  created_by_user_id,
  created_at,
  removed_at,
  metadata_json
)
VALUES (
  :linkId,
  :workspaceId,
  :noteId,
  :moduleId,
  :targetType,
  :targetId,
  :linkRole,
  :scopeRole,
  :createdByUserId,
  :createdAt,
  NULL,
  :metadataJson
);
`, {
    createdAt: text(now),
    createdByUserId: nullableText(link.created_by_user_id),
    linkId: text(linkId),
    linkRole: text(link.link_role || "related"),
    metadataJson: nullableText(link.metadata_json),
    moduleId: text(link.module_id),
    noteId: text(link.note_id),
    scopeRole: text(link.scope_role || "related"),
    targetId: text(link.target_id),
    targetType: text(link.target_type),
    workspaceId: text(workspaceId),
  });
}

async function listLinks(workspaceId, noteId) {
  const rows = await db.query(`
SELECT *
FROM note_links
WHERE workspace_id = :workspaceId
  AND note_id = :noteId
  AND removed_at IS NULL
ORDER BY created_at ASC;
`, { noteId, workspaceId });

  return rows.map(linkRowToAppValue);
}

async function listLinksForNotes(workspaceId, noteIds) {
  const ids = [...new Set((noteIds || []).filter(Boolean))];

  if (ids.length === 0) {
    return [];
  }

  const rows = await db.query(`
SELECT *
FROM note_links
WHERE workspace_id = :workspaceId
  AND note_id IN (:noteIds)
  AND removed_at IS NULL
ORDER BY created_at ASC;
`, { noteIds: ids, workspaceId });

  return rows.map(linkRowToAppValue);
}

async function listLinksForTarget(workspaceId, target) {
  const rows = await db.query(`
SELECT *
FROM note_links
WHERE workspace_id = :workspaceId
  AND module_id = :moduleId
  AND target_type = :targetType
  AND target_id = :targetId
  AND removed_at IS NULL
ORDER BY created_at ASC, note_link_id ASC;
`, {
    moduleId: text(target.module_id),
    targetId: text(target.target_id),
    targetType: text(target.target_type),
    workspaceId: text(workspaceId),
  });

  return rows.map(linkRowToAppValue);
}

async function readLinkById(workspaceId, noteId, linkId) {
  const row = await db.get(`
SELECT *
FROM note_links
WHERE workspace_id = :workspaceId
  AND note_id = :noteId
  AND note_link_id = :linkId
LIMIT 1;
`, { linkId, noteId, workspaceId });

  return row ? linkRowToAppValue(row) : null;
}

async function replacePropagatedLinksForTarget(workspaceId, target, links = [], propagation = {}) {
  const now = new Date().toISOString();
  const normalizedLinks = normalizePropagatedLinks(links);
  const removedLinks = [];
  const createdLinks = [];
  const templateId = text(propagation.recurrence_template_id);
  const sourceTaskId = text(propagation.source_task_id);
  const propagatedMetadata = recurrencePropagationMetadata({
    recurrenceTemplateId: templateId,
    sourceTaskId,
  });

  await db.transaction(async (transaction) => {
    const existingPropagated = await transaction.query(`
SELECT *
FROM note_links
WHERE workspace_id = :workspaceId
  AND module_id = :moduleId
  AND target_type = :targetType
  AND target_id = :targetId
  AND removed_at IS NULL
  AND metadata_json LIKE :propagationNeedle
  AND metadata_json LIKE :templateNeedle
ORDER BY created_at ASC, note_link_id ASC;
`, {
      moduleId: text(target.module_id),
      propagationNeedle: "%\"propagation_source\"%\"task_recurrence\"%",
      targetId: text(target.target_id),
      targetType: text(target.target_type),
      templateNeedle: `%\"recurrence_template_id\"%\"${templateId}\"%`,
      workspaceId: text(workspaceId),
    });

    if (existingPropagated.length > 0) {
      await transaction.run(`
UPDATE note_links
SET removed_at = :removedAt
WHERE workspace_id = :workspaceId
  AND module_id = :moduleId
  AND target_type = :targetType
  AND target_id = :targetId
  AND removed_at IS NULL
  AND metadata_json LIKE :propagationNeedle
  AND metadata_json LIKE :templateNeedle;
`, {
        moduleId: text(target.module_id),
        propagationNeedle: "%\"propagation_source\"%\"task_recurrence\"%",
        removedAt: now,
        targetId: text(target.target_id),
        targetType: text(target.target_type),
        templateNeedle: `%\"recurrence_template_id\"%\"${templateId}\"%`,
        workspaceId: text(workspaceId),
      });

      removedLinks.push(...existingPropagated.map((link) => linkRowToAppValue({
        ...link,
        removed_at: now,
      })));
    }

    for (const link of normalizedLinks) {
      const existing = await transaction.get(`
SELECT *
FROM note_links
WHERE workspace_id = :workspaceId
  AND note_id = :noteId
  AND module_id = :moduleId
  AND target_type = :targetType
  AND target_id = :targetId
  AND removed_at IS NULL
LIMIT 1;
`, {
        moduleId: text(target.module_id),
        noteId: text(link.note_id),
        targetId: text(target.target_id),
        targetType: text(target.target_type),
        workspaceId: text(workspaceId),
      });

      if (existing) {
        continue;
      }

      const linkId = createRecordId();
      await insertNoteLink(transaction, workspaceId, {
        created_by_user_id: propagation.created_by_user_id,
        link_role: link.link_role,
        metadata_json: JSON.stringify(propagatedMetadata),
        module_id: target.module_id,
        note_id: link.note_id,
        scope_role: link.scope_role,
        target_id: target.target_id,
        target_type: target.target_type,
      }, linkId, now);

      const created = await readLinkByIdWithClient(transaction, workspaceId, link.note_id, linkId);
      if (created) {
        createdLinks.push(created);
      }
    }
  });

  return {
    createdLinks,
    removedLinks,
  };
}

async function removeLink(workspaceId, noteId, linkId) {
  const now = new Date().toISOString();

  await db.run(`
UPDATE note_links
SET removed_at = :removedAt
WHERE workspace_id = :workspaceId
  AND note_id = :noteId
  AND note_link_id = :linkId
  AND removed_at IS NULL;
`, {
    linkId,
    noteId,
    removedAt: now,
    workspaceId,
  });

  return readLinkById(workspaceId, noteId, linkId);
}

async function readLinkByIdWithClient(databaseClient, workspaceId, noteId, linkId) {
  const row = await databaseClient.get(`
SELECT *
FROM note_links
WHERE workspace_id = :workspaceId
  AND note_id = :noteId
  AND note_link_id = :linkId
LIMIT 1;
`, {
    linkId,
    noteId,
    workspaceId,
  });

  return row ? linkRowToAppValue(row) : null;
}

async function listCollections(workspaceId, filters = {}) {
  const clauses = ["workspace_id = :workspaceId"];
  const params = { workspaceId };

  if (!filters.includeDeleted) {
    clauses.push("status != 'deleted'");
  }

  if (!filters.includeArchived) {
    clauses.push("status != 'archived'");
  }

  if (filters.libraryBucket) {
    clauses.push("library_bucket = :libraryBucket");
    params.libraryBucket = filters.libraryBucket;
  }

  const rows = await db.query(`
SELECT ${COLLECTION_COLUMNS.join(", ")}
FROM note_library_collections
WHERE ${clauses.join("\n  AND ")}
ORDER BY library_bucket ASC, ${db.dialect.comparison.orderByNoCase("path_cache", "ASC")}, sort_order ASC, ${db.dialect.comparison.orderByNoCase("title", "ASC")};
`, params);

  return projectCollectionSecurity(workspaceId, rows.map(collectionRowToAppValue));
}

async function readCollectionById(workspaceId, collectionId) {
  const row = await readCollectionRowById(db, workspaceId, collectionId);

  if (!row) {
    return null;
  }

  return (await projectCollectionSecurity(workspaceId, [collectionRowToAppValue(row)]))[0];
}

async function readCollectionRowById(databaseClient, workspaceId, collectionId) {
  return databaseClient.get(`
SELECT *
FROM note_library_collections
WHERE workspace_id = :workspaceId
  AND note_library_collection_id = :collectionId
LIMIT 1;
`, { collectionId, workspaceId });
}

async function createCollection(workspaceId, collection) {
  const collectionId = collection.note_library_collection_id || createRecordId();
  const now = collection.created_at || new Date().toISOString();

  await db.run(`
INSERT INTO note_library_collections (
  note_library_collection_id,
  workspace_id,
  title,
  slug,
  description,
  library_bucket,
  parent_collection_id,
  path_cache,
  depth,
  sort_order,
  collection_source,
  status,
  security_policy,
  security_transition_state,
  security_transition_action,
  security_transition_version,
  security_transition_job_id,
  security_transition_actor_user_id,
  security_transition_started_at,
  security_transition_error_code,
  created_by_user_id,
  updated_by_user_id,
  created_at,
  updated_at,
  archived_at,
  deleted_at,
  metadata_json
)
VALUES (
  :collectionId,
  :workspaceId,
  :title,
  :slug,
  :description,
  :libraryBucket,
  :parentCollectionId,
  :pathCache,
  :depth,
  :sortOrder,
  :collectionSource,
  :status,
  :securityPolicy,
  :securityTransitionState,
  :securityTransitionAction,
  :securityTransitionVersion,
  :securityTransitionJobId,
  :securityTransitionActorUserId,
  :securityTransitionStartedAt,
  :securityTransitionErrorCode,
  :createdByUserId,
  :updatedByUserId,
  :createdAt,
  :updatedAt,
  :archivedAt,
  :deletedAt,
  :metadataJson
);
`, collectionInsertPersistenceParams(workspaceId, collection, {
    collectionId,
    createdAt: now,
    updatedAt: collection.updated_at || now,
  }));

  return readCollectionById(workspaceId, collectionId);
}

async function updateCollection(workspaceId, collection) {
  const updatedAt = collection.updated_at || new Date().toISOString();
  const expectedTransitionState = text(collection.security_transition_state || "stable");
  const expectedTransitionVersion = integer(collection.security_transition_version);
  const updatedRow = await db.transaction(async (transaction) => {
    const current = await readCollectionRowById(transaction, workspaceId, collection.note_library_collection_id);
    if (
      !current
      || text(current.security_transition_state) !== expectedTransitionState
      || integer(current.security_transition_version) !== expectedTransitionVersion
    ) {
      return null;
    }

    await transaction.run(`
UPDATE note_library_collections
SET
  title = :title,
  slug = :slug,
  description = :description,
  library_bucket = :libraryBucket,
  parent_collection_id = :parentCollectionId,
  path_cache = :pathCache,
  depth = :depth,
  sort_order = :sortOrder,
  collection_source = :collectionSource,
  status = :status,
  security_policy = :securityPolicy,
  security_transition_state = :securityTransitionState,
  security_transition_action = :securityTransitionAction,
  security_transition_version = :securityTransitionVersion,
  security_transition_job_id = :securityTransitionJobId,
  security_transition_actor_user_id = :securityTransitionActorUserId,
  security_transition_started_at = :securityTransitionStartedAt,
  security_transition_error_code = :securityTransitionErrorCode,
  updated_by_user_id = :updatedByUserId,
  updated_at = :updatedAt,
  archived_at = :archivedAt,
  deleted_at = :deletedAt,
  metadata_json = :metadataJson
WHERE workspace_id = :workspaceId
  AND note_library_collection_id = :collectionId
  AND security_transition_state = :expectedTransitionState
  AND security_transition_version = :expectedTransitionVersion;
`, {
      ...collectionPersistenceParams(workspaceId, collection, {
        collectionId: collection.note_library_collection_id,
        createdAt: collection.created_at || updatedAt,
        updatedAt,
      }),
      expectedTransitionState,
      expectedTransitionVersion,
    });

    return readCollectionRowById(transaction, workspaceId, collection.note_library_collection_id);
  });

  if (!updatedRow) {
    throw new Error("Note collection changed during update; reload it before retrying.");
  }

  return (await projectCollectionSecurity(workspaceId, [collectionRowToAppValue(updatedRow)]))[0];
}

async function readCatalogSecuritySnapshot(workspaceId, collectionIds = []) {
  const normalizedCollectionIds = normalizedIdArray(collectionIds);
  if (normalizedCollectionIds.length === 0) {
    return { notes: [], revisions: [], searchDocumentCount: 0 };
  }

  const noteRows = await db.query(`
SELECT *
FROM notes
WHERE workspace_id = :workspaceId
  AND note_collection_id IN (:collectionIds)
ORDER BY created_at ASC, note_id ASC;
`, {
    collectionIds: normalizedCollectionIds,
    workspaceId,
  });
  const notes = await projectNoteSecurity(workspaceId, noteRows.map(noteRowToAppValue));
  const noteIds = notes.map((note) => note.note_id);
  if (noteIds.length === 0) {
    return { notes, revisions: [], searchDocumentCount: 0 };
  }

  const revisionRows = await db.query(`
SELECT *
FROM note_revisions
WHERE workspace_id = :workspaceId
  AND note_id IN (:noteIds)
ORDER BY note_id ASC, revision_number ASC;
`, { noteIds, workspaceId });
  const searchRow = await db.get(`
SELECT COUNT(*) AS count
FROM search_index
WHERE workspace_id = :workspaceId
  AND module_id = 'notes'
  AND record_type = 'note'
  AND record_id IN (:noteIds);
`, { noteIds, workspaceId });

  return {
    notes,
    revisions: revisionRows.map(revisionRowToAppValue),
    searchDocumentCount: Number(searchRow?.count || 0),
  };
}

async function claimCatalogSecurityTransition(workspaceId, collectionId, options = {}) {
  const action = text(options.action);
  const expectedPolicy = text(options.expectedPolicy);
  const now = options.startedAt || new Date().toISOString();
  const claimedRow = await db.transaction(async (transaction) => {
    const current = await readCollectionRowById(transaction, workspaceId, collectionId);
    const canClaimStable = current?.security_transition_state === "stable" && current?.security_transition_action === "none";
    const canResumeFailed = options.allowFailed
      && current?.security_transition_state === "failed"
      && current?.security_transition_action === action;
    if (!current || current.security_policy !== expectedPolicy || (!canClaimStable && !canResumeFailed)) {
      return null;
    }

    await transaction.run(`
UPDATE note_library_collections
SET
  security_transition_state = 'securing',
  security_transition_action = :action,
  security_transition_version = security_transition_version + 1,
  security_transition_job_id = NULL,
  security_transition_actor_user_id = :actorUserId,
  security_transition_started_at = :startedAt,
  security_transition_error_code = NULL,
  updated_by_user_id = :actorUserId,
  updated_at = :startedAt
WHERE workspace_id = :workspaceId
  AND note_library_collection_id = :collectionId
  AND security_policy = :expectedPolicy
  AND (
    (security_transition_state = 'stable' AND security_transition_action = 'none')
    OR (
      :allowFailed = 1
      AND security_transition_state = 'failed'
      AND security_transition_action = :action
    )
  );
`, {
      action,
      actorUserId: nullableText(options.actorUserId),
      allowFailed: options.allowFailed ? 1 : 0,
      collectionId,
      expectedPolicy,
      startedAt: now,
      workspaceId,
    });

    return readCollectionRowById(transaction, workspaceId, collectionId);
  });

  return claimedRow ? (await projectCollectionSecurity(workspaceId, [collectionRowToAppValue(claimedRow)]))[0] : null;
}

async function setCatalogSecurityTransitionJob(workspaceId, collectionId, options = {}) {
  const action = text(options.action);
  const transitionVersion = integer(options.transitionVersion);
  const updatedRow = await db.transaction(async (transaction) => {
    const current = await readCollectionRowById(transaction, workspaceId, collectionId);
    if (
      !current
      || current.security_transition_state !== "securing"
      || current.security_transition_action !== action
      || integer(current.security_transition_version) !== transitionVersion
    ) {
      return null;
    }

    await transaction.run(`
UPDATE note_library_collections
SET
  security_transition_job_id = :jobId,
  updated_at = :updatedAt
WHERE workspace_id = :workspaceId
  AND note_library_collection_id = :collectionId
  AND security_transition_state = 'securing'
  AND security_transition_action = :action
  AND security_transition_version = :transitionVersion;
`, {
      action,
      collectionId,
      jobId: nullableText(options.jobId),
      transitionVersion,
      updatedAt: options.updatedAt || new Date().toISOString(),
      workspaceId,
    });

    return readCollectionRowById(transaction, workspaceId, collectionId);
  });

  return updatedRow ? collectionRowToAppValue(updatedRow) : null;
}

async function resumeCatalogSecurityTransition(workspaceId, collectionId, options = {}) {
  const action = text(options.action);
  const transitionVersion = integer(options.transitionVersion);
  const updatedRow = await db.transaction(async (transaction) => {
    const current = await readCollectionRowById(transaction, workspaceId, collectionId);
    if (
      !current
      || !["securing", "failed"].includes(current.security_transition_state)
      || current.security_transition_action !== action
      || integer(current.security_transition_version) !== transitionVersion
    ) {
      return null;
    }

    await transaction.run(`
UPDATE note_library_collections
SET
  security_transition_state = 'securing',
  security_transition_error_code = NULL,
  updated_at = :updatedAt
WHERE workspace_id = :workspaceId
  AND note_library_collection_id = :collectionId
  AND security_transition_state IN ('securing', 'failed')
  AND security_transition_action = :action
  AND security_transition_version = :transitionVersion;
`, {
      action,
      collectionId,
      transitionVersion,
      updatedAt: options.updatedAt || new Date().toISOString(),
      workspaceId,
    });

    return readCollectionRowById(transaction, workspaceId, collectionId);
  });

  return updatedRow ? collectionRowToAppValue(updatedRow) : null;
}

async function applyCatalogSecurityBatch(workspaceId, claim = {}, batch = {}) {
  return db.transaction(async (transaction) => {
    const active = await transitionClaimMatches(transaction, workspaceId, claim);
    if (!active) {
      return { applied: false, noteCount: 0, revisionCount: 0 };
    }

    for (const note of batch.notes || []) {
      await updateNote(transaction, workspaceId, note, note.updated_at || new Date().toISOString());
    }
    for (const revision of batch.revisions || []) {
      await updateRevisionSecurity(transaction, workspaceId, revision);
    }

    return {
      applied: true,
      noteCount: (batch.notes || []).length,
      revisionCount: (batch.revisions || []).length,
    };
  });
}

async function finalizeCatalogSecurityTransition(workspaceId, collectionId, options = {}) {
  const now = options.completedAt || new Date().toISOString();
  const action = text(options.action);
  const transitionVersion = integer(options.transitionVersion);
  const finalizedRow = await db.transaction(async (transaction) => {
    const current = await readCollectionRowById(transaction, workspaceId, collectionId);
    if (
      !current
      || current.security_transition_state !== "securing"
      || current.security_transition_action !== action
      || integer(current.security_transition_version) !== transitionVersion
    ) {
      return null;
    }

    await transaction.run(`
UPDATE note_library_collections
SET
  security_policy = :securityPolicy,
  security_transition_state = 'stable',
  security_transition_action = 'none',
  security_transition_job_id = NULL,
  security_transition_actor_user_id = NULL,
  security_transition_started_at = NULL,
  security_transition_error_code = NULL,
  updated_by_user_id = :actorUserId,
  updated_at = :completedAt
WHERE workspace_id = :workspaceId
  AND note_library_collection_id = :collectionId
  AND security_transition_state = 'securing'
  AND security_transition_action = :action
  AND security_transition_version = :transitionVersion;
`, {
      action,
      actorUserId: nullableText(options.actorUserId),
      collectionId,
      completedAt: now,
      securityPolicy: text(options.securityPolicy),
      transitionVersion,
      workspaceId,
    });

    return readCollectionRowById(transaction, workspaceId, collectionId);
  });

  return finalizedRow ? (await projectCollectionSecurity(workspaceId, [collectionRowToAppValue(finalizedRow)]))[0] : null;
}

async function failCatalogSecurityTransition(workspaceId, collectionId, options = {}) {
  const action = text(options.action);
  const transitionVersion = integer(options.transitionVersion);
  const failedRow = await db.transaction(async (transaction) => {
    const current = await readCollectionRowById(transaction, workspaceId, collectionId);
    if (
      !current
      || current.security_transition_state !== "securing"
      || current.security_transition_action !== action
      || integer(current.security_transition_version) !== transitionVersion
    ) {
      return null;
    }

    await transaction.run(`
UPDATE note_library_collections
SET
  security_transition_state = 'failed',
  security_transition_error_code = :errorCode,
  updated_at = :failedAt
WHERE workspace_id = :workspaceId
  AND note_library_collection_id = :collectionId
  AND security_transition_action = :action
  AND security_transition_version = :transitionVersion
  AND security_transition_state = 'securing';
`, {
      action,
      collectionId,
      errorCode: text(options.errorCode || "catalog_security_transition_failed").slice(0, 120),
      failedAt: options.failedAt || new Date().toISOString(),
      transitionVersion,
      workspaceId,
    });

    return readCollectionRowById(transaction, workspaceId, collectionId);
  });

  return failedRow ? collectionRowToAppValue(failedRow) : null;
}

async function transitionClaimMatches(databaseClient, workspaceId, claim = {}) {
  const row = await databaseClient.get(`
SELECT note_library_collection_id
FROM note_library_collections
WHERE workspace_id = :workspaceId
  AND note_library_collection_id = :collectionId
  AND security_transition_state = 'securing'
  AND security_transition_action = :action
  AND security_transition_version = :transitionVersion
LIMIT 1;
`, {
    action: text(claim.action),
    collectionId: text(claim.collectionId),
    transitionVersion: integer(claim.transitionVersion),
    workspaceId,
  });
  return Boolean(row);
}

async function countNotesInCollection(workspaceId, collectionId, filters = {}) {
  const clauses = [
    "workspace_id = :workspaceId",
    "note_collection_id = :collectionId",
  ];

  if (!filters.includeDeleted) {
    clauses.push("status != 'deleted'");
  }

  const row = await db.get(`
SELECT COUNT(*) AS count
FROM notes
WHERE ${clauses.join("\n  AND ")};
`, { collectionId, workspaceId });

  return Number(row?.count || 0);
}

async function countChildCollections(workspaceId, collectionId, filters = {}) {
  const clauses = [
    "workspace_id = :workspaceId",
    "parent_collection_id = :collectionId",
  ];

  if (!filters.includeDeleted) {
    clauses.push("status != 'deleted'");
  }

  if (!filters.includeArchived) {
    clauses.push("status != 'archived'");
  }

  const row = await db.get(`
SELECT COUNT(*) AS count
FROM note_library_collections
WHERE ${clauses.join("\n  AND ")};
`, { collectionId, workspaceId });

  return Number(row?.count || 0);
}

async function listForTarget(workspaceId, target) {
  const directColumn = {
    client: "client_id",
    project: "project_id",
    task: "task_id",
    ticket: "ticket_id",
    user: "linked_user_id",
  }[target.target_type];
  const directClause = directColumn
    ? `OR notes.${directColumn} = :targetId`
    : "";
  const rows = await db.query(`
SELECT DISTINCT ${NOTE_COLUMNS.map((column) => `notes.${column}`).join(", ")}
FROM notes
LEFT JOIN note_links
  ON note_links.workspace_id = notes.workspace_id
  AND note_links.note_id = notes.note_id
  AND note_links.removed_at IS NULL
WHERE notes.workspace_id = :workspaceId
  AND (
    (
      note_links.module_id = :moduleId
      AND note_links.target_type = :targetType
      AND note_links.target_id = :targetId
    )
    ${directClause}
  )
  AND notes.status != 'deleted'
ORDER BY notes.updated_at DESC, ${db.dialect.comparison.orderByNoCase("notes.title", "ASC")};
`, {
    moduleId: target.module_id,
    targetId: target.target_id,
    targetType: target.target_type,
    workspaceId,
  });

  return projectNoteSecurity(workspaceId, rows.map(noteRowToAppValue));
}

async function countPlaintextSecurePlaceholders(workspaceId) {
  const row = await db.get(`
SELECT COUNT(*) AS count
FROM notes
WHERE workspace_id = :workspaceId
  AND security_mode = 'secure'
  AND secure_payload IS NULL
  AND (
    COALESCE(body_markdown, '') != ''
    OR COALESCE(body_excerpt, '') != ''
    OR COALESCE(body_plaintext_index, '') != ''
  );
`, { workspaceId });

  return Number(row?.count || 0);
}

function noteInsertPersistenceParams(workspaceId, note, options) {
  return {
    ...notePersistenceParams(workspaceId, note, options),
    createdAt: text(options.createdAt),
    createdByUserId: nullableText(note.created_by_user_id),
  };
}

function notePersistenceParams(workspaceId, note, { noteId, updatedAt }) {
  return {
    archivedAt: nullableText(note.archived_at),
    bodyExcerpt: nullableText(note.body_excerpt),
    bodyMarkdown: text(note.body_markdown),
    bodyPlaintextIndex: nullableText(note.body_plaintext_index),
    clientId: nullableText(note.client_id),
    deletedAt: nullableText(note.deleted_at),
    encryptedAt: nullableText(note.encrypted_at),
    encryptedDataKey: nullableText(note.encrypted_data_key),
    encryptionAlgorithm: nullableText(note.encryption_algorithm),
    encryptionAuthTag: nullableText(note.encryption_auth_tag),
    encryptionKeyVersion: nullableText(note.encryption_key_version),
    encryptionNonce: nullableText(note.encryption_nonce),
    importBatchId: nullableText(note.import_batch_id),
    importedAt: nullableText(note.imported_at),
    importSource: nullableText(note.import_source),
    importSourceId: nullableText(note.import_source_id),
    importSourcePath: nullableText(note.import_source_path),
    keyWrappingAlgorithm: nullableText(note.key_wrapping_algorithm),
    keyWrappingAuthTag: nullableText(note.key_wrapping_auth_tag),
    keyWrappingNonce: nullableText(note.key_wrapping_nonce),
    libraryBucket: text(note.library_bucket || "reference"),
    libraryBucketSource: text(note.library_bucket_source || "derived"),
    linkedUserId: nullableText(note.linked_user_id),
    metadataJson: nullableText(note.metadata_json),
    noteCollectionId: nullableText(note.note_collection_id),
    noteId: text(noteId),
    noteType: text(note.note_type || "general"),
    originalNotebook: nullableText(note.original_notebook),
    originalPageId: nullableText(note.original_page_id),
    originalSection: nullableText(note.original_section),
    originalSectionGroup: nullableText(note.original_section_group),
    ownerUserId: nullableText(note.owner_user_id),
    projectId: nullableText(note.project_id),
    securePayload: nullableText(note.secure_payload),
    securePayloadVersion: nullableText(note.secure_payload_version),
    securityMode: text(note.security_mode || "normal"),
    slug: nullableText(note.slug),
    status: text(note.status || "active"),
    taskId: nullableText(note.task_id),
    ticketId: nullableText(note.ticket_id),
    title: text(note.title),
    updatedAt: text(updatedAt),
    updatedByUserId: nullableText(note.updated_by_user_id),
    visibility: text(note.visibility || "internal"),
    workspaceId: text(workspaceId),
  };
}

function collectionInsertPersistenceParams(workspaceId, collection, options) {
  return {
    ...collectionPersistenceParams(workspaceId, collection, options),
    createdAt: text(options.createdAt),
    createdByUserId: nullableText(collection.created_by_user_id),
  };
}

function collectionPersistenceParams(workspaceId, collection, { collectionId, updatedAt }) {
  return {
    archivedAt: nullableText(collection.archived_at),
    collectionId: text(collectionId),
    collectionSource: text(collection.collection_source || "manual"),
    deletedAt: nullableText(collection.deleted_at),
    depth: integer(collection.depth),
    description: nullableText(collection.description),
    libraryBucket: text(collection.library_bucket),
    metadataJson: nullableText(collection.metadata_json),
    parentCollectionId: nullableText(collection.parent_collection_id),
    pathCache: nullableText(collection.path_cache),
    securityPolicy: text(collection.security_policy || "normal"),
    securityTransitionState: text(collection.security_transition_state || "stable"),
    securityTransitionAction: text(collection.security_transition_action || "none"),
    securityTransitionVersion: integer(collection.security_transition_version),
    securityTransitionJobId: nullableText(collection.security_transition_job_id),
    securityTransitionActorUserId: nullableText(collection.security_transition_actor_user_id),
    securityTransitionStartedAt: nullableText(collection.security_transition_started_at),
    securityTransitionErrorCode: nullableText(collection.security_transition_error_code),
    slug: text(collection.slug),
    sortOrder: integer(collection.sort_order),
    status: text(collection.status || "active"),
    title: text(collection.title),
    updatedAt: text(updatedAt),
    updatedByUserId: nullableText(collection.updated_by_user_id),
    workspaceId: text(workspaceId),
  };
}

function text(value) {
  return String(value ?? "");
}

function nullableText(value) {
  return value === null || value === undefined || String(value).trim() === ""
    ? null
    : String(value);
}

function integer(value) {
  const numberValue = Number.parseInt(value, 10);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function noteRowToAppValue(row) {
  return {
    ...row,
    metadata: parseJson(row.metadata_json, {}),
  };
}

function revisionRowToAppValue(row) {
  return {
    ...row,
    metadata: parseJson(row.metadata_json, {}),
  };
}

function linkRowToAppValue(row) {
  return {
    ...row,
    metadata: parseJson(row.metadata_json, {}),
  };
}

function collectionRowToAppValue(row) {
  return {
    ...row,
    depth: Number(row.depth || 0),
    security_transition_version: Number(row.security_transition_version || 0),
    sort_order: Number(row.sort_order || 0),
    metadata: parseJson(row.metadata_json, {}),
  };
}

async function projectNoteSecurity(workspaceId, notes = []) {
  if (notes.length === 0) {
    return [];
  }

  const collections = await readCollectionSecurityRows(workspaceId);
  const collectionsById = new Map(collections.map((collection) => [collection.note_library_collection_id, collection]));
  return notes.map((note) => ({
    ...note,
    ...resolveNoteEffectiveSecurity(note, collectionsById, workspaceId),
  }));
}

async function projectEffectiveSecurity(workspaceId, note = {}) {
  return (await projectNoteSecurity(workspaceId, [{ ...note, workspace_id: workspaceId }]))[0];
}

async function projectCollectionSecurity(workspaceId, collections = []) {
  if (collections.length === 0) {
    return [];
  }

  const securityRows = await readCollectionSecurityRows(workspaceId);
  const collectionsById = new Map(securityRows.map((collection) => [collection.note_library_collection_id, collection]));
  return collections.map((collection) => {
    const security = resolveCollectionEffectiveSecurity(collection, collectionsById, workspaceId);
    return {
      ...collection,
      effective_security_mode: security.effectiveSecurityMode,
      security_inherited: security.effectiveSecurityMode === "secure" && security.securityCatalogId !== collection.note_library_collection_id,
      security_resolution_state: security.resolutionState,
      security_source_catalog_id: security.securityCatalogId,
    };
  });
}

async function readCollectionSecurityRows(workspaceId) {
  const rows = await db.query(`
SELECT
  note_library_collection_id,
  workspace_id,
  title,
  slug,
  description,
  library_bucket,
  parent_collection_id,
  path_cache,
  depth,
  sort_order,
  collection_source,
  status,
  security_policy,
  security_transition_state,
  security_transition_action,
  security_transition_version,
  security_transition_job_id,
  security_transition_actor_user_id,
  security_transition_started_at,
  security_transition_error_code,
  created_by_user_id,
  updated_by_user_id,
  created_at,
  updated_at,
  archived_at,
  deleted_at,
  metadata_json
FROM note_library_collections
WHERE workspace_id = :workspaceId;
`, { workspaceId });
  return rows.map(collectionRowToAppValue);
}

function parseJson(value, fallback) {
  if (!value) {
    return fallback;
  }

  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function noteListWhereSql(options, params) {
  const conditions = ["notes.workspace_id = :workspaceId"];

  applyNoteStatusFilter(conditions, options, params);
  applyNoteExactFilter(conditions, options, params, "libraryBucket", "library_bucket");
  applyNoteExactFilter(conditions, options, params, "noteType", "note_type");
  applyNoteExactFilter(conditions, options, params, "visibility", "visibility");
  applyNoteExactFilter(conditions, options, params, "securityMode", "security_mode");
  applyNoteProjectScopeFilter(conditions, options, params);
  applyNoteClientScopeFilter(conditions, options, params);
  applyNoteExactFilter(conditions, options, params, "taskId", "task_id");
  applyNoteExactFilter(conditions, options, params, "ticketId", "ticket_id");
  applyNoteExactFilter(conditions, options, params, "linkedUserId", "linked_user_id");
  applyNoteCollectionFilter(conditions, options, params);
  applyNoteOwnerFilter(conditions, options, params);
  applyNoteUpdatedSinceFilter(conditions, options, params);
  applyNoteContextSearchFilter(conditions, options, params);
  applyNoteSearchFilter(conditions, options, params);

  return `WHERE ${conditions.join("\n  AND ")}`;
}

function applyNoteStatusFilter(conditions, options, params) {
  const status = normalizedFilter(options.status);

  if (!options.includeDeleted) {
    conditions.push("notes.status != 'deleted'");
  }

  if (!status || status === "all") {
    return;
  }

  if (status === "active") {
    conditions.push("notes.status NOT IN ('archived', 'deleted')");
    return;
  }

  conditions.push("notes.status = :status");
  params.status = status;
}

function applyNoteExactFilter(conditions, options, params, optionName, columnName) {
  const value = normalizedText(options[optionName]);

  if (!value || value === "all") {
    return;
  }

  conditions.push(`notes.${columnName} = :${optionName}`);
  params[optionName] = value;
}

function applyNoteProjectScopeFilter(conditions, options, params) {
  if (!options.hasProjectFilter) {
    return;
  }

  if (options.projectFilterMode === "blank") {
    conditions.push("(notes.project_id IS NULL OR notes.project_id = '')");
    return;
  }

  if (options.projectFilterMode !== "ids") {
    return;
  }

  const projectIds = normalizedIdArray(options.projectIds);

  if (projectIds.length === 0) {
    conditions.push("1 = 0");
    return;
  }

  conditions.push("notes.project_id IN (:projectIds)");
  params.projectIds = projectIds;
}

function applyNoteClientScopeFilter(conditions, options, params) {
  if (!options.hasClientFilter || options.omitClientFilterBecauseProjectSelected) {
    return;
  }

  if (options.clientFilterMode === "blank") {
    conditions.push("(notes.client_id IS NULL OR notes.client_id = '')");
    return;
  }

  if (options.clientFilterMode !== "ids") {
    return;
  }

  const clientIds = normalizedIdArray(options.clientIds);
  const clientProjectIds = normalizedIdArray(options.clientProjectIds);

  if (clientIds.length === 0 && clientProjectIds.length === 0) {
    conditions.push("1 = 0");
    return;
  }

  const scopedConditions = [];

  if (clientIds.length > 0) {
    scopedConditions.push("notes.client_id IN (:clientIds)");
    params.clientIds = clientIds;
  }

  if (clientProjectIds.length > 0) {
    scopedConditions.push("notes.project_id IN (:clientProjectIds)");
    params.clientProjectIds = clientProjectIds;
  }

  conditions.push(`(${scopedConditions.join(" OR ")})`);
}

function applyNoteCollectionFilter(conditions, options, params) {
  if (options.uncategorizedCollection) {
    conditions.push("(notes.note_collection_id IS NULL OR notes.note_collection_id = '')");
    return;
  }

  const collectionIds = Array.isArray(options.noteCollectionIds)
    ? options.noteCollectionIds.map(normalizedText).filter(Boolean)
    : [];

  if (collectionIds.length > 0) {
    conditions.push("notes.note_collection_id IN (:noteCollectionIds)");
    params.noteCollectionIds = collectionIds;
    return;
  }

  applyNoteExactFilter(conditions, options, params, "noteCollectionId", "note_collection_id");
}

function applyNoteOwnerFilter(conditions, options, params) {
  const ownerUserId = normalizedText(options.ownerUserId);
  if (ownerUserId) {
    conditions.push("notes.owner_user_id = :ownerUserId");
    params.ownerUserId = ownerUserId;
    return;
  }

  const ownerSearch = normalizedText(options.ownerSearch).toLowerCase();
  if (ownerSearch) {
    conditions.push(db.dialect.comparison.containsNoCase("COALESCE(notes.owner_user_id, '')", ":ownerSearch"));
    params.ownerSearch = db.dialect.comparison.likePattern(ownerSearch, { mode: "contains" });
  }
}

function applyNoteUpdatedSinceFilter(conditions, options, params) {
  const updatedSince = normalizedText(options.updatedSince);

  if (!updatedSince) {
    return;
  }

  conditions.push("notes.updated_at >= :updatedSince");
  params.updatedSince = updatedSince;
}

function applyNoteContextSearchFilter(conditions, options, params) {
  const contextSearch = normalizedText(options.contextSearch).toLowerCase();

  if (!contextSearch) {
    return;
  }

  conditions.push(db.dialect.comparison.containsNoCase(`(
    COALESCE(notes.client_id, '') || ' ' ||
    COALESCE(notes.project_id, '') || ' ' ||
    COALESCE(notes.task_id, '') || ' ' ||
    COALESCE(notes.ticket_id, '') || ' ' ||
    COALESCE(notes.linked_user_id, '')
  )`, ":contextSearch"));
  params.contextSearch = db.dialect.comparison.likePattern(contextSearch, { mode: "contains" });
}

function applyNoteSearchFilter(conditions, options, params) {
  const searchQuery = normalizedText(options.searchQuery).toLowerCase();

  if (!searchQuery) {
    return;
  }

  conditions.push(db.dialect.comparison.containsNoCase(`(
    COALESCE(notes.title, '') || ' ' ||
    COALESCE(notes.body_excerpt, '')
  )`, ":searchQuery"));
  params.searchQuery = db.dialect.comparison.likePattern(searchQuery, { mode: "contains" });
}

function noteListOrderSql(sort) {
  const stableTitle = `${db.dialect.comparison.orderByNoCase("notes.title", "ASC")}, notes.created_at ASC, notes.note_id ASC`;
  const updatedDesc = `COALESCE(notes.updated_at, '') DESC, ${stableTitle}`;
  const bucketRank = "CASE notes.library_bucket WHEN 'active_work' THEN 1 WHEN 'ongoing_area' THEN 2 WHEN 'reference' THEN 3 ELSE 99 END";

  if (sort === "title_asc") {
    return `ORDER BY ${stableTitle}`;
  }

  if (sort === "title_desc") {
    return `ORDER BY ${db.dialect.comparison.orderByNoCase("notes.title", "DESC")}, notes.created_at ASC, notes.note_id ASC`;
  }

  if (sort === "created_desc") {
    return `ORDER BY COALESCE(notes.created_at, '') DESC, ${stableTitle}`;
  }

  if (sort === "created_asc") {
    return `ORDER BY COALESCE(notes.created_at, '') ASC, ${stableTitle}`;
  }

  if (sort === "updated_asc") {
    return `ORDER BY COALESCE(notes.updated_at, '') ASC, ${stableTitle}`;
  }

  if (sort === "library_collection_updated_desc") {
    return `ORDER BY ${bucketRank} ASC, ${db.dialect.comparison.orderByNoCase("COALESCE(note_library_collections.path_cache, '')", "ASC")}, ${updatedDesc}`;
  }

  if (sort === "note_kind_updated_desc") {
    return `ORDER BY ${db.dialect.comparison.orderByNoCase("notes.note_type", "ASC")}, ${updatedDesc}`;
  }

  if (sort === "primary_context_updated_desc") {
    return `ORDER BY ${db.dialect.comparison.orderByNoCase("COALESCE(notes.client_id, '')", "ASC")}, ${db.dialect.comparison.orderByNoCase("COALESCE(notes.project_id, '')", "ASC")}, ${updatedDesc}`;
  }

  return `ORDER BY ${updatedDesc}`;
}

function normalizedText(value) {
  return String(value || "").trim();
}

function normalizedIdArray(values) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map(normalizedText)
    .filter(Boolean))];
}

function normalizePropagatedLinks(links = []) {
  const seen = new Set();
  return (Array.isArray(links) ? links : [])
    .map((link) => ({
      link_role: normalizedText(link?.link_role || link?.linkRole) || "related",
      note_id: normalizedText(link?.note_id || link?.noteId),
      scope_role: normalizedText(link?.scope_role || link?.scopeRole) || "related",
    }))
    .filter((link) => {
      if (!link.note_id) {
        return false;
      }
      const key = [link.note_id, link.link_role, link.scope_role].join(":");
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    });
}

function recurrencePropagationMetadata({ recurrenceTemplateId, sourceTaskId }) {
  return {
    propagation_source: "task_recurrence",
    recurrence_template_id: recurrenceTemplateId,
    source_task_id: sourceTaskId,
  };
}

function normalizedFilter(value) {
  return normalizedText(value).toLowerCase();
}

function normalizePositiveInteger(value, fallback) {
  const number = Number.parseInt(value, 10);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

export const notesRepository = {
  applyCatalogSecurityBatch,
  claimCatalogSecurityTransition,
  create,
  createCollection,
  createLink,
  createRevision,
  createWithLinks,
  countPlaintextSecurePlaceholders,
  countChildCollections,
  countNotesInCollection,
  failCatalogSecurityTransition,
  finalizeCatalogSecurityTransition,
  list,
  listCollections,
  listForTarget,
  listLinksForTarget,
  listLinks,
  listLinksForNotes,
  listRevisions,
  nextRevisionNumber,
  projectEffectiveSecurity,
  queryList,
  readById,
  readByIds,
  readCatalogSecuritySnapshot,
  readCollectionById,
  readLinkById,
  readRevisionById,
  removeLink,
  replacePropagatedLinksForTarget,
  resumeCatalogSecurityTransition,
  secureNoteAndRevisions,
  setCatalogSecurityTransitionJob,
  updateCollection,
  update,
};
