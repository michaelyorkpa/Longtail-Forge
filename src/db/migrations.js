import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";
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
}

async function readMigrationFiles() {
  const migrationsDir = config.migrationsDir;
  const entries = await fs.readdir(migrationsDir, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => entry.name)
    .sort();

  return Promise.all(files.map(readMigrationFile));
}

async function readMigrationFile(fileName) {
  const sql = await fs.readFile(path.join(config.migrationsDir, fileName), "utf8");

  return {
    checksum: createMigrationChecksum(sql),
    fileName,
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
SET checksum = ${sqlText(migration.checksum)}
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
SELECT version, checksum
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
INSERT OR IGNORE INTO ${MIGRATIONS_TABLE} (version, name, checksum, applied_at)
VALUES (${sqlText(migration.version)}, ${sqlText(migration.name)}, ${sqlText(migration.checksum)}, ${sqlText(new Date().toISOString())});
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
