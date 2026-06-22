import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

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

  try {
    const db = await import("../../src/db/index.js");
    await db.initializeDatabase();
    await db.closeSqlite();
  } finally {
    restoreEnv(originalEnv);
  }

  return {
    baselineDb,
    async createScriptEnv(script, index, options = {}) {
      const useBaseline = options.useBaseline !== false;
      const scriptDataDir = path.join(root, "script-data", `${String(index).padStart(3, "0")}-${sanitizeScriptName(script)}`);
      await fs.mkdir(scriptDataDir, { recursive: true });

      const env = {
        ...process.env,
        LONGTAIL_DATABASE_FILE: path.join(scriptDataDir, "longtail-forge.db"),
        LONGTAIL_DATA_DIR: scriptDataDir,
        SUPER_ADMIN_PASSWORD: process.env.SUPER_ADMIN_PASSWORD || DEFAULT_FIXTURE_PASSWORD,
      };

      if (useBaseline) {
        env.LTF_REGRESSION_BASELINE_DB = baselineDb;
      } else {
        delete env.LTF_REGRESSION_BASELINE_DB;
      }

      return env;
    },
    async cleanup() {
      await fs.rm(root, { recursive: true, force: true });
    },
  };
}

function captureEnv(keys) {
  return Object.fromEntries(keys.map((key) => [key, process.env[key]]));
}

function restoreEnv(values) {
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function sanitizeScriptName(script) {
  return script.replace(/[^a-z0-9.-]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "regression";
}

export { prepareRegressionBaselineDatabase };
