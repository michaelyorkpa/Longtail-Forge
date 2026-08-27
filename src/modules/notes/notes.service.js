import { notesRepository } from "./notes.repo.js";
import {
  CreateNoteSchema,
  NoteBulkUpdateSchema,
  NoteCollectionAssignmentSchema,
  NoteLibraryChangeSchema,
  NoteLinkSchema,
  NoteMarkdownPreviewSchema,
  UpdateNoteSchema,
  parseNotesEdgePayload,
} from "./notes.contracts.js";
import {
  NOTE_IMPORT_METADATA_FIELDS,
  NOTE_PERMISSIONS,
  canAccessNote,
  normalizeNoteVisibilityForWorkspace,
  sanitizeNoteLifecyclePayload,
} from "./access-policy.js";
import {
  NOTE_LIBRARY_BUCKET_LABELS,
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
import { isEffectivelySecureNote } from "./effective-security.js";
import {
  assertNoteConsumerAccess,
  canExposeNoteToConsumer,
} from "./consumer-policy.js";
import { noteConsumerArtifactsService } from "./consumer-artifacts.service.js";
import { linkTargetDirectory } from "./link-target-directory.service.js";
import { createNotesCollectionsService } from "./notes-collections.service.js";
import { modulesService } from "../../core/modules/modules.service.js";
import { auditService } from "../../core/audit.js";
import { createRecordId } from "../../core/identifiers.js";
import { createVisibleRecordBatch, groupRowsByRecordId } from "../../core/list-enrichment.js";
import { permissionsService } from "../../core/permissions.js";
import { AppError } from "../../core/errors.js";
import { tagsService } from "../../services/tags.service.js";
import { searchIndexSyncService } from "../../services/search-index-sync.service.js";
import { usersRepository } from "../../repositories/users.repo.js";
import { workspacesRepository } from "../../repositories/workspaces.repo.js";
import { normalizeWorkspaceType } from "../../utils/workspaces.js";
import {
  resolveClientProjectFilterScope,
} from "../../core/client-project-filter-scope.js";

/** @typedef {import("../../types/notes-domain-contracts.js").NotePersistenceInput} NotePersistenceInput */
/** @typedef {import("../../types/notes-domain-contracts.js").NoteRecord} NoteRecord */
/** @typedef {import("../../types/notes-domain-contracts.js").NoteLinkRecord} NoteLinkRecord */
/** @typedef {import("../../types/notes-domain-contracts.js").NoteRevisionRecord} NoteRevisionRecord */
/** @typedef {import("../../types/notes-domain-contracts.js").NoteRevisionPersistenceInput} NoteRevisionPersistenceInput */
/** @typedef {import("../../types/notes-domain-contracts.js").NotesServiceAuditValue} NotesServiceAuditValue */
/** @typedef {import("../../types/notes-domain-contracts.js").NotesServiceCandidateBatch} NotesServiceCandidateBatch */
/** @typedef {import("../../types/notes-domain-contracts.js").NotesServiceClientScope} NotesServiceClientScope */
/** @typedef {import("../../types/notes-domain-contracts.js").NotesServiceContextRecord} NotesServiceContextRecord */
/** @typedef {import("../../types/notes-domain-contracts.js").NotesServiceDecoratedLink} NotesServiceDecoratedLink */
/** @typedef {import("../../types/notes-domain-contracts.js").NotesServiceLinkContext} NotesServiceLinkContext */
/** @typedef {import("../../types/notes-domain-contracts.js").NotesServiceLinkedContextAccessCache} NotesServiceLinkedContextAccessCache */
/** @typedef {import("../../types/notes-domain-contracts.js").NotesServiceLinkLike} NotesServiceLinkLike */
/** @typedef {import("../../types/notes-domain-contracts.js").NotesServiceLinkTargetClientContext} NotesServiceLinkTargetClientContext */
/** @typedef {import("../../types/notes-domain-contracts.js").NotesServiceLinkTargetType} NotesServiceLinkTargetType */
/** @typedef {import("../../types/notes-domain-contracts.js").NotesServiceEventMetadata} NotesServiceEventMetadata */
/** @typedef {import("../../types/notes-domain-contracts.js").NotesServiceListFilters} NotesServiceListFilters */
/** @typedef {import("../../types/notes-domain-contracts.js").NotesLibraryBucket} NotesLibraryBucket */
/** @typedef {import("../../types/notes-domain-contracts.js").NotesServiceModuleState} NotesServiceModuleState */
/** @typedef {import("../../types/notes-domain-contracts.js").NotesServiceNote} NotesServiceNote */
/** @typedef {import("../../types/notes-domain-contracts.js").NotesServiceNoteLike} NotesServiceNoteLike */
/** @typedef {import("../../types/notes-domain-contracts.js").NotesServiceOptions} NotesServiceOptions */
/** @typedef {import("../../types/notes-domain-contracts.js").NotesServicePagination} NotesServicePagination */
/** @typedef {import("../../types/notes-domain-contracts.js").NotesServicePayload} NotesServicePayload */
/** @typedef {import("../../types/notes-domain-contracts.js").NotesServicePropagationOptions} NotesServicePropagationOptions */
/** @typedef {import("../../types/notes-domain-contracts.js").NotesServiceQuery} NotesServiceQuery */
/** @typedef {import("../../types/notes-domain-contracts.js").NotesServiceRevisionLike} NotesServiceRevisionLike */
/** @typedef {import("../../types/notes-domain-contracts.js").NotesServiceSession} NotesServiceSession */
/** @typedef {import("../../types/notes-domain-contracts.js").NotesServiceTag} NotesServiceTag */
/** @typedef {import("../../types/notes-domain-contracts.js").NotesServiceTarget} NotesServiceTarget */
/** @typedef {import("../../types/notes-domain-contracts.js").NotesServiceTargetContext} NotesServiceTargetContext */
/** @typedef {import("../../types/notes-domain-contracts.js").NotesServiceWritableNote} NotesServiceWritableNote */
/** @typedef {import("../../types/notes-domain-contracts.js").NotesWorkspaceSession} NotesWorkspaceSession */
/** @typedef {import("../../types/link-target-directory-contracts.js").LinkTargetAccessCache} LinkTargetAccessCache */
/** @typedef {import("../../types/link-target-directory-contracts.js").LinkTarget} LinkTarget */
/** @typedef {import("../../types/link-target-directory-contracts.js").LinkTargetType} LinkTargetType */

const NOTES_MODULE_ID = "notes";
/**
 * The runtime spelling of the published `LinkTargetType` union. These seven members and that
 * union are the same list; `isLinkTargetType` is what lets the compiler see that.
 * @type {ReadonlySet<string>}
 */
const LINK_TARGET_TYPES = new Set(["workspace", "client", "project", "task", "note", "list", "user"]);
const LINK_TARGET_CLIENT_SCOPED_TYPES = new Set(["client", "project", "task", "note", "list"]);
const NOTE_TYPE_VALUES = new Set([...Object.values(NOTE_TYPES), ...Object.values(LEGACY_NOTE_TYPES)]);
const LIBRARY_BUCKET_VALUES = new Set(Object.values(NOTE_LIBRARY_BUCKETS));
const LIBRARY_BUCKET_SOURCE_VALUES = new Set(Object.values(NOTE_LIBRARY_BUCKET_SOURCES));
const NOTE_STATUS_VALUES = new Set(Object.values(NOTE_STATUSES));
const NOTE_VISIBILITY_VALUES = new Set(Object.values(NOTE_VISIBILITIES));
const NOTE_SECURITY_MODE_VALUES = new Set(Object.values(NOTE_SECURITY_MODES));
const NOTE_PERMISSION_VALUES = Object.values(NOTE_PERMISSIONS);
const LINKED_NOTE_SORT_MODES = new Set(["pinned", "recent", "updated", "title"]);
const NOTE_LIST_SORT_MODES = new Set([
  "title_asc",
  "title_desc",
  "created_desc",
  "created_asc",
  "updated_desc",
  "updated_asc",
  "library_collection_updated_desc",
  "note_kind_updated_desc",
  "primary_context_updated_desc",
]);
const SECURE_NOTE_TITLE_WARNING = "Secure note titles are visible to users who can view note metadata. Do not put secrets in the title.";
const NOTE_TARGET_TITLE_MAX_LENGTH = 20;
const NOTE_LIST_DEFAULT_PAGE_SIZE = 50;
const NOTE_LIST_MAX_PAGE_SIZE = 200;
const NOTE_LIST_BATCH_MULTIPLIER = 5;
const NOTE_LIST_MAX_CANDIDATE_SCAN = 1000;
const notesCollectionsService = createNotesCollectionsService({
  async listAccessibleNotes(session, filters) {
    return (await filterAccessibleNotes(session, await notesRepository.list(session.workspace_id, filters))).map((note) => ({
      note_id: String(note.note_id || ""),
      note_collection_id: normalizeOptionalText(note.note_collection_id) || null,
    }));
  },
  async recordAudit(session, action, changeType, previousValue, newValue) {
    await recordNoteAudit(session, action, changeType, previousValue, newValue, "note_library");
  },
});

/**
 * @param {NotesServiceSession} session
 * @param {NotesServiceQuery} query
 */
async function list(session, query = {}) {
  return queryNotesList(session, query, { paginate: true });
}

/**
 * @param {NotesServiceSession} session
 * @param {NotesServiceQuery} query
 */
async function listAll(session, query = {}) {
  return queryNotesList(session, query);
}

/**
 * @param {NotesServiceSession} session
 * @param {NotesServiceQuery} query
 * @param {NotesServiceOptions} options
 */
async function queryNotesList(session, query = {}, options = {}) {
  const filters = await normalizeNoteListQuery(session, query);
  const pagination = normalizeNoteListPagination(query, options);
  const notes = [];
  let offset = pagination?.offset || 0;
  let hasMoreCandidates = false;
  let nextCursor = "";
  let scannedCandidates = 0;

  do {
    const batchLimit = pagination
      ? Math.min(
          NOTE_LIST_MAX_CANDIDATE_SCAN - scannedCandidates,
          Math.max(pagination.pageSize * NOTE_LIST_BATCH_MULTIPLIER, pagination.pageSize + 1),
        )
      : 0;
    const result = await notesRepository.queryList(session.workspace_id, {
      ...filters,
      limit: batchLimit,
      offset,
    });
    const candidates = result.notes || [];

    if (candidates.length === 0) {
      hasMoreCandidates = false;
      break;
    }

    const filteredNotes = await filterAndShapeNoteListCandidates({
      candidates,
      filters,
      offset,
      session,
    });

    for (const note of filteredNotes) {
      const rawCandidateOffset = Number(note.__candidateOffset);
      const candidateOffset = Number.isInteger(rawCandidateOffset) && rawCandidateOffset >= 0
        ? rawCandidateOffset
        : offset;
      notes.push(stripNoteListCandidateMetadata(note));

      if (pagination && notes.length >= pagination.pageSize) {
        const moreCandidatesInBatch = candidateOffset < offset + candidates.length - 1;
        hasMoreCandidates = moreCandidatesInBatch || Boolean(result.hasMore);
        nextCursor = hasMoreCandidates ? encodeNoteListCursor(candidateOffset + 1) : "";
        return noteListResult(notes, pagination, nextCursor);
      }
    }

    scannedCandidates += candidates.length;
    offset = result.nextOffset;
    hasMoreCandidates = Boolean(result.hasMore) && (!pagination || scannedCandidates < NOTE_LIST_MAX_CANDIDATE_SCAN);
  } while (pagination && hasMoreCandidates && notes.length < pagination.pageSize);

  nextCursor = pagination && hasMoreCandidates ? encodeNoteListCursor(offset) : "";
  return noteListResult(notes, pagination, nextCursor);
}

/**
 * @param {NotesServiceSession} session
 */
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

/**
 * @param {string} noteId
 * @param {NotesServiceSession} session
 */
async function read(noteId, session) {
  const note = await readNoteOrThrow(session, noteId);
  await assertCanAccess(session, note, "read");
  assertNoteReadConsumerAccess(note, session);

  return { note: await shapeNoteForWorkspaceRead(session, await attachNoteIntegrations(session, await decryptSecureNoteForRead(session, note)), { includeBodyHtml: true }) };
}

/**
 * @param {unknown} rawPayload
 * @param {NotesWorkspaceSession} session
 */
async function previewMarkdown(rawPayload, session) {
  await assertNotesWriteEnabled(session);
  const canPreview = await permissionsService.canInAnyScope(session, NOTE_PERMISSIONS.CREATE) ||
    await permissionsService.canInAnyScope(session, NOTE_PERMISSIONS.UPDATE);

  if (!canPreview) {
    throw new AppError("You do not have permission to preview note Markdown.", 403);
  }

  const payload = parseNotesEdgePayload(NoteMarkdownPreviewSchema, rawPayload);
  const bodyMarkdown = assertSafeMarkdown(String(payload?.body_markdown ?? payload?.bodyMarkdown ?? ""));

  return {
    bodyFormat: "markdown",
    bodyMarkdown,
    bodyHtml: renderMarkdownToSafeHtml(bodyMarkdown),
    bodyHtmlFormat: "html",
  };
}

/**
 * @param {unknown} rawPayload
 * @param {NotesWorkspaceSession} session
 */
async function create(rawPayload, session) {
  await assertNotesWriteEnabled(session);
  const payload = parseNotesEdgePayload(CreateNoteSchema, rawPayload);
  const normalized = await normalizeNotePayload(payload, session);
  await assertSecureNoteCanBePersisted(session, normalized);
  await assertLinkedContextAccess(session, normalized);
  await assertNoteCollectionAccess(session, normalized);
  await assertCanAccess(session, normalized, "create");

  const stagedLinks = await prepareCreateLinksFromPayload(session, normalized, payload);
  const initialRevision = normalized.security_inherited
    ? createEncryptedRevisionSnapshot(normalized, {
        changeSummary: "Secure note created.",
        changedByUserId: session.user_id,
        revisionNumber: 1,
      })
    : null;
  const note = await notesRepository.createWithLinks(session.workspace_id, normalized, stagedLinks, { initialRevision });
  await saveTargetTags(session, note.note_id, payload);
  await requestTagPropagationRefresh(session, "note", note.note_id, "note.created_with_context");
  const noteWithLinks = await attachNoteIntegrations(session, await decryptSecureNoteForRead(session, note));
  await recordNoteAudit(session, "note_created", "create", null, noteWithLinks);
  await emitNoteEvent("note.created", session, null, noteWithLinks);
  await syncNoteSearchIndex(session.workspace_id, note.note_id, "note.created");

  return {
    note: await shapeNoteForWorkspaceRead(session, noteWithLinks, { includeBodyHtml: true }),
    searchDocument: createSearchIndexPayload(noteWithLinks),
  };
}

/**
 * @param {string} noteId
 * @param {unknown} rawPayload
 * @param {NotesWorkspaceSession} session
 */
async function update(noteId, rawPayload, session) {
  await assertNotesWriteEnabled(session);
  const previousNote = await readNoteOrThrow(session, noteId);
  await assertCanAccess(session, previousNote, "update");
  const payload = parseNotesEdgePayload(UpdateNoteSchema, rawPayload);
  return updateValidatedNote(noteId, payload, session, previousNote);
}

/**
 * @param {string} noteId
 * @param {import("zod").output<typeof UpdateNoteSchema> | Partial<NotePersistenceInput>} payload
 * @param {NotesWorkspaceSession} session
 * @param {NotesServiceNoteLike} previousNote
 */
async function updateValidatedNote(noteId, payload, session, previousNote) {
  const nextNote = {
    ...await normalizeNotePayload(payload, session, previousNote),
    note_id: noteId,
  };
  await assertSecureNoteCanBePersisted(session, nextNote, previousNote);
  await assertLinkedContextAccess(session, nextNote);
  await assertNoteCollectionAccess(session, nextNote);
  await assertCanAccess(session, nextNote, "update");

  const becameEffectivelySecure = !isEffectivelySecureNote(previousNote) && isEffectivelySecureNote(nextNote);
  /** @type {(NoteRevisionPersistenceInput & { note_revision_id: string }) | null} */
  let transitionRevision = null;
  let note;
  if (becameEffectivelySecure) {
    const revisions = await notesRepository.listRevisions(session.workspace_id, noteId);
    const securedRevisions = revisions.map((revision) => createEncryptedStoredRevision(revision));
    transitionRevision = createEncryptedRevisionSnapshot(previousNote, {
      changeSummary: "Note moved into an effectively secure catalog.",
      changedByUserId: session.user_id,
      revisionNumber: await notesRepository.nextRevisionNumber(session.workspace_id, noteId),
    });
    note = await notesRepository.secureNoteAndRevisions(
      session.workspace_id,
      nextNote,
      securedRevisions,
      transitionRevision,
    );
  } else {
    note = await notesRepository.update(session.workspace_id, nextNote);
    await maybeCreateRevision(session, previousNote, note, "Note updated.");
  }
  if (isEffectivelySecureNote(note)) {
    await noteConsumerArtifactsService.removeExcludedConsumerArtifacts(session.workspace_id, [noteId]);
  }
  await saveTargetTags(session, note.note_id, payload);
  if (noteContextChanged(previousNote, note)) {
    await requestTagPropagationRefresh(session, "note", note.note_id, "note.context_changed");
  }
  const noteWithLinks = await attachNoteIntegrations(session, await decryptSecureNoteForRead(session, note));
  await recordNoteAudit(session, "note_updated", "update", previousNote, noteWithLinks);
  if (noteSecurityWasPreservedOnMove(previousNote, noteWithLinks)) {
    await recordNoteAudit(session, "note_security_preserved_on_move", "update", previousNote, noteWithLinks);
  }
  await emitNoteEvent("note.updated", session, previousNote, noteWithLinks);
  if (transitionRevision) {
    await emitNoteEvent("note.revision_created", session, previousNote, noteWithLinks, {
      revision_id: transitionRevision.note_revision_id,
      revision_number: transitionRevision.revision_number,
    });
  }
  await emitChangeEvents(session, previousNote, noteWithLinks);
  await syncNoteSearchIndex(session.workspace_id, note.note_id, "note.updated");

  return {
    note: await shapeNoteForWorkspaceRead(session, noteWithLinks, { includeBodyHtml: true }),
    searchDocument: createSearchIndexPayload(noteWithLinks),
  };
}

/**
 * @param {string} noteId
 * @param {unknown} payload
 * @param {NotesWorkspaceSession} session
 */
async function changeLibrary(noteId, payload, session) {
  const previousNote = await readNoteOrThrow(session, noteId);
  await assertCanAccess(session, previousNote, "update");
  const parsedPayload = parseNotesEdgePayload(NoteLibraryChangeSchema, payload);
  const nextBucket = normalizeEnum(parsedPayload?.libraryBucket || parsedPayload?.library_bucket, LIBRARY_BUCKET_VALUES, "Library bucket");
  await assertNotesWriteEnabled(session);

  return updateValidatedNote(noteId, {
    ...previousNote,
    library_bucket: nextBucket,
    library_bucket_source: NOTE_LIBRARY_BUCKET_SOURCES.MANUAL,
    note_collection_id: previousNote.library_bucket === nextBucket ? previousNote.note_collection_id : null,
  }, session, previousNote);
}

/**
 * @param {string} noteId
 * @param {NotesWorkspaceSession} session
 */
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
  return { note: await shapeNoteForWorkspaceRead(session, note) };
}

/**
 * @param {string} noteId
 * @param {NotesWorkspaceSession} session
 */
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
  return { note: await shapeNoteForWorkspaceRead(session, note) };
}

/**
 * @param {string} noteId
 * @param {NotesWorkspaceSession} session
 */
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
  return { note: await shapeNoteForWorkspaceRead(session, note) };
}

/**
 * @param {string} noteId
 * @param {NotesWorkspaceSession} session
 */
async function listRevisions(noteId, session) {
  const note = await readNoteOrThrow(session, noteId);
  await assertCanAccess(session, note, "view_history");
  assertNoteReadConsumerAccess(note, session, "notes.revisions");

  const revisions = await notesRepository.listRevisions(session.workspace_id, noteId);
  return { revisions: visibleRevisionSnapshots(revisions, note).map((revision) => shapeRevisionForBrowser(revision, { includeBody: false })) };
}

/**
 * @param {string} noteId
 * @param {string} revisionId
 * @param {NotesWorkspaceSession} session
 */
async function readRevision(noteId, revisionId, session) {
  const note = await readNoteOrThrow(session, noteId);
  await assertCanAccess(session, note, "view_history");
  assertNoteReadConsumerAccess(note, session, "notes.revisions");
  const revision = await notesRepository.readRevisionById(session.workspace_id, noteId, revisionId);

  if (!revision) {
    throw new AppError("Note revision not found.", 404);
  }

  return { revision: shapeRevisionForBrowser(decryptSecureRevisionForRead(revision), { includeBody: true }) };
}

/**
 * @param {string} noteId
 * @param {string} revisionId
 * @param {NotesWorkspaceSession} session
 */
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
    visibility: await normalizeNoteVisibilityForWrite(session, revision.visibility, { explicit: true }),
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
    note: await shapeNoteForWorkspaceRead(session, await attachNoteIntegrations(session, await decryptSecureNoteForRead(session, note)), { includeBodyHtml: true }),
    restoredRevision: shapeRevisionForBrowser(decryptSecureRevisionForRead(revision), { includeBody: false }),
  };
}

/**
 * @param {string} noteId
 * @param {NotesWorkspaceSession} session
 */
async function listLinks(noteId, session) {
  const note = await readNoteOrThrow(session, noteId);
  await assertCanAccess(session, note, "read");
  assertNoteReadConsumerAccess(note, session, "notes.relationships");

  return { links: await notesRepository.listLinks(session.workspace_id, noteId) };
}

/**
 * @param {NotesWorkspaceSession} session
 * @param {NotesServiceQuery} query
 */
async function listCollections(session, query = {}) {
  return notesCollectionsService.listCollections(session, query);
}

/**
 * @param {unknown} rawPayload
 * @param {NotesWorkspaceSession} session
 */
async function createCollection(rawPayload, session) {
  return notesCollectionsService.createCollection(rawPayload, session);
}

/**
 * @param {string} collectionId
 * @param {unknown} rawPayload
 * @param {NotesWorkspaceSession} session
 */
async function updateCollection(collectionId, rawPayload, session) {
  return notesCollectionsService.updateCollection(collectionId, rawPayload, session);
}

/**
 * @param {string} collectionId
 * @param {unknown} rawPayload
 * @param {NotesWorkspaceSession} session
 */
async function moveCollection(collectionId, rawPayload, session) {
  return notesCollectionsService.moveCollection(collectionId, rawPayload, session);
}

/**
 * @param {string} collectionId
 * @param {NotesWorkspaceSession} session
 */
async function archiveCollection(collectionId, session) {
  return notesCollectionsService.archiveCollection(collectionId, session);
}

/**
 * @param {string} collectionId
 * @param {NotesWorkspaceSession} session
 */
async function restoreCollection(collectionId, session) {
  return notesCollectionsService.restoreCollection(collectionId, session);
}

/**
 * @param {string} collectionId
 * @param {NotesWorkspaceSession} session
 */
async function deleteEmptyCollection(collectionId, session) {
  return notesCollectionsService.deleteEmptyCollection(collectionId, session);
}

/**
 * @param {string} noteId
 * @param {unknown} payload
 * @param {NotesWorkspaceSession} session
 */
async function assignNoteCollection(noteId, payload, session) {
  const previousNote = await readNoteOrThrow(session, noteId);
  await assertCanAccess(session, previousNote, "update");
  const parsedPayload = parseNotesEdgePayload(NoteCollectionAssignmentSchema, payload);
  const noteCollectionId = normalizeOptionalText(parsedPayload.noteCollectionId ?? parsedPayload.note_collection_id ?? parsedPayload.collectionId ?? parsedPayload.collection_id);
  await assertNotesWriteEnabled(session);

  return updateValidatedNote(noteId, {
    note_collection_id: noteCollectionId || null,
  }, session, previousNote);
}

/**
 * @param {NotesWorkspaceSession} session
 * @param {unknown} rawPayload
 */
async function ensureCollectionsForImportPath(session, rawPayload) {
  return notesCollectionsService.ensureCollectionsForImportPath(session, rawPayload);
}

/**
 * @param {NotesWorkspaceSession} session
 * @param {string} noteId
 * @param {import("../../types/notes-domain-contracts.js").NoteAccessOperation} operation
 */
async function readForAttachmentAccess(session, noteId, operation = "read") {
  const note = await readNoteOrThrow(session, noteId);
  await assertCanAccess(session, note, operation);
  if (!canExposeNoteToConsumer(note, "notes.attachments")) {
    throw new AppError("Secure notes do not allow framework file attachments yet.", 403);
  }
  return note;
}

/**
 * @param {NotesServiceSession} session
 * @param {NotesServiceOptions} options
 */
async function listConsumerSummaries(session, options = {}) {
  const consumerId = normalizeRequiredText(options.consumerId || options.consumer_id, "Notes consumer ID");
  const noteIds = [...new Set(normalizeIdList(options.noteIds || options.note_ids))];
  const notes = noteIds.length > 0
    ? await notesRepository.readByIds(session.workspace_id, noteIds)
    : await notesRepository.list(session.workspace_id, {});
  const accessible = await filterAccessibleNotes(session, notes);

  return accessible
    .filter((note) => canExposeNoteToConsumer(note, consumerId, { authorized: true }))
    .map(shapeConsumerNoteSummary);
}

/**
 * @param {string} noteId
 * @param {NotesServiceSession} session
 * @param {string} consumerId
 */
async function readConsumerSummary(noteId, session, consumerId) {
  const note = await readNoteOrThrow(session, noteId);
  await assertCanAccess(session, note, "read");
  assertNoteConsumerAccess(note, consumerId, { authorized: true });
  return shapeConsumerNoteSummary(note);
}

/**
 * @param {string} noteId
 * @param {unknown} rawPayload
 * @param {NotesWorkspaceSession} session
 */
async function createLink(noteId, rawPayload, session) {
  await assertNotesWriteEnabled(session);
  const note = await readNoteOrThrow(session, noteId);
  await assertCanAccess(session, note, "manage_links");
  const payload = parseNotesEdgePayload(NoteLinkSchema, rawPayload);
  const link = normalizeLinkPayload(payload, noteId, session);
  await assertTargetAccess(session, link);
  const createdLink = await notesRepository.createLink(session.workspace_id, link);
  await requestTagPropagationRefresh(session, "note", note.note_id, "note.link_created");
  await recordNoteAudit(session, "note_link_created", "create", null, createdLink, "note_link");
  await emitNoteEvent("note.linked", session, null, note, { link: createdLink });
  await syncNoteSearchIndex(session.workspace_id, note.note_id, "note.linked");

  return { link: createdLink };
}

/**
 * @param {string} noteId
 * @param {string} noteLinkId
 * @param {NotesWorkspaceSession} session
 */
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

/**
 * @param {NotesWorkspaceSession} session
 * @param {string} taskId
 */
async function readTaskLinkedNotePropagationStructure(session, taskId) {
  if (!(await canManageLinkedNotePropagation(session))) {
    return {
      links: [],
      skipped: true,
    };
  }

  const target = normalizeTarget({
    module_id: "tasks",
    target_type: "task",
    target_id: taskId,
  });
  await assertTargetAccess(session, target);

  const links = await notesRepository.listLinksForTarget(session.workspace_id, target);
  const accessibleNoteIds = await accessibleNoteIdSetForLinks(session, links);

  return {
    links: links
      .filter((link) => accessibleNoteIds.has(link.note_id))
      .map((link, index) => ({
        link_role: link.link_role || "related",
        note_id: link.note_id,
        scope_role: link.scope_role || "related",
        sort_order: (index + 1) * 1000,
      })),
    skipped: false,
  };
}

/**
 * @param {NotesWorkspaceSession} session
 */
async function listCatalogSettings(session) {
  return notesCollectionsService.listCatalogSettings(session);
}

/**
 * @param {unknown} rawPayload
 * @param {NotesWorkspaceSession} session
 */
async function bulkManageCatalogs(rawPayload, session) {
  return notesCollectionsService.bulkManageCatalogs(rawPayload, session);
}

/**
 * @param {unknown} rawPayload
 * @param {NotesWorkspaceSession} session
 */
async function bulkUpdate(rawPayload, session) {
  await assertNotesWriteEnabled(session);
  const payload = parseNotesEdgePayload(NoteBulkUpdateSchema, rawPayload);
  const noteIds = [...new Set(normalizeIdList(payload?.noteIds || payload?.note_ids || []))];
  if (noteIds.length === 0) {
    throw new AppError("Select at least one note to update.", 400);
  }
  if (noteIds.length > 100) {
    throw new AppError("Notes bulk editing supports at most 100 notes at a time.", 400);
  }

  const changes = await normalizeNoteBulkChanges(payload?.changes || payload, session);
  const notes = [];
  const errors = [];

  for (const noteId of noteIds) {
    try {
      const previousNote = await readNoteOrThrow(session, noteId);
      await assertCanAccess(session, previousNote, "update");
      const result = await updateValidatedNote(noteId, changes, session, previousNote);
      notes.push(result.note);
    } catch (error) {
      errors.push({
        note_id: noteId,
        message: error instanceof Error && error.message ? error.message : "Note could not be updated.",
        status: readErrorStatus(error),
      });
    }
  }

  return { notes, errors };
}

/**
 * @param {NotesWorkspaceSession} session
 * @param {NotesServicePropagationOptions} arg2
 */
async function replacePropagatedTaskLinkedNotes(session, { taskId, templateId, links = [], sourceTaskId = "" } = {}) {
  if (!(await canManageLinkedNotePropagation(session))) {
    return {
      createdCount: 0,
      removedCount: 0,
      skipped: true,
    };
  }

  const target = normalizeTarget({
    module_id: "tasks",
    target_type: "task",
    target_id: taskId,
  });
  await assertTargetAccess(session, target);

  const accessibleNoteIds = await accessibleNoteIdSetForLinks(session, links);
  const safeLinks = links.filter((link) => accessibleNoteIds.has(link.note_id || link.noteId));
  const result = await notesRepository.replacePropagatedLinksForTarget(session.workspace_id, target, safeLinks, {
    created_by_user_id: session.user_id,
    recurrence_template_id: templateId,
    source_task_id: sourceTaskId,
  });
  await finalizePropagatedNoteLinkChanges(session, result);

  return {
    createdCount: result.createdLinks.length,
    removedCount: result.removedLinks.length,
    skipped: false,
  };
}

/**
 * @param {NotesWorkspaceSession} session
 * @param {NotesServiceQuery} query
 */
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

/**
 * @param {NotesWorkspaceSession} session
 * @param {NotesServiceQuery} query
 */
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
      workbenchFeed: "0.33.6",
      ranking: "0.33.5.9",
      dismissal: "0.33.5.9",
    },
    count: candidates.length,
    candidates,
  };
}

/**
 * @param {NotesWorkspaceSession} session
 * @param {NotesServiceQuery} query
 *
 * The return is deliberately left to inference. Every element is fully populated at runtime,
 * but the merged array mixes this module's `LinkTarget` output with whatever
 * `linkTargetDirectory.list` returns, and that directory still *declares*
 * `LinkTargetCandidate[]` - the mostly-optional member - even though its providers populate
 * every field. Annotating the union here would resolve member access to the weaker branch and
 * make three behavioural regressions read fields as possibly-undefined. `0.33.33.36` records
 * that as the remaining half of the seam: strengthening the directory's declared return to
 * `LinkTarget[]` is a published-contract change across every provider, not a producer fix.
 */
async function listLinkTargets(session, query = {}) {
  await permissionsService.assertCanInAnyScope(session, NOTE_PERMISSIONS.VIEW);
  const targetType = normalizeOptionalText(query.targetType || query.target_type || "all") || "all";
  const search = normalizeOptionalText(query.q || query.query || query.search).toLowerCase();
  const limit = Math.min(Math.max(Number.parseInt(String(query.limit), 10) || 20, 1), 50);
  const clientContext = normalizeLinkTargetClientContext(query);
  const clientScope = await resolveLinkTargetClientScope(session, clientContext);
  const targetTypes = targetType === "all" ? ["workspace", "client", "project", "task", "note", "list", "user"] : [targetType];
  const targets = [];

  for (const type of targetTypes) {
    if (!isLinkTargetType(type)) {
      throw new AppError("Unsupported note link target type.", 400);
    }

    targets.push(...(linkTargetDirectory.externalTargetTypes.includes(type)
      ? await linkTargetDirectory.list(session, type, clientContext)
      : await listTargetsByType(session, type)));
  }

  return {
    targets: targets
      .filter((target) => targetMatchesClientContext(target, clientScope))
      .filter((target) => targetMatchesSearch(target, search))
      .sort(compareLinkTargets)
      .slice(0, limit),
  };
}

/**
 * @param {NotesServiceQuery} query
 * @returns {NotesServiceLinkTargetClientContext}
 */
function normalizeLinkTargetClientContext(query = {}) {
  const clientScope = normalizeOptionalText(query.clientScope || query.client_scope || query.clientContext || query.client_context).toLowerCase();
  const clientId = normalizeOptionalText(query.clientId || query.client_id || query.clientContextId || query.client_context_id);

  if (clientScope === "workspace") {
    return { clientId: "", mode: "workspace" };
  }
  if (clientScope === "client" && clientId) {
    return { clientId, mode: "client" };
  }
  if (clientId) {
    return { clientId, mode: "client" };
  }
  return { clientId: "", mode: "all" };
}

/**
 * @param {NotesServiceLinkTargetClientContext} clientContext
 */
function isScopedLinkTargetClientContext(clientContext) {
  return ["client", "workspace"].includes(clientContext.mode);
}

/**
 * @param {NotesWorkspaceSession} session
 * @param {NotesServiceLinkTargetClientContext} clientContext
 */
async function resolveLinkTargetClientScope(session, clientContext) {
  if (!isScopedLinkTargetClientContext(clientContext)) {
    return { hasClientFilter: false };
  }

  return resolveClientProjectFilterScope(session, {
    clientId: clientContext.mode === "workspace" ? "" : clientContext.clientId,
    hasClientFilter: true,
    hasProjectFilter: false,
  });
}

/**
 * @param {NotesServiceTarget} target
 * @param {NotesServiceClientScope} scope
 */
function targetMatchesClientContext(target = {}, scope = {}) {
  if (!scope.hasClientFilter) {
    return true;
  }

  const targetType = normalizeOptionalText(target.targetType || target.target_type);
  if (!LINK_TARGET_CLIENT_SCOPED_TYPES.has(targetType)) {
    return true;
  }

  const targetId = normalizeOptionalText(target.targetId || target.target_id);
  const clientId = normalizeOptionalText(target.clientId || target.client_id || (targetType === "client" ? targetId : ""));
  const projectId = normalizeOptionalText(target.projectId || target.project_id);

  if (scope.clientFilterMode === "blank") {
    return targetType === "client" ? false : !clientId;
  }
  if (scope.clientFilterMode !== "ids") {
    return true;
  }

  const clientIds = new Set(scope.clientIds || []);
  const projectIds = new Set(scope.clientProjectIds || []);
  return Boolean((clientId && clientIds.has(clientId)) || (projectId && projectIds.has(projectId)));
}

/**
 * @param {NotesWorkspaceSession} session
 */
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

/**
 * @param {NotesWorkspaceSession} session
 * @param {string} libraryBucket
 * @param {NotesServiceQuery} query
 */
async function listByLibraryBucket(session, libraryBucket, query = {}) {
  const normalizedBucket = normalizeEnum(libraryBucket, LIBRARY_BUCKET_VALUES, "Library bucket");

  return list(session, { ...query, libraryBucket: normalizedBucket });
}

/**
 * @param {NotesWorkspaceSession} session
 * @param {NotesServiceQuery} query
 */
async function listArchived(session, query = {}) {
  return list(session, { ...query, status: NOTE_STATUSES.ARCHIVED });
}

/**
 * @param {NotesServicePayload} payload
 */
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

/**
 * @param {import("zod").output<typeof CreateNoteSchema> | import("zod").output<typeof UpdateNoteSchema> | Partial<NotePersistenceInput>} payload
 * @param {NotesWorkspaceSession} session
 * @param {NotesServiceNoteLike | null} previousNote
 * @returns {Promise<NotesServiceWritableNote>}
 */
async function normalizeNotePayload(payload = {}, session, previousNote = null) {
  const bodyWasProvided = Object.hasOwn(payload || {}, "body_markdown") || Object.hasOwn(payload || {}, "bodyMarkdown");
  const previousBodyMarkdown = previousNote && isEffectivelySecureNote(previousNote) && hasEncryptedSecurePayload(previousNote)
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

  let securityMode = normalizeEnum(payload.securityMode || payload.security_mode || previousNote?.security_mode || NOTE_SECURITY_MODES.NORMAL, NOTE_SECURITY_MODE_VALUES, "Note security mode");
  if (previousNote?.security_mode === NOTE_SECURITY_MODES.SECURE && securityMode !== NOTE_SECURITY_MODES.SECURE) {
    throw new AppError("Secure notes cannot be converted back to normal notes in this release.", 400);
  }
  if (previousNote?.security_mode !== NOTE_SECURITY_MODES.SECURE && previousNote && securityMode === NOTE_SECURITY_MODES.SECURE) {
    throw new AppError("Convert-to-secure is deferred; recreate the note through the secure-note flow.", 400);
  }

  const hasVisibility = Object.hasOwn(payload, "visibility");
  const requestedVisibility = normalizeEnum(
    hasVisibility ? payload.visibility : previousNote?.visibility || NOTE_VISIBILITIES.INTERNAL,
    NOTE_VISIBILITY_VALUES,
    "Note visibility",
  );
  const visibility = await normalizeNoteVisibilityForWrite(session, requestedVisibility, {
    explicit: hasVisibility,
    preserveLegacy: Boolean(previousNote) && !hasVisibility,
  });
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

  const normalizedCollectionId = normalizeOptionalText(noteCollectionId);
  const collection = normalizedCollectionId
    ? await notesCollectionsService.readAssignableCollection(session, normalizedCollectionId)
    : null;
  if (collection && collection.library_bucket !== libraryBucket) {
    throw new AppError("Note collection must be in the same Library bucket as the note.", 400);
  }

  let securityProjection = await notesRepository.projectEffectiveSecurity(session.workspace_id, {
    note_collection_id: normalizedCollectionId || null,
    security_mode: securityMode,
  });
  const wasEffectivelySecure = previousNote ? isEffectivelySecureNote(previousNote) : false;
  let willBeEffectivelySecure = securityProjection.effective_security_mode === NOTE_SECURITY_MODES.SECURE;
  if (wasEffectivelySecure && !willBeEffectivelySecure) {
    securityMode = NOTE_SECURITY_MODES.SECURE;
    securityProjection = await notesRepository.projectEffectiveSecurity(session.workspace_id, {
      note_collection_id: normalizedCollectionId || null,
      security_mode: securityMode,
    });
    willBeEffectivelySecure = true;
  }

  const secureFields = willBeEffectivelySecure
    ? {
        ...safeSecurePlaceholders(),
        ...(bodyWasProvided || !previousNote || !wasEffectivelySecure
          ? encryptSecureNoteBody(bodyMarkdown)
          : copySecureEncryptionFields(previousNote)),
      }
    : {
        body_markdown: bodyMarkdown,
        body_excerpt: createMarkdownExcerpt(bodyMarkdown),
        body_plaintext_index: extractPlainTextFromMarkdown(bodyMarkdown),
        ...clearSecureEncryptionFields(),
      };

  return {
    ...(previousNote || {}),
    note_id: previousNote?.note_id || normalizeOptionalText("note_id" in payload ? payload.note_id : "") || undefined,
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
    ...securityProjection,
    security_mode: securityMode,
    client_id: normalizeNullablePayloadText(payload, "clientId", "client_id", previousNote?.client_id),
    project_id: normalizeNullablePayloadText(payload, "projectId", "project_id", previousNote?.project_id),
    task_id: null,
    ticket_id: normalizeNullablePayloadText(payload, "ticketId", "ticket_id", previousNote?.ticket_id),
    linked_user_id: normalizeNullablePayloadText(payload, "linkedUserId", "linked_user_id", previousNote?.linked_user_id),
    note_collection_id: normalizedCollectionId || null,
    owner_user_id: normalizeOptionalText(payload.ownerUserId ?? payload.owner_user_id ?? previousNote?.owner_user_id) || session.user_id,
    created_by_user_id: previousNote?.created_by_user_id || session.user_id,
    updated_by_user_id: session.user_id,
    created_at: previousNote?.created_at || now,
    updated_at: now,
    archived_at: normalizeOptionalText(("archived_at" in payload ? payload.archived_at : undefined) ?? previousNote?.archived_at) || null,
    deleted_at: normalizeOptionalText(("deleted_at" in payload ? payload.deleted_at : undefined) ?? previousNote?.deleted_at) || null,
    metadata_json: JSON.stringify(metadata),
    ...normalizeImportMetadata(payload, previousNote),
  };
}

/**
 * @param {NotesWorkspaceSession} session
 * @param {NotesServiceWritableNote} note
 * @param {NotesServicePayload} payload
 * @returns {Promise<import("../../types/notes-domain-contracts.js").NoteLinkPersistenceInput[]>}
 */
async function prepareCreateLinksFromPayload(session, note, payload = {}) {
  const links = normalizeLinkPayloads(payload);

  if (links.length === 0) {
    return [];
  }

  await assertCanAccess(session, note, "manage_links");

  const normalizedLinks = [];
  for (const link of links) {
    const normalizedLink = normalizeLinkPayload(link, note.note_id || "", session);
    await assertTargetAccess(session, normalizedLink);
    normalizedLinks.push(normalizedLink);
  }

  return normalizedLinks;
}

/**
 * @param {NotesWorkspaceSession} session
 * @param {string} noteId
 * @param {NotesServicePayload} payload
 */
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

/**
 * @param {NotesWorkspaceSession} session
 * @param {NotesServiceLinkTargetType} targetType
 * @param {string} targetId
 * @param {string} reason
 */
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

/**
 * @param {NotesServiceNoteLike} previousNote
 * @param {NotesServiceNoteLike} nextNote
 */
function noteContextChanged(previousNote = {}, nextNote = {}) {
  return [
    "client_id",
    "project_id",
  ].some((fieldName) => String(previousNote[fieldName] || "") !== String(nextNote[fieldName] || ""));
}

/**
 * @param {NotesServiceSession} session
 * @param {NotesServiceNoteLike[]} notes
 * @param {NotesServiceListFilters} filters
 */
async function decorateAndFilterNotesByTags(session, notes, filters = {}) {
  const taggedNotes = await tagsService.decorateRecordsWithEffectiveTags(session, "note", notes, { idField: "note_id" });
  const filteredNotes = await tagsService.filterRecordsByTags(session, "note", taggedNotes, filters.tagIds, {
    idField: "note_id",
    match: filters.tagMatch || "any",
  });

  return filterNotesByTagQuery(filteredNotes, filters.tagQuery);
}

/**
 * @param {NotesServiceCandidateBatch} arg1
 */
async function filterAndShapeNoteListCandidates({ candidates, filters, offset, session }) {
  const notesWithOffsets = candidates.map((note, index) => ({
    ...note,
    __candidateOffset: offset + index,
  }));
  const accessible = await filterAccessibleNotes(session, notesWithOffsets);
  const tagged = await decorateAndFilterNotesByTags(session, accessible, filters);

  return tagged.map((note) => ({
    ...shapeNoteListProjection(note),
    __candidateOffset: note.__candidateOffset,
  }));
}

/**
 * @param {NotesServiceNoteLike[]} notes
 * @param {NotesServicePagination | null} pagination
 * @param {string} nextCursor
 */
function noteListResult(notes, pagination, nextCursor = "") {
  return {
    notes,
    pagination: pagination ? {
      hasMore: Boolean(nextCursor),
      limit: pagination.pageSize,
      nextCursor,
      pageSize: pagination.pageSize,
    } : null,
  };
}

/**
 * @param {NotesServiceNoteLike} note
 */
function shapeNoteListProjection(note = {}) {
  const shaped = shapeNoteForBrowser(note, { includeBodyHtml: false });

  delete shaped.body_markdown;
  delete shaped.body_plaintext_index;
  delete shaped.body_html;
  delete shaped.metadata_json;
  delete shaped.metadata;
  delete shaped.searchDocument;

  if (isEffectivelySecureNote(shaped)) {
    shaped.body_excerpt = null;
  }

  return shaped;
}

/**
 * @param {NotesServiceNoteLike} note
 */
function stripNoteListCandidateMetadata(note = {}) {
  const { __candidateOffset, ...safeNote } = note;
  return safeNote;
}

/**
 * @param {NotesServiceNoteLike[]} notes
 * @param {unknown} tagQuery
 */
function filterNotesByTagQuery(notes = [], tagQuery = "") {
  const query = normalizeOptionalText(tagQuery).toLowerCase();

  if (!query) {
    return notes;
  }

  if (isNoTagsQuery(query)) {
    return notes.filter((note) => (note.tags || []).length === 0);
  }

  return notes.filter((note) => (note.tags || []).some((tag) => [
    tag.name,
    tag.slug,
    tag.description,
    tag.tag_id,
  ].filter(Boolean).join(" ").toLowerCase().includes(query)));
}

/**
 * @param {unknown} value
 */
function isNoTagsQuery(value) {
  const normalized = normalizeOptionalText(value).toLowerCase().replace(/\s+/g, "_");
  return ["__no_tags__", "__no_effective_tags__", "no_tags", "none"].includes(normalized);
}

/**
 * @template {NotesServiceNoteLike} T
 * @param {NotesServiceSession} session
 * @param {T[]} notes
 * @returns {Promise<Array<T & {links: NoteLinkRecord[]}>>}
 */
async function filterAccessibleNotes(session, notes) {
  const moduleState = await readNotesModuleState(session);
  const batch = createVisibleRecordBatch(notes, { idField: "note_id" });
  const links = await notesRepository.listLinksForNotes(session.workspace_id, batch.ids);
  const linksByNoteId = groupRowsByRecordId(links, { idField: "note_id" });
  const linkedContextCache = await createLinkedContextAccessCache(session, notes, linksByNoteId);
  /** @type {Array<T & {links: NoteLinkRecord[]}>} */
  const readable = [];

  for (const note of notes) {
    const linkedRecordAccess = await canAccessLinkedContext(
      session,
      note,
      linksByNoteId.get(note.note_id || "") || [],
      new Set(),
      linkedContextCache,
    );
    const access = canAccessNote({
      note,
      operation: "read",
      session,
      permissions: await readNotePermissionSet(session, notePermissionResource(note)),
      linkedRecordAccess,
      notesModuleEnabled: moduleState.enabled,
      historicalReadAccess: moduleState.historicalReadAccess,
      workspaceType: moduleState.workspaceType,
    });

    if (access.allowed && canExposeNoteToConsumer(note, noteReadConsumerId(session), { authorized: true })) {
      readable.push(normalizeNoteVisibilityForWorkspace({
        ...note,
        links: linksByNoteId.get(note.note_id || "") || [],
      }, moduleState.workspaceType));
    }
  }

  return readable;
}

/**
 * @param {NotesServiceSession} session
 * @param {string} ordinaryConsumerId
 */
function noteReadConsumerId(session, ordinaryConsumerId = "notes.workspace") {
  return "support_view" in session && session.support_view ? "notes.support-view" : ordinaryConsumerId;
}

/**
 * @param {NotesServiceNoteLike} note
 * @param {NotesServiceSession} session
 * @param {string} ordinaryConsumerId
 */
function assertNoteReadConsumerAccess(note, session, ordinaryConsumerId = "notes.workspace") {
  const consumerId = noteReadConsumerId(session, ordinaryConsumerId);
  if ("support_view" in session && session.support_view && !canExposeNoteToConsumer(note, consumerId, { authorized: true })) {
    throw new AppError("Note not found.", 404);
  }
  return assertNoteConsumerAccess(note, consumerId, { authorized: true });
}

/**
 * @param {NotesServiceSession} session
 * @param {NotesServiceNoteLike} note
 * @param {import("../../types/notes-domain-contracts.js").NoteAccessOperation} operation
 */
async function assertCanAccess(session, note, operation) {
  const links = note?.links || await notesRepository.listLinks(session.workspace_id, note.note_id || "");
  const linkedRecordAccess = await canAccessLinkedContext(session, note, links);
  const access = canAccessNote({
    note,
    operation,
    session,
    permissions: await readNotePermissionSet(session, notePermissionResource(note)),
    linkedRecordAccess,
    ...(await readNotesModuleState(session)),
  });

  if (!access.allowed) {
    throw new AppError(noteAccessMessage(access.reason), 403);
  }

  if (
    isEffectivelySecureNote(note) &&
    ["read", "update", "view_history", "restore_revision"].includes(operation) &&
    !hasEncryptedSecurePayload(note)
  ) {
    assertEncryptedPayloadPresent(note);
  }
}

/**
 * @param {NotesServiceSession} session
 * @param {NotesServiceNoteLike} note
 * @param {NotesServiceNoteLike | null} previousNote
 */
async function assertSecureNoteCanBePersisted(session, note, previousNote = null) {
  if (!isEffectivelySecureNote(note)) {
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

/**
 * @template {NotesServiceNoteLike} T
 * @param {NotesServiceSession} session
 * @param {T} note
 * @returns {Promise<T>}
 */
async function decryptSecureNoteForRead(session, note) {
  if (!isEffectivelySecureNote(note)) {
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

/**
 * @param {NotesServiceRevisionLike} revision
 */
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

/**
 * @param {NotesServiceSession} session
 * @param {NotesServiceNoteLike} note
 * @param {Array<NotesServiceLinkLike | NotesServiceDecoratedLink>} links
 * @param {Set<string>} seenTargets
 * @param {NotesServiceLinkedContextAccessCache | null} accessCache
 */
async function canAccessLinkedContext(session, note, links = [], seenTargets = new Set(), accessCache = null) {
  const targets = [
    ...noteContextTargets(note),
    ...links.map((link) => ({
      module_id: link.module_id,
      target_type: link.target_type,
      target_id: link.target_id,
    })),
  ].filter((target) => target.target_id || target.target_type === "workspace");

  for (const target of targets) {
    if (!(await canAccessSavedContextTarget(session, target, seenTargets, accessCache))) {
      return false;
    }
  }

  return true;
}

/**
 * @param {NotesWorkspaceSession} session
 * @param {NotesServiceNoteLike} note
 */
async function assertLinkedContextAccess(session, note) {
  for (const target of noteContextTargets(note)) {
    await assertTargetAccess(session, target);
  }
}

/**
 * @param {NotesWorkspaceSession} session
 * @param {NotesServiceTarget} target
 */
async function assertTargetAccess(session, target) {
  if (!(await canTargetAccess(session, target))) {
    throw new AppError("You do not have access to the linked note target.", 403);
  }
}

/**
 * @param {NotesServiceSession} session
 * @param {NotesServiceTarget} target
 * @param {Set<string>} seenTargets
 */
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

  if (normalizedTarget.target_type === "note") {
    return canAccessNoteTarget(session, normalizedTarget, nextSeenTargets);
  }

  if (isLinkTargetType(normalizedTarget.target_type) && linkTargetDirectory.externalTargetTypes.includes(normalizedTarget.target_type)) {
    return linkTargetDirectory.canAccess(session, normalizedTarget.target_type, normalizedTarget.target_id);
  }

  return false;
}

/**
 * @param {NotesServiceSession} session
 * @param {NotesServiceTarget} target
 * @param {Set<string>} seenTargets
 * @param {NotesServiceLinkedContextAccessCache | null} accessCache
 */
async function canAccessSavedContextTarget(session, target, seenTargets = new Set(), accessCache = null) {
  const normalizedTarget = normalizeSavedTarget(target);
  const targetKey = linkedContextTargetKey(normalizedTarget);
  if (seenTargets.has(targetKey)) {
    return true;
  }
  const nextSeenTargets = new Set(seenTargets);
  nextSeenTargets.add(targetKey);

  if (!normalizedTarget.target_type || !normalizedTarget.target_id) {
    return true;
  }

  if (!isLinkTargetType(normalizedTarget.target_type)) {
    return true;
  }

  if (normalizedTarget.target_type === "workspace") {
    return normalizedTarget.target_id === session.workspace_id;
  }

  if (linkTargetDirectory.externalTargetTypes.includes(normalizedTarget.target_type)) {
    return linkTargetDirectory.canAccessSaved(
      session,
      normalizedTarget.target_type,
      normalizedTarget.target_id,
      accessCache?.directory || null,
    );
  }

  if (normalizedTarget.target_type === "note") {
    const note = accessCache
      ? accessCache.notes.get(normalizedTarget.target_id) || null
      : await notesRepository.readById(session.workspace_id, normalizedTarget.target_id);
    if (!note || note.status === NOTE_STATUSES.DELETED || note.deleted_at) {
      return true;
    }

    const links = await notesRepository.listLinks(session.workspace_id, note.note_id);
    const linkedRecordAccess = await canAccessLinkedContext(session, note, links, nextSeenTargets, accessCache);
    const access = canAccessNote({
      note,
      operation: "read",
      session,
      permissions: await readNotePermissionSet(session, notePermissionResource(note)),
      linkedRecordAccess,
      ...(await readNotesModuleState(session)),
    });
    return access.allowed;
  }

  return true;
}

/**
 * @param {NotesServiceTarget} target
 */
function linkedContextTargetKey(target = {}) {
  return [target.module_id || "", target.target_type || "", target.target_id || ""].join(":");
}

/**
 * @param {NotesServiceSession} session
 * @param {NotesServiceTarget} target
 * @param {Set<string>} seenTargets
 */
async function canAccessNoteTarget(session, target, seenTargets = new Set()) {
  const targetId = normalizeOptionalText(target.target_id);
  if (!targetId) return false;
  const note = await notesRepository.readById(session.workspace_id, targetId);
  if (!note || note.status === NOTE_STATUSES.DELETED || note.deleted_at) {
    return false;
  }

  const links = await notesRepository.listLinks(session.workspace_id, note.note_id);
  const linkedRecordAccess = await canAccessLinkedContext(session, note, links, seenTargets);
  const access = canAccessNote({
    note,
    operation: "read",
    session,
    permissions: await readNotePermissionSet(session, notePermissionResource(note)),
    linkedRecordAccess,
    ...(await readNotesModuleState(session)),
  });
  return access.allowed;
}

/**
 * @param {LinkTargetType} targetType
 * @param {NotesWorkspaceSession} session
 * @returns {Promise<LinkTarget[]>}
 */
async function listTargetsByType(session, targetType) {
  if (!(await canReadLinkTargetType(session, targetType))) {
    return [];
  }

  if (targetType === "workspace") {
    const workspace = await workspacesRepository.readById(session.workspace_id);
    return [shapeLinkTargetCandidate("workspace", {
      target_id: session.workspace_id,
      label: workspace?.workspace_name || "Workspace",
      subtitle: "Workspace",
      source_url: "dashboard.html",
    })];
  }

  if (targetType === "note") {
    const notes = await filterAccessibleNotes(session, await notesRepository.list(session.workspace_id, {}));
    const collectionsById = await readNoteCollectionsById(session);
    const targetContext = await readLinkTargetContext(session);
    return notes.map((note) => {
      const noteTitle = noteTargetPlainLabel(note);
      const displayLabel = noteTargetPickerDisplayLabel(note, targetContext);
      const secondaryLabel = noteTargetSecondaryLabel(note, collectionsById, targetContext);

      return shapeLinkTargetCandidate("note", {
        target_id: note.note_id,
        label: noteTitle,
        display_label: displayLabel,
        secondary_label: secondaryLabel,
        sort_key: noteTargetSortKey(note, collectionsById, targetContext),
        subtitle: secondaryLabel,
        source_url: noteSourceUrl(note.note_id),
        client_id: note.client_id || "",
        client_name: recordTargetClientName(note, targetContext),
        project_id: note.project_id || "",
        project_name: recordTargetProjectName(note, targetContext),
        note_id: note.note_id,
        title: noteTitle,
        full_label: noteTitle,
        aria_label: noteTargetAccessibleLabel(note, collectionsById, targetContext),
        workspace_id: session.workspace_id,
        workspace_name: targetContext.workspaceName,
      });
    });
  }

  return [];
}

/**
 * @param {NotesWorkspaceSession} session
 * @param {NotesServiceLinkTargetType} targetType
 */
async function canReadLinkTargetType(session, targetType) {
  const moduleId = {
    client: "client-projects",
    list: "lists",
    note: "notes",
    project: "client-projects",
    task: "tasks",
    user: "",
    workspace: "",
  }[targetType];

  return moduleId ? modulesService.canWriteModule(session.workspace_id, moduleId) : true;
}

/**
 * @param {NotesServiceTarget} target
 * @param {unknown} search
 */
function targetMatchesSearch(target, search) {
  const query = normalizeOptionalText(search);
  if (!query) {
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
  ].filter(Boolean).join(" ").toLowerCase().includes(query.toLowerCase());
}

/**
 * @param {NotesServiceTarget} left
 * @param {NotesServiceTarget} right
 */
function compareLinkTargets(left = {}, right = {}) {
  return compareText(left.targetType, right.targetType) ||
    compareText(left.sortKey || left.displayLabel || left.label, right.sortKey || right.displayLabel || right.label) ||
    compareText(left.displayLabel || left.label, right.displayLabel || right.label) ||
    compareText(left.targetId, right.targetId);
}

/**
 * @param {unknown} title
 */
function truncateNoteTargetTitle(title) {
  const text = normalizeOptionalText(title);
  if (text.length <= NOTE_TARGET_TITLE_MAX_LENGTH) {
    return text;
  }

  return `${text.slice(0, NOTE_TARGET_TITLE_MAX_LENGTH - 3).trimEnd()}...`;
}

/**
 * @param {NotesWorkspaceSession} session
 */
async function readNoteCollectionsById(session) {
  const collections = await notesRepository.listCollections(session.workspace_id, { includeArchived: true });
  return new Map(collections.map((collection) => [collection.note_library_collection_id, collection]));
}

/**
 * @param {NotesServiceSession} session
 */
async function readLinkTargetContext(session) {
  const context = await linkTargetDirectory.readContext(session);
  if (await modulesService.canReadModule(session.workspace_id, "client-projects")) {
    return context;
  }
  return { ...context, clientsById: new Map(), projectsById: new Map() };
}

/**
 * @param {NotesServiceNoteLike} note
 */
function noteTargetPlainLabel(note = {}) {
  return readableTargetLabel(note.title || note.label, "note");
}

/**
 * @param {NotesServiceNoteLike} note
 * @param {NotesServiceTargetContext} targetContext
 */
function noteTargetPickerDisplayLabel(note = {}, targetContext = {}) {
  const title = truncateNoteTargetTitle(noteTargetPlainLabel(note));
  const context = noteTargetContextLabel(note, targetContext);
  return context ? `${title} - ${context}` : title;
}

/**
 * @param {NotesServiceNoteLike} note
 * @param {Map<string, import("../../types/notes-collections-contracts.js").NoteCollectionRecord>} collectionsById
 * @param {NotesServiceTargetContext} targetContext
 */
function noteTargetSecondaryLabel(note = {}, collectionsById = new Map(), targetContext = {}) {
  return noteTargetContextLabel(note, targetContext) || noteTargetLibrarySecondaryLabel(note, collectionsById);
}

/**
 * @param {NotesServiceNoteLike} note
 * @param {Map<string, import("../../types/notes-collections-contracts.js").NoteCollectionRecord>} collectionsById
 */
function noteTargetLibrarySecondaryLabel(note = {}, collectionsById = new Map()) {
  return [
    noteTargetLibraryLabel(note),
    noteTargetCollectionLabel(note, collectionsById),
  ].filter(Boolean).join(" / ");
}

/**
 * @param {NotesServiceNoteLike} note
 * @param {Map<string, import("../../types/notes-collections-contracts.js").NoteCollectionRecord>} collectionsById
 * @param {NotesServiceTargetContext} targetContext
 */
function noteTargetAccessibleLabel(note = {}, collectionsById = new Map(), targetContext = {}) {
  const label = noteTargetPlainLabel(note);
  const secondaryLabel = noteTargetSecondaryLabel(note, collectionsById, targetContext);
  return secondaryLabel ? `${label} - ${secondaryLabel}` : label;
}

/**
 * @param {NotesServiceNoteLike} note
 * @param {NotesServiceTargetContext} targetContext
 */
function noteTargetContextLabel(note = {}, targetContext = {}) {
  return recordTargetContextLabel(note, targetContext);
}

/**
 * @param {NotesServiceNoteLike} note
 * @param {Map<string, import("../../types/notes-collections-contracts.js").NoteCollectionRecord>} collectionsById
 * @param {NotesServiceTargetContext} targetContext
 */
function noteTargetSortKey(note = {}, collectionsById = new Map(), targetContext = {}) {
  return [
    sortText(noteTargetContextLabel(note, targetContext)),
    noteTargetLibrarySortValue(note),
    sortText(noteTargetCollectionLabel(note, collectionsById)),
    sortText(noteTargetPlainLabel(note)),
    sortText(note.note_id || note.noteId),
  ].join("|");
}

/**
 * @param {NotesServiceNoteLike} note
 */
function noteTargetLibraryLabel(note = {}) {
  const bucket = normalizeLibraryBucketFilter(note.library_bucket || note.libraryBucket);
  return bucket ? NOTE_LIBRARY_BUCKET_LABELS[bucket] : formatLabelToken(note.library_bucket || note.libraryBucket);
}

/**
 * @param {NotesServiceNoteLike} note
 */
function noteTargetLibrarySortValue(note = {}) {
  const bucket = normalizeOptionalText(note.library_bucket || note.libraryBucket);
  /** @type {string[]} */
  const order = [
    NOTE_LIBRARY_BUCKETS.ACTIVE_WORK,
    NOTE_LIBRARY_BUCKETS.ONGOING_AREA,
    NOTE_LIBRARY_BUCKETS.REFERENCE,
  ];
  const index = order.indexOf(bucket);
  return index === -1 ? `9:${sortText(bucket)}` : `${index}:${bucket}`;
}

/**
 * @param {NotesServiceNoteLike} note
 * @param {Map<string, import("../../types/notes-collections-contracts.js").NoteCollectionRecord>} collectionsById
 */
function noteTargetCollectionLabel(note = {}, collectionsById = new Map()) {
  const collectionId = normalizeOptionalText(note.note_collection_id || note.noteCollectionId);
  if (!collectionId) {
    return "";
  }

  const collection = collectionsById.get(collectionId);
  return normalizeOptionalText(collection?.path_cache || collection?.title);
}

/**
 * @param {NotesServiceContextRecord} record
 * @param {NotesServiceTargetContext} targetContext
 */
function recordTargetContextLabel(record = {}, targetContext = {}) {
  const projectName = recordTargetProjectName(record, targetContext);
  if (projectName) {
    return targetContext.isBusinessWorkspace
      ? `${recordTargetBusinessContextName(record, targetContext)} | ${projectName}`
      : projectName;
  }

  if (targetContext.isBusinessWorkspace) {
    return recordTargetClientName(record, targetContext);
  }

  return "";
}

/**
 * @param {NotesServiceContextRecord} record
 * @param {NotesServiceTargetContext} targetContext
 */
function recordTargetBusinessContextName(record = {}, targetContext = {}) {
  return recordTargetClientName(record, targetContext) || targetContext.workspaceName || "Workspace";
}

/**
 * @param {NotesServiceContextRecord} record
 * @param {NotesServiceTargetContext} targetContext
 */
function recordTargetClientName(record = {}, targetContext = {}) {
  const project = recordTargetProject(record, targetContext);
  const projectClientName = normalizeOptionalText(project?.clientName);
  if (projectClientName) {
    return readableTargetLabel(projectClientName, "client");
  }

  const clientId = normalizeOptionalText(record.client_id || record.clientId);
  const client = clientId ? targetContext.clientsById?.get(clientId) : null;
  return normalizeOptionalText(client?.label);
}

/**
 * @param {NotesServiceContextRecord} record
 * @param {NotesServiceTargetContext} targetContext
 */
function recordTargetProjectName(record = {}, targetContext = {}) {
  const project = recordTargetProject(record, targetContext);
  return normalizeOptionalText(project?.label);
}

/**
 * @param {NotesServiceContextRecord} record
 * @param {NotesServiceTargetContext} targetContext
 */
function recordTargetProject(record = {}, targetContext = {}) {
  const projectId = normalizeOptionalText(record.project_id || record.projectId);
  return projectId ? targetContext.projectsById?.get(projectId) : null;
}

/**
 * @param {unknown} value
 */
function sortText(value) {
  return normalizeOptionalText(value).toLowerCase();
}

/**
 * @param {unknown} value
 */
function formatLabelToken(value) {
  return normalizeOptionalText(value)
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1).toLowerCase()}`)
    .join(" ");
}

/**
 * @param {NotesServiceNoteLike} note
 * @returns {NotesServiceTarget[]}
 */
function noteContextTargets(note = {}) {
  /** @type {NotesServiceTarget[]} */
  const targets = [];
  if (note.client_id) targets.push({ module_id: "client-projects", target_type: "client", target_id: note.client_id });
  if (note.project_id) targets.push({ module_id: "client-projects", target_type: "project", target_id: note.project_id });
  if (note.task_id) targets.push({ module_id: "tasks", target_type: "task", target_id: note.task_id });
  if (note.linked_user_id) targets.push({ module_id: "users", target_type: "user", target_id: note.linked_user_id });
  return targets;
}

/**
 * @param {NotesServiceQuery} query
 * @param {NotesWorkspaceSession | null} session
 */
function normalizeTargetFromQuery(query = {}, session = null) {
  return normalizeTarget({
    module_id: query.moduleId || query.module_id,
    target_type: query.targetType || query.target_type,
    target_id: query.targetId || query.target_id,
    workspace_id: session?.workspace_id,
  });
}

/**
 * @param {NotesServicePayload | NotesServiceTarget} payload
 * @param {string} noteId
 * @param {NotesWorkspaceSession} session
 * @returns {import("../../types/notes-domain-contracts.js").NoteLinkPersistenceInput & {note_id: string}}
 */
function normalizeLinkPayload(payload = {}, noteId, session) {
  const target = normalizeTarget(payload);

  return {
    note_link_id: normalizeOptionalText(payload.noteLinkId || payload.note_link_id) || undefined,
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

/**
 * @param {NotesServicePayload | NotesServiceTarget} payload
 * @returns {import("../../types/notes-domain-contracts.js").NoteTarget}
 */
function normalizeTarget(payload = {}) {
  const targetType = normalizeOptionalText(payload.targetType || payload.target_type);
  const targetId = normalizeOptionalText(payload.targetId || payload.target_id);
  const moduleId = normalizeOptionalText(payload.moduleId || payload.module_id) || defaultModuleForTargetType(targetType);

  if (!isLinkTargetType(targetType)) {
    throw new AppError("Unsupported note link target type.", 400);
  }

  if (!targetId) {
    throw new AppError("Note link target ID is required.", 400);
  }

  return {
    module_id: moduleId,
    target_type: targetType,
    target_id: targetType === "workspace" && targetId === "current"
      ? normalizeOptionalText(payload.workspace_id || payload.workspaceId) || targetId
      : targetId,
  };
}

/**
 * @param {NotesServicePayload | NotesServiceTarget} payload
 * @returns {import("../../types/notes-domain-contracts.js").NoteTarget}
 */
function normalizeSavedTarget(payload = {}) {
  const targetType = normalizeOptionalText(payload.targetType || payload.target_type);
  const targetId = normalizeOptionalText(payload.targetId || payload.target_id);
  const moduleId = normalizeOptionalText(payload.moduleId || payload.module_id) || defaultModuleForTargetType(targetType);

  return {
    module_id: moduleId,
    target_type: targetType,
    target_id: targetType === "workspace" && targetId === "current"
      ? normalizeOptionalText(payload.workspace_id || payload.workspaceId) || targetId
      : targetId,
  };
}

/**
 * @param {string} targetType
 */
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

/**
 * @param {unknown} links
 * @returns {import("../../types/notes-domain-contracts.js").NoteLinkPersistenceInput[]}
 */
function normalizeLinksInput(links) {
  return (Array.isArray(links) ? links : [])
    .filter((link) => Boolean(link) && typeof link === "object" && !Array.isArray(link))
    .map((link) => {
      const candidate = /** @type {NotesServiceLinkLike} */ (link);
      return ({
        ...candidate,
        target_type: normalizeOptionalText(candidate.targetType || candidate.target_type),
        target_id: normalizeOptionalText(candidate.targetId || candidate.target_id),
        module_id: normalizeOptionalText(candidate.moduleId || candidate.module_id),
      });
    })
    .filter((link) => link.target_type && link.target_id);
}

/**
 * @param {NotesServicePayload} payload
 * @returns {import("../../types/notes-domain-contracts.js").NoteLinkPersistenceInput[]}
 */
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

/**
 * @param {NotesWorkspaceSession} session
 * @param {NotesServiceNoteLike} previousNote
 * @param {NotesServiceNoteLike} nextNote
 * @param {string} changeSummary
 */
async function maybeCreateRevision(session, previousNote, nextNote, changeSummary) {
  if (!previousNote || !shouldCreateNoteRevision(previousNote, nextNote)) {
    return null;
  }

  const noteId = normalizeOptionalText(nextNote.note_id);
  if (!noteId) throw new AppError("Note ID is required to create a revision.", 500);
  const revisionNumber = await notesRepository.nextRevisionNumber(session.workspace_id, noteId);
  const revision = await notesRepository.createRevision(session.workspace_id, {
    ...createRevisionSnapshot(previousNote, {
      revisionNumber,
      changedByUserId: session.user_id,
      changeSummary,
    }),
    ...(isEffectivelySecureNote(previousNote) ? {
      ...safeSecurePlaceholders(),
      ...copySecureEncryptionFields(previousNote),
      security_mode: NOTE_SECURITY_MODES.SECURE,
    } : clearSecureEncryptionFields()),
    ...copyImportMetadata(previousNote),
  });

  await emitNoteEvent("note.revision_created", session, previousNote, nextNote, {
    revision_id: revision.note_revision_id,
    revision_number: revision.revision_number,
  });

  return revision;
}

/**
 * @param {NotesServiceNoteLike} note
 * @param {import("../../types/notes-domain-contracts.js").RevisionSnapshotOptions} options
 */
function createEncryptedRevisionSnapshot(note, options = {}) {
  const bodyMarkdown = isEffectivelySecureNote(note) && hasEncryptedSecurePayload(note)
    ? decryptSecureNoteBody(note)
    : note.body_markdown || "";

  return {
    ...createRevisionSnapshot({ ...note, body_markdown: bodyMarkdown }, options),
    note_revision_id: options.noteRevisionId || options.note_revision_id || createRecordId(),
    ...safeSecurePlaceholders(),
    ...encryptSecureNoteBody(bodyMarkdown),
    security_mode: NOTE_SECURITY_MODES.SECURE,
    ...copyImportMetadata(note),
  };
}

/**
 * @param {NoteRevisionRecord} revision
 */
function createEncryptedStoredRevision(revision) {
  if (revision.security_mode === NOTE_SECURITY_MODES.SECURE && hasEncryptedSecurePayload(revision)) {
    return revision;
  }

  return {
    ...revision,
    ...safeSecurePlaceholders(),
    ...encryptSecureNoteBody(revision.body_markdown || ""),
    security_mode: NOTE_SECURITY_MODES.SECURE,
  };
}

/**
 * @param {NotesServiceNoteLike} previousNote
 * @param {NotesServiceNoteLike} nextNote
 */
function shouldCreateNoteRevision(previousNote, nextNote) {
  if (isEffectivelySecureNote(previousNote) || isEffectivelySecureNote(nextNote)) {
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

/**
 * @param {NoteRevisionRecord[]} revisions
 * @param {NotesServiceNoteLike} note
 */
function visibleRevisionSnapshots(revisions = [], note = {}) {
  const visible = revisions.filter((revision, index) => shouldShowRevisionSnapshot(revision, revisions, index, note));

  if (visible.length === 1 && Number(visible[0].revision_number) === 1) {
    return [];
  }

  return visible;
}

/**
 * @param {NoteRevisionRecord} revision
 * @param {NoteRevisionRecord[]} revisions
 * @param {number} index
 * @param {NotesServiceNoteLike} note
 */
function shouldShowRevisionSnapshot(revision, revisions, index, note) {
  if (revision.security_mode === NOTE_SECURITY_MODES.SECURE || isEffectivelySecureNote(note)) {
    return true;
  }

  const isLatestStoredRevision = index === 0;
  if (!isLatestStoredRevision || !["Note updated.", "Note restored.", "Note archived.", "Note deleted."].includes(revision.change_summary || "")) {
    return true;
  }

  return !revisionMatchesCurrentNote(revision, note);
}

/**
 * @param {NoteRevisionRecord} revision
 * @param {NotesServiceNoteLike} note
 */
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

/**
 * @template {NotesServiceNoteLike} T
 * @param {NotesServiceSession} session
 * @param {T} note
 * @returns {Promise<T & {body_html: string, links: NotesServiceDecoratedLink[], linked_context: Record<string, NotesServiceTarget>, owner_display_name: string, tags: NotesServiceTag[]}>}
 */
async function attachNoteIntegrations(session, note) {
  const [taggedNote] = await tagsService.decorateRecordsWithEffectiveTags(session, "note", [note], { idField: "note_id" });
  const links = await notesRepository.listLinks(session.workspace_id, note.note_id || "");

  return {
    ...note,
    ...taggedNote,
    body_html: renderNoteBodyHtml(note),
    links: await decorateNoteLinks(session, links),
    linked_context: await readLinkedContextSummary(session, note),
    owner_display_name: await resolveNoteOwnerLabel(session, note),
    tags: taggedNote.tags || [],
  };
}

/**
 * @param {NotesServiceSession} session
 * @param {NotesServiceNoteLike} note
 */
async function resolveNoteOwnerLabel(session, note = {}) {
  const ownerUserId = normalizeOptionalText(note.owner_user_id);
  if (!ownerUserId) {
    return "";
  }
  try {
    const user = await usersRepository.readById(session.workspace_id, ownerUserId);
    return user ? String(user.display_name || user.displayName || user.username || "") : "";
  } catch {
    return "";
  }
}

/**
 * @template {NotesServiceNoteLike} T
 * @param {T} note
 * @param {{ includeBodyHtml?: boolean }} arg2
 * @returns {T}
 */
function shapeNoteForBrowser(note, { includeBodyHtml = false } = {}) {
  const shaped = stripSecureStorageFields(note);

  if (isEffectivelySecureNote(shaped)) {
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

/**
 * @template {NotesServiceNoteLike} T
 * @param {NotesServiceSession} session
 * @param {T} note
 * @param {NotesServiceOptions} options
 * @returns {Promise<T>}
 */
async function shapeNoteForWorkspaceRead(session, note, options = {}) {
  return shapeNoteForBrowser(
    normalizeNoteVisibilityForWorkspace(note, await readNotesWorkspaceType(session)),
    options,
  );
}

/**
 * @param {NotesServiceNoteLike} note
 */
function shapeLinkedNotePanelItem(note = {}) {
  const shaped = shapeNoteForBrowser(note, { includeBodyHtml: false });
  delete shaped.body_markdown;
  delete shaped.body_plaintext_index;
  delete shaped.metadata_json;

  return {
    ...shaped,
    id: shaped.note_id,
    label: shaped.title || "Untitled note",
    excerpt: isEffectivelySecureNote(shaped) ? null : shaped.body_excerpt || "",
    sourceUrl: noteSourceUrl(shaped.note_id),
    links: Array.isArray(shaped.links) ? shaped.links.map(shapeSafeNoteLink) : [],
  };
}

/**
 * @param {NotesServiceNoteLike} note
 */
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

/**
 * @param {NotesServiceSession} session
 * @param {NotesServiceNoteLike[]} notes
 * @param {Map<string, NotesServiceLinkLike[]>} linksByNoteId
 */
async function createLinkedContextAccessCache(session, notes = [], linksByNoteId = new Map()) {
  /** @type {Map<NotesServiceLinkTargetType, Set<string>>} */
  const idsByType = new Map();
  for (const note of notes) {
    const targets = [
      ...noteContextTargets(note),
      ...(linksByNoteId.get(note.note_id || "") || []).map((link) => ({
        target_type: link.target_type,
        target_id: link.target_id,
      })),
    ];
    for (const target of targets) {
      const targetType = normalizeOptionalText(target.target_type);
      const targetId = normalizeOptionalText(target.target_id);
      if (!targetId || !isLinkTargetType(targetType) || targetType === "workspace") continue;
      const ids = idsByType.get(targetType) || new Set();
      ids.add(targetId);
      idsByType.set(targetType, ids);
    }
  }

  const noteIds = [...(idsByType.get("note") || [])];
  const [directory, linkedNotes] = await Promise.all([
    linkTargetDirectory.createAccessCache(session, idsByType),
    noteIds.length > 0 ? notesRepository.readByIds(session.workspace_id, noteIds) : [],
  ]);
  return {
    directory,
    notes: new Map(linkedNotes.map((note) => /** @type {const} */ ([note.note_id, note]))),
  };
}

/**
 * @param {NotesServiceNote} note
 */
function shapeConsumerNoteSummary(note) {
  return {
    note_id: note.note_id,
    workspace_id: note.workspace_id,
    title: note.title || "Untitled note",
    status: note.status || "active",
    archived_at: note.archived_at || null,
    deleted_at: note.deleted_at || null,
    visibility: note.visibility || "internal",
    security_mode: note.security_mode || "normal",
    effective_security_mode: note.effective_security_mode || note.security_mode || "normal",
    security_resolution_state: note.security_resolution_state || "resolved",
    client_id: note.client_id || "",
    project_id: note.project_id || "",
    source_url: noteSourceUrl(note.note_id),
  };
}

/**
 * @param {NotesServiceLinkLike | NotesServiceDecoratedLink} link
 */
function shapeSafeNoteLink(link = {}) {
  const target = normalizeSavedTarget(link);
  return {
    noteLinkId: link.note_link_id || "",
    moduleId: link.module_id || "",
    targetType: link.target_type || "",
    targetId: link.target_id || "",
    label: String(link.label || safeTargetFallbackLabel(target)),
    subtitle: String(link.subtitle || ""),
    sourceUrl: String(link.source_url || targetSourceUrl(target)),
    linkRole: link.link_role || "related",
    scopeRole: link.scope_role || "related",
  };
}

/**
 * @param {NotesServiceSession} session
 * @param {NoteLinkRecord[]} links
 * @returns {Promise<NotesServiceDecoratedLink[]>}
 */
async function decorateNoteLinks(session, links = []) {
  /** @type {NotesServiceDecoratedLink[]} */
  const decorated = [];

  for (const link of links) {
    const summary = await readTargetSummary(session, link);
    decorated.push({
      ...link,
      ...summary,
      note_link_id: link.note_link_id,
      workspace_id: link.workspace_id,
      note_id: link.note_id,
      module_id: link.module_id,
      target_type: link.target_type,
      target_id: link.target_id,
      link_role: link.link_role,
      scope_role: link.scope_role,
      created_by_user_id: link.created_by_user_id,
      created_at: link.created_at,
      removed_at: link.removed_at,
      metadata_json: link.metadata_json,
    });
  }

  return decorated;
}

/**
 * @param {NotesServiceSession} session
 * @param {NotesServiceNoteLike} note
 * @returns {Promise<Record<string, NotesServiceTarget>>}
 */
async function readLinkedContextSummary(session, note = {}) {
  /** @type {Record<string, NotesServiceTarget>} */
  const contexts = {};

  for (const rawTarget of noteContextTargets(note)) {
    const target = normalizeSavedTarget(rawTarget);
    const summary = await readTargetSummary(session, target);
    contexts[target.target_type] = {
      ...shapeLinkTarget({
        ...target,
        ...summary,
      }),
      unavailable: Boolean("unavailable" in summary && summary.unavailable),
    };
  }

  return contexts;
}

/**
 * @param {NotesServiceSession} session
 * @param {NotesServiceTarget | NotesServiceLinkLike} target
 * @returns {Promise<NotesServiceTarget>}
 */
async function readTargetSummary(session, target = {}) {
  const normalizedTarget = normalizeSavedTarget({
    ...target,
    target_id: target.target_id || target.targetId,
    target_type: target.target_type || target.targetType,
    module_id: target.module_id || target.moduleId,
  });

  try {
    if (!(await canTargetAccess(session, normalizedTarget))) {
      return safeUnavailableTarget(normalizedTarget);
    }

    if (isLinkTargetType(normalizedTarget.target_type) && linkTargetDirectory.externalTargetTypes.includes(normalizedTarget.target_type)) {
      return linkTargetDirectory.readSummary(session, normalizedTarget.target_type, normalizedTarget.target_id);
    }

    if (normalizedTarget.target_type === "workspace") {
      const workspace = await workspacesRepository.readById(session.workspace_id);
      return {
        label: workspace?.workspace_name || "Workspace",
        subtitle: "Workspace",
        source_url: "dashboard.html",
      };
    }
    if (normalizedTarget.target_type === "note") {
      const note = await notesRepository.readById(session.workspace_id, normalizedTarget.target_id);
      const collection = note?.note_collection_id
        ? await notesRepository.readCollectionById(session.workspace_id, note.note_collection_id)
        : null;
      const collectionsById = collection ? new Map([[collection.note_library_collection_id, collection]]) : new Map();
      const targetContext = await readLinkTargetContext(session);
      const noteTitle = note ? noteTargetPlainLabel(note) : "";
      const secondaryLabel = note ? noteTargetSecondaryLabel(note, collectionsById, targetContext) : "";
      return note ? {
        label: noteTitle,
        display_label: noteTitle,
        secondary_label: secondaryLabel,
        sort_key: noteTargetSortKey(note, collectionsById, targetContext),
        subtitle: secondaryLabel,
        source_url: noteSourceUrl(note.note_id),
        client_id: note.client_id || "",
        client_name: recordTargetClientName(note, targetContext),
        project_id: note.project_id || "",
        project_name: recordTargetProjectName(note, targetContext),
        note_id: note.note_id,
        title: noteTitle,
        full_label: noteTitle,
        aria_label: noteTargetAccessibleLabel(note, collectionsById, targetContext),
        workspace_id: session.workspace_id,
        workspace_name: targetContext.workspaceName,
      } : safeUnavailableTarget(normalizedTarget);
    }
  } catch {
    return safeUnavailableTarget(normalizedTarget);
  }

  return safeUnavailableTarget(normalizedTarget);
}

/** @param {string} value @returns {value is NotesServiceLinkTargetType} */
/**
 * Membership test for the published target-type union, declared as the type predicate it has
 * always been. `0.33.33.36` added the predicate rather than a cast: the set it checks holds
 * exactly the seven members `LinkTargetType` declares, so a value that passes really is one.
 * The `typeof` check is the behaviour `Set.has` already had for a non-string.
 * @param {unknown} value
 * @returns {value is LinkTargetType}
 */
function isLinkTargetType(value) {
  return typeof value === "string" && LINK_TARGET_TYPES.has(value);
}

/**
 * Build a published candidate whose target type is known at the call site.
 *
 * `shapeLinkTarget` stays deliberately tolerant - it accepts either casing and falls back to an
 * empty type - so its own return cannot promise the union. This wrapper carries the narrow type
 * in a parameter and applies the same value it passed in, which is how the producer satisfies
 * `LinkTargetCandidate` without a cast and without changing what is emitted.
 * @param {LinkTargetType} targetType
 * @param {Record<string, unknown>} target
 * @returns {LinkTarget}
 */
function shapeLinkTargetCandidate(targetType, target) {
  return { ...shapeLinkTarget({ ...target, target_type: targetType }), targetType };
}

/**
 * @param {NotesServiceTarget} target
 */
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

/**
 * @param {NotesServiceTarget} target
 */
function safeUnavailableTarget(target = {}) {
  const label = safeTargetFallbackLabel(target);

  return {
    label,
    display_label: label,
    full_label: label,
    aria_label: label,
    subtitle: "",
    secondary_label: "",
    sort_key: sortText(label),
    source_url: "",
    is_available: false,
    unavailable: true,
  };
}

/**
 * @param {unknown} value
 * @param {string} targetType
 */
function readableTargetLabel(value, targetType) {
  return normalizeOptionalText(value) || safeTargetFallbackLabel({ target_type: targetType });
}

/**
 * @param {NotesServiceTarget} target
 */
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

/**
 * @param {string} targetType
 */
function suggestedLibraryForTargetType(targetType = "") {
  if (targetType === "task") {
    return NOTE_LIBRARY_BUCKETS.ACTIVE_WORK;
  }
  if (["client", "project", "user"].includes(targetType)) {
    return NOTE_LIBRARY_BUCKETS.ONGOING_AREA;
  }
  return "";
}

/**
 * @param {NotesServiceTarget} target
 */
function shapeLinkedNoteTarget(target = {}) {
  return {
    moduleId: target.module_id || "",
    targetType: target.target_type || "",
    targetId: target.target_id || "",
    sourceUrl: targetSourceUrl(target),
  };
}

/**
 * @param {NotesWorkspaceSession} session
 * @param {NotesServiceModuleState} moduleState
 */
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

/**
 * @param {NotesWorkspaceSession} session
 */
async function canManageLinkedNotePropagation(session) {
  const moduleState = await readNotesModuleState(session);
  if (!moduleState.enabled) {
    return false;
  }

  return permissionsService.can(session, NOTE_PERMISSIONS.MANAGE_LINKS, {
    workspace_id: session.workspace_id,
    operation: "manage_links",
  });
}

/**
 * @param {NotesWorkspaceSession} session
 * @param {NotesServiceLinkLike[]} links
 */
async function accessibleNoteIdSetForLinks(session, links = []) {
  const noteIds = [...new Set((Array.isArray(links) ? links : [])
    .map((link) => normalizeOptionalText(link.note_id || link.noteId))
    .filter(Boolean))];

  if (noteIds.length === 0) {
    return new Set();
  }

  const notes = await notesRepository.readByIds(session.workspace_id, noteIds);
  const accessible = await filterAccessibleNotes(session, notes);
  return new Set(accessible
    .filter((note) => canExposeNoteToConsumer(note, "notes.relationships", { authorized: true }))
    .map((note) => note.note_id));
}

/**
 * @param {NotesWorkspaceSession} session
 * @param {NotesServiceLinkContext} result
 */
async function finalizePropagatedNoteLinkChanges(session, result = {}) {
  const changedLinks = [
    ...(result.removedLinks || []),
    ...(result.createdLinks || []),
  ];
  const noteIds = [...new Set(changedLinks.map((link) => link.note_id).filter(Boolean))];
  const notesById = new Map((await notesRepository.readByIds(session.workspace_id, noteIds))
    .map((note) => [note.note_id, note]));

  for (const removedLink of result.removedLinks || []) {
    const note = notesById.get(removedLink.note_id);
    if (!note) {
      continue;
    }
    const previousLink = {
      ...removedLink,
      removed_at: "",
    };
    await requestTagPropagationRefresh(session, "note", note.note_id, "note.link_removed");
    await recordNoteAudit(session, "note_link_removed", "delete", previousLink, removedLink, "note_link");
    await emitNoteEvent("note.unlinked", session, note, note, { link: removedLink });
    await syncNoteSearchIndex(session.workspace_id, note.note_id, "note.unlinked");
  }

  for (const createdLink of result.createdLinks || []) {
    const note = notesById.get(createdLink.note_id);
    if (!note) {
      continue;
    }
    await requestTagPropagationRefresh(session, "note", note.note_id, "note.link_created");
    await recordNoteAudit(session, "note_link_created", "create", null, createdLink, "note_link");
    await emitNoteEvent("note.linked", session, null, note, { link: createdLink });
    await syncNoteSearchIndex(session.workspace_id, note.note_id, "note.linked");
  }
}

/**
 * @param {NotesServiceTarget} target
 */
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

/**
 * @param {NotesServiceRevisionLike} revision
 * @param {{ includeBody?: boolean }} arg2
 */
function shapeRevisionForBrowser(revision = {}, { includeBody = true } = {}) {
  const shaped = stripSecureStorageFields(revision);

  if (isEffectivelySecureNote(shaped)) {
    if (!includeBody) {
      delete shaped.body_markdown;
    }
    shaped.body_excerpt = null;
    shaped.secure_title_warning = SECURE_NOTE_TITLE_WARNING;
    delete shaped.secure_body_decrypted;
  }

  return shaped;
}

/**
 * @template {NotesServiceNoteLike | NotesServiceRevisionLike} T
 * @param {T} value
 * @returns {T}
 */
function stripSecureStorageFields(value) {
  const safe = { ...value };

  delete safe.secure_payload;
  delete safe.secure_payload_version;
  delete safe.encrypted_data_key;
  delete safe.encryption_key_version;
  delete safe.encryption_algorithm;
  delete safe.key_wrapping_algorithm;
  delete safe.encryption_nonce;
  delete safe.encryption_auth_tag;
  delete safe.key_wrapping_nonce;
  delete safe.key_wrapping_auth_tag;
  delete safe.encrypted_at;

  return /** @type {T} */ (safe);
}

/**
 * @param {NotesServiceSession} session
 * @param {string} noteId
 */
async function readNoteOrThrow(session, noteId) {
  const note = await notesRepository.readById(session.workspace_id, noteId);

  if (!note) {
    throw new AppError("Note not found.", 404);
  }

  return note;
}

/**
 * @param {NotesServiceNoteLike} note
 */
function notePermissionResource(note = {}) {
  return {
    client_id: note.client_id || "",
    operation: "read",
    project_id: note.project_id || "",
    workspace_id: note.workspace_id || "",
  };
}

/**
 * @param {NotesServiceSession} session
 * @param {Partial<import("../../types/http-contracts.js").PermissionResource>} resource
 */
async function readNotePermissionSet(session, resource = {}) {
  /** @type {Array<[string, boolean]>} */
  const entries = await Promise.all(NOTE_PERMISSION_VALUES.map(async (permissionId) => [
    permissionId,
    await permissionsService.can(session, permissionId, {
      workspace_id: resource.workspace_id || session.workspace_id,
      client_id: resource.client_id || "",
      project_id: resource.project_id || "",
      operation: resource.operation || "read",
    }),
  ]));

  return new Set(entries.filter(([, allowed]) => allowed).map(([permissionId]) => permissionId));
}

/**
 * @param {NotesServiceSession} session
 */
async function readNotesModuleState(session) {
  const moduleDefinition = modulesService.getModule(NOTES_MODULE_ID);
  const workspaceType = await readNotesWorkspaceType(session);

  return {
    notesModuleEnabled: await modulesService.canWriteModule(session.workspace_id, NOTES_MODULE_ID),
    enabled: await modulesService.canWriteModule(session.workspace_id, NOTES_MODULE_ID),
    historicalReadAccess: moduleDefinition?.historicalReadAccess !== false,
    workspaceType,
  };
}

/**
 * @param {NotesServiceSession} session
 */
async function readNotesWorkspaceType(session) {
  const workspace = await workspacesRepository.readById(session.workspace_id);
  return normalizeWorkspaceType(workspace?.workspace_type);
}

/**
 * @param {NotesWorkspaceSession} session
 * @param {string} visibility
 * @param {{ explicit?: boolean, preserveLegacy?: boolean }} arg3
 * @returns {Promise<string>}
 */
async function normalizeNoteVisibilityForWrite(session, visibility, { explicit = false, preserveLegacy = false } = {}) {
  const workspaceType = await readNotesWorkspaceType(session);

  if (workspaceType === "personal") {
    if (explicit && visibility !== NOTE_VISIBILITIES.INTERNAL) {
      throw new AppError("Personal workspace notes do not support visibility choices.", 400);
    }
    return preserveLegacy ? visibility : NOTE_VISIBILITIES.INTERNAL;
  }
  if (workspaceType === "family" && visibility === NOTE_VISIBILITIES.CLIENT_VISIBLE) {
    if (explicit) {
      throw new AppError("Family workspace notes cannot be client-visible.", 400);
    }
    return preserveLegacy ? visibility : NOTE_VISIBILITIES.INTERNAL;
  }

  return visibility;
}

/**
 * @param {NotesWorkspaceSession} session
 */
async function assertNotesWriteEnabled(session) {
  if (await modulesService.canWriteModule(session.workspace_id, NOTES_MODULE_ID)) {
    return;
  }

  throw new AppError("This module is disabled for this workspace.", 403);
}

/**
 * @param {NotesServiceSession} session
 * @param {NotesServiceQuery} query
 */
async function normalizeNoteListQuery(session, query = {}) {
  const filters = normalizeListFilters(query);
  const workspaceType = await readNotesWorkspaceType(session);
  if (workspaceType === "personal" && filters.visibility) {
    throw new AppError("Personal workspace notes do not support visibility filters.", 400);
  }
  if (workspaceType === "family" && filters.visibility === NOTE_VISIBILITIES.CLIENT_VISIBLE) {
    throw new AppError("Family workspace notes cannot be filtered by Client visibility.", 400);
  }
  const collectionFilter = await resolveCollectionListFilter(session, filters);
  const scope = await resolveClientProjectFilterScope(session, {
    clientId: filters.clientId,
    hasClientFilter: hasQueryFilter(query, ["clientId", "client_id"]),
    hasProjectFilter: hasQueryFilter(query, ["projectId", "project_id"]),
    projectId: filters.projectId,
  });

  return {
    ...filters,
    ...collectionFilter,
    clientFilterMode: scope.clientFilterMode,
    clientIds: scope.clientIds,
    clientProjectIds: scope.clientProjectIds,
    hasClientFilter: scope.hasClientFilter,
    hasProjectFilter: scope.hasProjectFilter,
    omitClientFilterBecauseProjectSelected: scope.omitClientFilterBecauseProjectSelected,
    projectFilterMode: scope.projectFilterMode,
    projectIds: scope.projectIds,
  };
}

/**
 * @param {NotesServiceQuery} query
 * @returns {NotesServiceListFilters}
 */
function normalizeListFilters(query = {}) {
  return {
    libraryBucket: normalizeLibraryBucketFilter(query.libraryBucket || query.library_bucket || query.library),
    status: normalizeOptionalListEnum(query.status, NOTE_STATUS_VALUES, "Note status"),
    includeDeleted: query.includeDeleted === "true" || query.include_deleted === "true",
    clientId: normalizeOptionalText(query.clientId || query.client_id),
    projectId: normalizeOptionalText(query.projectId || query.project_id),
    taskId: normalizeOptionalText(query.taskId || query.task_id),
    ticketId: normalizeOptionalText(query.ticketId || query.ticket_id),
    linkedUserId: normalizeOptionalText(query.userId || query.user_id || query.linkedUserId || query.linked_user_id),
    noteCollectionId: normalizeOptionalText(query.noteCollectionId || query.note_collection_id || query.collectionId || query.collection_id || query.collection),
    noteType: normalizeOptionalListEnum(query.noteType || query.note_type, NOTE_TYPE_VALUES, "Note Kind"),
    ownerUserId: normalizeOptionalText(query.ownerUserId || query.owner_user_id),
    ownerSearch: normalizeOptionalText(query.owner || query.ownerSearch || query.owner_search),
    visibility: normalizeOptionalListEnum(query.visibility, NOTE_VISIBILITY_VALUES, "Note visibility"),
    securityMode: normalizeOptionalListEnum(query.securityMode || query.security_mode || query.security, NOTE_SECURITY_MODE_VALUES, "Note security mode"),
    updatedSince: normalizeOptionalText(query.updatedSince || query.updated_since),
    contextSearch: normalizeOptionalText(query.context || query.contextSearch || query.context_search),
    searchQuery: normalizeOptionalText(query.q || query.query || query.search),
    tagIds: normalizeIdList(query.tagIds || query.tag_ids || query.tagId || query.tag_id),
    tagMatch: normalizeOptionalText(query.tagMatch || query.tag_match) === "all" ? "all" : "any",
    tagQuery: normalizeOptionalText(query.tags || query.tagQuery || query.tag_query),
    sort: normalizeNoteListSort(query.sort || query.sort_by || query.order),
  };
}

/**
 * @param {NotesServiceSession} session
 * @param {NotesServiceListFilters} filters
 */
async function resolveCollectionListFilter(session, filters = {}) {
  return notesCollectionsService.resolveListFilter(session, {
    libraryBucket: normalizeLibraryBucketFilter(filters.libraryBucket),
    noteCollectionId: filters.noteCollectionId || "",
  });
}

/**
 * @param {NotesServiceQuery} query
 * @param {NotesServiceOptions} options
 */
function normalizeNoteListPagination(query = {}, options = {}) {
  if (!options.paginate) {
    return null;
  }

  const requestedPageSize = Number.parseInt(String(query.limit || query.page_size || query.pageSize || ""), 10);
  const pageSize = Math.min(
    NOTE_LIST_MAX_PAGE_SIZE,
    Math.max(1, Number.isInteger(requestedPageSize) && requestedPageSize > 0
      ? requestedPageSize
      : NOTE_LIST_DEFAULT_PAGE_SIZE),
  );
  const cursorOffset = query.cursor ? decodeNoteListCursor(query.cursor) : 0;
  const offset = cursorOffset || normalizeOffset(query.offset);

  return {
    offset,
    pageSize,
  };
}

/** @param {unknown} value @returns {NotesLibraryBucket | ""} */
function normalizeLibraryBucketFilter(value) {
  const bucket = normalizeOptionalListEnum(value, LIBRARY_BUCKET_VALUES, "Library bucket");
  if (bucket === NOTE_LIBRARY_BUCKETS.ACTIVE_WORK || bucket === NOTE_LIBRARY_BUCKETS.ONGOING_AREA || bucket === NOTE_LIBRARY_BUCKETS.REFERENCE) {
    return bucket;
  }
  return "";
}

/**
 * @param {unknown} value
 */
function normalizeOffset(value) {
  const offset = Number.parseInt(String(value || ""), 10);
  return Number.isInteger(offset) && offset > 0 ? offset : 0;
}

/**
 * @param {NotesServiceQuery} query
 * @param {readonly string[]} keys
 */
function hasQueryFilter(query, keys) {
  if (!query || typeof query !== "object") {
    return false;
  }

  return keys.some((key) => Object.hasOwn(query, key));
}

/**
 * @param {number} offset
 */
function encodeNoteListCursor(offset) {
  return Buffer.from(JSON.stringify({ offset: Math.max(0, Number(offset) || 0) })).toString("base64url");
}

/**
 * @param {unknown} cursor
 */
function decodeNoteListCursor(cursor) {
  try {
    const parsed = JSON.parse(Buffer.from(String(cursor || ""), "base64url").toString("utf8"));
    const offset = Number.parseInt(parsed?.offset, 10);

    if (Number.isInteger(offset) && offset >= 0) {
      return offset;
    }
  } catch {
    // Fall through to the canonical 400 below.
  }

  throw new AppError("Notes list cursor is invalid.", 400);
}

/**
 * @param {unknown} value
 */
function normalizeNoteListSort(value) {
  const sort = normalizeOptionalText(value);
  return NOTE_LIST_SORT_MODES.has(sort) ? sort : "updated_desc";
}

/**
 * @param {NotesServiceQuery} query
 */
function normalizeResumeContextOptions(query = {}) {
  return {
    limit: Math.min(Math.max(Number.parseInt(String(query.limit), 10) || 20, 1), 50),
  };
}

/**
 * @param {NotesServiceNoteLike} note
 */
function isResumeContextEligibleNote(note = {}) {
  return note.library_bucket === NOTE_LIBRARY_BUCKETS.ACTIVE_WORK &&
    note.status === NOTE_STATUSES.ACTIVE &&
    note.visibility !== NOTE_VISIBILITIES.PRIVATE &&
    canExposeNoteToConsumer(note, "notes.resume") &&
    !note.deleted_at;
}

/**
 * @param {NotesServiceNoteLike} left
 * @param {NotesServiceNoteLike} right
 */
function compareNotesByUpdatedAt(left = {}, right = {}) {
  const rightTime = Date.parse(right.updated_at || right.created_at || "") || 0;
  const leftTime = Date.parse(left.updated_at || left.created_at || "") || 0;
  return rightTime - leftTime || String(left.title || "").localeCompare(String(right.title || ""));
}

/**
 * @param {unknown} value
 */
function normalizeIdList(value) {
  if (Array.isArray(value)) {
    return value.map(normalizeOptionalText).filter(Boolean);
  }

  return normalizeOptionalText(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

/**
 * @param {NotesServicePayload} payload
 * @param {NotesWorkspaceSession} session
 */
async function normalizeNoteBulkChanges(payload = {}, session) {
  const hasLibrary = Object.hasOwn(payload, "libraryBucket") || Object.hasOwn(payload, "library_bucket");
  const hasCollection = Object.hasOwn(payload, "noteCollectionId") || Object.hasOwn(payload, "note_collection_id");
  const hasNoteKind = Object.hasOwn(payload, "noteType") || Object.hasOwn(payload, "note_type");
  const hasVisibility = Object.hasOwn(payload, "visibility");
  let libraryBucket = hasLibrary
    ? normalizeEnum(payload.libraryBucket ?? payload.library_bucket, LIBRARY_BUCKET_VALUES, "Library bucket")
    : "";
  const noteCollectionId = hasCollection
    ? normalizeOptionalText(payload.noteCollectionId ?? payload.note_collection_id)
    : "";

  if (noteCollectionId) {
    const collection = await notesCollectionsService.readAssignableCollection(session, noteCollectionId);
    if (libraryBucket && collection.library_bucket !== libraryBucket) {
      throw new AppError("Note collection must be in the selected Library bucket.", 400);
    }
    libraryBucket = collection.library_bucket;
  }

  /** @type {Partial<NotePersistenceInput>} */
  const changes = {};
  if (libraryBucket) {
    changes.library_bucket = libraryBucket;
  }
  if (hasCollection) {
    changes.note_collection_id = noteCollectionId || null;
  } else if (hasLibrary) {
    changes.note_collection_id = null;
  }
  if (hasNoteKind) {
    changes.note_type = normalizeEnum(payload.noteType ?? payload.note_type, NOTE_TYPE_VALUES, "Note Kind");
  }
  if (hasVisibility) {
    changes.visibility = await normalizeNoteVisibilityForWrite(
      session,
      normalizeEnum(payload.visibility, NOTE_VISIBILITY_VALUES, "Note visibility"),
      { explicit: true },
    );
  }

  if (Object.keys(changes).length === 0) {
    throw new AppError("Choose at least one Notes field to update.", 400);
  }

  return changes;
}

/**
 * @param {unknown} value
 */
function normalizeAndValidateMarkdown(value) {
  try {
    return assertSafeMarkdown(String(value ?? ""));
  } catch (error) {
    throw new AppError(error instanceof Error && error.message ? error.message : "Note Markdown is unsafe.", 400);
  }
}

/**
 * @param {unknown} value
 * @param {string} label
 */
function normalizeRequiredText(value, label) {
  const text = normalizeOptionalText(value);

  if (!text) {
    throw new AppError(`${label} is required.`, 400);
  }

  return text;
}

/**
 * @param {unknown} value
 */
function normalizeOptionalText(value) {
  if (value === null || value === undefined) {
    return "";
  }

  return String(value).trim();
}

/** @param {unknown} error */
function readErrorStatus(error) {
  if (!error || typeof error !== "object") return 500;
  const status = "status" in error ? Number(error.status) : 0;
  const statusCode = "statusCode" in error ? Number(error.statusCode) : 0;
  return status || statusCode || 500;
}

/**
 * @param {unknown} value
 * @param {ReadonlySet<string>} allowedValues
 * @param {string} label
 */
function normalizeOptionalListEnum(value, allowedValues, label) {
  const text = normalizeOptionalText(value);

  if (!text || text === "all") {
    return "";
  }

  return normalizeEnum(text, allowedValues, label);
}

/**
 * @param {unknown} value
 * @param {ReadonlySet<string>} allowedValues
 * @param {string} label
 */
function normalizeEnum(value, allowedValues, label) {
  const text = normalizeOptionalText(value);

  if (!allowedValues.has(text)) {
    throw new AppError(`${label} '${text || "<empty>"}' is not supported.`, 400);
  }

  return text;
}

/**
 * @param {unknown} value
 */
function normalizeScopeRole(value) {
  const text = normalizeOptionalText(value) || "related";

  if (!["primary", "context", "related"].includes(text)) {
    throw new AppError("Note link scope role is not supported.", 400);
  }

  return text;
}

/**
 * @param {unknown} value
 */
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

/**
 * @param {NotesServicePayload} payload
 * @param {NotesServiceNoteLike | null} previousNote
 */
function normalizeImportMetadata(payload = {}, previousNote = null) {
  return Object.fromEntries(NOTE_IMPORT_METADATA_FIELDS.map((fieldName) => [
    fieldName,
    normalizeOptionalText(payload[fieldName] ?? previousNote?.[fieldName]) || null,
  ]));
}

/**
 * @param {NotesServiceNoteLike} note
 */
function copyImportMetadata(note = {}) {
  return Object.fromEntries(NOTE_IMPORT_METADATA_FIELDS.map((fieldName) => [fieldName, note[fieldName] || null]));
}

/**
 * @param {NotesWorkspaceSession} session
 * @param {NotesServiceNoteLike} note
 */
async function assertNoteCollectionAccess(session, note) {
  const libraryBucket = normalizeLibraryBucketFilter(note.library_bucket);
  if (!libraryBucket) throw new AppError("Note library bucket is required.", 400);
  await notesCollectionsService.assertNoteAssignment(session, {
    library_bucket: libraryBucket,
    note_collection_id: normalizeOptionalText(note.note_collection_id) || null,
  });
}

/**
 * @param {NotesServiceQuery} query
 */
function normalizeLinkedNotePanelOptions(query = {}) {
  const sort = normalizeOptionalText(query.sort || query.sortMode || query.sort_mode) || "updated";

  return {
    sort: LINKED_NOTE_SORT_MODES.has(sort) ? sort : "updated",
  };
}

/**
 * @param {NotesServiceNoteLike[]} notes
 * @param {string} sortMode
 */
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

/**
 * @param {NotesServiceNoteLike} left
 * @param {NotesServiceNoteLike} right
 */
function comparePinnedDesc(left = {}, right = {}) {
  return Number(Boolean(right.metadata?.pinned || right.metadata?.pinned_at)) -
    Number(Boolean(left.metadata?.pinned || left.metadata?.pinned_at));
}

/**
 * @param {NotesServiceNoteLike} left
 * @param {NotesServiceNoteLike} right
 */
function compareUpdatedDesc(left = {}, right = {}) {
  return String(right.updated_at || right.created_at || "").localeCompare(String(left.updated_at || left.created_at || ""));
}

/**
 * @param {unknown} left
 * @param {unknown} right
 */
function compareText(left, right) {
  return String(left || "").localeCompare(String(right || ""), undefined, { sensitivity: "base" });
}

/**
 * @param {string | undefined} noteId
 */
function noteSourceUrl(noteId) {
  return `notes.html?note=${encodeURIComponent(noteId || "")}`;
}

/**
 * @param {NotesServiceTarget} target
 */
function targetSourceUrl(target = {}) {
  const targetId = encodeURIComponent(target.target_id || "");
  switch (target.target_type) {
    case "workspace": return "dashboard.html";
    case "client": return "clients.html";
    case "list": return `lists.html?list=${targetId}`;
    case "note": return noteSourceUrl(target.target_id || "");
    case "project": return "projects.html";
    case "task": return `tasks.html?task=${targetId}`;
    case "user": return "settings.html";
    default: return "";
  }
}

/**
 * @param {NotesServiceNoteLike} note
 */
function createSearchIndexPayload(note = {}) {
  if (
    !canExposeNoteToConsumer(note, "notes.search") ||
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

/**
 * @param {string} workspaceId
 * @param {string} noteId
 * @param {string} reason
 */
async function syncNoteSearchIndex(workspaceId, noteId, reason) {
  await searchIndexSyncService.reindexRecord({
    workspaceId,
    moduleId: NOTES_MODULE_ID,
    recordType: "note",
    recordId: noteId,
    reason,
  });
}

/**
 * @param {NotesWorkspaceSession} session
 * @param {string} action
 * @param {string} changeType
 * @param {NotesServiceAuditValue | null} previousValue
 * @param {NotesServiceAuditValue | null} newValue
 * @param {string} recordType
 */
async function recordNoteAudit(session, action, changeType, previousValue, newValue, recordType = "note") {
  const noteValue = newValue?.note_id ? newValue : previousValue?.note_id ? previousValue : null;
  const protectedContent = noteValue ? isEffectivelySecureNote(noteValue) : false;
  const recordId = newValue?.note_link_id || newValue?.note_revision_id || newValue?.note_id || previousValue?.note_id ||
    newValue?.note_library_collection_id || previousValue?.note_library_collection_id;
  await auditService.record({
    session,
    action,
    changeType,
    recordType,
    recordId,
    recordLabel: protectedContent ? "Secure note" : newValue?.title || previousValue?.title || newValue?.target_id || "Note",
    recordUrl: recordType === "note_library"
      ? "notes-settings.html"
      : `notes.html?note=${encodeURIComponent(newValue?.note_id || previousValue?.note_id || "")}`,
    previousValue: safeAuditValue(previousValue),
    newValue: safeAuditValue(newValue),
    metadata: sanitizeNoteLifecyclePayload({
      workspace_id: session.workspace_id,
      actor_user_id: session.user_id,
      note_id: newValue?.note_id || previousValue?.note_id,
      title: protectedContent ? undefined : newValue?.title || previousValue?.title,
      body_excerpt: protectedContent ? undefined : newValue?.body_excerpt || previousValue?.body_excerpt,
      library_bucket: newValue?.library_bucket || previousValue?.library_bucket,
      visibility: newValue?.visibility || previousValue?.visibility,
      security_mode: newValue?.security_mode || previousValue?.security_mode,
      effective_security_mode: newValue?.effective_security_mode || previousValue?.effective_security_mode,
      client_id: newValue?.client_id || previousValue?.client_id,
      project_id: newValue?.project_id || previousValue?.project_id,
      task_id: newValue?.task_id || previousValue?.task_id,
      ticket_id: newValue?.ticket_id || previousValue?.ticket_id,
    }),
  });
}

/**
 * @param {NotesServiceSession} session
 * @param {NotesServiceNoteLike} note
 * @param {unknown} error
 */
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
      reason: error && typeof error === "object" && "code" in error
        ? String(error.code || "secure_note_decrypt_failed")
        : "secure_note_decrypt_failed",
    },
  });
}

/**
 * @param {string} eventName
 * @param {NotesWorkspaceSession} session
 * @param {NotesServiceNoteLike | null} previousValue
 * @param {NotesServiceNoteLike | null} newValue
 * @param {NotesServiceEventMetadata} metadata
 */
async function emitNoteEvent(eventName, session, previousValue, newValue, metadata = {}) {
  const note = newValue || previousValue || {};
  const protectedContent = !canExposeNoteToConsumer(note, "notes.notifications");
  const recipientUserIds = noteOwnerNotificationRecipients(eventName, session, note);
  await modulesService.emitInternalEvent(eventName, {
    session,
    moduleId: NOTES_MODULE_ID,
    recordType: "note",
    recordId: note.note_id,
    previousValue: safeAuditValue(previousValue),
    newValue: safeAuditValue(newValue),
    source: "api_key_id" in session && session.api_key_id ? "public_api" : "manual",
    metadata: {
      ...sanitizeNoteLifecyclePayload({
        workspace_id: session.workspace_id,
        actor_user_id: session.user_id,
        note_id: note.note_id,
        title: protectedContent ? undefined : note.title,
        body_excerpt: protectedContent ? undefined : note.body_excerpt,
        library_bucket: note.library_bucket,
        visibility: note.visibility,
        security_mode: note.security_mode,
        effective_security_mode: note.effective_security_mode,
        client_id: note.client_id,
        project_id: note.project_id,
        task_id: note.task_id,
        ticket_id: note.ticket_id,
      }),
      ...(recipientUserIds.length > 0 ? { recipient_user_ids: recipientUserIds } : {}),
      ...metadata,
      ...(protectedContent
        ? {
            suppress_activity: true,
            suppress_notifications: true,
            notification_suppression_reason: "secure_note",
          }
        : {}),
    },
  });
}

/**
 * @param {string} eventName
 * @param {NotesWorkspaceSession} session
 * @param {NotesServiceNoteLike} note
 */
function noteOwnerNotificationRecipients(eventName, session, note = {}) {
  if (eventName !== "note.updated") {
    return [];
  }

  const ownerUserId = normalizeOptionalText(note.owner_user_id);
  const actorUserId = normalizeOptionalText(session?.user_id);
  if (!ownerUserId || ownerUserId === actorUserId || !canExposeNoteToConsumer(note, "notes.notifications")) {
    return [];
  }

  return [ownerUserId];
}

/**
 * @param {NotesWorkspaceSession} session
 * @param {NotesServiceNoteLike} previousNote
 * @param {NotesServiceNoteLike} nextNote
 */
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

/**
 * @param {NotesServiceAuditValue | null | undefined} value
 */
function safeAuditValue(value) {
  if (!value) {
    return value;
  }

  if (isEffectivelySecureNote(value)) {
    return Object.fromEntries(Object.entries({
      note_id: value.note_id,
      workspace_id: value.workspace_id,
      note_type: value.note_type,
      library_bucket: value.library_bucket,
      status: value.status,
      visibility: value.visibility,
      security_mode: value.security_mode,
      effective_security_mode: value.effective_security_mode,
      security_inherited: value.security_inherited,
      security_resolution_state: value.security_resolution_state,
      security_source: value.security_source,
      note_collection_id: value.note_collection_id,
      client_id: value.client_id,
      project_id: value.project_id,
      task_id: value.task_id,
      ticket_id: value.ticket_id,
      linked_user_id: value.linked_user_id,
      archived_at: value.archived_at,
      deleted_at: value.deleted_at,
    }).filter(([, fieldValue]) => fieldValue !== undefined));
  }

  const safeValue = { ...value };
  delete safeValue.metadata_json;
  return safeValue;
}

/**
 * @param {NotesServiceNoteLike} previousNote
 * @param {NotesServiceNoteLike} nextNote
 */
function noteSecurityWasPreservedOnMove(previousNote = {}, nextNote = {}) {
  return previousNote.note_collection_id !== nextNote.note_collection_id &&
    previousNote.security_mode !== NOTE_SECURITY_MODES.SECURE &&
    isEffectivelySecureNote(previousNote) &&
    nextNote.security_mode === NOTE_SECURITY_MODES.SECURE;
}

/**
 * @param {NotesServicePayload} payload
 * @param {keyof NotesServicePayload} camelField
 * @param {keyof NotesServicePayload} snakeField
 * @param {unknown} fallback
 */
function normalizeNullablePayloadText(payload = {}, camelField, snakeField, fallback = "") {
  if (Object.hasOwn(payload, camelField)) {
    return normalizeOptionalText(payload[camelField]);
  }
  if (Object.hasOwn(payload, snakeField)) {
    return normalizeOptionalText(payload[snakeField]);
  }
  return normalizeOptionalText(fallback);
}

/**
 * @param {NotesServiceNoteLike} note
 */
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

/**
 * @param {NotesServiceNoteLike} note
 */
function renderNoteBodyHtml(note = {}) {
  if (isEffectivelySecureNote(note) && !note.secure_body_decrypted) {
    return "";
  }

  try {
    return renderMarkdownToSafeHtml(note.body_markdown || "");
  } catch {
    return "";
  }
}

/**
 * @param {string} reason
 */
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
  bulkManageCatalogs,
  bulkUpdate,
  changeLibrary,
  create,
  createCollection,
  createLink,
  createSearchIndexPayload,
  deleteEmptyCollection,
  deriveLibrarySuggestion,
  ensureCollectionsForImportPath,
  list,
  listAll,
  listArchived,
  listByLibraryBucket,
  listCatalogSettings,
  listConsumerSummaries,
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
  readConsumerSummary,
  readTaskLinkedNotePropagationStructure,
  readRevision,
  removeLink,
  replacePropagatedTaskLinkedNotes,
  restore,
  restoreCollection,
  restoreRevision,
  secureHealth,
  softDelete,
  updateCollection,
  update,
};
