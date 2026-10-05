import Database from "better-sqlite3";
import fs from "node:fs/promises";
import path from "node:path";
import { normalizeChangedPath } from "./regression-change-routing.mjs";

const BASELINE_SCHEMA_PATH = "src/db/schema/current.sql";
const GENERATED_SCHEMA_PATH = "src/db/schema/current.generated.sql";
const CORE_MIGRATIONS_PATH = "src/db/migrations";
const MIGRATION_FILE_PATTERN = /^(\d{3,})_([a-z][a-z0-9_]*)\.sql$/;

/**
 * One discovered migration file.
 * @typedef {object} MigrationFile
 * @property {string} absolutePath
 * @property {string} fileName
 * @property {string} moduleId
 * @property {string} name
 * @property {string} relativePath
 * @property {string} version
 * @property {number} versionNumber
 */

/**
 * One core/module migration source directory.
 * @typedef {object} MigrationSourceDirectory
 * @property {string} moduleId
 * @property {string} relativeDir
 */

/**
 * The subset of a better-sqlite3 connection the schema snapshot uses.
 * @typedef {object} SqliteDatabaseLike
 * @property {(sql: string) => unknown} exec
 * @property {(pragmaText: string) => unknown} pragma
 * @property {(sql: string) => { all(): unknown[] }} prepare
 * @property {() => unknown} close
 */

/**
 * One sqlite_schema row of the generated snapshot query.
 * @typedef {object} SchemaRow
 * @property {string} type
 * @property {string} name
 * @property {string} tableName
 * @property {string} sql
 */

/**
 * List every core and module migration in canonical order.
 * @param {{ root?: string }} [options]
 * @returns {Promise<readonly MigrationFile[]>}
 */
async function listMigrationFiles({ root = process.cwd() } = {}) {
  /** @type {MigrationSourceDirectory[]} */
  const sources = [
    { moduleId: "core", relativeDir: CORE_MIGRATIONS_PATH },
    ...await listModuleMigrationDirectories(root),
  ];
  /** @type {MigrationFile[]} */
  const migrations = [];

  for (const source of sources) {
    const absoluteDir = path.resolve(root, source.relativeDir);
    let entries;
    try {
      entries = await fs.readdir(absoluteDir, { withFileTypes: true });
    } catch (error) {
      if (/** @type {NodeJS.ErrnoException} */ (error).code === "ENOENT") {
        continue;
      }
      throw error;
    }

    for (const entry of entries.filter((candidate) => candidate.isFile() && candidate.name.endsWith(".sql"))) {
      const match = MIGRATION_FILE_PATTERN.exec(entry.name);
      if (!match) {
        throw new Error(`Migration file ${path.posix.join(source.relativeDir, entry.name)} must match NNN_snake_case_name.sql.`);
      }
      migrations.push(Object.freeze({
        absolutePath: path.join(absoluteDir, entry.name),
        fileName: entry.name,
        moduleId: source.moduleId,
        name: match[2],
        relativePath: path.posix.join(source.relativeDir, entry.name),
        version: match[1],
        versionNumber: Number.parseInt(match[1], 10),
      }));
    }
  }

  assertUniqueMigrationVersions(migrations);
  return Object.freeze(migrations.sort(compareMigrations));
}

/**
 * Discover per-module migration directories beneath src/modules.
 * @param {string} root
 * @returns {Promise<MigrationSourceDirectory[]>}
 */
async function listModuleMigrationDirectories(root) {
  const modulesRoot = path.resolve(root, "src/modules");
  let moduleEntries;
  try {
    moduleEntries = await fs.readdir(modulesRoot, { withFileTypes: true });
  } catch (error) {
    if (/** @type {NodeJS.ErrnoException} */ (error).code === "ENOENT") {
      return [];
    }
    throw error;
  }

  /** @type {MigrationSourceDirectory[]} */
  const sources = [];
  for (const entry of moduleEntries.filter((candidate) => candidate.isDirectory())) {
    const relativeDir = path.posix.join("src/modules", entry.name, "migrations");
    try {
      const stat = await fs.stat(path.resolve(root, relativeDir));
      if (stat.isDirectory()) {
        sources.push({ moduleId: entry.name, relativeDir });
      }
    } catch (error) {
      if (/** @type {NodeJS.ErrnoException} */ (error).code !== "ENOENT") {
        throw error;
      }
    }
  }
  return sources.sort((left, right) => left.moduleId.localeCompare(right.moduleId));
}

/**
 * Reject duplicate migration versions across core and modules.
 * @param {readonly MigrationFile[]} migrations
 */
function assertUniqueMigrationVersions(migrations) {
  const byVersion = new Map();
  for (const migration of migrations) {
    const existing = byVersion.get(migration.version);
    if (existing) {
      throw new Error(`Duplicate migration version ${migration.version}: ${existing.relativePath} and ${migration.relativePath}.`);
    }
    byVersion.set(migration.version, migration);
  }
}

/**
 * Plan the next core migration file for a requested name.
 * @param {string} name
 * @param {readonly MigrationFile[]} migrations
 */
function planMigrationCreation(name, migrations) {
  assertUniqueMigrationVersions(migrations);
  const normalizedName = normalizeMigrationName(name);
  const highestVersion = migrations.reduce((highest, migration) => Math.max(highest, migration.versionNumber), 0);
  const nextNumber = highestVersion + 1;
  const width = Math.max(3, String(nextNumber).length);
  const version = String(nextNumber).padStart(width, "0");
  const fileName = `${version}_${normalizedName}.sql`;
  return Object.freeze({
    fileName,
    name: normalizedName,
    relativePath: path.posix.join(CORE_MIGRATIONS_PATH, fileName),
    sql: migrationTemplate({ name: normalizedName, version }),
    version,
    versionNumber: nextNumber,
  });
}

/**
 * Create the next core migration file from its plan.
 * @param {string} name
 * @param {{ root?: string }} [options]
 */
async function createMigrationFile(name, { root = process.cwd() } = {}) {
  const migrations = await listMigrationFiles({ root });
  const plan = planMigrationCreation(name, migrations);
  const absolutePath = path.resolve(root, plan.relativePath);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });

  try {
    await fs.writeFile(absolutePath, plan.sql, { encoding: "utf8", flag: "wx" });
  } catch (error) {
    if (/** @type {NodeJS.ErrnoException} */ (error).code === "EEXIST") {
      throw new Error(`Migration file already exists: ${plan.relativePath}.`);
    }
    throw error;
  }

  try {
    await listMigrationFiles({ root });
  } catch (error) {
    await fs.rm(absolutePath, { force: true });
    throw error;
  }
  return plan;
}

/**
 * Normalize a human migration name to lowercase snake_case.
 * @param {string} name
 * @returns {string}
 */
function normalizeMigrationName(name) {
  const normalized = String(name || "")
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .replace(/_+/g, "_");
  if (!/^[a-z][a-z0-9_]*$/.test(normalized)) {
    throw new Error("Migration name must contain a letter and normalize to lowercase snake_case.");
  }
  return normalized;
}

/**
 * Header template for a newly created migration file.
 * @param {{ name: string, version: string }} identity
 * @returns {string}
 */
function migrationTemplate({ name, version }) {
  return [
    `-- Migration ${version}: ${name}`,
    "-- Forward-only: do not edit this file after it has been applied.",
    "-- Add the smallest schema or data change needed below; the migration runner owns the transaction.",
    "",
  ].join("\n");
}

/**
 * Apply the baseline plus every migration in memory and snapshot the schema.
 * @param {{ root?: string }} [options]
 */
async function generateCurrentSchema({ root = process.cwd() } = {}) {
  const baselinePath = path.resolve(root, BASELINE_SCHEMA_PATH);
  const baselineSql = await fs.readFile(baselinePath, "utf8");
  const migrations = await listMigrationFiles({ root });
  const database = new Database(":memory:");

  try {
    database.pragma("foreign_keys = ON");
    database.exec(baselineSql);
    for (const migration of migrations) {
      database.exec(await fs.readFile(migration.absolutePath, "utf8"));
    }
    return Object.freeze({
      migrations,
      sql: serializeGeneratedSchema(readSchemaRows(database)),
    });
  } finally {
    database.close();
  }
}

/**
 * Read the ordered, normalized sqlite_schema verification rows.
 * @param {SqliteDatabaseLike} database
 * @returns {SchemaRow[]}
 */
function readSchemaRows(database) {
  return /** @type {SchemaRow[]} */ (database.prepare(`
SELECT type, name, tbl_name AS tableName, sql
FROM sqlite_schema
WHERE sql IS NOT NULL
  AND name NOT LIKE 'sqlite_%'
ORDER BY
  CASE type
    WHEN 'table' THEN 1
    WHEN 'view' THEN 2
    WHEN 'index' THEN 3
    WHEN 'trigger' THEN 4
    ELSE 5
  END,
  name;
`).all());
}

/**
 * Serialize snapshot rows into the generated schema file contents.
 * @param {readonly SchemaRow[]} rows
 * @returns {string}
 */
function serializeGeneratedSchema(rows) {
  const header = [
    "-- GENERATED FILE: final SQLite schema verification snapshot.",
    "-- Source: src/db/schema/current.sql plus ordered core/module migrations.",
    "-- Refresh with: npm run db:schema:refresh",
    "-- Do not edit by hand.",
  ].join("\n");
  const statements = rows.map((row) => `${normalizeSql(row.sql)};`);
  return `${header}\n\n${statements.join("\n\n")}\n`;
}

/**
 * Normalize one schema statement for stable serialization.
 * @param {string} sql
 * @returns {string}
 */
function normalizeSql(sql) {
  return String(sql || "").replaceAll("\r\n", "\n").trim().replace(/;$/, "");
}

/**
 * Regenerate and write the generated schema snapshot.
 * @param {{ root?: string }} [options]
 */
async function refreshGeneratedSchema({ root = process.cwd() } = {}) {
  const generated = await generateCurrentSchema({ root });
  const outputPath = path.resolve(root, GENERATED_SCHEMA_PATH);
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, generated.sql, "utf8");
  return Object.freeze({ ...generated, outputPath });
}

/**
 * Compare the checked-in generated schema against a fresh snapshot.
 * @param {{ root?: string }} [options]
 */
async function checkGeneratedSchema({ root = process.cwd() } = {}) {
  const generated = await generateCurrentSchema({ root });
  const outputPath = path.resolve(root, GENERATED_SCHEMA_PATH);
  let actual;
  try {
    actual = await fs.readFile(outputPath, "utf8");
  } catch (error) {
    if (/** @type {NodeJS.ErrnoException} */ (error).code === "ENOENT") {
      return Object.freeze({ ...generated, actual: "", matches: false, outputPath });
    }
    throw error;
  }
  return Object.freeze({ ...generated, actual, matches: actual === generated.sql, outputPath });
}

/**
 * Guard schema-baseline edits that arrive without a forward migration.
 * @param {{ allowSchemaWithoutMigration?: boolean, changedPaths?: readonly string[] }} [options]
 * @returns {readonly string[]} guard errors
 */
function collectSchemaWorkflowGuardErrors({
  allowSchemaWithoutMigration = false,
  changedPaths = [],
} = {}) {
  const paths = changedPaths.map(normalizeChangedPath).filter(Boolean);
  const baselineChanged = paths.includes(BASELINE_SCHEMA_PATH);
  const migrationChanged = paths.some((filePath) => (
    /^src\/db\/migrations\/[^/]+\.sql$/.test(filePath) ||
    /^src\/modules\/[^/]+\/migrations\/[^/]+\.sql$/.test(filePath)
  ));
  /** @type {string[]} */
  const errors = [];

  if (baselineChanged && !migrationChanged && !allowSchemaWithoutMigration) {
    errors.push(
      `${BASELINE_SCHEMA_PATH} changed without a migration. Add a forward migration or rerun only explicitly allowed test/maintenance work with --allow-schema-without-migration.`,
    );
  }
  return Object.freeze(errors);
}

/**
 * Canonical ordering: version number, then module, then file name.
 * @param {MigrationFile} left
 * @param {MigrationFile} right
 * @returns {number}
 */
function compareMigrations(left, right) {
  return left.versionNumber - right.versionNumber ||
    left.moduleId.localeCompare(right.moduleId) ||
    left.fileName.localeCompare(right.fileName);
}

export {
  BASELINE_SCHEMA_PATH,
  CORE_MIGRATIONS_PATH,
  GENERATED_SCHEMA_PATH,
  MIGRATION_FILE_PATTERN,
  assertUniqueMigrationVersions,
  checkGeneratedSchema,
  collectSchemaWorkflowGuardErrors,
  createMigrationFile,
  generateCurrentSchema,
  listMigrationFiles,
  migrationTemplate,
  normalizeMigrationName,
  planMigrationCreation,
  refreshGeneratedSchema,
  serializeGeneratedSchema,
};
