export const regressionMeta = Object.freeze({
  id: "database.better-sqlite3-13-data-compatibility",
  area: "database",
  tier: "release-gate",
  tags: ["adapter", "backup", "baseline-bypass", "bindings", "concurrency", "migration", "recovery", "sqlite"],
  description: "Proves better-sqlite3 13.0.1 preserves fresh migration identity, SQLite runtime PRAGMAs, transactions, deferred foreign keys, WAL concurrency/reopen behavior, bindings, results, BLOBs, FTS5, and integrity.",
  runMode: "isolated-database",
});

import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import vm from "node:vm";
import Database from "better-sqlite3";
import driverPackage from "better-sqlite3/package.json" with { type: "json" };

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-better-sqlite3-13-data-"));
const databaseFile = path.join(tempDir, "longtail-forge.db");
process.env.LONGTAIL_DATA_DIR = tempDir;
process.env.LONGTAIL_DATABASE_FILE = databaseFile;
process.env.LONGTAIL_LOCAL_STORAGE_ROOT = path.join(tempDir, "files");
process.env.LONGTAIL_SQLITE_BUSY_TIMEOUT_MS = "125";
process.env.LONGTAIL_SQLITE_SYNCHRONOUS = "full";
process.env.LONGTAIL_SQLITE_CACHE_SIZE_KIB = "4096";
process.env.LONGTAIL_SQLITE_TEMP_STORE = "memory";
process.env.LONGTAIL_SQLITE_MMAP_SIZE_BYTES = "0";
process.env.SUPER_ADMIN_PASSWORD = "Better-Sqlite3-13-Data-Compatibility-123!";

const {
  closeDatabase,
  db,
  initializeDatabase,
  querySql,
} = await import("../../../src/db/index.js");

let adapterOpen = false;
let writerA;
let writerB;
let reopened;

try {
  assert.equal(driverPackage.version, "13.0.1", "the data-compatibility checkpoint should run under the qualified native driver");

  const health = await initializeDatabase();
  adapterOpen = true;
  assert.deepEqual(
    {
      busyTimeoutMs: health.busyTimeoutMs,
      cacheSizeKib: health.cacheSizeKib,
      foreignKeysEnabled: health.foreignKeysEnabled,
      journalMode: health.journalMode,
      mmapSizeBytes: health.mmapSizeBytes,
      provider: health.provider,
      synchronous: health.synchronous,
      tempStore: health.tempStore,
    },
    {
      busyTimeoutMs: 125,
      cacheSizeKib: 4096,
      foreignKeysEnabled: true,
      journalMode: "wal",
      mmapSizeBytes: 0,
      provider: "sqlite",
      synchronous: "full",
      tempStore: "memory",
    },
    "fresh startup should apply and report the selected SQLite runtime contract",
  );

  const migrations = await db.query(`
SELECT version, module_id, name, checksum
FROM schema_migrations
ORDER BY applied_at, version;
`);
  assert.equal(migrations.length, 26, "fresh startup should preserve the complete migration identity");
  assert.deepEqual(migrations.at(-1), {
    checksum: "408211f3e378183c602ef55b28352eceb43a5ceed2db18a7d7b7cf62d67ba13d",
    module_id: "core",
    name: "secure_catalog_transitions",
    version: "089",
  }, "migration 089 should be the latest checksum-tracked migration");

  const pragmaRows = {
    busyTimeout: await querySql("PRAGMA busy_timeout;"),
    cacheSize: await querySql("PRAGMA cache_size;"),
    foreignKeys: await querySql("PRAGMA foreign_keys;"),
    journalMode: await querySql("PRAGMA journal_mode;"),
    mmapSize: await querySql("PRAGMA mmap_size;"),
    synchronous: await querySql("PRAGMA synchronous;"),
    tempStore: await querySql("PRAGMA temp_store;"),
  };
  assert.equal(pragmaRows.busyTimeout[0].timeout, 125);
  assert.equal(pragmaRows.cacheSize[0].cache_size, -4096);
  assert.equal(pragmaRows.foreignKeys[0].foreign_keys, 1);
  assert.equal(pragmaRows.journalMode[0].journal_mode, "wal");
  assert.equal(pragmaRows.mmapSize[0].mmap_size, 0);
  assert.equal(pragmaRows.synchronous[0].synchronous, 2);
  assert.equal(pragmaRows.tempStore[0].temp_store, 2);

  await db.run(`
CREATE TABLE adapter_transaction_probe (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL
);
`);
  await db.transaction(async (transaction) => {
    await transaction.run(
      "INSERT INTO adapter_transaction_probe (id, label) VALUES (:id, :label);",
      { id: "committed", label: "adapter commit" },
    );
  });
  await assert.rejects(
    db.transaction(async (transaction) => {
      await transaction.run(
        "INSERT INTO adapter_transaction_probe (id, label) VALUES (:id, :label);",
        { id: "rolled-back", label: "adapter rollback" },
      );
      throw new Error("force adapter rollback");
    }),
    /force adapter rollback/,
  );
  assert.deepEqual(
    await db.query("SELECT id, label FROM adapter_transaction_probe ORDER BY id;"),
    [{ id: "committed", label: "adapter commit" }],
    "the provider transaction should commit successes and roll back failures",
  );

  assert.equal((await querySql("PRAGMA integrity_check;"))[0].integrity_check, "ok");
  assert.deepEqual(await querySql("PRAGMA foreign_key_check;"), []);

  await closeDatabase();
  adapterOpen = false;

  writerA = new Database(databaseFile, { fileMustExist: true });
  writerB = new Database(databaseFile, { fileMustExist: true });
  for (const connection of [writerA, writerB]) {
    connection.pragma("foreign_keys = ON");
    connection.pragma("journal_mode = WAL");
    connection.pragma("busy_timeout = 125");
  }

  writerA.exec(`
CREATE TABLE native_concurrency_probe (
  id INTEGER PRIMARY KEY,
  label TEXT NOT NULL,
  payload BLOB
);
CREATE TABLE native_parent (
  parent_id TEXT PRIMARY KEY
);
CREATE TABLE native_child (
  child_id TEXT PRIMARY KEY,
  parent_id TEXT NOT NULL REFERENCES native_parent(parent_id)
);
CREATE VIRTUAL TABLE native_fts USING fts5(title, body);
`);

  writerA.exec("BEGIN IMMEDIATE;");
  writerA.prepare("INSERT INTO native_concurrency_probe (id, label) VALUES (?, ?);")
    .run(1, "uncommitted writer");
  assert.equal(
    writerB.prepare("SELECT COUNT(*) AS count FROM native_concurrency_probe;").get().count,
    0,
    "a WAL reader should continue against the committed snapshot while another connection writes",
  );
  const blockedAt = performance.now();
  assert.throws(
    () => writerB.prepare("INSERT INTO native_concurrency_probe (id, label) VALUES (?, ?);")
      .run(2, "blocked writer"),
    /database is locked/,
    "a competing writer should honor the configured busy timeout and fail without corruption",
  );
  assert.ok(performance.now() - blockedAt >= 100, "the competing writer should wait for the configured busy timeout");
  writerA.exec("COMMIT;");

  const blob = Buffer.from("better-sqlite3-13-blob", "utf8");
  const returned = writerB.prepare(`
INSERT INTO native_concurrency_probe (id, label, payload)
VALUES (@id, @label, @payload)
RETURNING id, label, payload;
`).get({ id: 2, label: "named binding", payload: blob });
  assert.equal(returned.id, 2);
  assert.equal(returned.label, "named binding");
  assert.equal(Buffer.isBuffer(returned.payload), true);
  assert.equal(returned.payload.equals(blob), true);

  const crossRealmBindings = vm.runInNewContext("({ label: 'cross-realm binding' })");
  assert.deepEqual(
    writerB.prepare("SELECT @label AS label;").get(crossRealmBindings),
    { label: "cross-realm binding" },
    "plain-object bindings from another JavaScript realm should remain accepted",
  );

  writerB.exec("BEGIN;");
  writerB.pragma("defer_foreign_keys = ON");
  writerB.prepare("INSERT INTO native_child (child_id, parent_id) VALUES (?, ?);")
    .run("child-one", "parent-one");
  writerB.prepare("INSERT INTO native_parent (parent_id) VALUES (?);").run("parent-one");
  writerB.exec("COMMIT;");
  assert.deepEqual(writerB.pragma("foreign_key_check"), [], "deferred foreign-key work should commit cleanly");

  writerB.exec("BEGIN;");
  writerB.prepare("INSERT INTO native_parent (parent_id) VALUES (?);").run("rolled-back-parent");
  writerB.exec("ROLLBACK;");
  assert.equal(
    writerB.prepare("SELECT COUNT(*) AS count FROM native_parent WHERE parent_id = ?;")
      .get("rolled-back-parent").count,
    0,
    "a native rollback should not persist its write",
  );

  writerB.prepare("INSERT INTO native_fts (title, body) VALUES (?, ?);")
    .run("Recovery proof", "SQLite FTS5 bm25 remains available after the native driver upgrade.");
  const searchRow = writerB.prepare(`
SELECT title, bm25(native_fts) AS score
FROM native_fts
WHERE native_fts MATCH ?;
`).get("recovery");
  assert.equal(searchRow.title, "Recovery proof");
  assert.equal(Number.isFinite(searchRow.score), true);

  writerA.close();
  writerA = undefined;
  writerB.close();
  writerB = undefined;

  reopened = new Database(databaseFile, { fileMustExist: true });
  reopened.pragma("foreign_keys = ON");
  const checkpoint = reopened.pragma("wal_checkpoint(TRUNCATE)")[0];
  assert.equal(checkpoint.busy, 0, "WAL checkpoint after close/reopen should have no blocked readers or writers");
  assert.equal(
    reopened.prepare("SELECT COUNT(*) AS count FROM native_concurrency_probe;").get().count,
    2,
    "committed rows should persist after WAL checkpoint and reopen",
  );
  assert.equal(reopened.pragma("integrity_check")[0].integrity_check, "ok");
  assert.deepEqual(reopened.pragma("foreign_key_check"), []);

  console.log("better-sqlite3 13.0.1 data compatibility regression passed: integrity=ok foreign_key_violations=0.");
} finally {
  if (adapterOpen) {
    await closeDatabase().catch(() => {});
  }
  for (const connection of [writerA, writerB, reopened]) {
    if (connection?.open) {
      connection.close();
    }
  }
  await fs.rm(tempDir, { recursive: true, force: true });
}
