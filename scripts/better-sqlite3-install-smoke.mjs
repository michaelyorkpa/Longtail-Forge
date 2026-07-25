import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import Database from "better-sqlite3";

const root = process.cwd();
const require = createRequire(import.meta.url);
const packageJson = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8"));
const packageLock = JSON.parse(await fs.readFile(path.join(root, "package-lock.json"), "utf8"));
const driverPackage = require("better-sqlite3/package.json");
const driverRoot = path.dirname(require.resolve("better-sqlite3/package.json"));
const selectedPlatformTarget = resolveSelectedPlatformTarget();
const selectedPrebuildPath = path.join(driverRoot, "prebuilds", `${selectedPlatformTarget}.node`);
const PlatformDatabase = require(`better-sqlite3/${selectedPlatformTarget}`);
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-better-sqlite3-smoke-"));
const databaseFile = path.join(tempDir, "driver-smoke.db");

let database = null;

try {
  assert.equal(packageJson.engines?.node, ">=24.7 <25", "package.json should declare the Node 24.7+ runtime range required by built-in Argon2id");
  assert.equal(packageLock.packages?.[""]?.engines?.node, packageJson.engines.node, "package-lock root package should mirror the supported Node runtime range");
  assert.equal(packageJson.dependencies?.["better-sqlite3"], "13.0.1", "package.json should pin the selected better-sqlite3 release exactly");
  assert.equal(packageLock.packages?.[""]?.dependencies?.["better-sqlite3"], packageJson.dependencies["better-sqlite3"], "package-lock root package should mirror the better-sqlite3 pin");
  assert.equal(packageLock.packages?.["node_modules/better-sqlite3"]?.version, driverPackage.version, "package-lock should capture the installed better-sqlite3 release");
  assert.equal(driverPackage.version, "13.0.1", "the selected better-sqlite3 release should remain explicit");
  assert.equal(driverPackage.engines?.node, ">=22", "better-sqlite3 should document the selected release's Node engine range");
  assert.equal(
    packageLock.packages?.["node_modules/better-sqlite3"]?.dependencies?.["node-addon-api"],
    "^8.0.0",
    "the N-API driver should retain its node-addon-api dependency",
  );
  assert.equal(packageLock.packages?.["node_modules/prebuild-install"], undefined, "the retired prebuild-install package should leave the lockfile");
  assert.match(process.versions.node, /^24\./, "the active Node runtime should match Longtail Forge's supported Node 24 baseline");
  await fs.access(selectedPrebuildPath);
  assert.equal(
    typeof PlatformDatabase,
    "function",
    `the package should export its selected ${selectedPlatformTarget} bundled binding`,
  );

  database = new Database(databaseFile);
  const sqliteVersion = database.prepare("SELECT sqlite_version() AS sqlite_version;").get().sqlite_version;
  const compileOptions = database.prepare("PRAGMA compile_options;").all()
    .map((row) => row.compile_options);

  assert.equal(sqliteVersion, "3.53.3", "better-sqlite3 should bundle the qualified SQLite release");
  for (const requiredOption of ["DEFAULT_FOREIGN_KEYS", "ENABLE_FTS5", "THREADSAFE=2"]) {
    assert.ok(compileOptions.includes(requiredOption), `better-sqlite3's bundled SQLite should include ${requiredOption}`);
  }

  const crossRealmBindings = vm.runInNewContext("({ label: 'cross-realm-ready' })");
  assert.deepEqual(
    database.prepare("SELECT @label AS label;").get(crossRealmBindings),
    { label: "cross-realm-ready" },
    "named binding should accept a plain object created in another JavaScript realm",
  );

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

  const platformDatabase = new PlatformDatabase(":memory:");
  try {
    assert.equal(
      platformDatabase.prepare("SELECT sqlite_version() AS sqlite_version;").get().sqlite_version,
      sqliteVersion,
      `the explicit ${selectedPlatformTarget} export should load the same qualified SQLite build`,
    );
  } finally {
    platformDatabase.close();
  }

  console.log(`better-sqlite3 ${driverPackage.version} bundled ${selectedPlatformTarget} N-API prebuild passed on Node ${process.versions.node}; SQLite ${sqliteVersion}; engines ${driverPackage.engines.node}.`);
} finally {
  if (database) {
    database.close();
  }

  await fs.rm(tempDir, { recursive: true, force: true });
}

function resolveSelectedPlatformTarget() {
  if (process.platform === "linux") {
    const isMusl = !process.report.getReport().header.glibcVersionRuntime;
    return `${isMusl ? "linuxmusl" : "linux"}-${process.arch}`;
  }

  return `${process.platform}-${process.arch}`;
}
