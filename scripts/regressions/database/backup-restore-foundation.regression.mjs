export const regressionMeta = Object.freeze({
  id: "database.backup-restore-foundation",
  area: "database",
  tier: "release-gate",
  tags: ["backup", "files", "restore", "security", "sqlite"],
  description: "Proves the versioned SQLite plus Files backup format, Secure Notes prerequisite, destructive restore safeguards, and disposable restore drill.",
  runMode: "isolated-database",
});

import assert from "node:assert/strict";
import { requirePackageManifest, requireScripts } from "../../test-support/package-manifest-assertions.mjs";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import { parseCli } from "../../backup.mjs";
import {
  REQUIRED_DESTRUCTIVE_CONFIRMATION,
  isSafeArchivePath,
  validateTarEntries,
} from "../../lib/backup-archive.mjs";

const packageJson = requirePackageManifest(JSON.parse(await fs.readFile("package.json", "utf8")));
const backupSource = await fs.readFile("scripts/lib/backup-archive.mjs", "utf8");
const cliSource = await fs.readFile("scripts/backup.mjs", "utf8");

for (const scriptName of ["backup:create", "backup:inspect", "backup:export", "backup:restore", "backup:drill"]) {
  assert.ok(requireScripts(packageJson)[scriptName], `${scriptName} should be independently runnable`);
}
assert.match(backupSource, /masterKeyIncluded:\s*false/);
assert.match(backupSource, /recoveryPrerequisiteRequired/);
assert.match(backupSource, /integrity_check/);
assert.match(backupSource, /instance_backup_created/);
assert.match(backupSource, /instance_backup_restored/);
assert.match(backupSource, /backup_exported/);
assert.match(backupSource, /preRestoreBackupPath/);
assert.match(backupSource, /restrictDirectory\(stagedFiles\)/);
assert.match(backupSource, /--confirm-stopped/);
assert.match(backupSource, /--confirm-destructive/);
assert.match(cliSource, /Start the app, then verify \/readyz, \/api\/app-info, schema identity, login, Files, and Secure Notes/);
assert.equal(isSafeArchivePath("files/workspace/object.bin"), true);
for (const unsafePath of ["../escape", "/absolute", "C:/drive", "files\\escape", "files/../escape", "files//escape"]) {
  assert.equal(isSafeArchivePath(unsafePath), false, `${unsafePath} should be rejected`);
}
assert.throws(
  () => validateTarEntries([{ name: "longtail-forge-backup/../escape", type: "-" }]),
  /unsafe|unexpected/i,
);
assert.throws(
  () => validateTarEntries([{ name: "longtail-forge-backup/link", type: "l" }]),
  /link|unsupported/i,
);
assert.equal(
  parseCli(["restore", "--archive", "backup.tgz", "--pre-restore-backup", "before.tgz"]).command,
  "restore",
);
assert.throws(() => parseCli(["restore", "--archive", "backup.tgz"]), /pre-restore-backup/i);
assert.equal(REQUIRED_DESTRUCTIVE_CONFIRMATION, "RESTORE LONGTAIL FORGE BACKUP");

const result = spawnSync(process.execPath, ["scripts/backup-restore-drill.mjs"], {
  cwd: process.cwd(),
  encoding: "utf8",
  env: process.env,
});
assert.equal(result.status, 0, String(result.stderr || result.stdout || result.error));
assert.match(result.stdout, /Backup\/restore drill passed/);

console.log("Backup/restore foundation regression passed.");
