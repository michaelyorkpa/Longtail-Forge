import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../config.js";
import { listModuleMigrationSources } from "../core/modules/registry.js";
import { querySql, runSql, sqlText } from "./provider.js";

const MIGRATIONS_TABLE = "schema_migrations";
const BASELINE_VERSION = "0.33.5.18.6.5.4";
const BASELINE_MODULE_ID = "core";
const BASELINE_NAME = "current_fresh_start_database";
const CURRENT_SCHEMA_FILE = path.join(config.root, "src", "db", "schema", "current.sql");
const LEGACY_SQLITE_HARDENING_BASELINE_CHECKSUMS = new Set([
  "b7d790032a9d8cd5505ba02fb34478798ae0c28e79ad720f8961de49ef10ae73",
]);
const WORKSPACE_SCOPED_FOREIGN_KEY_REPAIRS = [
  {
    tableName: "lists",
    legacyPatterns: [
      /\bFOREIGN KEY\s*\(\s*client_id\s*\)\s+REFERENCES\s+clients\s*\(\s*client_id\s*\)/i,
      /\bFOREIGN KEY\s*\(\s*project_id\s*\)\s+REFERENCES\s+projects\s*\(\s*project_id\s*\)/i,
    ],
    copyConditions: [
      createWorkspaceParentCondition("client_id", "clients", "id"),
      createWorkspaceParentCondition("project_id", "projects", "id"),
    ],
  },
  {
    tableName: "list_item_catalog",
    legacyPatterns: [
      /\bFOREIGN KEY\s*\(\s*client_id\s*\)\s+REFERENCES\s+clients\s*\(\s*client_id\s*\)/i,
      /\bFOREIGN KEY\s*\(\s*project_id\s*\)\s+REFERENCES\s+projects\s*\(\s*project_id\s*\)/i,
    ],
    copyConditions: [
      createWorkspaceParentCondition("client_id", "clients", "id"),
      createWorkspaceParentCondition("project_id", "projects", "id"),
    ],
  },
  {
    tableName: "task_checklist_items",
    legacyPatterns: [
      /\bFOREIGN KEY\s*\(\s*task_id\s*\)\s+REFERENCES\s+tasks\s*\(\s*task_id\s*\)/i,
    ],
    copyConditions: [
      createWorkspaceParentCondition("task_id", "tasks", "task_id"),
    ],
  },
  {
    tableName: "task_relationships",
    legacyPatterns: [
      /\bFOREIGN KEY\s*\(\s*parent_task_id\s*\)\s+REFERENCES\s+tasks\s*\(\s*task_id\s*\)/i,
      /\bFOREIGN KEY\s*\(\s*child_task_id\s*\)\s+REFERENCES\s+tasks\s*\(\s*task_id\s*\)/i,
    ],
    copyConditions: [
      createWorkspaceParentCondition("parent_task_id", "tasks", "task_id"),
      createWorkspaceParentCondition("child_task_id", "tasks", "task_id"),
    ],
  },
  {
    tableName: "notes",
    legacyPatterns: [
      /\bFOREIGN KEY\s*\(\s*client_id\s*\)\s+REFERENCES\s+clients\s*\(\s*client_id\s*\)/i,
      /\bFOREIGN KEY\s*\(\s*project_id\s*\)\s+REFERENCES\s+projects\s*\(\s*project_id\s*\)/i,
      /\bFOREIGN KEY\s*\(\s*task_id\s*\)\s+REFERENCES\s+tasks\s*\(\s*task_id\s*\)/i,
    ],
    copyConditions: [
      createWorkspaceParentCondition("client_id", "clients", "id"),
      createWorkspaceParentCondition("project_id", "projects", "id"),
      createWorkspaceParentCondition("task_id", "tasks", "task_id"),
    ],
  },
  {
    tableName: "work_resume_state",
    legacyPatterns: [
      /\bFOREIGN KEY\s*\(\s*client_id\s*\)\s+REFERENCES\s+clients\s*\(\s*client_id\s*\)/i,
      /\bFOREIGN KEY\s*\(\s*project_id\s*\)\s+REFERENCES\s+projects\s*\(\s*project_id\s*\)/i,
    ],
    copyConditions: [
      createWorkspaceParentCondition("client_id", "clients", "id"),
      createWorkspaceParentCondition("project_id", "projects", "id"),
    ],
  },
];
const LEGACY_RENAMED_PARENT_REFERENCE_REPAIRS = [
  {
    tableName: "list_items",
    legacyPatterns: [/\bREFERENCES\s+"?lists_legacy_sqlite_hardening_fk"?\b/i],
    copyConditions: [],
  },
  {
    tableName: "list_links",
    legacyPatterns: [/\bREFERENCES\s+"?lists_legacy_sqlite_hardening_fk"?\b/i],
    copyConditions: [],
  },
  {
    tableName: "note_links",
    legacyPatterns: [/\bREFERENCES\s+"?notes_legacy_sqlite_hardening_fk"?\b/i],
    copyConditions: [],
  },
  {
    tableName: "note_revisions",
    legacyPatterns: [/\bREFERENCES\s+"?notes_legacy_sqlite_hardening_fk"?\b/i],
    copyConditions: [],
  },
  {
    tableName: "note_wiki_links",
    legacyPatterns: [/\bREFERENCES\s+"?notes_legacy_sqlite_hardening_fk"?\b/i],
    copyConditions: [],
  },
];

async function runMigrations() {
  await fs.mkdir(config.dataDir, { recursive: true });
  await maybeCopyRegressionBaseline();

  if (!(await tableExists(MIGRATIONS_TABLE)) && !(await hasExistingApplicationSchema())) {
    await applyFreshBaseline();
  }

  await ensureMigrationsTable();
  await repairLegacyUserWorkspacesForeignKey();
  await repairLegacyWorkspaceScopedForeignKeys();
  await repairLegacyRenamedParentReferences();
  await refreshBaselineChecksumAfterSqliteHardeningRepairs();

  if (!(await hasBaselineMarker()) && (await hasExistingApplicationSchema())) {
    if (await canAdoptExistingDatabaseAsBaseline()) {
      await adoptExistingDatabaseAsBaseline();
    } else {
      throw new Error(
        `Existing database predates the ${BASELINE_VERSION} consolidated baseline and does not match the expected current schema. ` +
        `Back up ${config.databaseFile}, then restore from a known-good current backup or start from a fresh database.`,
      );
    }
  }

  await validateBaselineChecksum();

  const migrations = await readMigrationFiles();
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

async function repairLegacyUserWorkspacesForeignKey() {
  const rows = await querySql(`
SELECT sql
FROM sqlite_master
WHERE type = 'table'
  AND name = 'user_workspaces'
LIMIT 1;
`);
  const createSql = rows[0]?.sql || "";

  if (!/\bREFERENCES\s+organizations\b/i.test(createSql)) {
    return;
  }

  await runSql(`
PRAGMA foreign_keys = OFF;
BEGIN TRANSACTION;

ALTER TABLE user_workspaces RENAME TO user_workspaces_legacy_organization_fk;

CREATE TABLE user_workspaces (
  user_workspace_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (user_id, workspace_id),
  FOREIGN KEY (user_id) REFERENCES users(user_id),
  FOREIGN KEY (workspace_id) REFERENCES workspaces(workspace_id)
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
FROM user_workspaces_legacy_organization_fk
WHERE EXISTS (
    SELECT 1
    FROM users
    WHERE users.user_id = user_workspaces_legacy_organization_fk.user_id
  )
  AND EXISTS (
    SELECT 1
    FROM workspaces
    WHERE workspaces.workspace_id = user_workspaces_legacy_organization_fk.workspace_id
  );

DROP TABLE user_workspaces_legacy_organization_fk;

CREATE INDEX IF NOT EXISTS idx_user_workspaces_user_status
ON user_workspaces (user_id, status);
CREATE INDEX IF NOT EXISTS idx_user_workspaces_workspace_status
ON user_workspaces (workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_user_workspaces_user_workspace
ON user_workspaces (user_id, workspace_id);

COMMIT;
PRAGMA foreign_keys = ON;
`);
}

async function repairLegacyWorkspaceScopedForeignKeys() {
  const schemaSql = await fs.readFile(CURRENT_SCHEMA_FILE, "utf8");

  for (const repair of WORKSPACE_SCOPED_FOREIGN_KEY_REPAIRS) {
    if (!(await tableNeedsForeignKeyRepair(repair))) {
      continue;
    }

    await rebuildTableFromCurrentSchema(schemaSql, repair);
  }
}

async function repairLegacyRenamedParentReferences() {
  const schemaSql = await fs.readFile(CURRENT_SCHEMA_FILE, "utf8");

  for (const repair of LEGACY_RENAMED_PARENT_REFERENCE_REPAIRS) {
    if (!(await tableNeedsForeignKeyRepair(repair))) {
      continue;
    }

    await rebuildTableFromCurrentSchema(schemaSql, repair);
  }
}

async function tableNeedsForeignKeyRepair(repair) {
  if (!(await tableExists(repair.tableName))) {
    return false;
  }

  const rows = await querySql(`
SELECT sql
FROM sqlite_master
WHERE type = 'table'
  AND name = ${sqlText(repair.tableName)}
LIMIT 1;
`);
  const createSql = rows[0]?.sql || "";
  return repair.legacyPatterns.some((pattern) => pattern.test(createSql));
}

async function rebuildTableFromCurrentSchema(schemaSql, repair) {
  const legacyTableName = `${repair.tableName}_legacy_sqlite_hardening_fk`;
  const createTableSql = extractCreateTableStatement(schemaSql, repair.tableName);
  const indexSql = extractTableIndexStatements(schemaSql, repair.tableName).join("\n");
  const currentColumns = extractCreateTableColumnNames(createTableSql);
  const oldColumns = await querySql(`PRAGMA table_info(${quoteIdentifier(repair.tableName)});`);
  const oldColumnNames = new Set(oldColumns.map((column) => column.name));
  const copyColumns = currentColumns.filter((columnName) => oldColumnNames.has(columnName));

  if (copyColumns.length === 0) {
    throw new Error(`Cannot rebuild ${repair.tableName}: no matching columns found.`);
  }

  const insertColumnSql = copyColumns.map(quoteIdentifier).join(",\n  ");
  const selectColumnSql = copyColumns.map((columnName) => `legacy.${quoteIdentifier(columnName)}`).join(",\n  ");
  const whereSql = repair.copyConditions.length > 0
    ? `WHERE ${repair.copyConditions.join("\n  AND ")}`
    : "";

  await runSql(`
PRAGMA foreign_keys = OFF;
PRAGMA legacy_alter_table = ON;
BEGIN TRANSACTION;

ALTER TABLE ${quoteIdentifier(repair.tableName)}
RENAME TO ${quoteIdentifier(legacyTableName)};

${createTableSql}

INSERT OR IGNORE INTO ${quoteIdentifier(repair.tableName)} (
  ${insertColumnSql}
)
SELECT
  ${selectColumnSql}
FROM ${quoteIdentifier(legacyTableName)} AS legacy
${whereSql};

DROP TABLE ${quoteIdentifier(legacyTableName)};

${indexSql}

COMMIT;
PRAGMA legacy_alter_table = OFF;
PRAGMA foreign_keys = ON;
`);
}

async function refreshBaselineChecksumAfterSqliteHardeningRepairs() {
  const baseline = await readBaselineSchema();
  const rows = await querySql(`
SELECT checksum
FROM ${MIGRATIONS_TABLE}
WHERE version = ${sqlText(BASELINE_VERSION)}
LIMIT 1;
`);

  const appliedChecksum = rows[0]?.checksum;
  if (!appliedChecksum || appliedChecksum === baseline.checksum) {
    return;
  }

  if (!LEGACY_SQLITE_HARDENING_BASELINE_CHECKSUMS.has(appliedChecksum)) {
    return;
  }

  if (!(await sqliteHardeningForeignKeySchemaIsCurrent())) {
    return;
  }

  await runSql(`
UPDATE ${MIGRATIONS_TABLE}
SET checksum = ${sqlText(baseline.checksum)},
    module_id = ${sqlText(BASELINE_MODULE_ID)},
    name = ${sqlText(BASELINE_NAME)}
WHERE version = ${sqlText(BASELINE_VERSION)};
`);
}

async function sqliteHardeningForeignKeySchemaIsCurrent() {
  for (const repair of [
    ...WORKSPACE_SCOPED_FOREIGN_KEY_REPAIRS,
    ...LEGACY_RENAMED_PARENT_REFERENCE_REPAIRS,
  ]) {
    if (await tableNeedsForeignKeyRepair(repair)) {
      return false;
    }
  }

  const userWorkspaceRows = await querySql(`
SELECT sql
FROM sqlite_master
WHERE type = 'table'
  AND name = 'user_workspaces'
LIMIT 1;
`);

  return !/\bREFERENCES\s+organizations\b/i.test(userWorkspaceRows[0]?.sql || "");
}

async function maybeCopyRegressionBaseline() {
  const baselinePath = process.env.LTF_REGRESSION_BASELINE_DB;

  if (!baselinePath || path.resolve(baselinePath) === path.resolve(config.databaseFile)) {
    return;
  }

  try {
    await fs.access(config.databaseFile);
    return;
  } catch (error) {
    if (error.code !== "ENOENT") {
      throw error;
    }
  }

  await fs.mkdir(path.dirname(config.databaseFile), { recursive: true });
  await fs.copyFile(baselinePath, config.databaseFile);
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

  return migrationGroups
    .flat()
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
  const appliedMigrations = (await readAppliedMigrations()).filter((migration) => migration.version !== BASELINE_VERSION);

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
  const appliedMigrations = (await readAppliedMigrations()).filter((migration) => migration.version !== BASELINE_VERSION);

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

async function canAdoptExistingDatabaseAsBaseline() {
  const historicalRows = await querySql(`
SELECT version
FROM ${MIGRATIONS_TABLE}
WHERE version != ${sqlText(BASELINE_VERSION)}
LIMIT 1;
`);

  if (historicalRows.length === 0) {
    return false;
  }

  const requiredTables = [
    "workspaces",
    "workspace_settings",
    "users",
    "user_workspaces",
    "tasks",
    "task_checklist_items",
    "task_relationships",
    "notes",
    "note_revisions",
    "note_links",
    "lists",
    "list_items",
    "files",
    "file_storage_accounting",
    "notifications",
    "tags",
    "search_index",
    "work_resume_state",
  ];
  const tableRows = await querySql(`
SELECT name
FROM sqlite_master
WHERE type = 'table'
  AND name IN (${requiredTables.map(sqlText).join(", ")});
`);
  const existingTables = new Set(tableRows.map((row) => row.name));

  if (!requiredTables.every((tableName) => existingTables.has(tableName))) {
    return false;
  }

  const columnChecks = [
    ["users", ["active_workspace_id", "protected_user"]],
    ["tasks", ["resume_note", "last_worked_at"]],
    ["notes", ["client_id", "project_id", "note_collection_id", "security_mode"]],
    ["note_links", ["module_id", "target_type", "target_id", "scope_role"]],
    ["lists", ["is_reusable", "source_list_id", "duplicated_from_list_id"]],
    ["list_items", ["catalog_item_id", "purchase_status"]],
    ["files", ["storage_kind", "external_source_provider", "external_availability_status"]],
    ["search_index", ["library_bucket", "tags_text", "visibility"]],
    ["work_resume_state", ["module_id", "record_type", "record_id"]],
  ];

  for (const [tableName, columnNames] of columnChecks) {
    if (!(await columnsExist(tableName, columnNames))) {
      return false;
    }
  }

  return true;
}

async function adoptExistingDatabaseAsBaseline() {
  const baseline = await readBaselineSchema();

  await runSql(`
BEGIN TRANSACTION;
DELETE FROM ${MIGRATIONS_TABLE};
${createRecordMigrationSql(baseline)}
COMMIT;
`);
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
    throw new Error(`Applied ${BASELINE_VERSION} fresh-start database baseline checksum does not match the current schema file.`);
  }
}

async function applyMigration(migration) {
  await runSql(`
BEGIN TRANSACTION;
${migration.sql}
${createRecordMigrationSql(migration)}
COMMIT;
`);
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

function createWorkspaceParentCondition(childColumn, parentTable, parentColumn) {
  return [
    "(",
    `legacy.${quoteIdentifier(childColumn)} IS NULL`,
    `OR legacy.${quoteIdentifier(childColumn)} = ''`,
    "OR EXISTS (",
    "  SELECT 1",
    `  FROM ${quoteIdentifier(parentTable)}`,
    `  WHERE ${quoteIdentifier(parentTable)}.${quoteIdentifier("workspace_id")} = legacy.${quoteIdentifier("workspace_id")}`,
    `    AND ${quoteIdentifier(parentTable)}.${quoteIdentifier(parentColumn)} = legacy.${quoteIdentifier(childColumn)}`,
    ")",
    ")",
  ].join("\n    ");
}

function extractCreateTableStatement(schemaSql, tableName) {
  const tablePattern = escapeRegExp(tableName);
  const pattern = new RegExp(`CREATE\\s+TABLE\\s+(?:"${tablePattern}"|${tablePattern})\\s*\\(`, "i");
  const match = pattern.exec(schemaSql);

  if (!match) {
    throw new Error(`Could not find CREATE TABLE statement for ${tableName}.`);
  }

  return extractSqlStatementAt(schemaSql, match.index);
}

function extractTableIndexStatements(schemaSql, tableName) {
  const tablePattern = escapeRegExp(tableName);
  const onTablePattern = new RegExp(`\\bON\\s+(?:"${tablePattern}"|${tablePattern})\\s*\\(`, "i");
  const indexStatements = schemaSql.match(/CREATE\s+(?:UNIQUE\s+)?INDEX[\s\S]*?;/gi) || [];

  return indexStatements
    .filter((statement) => onTablePattern.test(statement))
    .map((statement) => statement.trim());
}

function extractSqlStatementAt(sql, startIndex) {
  const endIndex = sql.indexOf(";", startIndex);
  if (endIndex === -1) {
    throw new Error("Could not find SQL statement terminator.");
  }

  return sql.slice(startIndex, endIndex + 1).trim();
}

function extractCreateTableColumnNames(createTableSql) {
  const bodyStart = createTableSql.indexOf("(");
  const bodyEnd = createTableSql.lastIndexOf(")");
  const body = createTableSql.slice(bodyStart + 1, bodyEnd);

  return body
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/,$/, ""))
    .filter(Boolean)
    .filter((line) => !/^(PRIMARY|FOREIGN|UNIQUE|CHECK|CONSTRAINT)\b/i.test(line))
    .map(extractLeadingIdentifier)
    .filter(Boolean);
}

function extractLeadingIdentifier(line) {
  const match = /^"([^"]+)"|^`([^`]+)`|^\[([^\]]+)\]|^([A-Za-z_][A-Za-z0-9_]*)/.exec(line);
  return match?.[1] || match?.[2] || match?.[3] || match?.[4] || "";
}

function quoteIdentifier(value) {
  return `"${String(value).replaceAll("\"", "\"\"")}"`;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export { runMigrations };
