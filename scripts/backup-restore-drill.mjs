import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import { get as httpGet } from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import packageJson from "../package.json" with { type: "json" };
import {
  REQUIRED_DESTRUCTIVE_CONFIRMATION,
  createBackup,
  inspectBackup,
  restoreBackup,
} from "./lib/backup-archive.mjs";

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
const originalFile = "original Files payload\n";
const mutatedFile = "mutated Files payload\n";
let server;

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
  assert.equal((await inspectBackup({
    archivePath: preRestoreBackupPath,
    expectedAppVersion: packageJson.version,
    secureNotesKeyBackupPath: keyBackupPath,
  })).restorable, true);

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

  const auditEntries = (await fs.readFile(auditLogPath, "utf8")).trim().split(/\r?\n/).map(JSON.parse);
  assert.ok(auditEntries.some((entry) => entry.action === "backup_created"));
  assert.ok(auditEntries.some((entry) => entry.action === "backup_restored"));
  assert.ok(auditEntries.some((entry) => entry.action === "backup_restore_failed" && entry.errorCode === "checksum_validation"));
  const database = new Database(databaseFile, { fileMustExist: true, readonly: true });
  try {
    assert.ok(database.prepare("SELECT COUNT(*) AS count FROM audit_logs WHERE action = 'instance_backup_restored';").get().count > 0);
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
    const workspaceId = database.prepare("SELECT workspace_id AS workspaceId FROM workspaces ORDER BY workspace_id LIMIT 1;").get().workspaceId;
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
`).run(randomUUID(), workspaceId, storageKey, Buffer.byteLength(originalFile), sha256(originalFile), now, now);
    database.prepare(`
INSERT INTO notes (
  note_id, workspace_id, title, security_mode, secure_payload, secure_payload_version,
  encrypted_data_key, encryption_key_version, encryption_algorithm, key_wrapping_algorithm,
  encryption_nonce, encryption_auth_tag, key_wrapping_nonce, key_wrapping_auth_tag,
  encrypted_at, created_at, updated_at
) VALUES (?, ?, 'Backup drill secure note', 'secure', 'ciphertext', 'v1', 'wrapped-key', 'test-v1',
          'aes-256-gcm', 'aes-256-gcm', 'nonce', 'auth-tag', 'wrap-nonce', 'wrap-tag', ?, ?, ?);
`).run(randomUUID(), workspaceId, now, now, now);
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

async function assertRestoredState(expectedMarker, expectedFile) {
  const database = new Database(databaseFile, { fileMustExist: true, readonly: true });
  try {
    assert.equal(database.pragma("integrity_check")[0].integrity_check, "ok");
    assert.equal(database.prepare("SELECT setting_value AS value FROM app_settings WHERE setting_key = ?;").get(markerKey).value, expectedMarker);
    assert.equal(database.prepare("SELECT COUNT(*) AS count FROM notes WHERE security_mode = 'secure';").get().count, 1);
  } finally {
    database.close();
  }
  assert.equal(await fs.readFile(resolveStorageFile(), "utf8"), expectedFile);
}

async function createTamperedArchive(sourceArchive, outputArchive) {
  const tamperWorkspace = await fs.mkdtemp(path.join(workspace, "tamper-"));
  try {
    runTar(["-xzf", sourceArchive, "-C", tamperWorkspace]);
    await fs.writeFile(path.join(tamperWorkspace, "longtail-forge-backup", "files", ...storageKey.split("/")), "maliciously changed payload\n", "utf8");
    runTar(["-czf", outputArchive, "-C", tamperWorkspace, "longtail-forge-backup"]);
    const archiveHash = createHash("sha256").update(await fs.readFile(outputArchive)).digest("hex");
    await fs.writeFile(`${outputArchive}.sha256`, `${archiveHash}  ${path.basename(outputArchive)}\n`, "utf8");
  } finally {
    await fs.rm(tamperWorkspace, { recursive: true, force: true });
  }
}

function runTar(args) {
  const result = spawnSync("tar", args, { encoding: "utf8", windowsHide: true });
  if (result.status !== 0) throw new Error(String(result.stderr || result.stdout || result.error));
}

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
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const chunks = [];
  child.stdout.on("data", (chunk) => chunks.push(String(chunk)));
  child.stderr.on("data", (chunk) => chunks.push(String(chunk)));
  await waitForJson(port, "/readyz", child, () => chunks.join(""));
  return { child, port, output: () => chunks.join("") };
}

async function stopServer(active) {
  if (active.child.exitCode !== null) return;
  active.child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => active.child.once("exit", resolve)),
    new Promise((_, reject) => setTimeout(() => reject(new Error(`Server did not stop.\n${active.output()}`)), 10000)),
  ]);
}

async function verifyRuntime(port) {
  assert.deepEqual(await requestJson(port, "/readyz"), { status: "ready" });
  assert.equal((await requestJson(port, "/api/app-info")).version, packageJson.version);
}

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

function requestJson(port, pathname) {
  return new Promise((resolve, reject) => {
    const request = httpGet(`http://127.0.0.1:${port}${pathname}`, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.once("error", reject);
      response.once("end", () => {
        if (response.statusCode !== 200) return reject(new Error(`${pathname} returned ${response.statusCode}.`));
        try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); } catch (error) { reject(error); }
      });
    });
    request.once("error", reject);
  });
}

async function findAvailablePort() {
  return await new Promise((resolve, reject) => {
    const listener = net.createServer();
    listener.once("error", reject);
    listener.listen(0, "127.0.0.1", () => {
      const address = listener.address();
      listener.close((error) => error ? reject(error) : resolve(address.port));
    });
  });
}

function resolveStorageFile() {
  return path.join(filesRoot, ...storageKey.split("/"));
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function pathExists(targetPath) {
  try { await fs.access(targetPath); return true; } catch { return false; }
}
