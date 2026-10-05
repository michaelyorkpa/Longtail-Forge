import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  inspectWorkspaceBackupPackage,
  restoreWorkspaceBackupPackage,
} from "../src/services/workspace-backup-package.js";

const scriptPath = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(scriptPath), "..");
const packageJson = /** @type {{ version: string }} */ (JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8")));

/**
 * A thrown value that may carry an operator-facing message.
 * @typedef {import("./lib/backup-archive.mjs").MessageCarrier} MessageCarrier
 */

/**
 * Boolean operator flags accepted by the workspace backup CLI.
 * @typedef {"allowAnyAppVersion"} WorkspaceBackupBooleanOptionKey
 */

/**
 * Value-carrying operator flags accepted by the workspace backup CLI.
 * @typedef {"archive" | "secureNotesKeyBackup" | "targetDatabase" | "targetFilesRoot"} WorkspaceBackupValueOptionKey
 */

/**
 * Operator options parsed from one workspace backup invocation. Every flag is
 * optional here; required-flag enforcement stays in parseCli.
 * @typedef {Partial<Record<WorkspaceBackupBooleanOptionKey, boolean> & Record<WorkspaceBackupValueOptionKey, string>>} WorkspaceBackupCliOptions
 */

/**
 * One parsed workspace backup CLI invocation.
 * @typedef {{ command: string, options: WorkspaceBackupCliOptions }} WorkspaceBackupCliInvocation
 */

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  try {
    await main(process.argv.slice(2));
  } catch (error) {
    console.error(/** @type {MessageCarrier} */ (error)?.message || error);
    process.exitCode = 1;
  }
}

/** @param {string[]} args */
async function main(args) {
  const { command, options } = parseCli(args);
  if (command === "inspect") {
    const result = await inspectWorkspaceBackupPackage({
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
  } else {
    const result = await restoreWorkspaceBackupPackage({
      archivePath: options.archive,
      expectedAppVersion: options.allowAnyAppVersion ? "" : packageJson.version,
      secureNotesKeyBackupPath: options.secureNotesKeyBackup,
      targetDatabaseFile: options.targetDatabase,
      targetFilesRoot: options.targetFilesRoot,
    });
    printJson({
      status: "restored-to-disposable-target",
      backupId: result.backupId,
      restoredAppVersion: result.restoredAppVersion,
      targetDatabase: result.targetDatabaseFile,
      targetFilesRoot: result.targetFilesRoot,
      workspaceName: result.workspace.name,
      next: "Keep the target isolated; verify SQLite integrity, representative records, Files, and Secure Notes with the separately protected key before any recovery decision.",
    });
  }
}

/**
 * @param {string[]} args
 * @returns {WorkspaceBackupCliInvocation}
 */
function parseCli(args) {
  const command = /** @type {string} */ (args.shift());
  if (!new Set(["inspect", "restore"]).has(command)) {
    throw new Error("Usage: node scripts/workspace-backup.mjs <inspect|restore> --archive <path> [options]");
  }
  const options = /** @type {WorkspaceBackupCliOptions} */ ({});
  const booleanFlags = new Map([["--allow-any-app-version", "allowAnyAppVersion"]]);
  const valueFlags = new Map([
    ["--archive", "archive"],
    ["--secure-notes-key-backup", "secureNotesKeyBackup"],
    ["--target-database", "targetDatabase"],
    ["--target-files-root", "targetFilesRoot"],
  ]);
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (booleanFlags.has(argument)) {
      options[/** @type {WorkspaceBackupBooleanOptionKey} */ (booleanFlags.get(argument))] = true;
    } else if (valueFlags.has(argument)) {
      const value = args[++index];
      if (!value || value.startsWith("--")) throw new Error(`${argument} requires a value.`);
      options[/** @type {WorkspaceBackupValueOptionKey} */ (valueFlags.get(argument))] = value;
    } else {
      throw new Error(`Unknown workspace backup option: ${argument}`);
    }
  }
  if (!options.archive) throw new Error(`${command} requires --archive <path>.`);
  if (command === "restore" && (!options.targetDatabase || !options.targetFilesRoot)) {
    throw new Error("restore requires --target-database <new-file> and --target-files-root <new-directory>.");
  }
  return { command, options };
}

/** @param {unknown} value */
function printJson(value) {
  console.log(JSON.stringify(value, null, 2));
}

export { parseCli };
