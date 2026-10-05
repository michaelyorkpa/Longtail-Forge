export const regressionMeta = Object.freeze({
  id: "database.sqlite-statement-cache-adapter",
  area: "database",
  tier: "focused",
  tags: ["adapter", "performance", "pragmas", "sqlite", "statement-cache"],
  description: "Proves the adapter prepared-statement cache, single-pass SQL analysis, db.get single-row path, and config-gated performance PRAGMAs preserve query results, error contracts, and transaction semantics.",
  runMode: "isolated-database",
});

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { requireRow } from "../../test-support/database-row-assertions.mjs";

const root = process.cwd();
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-sqlite-statement-cache-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "statement-cache.db");
process.env.LONGTAIL_SQLITE_SYNCHRONOUS = "full";
process.env.LONGTAIL_SQLITE_CACHE_SIZE_KIB = "4096";
process.env.LONGTAIL_SQLITE_TEMP_STORE = "memory";
process.env.LONGTAIL_SQLITE_MMAP_SIZE_BYTES = "0";
process.env.SUPER_ADMIN_PASSWORD = "Statement-Cache-Adapter-Test-123!";

const sqliteSource = readFileSync(path.join(root, "src/db/sqlite.js"), "utf8");
const bindingsSource = readFileSync(path.join(root, "src/db/parameter-bindings.js"), "utf8");
const runtimeDocs = readFileSync(path.join(root, "docs/runtime-configuration.md"), "utf8");

const {
  closeDatabase,
  db,
  formatDatabaseHealth,
  initializeDatabaseRuntime,
} = await import("../../../src/db/index.js");
const { analyzeSqlStatement, prepareDatabaseBindings } = await import("../../../src/db/parameter-bindings.js");

try {
  // Single-pass analysis: the driver reuses the shared tokenizer and keeps no
  // scanner of its own, and the binding layer reports the statement count from
  // the same pass that collects parameter tokens.
  assert.match(sqliteSource, /import \{ analyzeSqlStatement \} from "\.\/parameter-bindings\.js"/, "SQLite driver should reuse the shared SQL tokenizer");
  assert.doesNotMatch(sqliteSource, /function countSqlStatements|function collectSqlParameters\(/, "SQLite driver should not keep duplicate SQL scanners");
  assert.match(bindingsSource, /function analyzeSqlStatement\(/, "binding layer should own the single-pass SQL analyzer");
  assert.match(sqliteSource, /function prepareCachedStatement\(/, "SQLite driver should prepare statements through the cache");
  assert.match(sqliteSource, /STATEMENT_CACHE_LIMIT/, "statement cache should be bounded");
  assert.match(sqliteSource, /statementCache\.clear\(\)/, "statement cache should be invalidated on connection close/reopen");
  assert.match(sqliteSource, /statement\.get\(bindings\)/, "db.get should use the driver single-row statement.get path");
  assert.match(runtimeDocs, /LONGTAIL_SQLITE_SYNCHRONOUS/, "runtime configuration docs should describe the synchronous PRAGMA gate");

  const analysis = analyzeSqlStatement("SELECT :a AS a; SELECT :b AS b;");
  assert.equal(analysis.statementCount, 2, "analyzer should count statements in the tokenizer pass");
  assert.equal(analysis.tokens.length, 2, "analyzer should collect parameter tokens in the same pass");
  assert.equal(analyzeSqlStatement("SELECT 'semi;colon' -- ; comment").statementCount, 1, "quoted and commented semicolons should not split statements");
  assert.equal(prepareDatabaseBindings("SELECT :id AS id;", { id: 1 }).statementCount, 1, "prepared bindings should carry the statement count");

  // Config-gated performance PRAGMAs surface in health and match runtime config.
  const health = await initializeDatabaseRuntime();
  assert.equal(health.synchronous, "full", "health should report the configured synchronous mode");
  assert.equal(health.cacheSizeKib, 4096, "health should report the configured cache size");
  assert.equal(health.tempStore, "memory", "health should report the configured temp_store");
  assert.equal(health.mmapSizeBytes, 0, "health should report the configured mmap_size");
  assert.match(
    formatDatabaseHealth(health),
    /synchronous=full cache_size_kib=4096 temp_store=memory mmap_size_bytes=0/,
    "health formatter should surface the tuning PRAGMAs",
  );

  await db.run(`
CREATE TABLE cache_probe (
  id INTEGER PRIMARY KEY,
  label TEXT NOT NULL,
  amount INTEGER NOT NULL
);
`);

  for (let id = 1; id <= 50; id += 1) {
    await db.run(
      "INSERT INTO cache_probe (id, label, amount) VALUES (:id, :label, :amount)",
      { amount: id * 10, id, label: `row-${id}` },
    );
  }

  // db.get single-row contract: row shape identical to query rows, null when empty,
  // and null for non-reader statements.
  const viaQuery = (await db.query("SELECT id, label, amount FROM cache_probe WHERE id = :id", { id: 7 }))[0];
  const viaGet = await db.get("SELECT id, label, amount FROM cache_probe WHERE id = :id", { id: 7 });
  assert.deepEqual(viaGet, viaQuery, "db.get should return the same row shape as db.query");
  assert.equal(await db.get("SELECT id FROM cache_probe WHERE id = :id", { id: 9999 }), null, "db.get should return null when no row matches");
  assert.equal(await db.get("UPDATE cache_probe SET amount = amount WHERE id = :id", { id: 1 }), null, "db.get on a non-reader statement should return null");

  // Cache correctness: a repeated statement must observe fresh data, not stale rows.
  const before = requireRow(await db.get("SELECT amount FROM cache_probe WHERE id = :id", { id: 3 }), "before");
  await db.run("UPDATE cache_probe SET amount = :amount WHERE id = :id", { amount: 4242, id: 3 });
  const after = requireRow(await db.get("SELECT amount FROM cache_probe WHERE id = :id", { id: 3 }), "after");
  assert.equal(before.amount, 30, "pre-update read should see the seeded value");
  assert.equal(after.amount, 4242, "cached statements must observe fresh data after writes");

  // Variable-length IN (:ids) expansion stays correct across many lengths.
  for (let length = 1; length <= 40; length += 1) {
    const ids = Array.from({ length }, (unused, index) => index + 1);
    const rows = await db.query("SELECT id FROM cache_probe WHERE id IN (:ids) ORDER BY id", { ids });
    assert.deepEqual(rows.map((row) => row.id), ids, `IN list of length ${length} should return exactly the requested rows`);
  }
  assert.deepEqual(
    await db.query("SELECT id FROM cache_probe WHERE id IN (:ids)", { ids: [] }),
    [],
    "empty IN lists should stay an empty result set",
  );

  // Cache eviction under many distinct statements never changes results.
  for (let index = 0; index < 600; index += 1) {
    const row = requireRow(await db.get(`SELECT ${index} AS value`), "row");
    assert.equal(row.value, index, "distinct statements should stay correct while older cache entries evict");
  }
  assert.deepEqual(await db.get("SELECT 0 AS value"), { value: 0 }, "an evicted statement should re-prepare with identical results");

  // Error contracts are unchanged.
  await assert.rejects(
    db.query("SELECT :missing AS value", {}),
    /Missing database query parameter: :missing\./,
    "missing named parameters should keep the existing error",
  );
  await assert.rejects(
    db.query("SELECT :id AS value", { id: 1, stray: 2 }),
    /Unknown database query parameter: stray\./,
    "unknown named parameters should keep the existing error",
  );
  await assert.rejects(
    db.query("SELECT :id AS a, ? AS b", { id: 1 }),
    /cannot mix named and positional parameters/,
    "mixed parameter styles should keep the existing error",
  );
  await assert.rejects(
    db.run("UPDATE cache_probe SET amount = :amount; UPDATE cache_probe SET amount = :amount;", { amount: 1 }),
    /Parameterized SQLite statements must be single statements\./,
    "parameterized multi-statement SQL should keep the existing error",
  );
  await assert.rejects(
    db.query("SELECT bad syntax FROM"),
    /incomplete input|syntax error/i,
    "driver syntax errors should surface unchanged",
  );

  // Transaction semantics are unchanged: rollback restores prior state.
  await assert.rejects(db.transaction(async (tx) => {
    await tx.run("UPDATE cache_probe SET amount = :amount WHERE id = :id", { amount: 111111, id: 5 });
    throw new Error("force rollback");
  }), /force rollback/);
  const rolledBack = requireRow(await db.get("SELECT amount FROM cache_probe WHERE id = :id", { id: 5 }), "rolledBack");
  assert.equal(rolledBack.amount, 50, "rolled-back writes must not leak through cached statements");

  const committed = requireRow(await db.transaction(async (tx) => {
    await tx.run("UPDATE cache_probe SET amount = :amount WHERE id = :id", { amount: 555, id: 5 });
    return tx.get("SELECT amount FROM cache_probe WHERE id = :id", { id: 5 });
  }), "committed");
  assert.equal(committed.amount, 555, "transaction clients should read their own writes");

  // Connection reset: the cache survives close/reopen with identical behavior.
  await closeDatabase();
  const reopened = requireRow(await db.get("SELECT amount FROM cache_probe WHERE id = :id", { id: 5 }), "reopened");
  assert.equal(reopened.amount, 555, "queries after connection reset should re-prepare and return identical results");

  // Schema changes are observed by previously cached statements.
  const starBefore = await db.get("SELECT * FROM cache_probe WHERE id = :id", { id: 1 });
  assert.deepEqual(Object.keys(requireRow(starBefore, "starBefore")), ["id", "label", "amount"]);
  await db.run("ALTER TABLE cache_probe ADD COLUMN extra TEXT");
  const starAfter = await db.get("SELECT * FROM cache_probe WHERE id = :id", { id: 1 });
  assert.deepEqual(Object.keys(requireRow(starAfter, "starAfter")), ["id", "label", "amount", "extra"], "cached statements must observe schema changes");

  const integrity = await db.query("PRAGMA integrity_check;");
  assert.equal(integrity[0]?.integrity_check, "ok", "statement-cache database should pass integrity check");

  console.log("sqlite statement cache adapter regression passed.");
} finally {
  await closeDatabase();
  await fs.rm(tempDir, { force: true, recursive: true });
}
