import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  REQUIRED_DESTRUCTIVE_CONFIRMATION,
  createBackup,
  exportBackup,
  inspectBackup,
  restoreBackup,
} from "./lib/backup-archive.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(scriptPath), "..");
const packageJson = /** @type {{ version: string }} */ (JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8")));

/**
 * A thrown value that may carry an operator-facing message.
 * @typedef {import("./lib/backup-archive.mjs").MessageCarrier} MessageCarrier
 */

/**
 * Boolean operator flags accepted by the whole-instance backup CLI.
 * @typedef {"allowAnyAppVersion" | "confirmStopped"} BackupBooleanOptionKey
 */

/**
 * Value-carrying operator flags accepted by the whole-instance backup CLI.
 * @typedef {"archive" | "auditLog" | "confirmDestructive" | "database" | "filesRoot" | "output" | "preRestoreBackup" | "secureNotesKeyBackup"} BackupValueOptionKey
 */

/**
 * Operator options parsed from one whole-instance backup invocation. Every flag
 * is optional here; required-flag enforcement stays in parseCli.
 * @typedef {Partial<Record<BackupBooleanOptionKey, boolean> & Record<BackupValueOptionKey, string>>} BackupCliOptions
 */

/**
 * One parsed whole-instance backup CLI invocation.
 * @typedef {{ command: string, options: BackupCliOptions }} BackupCliInvocation
 */

/**
 * The live SQLite database file and Files storage root a command operates on.
 * @typedef {{ databaseFile: string, filesRoot: string }} RuntimePaths
 */

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  try {
    await main(process.argv.slice(2));
  } catch (error) {
    console.error(/** @type {MessageCarrier} */ (error).message);
    process.exitCode = 1;
  }
}

/** @param {string[]} args */
async function main(args) {
  const { command, options } = parseCli(args);
  const paths = resolveRuntimePaths(options);
  if (command === "create") {
    const outputPath = path.resolve(options.output || defaultBackupPath(packageJson.version));
    const result = await createBackup({
      appVersion: packageJson.version,
      auditLogPath: options.auditLog,
      confirmStopped: options.confirmStopped,
      databaseFile: paths.databaseFile,
      filesRoot: paths.filesRoot,
      outputPath,
      runtime: runtimeInventory(),
      secureNotesKeyBackupPath: options.secureNotesKeyBackup,
    });
    printJson({
      status: "created",
      appVersion: result.appVersion,
      archive: result.outputPath,
      archiveSha256: result.archiveSha256,
      backupId: result.backupId,
      checksum: result.checksumPath,
      secureNotesMasterKeyIncluded: false,
    });
  } else if (command === "inspect") {
    const result = await inspectBackup({
      archivePath: options.archive,
      expectedAppVersion: options.allowAnyAppVersion ? "" : packageJson.version,
      secureNotesKeyBackupPath: options.secureNotesKeyBackup,
    });
    printJson({
      status: "verified",
      archiveSha256: result.archiveSha256,
      manifest: result.manifest,
      restorable: result.restorable,
      restorabilityWarnings: result.restorabilityWarnings,
    });
  } else if (command === "export") {
    const result = await exportBackup({
      appVersion: packageJson.version,
      archivePath: options.archive,
      auditLogPath: options.auditLog,
      expectedAppVersion: options.allowAnyAppVersion ? "" : packageJson.version,
      outputPath: options.output,
      secureNotesKeyBackupPath: options.secureNotesKeyBackup,
    });
    printJson({
      status: "exported",
      archive: result.destinationPath,
      archiveSha256: result.inspection.archiveSha256,
      backupId: result.inspection.manifest.backupId,
    });
  } else if (command === "restore") {
    const result = await restoreBackup({
      appVersion: packageJson.version,
      archivePath: options.archive,
      auditLogPath: options.auditLog,
      confirmStopped: options.confirmStopped,
      databaseFile: paths.databaseFile,
      destructiveConfirmation: options.confirmDestructive,
      filesRoot: paths.filesRoot,
      preRestoreBackupPath: options.preRestoreBackup,
      runtime: runtimeInventory(),
      secureNotesKeyBackupPath: options.secureNotesKeyBackup,
    });
    printJson({
      status: "restored",
      backupId: result.backupId,
      preRestoreBackup: result.preRestoreBackupPath,
      restoredAppVersion: result.restoredAppVersion,
      next: "Start the app, then verify /readyz, /api/app-info, schema identity, login, Files, and Secure Notes before restoring traffic.",
    });
  }
}

/**
 * @param {string[]} args
 * @returns {BackupCliInvocation}
 */
function parseCli(args) {
  const command = /** @type {string} */ (args.shift());
  if (!new Set(["create", "export", "inspect", "restore"]).has(command)) {
    throw new Error("Usage: node scripts/backup.mjs <create|inspect|export|restore> [options]");
  }
  const options = /** @type {BackupCliOptions} */ ({});
  const booleanFlags = new Map([
    ["--confirm-stopped", "confirmStopped"],
    ["--allow-any-app-version", "allowAnyAppVersion"],
  ]);
  const valueFlags = new Map([
    ["--archive", "archive"],
    ["--audit-log", "auditLog"],
    ["--confirm-destructive", "confirmDestructive"],
    ["--database", "database"],
    ["--files-root", "filesRoot"],
    ["--output", "output"],
    ["--pre-restore-backup", "preRestoreBackup"],
    ["--secure-notes-key-backup", "secureNotesKeyBackup"],
  ]);
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (booleanFlags.has(argument)) {
      options[/** @type {BackupBooleanOptionKey} */ (booleanFlags.get(argument))] = true;
      continue;
    }
    if (valueFlags.has(argument)) {
      const value = args[++index];
      if (!value || value.startsWith("--")) {
        throw new Error(`${argument} requires a value.`);
      }
      options[/** @type {BackupValueOptionKey} */ (valueFlags.get(argument))] = value;
      continue;
    }
    throw new Error(`Unknown backup option: ${argument}`);
  }
  if (["inspect", "export", "restore"].includes(command) && !options.archive) {
    throw new Error(`${command} requires --archive <path>.`);
  }
  if (["create", "export"].includes(command) && command === "export" && !options.output) {
    throw new Error("export requires --output <path>.");
  }
  if (command === "restore" && !options.preRestoreBackup) {
    throw new Error("restore requires --pre-restore-backup <new-archive-path>.");
  }
  return { command, options };
}

/**
 * @param {BackupCliOptions} options
 * @returns {RuntimePaths}
 */
function resolveRuntimePaths(options) {
  const dataDir = path.resolve(process.env.LONGTAIL_DATA_DIR || path.join(root, "data"));
  return {
    databaseFile: path.resolve(options.database || process.env.LONGTAIL_DATABASE_FILE || path.join(dataDir, "longtail-forge.db")),
    filesRoot: path.resolve(options.filesRoot || process.env.LONGTAIL_LOCAL_STORAGE_ROOT || path.join(dataDir, "files")),
  };
}

function runtimeInventory() {
  return {
    environment: process.env.LONGTAIL_ENV,
    scannerMode: process.env.LONGTAIL_FILE_SCANNER,
    sqliteForeignKeys: String(process.env.LONGTAIL_SQLITE_FOREIGN_KEYS || "true").toLowerCase() !== "false",
    sqliteJournalMode: process.env.LONGTAIL_SQLITE_JOURNAL_MODE || "wal",
    workerMode: process.env.LONGTAIL_WORKER_MODE || "inline",
  };
}

/** @param {string} version */
function defaultBackupPath(version) {
  const timestamp = new Date().toISOString().replaceAll(":", "-");
  return path.join(root, "backups", `longtail-forge-${version}-${timestamp}.ltfbackup.tgz`);
}

/** @param {unknown} value */
function printJson(value) {
  console.log(JSON.stringify(value, null, 2));
}

export { REQUIRED_DESTRUCTIVE_CONFIRMATION, parseCli, resolveRuntimePaths };
