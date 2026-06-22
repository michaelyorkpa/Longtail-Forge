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
  LEGACY_NOTE_TYPES,
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
import {
  assertEncryptedPayloadPresent,
  assertSecureNotesConfigured,
  decryptSecureNoteBody,
  describeSecureNotesConfiguration,
  encryptSecureNoteBody,
  hasEncryptedSecurePayload,
  safeSecurePlaceholders,
} from "./secure-crypto.js";
import { clientsRepository } from "../client-projects/clients.repo.js";
import { clientsService } from "../client-projects/clients.service.js";
import { projectsRepository } from "../client-projects/projects.repo.js";
import { LIST_PERMISSIONS, listResource } from "../lists/access-policy.js";
import { listsRepository } from "../lists/lists.repo.js";
import { tasksRepository } from "../tasks/tasks.repo.js";
import { modulesService } from "../../core/modules/modules.service.js";
import { auditService } from "../../core/audit.js";
import { permissionsService } from "../../core/permissions.js";
import { AppError } from "../../core/errors.js";
import { tagsService } from "../../services/tags.service.js";
import { searchIndexSyncService } from "../../services/search-index-sync.service.js";
import { usersRepository } from "../../repositories/users.repo.js";
import { workspacesRepository } from "../../repositories/workspaces.repo.js";
import { normalizeWorkspaceType } from "../../utils/workspaces.js";

const NOTES_MODULE_ID = "notes";
const LINK_TARGET_TYPES = new Set(["workspace", "client", "project", "task", "note", "list", "user"]);
const NOTE_TYPE_VALUES = new Set([...Object.values(NOTE_TYPES), ...Object.values(LEGACY_NOTE_TYPES)]);
const LIBRARY_BUCKET_VALUES = new Set(Object.values(NOTE_LIBRARY_BUCKETS));
const LIBRARY_BUCKET_SOURCE_VALUES = new Set(Object.values(NOTE_LIBRARY_BUCKET_SOURCES));
const NOTE_STATUS_VALUES = new Set(Object.values(NOTE_STATUSES));
const NOTE_VISIBILITY_VALUES = new Set(Object.values(NOTE_VISIBILITIES));
const NOTE_SECURITY_MODE_VALUES = new Set(Object.values(NOTE_SECURITY_MODES));
const NOTE_PERMISSION_VALUES = Object.values(NOTE_PERMISSIONS);
const COLLECTION_SOURCE_VALUES = new Set(["manual", "imported"]);
const LINKED_NOTE_SORT_MODES = new Set(["pinned", "recent", "updated", "title"]);
const SECURE_NOTE_TITLE_WARNING = "Secure note titles are visible to users who can view note metadata. Do not put secrets in the title.";
const TASK_TARGET_TITLE_MAX_LENGTH = 20;
const SECURE_STORAGE_FIELDS = Object.freeze([
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
]);

async function list(session, query = {}) {
  const filters = normalizeListFilters(query);
  const notes = await notesRepository.list(session.workspace_id, filters);
  const decorated = await decorateAndFilterNotesByTags(session, await filterAccessibleNotes(session, notes), filters);
  return { notes: decorated.map((note) => shapeNoteForBrowser(note, { includeBodyHtml: true })) };
}

async function secureHealth(session) {
  await permissionsService.assertCanInAnyScope(session, NOTE_PERMISSIONS.SECURE_MANAGE);
  const configuration = describeSecureNotesConfiguration();
  return {
    secureNotes: {
      configured: configuration.configured,
      keyVersion: configuration.keyVersion,
      payloadVersion: configuration.payloadVersion,
      encryptionAlgorithm: configuration.bodyAlgorithm,
      keyWrappingAlgorithm: configuration.keyWrappingAlgorithm,
      status: configuration.configured ? "ready" : "not_configured",
      reason: configuration.configured ? undefined : configuration.reason,
    },
  };
}

async function read(noteId, session) {
  const note = await readNoteOrThrow(session, noteId);
  await assertCanAccess(session, note, "read");

  return { note: shapeNoteForBrowser(await attachNoteIntegrations(session, await decryptSecureNoteForRead(session, note)), { includeBodyHtml: true }) };
}

async function previewMarkdown(payload = {}, session) {
  await assertNotesWriteEnabled(session);
  const canPreview = await permissionsService.canInAnyScope(session, NOTE_PERMISSIONS.CREATE) ||
    await permissionsService.canInAnyScope(session, NOTE_PERMISSIONS.UPDATE);

  if (!canPreview) {
    throw new AppError("You do not have permission to preview note Markdown.", 403);
  }

  const bodyMarkdown = assertSafeMarkdown(payload?.body_markdown ?? payload?.bodyMarkdown ?? "");

  return {
    bodyFormat: "markdown",
    bodyMarkdown,
    bodyHtml: renderMarkdownToSafeHtml(bodyMarkdown),
    bodyHtmlFormat: "html",
  };
}

async function create(payload, session) {
  await assertNotesWriteEnabled(session);
  const normalized = await normalizeNotePayload(payload, session);
  await assertSecureNoteCanBePersisted(session, normalized);
  await assertLinkedContextAccess(session, normalized);
  await assertNoteCollectionAccess(session, normalized);
  await assertCanAccess(session, normalized, "create");

  const note = await notesRepository.create(session.workspace_id, normalized);
  await createLinksFromPayload(session, note.note_id, payload);
  await saveTargetTags(session, note.note_id, payload);
  await requestTagPropagationRefresh(session, "note", note.note_id, "note.created_with_context");
  const noteWithLinks = await attachNoteIntegrations(session, await decryptSecureNoteForRead(session, note));
  await recordNoteAudit(session, "note_created", "create", null, noteWithLinks);
  await emitNoteEvent("note.created", session, null, noteWithLinks);
  await syncNoteSearchIndex(session.workspace_id, note.note_id, "note.created");

  return {
    note: shapeNoteForBrowser(noteWithLinks, { includeBodyHtml: true }),
    searchDocument: createSearchIndexPayload(noteWithLinks),
  };
}

async function update(noteId, payload, session) {
  await assertNotesWriteEnabled(session);
  const previousNote = await readNoteOrThrow(session, noteId);
  await assertCanAccess(session, previousNote, "update");
  const nextNote = await normalizeNotePayload(payload, session, previousNote);
  await assertSecureNoteCanBePersisted(session, nextNote, previousNote);
  await assertLinkedContextAccess(session, nextNote);
  await assertNoteCollectionAccess(session, nextNote);
  await assertCanAccess(session, nextNote, "update");

  const note = await notesRepository.update(session.workspace_id, nextNote);
  await maybeCreateRevision(session, previousNote, note, "Note updated.");
  await saveTargetTags(session, note.note_id, payload);
  if (noteContextChanged(previousNote, note)) {
    await requestTagPropagationRefresh(session, "note", note.note_id, "note.context_changed");
  }
  const noteWithLinks = await attachNoteIntegrations(session, await decryptSecureNoteForRead(session, note));
  await recordNoteAudit(session, "note_updated", "update", previousNote, noteWithLinks);
  await emitNoteEvent("note.updated", session, previousNote, noteWithLinks);
  await emitChangeEvents(session, previousNote, noteWithLinks);
  await syncNoteSearchIndex(session.workspace_id, note.note_id, "note.updated");

  return {
    note: shapeNoteForBrowser(noteWithLinks, { includeBodyHtml: true }),
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
  return { note: shapeNoteForBrowser(note) };
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
  return { note: shapeNoteForBrowser(note) };
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
  return { note: shapeNoteForBrowser(note) };
}

async function listRevisions(noteId, session) {
  const note = await readNoteOrThrow(session, noteId);
  await assertCanAccess(session, note, "view_history");

  const revisions = await notesRepository.listRevisions(session.workspace_id, noteId);
  return { revisions: visibleRevisionSnapshots(revisions, note).map((revision) => shapeRevisionForBrowser(revision, { includeBody: false })) };
}

async function readRevision(noteId, revisionId, session) {
  const note = await readNoteOrThrow(session, noteId);
  await assertCanAccess(session, note, "view_history");
  const revision = await notesRepository.readRevisionById(session.workspace_id, noteId, revisionId);

  if (!revision) {
    throw new AppError("Note revision not found.", 404);
  }

  return { revision: shapeRevisionForBrowser(decryptSecureRevisionForRead(revision), { includeBody: true }) };
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
  const restoredBody = revision.security_mode === NOTE_SECURITY_MODES.SECURE
    ? decryptSecureRevisionForRead(revision).body_markdown
    : revision.body_markdown;
  const securePayload = revision.security_mode === NOTE_SECURITY_MODES.SECURE
    ? encryptSecureNoteBody(restoredBody)
    : clearSecureEncryptionFields();
  const note = await notesRepository.update(session.workspace_id, {
    ...previousNote,
    title: revision.title,
    body_markdown: revision.security_mode === NOTE_SECURITY_MODES.SECURE ? "" : restoredBody,
    body_excerpt: revision.security_mode === NOTE_SECURITY_MODES.SECURE ? null : revision.body_excerpt,
    body_plaintext_index: revision.security_mode === NOTE_SECURITY_MODES.SECURE ? null : extractPlainTextFromMarkdown(restoredBody),
    note_type: revision.note_type,
    library_bucket: revision.library_bucket,
    status: revision.status === NOTE_STATUSES.DELETED ? NOTE_STATUSES.ACTIVE : revision.status,
    visibility: revision.visibility,
    security_mode: revision.security_mode,
    ...securePayload,
    updated_by_user_id: session.user_id,
    updated_at: now,
  });

  await maybeCreateRevision(session, previousNote, note, `Restored revision ${revision.revision_number}.`);
  await recordNoteAudit(session, "note_revision_restored", "update", previousNote, note);
  await emitNoteEvent("note.updated", session, previousNote, note, { restored_revision_id: revisionId });
  await syncNoteSearchIndex(session.workspace_id, note.note_id, "note.revision_restored");
  return {
    note: shapeNoteForBrowser(await attachNoteIntegrations(session, await decryptSecureNoteForRead(session, note)), { includeBodyHtml: true }),
    restoredRevision: shapeRevisionForBrowser(decryptSecureRevisionForRead(revision), { includeBody: false }),
  };
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
  const noteFilters = {
    includeDeleted: false,
    libraryBucket: filters.libraryBucket,
    status: filters.includeArchived ? "" : NOTE_STATUSES.ACTIVE,
  };
  const notes = await notesRepository.list(session.workspace_id, noteFilters);
  const accessibleNotes = await filterAccessibleNotes(session, notes);
  const accessibleCountByCollectionId = new Map();
  let uncategorizedCount = 0;

  for (const note of accessibleNotes) {
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
    collections: sortCollectionsForReadModel(collections).map((collection) => ({
      ...collection,
      accessibleNoteCount: rolledUpCountByCollectionId.get(collection.note_library_collection_id) || 0,
      directAccessibleNoteCount: accessibleCountByCollectionId.get(collection.note_library_collection_id) || 0,
    })),
    tree: buildCollectionTree(sortCollectionsForReadModel(collections), rolledUpCountByCollectionId, accessibleCountByCollectionId),
    defaults: collectionReadModelDefaults(filters),
    uncategorized: {
      count: uncategorizedCount,
      libraryBucket: filters.libraryBucket || "",
      label: "Uncategorized",
      value: "__uncategorized",
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
  await requestTagPropagationRefresh(session, "note", note.note_id, "note.link_created");
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
  await requestTagPropagationRefresh(session, "note", note.note_id, "note.link_removed");
  await recordNoteAudit(session, "note_link_removed", "delete", previousLink, link, "note_link");
  await emitNoteEvent("note.unlinked", session, note, note, { link });
  await syncNoteSearchIndex(session.workspace_id, note.note_id, "note.unlinked");

  return { link };
}

async function listForTarget(session, query = {}) {
  const target = normalizeTargetFromQuery(query, session);
  await assertTargetAccess(session, target);
  const notes = await notesRepository.listForTarget(session.workspace_id, target);
  const filters = normalizeListFilters(query);
  const panelOptions = normalizeLinkedNotePanelOptions(query);
  const decorated = await decorateAndFilterNotesByTags(session, await filterAccessibleNotes(session, notes), filters);
  const sorted = sortLinkedNotePanelNotes(decorated, panelOptions.sort);
  const shapedNotes = sorted.map((note) => shapeNoteForBrowser(note, { includeBodyHtml: true }));
  const linkedNotes = sorted.map((note) => shapeLinkedNotePanelItem(note));
  const moduleState = await readNotesModuleState(session);
  const actions = await linkedNotePanelActions(session, moduleState);

  return {
    target: shapeLinkedNoteTarget(target),
    sort: panelOptions.sort,
    count: linkedNotes.length,
    emptyState: linkedNotes.length > 0 ? null : linkedNotePanelEmptyState(target),
    moduleState,
    actions,
    notes: shapedNotes,
    linkedNotes,
  };
}

async function listResumeContext(session, query = {}) {
  const options = normalizeResumeContextOptions(query);
  const notes = await notesRepository.list(session.workspace_id, {
    libraryBucket: NOTE_LIBRARY_BUCKETS.ACTIVE_WORK,
    status: NOTE_STATUSES.ACTIVE,
  });
  const accessible = await filterAccessibleNotes(session, notes);
  const candidates = accessible
    .filter((note) => isResumeContextEligibleNote(note))
    .sort(compareNotesByUpdatedAt)
    .slice(0, options.limit)
    .map((note) => shapeResumeContextNote(note));

  return {
    moduleId: NOTES_MODULE_ID,
    source: "notes",
    deferredFramework: {
      resumeStateStorage: "0.33.5.9",
      workbenchFeed: "0.33.7",
      ranking: "0.33.5.9",
      dismissal: "0.33.5.9",
    },
    count: candidates.length,
    candidates,
  };
}

async function listLinkTargets(session, query = {}) {
  await permissionsService.assertCanInAnyScope(session, NOTE_PERMISSIONS.VIEW);
  const targetType = normalizeOptionalText(query.targetType || query.target_type || "all") || "all";
  const search = normalizeOptionalText(query.q || query.query || query.search).toLowerCase();
  const limit = Math.min(Math.max(Number.parseInt(query.limit, 10) || 20, 1), 50);
  const targetTypes = targetType === "all" ? ["workspace", "client", "project", "task", "note", "list", "user"] : [targetType];
  const targets = [];

  for (const type of targetTypes) {
    if (!LINK_TARGET_TYPES.has(type)) {
      throw new AppError("Unsupported note link target type.", 400);
    }

    targets.push(...await listTargetsByType(session, type));
  }

  return {
    targets: targets
      .filter((target) => targetMatchesSearch(target, search))
      .sort(compareLinkTargets)
      .slice(0, limit),
  };
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
      links: normalizeLinkPayloads(payload),
      clientIds: payload.clientIds || payload.client_ids || payload.client_id,
      projectIds: payload.projectIds || payload.project_ids || payload.project_id,
      taskIds: payload.taskIds || payload.task_ids || payload.task_id,
      ticketIds: payload.ticketIds || payload.ticket_ids || payload.ticket_id,
    }),
  };
}

async function normalizeNotePayload(payload = {}, session, previousNote = null) {
  const bodyWasProvided = Object.hasOwn(payload || {}, "body_markdown") || Object.hasOwn(payload || {}, "bodyMarkdown");
  const previousBodyMarkdown = previousNote?.security_mode === NOTE_SECURITY_MODES.SECURE && hasEncryptedSecurePayload(previousNote)
    ? decryptSecureNoteBody(previousNote)
    : previousNote?.body_markdown || "";
  const bodyMarkdown = normalizeAndValidateMarkdown(
    bodyWasProvided
      ? payload.body_markdown ?? payload.bodyMarkdown ?? ""
      : previousBodyMarkdown,
  );
  const title = normalizeRequiredText(payload.title ?? previousNote?.title, "Note title");
  const links = normalizeLinkPayloads(payload);
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

  const securityMode = normalizeEnum(payload.securityMode || payload.security_mode || previousNote?.security_mode || NOTE_SECURITY_MODES.NORMAL, NOTE_SECURITY_MODE_VALUES, "Note security mode");
  if (previousNote?.security_mode === NOTE_SECURITY_MODES.SECURE && securityMode !== NOTE_SECURITY_MODES.SECURE) {
    throw new AppError("Secure notes cannot be converted back to normal notes in this release.", 400);
  }
  if (previousNote?.security_mode !== NOTE_SECURITY_MODES.SECURE && previousNote && securityMode === NOTE_SECURITY_MODES.SECURE) {
    throw new AppError("Convert-to-secure is deferred; recreate the note through the secure-note flow.", 400);
  }

  const visibility = normalizeEnum(payload.visibility || previousNote?.visibility || NOTE_VISIBILITIES.INTERNAL, NOTE_VISIBILITY_VALUES, "Note visibility");
  if (securityMode === NOTE_SECURITY_MODES.SECURE && visibility === NOTE_VISIBILITIES.CLIENT_VISIBLE) {
    throw new AppError("Secure notes cannot be client-visible or public in this release.", 400);
  }
  const noteCollectionId = Object.hasOwn(payload, "noteCollectionId")
    ? payload.noteCollectionId
    : Object.hasOwn(payload, "note_collection_id")
      ? payload.note_collection_id
      : Object.hasOwn(payload, "collectionId")
        ? payload.collectionId
        : Object.hasOwn(payload, "collection_id")
          ? payload.collection_id
          : previousNote?.note_collection_id;

  const secureFields = securityMode === NOTE_SECURITY_MODES.SECURE
    ? {
        ...safeSecurePlaceholders(),
        ...(bodyWasProvided || !previousNote ? encryptSecureNoteBody(bodyMarkdown) : copySecureEncryptionFields(previousNote)),
      }
    : {
        body_markdown: bodyMarkdown,
        body_excerpt: createMarkdownExcerpt(bodyMarkdown),
        body_plaintext_index: extractPlainTextFromMarkdown(bodyMarkdown),
        ...clearSecureEncryptionFields(),
      };

  return {
    ...(previousNote || {}),
    note_id: previousNote?.note_id || payload.note_id || payload.noteId || randomUUID(),
    workspace_id: session.workspace_id,
    title,
    slug: normalizeOptionalText(payload.slug ?? previousNote?.slug) || slugifyNoteTitle(title),
    ...secureFields,
    note_type: normalizeEnum(payload.noteType || payload.note_type || previousNote?.note_type || NOTE_TYPES.GENERAL, NOTE_TYPE_VALUES, "Note Kind"),
    library_bucket: libraryBucket,
    library_bucket_source: normalizeEnum(
      payload.libraryBucket || payload.library_bucket ? NOTE_LIBRARY_BUCKET_SOURCES.MANUAL : previousNote?.library_bucket_source || NOTE_LIBRARY_BUCKET_SOURCES.DERIVED,
      LIBRARY_BUCKET_SOURCE_VALUES,
      "Library bucket source",
    ),
    status: normalizeEnum(payload.status || previousNote?.status || NOTE_STATUSES.ACTIVE, NOTE_STATUS_VALUES, "Note status"),
    visibility,
    security_mode: securityMode,
    client_id: normalizeNullablePayloadText(payload, "clientId", "client_id", previousNote?.client_id),
    project_id: normalizeNullablePayloadText(payload, "projectId", "project_id", previousNote?.project_id),
    task_id: null,
    ticket_id: normalizeNullablePayloadText(payload, "ticketId", "ticket_id", previousNote?.ticket_id),
    linked_user_id: normalizeNullablePayloadText(payload, "linkedUserId", "linked_user_id", previousNote?.linked_user_id),
    note_collection_id: normalizeOptionalText(noteCollectionId) || null,
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
  const links = normalizeLinkPayloads(payload);

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

async function requestTagPropagationRefresh(session, targetType, targetId, reason) {
  try {
    await tagsService.refreshPropagatedAssignmentsForTarget(session, {
      reason,
      targetId,
      targetType,
    });
  } catch (error) {
    console.error(`[notes] Tag propagation refresh failed for ${targetType}:${targetId}:`, error);
  }
}

function noteContextChanged(previousNote = {}, nextNote = {}) {
  return [
    "client_id",
    "project_id",
  ].some((fieldName) => String(previousNote[fieldName] || "") !== String(nextNote[fieldName] || ""));
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

  if (
    note.security_mode === NOTE_SECURITY_MODES.SECURE &&
    ["read", "update", "view_history", "restore_revision"].includes(operation) &&
    !hasEncryptedSecurePayload(note)
  ) {
    assertEncryptedPayloadPresent(note);
  }
}

async function assertSecureNoteCanBePersisted(session, note, previousNote = null) {
  if (note.security_mode !== NOTE_SECURITY_MODES.SECURE) {
    return;
  }

  assertSecureNotesConfigured();
  if (!previousNote) {
    const placeholderCount = await notesRepository.countPlaintextSecurePlaceholders(session.workspace_id);
    if (placeholderCount > 0) {
      throw new AppError("Secure notes cannot be activated while plaintext secure-note placeholders exist. Recreate or explicitly migrate them first.", 409);
    }
  }
  if (!hasEncryptedSecurePayload(note)) {
    throw new AppError("Secure note body was not encrypted.", 500);
  }
}

async function decryptSecureNoteForRead(session, note = {}) {
  if (note.security_mode !== NOTE_SECURITY_MODES.SECURE) {
    return note;
  }

  try {
    return {
      ...note,
      body_markdown: decryptSecureNoteBody(note),
      body_excerpt: null,
      body_plaintext_index: null,
      secure_body_decrypted: true,
      secure_title_warning: SECURE_NOTE_TITLE_WARNING,
    };
  } catch (error) {
    await recordSecureDecryptFailure(session, note, error);
    throw error;
  }
}

function decryptSecureRevisionForRead(revision = {}) {
  if (revision.security_mode !== NOTE_SECURITY_MODES.SECURE) {
    return revision;
  }

  return {
    ...revision,
    body_markdown: decryptSecureNoteBody(revision),
    body_excerpt: null,
  };
}

async function canAccessLinkedContext(session, note, links = [], seenTargets = new Set()) {
  const targets = [
    ...noteContextTargets(note),
    ...links.map((link) => ({
      module_id: link.module_id,
      target_type: link.target_type,
      target_id: link.target_id,
    })),
  ].filter((target) => target.target_id || target.target_type === "workspace");

  for (const target of targets) {
    if (!(await canTargetAccess(session, target, seenTargets))) {
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

async function canTargetAccess(session, target, seenTargets = new Set()) {
  const normalizedTarget = normalizeTarget(target);
  const targetKey = linkedContextTargetKey(normalizedTarget);
  if (seenTargets.has(targetKey)) {
    return true;
  }
  const nextSeenTargets = new Set(seenTargets);
  nextSeenTargets.add(targetKey);

  if (normalizedTarget.target_type === "workspace") {
    return normalizedTarget.target_id === session.workspace_id;
  }

  if (normalizedTarget.target_type === "client") {
    if (!(await workspaceSupportsClientTargets(session))) {
      return false;
    }

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

  if (normalizedTarget.target_type === "note") {
    return canAccessNoteTarget(session, normalizedTarget, nextSeenTargets);
  }

  if (normalizedTarget.target_type === "list") {
    return canAccessListTarget(session, normalizedTarget);
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

function linkedContextTargetKey(target = {}) {
  return [target.module_id || "", target.target_type || "", target.target_id || ""].join(":");
}

async function canAccessNoteTarget(session, target, seenTargets = new Set()) {
  const note = await notesRepository.readById(session.workspace_id, target.target_id);
  if (!note || note.status === NOTE_STATUSES.DELETED || note.deleted_at) {
    return false;
  }

  const links = await notesRepository.listLinks(session.workspace_id, note.note_id);
  const linkedRecordAccess = await canAccessLinkedContext(session, note, links, seenTargets);
  const access = canAccessNote({
    note,
    operation: "read",
    session,
    permissions: await readNotePermissionSet(session),
    linkedRecordAccess,
    ...(await readNotesModuleState(session)),
  });
  return access.allowed;
}

async function canAccessListTarget(session, target) {
  if (!(await modulesService.canReadModule(session.workspace_id, "lists"))) {
    return false;
  }

  const listRecord = await listsRepository.readById(session.workspace_id, target.target_id);
  if (!listRecord || listRecord.status === "deleted" || listRecord.deleted_at) {
    return false;
  }

  return permissionsService.can(session, LIST_PERMISSIONS.VIEW_ALL, listResource(listRecord)) ||
    permissionsService.can(session, LIST_PERMISSIONS.VIEW, listResource(listRecord));
}

async function listTargetsByType(session, targetType) {
  if (!(await canReadLinkTargetType(session, targetType))) {
    return [];
  }

  if (targetType === "workspace") {
    const workspace = await workspacesRepository.readById(session.workspace_id);
    return [shapeLinkTarget({
      target_type: "workspace",
      target_id: session.workspace_id,
      label: workspace?.workspace_name || "Workspace",
      subtitle: "Workspace",
      source_url: "dashboard.html",
    })];
  }

  if (targetType === "client") {
    if (!(await workspaceSupportsClientTargets(session))) {
      return [];
    }

    const { clients } = await clientsService.listClients(session, {
      include_depth: true,
      shape: "flat",
      status: "All",
    });
    return clients.map((client, index) => {
      const label = clientTargetPlainLabel(client);
      const displayLabel = clientTargetDisplayLabel(client);

      return shapeLinkTarget({
        target_type: "client",
        target_id: client.id,
        label,
        display_label: displayLabel,
        secondary_label: "",
        sort_key: clientTargetSortKey(client, index),
        source_url: `clients.html?client=${encodeURIComponent(client.id)}`,
        client_id: client.id,
        workspace_id: session.workspace_id,
        status: client.status || "",
      });
    });
  }

  if (targetType === "project") {
    const projects = await permissionsService.filterReadableProjects(session, await projectsRepository.readAll(session.workspace_id));
    const workspace = await workspacesRepository.readById(session.workspace_id);
    const isBusinessWorkspace = isBusinessWorkspaceRecord(workspace);
    return projects.map((project) => {
      const projectName = projectTargetPlainLabel(project);

      return shapeLinkTarget({
        target_type: "project",
        target_id: project.id,
        label: projectName,
        display_label: projectTargetDisplayLabel(project, workspace, isBusinessWorkspace),
        secondary_label: projectTargetSecondaryLabel(project, workspace, isBusinessWorkspace),
        sort_key: projectTargetSortKey(project, workspace, isBusinessWorkspace),
        source_url: `projects.html?project=${encodeURIComponent(project.id)}`,
        client_id: project.client_id || "",
        client_name: project.client_name || "",
        project_id: project.id,
        project_name: projectName,
        workspace_id: session.workspace_id,
        workspace_name: workspaceTargetName(workspace),
      });
    });
  }

  if (targetType === "task") {
    const workspace = await workspacesRepository.readById(session.workspace_id);
    const isBusinessWorkspace = isBusinessWorkspaceRecord(workspace);
    const tasks = await filterReadableTasks(session, await tasksRepository.readAll(session.workspace_id));
    return tasks.map((task) => {
      const taskTitle = taskTargetPlainLabel(task);
      const displayLabel = taskTargetPickerDisplayLabel(task, workspace, isBusinessWorkspace);

      return shapeLinkTarget({
        target_type: "task",
        target_id: task.task_id,
        label: taskTitle,
        display_label: displayLabel,
        secondary_label: "",
        sort_key: taskTargetSortKey(task, workspace, isBusinessWorkspace),
        source_url: `tasks.html?task=${encodeURIComponent(task.task_id)}`,
        client_id: task.client_id || "",
        client_name: task.client_name || "",
        project_id: task.project_id || "",
        project_name: taskTargetProjectName(task),
        task_id: task.task_id,
        title: taskTitle,
        full_label: taskTitle,
        aria_label: taskTargetAccessibleLabel(task, workspace, isBusinessWorkspace),
        workspace_id: session.workspace_id,
        workspace_name: workspaceTargetName(workspace),
        suggested_library_bucket: NOTE_LIBRARY_BUCKETS.ACTIVE_WORK,
      });
    });
  }

  if (targetType === "note") {
    const notes = await filterAccessibleNotes(session, await notesRepository.list(session.workspace_id, {}));
    return notes.map((note) => shapeLinkTarget({
      target_type: "note",
      target_id: note.note_id,
      label: readableTargetLabel(note.title, "note"),
      subtitle: "",
      source_url: noteSourceUrl(note.note_id),
      client_id: note.client_id || "",
      project_id: note.project_id || "",
      note_id: note.note_id,
    }));
  }

  if (targetType === "list") {
    if (!(await canReadLinkTargetType(session, "list"))) {
      return [];
    }
    const lists = await listsRepository.list(session.workspace_id, {});
    const readableLists = [];
    for (const listRecord of lists) {
      if (await canAccessListTarget(session, {
        module_id: "lists",
        target_type: "list",
        target_id: listRecord.list_id,
      })) {
        readableLists.push(shapeLinkTarget({
          target_type: "list",
          target_id: listRecord.list_id,
          label: readableTargetLabel(listRecord.title, "list"),
          subtitle: "",
          source_url: `lists.html?list=${encodeURIComponent(listRecord.list_id)}`,
          client_id: listRecord.client_id || "",
          project_id: listRecord.project_id || "",
          list_id: listRecord.list_id,
        }));
      }
    }
    return readableLists;
  }

  if (targetType === "user") {
    const users = await filterReadableUsers(session, await usersRepository.readAll(session.workspace_id));
    return users.map((user) => shapeLinkTarget({
      target_type: "user",
      target_id: user.user_id,
      label: readableTargetLabel(user.displayName || user.display_name || user.username, "user"),
      subtitle: user.username || "User",
      source_url: "settings.html",
      user_id: user.user_id,
      suggested_library_bucket: NOTE_LIBRARY_BUCKETS.ONGOING_AREA,
    }));
  }

  return [];
}

async function workspaceSupportsClientTargets(session) {
  const workspace = await workspacesRepository.readById(session.workspace_id);
  return normalizeWorkspaceType(workspace?.workspace_type) === "business";
}

async function canReadLinkTargetType(session, targetType) {
  const moduleId = {
    client: "client-projects",
    list: "lists",
    note: "notes",
    project: "client-projects",
    task: "tasks",
  }[targetType];

  return moduleId ? modulesService.canWriteModule(session.workspace_id, moduleId) : true;
}

async function filterReadableTasks(session, tasks = []) {
  const readable = [];

  for (const task of tasks) {
    if (await permissionsService.can(session, "tasks.view", {
      workspace_id: session.workspace_id,
      client_id: task.client_id,
      project_id: task.project_id,
      task_id: task.task_id,
      operation: "read",
    })) {
      readable.push(task);
    }
  }

  return readable;
}

async function filterReadableUsers(session, users = []) {
  const canManageUsers = await permissionsService.can(session, "users.manage", {
    workspace_id: session.workspace_id,
    operation: "read",
  });

  return users.filter((user) => canManageUsers || user.user_id === session.user_id);
}

function targetMatchesSearch(target, search) {
  if (!search) {
    return true;
  }

  return [
    target.title,
    target.fullLabel,
    target.ariaLabel,
    target.displayLabel,
    target.secondaryLabel,
    target.label,
    target.subtitle,
    target.sortKey,
    target.targetId,
    target.clientId,
    target.clientName,
    target.listId,
    target.noteId,
    target.projectId,
    target.projectName,
    target.workspaceName,
    target.taskId,
    target.userId,
  ].filter(Boolean).join(" ").toLowerCase().includes(search);
}

function compareLinkTargets(left = {}, right = {}) {
  return compareText(left.targetType, right.targetType) ||
    compareText(left.sortKey || left.displayLabel || left.label, right.sortKey || right.displayLabel || right.label) ||
    compareText(left.displayLabel || left.label, right.displayLabel || right.label) ||
    compareText(left.targetId, right.targetId);
}

function clientTargetPlainLabel(client = {}) {
  return readableTargetLabel(client.name || client.label, "client");
}

function clientTargetDisplayLabel(client = {}) {
  return readProviderDisplayLabel(client.display_label || client.displayLabel) || clientTargetPlainLabel(client);
}

function clientTargetSortKey(client = {}, index = 0) {
  return normalizeOptionalText(client.sort_key || client.sortKey) || String(Number(index) || 0).padStart(6, "0");
}

function projectTargetPlainLabel(project = {}) {
  return readableTargetLabel(project.name || project.label, "project");
}

function projectTargetDisplayLabel(project = {}, workspace = {}, isBusinessWorkspace = false) {
  const projectName = projectTargetPlainLabel(project);
  if (!isBusinessWorkspace) {
    return projectName;
  }

  return `${projectName} - ${projectTargetContextLabel(project, workspace)}`;
}

function projectTargetSecondaryLabel(project = {}, workspace = {}, isBusinessWorkspace = false) {
  return isBusinessWorkspace ? projectTargetContextLabel(project, workspace) : "";
}

function projectTargetSortKey(project = {}, workspace = {}, isBusinessWorkspace = false) {
  const projectName = projectTargetPlainLabel(project);
  if (!isBusinessWorkspace) {
    return sortText(projectName);
  }

  const hasClientContext = Boolean(normalizeOptionalText(project.client_id || project.clientId));
  const contextOrder = hasClientContext ? "1" : "0";
  return [
    contextOrder,
    sortText(projectTargetContextLabel(project, workspace)),
    sortText(projectName),
  ].join("|");
}

function projectTargetContextLabel(project = {}, workspace = {}) {
  const hasClientContext = Boolean(normalizeOptionalText(project.client_id || project.clientId));
  if (hasClientContext) {
    return readableTargetLabel(project.client_name || project.clientName, "client");
  }

  return workspaceTargetName(workspace);
}

function taskTargetPlainLabel(task = {}) {
  return readableTargetLabel(task.title || task.label, "task");
}

function taskTargetPickerDisplayLabel(task = {}, workspace = {}, isBusinessWorkspace = false) {
  const title = truncateTaskTargetTitle(taskTargetPlainLabel(task));
  const context = taskTargetContextLabel(task, workspace, isBusinessWorkspace);
  return context ? `${title} - ${context}` : title;
}

function taskTargetSummaryDisplayLabel(task = {}) {
  return taskTargetPlainLabel(task);
}

function taskTargetAccessibleLabel(task = {}, workspace = {}, isBusinessWorkspace = false) {
  const title = taskTargetPlainLabel(task);
  const context = taskTargetContextLabel(task, workspace, isBusinessWorkspace);
  return context ? `${title} - ${context}` : title;
}

function taskTargetContextLabel(task = {}, workspace = {}, isBusinessWorkspace = false) {
  const projectName = taskTargetProjectName(task);
  if (!projectName) {
    return "";
  }

  if (!isBusinessWorkspace) {
    return projectName;
  }

  return `${taskTargetBusinessContextName(task, workspace)} | ${projectName}`;
}

function taskTargetBusinessContextName(task = {}, workspace = {}) {
  const hasClientContext = Boolean(normalizeOptionalText(task.client_id || task.clientId));
  if (hasClientContext) {
    return readableTargetLabel(task.client_name || task.clientName, "client");
  }

  return workspaceTargetName(workspace);
}

function taskTargetProjectName(task = {}) {
  if (!normalizeOptionalText(task.project_id || task.projectId)) {
    return "";
  }

  return readableTargetLabel(task.project_name || task.projectName, "project");
}

function taskTargetSortKey(task = {}, workspace = {}, isBusinessWorkspace = false) {
  return [
    taskTargetUsefulnessRank(task),
    sortText(taskTargetSortContextName(task, workspace, isBusinessWorkspace)),
    sortText(taskTargetProjectName(task)),
    sortText(taskTargetPlainLabel(task)),
    sortText(task.task_id || task.taskId),
  ].join("|");
}

function taskTargetSortContextName(task = {}, workspace = {}, isBusinessWorkspace = false) {
  if (!taskTargetProjectName(task)) {
    return "";
  }

  return isBusinessWorkspace ? taskTargetBusinessContextName(task, workspace) : "";
}

function taskTargetUsefulnessRank(task = {}) {
  const status = normalizeOptionalText(task.status).toLowerCase();
  const isInactive = task.archived_at ||
    task.archivedAt ||
    task.completed_at ||
    task.completedAt ||
    status === "archived" ||
    status === "complete";
  return isInactive ? "1" : "0";
}

function truncateTaskTargetTitle(title) {
  const text = normalizeOptionalText(title);
  if (text.length <= TASK_TARGET_TITLE_MAX_LENGTH) {
    return text;
  }

  return `${text.slice(0, TASK_TARGET_TITLE_MAX_LENGTH - 3).trimEnd()}...`;
}

function workspaceTargetName(workspace = {}) {
  return readableTargetLabel(workspace?.workspace_name || workspace?.name, "workspace");
}

function isBusinessWorkspaceRecord(workspace = {}) {
  return normalizeWorkspaceType(workspace?.workspace_type) === "business";
}

function sortText(value) {
  return normalizeOptionalText(value).toLowerCase();
}

function readProviderDisplayLabel(value) {
  if (value === null || value === undefined) {
    return "";
  }

  const text = String(value);
  return text.trim() ? text : "";
}

function noteContextTargets(note = {}) {
  return [
    note.client_id ? { module_id: "client-projects", target_type: "client", target_id: note.client_id } : null,
    note.project_id ? { module_id: "client-projects", target_type: "project", target_id: note.project_id } : null,
    note.task_id ? { module_id: "tasks", target_type: "task", target_id: note.task_id } : null,
    note.linked_user_id ? { module_id: "users", target_type: "user", target_id: note.linked_user_id } : null,
  ].filter(Boolean);
}

function normalizeTargetFromQuery(query = {}, session = null) {
  return normalizeTarget({
    module_id: query.moduleId || query.module_id,
    target_type: query.targetType || query.target_type,
    target_id: query.targetId || query.target_id,
    workspace_id: session?.workspace_id,
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
    target_id: targetType === "workspace" && targetId === "current" ? payload.workspace_id || payload.workspaceId || targetId : targetId,
  };
}

function defaultModuleForTargetType(targetType) {
  return {
    workspace: "framework",
    client: "client-projects",
    list: "lists",
    note: "notes",
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

function normalizeLinkPayloads(payload = {}) {
  const links = normalizeLinksInput(payload.links || []);
  const taskId = normalizeOptionalText(payload.taskId ?? payload.task_id);

  if (
    taskId &&
    !links.some((link) => link.target_type === "task" && link.target_id === taskId)
  ) {
    links.push({
      module_id: "tasks",
      target_type: "task",
      target_id: taskId,
    });
  }

  return links;
}

async function maybeCreateRevision(session, previousNote, nextNote, changeSummary) {
  if (!previousNote || !shouldCreateNoteRevision(previousNote, nextNote)) {
    return null;
  }

  const revisionNumber = await notesRepository.nextRevisionNumber(session.workspace_id, nextNote.note_id);
  const revision = await notesRepository.createRevision(session.workspace_id, {
    ...createRevisionSnapshot(previousNote, {
      revisionNumber,
      changedByUserId: session.user_id,
      changeSummary,
    }),
    ...(previousNote.security_mode === NOTE_SECURITY_MODES.SECURE ? copySecureEncryptionFields(previousNote) : clearSecureEncryptionFields()),
    ...copyImportMetadata(previousNote),
  });

  await emitNoteEvent("note.revision_created", session, previousNote, nextNote, {
    revision_id: revision.note_revision_id,
    revision_number: revision.revision_number,
  });

  return revision;
}

function shouldCreateNoteRevision(previousNote, nextNote) {
  if (previousNote.security_mode === NOTE_SECURITY_MODES.SECURE || nextNote.security_mode === NOTE_SECURITY_MODES.SECURE) {
    return [
      "title",
      "note_type",
      "library_bucket",
      "status",
      "visibility",
      "security_mode",
      "secure_payload",
      "encrypted_data_key",
      "encrypted_at",
    ].some((fieldName) => String(previousNote[fieldName] ?? "") !== String(nextNote[fieldName] ?? ""));
  }

  return shouldCreateRevision(previousNote, nextNote);
}

function visibleRevisionSnapshots(revisions = [], note = {}) {
  const visible = revisions.filter((revision, index) => shouldShowRevisionSnapshot(revision, revisions, index, note));

  if (visible.length === 1 && Number(visible[0].revision_number) === 1) {
    return [];
  }

  return visible;
}

function shouldShowRevisionSnapshot(revision, revisions, index, note) {
  if (revision.security_mode === NOTE_SECURITY_MODES.SECURE || note.security_mode === NOTE_SECURITY_MODES.SECURE) {
    return true;
  }

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
  const links = await notesRepository.listLinks(session.workspace_id, note.note_id);

  return {
    ...note,
    ...taggedNote,
    body_html: renderNoteBodyHtml(note),
    links: await decorateNoteLinks(session, links),
    linked_context: await readLinkedContextSummary(session, note),
    owner_display_name: await resolveNoteOwnerLabel(session, note),
  };
}

async function resolveNoteOwnerLabel(session, note = {}) {
  const ownerUserId = normalizeOptionalText(note.owner_user_id);
  if (!ownerUserId) {
    return "";
  }
  try {
    const user = await usersRepository.readById(session.workspace_id, ownerUserId);
    return user ? (user.display_name || user.displayName || user.username || "") : "";
  } catch {
    return "";
  }
}

function shapeNoteForBrowser(note = {}, { includeBodyHtml = false } = {}) {
  const shaped = stripSecureStorageFields(note);

  if (shaped.security_mode === NOTE_SECURITY_MODES.SECURE) {
    shaped.body_excerpt = null;
    shaped.body_plaintext_index = null;
    shaped.secure_title_warning = SECURE_NOTE_TITLE_WARNING;
    delete shaped.secure_body_decrypted;
  }

  if (!includeBodyHtml) {
    delete shaped.body_html;
  }

  return shaped;
}

function shapeLinkedNotePanelItem(note = {}) {
  const shaped = shapeNoteForBrowser(note, { includeBodyHtml: false });
  delete shaped.body_markdown;
  delete shaped.body_plaintext_index;
  delete shaped.metadata_json;

  return {
    ...shaped,
    id: shaped.note_id,
    label: shaped.title || "Untitled note",
    excerpt: shaped.security_mode === NOTE_SECURITY_MODES.SECURE ? null : shaped.body_excerpt || "",
    sourceUrl: noteSourceUrl(shaped.note_id),
    links: Array.isArray(shaped.links) ? shaped.links.map(shapeSafeNoteLink) : [],
  };
}

function shapeResumeContextNote(note = {}) {
  const shaped = shapeNoteForBrowser(note, { includeBodyHtml: false });
  const links = Array.isArray(shaped.links) ? shaped.links.map(shapeSafeNoteLink) : [];
  const linkedContext = {
    clientId: shaped.client_id || "",
    projectId: shaped.project_id || "",
    taskId: shaped.task_id || "",
    ticketId: shaped.ticket_id || "",
    linkedUserId: shaped.linked_user_id || "",
    links,
  };
  const linkedTargetTypes = new Set([
    shaped.task_id ? "task" : "",
    shaped.project_id ? "project" : "",
    shaped.client_id ? "client" : "",
    shaped.ticket_id ? "ticket" : "",
    shaped.linked_user_id ? "user" : "",
    ...links.map((link) => link.targetType),
  ].filter(Boolean));

  return {
    moduleId: NOTES_MODULE_ID,
    recordType: "note",
    recordId: shaped.note_id,
    title: shaped.title || "Untitled note",
    sourceUrl: noteSourceUrl(shaped.note_id),
    sourceLabel: "Notes",
    libraryBucket: shaped.library_bucket,
    noteKind: shaped.note_type,
    status: shaped.status,
    visibility: shaped.visibility,
    securityMode: shaped.security_mode,
    updatedAt: shaped.updated_at || "",
    lastWorkedAt: shaped.updated_at || shaped.created_at || "",
    excerpt: shaped.body_excerpt || "",
    supportingContext: linkedTargetTypes.size > 0,
    eligibleForPickup: true,
    linkedTargetTypes: [...linkedTargetTypes].sort(),
    linkedContext,
    badges: [shaped.status, shaped.visibility, shaped.security_mode].filter(Boolean),
  };
}

function shapeSafeNoteLink(link = {}) {
  return {
    noteLinkId: link.note_link_id || "",
    moduleId: link.module_id || "",
    targetType: link.target_type || "",
    targetId: link.target_id || "",
    label: link.label || safeTargetFallbackLabel(link),
    subtitle: link.subtitle || "",
    sourceUrl: link.source_url || targetSourceUrl(link),
    linkRole: link.link_role || "related",
    scopeRole: link.scope_role || "related",
  };
}

async function decorateNoteLinks(session, links = []) {
  const decorated = [];

  for (const link of links) {
    decorated.push({
      ...link,
      ...await readTargetSummary(session, link),
    });
  }

  return decorated;
}

async function readLinkedContextSummary(session, note = {}) {
  const contexts = {};

  for (const target of noteContextTargets(note)) {
    const summary = await readTargetSummary(session, target);
    contexts[target.target_type] = {
      ...shapeLinkTarget({
        ...target,
        ...summary,
      }),
      unavailable: Boolean(summary.unavailable),
    };
  }

  return contexts;
}

async function readTargetSummary(session, target = {}) {
  const normalizedTarget = normalizeTarget({
    ...target,
    target_id: target.target_id || target.targetId,
    target_type: target.target_type || target.targetType,
    module_id: target.module_id || target.moduleId,
  });

  try {
    if (!(await canTargetAccess(session, normalizedTarget))) {
      return safeUnavailableTarget(normalizedTarget);
    }

    if (normalizedTarget.target_type === "workspace") {
      const workspace = await workspacesRepository.readById(session.workspace_id);
      return {
        label: workspace?.workspace_name || "Workspace",
        subtitle: "Workspace",
        source_url: "dashboard.html",
      };
    }
    if (normalizedTarget.target_type === "client") {
      const client = await clientsRepository.readById(session.workspace_id, normalizedTarget.target_id);
      const label = client ? clientTargetPlainLabel(client) : "";
      return client ? {
        label,
        display_label: label,
        secondary_label: "",
        sort_key: clientTargetSortKey(client, 0),
        source_url: `clients.html?client=${encodeURIComponent(client.id)}`,
        client_id: client.id,
        workspace_id: session.workspace_id,
        status: client.status || "",
      } : safeUnavailableTarget(normalizedTarget);
    }
    if (normalizedTarget.target_type === "project") {
      const project = await projectsRepository.readById(session.workspace_id, normalizedTarget.target_id);
      const workspace = await workspacesRepository.readById(session.workspace_id);
      const isBusinessWorkspace = isBusinessWorkspaceRecord(workspace);
      const projectName = project ? projectTargetPlainLabel(project) : "";
      return project ? {
        label: projectName,
        display_label: projectTargetDisplayLabel(project, workspace, isBusinessWorkspace),
        secondary_label: projectTargetSecondaryLabel(project, workspace, isBusinessWorkspace),
        sort_key: projectTargetSortKey(project, workspace, isBusinessWorkspace),
        subtitle: projectTargetSecondaryLabel(project, workspace, isBusinessWorkspace),
        source_url: `projects.html?project=${encodeURIComponent(project.id)}`,
        client_id: project.client_id || "",
        client_name: project.client_name || "",
        project_id: project.id,
        project_name: projectName,
        workspace_id: session.workspace_id,
        workspace_name: workspaceTargetName(workspace),
      } : safeUnavailableTarget(normalizedTarget);
    }
    if (normalizedTarget.target_type === "task") {
      const task = await tasksRepository.readById(session.workspace_id, normalizedTarget.target_id);
      const workspace = await workspacesRepository.readById(session.workspace_id);
      const isBusinessWorkspace = isBusinessWorkspaceRecord(workspace);
      const contextLabel = task ? taskTargetContextLabel(task, workspace, isBusinessWorkspace) : "";
      const taskTitle = task ? taskTargetPlainLabel(task) : "";
      return task ? {
        label: taskTitle,
        display_label: taskTargetSummaryDisplayLabel(task),
        secondary_label: contextLabel,
        sort_key: taskTargetSortKey(task, workspace, isBusinessWorkspace),
        subtitle: contextLabel,
        source_url: `tasks.html?task=${encodeURIComponent(task.task_id)}`,
        client_id: task.client_id || "",
        client_name: task.client_name || "",
        project_id: task.project_id || "",
        project_name: taskTargetProjectName(task),
        task_id: task.task_id,
        title: taskTitle,
        full_label: taskTitle,
        aria_label: taskTargetAccessibleLabel(task, workspace, isBusinessWorkspace),
        workspace_id: session.workspace_id,
        workspace_name: workspaceTargetName(workspace),
      } : safeUnavailableTarget(normalizedTarget);
    }
    if (normalizedTarget.target_type === "note") {
      const note = await notesRepository.readById(session.workspace_id, normalizedTarget.target_id);
      return note ? {
        label: readableTargetLabel(note.title, "note"),
        subtitle: "",
        source_url: noteSourceUrl(note.note_id),
        client_id: note.client_id || "",
        project_id: note.project_id || "",
        note_id: note.note_id,
      } : safeUnavailableTarget(normalizedTarget);
    }
    if (normalizedTarget.target_type === "list") {
      const listRecord = await listsRepository.readById(session.workspace_id, normalizedTarget.target_id);
      return listRecord ? {
        label: readableTargetLabel(listRecord.title, "list"),
        subtitle: "",
        source_url: `lists.html?list=${encodeURIComponent(listRecord.list_id)}`,
        client_id: listRecord.client_id || "",
        project_id: listRecord.project_id || "",
        list_id: listRecord.list_id,
      } : safeUnavailableTarget(normalizedTarget);
    }
    if (normalizedTarget.target_type === "user") {
      const user = await usersRepository.readById(session.workspace_id, normalizedTarget.target_id);
      return user ? {
        label: readableTargetLabel(user.display_name || user.displayName || user.username, "user"),
        subtitle: user.username || "User",
        source_url: "settings.html",
        user_id: user.user_id,
      } : safeUnavailableTarget(normalizedTarget);
    }
  } catch {
    return safeUnavailableTarget(normalizedTarget);
  }

  return safeUnavailableTarget(normalizedTarget);
}

function shapeLinkTarget(target = {}) {
  const targetType = target.target_type || target.targetType || "";
  const targetId = target.target_id || target.targetId || "";
  const fallbackLabel = safeTargetFallbackLabel({ target_type: targetType, target_id: targetId });
  const label = target.label || fallbackLabel;
  const displayLabel = target.display_label || target.displayLabel || label;
  const secondaryLabel = target.secondary_label || target.secondaryLabel || target.subtitle || "";
  const workspaceId = target.workspace_id || target.workspaceId || (targetType === "workspace" ? targetId : "");

  return {
    moduleId: target.module_id || target.moduleId || defaultModuleForTargetType(targetType),
    targetType,
    targetId,
    label,
    subtitle: target.subtitle || "",
    displayLabel,
    secondaryLabel,
    sortKey: target.sort_key || target.sortKey || sortText(displayLabel),
    sourceUrl: target.source_url || target.sourceUrl || targetSourceUrl({ target_type: targetType, target_id: targetId }),
    title: target.title || "",
    fullLabel: target.full_label || target.fullLabel || "",
    ariaLabel: target.aria_label || target.ariaLabel || "",
    clientId: target.client_id || target.clientId || "",
    clientName: target.client_name || target.clientName || "",
    listId: target.list_id || target.listId || "",
    noteId: target.note_id || target.noteId || "",
    projectId: target.project_id || target.projectId || "",
    projectName: target.project_name || target.projectName || "",
    workspaceId,
    workspaceName: target.workspace_name || target.workspaceName || "",
    taskId: target.task_id || target.taskId || "",
    userId: target.user_id || target.userId || "",
    isAvailable: target.is_available ?? target.isAvailable ?? true,
    status: target.status || "",
    suggestedLibraryBucket: target.suggested_library_bucket || target.suggestedLibraryBucket || suggestedLibraryForTargetType(targetType),
  };
}

function safeUnavailableTarget(target = {}) {
  const label = safeTargetFallbackLabel(target);

  return {
    label,
    display_label: label,
    subtitle: "Unavailable",
    secondary_label: "Unavailable",
    sort_key: sortText(label),
    source_url: "",
    is_available: false,
    unavailable: true,
  };
}

function readableTargetLabel(value, targetType) {
  return normalizeOptionalText(value) || safeTargetFallbackLabel({ target_type: targetType });
}

function safeTargetFallbackLabel(target = {}) {
  const targetType = target.target_type || target.targetType || "record";
  return {
    workspace: "Workspace",
    client: "Unavailable client",
    project: "Unavailable project",
    task: "Unavailable task",
    note: "Unavailable note",
    list: "Unavailable list",
  }[targetType] || "Unavailable linked context";
}

function suggestedLibraryForTargetType(targetType = "") {
  if (targetType === "task") {
    return NOTE_LIBRARY_BUCKETS.ACTIVE_WORK;
  }
  if (["client", "project", "user"].includes(targetType)) {
    return NOTE_LIBRARY_BUCKETS.ONGOING_AREA;
  }
  return "";
}

function shapeLinkedNoteTarget(target = {}) {
  return {
    moduleId: target.module_id || "",
    targetType: target.target_type || "",
    targetId: target.target_id || "",
    sourceUrl: targetSourceUrl(target),
  };
}

async function linkedNotePanelActions(session, moduleState = {}) {
  const [canCreate, canManageLinks] = await Promise.all([
    permissionsService.can(session, NOTE_PERMISSIONS.CREATE, {
      workspace_id: session.workspace_id,
      operation: "create",
    }),
    permissionsService.can(session, NOTE_PERMISSIONS.MANAGE_LINKS, {
      workspace_id: session.workspace_id,
      operation: "manage_links",
    }),
  ]);
  const canWriteNotes = Boolean(moduleState.enabled);

  return {
    canCreate: canWriteNotes && canCreate,
    canLink: canWriteNotes && canManageLinks,
    canUnlink: canWriteNotes && canManageLinks,
    readonly: !canWriteNotes,
  };
}

function linkedNotePanelEmptyState(target = {}) {
  return {
    title: "No linked notes yet.",
    body: "Add a note when there is context worth preserving for this record.",
    action: {
      label: "Add Note",
      href: `notes.html?targetType=${encodeURIComponent(target.target_type || "")}&targetId=${encodeURIComponent(target.target_id || "")}`,
    },
  };
}

function shapeRevisionForBrowser(revision = {}, { includeBody = true } = {}) {
  const shaped = stripSecureStorageFields(revision);

  if (shaped.security_mode === NOTE_SECURITY_MODES.SECURE) {
    if (!includeBody) {
      delete shaped.body_markdown;
    }
    shaped.body_excerpt = null;
    shaped.secure_title_warning = SECURE_NOTE_TITLE_WARNING;
    delete shaped.secure_body_decrypted;
  }

  return shaped;
}

function stripSecureStorageFields(value = {}) {
  const safe = { ...value };

  for (const fieldName of SECURE_STORAGE_FIELDS) {
    delete safe[fieldName];
  }

  return safe;
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

function normalizeResumeContextOptions(query = {}) {
  return {
    limit: Math.min(Math.max(Number.parseInt(query.limit, 10) || 20, 1), 50),
  };
}

function isResumeContextEligibleNote(note = {}) {
  return note.library_bucket === NOTE_LIBRARY_BUCKETS.ACTIVE_WORK &&
    note.status === NOTE_STATUSES.ACTIVE &&
    note.visibility !== NOTE_VISIBILITIES.PRIVATE &&
    note.security_mode !== NOTE_SECURITY_MODES.SECURE &&
    !note.deleted_at;
}

function compareNotesByUpdatedAt(left = {}, right = {}) {
  const rightTime = Date.parse(right.updated_at || right.created_at || "") || 0;
  const leftTime = Date.parse(left.updated_at || left.created_at || "") || 0;
  return rightTime - leftTime || String(left.title || "").localeCompare(String(right.title || ""));
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

function sortCollectionsForReadModel(collections = []) {
  const bucketOrder = new Map([
    [NOTE_LIBRARY_BUCKETS.ACTIVE_WORK, 0],
    [NOTE_LIBRARY_BUCKETS.ONGOING_AREA, 1],
    [NOTE_LIBRARY_BUCKETS.REFERENCE, 2],
    [NOTE_LIBRARY_BUCKETS.ARCHIVE, 3],
  ]);

  return [...collections].sort((left, right) => (
    (bucketOrder.get(left.library_bucket) ?? 99) - (bucketOrder.get(right.library_bucket) ?? 99) ||
    String(left.path_cache || left.title || "").localeCompare(String(right.path_cache || right.title || ""), undefined, { sensitivity: "base" }) ||
    Number(left.sort_order || 0) - Number(right.sort_order || 0) ||
    String(left.title || "").localeCompare(String(right.title || ""), undefined, { sensitivity: "base" }) ||
    String(left.note_library_collection_id || "").localeCompare(String(right.note_library_collection_id || ""))
  ));
}

function collectionReadModelDefaults(filters = {}) {
  return {
    libraries: {
      all: {
        label: "All Libraries",
        value: "all",
      },
      buckets: [
        { label: "Active Work", value: NOTE_LIBRARY_BUCKETS.ACTIVE_WORK },
        { label: "Ongoing Areas", value: NOTE_LIBRARY_BUCKETS.ONGOING_AREA },
        { label: "Reference Library", value: NOTE_LIBRARY_BUCKETS.REFERENCE },
      ],
    },
    collections: {
      all: {
        label: "All collections",
        value: "",
      },
      uncategorized: {
        label: "Uncategorized",
        value: "__uncategorized",
      },
    },
    activeLibraryBucket: filters.libraryBucket || "all",
  };
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

function normalizeLinkedNotePanelOptions(query = {}) {
  const sort = normalizeOptionalText(query.sort || query.sortMode || query.sort_mode) || "updated";

  return {
    sort: LINKED_NOTE_SORT_MODES.has(sort) ? sort : "updated",
  };
}

function sortLinkedNotePanelNotes(notes = [], sortMode = "updated") {
  return [...notes].sort((left, right) => {
    if (sortMode === "title") {
      return compareText(left.title, right.title) || compareUpdatedDesc(left, right);
    }

    if (sortMode === "recent" || sortMode === "updated") {
      return compareUpdatedDesc(left, right) || compareText(left.title, right.title);
    }

    if (sortMode === "pinned") {
      return comparePinnedDesc(left, right) || compareUpdatedDesc(left, right) || compareText(left.title, right.title);
    }

    return compareUpdatedDesc(left, right) || compareText(left.title, right.title);
  });
}

function comparePinnedDesc(left = {}, right = {}) {
  return Number(Boolean(right.metadata?.pinned || right.metadata?.pinned_at)) -
    Number(Boolean(left.metadata?.pinned || left.metadata?.pinned_at));
}

function compareUpdatedDesc(left = {}, right = {}) {
  return String(right.updated_at || right.created_at || "").localeCompare(String(left.updated_at || left.created_at || ""));
}

function compareText(left, right) {
  return String(left || "").localeCompare(String(right || ""), undefined, { sensitivity: "base" });
}

function noteSourceUrl(noteId) {
  return `notes.html?note=${encodeURIComponent(noteId || "")}`;
}

function targetSourceUrl(target = {}) {
  const targetId = encodeURIComponent(target.target_id || "");
  return {
    workspace: "dashboard.html",
    client: "clients.html",
    list: `lists.html?list=${targetId}`,
    note: noteSourceUrl(target.target_id || ""),
    project: "projects.html",
    task: `tasks.html?task=${targetId}`,
    user: "settings.html",
  }[target.target_type] || "";
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

async function recordSecureDecryptFailure(session, note, error) {
  await auditService.record({
    session,
    action: "note_secure_decrypt_failed",
    changeType: "update",
    recordType: "note",
    recordId: note.note_id,
    recordLabel: note.title || "Secure note",
    recordUrl: `notes.html?note=${encodeURIComponent(note.note_id || "")}`,
    previousValue: null,
    newValue: null,
    metadata: {
      ...sanitizeNoteLifecyclePayload({
        workspace_id: session.workspace_id,
        actor_user_id: session.user_id,
        note_id: note.note_id,
        title: note.title,
        library_bucket: note.library_bucket,
        visibility: note.visibility,
        security_mode: note.security_mode,
      }),
      reason: error?.code || "secure_note_decrypt_failed",
    },
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
    delete safeValue.body_html;
    delete safeValue.body_excerpt;
    delete safeValue.body_plaintext_index;
    delete safeValue.secure_payload;
    delete safeValue.encrypted_data_key;
    delete safeValue.encryption_nonce;
    delete safeValue.encryption_auth_tag;
    delete safeValue.key_wrapping_nonce;
    delete safeValue.key_wrapping_auth_tag;
    delete safeValue.secure_body_decrypted;
  }
  delete safeValue.metadata_json;
  return safeValue;
}

function normalizeNullablePayloadText(payload = {}, camelField, snakeField, fallback = "") {
  if (Object.hasOwn(payload, camelField)) {
    return normalizeOptionalText(payload[camelField]);
  }
  if (Object.hasOwn(payload, snakeField)) {
    return normalizeOptionalText(payload[snakeField]);
  }
  return normalizeOptionalText(fallback);
}

function copySecureEncryptionFields(note = {}) {
  return {
    secure_payload: note.secure_payload || null,
    secure_payload_version: note.secure_payload_version || null,
    encrypted_data_key: note.encrypted_data_key || null,
    encryption_key_version: note.encryption_key_version || null,
    encryption_algorithm: note.encryption_algorithm || null,
    key_wrapping_algorithm: note.key_wrapping_algorithm || null,
    encryption_nonce: note.encryption_nonce || null,
    encryption_auth_tag: note.encryption_auth_tag || null,
    key_wrapping_nonce: note.key_wrapping_nonce || null,
    key_wrapping_auth_tag: note.key_wrapping_auth_tag || null,
    encrypted_at: note.encrypted_at || null,
  };
}

function clearSecureEncryptionFields() {
  return {
    secure_payload: null,
    secure_payload_version: null,
    encrypted_data_key: null,
    encryption_key_version: null,
    encryption_algorithm: null,
    key_wrapping_algorithm: null,
    encryption_nonce: null,
    encryption_auth_tag: null,
    key_wrapping_nonce: null,
    key_wrapping_auth_tag: null,
    encrypted_at: null,
  };
}

function renderNoteBodyHtml(note = {}) {
  if (note.security_mode === NOTE_SECURITY_MODES.SECURE && !note.secure_body_decrypted) {
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
    secure_note_owner_or_admin: "Secure notes are limited to the owner or an explicit secure-note administrator.",
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
  listLinkTargets,
  listLibrary,
  listLinks,
  listResumeContext,
  listRevisions,
  moveCollection,
  previewMarkdown,
  read,
  readForAttachmentAccess,
  readRevision,
  removeLink,
  restore,
  restoreCollection,
  restoreRevision,
  secureHealth,
  softDelete,
  updateCollection,
  update,
};
