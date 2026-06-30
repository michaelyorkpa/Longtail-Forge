import { randomUUID } from "node:crypto";
import {
  db,
  querySql,
  runSql,
  sqlInteger,
  sqlNullableText,
  sqlText,
} from "../../core/database.js";

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
  "created_by_user_id",
  "updated_by_user_id",
  "created_at",
  "updated_at",
  "archived_at",
  "deleted_at",
  "metadata_json",
];

const defaultDatabaseClient = Object.freeze({
  run: runSql,
});

async function list(workspaceId, filters = {}) {
  const clauses = [`workspace_id = ${sqlText(workspaceId)}`];

  if (!filters.includeDeleted) {
    clauses.push("status != 'deleted'");
  }

  if (filters.status) {
    clauses.push(`status = ${sqlText(filters.status)}`);
  }

  if (filters.libraryBucket) {
    clauses.push(`library_bucket = ${sqlText(filters.libraryBucket)}`);
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
      clauses.push(`${columnName} = ${sqlText(filters[filterKey])}`);
    }
  }

  const rows = await querySql(`
SELECT ${NOTE_COLUMNS.join(", ")}
FROM notes
WHERE ${clauses.join("\n  AND ")}
ORDER BY updated_at DESC, title COLLATE NOCASE ASC;
`);

  return rows.map(noteRowToAppValue);
}

async function readById(workspaceId, noteId) {
  const row = await db.get(`
SELECT ${NOTE_COLUMNS.join(", ")}
FROM notes
WHERE workspace_id = :workspaceId
  AND note_id = :noteId
LIMIT 1;
`, { noteId, workspaceId });

  return row ? noteRowToAppValue(row) : null;
}

async function create(workspaceId, note) {
  const noteId = note.note_id || randomUUID();
  const now = note.created_at || new Date().toISOString();

  await insertNote(defaultDatabaseClient, workspaceId, note, noteId, now);
  return readById(workspaceId, noteId);
}

async function createWithLinks(workspaceId, note, links = []) {
  const noteId = note.note_id || randomUUID();
  const now = note.created_at || new Date().toISOString();

  await db.transaction(async (transaction) => {
    await insertNote(transaction, workspaceId, note, noteId, now);

    for (const link of links) {
      await insertNoteLink(transaction, workspaceId, {
        ...link,
        note_id: noteId,
      }, link.note_link_id || randomUUID(), link.created_at || now);
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
  ${sqlText(noteId)},
  ${sqlText(workspaceId)},
  ${sqlText(note.title)},
  ${sqlNullableText(note.slug)},
  ${sqlText(note.body_markdown || "")},
  ${sqlNullableText(note.body_excerpt)},
  ${sqlNullableText(note.body_plaintext_index)},
  ${sqlText(note.note_type || "general")},
  ${sqlText(note.library_bucket || "reference")},
  ${sqlText(note.library_bucket_source || "derived")},
  ${sqlText(note.status || "active")},
  ${sqlText(note.visibility || "internal")},
  ${sqlText(note.security_mode || "normal")},
  ${sqlNullableText(note.secure_payload)},
  ${sqlNullableText(note.secure_payload_version)},
  ${sqlNullableText(note.encrypted_data_key)},
  ${sqlNullableText(note.encryption_key_version)},
  ${sqlNullableText(note.encryption_algorithm)},
  ${sqlNullableText(note.key_wrapping_algorithm)},
  ${sqlNullableText(note.encryption_nonce)},
  ${sqlNullableText(note.encryption_auth_tag)},
  ${sqlNullableText(note.key_wrapping_nonce)},
  ${sqlNullableText(note.key_wrapping_auth_tag)},
  ${sqlNullableText(note.encrypted_at)},
  ${sqlNullableText(note.client_id)},
  ${sqlNullableText(note.project_id)},
  ${sqlNullableText(note.task_id)},
  ${sqlNullableText(note.ticket_id)},
  ${sqlNullableText(note.linked_user_id)},
  ${sqlNullableText(note.note_collection_id)},
  ${sqlNullableText(note.owner_user_id)},
  ${sqlNullableText(note.created_by_user_id)},
  ${sqlNullableText(note.updated_by_user_id)},
  ${sqlText(now)},
  ${sqlText(note.updated_at || now)},
  ${sqlNullableText(note.archived_at)},
  ${sqlNullableText(note.deleted_at)},
  ${sqlNullableText(note.metadata_json)},
  ${sqlNullableText(note.import_source)},
  ${sqlNullableText(note.import_source_id)},
  ${sqlNullableText(note.import_source_path)},
  ${sqlNullableText(note.imported_at)},
  ${sqlNullableText(note.import_batch_id)},
  ${sqlNullableText(note.original_notebook)},
  ${sqlNullableText(note.original_section_group)},
  ${sqlNullableText(note.original_section)},
  ${sqlNullableText(note.original_page_id)}
);
`);
}

async function update(workspaceId, note) {
  await runSql(`
UPDATE notes
SET
  title = ${sqlText(note.title)},
  slug = ${sqlNullableText(note.slug)},
  body_markdown = ${sqlText(note.body_markdown || "")},
  body_excerpt = ${sqlNullableText(note.body_excerpt)},
  body_plaintext_index = ${sqlNullableText(note.body_plaintext_index)},
  note_type = ${sqlText(note.note_type || "general")},
  library_bucket = ${sqlText(note.library_bucket || "reference")},
  library_bucket_source = ${sqlText(note.library_bucket_source || "derived")},
  status = ${sqlText(note.status || "active")},
  visibility = ${sqlText(note.visibility || "internal")},
  security_mode = ${sqlText(note.security_mode || "normal")},
  secure_payload = ${sqlNullableText(note.secure_payload)},
  secure_payload_version = ${sqlNullableText(note.secure_payload_version)},
  encrypted_data_key = ${sqlNullableText(note.encrypted_data_key)},
  encryption_key_version = ${sqlNullableText(note.encryption_key_version)},
  encryption_algorithm = ${sqlNullableText(note.encryption_algorithm)},
  key_wrapping_algorithm = ${sqlNullableText(note.key_wrapping_algorithm)},
  encryption_nonce = ${sqlNullableText(note.encryption_nonce)},
  encryption_auth_tag = ${sqlNullableText(note.encryption_auth_tag)},
  key_wrapping_nonce = ${sqlNullableText(note.key_wrapping_nonce)},
  key_wrapping_auth_tag = ${sqlNullableText(note.key_wrapping_auth_tag)},
  encrypted_at = ${sqlNullableText(note.encrypted_at)},
  client_id = ${sqlNullableText(note.client_id)},
  project_id = ${sqlNullableText(note.project_id)},
  task_id = ${sqlNullableText(note.task_id)},
  ticket_id = ${sqlNullableText(note.ticket_id)},
  linked_user_id = ${sqlNullableText(note.linked_user_id)},
  note_collection_id = ${sqlNullableText(note.note_collection_id)},
  owner_user_id = ${sqlNullableText(note.owner_user_id)},
  updated_by_user_id = ${sqlNullableText(note.updated_by_user_id)},
  updated_at = ${sqlText(note.updated_at || new Date().toISOString())},
  archived_at = ${sqlNullableText(note.archived_at)},
  deleted_at = ${sqlNullableText(note.deleted_at)},
  metadata_json = ${sqlNullableText(note.metadata_json)},
  import_source = ${sqlNullableText(note.import_source)},
  import_source_id = ${sqlNullableText(note.import_source_id)},
  import_source_path = ${sqlNullableText(note.import_source_path)},
  imported_at = ${sqlNullableText(note.imported_at)},
  import_batch_id = ${sqlNullableText(note.import_batch_id)},
  original_notebook = ${sqlNullableText(note.original_notebook)},
  original_section_group = ${sqlNullableText(note.original_section_group)},
  original_section = ${sqlNullableText(note.original_section)},
  original_page_id = ${sqlNullableText(note.original_page_id)}
WHERE workspace_id = ${sqlText(workspaceId)}
  AND note_id = ${sqlText(note.note_id)};
`);

  return readById(workspaceId, note.note_id);
}

async function createRevision(workspaceId, revision) {
  const revisionId = revision.note_revision_id || randomUUID();

  await runSql(`
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
  ${sqlText(revisionId)},
  ${sqlText(workspaceId)},
  ${sqlText(revision.note_id)},
  ${sqlInteger(revision.revision_number)},
  ${sqlText(revision.title)},
  ${sqlText(revision.body_markdown || "")},
  ${sqlNullableText(revision.body_excerpt)},
  ${sqlText(revision.note_type || "general")},
  ${sqlText(revision.library_bucket || "reference")},
  ${sqlText(revision.status || "active")},
  ${sqlText(revision.visibility || "internal")},
  ${sqlText(revision.security_mode || "normal")},
  ${sqlNullableText(revision.secure_payload)},
  ${sqlNullableText(revision.secure_payload_version)},
  ${sqlNullableText(revision.encrypted_data_key)},
  ${sqlNullableText(revision.encryption_key_version)},
  ${sqlNullableText(revision.encryption_algorithm)},
  ${sqlNullableText(revision.key_wrapping_algorithm)},
  ${sqlNullableText(revision.encryption_nonce)},
  ${sqlNullableText(revision.encryption_auth_tag)},
  ${sqlNullableText(revision.key_wrapping_nonce)},
  ${sqlNullableText(revision.key_wrapping_auth_tag)},
  ${sqlNullableText(revision.encrypted_at)},
  ${sqlNullableText(revision.changed_by_user_id)},
  ${sqlNullableText(revision.change_summary)},
  ${sqlNullableText(revision.change_reason)},
  ${sqlText(revision.created_at || new Date().toISOString())},
  ${sqlNullableText(revision.metadata_json)},
  ${sqlNullableText(revision.import_source)},
  ${sqlNullableText(revision.import_source_id)},
  ${sqlNullableText(revision.import_source_path)},
  ${sqlNullableText(revision.imported_at)},
  ${sqlNullableText(revision.import_batch_id)},
  ${sqlNullableText(revision.original_notebook)},
  ${sqlNullableText(revision.original_section_group)},
  ${sqlNullableText(revision.original_section)},
  ${sqlNullableText(revision.original_page_id)}
);
`);

  return readRevisionById(workspaceId, revision.note_id, revisionId);
}

async function nextRevisionNumber(workspaceId, noteId) {
  const rows = await querySql(`
SELECT COALESCE(MAX(revision_number), 0) + 1 AS revision_number
FROM note_revisions
WHERE workspace_id = ${sqlText(workspaceId)}
  AND note_id = ${sqlText(noteId)};
`);

  return Number(rows[0]?.revision_number || 1);
}

async function listRevisions(workspaceId, noteId) {
  const rows = await querySql(`
SELECT *
FROM note_revisions
WHERE workspace_id = ${sqlText(workspaceId)}
  AND note_id = ${sqlText(noteId)}
ORDER BY revision_number DESC;
`);

  return rows.map(revisionRowToAppValue);
}

async function readRevisionById(workspaceId, noteId, revisionId) {
  const rows = await querySql(`
SELECT *
FROM note_revisions
WHERE workspace_id = ${sqlText(workspaceId)}
  AND note_id = ${sqlText(noteId)}
  AND note_revision_id = ${sqlText(revisionId)}
LIMIT 1;
`);

  return rows[0] ? revisionRowToAppValue(rows[0]) : null;
}

async function createLink(workspaceId, link) {
  const linkId = link.note_link_id || randomUUID();
  const now = link.created_at || new Date().toISOString();

  await insertNoteLink(defaultDatabaseClient, workspaceId, link, linkId, now);
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
  ${sqlText(linkId)},
  ${sqlText(workspaceId)},
  ${sqlText(link.note_id)},
  ${sqlText(link.module_id)},
  ${sqlText(link.target_type)},
  ${sqlText(link.target_id)},
  ${sqlText(link.link_role || "related")},
  ${sqlText(link.scope_role || "related")},
  ${sqlNullableText(link.created_by_user_id)},
  ${sqlText(now)},
  NULL,
  ${sqlNullableText(link.metadata_json)}
);
`);
}

async function listLinks(workspaceId, noteId) {
  const rows = await querySql(`
SELECT *
FROM note_links
WHERE workspace_id = ${sqlText(workspaceId)}
  AND note_id = ${sqlText(noteId)}
  AND removed_at IS NULL
ORDER BY created_at ASC;
`);

  return rows.map(linkRowToAppValue);
}

async function listLinksForNotes(workspaceId, noteIds) {
  const ids = [...new Set((noteIds || []).filter(Boolean))];

  if (ids.length === 0) {
    return [];
  }

  const rows = await querySql(`
SELECT *
FROM note_links
WHERE workspace_id = ${sqlText(workspaceId)}
  AND note_id IN (${ids.map((id) => sqlText(id)).join(", ")})
  AND removed_at IS NULL
ORDER BY created_at ASC;
`);

  return rows.map(linkRowToAppValue);
}

async function readLinkById(workspaceId, noteId, linkId) {
  const rows = await querySql(`
SELECT *
FROM note_links
WHERE workspace_id = ${sqlText(workspaceId)}
  AND note_id = ${sqlText(noteId)}
  AND note_link_id = ${sqlText(linkId)}
LIMIT 1;
`);

  return rows[0] ? linkRowToAppValue(rows[0]) : null;
}

async function removeLink(workspaceId, noteId, linkId) {
  const now = new Date().toISOString();

  await runSql(`
UPDATE note_links
SET removed_at = ${sqlText(now)}
WHERE workspace_id = ${sqlText(workspaceId)}
  AND note_id = ${sqlText(noteId)}
  AND note_link_id = ${sqlText(linkId)}
  AND removed_at IS NULL;
`);

  return readLinkById(workspaceId, noteId, linkId);
}

async function listCollections(workspaceId, filters = {}) {
  const clauses = [`workspace_id = ${sqlText(workspaceId)}`];

  if (!filters.includeDeleted) {
    clauses.push("status != 'deleted'");
  }

  if (!filters.includeArchived) {
    clauses.push("status != 'archived'");
  }

  if (filters.libraryBucket) {
    clauses.push(`library_bucket = ${sqlText(filters.libraryBucket)}`);
  }

  const rows = await querySql(`
SELECT ${COLLECTION_COLUMNS.join(", ")}
FROM note_library_collections
WHERE ${clauses.join("\n  AND ")}
ORDER BY library_bucket ASC, path_cache COLLATE NOCASE ASC, sort_order ASC, title COLLATE NOCASE ASC;
`);

  return rows.map(collectionRowToAppValue);
}

async function readCollectionById(workspaceId, collectionId) {
  const rows = await querySql(`
SELECT ${COLLECTION_COLUMNS.join(", ")}
FROM note_library_collections
WHERE workspace_id = ${sqlText(workspaceId)}
  AND note_library_collection_id = ${sqlText(collectionId)}
LIMIT 1;
`);

  return rows[0] ? collectionRowToAppValue(rows[0]) : null;
}

async function createCollection(workspaceId, collection) {
  const collectionId = collection.note_library_collection_id || randomUUID();
  const now = collection.created_at || new Date().toISOString();

  await runSql(`
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
  created_by_user_id,
  updated_by_user_id,
  created_at,
  updated_at,
  archived_at,
  deleted_at,
  metadata_json
)
VALUES (
  ${sqlText(collectionId)},
  ${sqlText(workspaceId)},
  ${sqlText(collection.title)},
  ${sqlText(collection.slug)},
  ${sqlNullableText(collection.description)},
  ${sqlText(collection.library_bucket)},
  ${sqlNullableText(collection.parent_collection_id)},
  ${sqlNullableText(collection.path_cache)},
  ${sqlInteger(collection.depth || 0)},
  ${sqlInteger(collection.sort_order || 0)},
  ${sqlText(collection.collection_source || "manual")},
  ${sqlText(collection.status || "active")},
  ${sqlNullableText(collection.created_by_user_id)},
  ${sqlNullableText(collection.updated_by_user_id)},
  ${sqlText(now)},
  ${sqlText(collection.updated_at || now)},
  ${sqlNullableText(collection.archived_at)},
  ${sqlNullableText(collection.deleted_at)},
  ${sqlNullableText(collection.metadata_json)}
);
`);

  return readCollectionById(workspaceId, collectionId);
}

async function updateCollection(workspaceId, collection) {
  await runSql(`
UPDATE note_library_collections
SET
  title = ${sqlText(collection.title)},
  slug = ${sqlText(collection.slug)},
  description = ${sqlNullableText(collection.description)},
  library_bucket = ${sqlText(collection.library_bucket)},
  parent_collection_id = ${sqlNullableText(collection.parent_collection_id)},
  path_cache = ${sqlNullableText(collection.path_cache)},
  depth = ${sqlInteger(collection.depth || 0)},
  sort_order = ${sqlInteger(collection.sort_order || 0)},
  collection_source = ${sqlText(collection.collection_source || "manual")},
  status = ${sqlText(collection.status || "active")},
  updated_by_user_id = ${sqlNullableText(collection.updated_by_user_id)},
  updated_at = ${sqlText(collection.updated_at || new Date().toISOString())},
  archived_at = ${sqlNullableText(collection.archived_at)},
  deleted_at = ${sqlNullableText(collection.deleted_at)},
  metadata_json = ${sqlNullableText(collection.metadata_json)}
WHERE workspace_id = ${sqlText(workspaceId)}
  AND note_library_collection_id = ${sqlText(collection.note_library_collection_id)};
`);

  return readCollectionById(workspaceId, collection.note_library_collection_id);
}

async function countNotesInCollection(workspaceId, collectionId, filters = {}) {
  const clauses = [
    `workspace_id = ${sqlText(workspaceId)}`,
    `note_collection_id = ${sqlText(collectionId)}`,
  ];

  if (!filters.includeDeleted) {
    clauses.push("status != 'deleted'");
  }

  const rows = await querySql(`
SELECT COUNT(*) AS count
FROM notes
WHERE ${clauses.join("\n  AND ")};
`);

  return Number(rows[0]?.count || 0);
}

async function countChildCollections(workspaceId, collectionId, filters = {}) {
  const clauses = [
    `workspace_id = ${sqlText(workspaceId)}`,
    `parent_collection_id = ${sqlText(collectionId)}`,
  ];

  if (!filters.includeDeleted) {
    clauses.push("status != 'deleted'");
  }

  if (!filters.includeArchived) {
    clauses.push("status != 'archived'");
  }

  const rows = await querySql(`
SELECT COUNT(*) AS count
FROM note_library_collections
WHERE ${clauses.join("\n  AND ")};
`);

  return Number(rows[0]?.count || 0);
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
    ? `OR notes.${directColumn} = ${sqlText(target.target_id)}`
    : "";
  const rows = await querySql(`
SELECT DISTINCT ${NOTE_COLUMNS.map((column) => `notes.${column}`).join(", ")}
FROM notes
LEFT JOIN note_links
  ON note_links.workspace_id = notes.workspace_id
  AND note_links.note_id = notes.note_id
  AND note_links.removed_at IS NULL
WHERE notes.workspace_id = ${sqlText(workspaceId)}
  AND (
    (
      note_links.module_id = ${sqlText(target.module_id)}
      AND note_links.target_type = ${sqlText(target.target_type)}
      AND note_links.target_id = ${sqlText(target.target_id)}
    )
    ${directClause}
  )
  AND notes.status != 'deleted'
ORDER BY notes.updated_at DESC, notes.title COLLATE NOCASE ASC;
`);

  return rows.map(noteRowToAppValue);
}

async function countPlaintextSecurePlaceholders(workspaceId) {
  const rows = await querySql(`
SELECT COUNT(*) AS count
FROM notes
WHERE workspace_id = ${sqlText(workspaceId)}
  AND security_mode = 'secure'
  AND secure_payload IS NULL
  AND (
    COALESCE(body_markdown, '') != ''
    OR COALESCE(body_excerpt, '') != ''
    OR COALESCE(body_plaintext_index, '') != ''
  );
`);

  return Number(rows[0]?.count || 0);
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
    sort_order: Number(row.sort_order || 0),
    metadata: parseJson(row.metadata_json, {}),
  };
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

export const notesRepository = {
  create,
  createCollection,
  createLink,
  createRevision,
  createWithLinks,
  countPlaintextSecurePlaceholders,
  countChildCollections,
  countNotesInCollection,
  list,
  listCollections,
  listForTarget,
  listLinks,
  listLinksForNotes,
  listRevisions,
  nextRevisionNumber,
  readById,
  readCollectionById,
  readLinkById,
  readRevisionById,
  removeLink,
  updateCollection,
  update,
};
