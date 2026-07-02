import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const appVersion = "0.33.5.21.7.4";
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-db-adapter-contract-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-adapter-contract.db");
process.env.SUPER_ADMIN_PASSWORD = "Database-Adapter-Test-123!";

const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const databaseDocs = readText("docs/database.md");
const runtimeDocs = readText("docs/runtime-configuration.md");
const roadmap = readText("ROADMAP.md");
const changelog = readText("CHANGELOG.md");
const coreDatabaseSource = readText("src/core/database.js");
const dbProviderSource = readText("src/db/provider.js");
const sqliteAdapterSource = readText("src/db/adapters/sqlite-adapter.js");
const dbIndexSource = readText("src/db/index.js");
const migrationsSource = readText("src/db/migrations.js");
const appSource = readText("src/core/app.js");
const regressionSuite = readText("scripts/regression-suite.mjs");

const {
  closeDatabase,
  db,
  getSql,
  initializeDatabase,
  querySql,
} = await import("../src/db/index.js");
const coreDatabase = await import("../src/core/database.js");
const { tasksRepository } = await import("../src/modules/tasks/tasks.repo.js");

try {
  assert.equal(packageJson.version, appVersion, "package.json should report the database adapter contract slice version");
  assert.equal(packageLock.version, appVersion, "package-lock root should report the database adapter contract slice version");
  assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the database adapter contract slice version");

  assert.match(dbProviderSource, /function createDatabaseAdapter\(provider\)/, "database provider module should create provider adapters");
  assert.match(dbProviderSource, /provider === "sqlite"[\s\S]*createSqliteAdapter/, "provider module should select the SQLite adapter");
  assert.match(sqliteAdapterSource, /function createSqliteAdapter\(\)/, "SQLite adapter should wrap SQLite process handling");
  assert.match(sqliteAdapterSource, /query\(sql, params = \[\]\)/, "SQLite adapter should expose db.query(sql, params)");
  assert.match(sqliteAdapterSource, /get\(sql, params = \[\]\)/, "SQLite adapter should expose db.get(sql, params)");
  assert.match(sqliteAdapterSource, /run\(sql, params = \[\]\)/, "SQLite adapter should expose db.run(sql, params)");
  assert.match(sqliteAdapterSource, /close: closeSqlite/, "SQLite adapter should expose db.close()");
  assert.match(sqliteAdapterSource, /health: readSqliteHealth/, "SQLite adapter should expose db.health()");
  assert.match(sqliteAdapterSource, /capabilities: SQLITE_CAPABILITIES/, "SQLite adapter should expose db.capabilities");
  assert.match(sqliteAdapterSource, /adapter:\s*"better-sqlite3"/, "SQLite capabilities should report the native driver adapter label");
  assert.doesNotMatch(sqliteAdapterSource, /parameter binding is reserved/, "adapter should not reject bound parameters after the parameterized query pilot");
  assert.match(sqliteAdapterSource, /transactionApi: "callback"/, "adapter capabilities should document callback transactions");
  assert.match(sqliteAdapterSource, /transaction\(callback\)/, "SQLite adapter should expose db.transaction(callback)");
  assert.match(coreDatabaseSource, /from "\.\.\/db\/provider\.js"/, "core database module should be the app-facing provider-neutral import path");
  assert.match(dbIndexSource, /from "\.\/provider\.js"/, "database startup module should consume the provider-neutral facade");
  assert.match(migrationsSource, /from "\.\/provider\.js"/, "migrations should run through the provider-neutral facade");
  assert.match(appSource, /formatDatabaseHealth\(databaseHealth\)/, "startup should log database health through the provider-neutral formatter");
  assert.match(regressionSuite, /scripts\/database-adapter-contract-regression\.mjs/, "regression suite should include database adapter contract coverage");

  assert.equal(db.provider, "sqlite");
  assert.equal(typeof db.query, "function");
  assert.equal(typeof db.get, "function");
  assert.equal(typeof db.run, "function");
  assert.equal(typeof db.close, "function");
  assert.equal(typeof db.health, "function");
  assert.equal(typeof db.transaction, "function", "db.transaction should be available after the transaction helper slice");
  assert.equal(db.capabilities.provider, "sqlite");
  assert.equal(db.capabilities.adapter, "better-sqlite3", "SQLite adapter should report the better-sqlite3 capability label");
  assert.equal(db.capabilities.stringSql, true);
  assert.equal(db.capabilities.parameterizedQueries, true);
  assert.equal(db.capabilities.parameterStyle, "named");
  assert.equal(db.capabilities.transactions, true);
  assert.equal(db.capabilities.transactionApi, "callback");
  assert.equal(db.capabilities.migrationLocking, true, "SQLite adapter should report migration locking support after the migration locking slice");
  assert.equal(db.capabilities.migrationLockStrategy, "lock-file", "SQLite adapter should report its migration lock strategy");

  const paramRow = await db.get("SELECT :value AS value;", { value: "adapter-contract-bound-value" });
  assert.equal(paramRow.value, "adapter-contract-bound-value", "adapter should execute named bound parameters");

  const startupHealth = await initializeDatabase();
  assert.equal(startupHealth.provider, "sqlite", "startup should still initialize SQLite");
  assert.equal(startupHealth.foreignKeysEnabled, true, "startup should keep SQLite foreign keys enabled");
  assert.equal(startupHealth.journalMode, "wal", "startup should keep SQLite WAL as the default");

  const health = await db.health();
  assert.equal(health.provider, "sqlite");
  assert.equal(path.resolve(health.databaseFile), path.resolve(process.env.LONGTAIL_DATABASE_FILE));

  const workspace = await getSql("SELECT workspace_id FROM workspaces ORDER BY created_at LIMIT 1;");
  assert.ok(workspace?.workspace_id, "db.get should return the first row after migrations");
  const migrationRows = await db.query("SELECT version, module_id FROM schema_migrations ORDER BY applied_at LIMIT 1;", []);
  assert.equal(migrationRows[0]?.version, "0.33.5.18.6.5.4", "existing migrations should still run on SQLite");

  const coreWorkspace = await coreDatabase.db.get("SELECT workspace_id FROM workspaces ORDER BY created_at LIMIT 1;");
  assert.equal(coreWorkspace.workspace_id, workspace.workspace_id, "core database facade should share the active provider-neutral db");
  const tasks = await tasksRepository.readAll(workspace.workspace_id);
  assert.deepEqual(tasks, [], "first-party module repositories should be able to query through the provider-neutral database path");

  assertDirectSqliteImportInventory();
  assertUnsupportedProviderFailsClearly();

  assert.match(databaseDocs, /As of version 0\.33\.5\.19\.5[\s\S]*provider-neutral database adapter/, "database docs should describe the adapter contract");
  assert.match(databaseDocs, /Repositories and module services should not import `src\/db\/sqlite\.js` directly/, "database docs should document the direct SQLite import guardrail");
  assert.match(runtimeDocs, /SQLite is the only implemented provider in 0\.33\.5\.19\.9/, "runtime docs should keep SQLite as the only implemented provider");
  assert.match(roadmap, /Completed 0\.33\.5\.19 runtime configuration and SQLite small-office foundation work is archived/, "roadmap should archive the completed adapter contract branch");
  assert.match(changelog, new RegExp(`## Version ${escapeRegExp(appVersion)} - `), "changelog should include the adapter contract slice");

  const integrityRows = await querySql("PRAGMA integrity_check;");
  assert.equal(integrityRows[0]?.integrity_check, "ok", "adapter contract regression database should pass integrity check");

  console.log("Database adapter contract regression passed.");
} finally {
  await closeDatabase();
  await fs.rm(tempDir, { recursive: true, force: true });
}

function assertDirectSqliteImportInventory() {
  const allowed = new Set(["src/db/adapters/sqlite-adapter.js"]);
  const offenders = listSourceFiles(["src", "scripts"])
    .filter((filePath) => /from\s+["'][^"']*sqlite\.js["']/.test(readText(filePath)))
    .map(normalizePath)
    .filter((filePath) => !allowed.has(filePath));

  assert.deepEqual(offenders, [], "only the SQLite adapter should import the raw SQLite helper directly");
}

function assertUnsupportedProviderFailsClearly() {
  const child = spawnSync(process.execPath, ["--input-type=module", "--eval", `
    import "./src/config.js";
  `], {
    cwd: root,
    encoding: "utf8",
    env: cleanEnv({
      LONGTAIL_DATABASE_PROVIDER: "postgres",
      SUPER_ADMIN_PASSWORD: "Database-Adapter-Test-123!",
    }),
  });

  assert.notEqual(child.status, 0, "unsupported providers should fail at startup config");
  assert.match(child.stderr || child.stdout, /LONGTAIL_DATABASE_PROVIDER must be sqlite/, "unsupported provider failure should name the supported provider");
}

function listSourceFiles(directories) {
  const results = [];
  for (const directory of directories) {
    walk(path.join(root, directory), results);
  }
  return results;
}

function walk(currentPath, results) {
  const stat = readStat(currentPath);
  if (!stat) {
    return;
  }

  if (stat.isDirectory()) {
    for (const entry of readDir(currentPath)) {
      walk(path.join(currentPath, entry), results);
    }
    return;
  }

  if (/\.(?:js|mjs)$/.test(currentPath)) {
    results.push(currentPath);
  }
}

function readDir(directory) {
  return readFileSystem(() => fsSync.readdirSync(directory));
}

function readStat(filePath) {
  return readFileSystem(() => fsSync.statSync(filePath));
}

function readFileSystem(callback) {
  try {
    return callback();
  } catch {
    return null;
  }
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
  return readFileSync(path.isAbsolute(filePath) ? filePath : path.join(root, filePath), "utf8");
}

function normalizePath(filePath) {
  return path.relative(root, filePath).replaceAll(path.sep, "/");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
