export const regressionMeta = Object.freeze({
  id: "notes.secure-catalog-transitions",
  area: "notes",
  tier: "focused",
  tags: ["catalogs", "encryption", "jobs", "notes", "reauthentication", "security"],
  description: "Proves fail-closed secure-catalog enable/retry/downgrade transitions, preservation moves, job routing, and current-password confirmation.",
  runMode: "isolated-database",
});

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-secure-catalog-transitions-"));
const secureKey = "Catalog-Transition-Regression-Master-Key-2026!";
const operatorPassword = "Secure-Catalog-Transition-Test-123!";
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "secure-catalog-transitions.db");
process.env.LONGTAIL_SECURE_NOTES_KEY_VERSION = "catalog-transition-test-v1";
process.env.LONGTAIL_SECURE_NOTES_MASTER_KEY = secureKey;
process.env.LONGTAIL_WORKER_MODE = "disabled";
process.env.SUPER_ADMIN_PASSWORD = operatorPassword;

const { closeSqlite, initializeDatabase, querySql } = await import("../../../src/db/index.js");
const { registerNotesSearchIndexers } = await import("../../../src/modules/notes/search-indexers.js");
const { catalogSecurityService } = await import("../../../src/modules/notes/catalog-security.service.js");
const { notesRepository } = await import("../../../src/modules/notes/notes.repo.js");
const { notesService } = await import("../../../src/modules/notes/notes.service.js");
const { notificationsService } = await import("../../../src/services/notifications.service.js");
const { searchService } = await import("../../../src/services/search.service.js");
const { workResumeStateService } = await import("../../../src/services/work-resume-state.service.js");
const { hashPassword } = await import("../../../src/security/passwords.js");

try {
  await initializeDatabase();
  registerNotesSearchIndexers();
  catalogSecurityService.registerCatalogSecurityJobHandler();
  const session = await readProtectedSession();
  await querySql(`
UPDATE users
SET password = ${sqlText(await hashPassword(operatorPassword))}
WHERE user_id = ${sqlText(session.user_id)};
`);
  await assertPermissionBoundary(session);
  await assertSynchronousEnablePreservationAndDowngrade(session);
  await assertLargeCatalogFailureRetryAndDowngrade(session);
  await assertWrongPasswordRejected(session);
  const integrity = await querySql("PRAGMA integrity_check;");
  assert.deepEqual(integrity, [{ integrity_check: "ok" }]);
  console.log("Secure catalog transitions regression passed.");
} finally {
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

async function assertPermissionBoundary(session) {
  const catalog = await createCatalog(session, "Permission Boundary");
  await assert.rejects(
    catalogSecurityService.preflight(catalog.note_library_collection_id, { action: "enable" }, {
      ...session,
      user_id: "missing-secure-catalog-operator",
    }),
    (error) => error?.statusCode === 403,
  );
}

async function assertSynchronousEnablePreservationAndDowngrade(session) {
  const root = await createCatalog(session, "Synchronous Secure Root");
  const child = await createCatalog(session, "Inherited Child", root.note_library_collection_id);
  const ordinary = await createCatalog(session, "Ordinary Destination");
  const rootNote = await createNoteWithRevision(session, root.note_library_collection_id, "Root transition body");
  const childNote = await createNoteWithRevision(session, child.note_library_collection_id, "Child transition body");
  const movableNote = await createNoteWithRevision(session, root.note_library_collection_id, "Move preservation body");

  await notificationsService.create({
    body: "Root transition body notification",
    eventType: "note.updated",
    moduleId: "notes",
    recipientUserId: session.user_id,
    recordId: rootNote.note_id,
    recordType: "note",
    title: rootNote.title,
    url: `notes.html?note=${encodeURIComponent(rootNote.note_id)}`,
    workspaceId: session.workspace_id,
  }, session);
  await notificationsService.followTarget(session, {
    moduleId: "notes",
    targetId: rootNote.note_id,
    targetType: "note",
  });
  await workResumeStateService.upsertResumeState(session, {
    lastActionLabel: "Updated note",
    lastActionType: "note.updated",
    moduleId: "notes",
    recordId: rootNote.note_id,
    recordType: "note",
    statusSnapshot: "active",
    title: rootNote.title,
  });

  const indexed = await searchService.reindexSearchRecord({
    workspaceId: session.workspace_id,
    moduleId: "notes",
    recordType: "note",
    recordId: rootNote.note_id,
  }, { throwOnError: true });
  assert.equal(indexed.ok, true);

  const preflight = (await catalogSecurityService.preflight(root.note_library_collection_id, { action: "enable" }, session)).preflight;
  assert.equal(preflight.execution, "synchronous");
  assert.equal(preflight.catalogCount, 2);
  assert.equal(preflight.affectedNoteCount, 3);
  assert.equal(preflight.affectedRevisionCount, 3);
  assert.equal(preflight.staleSearchDocumentCount, 1);

  const enabled = await catalogSecurityService.enable(root.note_library_collection_id, {
    confirmAffectedNoteCount: preflight.affectedNoteCount,
  }, session);
  assert.equal(enabled.execution, "synchronous");
  assert.equal(enabled.collection.security_policy, "secure");
  assert.equal(enabled.collection.security_transition_state, "stable");
  await assertEncrypted(rootNote.note_id, "Root transition body");
  await assertEncrypted(childNote.note_id, "Child transition body");
  assert.equal(await countSearchDocuments(rootNote.note_id), 0);
  const excludedArtifactCounts = await querySql(`
SELECT
  (SELECT COUNT(*) FROM notifications WHERE workspace_id = ${sqlText(session.workspace_id)} AND record_type = 'note' AND record_id = ${sqlText(rootNote.note_id)}) AS notification_count,
  (SELECT COUNT(*) FROM notification_subscriptions WHERE workspace_id = ${sqlText(session.workspace_id)} AND target_type = 'note' AND target_id = ${sqlText(rootNote.note_id)}) AS subscription_count,
  (SELECT COUNT(*) FROM work_resume_state WHERE workspace_id = ${sqlText(session.workspace_id)} AND record_type = 'note' AND record_id = ${sqlText(rootNote.note_id)}) AS resume_count;
`);
  assert.deepEqual(excludedArtifactCounts, [{ notification_count: 0, subscription_count: 0, resume_count: 0 }]);

  const movedNote = (await notesService.assignNoteCollection(movableNote.note_id, {
    noteCollectionId: ordinary.note_library_collection_id,
  }, session)).note;
  assert.equal(movedNote.security_mode, "secure", "a note leaving a secure boundary must become explicitly secure");
  assert.equal(movedNote.effective_security_mode, "secure");
  await assertEncrypted(movableNote.note_id, "Move preservation body");

  const movedChild = (await notesService.moveCollection(child.note_library_collection_id, {
    parentCollectionId: null,
    title: child.title,
  }, session)).collection;
  assert.equal(movedChild.security_policy, "secure", "a subtree leaving inherited protection must preserve a secure root policy");
  assert.equal(movedChild.effective_security_mode, "secure");

  const removalPreflight = (await catalogSecurityService.preflight(root.note_library_collection_id, { action: "remove" }, session)).preflight;
  assert.equal(removalPreflight.affectedNoteCount, 1, "explicit note and preserved subtree must remain outside the downgrade");
  await assert.rejects(
    catalogSecurityService.remove(root.note_library_collection_id, {
      ...downgradePayload(root, removalPreflight, operatorPassword),
      confirmAffectedNoteCount: removalPreflight.affectedNoteCount + 1,
    }, session),
    (error) => error?.statusCode === 400 && /confirm/i.test(error.message),
  );

  const removed = await catalogSecurityService.remove(
    root.note_library_collection_id,
    downgradePayload(root, removalPreflight, operatorPassword),
    session,
  );
  assert.equal(removed.execution, "synchronous");
  assert.equal(removed.collection.security_policy, "normal");
  assert.equal(removed.collection.security_transition_state, "stable");
  await assertPlaintext(rootNote.note_id, "Root transition body");
  await assertEncrypted(childNote.note_id, "Child transition body");
  await assertEncrypted(movableNote.note_id, "Move preservation body");

  const auditRows = await querySql(`
SELECT action, metadata_json
FROM audit_logs
WHERE workspace_id = ${sqlText(session.workspace_id)}
  AND record_id = ${sqlText(root.note_library_collection_id)}
  AND action LIKE 'note_catalog_security_%'
ORDER BY created_at ASC;
`);
  assert.deepEqual(auditRows.map((row) => row.action), [
    "note_catalog_security_requested",
    "note_catalog_security_completed",
    "note_catalog_security_requested",
    "note_catalog_security_completed",
  ]);
  assert.doesNotMatch(JSON.stringify(auditRows), /Root transition body|secure_payload|encrypted_data_key/);
  const preservationAuditRows = await querySql(`
SELECT action, record_id, previous_value_json, new_value_json, metadata_json
FROM audit_logs
WHERE workspace_id = ${sqlText(session.workspace_id)}
  AND action IN ('note_security_preserved_on_move', 'note_catalog_security_preserved_on_move')
ORDER BY created_at ASC;
`);
  assert.deepEqual(preservationAuditRows.map((row) => [row.action, row.record_id]), [
    ["note_security_preserved_on_move", movableNote.note_id],
    ["note_catalog_security_preserved_on_move", child.note_library_collection_id],
  ]);
  assert.doesNotMatch(JSON.stringify(preservationAuditRows), /Move preservation body|secure_payload|encrypted_data_key/);
}

async function assertLargeCatalogFailureRetryAndDowngrade(session) {
  const catalog = await createCatalog(session, "Large Transition Catalog");
  const notes = [];
  for (let index = 0; index < 51; index += 1) {
    notes.push(await createNoteWithRevision(session, catalog.note_library_collection_id, `Large transition body ${index}`));
  }
  const initialRevisionCount = await countRevisions(notes.map((note) => note.note_id));
  assert.equal(initialRevisionCount, 51);
  assert.equal((await searchService.reindexSearchRecord({
    workspaceId: session.workspace_id,
    moduleId: "notes",
    recordType: "note",
    recordId: notes[0].note_id,
  }, { throwOnError: true })).ok, true);
  assert.equal(await countSearchDocuments(notes[0].note_id), 1);

  const preflight = (await catalogSecurityService.preflight(catalog.note_library_collection_id, { action: "enable" }, session)).preflight;
  assert.equal(preflight.execution, "job");
  assert.equal(preflight.workRecordCount, 102);
  const queued = await catalogSecurityService.enable(catalog.note_library_collection_id, {
    confirmAffectedNoteCount: 51,
  }, session);
  assert.equal(queued.execution, "job");
  assert.ok(queued.jobId);

  const securing = await notesRepository.readCollectionById(session.workspace_id, catalog.note_library_collection_id);
  assert.equal(securing.security_policy, "normal");
  assert.equal(securing.security_transition_state, "securing");
  assert.equal(securing.effective_security_mode, "secure");
  assert.equal((await searchService.reindexSearchRecord({
    workspaceId: session.workspace_id,
    moduleId: "notes",
    recordType: "note",
    recordId: notes[0].note_id,
  }, { throwOnError: true })).ok, true);
  assert.equal(await countSearchDocuments(notes[0].note_id), 0, "transition-state indexing must fail closed");
  await assert.rejects(
    notesService.read(notes[0].note_id, session),
    (error) => error?.statusCode === 423,
  );
  await assert.rejects(
    notesService.updateCollection(catalog.note_library_collection_id, { title: "Unsafe concurrent rename" }, session),
    (error) => error?.statusCode === 409 && /security transition/i.test(error.message),
  );
  await assert.rejects(
    catalogSecurityService.enable(catalog.note_library_collection_id, {}, session),
    (error) => error?.statusCode === 409,
  );

  delete process.env.LONGTAIL_SECURE_NOTES_MASTER_KEY;
  await assert.rejects(
    catalogSecurityService.handleCatalogSecurityJob({ payload: jobPayload(queued, session, catalog, "enable") }),
    /encryption is not configured/i,
  );
  process.env.LONGTAIL_SECURE_NOTES_MASTER_KEY = secureKey;
  const failed = await notesRepository.readCollectionById(session.workspace_id, catalog.note_library_collection_id);
  assert.equal(failed.security_transition_state, "failed");
  assert.equal(failed.effective_security_mode, "secure");
  assert.ok(failed.security_transition_error_code);

  const retried = await catalogSecurityService.retry(catalog.note_library_collection_id, {}, session);
  assert.equal(retried.execution, "job");
  assert.ok(retried.transitionVersion > queued.transitionVersion);
  const completed = await catalogSecurityService.handleCatalogSecurityJob({
    payload: jobPayload(retried, session, catalog, "enable"),
  });
  assert.equal(completed.completed, true);
  const stale = await catalogSecurityService.handleCatalogSecurityJob({
    payload: jobPayload(queued, session, catalog, "enable"),
  });
  assert.equal(stale.skipped, true);
  assert.equal(stale.reason, "stale_transition_claim");
  assert.equal(await countRevisions(notes.map((note) => note.note_id)), initialRevisionCount, "retry must not duplicate revisions");
  await assertEncrypted(notes[0].note_id, "Large transition body 0");

  const removalPreflight = (await catalogSecurityService.preflight(catalog.note_library_collection_id, { action: "remove" }, session)).preflight;
  assert.equal(removalPreflight.execution, "job");
  const removal = await catalogSecurityService.remove(
    catalog.note_library_collection_id,
    downgradePayload(catalog, removalPreflight, operatorPassword),
    session,
  );
  assert.equal(removal.execution, "job");
  const removalSnapshot = await notesRepository.readCatalogSecuritySnapshot(
    session.workspace_id,
    [catalog.note_library_collection_id],
  );
  const corruptCandidate = removalSnapshot.notes[50];
  const originalAuthTag = corruptCandidate.encryption_auth_tag;
  await querySql(`
UPDATE notes
SET encryption_auth_tag = 'invalid-transition-auth-tag'
WHERE workspace_id = ${sqlText(session.workspace_id)}
  AND note_id = ${sqlText(corruptCandidate.note_id)};
`);
  await assert.rejects(
    catalogSecurityService.handleCatalogSecurityJob({
      payload: jobPayload(removal, session, catalog, "remove"),
    }),
    /could not be decrypted/i,
  );
  const partialFailure = await notesRepository.readCollectionById(session.workspace_id, catalog.note_library_collection_id);
  assert.equal(partialFailure.security_transition_state, "failed");
  assert.equal(partialFailure.effective_security_mode, "secure");
  await assert.rejects(notesService.read(notes[0].note_id, session), (error) => error?.statusCode === 423);
  await querySql(`
UPDATE notes
SET encryption_auth_tag = ${sqlText(originalAuthTag)}
WHERE workspace_id = ${sqlText(session.workspace_id)}
  AND note_id = ${sqlText(corruptCandidate.note_id)};
`);
  const retriedRemoval = await catalogSecurityService.retry(
    catalog.note_library_collection_id,
    downgradePayload(catalog, removalPreflight, operatorPassword),
    session,
  );
  const downgradeCompleted = retriedRemoval.execution === "job"
    ? await catalogSecurityService.handleCatalogSecurityJob({
        payload: jobPayload(retriedRemoval, session, catalog, "remove"),
      })
    : retriedRemoval;
  assert.equal(downgradeCompleted.completed, true, JSON.stringify(downgradeCompleted));
  await assertPlaintext(notes[0].note_id, "Large transition body 0");
  assert.equal(await countRevisions(notes.map((note) => note.note_id)), initialRevisionCount);
}

async function assertWrongPasswordRejected(session) {
  const catalog = await createCatalog(session, "Wrong Password Boundary");
  await createNoteWithRevision(session, catalog.note_library_collection_id, "Wrong password body");
  const enablePreflight = (await catalogSecurityService.preflight(catalog.note_library_collection_id, { action: "enable" }, session)).preflight;
  await catalogSecurityService.enable(catalog.note_library_collection_id, {
    confirmAffectedNoteCount: enablePreflight.affectedNoteCount,
  }, session);
  const removePreflight = (await catalogSecurityService.preflight(catalog.note_library_collection_id, { action: "remove" }, session)).preflight;
  await assert.rejects(
    catalogSecurityService.remove(catalog.note_library_collection_id, downgradePayload(catalog, removePreflight, "wrong password"), session),
    (error) => error?.statusCode === 400 && /incorrect/i.test(error.message),
  );
  const unchanged = await notesRepository.readCollectionById(session.workspace_id, catalog.note_library_collection_id);
  assert.equal(unchanged.security_policy, "secure");
  assert.equal(unchanged.security_transition_state, "stable");
}

/** @param {string | null} [parentCollectionId] */
async function createCatalog(session, title, parentCollectionId = null) {
  return (await notesService.createCollection({
    libraryBucket: "reference",
    parentCollectionId,
    title,
  }, session)).collection;
}

async function createNoteWithRevision(session, collectionId, bodyPrefix) {
  const created = (await notesService.create({
    body_markdown: `${bodyPrefix} initial`,
    library_bucket: "reference",
    note_collection_id: collectionId,
    title: bodyPrefix,
  }, session)).note;
  return (await notesService.update(created.note_id, {
    body_markdown: `${bodyPrefix} updated`,
  }, session)).note;
}

function downgradePayload(catalog, preflight, currentPassword) {
  return {
    confirmAction: "remove_security",
    confirmAffectedNoteCount: preflight.affectedNoteCount,
    confirmCatalogId: catalog.note_library_collection_id,
    currentPassword,
  };
}

function jobPayload(result, session, catalog, action) {
  return {
    action,
    actorUserId: session.user_id,
    collectionId: catalog.note_library_collection_id,
    transitionVersion: result.transitionVersion,
    workspaceId: session.workspace_id,
  };
}

async function assertEncrypted(noteId, forbiddenText) {
  const notes = await querySql(`
SELECT body_markdown, body_excerpt, body_plaintext_index, secure_payload, encrypted_data_key
FROM notes
WHERE note_id = ${sqlText(noteId)};
`);
  assert.equal(notes[0].body_markdown, "");
  assert.equal(notes[0].body_excerpt, null);
  assert.equal(notes[0].body_plaintext_index, null);
  assert.ok(notes[0].secure_payload);
  assert.ok(notes[0].encrypted_data_key);
  assert.doesNotMatch(JSON.stringify(notes), new RegExp(forbiddenText));
  const revisions = await querySql(`
SELECT body_markdown, body_excerpt, secure_payload, encrypted_data_key
FROM note_revisions
WHERE note_id = ${sqlText(noteId)};
`);
  assert.ok(revisions.every((revision) => revision.body_markdown === "" && revision.body_excerpt === null && revision.secure_payload && revision.encrypted_data_key));
  assert.doesNotMatch(JSON.stringify(revisions), new RegExp(forbiddenText));
}

async function assertPlaintext(noteId, expectedText) {
  const notes = await querySql(`
SELECT body_markdown, body_excerpt, body_plaintext_index, security_mode, secure_payload, encrypted_data_key
FROM notes
WHERE note_id = ${sqlText(noteId)};
`);
  assert.match(notes[0].body_markdown, new RegExp(expectedText));
  assert.match(notes[0].body_plaintext_index, new RegExp(expectedText));
  assert.equal(notes[0].security_mode, "normal");
  assert.equal(notes[0].secure_payload, null);
  assert.equal(notes[0].encrypted_data_key, null);
  const revisions = await querySql(`
SELECT body_markdown, security_mode, secure_payload, encrypted_data_key
FROM note_revisions
WHERE note_id = ${sqlText(noteId)};
`);
  assert.ok(revisions.every((revision) => revision.body_markdown.includes(expectedText) && revision.security_mode === "normal" && !revision.secure_payload && !revision.encrypted_data_key));
}

async function countSearchDocuments(noteId) {
  const rows = await querySql(`
SELECT COUNT(*) AS count
FROM search_index
WHERE module_id = 'notes'
  AND record_type = 'note'
  AND record_id = ${sqlText(noteId)};
`);
  return Number(rows[0]?.count || 0);
}

async function countRevisions(noteIds) {
  const rows = await querySql(`
SELECT COUNT(*) AS count
FROM note_revisions
WHERE note_id IN (${noteIds.map(sqlText).join(", ")});
`);
  return Number(rows[0]?.count || 0);
}

async function readProtectedSession() {
  const rows = await querySql(`
SELECT users.user_id, users.username, users.display_name, users.timezone, workspaces.workspace_id
FROM users
JOIN workspaces ON workspaces.owner_user_id = users.user_id
WHERE users.protected_user = 'yes'
ORDER BY users.rowid
LIMIT 1;
`);
  assert.ok(rows[0]?.workspace_id);
  return {
    active_workspace_id: rows[0].workspace_id,
    display_name: rows[0].display_name,
    ip_address: "127.0.0.1",
    timezone: rows[0].timezone || "America/New_York",
    user_id: rows[0].user_id,
    username: rows[0].username,
    workspace_id: rows[0].workspace_id,
  };
}

function sqlText(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}
