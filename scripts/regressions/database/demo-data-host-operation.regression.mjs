export const regressionMeta = Object.freeze({
  id: "database.demo-data-host-operation",
  area: "database",
  tier: "release-gate",
  tags: ["backup", "demo", "deployment", "files", "security", "seed", "sqlite"],
  description: "Proves exact-target preflight and seven-role demo-host provision/reset through a backup-first, secret-safe, rollback-capable database-and-Files operation.",
  runMode: "isolated-database",
});

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import {
  DEMO_DATA_CONTRACT,
  PREFLIGHT_CONFIRMATION,
  PROVISION_CONFIRMATION,
  RESET_CONFIRMATION,
  assertDemoHostSafety,
  assertDemoMarkerForAction,
  assertNoPartialDemoState,
  assertProtectedFile,
  createHostDependencies,
  minimalSeedEnvironment,
  parseDemoDataArgs,
  parseDemoHelperConfig,
  prepareDemoHostContext,
  redactDemoError,
  resolveDemoPaths,
  runDemoDataOperation,
  verifyDemoSeedCandidate,
} from "../../lib/demo-data-operation.mjs";
import {
  ROLE_CREDENTIALS_FILE_ENV,
  RT_LTF_DEMO_ROLE_FIXTURE_BINDING,
  SANITIZED_DEMO_ROLE_FIXTURES,
} from "../../lib/sanitized-demo-role-fixtures.mjs";

const root = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-demo-data-host-regression-"));
const appVersion = JSON.parse(await fs.readFile("package.json", "utf8").then(String)).version;
const operatorPassword = "Regression-Only-Demo-Host-Operator-41!";
const rolePasswords = Object.fromEntries(SANITIZED_DEMO_ROLE_FIXTURES.map((fixture, index) => [
  fixture.roleId,
  `H${index}r!Demo-Host-Private-75319zZ`,
]));
const appEnvironment = Object.freeze({
  LONGTAIL_ENV: "production",
  LONGTAIL_PUBLIC_URL: "https://demo.longtailforge.com",
  LONGTAIL_FILE_SCANNER: "none",
  LONGTAIL_SQLITE_FOREIGN_KEYS: "true",
  LONGTAIL_SQLITE_JOURNAL_MODE: "wal",
  LONGTAIL_WORKER_MODE: "inline",
  SUPER_ADMIN_PASSWORD: operatorPassword,
  SUPER_ADMIN_USERNAME: "demo-operator@example.com",
  SUPER_ADMIN_DISPLAY_NAME: "Demo Operator",
});
const configText = `
LTF_DEMO_TARGET=rt-ltf-demo
LTF_DEMO_HOSTNAME=rt-ltf-demo
LTF_DEMO_PUBLIC_URL=https://demo.longtailforge.com
LTF_APP_ROOT=${path.join(root, "app")}
LTF_DATA_ROOT=${path.join(root, "development-seed", "current")}
LTF_BACKUP_ROOT=${path.join(root, "backups")}
LTF_APP_ENV=${path.join(root, "protected", "longtail-forge.env")}
LTF_ROLE_CREDENTIALS=${path.join(root, "protected", "demo-role-credentials.json")}
`;

try {
  const provisionArgs = parseDemoDataArgs([
    "provision", "--target", "rt-ltf-demo", "--anchor-date", "2026-07-20", "--confirm", PROVISION_CONFIRMATION,
  ]);
  assert.equal(provisionArgs.action, "provision");
  const preflightArgs = parseDemoDataArgs([
    "preflight", "--target", "rt-ltf-demo", "--anchor-date", "2026-07-20", "--confirm", PREFLIGHT_CONFIRMATION,
  ]);
  assert.equal(preflightArgs.action, "preflight");
  assert.equal(parseDemoDataArgs([
    "reset", "--target", "rt-ltf-demo", "--anchor-date", "2026-08-01", "--confirm", RESET_CONFIRMATION,
  ]).action, "reset");
  assert.throws(() => parseDemoDataArgs(["reset", "--target", "rt-ltf", "--anchor-date", "2026-08-01", "--confirm", RESET_CONFIRMATION]), /exactly rt-ltf-demo/);
  assert.throws(() => parseDemoDataArgs(["reset", "--target", "rt-ltf-demo", "--anchor-date", "2026-02-30", "--confirm", RESET_CONFIRMATION]), /actual calendar date/);
  assert.throws(() => parseDemoDataArgs(["reset", "--target", "rt-ltf-demo", "--anchor-date", "2026-08-01", "--confirm", "RESET DATA"]), /exactly/);

  const config = parseDemoHelperConfig(configText);
  const paths = resolveDemoPaths(config);
  assert.throws(() => parseDemoHelperConfig(`${configText}\nUNSUPPORTED_SECRET=value\n`), /unsupported key/);
  assert.throws(() => parseDemoHelperConfig(configText.replace("rt-ltf-demo", "rt-ltf")), /identity/);
  assert.throws(() => resolveDemoPaths({ ...config, backupRoot: path.join(config.dataRoot, "backups") }), /separate non-nested/);
  assert.throws(
    () => resolveDemoPaths({ ...config, roleCredentialsFile: config.appEnvFile }),
    /separate protected host file/,
  );
  assert.doesNotThrow(() => assertDemoMarkerForAction("provision", null));
  assert.doesNotThrow(() => assertDemoMarkerForAction("preflight", null));
  assert.doesNotThrow(() => assertDemoMarkerForAction("preflight", { contract: DEMO_DATA_CONTRACT, target: "rt-ltf-demo" }));
  assert.throws(() => assertDemoMarkerForAction("preflight", { contract: "wrong", target: "rt-ltf-demo" }), /invalid demo-data ownership marker/);
  assert.throws(() => assertDemoMarkerForAction("reset", null), /matching demo-data ownership marker/);
  assert.doesNotThrow(() => assertDemoMarkerForAction("reset", { contract: DEMO_DATA_CONTRACT, target: "rt-ltf-demo" }));
  assert.throws(() => assertDemoMarkerForAction("provision", { contract: DEMO_DATA_CONTRACT, target: "rt-ltf-demo" }), /already provisioned/);

  await fs.mkdir(path.dirname(paths.appEnvFile), { recursive: true });
  await fs.writeFile(
    paths.appEnvFile,
    `${Object.entries(appEnvironment).map(([key, value]) => `${key}=${value}`).join("\n")}\n`,
    "utf8",
  );
  await writeHostRoleCredentials(paths.roleCredentialsFile, rolePasswords);
  const originalRoleCredentialsFile = path.join(root, "protected", "original-role-credentials.json");
  await fs.writeFile(originalRoleCredentialsFile, `${JSON.stringify({ passwords: rolePasswords, version: 1 }, null, 2)}\n`, "utf8");
  await assertProtectedFile(paths.appEnvFile, { label: "test environment", requireRoot: false });
  const symlinkPath = path.join(root, "protected", "linked.env");
  let symlinkProven = false;
  try {
    await fs.symlink(paths.appEnvFile, symlinkPath, "file");
    await assert.rejects(assertProtectedFile(symlinkPath, { label: "test environment", requireRoot: false }), /non-symbolic-link/);
    symlinkProven = true;
  } catch (error) {
    if (!new Set(["EPERM", "EACCES", "UNKNOWN"]).has(error?.code)) throw error;
  }

  await fs.mkdir(paths.backupRoot, { recursive: true });
  const fixtureRelease = path.join(paths.appRoot, "releases", "fixture");
  await fs.mkdir(fixtureRelease, { recursive: true });
  await fs.symlink(fixtureRelease, path.join(paths.appRoot, "current"), process.platform === "win32" ? "junction" : "dir");
  await seedDevelopmentData(paths.dataRoot, "2026-07-19", "Regression-Only-Original-Demo-State-42!", originalRoleCredentialsFile);
  await fs.rm(path.join(paths.dataRoot, ".longtail-development-data.json"));
  const credentialReadEvents = [];
  await assert.rejects(prepareDemoHostContext({
    action: "provision",
    config,
    paths,
    hostname: "rt-ltf",
    requireRoot: false,
    readApplicationEnvironment: async () => {
      credentialReadEvents.push("application");
      return appEnvironment;
    },
    readRoleCredentials: async () => {
      credentialReadEvents.push("roles");
      return null;
    },
  }), /does not match the named demo installation/);
  assert.deepEqual(
    credentialReadEvents,
    [],
    "wrong-host refusal must happen before application or role credential reads",
  );
  const safeHost = await prepareDemoHostContext({
    action: "provision",
    config,
    paths,
    hostname: "rt-ltf-demo",
    requireRoot: false,
  });
  assert.equal(path.resolve(safeHost.releaseDir), path.resolve(fixtureRelease));
  assert.equal(safeHost.roleFixtures.fixtures.length, 7);
  const preflightResult = await runDemoDataOperation({
    ...preflightArgs,
    appEnvironment: safeHost.appEnvironment,
    appVersion,
    config,
    marker: safeHost.marker,
    paths,
    releaseDir: process.cwd(),
    roleCredentialsFile: paths.roleCredentialsFile,
  });
  assert.deepEqual(preflightResult, {
    status: "preflight-ready",
    target: "rt-ltf-demo",
    anchorDate: "2026-07-20",
    nextAction: "provision",
    roleFixtureCount: 7,
    appVersion,
  });
  assert.deepEqual(await fs.readdir(paths.backupRoot), [], "preflight must not create a backup or mutate data");
  const seedEnvironment = minimalSeedEnvironment(paths.roleCredentialsFile);
  assert.equal(seedEnvironment[ROLE_CREDENTIALS_FILE_ENV], paths.roleCredentialsFile);
  assert.equal(seedEnvironment.LONGTAIL_ENV, "development");
  assert.equal(seedEnvironment.LONGTAIL_PUBLIC_URL, "http://127.0.0.1");
  assert.equal(seedEnvironment.LONGTAIL_RELEASE_BRANCH, "");
  assert.equal("SUPER_ADMIN_PASSWORD" in seedEnvironment, false);
  for (const [key, value] of Object.entries(appEnvironment)) {
    if (/(PASSWORD|SECRET|TOKEN|MASTER_KEY|PRIVATE_KEY)/.test(key) && String(value)) {
      assert.equal(Object.values(seedEnvironment).includes(value), false);
    }
  }
  for (const password of Object.values(rolePasswords)) {
    assert.equal(Object.values(seedEnvironment).includes(password), false);
  }
  await assert.rejects(prepareDemoHostContext({
    action: "provision",
    config,
    paths: {
      ...paths,
      roleCredentialsFile: path.join(root, "protected", "missing-role-credentials.json"),
    },
    hostname: "rt-ltf-demo",
    requireRoot: false,
  }), /ENOENT|no such file/i);
  await writeHostRoleCredentials(paths.roleCredentialsFile, {
    ...rolePasswords,
    client_user: "weak",
  });
  await assert.rejects(prepareDemoHostContext({
    action: "provision",
    config,
    paths,
    hostname: "rt-ltf-demo",
    requireRoot: false,
  }), /at least 16 characters/);
  await writeHostRoleCredentials(paths.roleCredentialsFile, rolePasswords, {
    target: "rt-ltf",
  });
  await assert.rejects(prepareDemoHostContext({
    action: "provision",
    config,
    paths,
    hostname: "rt-ltf-demo",
    requireRoot: false,
  }), /binding does not match/);
  await writeHostRoleCredentials(paths.roleCredentialsFile, {
    ...rolePasswords,
    super_admin: operatorPassword,
  });
  await assert.rejects(prepareDemoHostContext({
    action: "provision",
    config,
    paths,
    hostname: "rt-ltf-demo",
    requireRoot: false,
  }), /distinct from application or copied installation secrets/);
  await writeHostRoleCredentials(paths.roleCredentialsFile, rolePasswords);
  await assert.rejects(assertDemoHostSafety({
    action: "provision",
    appEnvironment,
    config,
    paths,
    hostname: "rt-ltf",
    requireRoot: false,
    roleFixtures: safeHost.roleFixtures,
  }), /does not match the named demo installation/);
  await fs.writeFile(path.join(paths.dataRoot, "original-state.txt"), "preserve me", "utf8");

  const events = [];
  const hostDependencies = createHostDependencies();
  const successDependencies = makeDependencies(hostDependencies, events, {
    operationId: "11111111-1111-4111-a111-111111111111",
    timestamp: "20260720T120000Z",
    verifyRunning: async () => ({
      canonicalVersion: appVersion,
      sourceBranch: "nightly",
      commitSha: "1".repeat(40),
      artifactSha256: "2".repeat(64),
    }),
  });
  const result = await runDemoDataOperation({
    ...provisionArgs,
    appEnvironment,
    appVersion,
    config,
    paths,
    releaseDir: process.cwd(),
    roleCredentialsFile: paths.roleCredentialsFile,
    dependencies: successDependencies,
  });
  assert.equal(result.status, "provisioned");
  assert.equal(result.target, "rt-ltf-demo");
  assert.equal(result.counts.workspaces, 5);
  assert.equal(result.counts.users, 24);
  assert.equal(result.counts.tasks, 400);
  assert.equal(result.counts.files, 2);
  assert.doesNotMatch(JSON.stringify(result), new RegExp(operatorPassword));
  assert.deepEqual(events.slice(0, 7), ["capture", "stop", "stopped", "backup", "inspect", "seed", "repair"]);
  assert.deepEqual(events.slice(-2), ["start", "verify"]);
  const liveMarker = JSON.parse(await fs.readFile(path.join(paths.dataRoot, ".longtail-demo-data.json"), "utf8"));
  assert.equal(liveMarker.contract, DEMO_DATA_CONTRACT);
  assert.equal(liveMarker.target, "rt-ltf-demo");
  assert.equal(liveMarker.anchorDate, "2026-07-20");
  assert.equal(liveMarker.semanticFingerprint, result.semanticFingerprint);
  assert.equal(liveMarker.roleFixtureCount, 7);
  assert.doesNotMatch(JSON.stringify(liveMarker), new RegExp(operatorPassword));
  for (const password of Object.values(rolePasswords)) {
    assert.doesNotMatch(JSON.stringify(result), new RegExp(password));
    assert.doesNotMatch(JSON.stringify(liveMarker), new RegExp(password));
  }
  assert.equal((await assertDemoHostSafety({
    action: "reset",
    appEnvironment,
    config,
    paths,
    hostname: "rt-ltf-demo",
    requireRoot: false,
    roleFixtures: safeHost.roleFixtures,
  })).marker.contract, DEMO_DATA_CONTRACT);
  const resetPreflight = await runDemoDataOperation({
    ...preflightArgs,
    appEnvironment,
    appVersion,
    config,
    paths,
    releaseDir: process.cwd(),
    roleCredentialsFile: paths.roleCredentialsFile,
    marker: liveMarker,
    dependencies: hostDependencies,
  });
  assert.equal(resetPreflight.status, "preflight-ready");
  assert.equal(resetPreflight.nextAction, "reset");
  const retainedPrevious = path.join(path.dirname(paths.dataRoot), result.retainedPreviousState);
  assert.equal(await fs.readFile(path.join(retainedPrevious, "original-state.txt"), "utf8"), "preserve me");
  assert.equal(await fs.readFile(path.join(paths.filesRoot, "seed", "checkout-findings.md"), "utf8"), "# Checkout findings\n\nFake fixture only. The header overlapped the cart button below 380px.\n");
  assert.ok(await exists(path.join(paths.backupRoot, result.backup.file)));
  assert.ok(await exists(`${path.join(paths.backupRoot, result.backup.file)}.sha256`));
  async function assertCorruptCandidateRejected(name, mutate, expectedError) {
    const candidateRoot = path.join(root, "candidate-corruption", name, "sanitized-demo");
    await fs.mkdir(path.dirname(candidateRoot), { recursive: true });
    await fs.cp(paths.dataRoot, candidateRoot, { recursive: true });
    const database = new Database(path.join(candidateRoot, "longtail-forge.db"));
    try {
      await mutate(database, candidateRoot);
    } finally {
      database.close();
    }
    await assert.rejects(verifyDemoSeedCandidate({
      databaseFile: path.join(candidateRoot, "longtail-forge.db"),
      filesRoot: path.join(candidateRoot, "files"),
      expectedAnchorDate: "2026-07-20",
      expectedFingerprint: result.semanticFingerprint,
    }), expectedError);
  }
  await assert.rejects(verifyDemoSeedCandidate({
    databaseFile: paths.databaseFile,
    filesRoot: paths.filesRoot,
    expectedAnchorDate: "2026-07-20",
    expectedFingerprint: "0".repeat(64),
  }), /seed identity/);
  await assertCorruptCandidateRejected("wrong-role", (database) => {
    database.prepare(`
UPDATE user_role_assignments
SET role_id = 'client_user'
WHERE user_id = (SELECT user_id FROM users WHERE username = 'role-project-user@example.test');
`).run();
  }, /wrong role, scope, duplicate, or override/);
  await assertCorruptCandidateRejected("wrong-scope", (database) => {
    database.prepare(`
UPDATE user_role_assignments
SET scope_type = 'workspace', scope_id = workspace_id, client_id = NULL, project_id = NULL
WHERE user_id = (SELECT user_id FROM users WHERE username = 'role-client-user@example.test');
`).run();
  }, /wrong role, scope, duplicate, or override/);
  await assertCorruptCandidateRejected("multiple-role", (database) => {
    database.prepare(`
INSERT INTO user_role_assignments (
  assignment_id, workspace_id, user_id, role_id, scope_type, scope_id,
  client_id, project_id, permission_overrides_json, created_at, updated_at
)
SELECT
  'corrupt-extra-assignment', workspace_id, user_id, 'client_external_user',
  'client', (SELECT id FROM clients WHERE name = 'Cedar & Bloom' LIMIT 1),
  (SELECT id FROM clients WHERE name = 'Cedar & Bloom' LIMIT 1),
  NULL, NULL, created_at, updated_at
FROM user_role_assignments
WHERE user_id = (SELECT user_id FROM users WHERE username = 'role-project-user@example.test')
LIMIT 1;
`).run();
  }, /wrong role, scope, duplicate, or override/);
  await assertCorruptCandidateRejected("override", (database) => {
    database.prepare(`
UPDATE user_role_assignments
SET permission_overrides_json = '{}'
WHERE user_id = (SELECT user_id FROM users WHERE username = 'role-client-admin@example.test');
`).run();
  }, /wrong role, scope, duplicate, or override/);
  await assertCorruptCandidateRejected("extra-active-persona", (database) => {
    database.prepare("UPDATE users SET user_status = 'active' WHERE username = 'priya@example.com'").run();
  }, /exactly the seven expected active role identities/);
  await assertCorruptCandidateRejected("real-domain", (database) => {
    database.prepare("UPDATE users SET username = 'persona@raymondtec.com' WHERE username = 'priya@example.com'").run();
  }, /non-reserved identity domain/);
  await assertCorruptCandidateRejected("secure-note", (database) => {
    database.prepare(`
UPDATE notes
SET security_mode = 'secure', secure_payload = 'forbidden'
WHERE note_id = (SELECT note_id FROM notes LIMIT 1);
`).run();
  }, /Secure Notes exclusion/);
  await assertCorruptCandidateRejected("files-mismatch", async (_database, candidateRoot) => {
    await fs.appendFile(path.join(candidateRoot, "files", "seed", "checkout-findings.md"), "corrupt");
  }, /Files object failed size or checksum/);

  const failureDataRoot = path.join(root, "failure", "development-seed", "current");
  await fs.mkdir(path.dirname(failureDataRoot), { recursive: true });
  await fs.cp(retainedPrevious, failureDataRoot, { recursive: true });
  const failurePaths = Object.freeze({
    ...paths,
    dataRoot: failureDataRoot,
    databaseFile: path.join(failureDataRoot, "longtail-forge.db"),
    filesRoot: path.join(failureDataRoot, "files"),
    markerFile: path.join(failureDataRoot, ".longtail-demo-data.json"),
  });
  const failureEvents = [];
  const failureDependencies = makeDependencies(hostDependencies, failureEvents, {
    operationId: "22222222-2222-4222-a222-222222222222",
    timestamp: "20260720T130000Z",
    verifyRunning: async () => { throw new Error("seeded failure after promotion"); },
  });
  await assert.rejects(runDemoDataOperation({
    ...provisionArgs,
    appEnvironment,
    appVersion,
    config,
    paths: failurePaths,
    releaseDir: process.cwd(),
    roleCredentialsFile: paths.roleCredentialsFile,
    dependencies: failureDependencies,
  }), /seeded failure after promotion/);
  assert.equal(await fs.readFile(path.join(failureDataRoot, "original-state.txt"), "utf8"), "preserve me");
  assert.ok(failureEvents.filter((entry) => entry === "start").length >= 2, "candidate start and prior-state recovery should both run");
  assert.ok(failureEvents.includes("repair"), "recovery should reapply runtime ownership/modes");
  assert.equal((await fs.readdir(path.dirname(failureDataRoot))).some((entry) => entry.includes("demo-failed")), false);

  const partialRoot = path.join(root, "partial");
  const partialDataRoot = path.join(partialRoot, "longtail-forge");
  await fs.mkdir(partialDataRoot, { recursive: true });
  await fs.mkdir(path.join(partialRoot, ".longtail-demo-stale-stage"));
  await assert.rejects(assertNoPartialDemoState({ dataRoot: partialDataRoot }), /partial demo-data/);

  const [operationSource, hostCliSource, helperSource, deployHelperSource, serverSource, workerSource, workflows, attributes, packageSource] = await Promise.all([
    fs.readFile("scripts/lib/demo-data-operation.mjs", "utf8"),
    fs.readFile("scripts/demo-data-host.mjs", "utf8"),
    fs.readFile("scripts/release/longtail-forge-demo-data-host.example", "utf8"),
    fs.readFile("scripts/release/longtail-forge-deploy-host.example", "utf8"),
    fs.readFile("server.js", "utf8"),
    fs.readFile("worker.js", "utf8"),
    readWorkflowSources(),
    fs.readFile(".gitattributes", "utf8"),
    fs.readFile("package.json", "utf8"),
  ]);
  assert.match(operationSource, /lstat/);
  assert.match(operationSource, /isSymbolicLink/);
  assert.match(operationSource, /createBackup[\s\S]*inspectBackup/);
  assert.match(operationSource, /fs\.rename\(paths\.dataRoot, previousDataRoot\)/);
  assert.match(operationSource, /fs\.rename\(previousDataRoot, paths\.dataRoot\)/);
  assert.match(operationSource, /minimalSeedEnvironment/);
  assert.match(operationSource, /"--profile", DEMO_PROFILE/);
  assert.match(operationSource, /"--role-fixtures", LOCAL_ROLE_FIXTURE_MODE/);
  assert.match(operationSource, /"--role-fixture-binding", RT_LTF_DEMO_ROLE_FIXTURE_BINDING\.target/);
  assert.match(operationSource, /\[ROLE_CREDENTIALS_FILE_ENV\]: roleCredentialsFile/);
  assert.match(operationSource, /expectedMode: 0o600/);
  assert.match(
    functionBlock(operationSource, "prepareDemoHostContext"),
    /assertDemoHostIdentity[\s\S]*readApplicationEnvironment[\s\S]*readRoleCredentials/,
  );
  assert.doesNotMatch(operationSource, /console\.log\(.*SUPER_ADMIN_PASSWORD/);
  assert.doesNotMatch(functionBlock(operationSource, "minimalSeedEnvironment"), /SUPER_ADMIN_PASSWORD|appEnvironment/);
  assert.match(hostCliSource, /await fs\.realpath\(path\.resolve\(process\.argv\[1\]\)\)/);
  assert.match(hostCliSource, /if \(invokedScriptPath === scriptPath\)/);
  assert.match(helperSource, /exec \/usr\/local\/bin\/node \/opt\/longtail-forge\/current\/scripts\/demo-data-host\.mjs/);
  assert.match(helperSource, /\/opt\/longtail-forge\/current\/scripts\/demo-data-host\.mjs/);
  assert.doesNotMatch(helperSource, /LTF_HELPER_ENV|--config/);
  assert.match(attributes, /^scripts\/release\/longtail-forge-demo-data-host\.example text eol=lf$/m);
  assert.equal(JSON.parse(packageSource).scripts["demo:data:host"], "node scripts/demo-data-host.mjs");
  for (const normalPathSource of [deployHelperSource, serverSource, workerSource, workflows]) {
    assert.doesNotMatch(normalPathSource, /demo-data-host\.mjs|demo:data:host/, "normal startup/deployment paths must not invoke demo reset tooling");
  }
  if (!symlinkProven) assert.match(operationSource, /stats\.isSymbolicLink\(\)/, "static guard remains required where local symlink creation is unavailable");
  assert.equal(
    redactDemoError(
      new Error(`${operatorPassword} ${rolePasswords.client_admin} ${paths.dataRoot}`),
      [operatorPassword, rolePasswords.client_admin, paths.dataRoot],
    ),
    "[protected] [protected] [protected]",
  );

  console.log("Demo-data host operation regression passed.");
} finally {
  await fs.rm(root, { recursive: true, force: true });
}

function makeDependencies(hostDependencies, events, overrides) {
  return {
    operationId: () => overrides.operationId,
    timestamp: () => overrides.timestamp,
    captureServiceState: async () => { events.push("capture"); return { app: true, worker: false, edge: true }; },
    stopServices: async () => { events.push("stop"); },
    assertServicesStopped: async () => { events.push("stopped"); },
    startServices: async () => { events.push("start"); },
    verifyRunning: async (args) => { events.push("verify"); return await overrides.verifyRunning(args); },
    repairDataPermissions: async () => { events.push("repair"); },
    createBackup: async (args) => { events.push("backup"); return await hostDependencies.createBackup(args); },
    inspectBackup: async (args) => { events.push("inspect"); return await hostDependencies.inspectBackup(args); },
    seedCandidate: async (args) => { events.push("seed"); return await hostDependencies.seedCandidate(args); },
  };
}

async function seedDevelopmentData(dataDir, anchorDate, password, roleCredentialsFile) {
  const result = spawnSync(process.execPath, [
    "scripts/development-data.mjs",
    "seed",
    "--profile", "development",
    "--environment", "development",
    "--data-dir", dataDir,
    "--anchor-date", anchorDate,
    "--role-fixtures", "local-sanitized-demo",
  ], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...process.env,
      LONGTAIL_ENV: "development",
      [ROLE_CREDENTIALS_FILE_ENV]: roleCredentialsFile,
      SUPER_ADMIN_PASSWORD: password,
      SUPER_ADMIN_USERNAME: "original-demo-operator@example.com",
      SUPER_ADMIN_DISPLAY_NAME: "Original Demo Operator",
    },
  });
  assert.equal(result.status, 0, result.stderr || result.stdout || result.error);
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function writeHostRoleCredentials(file, passwords, binding = RT_LTF_DEMO_ROLE_FIXTURE_BINDING) {
  await fs.writeFile(file, `${JSON.stringify({
    binding,
    passwords,
    version: 1,
  }, null, 2)}\n`, "utf8");
}

function functionBlock(source, functionName) {
  const start = source.indexOf(`function ${functionName}(`);
  assert.notEqual(start, -1, `Expected function ${functionName}`);
  const next = source.indexOf("\nfunction ", start + 1);
  return source.slice(start, next === -1 ? undefined : next);
}

async function readWorkflowSources() {
  const directory = ".github/workflows";
  const names = await fs.readdir(directory);
  const sources = await Promise.all(names.map((name) => fs.readFile(path.join(directory, name), "utf8")));
  return sources.join("\n");
}
