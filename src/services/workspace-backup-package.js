import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import Database from "better-sqlite3";
import { createOpaqueId } from "../core/identifiers.js";

const WORKSPACE_ARCHIVE_ROOT = "longtail-forge-workspace-backup";
const WORKSPACE_BACKUP_FORMAT = "longtail-forge-workspace-backup";
const WORKSPACE_BACKUP_FORMAT_VERSION = 1;
const RETIRED_PASSWORD = "!workspace-backup-retired!";
const MAX_CONTROL_FILE_BYTES = 50 * 1024 * 1024;
const EXCLUDED_WORKSPACE_TABLES = new Set([
  "active_work_timers",
  "api_keys",
  "file_storage_accounting",
  "jobs",
  "search_index",
  "search_index_fts",
  "workspace_backup_exports",
]);

async function createWorkspaceBackupPackage(options) {
  const sourceDatabaseFile = requiredPath(options.databaseFile, "source SQLite database");
  const outputPath = requiredPath(options.outputPath, "workspace backup output");
  const workspaceId = requiredText(options.workspaceId, "workspace ID");
  const appVersion = requiredText(options.appVersion, "application version");
  const backupId = requiredText(options.backupId || createOpaqueId(), "backup ID");
  await assertRegularFile(sourceDatabaseFile, "source SQLite database");
  await assertNewOutput(outputPath);

  const staging = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-workspace-backup-create-"));
  const archiveRoot = path.join(staging, WORKSPACE_ARCHIVE_ROOT);
  const stagedDatabase = path.join(archiveRoot, "database", "workspace.db");
  const stagedFiles = path.join(archiveRoot, "files");
  const createdAt = new Date().toISOString();

  try {
    await fs.mkdir(path.dirname(stagedDatabase), { recursive: true });
    await snapshotDatabase(sourceDatabaseFile, stagedDatabase);
    const inventory = await scopeWorkspaceDatabase(stagedDatabase, workspaceId);
    await fs.mkdir(stagedFiles, { recursive: true });
    const storage = await stageFileObjects({
      databaseFile: stagedDatabase,
      filesRoot: stagedFiles,
      readFileObject: options.readFileObject,
    });
    const manifest = buildManifest({
      appVersion,
      backupId,
      createdAt,
      inventory,
      storage,
    });
    await writeJson(path.join(archiveRoot, "manifest.json"), manifest);
    const payloadFiles = await listRegularFiles(archiveRoot);
    const checksums = {
      schemaVersion: 1,
      algorithm: "sha256",
      files: Object.fromEntries(await Promise.all(payloadFiles.map(async (filePath) => [
        toRelativePath(archiveRoot, filePath),
        await hashFile(filePath),
      ]))),
    };
    await writeJson(path.join(archiveRoot, "checksums.json"), checksums);

    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    runTar(["-czf", outputPath, "-C", staging, WORKSPACE_ARCHIVE_ROOT]);
    const archiveSha256 = await hashFile(outputPath);
    const checksumPath = `${outputPath}.sha256`;
    await fs.writeFile(checksumPath, `${archiveSha256}  ${path.basename(outputPath)}\n`, "utf8");
    await restrictFile(outputPath);
    await restrictFile(checksumPath);

    return Object.freeze({
      archiveSha256,
      backupId,
      checksumPath,
      manifest,
      outputPath,
    });
  } catch (error) {
    await fs.rm(outputPath, { force: true }).catch(() => {});
    await fs.rm(`${outputPath}.sha256`, { force: true }).catch(() => {});
    throw error;
  } finally {
    await fs.rm(staging, { recursive: true, force: true });
  }
}

async function inspectWorkspaceBackupPackage(options) {
  return withInspectedWorkspaceBackup(options, async (inspection) => Object.freeze({
    archiveSha256: inspection.archiveSha256,
    manifest: inspection.manifest,
    restorable: inspection.restorable,
    restorabilityWarnings: Object.freeze([...inspection.restorabilityWarnings]),
  }));
}

async function restoreWorkspaceBackupPackage(options) {
  const targetDatabaseFile = requiredPath(options.targetDatabaseFile, "target SQLite database");
  const targetFilesRoot = requiredPath(options.targetFilesRoot, "target Files root");
  await assertMissingTarget(targetDatabaseFile, "target SQLite database");
  await assertMissingTarget(targetFilesRoot, "target Files root");

  return withInspectedWorkspaceBackup(options, async (inspection) => {
    if (!inspection.restorable) {
      throw new Error(`Workspace backup is not fully restorable: ${inspection.restorabilityWarnings.join(" ")}`);
    }
    await fs.mkdir(path.dirname(targetDatabaseFile), { recursive: true });
    await fs.copyFile(inspection.databasePath, targetDatabaseFile);
    await fs.cp(inspection.filesPath, targetFilesRoot, { recursive: true, force: false });
    verifyScopedDatabase(targetDatabaseFile, inspection.manifest);
    await verifyPackagedFileObjects(targetDatabaseFile, targetFilesRoot, inspection.manifest);
    return Object.freeze({
      backupId: inspection.manifest.backupId,
      restoredAppVersion: inspection.manifest.appVersion,
      targetDatabaseFile,
      targetFilesRoot,
      workspace: inspection.manifest.workspace,
    });
  });
}

async function withInspectedWorkspaceBackup(options, callback) {
  const archivePath = requiredPath(options.archivePath, "workspace backup archive");
  await assertRegularFile(archivePath, "workspace backup archive");
  const archiveSha256 = await verifySidecar(archivePath);
  validateTarEntries(listTarEntries(archivePath));
  const staging = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-workspace-backup-inspect-"));

  try {
    runTar(["-xzf", archivePath, "-C", staging, "--no-same-owner", "--no-same-permissions"]);
    const archiveRoot = path.join(staging, WORKSPACE_ARCHIVE_ROOT);
    await assertNoLinks(archiveRoot);
    const manifest = await readJson(path.join(archiveRoot, "manifest.json"));
    const checksums = await readJson(path.join(archiveRoot, "checksums.json"));
    validateManifest(manifest, options.expectedAppVersion);
    await validateChecksums(archiveRoot, checksums);
    await validateFileInventory(archiveRoot, checksums);
    const databasePath = path.join(archiveRoot, "database", "workspace.db");
    const filesPath = path.join(archiveRoot, "files");
    verifyScopedDatabase(databasePath, manifest);
    await verifyPackagedFileObjects(databasePath, filesPath, manifest);
    const restorabilityWarnings = [];
    if (manifest.secureNotes.recoveryPrerequisiteRequired) {
      try {
        await assertExternalKeyBackup(options.secureNotesKeyBackupPath, { archivePath, databasePath, filesPath });
      } catch {
        restorabilityWarnings.push("Encrypted Secure Notes require the separately protected installation key backup.");
      }
    }
    return await callback({
      archivePath,
      archiveRoot,
      archiveSha256,
      databasePath,
      filesPath,
      manifest,
      restorable: restorabilityWarnings.length === 0,
      restorabilityWarnings,
    });
  } finally {
    await fs.rm(staging, { recursive: true, force: true });
  }
}

async function snapshotDatabase(sourcePath, targetPath) {
  const source = new Database(sourcePath, { fileMustExist: true, readonly: true });
  try {
    assertIntegrity(source, "Source database");
    await source.backup(targetPath);
  } finally {
    source.close();
  }
}

async function scopeWorkspaceDatabase(databaseFile, workspaceId) {
  const database = new Database(databaseFile, { fileMustExist: true });
  database.pragma("foreign_keys = ON");
  database.pragma("busy_timeout = 10000");
  try {
    const workspace = database.prepare(`
SELECT workspace_id, name, status, workspace_type, owner_user_id, created_at, updated_at
FROM workspaces
WHERE workspace_id = ?
LIMIT 1;
`).get(workspaceId);
    if (!workspace) {
      throw new Error("Workspace backup source does not contain the selected workspace.");
    }
    const schema = readSchema(database);
    const searchFtsSql = schema.tables.includes("search_index_fts")
      ? database.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'search_index_fts';").get()?.sql
      : "";
    const workspaceTables = schema.tables.filter((table) => (
      table !== "workspaces" && schema.columnsByTable.get(table).some((column) => column.name === "workspace_id")
    ));

    database.exec("BEGIN IMMEDIATE;");
    try {
      database.pragma("defer_foreign_keys = ON");
      database.prepare("DELETE FROM api_key_scopes;").run();
      for (const table of orderWorkspaceTables(workspaceTables)) {
        if (EXCLUDED_WORKSPACE_TABLES.has(table)) {
          database.prepare(`DELETE FROM ${quoteIdentifier(table)};`).run();
        } else {
          database.prepare(`DELETE FROM ${quoteIdentifier(table)} WHERE workspace_id <> ?;`).run(workspaceId);
        }
      }
      database.prepare("DELETE FROM workspaces WHERE workspace_id <> ?;").run(workspaceId);
      database.prepare("DELETE FROM sessions;").run();
      database.prepare("DELETE FROM user_workspace_creation_permissions;").run();
      database.prepare("DELETE FROM app_settings;").run();
      if (searchFtsSql) {
        database.exec("DROP TABLE search_index_fts;");
        database.exec(`${searchFtsSql};`);
      }

      const retainedUserIds = readReferencedUserIds(database, schema, workspaceTables, workspaceId, workspace.owner_user_id);
      if (retainedUserIds.length === 0) {
        throw new Error("Workspace backup could not resolve any retained attribution identities.");
      }
      database.prepare(`DELETE FROM users WHERE user_id NOT IN (${placeholders(retainedUserIds)});`).run(...retainedUserIds);
      database.prepare(`
UPDATE users
SET home_workspace_id = ?,
    active_workspace_id = ?,
    alt_email = NULL,
    password = ?,
    user_status = 'inactive',
    protected_user = 'no',
    password_change_required = 1
WHERE user_id IN (${placeholders(retainedUserIds)});
`).run(workspaceId, workspaceId, RETIRED_PASSWORD, ...retainedUserIds);

      database.exec("COMMIT;");
    } catch (error) {
      database.exec("ROLLBACK;");
      throw error;
    }

    // Rebuild the SQLite file so deleted workspaces, credentials, and FTS segments
    // cannot survive in free pages inside the otherwise scoped package database.
    database.exec("VACUUM;");

    assertIntegrity(database, "Scoped workspace database");
    assertForeignKeys(database, "Scoped workspace database");
    const rowCounts = Object.fromEntries(
      ["workspaces", ...workspaceTables]
        .filter((table) => !EXCLUDED_WORKSPACE_TABLES.has(table))
        .map((table) => [table, Number(database.prepare(`SELECT COUNT(*) AS count FROM ${quoteIdentifier(table)};`).get().count)]),
    );
    const migrations = database.prepare(`
SELECT version, module_id AS moduleId, name, checksum, applied_at AS appliedAt
FROM schema_migrations
ORDER BY applied_at, version;
`).all();
    const secureNotes = readSecureNotesInventory(database);
    const identityCount = Number(database.prepare("SELECT COUNT(DISTINCT user_id) AS count FROM users;").get().count);
    return { identityCount, migrations, rowCounts, secureNotes, workspace };
  } finally {
    database.close();
  }
}

function readSchema(database) {
  const tables = database.prepare(`
SELECT name FROM sqlite_master
WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
ORDER BY name;
`).all().map((row) => row.name);
  const columnsByTable = new Map();
  for (const table of tables) {
    columnsByTable.set(table, database.pragma(`table_info(${quoteIdentifier(table)})`));
  }
  return { columnsByTable, tables };
}

function readReferencedUserIds(database, schema, workspaceTables, workspaceId, ownerUserId) {
  const userIds = new Set([String(ownerUserId || "").trim()].filter(Boolean));
  for (const table of workspaceTables) {
    if (EXCLUDED_WORKSPACE_TABLES.has(table)) continue;
    const userColumns = schema.columnsByTable.get(table)
      .map((column) => column.name)
      .filter((name) => name === "user_id" || name === "assignee_id" || name.endsWith("_user_id"));
    for (const column of userColumns) {
      const rows = database.prepare(`
SELECT DISTINCT ${quoteIdentifier(column)} AS user_id
FROM ${quoteIdentifier(table)}
WHERE workspace_id = ? AND ${quoteIdentifier(column)} IS NOT NULL AND ${quoteIdentifier(column)} <> '';
`).all(workspaceId);
      rows.forEach((row) => userIds.add(String(row.user_id)));
    }
  }
  const existing = database.prepare(`SELECT DISTINCT user_id FROM users WHERE user_id IN (${placeholders([...userIds])});`)
    .all(...userIds).map((row) => row.user_id);
  return [...new Set(existing)].sort();
}

async function stageFileObjects({ databaseFile, filesRoot, readFileObject }) {
  if (typeof readFileObject !== "function") {
    throw new TypeError("Workspace backup creation requires a provider-neutral Files object reader.");
  }
  const database = new Database(databaseFile, { fileMustExist: true });
  try {
    const rows = database.prepare(`
SELECT file_id, storage_provider, storage_key, file_size_bytes, sha256_hash, storage_kind
FROM files
ORDER BY file_id;
`).all();
    const copiedKeys = new Set();
    let objectBytes = 0;
    let objectCount = 0;
    const sourceProviders = new Set();
    for (const row of rows) {
      if (row.storage_kind === "external") continue;
      const storageKey = normalizeArchivePath(row.storage_key);
      sourceProviders.add(row.storage_provider);
      const destination = path.resolve(filesRoot, ...storageKey.split("/"));
      if (!isInside(filesRoot, destination)) {
        throw new Error("Files storage key escapes the workspace backup root.");
      }
      if (!copiedKeys.has(storageKey)) {
        await fs.mkdir(path.dirname(destination), { recursive: true });
        const readable = await readFileObject({
          fileId: row.file_id,
          providerId: row.storage_provider,
          storageKey: row.storage_key,
        });
        await pipeline(readable, createWriteStream(destination, { flags: "wx", mode: 0o600 }));
        const stats = await fs.stat(destination);
        const actualHash = await hashFile(destination);
        if (stats.size !== Number(row.file_size_bytes) || row.sha256_hash && actualHash !== row.sha256_hash) {
          throw new Error("A referenced Files object does not match its database size/checksum metadata.");
        }
        copiedKeys.add(storageKey);
        objectBytes += stats.size;
        objectCount += 1;
      }
    }
    database.prepare("UPDATE files SET storage_provider = 'local' WHERE storage_kind = 'internal';").run();
    return {
      externalRecordCount: rows.filter((row) => row.storage_kind === "external").length,
      objectBytes,
      objectCount,
      sourceProviders: [...sourceProviders].sort(),
    };
  } finally {
    database.close();
  }
}

function buildManifest({ appVersion, backupId, createdAt, inventory, storage }) {
  const latestMigration = inventory.migrations.at(-1);
  return {
    format: WORKSPACE_BACKUP_FORMAT,
    formatVersion: WORKSPACE_BACKUP_FORMAT_VERSION,
    backupId,
    createdAt,
    appVersion,
    workspace: {
      workspaceId: inventory.workspace.workspace_id,
      name: inventory.workspace.name,
      type: inventory.workspace.workspace_type,
      status: inventory.workspace.status,
      createdAt: inventory.workspace.created_at,
      updatedAt: inventory.workspace.updated_at,
    },
    database: {
      provider: "sqlite",
      migrationCount: inventory.migrations.length,
      latestMigration,
      migrations: inventory.migrations,
      rowCounts: inventory.rowCounts,
    },
    identities: {
      count: inventory.identityCount,
      credentialsIncluded: false,
      restoreState: "inactive-retired-attribution-only",
    },
    storage: {
      packageProvider: "local",
      restoreLayout: "files/ relative to the disposable LONGTAIL_LOCAL_STORAGE_ROOT",
      ...storage,
    },
    secureNotes: {
      ...inventory.secureNotes,
      masterKeyIncluded: false,
      recoveryPrerequisiteRequired: inventory.secureNotes.encryptedRecordCount > 0,
    },
    included: [
      "one workspace and its module/framework records",
      "retired readable attribution identities without credentials",
      "provider-normalized internal Files objects and external-file metadata",
      "encrypted Secure Notes payloads without key material",
      "manifest, migration identity, and SHA-256 inventories",
    ],
    excluded: [
      "every other workspace and its records or Files objects",
      "password hashes, API keys/scopes, sessions, and workspace-creation grants",
      "Secure Notes master key, environment files, provider credentials, and runtime secrets",
      "active timers, jobs, search indexes, storage accounting, and prior backup receipts",
      "application source/binaries, logs, caches, and process state",
    ],
  };
}

function validateManifest(manifest, expectedAppVersion) {
  if (manifest?.format !== WORKSPACE_BACKUP_FORMAT || manifest?.formatVersion !== WORKSPACE_BACKUP_FORMAT_VERSION) {
    throw new Error("Unsupported Longtail Forge workspace backup format or version.");
  }
  for (const key of ["backupId", "createdAt", "appVersion"]) requiredText(manifest[key], `manifest ${key}`);
  requiredText(manifest.workspace?.workspaceId, "manifest workspace ID");
  requiredText(manifest.workspace?.name, "manifest workspace name");
  if (expectedAppVersion && manifest.appVersion !== expectedAppVersion) {
    throw new Error(`Workspace backup application version ${manifest.appVersion} is incompatible with ${expectedAppVersion}.`);
  }
  if (manifest.database?.provider !== "sqlite" || manifest.storage?.packageProvider !== "local") {
    throw new Error("Workspace backup uses an unsupported database or package storage provider.");
  }
  if (!Array.isArray(manifest.database?.migrations) || manifest.database.migrations.length === 0) {
    throw new Error("Workspace backup manifest is missing migration identity.");
  }
  if (manifest.identities?.credentialsIncluded !== false || manifest.secureNotes?.masterKeyIncluded !== false) {
    throw new Error("Workspace backup manifest does not prove credential and Secure Notes key exclusion.");
  }
  if (!Array.isArray(manifest.included) || !Array.isArray(manifest.excluded)) {
    throw new Error("Workspace backup manifest is missing its inclusion/exclusion inventory.");
  }
}

function verifyScopedDatabase(databaseFile, manifest) {
  const database = new Database(databaseFile, { fileMustExist: true, readonly: true });
  try {
    assertIntegrity(database, "Workspace backup database");
    assertForeignKeys(database, "Workspace backup database");
    const workspaces = database.prepare("SELECT workspace_id, name FROM workspaces ORDER BY workspace_id;").all();
    if (workspaces.length !== 1 || workspaces[0].workspace_id !== manifest.workspace.workspaceId || workspaces[0].name !== manifest.workspace.name) {
      throw new Error("Workspace backup database is not scoped to exactly the manifest workspace.");
    }
    const schema = readSchema(database);
    for (const table of schema.tables.filter((name) => schema.columnsByTable.get(name).some((column) => column.name === "workspace_id"))) {
      const leak = database.prepare(`SELECT workspace_id FROM ${quoteIdentifier(table)} WHERE workspace_id <> ? LIMIT 1;`)
        .get(manifest.workspace.workspaceId);
      if (leak) throw new Error(`Workspace backup contains cross-workspace rows in ${table}.`);
    }
    for (const table of ["api_keys", "api_key_scopes", "sessions", "user_workspace_creation_permissions", "app_settings", "jobs", "active_work_timers", "search_index", "search_index_fts", "workspace_backup_exports"]) {
      if (!schema.tables.includes(table)) continue;
      const count = Number(database.prepare(`SELECT COUNT(*) AS count FROM ${quoteIdentifier(table)};`).get().count);
      if (count !== 0) throw new Error(`Workspace backup retained excluded data in ${table}.`);
    }
    for (const table of ["search_index_fts_content", "search_index_fts_docsize", "search_index_fts_idx"]) {
      if (!schema.tables.includes(table)) continue;
      const count = Number(database.prepare(`SELECT COUNT(*) AS count FROM ${quoteIdentifier(table)};`).get().count);
      if (count !== 0) throw new Error(`Workspace backup retained excluded search data in ${table}.`);
    }
    const unsafeIdentity = database.prepare(`
SELECT user_id FROM users
WHERE password <> ? OR user_status <> 'inactive' OR protected_user <> 'no' OR alt_email IS NOT NULL
LIMIT 1;
`).get(RETIRED_PASSWORD);
    if (unsafeIdentity) throw new Error("Workspace backup contains a usable or unsanitized identity credential.");
    const migrations = database.prepare(`
SELECT version, module_id AS moduleId, name, checksum, applied_at AS appliedAt
FROM schema_migrations ORDER BY applied_at, version;
`).all();
    if (JSON.stringify(migrations) !== JSON.stringify(manifest.database.migrations)) {
      throw new Error("Workspace backup migration identity does not match its manifest.");
    }
    const secureNotes = readSecureNotesInventory(database);
    if (JSON.stringify(secureNotes) !== JSON.stringify({
      encryptedNoteCount: manifest.secureNotes.encryptedNoteCount,
      encryptedRecordCount: manifest.secureNotes.encryptedRecordCount,
      encryptedRevisionCount: manifest.secureNotes.encryptedRevisionCount,
      keyVersions: manifest.secureNotes.keyVersions,
    })) {
      throw new Error("Workspace backup Secure Notes inventory does not match its manifest.");
    }
  } finally {
    database.close();
  }
}

async function verifyPackagedFileObjects(databaseFile, filesRoot, manifest) {
  const database = new Database(databaseFile, { fileMustExist: true, readonly: true });
  try {
    const rows = database.prepare(`
SELECT DISTINCT storage_key, file_size_bytes, sha256_hash
FROM files
WHERE storage_kind = 'internal'
ORDER BY storage_key;
`).all();
    let bytes = 0;
    for (const row of rows) {
      const storageKey = normalizeArchivePath(row.storage_key);
      const filePath = path.resolve(filesRoot, ...storageKey.split("/"));
      if (!isInside(filesRoot, filePath)) throw new Error("Workspace backup Files path escapes its root.");
      await assertRegularFile(filePath, "packaged Files object");
      const stats = await fs.stat(filePath);
      if (stats.size !== Number(row.file_size_bytes) || row.sha256_hash && await hashFile(filePath) !== row.sha256_hash) {
        throw new Error("Packaged Files object does not match database metadata.");
      }
      bytes += stats.size;
    }
    if (rows.length !== Number(manifest.storage.objectCount) || bytes !== Number(manifest.storage.objectBytes)) {
      throw new Error("Workspace backup Files inventory does not match its manifest.");
    }
  } finally {
    database.close();
  }
}

function readSecureNotesInventory(database) {
  const encryptedNoteCount = Number(database.prepare("SELECT COUNT(*) AS count FROM notes WHERE security_mode = 'secure';").get().count);
  const encryptedRevisionCount = Number(database.prepare("SELECT COUNT(*) AS count FROM note_revisions WHERE security_mode = 'secure';").get().count);
  const keyVersions = database.prepare(`
SELECT DISTINCT encryption_key_version AS version FROM notes WHERE security_mode = 'secure'
UNION
SELECT DISTINCT encryption_key_version AS version FROM note_revisions WHERE security_mode = 'secure'
ORDER BY version;
`).all().map((row) => row.version).filter(Boolean);
  return {
    encryptedNoteCount,
    encryptedRecordCount: encryptedNoteCount + encryptedRevisionCount,
    encryptedRevisionCount,
    keyVersions,
  };
}

function listTarEntries(archivePath) {
  const names = runTar(["-tzf", archivePath]).split(/\r?\n/).filter(Boolean);
  const verbose = runTar(["-tvzf", archivePath]).split(/\r?\n/).filter(Boolean);
  if (names.length !== verbose.length) throw new Error("Workspace backup archive listing is inconsistent.");
  return names.map((name, index) => ({ name, type: verbose[index][0] }));
}

function validateTarEntries(entries) {
  const seen = new Set();
  for (const entry of entries) {
    const name = entry.name.replace(/\/$/, "");
    if (!["-", "d"].includes(entry.type)) throw new Error("Workspace backup contains a link or unsupported entry type.");
    if (!isSafeArchivePath(name) || name !== WORKSPACE_ARCHIVE_ROOT && !name.startsWith(`${WORKSPACE_ARCHIVE_ROOT}/`)) {
      throw new Error("Workspace backup contains an unsafe or unexpected path.");
    }
    if (seen.has(name)) throw new Error("Workspace backup contains a duplicate entry path.");
    seen.add(name);
  }
  for (const required of [
    `${WORKSPACE_ARCHIVE_ROOT}/manifest.json`,
    `${WORKSPACE_ARCHIVE_ROOT}/checksums.json`,
    `${WORKSPACE_ARCHIVE_ROOT}/database/workspace.db`,
  ]) {
    if (!seen.has(required)) throw new Error(`Workspace backup is missing ${required}.`);
  }
}

async function validateChecksums(root, checksums) {
  if (checksums?.schemaVersion !== 1 || checksums?.algorithm !== "sha256" || !checksums.files || Array.isArray(checksums.files)) {
    throw new Error("Workspace backup checksum inventory is invalid.");
  }
  for (const [relativePath, expected] of Object.entries(checksums.files)) {
    if (!isSafeArchivePath(relativePath) || relativePath === "checksums.json" || !/^[a-f0-9]{64}$/.test(expected)) {
      throw new Error("Workspace backup checksum inventory contains an unsafe entry.");
    }
    const filePath = path.resolve(root, ...relativePath.split("/"));
    if (!isInside(root, filePath)) throw new Error("Workspace backup checksum path escapes its root.");
    await assertRegularFile(filePath, "checksummed workspace backup entry");
    if (await hashFile(filePath) !== expected) throw new Error(`Workspace backup checksum failed for ${relativePath}.`);
  }
}

async function validateFileInventory(root, checksums) {
  const actual = (await listRegularFiles(root)).map((filePath) => toRelativePath(root, filePath));
  const expected = new Set(["checksums.json", ...Object.keys(checksums.files)]);
  if (actual.length !== expected.size || actual.some((relativePath) => !expected.has(relativePath))) {
    throw new Error("Workspace backup contains files outside its checksum inventory.");
  }
}

async function verifySidecar(archivePath) {
  const sidecar = `${archivePath}.sha256`;
  await assertRegularFile(sidecar, "workspace backup checksum sidecar");
  const parts = (await fs.readFile(sidecar, "utf8")).trim().split(/\s+/);
  const actual = await hashFile(archivePath);
  if (parts[0] !== actual || parts.at(-1) !== path.basename(archivePath)) {
    throw new Error("Workspace backup archive checksum sidecar verification failed.");
  }
  return actual;
}

async function assertExternalKeyBackup(keyPath, protectedPaths) {
  const resolved = requiredPath(keyPath, "separately protected Secure Notes key backup");
  await assertRegularFile(resolved, "separately protected Secure Notes key backup");
  const stats = await fs.stat(resolved);
  if (stats.size === 0) throw new Error("Secure Notes key backup must not be empty.");
  if ([protectedPaths.archivePath, protectedPaths.databasePath].some((item) => path.resolve(item) === resolved) || isInside(protectedPaths.filesPath, resolved)) {
    throw new Error("Secure Notes key backup must remain separate from the workspace package and restore payload.");
  }
}

function assertIntegrity(database, label) {
  const rows = database.pragma("integrity_check");
  if (rows.length !== 1 || rows[0].integrity_check !== "ok") throw new Error(`${label} failed SQLite integrity_check.`);
}

function assertForeignKeys(database, label) {
  const rows = database.pragma("foreign_key_check");
  if (rows.length !== 0) throw new Error(`${label} failed SQLite foreign_key_check.`);
}

function runTar(args) {
  const result = spawnSync("tar", args, { encoding: "utf8", windowsHide: true });
  if (result.error?.code === "ENOENT") throw new Error("The system tar command is required for workspace backup operations.");
  if (result.status !== 0) throw new Error(`Workspace backup archive command failed: ${String(result.stderr || result.stdout || result.error).trim()}`);
  return String(result.stdout || "").trim();
}

async function listRegularFiles(root) {
  const files = [];
  const pending = [root];
  while (pending.length > 0) {
    const current = pending.pop();
    const stats = await fs.lstat(current);
    if (stats.isSymbolicLink() || !stats.isDirectory() && !stats.isFile()) throw new Error("Workspace backup paths may contain only regular files and directories.");
    if (stats.isFile()) {
      files.push(current);
    } else {
      for (const child of (await fs.readdir(current)).sort().reverse()) pending.push(path.join(current, child));
    }
  }
  return files.sort();
}

async function assertNoLinks(root) {
  await listRegularFiles(root);
}

async function hashFile(filePath) {
  const hash = createHash("sha256");
  const handle = await fs.open(filePath, "r");
  try {
    for await (const chunk of handle.createReadStream()) hash.update(chunk);
  } finally {
    await handle.close().catch(() => {});
  }
  return hash.digest("hex");
}

async function readJson(filePath) {
  const stats = await fs.stat(filePath);
  if (!stats.isFile() || stats.size > MAX_CONTROL_FILE_BYTES) throw new Error("Workspace backup control file is invalid or too large.");
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    throw new Error("Workspace backup control file contains invalid JSON.");
  }
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function assertNewOutput(outputPath) {
  if (await exists(outputPath) || await exists(`${outputPath}.sha256`)) throw new Error("Workspace backup output already exists; refusing to overwrite it.");
}

async function assertMissingTarget(targetPath, label) {
  if (await exists(targetPath)) throw new Error(`${label} already exists; disposable restore refuses destructive replacement.`);
}

async function assertRegularFile(filePath, label) {
  try {
    const stats = await fs.stat(filePath);
    if (!stats.isFile()) throw new Error();
  } catch {
    throw new Error(`${label} does not exist or is not a regular file.`);
  }
}

async function exists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function restrictFile(filePath) {
  await fs.chmod(filePath, 0o600).catch((error) => {
    if (process.platform !== "win32") throw error;
  });
}

function normalizeArchivePath(value) {
  const normalized = String(value || "").replaceAll("\\", "/").trim();
  if (!isSafeArchivePath(normalized)) throw new Error("Workspace backup encountered an unsafe Files storage key.");
  return normalized;
}

function isSafeArchivePath(value) {
  const text = String(value || "");
  const parts = text.split("/");
  return Boolean(text) && !text.includes("\\") && !text.includes("\0") && !text.startsWith("/") && !/^[A-Za-z]:/.test(text) && parts.every((part) => part && part !== "." && part !== "..");
}

function isInside(root, candidate) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === "" || !relative.startsWith("..") && !path.isAbsolute(relative);
}

function toRelativePath(root, filePath) {
  return path.relative(root, filePath).replaceAll("\\", "/");
}

function orderWorkspaceTables(tables) {
  return [...tables].sort((left, right) => left === "search_index_fts" ? -1 : right === "search_index_fts" ? 1 : left.localeCompare(right));
}

function placeholders(values) {
  if (!values.length) throw new Error("A non-empty SQL value list is required.");
  return values.map(() => "?").join(", ");
}

function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function requiredPath(value, label) {
  return path.resolve(requiredText(value, label));
}

function requiredText(value, label) {
  const text = String(value || "").trim();
  if (!text) throw new Error(`A ${label} is required.`);
  return text;
}

export {
  WORKSPACE_ARCHIVE_ROOT,
  WORKSPACE_BACKUP_FORMAT,
  WORKSPACE_BACKUP_FORMAT_VERSION,
  createWorkspaceBackupPackage,
  inspectWorkspaceBackupPackage,
  isSafeArchivePath,
  restoreWorkspaceBackupPackage,
  validateTarEntries,
};
