export const regressionMeta = Object.freeze({
  id: "release.public-demo-compose-reset",
  area: "release",
  tier: "release-gate",
  tags: ["compose", "demo", "recovery", "security", "sqlite"],
  description: "Proves the guarded Compose public-demo reset promotes one verified database-and-Files unit under a shared lock and automatically reconstructs prior state after failures or interruption.",
  runMode: "static",
});

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  PUBLIC_DEMO_ACTIVATION_CONTRACT,
  PUBLIC_DEMO_ACTIVE_OPERATION,
  PUBLIC_DEMO_CANDIDATE_DIRECTORY,
  PUBLIC_DEMO_FAILED_PREFIX,
  PUBLIC_DEMO_PREVIOUS_PREFIX,
  SQLITE_SIDECARS,
  UNIT_ENTRIES,
  parsePublicDemoActivationArgs,
  resolvePublicDemoActivationPaths,
  runPublicDemoActivationOperation,
} from "../../lib/public-demo-baseline-activation.mjs";
import { assertRoadmapCursorAtLeast } from "../../lib/roadmap-cursor.mjs";

/**
 * Optional fixture-source overrides accepted by the shared roadmap-cursor
 * floor helper.
 * @typedef {{ roadmapArchiveSource?: string, roadmapSource?: string }} RoadmapCursorSourceOverrides
 */

const environment = Object.freeze({
  DEMO_MODE: "true",
  LONGTAIL_DEPLOYMENT_MODE: "compose",
  LONGTAIL_ENV: "production",
  LONGTAIL_PUBLIC_URL: "https://demo.longtailforge.com",
});
const target = "rt-ltf-demo";
const root = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-public-demo-activation-"));

try {
  assert.deepEqual(parsePublicDemoActivationArgs([
    "activate", "--target", target, "--data-root", root,
    "--operation-id", "20260807T120000Z-reset-test", "--confirm-quiescent", "COMPOSE SQLITE USERS STOPPED",
  ]), {
    action: "activate",
    confirmQuiescent: "COMPOSE SQLITE USERS STOPPED",
    dataRoot: root,
    operationId: "20260807T120000Z-reset-test",
    target,
  });
  assert.throws(() => parsePublicDemoActivationArgs(["activate", "--target", target, "--data-root", root]), /operation-id/);
  assert.throws(() => parsePublicDemoActivationArgs([
    "activate", "--target", target, "--data-root", root,
    "--operation-id", "20260807T120000Z-reset-test", "--confirm-quiescent", "not stopped",
  ]), /exact stopped-service confirmation/);
  assert.throws(() => parsePublicDemoActivationArgs([
    "inspect", "--target", target, "--target", target, "--data-root", root,
  ]), /only once/);

  await exerciseSuccessfulActivation(path.join(root, "success"));
  await exerciseActivatedRecovery(path.join(root, "recovery"));
  await exerciseInterruptedRetirement(path.join(root, "partial-retirement"));
  await exerciseInterruptedSidecarRetirement(path.join(root, "partial-sidecar-retirement"));
  await exerciseInterruptedPromotion(path.join(root, "partial-promotion"));
  await exerciseInterruptedFinalization(path.join(root, "partial-finalization"));
  await exerciseInterruptedRecoveryArchive(path.join(root, "partial-recovery-archive"));
  await exerciseCorruptOperationRefusal(path.join(root, "corrupt-operation"));
  await exerciseRefusals(path.join(root, "refusals"));
  await assertHostContract();
} finally {
  await fs.rm(root, { recursive: true, force: true });
}

console.log("Public-demo Compose reset activation and recovery regression passed.");

/** @param {string} dataRoot */
async function exerciseSuccessfulActivation(dataRoot) {
  const operationId = "20260807T120001Z-reset-success";
  await createUnit(dataRoot, "old", { sidecars: true });
  await createUnit(path.join(dataRoot, PUBLIC_DEMO_CANDIDATE_DIRECTORY), "new");
  assert.equal((await inspect(dataRoot)).active, false);
  assert.equal((await operate("activate", dataRoot, operationId)).status, "baseline-activated");
  assert.equal(await readLabel(dataRoot), "new");
  const previous = path.join(dataRoot, `${PUBLIC_DEMO_PREVIOUS_PREFIX}${operationId}`);
  assert.equal(await readLabel(previous), "old");
  for (const sidecar of SQLITE_SIDECARS) {
    assert.equal(await fs.readFile(path.join(previous, sidecar), "utf8"), `old-${sidecar}`);
    await assert.rejects(() => fs.access(path.join(dataRoot, sidecar)));
  }
  await assert.rejects(() => fs.access(path.join(dataRoot, PUBLIC_DEMO_CANDIDATE_DIRECTORY)));
  assert.deepEqual(await inspect(dataRoot), {
    active: true,
    operationId,
    phase: "activated",
    status: "active-reset-found",
    target,
  });
  assert.equal((await operate("finalize", dataRoot, operationId)).status, "activation-finalized");
  await assert.rejects(() => fs.access(path.join(dataRoot, PUBLIC_DEMO_ACTIVE_OPERATION)));
  const retained = path.join(dataRoot, `${PUBLIC_DEMO_PREVIOUS_PREFIX}${operationId}`);
  assert.equal(JSON.parse(await fs.readFile(path.join(retained, "reset-operation.json"), "utf8")).phase, "completed");
}

/** @param {string} dataRoot */
async function exerciseActivatedRecovery(dataRoot) {
  const operationId = "20260807T120002Z-reset-recovery";
  await createUnit(dataRoot, "old", { sidecars: true });
  await createUnit(path.join(dataRoot, PUBLIC_DEMO_CANDIDATE_DIRECTORY), "new");
  await operate("activate", dataRoot, operationId);
  for (const sidecar of SQLITE_SIDECARS) await fs.writeFile(path.join(dataRoot, sidecar), "new-" + sidecar);
  assert.equal((await operate("recover", dataRoot)).status, "prior-unit-recovered");
  assert.equal(await readLabel(dataRoot), "old");
  const failed = path.join(dataRoot, `${PUBLIC_DEMO_FAILED_PREFIX}${operationId}`);
  assert.equal(await readLabel(failed), "new");
  for (const sidecar of SQLITE_SIDECARS) {
    assert.equal(await fs.readFile(path.join(dataRoot, sidecar), "utf8"), `old-${sidecar}`);
    assert.equal(await fs.readFile(path.join(failed, sidecar), "utf8"), "new-" + sidecar);
  }
  assert.equal(JSON.parse(await fs.readFile(path.join(failed, "reset-operation.json"), "utf8")).phase, "recovered");
  await assert.rejects(() => fs.access(path.join(dataRoot, PUBLIC_DEMO_ACTIVE_OPERATION)));
}

/** @param {string} dataRoot */
async function exerciseInterruptedRetirement(dataRoot) {
  const operationId = "20260807T120003Z-reset-retirement";
  await createUnit(dataRoot, "old");
  await createUnit(path.join(dataRoot, PUBLIC_DEMO_CANDIDATE_DIRECTORY), "new");
  const paths = resolvePublicDemoActivationPaths(dataRoot, operationId);
  await fs.mkdir(paths.previousRoot, { mode: 0o700 });
  await fs.rename(path.join(dataRoot, "longtail-forge.db"), path.join(paths.previousRoot, "longtail-forge.db"));
  await writeOperation(dataRoot, operationId, "retired-longtail-forge.db");
  await operate("recover", dataRoot);
  assert.equal(await readLabel(dataRoot), "old");
  await assert.rejects(() => fs.access(paths.candidateRoot));
}

/** @param {string} dataRoot */
async function exerciseInterruptedSidecarRetirement(dataRoot) {
  const operationId = "20260807T120007Z-reset-sidecar-retirement";
  await createUnit(dataRoot, "old", { sidecars: true });
  await createUnit(path.join(dataRoot, PUBLIC_DEMO_CANDIDATE_DIRECTORY), "new");
  const paths = resolvePublicDemoActivationPaths(dataRoot, operationId);
  await fs.mkdir(paths.previousRoot, { mode: 0o700 });
  for (const entry of UNIT_ENTRIES) {
    await fs.rename(path.join(dataRoot, entry), path.join(paths.previousRoot, entry));
  }
  await fs.rename(
    path.join(dataRoot, SQLITE_SIDECARS[0]),
    path.join(paths.previousRoot, SQLITE_SIDECARS[0]),
  );
  await writeOperation(dataRoot, operationId, `retired-${SQLITE_SIDECARS[0]}`);
  await operate("recover", dataRoot);
  for (const sidecar of SQLITE_SIDECARS) {
    assert.equal(await fs.readFile(path.join(dataRoot, sidecar), "utf8"), `old-${sidecar}`);
  }
  const failed = path.join(dataRoot, `${PUBLIC_DEMO_FAILED_PREFIX}${operationId}`);
  await assert.rejects(() => fs.access(path.join(failed, SQLITE_SIDECARS[1])));
}

/** @param {string} dataRoot */
async function exerciseInterruptedPromotion(dataRoot) {
  const operationId = "20260807T120004Z-reset-promotion";
  await createUnit(dataRoot, "old");
  await createUnit(path.join(dataRoot, PUBLIC_DEMO_CANDIDATE_DIRECTORY), "new");
  const paths = resolvePublicDemoActivationPaths(dataRoot, operationId);
  await fs.mkdir(paths.previousRoot, { mode: 0o700 });
  for (const entry of UNIT_ENTRIES) {
    await fs.rename(path.join(dataRoot, entry), path.join(paths.previousRoot, entry));
  }
  await fs.rename(
    path.join(paths.candidateRoot, "longtail-forge.db"),
    path.join(dataRoot, "longtail-forge.db"),
  );
  await writeOperation(dataRoot, operationId, "promoted-longtail-forge.db");
  await operate("recover", dataRoot);
  assert.equal(await readLabel(dataRoot), "old");
  assert.equal(await fs.readFile(path.join(dataRoot, "files", "label.txt"), "utf8"), "old");
}

/** @param {string} dataRoot */
async function exerciseInterruptedFinalization(dataRoot) {
  const operationId = "20260807T120005Z-reset-finalization";
  await createUnit(dataRoot, "old");
  await createUnit(path.join(dataRoot, PUBLIC_DEMO_CANDIDATE_DIRECTORY), "new");
  await operate("activate", dataRoot, operationId);
  await writeOperation(dataRoot, operationId, "completed", { completedAt: "2026-08-07T12:00:01.000Z" });
  assert.equal((await operate("recover", dataRoot)).status, "completed-activation-reconciled");
  assert.equal(await readLabel(dataRoot), "new");
  const retained = path.join(dataRoot, `${PUBLIC_DEMO_PREVIOUS_PREFIX}${operationId}`);
  assert.equal(JSON.parse(await fs.readFile(path.join(retained, "reset-operation.json"), "utf8")).phase, "completed");
}

/** @param {string} dataRoot */
async function exerciseInterruptedRecoveryArchive(dataRoot) {
  const operationId = "20260807T120006Z-reset-recovery-archive";
  await createUnit(dataRoot, "old");
  await createUnit(path.join(dataRoot, PUBLIC_DEMO_CANDIDATE_DIRECTORY), "new");
  await operate("activate", dataRoot, operationId);
  await operate("recover", dataRoot);
  const failed = path.join(dataRoot, `${PUBLIC_DEMO_FAILED_PREFIX}${operationId}`);
  await fs.rename(
    path.join(failed, "reset-operation.json"),
    path.join(dataRoot, PUBLIC_DEMO_ACTIVE_OPERATION),
  );
  assert.equal((await operate("recover", dataRoot)).status, "recovered-activation-reconciled");
  assert.equal(await readLabel(dataRoot), "old");
  assert.equal(JSON.parse(await fs.readFile(path.join(failed, "reset-operation.json"), "utf8")).phase, "recovered");
}

/** @param {string} dataRoot */
async function exerciseCorruptOperationRefusal(dataRoot) {
  const operationId = "20260807T120008Z-reset-corrupt-operation";
  await createUnit(dataRoot, "old");
  await createUnit(path.join(dataRoot, PUBLIC_DEMO_CANDIDATE_DIRECTORY), "new");
  await writeOperation(dataRoot, operationId, "unknown-phase");
  await assert.rejects(() => inspect(dataRoot), /operation marker is invalid/);
  await assert.rejects(() => operate("recover", dataRoot), /operation marker is invalid/);
}

/** @param {string} dataRoot */
async function exerciseRefusals(dataRoot) {
  const operationId = "20260807T120005Z-reset-refusal";
  await createUnit(dataRoot, "old");
  await createUnit(path.join(dataRoot, PUBLIC_DEMO_CANDIDATE_DIRECTORY), "new");
  await fs.mkdir(path.join(dataRoot, `${PUBLIC_DEMO_PREVIOUS_PREFIX}${operationId}`));
  await assert.rejects(() => operate("activate", dataRoot, operationId), /already exists/);
  await fs.rm(path.join(dataRoot, `${PUBLIC_DEMO_PREVIOUS_PREFIX}${operationId}`), { recursive: true });
  await assert.rejects(() => runPublicDemoActivationOperation({
    action: "activate",
    dataRoot,
    environment: { ...environment, DEMO_MODE: "false" },
    operationId,
    requireCanonicalDataRoot: false,
    requireRoot: false,
    target,
  }), /exact production Compose demo profile/);
  await assert.rejects(() => runPublicDemoActivationOperation({
    action: "activate",
    dataRoot,
    environment,
    operationId,
    requireCanonicalDataRoot: false,
    requireRoot: false,
    target: "rt-ltf",
  }), /named demo installation/);

  if (process.platform !== "win32") {
    const linkRoot = path.join(root, "symlink-refusal");
    await createUnit(linkRoot, "old");
    await createUnit(path.join(linkRoot, PUBLIC_DEMO_CANDIDATE_DIRECTORY), "new");
    await fs.rm(path.join(linkRoot, PUBLIC_DEMO_CANDIDATE_DIRECTORY, "files", "label.txt"));
    await fs.symlink(
      path.join(linkRoot, "files", "label.txt"),
      path.join(linkRoot, PUBLIC_DEMO_CANDIDATE_DIRECTORY, "files", "label.txt"),
    );
    await assert.rejects(() => operate("activate", linkRoot, "20260807T120006Z-reset-link"), /symbolic link/);
  }
}

async function assertHostContract() {
  const [host, deploy, candidate, activationCli, artifact, attributes, manualRelease, roadmap, docs] = await Promise.all([
    fs.readFile("scripts/release/longtail-forge-public-demo-reset-host.example", "utf8"),
    fs.readFile("scripts/release/longtail-forge-compose-deploy-host.example", "utf8"),
    fs.readFile("scripts/lib/public-demo-baseline-candidate.mjs", "utf8"),
    fs.readFile("scripts/public-demo-baseline-activation.mjs", "utf8"),
    fs.readFile("scripts/build-runtime-artifact.mjs", "utf8"),
    fs.readFile(".gitattributes", "utf8"),
    fs.readFile(".github/workflows/manual-release.yml", "utf8"),
    fs.readFile("ROADMAP.md", "utf8"),
    fs.readFile("docs/demo-data-operations.md", "utf8"),
  ]);
  for (const source of [host, deploy]) {
    assert.match(source, /OPERATION_LOCK="\$DEPLOY_ROOT\/compose-operation\.lock"/);
    assert.match(source, /flock -n 9/);
    assert.match(source, /another Compose deploy, rollback, backup, or public-demo reset operation holds the host lock/);
  }
  for (const requirement of [
    /run_candidate build/,
    /run_candidate validate/,
    /assert_marker/,
    /stop_sqlite_users/,
    /backup_current_unit/,
    /run_activation activate/,
    /run_candidate active/,
    /start_sqlite_users/,
    /verify_runtime/,
    /verify_old_session_rejected/,
    /SESSION_ROOT="\$\(mktemp -d \/run\/longtail-forge-public-demo-reset\.XXXXXX\)"/,
    /cleanup_session_material/,
    /verify_representative_role/,
    /api\/csrf-token/,
    /X-CSRF-Token: \$csrf_token/,
    /api\/tasks\?limit=1/,
    /api\/client-projects/,
    /api\/files\/attachments\?limit=1/,
    /\.attachments \| length >= 1/,
    /run_activation finalize/,
    /clear_marker/,
    /run_activation recover/,
    /run_activation recover .* \|\| recovery_ready=false/,
    /test "\$recovery_ready" = true && start_sqlite_users && verify_runtime/,
    /maintenance curtain and protected evidence remain/,
    /lock_contended\(\)[\s\S]*exit 75/,
    /--operation-id\) key=operation/,
    /provided operation identity is invalid/,
    /"semanticFingerprint":"%s"/,
  ]) assert.match(host, requirement);
  assert.doesNotMatch(host, /api\/time-entries|role-write\.json|Public demo reset verification/);
  assert.match(
    host,
    /run_candidate\(\)[\s\S]*compose run --rm --no-deps --user 0:0 --cap-add CHOWN --cap-add DAC_OVERRIDE \\\n\s+--volume "\$ROLE_CREDENTIALS:\/run\/secrets\/demo-role-credentials\.json:ro"/,
    "The ephemeral candidate builder should regain only its two filesystem capabilities after the service-wide capability drop.",
  );
  assert.match(
    host,
    /run_activation\(\)[\s\S]*compose run --rm --no-deps --user 0:0 --cap-add DAC_OVERRIDE longtail-forge/,
    "Activation and recovery should regain only the filesystem traversal capability.",
  );
  assert.deepEqual(
    [...host.matchAll(/--cap-add\s+([A-Z_]+)/g)].map((match) => match[1]),
    ["CHOWN", "DAC_OVERRIDE", "DAC_OVERRIDE"],
    "Only candidate construction and activation may add their exact filesystem capabilities.",
  );
  assert.doesNotMatch(host, /--privileged|--cap-add\s+(?!CHOWN(?:\s|\\)|DAC_OVERRIDE(?:\s|\\))/);
  assertOrdered(host, [
    "run_candidate build", "run_candidate validate", "capture_old_session", "assert_marker",
    "stop_sqlite_users", "backup_current_unit", "run_activation activate", "run_candidate active",
    "start_sqlite_users", "verify_runtime", "verify_old_session_rejected", "verify_representative_role",
    "run_activation finalize", "clear_marker",
  ]);
  assert.match(candidate, /action === "active" \? paths\.dataRoot/);
  assert.match(activationCli, /runPublicDemoActivationOperation/);
  assert.match(artifact, /scripts\/public-demo-baseline-activation\.mjs/);
  assert.match(attributes, /^scripts\/release\/longtail-forge-public-demo-reset-host\.example text eol=lf$/m);
  assert.match(manualRelease, /scripts\/release\/longtail-forge-public-demo-reset-host\.example/);
  assert.doesNotMatch(host, /systemctl|longtail-forge\.service|cron|systemd timer|setInterval/);
  assert.match(docs, /shared Compose operation lock/i);
  assert.match(docs, /pre-reset session/i);
  assertRoadmapCursorAtLeast("0.33.31.8", "public-demo Compose reset closeout", /** @type {RoadmapCursorSourceOverrides} */ (/** @type {unknown} */ (roadmap)));
}

/**
 * @param {string} unitRoot
 * @param {string} label
 * @param {{ sidecars?: boolean }} [options]
 */
async function createUnit(unitRoot, label, { sidecars = false } = {}) {
  await fs.mkdir(path.join(unitRoot, "files"), { recursive: true, mode: 0o700 });
  await fs.writeFile(path.join(unitRoot, "longtail-forge.db"), label, { mode: 0o600 });
  await fs.writeFile(path.join(unitRoot, "files", "label.txt"), label, { mode: 0o600 });
  await fs.writeFile(path.join(unitRoot, ".longtail-demo-data.json"), JSON.stringify({ label }), { mode: 0o600 });
  if (sidecars) {
    for (const sidecar of SQLITE_SIDECARS) {
      await fs.writeFile(path.join(unitRoot, sidecar), `${label}-${sidecar}`, { mode: 0o600 });
    }
  }
}

/** @param {string} unitRoot */
async function readLabel(unitRoot) {
  return fs.readFile(path.join(unitRoot, "longtail-forge.db"), "utf8");
}

/**
 * @param {string} dataRoot
 * @param {string} operationId
 * @param {string} phase
 * @param {Record<string, unknown>} [extra]
 */
async function writeOperation(dataRoot, operationId, phase, extra = {}) {
  await fs.writeFile(path.join(dataRoot, PUBLIC_DEMO_ACTIVE_OPERATION), `${JSON.stringify({
    contract: PUBLIC_DEMO_ACTIVATION_CONTRACT,
    generatedAt: "2026-08-07T12:00:00.000Z",
    operationId,
    phase,
    state: "active",
    target,
    ...extra,
  }, null, 2)}\n`, { mode: 0o600 });
}

/**
 * @param {string} action
 * @param {string} dataRoot
 * @param {string} [operationId]
 */
function operate(action, dataRoot, operationId) {
  return runPublicDemoActivationOperation({
    action,
    dataRoot,
    environment,
    operationId,
    requireCanonicalDataRoot: false,
    requireRoot: false,
    target,
  });
}

/** @param {string} dataRoot */
function inspect(dataRoot) {
  return operate("inspect", dataRoot);
}

/**
 * @param {string} source
 * @param {readonly string[]} values
 */
function assertOrdered(source, values) {
  let cursor = -1;
  for (const value of values) {
    const next = source.indexOf(value, cursor + 1);
    assert.ok(next > cursor, `${value} must appear in the reviewed reset order`);
    cursor = next;
  }
}
