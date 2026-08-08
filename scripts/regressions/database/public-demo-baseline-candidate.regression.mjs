export const regressionMeta = Object.freeze({
  id: "database.public-demo-baseline-candidate",
  area: "database",
  tier: "release-gate",
  tags: ["demo", "deployment", "files", "migrations", "security", "seed", "sqlite"],
  description: "Proves repeatable dry-run/build/validation and corrupt-state rejection for the non-activating Compose public-demo database-and-Files candidate.",
  runMode: "isolated-database",
});

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { assertRoadmapCursorAtLeast } from "../../lib/roadmap-cursor.mjs";
import { redactDemoError, seedCandidate } from "../../lib/demo-data-operation.mjs";
import {
  PUBLIC_DEMO_CANDIDATE_BUILD_PREFIX,
  PUBLIC_DEMO_CANDIDATE_CONTRACT,
  assertPublicDemoCandidateRuntime,
  parsePublicDemoCandidateArgs,
  preparePublicDemoCandidateContext,
  runPublicDemoCandidateOperation,
  verifyPublicDemoCandidate,
} from "../../lib/public-demo-baseline-candidate.mjs";
import {
  PUBLIC_DEMO_VISITOR_PASSWORDS,
  RT_LTF_DEMO_ROLE_FIXTURE_BINDING,
} from "../../lib/sanitized-demo-role-fixtures.mjs";

const root = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-public-demo-candidate-regression-"));
const dataRoot = path.join(root, "compose-data");
const filesRoot = path.join(dataRoot, "files");
const roleCredentialsFile = path.join(root, "protected", "demo-role-credentials.json");
const privateOperatorPassword = "Candidate-Private-Operator-75319zZ!";
const applicationSecret = "Candidate-App-Secret-94173zZ!";
const appVersion = JSON.parse(await fs.readFile("package.json", "utf8")).version;
const environment = Object.freeze({
  DEMO_MODE: "true",
  LONGTAIL_DEPLOYMENT_MODE: "compose",
  LONGTAIL_ENV: "production",
  LONGTAIL_PUBLIC_URL: "https://demo.longtailforge.com",
  LONGTAIL_SECURE_NOTES_MASTER_KEY: applicationSecret,
  SUPER_ADMIN_PASSWORD: "Different-Application-Bootstrap-71359zZ!",
});
const anchorDate = "2026-08-07";

try {
  assert.equal(parsePublicDemoCandidateArgs([
    "build", "--target", "rt-ltf-demo", "--anchor-date", anchorDate,
    "--data-root", dataRoot, "--role-credentials", roleCredentialsFile, "--dry-run",
  ]).dryRun, true);
  assert.equal(parsePublicDemoCandidateArgs([
    "validate", "--target", "rt-ltf-demo", "--anchor-date", anchorDate,
    "--data-root", dataRoot, "--role-credentials", roleCredentialsFile,
  ]).action, "validate");
  assert.throws(() => parsePublicDemoCandidateArgs([
    "build", "--target", "rt-ltf", "--anchor-date", anchorDate,
    "--data-root", dataRoot, "--role-credentials", roleCredentialsFile,
  ]), /exactly rt-ltf-demo/);
  assert.throws(() => parsePublicDemoCandidateArgs([
    "build", "--target", "rt-ltf-demo", "--target", "rt-ltf-demo", "--anchor-date", anchorDate,
    "--data-root", dataRoot, "--role-credentials", roleCredentialsFile,
  ]), /only once/);
  assert.throws(() => parsePublicDemoCandidateArgs([
    "validate", "--target", "rt-ltf-demo", "--anchor-date", anchorDate,
    "--data-root", dataRoot, "--role-credentials", roleCredentialsFile, "--dry-run",
  ]), /build only/);

  await fs.mkdir(filesRoot, { recursive: true });
  await fs.mkdir(path.dirname(roleCredentialsFile), { recursive: true });
  await fs.writeFile(path.join(dataRoot, "longtail-forge.db"), "active-database-sentinel", "utf8");
  await fs.writeFile(path.join(filesRoot, "active-file.txt"), "active-files-sentinel", "utf8");
  await fs.writeFile(roleCredentialsFile, `${JSON.stringify({
    binding: RT_LTF_DEMO_ROLE_FIXTURE_BINDING,
    passwords: { super_admin: privateOperatorPassword },
    version: 2,
  }, null, 2)}\n`, "utf8");

  const activeBefore = await activeStateDigest(dataRoot);
  const buildContext = await preparePublicDemoCandidateContext({
    action: "build",
    dataRoot,
    environment,
    releaseDir: process.cwd(),
    requireCanonicalDataRoot: false,
    requireRoot: false,
    roleCredentialsFile,
    target: "rt-ltf-demo",
  });
  assert.equal(buildContext.roleFixtures.fixtures.length, 7);
  assert.equal(buildContext.roleFixtures.credentials.get("super_admin").password, privateOperatorPassword);
  assert.deepEqual(
    Object.fromEntries(
      [...buildContext.roleFixtures.credentials.entries()]
        .filter(([roleId]) => roleId !== "super_admin")
        .map(([roleId, fixture]) => [roleId, fixture.password]),
    ),
    PUBLIC_DEMO_VISITOR_PASSWORDS,
  );

  let seedCalls = 0;
  const dryRun = await runPublicDemoCandidateOperation({
    action: "build",
    anchorDate,
    appVersion,
    dryRun: true,
    forbiddenValues: buildContext.forbiddenValues,
    paths: buildContext.paths,
    releaseDir: buildContext.releaseDir,
    roleCredentialsFile,
    roleFixtures: buildContext.roleFixtures,
    dependencies: {
      operationId: () => "dry-run-must-not-create-state",
      repairPermissions: async () => assert.fail("dry run must not repair candidate permissions"),
      seedCandidate: async () => { seedCalls += 1; assert.fail("dry run must not seed"); },
    },
  });
  assert.equal(dryRun.status, "candidate-dry-run-ready");
  assert.equal(seedCalls, 0);
  assert.equal(await exists(buildContext.paths.candidateRoot), false);
  assert.equal((await fs.readdir(dataRoot)).some((entry) => entry.startsWith(PUBLIC_DEMO_CANDIDATE_BUILD_PREFIX)), false);
  assert.equal(await activeStateDigest(dataRoot), activeBefore, "dry run must not touch the active database or Files");

  async function buildCandidate(operationId) {
    return await runPublicDemoCandidateOperation({
      action: "build",
      anchorDate,
      appVersion,
      forbiddenValues: buildContext.forbiddenValues,
      paths: buildContext.paths,
      releaseDir: buildContext.releaseDir,
      roleCredentialsFile,
      roleFixtures: buildContext.roleFixtures,
      dependencies: {
        operationId: () => operationId,
        repairPermissions: async () => {},
        seedCandidate,
      },
    });
  }

  const first = await buildCandidate("11111111-1111-4111-a111-111111111111");
  assert.equal(first.status, "candidate-built");
  assert.equal(first.target, "rt-ltf-demo");
  assert.equal(first.counts.workspaces, 5);
  assert.equal(first.counts.users, 24);
  assert.equal(first.counts.tasks, 400);
  assert.equal(first.counts.notes, 200);
  assert.equal(first.counts.lists, 24);
  assert.equal(first.counts.files, 2);
  assert.equal(first.counts.sessions, 0);
  assert.match(first.semanticFingerprint, /^[a-f0-9]{64}$/);
  assert.match(first.migrationIdentitySha256, /^[a-f0-9]{64}$/);
  assert.equal(await activeStateDigest(dataRoot), activeBefore, "candidate build must not touch the active database or Files");
  const markerFile = path.join(buildContext.paths.candidateRoot, ".longtail-demo-data.json");
  const marker = JSON.parse(await fs.readFile(markerFile, "utf8"));
  assert.equal(marker.candidateContract, PUBLIC_DEMO_CANDIDATE_CONTRACT);
  assert.equal(marker.state, "verified-candidate");
  assert.equal(marker.publicVisitorUserIds.length, 6);
  assert.equal(new Set(marker.publicVisitorUserIds).size, 6);
  assert.doesNotMatch(JSON.stringify(marker), new RegExp(escapeRegExp(privateOperatorPassword)));
  assert.doesNotMatch(JSON.stringify(first), new RegExp(escapeRegExp(applicationSecret)));
  assert.doesNotMatch(JSON.stringify(first), new RegExp(escapeRegExp(dataRoot)));

  const validateContext = await preparePublicDemoCandidateContext({
    action: "validate",
    dataRoot,
    environment,
    releaseDir: process.cwd(),
    requireCanonicalDataRoot: false,
    requireRoot: false,
    roleCredentialsFile,
    target: "rt-ltf-demo",
  });
  const validated = await runPublicDemoCandidateOperation({
    action: "validate",
    anchorDate,
    appVersion,
    forbiddenValues: validateContext.forbiddenValues,
    paths: validateContext.paths,
    releaseDir: validateContext.releaseDir,
    roleCredentialsFile,
    roleFixtures: validateContext.roleFixtures,
  });
  assert.equal(validated.status, "candidate-valid");
  assert.equal(validated.semanticFingerprint, first.semanticFingerprint);
  assert.equal(validated.migrationIdentitySha256, first.migrationIdentitySha256);

  await assert.rejects(buildCandidate("22222222-2222-4222-a222-222222222222"), /already exists/);
  const retainedFirst = path.join(root, "retained-first-candidate");
  await fs.rename(buildContext.paths.candidateRoot, retainedFirst);
  const second = await buildCandidate("33333333-3333-4333-a333-333333333333");
  assert.equal(second.semanticFingerprint, first.semanticFingerprint, "same anchor must reproduce the semantic fingerprint");
  assert.equal(second.migrationIdentitySha256, first.migrationIdentitySha256, "same release must reproduce migration identity");
  assert.deepEqual(second.counts, first.counts);
  assert.equal(await activeStateDigest(dataRoot), activeBefore, "repeat build must leave the active database and Files unchanged");

  async function corruptCandidate(name, mutate, expectedError) {
    const candidateRoot = path.join(root, "corrupt", name);
    await fs.mkdir(path.dirname(candidateRoot), { recursive: true });
    await fs.cp(buildContext.paths.candidateRoot, candidateRoot, { recursive: true });
    await mutate(candidateRoot);
    await assert.rejects(verifyPublicDemoCandidate({
      anchorDate,
      appVersion,
      candidateRoot,
      forbiddenValues: buildContext.forbiddenValues,
      releaseDir: process.cwd(),
      roleFixtures: buildContext.roleFixtures,
    }), expectedError);
  }

  await corruptCandidate("migration", async (candidateRoot) => {
    await withDatabase(candidateRoot, (database) => database.prepare(
      "UPDATE schema_migrations SET checksum = ? WHERE version = (SELECT MAX(version) FROM schema_migrations)",
    ).run("0".repeat(64)));
  }, /migration identity/);
  await corruptCandidate("file-bytes", async (candidateRoot) => {
    await fs.appendFile(path.join(candidateRoot, "files", "seed", "checkout-findings.md"), "corrupt", "utf8");
  }, /size or checksum/);
  await corruptCandidate("extra-file", async (candidateRoot) => {
    await fs.writeFile(path.join(candidateRoot, "files", "untracked.txt"), "extra", "utf8");
  }, /inventories do not match/);
  await corruptCandidate("role", async (candidateRoot) => {
    await withDatabase(candidateRoot, (database) => database.prepare(`
UPDATE user_role_assignments SET role_id = 'client_user'
WHERE user_id = (SELECT user_id FROM users WHERE username = 'role-project-user@example.test');
`).run());
  }, /wrong role, scope/);
  await corruptCandidate("scope", async (candidateRoot) => {
    await withDatabase(candidateRoot, (database) => database.prepare(`
UPDATE user_role_assignments SET scope_type = 'workspace', scope_id = workspace_id, client_id = NULL, project_id = NULL
WHERE user_id = (SELECT user_id FROM users WHERE username = 'role-client-user@example.test');
`).run());
  }, /wrong role, scope/);
  await corruptCandidate("credential-hash", async (candidateRoot) => {
    await withDatabase(candidateRoot, (database) => database.prepare(
      "UPDATE users SET password = ? WHERE username = 'role-workspace-admin@example.test'",
    ).run("$argon2id$v=19$m=65536,t=3,p=1$NBqTO46AQgNS53F_RFgmSA$Du7-QMwD76ISJkDuAIDpD4AGeFRtmqMWnbKv_NtJGco"));
  }, /fixed credential hashes/);
  await corruptCandidate("session", async (candidateRoot) => {
    await withDatabase(candidateRoot, (database) => database.prepare(`
INSERT INTO sessions (
  session_id, home_workspace_id, active_workspace_id, user_id, username,
  timezone, ip_address, expires_at, created_at, updated_at
)
SELECT 'candidate-stale-session', home_workspace_id, active_workspace_id, user_id, username,
  timezone, '127.0.0.1', '2099-01-01T00:00:00.000Z',
  '2026-08-07T12:00:00.000Z', '2026-08-07T12:00:00.000Z'
FROM users WHERE protected_user = 'yes' LIMIT 1;
`).run());
  }, /scenario counts/);
  await corruptCandidate("secure-note", async (candidateRoot) => {
    await withDatabase(candidateRoot, (database) => database.prepare(`
UPDATE notes SET security_mode = 'secure', secure_payload = 'forbidden'
WHERE note_id = (SELECT note_id FROM notes LIMIT 1);
`).run());
  }, /Secure Notes exclusion/);
  await corruptCandidate("analytics", async (candidateRoot) => {
    await withDatabase(candidateRoot, (database) => database.exec("CREATE TABLE analytics_events (event_id TEXT PRIMARY KEY);"));
  }, /analytics, feedback, or interest/);
  await corruptCandidate("marker-time", async (candidateRoot) => {
    const file = path.join(candidateRoot, ".longtail-demo-data.json");
    const value = JSON.parse(await fs.readFile(file, "utf8"));
    value.generatedAt = "not-a-timestamp";
    await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  }, /ownership marker/);
  await corruptCandidate("marker-anchor", async (candidateRoot) => {
    const file = path.join(candidateRoot, ".longtail-demo-data.json");
    const value = JSON.parse(await fs.readFile(file, "utf8"));
    value.anchorDate = "2026-08-06";
    await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  }, /ownership marker/);
  await corruptCandidate("credential", async (candidateRoot) => {
    const file = path.join(candidateRoot, ".longtail-demo-data.json");
    const value = JSON.parse(await fs.readFile(file, "utf8"));
    value.generatedAt = privateOperatorPassword;
    await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  }, /protected credential material/);

  let symlinkProven = false;
  try {
    await corruptCandidate("symlink", async (candidateRoot) => {
      await fs.symlink(
        path.join(candidateRoot, "files", "seed", "checkout-findings.md"),
        path.join(candidateRoot, "files", "seed", "linked.md"),
        "file",
      );
    }, /symbolic link/);
    symlinkProven = true;
  } catch (error) {
    if (!new Set(["EPERM", "EACCES", "UNKNOWN"]).has(error?.code)) throw error;
  }

  await fs.rm(buildContext.paths.candidateRoot, { recursive: true, force: false });
  const partial = path.join(dataRoot, `${PUBLIC_DEMO_CANDIDATE_BUILD_PREFIX}stale`);
  await fs.mkdir(partial);
  await assert.rejects(preparePublicDemoCandidateContext({
    action: "build",
    dataRoot,
    environment,
    releaseDir: process.cwd(),
    requireCanonicalDataRoot: false,
    requireRoot: false,
    roleCredentialsFile,
    target: "rt-ltf-demo",
  }), /partial public-demo candidate/);
  await fs.rm(partial, { recursive: true });

  assert.throws(() => assertPublicDemoCandidateRuntime({
    dataRoot,
    environment: { ...environment, DEMO_MODE: "false" },
    requireCanonicalDataRoot: false,
    requireRoot: false,
    target: "rt-ltf-demo",
  }), /exact production Compose demo profile/);
  assert.throws(() => assertPublicDemoCandidateRuntime({
    dataRoot,
    environment,
    requireCanonicalDataRoot: false,
    requireRoot: false,
    target: "rt-ltf",
  }), /not the named demo installation/);
  assert.equal(await activeStateDigest(dataRoot), activeBefore);

  const [candidateSource, cliSource, hostSource, serverSource, workerSource, roadmap, archive, changelog] = await Promise.all([
    fs.readFile("scripts/lib/public-demo-baseline-candidate.mjs", "utf8"),
    fs.readFile("scripts/public-demo-baseline-candidate.mjs", "utf8"),
    fs.readFile("scripts/demo-data-host.mjs", "utf8"),
    fs.readFile("server.js", "utf8"),
    fs.readFile("worker.js", "utf8"),
    fs.readFile("ROADMAP.md", "utf8"),
    fs.readFile("ROADMAP-ARCHIVE.md", "utf8"),
    fs.readFile("CHANGELOG.md", "utf8"),
  ]);
  assert.match(candidateSource, /PUBLIC_DEMO_ROLE_FIXTURE_MODE/);
  assert.match(candidateSource, /listCandidateMigrationFiles/);
  assert.match(candidateSource, /integrity_check|verifyDemoSeedCandidate/);
  assert.match(candidateSource, /foreign_key_check|verifyDemoSeedCandidate/);
  assert.doesNotMatch(candidateSource, /systemctl|docker compose|stopServices|startServices|createBackup/);
  assert.doesNotMatch(cliSource, /console\.log\([^\n]*(PASSWORD|SECRET|TOKEN|MASTER_KEY|PRIVATE_KEY)/);
  for (const normalSource of [hostSource, serverSource, workerSource]) {
    assert.doesNotMatch(normalSource, /public-demo-baseline-candidate\.mjs|demo:baseline:candidate/);
  }
  assertRoadmapCursorAtLeast("0.33.31.7", "public-demo candidate closeout", roadmap);
  assert.doesNotMatch(roadmap, /^### Version 0\.33\.31\.6\b/m);
  assert.match(archive, /^## Version 0\.33\.31\.6 - Deterministic public baseline candidate$/m);
  assert.match(changelog, /^## Version 0\.33\.31\.6 - 2026-08-07$/m);
  assert.ok(symlinkProven || candidateSource.includes("isSymbolicLink"));
  assert.equal(
    redactDemoError(new Error(`${privateOperatorPassword} ${dataRoot}`), [privateOperatorPassword, dataRoot]),
    "[protected] [protected]",
  );

  console.log("Public-demo baseline candidate regression passed.");
} finally {
  await fs.rm(root, { recursive: true, force: true });
}

async function withDatabase(candidateRoot, callback) {
  const database = new Database(path.join(candidateRoot, "longtail-forge.db"));
  try {
    return await callback(database);
  } finally {
    database.close();
  }
}

async function activeStateDigest(dataRoot) {
  const hash = createHash("sha256");
  for (const relative of ["longtail-forge.db", "files/active-file.txt"]) {
    hash.update(relative);
    hash.update(await fs.readFile(path.join(dataRoot, ...relative.split("/"))));
  }
  return hash.digest("hex");
}

async function exists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
