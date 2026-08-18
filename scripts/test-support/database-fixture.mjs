import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createVerifiedRegressionBaselineHandshake } from "../../src/db/regression-baseline-fast-path.js";

const DEFAULT_FIXTURE_PASSWORD = "Regression-Fixture-Password-123!";

async function prepareRegressionBaselineDatabase() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ltf-regression-suite-"));
  const baselineDataDir = path.join(root, "baseline-data");
  const baselineDb = path.join(baselineDataDir, "longtail-forge.db");
  await fs.mkdir(baselineDataDir, { recursive: true });

  const originalEnv = captureEnv([
    "LONGTAIL_DATABASE_FILE",
    "LONGTAIL_DATA_DIR",
    "LTF_REGRESSION_BASELINE_DB",
    "SUPER_ADMIN_PASSWORD",
  ]);

  process.env.LONGTAIL_DATABASE_FILE = baselineDb;
  process.env.LONGTAIL_DATA_DIR = baselineDataDir;
  process.env.SUPER_ADMIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD || DEFAULT_FIXTURE_PASSWORD;
  delete process.env.LTF_REGRESSION_BASELINE_DB;

  let migrationRows;
  try {
    const db = await import("../../src/db/index.js");
    const { readMigrationReadiness } = await import("../../src/db/migrations.js");
    try {
      await db.initializeDatabase();
      const integrityRows = await db.querySql("PRAGMA integrity_check;");
      const foreignKeyViolations = await db.querySql("PRAGMA foreign_key_check;");
      const foreignKeys = await db.querySql("PRAGMA foreign_keys;");
      migrationRows = await db.querySql(`
SELECT version, module_id, checksum
FROM schema_migrations
ORDER BY version, module_id;
`);
      if (integrityRows[0]?.integrity_check !== "ok") {
        throw new Error("Regression baseline failed PRAGMA integrity_check.");
      }
      if (foreignKeyViolations.length !== 0 || Number(foreignKeys[0]?.foreign_keys) !== 1) {
        throw new Error("Regression baseline failed SQLite foreign-key verification.");
      }
      if (!(await readMigrationReadiness())) {
        throw new Error("Regression baseline does not match the current migration identity.");
      }

    } finally {
      await db.closeSqlite();
    }
  } finally {
    restoreEnv(originalEnv);
  }

  const verifiedBaselineHandshake = await createVerifiedRegressionBaselineHandshake({
    baselineDatabaseFile: baselineDb,
    migrationCount: migrationRows.length,
    migrationIdentitySha256: createHash("sha256").update(JSON.stringify(migrationRows)).digest("hex"),
  });

  return {
    baselineDb,
    verifiedBaselineHandshake,
    /**
     * @param {string} script
     * @param {number} index
     * @param {{ namespace?: string, useBaseline?: boolean }} [options]
     */
    async createScriptLaunch(script, index, options = {}) {
      const useBaseline = options.useBaseline !== false;
      const namespace = sanitizePathSegment(options.namespace || "default");
      const scriptDataDir = path.join(root, "script-data", namespace, `${String(index).padStart(3, "0")}-${sanitizePathSegment(script)}`);
      await fs.mkdir(scriptDataDir, { recursive: true });

      /** @type {NodeJS.ProcessEnv} */
      const env = {
        ...process.env,
        LONGTAIL_DATABASE_FILE: path.join(scriptDataDir, "longtail-forge.db"),
        LONGTAIL_DATA_DIR: scriptDataDir,
        SUPER_ADMIN_PASSWORD: process.env.SUPER_ADMIN_PASSWORD || DEFAULT_FIXTURE_PASSWORD,
      };

      if (useBaseline) {
        env.LTF_REGRESSION_BASELINE_DB = baselineDb;
        env.LTF_REGRESSION_VERIFIED_BASELINE_FD = "3";
      } else {
        delete env.LTF_REGRESSION_BASELINE_DB;
        delete env.LTF_REGRESSION_VERIFIED_BASELINE_FD;
      }

      return {
        env,
        verifiedBaselineHandshake: useBaseline ? verifiedBaselineHandshake : null,
      };
    },
    async cleanup() {
      await fs.rm(root, { recursive: true, force: true });
    },
  };
}

/** @param {readonly string[]} keys */
function captureEnv(keys) {
  return Object.fromEntries(keys.map((key) => [key, process.env[key]]));
}

/** @param {Record<string, string | undefined>} values */
function restoreEnv(values) {
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

/** @param {string} value */
function sanitizePathSegment(value) {
  return String(value || "").replace(/[^a-z0-9.-]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "regression";
}

export { prepareRegressionBaselineDatabase };
