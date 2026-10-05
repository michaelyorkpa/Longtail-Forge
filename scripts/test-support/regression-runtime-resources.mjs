import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const NODE_COMPILE_CACHE_PREFIX = "ltf-regression-node-compile-cache-";

async function prepareRegressionNodeCompileCache({ parentDirectory = os.tmpdir() } = {}) {
  return fs.mkdtemp(path.join(parentDirectory, NODE_COMPILE_CACHE_PREFIX));
}

/**
 * @param {string | null | undefined} directory
 * @returns {Promise<void>}
 */
async function cleanupRegressionNodeCompileCache(directory) {
  if (!directory) {
    return;
  }

  await fs.rm(directory, { force: true, recursive: true });
}

export {
  NODE_COMPILE_CACHE_PREFIX,
  cleanupRegressionNodeCompileCache,
  prepareRegressionNodeCompileCache,
};
