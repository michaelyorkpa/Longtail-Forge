export const regressionMeta = Object.freeze({
  id: "release.deploy-maintenance-curtain",
  area: "release",
  tier: "release-gate",
  tags: ["compose", "deployment", "maintenance", "recovery", "security"],
  description: "Proves Compose deploy and rollback keep the reviewed maintenance curtain active, retain whole-state recovery evidence, and reopen only after exact immutable verification.",
  runMode: "static",
});

import assert from "node:assert/strict";
import fs from "node:fs/promises";

const [helper, environment, previewDeployment, internetDeployment, containerSmoke] = await Promise.all([
  fs.readFile("scripts/release/longtail-forge-compose-deploy-host.example", "utf8"),
  fs.readFile("docs/longtail-forge-compose-deploy-helper.env.example", "utf8"),
  fs.readFile("docs/preview-deployment.md", "utf8"),
  fs.readFile("docs/internet-deployment.md", "utf8"),
  fs.readFile("scripts/container-deployment-smoke.mjs", "utf8"),
]);

for (const requirement of [
  /MAINTENANCE_STATE_ROOT="\$\{LTF_MAINTENANCE_STATE_ROOT:-\/var\/lib\/longtail-forge-maintenance\}"/,
  /DEPLOYMENT_MARKER="\$MAINTENANCE_STATE_ROOT\/deployment\/maintenance\.on"/,
  /assert_marker/,
  /clear_marker/,
  /backup_with_state/,
  /restore_with_state/,
  /verify_container_posture/,
  /verify_runtime/,
  /LONGTAIL_RELEASE_BRANCH=main/,
  /only protected main release metadata is accepted/,
  /image reference must be digest-addressed/,
  /pre-upgrade-\$OPERATION_ID\.ltfbackup\.tgz/,
  /pre-rollback-\$OPERATION_ID\.ltfbackup\.tgz/,
  /candidate and verified recovery did not complete; deployment marker and protected evidence remain/,
  /rollback and current-state recovery failed; deployment marker and all protected evidence remain/,
]) assert.match(helper, requirement);

const deployStart = helper.lastIndexOf("\nassert_marker\n", helper.indexOf('if test "$MODE" = "deploy"'));
const deployEnd = helper.indexOf('test -f "$CURRENT_STATE" || fail "rollback requires a recorded current release"');
const deployBranch = helper.slice(deployStart, deployEnd);
for (const [earlier, later, label] of [
  ["assert_marker", "backup_with_state", "deploy marker before backup"],
  ["backup_with_state", 'compose "$RELEASE_ENV" up -d', "backup before candidate start"],
  ['compose "$RELEASE_ENV" up -d', 'verify_runtime "$METADATA"', "candidate start before identity proof"],
  ['verify_runtime "$METADATA"', "clear_marker", "identity proof before reopening"],
]) {
  assert.ok(deployBranch.indexOf(earlier) >= 0 && deployBranch.lastIndexOf(later) > deployBranch.indexOf(earlier), label);
}

const rollbackBranch = helper.slice(helper.indexOf('test -f "$PREVIOUS_STATE"'));
for (const [earlier, later, label] of [
  ["backup_with_state", "restore_with_state", "current backup before target restore"],
  ["restore_with_state", 'verify_runtime "$METADATA"', "target restore before identity proof"],
  ['verify_runtime "$METADATA"', "clear_marker", "rollback identity proof before reopening"],
]) {
  assert.ok(rollbackBranch.indexOf(earlier) >= 0 && rollbackBranch.lastIndexOf(later) > rollbackBranch.indexOf(earlier), label);
}

assert.doesNotMatch(helper, /systemctl|longtail-forge\.service|\/opt\/longtail-forge\/current/);
assert.doesNotMatch(helper, /trap .*clear_marker|trap .* EXIT/);
assert.match(environment, /LTF_MAINTENANCE_STATE_ROOT=\/var\/lib\/longtail-forge-maintenance/);
assert.match(environment, /never changes the operator marker/);
assert.match(previewDeployment, /deployment-owned maintenance marker/i);
assert.match(previewDeployment, /failed restore, startup, identity, or workflow check stays curtained/i);
assert.match(internetDeployment, /Keep both public and private proxies running/i);
assert.match(containerSmoke, /verifyMaintenanceCurtain/);
assert.match(containerSmoke, /restoreBackup\(previous\.image, recoveryVolume\)/);
assert.match(containerSmoke, /verifyDatabaseIntegrity/);

console.log("Compose deployment maintenance-curtain regression passed.");
