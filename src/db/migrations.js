import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../config.js";
import { listModuleMigrationSources } from "../core/modules/registry.js";
import { querySql, runSql, sqlText } from "./sqlite.js";

const MIGRATIONS_TABLE = "schema_migrations";
const BASELINE_VERSION = "0.31.22";
const BASELINE_MODULE_ID = "core";
const BASELINE_NAME = "fresh_start_database";
const LEGACY_MIGRATION_VERSION_CUTOFF = 31;
const CURRENT_SCHEMA_FILE = path.join(config.root, "src", "db", "schema", "current.sql");

async function runMigrations() {
  await fs.mkdir(config.dataDir, { recursive: true });

  if (!(await tableExists(MIGRATIONS_TABLE)) && !(await hasExistingApplicationSchema())) {
    await applyFreshBaseline();
  }

  await ensureMigrationsTable();
  await validateBaselineChecksum();

  if (!(await hasBaselineMarker()) && (await hasExistingApplicationSchema())) {
    await recordExistingCurrentSchemaBaseline();
  }

  const migrations = await readFutureMigrationFiles();
  await backfillMissingChecksums(migrations);
  await validateAppliedMigrationChecksums(migrations);
  const appliedVersions = await readAppliedVersions();

  for (const migration of migrations) {
    if (appliedVersions.has(migration.version)) {
      continue;
    }

    await applyMigration(migration);
    appliedVersions.add(migration.version);
  }
}

async function ensureMigrationsTable() {
  await runSql(`
CREATE TABLE IF NOT EXISTS ${MIGRATIONS_TABLE} (
  version TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  checksum TEXT NOT NULL,
  applied_at TEXT NOT NULL
);
`);

  if (!(await columnsExist(MIGRATIONS_TABLE, ["checksum"]))) {
    await runSql(`ALTER TABLE ${MIGRATIONS_TABLE} ADD COLUMN checksum TEXT;`);
  }

  if (!(await columnsExist(MIGRATIONS_TABLE, ["module_id"]))) {
    await runSql(`ALTER TABLE ${MIGRATIONS_TABLE} ADD COLUMN module_id TEXT NOT NULL DEFAULT 'core';`);
  }
}

async function readFutureMigrationFiles() {
  const migrationSources = [
    { moduleId: "core", migrationsDir: config.migrationsDir },
    ...listModuleMigrationSources(),
  ];
  const migrationGroups = await Promise.all(migrationSources.map(readMigrationSource));

  return migrationGroups
    .flat()
    .filter((migration) => isFutureMigrationVersion(migration.version))
    .sort((left, right) => left.version.localeCompare(right.version) || left.moduleId.localeCompare(right.moduleId));
}

async function readMigrationSource(source) {
  const migrationsDir = normalizeMigrationsDir(source.migrationsDir);
  const entries = await readMigrationDirEntries(migrationsDir);
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => entry.name)
    .sort();

  return Promise.all(files.map((fileName) => readMigrationFile(fileName, source.moduleId, migrationsDir)));
}

async function readMigrationDirEntries(migrationsDir) {
  try {
    return await fs.readdir(migrationsDir, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

function normalizeMigrationsDir(migrationsDir) {
  if (migrationsDir instanceof URL) {
    return fileURLToPath(migrationsDir);
  }

  return migrationsDir;
}

async function readMigrationFile(fileName, moduleId = "core", migrationsDir = config.migrationsDir) {
  const sql = await fs.readFile(path.join(migrationsDir, fileName), "utf8");

  return {
    checksum: createMigrationChecksum(sql),
    fileName,
    moduleId,
    name: fileName.replace(/^\d+_/, "").replace(/\.sql$/, ""),
    sql,
    version: fileName.split("_")[0],
  };
}

async function readAppliedVersions() {
  const rows = await querySql(`SELECT version FROM ${MIGRATIONS_TABLE};`);
  return new Set(rows.map((row) => row.version));
}

async function backfillMissingChecksums(migrations) {
  const migrationByVersion = new Map(
    migrations.map((migration) => [migration.version, migration]),
  );
  const appliedMigrations = (await readAppliedMigrations()).filter(isFutureAppliedMigration);

  for (const appliedMigration of appliedMigrations) {
    if (appliedMigration.checksum) {
      continue;
    }

    const migration = migrationByVersion.get(appliedMigration.version);

    if (!migration) {
      throw new Error(
        `Applied migration ${appliedMigration.version} is missing from ${config.migrationsDir}.`,
      );
    }

    await runSql(`
UPDATE ${MIGRATIONS_TABLE}
SET checksum = ${sqlText(migration.checksum)},
    module_id = ${sqlText(migration.moduleId)}
WHERE version = ${sqlText(migration.version)};
`);
  }
}

async function validateAppliedMigrationChecksums(migrations) {
  const migrationByVersion = new Map(
    migrations.map((migration) => [migration.version, migration]),
  );
  const appliedMigrations = (await readAppliedMigrations()).filter(isFutureAppliedMigration);

  for (const appliedMigration of appliedMigrations) {
    const migration = migrationByVersion.get(appliedMigration.version);

    if (!migration) {
      throw new Error(
        `Applied migration ${appliedMigration.version} is missing from ${config.migrationsDir}.`,
      );
    }

    if (appliedMigration.checksum !== migration.checksum) {
      throw new Error(
        `Applied migration ${migration.fileName} checksum does not match the current migration file.`,
      );
    }
  }
}

async function readAppliedMigrations() {
  return querySql(`
SELECT version, module_id, checksum
FROM ${MIGRATIONS_TABLE};
`);
}

function isFutureAppliedMigration(migration) {
  return isFutureMigrationVersion(migration.version);
}

function isFutureMigrationVersion(version) {
  const versionNumber = Number.parseInt(String(version || "").split(".").pop(), 10);

  return Number.isInteger(versionNumber) && versionNumber > LEGACY_MIGRATION_VERSION_CUTOFF;
}

async function hasExistingApplicationSchema() {
  const rows = await querySql(`
SELECT name
FROM sqlite_master
WHERE type = 'table'
  AND name IN (
    'workspaces',
    'workspace_settings',
    'organizations',
    'organization_settings',
    'users',
    'clients',
    'projects',
    'time_entries'
  );
`);

  return rows.length > 0;
}

async function applyFreshBaseline() {
  const baseline = await readBaselineSchema();

  await runSql(`
BEGIN TRANSACTION;
${baseline.sql}
${createRecordMigrationSql(baseline)}
COMMIT;
`);
}

async function recordExistingCurrentSchemaBaseline() {
  const baseline = await readBaselineSchema();

  if (!(await hasCurrentSchemaTables())) {
    throw new Error(
      "Existing database is not at the current 0.31.22 schema. Restore a backup and upgrade through 0.31.21 before using the fresh-start baseline.",
    );
  }

  await recordMigration(baseline);
}

async function readBaselineSchema() {
  const sql = await fs.readFile(CURRENT_SCHEMA_FILE, "utf8");

  return {
    checksum: createMigrationChecksum(sql),
    fileName: path.basename(CURRENT_SCHEMA_FILE),
    moduleId: BASELINE_MODULE_ID,
    name: BASELINE_NAME,
    sql,
    version: BASELINE_VERSION,
  };
}

async function hasBaselineMarker() {
  const rows = await querySql(`
SELECT version
FROM ${MIGRATIONS_TABLE}
WHERE version = ${sqlText(BASELINE_VERSION)}
LIMIT 1;
`);

  return rows.length > 0;
}

async function validateBaselineChecksum() {
  const baseline = await readBaselineSchema();
  const rows = await querySql(`
SELECT checksum
FROM ${MIGRATIONS_TABLE}
WHERE version = ${sqlText(BASELINE_VERSION)}
LIMIT 1;
`);

  if (rows.length > 0 && rows[0].checksum !== baseline.checksum) {
    throw new Error("Applied fresh-start database baseline checksum does not match the current schema file.");
  }
}

async function hasCurrentSchemaTables() {
  const requiredTables = [
    "active_work_timers",
    "api_key_scopes",
    "api_keys",
    "app_settings",
    "audit_logs",
    "clients",
    "modules",
    "permissions",
    "projects",
    "role_permissions",
    "roles",
    "sessions",
    "task_assignees",
    "task_recurrence_assignees",
    "task_recurrence_templates",
    "task_reminder_offsets",
    "tasks",
    "time_entries",
    "user_role_assignments",
    "user_workspace_creation_permissions",
    "user_workspaces",
    "users",
    "workspace_modules",
    "workspace_settings",
    "workspaces",
  ];
  const legacyTables = ["organizations", "organization_settings", "organization_modules", "active_timers", "active_task_timers"];
  const [requiredChecks, legacyChecks] = await Promise.all([
    Promise.all(requiredTables.map(tableExists)),
    Promise.all(legacyTables.map(tableExists)),
  ]);

  return requiredChecks.every(Boolean) && legacyChecks.every((exists) => !exists);
}

async function applyMigration(migration) {
  await runSql(`
BEGIN TRANSACTION;
${migration.sql}
${createRecordMigrationSql(migration)}
COMMIT;
`);
}

async function recordMigration(migration) {
  await runSql(createRecordMigrationSql(migration));
}

function createRecordMigrationSql(migration) {
  return `
INSERT OR IGNORE INTO ${MIGRATIONS_TABLE} (version, module_id, name, checksum, applied_at)
VALUES (${sqlText(migration.version)}, ${sqlText(migration.moduleId)}, ${sqlText(migration.name)}, ${sqlText(migration.checksum)}, ${sqlText(new Date().toISOString())});
`;
}

function createMigrationChecksum(sql) {
  return createHash("sha256").update(sql).digest("hex");
}

async function tableExists(tableName) {
  const rows = await querySql(`
SELECT name
FROM sqlite_master
WHERE type = 'table'
  AND name = ${sqlText(tableName)}
LIMIT 1;
`);

  return rows.length > 0;
}

async function columnsExist(tableName, columnNames) {
  const columns = await querySql(`PRAGMA table_info(${tableName});`);
  const existingColumnNames = new Set(columns.map((column) => column.name));

  return columnNames.every((columnName) => existingColumnNames.has(columnName));
}

export { runMigrations };
