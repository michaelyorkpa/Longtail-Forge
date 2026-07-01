import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-scale-seed-regression-"));
const disposableDb = path.join(tempDir, "longtail-forge-scale-seed-demo.db");
const seedScript = readText("scripts/seed-scale.mjs");
const regressionSuite = readText("scripts/regression-suite.mjs");

try {
  assertStaticContract();
  assertRefusesImplicitInputs();
  const seedResult = assertDevDemoSeedRuns();
  await assertSeededDatabase(seedResult);
  assertRefusesPreviouslySeededDatabase();
  console.log("Scale seed framework regression passed.");
} finally {
  await closeImportedDatabase();
  await fs.rm(tempDir, { recursive: true, force: true });
}

function assertStaticContract() {
  for (const profileName of [
    "dev-demo",
    "sqlite-small-office-50",
    "sqlite-heavy-workspace",
    "future-saas-postgres-mixed",
  ]) {
    assert.match(seedScript, new RegExp(`"${escapeRegExp(profileName)}"`), `seed script should define ${profileName}`);
  }

  assert.match(seedScript, /Scale seed requires an explicit --provider sqlite argument/, "seed script should require an explicit provider");
  assert.match(seedScript, /Scale seed requires an explicit --database path/, "seed script should require an explicit database path");
  assert.match(seedScript, /Refusing to seed non-disposable database path/, "seed script should refuse non-disposable paths");
  assert.match(seedScript, /scale_seed_runs/, "seed script should mark completed seed runs");
  assert.match(seedScript, /initializeDatabase\(\)/, "seed script should use app startup initialization as sanity coverage");
  assert.match(seedScript, /permissionsService\.can/, "seed script should verify permission sanity through the shipped permission service");
  assert.match(seedScript, /search_index/, "seed script should generate and verify search metadata");
  assert.match(regressionSuite, /scripts\/scale-seed-framework-regression\.mjs/, "regression suite should include scale seed coverage");
}

function assertRefusesImplicitInputs() {
  const missingProvider = runSeed(["--profile", "dev-demo", "--database", disposableDb]);
  assert.notEqual(missingProvider.status, 0, "seed script should fail without --provider");
  assert.match(missingProvider.stderr, /requires an explicit --provider sqlite/, "missing-provider error should be clear");

  const missingDatabase = runSeed(["--profile", "dev-demo", "--provider", "sqlite"]);
  assert.notEqual(missingDatabase.status, 0, "seed script should fail without --database");
  assert.match(missingDatabase.stderr, /requires an explicit --database path/, "missing-database error should be clear");

  const productionPath = path.join(root, "data", "longtail-forge.db");
  const unsafePath = runSeed(["--profile", "dev-demo", "--provider", "sqlite", "--database", productionPath]);
  assert.notEqual(unsafePath.status, 0, "seed script should refuse the normal app database path");
  assert.match(unsafePath.stderr, /Refusing to seed non-disposable database path/, "unsafe-path error should name disposable/test-only requirement");
}

function assertDevDemoSeedRuns() {
  const result = runSeed([
    "--profile",
    "dev-demo",
    "--provider",
    "sqlite",
    "--database",
    disposableDb,
    "--json",
  ]);

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const jsonLine = result.stdout.trim().split(/\r?\n/).findLast((line) => line.trim().startsWith("{"));
  assert.ok(jsonLine, "seed script should print a JSON result");
  const parsed = JSON.parse(jsonLine);

  assert.equal(parsed.ok, true);
  assert.equal(parsed.profile, "dev-demo");
  assert.equal(parsed.provider, "sqlite");
  assert.equal(path.resolve(parsed.database), path.resolve(disposableDb));
  assert.equal(parsed.actualCounts.users, 8);
  assert.equal(parsed.actualCounts.clients, 5);
  assert.equal(parsed.actualCounts.projects, 20);
  assert.equal(parsed.actualCounts.tasks, 80);
  assert.equal(parsed.actualCounts.notes, 60);
  assert.equal(parsed.actualCounts.list_items, 120);
  assert.equal(parsed.actualCounts.files, 24);
  assert.equal(parsed.actualCounts.audit_logs, 200);
  assert.equal(parsed.permissionSanity.superAdminCanManageSettings, true);
  assert.equal(parsed.permissionSanity.workspaceAdminCanViewTasks, true);
  assert.equal(parsed.searchSanity.taskRows, 80);
  assert.equal(parsed.searchSanity.noteRows, 60);
  assert.equal(parsed.startup.foreignKeysEnabled, true);
  assert.ok(parsed.startup.workspaceModules > 0);

  return parsed;
}

async function assertSeededDatabase(seedResult) {
  process.env.LONGTAIL_DATABASE_PROVIDER = "sqlite";
  process.env.LONGTAIL_DATABASE_FILE = disposableDb;
  process.env.LONGTAIL_DATA_DIR = tempDir;
  process.env.SUPER_ADMIN_PASSWORD = "Scale-Seed-Password-123!";
  delete process.env.LTF_REGRESSION_BASELINE_DB;

  const db = await import("../src/db/index.js");
  await db.initializeDatabase();

  const marker = await db.getSql(`
SELECT profile, expected_counts_json
FROM scale_seed_runs
LIMIT 1;
`);
  assert.equal(marker.profile, "dev-demo", "seeded database should include the scale seed marker");
  assert.deepEqual(JSON.parse(marker.expected_counts_json), seedResult.expectedCounts);

  const foreignKeyRows = await db.querySql("PRAGMA foreign_key_check;");
  assert.deepEqual(foreignKeyRows, [], "seeded database should pass SQLite foreign-key checks");

  const searchRow = await db.getSql(`
SELECT title
FROM search_index
WHERE module_id = 'tasks'
  AND record_type = 'task'
  AND title = 'Scale Task 000001'
LIMIT 1;
`);
  assert.equal(searchRow.title, "Scale Task 000001", "seeded search metadata should include task rows");
  await db.closeSqlite();
}

function assertRefusesPreviouslySeededDatabase() {
  const rerun = runSeed([
    "--profile",
    "dev-demo",
    "--provider",
    "sqlite",
    "--database",
    disposableDb,
    "--json",
  ]);

  assert.notEqual(rerun.status, 0, "seed script should refuse to stack another seed run into the same database");
  assert.match(rerun.stderr, /already contains a scale seed run/, "rerun refusal should explain the existing seed marker");
}

function runSeed(args) {
  return spawnSync(process.execPath, ["scripts/seed-scale.mjs", ...args], {
    cwd: root,
    encoding: "utf8",
    env: cleanEnv({
      LONGTAIL_ENV: "test",
      SUPER_ADMIN_PASSWORD: "Scale-Seed-Password-123!",
    }),
  });
}

function cleanEnv(overrides = {}) {
  const env = { ...process.env, ...overrides };
  delete env.LTF_REGRESSION_BASELINE_DB;
  delete env.LONGTAIL_DATABASE_FILE;
  delete env.LONGTAIL_DATABASE_PROVIDER;
  delete env.LONGTAIL_DATA_DIR;
  return { ...env, ...overrides };
}

async function closeImportedDatabase() {
  try {
    const db = await import("../src/db/index.js");
    await db.closeSqlite();
  } catch {
    // Ignore cleanup failures; the temp directory cleanup is best-effort too.
  }
}

function readText(filePath) {
  return readFileSync(path.join(root, filePath), "utf8");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
