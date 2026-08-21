export const regressionMeta = Object.freeze({
  id: "database.workspace-cleanup-isolation",
  area: "database",
  tier: "release-gate",
  tags: ["maintenance", "regressions", "sqlite", "workspaces"],
  description: "Protects dry-run-first workspace cleanup, retained-data preservation, and direct/full-suite regression database isolation.",
  runMode: "isolated-database",
});

import assert from "node:assert/strict";

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import Database from "better-sqlite3";
import { captureCanonicalWorkspaceInventory, assertCanonicalWorkspaceInventoryUnchanged } from "../../test-support/canonical-workspace-inventory.mjs";
import { createProjectTextReader } from "../../test-support/source-scan.mjs";
import { requireJsonRecord } from "../../test-support/json-record-assertions.mjs";
const { readText } = createProjectTextReader();

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-workspace-cleanup-isolation-"));
const databaseFile = path.join(tempDir, "workspace-cleanup.db");
const backupFile = path.join(tempDir, "workspace-cleanup.backup.db");

try {
  assertStaticContracts();
  await createFixtureDatabase(databaseFile);
  await assertDryRunAndApply(databaseFile, backupFile);
  await assertNonDisposableRegressionRefusal();
  await assertRepresentativeDirectRunsPreserveCanonicalInventory();
  console.log("Workspace cleanup and regression isolation passed.");
} finally {
  await fs.rm(tempDir, { recursive: true, force: true });
}

function assertStaticContracts() {
  const cleanupSource = readText("scripts/cleanup-development-workspaces.mjs");
  const providerSource = readText("src/db/provider.js");
  const runnerSource = readText("scripts/run-regressions.mjs");
  const safetySource = readText("src/db/regression-database-safety.js");

  assert.match(cleanupSource, /PERSONAL_OWNER_USERNAME = "michaelyork@raymondtec\.com"[\s\S]*personal-membership-username/, "Personal retention should resolve by the confirmed membership identity");
  assert.match(cleanupSource, /Apply mode requires an explicit --database path[\s\S]*requires an explicit --backup path/, "apply should require explicit database and backup paths");
  assert.match(cleanupSource, /database\.backup\(backupFile\)[\s\S]*assertIntegrity\(backupDatabase[\s\S]*backupFingerprint !== expectedInventoryFingerprint/, "backup should be created and verified before cleanup");
  assert.match(cleanupSource, /BEGIN IMMEDIATE[\s\S]*defer_foreign_keys = ON[\s\S]*retainedFingerprintAfter !== plan\.retainedFingerprint[\s\S]*COMMIT[\s\S]*ROLLBACK/, "cleanup should be one rollback-safe transaction with retained-data fingerprint enforcement");
  assert.match(cleanupSource, /repairableByAuthorizedRoleCleanup[\s\S]*--repair-dangling-retained-role-assignments/, "retained role repair should require an explicit narrow flag");
  assert.match(providerSource, /assertRegressionDatabaseTarget\(config\.databaseFile\)/, "the database provider should enforce regression targets before opening a database");
  assert.match(safetySource, /regression\\\.mjs\$[\s\S]*os\.tmpdir\(\)[\s\S]*refused non-disposable target/, "direct regressions should be limited to OS temp databases");
  assert.match(runnerSource, /canonicalWorkspaceInventoryBefore = captureCanonicalWorkspaceInventory\(\)[\s\S]*assertCanonicalWorkspaceInventoryUnchanged/, "the full runner should prove the canonical workspace inventory is unchanged");

  for (const script of [
    "scripts/audit-extensibility-regression.mjs",
    "scripts/clients-projects-framework-read-anatomy-regression.mjs",
    "scripts/dashboard-workbench-regression.mjs",
    "scripts/event-bus-regression.mjs",
    "scripts/linked-context-provider-contract-regression.mjs",
    "scripts/module-file-closeout-regression.mjs",
    "scripts/runtime-configuration-contract-regression.mjs",
    "scripts/search-contract-regression.mjs",
    "scripts/search-fts-repair-regression.mjs",
    "scripts/search-index-sync-regression.mjs",
    "scripts/search-lifecycle-regression.mjs",
    "scripts/search-rebuild-regression.mjs",
    "scripts/version-literal-guardrail-regression.mjs",
    "scripts/view-descriptor-manifest-regression.mjs",
    "scripts/view-descriptor-reference-regression.mjs",
    "scripts/view-shared-capabilities-regression.mjs",
    "scripts/regressions/framework/asset-cache-version.regression.mjs",
    "scripts/regression-contracts/views/dashboard-calendar-embed.contract.mjs",
  ]) {
    const source = readText(script);
    assert.match(source, /createDisposableDatabaseFixture/, `${script} should select a disposable database`);
    assert.doesNotMatch(source, /from "\.\.\/src\/db\/index\.js"/, `${script} should not statically import the database before selecting its fixture`);
  }
}

/** @param {string} targetDatabase @param {string} targetBackup */
async function assertDryRunAndApply(targetDatabase, targetBackup) {
  const before = readWorkspaceState(targetDatabase);
  const dryRun = await runNode([
    "scripts/cleanup-development-workspaces.mjs",
    "--database",
    targetDatabase,
  ]);
  /** @type {{ action?: unknown, backup?: { verified?: unknown }, plan?: { blockingForeignKeyViolations: unknown[], foreignKeyViolations: Array<Record<string, unknown>>, orphanWorkspaceScopes?: unknown, removalWorkspaceCount?: unknown, retainedWorkspaceCount?: unknown }, result?: { foreignKeyCheck?: unknown, integrityCheck?: unknown, removedWorkspaceCount?: unknown, repairedDanglingRoleAssignmentCount?: unknown, retainedWorkspaceCount?: unknown } }} */
  const dryRunReport = requireJsonRecord(JSON.parse(dryRun.stdout), "cleanup dry-run report");
  assert.ok(dryRunReport.plan, "dryRunReport should publish its plan");

  assert.equal(dryRun.exitCode, 0, dryRun.stderr);
  assert.equal(dryRunReport.action, "dry-run");
  assert.equal(dryRunReport.plan.retainedWorkspaceCount, 4);
  assert.equal(dryRunReport.plan.removalWorkspaceCount, 2);
  assert.deepEqual(dryRunReport.plan.orphanWorkspaceScopes, ["orphan-navigation-workspace"]);
  assert.equal(dryRunReport.plan.blockingForeignKeyViolations.length, 1);
  assert.equal(dryRunReport.plan.foreignKeyViolations[0].repairableByAuthorizedRoleCleanup, true);
  assert.deepEqual(readWorkspaceState(targetDatabase), before, "dry-run must not change the database");

  const missingBackup = await runNode([
    "scripts/cleanup-development-workspaces.mjs",
    "--apply",
    "--database",
    targetDatabase,
  ]);
  assert.notEqual(missingBackup.exitCode, 0);
  assert.match(missingBackup.stderr, /requires an explicit --backup path/);
  assert.deepEqual(readWorkspaceState(targetDatabase), before, "refused apply must not change the database");

  const unauthorizedBackup = `${targetBackup}.unauthorized`;
  const unauthorizedRepair = await runNode([
    "scripts/cleanup-development-workspaces.mjs",
    "--apply",
    "--database",
    targetDatabase,
    "--backup",
    unauthorizedBackup,
  ]);
  assert.notEqual(unauthorizedRepair.exitCode, 0);
  assert.match(unauthorizedRepair.stderr, /belong to retained or unscoped data/);
  await assert.rejects(() => fs.access(unauthorizedBackup), "unauthorized repair must stop before backup creation");
  assert.deepEqual(readWorkspaceState(targetDatabase), before, "unauthorized repair must not change the database");

  const applied = await runNode([
    "scripts/cleanup-development-workspaces.mjs",
    "--apply",
    "--database",
    targetDatabase,
    "--backup",
    targetBackup,
    "--repair-dangling-retained-role-assignments",
  ]);
  /** @type {{ action?: unknown, backup?: { verified?: unknown }, plan?: { blockingForeignKeyViolations: unknown[], foreignKeyViolations: Array<Record<string, unknown>>, orphanWorkspaceScopes?: unknown, removalWorkspaceCount?: unknown, retainedWorkspaceCount?: unknown }, result?: { foreignKeyCheck?: unknown, integrityCheck?: unknown, removedWorkspaceCount?: unknown, repairedDanglingRoleAssignmentCount?: unknown, retainedWorkspaceCount?: unknown } }} */
  const appliedReport = requireJsonRecord(JSON.parse(applied.stdout), "cleanup applied report");
  assert.ok(appliedReport.result, "appliedReport should publish its result");
  assert.ok(appliedReport.backup, "appliedReport should publish its backup");

  assert.equal(applied.exitCode, 0, applied.stderr);
  assert.equal(appliedReport.backup.verified, true);
  assert.equal(appliedReport.result.removedWorkspaceCount, 3, "two workspace rows plus one orphan scope should be cleaned");
  assert.equal(appliedReport.result.retainedWorkspaceCount, 4);
  assert.equal(appliedReport.result.integrityCheck, "ok");
  assert.equal(appliedReport.result.foreignKeyCheck, "ok");
  assert.equal(appliedReport.result.repairedDanglingRoleAssignmentCount, 1);
  assert.deepEqual(readWorkspaceNames(targetDatabase), ["Personal", "Raymond Tec", "York Family", "York-Lasher"]);
  assert.deepEqual(readWorkspaceState(targetBackup), before, "the verified backup should preserve the pre-cleanup inventory");
  assert.equal(readForeignKeyViolations(targetDatabase).length, 0);

  const rerun = await runNode([
    "scripts/cleanup-development-workspaces.mjs",
    "--database",
    targetDatabase,
  ]);
  /** @type {{ action?: unknown, backup?: { verified?: unknown }, plan?: { blockingForeignKeyViolations: unknown[], foreignKeyViolations: Array<Record<string, unknown>>, orphanWorkspaceScopes?: unknown, removalWorkspaceCount?: unknown, retainedWorkspaceCount?: unknown }, result?: { foreignKeyCheck?: unknown, integrityCheck?: unknown, removedWorkspaceCount?: unknown, repairedDanglingRoleAssignmentCount?: unknown, retainedWorkspaceCount?: unknown } }} */
  const rerunReport = requireJsonRecord(JSON.parse(rerun.stdout), "cleanup rerun report");
  assert.ok(rerunReport.plan, "rerunReport should publish its plan");
  assert.equal(rerun.exitCode, 0, rerun.stderr);
  assert.equal(rerunReport.plan.removalWorkspaceCount, 0);
  assert.deepEqual(rerunReport.plan.orphanWorkspaceScopes, []);
  assert.deepEqual(rerunReport.plan.blockingForeignKeyViolations, []);
}

async function assertNonDisposableRegressionRefusal() {
  const proofDatabase = path.join(root, "data", "regression-guard-proof.db");
  const proofScript = path.join(tempDir, "unsafe-target-regression.mjs");
  const dbIndexUrl = pathToFileURL(path.join(root, "src", "db", "index.js")).href;
  await fs.rm(proofDatabase, { force: true });
  await fs.writeFile(proofScript, `
process.env.LONGTAIL_DATABASE_FILE = ${JSON.stringify(proofDatabase)};
await import(${JSON.stringify(dbIndexUrl)});
`, "utf8");

  const result = await runNode([proofScript]);
  assert.notEqual(result.exitCode, 0);
  assert.match(result.stderr, /Regression database safety refused non-disposable target/);
  await assert.rejects(() => fs.access(proofDatabase), "the refused target must not be created");
}

async function assertRepresentativeDirectRunsPreserveCanonicalInventory() {
  const before = captureCanonicalWorkspaceInventory();
  const env = { ...process.env };
  delete env.LONGTAIL_DATABASE_FILE;
  delete env.LONGTAIL_DATA_DIR;
  delete env.LTF_REGRESSION_BASELINE_DB;

  for (const script of [
    "scripts/search-fts-repair-regression.mjs",
    "scripts/view-descriptor-bootstrap-regression.mjs",
  ]) {
    const result = await runNode([script], { env });
    assert.equal(result.exitCode, 0, `${script} direct run failed:\n${result.stderr}\n${result.stdout}`);
  }

  const after = captureCanonicalWorkspaceInventory();
  assertCanonicalWorkspaceInventoryUnchanged(before, after);
}

/** @param {string} targetDatabase */
async function createFixtureDatabase(targetDatabase) {
  const database = new Database(targetDatabase);

  try {
    database.exec(readText("src/db/schema/current.generated.sql"));
    database.pragma("foreign_keys = ON");
    seedCoreRows(database);
    seedRetainedRows(database);
    seedRemovalRows(database);
    database.pragma("foreign_keys = OFF");
    database.prepare(`
INSERT INTO user_role_assignments (
  assignment_id, workspace_id, user_id, role_id, scope_type, scope_id,
  client_id, project_id, permission_overrides_json, created_at, updated_at
)
VALUES ('dangling-retained-role', 'raymond-tec', 'missing-user', 'workspace_admin', 'workspace', 'raymond-tec', NULL, NULL, NULL, ?, ?);
`).run(now(), now());
    database.prepare(`
INSERT INTO workspace_modules (workspace_id, module_id, status, enabled_at, disabled_at, updated_at)
VALUES ('orphan-navigation-workspace', 'tasks', 'enabled', ?, NULL, ?);
`).run(now(), now());
    database.pragma("foreign_keys = ON");
  } finally {
    database.close();
  }
}

/** @param {InstanceType<typeof Database>} database */
function seedCoreRows(database) {
  database.prepare(`
INSERT INTO modules (module_id, name, description, category, status, version, created_at, updated_at)
VALUES ('tasks', 'Tasks', '', 'work', 'active', '', ?, ?);
`).run(now(), now());
  database.prepare(`
INSERT INTO roles (role_id, role_name, description, assignable_scope_type, sort_order)
VALUES ('workspace_admin', 'Workspace Admin', '', 'workspace', 1);
`).run();
}

/** @param {InstanceType<typeof Database>} database */
function seedRetainedRows(database) {
  for (const workspace of [
    ["york-family", "York Family", "family", "michael-user"],
    ["york-lasher", "York-Lasher", "family", "michael-user"],
    ["personal-michael", "Personal", "personal", "michael-user"],
    ["raymond-tec", "Raymond Tec", "business", "support-user"],
  ]) {
    insertWorkspace(database, ...(/** @type {[string, string, string, string]} */ (workspace)));
  }
  insertUser(database, "michael-user", "michaelyork@raymondtec.com", "raymond-tec");
  insertUser(database, "support-user", "support@raymondtec.com", "raymond-tec");
  insertMembership(database, "michael-raymond", "michael-user", "raymond-tec");
  insertMembership(database, "michael-personal", "michael-user", "personal-michael");
  insertMembership(database, "michael-york-family", "michael-user", "york-family");
  insertMembership(database, "michael-york-lasher", "michael-user", "york-lasher");
  insertMembership(database, "support-raymond", "support-user", "raymond-tec");
  database.prepare(`
INSERT INTO user_role_assignments (
  assignment_id, workspace_id, user_id, role_id, scope_type, scope_id,
  client_id, project_id, permission_overrides_json, created_at, updated_at
)
VALUES ('retained-role', 'raymond-tec', 'michael-user', 'workspace_admin', 'workspace', 'raymond-tec', NULL, NULL, NULL, ?, ?);
`).run(now(), now());
}

/** @param {InstanceType<typeof Database>} database */
function seedRemovalRows(database) {
  insertWorkspace(database, "fixture-workspace", "Regression Fixture Workspace", "business", "fixture-user");
  insertUser(database, "fixture-user", "fixture@example.test", "fixture-workspace");
  insertMembership(database, "fixture-membership", "fixture-user", "fixture-workspace");
  insertWorkspace(database, "personal-support", "Personal", "personal", "support-user");
  insertMembership(database, "support-personal", "support-user", "personal-support");
  database.prepare(`
INSERT INTO workspace_modules (workspace_id, module_id, status, enabled_at, disabled_at, updated_at)
VALUES ('fixture-workspace', 'tasks', 'enabled', ?, NULL, ?);
`).run(now(), now());
}

/** @param {InstanceType<typeof Database>} database @param {string} workspaceId @param {string} name @param {string} workspaceType @param {string} ownerUserId */
function insertWorkspace(database, workspaceId, name, workspaceType, ownerUserId) {
  database.prepare(`
INSERT INTO workspaces (workspace_id, name, status, workspace_type, owner_user_id, created_at, updated_at)
VALUES (?, ?, 'Active', ?, ?, ?, ?);
`).run(workspaceId, name, workspaceType, ownerUserId, now(), now());
}

/** @param {InstanceType<typeof Database>} database @param {string} userId @param {string} username @param {string} workspaceId */
function insertUser(database, userId, username, workspaceId) {
  database.prepare(`
INSERT INTO users (
  user_id, home_workspace_id, username, display_name, alt_email, timezone, password,
  theme_mode, user_status, protected_user, active_workspace_id, open_external_links_new_tab, theme_auto_source
)
VALUES (?, ?, ?, ?, NULL, 'America/New_York', 'fixture-password', 'light', 'active', 'no', ?, 1, 'system');
`).run(userId, workspaceId, username, username, workspaceId);
}

/** @param {InstanceType<typeof Database>} database @param {string} membershipId @param {string} userId @param {string} workspaceId */
function insertMembership(database, membershipId, userId, workspaceId) {
  database.prepare(`
INSERT INTO user_workspaces (user_workspace_id, user_id, workspace_id, status, created_at, updated_at)
VALUES (?, ?, ?, 'active', ?, ?);
`).run(membershipId, userId, workspaceId, now(), now());
}

/** @param {string} targetDatabase */
function readWorkspaceState(targetDatabase) {
  const database = new Database(targetDatabase, { fileMustExist: true, readonly: true });
  try {
    return {
      memberships: database.prepare("SELECT user_workspace_id, user_id, workspace_id, status FROM user_workspaces ORDER BY user_workspace_id").all(),
      roles: database.prepare("SELECT assignment_id, workspace_id, user_id, role_id FROM user_role_assignments ORDER BY assignment_id").all(),
      workspaces: database.prepare("SELECT workspace_id, name, workspace_type, owner_user_id FROM workspaces ORDER BY workspace_id").all(),
    };
  } finally {
    database.close();
  }
}

/** @param {string} targetDatabase */
function readWorkspaceNames(targetDatabase) {
  const database = new Database(targetDatabase, { fileMustExist: true, readonly: true });
  try {
    return database.prepare("SELECT name FROM workspaces ORDER BY lower(name), workspace_id").all().map((row) => row.name);
  } finally {
    database.close();
  }
}

/** @param {string} targetDatabase */
function readForeignKeyViolations(targetDatabase) {
  const database = new Database(targetDatabase, { fileMustExist: true, readonly: true });
  try {
    return /** @type {unknown[]} */ (database.pragma("foreign_key_check"));
  } finally {
    database.close();
  }
}

/** @param {string[]} args @param {{ env?: NodeJS.ProcessEnv }} [options] */
function runNode(args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, {
      cwd: root,
      env: options.env || process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (exitCode) => resolve({ exitCode, stderr, stdout }));
  });
}

function now() {
  return "2026-07-14T00:00:00.000Z";
}
