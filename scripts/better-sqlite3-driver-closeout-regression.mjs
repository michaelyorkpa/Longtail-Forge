import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const root = process.cwd();
const appVersion = "0.33.5.21.7.8";
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-better-sqlite3-closeout-"));

process.env.LONGTAIL_DATA_DIR = tempDir;
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "longtail-forge-driver-closeout.db");
process.env.SQLITE_COMMAND = "sqlite3-command-should-not-be-used";
process.env.SUPER_ADMIN_PASSWORD = "Better-Sqlite3-Driver-Closeout-Test-123!";

const packageJson = JSON.parse(readText("package.json"));
const packageLock = JSON.parse(readText("package-lock.json"));
const envExample = readText(".env.example");
const readme = readText("README.md");
const runtimeDocs = readText("docs/runtime-configuration.md");
const databaseDocs = readText("docs/database.md");
const roadmap = readText("ROADMAP.md");
const changelog = readText("CHANGELOG.md");
const configSource = readText("src/config.js");
const sqliteSource = readText("src/db/sqlite.js");
const sqliteAdapterSource = readText("src/db/adapters/sqlite-adapter.js");
const regressionSuite = readText("scripts/regression-suite.mjs");

const { config } = await import("../src/config.js");
const { closeDatabase, db, initializeDatabase, querySql } = await import("../src/db/index.js");

try {
  assert.equal(packageJson.version, appVersion, "package.json should report the driver-closeout version");
  assert.equal(packageLock.version, appVersion, "package-lock root should report the driver-closeout version");
  assert.equal(packageLock.packages[""].version, appVersion, "package-lock package entry should report the driver-closeout version");

  assert.equal(Object.hasOwn(config, "sqliteCommand"), false, "runtime config should not expose sqliteCommand");
  assert.equal(config.databaseProvider, "sqlite", "SQLite should remain the active provider");
  assert.equal(config.sqlite.journalMode, "wal", "legacy SQLITE_COMMAND should not affect SQLite runtime settings");
  assert.doesNotMatch(configSource, /DEFAULT_SQLITE_COMMAND|sqliteCommand|SQLITE_COMMAND/, "config should not read SQLITE_COMMAND");
  assert.doesNotMatch(envExample, /^SQLITE_COMMAND=/m, ".env.example should not present SQLITE_COMMAND as active config");
  assert.doesNotMatch(readme, /SQLITE_COMMAND|SQLite command-line tool/i, "README should not present the sqlite3 CLI as an install requirement");
  assert.doesNotMatch(runtimeDocs, /\|\s*`SQLITE_COMMAND`\s*\|/, "runtime docs should not list SQLITE_COMMAND as an active setting");
  assert.match(runtimeDocs, /`SQLITE_COMMAND` is a legacy ignored setting[\s\S]*does not require the `sqlite3` executable/, "runtime docs should mark SQLITE_COMMAND as ignored legacy config");
  assert.match(databaseDocs, /As of version 0\.33\.5\.21\.0\.6[\s\S]*no longer shells out[\s\S]*`SQLITE_COMMAND` is ignored[\s\S]*setup docs no longer require operators to install/, "database docs should close out the CLI retirement");
  assert.match(databaseDocs, /The `sqlite3` command-line executable is not required for normal Longtail Forge operation/, "database docs should remove the CLI requirement");

  assert.match(sqliteSource, /from "better-sqlite3"/, "SQLite helper should use better-sqlite3");
  assert.doesNotMatch(sqliteSource, /node:child_process|spawn\(|sqliteProcess|markerToken|requestQueue|config\.sqliteCommand/, "SQLite helper should not shell out to sqlite3");
  assert.match(sqliteAdapterSource, /adapter:\s*"better-sqlite3"/, "SQLite adapter should report better-sqlite3");
  assert.doesNotMatch(sqliteAdapterSource, /adapter:\s*"sqlite-process"/, "SQLite adapter should not report sqlite-process");
  assert.match(regressionSuite, /scripts\/better-sqlite3-driver-closeout-regression\.mjs/, "regression suite should include the driver closeout regression");
  assert.match(roadmap, /Version 0\.33\.5\.21\.0\.6 - CLI retirement docs and driver-swap closeout[\s\S]*\[x\] Remove or mark `SQLITE_COMMAND`/, "roadmap should mark the driver closeout slice complete");
  assert.match(changelog, new RegExp(`## Version ${escapeRegExp(appVersion)} - `), "changelog should include the driver closeout slice");

  await initializeDatabase();
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
  }, "SQLite capabilities should keep the better-sqlite3 adapter shape");

  await db.run(`
CREATE VIRTUAL TABLE driver_closeout_fts USING fts5(title, body);
`);
  await db.run(`
INSERT INTO driver_closeout_fts (title, body)
VALUES (:title, :body);
`, {
    body: "The SQLite driver closeout uses the in-process native dependency.",
    title: "Driver closeout",
  });

  const rows = await db.query(`
SELECT
  title,
  bm25(driver_closeout_fts) AS search_score
FROM driver_closeout_fts
WHERE driver_closeout_fts MATCH :query
ORDER BY search_score;
`, { query: "driver AND closeout" });
  assert.equal(rows.length, 1, "FTS5 spot-check should find the closeout row");
  assert.equal(rows[0].title, "Driver closeout");
  assert.equal(typeof rows[0].search_score, "number", "bm25() should return a numeric score");

  const integrityRows = await querySql("PRAGMA integrity_check;");
  assert.equal(integrityRows[0]?.integrity_check, "ok", "driver closeout regression database should pass integrity check");

  console.log("better-sqlite3 driver closeout regression passed.");
} finally {
  await closeDatabase();
  await fs.rm(tempDir, { recursive: true, force: true });
}

function readText(filePath) {
  return readFileSync(path.join(root, filePath), "utf8");
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
