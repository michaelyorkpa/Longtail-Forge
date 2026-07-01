import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";

const root = process.cwd();
const require = createRequire(import.meta.url);
const packageJson = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8"));
const packageLock = JSON.parse(await fs.readFile(path.join(root, "package-lock.json"), "utf8"));
const driverPackage = require("better-sqlite3/package.json");
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-better-sqlite3-smoke-"));
const databaseFile = path.join(tempDir, "driver-smoke.db");

let database = null;

try {
  assert.equal(packageJson.dependencies?.["better-sqlite3"], "^12.11.1", "package.json should pin the selected better-sqlite3 dependency range");
  assert.equal(packageLock.packages?.["node_modules/better-sqlite3"]?.version, driverPackage.version, "package-lock should capture the installed better-sqlite3 release");
  assert.equal(driverPackage.version, "12.11.1", "the selected better-sqlite3 release should remain explicit");
  assert.equal(driverPackage.engines?.node, "20.x || 22.x || 23.x || 24.x || 25.x || 26.x", "better-sqlite3 should document the selected release's Node engine range");
  assert.match(process.versions.node, /^(20|22|23|24|25|26)\./, "the active Node runtime should be in the selected better-sqlite3 engine range");

  database = new Database(databaseFile);
  const sqliteVersion = database.prepare("SELECT sqlite_version() AS sqlite_version;").get().sqlite_version;
  const compileOptions = database.prepare("PRAGMA compile_options;").all()
    .map((row) => row.compile_options);

  assert.ok(compileOptions.includes("ENABLE_FTS5"), "better-sqlite3's bundled SQLite should include FTS5");

  database.exec(`
CREATE VIRTUAL TABLE smoke_fts USING fts5(title, body);
INSERT INTO smoke_fts (title, body)
VALUES ('Resume work', 'Durable job slices need searchable recovery context.');
`);

  const searchRows = database.prepare(`
SELECT rowid, bm25(smoke_fts) AS score
FROM smoke_fts
WHERE smoke_fts MATCH ?;
`).all("resume");

  assert.equal(searchRows.length, 1, "FTS5 MATCH should find the smoke row");
  assert.equal(searchRows[0].rowid, 1, "FTS5 MATCH should return the expected rowid");
  assert.equal(Number.isFinite(searchRows[0].score), true, "FTS5 bm25() should return a numeric score");

  database.exec(`
CREATE TABLE smoke_returning (
  id INTEGER PRIMARY KEY,
  label TEXT NOT NULL
);
`);

  const inserted = database.prepare(`
INSERT INTO smoke_returning (label)
VALUES (?)
RETURNING id, label;
`).get("ready");

  assert.deepEqual(inserted, { id: 1, label: "ready" }, "INSERT RETURNING should return the inserted row");

  const updated = database.prepare(`
UPDATE smoke_returning
SET label = ?
WHERE id = ?
RETURNING id, label;
`).get("done", inserted.id);

  assert.deepEqual(updated, { id: 1, label: "done" }, "UPDATE RETURNING should return the updated row");

  console.log(`better-sqlite3 ${driverPackage.version} install smoke passed on Node ${process.versions.node}; SQLite ${sqliteVersion}; engines ${driverPackage.engines.node}.`);
} finally {
  if (database) {
    database.close();
  }

  await fs.rm(tempDir, { recursive: true, force: true });
}
