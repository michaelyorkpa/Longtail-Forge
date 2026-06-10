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
  await assertCanAccess(session, normalized, "create");

  const note = await notesRepository.create(session.workspace_id, normalized);
  await maybeCreateRevision(session, null, note, "Initial note created.");
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

  await maybeCreateRevision(session, previousNote, note, "Note archived.");
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

  await maybeCreateRevision(session, previousNote, note, "Note restored.");
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

  await maybeCreateRevision(session, previousNote, note, "Note deleted.");
  await recordNoteAudit(session, "note_deleted", "delete", previousNote, note);
  await emitNoteEvent("note.deleted", session, previousNote, note);
  await syncNoteSearchIndex(session.workspace_id, note.note_id, "note.deleted");
  return { note };
}

async function listRevisions(noteId, session) {
  const note = await readNoteOrThrow(session, noteId);
  await assertCanAccess(session, note, "view_history");

  return { revisions: await notesRepository.listRevisions(session.workspace_id, noteId) };
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
  if (previousNote && !shouldCreateRevision(previousNote, nextNote)) {
    return null;
  }

  const revisionNumber = await notesRepository.nextRevisionNumber(session.workspace_id, nextNote.note_id);
  const revision = await notesRepository.createRevision(session.workspace_id, {
    ...createRevisionSnapshot(nextNote, {
      revisionNumber,
      changedByUserId: session.user_id,
      changeSummary,
    }),
    ...copyImportMetadata(nextNote),
  });

  await emitNoteEvent("note.revision_created", session, previousNote, nextNote, {
    revision_id: revision.note_revision_id,
    revision_number: revision.revision_number,
  });

  return revision;
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
  changeLibrary,
  create,
  createLink,
  createSearchIndexPayload,
  deriveLibrarySuggestion,
  list,
  listArchived,
  listByLibraryBucket,
  listForTarget,
  listLibrary,
  listLinks,
  listRevisions,
  read,
  readForAttachmentAccess,
  readRevision,
  removeLink,
  restore,
  restoreRevision,
  softDelete,
  update,
};
