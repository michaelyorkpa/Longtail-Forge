import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../config.js";
import { listModuleMigrationSources } from "../core/modules/registry.js";
import { querySql, runSql, sqlText } from "./sqlite.js";

const MIGRATIONS_TABLE = "schema_migrations";

async function runMigrations() {
  await fs.mkdir(config.dataDir, { recursive: true });
  await ensureMigrationsTable();

  const migrations = await readMigrationFiles();
  await backfillMissingChecksums(migrations);
  await validateAppliedMigrationChecksums(migrations);
  const appliedVersions = await readAppliedVersions();

  if (appliedVersions.size === 0 && (await hasExistingApplicationSchema())) {
    await baselineExistingSchema(migrations);
    return;
  }

  for (const migration of migrations) {
    if (appliedVersions.has(migration.version)) {
      continue;
    }

    if (await isMigrationAlreadySatisfied(migration)) {
      await recordMigration(migration);
      appliedVersions.add(migration.version);
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

async function readMigrationFiles() {
  const migrationSources = [
    { moduleId: "core", migrationsDir: config.migrationsDir },
    ...listModuleMigrationSources(),
  ];
  const migrationGroups = await Promise.all(migrationSources.map(readMigrationSource));

  return migrationGroups.flat();
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
  const appliedMigrations = await readAppliedMigrations();

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
  const appliedMigrations = await readAppliedMigrations();

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

async function hasExistingApplicationSchema() {
  const rows = await querySql(`
SELECT name
FROM sqlite_master
WHERE type = 'table'
  AND name IN (
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

async function baselineExistingSchema(migrations) {
  const statements = [];

  for (const migration of migrations) {
    if (["010", "011", "012", "013", "014", "015", "016", "017", "018"].includes(migration.version) && !(await isMigrationAlreadySatisfied(migration))) {
      await applyMigration(migration);
      continue;
    }

    statements.push(createRecordMigrationSql(migration));
  }

  if (statements.length === 0) {
    return;
  }

  await runSql(statements.join("\n"));
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

async function isMigrationAlreadySatisfied(migration) {
  if (migration.fileName === "002_add_user_theme_status_protection.sql") {
    return columnsExist("users", ["theme_mode", "user_status", "protected_user"]);
  }

  if (migration.fileName === "003_add_billable_flags.sql") {
    const [clientsSatisfied, projectsSatisfied, timeEntriesSatisfied] = await Promise.all([
      columnsExist("clients", ["billable"]),
      columnsExist("projects", ["billable"]),
      columnsExist("time_entries", ["billable"]),
    ]);

    return clientsSatisfied && projectsSatisfied && timeEntriesSatisfied;
  }

  if (migration.fileName === "004_add_sessions.sql") {
    return tableExists("sessions");
  }

  if (migration.fileName === "010_add_module_registry.sql") {
    const [modulesTableExists, organizationModulesTableExists] = await Promise.all([
      tableExists("modules"),
      tableExists("organization_modules"),
    ]);

    return modulesTableExists && organizationModulesTableExists;
  }

  if (migration.fileName === "011_add_active_timers.sql") {
    return tableExists("active_timers");
  }

  if (migration.fileName === "012_add_user_profile_fields.sql") {
    return columnsExist("users", ["display_name", "alt_email", "timezone"]);
  }

  if (migration.fileName === "013_add_session_timezone.sql") {
    return columnsExist("sessions", ["timezone"]);
  }

  if (migration.fileName === "014_add_workspace_memberships.sql") {
    const [userWorkspacesExists, ownerColumnExists] = await Promise.all([
      tableExists("user_workspaces"),
      columnsExist("organizations", ["owner_user_id"]),
    ]);

    return userWorkspacesExists && ownerColumnExists;
  }

  if (migration.fileName === "015_add_workspace_type.sql") {
    return columnsExist("organizations", ["workspace_type"]);
  }

  if (migration.fileName === "016_add_active_workspace_sessions.sql") {
    return columnsExist("sessions", ["active_workspace_id"]);
  }

  if (migration.fileName === "017_make_client_links_optional.sql") {
    const [projectClientNullable, timeEntryClientNullable] = await Promise.all([
      columnIsNullable("projects", "client_id"),
      columnIsNullable("time_entries", "client_id"),
    ]);

    return projectClientNullable && timeEntryClientNullable;
  }

  if (migration.fileName === "018_add_client_workspace_alias.sql") {
    return columnsExist("clients", ["workspace_id"]);
  }

  return false;
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

async function columnIsNullable(tableName, columnName) {
  const columns = await querySql(`PRAGMA table_info(${tableName});`);
  const column = columns.find((item) => item.name === columnName);

  return Boolean(column) && Number(column.notnull) === 0;
}

export { runMigrations };
