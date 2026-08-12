export const regressionMeta = Object.freeze({
  id: "database.backup-archive-portability",
  area: "database",
  tier: "focused",
  tags: ["backup", "cross-platform", "restore", "security"],
  description: "Proves Windows drive-letter archive paths become local basename operands without changing backup or restore archive semantics.",
  runMode: "static",
});

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { buildLocalTarArchiveCommand } from "../../../src/core/tar-archive-command.js";

assert.throws(() => buildLocalTarArchiveCommand({ archivePath: "", flags: "-tzf" }), /archive file path/);

const windowsArchive = "C:\\ProgramData\\Longtail Forge\\backups\\instance backup.tgz";
for (const flags of ["-czf", "-xzf", "-tzf", "-tvzf"]) {
  const invocation = buildLocalTarArchiveCommand({
    archivePath: windowsArchive,
    flags,
    pathApi: path.win32,
    trailingArgs: flags === "-czf" ? ["-C", "C:\\staging", "longtail-forge-backup"] : [],
  });
  assert.equal(invocation.cwd, "C:\\ProgramData\\Longtail Forge\\backups");
  assert.equal(invocation.args[0], flags);
  assert.equal(invocation.args[1], "instance backup.tgz");
  assert.doesNotMatch(invocation.args[1], /:/, "the tar archive operand must not contain a Windows drive colon");
}

const posixInvocation = buildLocalTarArchiveCommand({
  archivePath: "/var/lib/longtail-forge/backups/instance.tgz",
  flags: "-tzf",
  pathApi: path.posix,
});
assert.deepEqual(posixInvocation, {
  args: ["-tzf", "instance.tgz"],
  cwd: "/var/lib/longtail-forge/backups",
});

const instanceBackupSource = await fs.readFile("scripts/lib/backup-archive.mjs", "utf8");
const workspaceBackupSource = await fs.readFile("src/services/workspace-backup-package.js", "utf8");
const backupDrillSource = await fs.readFile("scripts/backup-restore-drill.mjs", "utf8");
for (const [label, source] of [
  ["whole-instance backup", instanceBackupSource],
  ["workspace backup", workspaceBackupSource],
]) {
  assert.match(source, /runLocalTarArchiveCommand/,
    `${label} should use the shared local-archive command boundary`);
  assert.doesNotMatch(source, /spawnSync\("tar"/,
    `${label} should not bypass the shared local-archive command boundary`);
  for (const flags of ["-czf", "-xzf", "-tzf", "-tvzf"]) {
    assert.match(source, new RegExp(`runTar\\([^\\n]+"${flags.replace("-", "\\-")}"`),
      `${label} should route ${flags} through the portable archive operand`);
  }
}

assert.match(
  backupDrillSource,
  /runLocalTarArchiveCommand/,
  "the destructive restore drill should reuse the production local-archive command boundary",
);
assert.doesNotMatch(
  backupDrillSource,
  /spawnSync\("tar"/,
  "the backup drill must not restore a direct absolute archive operand",
);
assert.match(
  backupDrillSource,
  /runTar\(sourceArchive, "-xzf", \["-C", relativeTarDirectoryOperand\(sourceArchive, tamperWorkspace\)\]\)/,
  "tamper extraction should use local archive and staging operands",
);
assert.match(
  backupDrillSource,
  /runTar\(outputArchive, "-czf", \["-C", relativeTarDirectoryOperand\(outputArchive, tamperWorkspace\), "longtail-forge-backup"\]\)/,
  "tamper repacking should use a local archive basename without changing the archive root",
);
assert.match(
  backupDrillSource,
  /function relativeTarDirectoryOperand[\s\S]*path\.relative[\s\S]*split\(path\.sep\)\.join\("\/"\)/,
  "the drill should supply tar a relative forward-slash staging directory on Windows and POSIX",
);

console.log("Backup archive portability regression passed.");
