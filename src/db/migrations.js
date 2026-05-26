import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";
import { querySql, runSql, sqlText } from "./sqlite.js";

const MIGRATIONS_TABLE = "schema_migrations";

async function runMigrations() {
  await fs.mkdir(config.dataDir, { recursive: true });
  await ensureMigrationsTable();

  const migrations = await readMigrationFiles();
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
  applied_at TEXT NOT NULL
);
`);
}

async function readMigrationFiles() {
  const migrationsDir = config.migrationsDir;
  const entries = await fs.readdir(migrationsDir, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => entry.name)
    .sort();

  return Promise.all(
    files.map(async (fileName) => ({
      fileName,
      name: fileName.replace(/^\d+_/, "").replace(/\.sql$/, ""),
      sql: await fs.readFile(path.join(migrationsDir, fileName), "utf8"),
      version: fileName.split("_")[0],
    })),
  );
}

async function readAppliedVersions() {
  const rows = await querySql(`SELECT version FROM ${MIGRATIONS_TABLE};`);
  return new Set(rows.map((row) => row.version));
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
  const statements = migrations.map((migration) => createRecordMigrationSql(migration));

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
INSERT OR IGNORE INTO ${MIGRATIONS_TABLE} (version, name, applied_at)
VALUES (${sqlText(migration.version)}, ${sqlText(migration.name)}, ${sqlText(new Date().toISOString())});
`;
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

export { runMigrations };
