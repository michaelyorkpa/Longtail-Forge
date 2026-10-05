import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createRegressionSuite,
  discoverRegressionEntries,
} from "./lib/regression-discovery.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REGRESSION_ENTRIES = await discoverRegressionEntries({ rootDir });
const REGRESSION_BUCKETS = createRegressionSuite(REGRESSION_ENTRIES);

/** @param {string} runMode */
const bucketScripts = (runMode) => Object.freeze(
  REGRESSION_ENTRIES
    .filter((entry) => entry.runMode === runMode)
    .map((entry) => entry.path),
);

const STATIC_REGRESSIONS = bucketScripts("static");
const DEFAULT_DATABASE_REGRESSIONS = bucketScripts("serial-database");
const FILE_STORAGE_REGRESSIONS = bucketScripts("serial-files");
const ISOLATED_DATABASE_REGRESSIONS = bucketScripts("isolated-database");
const REGRESSION_SCRIPTS = Object.freeze(REGRESSION_ENTRIES.map((entry) => entry.path));
const REGRESSION_COMMANDS = Object.freeze(REGRESSION_SCRIPTS.map((script) => `node ${script}`));

export {
  DEFAULT_DATABASE_REGRESSIONS,
  FILE_STORAGE_REGRESSIONS,
  ISOLATED_DATABASE_REGRESSIONS,
  REGRESSION_BUCKETS,
  REGRESSION_COMMANDS,
  REGRESSION_ENTRIES,
  REGRESSION_SCRIPTS,
  STATIC_REGRESSIONS,
};
