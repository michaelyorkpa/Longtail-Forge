import os from "node:os";
import path from "node:path";

/** @param {string} databaseFile @param {{ entrypoint?: string, tempDirectory?: string }} [options] */
function assertRegressionDatabaseTarget(databaseFile, options = {}) {
  const entrypoint = path.resolve(options.entrypoint || process.argv[1] || "");

  if (!/regression\.mjs$/i.test(entrypoint)) {
    return;
  }

  const resolvedDatabaseFile = path.resolve(String(databaseFile || ""));
  const resolvedTempDirectory = path.resolve(options.tempDirectory || os.tmpdir());
  const relativeToTemp = path.relative(resolvedTempDirectory, resolvedDatabaseFile);
  const isInsideTempDirectory = Boolean(relativeToTemp) &&
    relativeToTemp !== ".." &&
    !relativeToTemp.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relativeToTemp);

  if (!isInsideTempDirectory) {
    throw new Error(
      `Regression database safety refused non-disposable target: ${resolvedDatabaseFile}. ` +
      `Regression entry points must select a database beneath ${resolvedTempDirectory} before importing database/runtime modules.`,
    );
  }
}

export { assertRegressionDatabaseTarget };
