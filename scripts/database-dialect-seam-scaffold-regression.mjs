import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const appVersion = "0.33.5.29.2";
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-db-dialect-seams-"));
process.env.LONGTAIL_DATA_DIR = tempDir;
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-dialect-seams.db");
process.env.SUPER_ADMIN_PASSWORD = "Database-Dialect-Seams-Test-123!";

const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const databaseDocs = readText("docs/database.md");
const auditDocs = readText("docs/database-parameter-binding-audit.md");
const roadmap = readText("ROADMAP.md");
const changelog = readText("CHANGELOG.md");
const providerSource = readText("src/db/provider.js");
const coreDatabaseSource = readText("src/core/database.js");
const sqliteAdapterSource = readText("src/db/adapters/sqlite-adapter.js");
const sqliteDialectSource = readText("src/db/adapters/sqlite-dialect-seams.js");
const regressionSuite = readText("scripts/regression-suite.mjs");

const {
  closeDatabase,
  databaseDialect,
  db,
  getDatabaseDialect,
  initializeDatabaseRuntime,
  querySql,
} = await import("../src/db/index.js");
const coreDatabase = await import("../src/core/database.js");

try {
  assert.equal(packageJson.version, appVersion, "package.json should report the dialect seam scaffold version");
  assert.equal(packageLock.version, appVersion, "package-lock root should report the dialect seam scaffold version");
  assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the dialect seam scaffold version");

  assert.match(sqliteDialectSource, /function createSqliteDialectSeams/, "SQLite dialect seam factory should exist");
  assert.match(sqliteDialectSource, /insertOrIgnoreInto/, "SQLite dialect seams should expose conflict write helpers");
  assert.match(sqliteDialectSource, /collateNoCase/, "SQLite dialect seams should expose case-insensitive helpers");
  assert.match(sqliteDialectSource, /julianday/, "SQLite dialect seams should own timestamp interval lowering");
  assert.match(sqliteDialectSource, /bm25/, "SQLite dialect seams should own FTS ranking lowering");
  assert.match(sqliteDialectSource, /PRAGMA table_info/, "SQLite dialect seams should own introspection lowering");
  assert.match(sqliteAdapterSource, /createSqliteDialectSeams/, "SQLite adapter should create the dialect seam object");
  assert.match(sqliteAdapterSource, /dialect,/, "SQLite adapter and transaction client should expose the dialect object");
  assert.match(providerSource, /const databaseDialect = db\.dialect/, "provider facade should expose a stable databaseDialect binding");
  assert.match(coreDatabaseSource, /databaseDialect/, "core database facade should re-export the dialect seam surface");
  assert.match(regressionSuite, /scripts\/database-dialect-seam-scaffold-regression\.mjs/, "regression suite should include dialect seam scaffold coverage");

  assert.equal(db.provider, "sqlite");
  assert.equal(db.dialect.provider, "sqlite");
  assert.equal(db.dialect.contractVersion, appVersion);
  assert.equal(databaseDialect, db.dialect, "db/index databaseDialect should reference the active adapter dialect");
  assert.equal(getDatabaseDialect(), db.dialect, "getDatabaseDialect should return the active adapter dialect");
  assert.equal(coreDatabase.databaseDialect, db.dialect, "core database facade should expose the active adapter dialect");
  assert.equal(coreDatabase.getDatabaseDialect(), db.dialect, "core database getter should expose the active adapter dialect");
  assert.deepEqual(db.dialect.capabilities, {
    booleanStorage: true,
    caseInsensitiveComparison: true,
    conflictWrites: true,
    fullTextSearch: true,
    introspection: true,
    jsonAccess: false,
    physicalIdentity: true,
    returningRows: true,
    timestampIntervalMath: true,
  }, "SQLite dialect seam capabilities should publish the decided operation groups");

  await initializeDatabaseRuntime();
  await assertConflictAndReturningSeams(db.dialect);
  await assertCaseInsensitiveBooleanAndTimeSeams(db.dialect);
  await assertSearchIdentityAndIntrospectionSeams(db.dialect);
  await assertTransactionClientExposesDialect();
  assertJsonAndValidationSeams(db.dialect);

  assert.match(databaseDocs, /As of version 0\.33\.5\.27\.2[\s\S]*`db\.dialect`[\s\S]*conflict writes[\s\S]*case-insensitive comparison[\s\S]*timestamp math[\s\S]*FTS5[\s\S]*PRAGMA/, "database docs should describe the dialect seam scaffold");
  assert.match(auditDocs, /0\.33\.5\.27\.2 Dialect Seam Scaffold[\s\S]*No application repository conversion happened[\s\S]*1,498 runtime literal-helper invocations/, "audit docs should record the no-burndown seam scaffold");
  assert.doesNotMatch(roadmap, /### Version 0\.33\.5\.27\.2 - Dialect seam scaffold and SQLite proof harness[\s\S]*- \[x\] Add the provider-neutral seam surface[\s\S]*- \[x\] Keep the first pass focused[\s\S]*- \[x\] Add a focused regression/, "live roadmap should archive completed 0.33.5.27 slice bodies");
  assert.match(changelog, /## Version 0\.33\.5\.27\.2 - [\s\S]*dialect seam scaffold[\s\S]*SQLite proof harness/, "changelog should record the dialect seam scaffold slice");

  const integrityRows = await querySql("PRAGMA integrity_check;");
  assert.equal(integrityRows[0]?.integrity_check, "ok", "dialect seam scaffold regression database should pass integrity check");

  console.log("Database dialect seam scaffold regression passed.");
} finally {
  await closeDatabase();
  await fs.rm(tempDir, { recursive: true, force: true });
}

async function assertConflictAndReturningSeams(dialect) {
  await db.run(`
CREATE TABLE dialect_seam_records (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  flag INTEGER,
  created_at TEXT NOT NULL
);
`);

  assert.equal(dialect.conflict.insertOrIgnoreInto("dialect_seam_records"), "INSERT OR IGNORE INTO dialect_seam_records");
  assert.equal(dialect.conflict.onConflictDoNothing(["id"]), "ON CONFLICT(id) DO NOTHING");
  assert.equal(dialect.conflict.onConflictDoUpdateSet(["id"], ["label"]), "ON CONFLICT(id) DO UPDATE SET label = excluded.label");
  assert.equal(dialect.conflict.excludedColumn("label"), "excluded.label");
  assert.equal(dialect.returning.columns(["id", "label"]), "RETURNING id, label");

  await db.run(`
${dialect.conflict.insertOrIgnoreInto("dialect_seam_records")} (id, label, flag, created_at)
VALUES (:id, :label, :flag, :createdAt);
`, {
    createdAt: "2026-07-05T13:00:00.000Z",
    flag: dialect.boolean.bind(true),
    id: "conflict-one",
    label: "Original",
  });
  await db.run(`
${dialect.conflict.insertOrIgnoreInto("dialect_seam_records")} (id, label, flag, created_at)
VALUES (:id, :label, :flag, :createdAt);
`, {
    createdAt: "2026-07-05T13:01:00.000Z",
    flag: dialect.boolean.bind(false),
    id: "conflict-one",
    label: "Ignored duplicate",
  });

  const ignored = await db.get("SELECT label, flag FROM dialect_seam_records WHERE id = :id;", {
    id: "conflict-one",
  });
  assert.deepEqual(ignored, {
    flag: 1,
    label: "Original",
  }, "INSERT OR IGNORE seam should preserve the current SQLite duplicate-ignore behavior");

  const returned = await db.get(`
INSERT INTO dialect_seam_records (id, label, flag, created_at)
VALUES (:id, :label, :flag, :createdAt)
${dialect.conflict.onConflictDoUpdateSet(["id"], ["label"])}
${dialect.returning.columns(["id", "label"])};
`, {
    createdAt: "2026-07-05T13:02:00.000Z",
    flag: dialect.boolean.bind(false),
    id: "conflict-one",
    label: "Updated through upsert",
  });
  assert.deepEqual(returned, {
    id: "conflict-one",
    label: "Updated through upsert",
  }, "RETURNING seam should read the SQLite upsert result row");
}

async function assertCaseInsensitiveBooleanAndTimeSeams(dialect) {
  await db.run(`
INSERT INTO dialect_seam_records (id, label, flag, created_at)
VALUES
  ('case-alpha', 'alpha', 0, '2026-07-05T12:00:00.000Z'),
  ('case-Beta', 'Beta', 1, '2026-07-05T12:30:00.000Z'),
  ('case-gamma', 'gamma', NULL, '2026-07-05T13:00:00.000Z');
`);

  assert.equal(dialect.comparison.collateNoCase("label"), "label COLLATE NOCASE");
  assert.equal(dialect.comparison.equalsNoCase("label", ":label"), "label = :label COLLATE NOCASE");
  assert.equal(dialect.comparison.likeNoCase("label", ":pattern"), "label LIKE :pattern COLLATE NOCASE");
  assert.equal(dialect.comparison.containsNoCase("label", ":pattern"), "label LIKE :pattern COLLATE NOCASE ESCAPE '\\'");
  assert.equal(dialect.comparison.likePattern("b_t%"), "%b\\_t\\%%");
  assert.equal(dialect.comparison.orderByNoCase("label", "DESC"), "label COLLATE NOCASE DESC");
  assert.equal(dialect.boolean.read(1), true);
  assert.equal(dialect.boolean.read(0), false);
  assert.equal(dialect.boolean.read(null), null);
  assert.equal(dialect.time.secondsBetween(":later", ":earlier"), "CAST((julianday(:later) - julianday(:earlier)) * 86400 AS INTEGER)");
  assert.equal(dialect.time.nonNegativeSecondsBetween(":later", ":earlier"), "MAX(0, CAST((julianday(:later) - julianday(:earlier)) * 86400 AS INTEGER))");

  const equalRows = await db.query(`
SELECT id
FROM dialect_seam_records
WHERE ${dialect.comparison.equalsNoCase("label", ":label")}
ORDER BY id;
`, { label: "ALPHA" });
  assert.deepEqual(equalRows.map((row) => row.id), ["case-alpha"], "case-insensitive equality seam should match SQLite NOCASE behavior");

  const likeRows = await db.query(`
SELECT id
FROM dialect_seam_records
WHERE ${dialect.comparison.likeNoCase("label", ":pattern")}
ORDER BY id;
`, { pattern: "b%" });
  assert.deepEqual(likeRows.map((row) => row.id), ["case-Beta"], "case-insensitive LIKE seam should match SQLite NOCASE behavior");

  const orderedRows = await db.query(`
SELECT label
FROM dialect_seam_records
WHERE id LIKE 'case-%'
ORDER BY ${dialect.comparison.orderByNoCase("label", "ASC")}, id;
`);
  assert.deepEqual(orderedRows.map((row) => row.label), ["alpha", "Beta", "gamma"], "case-insensitive ordering seam should preserve SQLite NOCASE ordering");

  const timeRow = await db.get(`
SELECT
  ${dialect.time.secondsBetween(":later", ":earlier")} AS elapsed_seconds,
  ${dialect.time.nonNegativeSecondsBetween(":earlier", ":later")} AS clamped_seconds;
`, {
    earlier: "2026-07-05T12:00:00.000Z",
    later: "2026-07-05T13:00:00.000Z",
  });
  assert.ok(
    Number(timeRow.elapsed_seconds) >= 3599 && Number(timeRow.elapsed_seconds) <= 3600,
    "timestamp seam should lower to SQLite julianday interval math",
  );
  assert.equal(Number(timeRow.clamped_seconds), 0, "non-negative timestamp seam should clamp negative intervals");
}

async function assertSearchIdentityAndIntrospectionSeams(dialect) {
  await db.run(`
CREATE TABLE dialect_identity_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  label TEXT NOT NULL
);
INSERT INTO dialect_identity_records (label)
VALUES ('Identity one');
`);

  assert.equal(dialect.identity.rowId("row_id"), "rowid AS row_id");
  assert.equal(dialect.identity.lastInsertRowId(), "last_insert_rowid()");

  const identityRow = await db.get(`
SELECT
  ${dialect.identity.rowId("row_id")},
  id,
  label
FROM dialect_identity_records
WHERE id = ${dialect.identity.lastInsertRowId()};
`);
  assert.deepEqual(identityRow, {
    id: 1,
    label: "Identity one",
    row_id: 1,
  }, "identity seams should lower to SQLite rowid and last_insert_rowid()");

  await db.run(`
CREATE VIRTUAL TABLE dialect_seam_fts USING fts5(title, body);
INSERT INTO dialect_seam_fts (title, body)
VALUES
  ('Alpha launch', 'The launch checklist is ready.'),
  ('Billing cleanup', 'Archive the invoice notes.');
`);

  assert.equal(dialect.search.match("dialect_seam_fts", ":query"), "dialect_seam_fts MATCH :query");
  assert.equal(dialect.search.rank("dialect_seam_fts"), "bm25(dialect_seam_fts)");
  assert.equal(
    dialect.search.createVirtualTable("dialect_seam_fts_created", [
      { name: "search_index_id", unindexed: true },
      "title",
    ]),
    "CREATE VIRTUAL TABLE IF NOT EXISTS dialect_seam_fts_created USING fts5(\n  search_index_id UNINDEXED,\n  title\n)",
  );
  assert.equal(dialect.search.dropVirtualTable("temp.__ltf_search_fts_probe"), "DROP TABLE IF EXISTS temp.__ltf_search_fts_probe");
  assert.equal(dialect.introspection.tableInfo("dialect_seam_records"), "PRAGMA table_info(dialect_seam_records);");
  assert.equal(dialect.introspection.foreignKeys(), "PRAGMA foreign_keys;");

  const searchRows = await db.query(`
SELECT
  title,
  ${dialect.search.rank("dialect_seam_fts")} AS search_score
FROM dialect_seam_fts
WHERE ${dialect.search.match("dialect_seam_fts", ":query")}
ORDER BY ${dialect.search.rank("dialect_seam_fts")}, ${dialect.identity.rowId()};
`, { query: "alpha" });
  assert.equal(searchRows.length, 1, "FTS seam should find the matching SQLite FTS5 row");
  assert.equal(searchRows[0].title, "Alpha launch");
  assert.equal(typeof searchRows[0].search_score, "number", "FTS rank seam should lower to bm25()");

  const columns = await db.query(dialect.introspection.tableInfo("dialect_seam_records"));
  assert.deepEqual(
    columns.map((column) => column.name),
    ["id", "label", "flag", "created_at"],
    "introspection seam should lower to SQLite PRAGMA table_info",
  );
  const foreignKeys = await db.get(dialect.introspection.foreignKeys());
  assert.ok(Object.hasOwn(foreignKeys, "foreign_keys"), "introspection seam should lower to SQLite PRAGMA foreign_keys");
}

async function assertTransactionClientExposesDialect() {
  await db.transaction(async (transaction) => {
    assert.equal(transaction.dialect, db.dialect, "transaction client should expose the same dialect seam object");
    const row = await transaction.get(`
SELECT ${transaction.dialect.comparison.collateNoCase(":value")} AS value;
`, { value: "Transaction dialect" });
    assert.equal(row.value, "Transaction dialect", "transaction client should execute SQL built with the dialect seam");
  });
}

function assertJsonAndValidationSeams(dialect) {
  assert.equal(dialect.json.supported, false, "JSON SQL access should stay disabled until a runtime need appears");
  assert.throws(
    () => dialect.json.value("payload_json", "$.id"),
    /JSON access seam is not implemented/,
    "JSON helper should fail clearly instead of emitting raw SQLite JSON SQL",
  );
  assert.throws(
    () => dialect.conflict.insertOrIgnoreInto("bad; DROP TABLE dialect_seam_records"),
    /Invalid table name/,
    "identifier-based helpers should reject non-allowlisted table names",
  );
  assert.throws(
    () => dialect.comparison.collateNoCase("label; DELETE FROM dialect_seam_records"),
    /without statement separators or comments/,
    "fragment helpers should reject statement separators",
  );
  assert.throws(
    () => dialect.comparison.orderByNoCase("label", "SIDEWAYS"),
    /Invalid sort direction/,
    "case-insensitive order helper should allowlist sort directions",
  );
}

function readText(filePath) {
  return readFileSync(path.join(root, filePath), "utf8");
}
