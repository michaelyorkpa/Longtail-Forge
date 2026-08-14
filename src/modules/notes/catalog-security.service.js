// @ts-check

import { auditService } from "../../core/audit.js";
import { assertPublicDemoCapabilityAllowed } from "../../core/public-demo-enforcement.js";
import { AppError } from "../../core/errors.js";
import { getJobHandler, registerJobHandler } from "../../core/jobs/index.js";
import { enqueueJob } from "../../core/jobs/job-queue.js";
import { modulesService } from "../../core/modules/modules.service.js";
import { permissionsService } from "../../core/permissions.js";
import { usersRepository } from "../../repositories/users.repo.js";
import {
  AUTHENTICATION_THROTTLE_MESSAGE,
  authenticationThrottle,
  emitAuthenticationThrottleLockout,
} from "../../security/auth-throttle.js";
import { DUMMY_PASSWORD_HASH, verifyPassword } from "../../security/passwords.js";
import { searchIndexSyncService } from "../../services/search-index-sync.service.js";
import { searchService } from "../../services/search.service.js";
import { NOTE_PERMISSIONS } from "./access-policy.js";
import {
  NoteCatalogSecurityTransitionSchema,
  parseNotesEdgePayload,
} from "./notes.contracts.js";
import {
  CATALOG_SECURITY_POLICIES,
  CATALOG_SECURITY_TRANSITION_STATES,
  resolveNoteEffectiveSecurity,
} from "./effective-security.js";
import { createMarkdownExcerpt, extractPlainTextFromMarkdown } from "./markdown.js";
import { notesRepository } from "./notes.repo.js";
import { noteConsumerArtifactsService } from "./consumer-artifacts.service.js";
import {
  decryptSecureNoteBody,
  encryptSecureNoteBody,
  hasEncryptedSecurePayload,
  safeSecurePlaceholders,
} from "./secure-crypto.js";

/** @typedef {import("../../types/http-contracts.js").WorkspaceRequestSession} WorkspaceRequestSession */
/** @typedef {import("../../types/notes-domain-contracts.js").CatalogSecurityAction} CatalogSecurityAction */
/** @typedef {import("../../types/notes-domain-contracts.js").CatalogSecurityActorSession} CatalogSecurityActorSession */
/** @typedef {import("../../types/notes-domain-contracts.js").CatalogSecurityAuditContext} CatalogSecurityAuditContext */
/** @typedef {import("../../types/notes-domain-contracts.js").CatalogSecurityAuditMetadata} CatalogSecurityAuditMetadata */
/** @typedef {import("../../types/notes-domain-contracts.js").CatalogSecurityBlocker} CatalogSecurityBlocker */
/** @typedef {import("../../types/notes-domain-contracts.js").CatalogSecurityBlockerOptions} CatalogSecurityBlockerOptions */
/** @typedef {import("../../types/notes-domain-contracts.js").CatalogSecurityJobContext} CatalogSecurityJobContext */
/** @typedef {import("../../types/notes-domain-contracts.js").CatalogSecurityJobSession} CatalogSecurityJobSession */
/** @typedef {import("../../types/notes-domain-contracts.js").CatalogSecurityPayload} CatalogSecurityPayload */
/** @typedef {import("../../types/notes-domain-contracts.js").CatalogSecurityProcessOptions} CatalogSecurityProcessOptions */
/** @typedef {import("../../types/notes-domain-contracts.js").CatalogSecurityProcessResult} CatalogSecurityProcessResult */
/** @typedef {import("../../types/notes-domain-contracts.js").CatalogSecurityPublicPreflight} CatalogSecurityPublicPreflight */
/** @typedef {import("../../types/notes-domain-contracts.js").CatalogSecurityQuery} CatalogSecurityQuery */
/** @typedef {import("../../types/notes-domain-contracts.js").CatalogSecurityService} CatalogSecurityService */
/** @typedef {import("../../types/notes-domain-contracts.js").CatalogSecurityStartOptions} CatalogSecurityStartOptions */
/** @typedef {import("../../types/notes-domain-contracts.js").CatalogSecurityStartResult} CatalogSecurityStartResult */
/** @typedef {import("../../types/notes-domain-contracts.js").CatalogSecurityTransitionClaim} CatalogSecurityTransitionClaim */
/** @typedef {import("../../types/notes-domain-contracts.js").CatalogSecurityTransitionContext} CatalogSecurityTransitionContext */
/** @typedef {import("../../types/notes-domain-contracts.js").NoteCollectionStoredRecord} NoteCollectionStoredRecord */
/** @typedef {import("../../types/notes-domain-contracts.js").NotePersistenceInput} NotePersistenceInput */
/** @typedef {import("../../types/notes-domain-contracts.js").NoteRecord} NoteRecord */
/** @typedef {import("../../types/notes-domain-contracts.js").NoteRevisionPersistenceInput} NoteRevisionPersistenceInput */
/** @typedef {import("../../types/notes-domain-contracts.js").NoteRevisionRecord} NoteRevisionRecord */
/** @typedef {import("../../types/notes-collections-contracts.js").NoteCollectionRecord} NoteCollectionRecord */

const NOTES_MODULE_ID = "notes";
const CATALOG_SECURITY_JOB_TYPE = "notes.catalog-security";
const CATALOG_SECURITY_JOB_PRIORITY = 40;
const CATALOG_SECURITY_JOB_MAX_ATTEMPTS = 5;
const CATALOG_SECURITY_SYNC_RECORD_LIMIT = 100;
const CATALOG_SECURITY_BATCH_SIZE = 50;
const TRANSITION_ACTIONS = Object.freeze({
  ENABLE: "enable",
  REMOVE: "remove",
});
let catalogSecurityJobHandlerRegistered = false;

/** @param {{ replace?: boolean }} [options] */
function registerCatalogSecurityJobHandler(options = {}) {
  if (catalogSecurityJobHandlerRegistered && !options.replace && getJobHandler(CATALOG_SECURITY_JOB_TYPE)) {
    return;
  }

  registerJobHandler(CATALOG_SECURITY_JOB_TYPE, handleCatalogSecurityJob, { publicDemoCapability: "secure_notes.catalog_security", replace: true });
  catalogSecurityJobHandlerRegistered = true;
}

/** @param {string} collectionId @param {CatalogSecurityQuery} query @param {WorkspaceRequestSession} session */
async function preflight(collectionId, query = {}, session) {
  assertPublicDemoCapabilityAllowed("secure_notes.catalog_security");
  await assertTransitionPermissions(session);
  const action = normalizeAction(query.action);
  const context = await buildTransitionContext(session.workspace_id, collectionId, action);
  return { preflight: publicPreflight(context) };
}

/** @param {string} collectionId @param {unknown} rawPayload @param {WorkspaceRequestSession} session */
async function enable(collectionId, rawPayload, session) {
  assertPublicDemoCapabilityAllowed("secure_notes.catalog_security");
  await assertTransitionPermissions(session);
  const payload = parseNotesEdgePayload(NoteCatalogSecurityTransitionSchema, rawPayload);
  return startTransition(collectionId, TRANSITION_ACTIONS.ENABLE, payload, session);
}

/** @param {string} collectionId @param {unknown} rawPayload @param {WorkspaceRequestSession} session */
async function remove(collectionId, rawPayload, session) {
  assertPublicDemoCapabilityAllowed("secure_notes.catalog_security");
  await assertTransitionPermissions(session);
  const context = await buildTransitionContext(session.workspace_id, collectionId, TRANSITION_ACTIONS.REMOVE);
  const payload = parseNotesEdgePayload(NoteCatalogSecurityTransitionSchema, rawPayload);
  assertDowngradeConfirmation(payload, context);
  await reauthenticateCurrentUser(payload, session);
  return startTransition(collectionId, TRANSITION_ACTIONS.REMOVE, payload, session, { context });
}

/** @param {string} collectionId @param {unknown} rawPayload @param {WorkspaceRequestSession} session */
async function retry(collectionId, rawPayload, session) {
  assertPublicDemoCapabilityAllowed("secure_notes.catalog_security");
  await assertTransitionPermissions(session);
  const collection = await readCollectionOrThrow(session.workspace_id, collectionId);
  if (collection.security_transition_state !== CATALOG_SECURITY_TRANSITION_STATES.FAILED) {
    throw new AppError("Only a failed catalog security transition can be retried.", 409);
  }

  const action = normalizeAction(collection.security_transition_action);
  const context = await buildTransitionContext(session.workspace_id, collectionId, action);
  const payload = parseNotesEdgePayload(NoteCatalogSecurityTransitionSchema, rawPayload);
  if (action === TRANSITION_ACTIONS.REMOVE) {
    assertDowngradeConfirmation(payload, context);
    await reauthenticateCurrentUser(payload, session);
  }
  return startTransition(collectionId, action, payload, session, {
    allowFailed: true,
    context,
  });
}

/** @param {string} collectionId @param {CatalogSecurityAction} action @param {CatalogSecurityPayload} payload @param {WorkspaceRequestSession} session @param {CatalogSecurityStartOptions} [options] @returns {Promise<CatalogSecurityStartResult>} */
async function startTransition(collectionId, action, payload, session, options = {}) {
  const context = options.context || await buildTransitionContext(session.workspace_id, collectionId, action);
  assertTransitionCanStart(context, action);
  const expectedCount = optionalInteger(payload.confirmAffectedNoteCount ?? payload.confirm_affected_note_count);
  if (expectedCount !== null && expectedCount !== context.affectedNotes.length) {
    throw new AppError("Catalog contents changed after preflight. Review the affected-content preview again.", 409);
  }

  const expectedPolicy = action === TRANSITION_ACTIONS.ENABLE
    ? CATALOG_SECURITY_POLICIES.NORMAL
    : CATALOG_SECURITY_POLICIES.SECURE;
  const claimed = await notesRepository.claimCatalogSecurityTransition(session.workspace_id, collectionId, {
    action,
    actorUserId: session.user_id,
    allowFailed: options.allowFailed,
    expectedPolicy,
  });
  if (!claimed) {
    throw new AppError("Catalog security changed concurrently. Reload the preflight before retrying.", 409);
  }

  const claim = transitionClaim(claimed);
  await recordTransitionAudit(session, "note_catalog_security_requested", claimed, context, {
    action,
    execution: context.execution,
    transitionVersion: claim.transitionVersion,
  });

  if (context.execution === "job") {
    try {
      const queued = await enqueueJob({
        workspaceId: session.workspace_id,
        jobType: CATALOG_SECURITY_JOB_TYPE,
        dedupeKey: catalogSecurityDedupeKey(session.workspace_id, collectionId, claim.transitionVersion),
        priority: CATALOG_SECURITY_JOB_PRIORITY,
        maxAttempts: CATALOG_SECURITY_JOB_MAX_ATTEMPTS,
        payload: {
          action,
          actorUserId: session.user_id,
          collectionId,
          transitionVersion: claim.transitionVersion,
          workspaceId: session.workspace_id,
        },
      });
      const updated = await notesRepository.setCatalogSecurityTransitionJob(session.workspace_id, collectionId, {
        action,
        jobId: queued?.job?.jobId,
        transitionVersion: claim.transitionVersion,
      });
      if (!updated || !queued?.job?.jobId) {
        throw new Error("Catalog security transition job could not be attached to its claim.");
      }
      return {
        collection: await notesRepository.readCollectionById(session.workspace_id, collectionId),
        execution: "job",
        jobId: queued.job.jobId,
        preflight: publicPreflight(context),
        transitionVersion: claim.transitionVersion,
      };
    } catch (error) {
      await markTransitionFailed(session, claim, context, error);
      throw error;
    }
  }

  const result = await processTransition(claim, { session });
  return {
    ...result,
    execution: "synchronous",
    preflight: publicPreflight(context),
  };
}

/** @param {CatalogSecurityJobContext} [context] @returns {Promise<CatalogSecurityProcessResult>} */
async function handleCatalogSecurityJob({ payload = {} } = {}) {
  /** @type {CatalogSecurityTransitionClaim} */
  const claim = {
    action: normalizeAction(payload.action),
    actorUserId: normalizedText(payload.actorUserId || payload.actor_user_id),
    collectionId: requiredText(payload.collectionId || payload.collection_id, "Catalog security job requires a catalog."),
    transitionVersion: requiredPositiveInteger(payload.transitionVersion || payload.transition_version, "Catalog security job requires a transition version."),
    workspaceId: requiredText(payload.workspaceId || payload.workspace_id, "Catalog security job requires a workspace."),
  };
  const resumed = await notesRepository.resumeCatalogSecurityTransition(claim.workspaceId, claim.collectionId, claim);
  if (!resumed) {
    return { skipped: true, reason: "stale_transition_claim", ...claim };
  }
  return processTransition(claim, {
    session: jobSession(claim),
  });
}

/** @param {CatalogSecurityTransitionClaim} claim @param {CatalogSecurityProcessOptions} [options] @returns {Promise<CatalogSecurityProcessResult>} */
async function processTransition(claim, options = {}) {
  const session = options.session || jobSession(claim);
  /** @type {CatalogSecurityTransitionContext | undefined} */
  let context;
  try {
    context = await buildTransitionContext(claim.workspaceId, claim.collectionId, claim.action);
    const noteBatches = chunk(context.notesToTransform, CATALOG_SECURITY_BATCH_SIZE);
    for (const notes of noteBatches) {
      const noteIds = new Set(notes.map((note) => note.note_id));
      const revisions = context.revisionsToTransform.filter((revision) => noteIds.has(revision.note_id));
      const result = await notesRepository.applyCatalogSecurityBatch(claim.workspaceId, claim, {
        notes: notes.map((note) => transformNote(note, claim.action, claim.actorUserId)),
        revisions: revisions.map((revision) => transformRevision(revision, claim.action)),
      });
      if (!result.applied) {
        return { skipped: true, reason: "stale_transition_claim", ...claim };
      }
    }

    const transformedNoteIds = new Set(context.notesToTransform.map((note) => note.note_id));
    const remainingRevisions = context.revisionsToTransform.filter((revision) => !transformedNoteIds.has(revision.note_id));
    for (const revisions of chunk(remainingRevisions, CATALOG_SECURITY_BATCH_SIZE)) {
      const result = await notesRepository.applyCatalogSecurityBatch(claim.workspaceId, claim, {
        notes: [],
        revisions: revisions.map((revision) => transformRevision(revision, claim.action)),
      });
      if (!result.applied) {
        return { skipped: true, reason: "stale_transition_claim", ...claim };
      }
    }

    if (claim.action === TRANSITION_ACTIONS.ENABLE) {
      await removeSearchDocuments(claim.workspaceId, context.affectedNotes);
      await noteConsumerArtifactsService.removeExcludedConsumerArtifacts(
        claim.workspaceId,
        context.affectedNotes.map((note) => note.note_id),
      );
    }

    const verification = await buildTransitionContext(claim.workspaceId, claim.collectionId, claim.action);
    if (verification.notesToTransform.length > 0 || verification.revisionsToTransform.length > 0) {
      throw new Error("Catalog security transition verification found unfinished storage records.");
    }
    if (claim.action === TRANSITION_ACTIONS.ENABLE && verification.snapshot.searchDocumentCount > 0) {
      throw new Error("Catalog security transition verification found stale search documents.");
    }

    const targetPolicy = claim.action === TRANSITION_ACTIONS.ENABLE
      ? CATALOG_SECURITY_POLICIES.SECURE
      : CATALOG_SECURITY_POLICIES.NORMAL;
    const completed = await notesRepository.finalizeCatalogSecurityTransition(claim.workspaceId, claim.collectionId, {
      ...claim,
      actorUserId: claim.actorUserId,
      securityPolicy: targetPolicy,
    });
    if (!completed) {
      return { skipped: true, reason: "stale_transition_claim", ...claim };
    }

    if (claim.action === TRANSITION_ACTIONS.REMOVE) {
      await queueSearchReindex(claim.workspaceId, verification.affectedNotes);
    }
    await recordTransitionAudit(session, "note_catalog_security_completed", completed, verification, {
      action: claim.action,
      execution: "transition",
      transitionVersion: claim.transitionVersion,
    });
    return {
      collection: completed,
      completed: true,
      transitionVersion: claim.transitionVersion,
    };
  } catch (error) {
    await markTransitionFailed(session, claim, context, error);
    throw error;
  }
}

/** @param {string} workspaceId @param {string} collectionId @param {CatalogSecurityAction} action @returns {Promise<CatalogSecurityTransitionContext>} */
async function buildTransitionContext(workspaceId, collectionId, action) {
  const collection = await readCollectionOrThrow(workspaceId, collectionId);
  if (collection.status === "deleted") {
    throw new AppError("Deleted catalogs cannot change security policy.", 409);
  }
  if (collection.security_resolution_state !== "resolved") {
    throw new AppError("Catalog security hierarchy is unresolved and remains fail-closed.", 409);
  }

  const collections = await notesRepository.listCollections(workspaceId, {
    includeArchived: true,
    includeDeleted: true,
  });
  const scopeCollections = [collection, ...collectionDescendants(collection, collections)];
  const snapshot = await notesRepository.readCatalogSecuritySnapshot(
    workspaceId,
    scopeCollections.map((item) => item.note_library_collection_id),
  );
  const futureCollections = collections.map((item) => item.note_library_collection_id === collection.note_library_collection_id
    ? {
        ...item,
        security_policy: action === TRANSITION_ACTIONS.ENABLE
          ? CATALOG_SECURITY_POLICIES.SECURE
          : CATALOG_SECURITY_POLICIES.NORMAL,
        security_transition_state: CATALOG_SECURITY_TRANSITION_STATES.STABLE,
      }
    : item);
  const futureCollectionsById = new Map(futureCollections.map((item) => [item.note_library_collection_id, item]));
  const futureSecurityByNoteId = new Map(snapshot.notes.map((note) => [
    note.note_id,
    resolveNoteEffectiveSecurity(note, futureCollectionsById, workspaceId),
  ]));
  const affectedNotes = action === TRANSITION_ACTIONS.ENABLE
    ? snapshot.notes
    : snapshot.notes.filter((note) => futureSecurityByNoteId.get(note.note_id)?.effective_security_mode === "normal");
  const affectedNoteIds = new Set(affectedNotes.map((note) => note.note_id));
  const affectedRevisions = snapshot.revisions.filter((revision) => affectedNoteIds.has(revision.note_id));
  const notesToTransform = affectedNotes.filter((note) => action === TRANSITION_ACTIONS.ENABLE
    ? !hasEncryptedSecurePayload(note)
    : hasEncryptedSecurePayload(note));
  const revisionsToTransform = affectedRevisions.filter((revision) => action === TRANSITION_ACTIONS.ENABLE
    ? !hasEncryptedSecurePayload(revision)
    : hasEncryptedSecurePayload(revision));
  const blockers = transitionBlockers(action, affectedNotes, affectedRevisions, {
    allowPartialDowngrade: action === TRANSITION_ACTIONS.REMOVE &&
      collection.security_transition_action === TRANSITION_ACTIONS.REMOVE &&
      collection.security_transition_state !== CATALOG_SECURITY_TRANSITION_STATES.STABLE,
  });
  const workRecordCount = notesToTransform.length + revisionsToTransform.length;

  return {
    action,
    affectedNotes,
    affectedRevisions,
    blockers,
    collection,
    execution: workRecordCount > CATALOG_SECURITY_SYNC_RECORD_LIMIT ? "job" : "synchronous",
    notesToTransform,
    revisionsToTransform,
    scopeCollections,
    snapshot,
    workRecordCount,
  };
}

/** @param {CatalogSecurityAction} action @param {NoteRecord[]} notes @param {NoteRevisionRecord[]} revisions @param {CatalogSecurityBlockerOptions} [options] @returns {CatalogSecurityBlocker[]} */
function transitionBlockers(action, notes, revisions, options = {}) {
  if (action === TRANSITION_ACTIONS.ENABLE) {
    const placeholderNoteCount = notes.filter((note) => note.security_mode === "secure" && !hasEncryptedSecurePayload(note)).length;
    const placeholderRevisionCount = revisions.filter((revision) => revision.security_mode === "secure" && !hasEncryptedSecurePayload(revision)).length;
    return placeholderNoteCount || placeholderRevisionCount
      ? [{ code: "secure_placeholder_requires_recovery", noteCount: placeholderNoteCount, revisionCount: placeholderRevisionCount }]
      : [];
  }

  if (options.allowPartialDowngrade) {
    return [];
  }

  const lockedNoteCount = notes.filter((note) => !hasEncryptedSecurePayload(note)).length;
  const lockedRevisionCount = revisions.filter((revision) => !hasEncryptedSecurePayload(revision)).length;
  return lockedNoteCount || lockedRevisionCount
    ? [{ code: "secure_payload_missing", noteCount: lockedNoteCount, revisionCount: lockedRevisionCount }]
    : [];
}

/** @param {CatalogSecurityTransitionContext} context @param {CatalogSecurityAction} action */
function assertTransitionCanStart(context, action) {
  const expectedPolicy = action === TRANSITION_ACTIONS.ENABLE ? "normal" : "secure";
  if (context.collection.security_policy !== expectedPolicy) {
    throw new AppError(`Catalog security is already ${context.collection.security_policy}.`, 409);
  }
  if (!["stable", "failed"].includes(context.collection.security_transition_state)) {
    throw new AppError("Catalog security transition is already in progress.", 409);
  }
  if (context.blockers.length > 0) {
    throw new AppError("Catalog security transition requires operator recovery before it can continue.", 409, {
      code: context.blockers[0].code,
    });
  }
}

/** @param {CatalogSecurityPayload} payload @param {CatalogSecurityTransitionContext} context */
function assertDowngradeConfirmation(payload, context) {
  const confirmedCatalogId = normalizedText(payload.confirmCatalogId || payload.confirm_catalog_id);
  const confirmedCount = optionalInteger(payload.confirmAffectedNoteCount ?? payload.confirm_affected_note_count);
  const confirmedAction = normalizedText(payload.confirmAction || payload.confirm_action);
  if (
    confirmedCatalogId !== context.collection.note_library_collection_id ||
    confirmedCount !== context.affectedNotes.length ||
    confirmedAction !== "remove_security"
  ) {
    throw new AppError("Confirm the catalog, action, and current affected-note count before removing security.", 400);
  }
}

/** @param {WorkspaceRequestSession} session */
async function assertTransitionPermissions(session) {
  if (!await modulesService.canWriteModule(session.workspace_id, NOTES_MODULE_ID)) {
    throw new AppError("This module is disabled for this workspace.", 403);
  }
  await permissionsService.assertCanInAnyScope(session, NOTE_PERMISSIONS.MANAGE_LIBRARY, {
    operation: "manage_library",
    workspace_id: session.workspace_id,
  });
  await permissionsService.assertCanInAnyScope(session, NOTE_PERMISSIONS.SECURE_MANAGE, {
    operation: "manage",
    workspace_id: session.workspace_id,
  });
}

/** @param {CatalogSecurityPayload} payload @param {WorkspaceRequestSession} session */
async function reauthenticateCurrentUser(payload, session) {
  const currentPassword = String(payload.currentPassword || payload.current_password || "");
  if (!currentPassword) {
    throw new AppError("Current password is required to remove catalog security.", 400);
  }

  const user = await usersRepository.readById(session.workspace_id, session.user_id);
  const throttleContext = {
    actorUserId: session.user_id,
    ipAddress: session.ip_address,
    scope: "notes-secure-downgrade",
    username: session.username || user?.username,
    workspaceId: session.workspace_id,
  };
  const attempt = await authenticationThrottle.runWithVerificationAdmission(
    throttleContext,
    () => verifyPassword(currentPassword, user?.password || DUMMY_PASSWORD_HASH),
  );
  if (attempt.blocked) {
    throw new AppError(AUTHENTICATION_THROTTLE_MESSAGE, 429);
  }
  const verificationMatches = "value" in attempt && passwordVerificationMatches(attempt.value);
  if (!user || !verificationMatches) {
    const failure = await authenticationThrottle.recordSensitiveAction(throttleContext);
    await emitAuthenticationThrottleLockout(throttleContext, failure);
    if (failure.blocked) {
      throw new AppError(AUTHENTICATION_THROTTLE_MESSAGE, 429);
    }
    throw new AppError("Current password is incorrect.", 400);
  }
  await authenticationThrottle.reset(throttleContext);
}

/** @param {unknown} value */
function passwordVerificationMatches(value) {
  return Boolean(value && typeof value === "object" && "matches" in value && value.matches === true);
}

/** @param {NoteRecord} note @param {CatalogSecurityAction} action @param {string | null} actorUserId @returns {NotePersistenceInput & { note_id: string }} */
function transformNote(note, action, actorUserId) {
  const now = new Date().toISOString();
  if (action === TRANSITION_ACTIONS.ENABLE) {
    if (hasEncryptedSecurePayload(note)) return note;
    return {
      ...note,
      ...safeSecurePlaceholders(),
      ...encryptSecureNoteBody(note.body_markdown || ""),
      updated_at: now,
      updated_by_user_id: actorUserId || note.updated_by_user_id,
    };
  }

  const bodyMarkdown = decryptSecureNoteBody(note);
  return {
    ...note,
    body_markdown: bodyMarkdown,
    body_excerpt: createMarkdownExcerpt(bodyMarkdown),
    body_plaintext_index: extractPlainTextFromMarkdown(bodyMarkdown),
    security_mode: "normal",
    ...clearSecureFields(),
    updated_at: now,
    updated_by_user_id: actorUserId || note.updated_by_user_id,
  };
}

/** @param {NoteRevisionRecord} revision @param {CatalogSecurityAction} action @returns {NoteRevisionPersistenceInput & { note_revision_id: string }} */
function transformRevision(revision, action) {
  if (action === TRANSITION_ACTIONS.ENABLE) {
    if (hasEncryptedSecurePayload(revision)) return revision;
    return {
      ...revision,
      ...safeSecurePlaceholders(),
      ...encryptSecureNoteBody(revision.body_markdown || ""),
      security_mode: "secure",
    };
  }

  const bodyMarkdown = decryptSecureNoteBody(revision);
  return {
    ...revision,
    body_markdown: bodyMarkdown,
    body_excerpt: createMarkdownExcerpt(bodyMarkdown),
    security_mode: "normal",
    ...clearSecureFields(),
  };
}

/** @returns {import("../../types/notes-domain-contracts.js").SecureNoteEncryptedFields} */
function clearSecureFields() {
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

/** @param {string} workspaceId @param {NoteRecord[]} notes */
async function removeSearchDocuments(workspaceId, notes) {
  for (const note of notes) {
    const result = await searchService.removeSearchDocument({
      workspaceId,
      moduleId: NOTES_MODULE_ID,
      recordType: "note",
      recordId: note.note_id,
    }, { throwOnError: true });
    if (result?.ok === false) {
      throw new Error("Secure catalog search cleanup failed.");
    }
  }
}

/** @param {string} workspaceId @param {NoteRecord[]} notes */
async function queueSearchReindex(workspaceId, notes) {
  for (const note of notes) {
    await searchIndexSyncService.reindexRecord({
      workspaceId,
      moduleId: NOTES_MODULE_ID,
      recordType: "note",
      recordId: note.note_id,
      reason: "note.catalog_security_removed",
    });
  }
}

/** @param {CatalogSecurityActorSession | undefined} session @param {CatalogSecurityTransitionClaim} claim @param {CatalogSecurityTransitionContext | undefined} context @param {unknown} error */
async function markTransitionFailed(session, claim, context, error) {
  if (!claim?.workspaceId || !claim?.collectionId || !claim?.transitionVersion) return;
  const failed = await notesRepository.failCatalogSecurityTransition(claim.workspaceId, claim.collectionId, {
    ...claim,
    errorCode: safeErrorCode(error),
  });
  if (failed) {
    await recordTransitionAudit(session || jobSession(claim), "note_catalog_security_failed", failed, context, {
      action: claim.action,
      errorCode: safeErrorCode(error),
      execution: "transition",
      transitionVersion: claim.transitionVersion,
    });
  }
}

/** @param {CatalogSecurityActorSession} session @param {string} actionName @param {NoteCollectionRecord | NoteCollectionStoredRecord} collection @param {CatalogSecurityAuditContext} [context] @param {CatalogSecurityAuditMetadata} [metadata] */
async function recordTransitionAudit(session, actionName, collection, context = {}, metadata = {}) {
  const auditSession = "timezone" in session ? session : null;
  await auditService.record({
    session: auditSession,
    workspaceId: session.workspace_id,
    actorUserId: session.user_id,
    action: actionName,
    changeType: "update",
    recordType: "note_library",
    recordId: collection.note_library_collection_id,
    recordLabel: collection.title || "Notes catalog",
    recordUrl: "notes-settings.html",
    previousValue: null,
    newValue: {
      security_policy: collection.security_policy,
      security_transition_action: collection.security_transition_action,
      security_transition_state: collection.security_transition_state,
      security_transition_version: collection.security_transition_version,
    },
    metadata: {
      action: metadata.action,
      affected_note_count: context.affectedNotes?.length || 0,
      affected_revision_count: context.affectedRevisions?.length || 0,
      catalog_count: context.scopeCollections?.length || 0,
      error_code: metadata.errorCode || undefined,
      execution: metadata.execution,
      transition_version: metadata.transitionVersion,
      workspace_id: session.workspace_id,
      actor_user_id: session.user_id,
    },
  });
}

/** @param {CatalogSecurityTransitionContext} context @returns {CatalogSecurityPublicPreflight} */
function publicPreflight(context) {
  return {
    action: context.action,
    affectedNoteCount: context.affectedNotes.length,
    affectedRevisionCount: context.affectedRevisions.length,
    blockerCodes: context.blockers.map((blocker) => blocker.code),
    canProceed: context.blockers.length === 0,
    catalogCount: context.scopeCollections.length,
    catalogId: context.collection.note_library_collection_id,
    currentPolicy: context.collection.security_policy,
    execution: context.execution,
    noteTransformCount: context.notesToTransform.length,
    revisionTransformCount: context.revisionsToTransform.length,
    staleSearchDocumentCount: context.snapshot.searchDocumentCount,
    transitionState: context.collection.security_transition_state,
    workRecordCount: context.workRecordCount,
  };
}

/** @param {NoteCollectionRecord} root @param {NoteCollectionRecord[]} collections @returns {NoteCollectionRecord[]} */
function collectionDescendants(root, collections) {
  /** @type {Map<string, NoteCollectionRecord[]>} */
  const byParent = new Map();
  for (const collection of collections) {
    const parentId = collection.parent_collection_id || "";
    const siblings = byParent.get(parentId);
    if (siblings) siblings.push(collection);
    else byParent.set(parentId, [collection]);
  }
  /** @type {NoteCollectionRecord[]} */
  const descendants = [];
  const visited = new Set([root.note_library_collection_id]);
  const stack = [...(byParent.get(root.note_library_collection_id) || [])];
  while (stack.length > 0) {
    const next = stack.pop();
    if (!next || visited.has(next.note_library_collection_id)) continue;
    visited.add(next.note_library_collection_id);
    descendants.push(next);
    stack.push(...(byParent.get(next.note_library_collection_id) || []));
  }
  return descendants;
}

/** @param {string} workspaceId @param {unknown} collectionId @returns {Promise<NoteCollectionRecord>} */
async function readCollectionOrThrow(workspaceId, collectionId) {
  const collection = await notesRepository.readCollectionById(workspaceId, requiredText(collectionId, "Catalog ID is required."));
  if (!collection) throw new AppError("Note catalog not found.", 404);
  return collection;
}

/** @param {NoteCollectionRecord} collection @returns {CatalogSecurityTransitionClaim} */
function transitionClaim(collection) {
  return {
    action: normalizeAction(collection.security_transition_action),
    actorUserId: collection.security_transition_actor_user_id,
    collectionId: collection.note_library_collection_id,
    transitionVersion: Number(collection.security_transition_version),
    workspaceId: collection.workspace_id,
  };
}

/** @param {string} workspaceId @param {string} collectionId @param {number} transitionVersion */
function catalogSecurityDedupeKey(workspaceId, collectionId, transitionVersion) {
  return ["notes", "catalog-security", workspaceId, collectionId, transitionVersion].join(":");
}

/** @param {CatalogSecurityTransitionClaim} claim @returns {CatalogSecurityJobSession} */
function jobSession(claim) {
  return {
    user_id: claim.actorUserId || null,
    workspace_id: claim.workspaceId,
  };
}

/** @param {unknown} value @returns {CatalogSecurityAction} */
function normalizeAction(value) {
  const action = normalizedText(value);
  if (action !== TRANSITION_ACTIONS.ENABLE && action !== TRANSITION_ACTIONS.REMOVE) {
    throw new AppError("Catalog security action must be enable or remove.", 400);
  }
  return action;
}

/** @template Value @param {Value[]} values @param {number} size @returns {Value[][]} */
function chunk(values, size) {
  /** @type {Value[][]} */
  const chunks = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

/** @param {unknown} value */
function optionalInteger(value) {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : null;
}

/** @param {unknown} value @param {string} message */
function requiredPositiveInteger(value, message) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) throw new Error(message);
  return number;
}

/** @param {unknown} value @param {string} message */
function requiredText(value, message) {
  const text = normalizedText(value);
  if (!text) throw new AppError(message, 400);
  return text;
}

/** @param {unknown} value */
function normalizedText(value) {
  return String(value || "").trim();
}

/** @param {unknown} error */
function safeErrorCode(error) {
  let candidate = "catalog_security_transition_failed";
  if (error && typeof error === "object") {
    if ("code" in error && error.code) candidate = normalizedText(error.code);
    else if ("details" in error && error.details && typeof error.details === "object" && "code" in error.details && error.details.code) {
      candidate = normalizedText(error.details.code);
    }
  }
  return normalizedText(candidate)
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "_")
    .slice(0, 120) || "catalog_security_transition_failed";
}

/** @type {CatalogSecurityService} */
export const catalogSecurityService = {
  enable,
  handleCatalogSecurityJob,
  preflight,
  registerCatalogSecurityJobHandler,
  remove,
  retry,
};

export {
  CATALOG_SECURITY_BATCH_SIZE,
  CATALOG_SECURITY_JOB_TYPE,
  CATALOG_SECURITY_SYNC_RECORD_LIMIT,
  TRANSITION_ACTIONS,
};
