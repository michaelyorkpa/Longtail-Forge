import { randomUUID } from "node:crypto";
import { notesRepository } from "./notes.repo.js";
import {
  NOTE_IMPORT_METADATA_FIELDS,
  NOTE_PERMISSIONS,
  canAccessNote,
  sanitizeNoteLifecyclePayload,
} from "./access-policy.js";
import {
  NOTE_LIBRARY_BUCKET_SOURCES,
  NOTE_LIBRARY_BUCKETS,
  NOTE_SECURITY_MODES,
  NOTE_STATUSES,
  NOTE_TYPES,
  NOTE_VISIBILITIES,
  deriveSuggestedLibraryBucket,
} from "./library.js";
import {
  assertSafeMarkdown,
  createMarkdownExcerpt,
  createRevisionSnapshot,
  describeRevisionChanges,
  extractPlainTextFromMarkdown,
  renderMarkdownToSafeHtml,
  shouldCreateRevision,
  slugifyNoteTitle,
} from "./markdown.js";
import { clientsRepository } from "../client-projects/clients.repo.js";
import { projectsRepository } from "../client-projects/projects.repo.js";
import { tasksRepository } from "../tasks/tasks.repo.js";
import { modulesService } from "../../core/modules/modules.service.js";
import { auditService } from "../../core/audit.js";
import { permissionsService } from "../../core/permissions.js";
import { AppError } from "../../core/errors.js";
import { tagsService } from "../../services/tags.service.js";
import { searchIndexSyncService } from "../../services/search-index-sync.service.js";

const NOTES_MODULE_ID = "notes";
const LINK_TARGET_TYPES = new Set(["workspace", "client", "project", "task", "user"]);
const NOTE_TYPE_VALUES = new Set(Object.values(NOTE_TYPES));
const LIBRARY_BUCKET_VALUES = new Set(Object.values(NOTE_LIBRARY_BUCKETS));
const LIBRARY_BUCKET_SOURCE_VALUES = new Set(Object.values(NOTE_LIBRARY_BUCKET_SOURCES));
const NOTE_STATUS_VALUES = new Set(Object.values(NOTE_STATUSES));
const NOTE_VISIBILITY_VALUES = new Set(Object.values(NOTE_VISIBILITIES));
const NOTE_SECURITY_MODE_VALUES = new Set(Object.values(NOTE_SECURITY_MODES));
const NOTE_PERMISSION_VALUES = Object.values(NOTE_PERMISSIONS);
const COLLECTION_SOURCE_VALUES = new Set(["manual", "imported"]);

async function list(session, query = {}) {
  const filters = normalizeListFilters(query);
  const notes = await notesRepository.list(session.workspace_id, filters);
  return { notes: await decorateAndFilterNotesByTags(session, await filterAccessibleNotes(session, notes), filters) };
}

async function read(noteId, session) {
  const note = await readNoteOrThrow(session, noteId);
  await assertCanAccess(session, note, "read");

  return { note: await attachNoteIntegrations(session, note) };
}

async function create(payload, session) {
  await assertNotesWriteEnabled(session);
  const normalized = await normalizeNotePayload(payload, session);
  await assertLinkedContextAccess(session, normalized);
  await assertNoteCollectionAccess(session, normalized);
  await assertCanAccess(session, normalized, "create");

  const note = await notesRepository.create(session.workspace_id, normalized);
  await createLinksFromPayload(session, note.note_id, payload);
  await saveTargetTags(session, note.note_id, payload);
  const noteWithLinks = await attachNoteIntegrations(session, note);
  await recordNoteAudit(session, "note_created", "create", null, noteWithLinks);
  await emitNoteEvent("note.created", session, null, noteWithLinks);
  await syncNoteSearchIndex(session.workspace_id, note.note_id, "note.created");

  return {
    note: noteWithLinks,
    searchDocument: createSearchIndexPayload(noteWithLinks),
  };
}

async function update(noteId, payload, session) {
  await assertNotesWriteEnabled(session);
  const previousNote = await readNoteOrThrow(session, noteId);
  await assertCanAccess(session, previousNote, "update");
  const nextNote = await normalizeNotePayload(payload, session, previousNote);
  await assertLinkedContextAccess(session, nextNote);
  await assertNoteCollectionAccess(session, nextNote);
  await assertCanAccess(session, nextNote, "update");

  const note = await notesRepository.update(session.workspace_id, nextNote);
  await maybeCreateRevision(session, previousNote, note, "Note updated.");
  await saveTargetTags(session, note.note_id, payload);
  const noteWithLinks = await attachNoteIntegrations(session, note);
  await recordNoteAudit(session, "note_updated", "update", previousNote, noteWithLinks);
  await emitNoteEvent("note.updated", session, previousNote, noteWithLinks);
  await emitChangeEvents(session, previousNote, noteWithLinks);
  await syncNoteSearchIndex(session.workspace_id, note.note_id, "note.updated");

  return {
    note: noteWithLinks,
    searchDocument: createSearchIndexPayload(noteWithLinks),
  };
}

async function changeLibrary(noteId, payload, session) {
  const previousNote = await readNoteOrThrow(session, noteId);
  const nextBucket = normalizeEnum(payload?.libraryBucket || payload?.library_bucket, LIBRARY_BUCKET_VALUES, "Library bucket");

  return update(noteId, {
    ...previousNote,
    library_bucket: nextBucket,
    library_bucket_source: NOTE_LIBRARY_BUCKET_SOURCES.MANUAL,
    note_collection_id: previousNote.library_bucket === nextBucket ? previousNote.note_collection_id : null,
  }, session);
}

async function archive(noteId, session) {
  await assertNotesWriteEnabled(session);
  const previousNote = await readNoteOrThrow(session, noteId);
  await assertCanAccess(session, previousNote, "archive");
  const now = new Date().toISOString();
  const note = await notesRepository.update(session.workspace_id, {
    ...previousNote,
    status: NOTE_STATUSES.ARCHIVED,
    archived_at: now,
    deleted_at: null,
    updated_at: now,
    updated_by_user_id: session.user_id,
  });

  await recordNoteAudit(session, "note_archived", "archive", previousNote, note);
  await emitNoteEvent("note.archived", session, previousNote, note);
  await syncNoteSearchIndex(session.workspace_id, note.note_id, "note.archived");
  return { note };
}

async function restore(noteId, session) {
  await assertNotesWriteEnabled(session);
  const previousNote = await readNoteOrThrow(session, noteId);
  await assertCanAccess(session, previousNote, "restore");
  const now = new Date().toISOString();
  const note = await notesRepository.update(session.workspace_id, {
    ...previousNote,
    status: NOTE_STATUSES.ACTIVE,
    archived_at: null,
    deleted_at: null,
    updated_at: now,
    updated_by_user_id: session.user_id,
  });

  await recordNoteAudit(session, "note_restored", "restore", previousNote, note);
  await emitNoteEvent("note.restored", session, previousNote, note);
  await syncNoteSearchIndex(session.workspace_id, note.note_id, "note.restored");
  return { note };
}

async function softDelete(noteId, session) {
  await assertNotesWriteEnabled(session);
  const previousNote = await readNoteOrThrow(session, noteId);
  await assertCanAccess(session, previousNote, "delete");
  const now = new Date().toISOString();
  const note = await notesRepository.update(session.workspace_id, {
    ...previousNote,
    status: NOTE_STATUSES.DELETED,
    deleted_at: now,
    updated_at: now,
    updated_by_user_id: session.user_id,
  });

  await recordNoteAudit(session, "note_deleted", "delete", previousNote, note);
  await emitNoteEvent("note.deleted", session, previousNote, note);
  await syncNoteSearchIndex(session.workspace_id, note.note_id, "note.deleted");
  return { note };
}

async function listRevisions(noteId, session) {
  const note = await readNoteOrThrow(session, noteId);
  await assertCanAccess(session, note, "view_history");

  const revisions = await notesRepository.listRevisions(session.workspace_id, noteId);
  return { revisions: visibleRevisionSnapshots(revisions, note) };
}

async function readRevision(noteId, revisionId, session) {
  const note = await readNoteOrThrow(session, noteId);
  await assertCanAccess(session, note, "view_history");
  const revision = await notesRepository.readRevisionById(session.workspace_id, noteId, revisionId);

  if (!revision) {
    throw new AppError("Note revision not found.", 404);
  }

  return { revision };
}

async function restoreRevision(noteId, revisionId, session) {
  await assertNotesWriteEnabled(session);
  const previousNote = await readNoteOrThrow(session, noteId);
  await assertCanAccess(session, previousNote, "restore_revision");
  await assertCanAccess(session, previousNote, "update");
  const revision = await notesRepository.readRevisionById(session.workspace_id, noteId, revisionId);

  if (!revision) {
    throw new AppError("Note revision not found.", 404);
  }

  const now = new Date().toISOString();
  const note = await notesRepository.update(session.workspace_id, {
    ...previousNote,
    title: revision.title,
    body_markdown: revision.body_markdown,
    body_excerpt: revision.body_excerpt,
    body_plaintext_index: extractPlainTextFromMarkdown(revision.body_markdown),
    note_type: revision.note_type,
    library_bucket: revision.library_bucket,
    status: revision.status === NOTE_STATUSES.DELETED ? NOTE_STATUSES.ACTIVE : revision.status,
    visibility: revision.visibility,
    security_mode: revision.security_mode,
    updated_by_user_id: session.user_id,
    updated_at: now,
  });

  await maybeCreateRevision(session, previousNote, note, `Restored revision ${revision.revision_number}.`);
  await recordNoteAudit(session, "note_revision_restored", "update", previousNote, note);
  await emitNoteEvent("note.updated", session, previousNote, note, { restored_revision_id: revisionId });
  await syncNoteSearchIndex(session.workspace_id, note.note_id, "note.revision_restored");
  return { note: await attachNoteIntegrations(session, note), restoredRevision: revision };
}

async function listLinks(noteId, session) {
  const note = await readNoteOrThrow(session, noteId);
  await assertCanAccess(session, note, "read");

  return { links: await notesRepository.listLinks(session.workspace_id, noteId) };
}

async function listCollections(session, query = {}) {
  await permissionsService.assertCanInAnyScope(session, NOTE_PERMISSIONS.VIEW);
  const filters = normalizeCollectionListFilters(query);
  const collections = await notesRepository.listCollections(session.workspace_id, filters);
  const notes = await list(session, {
    includeDeleted: false,
    libraryBucket: filters.libraryBucket,
    status: filters.includeArchived ? "" : NOTE_STATUSES.ACTIVE,
  });
  const accessibleCountByCollectionId = new Map();
  let uncategorizedCount = 0;

  for (const note of notes.notes) {
    if (note.note_collection_id) {
      accessibleCountByCollectionId.set(
        note.note_collection_id,
        (accessibleCountByCollectionId.get(note.note_collection_id) || 0) + 1,
      );
    } else {
      uncategorizedCount += 1;
    }
  }
  const rolledUpCountByCollectionId = rollupCollectionCounts(collections, accessibleCountByCollectionId);

  return {
    collections: collections.map((collection) => ({
      ...collection,
      accessibleNoteCount: rolledUpCountByCollectionId.get(collection.note_library_collection_id) || 0,
      directAccessibleNoteCount: accessibleCountByCollectionId.get(collection.note_library_collection_id) || 0,
    })),
    tree: buildCollectionTree(collections, rolledUpCountByCollectionId, accessibleCountByCollectionId),
    uncategorized: {
      count: uncategorizedCount,
      libraryBucket: filters.libraryBucket || "",
    },
  };
}

async function createCollection(payload, session) {
  await assertCollectionsWriteEnabled(session);
  const collection = await normalizeCollectionPayload(payload, session);
  await assertCollectionSiblingAvailable(session.workspace_id, collection);
  const created = await notesRepository.createCollection(session.workspace_id, collection);

  await recordNoteAudit(session, "note_collection_created", "create", null, created, "note_library");
  return { collection: created };
}

async function updateCollection(collectionId, payload, session) {
  await assertCollectionsWriteEnabled(session);
  const previous = await readCollectionOrThrow(session, collectionId);
  const next = await normalizeCollectionPayload(payload, session, previous);
  await assertCollectionSiblingAvailable(session.workspace_id, next, previous.note_library_collection_id);
  const updated = await notesRepository.updateCollection(session.workspace_id, next);
  await updateCollectionDescendantPaths(session, updated);
  await syncCollectionNotesSearchIndex(session, [updated.note_library_collection_id], "note.collection.updated");

  await recordNoteAudit(session, "note_collection_updated", "update", previous, updated, "note_library");
  return { collection: await notesRepository.readCollectionById(session.workspace_id, updated.note_library_collection_id) };
}

async function moveCollection(collectionId, payload, session) {
  return updateCollection(collectionId, {
    parentCollectionId: payload.parentCollectionId ?? payload.parent_collection_id ?? null,
    title: payload.title,
    name: payload.name,
    description: payload.description,
    sortOrder: payload.sortOrder ?? payload.sort_order,
  }, session);
}

async function archiveCollection(collectionId, session) {
  await assertCollectionsWriteEnabled(session);
  const collection = await readCollectionOrThrow(session, collectionId);
  const descendants = collectionDescendants(collection, await notesRepository.listCollections(session.workspace_id, {
    includeArchived: true,
    includeDeleted: true,
    libraryBucket: collection.library_bucket,
  }));
  const archivedAt = new Date().toISOString();
  const archived = [];

  for (const item of [collection, ...descendants].filter((candidate) => candidate.status !== "deleted")) {
    archived.push(await notesRepository.updateCollection(session.workspace_id, {
      ...item,
      status: "archived",
      archived_at: archivedAt,
      deleted_at: null,
      updated_at: archivedAt,
      updated_by_user_id: session.user_id,
    }));
  }

  await syncCollectionNotesSearchIndex(session, archived.map((item) => item.note_library_collection_id), "note.collection.archived");
  await recordNoteAudit(session, "note_collection_archived", "archive", collection, archived[0], "note_library");
  return { collection: archived[0], archivedCount: archived.length };
}

async function restoreCollection(collectionId, session) {
  await assertCollectionsWriteEnabled(session);
  const collection = await readCollectionOrThrow(session, collectionId, { includeArchived: true, includeDeleted: true });
  if (collection.status === "deleted") {
    throw new AppError("Deleted collections cannot be restored in this release.", 400);
  }
  const parent = collection.parent_collection_id
    ? await readCollectionOrThrow(session, collection.parent_collection_id)
    : null;
  const next = {
    ...collection,
    parent_collection_id: parent?.note_library_collection_id || null,
    path_cache: collectionPath(collection, parent),
    depth: parent ? Number(parent.depth || 0) + 1 : 0,
    status: "active",
    archived_at: null,
    deleted_at: null,
    updated_at: new Date().toISOString(),
    updated_by_user_id: session.user_id,
  };

  await assertCollectionSiblingAvailable(session.workspace_id, next, collection.note_library_collection_id);
  const restored = await notesRepository.updateCollection(session.workspace_id, next);
  await updateCollectionDescendantPaths(session, restored);
  await syncCollectionNotesSearchIndex(session, [restored.note_library_collection_id], "note.collection.restored");
  await recordNoteAudit(session, "note_collection_restored", "restore", collection, restored, "note_library");
  return { collection: restored };
}

async function deleteEmptyCollection(collectionId, session) {
  await assertCollectionsWriteEnabled(session);
  const collection = await readCollectionOrThrow(session, collectionId, { includeArchived: true, includeDeleted: true });
  const noteCount = await notesRepository.countNotesInCollection(session.workspace_id, collectionId, { includeDeleted: false });
  if (noteCount > 0) {
    throw new AppError("Collection cannot be deleted while it still contains notes.", 400);
  }

  const childCount = await notesRepository.countChildCollections(session.workspace_id, collectionId, {
    includeArchived: false,
    includeDeleted: false,
  });
  if (childCount > 0) {
    throw new AppError("Collection cannot be deleted while it still contains active child collections.", 400);
  }

  const now = new Date().toISOString();
  const deleted = await notesRepository.updateCollection(session.workspace_id, {
    ...collection,
    status: "deleted",
    deleted_at: now,
    updated_at: now,
    updated_by_user_id: session.user_id,
  });
  await recordNoteAudit(session, "note_collection_deleted", "delete", collection, deleted, "note_library");
  return { collection: deleted, deleted: true };
}

async function assignNoteCollection(noteId, payload, session) {
  const previousNote = await readNoteOrThrow(session, noteId);
  await assertCanAccess(session, previousNote, "update");
  const noteCollectionId = normalizeOptionalText(payload.noteCollectionId ?? payload.note_collection_id ?? payload.collectionId ?? payload.collection_id);

  return update(noteId, {
    ...previousNote,
    note_collection_id: noteCollectionId || null,
  }, session);
}

async function ensureCollectionsForImportPath(session, payload = {}) {
  await assertCollectionsWriteEnabled(session);
  const libraryBucket = normalizeEnum(
    payload.libraryBucket || payload.library_bucket || NOTE_LIBRARY_BUCKETS.REFERENCE,
    LIBRARY_BUCKET_VALUES,
    "Library bucket",
  );
  const parts = normalizeImportCollectionPathParts(payload);
  let parent = null;
  const ensured = [];

  for (const title of parts) {
    const existing = (await notesRepository.listCollections(session.workspace_id, {
      includeArchived: true,
      libraryBucket,
    })).find((collection) => (
      (collection.parent_collection_id || "") === (parent?.note_library_collection_id || "") &&
      collection.slug === slugifyNoteTitle(title) &&
      collection.status !== "deleted"
    ));

    if (existing) {
      parent = existing;
      ensured.push(existing);
      continue;
    }

    const created = await createCollection({
      collectionSource: "imported",
      libraryBucket,
      parentCollectionId: parent?.note_library_collection_id || null,
      title,
      metadata: {
        import_source: payload.importSource || payload.import_source || "onenote",
        import_source_path: payload.importSourcePath || payload.import_source_path || parts.join(" / "),
        original_notebook: payload.originalNotebook || payload.original_notebook || "",
        original_section_group: payload.originalSectionGroup || payload.original_section_group || "",
        original_section: payload.originalSection || payload.original_section || "",
      },
    }, session);
    parent = created.collection;
    ensured.push(parent);
  }

  return {
    collection: parent,
    collections: ensured,
  };
}

async function readForAttachmentAccess(session, noteId, operation = "read") {
  const note = await readNoteOrThrow(session, noteId);
  await assertCanAccess(session, note, operation);
  return note;
}

async function createLink(noteId, payload, session) {
  await assertNotesWriteEnabled(session);
  const note = await readNoteOrThrow(session, noteId);
  await assertCanAccess(session, note, "manage_links");
  const link = normalizeLinkPayload(payload, noteId, session);
  await assertTargetAccess(session, link);
  const createdLink = await notesRepository.createLink(session.workspace_id, link);
  await recordNoteAudit(session, "note_link_created", "create", null, createdLink, "note_link");
  await emitNoteEvent("note.linked", session, null, note, { link: createdLink });
  await syncNoteSearchIndex(session.workspace_id, note.note_id, "note.linked");

  return { link: createdLink };
}

async function removeLink(noteId, noteLinkId, session) {
  await assertNotesWriteEnabled(session);
  const note = await readNoteOrThrow(session, noteId);
  await assertCanAccess(session, note, "manage_links");
  const previousLink = await notesRepository.readLinkById(session.workspace_id, noteId, noteLinkId);

  if (!previousLink || previousLink.removed_at) {
    throw new AppError("Note link not found.", 404);
  }

  const link = await notesRepository.removeLink(session.workspace_id, noteId, noteLinkId);
  await recordNoteAudit(session, "note_link_removed", "delete", previousLink, link, "note_link");
  await emitNoteEvent("note.unlinked", session, note, note, { link });
  await syncNoteSearchIndex(session.workspace_id, note.note_id, "note.unlinked");

  return { link };
}

async function listForTarget(session, query = {}) {
  const target = normalizeTargetFromQuery(query);
  await assertTargetAccess(session, target);
  const notes = await notesRepository.listForTarget(session.workspace_id, target);

  return { notes: await decorateAndFilterNotesByTags(session, await filterAccessibleNotes(session, notes), normalizeListFilters(query)) };
}

async function listLibrary(session) {
  const notes = await notesRepository.list(session.workspace_id, {});
  const accessible = await filterAccessibleNotes(session, notes);
  const buckets = Object.values(NOTE_LIBRARY_BUCKETS).map((libraryBucket) => ({
    libraryBucket,
    count: accessible.filter((note) => note.library_bucket === libraryBucket && note.status !== NOTE_STATUSES.ARCHIVED).length,
    archivedCount: accessible.filter((note) => note.library_bucket === libraryBucket && note.status === NOTE_STATUSES.ARCHIVED).length,
  }));

  return { buckets };
}

async function listByLibraryBucket(session, libraryBucket, query = {}) {
  const normalizedBucket = normalizeEnum(libraryBucket, LIBRARY_BUCKET_VALUES, "Library bucket");

  return list(session, { ...query, libraryBucket: normalizedBucket });
}

async function listArchived(session, query = {}) {
  return list(session, { ...query, status: NOTE_STATUSES.ARCHIVED });
}

function deriveLibrarySuggestion(payload = {}) {
  return {
    libraryBucket: deriveSuggestedLibraryBucket({
      links: normalizeLinksInput(payload.links || []),
      clientIds: payload.clientIds || payload.client_ids || payload.client_id,
      projectIds: payload.projectIds || payload.project_ids || payload.project_id,
      taskIds: payload.taskIds || payload.task_ids || payload.task_id,
      ticketIds: payload.ticketIds || payload.ticket_ids || payload.ticket_id,
    }),
  };
}

async function normalizeNotePayload(payload = {}, session, previousNote = null) {
  const bodyMarkdown = normalizeAndValidateMarkdown(payload.body_markdown ?? payload.bodyMarkdown ?? previousNote?.body_markdown ?? "");
  const title = normalizeRequiredText(payload.title ?? previousNote?.title, "Note title");
  const links = normalizeLinksInput(payload.links || []);
  const suggestedLibraryBucket = deriveLibrarySuggestion({
    ...payload,
    links,
  }).libraryBucket;
  const libraryBucket = normalizeEnum(
    payload.libraryBucket || payload.library_bucket || previousNote?.library_bucket || suggestedLibraryBucket,
    LIBRARY_BUCKET_VALUES,
    "Library bucket",
  );
  const now = new Date().toISOString();
  const metadata = normalizeMetadata(payload.metadata || payload.metadata_json || previousNote?.metadata || {});

  return {
    ...(previousNote || {}),
    note_id: previousNote?.note_id || payload.note_id || payload.noteId || randomUUID(),
    workspace_id: session.workspace_id,
    title,
    slug: normalizeOptionalText(payload.slug ?? previousNote?.slug) || slugifyNoteTitle(title),
    body_markdown: bodyMarkdown,
    body_excerpt: createMarkdownExcerpt(bodyMarkdown),
    body_plaintext_index: extractPlainTextFromMarkdown(bodyMarkdown),
    note_type: normalizeEnum(payload.noteType || payload.note_type || previousNote?.note_type || NOTE_TYPES.GENERAL, NOTE_TYPE_VALUES, "Note type"),
    library_bucket: libraryBucket,
    library_bucket_source: normalizeEnum(
      payload.libraryBucket || payload.library_bucket ? NOTE_LIBRARY_BUCKET_SOURCES.MANUAL : previousNote?.library_bucket_source || NOTE_LIBRARY_BUCKET_SOURCES.DERIVED,
      LIBRARY_BUCKET_SOURCE_VALUES,
      "Library bucket source",
    ),
    status: normalizeEnum(payload.status || previousNote?.status || NOTE_STATUSES.ACTIVE, NOTE_STATUS_VALUES, "Note status"),
    visibility: normalizeEnum(payload.visibility || previousNote?.visibility || NOTE_VISIBILITIES.INTERNAL, NOTE_VISIBILITY_VALUES, "Note visibility"),
    security_mode: normalizeEnum(payload.securityMode || payload.security_mode || previousNote?.security_mode || NOTE_SECURITY_MODES.NORMAL, NOTE_SECURITY_MODE_VALUES, "Note security mode"),
    client_id: normalizeOptionalText(payload.clientId ?? payload.client_id ?? previousNote?.client_id),
    project_id: normalizeOptionalText(payload.projectId ?? payload.project_id ?? previousNote?.project_id),
    task_id: normalizeOptionalText(payload.taskId ?? payload.task_id ?? previousNote?.task_id),
    ticket_id: normalizeOptionalText(payload.ticketId ?? payload.ticket_id ?? previousNote?.ticket_id),
    linked_user_id: normalizeOptionalText(payload.linkedUserId ?? payload.linked_user_id ?? previousNote?.linked_user_id),
    note_collection_id: normalizeOptionalText(payload.noteCollectionId ?? payload.note_collection_id ?? payload.collectionId ?? payload.collection_id ?? previousNote?.note_collection_id) || null,
    owner_user_id: normalizeOptionalText(payload.ownerUserId ?? payload.owner_user_id ?? previousNote?.owner_user_id) || session.user_id,
    created_by_user_id: previousNote?.created_by_user_id || session.user_id,
    updated_by_user_id: session.user_id,
    created_at: previousNote?.created_at || now,
    updated_at: now,
    archived_at: payload.archived_at ?? previousNote?.archived_at ?? null,
    deleted_at: payload.deleted_at ?? previousNote?.deleted_at ?? null,
    metadata_json: JSON.stringify(metadata),
    ...normalizeImportMetadata(payload, previousNote),
  };
}

async function createLinksFromPayload(session, noteId, payload = {}) {
  const links = normalizeLinksInput(payload.links || []);

  for (const link of links) {
    await createLink(noteId, link, session);
  }
}

async function saveTargetTags(session, noteId, payload = {}) {
  if (!Object.hasOwn(payload || {}, "tagIds") && !Object.hasOwn(payload || {}, "tag_ids")) {
    return;
  }

  await tagsService.replaceAssignments(session, {
    targetId: noteId,
    targetType: "note",
    tagIds: payload.tagIds || payload.tag_ids || [],
  });
}

async function decorateAndFilterNotesByTags(session, notes, filters = {}) {
  const taggedNotes = await tagsService.decorateRecordsWithEffectiveTags(session, "note", notes, { idField: "note_id" });

  return tagsService.filterRecordsByTags(session, "note", taggedNotes, filters.tagIds, {
    idField: "note_id",
    match: filters.tagMatch || "any",
  });
}

async function filterAccessibleNotes(session, notes) {
  const permissionSet = await readNotePermissionSet(session);
  const moduleState = await readNotesModuleState(session);
  const links = await notesRepository.listLinksForNotes(session.workspace_id, notes.map((note) => note.note_id));
  const linksByNoteId = groupLinksByNoteId(links);
  const readable = [];

  for (const note of notes) {
    const linkedRecordAccess = await canAccessLinkedContext(session, note, linksByNoteId.get(note.note_id) || []);
    const access = canAccessNote({
      note,
      operation: "read",
      session,
      permissions: permissionSet,
      linkedRecordAccess,
      notesModuleEnabled: moduleState.enabled,
      historicalReadAccess: moduleState.historicalReadAccess,
    });

    if (access.allowed) {
      readable.push({ ...note, links: linksByNoteId.get(note.note_id) || [] });
    }
  }

  return readable;
}

async function assertCanAccess(session, note, operation) {
  const links = note?.links || await notesRepository.listLinks(session.workspace_id, note.note_id);
  const linkedRecordAccess = await canAccessLinkedContext(session, note, links);
  const access = canAccessNote({
    note,
    operation,
    session,
    permissions: await readNotePermissionSet(session),
    linkedRecordAccess,
    ...(await readNotesModuleState(session)),
  });

  if (!access.allowed) {
    throw new AppError(noteAccessMessage(access.reason), 403);
  }
}

async function canAccessLinkedContext(session, note, links = []) {
  const targets = [
    ...noteContextTargets(note),
    ...links.map((link) => ({
      module_id: link.module_id,
      target_type: link.target_type,
      target_id: link.target_id,
    })),
  ].filter((target) => target.target_id || target.target_type === "workspace");

  for (const target of targets) {
    if (!(await canTargetAccess(session, target))) {
      return false;
    }
  }

  return true;
}

async function assertLinkedContextAccess(session, note) {
  for (const target of noteContextTargets(note)) {
    await assertTargetAccess(session, target);
  }
}

async function assertTargetAccess(session, target) {
  if (!(await canTargetAccess(session, target))) {
    throw new AppError("You do not have access to the linked note target.", 403);
  }
}

async function canTargetAccess(session, target) {
  const normalizedTarget = normalizeTarget(target);

  if (normalizedTarget.target_type === "workspace") {
    return normalizedTarget.target_id === session.workspace_id;
  }

  if (normalizedTarget.target_type === "client") {
    const client = await clientsRepository.readById(session.workspace_id, normalizedTarget.target_id);
    return Boolean(client) && permissionsService.can(session, "clients.manage", {
      workspace_id: session.workspace_id,
      client_id: client.id,
      operation: "read",
    });
  }

  if (normalizedTarget.target_type === "project") {
    const project = await projectsRepository.readById(session.workspace_id, normalizedTarget.target_id);
    return Boolean(project) && permissionsService.can(session, "projects.manage", {
      workspace_id: session.workspace_id,
      client_id: project.client_id,
      project_id: project.id,
      operation: "read",
    });
  }

  if (normalizedTarget.target_type === "task") {
    const task = await tasksRepository.readById(session.workspace_id, normalizedTarget.target_id);
    return Boolean(task) && permissionsService.can(session, "tasks.view", {
      workspace_id: session.workspace_id,
      client_id: task.client_id,
      project_id: task.project_id,
      task_id: task.task_id,
      operation: "read",
    });
  }

  if (normalizedTarget.target_type === "user") {
    return normalizedTarget.target_id === session.user_id ||
      permissionsService.can(session, "users.manage", {
        workspace_id: session.workspace_id,
        user_id: normalizedTarget.target_id,
        operation: "read",
      });
  }

  return false;
}

function noteContextTargets(note = {}) {
  return [
    note.client_id ? { module_id: "client-projects", target_type: "client", target_id: note.client_id } : null,
    note.project_id ? { module_id: "client-projects", target_type: "project", target_id: note.project_id } : null,
    note.task_id ? { module_id: "tasks", target_type: "task", target_id: note.task_id } : null,
    note.linked_user_id ? { module_id: "users", target_type: "user", target_id: note.linked_user_id } : null,
  ].filter(Boolean);
}

function normalizeTargetFromQuery(query = {}) {
  return normalizeTarget({
    module_id: query.moduleId || query.module_id,
    target_type: query.targetType || query.target_type,
    target_id: query.targetId || query.target_id,
  });
}

function normalizeLinkPayload(payload = {}, noteId, session) {
  const target = normalizeTarget(payload);

  return {
    note_link_id: payload.noteLinkId || payload.note_link_id || randomUUID(),
    workspace_id: session.workspace_id,
    note_id: noteId,
    module_id: target.module_id,
    target_type: target.target_type,
    target_id: target.target_id,
    link_role: normalizeOptionalText(payload.linkRole || payload.link_role) || "related",
    scope_role: normalizeScopeRole(payload.scopeRole || payload.scope_role),
    created_by_user_id: session.user_id,
    metadata_json: JSON.stringify(normalizeMetadata(payload.metadata || payload.metadata_json || {})),
  };
}

function normalizeTarget(payload = {}) {
  const targetType = normalizeOptionalText(payload.targetType || payload.target_type);
  const targetId = normalizeOptionalText(payload.targetId || payload.target_id);
  const moduleId = normalizeOptionalText(payload.moduleId || payload.module_id) || defaultModuleForTargetType(targetType);

  if (!LINK_TARGET_TYPES.has(targetType)) {
    throw new AppError("Unsupported note link target type.", 400);
  }

  if (!targetId) {
    throw new AppError("Note link target ID is required.", 400);
  }

  return {
    module_id: moduleId,
    target_type: targetType,
    target_id: targetType === "workspace" && targetId === "current" ? payload.workspace_id || targetId : targetId,
  };
}

function defaultModuleForTargetType(targetType) {
  return {
    workspace: "framework",
    client: "client-projects",
    project: "client-projects",
    task: "tasks",
    user: "users",
  }[targetType] || "";
}

function normalizeLinksInput(links) {
  return (Array.isArray(links) ? links : [])
    .map((link) => ({
      ...link,
      target_type: link.targetType || link.target_type,
      target_id: link.targetId || link.target_id,
      module_id: link.moduleId || link.module_id,
    }))
    .filter((link) => link.target_type && link.target_id);
}

async function maybeCreateRevision(session, previousNote, nextNote, changeSummary) {
  if (!previousNote || !shouldCreateRevision(previousNote, nextNote)) {
    return null;
  }

  const revisionNumber = await notesRepository.nextRevisionNumber(session.workspace_id, nextNote.note_id);
  const revision = await notesRepository.createRevision(session.workspace_id, {
    ...createRevisionSnapshot(previousNote, {
      revisionNumber,
      changedByUserId: session.user_id,
      changeSummary,
    }),
    ...copyImportMetadata(previousNote),
  });

  await emitNoteEvent("note.revision_created", session, previousNote, nextNote, {
    revision_id: revision.note_revision_id,
    revision_number: revision.revision_number,
  });

  return revision;
}

function visibleRevisionSnapshots(revisions = [], note = {}) {
  const visible = revisions.filter((revision, index) => shouldShowRevisionSnapshot(revision, revisions, index, note));

  if (visible.length === 1 && Number(visible[0].revision_number) === 1) {
    return [];
  }

  return visible;
}

function shouldShowRevisionSnapshot(revision, revisions, index, note) {
  const isLatestStoredRevision = index === 0;
  if (!isLatestStoredRevision || !["Note updated.", "Note restored.", "Note archived.", "Note deleted."].includes(revision.change_summary)) {
    return true;
  }

  return !revisionMatchesCurrentNote(revision, note);
}

function revisionMatchesCurrentNote(revision, note) {
  return [
    "title",
    "body_markdown",
    "body_excerpt",
    "note_type",
    "library_bucket",
    "status",
    "visibility",
    "security_mode",
  ].every((fieldName) => String(revision[fieldName] ?? "") === String(note[fieldName] ?? ""));
}

async function attachNoteIntegrations(session, note) {
  const [taggedNote] = await tagsService.decorateRecordsWithEffectiveTags(session, "note", [note], { idField: "note_id" });

  return {
    ...note,
    ...taggedNote,
    body_html: renderNoteBodyHtml(note),
    links: await notesRepository.listLinks(session.workspace_id, note.note_id),
  };
}

async function readNoteOrThrow(session, noteId) {
  const note = await notesRepository.readById(session.workspace_id, noteId);

  if (!note) {
    throw new AppError("Note not found.", 404);
  }

  return note;
}

async function readNotePermissionSet(session) {
  const entries = await Promise.all(NOTE_PERMISSION_VALUES.map(async (permissionId) => [
    permissionId,
    await permissionsService.can(session, permissionId, {
      workspace_id: session.workspace_id,
      operation: "read",
    }),
  ]));

  return new Set(entries.filter(([, allowed]) => allowed).map(([permissionId]) => permissionId));
}

async function readNotesModuleState(session) {
  const moduleDefinition = modulesService.getModule(NOTES_MODULE_ID);

  return {
    notesModuleEnabled: await modulesService.canWriteModule(session.workspace_id, NOTES_MODULE_ID),
    enabled: await modulesService.canWriteModule(session.workspace_id, NOTES_MODULE_ID),
    historicalReadAccess: moduleDefinition?.historicalReadAccess !== false,
  };
}

async function assertNotesWriteEnabled(session) {
  if (await modulesService.canWriteModule(session.workspace_id, NOTES_MODULE_ID)) {
    return;
  }

  throw new AppError("This module is disabled for this workspace.", 403);
}

function normalizeListFilters(query = {}) {
  return {
    libraryBucket: normalizeOptionalEnum(query.libraryBucket || query.library_bucket, LIBRARY_BUCKET_VALUES, "Library bucket"),
    status: normalizeOptionalEnum(query.status, NOTE_STATUS_VALUES, "Note status"),
    includeDeleted: query.includeDeleted === "true" || query.include_deleted === "true",
    clientId: normalizeOptionalText(query.clientId || query.client_id),
    projectId: normalizeOptionalText(query.projectId || query.project_id),
    taskId: normalizeOptionalText(query.taskId || query.task_id),
    ticketId: normalizeOptionalText(query.ticketId || query.ticket_id),
    linkedUserId: normalizeOptionalText(query.userId || query.user_id || query.linkedUserId || query.linked_user_id),
    ownerUserId: normalizeOptionalText(query.ownerUserId || query.owner_user_id),
    tagIds: normalizeIdList(query.tagIds || query.tag_ids || query.tagId || query.tag_id),
    tagMatch: normalizeOptionalText(query.tagMatch || query.tag_match) === "all" ? "all" : "any",
  };
}

function normalizeIdList(value) {
  if (Array.isArray(value)) {
    return value.map(normalizeOptionalText).filter(Boolean);
  }

  return normalizeOptionalText(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeAndValidateMarkdown(value) {
  try {
    return assertSafeMarkdown(value);
  } catch (error) {
    throw new AppError(error.message || "Note Markdown is unsafe.", 400);
  }
}

function normalizeRequiredText(value, label) {
  const text = normalizeOptionalText(value);

  if (!text) {
    throw new AppError(`${label} is required.`, 400);
  }

  return text;
}

function normalizeOptionalText(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}

function normalizeOptionalEnum(value, allowedValues, label) {
  const text = normalizeOptionalText(value);

  if (!text) {
    return "";
  }

  return normalizeEnum(text, allowedValues, label);
}

function normalizeEnum(value, allowedValues, label) {
  const text = normalizeOptionalText(value);

  if (!allowedValues.has(text)) {
    throw new AppError(`${label} '${text || "<empty>"}' is not supported.`, 400);
  }

  return text;
}

function normalizeScopeRole(value) {
  const text = normalizeOptionalText(value) || "related";

  if (!["primary", "context", "related"].includes(text)) {
    throw new AppError("Note link scope role is not supported.", 400);
  }

  return text;
}

function normalizeMetadata(value) {
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return {};
    }
  }

  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function normalizeImportMetadata(payload = {}, previousNote = null) {
  return Object.fromEntries(NOTE_IMPORT_METADATA_FIELDS.map((fieldName) => [
    fieldName,
    normalizeOptionalText(payload[fieldName] ?? previousNote?.[fieldName]) || null,
  ]));
}

function copyImportMetadata(note = {}) {
  return Object.fromEntries(NOTE_IMPORT_METADATA_FIELDS.map((fieldName) => [fieldName, note[fieldName] || null]));
}

async function assertCollectionsWriteEnabled(session) {
  await assertNotesWriteEnabled(session);
  await permissionsService.assertCanInAnyScope(session, NOTE_PERMISSIONS.MANAGE_LIBRARY, {
    workspace_id: session.workspace_id,
    operation: "manage_library",
  });
}

async function readCollectionOrThrow(session, collectionId, options = {}) {
  const normalizedId = normalizeRequiredText(collectionId, "Collection ID");
  const collection = await notesRepository.readCollectionById(session.workspace_id, normalizedId);

  if (!collection || (!options.includeDeleted && collection.status === "deleted")) {
    throw new AppError("Note collection not found.", 404);
  }

  if (!options.includeArchived && collection.status === "archived") {
    throw new AppError("Note collection is archived.", 400);
  }

  return collection;
}

async function normalizeCollectionPayload(payload = {}, session, previous = null) {
  const now = new Date().toISOString();
  const title = normalizeRequiredText(payload.title ?? payload.name ?? previous?.title, "Collection name");
  const libraryBucket = normalizeEnum(
    payload.libraryBucket || payload.library_bucket || previous?.library_bucket || NOTE_LIBRARY_BUCKETS.REFERENCE,
    LIBRARY_BUCKET_VALUES,
    "Library bucket",
  );
  const parentSpecified = Object.hasOwn(payload, "parentCollectionId") ||
    Object.hasOwn(payload, "parent_collection_id");
  const parentCollectionId = parentSpecified
    ? normalizeOptionalText(payload.parentCollectionId ?? payload.parent_collection_id)
    : previous?.parent_collection_id || "";

  if (previous && libraryBucket !== previous.library_bucket) {
    throw new AppError("Collection Library bucket cannot be changed by move or rename.", 400);
  }
  if (previous && parentCollectionId === previous.note_library_collection_id) {
    throw new AppError("A collection cannot be its own parent.", 400);
  }

  const allCollections = await notesRepository.listCollections(session.workspace_id, {
    includeArchived: true,
    includeDeleted: true,
    libraryBucket,
  });
  const parent = parentCollectionId
    ? allCollections.find((collection) => collection.note_library_collection_id === parentCollectionId)
    : null;

  if (parentCollectionId && (!parent || parent.status === "deleted")) {
    throw new AppError("Parent collection not found.", 404);
  }
  if (parent && parent.library_bucket !== libraryBucket) {
    throw new AppError("Collection parent must be in the same Library bucket.", 400);
  }
  if (previous && parent && collectionDescendants(previous, allCollections)
    .some((collection) => collection.note_library_collection_id === parent.note_library_collection_id)) {
    throw new AppError("Collection moves cannot create a cycle.", 400);
  }

  const metadata = normalizeMetadata(payload.metadata || payload.metadata_json || previous?.metadata || {});
  return {
    ...(previous || {}),
    note_library_collection_id: previous?.note_library_collection_id || payload.noteLibraryCollectionId || payload.note_library_collection_id || randomUUID(),
    workspace_id: session.workspace_id,
    title,
    slug: normalizeOptionalText(payload.slug) || (previous && title === previous.title ? previous.slug : slugifyNoteTitle(title)),
    description: normalizeOptionalText(payload.description ?? previous?.description),
    library_bucket: libraryBucket,
    parent_collection_id: parent?.note_library_collection_id || null,
    path_cache: collectionPath({ title }, parent),
    depth: parent ? Number(parent.depth || 0) + 1 : 0,
    sort_order: Number(payload.sortOrder ?? payload.sort_order ?? previous?.sort_order ?? 0) || 0,
    collection_source: normalizeEnum(
      payload.collectionSource || payload.collection_source || previous?.collection_source || "manual",
      COLLECTION_SOURCE_VALUES,
      "Collection source",
    ),
    status: previous?.status || "active",
    created_by_user_id: previous?.created_by_user_id || session.user_id,
    updated_by_user_id: session.user_id,
    created_at: previous?.created_at || now,
    updated_at: now,
    archived_at: previous?.archived_at || null,
    deleted_at: previous?.deleted_at || null,
    metadata_json: JSON.stringify(metadata),
  };
}

async function assertCollectionSiblingAvailable(workspaceId, collection, currentCollectionId = "") {
  const siblings = await notesRepository.listCollections(workspaceId, {
    includeArchived: true,
    includeDeleted: false,
    libraryBucket: collection.library_bucket,
  });
  const conflict = siblings.find((sibling) => (
    sibling.note_library_collection_id !== currentCollectionId &&
    sibling.slug === collection.slug &&
    (sibling.parent_collection_id || "") === (collection.parent_collection_id || "")
  ));

  if (conflict) {
    throw new AppError("A collection with that name already exists in this folder.", 400);
  }
}

async function updateCollectionDescendantPaths(session, parent) {
  const allCollections = await notesRepository.listCollections(session.workspace_id, {
    includeArchived: true,
    includeDeleted: true,
    libraryBucket: parent.library_bucket,
  });
  const descendants = collectionDescendants(parent, allCollections);
  const byParentId = groupCollectionsByParent(allCollections);

  async function updateChildren(collection) {
    for (const child of byParentId.get(collection.note_library_collection_id) || []) {
      if (child.status === "deleted") {
        continue;
      }

      const updated = await notesRepository.updateCollection(session.workspace_id, {
        ...child,
        path_cache: collectionPath(child, collection),
        depth: Number(collection.depth || 0) + 1,
        updated_at: new Date().toISOString(),
        updated_by_user_id: session.user_id,
      });
      await syncCollectionNotesSearchIndex(session, [updated.note_library_collection_id], "note.collection.path_updated");
      await updateChildren(updated);
    }
  }

  if (descendants.length > 0) {
    await updateChildren(parent);
  }
}

async function assertNoteCollectionAccess(session, note) {
  const collectionId = normalizeOptionalText(note.note_collection_id);
  if (!collectionId) {
    return;
  }

  const collection = await notesRepository.readCollectionById(session.workspace_id, collectionId);
  if (!collection || collection.status === "deleted") {
    throw new AppError("Note collection not found.", 404);
  }
  if (collection.library_bucket !== note.library_bucket) {
    throw new AppError("Note collection must be in the same Library bucket as the note.", 400);
  }
}

function buildCollectionTree(collections, accessibleCountByCollectionId, directCountByCollectionId = new Map()) {
  const byParentId = groupCollectionsByParent(collections);

  function decorate(collection) {
    return {
      ...collection,
      accessibleNoteCount: accessibleCountByCollectionId.get(collection.note_library_collection_id) || 0,
      directAccessibleNoteCount: directCountByCollectionId.get(collection.note_library_collection_id) || 0,
      children: (byParentId.get(collection.note_library_collection_id) || []).map(decorate),
    };
  }

  return (byParentId.get("") || []).map(decorate);
}

function rollupCollectionCounts(collections = [], directCounts = new Map()) {
  const byParentId = groupCollectionsByParent(collections);
  const rolledUpCounts = new Map();

  function countSubtree(collection) {
    const collectionId = collection.note_library_collection_id;
    const childTotal = (byParentId.get(collectionId) || []).reduce((total, child) => total + countSubtree(child), 0);
    const total = (directCounts.get(collectionId) || 0) + childTotal;
    rolledUpCounts.set(collectionId, total);
    return total;
  }

  for (const collection of byParentId.get("") || []) {
    countSubtree(collection);
  }

  return rolledUpCounts;
}

function groupCollectionsByParent(collections = []) {
  return collections.reduce((groups, collection) => {
    const parentId = collection.parent_collection_id || "";
    if (!groups.has(parentId)) {
      groups.set(parentId, []);
    }
    groups.get(parentId).push(collection);
    return groups;
  }, new Map());
}

function collectionDescendants(collection, collections = []) {
  const byParentId = groupCollectionsByParent(collections);
  const descendants = [];
  const stack = [...(byParentId.get(collection.note_library_collection_id) || [])];

  while (stack.length > 0) {
    const next = stack.shift();
    descendants.push(next);
    stack.push(...(byParentId.get(next.note_library_collection_id) || []));
  }

  return descendants;
}

function collectionPath(collection, parent = null) {
  return [parent?.path_cache, collection.title].filter(Boolean).join(" / ");
}

function normalizeCollectionListFilters(query = {}) {
  return {
    includeArchived: query.includeArchived === "true" || query.include_archived === "true",
    includeDeleted: query.includeDeleted === "true" || query.include_deleted === "true",
    libraryBucket: normalizeOptionalEnum(query.libraryBucket || query.library_bucket, LIBRARY_BUCKET_VALUES, "Library bucket"),
  };
}

function normalizeImportCollectionPathParts(payload = {}) {
  const explicitPath = payload.path || payload.importPath || payload.import_path || payload.importSourcePath || payload.import_source_path;
  const parts = Array.isArray(payload.parts)
    ? payload.parts
    : [
      payload.originalNotebook || payload.original_notebook,
      payload.originalSectionGroup || payload.original_section_group,
      payload.originalSection || payload.original_section,
    ];
  const normalized = (explicitPath
    ? String(explicitPath).split(/[\\/]+|>/)
    : parts)
    .map(normalizeOptionalText)
    .filter(Boolean);

  if (normalized.length === 0) {
    throw new AppError("Import collection path is required.", 400);
  }

  return normalized;
}

function createSearchIndexPayload(note = {}) {
  if (
    note.security_mode === NOTE_SECURITY_MODES.SECURE ||
    note.visibility === NOTE_VISIBILITIES.PRIVATE ||
    note.status === NOTE_STATUSES.DELETED ||
    note.deleted_at
  ) {
    return null;
  }

  return {
    moduleId: NOTES_MODULE_ID,
    recordType: "note",
    recordId: note.note_id,
    workspaceId: note.workspace_id,
    title: note.title,
    summary: note.body_excerpt || "",
    body: note.body_plaintext_index || extractPlainTextFromMarkdown(note.body_markdown || ""),
    sourceLabel: "Notes",
    libraryBucket: note.library_bucket,
    noteCollectionId: note.note_collection_id,
    visibility: note.visibility,
    recordStatus: note.status === NOTE_STATUSES.ARCHIVED || note.archived_at ? "archived" : "active",
    url: `notes.html?note=${encodeURIComponent(note.note_id || "")}`,
    metadata: {
      library_bucket: note.library_bucket,
      status: note.status,
      visibility: note.visibility,
      client_id: note.client_id || "",
      project_id: note.project_id || "",
      task_id: note.task_id || "",
      ticket_id: note.ticket_id || "",
      linked_user_id: note.linked_user_id || "",
      note_collection_id: note.note_collection_id || "",
    },
  };
}

async function syncNoteSearchIndex(workspaceId, noteId, reason) {
  await searchIndexSyncService.reindexRecord({
    workspaceId,
    moduleId: NOTES_MODULE_ID,
    recordType: "note",
    recordId: noteId,
    reason,
  });
}

async function syncCollectionNotesSearchIndex(session, collectionIds, reason) {
  const ids = [...new Set((collectionIds || []).filter(Boolean))];

  for (const collectionId of ids) {
    const notes = await notesRepository.list(session.workspace_id, {
      includeDeleted: false,
      noteCollectionId: collectionId,
    });
    await searchIndexSyncService.reindexRecords(notes.map((note) => ({
      workspaceId: session.workspace_id,
      moduleId: NOTES_MODULE_ID,
      recordType: "note",
      recordId: note.note_id,
      reason,
    })));
  }
}

async function recordNoteAudit(session, action, changeType, previousValue, newValue, recordType = "note") {
  await auditService.record({
    session,
    action,
    changeType,
    recordType,
    recordId: newValue?.note_link_id || newValue?.note_revision_id || newValue?.note_id || previousValue?.note_id,
    recordLabel: newValue?.title || previousValue?.title || newValue?.target_id || "Note",
    recordUrl: `notes.html?note=${encodeURIComponent(newValue?.note_id || previousValue?.note_id || "")}`,
    previousValue: safeAuditValue(previousValue),
    newValue: safeAuditValue(newValue),
    metadata: sanitizeNoteLifecyclePayload({
      workspace_id: session.workspace_id,
      actor_user_id: session.user_id,
      note_id: newValue?.note_id || previousValue?.note_id,
      title: newValue?.title || previousValue?.title,
      body_excerpt: newValue?.body_excerpt || previousValue?.body_excerpt,
      library_bucket: newValue?.library_bucket || previousValue?.library_bucket,
      visibility: newValue?.visibility || previousValue?.visibility,
      security_mode: newValue?.security_mode || previousValue?.security_mode,
      client_id: newValue?.client_id || previousValue?.client_id,
      project_id: newValue?.project_id || previousValue?.project_id,
      task_id: newValue?.task_id || previousValue?.task_id,
      ticket_id: newValue?.ticket_id || previousValue?.ticket_id,
    }),
  });
}

async function emitNoteEvent(eventName, session, previousValue, newValue, metadata = {}) {
  const note = newValue || previousValue || {};
  const recipientUserIds = noteOwnerNotificationRecipients(eventName, session, note);
  await modulesService.emitInternalEvent(eventName, {
    session,
    moduleId: NOTES_MODULE_ID,
    recordType: metadata.link ? "note_link" : "note",
    recordId: note.note_id,
    previousValue: safeAuditValue(previousValue),
    newValue: safeAuditValue(newValue),
    source: session?.api_key_id ? "public_api" : "manual",
    metadata: {
      ...sanitizeNoteLifecyclePayload({
        workspace_id: session.workspace_id,
        actor_user_id: session.user_id,
        note_id: note.note_id,
        title: note.title,
        body_excerpt: note.body_excerpt,
        library_bucket: note.library_bucket,
        visibility: note.visibility,
        security_mode: note.security_mode,
        client_id: note.client_id,
        project_id: note.project_id,
        task_id: note.task_id,
        ticket_id: note.ticket_id,
      }),
      ...(recipientUserIds.length > 0 ? { recipient_user_ids: recipientUserIds } : {}),
      ...metadata,
    },
  });
}

function noteOwnerNotificationRecipients(eventName, session, note = {}) {
  if (eventName !== "note.updated") {
    return [];
  }

  const ownerUserId = normalizeOptionalText(note.owner_user_id);
  const actorUserId = normalizeOptionalText(session?.user_id);
  if (!ownerUserId || ownerUserId === actorUserId || note.security_mode === NOTE_SECURITY_MODES.SECURE) {
    return [];
  }

  return [ownerUserId];
}

async function emitChangeEvents(session, previousNote, nextNote) {
  const changes = describeRevisionChanges(previousNote, nextNote);
  const changedFields = new Set(changes.map((change) => change.field));

  if (changedFields.has("library_bucket")) {
    await emitNoteEvent("note.library_changed", session, previousNote, nextNote);
  }

  if (changedFields.has("visibility")) {
    await emitNoteEvent("note.visibility_changed", session, previousNote, nextNote);
  }

  if (changedFields.has("security_mode")) {
    await emitNoteEvent("note.security_mode_changed", session, previousNote, nextNote);
  }
}

function safeAuditValue(value) {
  if (!value) {
    return value;
  }

  const safeValue = { ...value };
  if (safeValue.security_mode === NOTE_SECURITY_MODES.SECURE) {
    delete safeValue.body_markdown;
    delete safeValue.body_plaintext_index;
  }
  delete safeValue.metadata_json;
  return safeValue;
}

function renderNoteBodyHtml(note = {}) {
  if (note.security_mode === NOTE_SECURITY_MODES.SECURE) {
    return "";
  }

  try {
    return renderMarkdownToSafeHtml(note.body_markdown || "");
  } catch {
    return "";
  }
}

function groupLinksByNoteId(links = []) {
  return links.reduce((groups, link) => {
    if (!groups.has(link.note_id)) {
      groups.set(link.note_id, []);
    }

    groups.get(link.note_id).push(link);
    return groups;
  }, new Map());
}

function noteAccessMessage(reason) {
  return {
    archived_read_only: "Archived notes are read-only until restored.",
    client_visible_requires_permission: "Client-visible notes require explicit permission.",
    deleted_note: "Deleted notes are not available.",
    linked_record_hidden: "You do not have access to the linked note context.",
    missing_permission: "You do not have permission to access notes.",
    module_disabled: "This module is disabled for this workspace.",
    private_note: "You do not have access to this private note.",
    secure_note_permission: "You do not have secure-note access.",
    secure_note_update_permission: "You do not have secure-note update access.",
    workspace_mismatch: "Note workspace does not match the active workspace.",
  }[reason] || "You do not have access to this note.";
}

export const notesService = {
  archive,
  archiveCollection,
  assignNoteCollection,
  changeLibrary,
  create,
  createCollection,
  createLink,
  createSearchIndexPayload,
  deleteEmptyCollection,
  deriveLibrarySuggestion,
  ensureCollectionsForImportPath,
  list,
  listArchived,
  listByLibraryBucket,
  listCollections,
  listForTarget,
  listLibrary,
  listLinks,
  listRevisions,
  moveCollection,
  read,
  readForAttachmentAccess,
  readRevision,
  removeLink,
  restore,
  restoreCollection,
  restoreRevision,
  softDelete,
  updateCollection,
  update,
};
