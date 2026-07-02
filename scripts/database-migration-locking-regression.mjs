import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { clearTimeout, setTimeout } from "node:timers";

const root = process.cwd();
const appVersion = "0.33.5.21.7.7";
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-db-migration-locking-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-migration-locking.db");
process.env.SUPER_ADMIN_PASSWORD = "Database-Migration-Locking-Test-123!";

const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const databaseDocs = readText("docs/database.md");
const runtimeDocs = readText("docs/runtime-configuration.md");
const roadmap = readText("ROADMAP.md");
const changelog = readText("CHANGELOG.md");
const sqliteAdapterSource = readText("src/db/adapters/sqlite-adapter.js");
const sqliteHelperSource = readText("src/db/sqlite.js");
const dbIndexSource = readText("src/db/index.js");
const migrationsSource = readText("src/db/migrations.js");
const migrationLockSource = readText("src/db/migration-lock.js");
const regressionSuite = readText("scripts/regression-suite.mjs");

const {
  closeDatabase,
  db,
  initializeDatabase,
  querySql,
} = await import("../src/db/index.js");
const { migrationLockPath } = await import("../src/db/migration-lock.js");

try {
  assert.equal(packageJson.version, appVersion, "package.json should report the migration locking version");
  assert.equal(packageLock.version, appVersion, "package-lock root should report the migration locking version");
  assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the migration locking version");

  assert.equal(db.capabilities.migrationLocking, true, "SQLite adapter should report migration locking support");
  assert.equal(db.capabilities.migrationLockStrategy, "lock-file", "SQLite adapter should report the SQLite lock-file strategy");
  assert.match(sqliteAdapterSource, /migrationLocking:\s*true/, "SQLite capabilities should enable migration locking");
  assert.match(sqliteAdapterSource, /migrationLockStrategy:\s*"lock-file"/, "SQLite capabilities should document the lock-file strategy");
  assert.match(migrationsSource, /withMigrationLock\(runMigrationsWithAcquiredLock\)/, "migration runner should acquire the lock before running migrations");
  assert.match(migrationsSource, /async function runMigrationsWithAcquiredLock\(\)[\s\S]*maybeCopyRegressionBaseline[\s\S]*repairLegacyWorkspaceScopedForeignKeys[\s\S]*validateAppliedMigrationChecksums/, "schema repairs and migration validation should run inside the acquired lock");
  assert.match(migrationLockSource, /fs\.open\(lockPath,\s*"wx"\)/, "SQLite migration lock should use exclusive file creation");
  assert.match(migrationLockSource, /\.longtail-forge-migrations\.lock/, "SQLite migration lock file name should be stable");
  assert.match(migrationLockSource, /Another Longtail Forge startup or maintenance process is running migrations or schema repairs/, "held-lock failure should explain the startup ownership conflict");
  assert.match(migrationLockSource, /remove the stale lock file and restart/, "held-lock failure should be actionable");
  assert.match(dbIndexSource, /runSchemaStartupMaintenance\(\)[\s\S]*await runMigrations/, "database startup should isolate schema startup maintenance");
  assert.match(dbIndexSource, /runAppStartupMaintenance\(\)[\s\S]*ensureFrameworkModuleRecord[\s\S]*ensureProtectedUserRoles/, "database startup should keep app defaults separate from schema maintenance");
  assertMigrationScriptsUseExecCompatibilityPath();

  await initializeDatabase();

  await assertLockReleasedAfterSuccessfulStartup();
  await assertSecondStartupFailsClearlyWhileLockHeld();

  assert.match(databaseDocs, /As of version 0\.33\.5\.19\.6[\s\S]*migration lock/, "database docs should describe the migration lock");
  assert.match(databaseDocs, /PostgreSQL[\s\S]*(advisory lock|migration lock table)/, "database docs should document the future PostgreSQL migration lock strategy");
  assert.match(databaseDocs, /Self-hosted SQLite mode[\s\S]*one app process runs startup migrations/, "database docs should document self-hosted startup ownership");
  assert.match(runtimeDocs, /SQLite is the only implemented provider in 0\.33\.5\.19\.9/, "runtime docs should keep SQLite as the only implemented provider");
  assert.match(roadmap, /Completed 0\.33\.5\.19 runtime configuration and SQLite small-office foundation work is archived/, "roadmap should archive the completed migration locking branch");
  assert.match(changelog, new RegExp(`## Version ${escapeRegExp(appVersion)} - `), "changelog should include the migration locking slice");
  assert.match(regressionSuite, /scripts\/database-migration-locking-regression\.mjs/, "regression suite should include migration locking coverage");

  const integrityRows = await querySql("PRAGMA integrity_check;");
  assert.equal(integrityRows[0]?.integrity_check, "ok", "migration locking regression database should pass integrity check");

  console.log("Database migration locking regression passed.");
} finally {
  await closeDatabase();
  await fs.rm(tempDir, { recursive: true, force: true });
}

function assertMigrationScriptsUseExecCompatibilityPath() {
  assert.doesNotMatch(migrationsSource, /db\.transaction|\.transaction\(/, "migration startup should not wrap embedded BEGIN/COMMIT scripts in db.transaction");
  assert.match(sqliteHelperSource, /function executeRunSql[\s\S]*if \(bindings\.hasBindings\)[\s\S]*Parameterized SQLite statements must be single statements[\s\S]*getSqliteDatabase\(\)\.exec\(text\)/, "unbound multi-statement runSql calls should route through better-sqlite3 exec()");
  assert.match(sqliteHelperSource, /function executeQuerySql[\s\S]*if \(statementCount > 1\)[\s\S]*getSqliteDatabase\(\)\.exec\(text\)/, "unbound multi-statement querySql calls should route through better-sqlite3 exec()");

  assert.match(migrationsSource, /async function adoptExistingDatabaseAsBaseline\(\)[\s\S]*await runSql\(`[\s\S]*BEGIN TRANSACTION;[\s\S]*COMMIT;/, "existing database adoption should keep its embedded transaction script");
  assert.match(migrationsSource, /async function applyFreshBaseline\(\)[\s\S]*await runSql\(`[\s\S]*BEGIN TRANSACTION;[\s\S]*COMMIT;/, "fresh baseline should keep its embedded transaction script");
  assert.match(migrationsSource, /async function applyMigration\(migration\)[\s\S]*await runSql\(`[\s\S]*BEGIN TRANSACTION;[\s\S]*COMMIT;/, "future migration application should keep its embedded transaction script");
  assert.match(migrationsSource, /async function repairLegacyWorkspaceScopedForeignKeys\(\)[\s\S]*await runSql\(`[\s\S]*BEGIN TRANSACTION;[\s\S]*COMMIT;/, "legacy workspace-scoped repair should keep its embedded transaction script");
  assert.match(migrationsSource, /await validateAppliedMigrationChecksums\(migrations\);[\s\S]*for \(const migration of migrations\)[\s\S]*await applyMigration\(migration\)/, "checksum validation should still happen before pending migrations apply");
}

async function assertLockReleasedAfterSuccessfulStartup() {
  await assert.rejects(
    () => fs.access(migrationLockPath()),
    /ENOENT/,
    "successful migration startup should release the SQLite migration lock",
  );
}

async function assertSecondStartupFailsClearlyWhileLockHeld() {
  const lockedDatabaseFile = path.join(tempDir, "held-migration-lock.db");
  const holder = spawn(process.execPath, ["--input-type=module", "--eval", `
    process.env.LONGTAIL_DATABASE_FILE = ${JSON.stringify(lockedDatabaseFile)};
    process.env.SUPER_ADMIN_PASSWORD = "Database-Migration-Locking-Test-123!";
    const { withMigrationLock } = await import("./src/db/migration-lock.js");
    await withMigrationLock(async () => {
      console.log("lock-ready");
      await new Promise((resolve) => setTimeout(resolve, 2000));
    });
  `], {
    cwd: root,
    encoding: "utf8",
    env: cleanEnv(),
    stdio: ["ignore", "pipe", "pipe"],
  });

  let holderOutput = "";
  let holderError = "";
  holder.stdout.on("data", (chunk) => {
    holderOutput += chunk.toString();
  });
  holder.stderr.on("data", (chunk) => {
    holderError += chunk.toString();
  });
  const holderExitPromise = waitForExit(holder);

  await waitForOutput(holder, () => holderOutput.includes("lock-ready"));

  const contender = spawnSync(process.execPath, ["--input-type=module", "--eval", `
    process.env.LONGTAIL_DATABASE_FILE = ${JSON.stringify(lockedDatabaseFile)};
    process.env.SUPER_ADMIN_PASSWORD = "Database-Migration-Locking-Test-123!";
    const { closeDatabase, initializeDatabase } = await import("./src/db/index.js");
    try {
      await initializeDatabase();
      await closeDatabase();
      console.error("unexpected migration startup success");
      process.exit(0);
    } catch (error) {
      console.error(error.message || error);
      await closeDatabase().catch(() => {});
      process.exit(1);
    }
  `], {
    cwd: root,
    encoding: "utf8",
    env: cleanEnv(),
  });

  assert.notEqual(contender.status, 0, "a second migration startup should fail while the lock is held");
  const contenderOutput = `${contender.stdout}\n${contender.stderr}`;
  assert.match(contenderOutput, /SQLite migration lock is already held/, "held-lock failure should name the migration lock");
  assert.match(contenderOutput, /migrations or schema repairs/, "held-lock failure should explain why startup is blocked");
  assert.match(contenderOutput, /remove the stale lock file and restart/, "held-lock failure should describe the stale-lock recovery action");

  const holderExit = await holderExitPromise;
  assert.equal(holderExit.code, 0, holderError || holderOutput);

  const lockPath = path.join(path.dirname(lockedDatabaseFile), ".longtail-forge-migrations.lock");
  await assert.rejects(
    () => fs.access(lockPath),
    /ENOENT/,
    "lock holder should release the SQLite migration lock",
  );
}

function waitForOutput(child, isReady) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Timed out waiting for migration lock holder."));
    }, 5000);

    function cleanup() {
      clearTimeout(timeout);
      child.stdout.off("data", onData);
      child.off("exit", onExit);
    }

    function onData() {
      if (isReady()) {
        cleanup();
        resolve();
      }
    }

    function onExit(code) {
      cleanup();
      reject(new Error(`Migration lock holder exited before becoming ready (${code}).`));
    }

    child.stdout.on("data", onData);
    child.on("exit", onExit);
    onData();
  });
}

function waitForExit(child) {
  return new Promise((resolve) => {
    child.once("exit", (code, signal) => {
      resolve({ code, signal });
    });
  });
}

function cleanEnv(overrides = {}) {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (
      key.startsWith("LONGTAIL_") ||
      key.startsWith("SECURE_NOTES_") ||
      key === "DATABASE_URL" ||
      key === "HOST" ||
      key === "PORT" ||
      key === "SQLITE_COMMAND" ||
      key === "SUPER_ADMIN_DISPLAY_NAME" ||
      key === "SUPER_ADMIN_PASSWORD" ||
      key === "SUPER_ADMIN_USERNAME" ||
      key === "TRUST_PROXY" ||
      key === "WORKSPACE_INSTALL_MODE" ||
      key === "WORKSPACE_TYPE_LIMIT"
    ) {
      delete env[key];
    }
  }

  return { ...env, ...overrides };
}

function readText(filePath) {
  return readFileSync(path.join(root, filePath), "utf8");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
