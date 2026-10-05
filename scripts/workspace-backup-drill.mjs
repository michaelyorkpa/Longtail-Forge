import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { requirePackageManifest } from "./test-support/package-manifest-assertions.mjs";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { createOpaqueId, createRecordId } from "../src/core/identifiers.js";
import { createWorkspaceBackupPackage, inspectWorkspaceBackupPackage, restoreWorkspaceBackupPackage } from "../src/services/workspace-backup-package.js";
import { resolveStoragePath } from "../src/core/files/local-storage-adapter.js";

/**
 * An open better-sqlite3 handle on a drill database.
 * @typedef {InstanceType<typeof Database>} DatabaseHandle
 */

/**
 * The provider-neutral Files object read request the workspace backup package
 * hands to its reader for every internal Files row it stages.
 * @typedef {object} FileObjectReadRequest
 * @property {string} fileId
 * @property {string} providerId
 * @property {string} storageKey
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-workspace-backup-drill-"));
const sourceDatabase = path.join(tempDir, "source.db");
const sourceFiles = path.join(tempDir, "source-files");
const archivePath = path.join(tempDir, "workspace.ltfworkspace.tgz");
const targetDatabase = path.join(tempDir, "restored", "workspace.db");
const targetFiles = path.join(tempDir, "restored", "files");
const secureKeyBackup = path.join(tempDir, "separate-secure-notes-key.backup");
const packageJson = requirePackageManifest(JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8")));
const targetWorkspaceId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const targetUserId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const targetMembershipId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const targetAssignmentId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const targetClientId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const targetProjectId = createRecordId();
const targetNoteId = createRecordId();
const targetFileId = createRecordId();
const targetAuditId = createRecordId();
const targetStorageKey = `${targetWorkspaceId}/2026-07-16/${createOpaqueId()}`;

try {
  await createFixture();
  const created = await createWorkspaceBackupPackage({
    appVersion: packageJson.version,
    databaseFile: sourceDatabase,
    outputPath: archivePath,
    readFileObject: /** @param {FileObjectReadRequest} request */ ({ storageKey }) => createReadStream(resolveStoragePath(sourceFiles, storageKey)),
    workspaceId: targetWorkspaceId,
  });
  assertUuidVersion(created.backupId, 4, "workspace backup package identity");
  assert.equal(created.manifest.backupId, created.backupId, "the workspace backup manifest and durable receipt identity must share the same opaque package ID");
  assert.match(created.archiveSha256, /^[a-f0-9]{64}$/);
  assert.equal(created.manifest.workspace.name, "Recovery Workspace");
  assert.equal(created.manifest.storage.objectCount, 1);
  assert.equal(created.manifest.secureNotes.masterKeyIncluded, false);
  assert.equal(created.manifest.identities.credentialsIncluded, false);

  const withoutKey = await inspectWorkspaceBackupPackage({
    archivePath,
    expectedAppVersion: packageJson.version,
  });
  assert.equal(withoutKey.restorable, false);
  assert.match(withoutKey.restorabilityWarnings.join(" "), /Secure Notes/i);

  await fs.writeFile(secureKeyBackup, "separately protected key recovery proof", { mode: 0o600 });
  const inspection = await inspectWorkspaceBackupPackage({
    archivePath,
    expectedAppVersion: packageJson.version,
    secureNotesKeyBackupPath: secureKeyBackup,
  });
  assert.equal(inspection.restorable, true);

  const restored = await restoreWorkspaceBackupPackage({
    archivePath,
    expectedAppVersion: packageJson.version,
    secureNotesKeyBackupPath: secureKeyBackup,
    targetDatabaseFile: targetDatabase,
    targetFilesRoot: targetFiles,
  });
  assert.equal(restored.workspace.name, "Recovery Workspace");
  verifyRestoredDatabase();
  const restoredBytes = await fs.readFile(targetDatabase);
  for (const forbiddenText of ["Other Secret Client", "other@example.test", "source-password-hash", "other workspace search secret"]) {
    assert.equal(restoredBytes.includes(Buffer.from(forbiddenText)), false, `${forbiddenText} must not survive in SQLite free pages`);
  }
  assert.equal(await fs.readFile(resolveStoragePath(targetFiles, targetStorageKey), "utf8"), "target workspace file\n");
  await assert.rejects(
    () => fs.access(resolveStoragePath(targetFiles, "other-workspace/2026-07-16/other-file")),
    "another workspace Files object must not enter the package",
  );
  await assert.rejects(
    () => restoreWorkspaceBackupPackage({
      archivePath,
      expectedAppVersion: packageJson.version,
      secureNotesKeyBackupPath: secureKeyBackup,
      targetDatabaseFile: targetDatabase,
      targetFilesRoot: `${targetFiles}-second`,
    }),
    /already exists|destructive/i,
  );

  console.log("Workspace backup disposable restore drill passed.");
} finally {
  await fs.rm(tempDir, { recursive: true, force: true });
}

/**
 * @param {unknown} value
 * @param {number} expectedVersion
 * @param {string} label
 */
function assertUuidVersion(value, expectedVersion, label) {
  assert.match(String(value || ""), /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i, `${label} should be a canonical UUID`);
  assert.equal(String(value)[14], String(expectedVersion), `${label} should use UUIDv${expectedVersion}`);
}

async function createFixture() {
  await fs.mkdir(sourceFiles, { recursive: true });
  const target = resolveStoragePath(sourceFiles, targetStorageKey);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, "target workspace file\n");
  const otherFile = resolveStoragePath(sourceFiles, "other-workspace/2026-07-16/other-file");
  await fs.mkdir(path.dirname(otherFile), { recursive: true });
  await fs.writeFile(otherFile, "other workspace secret file\n");
  const targetFile = resolveStoragePath(sourceFiles, targetStorageKey);
  const targetContent = await fs.readFile(targetFile);
  const otherContent = await fs.readFile(otherFile);

  const database = new Database(sourceDatabase);
  try {
    database.exec(await fs.readFile(path.join(root, "src", "db", "schema", "current.generated.sql"), "utf8"));
    database.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS search_index_fts USING fts5(
      search_index_id UNINDEXED,
      workspace_id UNINDEXED,
      module_id UNINDEXED,
      record_type UNINDEXED,
      record_id UNINDEXED,
      title,
      summary,
      body,
      tags_text,
      source
    );`);
    database.pragma("foreign_keys = ON");
    const now = "2026-07-16T20:00:00.000Z";
    database.prepare("INSERT INTO schema_migrations (version, module_id, name, checksum, applied_at) VALUES ('075', 'core', 'workspace_backup_exports', 'fixture', ?);").run(now);
    database.prepare("INSERT INTO modules (module_id, name, description, category, status, version, created_at, updated_at) VALUES ('tasks', 'Tasks', '', 'work', 'active', '', ?, ?);").run(now, now);
    database.prepare("INSERT INTO roles (role_id, role_name, description, assignable_scope_type, sort_order) VALUES ('workspace_admin', 'Workspace Administrator', '', 'workspace', 1);").run();
    insertWorkspace(database, targetWorkspaceId, "Recovery Workspace", targetUserId, now);
    insertWorkspace(database, "other-workspace", "Other Workspace", "other-user", now);
    insertUser(database, targetUserId, "owner@example.test", "Target Owner", targetWorkspaceId);
    insertUser(database, "other-user", "other@example.test", "Other Owner", "other-workspace");
    insertMembership(database, targetMembershipId, targetUserId, targetWorkspaceId, now);
    insertMembership(database, "other-membership", "other-user", "other-workspace", now);
    database.prepare(`
INSERT INTO user_role_assignments (assignment_id, workspace_id, user_id, role_id, scope_type, scope_id, client_id, project_id, permission_overrides_json, created_at, updated_at)
VALUES (?, ?, ?, 'workspace_admin', 'workspace', ?, NULL, NULL, NULL, ?, ?);
`).run(targetAssignmentId, targetWorkspaceId, targetUserId, targetWorkspaceId, now, now);
    database.prepare("INSERT INTO clients (id, workspace_id, parent_client_id, name, status, billable, billing_contact_name, billing_contact_email, billing_contact_alternate_name, billing_contact_alternate_email, billing_contact_phone_number, billing_contact_alternate_phone_number, billing_contact_street_address_1, billing_contact_street_address_2, billing_contact_city, billing_contact_state, billing_contact_zip_code, created_at, updated_at) VALUES (?, ?, NULL, 'Recovery Client', 'Active', 'yes', '', '', '', '', '', '', '', '', '', '', '', ?, ?);").run(targetClientId, targetWorkspaceId, now, now);
    database.prepare("INSERT INTO projects (id, workspace_id, client_id, parent_project_id, name, status, billable, created_at, updated_at) VALUES (?, ?, ?, NULL, 'Recovery Project', 'Active', 'yes', ?, ?);").run(targetProjectId, targetWorkspaceId, targetClientId, now, now);
    database.prepare("INSERT INTO clients (id, workspace_id, parent_client_id, name, status, billable, billing_contact_name, billing_contact_email, billing_contact_alternate_name, billing_contact_alternate_email, billing_contact_phone_number, billing_contact_alternate_phone_number, billing_contact_street_address_1, billing_contact_street_address_2, billing_contact_city, billing_contact_state, billing_contact_zip_code, created_at, updated_at) VALUES ('other-client', 'other-workspace', NULL, 'Other Secret Client', 'Active', 'yes', '', '', '', '', '', '', '', '', '', '', '', ?, ?);").run(now, now);
    insertFile(database, targetFileId, targetWorkspaceId, targetUserId, targetStorageKey, targetContent, now);
    insertFile(database, "other-file", "other-workspace", "other-user", "other-workspace/2026-07-16/other-file", otherContent, now);
    database.prepare(`
INSERT INTO notes (note_id, workspace_id, title, body_markdown, note_type, library_bucket, library_bucket_source, status, visibility, security_mode, secure_payload, encryption_key_version, owner_user_id, created_by_user_id, updated_by_user_id, created_at, updated_at)
VALUES (?, ?, 'Encrypted recovery note', '', 'general', 'reference', 'derived', 'active', 'internal', 'secure', 'ciphertext-only', 'v1', ?, ?, ?, ?, ?);
`).run(targetNoteId, targetWorkspaceId, targetUserId, targetUserId, targetUserId, now, now);
    database.prepare("INSERT INTO audit_logs (audit_id, workspace_id, created_at, actor_user_id, actor_user_name, action, change_type, record_type, record_id, record_label, record_url, previous_value_json, new_value_json, metadata_json, ip_address) VALUES (?, ?, ?, ?, 'Target Owner', 'workspace_identifier_snapshot', 'create', 'project', ?, 'Recovery Project', ?, NULL, ?, ?, '127.0.0.1');").run(targetAuditId, targetWorkspaceId, now, targetUserId, targetProjectId, `projects.html?project=${targetProjectId}`, JSON.stringify({ id: targetProjectId, client_id: targetClientId }), JSON.stringify({ targetClientId, targetProjectId, targetStorageKey }));
    database.prepare("INSERT INTO api_keys (api_key_id, workspace_id, created_by_user_id, name, key_hash, key_prefix, status, created_at) VALUES ('secret-api-key', ?, ?, 'Must be stripped', 'secret-hash', 'ltf_secret', 'active', ?);").run(targetWorkspaceId, targetUserId, now);
    database.prepare("INSERT INTO api_key_scopes (api_key_id, scope) VALUES ('secret-api-key', 'tasks:read');").run();
    database.prepare("INSERT INTO sessions (session_id, user_id, username, home_workspace_id, active_workspace_id, timezone, expires_at, created_at, updated_at) VALUES ('secret-session', ?, 'owner@example.test', ?, ?, 'America/New_York', '2026-07-17T20:00:00.000Z', ?, ?);").run(targetUserId, targetWorkspaceId, targetWorkspaceId, now, now);
    database.prepare("INSERT INTO app_settings (setting_key, setting_value, created_at, updated_at) VALUES ('workspace_creation_enabled', 'true', ?, ?);").run(now, now);
    database.prepare("INSERT INTO jobs (job_id, workspace_id, job_type, payload_json, status, priority, available_at, attempt_count, max_attempts, created_at, updated_at) VALUES ('target-job', ?, 'test', '{}', 'pending', 0, ?, 0, 3, ?, ?);").run(targetWorkspaceId, now, now, now);
    database.prepare("INSERT INTO search_index (search_index_id, workspace_id, module_id, record_type, record_id, title, summary, body, tags_text, visibility, record_status, source, indexed_at) VALUES ('other-search', 'other-workspace', 'tasks', 'task', 'other-record', 'Other search', '', 'other workspace search secret', '', 'workspace', 'active', 'fixture', ?);").run(now);
    database.prepare("INSERT INTO search_index_fts (search_index_id, workspace_id, module_id, record_type, record_id, title, summary, body, tags_text, source) VALUES ('other-search', 'other-workspace', 'tasks', 'task', 'other-record', 'Other search', '', 'other workspace search secret', '', 'fixture');").run();
    assert.equal(/** @type {unknown[]} */ (database.pragma("foreign_key_check")).length, 0);
  } finally {
    database.close();
  }
}

/**
 * @param {DatabaseHandle} database
 * @param {string} workspaceId
 * @param {string} name
 * @param {string} ownerUserId
 * @param {string} now
 */
function insertWorkspace(database, workspaceId, name, ownerUserId, now) {
  database.prepare("INSERT INTO workspaces (workspace_id, name, status, workspace_type, owner_user_id, created_at, updated_at) VALUES (?, ?, 'Active', 'business', ?, ?, ?);")
    .run(workspaceId, name, ownerUserId, now, now);
}

/**
 * @param {DatabaseHandle} database
 * @param {string} userId
 * @param {string} username
 * @param {string} displayName
 * @param {string} workspaceId
 */
function insertUser(database, userId, username, displayName, workspaceId) {
  database.prepare(`
INSERT INTO users (user_id, home_workspace_id, username, display_name, alt_email, timezone, password, theme_mode, user_status, protected_user, active_workspace_id, open_external_links_new_tab, theme_auto_source, password_change_required, preferred_login_landing, preferred_workspace_switch_landing)
VALUES (?, ?, ?, ?, 'private-alt@example.test', 'America/New_York', 'source-password-hash', 'light', 'active', 'yes', ?, 0, 'system', 0, 'dashboard', 'dashboard');
`).run(userId, workspaceId, username, displayName, workspaceId);
}

/**
 * @param {DatabaseHandle} database
 * @param {string} id
 * @param {string} userId
 * @param {string} workspaceId
 * @param {string} now
 */
function insertMembership(database, id, userId, workspaceId, now) {
  database.prepare("INSERT INTO user_workspaces (user_workspace_id, user_id, workspace_id, status, created_at, updated_at) VALUES (?, ?, ?, 'active', ?, ?);")
    .run(id, userId, workspaceId, now, now);
}

/**
 * @param {DatabaseHandle} database
 * @param {string} fileId
 * @param {string} workspaceId
 * @param {string} userId
 * @param {string} storageKey
 * @param {Buffer} content
 * @param {string} now
 */
function insertFile(database, fileId, workspaceId, userId, storageKey, content, now) {
  const sha256 = createHash("sha256").update(content).digest("hex");
  database.prepare(`
INSERT INTO files (file_id, workspace_id, storage_provider, storage_key, original_filename, stored_filename, display_name, extension, mime_type_claimed, mime_type_detected, file_size_bytes, sha256_hash, status, scan_status, uploaded_by_user_id, created_at, updated_at, storage_kind, external_availability_status, external_reported_bytes)
VALUES (?, ?, 'local', ?, 'fixture.txt', 'fixture.txt', 'Fixture', '.txt', 'text/plain', 'text/plain', ?, ?, 'available', 'passed', ?, ?, ?, 'internal', 'not_external', 0);
`).run(fileId, workspaceId, storageKey, content.length, sha256, userId, now, now);
}

function verifyRestoredDatabase() {
  const database = new Database(targetDatabase, { fileMustExist: true, readonly: true });
  try {
    assert.deepEqual(database.prepare("SELECT workspace_id, name FROM workspaces").all(), [{ workspace_id: targetWorkspaceId, name: "Recovery Workspace" }]);
    assert.equal(/** @type {{ count: number }} */ (database.prepare("SELECT COUNT(*) AS count FROM clients WHERE name = 'Recovery Client'").get()).count, 1);
    assert.equal(/** @type {{ count: number }} */ (database.prepare("SELECT COUNT(*) AS count FROM clients WHERE name = 'Other Secret Client'").get()).count, 0);
    assert.equal(/** @type {{ count: number }} */ (database.prepare("SELECT COUNT(*) AS count FROM api_keys").get()).count, 0);
    assert.equal(/** @type {{ count: number }} */ (database.prepare("SELECT COUNT(*) AS count FROM sessions").get()).count, 0);
    assert.equal(/** @type {{ count: number }} */ (database.prepare("SELECT COUNT(*) AS count FROM jobs").get()).count, 0);
    assert.equal(/** @type {{ count: number }} */ (database.prepare("SELECT COUNT(*) AS count FROM app_settings").get()).count, 0);
    const identity = /** @type {{ username: string, alt_email: string | null, password: string, user_status: string, protected_user: string }} */ (database.prepare("SELECT username, alt_email, password, user_status, protected_user FROM users").get());
    assert.equal(identity.username, "owner@example.test");
    assert.equal(identity.alt_email, null);
    assert.equal(identity.password, "!workspace-backup-retired!");
    assert.equal(identity.user_status, "inactive");
    assert.equal(identity.protected_user, "no");
    assert.equal(/** @type {{ secure_payload: string }} */ (database.prepare("SELECT secure_payload FROM notes WHERE note_id = ?").get(targetNoteId)).secure_payload, "ciphertext-only");
    assertIdentifierSnapshot(database);
    assert.equal(/** @type {{ integrity_check: string }[]} */ (database.pragma("integrity_check"))[0].integrity_check, "ok");
    assert.deepEqual(database.pragma("foreign_key_check"), []);
  } finally {
    database.close();
  }
}

/** @param {DatabaseHandle} database */
function assertIdentifierSnapshot(database) {
  assert.deepEqual(database.prepare("SELECT workspace_id FROM workspaces WHERE workspace_id = ?").get(targetWorkspaceId), { workspace_id: targetWorkspaceId });
  assert.deepEqual(database.prepare("SELECT id, workspace_id FROM clients WHERE id = ?").get(targetClientId), { id: targetClientId, workspace_id: targetWorkspaceId });
  assert.deepEqual(database.prepare("SELECT id, client_id FROM projects WHERE id = ?").get(targetProjectId), { client_id: targetClientId, id: targetProjectId });
  assert.deepEqual(database.prepare("SELECT note_id FROM notes WHERE note_id = ?").get(targetNoteId), { note_id: targetNoteId });
  assert.deepEqual(database.prepare("SELECT file_id, storage_key FROM files WHERE file_id = ?").get(targetFileId), { file_id: targetFileId, storage_key: targetStorageKey });
  assert.deepEqual(database.prepare("SELECT audit_id, record_id, record_url, new_value_json, metadata_json FROM audit_logs WHERE audit_id = ?").get(targetAuditId), {
    audit_id: targetAuditId,
    metadata_json: JSON.stringify({ targetClientId, targetProjectId, targetStorageKey }),
    new_value_json: JSON.stringify({ id: targetProjectId, client_id: targetClientId }),
    record_id: targetProjectId,
    record_url: `projects.html?project=${targetProjectId}`,
  });
  assertUuidVersion(targetWorkspaceId, 4, "workspace backup legacy workspace identity");
  assertUuidVersion(targetClientId, 4, "workspace backup legacy Client identity");
  for (const [value, label] of [[targetProjectId, "Project"], [targetNoteId, "Note"], [targetFileId, "File"], [targetAuditId, "audit"]]) {
    assertUuidVersion(value, 7, `workspace backup forward ${label} identity`);
  }
  assertUuidVersion(targetStorageKey.split("/").at(-1), 4, "workspace backup opaque storage identity");
}
