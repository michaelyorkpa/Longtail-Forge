// Repeatable SQLite adapter micro-benchmark.
//
// Measures the adapter hot paths against a disposable database file:
//   - hot single-row read (db.get)
//   - hot list read (db.query)
//   - hot variable-length IN (:ids) list read (db.query)
//   - hot write (db.run)
//   - transaction (db.transaction)
//
// Usage:
//   npm run bench:adapter            # human-readable table
//   npm run bench:adapter -- --json  # machine-readable JSON result line
//
// The workload is deterministic (fixed seed, fixed iteration counts) so runs
// before and after adapter changes are comparable on the same machine.

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-adapter-microbenchmark-"));
process.env.LONGTAIL_DATABASE_FILE = path.join(tempDir, "adapter-microbenchmark.db");
process.env.SUPER_ADMIN_PASSWORD = "Adapter-Microbenchmark-Test-123!";

const { closeDatabase, db, initializeDatabaseRuntime } = await import("../src/db/index.js");

const SEED_ROW_COUNT = 1000;
const WARMUP_FRACTION = 0.1;
const OUTPUT_JSON = process.argv.includes("--json");

function createDeterministicRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

async function measureScenario(name, iterations, operation) {
  const warmupIterations = Math.max(1, Math.floor(iterations * WARMUP_FRACTION));

  for (let index = 0; index < warmupIterations; index += 1) {
    await operation(index);
  }

  const startedAt = process.hrtime.bigint();

  for (let index = 0; index < iterations; index += 1) {
    await operation(index);
  }

  const elapsedNs = Number(process.hrtime.bigint() - startedAt);
  const meanMicroseconds = elapsedNs / iterations / 1000;

  return {
    name,
    iterations,
    meanMicroseconds: Number(meanMicroseconds.toFixed(2)),
    operationsPerSecond: Math.round(iterations / (elapsedNs / 1_000_000_000)),
  };
}

try {
  await initializeDatabaseRuntime();

  await db.run(`
CREATE TABLE IF NOT EXISTS adapter_bench (
  id INTEGER PRIMARY KEY,
  label TEXT NOT NULL,
  amount INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);
`);
  await db.run("DELETE FROM adapter_bench;");

  await db.transaction(async (tx) => {
    for (let id = 1; id <= SEED_ROW_COUNT; id += 1) {
      await tx.run(
        "INSERT INTO adapter_bench (id, label, amount, updated_at) VALUES (:id, :label, :amount, :updatedAt)",
        {
          amount: (id * 37) % 5000,
          id,
          label: `bench-row-${id}`,
          updatedAt: "2026-01-01T00:00:00.000Z",
        },
      );
    }
  });

  const random = createDeterministicRandom(0x5eed_1234);
  const rowId = () => 1 + Math.floor(random() * SEED_ROW_COUNT);
  const results = [];

  results.push(await measureScenario("hot-single-row-read (db.get)", 5000, async () => {
    const row = await db.get(
      "SELECT id, label, amount FROM adapter_bench WHERE id = :id",
      { id: rowId() },
    );

    if (!row) {
      throw new Error("hot-single-row-read returned no row");
    }
  }));

  results.push(await measureScenario("hot-list-read (db.query)", 2000, async () => {
    const rows = await db.query(
      "SELECT id, label, amount FROM adapter_bench WHERE amount >= :floor ORDER BY id LIMIT 100",
      { floor: Math.floor(random() * 1000) },
    );

    if (!rows.length) {
      throw new Error("hot-list-read returned no rows");
    }
  }));

  results.push(await measureScenario("hot-in-list-read (db.query IN :ids)", 2000, async (index) => {
    const idCount = 1 + (index % 20);
    const ids = Array.from({ length: idCount }, rowId);
    const rows = await db.query(
      "SELECT id, label, amount FROM adapter_bench WHERE id IN (:ids) ORDER BY id",
      { ids },
    );

    if (!rows.length) {
      throw new Error("hot-in-list-read returned no rows");
    }
  }));

  results.push(await measureScenario("hot-write (db.run)", 2000, async (index) => {
    await db.run(
      "UPDATE adapter_bench SET amount = :amount, updated_at = :updatedAt WHERE id = :id",
      {
        amount: index % 5000,
        id: rowId(),
        updatedAt: "2026-01-02T00:00:00.000Z",
      },
    );
  }));

  results.push(await measureScenario("transaction (two writes)", 500, async (index) => {
    await db.transaction(async (tx) => {
      await tx.run(
        "UPDATE adapter_bench SET amount = :amount WHERE id = :id",
        { amount: index % 5000, id: rowId() },
      );
      await tx.run(
        "UPDATE adapter_bench SET updated_at = :updatedAt WHERE id = :id",
        { id: rowId(), updatedAt: "2026-01-03T00:00:00.000Z" },
      );
    });
  }));

  if (OUTPUT_JSON) {
    console.log(JSON.stringify({ results, seedRowCount: SEED_ROW_COUNT }));
  } else {
    console.log("[adapter-microbenchmark] seed rows:", SEED_ROW_COUNT);

    for (const result of results) {
      console.log(
        `[adapter-microbenchmark] ${result.name}: ${result.meanMicroseconds} us/op over ${result.iterations} iterations (${result.operationsPerSecond} ops/s)`,
      );
    }
  }
} finally {
  await closeDatabase();
  await fs.rm(tempDir, { force: true, recursive: true });
}
