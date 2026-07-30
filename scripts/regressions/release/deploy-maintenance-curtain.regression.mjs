export const regressionMeta = Object.freeze({
  id: "release.deploy-maintenance-curtain",
  area: "release",
  tier: "release-gate",
  tags: ["bare-metal", "deployment", "maintenance", "security"],
  description: "Proves privileged deploy and rollback operations keep Caddy active, retain protected recovery evidence, and reopen only after exact verification.",
  runMode: "static",
});

import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fsNative from "node:fs";
import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { assertRoadmapCursorAtLeast } from "../../lib/roadmap-cursor.mjs";

const helperPath = "scripts/release/longtail-forge-deploy-host.example";
const environmentPath = "docs/longtail-forge-deploy-helper.env.example";
const [helper, environment, previewDeployment, internetDeployment, roadmapArchive, changelog] = await Promise.all([
  fs.readFile(helperPath, "utf8"),
  fs.readFile(environmentPath, "utf8"),
  fs.readFile("docs/preview-deployment.md", "utf8"),
  fs.readFile("docs/internet-deployment.md", "utf8"),
  fs.readFile("ROADMAP-ARCHIVE.md", "utf8"),
  fs.readFile("CHANGELOG.md", "utf8"),
]);

for (const requirement of [
  /LTF_MAINTENANCE_STATE_ROOT/,
  /MAINTENANCE_STATE_ROOT="\$\{LTF_MAINTENANCE_STATE_ROOT:-\/var\/lib\/longtail-forge-maintenance\}"/,
  /DEPLOYMENT_MAINTENANCE_MARKER="\$DEPLOYMENT_MAINTENANCE_DIR\/maintenance\.on"/,
  /require_separate_trees "\$MAINTENANCE_STATE_ROOT" "\$DEPLOY_ROOT"/,
  /require_directory_layout "\$MAINTENANCE_STATE_ROOT" "\$ROOT_UID" "\$ROOT_GID" "711" "maintenance state root"/,
  /operator maintenance state must be root-owned, non-root-group controlled, and mode 2771/,
  /require_directory_layout "\$DEPLOYMENT_MAINTENANCE_DIR" "\$ROOT_UID" "\$ROOT_GID" "711" "deployment maintenance state"/,
  /validate_marker_file "\$OPERATOR_MAINTENANCE_MARKER" "\*" "\$operator_group_id" "664" "operator maintenance marker"/,
  /validate_marker_file "\$DEPLOYMENT_MAINTENANCE_MARKER" "\$ROOT_UID" "\$ROOT_GID" "644" "deployment maintenance marker"/,
  /marker is content-free and must be readable by Caddy's secure file/,
  /umask 0022/,
  /must not be a symbolic link/,
  /set -o noclobber/,
  /deployment maintenance marker: on \(already active\)/,
  /deployment maintenance marker disappeared before verified reopening/,
  /deployment maintenance marker: off after verified reopening/,
  /systemctl is-active --quiet "\$EDGE_SERVICE"/,
  /stop_application_for_deploy\(\)[\s\S]*systemctl stop "\$APP_SERVICE"/,
  /start_application_for_deploy\(\)[\s\S]*systemctl start "\$APP_SERVICE"[\s\S]*127\.0\.0\.1:8001\/readyz/,
  /inspect_identity[\s\S]*"\$PUBLIC_URL\/healthz"[\s\S]*"\$PUBLIC_URL\/readyz"/,
  /inspect_identity\(\) \{[\s\S]*node --input-type=module -e[\s\S]*const response = await fetch/,
  /' "\$1" "\$PUBLIC_URL" \|\| return 1[\s\S]*healthz" >\/dev\/null \|\| return 1[\s\S]*readyz" >\/dev\/null \|\| return 1/,
  /OPERATIONS_DIR="\$DEPLOY_ROOT\/operations"/,
  /LATEST_OPERATION_FILE="\$DEPLOY_ROOT\/deployment-operation\.json"/,
  /markerOwner: "deployment"/,
  /triggerReasonClass/,
  /startedAt:[\s\S]*endedAt:[\s\S]*candidate:[\s\S]*recovery:[\s\S]*outcome:/,
  /recoveryBackup:/,
  /trap 'handle_deploy_signal HUP' HUP/,
  /trap 'handle_deploy_signal INT' INT/,
  /trap 'handle_deploy_signal TERM' TERM/,
  /prior_backup_restore_failed/,
  /current_release_recovery_failed/,
  /if \[\[ -e "\$APP_ROOT\/current" \|\| -L "\$APP_ROOT\/current" \]\]; then[\s\S]*current release selector must be a symbolic link[\s\S]*current release selector is unresolved/,
]) {
  assert.match(helper, requirement);
}

const deployBranch = helper.slice(helper.indexOf('if [[ "$operation" == "deploy" ]]'));
for (const [earlier, later, label] of [
  ["artifact checksum mismatch", "release metadata mismatch", "checksum before metadata"],
  ["release metadata mismatch", "tar --no-same-owner", "metadata before extraction"],
  ["tar --no-same-owner", "npm ci --omit=dev", "extraction before dependency installation"],
  ["npm ci --omit=dev", "assert_deployment_maintenance", "installation before the outage curtain"],
  ["assert_deployment_maintenance", "stop_application_for_deploy", "marker before application stop"],
  ["stop_application_for_deploy", "backup_current", "application stop before upgrade backup"],
  ["start_application_for_deploy", "inspect_identity", "direct readiness before public identity"],
  ["inspect_identity", "fs.writeFileSync", "public verification before state write"],
]) {
  const earlierIndex = deployBranch.indexOf(earlier);
  const laterIndex = deployBranch.indexOf(later);
  assert.ok(earlierIndex >= 0 && laterIndex > earlierIndex, `${label} order should remain explicit`);
}
assert.ok(
  deployBranch.lastIndexOf("clear_deployment_maintenance") > deployBranch.indexOf("fs.writeFileSync"),
  "the normal successful state write should precede reopening",
);
assert.doesNotMatch(
  helper.match(/stop_application_for_deploy\(\) \{[\s\S]*?\n\}/)?.[0] || "",
  /EDGE_SERVICE/,
  "the normal deployment stop must leave Caddy active",
);
assert.doesNotMatch(
  helper.match(/clear_deployment_maintenance\(\) \{[\s\S]*?\n\}/)?.[0] || "",
  /OPERATOR_MAINTENANCE_MARKER/,
  "verified reopening must clear only the deployment marker",
);
assert.doesNotMatch(helper, /trap .*clear_deployment_maintenance/, "exit and signals must not broadly reopen traffic");
assert.doesNotMatch(helper, /trap .* EXIT/, "deployment failure handling must not use an EXIT trap that could reopen traffic");

const rollbackBranch = helper.slice(helper.indexOf('[[ -f "$STATE_FILE" ]] || fail "deployment state is missing"'));
const normalRollbackBranch = rollbackBranch.slice(rollbackBranch.indexOf('\nrollback_json="$(node -e'));
for (const [earlier, later, label] of [
  ["assert_deployment_maintenance", 'write_operation_state "application_stop"', "rollback marker before application stop"],
  ['write_operation_state "application_stop"', "backup_current", "rollback application stop before current-state backup"],
  ["backup_current", 'write_operation_state "rollback_restore"', "current-state backup before previous-state restore"],
  ['write_operation_state "rollback_verification"', "fs.writeFileSync", "rollback identity verification before deployment-state swap"],
  ["fs.writeFileSync", 'write_operation_state "rollback_verified"', "deployment-state swap before successful rollback evidence"],
  ['write_operation_state "rollback_verified"', "clear_deployment_maintenance", "successful rollback evidence before reopening"],
]) {
  const earlierIndex = normalRollbackBranch.indexOf(earlier);
  const laterIndex = later === "clear_deployment_maintenance"
    ? normalRollbackBranch.lastIndexOf(later)
    : normalRollbackBranch.indexOf(later);
  assert.ok(earlierIndex >= 0 && laterIndex > earlierIndex, `${label} order should remain explicit`);
}
assert.doesNotMatch(
  rollbackBranch,
  /systemctl (?:stop|start) "\$EDGE_SERVICE"/,
  "normal and failed rollback handling must keep Caddy active",
);
assert.match(rollbackBranch, /retry_after_interrupted_rollback/);
assert.match(rollbackBranch, /stale_deployment_marker/);
assert.match(rollbackBranch, /current_backup_restore_failed/);
assert.match(rollbackBranch, /rollback_candidate_(?:start|identity)_failed/);

assert.match(environment, /LTF_MAINTENANCE_STATE_ROOT=\/var\/lib\/longtail-forge-maintenance/);
assert.match(environment, /never changes the operator marker/);
assert.match(previewDeployment, /deployment marker/i);
assert.match(previewDeployment, /\/var\/lib\/longtail-forge-deploy\/operations\//);
assert.match(previewDeployment, /same candidate named by the protected active operation/i);
assert.match(previewDeployment, /`HUP`, `INT`, and `TERM` record an interrupted outcome/i);
assert.match(previewDeployment, /pre-rollback current-state backup/i);
assert.match(previewDeployment, /marker left after an already-recorded state swap/i);
assert.match(internetDeployment, /Keep both public and private proxies running/i);

if (process.platform === "linux") {
  await runPrivilegedSuccessHarness();
}

assertRoadmapCursorAtLeast(["0", "33", "24", "4"].join("."), "successful deployment curtain closeout");
assert.match(roadmapArchive, /^## Version 0\.33\.24\.3 - Successful deployment curtain and verified reopening$/m);
assert.match(roadmapArchive, /0\.33\.24\.3[\s\S]*- \[x\] Added a disposable privileged-helper harness/);
assert.match(changelog, /^## Version 0\.33\.24\.3 - 2026-07-28$/m);
assertRoadmapCursorAtLeast(["0", "33", "24", "5"].join("."), "failed deployment recovery closeout");
assert.match(roadmapArchive, /^## Version 0\.33\.24\.4 - Failed-deployment recovery and protected operation state$/m);
assert.match(roadmapArchive, /0\.33\.24\.4[\s\S]*- \[x\] Added failure-injection coverage/);
assert.match(changelog, /^## Version 0\.33\.24\.4 - 2026-07-28$/m);
assertRoadmapCursorAtLeast(["0", "33", "24", "6"].join("."), "rollback curtain closeout");
assert.match(roadmapArchive, /^## Version 0\.33\.24\.5 - Rollback curtain, failed-rollback recovery, and stale-state handling$/m);
assert.match(roadmapArchive, /0\.33\.24\.5[\s\S]*- \[x\] Extended the privileged-helper harness/);
assert.match(changelog, /^## Version 0\.33\.24\.5 - 2026-07-28$/m);

console.log("Deployment maintenance-curtain deploy and rollback regression passed.");

async function runPrivilegedSuccessHarness() {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-deploy-maintenance-"));
  let publicServer;
  try {
    const identity = run("bash", ["-lc", "printf '%s\\n%s\\n%s\\n%s\\n' \"$(id -u)\" \"$(id -g)\" \"$(id -un)\" \"$(id -gn)\""]);
    const [uid, gid, userName, groupName] = identity.stdout.trim().split("\n");
    assert.match(uid, /^\d+$/);
    assert.match(gid, /^\d+$/);
    assert.match(userName, /^[a-z_][a-z0-9_-]*$/);
    assert.match(groupName, /^[a-z_][a-z0-9_-]*$/);

    const configDir = path.join(rootDir, "etc");
    const configPath = path.join(configDir, "deploy-helper.env");
    const executablePath = path.join(rootDir, "longtail-forge-deploy");
    const shimsDir = path.join(rootDir, "shims");
    const appRoot = path.join(rootDir, "app");
    const dataRoot = path.join(rootDir, "data");
    const deployRoot = path.join(rootDir, "deploy");
    const inbox = path.join(deployRoot, "inbox");
    const backupRoot = path.join(rootDir, "backups");
    const appEnvironment = path.join(configDir, "longtail-forge.env");
    const releaseEnvironment = path.join(configDir, "release.env");
    const maintenanceRoot = path.join(rootDir, "maintenance");
    const operatorDir = path.join(maintenanceRoot, "operator");
    const deploymentDir = path.join(maintenanceRoot, "deployment");
    const operatorMarker = path.join(operatorDir, "maintenance.on");
    const deploymentMarker = path.join(deploymentDir, "maintenance.on");
    const edgeState = path.join(rootDir, "edge.running");
    const appState = path.join(rootDir, "app.running");
    const expectedIdentityPath = path.join(rootDir, "expected-identity.json");
    const knownGoodIdentityPath = path.join(rootDir, "known-good-identity.json");
    const activeIdentityPath = path.join(rootDir, "active-identity.json");
    const eventLog = path.join(rootDir, "events.log");
    const signalSentPath = path.join(rootDir, "signal-sent");
    let activeRun = "setup";

    await fs.mkdir(maintenanceRoot);
    await Promise.all([
      fs.mkdir(configDir),
      fs.mkdir(shimsDir),
      fs.mkdir(appRoot),
      fs.mkdir(dataRoot),
      fs.mkdir(inbox, { recursive: true }),
      fs.mkdir(backupRoot),
      fs.mkdir(operatorDir),
      fs.mkdir(deploymentDir),
    ]);
    await Promise.all([
      fs.chmod(configDir, 0o700),
      fs.chmod(maintenanceRoot, 0o711),
      fs.chmod(operatorDir, 0o2771),
      fs.chmod(deploymentDir, 0o711),
      fs.writeFile(edgeState, "active\n"),
      fs.writeFile(eventLog, ""),
      fs.writeFile(appEnvironment, "fixture\n"),
    ]);

    const executableSource = helper
      .replace("ROOT_UID=0", `ROOT_UID=${uid}`)
      .replace("ROOT_GID=0", `ROOT_GID=${gid}`)
      .replace(
        '"$operator_group_id" != "$ROOT_GID"',
        '"$operator_group_id" == "$operator_group_id"',
      );
    assert.notEqual(executableSource, helper, "the fixture should replace root identity constants");
    assert.doesNotMatch(
      executableSource,
      /\[\[\s+"\$operator_group_id"\s+!=\s+"\$ROOT_GID"\s+\]\]/,
      "the fixture should adapt the non-root operator-group requirement",
    );
    await fs.writeFile(executablePath, executableSource, { mode: 0o755 });

    const realTar = run("bash", ["-lc", "command -v tar"]).stdout.trim();
    const realCurl = run("bash", ["-lc", "command -v curl"]).stdout.trim();
    await writeShims(shimsDir);

    publicServer = http.createServer((request, response) => {
      const requestPath = new URL(request.url, "http://fixture.invalid").pathname;
      const edgeActive = fsNative.existsSync(edgeState);
      const appActive = fsNative.existsSync(appState);
      const operatorActive = fsNative.existsSync(operatorMarker);
      const deploymentActive = fsNative.existsSync(deploymentMarker);
      const diagnostic = new Set(["/healthz", "/readyz", "/api/app-info"]).has(requestPath);
      let status = 200;
      let body;
      let contentType = "application/json";

      if (!edgeActive) {
        status = 502;
        body = JSON.stringify({ status: "edge_unavailable" });
      } else if (diagnostic) {
        if (!appActive) {
          status = 503;
          body = JSON.stringify({ status: "unavailable" });
        } else if (requestPath === "/healthz") {
          body = JSON.stringify({ status: "ok" });
        } else if (requestPath === "/readyz") {
          body = JSON.stringify({ status: "ready" });
        } else {
          body = fsNative.readFileSync(activeIdentityPath, "utf8");
        }
      } else if (operatorActive || deploymentActive || !appActive) {
        status = 503;
        contentType = "text/html";
        body = "<!doctype html><title>Temporarily unavailable</title><p>Longtail Forge is not available right now.</p>";
      } else {
        contentType = "text/html";
        body = "<!doctype html><title>Longtail Forge</title><p>Application available.</p>";
      }

      fsNative.appendFileSync(
        eventLog,
        `${activeRun}|http|${requestPath}|app=${appActive ? "on" : "off"}|edge=${edgeActive ? "on" : "off"}|operator=${operatorActive ? "on" : "off"}|deployment=${deploymentActive ? "on" : "off"}|status=${status}\n`,
      );
      response.writeHead(status, {
        "cache-control": "no-store",
        "content-type": contentType,
      });
      response.end(body);
    });
    await new Promise((resolve, reject) => {
      publicServer.once("error", reject);
      publicServer.listen(0, "127.0.0.1", resolve);
    });
    const publicUrl = `http://127.0.0.1:${publicServer.address().port}`;

    await fs.writeFile(
      configPath,
      [
        "LTF_APP_SERVICE=longtail-forge-fixture",
        "LTF_EDGE_SERVICE=caddy-fixture",
        `LTF_APP_ACCOUNT=${userName}`,
        `LTF_APP_GROUP=${groupName}`,
        `LTF_APP_ROOT=${toPosixPath(appRoot)}`,
        `LTF_DATA_ROOT=${toPosixPath(dataRoot)}`,
        `LTF_DEPLOY_ROOT=${toPosixPath(deployRoot)}`,
        `LTF_BACKUP_ROOT=${toPosixPath(backupRoot)}`,
        `LTF_APP_ENV=${toPosixPath(appEnvironment)}`,
        `LTF_RELEASE_ENV=${toPosixPath(releaseEnvironment)}`,
        `LTF_DEPLOY_ACCOUNT=${userName}`,
        `LTF_PUBLIC_URL=${publicUrl}`,
        `LTF_MAINTENANCE_STATE_ROOT=${toPosixPath(maintenanceRoot)}`,
        "",
      ].join("\n"),
      { mode: 0o600 },
    );

    const fixtureEnvironment = {
      ...process.env,
      LTF_FIXTURE_ACTIVE_IDENTITY: activeIdentityPath,
      LTF_FIXTURE_APP_STATE: appState,
      LTF_FIXTURE_DEPLOYMENT_MARKER: deploymentMarker,
      LTF_FIXTURE_EDGE_STATE: edgeState,
      LTF_FIXTURE_EVENT_LOG: eventLog,
      LTF_FIXTURE_EXPECTED_IDENTITY: expectedIdentityPath,
      LTF_FIXTURE_KNOWN_GOOD_IDENTITY: knownGoodIdentityPath,
      LTF_FIXTURE_OPERATOR_MARKER: operatorMarker,
      LTF_FIXTURE_PUBLIC_URL: publicUrl,
      LTF_FIXTURE_REAL_CURL: realCurl,
      LTF_FIXTURE_REAL_TAR: realTar,
      LTF_FIXTURE_SIGNAL_SENT: signalSentPath,
      LTF_FIXTURE_APP_ROOT: appRoot,
      LTF_HELPER_ENV: configPath,
      PATH: `${shimsDir}${path.delimiter}${process.env.PATH}`,
    };

    const first = createFixtureRelease("1.0.0", "a".repeat(40), "main");
    activeRun = "first";
    const firstResult = await executeDeployment({
      executablePath,
      fixtureEnvironment: { ...fixtureEnvironment, LTF_FIXTURE_RUN: "first" },
      identity: first,
      inbox,
      rootDir,
      setExpectedIdentity: (value) => fs.writeFile(expectedIdentityPath, JSON.stringify(value)),
    });
    assert.equal(firstResult.code, 0, firstResult.stderr || firstResult.stdout);
    assert.equal(firstResult.observedCurtain, true, "first deployment should visibly hold the curtain while Node is stopped");
    assert.equal(fsNative.existsSync(deploymentMarker), false);
    assert.equal(fsNative.existsSync(operatorMarker), false);
    assert.equal(fsNative.existsSync(edgeState), true);
    assert.equal((await globalThis.fetch(publicUrl)).status, 200);

    await fs.mkdir(path.join(dataRoot, "files"), { recursive: true });
    await fs.writeFile(path.join(dataRoot, "longtail-forge.db"), "fixture database\n");
    await writeMarker(operatorMarker, 0o664);
    assert.equal((await globalThis.fetch(publicUrl)).status, 503);

    const upgrade = createFixtureRelease("1.0.1", "b".repeat(40), "main");
    activeRun = "upgrade";
    const upgradeResult = await executeDeployment({
      executablePath,
      fixtureEnvironment: { ...fixtureEnvironment, LTF_FIXTURE_RUN: "upgrade" },
      identity: upgrade,
      inbox,
      rootDir,
      setExpectedIdentity: (value) => fs.writeFile(expectedIdentityPath, JSON.stringify(value)),
    });
    assert.equal(upgradeResult.code, 0, upgradeResult.stderr || upgradeResult.stdout);
    assert.equal(fsNative.existsSync(deploymentMarker), false);
    assert.equal(fsNative.existsSync(operatorMarker), true, "deployment success must preserve an operator hold");
    assert.equal(fsNative.existsSync(edgeState), true);
    assert.equal((await globalThis.fetch(publicUrl)).status, 503, "the preserved operator hold should keep ordinary traffic curtained");
    await fs.unlink(operatorMarker);
    assert.equal((await globalThis.fetch(publicUrl)).status, 200, "traffic should reopen after the independent operator clears its hold");

    const state = JSON.parse(await fs.readFile(path.join(deployRoot, "deployment-state.json"), "utf8"));
    assert.equal(state.current.canonicalVersion, upgrade.canonicalVersion);
    assert.equal(state.previous.canonicalVersion, first.canonicalVersion);
    assert.match(state.backup, /pre-deploy-.*\.ltfbackup\.tgz$/);
    await fs.access(state.backup);

    await writeMarker(operatorMarker, 0o664);
    await fs.writeFile(expectedIdentityPath, JSON.stringify(state.previous));
    await fs.writeFile(knownGoodIdentityPath, JSON.stringify(state.current));
    activeRun = "rollback-success";
    const rollbackResult = await executeRollback({
      executablePath,
      fixtureEnvironment: { ...fixtureEnvironment, LTF_FIXTURE_RUN: "rollback-success" },
      expectedCommit: state.previous.commitSha,
      rootDir,
    });
    assert.equal(rollbackResult.code, 0, rollbackResult.stderr || rollbackResult.stdout);
    assert.equal(rollbackResult.observedCurtain, true, "rollback should visibly hold the curtain while Node is stopped");
    assert.equal(fsNative.existsSync(deploymentMarker), false);
    assert.equal(fsNative.existsSync(operatorMarker), true, "rollback success must preserve an operator hold");
    assert.equal(fsNative.existsSync(edgeState), true);
    assert.equal((await globalThis.fetch(publicUrl)).status, 503);
    const rolledBackState = JSON.parse(await fs.readFile(path.join(deployRoot, "deployment-state.json"), "utf8"));
    assert.equal(rolledBackState.current.commitSha, state.previous.commitSha);
    assert.equal(rolledBackState.previous.commitSha, state.current.commitSha);
    assert.match(rolledBackState.backup, /pre-rollback-.*\.ltfbackup\.tgz$/);
    await fs.access(rolledBackState.backup);
    await writeMarker(deploymentMarker, 0o644);
    activeRun = "rollback-stale-marker";
    const staleMarkerResult = await executeRollback({
      executablePath,
      fixtureEnvironment: { ...fixtureEnvironment, LTF_FIXTURE_RUN: "rollback-stale-marker" },
      expectedCommit: rolledBackState.current.commitSha,
      rootDir,
    });
    assert.equal(staleMarkerResult.code, 0, staleMarkerResult.stderr || staleMarkerResult.stdout);
    assert.equal(fsNative.existsSync(deploymentMarker), false, "exact identity revalidation should clear a stale deployment marker");
    assert.equal(fsNative.existsSync(operatorMarker), true, "stale-marker recovery must preserve the operator hold");
    await fs.unlink(operatorMarker);
    assert.equal((await globalThis.fetch(publicUrl)).status, 200);

    await fs.writeFile(expectedIdentityPath, JSON.stringify(rolledBackState.previous));
    await fs.writeFile(knownGoodIdentityPath, JSON.stringify(rolledBackState.current));
    activeRun = "rollback-forward";
    const rollbackForwardResult = await executeRollback({
      executablePath,
      fixtureEnvironment: { ...fixtureEnvironment, LTF_FIXTURE_RUN: "rollback-forward" },
      expectedCommit: rolledBackState.previous.commitSha,
      rootDir,
    });
    assert.equal(rollbackForwardResult.code, 0, rollbackForwardResult.stderr || rollbackForwardResult.stdout);
    const restoredUpgradeState = JSON.parse(await fs.readFile(path.join(deployRoot, "deployment-state.json"), "utf8"));
    assert.equal(restoredUpgradeState.current.commitSha, state.current.commitSha);
    assert.equal(restoredUpgradeState.previous.commitSha, state.previous.commitSha);

    const latestOperationPath = path.join(deployRoot, "deployment-operation.json");
    const operationsDir = path.join(deployRoot, "operations");
    let failureVersion = 2;

    const resetKnownGood = async () => {
      const currentState = JSON.parse(await fs.readFile(path.join(deployRoot, "deployment-state.json"), "utf8"));
      const knownGood = currentState.current;
      await fs.rm(path.join(appRoot, "current"), { force: true });
      await fs.symlink(knownGood.releaseDir, path.join(appRoot, "current"), "dir");
      await fs.writeFile(activeIdentityPath, JSON.stringify(knownGood));
      await fs.writeFile(knownGoodIdentityPath, JSON.stringify(knownGood));
      await fs.writeFile(
        releaseEnvironment,
        [
          `LONGTAIL_RELEASE_BRANCH=${knownGood.sourceBranch}`,
          `LONGTAIL_RELEASE_COMMIT=${knownGood.commitSha}`,
          `LONGTAIL_RELEASE_ARTIFACT_SHA256=${knownGood.artifactSha256}`,
          "",
        ].join("\n"),
      );
      await Promise.all([
        fs.writeFile(appState, "active\n"),
        fs.writeFile(edgeState, "active\n"),
        fs.rm(deploymentMarker, { force: true }),
        fs.rm(operatorMarker, { force: true }),
        fs.rm(signalSentPath, { force: true }),
      ]);
      return knownGood;
    };

    const assertProtectedOperation = async ({
      candidate,
      expectedOutcome,
      expectedReason,
      expectedTrigger,
      expectedRecoveryCommit,
      expectedOperation = "deploy",
      expectRecoveryBackup = false,
    }) => {
      const operation = JSON.parse(await fs.readFile(latestOperationPath, "utf8"));
      assert.equal(operation.schemaVersion, 1);
      assert.equal(operation.operation, expectedOperation);
      assert.equal(operation.markerOwner, "deployment");
      assert.equal(operation.outcome, expectedOutcome);
      assert.equal(operation.reasonClass, expectedReason);
      assert.equal(operation.triggerReasonClass, expectedTrigger);
      assert.equal(operation.candidate.canonicalVersion, candidate.canonicalVersion);
      assert.match(operation.startedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
      assert.match(operation.endedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
      if (expectedRecoveryCommit) {
        assert.equal(operation.recovery.commitSha, expectedRecoveryCommit);
      } else {
        assert.equal(operation.recovery, null);
      }
      if (expectRecoveryBackup) {
        assert.match(operation.recoveryBackup, /pre-rollback-.*\.ltfbackup\.tgz$/);
        await fs.access(operation.recoveryBackup);
      }
      for (const protectedPath of [
        latestOperationPath,
        path.join(operationsDir, `${operation.operationId}.json`),
      ]) {
        const stat = await fs.stat(protectedPath);
        assert.equal(stat.mode & 0o777, 0o600);
        assert.equal(stat.uid, Number(uid));
        assert.equal(stat.gid, Number(gid));
      }
      return operation;
    };

    const runFailureScenario = async ({
      name,
      failures,
      expectedOutcome,
      expectedReason,
      expectedTrigger,
      recoverable,
      expectRecoveryIdentity = recoverable,
      operatorHold = false,
      signalAt = "",
      identity,
    }) => {
      const knownGood = await resetKnownGood();
      if (operatorHold) {
        await writeMarker(operatorMarker, 0o664);
      }
      const candidate = identity || createFixtureRelease(
        `1.0.${failureVersion}`,
        String(failureVersion).padStart(40, "c").slice(-40),
        "main",
      );
      failureVersion += 1;
      activeRun = name;
      const result = await executeDeployment({
        executablePath,
        fixtureEnvironment: {
          ...fixtureEnvironment,
          LTF_FIXTURE_FAILURES: failures.join(","),
          LTF_FIXTURE_RUN: name,
          LTF_FIXTURE_SIGNAL_AT: signalAt,
        },
        identity: candidate,
        inbox,
        rootDir,
        setExpectedIdentity: (value) => fs.writeFile(expectedIdentityPath, JSON.stringify(value)),
      });
      assert.notEqual(result.code, 0, `${name} should fail the deployment invocation`);
      assert.equal(fsNative.existsSync(edgeState), true, `${name} should keep Caddy active`);
      assert.equal(fsNative.existsSync(deploymentMarker), !recoverable, `${name} marker outcome`);
      assert.equal(fsNative.existsSync(operatorMarker), operatorHold, `${name} should preserve the operator hold`);
      if (recoverable) {
        assert.equal(fsNative.existsSync(appState), true, `${name} should restore the known-good application`);
        const stateAfter = JSON.parse(await fs.readFile(path.join(deployRoot, "deployment-state.json"), "utf8"));
        assert.equal(stateAfter.current.commitSha, knownGood.commitSha, `${name} should not advance deployment state`);
        assert.equal(
          (await globalThis.fetch(publicUrl)).status,
          operatorHold ? 503 : 200,
          `${name} should reopen only when no operator hold remains`,
        );
      } else {
        assert.equal((await globalThis.fetch(publicUrl)).status, 503, `${name} should remain curtained`);
      }
      const operation = await assertProtectedOperation({
        candidate,
        expectedOutcome,
        expectedReason,
        expectedTrigger,
        expectedRecoveryCommit: expectRecoveryIdentity ? knownGood.commitSha : undefined,
      });
      return { candidate, knownGood, operation, result };
    };

    const runRollbackFailureScenario = async ({
      name,
      failures,
      expectedOutcome,
      expectedReason,
      expectedTrigger,
      recoverable,
      operatorHold = false,
      signalAt = "",
      expectRecoveryBackup = true,
    }) => {
      const knownGood = await resetKnownGood();
      const currentState = JSON.parse(await fs.readFile(path.join(deployRoot, "deployment-state.json"), "utf8"));
      const target = currentState.previous;
      assert.ok(target?.commitSha, `${name} requires a recorded rollback target`);
      await fs.appendFile(
        eventLog,
        `${name}|scenario|current=${knownGood.commitSha}|target=${target.commitSha}\n`,
      );
      await Promise.all([
        fs.writeFile(expectedIdentityPath, JSON.stringify(target)),
        fs.writeFile(knownGoodIdentityPath, JSON.stringify(knownGood)),
      ]);
      if (operatorHold) {
        await writeMarker(operatorMarker, 0o664);
      }
      activeRun = name;
      const result = await executeRollback({
        executablePath,
        fixtureEnvironment: {
          ...fixtureEnvironment,
          LTF_FIXTURE_FAILURES: failures.join(","),
          LTF_FIXTURE_RUN: name,
          LTF_FIXTURE_SIGNAL_AT: signalAt,
        },
        expectedCommit: target.commitSha,
        rootDir,
      });
      const scenarioEvents = (await fs.readFile(eventLog, "utf8"))
        .split(/\r?\n/)
        .filter((event) => event.startsWith(`${name}|`))
        .join("\n");
      assert.notEqual(
        result.code,
        0,
        `${name} should fail the rollback invocation\n${scenarioEvents}`,
      );
      assert.equal(fsNative.existsSync(edgeState), true, `${name} should keep Caddy active`);
      assert.equal(fsNative.existsSync(deploymentMarker), !recoverable, `${name} marker outcome`);
      assert.equal(fsNative.existsSync(operatorMarker), operatorHold, `${name} should preserve the operator hold`);
      if (recoverable) {
        assert.equal(fsNative.existsSync(appState), true, `${name} should restore the pre-rollback current application`);
        const stateAfter = JSON.parse(await fs.readFile(path.join(deployRoot, "deployment-state.json"), "utf8"));
        assert.equal(stateAfter.current.commitSha, knownGood.commitSha, `${name} should not swap deployment state`);
        assert.equal(
          (await globalThis.fetch(publicUrl)).status,
          operatorHold ? 503 : 200,
          `${name} should reopen only when no operator hold remains`,
        );
      } else {
        assert.equal((await globalThis.fetch(publicUrl)).status, 503, `${name} should remain curtained`);
      }
      const protectedOperation = await assertProtectedOperation({
        candidate: target,
        expectedOutcome,
        expectedReason,
        expectedTrigger,
        expectedRecoveryCommit: knownGood.commitSha,
        expectedOperation: "rollback",
        expectRecoveryBackup,
      });
      await fs.access(protectedOperation.backup);
      if (operatorHold) {
        await fs.rm(operatorMarker, { force: true });
      }
      if (!recoverable) {
        activeRun = `${name}-mismatch`;
        const mismatchedRetry = await executeRollback({
          executablePath,
          fixtureEnvironment: {
            ...fixtureEnvironment,
            LTF_FIXTURE_FAILURES: "",
            LTF_FIXTURE_RUN: `${name}-mismatch`,
            LTF_FIXTURE_SIGNAL_AT: "",
          },
          expectedCommit: "f".repeat(40),
          rootDir,
        });
        assert.notEqual(mismatchedRetry.code, 0, `${name} should refuse a different rollback target`);
        assert.equal(fsNative.existsSync(deploymentMarker), true, `${name} mismatch must retain the deployment marker`);
        activeRun = `${name}-retry`;
        const retry = await executeRollback({
          executablePath,
          fixtureEnvironment: {
            ...fixtureEnvironment,
            LTF_FIXTURE_FAILURES: "",
            LTF_FIXTURE_RUN: `${name}-retry`,
            LTF_FIXTURE_SIGNAL_AT: "",
          },
          expectedCommit: target.commitSha,
          rootDir,
        });
        assert.equal(retry.code, 0, retry.stderr || retry.stdout);
        assert.equal(fsNative.existsSync(deploymentMarker), false, `${name} retry should clear only the deployment marker`);
        const retryState = JSON.parse(await fs.readFile(path.join(deployRoot, "deployment-state.json"), "utf8"));
        await Promise.all([
          fs.writeFile(expectedIdentityPath, JSON.stringify(retryState.previous)),
          fs.writeFile(knownGoodIdentityPath, JSON.stringify(retryState.current)),
        ]);
        activeRun = `${name}-restore-forward`;
        const restoreForward = await executeRollback({
          executablePath,
          fixtureEnvironment: {
            ...fixtureEnvironment,
            LTF_FIXTURE_FAILURES: "",
            LTF_FIXTURE_RUN: `${name}-restore-forward`,
            LTF_FIXTURE_SIGNAL_AT: "",
          },
          expectedCommit: retryState.previous.commitSha,
          rootDir,
        });
        assert.equal(restoreForward.code, 0, restoreForward.stderr || restoreForward.stdout);
      }
      return { knownGood, operation: protectedOperation, result, target };
    };

    await runRollbackFailureScenario({
      name: "rollback-backup-failure",
      failures: ["pre-rollback-backup"],
      expectedOutcome: "recovered",
      expectedReason: "pre_rollback_backup_failed",
      expectedTrigger: "pre_rollback_backup_failed",
      recoverable: true,
      expectRecoveryBackup: false,
    });
    await runRollbackFailureScenario({
      name: "rollback-restore-failure",
      failures: ["rollback-restore"],
      expectedOutcome: "recovered",
      expectedReason: "rollback_backup_restore_failed",
      expectedTrigger: "rollback_backup_restore_failed",
      recoverable: true,
    });
    await runRollbackFailureScenario({
      name: "rollback-start-failure",
      failures: ["candidate-start"],
      expectedOutcome: "recovered",
      expectedReason: "rollback_candidate_start_failed",
      expectedTrigger: "rollback_candidate_start_failed",
      recoverable: true,
    });
    await runRollbackFailureScenario({
      name: "rollback-identity-failure",
      failures: ["candidate-identity"],
      expectedOutcome: "recovered",
      expectedReason: "rollback_candidate_identity_failed",
      expectedTrigger: "rollback_candidate_identity_failed",
      recoverable: true,
      operatorHold: true,
    });
    await runRollbackFailureScenario({
      name: "rollback-current-restore-failure",
      failures: ["candidate-identity", "current-restore"],
      expectedOutcome: "failed",
      expectedReason: "current_backup_restore_failed",
      expectedTrigger: "rollback_candidate_identity_failed",
      recoverable: false,
    });
    await runRollbackFailureScenario({
      name: "rollback-current-start-failure",
      failures: ["candidate-identity", "recovery-start"],
      expectedOutcome: "failed",
      expectedReason: "current_release_recovery_failed",
      expectedTrigger: "rollback_candidate_identity_failed",
      recoverable: false,
    });
    for (const [name, signalAt] of [
      ["rollback-signal-application-stop", "application-stop"],
      ["rollback-signal-candidate-start", "candidate-start"],
      ["rollback-signal-recovery-start", "recovery-start"],
    ]) {
      await runRollbackFailureScenario({
        name,
        failures: signalAt === "recovery-start" ? ["candidate-identity"] : [],
        expectedOutcome: "interrupted",
        expectedReason: "signal_TERM",
        expectedTrigger: signalAt === "recovery-start" ? "rollback_candidate_identity_failed" : "none",
        recoverable: false,
        signalAt,
        expectRecoveryBackup: signalAt !== "application-stop",
      });
    }

    await runFailureScenario({
      name: "stop-failure",
      failures: ["application-stop"],
      expectedOutcome: "recovered",
      expectedReason: "application_stop_failed",
      expectedTrigger: "application_stop_failed",
      recoverable: true,
    });
    await runFailureScenario({
      name: "backup-failure",
      failures: ["pre-backup"],
      expectedOutcome: "recovered",
      expectedReason: "pre_backup_failed",
      expectedTrigger: "pre_backup_failed",
      recoverable: true,
    });
    await runFailureScenario({
      name: "candidate-start-failure",
      failures: ["candidate-start"],
      expectedOutcome: "recovered",
      expectedReason: "candidate_start_failed",
      expectedTrigger: "candidate_start_failed",
      recoverable: true,
    });
    await runFailureScenario({
      name: "candidate-identity-failure",
      failures: ["candidate-identity"],
      expectedOutcome: "recovered",
      expectedReason: "candidate_identity_failed",
      expectedTrigger: "candidate_identity_failed",
      recoverable: true,
      operatorHold: true,
    });

    const restoreFailure = await runFailureScenario({
      name: "restore-failure",
      failures: ["candidate-identity", "restore"],
      expectedOutcome: "failed",
      expectedReason: "prior_backup_restore_failed",
      expectedTrigger: "candidate_identity_failed",
      recoverable: false,
    });
    await fs.access(restoreFailure.operation.backup);
    const retryKnownGood = restoreFailure.knownGood;
    activeRun = "restore-failure-retry";
    const retryResult = await executeDeployment({
      executablePath,
      fixtureEnvironment: {
        ...fixtureEnvironment,
        LTF_FIXTURE_FAILURES: "",
        LTF_FIXTURE_RUN: "restore-failure-retry",
        LTF_FIXTURE_SIGNAL_AT: "",
      },
      identity: restoreFailure.candidate,
      inbox,
      rootDir,
      setExpectedIdentity: (value) => fs.writeFile(expectedIdentityPath, JSON.stringify(value)),
    });
    assert.equal(retryResult.code, 0, retryResult.stderr || retryResult.stdout);
    assert.match(retryResult.stdout, /deployment maintenance marker: on \(already active\)/);
    assert.equal(fsNative.existsSync(deploymentMarker), false, "a verified retry should clear the retained deployment hold");
    const retryState = JSON.parse(await fs.readFile(path.join(deployRoot, "deployment-state.json"), "utf8"));
    assert.equal(retryState.previous.commitSha, retryKnownGood.commitSha);
    assert.equal(retryState.current.commitSha, restoreFailure.candidate.commitSha);

    await runFailureScenario({
      name: "recovery-start-failure",
      failures: ["candidate-identity", "recovery-start"],
      expectedOutcome: "failed",
      expectedReason: "current_release_recovery_failed",
      expectedTrigger: "candidate_identity_failed",
      recoverable: false,
      expectRecoveryIdentity: true,
    });
    await runFailureScenario({
      name: "recovery-identity-failure",
      failures: ["candidate-identity", "recovery-identity"],
      expectedOutcome: "failed",
      expectedReason: "current_release_recovery_failed",
      expectedTrigger: "candidate_identity_failed",
      recoverable: false,
      expectRecoveryIdentity: true,
    });

    for (const [name, signalAt, failures] of [
      ["signal-application-stop", "application-stop", []],
      ["signal-candidate-start", "candidate-start", []],
      ["signal-recovery-stop", "recovery-stop", ["candidate-identity"]],
      ["signal-recovery-start", "recovery-start", ["candidate-identity"]],
    ]) {
      await runFailureScenario({
        name,
        failures,
        expectedOutcome: "interrupted",
        expectedReason: "signal_TERM",
        expectedTrigger: failures.includes("candidate-identity") ? "candidate_identity_failed" : "none",
        recoverable: false,
        expectRecoveryIdentity: signalAt === "recovery-start",
        signalAt,
      });
    }
    await resetKnownGood();

    const events = (await fs.readFile(eventLog, "utf8")).trim().split("\n");
    assertSuccessfulOrder(events, "first", { expectBackup: false, installMarker: "off" });
    assertSuccessfulOrder(events, "upgrade", { expectBackup: true, installMarker: "off" });
    assert.equal(
      events.some((event) => /\|systemctl\|(stop|start)\|caddy-fixture\|/.test(event)),
      false,
      "the edge service must remain continuously active on successful deployments",
    );
    assert.ok(
      events.some((event) => /first\|http\|\/\|app=off\|edge=on\|operator=off\|deployment=on\|status=503/.test(event)),
      "the first deployment should show the curtain during stopped-app work",
    );
    assert.ok(
      events.some((event) => /upgrade\|backup-create\|app=off\|edge=on\|deployment=on/.test(event)),
      "the upgrade backup should run only after Node stops while Caddy and the marker remain active",
    );
    assert.ok(
      events.some((event) => /\|http\|\/api\/app-info\|app=on\|edge=on\|operator=(?:on|off)\|deployment=on\|status=200/.test(event)),
      "public candidate identity should be verified through the marker exemption before reopening",
    );
  } finally {
    if (publicServer) {
      await new Promise((resolve) => publicServer.close(resolve));
    }
    if (process.platform !== "win32" && fsNative.existsSync(rootDir)) {
      spawnSync("chmod", ["-R", "u+w", rootDir], { stdio: "ignore" });
    }
    await fs.rm(rootDir, { recursive: true, force: true });
  }
}

async function executeDeployment({
  executablePath,
  fixtureEnvironment,
  identity,
  inbox,
  rootDir,
  setExpectedIdentity,
}) {
  const artifactName = `longtail-forge-${identity.canonicalVersion}.tgz`;
  const metadataName = `longtail-forge-${identity.canonicalVersion}.json`;
  const artifactPath = path.join(inbox, artifactName);
  const metadataPath = path.join(inbox, metadataName);
  const stageRoot = path.join(rootDir, `stage-${identity.canonicalVersion}`);
  const packageRoot = path.join(stageRoot, `longtail-forge-${identity.canonicalVersion}`);
  await fs.mkdir(path.join(packageRoot, "scripts"), { recursive: true });
  await fs.writeFile(path.join(packageRoot, "package.json"), JSON.stringify({
    name: "longtail-forge-fixture",
    version: identity.canonicalVersion,
  }));
  await fs.writeFile(path.join(packageRoot, "scripts", "backup.mjs"), backupStubSource());
  run(fixtureEnvironment.LTF_FIXTURE_REAL_TAR, [
    "-czf",
    artifactPath,
    "-C",
    stageRoot,
    path.basename(packageRoot),
  ]);
  const artifactBytes = await fs.readFile(artifactPath);
  const artifactSha256 = createHash("sha256").update(artifactBytes).digest("hex");
  const expectedIdentity = {
    version: `${identity.canonicalVersion}-${identity.sourceBranch}`,
    canonicalVersion: identity.canonicalVersion,
    sourceBranch: identity.sourceBranch,
    commitSha: identity.commitSha,
    artifactSha256,
  };
  if (
    fsNative.existsSync(fixtureEnvironment.LTF_FIXTURE_APP_STATE)
    && fsNative.existsSync(fixtureEnvironment.LTF_FIXTURE_ACTIVE_IDENTITY)
  ) {
    await fs.copyFile(
      fixtureEnvironment.LTF_FIXTURE_ACTIVE_IDENTITY,
      fixtureEnvironment.LTF_FIXTURE_KNOWN_GOOD_IDENTITY,
    );
  }
  await Promise.all([
    fs.writeFile(`${artifactPath}.sha256`, `${artifactSha256}  ${artifactName}\n`),
    fs.writeFile(metadataPath, JSON.stringify({
      version: identity.canonicalVersion,
      sourceBranch: identity.sourceBranch,
      commitSha: identity.commitSha,
      artifact: { sha256: artifactSha256 },
    })),
    setExpectedIdentity(expectedIdentity),
  ]);

  const child = spawn("bash", [
    executablePath,
    "deploy",
    "--artifact", artifactName,
    "--metadata", metadataName,
    "--expected-version", identity.canonicalVersion,
    "--expected-source-branch", identity.sourceBranch,
    "--expected-commit", identity.commitSha,
    "--expected-sha256", artifactSha256,
  ], {
    cwd: rootDir,
    env: fixtureEnvironment,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const stdout = [];
  const stderr = [];
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => stdout.push(chunk));
  child.stderr.on("data", (chunk) => stderr.push(chunk));
  let exited = false;
  let observedCurtain = false;
  const resultPromise = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => {
      exited = true;
      resolve(code);
    });
  });
  while (!exited) {
    try {
      const response = await globalThis.fetch(new URL("/", fixtureEnvironment.LTF_FIXTURE_PUBLIC_URL));
      observedCurtain ||= response.status === 503;
    } catch {
      // The fixture server owns the useful continuity assertion after completion.
    }
    await delay(20);
  }
  const code = await resultPromise;
  return {
    code,
    observedCurtain,
    stderr: stderr.join(""),
    stdout: stdout.join(""),
  };
}

async function writeMarker(markerPath, mode) {
  await fs.writeFile(markerPath, "");
  await fs.chmod(markerPath, mode);
}

async function executeRollback({
  executablePath,
  fixtureEnvironment,
  expectedCommit,
  rootDir,
}) {
  const child = spawn("bash", [
    executablePath,
    "rollback",
    "--expected-commit", expectedCommit,
  ], {
    cwd: rootDir,
    env: fixtureEnvironment,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const stdout = [];
  const stderr = [];
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => stdout.push(chunk));
  child.stderr.on("data", (chunk) => stderr.push(chunk));
  let exited = false;
  let observedCurtain = false;
  const resultPromise = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => {
      exited = true;
      resolve(code);
    });
  });
  while (!exited) {
    try {
      const response = await globalThis.fetch(new URL("/", fixtureEnvironment.LTF_FIXTURE_PUBLIC_URL));
      observedCurtain ||= response.status === 503;
    } catch {
      // The fixture server owns the useful continuity assertion after completion.
    }
    await delay(20);
  }
  const code = await resultPromise;
  return {
    code,
    observedCurtain,
    stderr: stderr.join(""),
    stdout: stdout.join(""),
  };
}

function createFixtureRelease(canonicalVersion, commitSha, sourceBranch) {
  return { canonicalVersion, commitSha, sourceBranch };
}

function assertSuccessfulOrder(events, runName, options) {
  const selected = events.filter((event) => event.startsWith(`${runName}|`));
  const findIndex = (pattern) => selected.findIndex((event) => pattern.test(event));
  const installIndex = findIndex(new RegExp(`\\|npm-ci\\|deployment=${options.installMarker}`));
  const edgePrecheckIndex = findIndex(/\|systemctl\|is-active\|caddy-fixture\|.*deployment=/);
  const stopIndex = findIndex(/\|systemctl\|stop\|longtail-forge-fixture\|.*deployment=on/);
  const startIndex = findIndex(/\|systemctl\|start\|longtail-forge-fixture\|.*deployment=on/);
  const publicIdentityIndex = findIndex(/\|http\|\/api\/app-info\|.*deployment=on\|status=200/);
  const finalEdgeCheckIndex = selected.findLastIndex((event) => /\|systemctl\|is-active\|caddy-fixture\|.*deployment=on/.test(event));
  assert.ok(installIndex >= 0 && edgePrecheckIndex > installIndex, `${runName}: install should precede the edge precheck`);
  assert.ok(stopIndex > edgePrecheckIndex, `${runName}: the marker should be active before Node stops`);
  assert.ok(startIndex > stopIndex, `${runName}: Node should restart after it stops`);
  assert.ok(publicIdentityIndex > startIndex, `${runName}: public identity should follow direct startup`);
  assert.ok(finalEdgeCheckIndex > publicIdentityIndex, `${runName}: the final edge check should precede marker removal`);
  if (options.expectBackup) {
    const backupIndex = findIndex(/\|backup-create\|app=off\|edge=on\|deployment=on/);
    assert.ok(backupIndex > stopIndex && backupIndex < startIndex, `${runName}: backup should stay inside the stopped-app curtain`);
  }
}

async function writeShims(shimsDir) {
  const scripts = {
    chown: `#!/usr/bin/env bash
exit 0
`,
    install: `#!/usr/bin/env bash
set -euo pipefail
mode=755
target=""
while (($#)); do
  case "$1" in
    -d) shift ;;
    -o|-g) shift 2 ;;
    -m) mode="$2"; shift 2 ;;
    *) target="$1"; shift ;;
  esac
done
mkdir -p -- "$target"
chmod "$mode" -- "$target"
`,
    npm: `#!/usr/bin/env bash
set -euo pipefail
deployment=off
[[ -f "$LTF_FIXTURE_DEPLOYMENT_MARKER" ]] && deployment=on
printf '%s|npm-ci|deployment=%s\\n' "$LTF_FIXTURE_RUN" "$deployment" >> "$LTF_FIXTURE_EVENT_LOG"
`,
    tar: `#!/usr/bin/env bash
set -euo pipefail
deployment=off
[[ -f "$LTF_FIXTURE_DEPLOYMENT_MARKER" ]] && deployment=on
printf '%s|tar|deployment=%s\\n' "$LTF_FIXTURE_RUN" "$deployment" >> "$LTF_FIXTURE_EVENT_LOG"
exec "$LTF_FIXTURE_REAL_TAR" "$@"
`,
    systemctl: `#!/usr/bin/env bash
set -euo pipefail
action="$1"
service="\${3:-\${2:-}}"
has_failure() {
  case ",\${LTF_FIXTURE_FAILURES:-}," in
    *",$1,"*) return 0 ;;
    *) return 1 ;;
  esac
}
current_target="$(readlink -f "$LTF_FIXTURE_APP_ROOT/current" 2>/dev/null || true)"
candidate_commit="$(node -e 'const fs=require("node:fs"); const value=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); process.stdout.write(value.commitSha)' "$LTF_FIXTURE_EXPECTED_IDENTITY" 2>/dev/null || true)"
candidate=off
[[ -n "$candidate_commit" && "$current_target" == *"$candidate_commit"* ]] && candidate=on
signal_once() {
  local phase="$1"
  if [[ "\${LTF_FIXTURE_SIGNAL_AT:-}" == "$phase" && ! -e "$LTF_FIXTURE_SIGNAL_SENT" ]]; then
    : > "$LTF_FIXTURE_SIGNAL_SENT"
    kill -TERM "$PPID"
    /bin/sleep 0.1
  fi
}
deployment=off
[[ -f "$LTF_FIXTURE_DEPLOYMENT_MARKER" ]] && deployment=on
printf '%s|systemctl|%s|%s|candidate=%s|deployment=%s\\n' "$LTF_FIXTURE_RUN" "$action" "$service" "$candidate" "$deployment" >> "$LTF_FIXTURE_EVENT_LOG"
case "$action:$service" in
  is-active:caddy-fixture)
    [[ -f "$LTF_FIXTURE_EDGE_STATE" ]]
    ;;
  stop:longtail-forge-fixture)
    if [[ "$candidate" == "on" ]]; then
      signal_once recovery-stop
    else
      signal_once application-stop
      has_failure application-stop && exit 1
    fi
    rm -f -- "$LTF_FIXTURE_APP_STATE"
    /bin/sleep 0.2
    ;;
  start:longtail-forge-fixture)
    if [[ "$candidate" == "on" ]]; then
      signal_once candidate-start
      has_failure candidate-start && exit 1
      if has_failure candidate-identity; then
        cp -- "$LTF_FIXTURE_KNOWN_GOOD_IDENTITY" "$LTF_FIXTURE_ACTIVE_IDENTITY"
      else
        cp -- "$LTF_FIXTURE_EXPECTED_IDENTITY" "$LTF_FIXTURE_ACTIVE_IDENTITY"
      fi
      active_commit="$(node -e 'const fs=require("node:fs"); process.stdout.write(JSON.parse(fs.readFileSync(process.argv[1],"utf8")).commitSha)' "$LTF_FIXTURE_ACTIVE_IDENTITY")"
      printf '%s|identity|candidate|commit=%s|failures=%s\\n' "$LTF_FIXTURE_RUN" "$active_commit" "\${LTF_FIXTURE_FAILURES:-}" >> "$LTF_FIXTURE_EVENT_LOG"
    else
      signal_once recovery-start
      has_failure recovery-start && exit 1
      if has_failure recovery-identity; then
        cp -- "$LTF_FIXTURE_EXPECTED_IDENTITY" "$LTF_FIXTURE_ACTIVE_IDENTITY"
      else
        cp -- "$LTF_FIXTURE_KNOWN_GOOD_IDENTITY" "$LTF_FIXTURE_ACTIVE_IDENTITY"
      fi
    fi
    : > "$LTF_FIXTURE_APP_STATE"
    ;;
  stop:caddy-fixture)
    rm -f -- "$LTF_FIXTURE_EDGE_STATE"
    ;;
  start:caddy-fixture)
    : > "$LTF_FIXTURE_EDGE_STATE"
    ;;
  *)
    printf 'unexpected systemctl call: %s %s\\n' "$action" "$service" >&2
    exit 1
    ;;
esac
`,
    curl: `#!/usr/bin/env bash
set -euo pipefail
url="\${!#}"
deployment=off
[[ -f "$LTF_FIXTURE_DEPLOYMENT_MARKER" ]] && deployment=on
printf '%s|curl|%s|deployment=%s\\n' "$LTF_FIXTURE_RUN" "$url" "$deployment" >> "$LTF_FIXTURE_EVENT_LOG"
if [[ "$url" == "http://127.0.0.1:8001/readyz" ]]; then
  [[ -f "$LTF_FIXTURE_APP_STATE" ]]
  exit
fi
exec "$LTF_FIXTURE_REAL_CURL" "$@"
`,
  };
  await Promise.all(Object.entries(scripts).map(async ([name, source]) => {
    const filePath = path.join(shimsDir, name);
    await fs.writeFile(filePath, source, { mode: 0o755 });
  }));
}

function backupStubSource() {
  return `import fs from "node:fs";
const command = process.argv[2];
const value = (name) => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : "";
};
const deployment = fs.existsSync(process.env.LTF_FIXTURE_DEPLOYMENT_MARKER) ? "on" : "off";
const app = fs.existsSync(process.env.LTF_FIXTURE_APP_STATE) ? "on" : "off";
const edge = fs.existsSync(process.env.LTF_FIXTURE_EDGE_STATE) ? "on" : "off";
const failures = new Set(String(process.env.LTF_FIXTURE_FAILURES || "").split(",").filter(Boolean));
if (command === "create") {
  if (deployment !== "on" || app !== "off" || edge !== "on") process.exit(2);
  const output = value("--output");
  if (failures.has("pre-backup") && output.includes("pre-deploy-")) process.exit(5);
  if (failures.has("pre-rollback-backup") && output.includes("pre-rollback-")) process.exit(5);
  fs.writeFileSync(output, "fixture backup\\n");
  fs.appendFileSync(process.env.LTF_FIXTURE_EVENT_LOG, \`\${process.env.LTF_FIXTURE_RUN}|backup-create|app=\${app}|edge=\${edge}|deployment=\${deployment}\\n\`);
} else if (command === "inspect") {
  if (!fs.existsSync(value("--archive"))) process.exit(3);
} else if (command === "restore") {
  const preRestore = value("--pre-restore-backup");
  if (preRestore) fs.writeFileSync(preRestore, "fixture pre-restore backup\\n");
  fs.appendFileSync(process.env.LTF_FIXTURE_EVENT_LOG, \`\${process.env.LTF_FIXTURE_RUN}|backup-restore|app=\${app}|edge=\${edge}|deployment=\${deployment}\\n\`);
  if (failures.has("restore")) process.exit(6);
  if (failures.has("rollback-restore") && preRestore.includes("pre-restore-rollback-")) process.exit(6);
  if (failures.has("current-restore") && (preRestore.includes("failed-rollback-") || preRestore.includes("retry-rollback-"))) process.exit(6);
} else {
  process.exit(4);
}
`;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || process.cwd(),
    encoding: "utf8",
    env: options.env || process.env,
  });
  if (result.status !== 0) {
    throw new Error(`${command} failed: ${String(result.stderr || result.stdout || result.error).trim()}`);
  }
  return result;
}

function toPosixPath(value) {
  return String(value).split(path.sep).join("/");
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
