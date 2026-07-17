import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import {
  createWorkspaceBackupPackage,
  inspectWorkspaceBackupPackage,
  restoreWorkspaceBackupPackage,
} from "../src/services/workspace-backup-package.js";
import { resolveStoragePath } from "../src/core/files/local-storage-adapter.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-workspace-backup-drill-"));
const sourceDatabase = path.join(tempDir, "source.db");
const sourceFiles = path.join(tempDir, "source-files");
const archivePath = path.join(tempDir, "workspace.ltfworkspace.tgz");
const targetDatabase = path.join(tempDir, "restored", "workspace.db");
const targetFiles = path.join(tempDir, "restored", "files");
const secureKeyBackup = path.join(tempDir, "separate-secure-notes-key.backup");
const packageJson = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8"));

try {
  await createFixture();
  const created = await createWorkspaceBackupPackage({
    appVersion: packageJson.version,
    databaseFile: sourceDatabase,
    outputPath: archivePath,
    readFileObject: ({ storageKey }) => createReadStream(resolveStoragePath(sourceFiles, storageKey)),
    workspaceId: "target-workspace",
  });
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
  assert.equal(await fs.readFile(resolveStoragePath(targetFiles, "target-workspace/2026-07-16/target-file"), "utf8"), "target workspace file\n");
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

async function createFixture() {
  await fs.mkdir(sourceFiles, { recursive: true });
  const target = resolveStoragePath(sourceFiles, "target-workspace/2026-07-16/target-file");
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, "target workspace file\n");
  const otherFile = resolveStoragePath(sourceFiles, "other-workspace/2026-07-16/other-file");
  await fs.mkdir(path.dirname(otherFile), { recursive: true });
  await fs.writeFile(otherFile, "other workspace secret file\n");
  const targetFile = resolveStoragePath(sourceFiles, "target-workspace/2026-07-16/target-file");
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
    insertWorkspace(database, "target-workspace", "Recovery Workspace", "target-user", now);
    insertWorkspace(database, "other-workspace", "Other Workspace", "other-user", now);
    insertUser(database, "target-user", "owner@example.test", "Target Owner", "target-workspace");
    insertUser(database, "other-user", "other@example.test", "Other Owner", "other-workspace");
    insertMembership(database, "target-membership", "target-user", "target-workspace", now);
    insertMembership(database, "other-membership", "other-user", "other-workspace", now);
    database.prepare(`
INSERT INTO user_role_assignments (assignment_id, workspace_id, user_id, role_id, scope_type, scope_id, client_id, project_id, permission_overrides_json, created_at, updated_at)
VALUES ('target-admin', 'target-workspace', 'target-user', 'workspace_admin', 'workspace', 'target-workspace', NULL, NULL, NULL, ?, ?);
`).run(now, now);
    database.prepare("INSERT INTO clients (id, workspace_id, parent_client_id, name, status, billable, billing_contact_name, billing_contact_email, billing_contact_alternate_name, billing_contact_alternate_email, billing_contact_phone_number, billing_contact_alternate_phone_number, billing_contact_street_address_1, billing_contact_street_address_2, billing_contact_city, billing_contact_state, billing_contact_zip_code, created_at, updated_at) VALUES ('target-client', 'target-workspace', NULL, 'Recovery Client', 'Active', 'yes', '', '', '', '', '', '', '', '', '', '', '', ?, ?);").run(now, now);
    database.prepare("INSERT INTO clients (id, workspace_id, parent_client_id, name, status, billable, billing_contact_name, billing_contact_email, billing_contact_alternate_name, billing_contact_alternate_email, billing_contact_phone_number, billing_contact_alternate_phone_number, billing_contact_street_address_1, billing_contact_street_address_2, billing_contact_city, billing_contact_state, billing_contact_zip_code, created_at, updated_at) VALUES ('other-client', 'other-workspace', NULL, 'Other Secret Client', 'Active', 'yes', '', '', '', '', '', '', '', '', '', '', '', ?, ?);").run(now, now);
    insertFile(database, "target-file", "target-workspace", "target-user", "target-workspace/2026-07-16/target-file", targetContent, now);
    insertFile(database, "other-file", "other-workspace", "other-user", "other-workspace/2026-07-16/other-file", otherContent, now);
    database.prepare(`
INSERT INTO notes (note_id, workspace_id, title, body_markdown, note_type, library_bucket, library_bucket_source, status, visibility, security_mode, secure_payload, encryption_key_version, owner_user_id, created_by_user_id, updated_by_user_id, created_at, updated_at)
VALUES ('secure-note', 'target-workspace', 'Encrypted recovery note', '', 'general', 'reference', 'derived', 'active', 'internal', 'secure', 'ciphertext-only', 'v1', 'target-user', 'target-user', 'target-user', ?, ?);
`).run(now, now);
    database.prepare("INSERT INTO api_keys (api_key_id, workspace_id, created_by_user_id, name, key_hash, key_prefix, status, created_at) VALUES ('secret-api-key', 'target-workspace', 'target-user', 'Must be stripped', 'secret-hash', 'ltf_secret', 'active', ?);").run(now);
    database.prepare("INSERT INTO api_key_scopes (api_key_id, scope) VALUES ('secret-api-key', 'tasks:read');").run();
    database.prepare("INSERT INTO sessions (session_id, user_id, username, home_workspace_id, active_workspace_id, timezone, expires_at, created_at, updated_at) VALUES ('secret-session', 'target-user', 'owner@example.test', 'target-workspace', 'target-workspace', 'America/New_York', '2026-07-17T20:00:00.000Z', ?, ?);").run(now, now);
    database.prepare("INSERT INTO app_settings (setting_key, setting_value, created_at, updated_at) VALUES ('workspace_creation_enabled', 'true', ?, ?);").run(now, now);
    database.prepare("INSERT INTO jobs (job_id, workspace_id, job_type, payload_json, status, priority, available_at, attempt_count, max_attempts, created_at, updated_at) VALUES ('target-job', 'target-workspace', 'test', '{}', 'pending', 0, ?, 0, 3, ?, ?);").run(now, now, now);
    database.prepare("INSERT INTO search_index (search_index_id, workspace_id, module_id, record_type, record_id, title, summary, body, tags_text, visibility, record_status, source, indexed_at) VALUES ('other-search', 'other-workspace', 'tasks', 'task', 'other-record', 'Other search', '', 'other workspace search secret', '', 'workspace', 'active', 'fixture', ?);").run(now);
    database.prepare("INSERT INTO search_index_fts (search_index_id, workspace_id, module_id, record_type, record_id, title, summary, body, tags_text, source) VALUES ('other-search', 'other-workspace', 'tasks', 'task', 'other-record', 'Other search', '', 'other workspace search secret', '', 'fixture');").run();
    assert.equal(database.pragma("foreign_key_check").length, 0);
  } finally {
    database.close();
  }
}

function insertWorkspace(database, workspaceId, name, ownerUserId, now) {
  database.prepare("INSERT INTO workspaces (workspace_id, name, status, workspace_type, owner_user_id, created_at, updated_at) VALUES (?, ?, 'Active', 'business', ?, ?, ?);")
    .run(workspaceId, name, ownerUserId, now, now);
}

function insertUser(database, userId, username, displayName, workspaceId) {
  database.prepare(`
INSERT INTO users (user_id, home_workspace_id, username, display_name, alt_email, timezone, password, theme_mode, user_status, protected_user, active_workspace_id, open_external_links_new_tab, theme_auto_source, password_change_required, preferred_login_landing, preferred_workspace_switch_landing)
VALUES (?, ?, ?, ?, 'private-alt@example.test', 'America/New_York', 'source-password-hash', 'light', 'active', 'yes', ?, 0, 'system', 0, 'dashboard', 'dashboard');
`).run(userId, workspaceId, username, displayName, workspaceId);
}

function insertMembership(database, id, userId, workspaceId, now) {
  database.prepare("INSERT INTO user_workspaces (user_workspace_id, user_id, workspace_id, status, created_at, updated_at) VALUES (?, ?, ?, 'active', ?, ?);")
    .run(id, userId, workspaceId, now, now);
}

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
    assert.deepEqual(database.prepare("SELECT workspace_id, name FROM workspaces").all(), [{ workspace_id: "target-workspace", name: "Recovery Workspace" }]);
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM clients WHERE name = 'Recovery Client'").get().count, 1);
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM clients WHERE name = 'Other Secret Client'").get().count, 0);
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM api_keys").get().count, 0);
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM sessions").get().count, 0);
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM jobs").get().count, 0);
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM app_settings").get().count, 0);
    const identity = database.prepare("SELECT username, alt_email, password, user_status, protected_user FROM users").get();
    assert.equal(identity.username, "owner@example.test");
    assert.equal(identity.alt_email, null);
    assert.equal(identity.password, "!workspace-backup-retired!");
    assert.equal(identity.user_status, "inactive");
    assert.equal(identity.protected_user, "no");
    assert.equal(database.prepare("SELECT secure_payload FROM notes WHERE note_id = 'secure-note'").get().secure_payload, "ciphertext-only");
    assert.equal(database.pragma("integrity_check")[0].integrity_check, "ok");
    assert.deepEqual(database.pragma("foreign_key_check"), []);
  } finally {
    database.close();
  }
}
