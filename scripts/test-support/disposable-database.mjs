import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { hasRegisteredVerifiedRegressionBaselineHandshake } from "../../src/db/regression-baseline-fast-path.js";

const DEFAULT_FIXTURE_PASSWORD = "Regression-Fixture-Password-123!";

async function createDisposableDatabaseFixture(name, { reuseExisting = false } = {}) {
  const existingDatabaseFile = String(process.env.LONGTAIL_DATABASE_FILE || "").trim();

  const mayReuseRunnerFixture = reuseExisting || hasRegisteredVerifiedRegressionBaselineHandshake();
  if (mayReuseRunnerFixture && existingDatabaseFile && isPathWithin(os.tmpdir(), existingDatabaseFile)) {
    return {
      databaseFile: path.resolve(existingDatabaseFile),
      ownsFixture: false,
      root: path.dirname(path.resolve(existingDatabaseFile)),
      async cleanup() {},
    };
  }

  const safeName = String(name || "regression")
    .replace(/[^a-z0-9.-]+/gi, "-")
    .replace(/^-+|-+$/g, "") || "regression";
  const root = await fs.mkdtemp(path.join(os.tmpdir(), `ltf-${safeName}-`));
  const databaseFile = path.join(root, `${safeName}.db`);

  process.env.LONGTAIL_DATABASE_FILE = databaseFile;
  process.env.LONGTAIL_DATA_DIR = root;
  process.env.SUPER_ADMIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD || DEFAULT_FIXTURE_PASSWORD;

  return {
    databaseFile,
    ownsFixture: true,
    root,
    async cleanup() {
      await fs.rm(root, { recursive: true, force: true });
    },
  };
}

function isPathWithin(parentPath, candidatePath) {
  const relativePath = path.relative(path.resolve(parentPath), path.resolve(candidatePath));
  return relativePath !== "" && relativePath !== ".." && !relativePath.startsWith(`..${path.sep}`) && !path.isAbsolute(relativePath);
}

export { createDisposableDatabaseFixture };
