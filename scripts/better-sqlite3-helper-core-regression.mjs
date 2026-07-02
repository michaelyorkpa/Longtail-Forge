import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const appVersion = "0.33.5.21.7.3";
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-better-sqlite3-helper-core-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-helper-core.db");
process.env.LONGTAIL_SQLITE_BUSY_TIMEOUT_MS = "3210";
process.env.SUPER_ADMIN_PASSWORD = "Better-Sqlite3-Helper-Core-Test-123!";

const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const sqliteSource = readText("src/db/sqlite.js");
const sqliteAdapterSource = readText("src/db/adapters/sqlite-adapter.js");
const databaseDocs = readText("docs/database.md");
const roadmap = readText("ROADMAP.md");
const changelog = readText("CHANGELOG.md");
const regressionSuite = readText("scripts/regression-suite.mjs");

const {
  closeSqlite,
  formatSqliteHealth,
  getLastSqliteHealth,
  initializeSqliteRuntime,
  querySql,
  runSql,
  sqlInteger,
  sqlNullableInteger,
  sqlNullableText,
  sqlText,
} = await import("../src/db/index.js");

try {
  assert.equal(packageJson.version, appVersion, "package.json should report the in-process SQLite helper core version");
  assert.equal(packageLock.version, appVersion, "package-lock root should report the in-process SQLite helper core version");
  assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the in-process SQLite helper core version");

  assert.match(sqliteSource, /from "better-sqlite3"/, "SQLite helper should import better-sqlite3");
  assert.match(sqliteSource, /new Database\(config\.databaseFile\)/, "SQLite helper should open config.databaseFile through better-sqlite3");
  assert.match(sqliteSource, /\.prepare\(sql\)|\.prepare\(text\)/, "single-statement reads should prepare SQL through the driver");
  assert.match(sqliteSource, /\.all\(\)/, "single-statement reads should return rows through prepare().all()");
  assert.match(sqliteSource, /\.exec\(text\)/, "multi-statement compatibility scripts should execute through driver exec()");
  assert.match(sqliteSource, /foreign_keys = /, "SQLite helper should apply the configured foreign-key pragma through the driver");
  assert.match(sqliteSource, /journal_mode = /, "SQLite helper should apply the configured journal mode through the driver");
  assert.match(sqliteSource, /busy_timeout = /, "SQLite helper should apply the configured busy timeout through the driver");
  assert.match(sqliteSource, /PRAGMA busy_timeout;/, "SQLite health should still report busy timeout");
  assert.doesNotMatch(sqliteSource, /node:child_process|spawn\(|sqliteProcess|markerToken|requestQueue|config\.sqliteCommand/, "SQLite helper should no longer shell out to the sqlite3 CLI");
  assert.match(sqliteAdapterSource, /querySql,[\s\S]*runSql,[\s\S]*from "\.\.\/sqlite\.js"/, "SQLite adapter should keep loading the stable helper names");
  assert.doesNotMatch(sqliteAdapterSource, /expandSqlParameters|sqliteParameterLiteral/, "SQLite adapter should no longer inline parameters after the parameter-binding slice");
  assert.match(regressionSuite, /scripts\/better-sqlite3-helper-core-regression\.mjs/, "regression suite should include the helper-core regression");
  assert.match(databaseDocs, /As of version 0\.33\.5\.21\.0\.2[\s\S]*long-lived[\s\S]*better-sqlite3/, "database docs should describe the in-process helper core");
  assert.match(roadmap, /Version 0\.33\.5\.21\.0\.2 - In-process SQLite helper core[\s\S]*\[x\]/, "roadmap should mark the helper-core slice complete");
  assert.match(changelog, new RegExp(`## Version ${escapeRegExp(appVersion)} - `), "changelog should include the helper-core slice");

  const health = await initializeSqliteRuntime();
  assert.equal(health.provider, "sqlite");
  assert.equal(path.resolve(health.databaseFile), path.resolve(process.env.LONGTAIL_DATABASE_FILE));
  assert.equal(health.databaseFileWritable, true);
  assert.equal(health.foreignKeysEnabled, true);
  assert.equal(health.journalMode, "wal");
  assert.equal(health.busyTimeoutMs, 3210);
  assert.deepEqual(getLastSqliteHealth(), health, "startup should cache the latest SQLite health");
  assert.equal(
    formatSqliteHealth(health),
    `[sqlite-health] provider=sqlite databaseFile=${health.databaseFile} writable=yes foreign_keys=on journal_mode=wal busy_timeout_ms=3210`,
    "health formatter should preserve the existing output shape",
  );

  await runSql(`
CREATE TABLE helper_core_probe (
  id INTEGER PRIMARY KEY,
  value TEXT,
  count_value INTEGER
);

INSERT INTO helper_core_probe (value, count_value)
VALUES ('semi;colon', 1);

INSERT INTO helper_core_probe (value, count_value)
VALUES (${sqlText("quoted ' semicolon ; value")}, ${sqlInteger(2)});
`);

  const rows = await querySql(`
SELECT value, count_value
FROM helper_core_probe
ORDER BY id;
`);
  assert.deepEqual(rows, [
    { count_value: 1, value: "semi;colon" },
    { count_value: 2, value: "quoted ' semicolon ; value" },
  ], "single read statements should return rows through better-sqlite3");

  const literalRows = await querySql(`
SELECT
  ${sqlText("literal ' value ;")} AS text_value,
  ${sqlInteger(7)} AS integer_value,
  ${sqlNullableText(null)} AS null_text,
  ${sqlNullableInteger(null)} AS null_integer;
`);
  assert.deepEqual(literalRows, [{
    integer_value: 7,
    null_integer: null,
    null_text: null,
    text_value: "literal ' value ;",
  }], "SQL literal helpers should remain valid for compatibility statements");

  const quotedSemicolonRows = await querySql("SELECT 'semi;colon' AS value; -- trailing comment");
  assert.deepEqual(quotedSemicolonRows, [{ value: "semi;colon" }], "statement detection should ignore semicolons inside string literals");

  const multiQueryRows = await querySql(`
CREATE TABLE query_exec_probe (
  id TEXT PRIMARY KEY
);
INSERT INTO query_exec_probe (id)
VALUES ('created-through-exec');
`);
  assert.deepEqual(multiQueryRows, [], "multi-statement querySql compatibility calls should execute without returning rows");
  assert.deepEqual(
    await querySql("SELECT id FROM query_exec_probe;"),
    [{ id: "created-through-exec" }],
    "multi-statement compatibility execution should persist side effects",
  );

  const foreignKeyRows = await querySql("PRAGMA foreign_keys;");
  assert.equal(Number(foreignKeyRows[0]?.foreign_keys), 1, "foreign keys should stay enabled on the active connection");
  const busyRows = await querySql("PRAGMA busy_timeout;");
  assert.equal(Number(busyRows[0]?.timeout), 3210, "busy timeout should stay configured on the active connection");

  await closeSqlite();
  const reopenedRows = await querySql("PRAGMA foreign_keys;");
  assert.equal(Number(reopenedRows[0]?.foreign_keys), 1, "reopened helper connections should reapply connection PRAGMAs");

  console.log("better-sqlite3 helper core regression passed.");
} finally {
  await closeSqlite();
  await fs.rm(tempDir, { recursive: true, force: true });
}

function readText(filePath) {
  return readFileSync(path.join(root, filePath), "utf8");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
