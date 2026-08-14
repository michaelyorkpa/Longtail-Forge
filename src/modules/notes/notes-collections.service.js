// @ts-check
import { notesRepository } from "./notes.repo.js";
import {
  CreateNoteCollectionSchema,
  MoveNoteCollectionSchema,
  NoteCatalogBulkActionSchema,
  NoteImportCollectionPathSchema,
  UpdateNoteCollectionSchema,
  parseNotesEdgePayload,
} from "./notes.contracts.js";
import { NOTE_PERMISSIONS } from "./access-policy.js";
import {
  NOTE_LIBRARY_BUCKETS,
  NOTE_SECURITY_MODES,
  NOTE_STATUSES,
} from "./library.js";
import { resolveCollectionEffectiveSecurity } from "./effective-security.js";
import { slugifyNoteTitle } from "./markdown.js";
import { modulesService } from "../../core/modules/modules.service.js";
import { permissionsService } from "../../core/permissions.js";
import { AppError } from "../../core/errors.js";
import { searchIndexSyncService } from "../../services/search-index-sync.service.js";

/** @typedef {import("../../types/http-contracts.js").WorkspaceRequestSession} WorkspaceRequestSession */
/** @typedef {import("../../types/notes-collections-contracts.js").NoteCatalogBulkError} NoteCatalogBulkError */
/** @typedef {import("../../types/notes-collections-contracts.js").NoteCatalogSettingsRow} NoteCatalogSettingsRow */
/** @typedef {import("../../types/notes-collections-contracts.js").NoteCollectionCountFilters} NoteCollectionCountFilters */
/** @typedef {import("../../types/notes-collections-contracts.js").NoteCollectionCountNote} NoteCollectionCountNote */
/** @typedef {import("../../types/notes-collections-contracts.js").NoteCollectionMetadata} NoteCollectionMetadata */
/** @typedef {import("../../types/notes-collections-contracts.js").NoteCollectionRecord} NoteCollectionRecord */
/** @typedef {import("../../types/notes-collections-contracts.js").NoteCollectionSelection} NoteCollectionSelection */
/** @typedef {import("../../types/notes-collections-contracts.js").NoteCollectionTreeNode} NoteCollectionTreeNode */
/** @typedef {import("../../types/notes-collections-contracts.js").NoteLibraryBucket} NoteLibraryBucket */
/** @typedef {import("../../types/notes-collections-contracts.js").NotesCollectionsDependencies} NotesCollectionsDependencies */
/** @typedef {import("../../types/notes-collections-contracts.js").NotesCollectionsService} NotesCollectionsService */

const NOTES_MODULE_ID = "notes";
/** @type {Set<string>} */
const COLLECTION_SOURCE_VALUES = new Set(["manual", "imported"]);
/** @type {Set<string>} */
const LIBRARY_BUCKET_VALUES = new Set(Object.values(NOTE_LIBRARY_BUCKETS));
/** @type {Set<string>} */
const CATALOG_BULK_ACTIONS = new Set(["archive", "restore"]);
const CATALOG_BULK_LIMIT = 100;

/**
 * Create the Notes-owned collection aggregate while retaining the established
 * note visibility and audit owners as narrow dependencies.
 *
 * @param {NotesCollectionsDependencies} dependencies
 * @returns {NotesCollectionsService}
 */
function createNotesCollectionsService(dependencies) {
  /** @param {WorkspaceRequestSession} session @param {unknown} [rawQuery] */
  async function listCollections(session, rawQuery = {}) {
    await permissionsService.assertCanInAnyScope(session, NOTE_PERMISSIONS.VIEW);
    const filters = normalizeCollectionListFilters(rawQuery);
    const collections = filterSupportViewCollections(
      session,
      await listCollectionRecords(session.workspace_id, filters),
    );
    /** @type {NoteCollectionCountFilters} */
    const noteFilters = {
      includeDeleted: false,
      libraryBucket: filters.libraryBucket,
      status: filters.includeArchived ? "" : NOTE_STATUSES.ACTIVE,
    };
    const accessibleNotes = await dependencies.listAccessibleNotes(session, noteFilters);
    /** @type {Map<string, number>} */
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

    const sortedCollections = sortCollectionsForReadModel(collections);
    const rolledUpCountByCollectionId = rollupCollectionCounts(collections, accessibleCountByCollectionId);
    return {
      collections: sortedCollections.map((collection) => ({
        ...collection,
        accessibleNoteCount: rolledUpCountByCollectionId.get(collection.note_library_collection_id) || 0,
        directAccessibleNoteCount: accessibleCountByCollectionId.get(collection.note_library_collection_id) || 0,
      })),
      tree: buildCollectionTree(sortedCollections, rolledUpCountByCollectionId, accessibleCountByCollectionId),
      defaults: collectionReadModelDefaults(filters),
      uncategorized: {
        count: uncategorizedCount,
        libraryBucket: filters.libraryBucket,
        label: "Uncategorized",
        value: "__uncategorized",
      },
    };
  }

  /** @param {unknown} rawPayload @param {WorkspaceRequestSession} session */
  async function createCollection(rawPayload, session) {
    await assertCollectionsWriteEnabled(session);
    const payload = parseNotesEdgePayload(CreateNoteCollectionSchema, rawPayload);
    return createValidatedCollection(payload, session);
  }

  /**
   * @param {import("zod").output<typeof CreateNoteCollectionSchema>} payload
   * @param {WorkspaceRequestSession} session
   */
  async function createValidatedCollection(payload, session) {
    const collection = await normalizeCollectionPayload(payload, session);
    await assertCollectionSiblingAvailable(session.workspace_id, collection);
    const created = await createCollectionRecord(session.workspace_id, collection);
    await dependencies.recordAudit(session, "note_collection_created", "create", null, created);
    return { collection: created };
  }

  /** @param {string} collectionId @param {unknown} rawPayload @param {WorkspaceRequestSession} session */
  async function updateCollection(collectionId, rawPayload, session) {
    await assertCollectionsWriteEnabled(session);
    const payload = parseNotesEdgePayload(UpdateNoteCollectionSchema, rawPayload);
    return updateValidatedCollection(collectionId, payload, session);
  }

  /**
   * @param {string} collectionId
   * @param {import("zod").output<typeof UpdateNoteCollectionSchema>} payload
   * @param {WorkspaceRequestSession} session
   */
  async function updateValidatedCollection(collectionId, payload, session) {
    const previous = await readCollectionOrThrow(session, collectionId);
    await assertCollectionMutationStable(session, previous);
    const next = await normalizeCollectionPayload(payload, session, previous);
    const allCollections = await listCollectionRecords(session.workspace_id, {
      includeArchived: true,
      includeDeleted: true,
    });
    await assertCollectionMutationStable(session, next, allCollections);
    const prospectiveCollections = new Map(allCollections.map((collection) => [
      collection.note_library_collection_id,
      collection.note_library_collection_id === next.note_library_collection_id ? next : collection,
    ]));
    const prospectiveSecurity = resolveCollectionEffectiveSecurity(next, prospectiveCollections, session.workspace_id);
    if (previous.effective_security_mode === NOTE_SECURITY_MODES.SECURE && prospectiveSecurity.effectiveSecurityMode === NOTE_SECURITY_MODES.NORMAL) {
      next.security_policy = NOTE_SECURITY_MODES.SECURE;
    }
    await assertCollectionSiblingAvailable(session.workspace_id, next, previous.note_library_collection_id);
    const updated = await updateCollectionRecord(session.workspace_id, next);
    await updateCollectionDescendantPaths(session, updated);
    await syncCollectionNotesSearchIndex(session, [updated.note_library_collection_id], "note.collection.updated");
    await dependencies.recordAudit(session, "note_collection_updated", "update", previous, updated);
    if (collectionSecurityWasPreservedOnMove(previous, next, prospectiveSecurity)) {
      await dependencies.recordAudit(session, "note_catalog_security_preserved_on_move", "update", previous, updated);
    }
    return { collection: await readCollectionRecord(session.workspace_id, updated.note_library_collection_id) };
  }

  /** @param {string} collectionId @param {unknown} rawPayload @param {WorkspaceRequestSession} session */
  async function moveCollection(collectionId, rawPayload, session) {
    await assertCollectionsWriteEnabled(session);
    const payload = parseNotesEdgePayload(MoveNoteCollectionSchema, rawPayload);
    return updateValidatedCollection(collectionId, {
      parentCollectionId: payload.parentCollectionId ?? payload.parent_collection_id ?? null,
      title: payload.title,
      name: payload.name,
      description: payload.description,
      sortOrder: payload.sortOrder ?? payload.sort_order,
    }, session);
  }

  /** @param {string} collectionId @param {WorkspaceRequestSession} session */
  async function archiveCollection(collectionId, session) {
    await assertCollectionsWriteEnabled(session);
    const collection = await readCollectionOrThrow(session, collectionId);
    await assertCollectionMutationStable(session, collection);
    const descendants = collectionDescendants(collection, await listCollectionRecords(session.workspace_id, {
      includeArchived: true,
      includeDeleted: true,
      libraryBucket: collection.library_bucket,
    }));
    const archivedAt = new Date().toISOString();
    /** @type {NoteCollectionRecord[]} */
    const archived = [];

    for (const item of [collection, ...descendants].filter((candidate) => candidate.status !== "deleted")) {
      archived.push(await updateCollectionRecord(session.workspace_id, {
        ...item,
        status: "archived",
        archived_at: archivedAt,
        deleted_at: null,
        updated_at: archivedAt,
        updated_by_user_id: session.user_id,
      }));
    }

    await syncCollectionNotesSearchIndex(session, archived.map((item) => item.note_library_collection_id), "note.collection.archived");
    await dependencies.recordAudit(session, "note_collection_archived", "archive", collection, archived[0]);
    return { collection: archived[0], archivedCount: archived.length };
  }

  /** @param {string} collectionId @param {WorkspaceRequestSession} session */
  async function restoreCollection(collectionId, session) {
    await assertCollectionsWriteEnabled(session);
    const collection = await readCollectionOrThrow(session, collectionId, { includeArchived: true, includeDeleted: true });
    await assertCollectionMutationStable(session, collection);
    if (collection.status === "deleted") {
      throw new AppError("Deleted collections cannot be restored in this release.", 400);
    }
    const parent = collection.parent_collection_id
      ? await readCollectionOrThrow(session, collection.parent_collection_id)
      : null;
    /** @type {NoteCollectionRecord} */
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
    const restored = await updateCollectionRecord(session.workspace_id, next);
    await updateCollectionDescendantPaths(session, restored);
    await syncCollectionNotesSearchIndex(session, [restored.note_library_collection_id], "note.collection.restored");
    await dependencies.recordAudit(session, "note_collection_restored", "restore", collection, restored);
    return { collection: restored };
  }

  /** @param {string} collectionId @param {WorkspaceRequestSession} session */
  async function deleteEmptyCollection(collectionId, session) {
    await assertCollectionsWriteEnabled(session);
    const collection = await readCollectionOrThrow(session, collectionId, { includeArchived: true, includeDeleted: true });
    await assertCollectionMutationStable(session, collection);
    const noteCount = await notesRepository.countNotesInCollection(session.workspace_id, collectionId, { includeDeleted: false });
    if (noteCount > 0) throw new AppError("Collection cannot be deleted while it still contains notes.", 400);
    const childCount = await notesRepository.countChildCollections(session.workspace_id, collectionId, {
      includeArchived: false,
      includeDeleted: false,
    });
    if (childCount > 0) throw new AppError("Collection cannot be deleted while it still contains active child collections.", 400);

    const now = new Date().toISOString();
    const deleted = await updateCollectionRecord(session.workspace_id, {
      ...collection,
      status: "deleted",
      deleted_at: now,
      updated_at: now,
      updated_by_user_id: session.user_id,
    });
    await dependencies.recordAudit(session, "note_collection_deleted", "delete", collection, deleted);
    return { collection: deleted, deleted: /** @type {const} */ (true) };
  }

  /** @param {WorkspaceRequestSession} session @param {unknown} rawPayload */
  async function ensureCollectionsForImportPath(session, rawPayload) {
    await assertCollectionsWriteEnabled(session);
    const payload = parseNotesEdgePayload(NoteImportCollectionPathSchema, rawPayload);
    const libraryBucket = normalizeLibraryBucket(
      payload.libraryBucket || payload.library_bucket || NOTE_LIBRARY_BUCKETS.REFERENCE,
      "Library bucket",
    );
    const parts = normalizeImportCollectionPathParts(payload);
    /** @type {NoteCollectionRecord | null} */
    let parent = null;
    /** @type {NoteCollectionRecord[]} */
    const ensured = [];

    for (const title of parts) {
      const existing = (await listCollectionRecords(session.workspace_id, {
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

      const created = await createValidatedCollection({
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

    if (!parent) throw new AppError("Import collection path is required.", 400);
    return { collection: parent, collections: ensured };
  }

  /** @param {WorkspaceRequestSession} session */
  async function listCatalogSettings(session) {
    await assertCatalogSettingsAccess(session);
    const [collections, canManageSecurity] = await Promise.all([
      listCollectionRecords(session.workspace_id, { includeArchived: true, includeDeleted: false }),
      permissionsService.canInAnyScope(session, NOTE_PERMISSIONS.SECURE_MANAGE),
    ]);
    return {
      catalogs: sortCollectionsForReadModel(collections).map(shapeCatalogSettingsRow),
      capabilities: { manageSecurity: canManageSecurity },
      limits: { bulkSelection: CATALOG_BULK_LIMIT },
    };
  }

  /** @param {unknown} rawPayload @param {WorkspaceRequestSession} session */
  async function bulkManageCatalogs(rawPayload, session) {
    await assertCatalogSettingsAccess(session);
    const payload = parseNotesEdgePayload(NoteCatalogBulkActionSchema, rawPayload);
    const catalogIds = [...new Set(normalizeIdList(payload.catalogIds ?? payload.catalog_ids))];
    const action = normalizeCatalogBulkAction(payload.action);
    if (catalogIds.length === 0) throw new AppError("Select at least one Notes catalog.", 400);
    if (catalogIds.length > CATALOG_BULK_LIMIT) {
      throw new AppError("Notes catalog bulk management supports at most 100 catalogs at a time.", 400);
    }

    const collections = await listCollectionRecords(session.workspace_id, { includeArchived: true, includeDeleted: false });
    const byId = new Map(collections.map((collection) => [collection.note_library_collection_id, collection]));
    const selectedIds = new Set(catalogIds);
    /** @type {NoteCatalogBulkError[]} */
    const errors = catalogIds
      .filter((catalogId) => !byId.has(catalogId))
      .map((catalogId) => ({ catalogId, message: "Note catalog not found." }));
    let selected = catalogIds.map((catalogId) => byId.get(catalogId)).filter(isCollectionRecord);

    if (action === "archive") {
      selected = selected.filter((collection) => !collectionHasSelectedAncestor(collection, byId, selectedIds));
    } else {
      selected.sort((left, right) => left.depth - right.depth);
    }

    /** @type {NoteCatalogSettingsRow[]} */
    const catalogs = [];
    let affectedCount = 0;
    for (const collection of selected) {
      try {
        if (action === "archive") {
          const result = await archiveCollection(collection.note_library_collection_id, session);
          catalogs.push(shapeCatalogSettingsRow(result.collection));
          affectedCount += result.archivedCount;
        } else {
          const result = await restoreCollection(collection.note_library_collection_id, session);
          catalogs.push(shapeCatalogSettingsRow(result.collection));
          affectedCount += 1;
        }
      } catch (error) {
        const appError = error instanceof Error ? error : new Error("Note catalog could not be updated.");
        errors.push({
          catalogId: collection.note_library_collection_id,
          message: /** @type {{ statusCode?: number }} */ (appError).statusCode === 404
            ? "Note catalog not found."
            : appError.message || "Note catalog could not be updated.",
        });
      }
    }
    return { action, affectedCount, catalogs, errors, requestedCount: catalogIds.length };
  }

  /** @param {WorkspaceRequestSession} session @param {NoteCollectionSelection} selection */
  async function resolveListFilter(session, selection) {
    const collectionId = selection.noteCollectionId;
    if (!collectionId) return {};
    if (collectionId === "__uncategorized") return { uncategorizedCollection: true };
    const collections = await listCollectionRecords(session.workspace_id, {
      includeArchived: true,
      includeDeleted: false,
      libraryBucket: selection.libraryBucket,
    });
    const selected = collections.find((collection) => collection.note_library_collection_id === collectionId);
    const descendantIds = selected
      ? collectionDescendants(selected, collections).map((collection) => collection.note_library_collection_id)
      : [];
    return { noteCollectionIds: [collectionId, ...descendantIds] };
  }

  /** @param {WorkspaceRequestSession} session @param {string} collectionId */
  async function readAssignableCollection(session, collectionId) {
    return readCollectionOrThrow(session, collectionId, { includeArchived: true });
  }

  /** @param {WorkspaceRequestSession} session @param {import("../../types/notes-collections-contracts.js").NoteCollectionAssignment} assignment */
  async function assertNoteAssignment(session, assignment) {
    if (!assignment.note_collection_id) return;
    const collection = await readCollectionOrThrow(session, assignment.note_collection_id, { includeArchived: true });
    if (collection.library_bucket !== assignment.library_bucket) {
      throw new AppError("Note collection must be in the same Library bucket as the note.", 400);
    }
  }

  return Object.freeze({
    archiveCollection,
    assertNoteAssignment,
    bulkManageCatalogs,
    createCollection,
    deleteEmptyCollection,
    ensureCollectionsForImportPath,
    listCatalogSettings,
    listCollections,
    moveCollection,
    readAssignableCollection,
    resolveListFilter,
    restoreCollection,
    updateCollection,
  });
}

/** @param {WorkspaceRequestSession} session */
async function assertNotesWriteEnabled(session) {
  if (!(await modulesService.canWriteModule(session.workspace_id, NOTES_MODULE_ID))) {
    throw new AppError("This module is disabled for this workspace.", 403);
  }
}

/** @param {WorkspaceRequestSession} session */
async function assertCollectionsWriteEnabled(session) {
  await assertNotesWriteEnabled(session);
  await permissionsService.assertCanInAnyScope(session, NOTE_PERMISSIONS.MANAGE_LIBRARY, {
    workspace_id: session.workspace_id,
    operation: "manage_library",
  });
}

/** @param {WorkspaceRequestSession} session */
async function assertCatalogSettingsAccess(session) {
  await assertNotesWriteEnabled(session);
  await permissionsService.assertCanInAnyScope(session, NOTE_PERMISSIONS.MANAGE_SETTINGS, {
    workspace_id: session.workspace_id,
    operation: "manage",
  });
  await permissionsService.assertCanInAnyScope(session, NOTE_PERMISSIONS.MANAGE_LIBRARY, {
    workspace_id: session.workspace_id,
    operation: "manage_library",
  });
}

/** @param {WorkspaceRequestSession} session @param {string} collectionId @param {{ includeArchived?: boolean; includeDeleted?: boolean }} [options] */
async function readCollectionOrThrow(session, collectionId, options = {}) {
  const collection = await readCollectionRecord(session.workspace_id, normalizeRequiredText(collectionId, "Collection ID"));
  if (!collection || (!options.includeDeleted && collection.status === "deleted")) throw new AppError("Note collection not found.", 404);
  if (!options.includeArchived && collection.status === "archived") throw new AppError("Note collection is archived.", 400);
  return collection;
}

/** @param {WorkspaceRequestSession} session @param {NoteCollectionRecord} collection @param {NoteCollectionRecord[] | null} [providedCollections] */
async function assertCollectionMutationStable(session, collection, providedCollections = null) {
  const collections = providedCollections || await listCollectionRecords(session.workspace_id, { includeArchived: true, includeDeleted: true });
  const byId = new Map(collections.map((item) => [item.note_library_collection_id, item]));
  const relatedIds = new Set([
    collection.note_library_collection_id,
    ...collectionDescendants(collection, collections).map((item) => item.note_library_collection_id),
  ]);
  let parentId = collection.parent_collection_id || "";
  while (parentId && !relatedIds.has(parentId)) {
    relatedIds.add(parentId);
    parentId = byId.get(parentId)?.parent_collection_id || "";
  }
  const activeTransition = [...relatedIds]
    .map((collectionId) => byId.get(collectionId))
    .find((item) => item && item.security_transition_state !== "stable");
  if (activeTransition) throw new AppError("Catalog changes are blocked until the active security transition is completed or retried.", 409);
}

/**
 * @param {import("zod").output<typeof CreateNoteCollectionSchema> | import("zod").output<typeof UpdateNoteCollectionSchema>} payload
 * @param {WorkspaceRequestSession} session
 * @param {NoteCollectionRecord | null} [previous]
 */
async function normalizeCollectionPayload(payload, session, previous = null) {
  const now = new Date().toISOString();
  const title = normalizeRequiredText(payload.title ?? payload.name ?? previous?.title, "Collection name");
  const libraryBucket = normalizeLibraryBucket(
    payload.libraryBucket || payload.library_bucket || previous?.library_bucket || NOTE_LIBRARY_BUCKETS.REFERENCE,
    "Library bucket",
  );
  const parentSpecified = Object.hasOwn(payload, "parentCollectionId") || Object.hasOwn(payload, "parent_collection_id");
  const parentCollectionId = parentSpecified
    ? normalizeOptionalText(payload.parentCollectionId ?? payload.parent_collection_id)
    : previous?.parent_collection_id || "";
  if (previous && libraryBucket !== previous.library_bucket) {
    throw new AppError("Collection Library bucket cannot be changed by move or rename.", 400);
  }
  if (previous && parentCollectionId === previous.note_library_collection_id) {
    throw new AppError("A collection cannot be its own parent.", 400);
  }

  const allCollections = await listCollectionRecords(session.workspace_id, {
    includeArchived: true,
    includeDeleted: true,
    libraryBucket,
  });
  const parent = parentCollectionId
    ? allCollections.find((collection) => collection.note_library_collection_id === parentCollectionId) || null
    : null;
  if (parentCollectionId && (!parent || parent.status === "deleted")) throw new AppError("Parent collection not found.", 404);
  if (parent && parent.library_bucket !== libraryBucket) throw new AppError("Collection parent must be in the same Library bucket.", 400);
  if (previous && parent && collectionDescendants(previous, allCollections)
    .some((collection) => collection.note_library_collection_id === parent.note_library_collection_id)) {
    throw new AppError("Collection moves cannot create a cycle.", 400);
  }

  const metadata = normalizeMetadata(payload.metadata || payload.metadata_json || previous?.metadata || {});
  /** @type {NoteCollectionRecord} */
  const normalized = {
    ...(previous || emptyCollectionDefaults()),
    note_library_collection_id: previous?.note_library_collection_id || normalizeOptionalText(payload.noteLibraryCollectionId || payload.note_library_collection_id),
    workspace_id: session.workspace_id,
    title,
    slug: normalizeOptionalText(payload.slug) || (previous && title === previous.title ? previous.slug : slugifyNoteTitle(title)),
    description: normalizeOptionalText(payload.description ?? previous?.description),
    library_bucket: libraryBucket,
    parent_collection_id: parent?.note_library_collection_id || null,
    path_cache: collectionPath({ title }, parent),
    depth: parent ? parent.depth + 1 : 0,
    sort_order: Number(payload.sortOrder ?? payload.sort_order ?? previous?.sort_order ?? 0) || 0,
    collection_source: normalizeCollectionSource(payload.collectionSource || payload.collection_source || previous?.collection_source || "manual"),
    status: previous?.status || "active",
    created_by_user_id: previous?.created_by_user_id || session.user_id,
    updated_by_user_id: session.user_id,
    created_at: previous?.created_at || now,
    updated_at: now,
    archived_at: previous?.archived_at || null,
    deleted_at: previous?.deleted_at || null,
    metadata_json: JSON.stringify(metadata),
    metadata,
  };
  return normalized;
}

/** @returns {NoteCollectionRecord} */
function emptyCollectionDefaults() {
  return {
    note_library_collection_id: "", workspace_id: "", title: "", slug: "", description: null,
    library_bucket: "reference", parent_collection_id: null, path_cache: null, depth: 0, sort_order: 0,
    collection_source: "manual", status: "active", security_policy: "normal",
    security_transition_state: "stable", security_transition_action: "none", security_transition_version: 0,
    security_transition_job_id: null, security_transition_actor_user_id: null, security_transition_started_at: null,
    security_transition_error_code: null, created_by_user_id: "", updated_by_user_id: "", created_at: "",
    updated_at: "", archived_at: null, deleted_at: null, metadata_json: null, metadata: {},
    effective_security_mode: "normal", security_inherited: false, security_resolution_state: "resolved",
    security_source_catalog_id: null,
  };
}

/** @param {string} workspaceId @param {NoteCollectionRecord} collection @param {string} [currentCollectionId] */
async function assertCollectionSiblingAvailable(workspaceId, collection, currentCollectionId = "") {
  const siblings = await listCollectionRecords(workspaceId, {
    includeArchived: true,
    includeDeleted: false,
    libraryBucket: collection.library_bucket,
  });
  if (siblings.some((sibling) => (
    sibling.note_library_collection_id !== currentCollectionId &&
    sibling.slug === collection.slug &&
    (sibling.parent_collection_id || "") === (collection.parent_collection_id || "")
  ))) throw new AppError("A collection with that name already exists in this folder.", 400);
}

/** @param {WorkspaceRequestSession} session @param {NoteCollectionRecord} parent */
async function updateCollectionDescendantPaths(session, parent) {
  const allCollections = await listCollectionRecords(session.workspace_id, {
    includeArchived: true,
    includeDeleted: true,
    libraryBucket: parent.library_bucket,
  });
  const descendants = collectionDescendants(parent, allCollections);
  const byParentId = groupCollectionsByParent(allCollections);

  /** @param {NoteCollectionRecord} collection */
  async function updateChildren(collection) {
    for (const child of byParentId.get(collection.note_library_collection_id) || []) {
      if (child.status === "deleted") continue;
      const updated = await updateCollectionRecord(session.workspace_id, {
        ...child,
        path_cache: collectionPath(child, collection),
        depth: collection.depth + 1,
        updated_at: new Date().toISOString(),
        updated_by_user_id: session.user_id,
      });
      await syncCollectionNotesSearchIndex(session, [updated.note_library_collection_id], "note.collection.path_updated");
      await updateChildren(updated);
    }
  }
  if (descendants.length > 0) await updateChildren(parent);
}

/** @param {NoteCollectionRecord[]} collections @param {Map<string, number>} accessibleCounts @param {Map<string, number>} directCounts */
function buildCollectionTree(collections, accessibleCounts, directCounts) {
  const byParentId = groupCollectionsByParent(collections);
  /** @param {NoteCollectionRecord} collection @returns {NoteCollectionTreeNode} */
  function decorate(collection) {
    return {
      ...collection,
      accessibleNoteCount: accessibleCounts.get(collection.note_library_collection_id) || 0,
      directAccessibleNoteCount: directCounts.get(collection.note_library_collection_id) || 0,
      children: (byParentId.get(collection.note_library_collection_id) || []).map(decorate),
    };
  }
  return (byParentId.get("") || []).map(decorate);
}

/** @param {NoteCollectionRecord[]} collections */
function sortCollectionsForReadModel(collections) {
  const bucketOrder = new Map([
    [NOTE_LIBRARY_BUCKETS.ACTIVE_WORK, 0], [NOTE_LIBRARY_BUCKETS.ONGOING_AREA, 1],
    [NOTE_LIBRARY_BUCKETS.REFERENCE, 2],
  ]);
  return [...collections].sort((left, right) => (
    (bucketOrder.get(left.library_bucket) ?? 99) - (bucketOrder.get(right.library_bucket) ?? 99) ||
    String(left.path_cache || left.title).localeCompare(String(right.path_cache || right.title), undefined, { sensitivity: "base" }) ||
    left.sort_order - right.sort_order ||
    left.title.localeCompare(right.title, undefined, { sensitivity: "base" }) ||
    left.note_library_collection_id.localeCompare(right.note_library_collection_id)
  ));
}

/** @param {{ libraryBucket: NoteLibraryBucket | "" }} filters */
function collectionReadModelDefaults(filters) {
  return {
    libraries: {
      all: { label: /** @type {const} */ ("All Libraries"), value: /** @type {const} */ ("all") },
      buckets: [
        { label: "Active Work", value: /** @type {NoteLibraryBucket} */ (NOTE_LIBRARY_BUCKETS.ACTIVE_WORK) },
        { label: "Ongoing Areas", value: /** @type {NoteLibraryBucket} */ (NOTE_LIBRARY_BUCKETS.ONGOING_AREA) },
        { label: "Reference Library", value: /** @type {NoteLibraryBucket} */ (NOTE_LIBRARY_BUCKETS.REFERENCE) },
      ],
    },
    collections: {
      all: { label: /** @type {const} */ ("All collections"), value: /** @type {const} */ ("") },
      uncategorized: { label: /** @type {const} */ ("Uncategorized"), value: /** @type {const} */ ("__uncategorized") },
    },
    activeLibraryBucket: filters.libraryBucket || /** @type {const} */ ("all"),
  };
}

/** @param {NoteCollectionRecord[]} collections @param {Map<string, number>} directCounts */
function rollupCollectionCounts(collections, directCounts) {
  const byParentId = groupCollectionsByParent(collections);
  /** @type {Map<string, number>} */
  const rolledUpCounts = new Map();
  /** @param {NoteCollectionRecord} collection @returns {number} */
  function countSubtree(collection) {
    const collectionId = collection.note_library_collection_id;
    /** @type {number} */
    const childTotal = (byParentId.get(collectionId) || []).reduce((total, child) => total + countSubtree(child), 0);
    /** @type {number} */
    const total = (directCounts.get(collectionId) || 0) + childTotal;
    rolledUpCounts.set(collectionId, total);
    return total;
  }
  for (const collection of byParentId.get("") || []) countSubtree(collection);
  return rolledUpCounts;
}

/** @param {NoteCollectionRecord[]} collections */
function groupCollectionsByParent(collections) {
  /** @type {Map<string, NoteCollectionRecord[]>} */
  const groups = new Map();
  for (const collection of collections) {
    const parentId = collection.parent_collection_id || "";
    if (!groups.has(parentId)) groups.set(parentId, []);
    groups.get(parentId)?.push(collection);
  }
  return groups;
}

/** @param {NoteCollectionRecord} collection @param {NoteCollectionRecord[]} collections */
function collectionDescendants(collection, collections) {
  const byParentId = groupCollectionsByParent(collections);
  /** @type {NoteCollectionRecord[]} */
  const descendants = [];
  const stack = [...(byParentId.get(collection.note_library_collection_id) || [])];
  while (stack.length > 0) {
    const next = stack.shift();
    if (!next) continue;
    descendants.push(next);
    stack.push(...(byParentId.get(next.note_library_collection_id) || []));
  }
  return descendants;
}

/** @param {NoteCollectionRecord} collection @param {Map<string, NoteCollectionRecord>} byId @param {Set<string>} selectedIds */
function collectionHasSelectedAncestor(collection, byId, selectedIds) {
  let parentId = collection.parent_collection_id || "";
  const visited = new Set();
  while (parentId && !visited.has(parentId)) {
    if (selectedIds.has(parentId)) return true;
    visited.add(parentId);
    parentId = byId.get(parentId)?.parent_collection_id || "";
  }
  return false;
}

/** @param {NoteCollectionRecord} collection @returns {NoteCatalogSettingsRow} */
function shapeCatalogSettingsRow(collection) {
  return {
    catalogId: collection.note_library_collection_id,
    title: collection.title,
    description: collection.description || "",
    libraryBucket: collection.library_bucket,
    parentCatalogId: collection.parent_collection_id || null,
    path: collection.path_cache || collection.title,
    depth: collection.depth,
    sortOrder: collection.sort_order,
    source: collection.collection_source,
    status: collection.status,
    securityPolicy: collection.security_policy,
    effectiveSecurityMode: collection.effective_security_mode,
    securityInherited: collection.security_inherited,
    securityTransitionState: collection.security_transition_state,
    securityTransitionAction: collection.security_transition_action,
    securityTransitionVersion: collection.security_transition_version,
    securityTransitionJobId: collection.security_transition_job_id,
    securityTransitionStartedAt: collection.security_transition_started_at,
    securityTransitionErrorCode: collection.security_transition_error_code,
    updatedAt: collection.updated_at,
  };
}

/** @param {{ title: string }} collection @param {NoteCollectionRecord | null} [parent] */
function collectionPath(collection, parent = null) {
  return [parent?.path_cache, collection.title].filter(Boolean).join(" / ");
}

/** @param {unknown} rawQuery */
function normalizeCollectionListFilters(rawQuery) {
  const query = asObject(rawQuery);
  return {
    includeArchived: query.includeArchived === "true" || query.include_archived === "true",
    includeDeleted: query.includeDeleted === "true" || query.include_deleted === "true",
    libraryBucket: normalizeOptionalLibraryBucket(query.libraryBucket || query.library_bucket, "Library bucket"),
  };
}

/** @param {WorkspaceRequestSession} session @param {NoteCollectionRecord[]} collections */
function filterSupportViewCollections(session, collections) {
  if (!session.support_view) return collections;
  return collections.filter((collection) => (
    collection.effective_security_mode !== NOTE_SECURITY_MODES.SECURE &&
    collection.security_policy !== NOTE_SECURITY_MODES.SECURE
  ));
}

/** @param {WorkspaceRequestSession} session @param {string[]} collectionIds @param {string} reason */
async function syncCollectionNotesSearchIndex(session, collectionIds, reason) {
  for (const collectionId of [...new Set(collectionIds.filter(Boolean))]) {
    /** @type {NoteCollectionCountNote[]} */
    const notes = await notesRepository.list(session.workspace_id, { includeDeleted: false, noteCollectionId: collectionId });
    await searchIndexSyncService.reindexRecords(notes.map((note) => ({
      workspaceId: session.workspace_id,
      moduleId: NOTES_MODULE_ID,
      recordType: "note",
      recordId: note.note_id,
      reason,
    })));
  }
}

/** @param {NoteCollectionRecord} previous @param {NoteCollectionRecord} next @param {{ effectiveSecurityMode?: string }} prospectiveSecurity */
function collectionSecurityWasPreservedOnMove(previous, next, prospectiveSecurity) {
  return previous.parent_collection_id !== next.parent_collection_id &&
    previous.security_policy !== NOTE_SECURITY_MODES.SECURE &&
    previous.effective_security_mode === NOTE_SECURITY_MODES.SECURE &&
    prospectiveSecurity.effectiveSecurityMode === NOTE_SECURITY_MODES.NORMAL &&
    next.security_policy === NOTE_SECURITY_MODES.SECURE;
}

/** @param {import("zod").output<typeof NoteImportCollectionPathSchema>} payload */
function normalizeImportCollectionPathParts(payload) {
  const explicitPath = payload.path || payload.importPath || payload.import_path || payload.importSourcePath || payload.import_source_path;
  const parts = Array.isArray(payload.parts) ? payload.parts : [
    payload.originalNotebook || payload.original_notebook,
    payload.originalSectionGroup || payload.original_section_group,
    payload.originalSection || payload.original_section,
  ];
  const normalized = (explicitPath ? String(explicitPath).split(/[\\/]+|>/) : parts)
    .map(normalizeOptionalText)
    .filter(Boolean);
  if (normalized.length === 0) throw new AppError("Import collection path is required.", 400);
  return normalized;
}

/** @param {unknown} value */
function normalizeIdList(value) {
  if (Array.isArray(value)) return value.map(normalizeOptionalText).filter(Boolean);
  return normalizeOptionalText(value).split(",").map((item) => item.trim()).filter(Boolean);
}

/** @param {unknown} value @param {string} label */
function normalizeRequiredText(value, label) {
  const text = normalizeOptionalText(value);
  if (!text) throw new AppError(`${label} is required.`, 400);
  return text;
}

/** @param {unknown} value */
function normalizeOptionalText(value) {
  return value === null || value === undefined ? "" : String(value).trim();
}

/** @param {unknown} value @param {string} label @returns {NoteLibraryBucket} */
function normalizeLibraryBucket(value, label) {
  const text = normalizeOptionalText(value);
  if (!LIBRARY_BUCKET_VALUES.has(text)) throw new AppError(`${label} '${text || "<empty>"}' is not supported.`, 400);
  return /** @type {NoteLibraryBucket} */ (text);
}

/** @param {unknown} value @param {string} label @returns {NoteLibraryBucket | ""} */
function normalizeOptionalLibraryBucket(value, label) {
  const text = normalizeOptionalText(value);
  return text ? normalizeLibraryBucket(text, label) : "";
}

/** @param {unknown} value @returns {"archive" | "restore"} */
function normalizeCatalogBulkAction(value) {
  const text = normalizeOptionalText(value);
  if (!CATALOG_BULK_ACTIONS.has(text)) throw new AppError(`Catalog bulk action '${text || "<empty>"}' is not supported.`, 400);
  return /** @type {"archive" | "restore"} */ (text);
}

/** @param {unknown} value @returns {import("../../types/notes-collections-contracts.js").NoteCollectionSource} */
function normalizeCollectionSource(value) {
  const text = normalizeOptionalText(value);
  if (!COLLECTION_SOURCE_VALUES.has(text)) throw new AppError(`Collection source '${text || "<empty>"}' is not supported.`, 400);
  return /** @type {import("../../types/notes-collections-contracts.js").NoteCollectionSource} */ (text);
}

/** @param {unknown} value @returns {NoteCollectionMetadata} */
function normalizeMetadata(value) {
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return isMetadata(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return isMetadata(value) ? value : {};
}

/** @param {unknown} value @returns {value is NoteCollectionMetadata} */
function isMetadata(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** @param {unknown} value @returns {Record<string, unknown>} */
function asObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? /** @type {Record<string, unknown>} */ (value)
    : {};
}

/** @param {NoteCollectionRecord | undefined} collection @returns {collection is NoteCollectionRecord} */
function isCollectionRecord(collection) {
  return Boolean(collection);
}

/** @param {string} workspaceId @param {{ includeArchived?: boolean; includeDeleted?: boolean; libraryBucket?: NoteLibraryBucket | "" }} filters */
async function listCollectionRecords(workspaceId, filters) {
  return /** @type {Promise<NoteCollectionRecord[]>} */ (notesRepository.listCollections(workspaceId, filters));
}

/** @param {string} workspaceId @param {string} collectionId */
async function readCollectionRecord(workspaceId, collectionId) {
  const record = await /** @type {Promise<NoteCollectionRecord | null>} */ (notesRepository.readCollectionById(workspaceId, collectionId));
  if (!record) throw new AppError("Note collection not found.", 404);
  return record;
}

/** @param {string} workspaceId @param {NoteCollectionRecord} collection */
async function createCollectionRecord(workspaceId, collection) {
  const record = await /** @type {Promise<NoteCollectionRecord | null>} */ (notesRepository.createCollection(workspaceId, collection));
  if (!record) throw new AppError("Note collection could not be created.", 500);
  return record;
}

/** @param {string} workspaceId @param {NoteCollectionRecord} collection */
async function updateCollectionRecord(workspaceId, collection) {
  const record = await /** @type {Promise<NoteCollectionRecord | null>} */ (notesRepository.updateCollection(workspaceId, collection));
  if (!record) throw new AppError("Note collection could not be updated.", 409);
  return record;
}

export { createNotesCollectionsService };
