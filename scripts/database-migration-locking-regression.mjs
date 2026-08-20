import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { clearTimeout, setTimeout } from "node:timers";
import { createProjectTextReader } from "./test-support/source-scan.mjs";
const { readText } = createProjectTextReader();

const root = process.cwd();
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-db-migration-locking-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-migration-locking.db");
process.env.SUPER_ADMIN_PASSWORD = "Database-Migration-Locking-Test-123!";

const databaseDocs = readText("docs/database.md");
const runtimeDocs = readText("docs/runtime-configuration.md");
const roadmap = readText("ROADMAP.md");
const sqliteAdapterSource = readText("src/db/adapters/sqlite-adapter.js");
const sqliteHelperSource = readText("src/db/sqlite.js");
const dbIndexSource = readText("src/db/index.js");
const appStartupMaintenanceSource = readText("src/db/app-startup-maintenance.js");
const migrationsSource = readText("src/db/migrations.js");
const migrationLockSource = readText("src/db/migration-lock.js");

const {
  closeDatabase,
  db,
  initializeDatabase,
  querySql,
} = await import("../src/db/index.js");
const { migrationLockPath } = await import("../src/db/migration-lock.js");

try {

  assert.equal(db.capabilities.migrationLocking, true, "SQLite adapter should report migration locking support");
  assert.equal(db.capabilities.migrationLockStrategy, "lock-file", "SQLite adapter should report the SQLite lock-file strategy");
  assert.match(sqliteAdapterSource, /migrationLocking:\s*true/, "SQLite capabilities should enable migration locking");
  assert.match(sqliteAdapterSource, /migrationLockStrategy:\s*"lock-file"/, "SQLite capabilities should document the lock-file strategy");
  assert.match(migrationsSource, /withMigrationLock\(runMigrationsWithAcquiredLock\)/, "migration runner should acquire the lock before running migrations");
  assert.match(migrationsSource, /async function runMigrations\(\)[\s\S]*consumeMaterializedVerifiedRegressionBaseline[\s\S]*withMigrationLock\(runMigrationsWithAcquiredLock\)/, "only a runner-materialized verified baseline may bypass migration locking");
  assert.match(migrationsSource, /async function runMigrationsWithAcquiredLock\(\)[\s\S]*repairLegacyWorkspaceScopedForeignKeys[\s\S]*validateAppliedMigrationChecksums/, "normal schema repairs and migration validation should run inside the acquired lock");
  assert.match(migrationLockSource, /fs\.open\(lockPath,\s*"wx"\)/, "SQLite migration lock should use exclusive file creation");
  assert.match(migrationLockSource, /\.longtail-forge-migrations\.lock/, "SQLite migration lock file name should be stable");
  assert.match(migrationLockSource, /Another Longtail Forge startup or maintenance process is running migrations or schema repairs/, "held-lock failure should explain the startup ownership conflict");
  assert.match(migrationLockSource, /remove the stale lock file and restart/, "held-lock failure should be actionable");
  assert.match(dbIndexSource, /createDatabaseStartupActions\(\)[\s\S]*id: "database\.run-migrations"[\s\S]*run: runMigrations[\s\S]*createAppStartupActions/, "database startup should coordinate schema maintenance before application maintenance");
  assert.match(appStartupMaintenanceSource, /createAppStartupActions\(\)[\s\S]*app\.ensure-framework-module[\s\S]*app\.ensure-protected-user-roles/, "application defaults and repairs should have separate lifecycle-owned startup actions");
  assertMigrationScriptsUseExecCompatibilityPath();

  await initializeDatabase();

  await assertLockReleasedAfterSuccessfulStartup();
  await assertSecondStartupFailsClearlyWhileLockHeld();

  assert.match(databaseDocs, /As of version 0\.33\.5\.19\.6[\s\S]*migration lock/, "database docs should describe the migration lock");
  assert.match(databaseDocs, /PostgreSQL[\s\S]*(advisory lock|migration lock table)/, "database docs should document the future PostgreSQL migration lock strategy");
  assert.match(databaseDocs, /Self-hosted SQLite mode[\s\S]*one app process runs startup migrations/, "database docs should document self-hosted startup ownership");
  assert.match(runtimeDocs, /SQLite is the only implemented provider in 0\.33\.5\.19\.9/, "runtime docs should keep SQLite as the only implemented provider");
  assert.doesNotMatch(roadmap, /Completed 0\.33\.5\.19 runtime configuration and SQLite small-office foundation work is archived/, "live roadmap should not carry completed-history breadcrumbs");

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

  assert.match(migrationsSource, /async function runMigrationScriptTransaction\(callback\)[\s\S]*await runSql\("BEGIN TRANSACTION;"\)[\s\S]*await runSql\("COMMIT;"\)[\s\S]*await runSql\("ROLLBACK;"\)/, "baseline and migration scripts should keep explicit transaction ownership while allowing bound metadata writes");
  assert.match(migrationsSource, /async function adoptExistingDatabaseAsBaseline\(\)[\s\S]*await runMigrationScriptTransaction\(async \(\) => \{[\s\S]*await recordMigrationApplied\(baseline\)/, "existing database adoption should keep transactional migration ownership");
  assert.match(migrationsSource, /async function applyFreshBaseline\(\)[\s\S]*await runMigrationScriptTransaction\(async \(\) => \{[\s\S]*await runSql\(baseline\.sql\)[\s\S]*await recordMigrationApplied\(baseline\)/, "fresh baseline should keep schema script execution transactional");
  assert.match(migrationsSource, /async function applyMigration\(migration\)[\s\S]*await runMigrationScriptTransaction\(async \(\) => \{[\s\S]*await runSql\(migration\.sql\)[\s\S]*await recordMigrationApplied\(migration\)/, "future migration application should keep migration SQL execution transactional");
  assert.match(migrationsSource, /async function rebuildTableFromCurrentSchema\(schemaSql, repair\)[\s\S]*await runSql\(`[\s\S]*BEGIN TRANSACTION;[\s\S]*COMMIT;/, "legacy workspace-scoped repair should keep its embedded transaction script");
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
  const releaseMarkerPath = path.join(tempDir, "release-held-migration-lock");
  const holder = spawn(process.execPath, ["--input-type=module", "--eval", `
    process.env.LONGTAIL_DATABASE_FILE = ${JSON.stringify(lockedDatabaseFile)};
    process.env.SUPER_ADMIN_PASSWORD = "Database-Migration-Locking-Test-123!";
    const fs = await import("node:fs/promises");
    const { withMigrationLock } = await import("./src/db/migration-lock.js");
    await withMigrationLock(async () => {
      console.log("lock-ready");
      while (true) {
        try {
          await fs.access(${JSON.stringify(releaseMarkerPath)});
          break;
        } catch (error) {
          if (error?.code !== "ENOENT") throw error;
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
      }
    });
  `], {
    cwd: root,
    env: cleanEnv(),
    stdio: ["ignore", "pipe", "pipe"],
  });

  let holderOutput = "";
  let holderError = "";
  holder.stdout.on("data", (/** @type {Buffer} */ chunk) => {
    holderOutput += chunk.toString();
  });
  holder.stderr.on("data", (/** @type {Buffer} */ chunk) => {
    holderError += chunk.toString();
  });
  const holderExitPromise = waitForExit(holder);

  await waitForOutput(holder, () => holderOutput.includes("lock-ready"));
  const lockPath = path.join(path.dirname(lockedDatabaseFile), ".longtail-forge-migrations.lock");
  const lockMetadata = JSON.parse(await fs.readFile(lockPath, "utf8"));
  assertUuidVersion(/** @type {string} */ (lockMetadata.ownerId), "4", "SQLite migration-lock owner identity");

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
    env: cleanEnv(),
  });

  await fs.writeFile(releaseMarkerPath, "release\n", "utf8");
  assert.notEqual(contender.status, 0, "a second migration startup should fail while the lock is held");
  const contenderOutput = `${contender.stdout}\n${contender.stderr}`;
  assert.match(contenderOutput, /SQLite migration lock is already held/, "held-lock failure should name the migration lock");
  assert.match(contenderOutput, /migrations or schema repairs/, "held-lock failure should explain why startup is blocked");
  assert.match(contenderOutput, /remove the stale lock file and restart/, "held-lock failure should describe the stale-lock recovery action");

  const holderExit = await holderExitPromise;
  assert.equal(holderExit.code, 0, holderError || holderOutput);

  await assert.rejects(
    () => fs.access(lockPath),
    /ENOENT/,
    "lock holder should release the SQLite migration lock",
  );
}

function waitForOutput(/** @type {import("node:child_process").ChildProcess} */ child, /** @type {() => boolean} */ isReady) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error("Timed out waiting for migration lock holder."));
    }, 5000);

    function cleanup() {
      clearTimeout(timeout);
      child.stdout?.off("data", onData);
      child.off("exit", onExit);
    }

    function onData() {
      if (isReady()) {
        cleanup();
        resolve(undefined);
      }
    }

    function onExit(/** @type {string} */ code) {
      cleanup();
      reject(new Error(`Migration lock holder exited before becoming ready (${code}).`));
    }

    child.stdout?.on("data", onData);
    child.on("exit", onExit);
    onData();
  });
}

function waitForExit(/** @type {import("node:child_process").ChildProcess} */ child) {
  return new Promise((resolve) => {
    child.once("exit", (/** @type {string} */ code, /** @type {NodeJS.Signals} */ signal) => {
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

function assertUuidVersion(/** @type {unknown} */ value, /** @type {string} */ expectedVersion, /** @type {string} */ label) {
  assert.match(String(value || ""), /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i, `${label} should be a canonical UUID`);
  assert.equal(String(value)[14], String(expectedVersion), `${label} should use UUIDv${expectedVersion}`);
}
