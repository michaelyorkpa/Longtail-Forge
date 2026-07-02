import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const appVersion = "0.33.5.21.2";
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-db-result-fidelity-"));
process.env.LONGTAIL_DATA_DIR = tempDir;
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-result-fidelity.db");
process.env.SUPER_ADMIN_PASSWORD = "Database-Result-Fidelity-Test-123!";

const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const databaseDocs = readText("docs/database.md");
const runtimeDocs = readText("docs/runtime-configuration.md");
const sqliteDocs = readText("docs/sqlite-small-office-mode.md");
const roadmap = readText("ROADMAP.md");
const changelog = readText("CHANGELOG.md");
const sqliteSource = readText("src/db/sqlite.js");
const sqliteAdapterSource = readText("src/db/adapters/sqlite-adapter.js");
const regressionSuite = readText("scripts/regression-suite.mjs");

const {
  closeDatabase,
  db,
  initializeDatabase,
  querySql,
} = await import("../src/db/index.js");

try {
  assert.equal(packageJson.version, appVersion, "package.json should report the result-fidelity version");
  assert.equal(packageLock.version, appVersion, "package-lock root should report the result-fidelity version");
  assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the result-fidelity version");

  assert.deepEqual(db.capabilities, {
    adapter: "better-sqlite3",
    health: true,
    migrationLocking: true,
    migrationLockStrategy: "lock-file",
    parameterizedQueries: true,
    parameterStyle: "named",
    provider: "sqlite",
    stringSql: true,
    transactionApi: "callback",
    transactions: true,
  }, "SQLite capabilities should keep their shape while reporting the better-sqlite3 adapter");
  assert.match(sqliteAdapterSource, /adapter:\s*"better-sqlite3"/, "SQLite adapter should expose the better-sqlite3 capability label");
  assert.doesNotMatch(sqliteAdapterSource, /adapter:\s*"sqlite-process"/, "SQLite adapter should not report the retired sqlite-process label");
  assert.match(sqliteSource, /Buffer\.isBuffer\(value\)/, "SQLite helper should pass Buffer parameters through to better-sqlite3");
  assert.doesNotMatch(sqliteSource, /\.safeIntegers\(/, "SQLite helper should not enable safeIntegers for the current TEXT-key schema");
  assert.match(regressionSuite, /scripts\/database-result-fidelity-regression\.mjs/, "regression suite should include result-fidelity coverage");

  await initializeDatabase();
  await assertRowShapeAndAliases();
  await assertValueTypes();
  await assertFtsMatchAndBm25();

  assert.match(databaseDocs, /As of version 0\.33\.5\.21\.0\.5[\s\S]*adapter:\s*"better-sqlite3"[\s\S]*safeIntegers[\s\S]*TEXT-key schema/, "database docs should describe the result-fidelity and safeIntegers decision");
  assert.match(runtimeDocs, /LONGTAIL_WORKER_MODE[\s\S]*inline[\s\S]*at most one local worker process/i, "runtime docs should document the SQLite worker-mode boundary");
  assert.match(sqliteDocs, /one Longtail Forge app process\/server[\s\S]*at most one local worker process/i, "SQLite small-office docs should allow at most one local worker");
  assert.match(sqliteDocs, /No worker fleet/, "SQLite small-office docs should keep the no-worker-fleet rule explicit");
  assert.match(roadmap, /Version 0\.33\.5\.21\.0\.5 - Result fidelity[\s\S]*\[x\] Verify returned row shapes/, "roadmap should mark the result-fidelity slice complete");
  assert.match(changelog, new RegExp(`## Version ${escapeRegExp(appVersion)} - `), "changelog should include the result-fidelity slice");

  const integrityRows = await querySql("PRAGMA integrity_check;");
  assert.equal(integrityRows[0]?.integrity_check, "ok", "result-fidelity regression database should pass integrity check");

  console.log("Database result fidelity regression passed.");
} finally {
  await closeDatabase();
  await fs.rm(tempDir, { recursive: true, force: true });
}

async function assertRowShapeAndAliases() {
  const rows = await db.query(`
SELECT
  1 AS one_value,
  2 AS "MixedCaseAlias",
  3 AS "space alias",
  NULL AS null_value;
`);

  assert.equal(rows.length, 1, "single SELECT should return one row");
  assert.deepEqual(
    Object.keys(rows[0]),
    ["one_value", "MixedCaseAlias", "space alias", "null_value"],
    "better-sqlite3 rows should preserve selected column and alias keys",
  );
  assert.deepEqual(rows[0], {
    MixedCaseAlias: 2,
    null_value: null,
    one_value: 1,
    "space alias": 3,
  }, "row values should map to the expected aliases");
}

async function assertValueTypes() {
  await db.run(`
CREATE TABLE result_fidelity_values (
  id TEXT PRIMARY KEY,
  flag_yes INTEGER NOT NULL,
  flag_no INTEGER NOT NULL,
  nullable_value TEXT,
  blob_value BLOB NOT NULL,
  safe_count INTEGER NOT NULL,
  large_text_key TEXT NOT NULL
);
`);

  const blobValue = Buffer.from("result-fidelity-buffer", "utf8");
  await db.run(`
INSERT INTO result_fidelity_values (
  id,
  flag_yes,
  flag_no,
  nullable_value,
  blob_value,
  safe_count,
  large_text_key
)
VALUES (
  :id,
  :flagYes,
  :flagNo,
  :nullableValue,
  :blobValue,
  :safeCount,
  :largeTextKey
);
`, {
    blobValue,
    flagNo: false,
    flagYes: true,
    id: "result-fidelity-row",
    largeTextKey: "9007199254740993",
    nullableValue: null,
    safeCount: 42,
  });

  const row = await db.get(`
SELECT
  flag_yes,
  flag_no,
  nullable_value,
  blob_value,
  safe_count,
  large_text_key
FROM result_fidelity_values
WHERE id = :id;
`, { id: "result-fidelity-row" });

  assert.equal(row.flag_yes, 1, "boolean true parameters should store as 1 for current SQLite callers");
  assert.equal(row.flag_no, 0, "boolean false parameters should store as 0 for current SQLite callers");
  assert.equal(row.nullable_value, null, "SQLite null values should read back as null");
  assert.equal(row.safe_count, 42, "normal integer values should read back as numbers");
  assert.equal(row.large_text_key, "9007199254740993", "large identifier-like values should stay exact as TEXT keys");
  assert.equal(Buffer.isBuffer(row.blob_value), true, "BLOB values should read back as Buffer instances");
  assert.equal(row.blob_value.equals(blobValue), true, "BLOB Buffer contents should round-trip");

  const integerShape = await db.get(`
SELECT
  9007199254740991 AS max_safe_integer,
  '9007199254740993' AS large_text_key;
`);
  assert.equal(integerShape.max_safe_integer, Number.MAX_SAFE_INTEGER, "safe integer values should read back exactly as numbers");
  assert.equal(Number.isSafeInteger(integerShape.max_safe_integer), true, "current numeric counters should stay inside JS safe-integer range");
  assert.equal(integerShape.large_text_key, "9007199254740993", "large keys should remain exact when stored as text");
}

async function assertFtsMatchAndBm25() {
  await db.run(`
CREATE VIRTUAL TABLE result_fidelity_fts USING fts5(title, body);

INSERT INTO result_fidelity_fts (title, body)
VALUES
  ('Alpha launch', 'The customer launch checklist is ready.'),
  ('Billing cleanup', 'Remove old invoice notes.');
`);

  const rows = await db.query(`
SELECT
  rowid AS row_id,
  title,
  bm25(result_fidelity_fts) AS search_score
FROM result_fidelity_fts
WHERE result_fidelity_fts MATCH :query
ORDER BY bm25(result_fidelity_fts), rowid;
`, { query: '"alpha" AND "launch"' });

  assert.equal(rows.length, 1, "FTS5 MATCH should find the expected row");
  assert.deepEqual(Object.keys(rows[0]), ["row_id", "title", "search_score"], "FTS5 result aliases should stay stable");
  assert.equal(rows[0].row_id, 1);
  assert.equal(rows[0].title, "Alpha launch");
  assert.equal(typeof rows[0].search_score, "number", "bm25() should return a numeric score");
}

function readText(filePath) {
  return readFileSync(path.join(root, filePath), "utf8");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
