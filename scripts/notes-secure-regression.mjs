import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-notes-secure-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-notes-secure.db");
process.env.SUPER_ADMIN_PASSWORD = "Notes-Secure-Test-123!";
process.env.LONGTAIL_SECURE_NOTES_MASTER_KEY = "notes-secure-regression-master-key";
process.env.LONGTAIL_SECURE_NOTES_KEY_VERSION = "test-v2";

const { modulesService } = await import("../src/core/modules/modules.service.js");
const { internalEventBus } = await import("../src/core/events/event-bus.js");
const { filesService } = await import("../src/services/files.service.js");
const { notesService } = await import("../src/modules/notes/notes.service.js");
const { NOTE_PERMISSIONS } = await import("../src/modules/notes/access-policy.js");
const { NOTE_SECURITY_MODES } = await import("../src/modules/notes/library.js");
const { indexNoteRecord } = await import("../src/modules/notes/search-indexers.js");
const { closeSqlite, initializeDatabase, querySql, runSql, sqlText } = await import("../src/db/index.js");
const capturedSecureNoteEvents = [];
const unsubscribeSecureNoteEvents = [
  "note.created",
  "note.updated",
  "note.revision_created",
  "note.archived",
  "note.restored",
  "note.deleted",
].map((eventName) => internalEventBus.on(eventName, async (event) => {
  capturedSecureNoteEvents.push(event);
}, { id: `notes-secure-regression:${eventName}`, moduleId: "notes" }));

try {
  await initializeDatabase();
  const workspace = await readWorkspace();
  const adminSession = await readProtectedSession(workspace.workspace_id);
  const limitedSession = await createClientUserSession(workspace.workspace_id);

  await assertManifestAndSchema(adminSession);
  const secureNoteId = await assertSecureNoteEncryption(adminSession);
  await assertSecurePermissions(adminSession, limitedSession);
  await assertSecureHealth(adminSession);
  await assertMissingKeyFailsClosed(adminSession, secureNoteId);
  await assertPlaceholderWarningsBlockActivation(adminSession);
  await assertIntegrity();

  console.log("Notes secure regression passed.");
} finally {
  for (const unsubscribe of unsubscribeSecureNoteEvents) {
    unsubscribe();
  }
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

async function assertManifestAndSchema() {
  const notesModule = modulesService.getModule("notes");
  const permissionIds = new Set(notesModule.permissions.map((permission) => permission.id));

  assert.equal(notesModule.version, "0.33.5.19.1.2");
  for (const permission of [
    NOTE_PERMISSIONS.SECURE_CREATE,
    NOTE_PERMISSIONS.SECURE_VIEW,
    NOTE_PERMISSIONS.SECURE_UPDATE,
    NOTE_PERMISSIONS.SECURE_ARCHIVE,
    NOTE_PERMISSIONS.SECURE_RESTORE,
    NOTE_PERMISSIONS.SECURE_DELETE,
    NOTE_PERMISSIONS.SECURE_VIEW_HISTORY,
    NOTE_PERMISSIONS.SECURE_MANAGE,
  ]) {
    assert.equal(permissionIds.has(permission), true, `${permission} should be declared`);
  }

  await assertColumns("notes", [
    "secure_payload",
    "secure_payload_version",
    "encrypted_data_key",
    "key_wrapping_algorithm",
    "encryption_key_version",
    "encryption_algorithm",
    "encryption_nonce",
    "encryption_auth_tag",
    "key_wrapping_nonce",
    "key_wrapping_auth_tag",
    "encrypted_at",
  ]);
  await assertColumns("note_revisions", [
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
}

async function assertSecureNoteEncryption(session) {
  const createResult = await notesService.create({
    title: "Plaintext title only",
    body_markdown: "Sensitive body needle",
    security_mode: NOTE_SECURITY_MODES.SECURE,
  }, session);
  const noteId = createResult.note.note_id;

  assert.equal(createResult.note.body_markdown, "Sensitive body needle");
  assert.equal(createResult.note.secure_title_warning, "Secure note titles are visible to users who can view note metadata. Do not put secrets in the title.");
  assert.equal(createResult.searchDocument, null);
  assertNoBrowserSecureStorageFields(createResult.note);
  await assertRejectsWithMessage(
    () => notesService.create({
      title: "Client visible secure note",
      body_markdown: "Should never become client-visible",
      security_mode: NOTE_SECURITY_MODES.SECURE,
      visibility: "client_visible",
    }, session),
    /client-visible|public/i,
  );

  const rows = await querySql(`
SELECT body_markdown, body_excerpt, body_plaintext_index, secure_payload, secure_payload_version,
  encrypted_data_key, encryption_key_version, encryption_algorithm, key_wrapping_algorithm,
  encryption_nonce, encryption_auth_tag, key_wrapping_nonce, key_wrapping_auth_tag, encrypted_at
FROM notes
WHERE note_id = ${sqlText(noteId)};
`);
  assert.equal(rows[0].body_markdown, "");
  assert.equal(rows[0].body_excerpt, null);
  assert.equal(rows[0].body_plaintext_index, null);
  assert.ok(rows[0].secure_payload);
  assert.equal(rows[0].secure_payload_version, "1");
  assert.ok(rows[0].encrypted_data_key);
  assert.equal(rows[0].encryption_key_version, "test-v2");
  assert.equal(rows[0].encryption_algorithm, "aes-256-gcm");
  assert.equal(rows[0].key_wrapping_algorithm, "aes-256-gcm");
  assert.ok(rows[0].encryption_nonce);
  assert.ok(rows[0].encryption_auth_tag);
  assert.ok(rows[0].key_wrapping_nonce);
  assert.ok(rows[0].key_wrapping_auth_tag);
  assert.ok(rows[0].encrypted_at);
  assert.doesNotMatch(JSON.stringify(rows[0]), /Sensitive body needle/);
  assert.equal(await indexNoteRecord({ workspaceId: session.workspace_id, recordId: noteId }), null);

  const readResult = await notesService.read(noteId, session);
  assert.equal(readResult.note.body_markdown, "Sensitive body needle");
  assert.match(readResult.note.body_html, /Sensitive body needle/);
  assertNoBrowserSecureStorageFields(readResult.note);

  const listResult = await notesService.list(session, {});
  const listedSecureNote = listResult.notes.find((note) => note.note_id === noteId);
  assert.ok(listedSecureNote);
  assert.equal(listedSecureNote.body_markdown, "");
  assert.equal(listedSecureNote.body_excerpt, null);
  assertNoBrowserSecureStorageFields(listedSecureNote);

  const updated = await notesService.update(noteId, {
    ...readResult.note,
    body_markdown: "Updated secure body needle",
  }, session);
  assert.equal(updated.note.body_markdown, "Updated secure body needle");

  const revisions = await notesService.listRevisions(noteId, session);
  assert.equal(revisions.revisions.length, 0);

  await notesService.update(noteId, {
    ...updated.note,
    body_markdown: "Second secure body needle",
  }, session);
  const visibleRevisions = await notesService.listRevisions(noteId, session);
  assert.ok(visibleRevisions.revisions.length >= 1);
  assertNoBrowserSecureStorageFields(visibleRevisions.revisions[0]);
  assert.equal(Object.hasOwn(visibleRevisions.revisions[0], "body_markdown"), false);
  assert.equal(visibleRevisions.revisions[0].body_excerpt, null);
  const revisionRows = await querySql(`
SELECT body_markdown, body_excerpt, secure_payload, secure_payload_version, encrypted_data_key,
  encryption_key_version, encryption_algorithm, key_wrapping_algorithm, encryption_nonce,
  encryption_auth_tag, key_wrapping_nonce, key_wrapping_auth_tag, encrypted_at
FROM note_revisions
WHERE note_id = ${sqlText(noteId)};
`);
  assert.equal(revisionRows.some((row) => /Updated secure body needle|Sensitive body needle/.test(JSON.stringify(row))), false);
  assert.ok(revisionRows.every((row) => row.body_markdown === "" && row.body_excerpt === null && row.secure_payload && row.encrypted_data_key));
  assert.ok(revisionRows.every((row) => row.secure_payload_version === "1"));
  assert.ok(revisionRows.every((row) => row.encryption_key_version === "test-v2"));
  assert.ok(revisionRows.every((row) => row.encryption_algorithm === "aes-256-gcm"));
  assert.ok(revisionRows.every((row) => row.key_wrapping_algorithm === "aes-256-gcm"));
  assert.ok(revisionRows.every((row) => row.encryption_nonce && row.encryption_auth_tag && row.key_wrapping_nonce && row.key_wrapping_auth_tag && row.encrypted_at));

  const revisionRead = await notesService.readRevision(noteId, visibleRevisions.revisions[0].note_revision_id, session);
  assert.match(revisionRead.revision.body_markdown, /Updated secure body needle|Sensitive body needle/);
  assert.equal(revisionRead.revision.body_excerpt, null);
  assertNoBrowserSecureStorageFields(revisionRead.revision);

  const restored = await notesService.restoreRevision(noteId, visibleRevisions.revisions[0].note_revision_id, session);
  assertNoBrowserSecureStorageFields(restored.note);
  assertNoBrowserSecureStorageFields(restored.restoredRevision);
  assert.equal(Object.hasOwn(restored.restoredRevision, "body_markdown"), false);

  await assertSecureBodyNotPersistedInIntegrationTables(session.workspace_id, [
    "Sensitive body needle",
    "Updated secure body needle",
    "Second secure body needle",
  ]);
  await assertRejectsWithMessage(
    () => filesService.uploadAndAttach(session, {
      contentBase64: Buffer.from("secure note attachment blocked").toString("base64"),
      displayName: "Blocked secure attachment",
      moduleId: "notes",
      originalFilename: "blocked-secure-attachment.txt",
      targetId: noteId,
      targetType: "note",
      visibility: "private",
    }),
    /secure notes do not allow framework file attachments/i,
  );

  return noteId;
}

async function assertSecurePermissions(adminSession, limitedSession) {
  const secure = await notesService.create({
    title: "Owner secure note",
    body_markdown: "Owner only body",
    security_mode: NOTE_SECURITY_MODES.SECURE,
  }, adminSession);

  await assertRejectsWithMessage(
    () => notesService.read(secure.note.note_id, limitedSession),
    /secure-note access|limited to the owner/i,
  );
}

async function assertSecureHealth(session) {
  const ready = await notesService.secureHealth(session);
  assert.deepEqual(ready, {
    secureNotes: {
      configured: true,
      keyVersion: "test-v2",
      payloadVersion: "1",
      encryptionAlgorithm: "aes-256-gcm",
      keyWrappingAlgorithm: "aes-256-gcm",
      status: "ready",
      reason: undefined,
    },
  });

  const previousKey = process.env.LONGTAIL_SECURE_NOTES_MASTER_KEY;
  delete process.env.LONGTAIL_SECURE_NOTES_MASTER_KEY;
  const missing = await notesService.secureHealth(session);
  assert.equal(missing.secureNotes.configured, false);
  assert.equal(missing.secureNotes.status, "not_configured");
  assert.equal(missing.secureNotes.reason, "SECURE_NOTES_NOT_CONFIGURED");
  assert.equal(missing.secureNotes.keyVersion, "test-v2");
  process.env.LONGTAIL_SECURE_NOTES_MASTER_KEY = previousKey;
}

async function assertMissingKeyFailsClosed(session, noteId) {
  const previousKey = process.env.LONGTAIL_SECURE_NOTES_MASTER_KEY;
  delete process.env.LONGTAIL_SECURE_NOTES_MASTER_KEY;

  try {
    await assertRejectsWithMessage(
      () => notesService.create({
        title: "Missing key secure note",
        body_markdown: "Should not save",
        security_mode: NOTE_SECURITY_MODES.SECURE,
      }, session),
      /not configured/i,
    );
    await assertRejectsWithMessage(
      () => notesService.read(noteId, session),
      /not configured|could not be decrypted|locked/i,
    );
  } finally {
    process.env.LONGTAIL_SECURE_NOTES_MASTER_KEY = previousKey;
  }

  process.env.LONGTAIL_SECURE_NOTES_MASTER_KEY = "wrong-secure-note-regression-key";
  try {
    await assertRejectsWithMessage(
      () => notesService.read(noteId, session),
      /could not be decrypted/i,
    );
  } finally {
    process.env.LONGTAIL_SECURE_NOTES_MASTER_KEY = previousKey;
  }
}

async function assertPlaceholderWarningsBlockActivation(session) {
  await runSql(`
INSERT INTO notes (
  note_id,
  workspace_id,
  title,
  body_markdown,
  library_bucket,
  library_bucket_source,
  status,
  visibility,
  security_mode,
  owner_user_id,
  created_by_user_id,
  updated_by_user_id,
  created_at,
  updated_at
) VALUES (
  'plaintext-secure-placeholder',
  ${sqlText(session.workspace_id)},
  'Plaintext secure placeholder',
  'Plaintext should block activation',
  'reference',
  'manual',
  'active',
  'internal',
  'secure',
  ${sqlText(session.user_id)},
  ${sqlText(session.user_id)},
  ${sqlText(session.user_id)},
  ${sqlText(new Date().toISOString())},
  ${sqlText(new Date().toISOString())}
);
`);

  await assertRejectsWithMessage(
    () => notesService.create({
      title: "Blocked secure note",
      body_markdown: "Blocked while placeholder exists",
      security_mode: NOTE_SECURITY_MODES.SECURE,
    }, session),
    /plaintext secure-note placeholders/i,
  );
}

async function assertColumns(tableName, expectedColumns) {
  const rows = await querySql(`PRAGMA table_info(${tableName});`);
  const columns = new Set(rows.map((row) => row.name));

  for (const column of expectedColumns) {
    assert.equal(columns.has(column), true, `${tableName}.${column} should exist`);
  }
}

async function readWorkspace() {
  const rows = await querySql(`
SELECT workspace_id
FROM workspaces
ORDER BY created_at
LIMIT 1;
`);

  assert.ok(rows[0]?.workspace_id, "workspace should exist");
  return rows[0];
}

async function readProtectedSession(workspaceId) {
  const rows = await querySql(`
SELECT user_id, username, display_name, timezone
FROM users
WHERE protected_user = 'yes'
ORDER BY rowid
LIMIT 1;
`);

  assert.ok(rows[0]?.user_id, "protected user should exist");
  return {
    workspace_id: workspaceId,
    active_workspace_id: workspaceId,
    user_id: rows[0].user_id,
    username: rows[0].username,
    display_name: rows[0].display_name,
    timezone: rows[0].timezone || "America/New_York",
  };
}

async function createClientUserSession(workspaceId) {
  const userId = randomUUID();
  const now = new Date().toISOString();

  await runSql(`
INSERT INTO users (
  user_id,
  home_workspace_id,
  username,
  display_name,
  alt_email,
  timezone,
  password,
  theme_mode,
  user_status,
  protected_user,
  active_workspace_id
)
VALUES (
  ${sqlText(userId)},
  ${sqlText(workspaceId)},
  ${sqlText(`limited-secure-${userId}@example.test`)},
  'Limited Secure Notes User',
  NULL,
  'America/New_York',
  'unused',
  'light',
  'active',
  'no',
  ${sqlText(workspaceId)}
);

INSERT INTO user_workspaces (
  user_workspace_id,
  user_id,
  workspace_id,
  status,
  created_at,
  updated_at
)
VALUES (
  ${sqlText(randomUUID())},
  ${sqlText(userId)},
  ${sqlText(workspaceId)},
  'active',
  ${sqlText(now)},
  ${sqlText(now)}
);

INSERT INTO user_role_assignments (
  assignment_id,
  workspace_id,
  user_id,
  role_id,
  scope_type,
  scope_id,
  client_id,
  project_id,
  permission_overrides_json,
  created_at,
  updated_at
)
VALUES (
  ${sqlText(randomUUID())},
  ${sqlText(workspaceId)},
  ${sqlText(userId)},
  'client_user',
  'workspace',
  ${sqlText(workspaceId)},
  NULL,
  NULL,
  NULL,
  ${sqlText(now)},
  ${sqlText(now)}
);
`);

  return {
    workspace_id: workspaceId,
    active_workspace_id: workspaceId,
    user_id: userId,
    username: `limited-secure-${userId}@example.test`,
    display_name: "Limited Secure Notes User",
    timezone: "America/New_York",
  };
}

async function assertRejectsWithMessage(fn, pattern) {
  await assert.rejects(fn, (error) => {
    assert.match(error.message, pattern);
    return true;
  });
}

function assertNoBrowserSecureStorageFields(value) {
  for (const field of [
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
  ]) {
    assert.equal(Object.hasOwn(value, field), false, `${field} should not be returned to browser/API callers`);
  }
}

async function assertSecureBodyNotPersistedInIntegrationTables(workspaceId, needles) {
  const needlePattern = new RegExp(needles.map(escapeRegExp).join("|"));
  const searchRows = await querySql(`
SELECT title, summary, body
FROM search_index
WHERE workspace_id = ${sqlText(workspaceId)}
  AND module_id = 'notes';
`);
  assert.equal(searchRows.some((row) => needlePattern.test(JSON.stringify(row))), false);

  const ftsRows = await querySql(`
SELECT search_index_id, title, body
FROM search_index_fts
WHERE search_index_id LIKE ${sqlText(`${workspaceId}:notes:%`)};
`);
  assert.equal(ftsRows.some((row) => needlePattern.test(JSON.stringify(row))), false);

  const auditRows = await querySql(`
SELECT action, record_type, previous_value_json, new_value_json, metadata_json
FROM audit_logs
WHERE workspace_id = ${sqlText(workspaceId)}
  AND record_type IN ('note', 'note_revision', 'note_library');
`);
  assert.equal(auditRows.some((row) => needlePattern.test(JSON.stringify(row))), false);

  const notificationRows = await querySql(`
SELECT title, body, metadata_json
FROM notifications
WHERE workspace_id = ${sqlText(workspaceId)}
  AND module_id = 'notes';
`);
  assert.equal(notificationRows.some((row) => needlePattern.test(JSON.stringify(row))), false);

  assert.equal(capturedSecureNoteEvents.some((event) => needlePattern.test(JSON.stringify({
    previous_value: event.previous_value,
    new_value: event.new_value,
    metadata: event.metadata,
  }))), false);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function assertIntegrity() {
  const rows = await querySql("PRAGMA integrity_check;");
  assert.deepEqual(rows, [{ integrity_check: "ok" }]);
}
