import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  inspectWorkspaceBackupPackage,
  restoreWorkspaceBackupPackage,
} from "../src/services/workspace-backup-package.js";

const scriptPath = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(scriptPath), "..");
const packageJson = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8"));

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  try {
    await main(process.argv.slice(2));
  } catch (error) {
    console.error(error?.message || error);
    process.exitCode = 1;
  }
}

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

function parseCli(args) {
  const command = args.shift();
  if (!new Set(["inspect", "restore"]).has(command)) {
    throw new Error("Usage: node scripts/workspace-backup.mjs <inspect|restore> --archive <path> [options]");
  }
  const options = {};
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
      options[booleanFlags.get(argument)] = true;
    } else if (valueFlags.has(argument)) {
      const value = args[++index];
      if (!value || value.startsWith("--")) throw new Error(`${argument} requires a value.`);
      options[valueFlags.get(argument)] = value;
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

function printJson(value) {
  console.log(JSON.stringify(value, null, 2));
}

export { parseCli };
