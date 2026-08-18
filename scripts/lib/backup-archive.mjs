import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import { createOpaqueId, createRecordId } from "../../src/core/identifiers.js";
import { runLocalTarArchiveCommand } from "../../src/core/tar-archive-command.js";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(moduleDir, "../..");
const ARCHIVE_ROOT = "longtail-forge-backup";
const BACKUP_FORMAT = "longtail-forge-instance-backup";
const BACKUP_FORMAT_VERSION = 1;
const MAX_CONTROL_FILE_BYTES = 50 * 1024 * 1024;
const REQUIRED_DESTRUCTIVE_CONFIRMATION = "RESTORE LONGTAIL FORGE BACKUP";

/**
 * A value that may carry an error message, narrowed from an unknown thrown value.
 * @typedef {{ message?: unknown }} MessageCarrier
 */

/**
 * Minimal structural surface of an open better-sqlite3 statement.
 * @typedef {object} SqliteStatementLike
 * @property {(...bindings: unknown[]) => Record<string, unknown>[]} all
 * @property {(...bindings: unknown[]) => Record<string, unknown> | undefined} get
 * @property {(...bindings: unknown[]) => unknown} run
 */

/**
 * A database handle opened for transactional audit writes.
 * @typedef {SqliteDatabaseLike & { close: () => void, transaction: (run: () => void) => () => void }} AuditDatabaseHandle
 */

/**
 * Minimal structural surface of an open better-sqlite3 database handle.
 * @typedef {object} SqliteDatabaseLike
 * @property {(sql: string) => SqliteStatementLike} prepare
 * @property {(sql: string, options?: { simple?: boolean }) => unknown} pragma
 */

/**
 * One applied schema-migration identity row.
 * @typedef {object} MigrationRow
 * @property {string} version
 * @property {string} moduleId
 * @property {string} name
 * @property {string} checksum
 * @property {string} appliedAt
 */

/**
 * A COUNT(*) aggregate row.
 * @typedef {{ count: unknown }} CountRow
 */

/**
 * A DISTINCT encryption key version row.
 * @typedef {{ version: string | null }} KeyVersionRow
 */

/**
 * One Files inventory row read from the source database.
 * @typedef {object} BackupFileRow
 * @property {string} storageProvider
 * @property {string} storageKey
 * @property {unknown} sizeBytes
 * @property {string | null} sha256
 * @property {string} storageKind
 */

/**
 * One PRAGMA integrity_check result row.
 * @typedef {{ integrity_check?: unknown }} IntegrityCheckRow
 */

/**
 * Secure Notes exposure inventory for one installation.
 * @typedef {object} SecureNotesInventory
 * @property {number} encryptedNoteCount
 * @property {number} encryptedRecordCount
 * @property {number} encryptedRevisionCount
 * @property {(string | null)[]} keyVersions
 */

/**
 * Local Files storage inventory for one installation.
 * @typedef {object} StorageInventory
 * @property {number} externalRecordCount
 * @property {number} localObjectBytes
 * @property {number} localObjectCount
 * @property {number} localReferencedRecordCount
 * @property {string} [provider]
 */

/**
 * Full inspected inventory of the source installation.
 * @typedef {object} SourceInventory
 * @property {MigrationRow[]} migrations
 * @property {SecureNotesInventory} secureNotes
 * @property {StorageInventory} storage
 */

/**
 * Safe non-secret runtime classification values supplied by the operator.
 * @typedef {object} BackupRuntimeDescriptor
 * @property {unknown} [environment]
 * @property {unknown} [scannerMode]
 * @property {unknown} [sqliteForeignKeys]
 * @property {unknown} [sqliteJournalMode]
 * @property {unknown} [workerMode]
 */

/**
 * Confirmation state of the Secure Notes key-recovery prerequisite.
 * @typedef {{ confirmed: boolean }} KeyRecoveryState
 */

/**
 * Inputs assembled for one backup manifest.
 * @typedef {object} CreateManifestInput
 * @property {string} appVersion
 * @property {string} backupId
 * @property {string} createdAt
 * @property {SourceInventory} inventory
 * @property {KeyRecoveryState} keyRecovery
 * @property {BackupRuntimeDescriptor} runtime
 */

/**
 * Validated backup manifest document (the properties this module reads).
 * @typedef {object} BackupManifest
 * @property {string} format
 * @property {number} formatVersion
 * @property {string} backupId
 * @property {string} createdAt
 * @property {string} appVersion
 * @property {{ provider: string, migrationCount: number, migrations: MigrationRow[] }} database
 * @property {{ provider: string }} storage
 * @property {SecureNotesInventory & { masterKeyIncluded: boolean, recoveryPrerequisiteRequired: boolean, recoveryPrerequisiteConfirmed: boolean }} secureNotes
 * @property {unknown} included
 * @property {unknown} excluded
 */

/**
 * Manifest identity keys validated as required text.
 * @typedef {"backupId" | "createdAt" | "appVersion"} ManifestIdentityKey
 */

/**
 * Validated backup checksum inventory document.
 * @typedef {object} BackupChecksums
 * @property {number} schemaVersion
 * @property {string} algorithm
 * @property {Record<string, string>} files
 */

/**
 * One archive listing entry: path plus tar type character.
 * @typedef {{ name: string, type: string }} TarEntryDescriptor
 */

/**
 * Options accepted by createBackup; presence is enforced at runtime.
 * @typedef {object} CreateBackupOptions
 * @property {unknown} [appVersion]
 * @property {string} [auditLogPath]
 * @property {unknown} [confirmStopped]
 * @property {unknown} [databaseFile]
 * @property {unknown} [filesRoot]
 * @property {unknown} [outputPath]
 * @property {BackupRuntimeDescriptor} [runtime]
 * @property {string} [secureNotesKeyBackupPath]
 */

/**
 * Options accepted by inspectBackup and withInspectedBackup.
 * @typedef {object} InspectBackupOptions
 * @property {unknown} [archivePath]
 * @property {string} [expectedAppVersion]
 * @property {string} [secureNotesKeyBackupPath]
 */

/**
 * Options accepted by exportBackup; presence is enforced at runtime.
 * @typedef {object} ExportBackupOptions
 * @property {unknown} [appVersion]
 * @property {unknown} [archivePath]
 * @property {string} [auditLogPath]
 * @property {string} [expectedAppVersion]
 * @property {unknown} [outputPath]
 * @property {string} [secureNotesKeyBackupPath]
 */

/**
 * Options accepted by restoreBackup; presence is enforced at runtime.
 * @typedef {object} RestoreBackupOptions
 * @property {unknown} [appVersion]
 * @property {unknown} [archivePath]
 * @property {string} [auditLogPath]
 * @property {unknown} [confirmStopped]
 * @property {unknown} [databaseFile]
 * @property {string} [destructiveConfirmation]
 * @property {unknown} [filesRoot]
 * @property {unknown} [preRestoreBackupPath]
 * @property {BackupRuntimeDescriptor} [runtime]
 * @property {string} [secureNotesKeyBackupPath]
 */

/**
 * The extracted, checksum-verified view of one backup archive.
 * @typedef {object} BackupInspection
 * @property {string} archivePath
 * @property {string} archiveRoot
 * @property {string} archiveSha256
 * @property {string} databasePath
 * @property {string} filesPath
 * @property {BackupManifest} manifest
 * @property {boolean} restorable
 * @property {string[]} restorabilityWarnings
 */

/**
 * The live-instance paths a backup destination must stay outside of.
 * @typedef {{ databaseFile: string, filesRoot: string }} LiveInstancePaths
 */

/**
 * Protected locations the Secure Notes key backup must stay outside of.
 * @typedef {{ databaseFile: string, filesRoot: string, outputPath: string }} BackupProtectedPaths
 */

/**
 * Options accepted by listRegularFiles.
 * @typedef {{ allowMissing?: boolean }} ListRegularFilesOptions
 */

/** @param {CreateBackupOptions} options */
async function createBackup(options) {
  assertStoppedConfirmation(options.confirmStopped);
  const databaseFile = requiredPath(options.databaseFile, "database file");
  const filesRoot = requiredPath(options.filesRoot, "Files storage root");
  const outputPath = requiredPath(options.outputPath, "backup output");
  const auditLogPath = resolveAuditLogPath(options.auditLogPath, outputPath);
  const appVersion = requiredText(options.appVersion, "application version");
  await assertSourceFile(databaseFile, "SQLite database");
  await assertSafeBackupDestination(outputPath, { databaseFile, filesRoot });

  const source = new Database(databaseFile, { fileMustExist: true, readonly: true });
  let inventory;
  try {
    inventory = await inspectSourceInstallation(source, filesRoot);
  } finally {
    source.close();
  }

  const keyRecovery = await resolveSecureNotesRecovery(
    inventory.secureNotes,
    options.secureNotesKeyBackupPath,
    { databaseFile, filesRoot, outputPath },
  );
  const backupId = createOpaqueId();
  const createdAt = new Date().toISOString();
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-backup-create-"));
  const archiveRoot = path.join(workspace, ARCHIVE_ROOT);
  const stagedDatabase = path.join(archiveRoot, "database", "longtail-forge.db");
  const stagedFiles = path.join(archiveRoot, "files");

  try {
    await fs.mkdir(path.dirname(stagedDatabase), { recursive: true });
    await sourceDatabaseBackup(databaseFile, stagedDatabase);
    await fs.mkdir(stagedFiles, { recursive: true });
    if (await pathExists(filesRoot)) {
      await fs.cp(filesRoot, stagedFiles, { recursive: true, force: true });
    }

    const manifest = createManifest({
      appVersion,
      backupId,
      createdAt,
      inventory,
      keyRecovery,
      runtime: options.runtime || {},
    });
    const manifestPath = path.join(archiveRoot, "manifest.json");
    await writeJson(manifestPath, manifest);
    const payloadFiles = await listRegularFiles(archiveRoot);
    const checksums = {
      schemaVersion: 1,
      algorithm: "sha256",
      files: Object.fromEntries(await Promise.all(payloadFiles.map(async (filePath) => [
        toArchiveRelative(archiveRoot, filePath),
        await hashFile(filePath),
      ]))),
    };
    await writeJson(path.join(archiveRoot, "checksums.json"), checksums);

    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    runTar(outputPath, "-czf", ["-C", workspace, ARCHIVE_ROOT]);
    const archiveSha256 = await hashFile(outputPath);
    const checksumPath = `${outputPath}.sha256`;
    await fs.writeFile(checksumPath, `${archiveSha256}  ${path.basename(outputPath)}\n`, "utf8");
    await restrictFile(outputPath);
    await restrictFile(checksumPath);

    await appendOperatorAudit(auditLogPath, {
      action: "backup_created",
      appVersion,
      archiveSha256,
      backupId,
      createdAt,
      formatVersion: BACKUP_FORMAT_VERSION,
      secureNotesKeyRecoveryRequired: inventory.secureNotes.encryptedRecordCount > 0,
      status: "success",
    });
    recordDatabaseAudit(databaseFile, "instance_backup_created", "create", {
      archiveSha256,
      backupId,
      formatVersion: BACKUP_FORMAT_VERSION,
    });

    return Object.freeze({
      appVersion,
      archiveSha256,
      auditLogPath,
      backupId,
      checksumPath,
      manifest,
      outputPath,
    });
  } catch (error) {
    await fs.rm(outputPath, { force: true }).catch(() => {});
    await fs.rm(`${outputPath}.sha256`, { force: true }).catch(() => {});
    await appendOperatorAudit(auditLogPath, {
      action: "backup_create_failed",
      appVersion,
      backupId,
      createdAt: new Date().toISOString(),
      errorCode: classifyError(error),
      status: "failure",
    }).catch(() => {});
    throw error;
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
}

/** @param {InspectBackupOptions} options */
async function inspectBackup(options) {
  const archivePath = requiredPath(options.archivePath, "backup archive");
  const expectedAppVersion = String(options.expectedAppVersion || "").trim();
  return await withInspectedBackup({
    archivePath,
    expectedAppVersion,
    secureNotesKeyBackupPath: options.secureNotesKeyBackupPath,
  }, async (inspection) => sanitizeInspection(inspection));
}

/** @param {ExportBackupOptions} options */
async function exportBackup(options) {
  const sourcePath = requiredPath(options.archivePath, "backup archive");
  const destinationPath = requiredPath(options.outputPath, "export destination");
  const auditLogPath = resolveAuditLogPath(options.auditLogPath, sourcePath);
  const inspection = await inspectBackup({
    archivePath: sourcePath,
    expectedAppVersion: options.expectedAppVersion,
    secureNotesKeyBackupPath: options.secureNotesKeyBackupPath,
  });
  await assertSafeExportDestination(destinationPath);
  await fs.mkdir(path.dirname(destinationPath), { recursive: true });
  await fs.copyFile(sourcePath, destinationPath);
  await fs.copyFile(`${sourcePath}.sha256`, `${destinationPath}.sha256`);
  await restrictFile(destinationPath);
  await restrictFile(`${destinationPath}.sha256`);
  await appendOperatorAudit(auditLogPath, {
    action: "backup_exported",
    archiveSha256: inspection.archiveSha256,
    backupId: inspection.manifest.backupId,
    createdAt: new Date().toISOString(),
    status: "success",
  });
  return Object.freeze({ destinationPath, inspection });
}

/** @param {RestoreBackupOptions} options */
async function restoreBackup(options) {
  assertStoppedConfirmation(options.confirmStopped);
  if (options.destructiveConfirmation !== REQUIRED_DESTRUCTIVE_CONFIRMATION) {
    throw new Error(`Destructive restore requires --confirm-destructive "${REQUIRED_DESTRUCTIVE_CONFIRMATION}".`);
  }
  const archivePath = requiredPath(options.archivePath, "backup archive");
  const databaseFile = requiredPath(options.databaseFile, "target database file");
  const filesRoot = requiredPath(options.filesRoot, "target Files storage root");
  const preRestoreBackupPath = requiredPath(options.preRestoreBackupPath, "pre-restore backup output");
  const appVersion = requiredText(options.appVersion, "application version");
  const auditLogPath = resolveAuditLogPath(options.auditLogPath, preRestoreBackupPath);
  await assertSourceFile(databaseFile, "target SQLite database");
  await assertSafeBackupDestination(preRestoreBackupPath, { databaseFile, filesRoot });

  try {
    return await withInspectedBackup({
      archivePath,
      expectedAppVersion: appVersion,
      secureNotesKeyBackupPath: options.secureNotesKeyBackupPath,
    }, async (inspection) => {
    if (!inspection.restorable) {
      throw new Error(`Backup is not fully restorable: ${inspection.restorabilityWarnings.join(" ")}`);
    }

    const preRestore = await createBackup({
      appVersion,
      auditLogPath,
      confirmStopped: true,
      databaseFile,
      filesRoot,
      outputPath: preRestoreBackupPath,
      runtime: options.runtime,
      secureNotesKeyBackupPath: options.secureNotesKeyBackupPath,
    });
    const operationId = createOpaqueId();
    const databaseParent = path.dirname(databaseFile);
    const filesParent = path.dirname(filesRoot);
    const stagedDatabase = path.join(databaseParent, `.ltf-restore-${operationId}.db`);
    const stagedFiles = path.join(filesParent, `.ltf-restore-${operationId}-files`);
    const rollbackDir = path.join(databaseParent, `.ltf-restore-${operationId}-rollback`);
    const rollbackDatabase = path.join(rollbackDir, path.basename(databaseFile));
    const rollbackFiles = path.join(rollbackDir, "files");
    let databaseMoved = false;
    let databasePromoted = false;
    let filesMoved = false;
    let filesPromoted = false;
    let shmMoved = false;
    let walMoved = false;

    try {
      await fs.copyFile(inspection.databasePath, stagedDatabase);
      await fs.cp(inspection.filesPath, stagedFiles, { recursive: true, force: true });
      await restrictDirectory(stagedFiles);
      verifyDatabaseAgainstManifest(stagedDatabase, inspection.manifest);
      await fs.mkdir(rollbackDir, { recursive: true });
      databaseMoved = await moveIfExists(databaseFile, rollbackDatabase);
      walMoved = await moveIfExists(`${databaseFile}-wal`, `${rollbackDatabase}-wal`);
      shmMoved = await moveIfExists(`${databaseFile}-shm`, `${rollbackDatabase}-shm`);
      filesMoved = await moveIfExists(filesRoot, rollbackFiles);
      await fs.rename(stagedDatabase, databaseFile);
      databasePromoted = true;
      await fs.rename(stagedFiles, filesRoot);
      filesPromoted = true;
      verifyDatabaseAgainstManifest(databaseFile, inspection.manifest);
      recordDatabaseAudit(databaseFile, "instance_backup_restored", "restore", {
        backupId: inspection.manifest.backupId,
        preRestoreBackupId: preRestore.backupId,
        sourceAppVersion: inspection.manifest.appVersion,
      });
      await appendOperatorAudit(auditLogPath, {
        action: "backup_restored",
        appVersion,
        backupId: inspection.manifest.backupId,
        createdAt: new Date().toISOString(),
        preRestoreBackupId: preRestore.backupId,
        status: "success",
      });
      await fs.rm(rollbackDir, { recursive: true, force: true });
      return Object.freeze({
        backupId: inspection.manifest.backupId,
        preRestoreBackupPath,
        restoredAppVersion: inspection.manifest.appVersion,
      });
    } catch (error) {
      if (databasePromoted || filesPromoted || databaseMoved || filesMoved || walMoved || shmMoved) {
        if (databasePromoted) {
        await fs.rm(databaseFile, { force: true }).catch(() => {});
        }
        await fs.rm(`${databaseFile}-wal`, { force: true }).catch(() => {});
        await fs.rm(`${databaseFile}-shm`, { force: true }).catch(() => {});
        if (filesPromoted) {
        await fs.rm(filesRoot, { recursive: true, force: true }).catch(() => {});
        }
        if (databaseMoved) await moveIfExists(rollbackDatabase, databaseFile).catch(() => {});
        if (walMoved) await moveIfExists(`${rollbackDatabase}-wal`, `${databaseFile}-wal`).catch(() => {});
        if (shmMoved) await moveIfExists(`${rollbackDatabase}-shm`, `${databaseFile}-shm`).catch(() => {});
        if (filesMoved) await moveIfExists(rollbackFiles, filesRoot).catch(() => {});
      }
      throw error;
    } finally {
      await fs.rm(stagedDatabase, { force: true }).catch(() => {});
      await fs.rm(`${stagedDatabase}-wal`, { force: true }).catch(() => {});
      await fs.rm(`${stagedDatabase}-shm`, { force: true }).catch(() => {});
      await fs.rm(stagedFiles, { recursive: true, force: true }).catch(() => {});
      await fs.rm(rollbackDir, { recursive: true, force: true }).catch(() => {});
    }
    });
  } catch (error) {
    await appendOperatorAudit(auditLogPath, {
      action: "backup_restore_failed",
      appVersion,
      createdAt: new Date().toISOString(),
      errorCode: classifyError(error),
      status: "failure",
    }).catch(() => {});
    throw error;
  }
}

/**
 * @template T
 * @param {InspectBackupOptions} options
 * @param {(inspection: BackupInspection) => Promise<T>} callback
 * @returns {Promise<T>}
 */
async function withInspectedBackup(options, callback) {
  const archivePath = requiredPath(options.archivePath, "backup archive");
  await assertSourceFile(archivePath, "backup archive");
  const archiveSha256 = await verifyArchiveSidecar(archivePath);
  const entries = listTarEntries(archivePath);
  validateTarEntries(entries);
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-backup-inspect-"));
  try {
    runTar(archivePath, "-xzf", ["-C", workspace, "--no-same-owner", "--no-same-permissions"]);
    const archiveRoot = path.join(workspace, ARCHIVE_ROOT);
    await assertNoLinks(archiveRoot);
    const manifest = /** @type {BackupManifest} */ (await readControlJson(path.join(archiveRoot, "manifest.json")));
    const checksums = /** @type {BackupChecksums} */ (await readControlJson(path.join(archiveRoot, "checksums.json")));
    validateManifest(manifest, options.expectedAppVersion);
    await validateChecksums(archiveRoot, checksums);
    await validateExpectedArchiveFiles(archiveRoot, checksums);
    const databasePath = path.join(archiveRoot, "database", "longtail-forge.db");
    const filesPath = path.join(archiveRoot, "files");
    verifyDatabaseAgainstManifest(databasePath, manifest);
    const warnings = [];
    if (manifest.secureNotes.recoveryPrerequisiteRequired) {
      try {
        await assertExternalKeyBackup(options.secureNotesKeyBackupPath, {
          databaseFile: databasePath,
          filesRoot: filesPath,
          outputPath: archivePath,
        });
      } catch {
        warnings.push("Encrypted Secure Notes require the separately protected operator key backup.");
      }
    }
    return await callback({
      archivePath,
      archiveRoot,
      archiveSha256,
      databasePath,
      filesPath,
      manifest,
      restorable: warnings.length === 0,
      restorabilityWarnings: warnings,
    });
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
}

/**
 * @param {SqliteDatabaseLike} database
 * @param {string} filesRoot
 * @returns {Promise<SourceInventory>}
 */
async function inspectSourceInstallation(database, filesRoot) {
  assertDatabaseIntegrity(database, "Source database");
  const migrations = /** @type {MigrationRow[]} */ (database.prepare(`
SELECT version, module_id AS moduleId, name, checksum, applied_at AS appliedAt
FROM schema_migrations
ORDER BY applied_at, version;
`).all());
  if (migrations.length === 0) {
    throw new Error("Source database has no applied migration identity.");
  }
  const secureNoteCount = Number(/** @type {CountRow} */ (database.prepare("SELECT COUNT(*) AS count FROM notes WHERE security_mode = 'secure';").get()).count);
  const secureRevisionCount = Number(/** @type {CountRow} */ (database.prepare("SELECT COUNT(*) AS count FROM note_revisions WHERE security_mode = 'secure';").get()).count);
  const keyVersions = /** @type {KeyVersionRow[]} */ (database.prepare(`
SELECT DISTINCT encryption_key_version AS version FROM notes WHERE security_mode = 'secure'
UNION
SELECT DISTINCT encryption_key_version AS version FROM note_revisions WHERE security_mode = 'secure'
ORDER BY version;
`).all()).map((row) => row.version).filter(Boolean);
  const fileRows = /** @type {BackupFileRow[]} */ (database.prepare(`
SELECT storage_provider AS storageProvider, storage_key AS storageKey,
       file_size_bytes AS sizeBytes, sha256_hash AS sha256,
       COALESCE(storage_kind, 'internal') AS storageKind
FROM files
ORDER BY file_id;
`).all());
  const unsupported = fileRows.filter((row) => row.storageKind === "internal" && row.storageProvider !== "local");
  if (unsupported.length > 0) {
    throw new Error("Backup refused because internal Files data uses an unsupported non-local storage provider.");
  }
  const localRows = fileRows.filter((row) => row.storageKind === "internal" && row.storageProvider === "local");
  for (const row of localRows) {
    const filePath = resolveStoragePath(filesRoot, row.storageKey);
    await assertSourceFile(filePath, "referenced Files object");
    const stats = await fs.stat(filePath);
    if (Number(row.sizeBytes) !== stats.size) {
      throw new Error("Backup refused because a referenced Files object size does not match database metadata.");
    }
    if (row.sha256 && await hashFile(filePath) !== row.sha256) {
      throw new Error("Backup refused because a referenced Files object checksum does not match database metadata.");
    }
  }
  if (await pathExists(filesRoot)) {
    await assertNoLinks(filesRoot);
  }
  const storageFiles = await listRegularFiles(filesRoot, { allowMissing: true });
  const storageBytes = (await Promise.all(storageFiles.map((filePath) => fs.stat(filePath))))
    .reduce((total, stats) => total + stats.size, 0);
  return {
    migrations,
    secureNotes: {
      encryptedNoteCount: secureNoteCount,
      encryptedRecordCount: secureNoteCount + secureRevisionCount,
      encryptedRevisionCount: secureRevisionCount,
      keyVersions,
    },
    storage: {
      externalRecordCount: fileRows.filter((row) => row.storageKind === "external").length,
      localObjectBytes: storageBytes,
      localObjectCount: storageFiles.length,
      localReferencedRecordCount: localRows.length,
      provider: "local",
    },
  };
}

/** @param {CreateManifestInput} manifestInput */
function createManifest({ appVersion, backupId, createdAt, inventory, keyRecovery, runtime }) {
  const latestMigration = /** @type {MigrationRow} */ (inventory.migrations.at(-1));
  return {
    format: BACKUP_FORMAT,
    formatVersion: BACKUP_FORMAT_VERSION,
    backupId,
    createdAt,
    appVersion,
    database: {
      provider: "sqlite",
      migrationCount: inventory.migrations.length,
      latestMigration: {
        version: latestMigration.version,
        moduleId: latestMigration.moduleId,
        name: latestMigration.name,
        checksum: latestMigration.checksum,
      },
      migrations: inventory.migrations,
    },
    storage: {
      provider: "local",
      restoreLayout: "files/ relative to LONGTAIL_LOCAL_STORAGE_ROOT",
      ...inventory.storage,
    },
    secureNotes: {
      ...inventory.secureNotes,
      masterKeyIncluded: false,
      recoveryPrerequisiteRequired: inventory.secureNotes.encryptedRecordCount > 0,
      recoveryPrerequisiteConfirmed: keyRecovery.confirmed,
    },
    safeConfiguration: {
      databaseProvider: "sqlite",
      storageProvider: "local",
      environment: safeEnum(runtime.environment, ["development", "test", "production"], "unknown"),
      workerMode: safeEnum(runtime.workerMode, ["inline", "separate", "disabled"], "unknown"),
      scannerMode: safeEnum(runtime.scannerMode, ["none", "noop", "clamd", "clamscan"], "unknown"),
      sqliteForeignKeys: runtime.sqliteForeignKeys !== false,
      sqliteJournalMode: safeEnum(runtime.sqliteJournalMode, ["delete", "truncate", "persist", "memory", "wal", "off"], "unknown"),
    },
    included: [
      "manifest and SHA-256 inventory",
      "one integrity-checked SQLite database",
      "local Files storage objects",
      "application and migration compatibility metadata",
      "safe non-secret runtime classifications",
    ],
    excluded: [
      "Secure Notes master key and all runtime secrets",
      "environment files and credentials",
      "logs, caches, process state, and temporary files",
      "runtime application binaries and source code",
      "external storage objects and provider credentials",
    ],
  };
}

/**
 * @param {BackupManifest} manifest
 * @param {string | undefined} expectedAppVersion
 */
function validateManifest(manifest, expectedAppVersion) {
  if (!manifest || manifest.format !== BACKUP_FORMAT || manifest.formatVersion !== BACKUP_FORMAT_VERSION) {
    throw new Error("Unsupported Longtail Forge backup format or format version.");
  }
  for (const key of /** @type {ManifestIdentityKey[]} */ (["backupId", "createdAt", "appVersion"])) {
    requiredText(manifest[key], `manifest ${key}`);
  }
  if (expectedAppVersion && manifest.appVersion !== expectedAppVersion) {
    throw new Error(`Backup application version ${manifest.appVersion} is incompatible with running version ${expectedAppVersion}.`);
  }
  if (manifest.database?.provider !== "sqlite" || manifest.storage?.provider !== "local") {
    throw new Error("Backup uses an unsupported database or storage provider.");
  }
  if (!Array.isArray(manifest.database?.migrations) || manifest.database.migrations.length === 0) {
    throw new Error("Backup manifest is missing migration compatibility metadata.");
  }
  if (manifest.secureNotes?.masterKeyIncluded !== false) {
    throw new Error("Backup manifest must confirm that Secure Notes master key material is excluded.");
  }
  if (!Array.isArray(manifest.included) || !Array.isArray(manifest.excluded)) {
    throw new Error("Backup manifest is missing its explicit inclusion/exclusion inventory.");
  }
}

/**
 * @param {string} databasePath
 * @param {BackupManifest} manifest
 */
function verifyDatabaseAgainstManifest(databasePath, manifest) {
  const database = new Database(databasePath, { fileMustExist: true, readonly: true });
  try {
    assertDatabaseIntegrity(database, "Backup database");
    const migrations = database.prepare(`
SELECT version, module_id AS moduleId, name, checksum, applied_at AS appliedAt
FROM schema_migrations
ORDER BY applied_at, version;
`).all();
    if (JSON.stringify(migrations) !== JSON.stringify(manifest.database.migrations)) {
      throw new Error("Backup database migration identity does not match its manifest.");
    }
    const noteCount = Number(/** @type {CountRow} */ (database.prepare("SELECT COUNT(*) AS count FROM notes WHERE security_mode = 'secure';").get()).count);
    const revisionCount = Number(/** @type {CountRow} */ (database.prepare("SELECT COUNT(*) AS count FROM note_revisions WHERE security_mode = 'secure';").get()).count);
    if (noteCount !== manifest.secureNotes.encryptedNoteCount || revisionCount !== manifest.secureNotes.encryptedRevisionCount) {
      throw new Error("Backup Secure Notes inventory does not match its manifest.");
    }
  } finally {
    database.close();
  }
}

/**
 * @param {string} databaseFile
 * @param {string} outputFile
 */
async function sourceDatabaseBackup(databaseFile, outputFile) {
  const database = new Database(databaseFile, { fileMustExist: true, readonly: true });
  try {
    await database.backup(outputFile);
  } finally {
    database.close();
  }
  const backup = new Database(outputFile, { fileMustExist: true, readonly: true });
  try {
    assertDatabaseIntegrity(backup, "Staged backup database");
  } finally {
    backup.close();
  }
}

/**
 * @param {SqliteDatabaseLike} database
 * @param {string} label
 */
function assertDatabaseIntegrity(database, label) {
  const rows = /** @type {IntegrityCheckRow[]} */ (database.pragma("integrity_check"));
  if (rows.length !== 1 || rows[0].integrity_check !== "ok") {
    throw new Error(`${label} failed SQLite integrity_check.`);
  }
}

/**
 * @param {SecureNotesInventory} secureNotes
 * @param {string | undefined} keyPath
 * @param {BackupProtectedPaths} protectedPaths
 * @returns {Promise<KeyRecoveryState>}
 */
async function resolveSecureNotesRecovery(secureNotes, keyPath, protectedPaths) {
  if (secureNotes.encryptedRecordCount === 0) {
    return { confirmed: false };
  }
  await assertExternalKeyBackup(keyPath, protectedPaths);
  return { confirmed: true };
}

/**
 * @param {unknown} keyPath
 * @param {BackupProtectedPaths} protectedPaths
 */
async function assertExternalKeyBackup(keyPath, protectedPaths) {
  const resolved = requiredPath(keyPath, "separately protected Secure Notes key backup");
  await assertSourceFile(resolved, "separately protected Secure Notes key backup");
  const stats = await fs.stat(resolved);
  if (stats.size === 0) {
    throw new Error("Secure Notes key backup must not be empty.");
  }
  if (process.platform !== "win32" && (stats.mode & 0o077) !== 0) {
    throw new Error("Secure Notes key backup must not be readable or writable by group/other users.");
  }
  const forbiddenRoots = [
    path.dirname(protectedPaths.databaseFile),
    protectedPaths.filesRoot,
    path.dirname(protectedPaths.outputPath),
    path.join(repositoryRoot, "public"),
  ];
  if (forbiddenRoots.some((root) => isPathInside(root, resolved))) {
    throw new Error("Secure Notes key backup must be kept outside live data, Files storage, the ordinary backup directory, and public paths.");
  }
}

/** @param {string} archivePath */
async function verifyArchiveSidecar(archivePath) {
  const checksumPath = `${archivePath}.sha256`;
  await assertSourceFile(checksumPath, "backup archive checksum sidecar");
  const text = await fs.readFile(checksumPath, "utf8");
  const parts = text.trim().split(/\s+/);
  const actual = await hashFile(archivePath);
  if (parts[0] !== actual || parts.at(-1) !== path.basename(archivePath)) {
    throw new Error("Backup archive SHA-256 sidecar verification failed.");
  }
  return actual;
}

/**
 * @param {string} archivePath
 * @returns {TarEntryDescriptor[]}
 */
function listTarEntries(archivePath) {
  const names = runTar(archivePath, "-tzf").split(/\r?\n/).filter(Boolean);
  const verbose = runTar(archivePath, "-tvzf").split(/\r?\n/).filter(Boolean);
  if (names.length !== verbose.length) {
    throw new Error("Backup archive entry listing is inconsistent.");
  }
  return names.map((name, index) => ({ name, type: verbose[index][0] }));
}

/** @param {readonly TarEntryDescriptor[]} entries */
function validateTarEntries(entries) {
  const seen = new Set();
  for (const entry of entries) {
    const name = entry.name.replace(/\/$/, "");
    if (!["-", "d"].includes(entry.type)) {
      throw new Error("Backup archive contains a link or unsupported entry type.");
    }
    if (!isSafeArchivePath(name) || (name !== ARCHIVE_ROOT && !name.startsWith(`${ARCHIVE_ROOT}/`))) {
      throw new Error("Backup archive contains an unsafe or unexpected path.");
    }
    if (seen.has(name)) {
      throw new Error("Backup archive contains a duplicate entry path.");
    }
    seen.add(name);
  }
  for (const required of [
    `${ARCHIVE_ROOT}/manifest.json`,
    `${ARCHIVE_ROOT}/checksums.json`,
    `${ARCHIVE_ROOT}/database/longtail-forge.db`,
  ]) {
    if (!seen.has(required)) {
      throw new Error(`Backup archive is missing required entry ${required}.`);
    }
  }
}

/**
 * @param {string} archiveRoot
 * @param {BackupChecksums} checksums
 */
async function validateChecksums(archiveRoot, checksums) {
  if (checksums?.schemaVersion !== 1 || checksums?.algorithm !== "sha256" || !checksums.files || Array.isArray(checksums.files)) {
    throw new Error("Backup checksum inventory is invalid.");
  }
  for (const [relativePath, expectedHash] of Object.entries(checksums.files)) {
    if (!isSafeArchivePath(relativePath) || relativePath === "checksums.json" || !/^[a-f0-9]{64}$/.test(expectedHash)) {
      throw new Error("Backup checksum inventory contains an unsafe or invalid entry.");
    }
    const filePath = path.resolve(archiveRoot, ...relativePath.split("/"));
    if (!isPathInside(archiveRoot, filePath)) {
      throw new Error("Backup checksum path escapes the archive root.");
    }
    await assertSourceFile(filePath, "checksummed backup entry");
    if (await hashFile(filePath) !== expectedHash) {
      throw new Error(`Backup checksum verification failed for ${relativePath}.`);
    }
  }
}

/**
 * @param {string} archiveRoot
 * @param {BackupChecksums} checksums
 */
async function validateExpectedArchiveFiles(archiveRoot, checksums) {
  const actual = (await listRegularFiles(archiveRoot)).map((filePath) => toArchiveRelative(archiveRoot, filePath));
  const expected = new Set(["checksums.json", ...Object.keys(checksums.files)]);
  if (actual.length !== expected.size || actual.some((relativePath) => !expected.has(relativePath))) {
    throw new Error("Backup archive contains files outside its checksum inventory.");
  }
}

/** @param {string} root */
async function assertNoLinks(root) {
  if (!await pathExists(root)) {
    return;
  }
  const pending = [root];
  while (pending.length > 0) {
    const current = /** @type {string} */ (pending.pop());
    const stats = await fs.lstat(current);
    if (stats.isSymbolicLink() || (!stats.isDirectory() && !stats.isFile())) {
      throw new Error("Backup paths may contain only regular files and directories; links and special files are refused.");
    }
    if (stats.isDirectory()) {
      for (const name of await fs.readdir(current)) {
        pending.push(path.join(current, name));
      }
    }
  }
}

/**
 * @param {string} root
 * @param {ListRegularFilesOptions} [options]
 */
async function listRegularFiles(root, options = {}) {
  if (!await pathExists(root)) {
    if (options.allowMissing) {
      return [];
    }
    throw new Error(`Required directory is missing: ${root}`);
  }
  const files = [];
  const pending = [root];
  while (pending.length > 0) {
    const current = /** @type {string} */ (pending.pop());
    const stats = await fs.lstat(current);
    if (stats.isSymbolicLink() || (!stats.isDirectory() && !stats.isFile())) {
      throw new Error("Backup paths may contain only regular files and directories.");
    }
    if (stats.isFile()) {
      files.push(current);
      continue;
    }
    const children = (await fs.readdir(current)).sort().reverse();
    for (const child of children) {
      pending.push(path.join(current, child));
    }
  }
  return files.sort();
}

/**
 * @param {string} databaseFile
 * @param {string} action
 * @param {string} changeType
 * @param {Record<string, unknown>} metadata
 */
function recordDatabaseAudit(databaseFile, action, changeType, metadata) {
  const database = /** @type {AuditDatabaseHandle} */ (/** @type {unknown} */ (new Database(databaseFile, { fileMustExist: true })));
  try {
    const workspaces = database.prepare("SELECT workspace_id FROM workspaces ORDER BY workspace_id;").all();
    const insert = database.prepare(`
INSERT INTO audit_logs (
  audit_id, workspace_id, created_at, actor_user_id, actor_user_name,
  action, change_type, record_type, record_id, record_label, record_url,
  ip_address, previous_value_json, new_value_json, metadata_json
) VALUES (?, ?, ?, NULL, 'operator-cli', ?, ?, 'security_event', NULL, NULL, NULL, NULL, NULL, NULL, ?);
`);
    const transaction = database.transaction(() => {
      for (const workspace of workspaces) {
        insert.run(createRecordId(), workspace.workspace_id, new Date().toISOString(), action, changeType, JSON.stringify(metadata));
      }
    });
    transaction();
  } finally {
    database.close();
  }
}

/**
 * @param {string} auditLogPath
 * @param {Record<string, unknown>} entry
 */
async function appendOperatorAudit(auditLogPath, entry) {
  await assertNotPublicPath(auditLogPath);
  await fs.mkdir(path.dirname(auditLogPath), { recursive: true });
  await fs.appendFile(auditLogPath, `${JSON.stringify({ schemaVersion: 1, ...entry })}\n`, { encoding: "utf8", mode: 0o600 });
  await restrictFile(auditLogPath);
}

/**
 * @param {string} archivePath
 * @param {string} flags
 * @param {string[]} [trailingArgs]
 */
function runTar(archivePath, flags, trailingArgs = []) {
  return runLocalTarArchiveCommand({
    archivePath,
    failureMessagePrefix: "Backup archive command failed",
    flags,
    missingCommandMessage: "The system tar command is required for backup archive operations.",
    trailingArgs,
  });
}

/** @param {string} filePath */
async function hashFile(filePath) {
  const hash = createHash("sha256");
  const handle = await fs.open(filePath, "r");
  try {
    for await (const chunk of handle.createReadStream()) {
      hash.update(chunk);
    }
  } finally {
    await handle.close().catch(() => {});
  }
  return hash.digest("hex");
}

/**
 * @param {string} filePath
 * @returns {Promise<unknown>}
 */
async function readControlJson(filePath) {
  const stats = await fs.stat(filePath);
  if (!stats.isFile() || stats.size > MAX_CONTROL_FILE_BYTES) {
    throw new Error("Backup control file is missing, invalid, or too large.");
  }
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    throw new Error("Backup control file contains invalid JSON.");
  }
}

/**
 * @param {string} filePath
 * @param {unknown} value
 */
async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

/**
 * @param {string} outputPath
 * @param {LiveInstancePaths} livePaths
 */
async function assertSafeBackupDestination(outputPath, { databaseFile, filesRoot }) {
  if (await pathExists(outputPath) || await pathExists(`${outputPath}.sha256`)) {
    throw new Error("Backup destination or checksum sidecar already exists; refusing to overwrite it.");
  }
  if (isPathInside(path.dirname(databaseFile), outputPath) || isPathInside(filesRoot, outputPath)) {
    throw new Error("Backup archive must be outside the live database and Files data tree.");
  }
  await assertNotPublicPath(outputPath);
}

/** @param {string} outputPath */
async function assertSafeExportDestination(outputPath) {
  if (await pathExists(outputPath) || await pathExists(`${outputPath}.sha256`)) {
    throw new Error("Export destination or checksum sidecar already exists; refusing to overwrite it.");
  }
  await assertNotPublicPath(outputPath);
}

/** @param {string} targetPath */
async function assertNotPublicPath(targetPath) {
  if (isPathInside(path.join(repositoryRoot, "public"), targetPath)) {
    throw new Error("Backup archives, exports, and audit logs must not be placed under public static paths.");
  }
}

/**
 * @param {string} filesRoot
 * @param {unknown} storageKey
 */
function resolveStoragePath(filesRoot, storageKey) {
  const normalized = String(storageKey || "").replaceAll("\\", "/").trim();
  if (!isSafeArchivePath(normalized)) {
    throw new Error("Database contains an unsafe Files storage key.");
  }
  const resolved = path.resolve(filesRoot, ...normalized.split("/"));
  if (!isPathInside(filesRoot, resolved)) {
    throw new Error("Database Files storage key escapes the configured root.");
  }
  return resolved;
}

/** @param {unknown} value */
function isSafeArchivePath(value) {
  const text = String(value || "");
  const parts = text.split("/");
  return Boolean(text)
    && !text.includes("\\")
    && !text.includes("\0")
    && !text.startsWith("/")
    && !/^[A-Za-z]:/.test(text)
    && parts.every((part) => part && part !== "." && part !== "..");
}

/**
 * @param {string} root
 * @param {string} candidate
 */
function isPathInside(root, candidate) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

/**
 * @param {string} root
 * @param {string} filePath
 */
function toArchiveRelative(root, filePath) {
  return path.relative(root, filePath).replaceAll("\\", "/");
}

/**
 * @param {string} source
 * @param {string} destination
 */
async function moveIfExists(source, destination) {
  if (!await pathExists(source)) {
    return false;
  }
  await fs.mkdir(path.dirname(destination), { recursive: true });
  await fs.rename(source, destination);
  return true;
}

/**
 * @param {string} filePath
 * @param {string} label
 */
async function assertSourceFile(filePath, label) {
  let stats;
  try {
    stats = await fs.stat(filePath);
  } catch {
    throw new Error(`${label} does not exist.`);
  }
  if (!stats.isFile()) {
    throw new Error(`${label} must be a regular file.`);
  }
}

/** @param {string} targetPath */
async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

/** @param {string} filePath */
async function restrictFile(filePath) {
  await fs.chmod(filePath, 0o600).catch((error) => {
    if (process.platform !== "win32") {
      throw error;
    }
  });
}

/** @param {string} directoryPath */
async function restrictDirectory(directoryPath) {
  await fs.chmod(directoryPath, 0o700).catch((error) => {
    if (process.platform !== "win32") {
      throw error;
    }
  });
}

/**
 * @param {string | undefined} provided
 * @param {string} referencePath
 */
function resolveAuditLogPath(provided, referencePath) {
  return path.resolve(provided || path.join(path.dirname(referencePath), "backup-operations.jsonl"));
}

/**
 * @param {unknown} value
 * @param {string} label
 */
function requiredPath(value, label) {
  const text = requiredText(value, label);
  return path.resolve(text);
}

/**
 * @param {unknown} value
 * @param {string} label
 */
function requiredText(value, label) {
  const text = String(value || "").trim();
  if (!text) {
    throw new Error(`A ${label} is required.`);
  }
  return text;
}

/** @param {unknown} value */
function assertStoppedConfirmation(value) {
  if (value !== true) {
    throw new Error("This operation requires --confirm-stopped after stopping the app and worker.");
  }
}

/**
 * @param {unknown} value
 * @param {readonly string[]} allowed
 * @param {string} fallback
 */
function safeEnum(value, allowed, fallback) {
  const text = String(value || "").trim();
  return allowed.includes(text) ? text : fallback;
}

/** @param {unknown} error */
function classifyError(error) {
  const message = String(/** @type {MessageCarrier} */ (error)?.message || "");
  if (/checksum/i.test(message)) return "checksum_validation";
  if (/compatib|version|migration/i.test(message)) return "compatibility_validation";
  if (/Secure Notes|key backup/i.test(message)) return "key_recovery_prerequisite";
  if (/unsafe|path|link|entry|archive/i.test(message)) return "archive_validation";
  return "operation_failed";
}

/** @param {BackupInspection} inspection */
function sanitizeInspection(inspection) {
  return Object.freeze({
    archiveSha256: inspection.archiveSha256,
    manifest: inspection.manifest,
    restorable: inspection.restorable,
    restorabilityWarnings: Object.freeze([...inspection.restorabilityWarnings]),
  });
}

export {
  ARCHIVE_ROOT,
  BACKUP_FORMAT,
  BACKUP_FORMAT_VERSION,
  REQUIRED_DESTRUCTIVE_CONFIRMATION,
  createBackup,
  exportBackup,
  inspectBackup,
  isSafeArchivePath,
  restoreBackup,
  validateTarEntries,
};
