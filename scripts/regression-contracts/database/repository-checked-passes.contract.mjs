export const regressionMeta = Object.freeze({
  id: "database.repository-checked-passes",
  area: "database",
  tier: "focused",
  tags: ["contracts", "database", "permissions", "repositories", "typecheck"],
  description: "Proves the bounded credential/session, permission/audit/activity, and workspace-lifecycle repository passes remain exact, checked, projected, and migration-free.",
  runMode: "static",
});

import assert from "node:assert/strict";
import fs from "node:fs/promises";

const passManifest = JSON.parse(await fs.readFile("scripts/typecheck-repository-passes.json", "utf8"));
const seamInventory = JSON.parse(await fs.readFile("scripts/typecheck-seam-inventory.json", "utf8"));
const expectedPasses = {
  "credential-session": [
    "src/repositories/api-keys.repo.js",
    "src/repositories/sessions.repo.js",
    "src/repositories/support-sessions.repo.js",
  ],
  "permission-audit-activity": [
    "src/repositories/audit-logs.repo.js",
    "src/repositories/notifications.repo.js",
    "src/repositories/permissions.repo.js",
    "src/repositories/tags.repo.js",
  ],
  "workspace-lifecycle": [
    "src/repositories/app-settings.repo.js",
    "src/repositories/user-workspaces.repo.js",
    "src/repositories/workspace-backup-exports.repo.js",
    "src/repositories/workspace-deletion-lifecycle.repo.js",
    "src/repositories/workspace-purge.repo.js",
  ],
};

assert.equal(passManifest.schemaVersion, 1);
assert.deepEqual(passManifest.passes.map((pass) => pass.id), Object.keys(expectedPasses));
const recordedPaths = [];
for (const pass of passManifest.passes) {
  assert.deepEqual(pass.paths, expectedPasses[pass.id], `${pass.id} repository paths drifted`);
  assert.deepEqual(pass.paths, [...pass.paths].sort(), `${pass.id} repository paths must stay sorted`);
  recordedPaths.push(...pass.paths);
}
assert.equal(new Set(recordedPaths).size, recordedPaths.length, "repository passes must not overlap");

for (const filePath of recordedPaths) {
  assert.ok(seamInventory.checkedFiles.includes(filePath), `${filePath} must stay in the checked seam inventory`);
  const source = await fs.readFile(filePath, "utf8");
  assert.match(source, /^\/\/ @ts-check/, `${filePath} must stay checked`);
  assert.match(source, /DatabaseRow/, `${filePath} must project rows from the unknown-valued database base`);
  assert.match(source, /@typedef \{DatabaseRow &/, `${filePath} must retain a named row projection`);
  assert.doesNotMatch(source, /@ts-(?:ignore|expect-error)|\bany\b|as unknown as/, `${filePath} must not suppress or guess through the checked boundary`);
  assert.doesNotMatch(source, /\b(?:CREATE|ALTER|DROP)\s+TABLE\b/i, `${filePath} must not absorb schema migration work`);
}

for (const filePath of [
  "src/repositories/api-keys.repo.js",
  "src/repositories/app-settings.repo.js",
  "src/repositories/sessions.repo.js",
  "src/repositories/support-sessions.repo.js",
  "src/repositories/user-workspaces.repo.js",
  "src/repositories/workspace-backup-exports.repo.js",
  "src/repositories/workspace-deletion-lifecycle.repo.js",
]) {
  const source = await fs.readFile(filePath, "utf8");
  assert.match(source, /\| null/, `${filePath} must retain explicit nullable-read evidence`);
}

for (const filePath of ["src/repositories/sessions.repo.js", "src/repositories/support-sessions.repo.js", "src/repositories/workspace-purge.repo.js"]) {
  const source = await fs.readFile(filePath, "utf8");
  assert.match(source, /TransactionClient/, `${filePath} must retain explicit transaction-client authority`);
}

console.log("Bounded checked repository passes regression passed.");
// Consolidated under database.current-static-contracts by 0.33.33.11.
