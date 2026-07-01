import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const appVersion = "0.33.5.19.9";
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-sqlite-hardening-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-sqlite-hardening.db");
process.env.LONGTAIL_SQLITE_BUSY_TIMEOUT_MS = "2500";
process.env.SUPER_ADMIN_PASSWORD = "SQLite-Hardening-Test-123!";

const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const runtimeDocs = readText("docs/runtime-configuration.md");
const databaseDocs = readText("docs/database.md");
const roadmap = readText("ROADMAP.md");
const changelog = readText("CHANGELOG.md");
const configSource = readText("src/config.js");
const sqliteSource = readText("src/db/sqlite.js");
const dbIndexSource = readText("src/db/index.js");
const schemaSource = readText("src/db/schema/current.sql");
const migrationsSource = readText("src/db/migrations.js");
const appSource = readText("src/core/app.js");
const regressionSuite = readText("scripts/regression-suite.mjs");

const {
  closeSqlite,
  initializeSqliteRuntime,
  querySql,
  runSql,
} = await import("../src/db/index.js");

try {
  assert.equal(packageJson.version, appVersion, "package.json should report the SQLite hardening slice version");
  assert.equal(packageLock.version, appVersion, "package-lock root should report the SQLite hardening slice version");
  assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the SQLite hardening slice version");

  assert.match(runtimeDocs, /`LONGTAIL_SQLITE_FOREIGN_KEYS`[\s\S]*`on`[\s\S]*Must stay enabled/, "runtime docs should document active foreign-key enforcement");
  assert.match(runtimeDocs, /`LONGTAIL_SQLITE_JOURNAL_MODE`[\s\S]*`wal`[\s\S]*WAL/, "runtime docs should document WAL mode");
  assert.match(runtimeDocs, /`LONGTAIL_SQLITE_BUSY_TIMEOUT_MS`[\s\S]*`5000`[\s\S]*busy timeout/, "runtime docs should document the busy timeout");
  assert.match(databaseDocs, /As of version 0\.33\.5\.19\.2[\s\S]*foreign-key enforcement[\s\S]*WAL/, "database docs should describe SQLite hardening");
  assert.match(roadmap, /Completed 0\.33\.5\.19 runtime configuration and SQLite small-office foundation work is archived/, "roadmap should archive the completed SQLite hardening branch");
  assert.match(changelog, new RegExp(`## Version ${escapeRegExp(appVersion)} - `), "changelog should include the SQLite hardening slice");
  assert.match(regressionSuite, /scripts\/sqlite-connection-hardening-regression\.mjs/, "regression suite should include SQLite hardening coverage");

  assert.match(configSource, /LONGTAIL_SQLITE_FOREIGN_KEYS/, "config should read the SQLite foreign-key setting");
  assert.match(configSource, /LONGTAIL_SQLITE_JOURNAL_MODE/, "config should read the SQLite journal mode setting");
  assert.match(configSource, /LONGTAIL_SQLITE_BUSY_TIMEOUT_MS/, "config should read the SQLite busy-timeout setting");
  assert.match(sqliteSource, /PRAGMA foreign_keys = /, "SQLite helper should enable foreign keys for sqlite processes");
  assert.match(sqliteSource, /PRAGMA journal_mode = /, "SQLite helper should configure journal mode during startup");
  assert.match(sqliteSource, /PRAGMA busy_timeout;/, "SQLite helper should report busy timeout during health checks");
  assert.match(dbIndexSource, /ensureFrameworkModuleRecord/, "database startup should seed framework as a real module row for hardened module foreign keys");
  assert.doesNotMatch(schemaSource, /REFERENCES\s+(?:clients|projects|tasks)\s*\(\s*(?:client_id|project_id|task_id)\s*\)/, "fresh schema should not use invalid legacy client/project/task foreign keys");
  assert.match(schemaSource, /FOREIGN KEY \(workspace_id, client_id\) REFERENCES clients\(workspace_id, id\)/, "fresh schema should use workspace-scoped client foreign keys");
  assert.match(schemaSource, /FOREIGN KEY \(workspace_id, project_id\) REFERENCES projects\(workspace_id, id\)/, "fresh schema should use workspace-scoped project foreign keys");
  assert.match(schemaSource, /FOREIGN KEY \(workspace_id, task_id\) REFERENCES tasks\(workspace_id, task_id\)/, "fresh schema should use workspace-scoped task foreign keys");
  assert.match(migrationsSource, /repairLegacyWorkspaceScopedForeignKeys/, "migrations should repair legacy workspace-scoped foreign keys");
  assert.match(migrationsSource, /repairLegacyRenamedParentReferences/, "migrations should repair child tables rewritten to temporary legacy parent names");
  assert.match(migrationsSource, /PRAGMA legacy_alter_table = ON/, "table rebuilds should not rewrite child-table foreign keys to temporary table names");
  assert.match(appSource, /formatDatabaseHealth\(databaseHealth\)/, "server startup should log safe SQLite health output through the provider-neutral formatter");

  assert.equal(readDefaultProvider(), "sqlite", "SQLite should remain the default database provider");
  assertConfigFails({ LONGTAIL_SQLITE_FOREIGN_KEYS: "false" }, /LONGTAIL_SQLITE_FOREIGN_KEYS must be on/);
  assertConfigFails({ LONGTAIL_SQLITE_JOURNAL_MODE: "unknown" }, /LONGTAIL_SQLITE_JOURNAL_MODE must be/);
  assertConfigFails({ LONGTAIL_SQLITE_BUSY_TIMEOUT_MS: "not-a-number" }, /LONGTAIL_SQLITE_BUSY_TIMEOUT_MS must be an integer/);

  const health = await initializeSqliteRuntime();
  assert.equal(health.provider, "sqlite");
  assert.equal(path.resolve(health.databaseFile), path.resolve(process.env.LONGTAIL_DATABASE_FILE));
  assert.equal(health.databaseFileWritable, true);
  assert.equal(health.foreignKeysEnabled, true);
  assert.equal(health.journalMode, "wal");
  assert.equal(health.busyTimeoutMs, 2500);

  await assertForeignKeysRejectOrphans();
  assertInvalidDatabasePathFailsClearly();
  assertCurrentSchemaForeignKeysAreValid();
  assertFrameworkModuleSeedSupportsSearchIndexForeignKey();
  assertLegacyUserWorkspaceForeignKeyRepair();

  console.log("SQLite connection hardening regression passed.");
} finally {
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

async function assertForeignKeysRejectOrphans() {
  await runSql(`
DROP TABLE IF EXISTS ltf_hardening_child;
DROP TABLE IF EXISTS ltf_hardening_parent;

CREATE TABLE ltf_hardening_parent (
  parent_id TEXT PRIMARY KEY
);

CREATE TABLE ltf_hardening_child (
  child_id TEXT PRIMARY KEY,
  parent_id TEXT NOT NULL,
  FOREIGN KEY (parent_id) REFERENCES ltf_hardening_parent(parent_id)
);
`);

  await assert.rejects(
    () => runSql(`
INSERT INTO ltf_hardening_child (child_id, parent_id)
VALUES ('orphan-child', 'missing-parent');
`),
    /FOREIGN KEY constraint failed/,
    "SQLite should reject orphan rows when foreign keys are enabled",
  );

  const foreignKeys = await querySql("PRAGMA foreign_keys;");
  assert.equal(Number(foreignKeys[0]?.foreign_keys), 1, "foreign keys should remain enabled after a failed statement");
}

function assertInvalidDatabasePathFailsClearly() {
  const invalidRoot = path.join(tempDir, "not-a-directory");
  const invalidDatabaseFile = path.join(invalidRoot, "blocked.db");
  spawnSync(process.execPath, ["--input-type=module", "--eval", `
    import fs from "node:fs/promises";
    await fs.writeFile(${JSON.stringify(invalidRoot)}, "not a directory");
  `], {
    cwd: root,
    encoding: "utf8",
  });

  const child = spawnSync(process.execPath, ["--input-type=module", "--eval", `
    import { initializeSqliteRuntime, closeSqlite } from "./src/db/index.js";
    try {
      await initializeSqliteRuntime();
      await closeSqlite();
      console.error("unexpected SQLite startup success");
      process.exit(0);
    } catch (error) {
      console.error(error.message || error);
      process.exit(1);
    }
  `], {
    cwd: root,
    encoding: "utf8",
    env: cleanEnv({
      LONGTAIL_DATABASE_FILE: invalidDatabaseFile,
      LONGTAIL_SQLITE_BUSY_TIMEOUT_MS: "2500",
      SUPER_ADMIN_PASSWORD: "SQLite-Hardening-Test-123!",
    }),
  });

  assert.notEqual(child.status, 0, "invalid SQLite database path should fail startup");
  assert.match(child.stderr || child.stdout, /SQLite database file is not writable/, "invalid database path should fail clearly");
}

function assertLegacyUserWorkspaceForeignKeyRepair() {
  const repairDatabaseFile = path.join(tempDir, "legacy-user-workspaces-fk.db");
  const child = spawnSync(process.execPath, ["--input-type=module", "--eval", `
    process.env.LONGTAIL_DATABASE_FILE = ${JSON.stringify(repairDatabaseFile)};
    process.env.SUPER_ADMIN_PASSWORD = "SQLite-Hardening-Test-123!";
    const { closeSqlite, initializeDatabase, querySql, runSql } = await import("./src/db/index.js");

    await initializeDatabase();
    await runSql(\`
PRAGMA foreign_keys = OFF;
BEGIN TRANSACTION;

ALTER TABLE user_workspaces RENAME TO user_workspaces_current_fk;

CREATE TABLE user_workspaces (
  user_workspace_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (user_id, workspace_id),
  FOREIGN KEY (workspace_id) REFERENCES organizations(id)
);

INSERT OR IGNORE INTO user_workspaces (
  user_workspace_id,
  user_id,
  workspace_id,
  status,
  created_at,
  updated_at
)
SELECT
  user_workspace_id,
  user_id,
  workspace_id,
  status,
  created_at,
  updated_at
FROM user_workspaces_current_fk;

DROP TABLE user_workspaces_current_fk;

COMMIT;
\`);
    await closeSqlite();

    await initializeDatabase();
    const foreignKeys = await querySql("PRAGMA foreign_key_list(user_workspaces);");
    console.log(JSON.stringify([...new Set(foreignKeys.map((row) => row.table))].sort()));
    await closeSqlite();
  `], {
    cwd: root,
    encoding: "utf8",
    env: cleanEnv(),
  });

  assert.equal(child.status, 0, child.stderr || child.stdout);
  assert.deepEqual(JSON.parse(child.stdout.trim()), ["users", "workspaces"], "legacy user_workspaces foreign key should be repaired to current workspace/user references");
}

function assertCurrentSchemaForeignKeysAreValid() {
  const schemaDatabaseFile = path.join(tempDir, "current-schema-foreign-keys.db");
  const child = spawnSync(process.execPath, ["--input-type=module", "--eval", `
    process.env.LONGTAIL_DATABASE_FILE = ${JSON.stringify(schemaDatabaseFile)};
    process.env.SUPER_ADMIN_PASSWORD = "SQLite-Hardening-Test-123!";
    const { closeSqlite, initializeDatabase, querySql } = await import("./src/db/index.js");

    await initializeDatabase();
    const foreignKeyCheck = await querySql("PRAGMA foreign_key_check;");
    console.log(JSON.stringify(foreignKeyCheck));
    await closeSqlite();
  `], {
    cwd: root,
    encoding: "utf8",
    env: cleanEnv(),
  });

  assert.equal(child.status, 0, child.stderr || child.stdout);
  assert.deepEqual(JSON.parse(child.stdout.trim()), [], "current schema should pass SQLite foreign_key_check");
}

function assertFrameworkModuleSeedSupportsSearchIndexForeignKey() {
  const frameworkModuleDatabaseFile = path.join(tempDir, "framework-module-search-index.db");
  const child = spawnSync(process.execPath, ["--input-type=module", "--eval", `
    process.env.LONGTAIL_DATABASE_FILE = ${JSON.stringify(frameworkModuleDatabaseFile)};
    process.env.SUPER_ADMIN_PASSWORD = "SQLite-Hardening-Test-123!";
    const { closeSqlite, initializeDatabase, querySql, runSql } = await import("./src/db/index.js");

    await initializeDatabase();
    const moduleRows = await querySql("SELECT module_id FROM modules WHERE module_id = 'framework';");
    await runSql(\`
INSERT INTO search_index (
  search_index_id,
  workspace_id,
  module_id,
  record_type,
  record_id,
  title,
  indexed_at
)
SELECT
  'sqlite-hardening-framework-help-row',
  workspace_id,
  'framework',
  'help_article',
  'framework.sqlite-hardening',
  'SQLite hardening',
  datetime('now')
FROM workspaces
ORDER BY created_at
LIMIT 1;
\`);
    console.log(JSON.stringify(moduleRows));
    await closeSqlite();
  `], {
    cwd: root,
    encoding: "utf8",
    env: cleanEnv(),
  });

  assert.equal(child.status, 0, child.stderr || child.stdout);
  assert.deepEqual(JSON.parse(child.stdout.trim()), [{ module_id: "framework" }], "framework module should be seeded for search_index foreign keys");
}

function readDefaultProvider() {
  const child = spawnSync(process.execPath, ["--input-type=module", "--eval", `
    import { config } from "./src/config.js";
    console.log(config.databaseProvider);
  `], {
    cwd: root,
    encoding: "utf8",
    env: cleanEnv(),
  });

  assert.equal(child.status, 0, child.stderr || child.stdout);
  return child.stdout.trim();
}

function assertConfigFails(overrides, pattern) {
  const child = spawnSync(process.execPath, ["--input-type=module", "--eval", `
    import "./src/config.js";
  `], {
    cwd: root,
    encoding: "utf8",
    env: cleanEnv(overrides),
  });

  assert.notEqual(child.status, 0, "config import should fail");
  assert.match(child.stderr || child.stdout, pattern);
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
