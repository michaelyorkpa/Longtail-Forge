export const regressionMeta = Object.freeze({
  id: "database.workspace-backup-package",
  area: "database",
  tier: "release-gate",
  tags: ["backup", "files", "permissions", "restore", "security", "workspaces"],
  description: "Proves one-workspace backup isolation, credential/key exclusion, provider-normalized Files, checksums, and disposable restore.",
  runMode: "isolated-database",
});

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import { parseCli } from "../../workspace-backup.mjs";

const packageJson = JSON.parse(await fs.readFile("package.json", "utf8"));
const packageSource = await fs.readFile("src/services/workspace-backup-package.js", "utf8");
const serviceSource = await fs.readFile("src/services/workspace-backups.service.js", "utf8");
const settingsSource = await fs.readFile("public/js/shared/settings-host.js", "utf8");

for (const scriptName of ["workspace-backup:inspect", "workspace-backup:restore", "workspace-backup:drill"]) {
  assert.ok(packageJson.scripts[scriptName], `${scriptName} should be independently runnable`);
}
assert.match(packageSource, /credentialsIncluded:\s*false[\s\S]*masterKeyIncluded:\s*false/);
assert.match(packageSource, /DELETE FROM users WHERE user_id NOT IN[\s\S]*user_status = 'inactive'[\s\S]*protected_user = 'no'/);
assert.match(packageSource, /cross-workspace rows[\s\S]*foreign_key_check/);
assert.match(packageSource, /readFileObject[\s\S]*storage_provider = 'local'/);
assert.match(serviceSource, /isWorkspaceAdministrator/);
assert.match(serviceSource, /workspace_backup_requested[\s\S]*workspace_backup_created[\s\S]*workspace_backup_failed/);
assert.match(settingsSource, /Create Workspace Backup/);
assert.match(settingsSource, /never includes the Secure Notes master key/);
assert.equal(parseCli(["inspect", "--archive", "workspace.tgz"]).command, "inspect");
assert.throws(() => parseCli(["restore", "--archive", "workspace.tgz"]), /target-database.*target-files-root/i);

const result = spawnSync(process.execPath, ["scripts/workspace-backup-drill.mjs"], {
  cwd: process.cwd(),
  encoding: "utf8",
  env: process.env,
});
assert.equal(result.status, 0, String(result.stderr || result.stdout || result.error));
assert.match(result.stdout, /Workspace backup disposable restore drill passed/);

console.log("Workspace backup package regression passed.");
