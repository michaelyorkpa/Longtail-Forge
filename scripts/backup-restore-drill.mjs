import assert from "node:assert/strict";
import { requireJsonRecord } from "./test-support/json-record-assertions.mjs";
import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import { get as httpGet } from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import packageJson from "../package.json" with { type: "json" };
import { createRecordId } from "../src/core/identifiers.js";
import { runLocalTarArchiveCommand } from "../src/core/tar-archive-command.js";
import {
  REQUIRED_DESTRUCTIVE_CONFIRMATION,
  createBackup,
  inspectBackup,
  restoreBackup,
} from "./lib/backup-archive.mjs";

/**
 * An open better-sqlite3 handle on a drill database.
 * @typedef {InstanceType<typeof Database>} DatabaseHandle
 */

/**
 * The spawned application server process, with piped stdout and stderr.
 * @typedef {import("node:child_process").ChildProcessByStdio<null, import("node:stream").Readable, import("node:stream").Readable>} DrillServerProcess
 */

/**
 * A running drill server: its process, its bound port, and its captured output.
 * @typedef {object} DrillServer
 * @property {DrillServerProcess} child
 * @property {number} port
 * @property {() => string} output
 */

/**
 * One operator audit-log line appended by the backup archive library.
 * @typedef {object} OperatorAuditEntry
 * @property {string} action
 * @property {string} [errorCode]
 */

/**
 * One recovery-created audit identity row.
 * @typedef {{ audit_id: string }} RecoveryAuditRow
 */

const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-backup-restore-drill-"));
const dataDir = path.join(workspace, "live-data");
const databaseFile = path.join(dataDir, "longtail-forge.db");
const filesRoot = path.join(dataDir, "files");
const backupDir = path.join(workspace, "backups");
const keyDir = path.join(workspace, "separately-protected-secrets");
const keyBackupPath = path.join(keyDir, "secure-notes-key.backup");
const archivePath = path.join(backupDir, "baseline.ltfbackup.tgz");
const incompatibleArchivePath = path.join(backupDir, "incompatible.ltfbackup.tgz");
const tamperedArchivePath = path.join(backupDir, "tampered.ltfbackup.tgz");
const preRestoreBackupPath = path.join(backupDir, "pre-restore.ltfbackup.tgz");
const secondPreRestoreBackupPath = path.join(backupDir, "pre-rejected-restore.ltfbackup.tgz");
const thirdPreRestoreBackupPath = path.join(backupDir, "pre-tampered-restore.ltfbackup.tgz");
const auditLogPath = path.join(backupDir, "backup-operations.jsonl");
const markerKey = `backup-drill-${randomUUID()}`;
const originalMarker = "original-before-backup";
const mutatedMarker = "mutated-after-backup";
const storageKey = `drill/${randomUUID()}.txt`;
const legacyFileId = randomUUID();
const legacyClientId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const forwardProjectId = createRecordId();
const forwardNoteId = createRecordId();
const forwardAuditId = createRecordId();
const originalFile = "original Files payload\n";
const mutatedFile = "mutated Files payload\n";
let server;
let identifierWorkspaceId = "";

try {
  await fs.mkdir(keyDir, { recursive: true });
  await fs.writeFile(keyBackupPath, "operator-held-test-key-backup\n", { mode: 0o600 });
  await fs.chmod(keyBackupPath, 0o600);

  server = await startServer();
  await verifyRuntime(server.port);
  await stopServer(server);
  server = undefined;
  await seedRepresentativeState();

  const created = await createBackup({
    appVersion: packageJson.version,
    auditLogPath,
    confirmStopped: true,
    databaseFile,
    filesRoot,
    outputPath: archivePath,
    runtime: {
      environment: "test",
      scannerMode: "none",
      sqliteForeignKeys: true,
      sqliteJournalMode: "wal",
      workerMode: "inline",
    },
    secureNotesKeyBackupPath: keyBackupPath,
  });
  assertUuidVersion(created.backupId, 4, "whole-instance backup identity");
  assert.equal(created.manifest.secureNotes.masterKeyIncluded, false);
  assert.equal(created.manifest.secureNotes.recoveryPrerequisiteRequired, true);
  assert.equal(created.manifest.secureNotes.recoveryPrerequisiteConfirmed, true);

  const withoutKey = await inspectBackup({ archivePath, expectedAppVersion: packageJson.version });
  assert.equal(withoutKey.restorable, false);
  assert.match(withoutKey.restorabilityWarnings.join(" "), /Secure Notes/i);
  const withKey = await inspectBackup({
    archivePath,
    expectedAppVersion: packageJson.version,
    secureNotesKeyBackupPath: keyBackupPath,
  });
  assert.equal(withKey.restorable, true);

  await mutateLiveState();
  const restored = await restoreBackup({
    appVersion: packageJson.version,
    archivePath,
    auditLogPath,
    confirmStopped: true,
    databaseFile,
    destructiveConfirmation: REQUIRED_DESTRUCTIVE_CONFIRMATION,
    filesRoot,
    preRestoreBackupPath,
    runtime: { environment: "test", scannerMode: "none", sqliteJournalMode: "wal", workerMode: "inline" },
    secureNotesKeyBackupPath: keyBackupPath,
  });
  assert.equal(restored.backupId, created.backupId);
  if (process.platform !== "win32") {
    assert.equal((await fs.stat(filesRoot)).mode & 0o777, 0o700, "restored Files root must remain private enough for production startup");
  }
  assert.equal(
    (await fs.readdir(dataDir)).some((entry) => entry.startsWith(".ltf-restore-")),
    false,
    "successful restore must remove every staged database, sidecar, Files, and rollback path",
  );
  const preRestoreInspection = await inspectBackup({
    archivePath: preRestoreBackupPath,
    expectedAppVersion: packageJson.version,
    secureNotesKeyBackupPath: keyBackupPath,
  });
  assert.equal(preRestoreInspection.restorable, true);
  assertUuidVersion(preRestoreInspection.manifest.backupId, 4, "automatic pre-restore backup identity");
  assert.notEqual(preRestoreInspection.manifest.backupId, created.backupId, "recovery backup identity must stay independent from the restored archive identity");

  await assertRestoredState(originalMarker, originalFile);
  server = await startServer();
  await verifyRuntime(server.port);
  await stopServer(server);
  server = undefined;

  await createBackup({
    appVersion: "0.0.0-incompatible",
    auditLogPath,
    confirmStopped: true,
    databaseFile,
    filesRoot,
    outputPath: incompatibleArchivePath,
    runtime: { environment: "test", scannerMode: "none", sqliteJournalMode: "wal", workerMode: "inline" },
    secureNotesKeyBackupPath: keyBackupPath,
  });
  await assert.rejects(
    restoreBackup({
      appVersion: packageJson.version,
      archivePath: incompatibleArchivePath,
      auditLogPath,
      confirmStopped: true,
      databaseFile,
      destructiveConfirmation: REQUIRED_DESTRUCTIVE_CONFIRMATION,
      filesRoot,
      preRestoreBackupPath: secondPreRestoreBackupPath,
      secureNotesKeyBackupPath: keyBackupPath,
    }),
    /incompatible/i,
  );
  assert.equal(await pathExists(secondPreRestoreBackupPath), false, "rejected archive must not begin destructive restore");
  await assertRestoredState(originalMarker, originalFile);

  await createTamperedArchive(archivePath, tamperedArchivePath);
  await assert.rejects(
    restoreBackup({
      appVersion: packageJson.version,
      archivePath: tamperedArchivePath,
      auditLogPath,
      confirmStopped: true,
      databaseFile,
      destructiveConfirmation: REQUIRED_DESTRUCTIVE_CONFIRMATION,
      filesRoot,
      preRestoreBackupPath: thirdPreRestoreBackupPath,
      secureNotesKeyBackupPath: keyBackupPath,
    }),
    /checksum/i,
  );
  assert.equal(await pathExists(thirdPreRestoreBackupPath), false, "tampered archive must not begin destructive restore");
  await assertRestoredState(originalMarker, originalFile);

  const auditEntries = (await fs.readFile(auditLogPath, "utf8")).trim().split(/\r?\n/).map(/** @type {(line: string) => OperatorAuditEntry} */ (JSON.parse));
  assert.ok(auditEntries.some((entry) => entry.action === "backup_created"));
  assert.ok(auditEntries.some((entry) => entry.action === "backup_restored"));
  assert.ok(auditEntries.some((entry) => entry.action === "backup_restore_failed" && entry.errorCode === "checksum_validation"));
  const database = new Database(databaseFile, { fileMustExist: true, readonly: true });
  try {
    const recoveryAuditRows = /** @type {RecoveryAuditRow[]} */ (database.prepare("SELECT audit_id FROM audit_logs WHERE action = 'instance_backup_restored';").all());
    assert.ok(recoveryAuditRows.length > 0);
    recoveryAuditRows.forEach((row) => assertUuidVersion(row.audit_id, 7, "recovery-created audit identity"));
    assert.equal(/** @type {{ file_id: string }} */ (database.prepare("SELECT file_id FROM files WHERE storage_key = ?;").get(storageKey)).file_id, legacyFileId, "restore must preserve an existing UUIDv4 record identifier byte-for-byte");
    assertIdentifierSnapshot(database);
  } finally {
    database.close();
  }

  console.log(`Backup/restore drill passed for ${packageJson.version}: database, Files, Secure Notes prerequisite, readiness, rejection, and rollback safety verified.`);
} finally {
  if (server) {
    await stopServer(server).catch(() => {});
  }
  await fs.rm(workspace, { recursive: true, force: true });
}

async function seedRepresentativeState() {
  const filePath = resolveStorageFile();
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, originalFile, "utf8");
  const database = new Database(databaseFile, { fileMustExist: true });
  try {
    const workspaceId = /** @type {{ workspaceId: string }} */ (database.prepare("SELECT workspace_id AS workspaceId FROM workspaces ORDER BY workspace_id LIMIT 1;").get()).workspaceId;
    identifierWorkspaceId = workspaceId;
    assertUuidVersion(identifierWorkspaceId, 7, "fresh backup fixture workspace identity");
    const now = new Date().toISOString();
    database.prepare(`
INSERT INTO app_settings (setting_key, setting_value, created_at, updated_at) VALUES (?, ?, ?, ?)
ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value, updated_at = excluded.updated_at;
`).run(markerKey, originalMarker, now, now);
    database.prepare(`
INSERT INTO files (
  file_id, workspace_id, storage_provider, storage_key, original_filename, stored_filename,
  display_name, file_size_bytes, sha256_hash, status, scan_status, created_at, updated_at
) VALUES (?, ?, 'local', ?, 'drill.txt', 'drill.txt', 'Backup drill', ?, ?, 'available', 'not_required', ?, ?);
`).run(legacyFileId, workspaceId, storageKey, Buffer.byteLength(originalFile), sha256(originalFile), now, now);
    database.prepare(`
INSERT INTO clients (
  id, workspace_id, parent_client_id, name, status, billable,
  billing_contact_name, billing_contact_email, billing_contact_alternate_name,
  billing_contact_alternate_email, billing_contact_phone_number,
  billing_contact_alternate_phone_number, billing_contact_street_address_1,
  billing_contact_street_address_2, billing_contact_city, billing_contact_state,
  billing_contact_zip_code, created_at, updated_at
) VALUES (?, ?, NULL, 'Backup legacy UUIDv4 Client', 'Active', 'yes', '', '', '', '', '', '', '', '', '', '', '', ?, ?);
`).run(legacyClientId, workspaceId, now, now);
    database.prepare(`
INSERT INTO projects (id, workspace_id, client_id, parent_project_id, name, status, billable, created_at, updated_at)
VALUES (?, ?, ?, NULL, 'Backup UUIDv7 Project', 'Active', 'yes', ?, ?);
`).run(forwardProjectId, workspaceId, legacyClientId, now, now);
    database.prepare(`
INSERT INTO notes (
  note_id, workspace_id, title, security_mode, secure_payload, secure_payload_version,
  encrypted_data_key, encryption_key_version, encryption_algorithm, key_wrapping_algorithm,
  encryption_nonce, encryption_auth_tag, key_wrapping_nonce, key_wrapping_auth_tag,
  encrypted_at, created_at, updated_at
) VALUES (?, ?, 'Backup drill secure note', 'secure', 'ciphertext', 'v1', 'wrapped-key', 'test-v1',
          'aes-256-gcm', 'aes-256-gcm', 'nonce', 'auth-tag', 'wrap-nonce', 'wrap-tag', ?, ?, ?);
`).run(forwardNoteId, workspaceId, now, now, now);
    database.prepare(`
INSERT INTO audit_logs (
  audit_id, workspace_id, created_at, actor_user_id, actor_user_name, action,
  change_type, record_type, record_id, record_label, record_url, ip_address,
  previous_value_json, new_value_json, metadata_json
) VALUES (?, ?, ?, NULL, 'Backup drill', 'identifier_compatibility_snapshot',
          'create', 'project', ?, 'Backup UUIDv7 Project', ?, '127.0.0.1', NULL, ?, ?);
`).run(
      forwardAuditId,
      workspaceId,
      now,
      forwardProjectId,
      `projects.html?project=${forwardProjectId}`,
      JSON.stringify({ id: forwardProjectId, client_id: legacyClientId }),
      JSON.stringify({ forwardProjectId, legacyClientId, storageKey }),
    );
    assertIdentifierSnapshot(database);
  } finally {
    database.close();
  }
}

async function mutateLiveState() {
  const database = new Database(databaseFile, { fileMustExist: true });
  try {
    database.prepare("UPDATE app_settings SET setting_value = ?, updated_at = ? WHERE setting_key = ?;")
      .run(mutatedMarker, new Date().toISOString(), markerKey);
    database.prepare("UPDATE files SET file_size_bytes = ?, sha256_hash = ?, updated_at = ? WHERE storage_key = ?;")
      .run(Buffer.byteLength(mutatedFile), sha256(mutatedFile), new Date().toISOString(), storageKey);
  } finally {
    database.close();
  }
  await fs.writeFile(resolveStorageFile(), mutatedFile, "utf8");
}

/**
 * @param {string} expectedMarker
 * @param {string} expectedFile
 */
async function assertRestoredState(expectedMarker, expectedFile) {
  const database = new Database(databaseFile, { fileMustExist: true, readonly: true });
  try {
    assert.equal(/** @type {{ integrity_check: string }[]} */ (database.pragma("integrity_check"))[0].integrity_check, "ok");
    assert.deepEqual(database.pragma("foreign_key_check"), []);
    assert.equal(/** @type {{ value: string }} */ (database.prepare("SELECT setting_value AS value FROM app_settings WHERE setting_key = ?;").get(markerKey)).value, expectedMarker);
    assert.equal(/** @type {{ count: number }} */ (database.prepare("SELECT COUNT(*) AS count FROM notes WHERE security_mode = 'secure';").get()).count, 1);
    assertIdentifierSnapshot(database);
  } finally {
    database.close();
  }
  assert.equal(await fs.readFile(resolveStorageFile(), "utf8"), expectedFile);
}

/**
 * @param {string} sourceArchive
 * @param {string} outputArchive
 */
async function createTamperedArchive(sourceArchive, outputArchive) {
  const tamperWorkspace = await fs.mkdtemp(path.join(workspace, "tamper-"));
  try {
    runTar(sourceArchive, "-xzf", ["-C", relativeTarDirectoryOperand(sourceArchive, tamperWorkspace)]);
    await fs.writeFile(path.join(tamperWorkspace, "longtail-forge-backup", "files", ...storageKey.split("/")), "maliciously changed payload\n", "utf8");
    runTar(outputArchive, "-czf", ["-C", relativeTarDirectoryOperand(outputArchive, tamperWorkspace), "longtail-forge-backup"]);
    const archiveHash = createHash("sha256").update(await fs.readFile(outputArchive)).digest("hex");
    await fs.writeFile(`${outputArchive}.sha256`, `${archiveHash}  ${path.basename(outputArchive)}\n`, "utf8");
  } finally {
    await fs.rm(tamperWorkspace, { recursive: true, force: true });
  }
}

/**
 * @param {string} archivePath
 * @param {string} directoryPath
 */
function relativeTarDirectoryOperand(archivePath, directoryPath) {
  const relativePath = path.relative(path.dirname(path.resolve(archivePath)), path.resolve(directoryPath)) || ".";
  return relativePath.split(path.sep).join("/");
}

/**
 * @param {string} archivePath
 * @param {string} flags
 * @param {string[]} [trailingArgs]
 */
function runTar(archivePath, flags, trailingArgs = []) {
  return runLocalTarArchiveCommand({
    archivePath,
    failureMessagePrefix: "Backup drill archive command failed",
    flags,
    missingCommandMessage: "The system tar command is required for the backup/restore drill.",
    trailingArgs,
  });
}

/** @param {DatabaseHandle} database */
function assertIdentifierSnapshot(database) {
  assert.deepEqual(
    database.prepare("SELECT id, workspace_id FROM clients WHERE id = ?;").get(legacyClientId),
    { id: legacyClientId, workspace_id: identifierWorkspaceId },
    "whole-instance recovery must preserve the legacy Client identity and workspace relationship byte-for-byte",
  );
  assert.deepEqual(
    database.prepare("SELECT id, client_id FROM projects WHERE id = ?;").get(forwardProjectId),
    { client_id: legacyClientId, id: forwardProjectId },
    "whole-instance recovery must preserve the UUIDv7 Project to UUIDv4 Client relationship byte-for-byte",
  );
  assert.deepEqual(
    database.prepare("SELECT note_id FROM notes WHERE note_id = ?;").get(forwardNoteId),
    { note_id: forwardNoteId },
    "whole-instance recovery must preserve forward UUIDv7 Note identity byte-for-byte",
  );
  assert.deepEqual(
    database.prepare("SELECT file_id, storage_key FROM files WHERE file_id = ?;").get(legacyFileId),
    { file_id: legacyFileId, storage_key: storageKey },
    "whole-instance recovery must preserve UUIDv4 Files identity and opaque storage key independently",
  );
  const audit = database.prepare("SELECT audit_id, record_id, record_url, new_value_json, metadata_json FROM audit_logs WHERE audit_id = ?;").get(forwardAuditId);
  assert.deepEqual(audit, {
    audit_id: forwardAuditId,
    metadata_json: JSON.stringify({ forwardProjectId, legacyClientId, storageKey }),
    new_value_json: JSON.stringify({ id: forwardProjectId, client_id: legacyClientId }),
    record_id: forwardProjectId,
    record_url: `projects.html?project=${forwardProjectId}`,
  }, "whole-instance recovery must preserve IDs embedded in audit URLs and JSON metadata byte-for-byte");
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

/** @returns {Promise<DrillServer>} */
async function startServer() {
  const port = await findAvailablePort();
  const child = spawn(process.execPath, ["server.js"], {
    cwd: path.resolve("."),
    env: {
      ...process.env,
      HOST: "127.0.0.1",
      PORT: String(port),
      LONGTAIL_ENV: "test",
      LONGTAIL_DATA_DIR: dataDir,
      LONGTAIL_DATABASE_FILE: databaseFile,
      LONGTAIL_LOCAL_STORAGE_ROOT: filesRoot,
      LONGTAIL_FILE_SCANNER: "none",
      LONGTAIL_WORKER_MODE: "inline",
      LONGTAIL_SECURE_NOTES_MASTER_KEY: "backup-restore-drill-master-key-value",
      LONGTAIL_SECURE_NOTES_KEY_VERSION: "test-v1",
      SUPER_ADMIN_PASSWORD: "Backup-Restore-Drill-Password-123!",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  /** @type {string[]} */
  const chunks = [];
  child.stdout.on("data", (chunk) => chunks.push(String(chunk)));
  child.stderr.on("data", (chunk) => chunks.push(String(chunk)));
  await waitForJson(port, "/readyz", child, () => chunks.join(""));
  return { child, port, output: () => chunks.join("") };
}

/** @param {DrillServer} active */
async function stopServer(active) {
  if (active.child.exitCode !== null) return;
  active.child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => active.child.once("exit", resolve)),
    new Promise((_, reject) => setTimeout(() => reject(new Error(`Server did not stop.\n${active.output()}`)), 10000)),
  ]);
}

/** @param {number} port */
async function verifyRuntime(port) {
  assert.deepEqual(await requestJson(port, "/readyz"), { status: "ready" });
  assert.equal(requireJsonRecord(await requestJson(port, "/api/app-info"), "the app-info response").version, packageJson.version);
}

/**
 * @param {number} port
 * @param {string} pathname
 * @param {DrillServerProcess} child
 * @param {() => string} output
 * @returns {Promise<unknown>}
 */
async function waitForJson(port, pathname, child, output) {
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`Server exited before readiness.\n${output()}`);
    try {
      return await requestJson(port, pathname);
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error(`Timed out waiting for ${pathname}.\n${output()}`);
}

/**
 * @param {number} port
 * @param {string} pathname
 * @returns {Promise<unknown>} the parsed body, left open for the caller to prove
 */
function requestJson(port, pathname) {
  return new Promise((resolve, reject) => {
    const request = httpGet(`http://127.0.0.1:${port}${pathname}`, (response) => {
      /** @type {Buffer[]} */
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.once("error", reject);
      response.once("end", () => {
        if (response.statusCode !== 200) return reject(new Error(`${pathname} returned ${response.statusCode}.`));
        try { resolve(/** @type {unknown} */ (JSON.parse(Buffer.concat(chunks).toString("utf8")))); } catch (error) { reject(error); }
      });
    });
    request.once("error", reject);
  });
}

/** @returns {Promise<number>} */
async function findAvailablePort() {
  return await new Promise((resolve, reject) => {
    const listener = net.createServer();
    listener.once("error", reject);
    listener.listen(0, "127.0.0.1", () => {
      const address = /** @type {import("node:net").AddressInfo} */ (listener.address());
      listener.close((error) => error ? reject(error) : resolve(address.port));
    });
  });
}

function resolveStorageFile() {
  return path.join(filesRoot, ...storageKey.split("/"));
}

/** @param {string} value */
function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

/** @param {string} targetPath */
async function pathExists(targetPath) {
  try { await fs.access(targetPath); return true; } catch { return false; }
}
