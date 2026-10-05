import os from "node:os";

const AUTO_ISOLATED_PARALLELISM_CAP = 6;
const AUTO_STATIC_PARALLELISM_CAP = 8;
const DEFAULT_ISOLATED_PARALLELISM = 4;
const DEFAULT_STATIC_PARALLELISM = 6;

/**
 * @typedef {{ parallelism: number, source: string }} ParallelismResolution
 * @typedef {{ availableParallelism?: number, env?: NodeJS.ProcessEnv, fallbackParallelism?: number }} ParallelismOptions
 */

/**
 * @param {ParallelismOptions} [options]
 * @returns {ParallelismResolution}
 */
function resolveStaticRegressionParallelism({
  availableParallelism = getAvailableParallelism(),
  env = process.env,
  fallbackParallelism = DEFAULT_STATIC_PARALLELISM,
} = {}) {
  const directOverride = parsePositiveInteger(env.LTF_STATIC_REGRESSION_PARALLELISM);
  if (directOverride) {
    return { parallelism: directOverride, source: "LTF_STATIC_REGRESSION_PARALLELISM" };
  }

  const sharedOverride = parsePositiveInteger(env.LTF_REGRESSION_PARALLELISM);
  if (sharedOverride) {
    return { parallelism: sharedOverride, source: "LTF_REGRESSION_PARALLELISM" };
  }

  return {
    parallelism: calculateAutoStaticParallelism(availableParallelism, fallbackParallelism),
    source: "auto:" + normalizeAvailableParallelism(availableParallelism) + "-available",
  };
}

/**
 * @param {ParallelismOptions} [options]
 * @returns {ParallelismResolution}
 */
function resolveIsolatedRegressionParallelism({
  availableParallelism = getAvailableParallelism(),
  env = process.env,
  fallbackParallelism = DEFAULT_ISOLATED_PARALLELISM,
} = {}) {
  return resolveRegressionParallelism({
    availableParallelism,
    directOverrideName: "LTF_ISOLATED_REGRESSION_PARALLELISM",
    env,
    fallbackParallelism,
  });
}

/**
 * @param {ParallelismOptions} [options]
 * @returns {ParallelismResolution}
 */
function resolveIsolatedFilesParallelism(options = {}) {
  return resolveRegressionParallelism({
    ...options,
    directOverrideName: "LTF_ISOLATED_FILES_PARALLELISM",
  });
}

/**
 * @param {ParallelismOptions & { directOverrideName: string }} options
 * @returns {ParallelismResolution}
 */
function resolveRegressionParallelism({
  availableParallelism = getAvailableParallelism(),
  directOverrideName,
  env = process.env,
  fallbackParallelism = DEFAULT_ISOLATED_PARALLELISM,
}) {
  const directOverride = parsePositiveInteger(env[directOverrideName]);

  if (directOverride) {
    return { parallelism: directOverride, source: directOverrideName };
  }

  const sharedOverride = parsePositiveInteger(env.LTF_REGRESSION_PARALLELISM);
  if (sharedOverride) {
    return { parallelism: sharedOverride, source: "LTF_REGRESSION_PARALLELISM" };
  }

  return {
    parallelism: calculateAutoIsolatedParallelism(availableParallelism, fallbackParallelism),
    source: `auto:${normalizeAvailableParallelism(availableParallelism)}-available`,
  };
}

/**
 * @template TItem
 * @template {{ exitCode: number | null }} TResult
 * @param {readonly TItem[]} items
 * @param {number} concurrency
 * @param {(item: TItem, itemIndex: number) => Promise<TResult>} runItem
 * @returns {Promise<(TResult & { itemIndex: number })[]>}
 */
async function runLimitedItems(items, concurrency, runItem) {
  const effectiveConcurrency = Math.max(1, concurrency || 1);
  /** @type {(TResult & { itemIndex: number })[]} */
  const results = [];
  const running = new Set();
  let nextIndex = 0;
  let failed = false;

  async function scheduleNext() {
    if (failed || nextIndex >= items.length) {
      return;
    }

    const item = items[nextIndex];
    const itemIndex = nextIndex;
    nextIndex += 1;
    const promise = runItem(item, itemIndex)
      .then((result) => {
        results.push({
          ...result,
          itemIndex,
        });
        if (result.exitCode !== 0) {
          failed = true;
        }
      })
      .finally(() => {
        running.delete(promise);
      });
    running.add(promise);
  }

  while (running.size < effectiveConcurrency && nextIndex < items.length) {
    await scheduleNext();
  }

  while (running.size > 0) {
    await Promise.race(running);
    while (!failed && running.size < effectiveConcurrency && nextIndex < items.length) {
      await scheduleNext();
    }
  }

  return results.sort((left, right) => left.itemIndex - right.itemIndex);
}

/**
 * @param {number} availableParallelism
 * @param {number} [fallbackParallelism]
 * @returns {number}
 */
function calculateAutoIsolatedParallelism(availableParallelism, fallbackParallelism = DEFAULT_ISOLATED_PARALLELISM) {
  const normalizedAvailable = normalizeAvailableParallelism(availableParallelism);

  if (normalizedAvailable <= 0) {
    return Math.max(1, fallbackParallelism || DEFAULT_ISOLATED_PARALLELISM);
  }

  const halfAvailable = Math.max(1, Math.floor(normalizedAvailable / 2));
  const lowerBound = Math.min(
    normalizedAvailable,
    Math.max(1, fallbackParallelism || DEFAULT_ISOLATED_PARALLELISM),
  );

  return Math.min(
    AUTO_ISOLATED_PARALLELISM_CAP,
    normalizedAvailable,
    Math.max(lowerBound, halfAvailable),
  );
}

/**
 * @param {number} availableParallelism
 * @param {number} [fallbackParallelism]
 * @returns {number}
 */
function calculateAutoStaticParallelism(availableParallelism, fallbackParallelism = DEFAULT_STATIC_PARALLELISM) {
  const normalizedAvailable = normalizeAvailableParallelism(availableParallelism);

  if (normalizedAvailable <= 0) {
    return Math.max(1, fallbackParallelism || DEFAULT_STATIC_PARALLELISM);
  }

  const hostAware = Math.max(1, Math.ceil((normalizedAvailable * 2) / 3));
  const lowerBound = Math.min(
    normalizedAvailable,
    Math.max(1, fallbackParallelism || DEFAULT_STATIC_PARALLELISM),
  );

  return Math.min(
    AUTO_STATIC_PARALLELISM_CAP,
    normalizedAvailable,
    Math.max(lowerBound, hostAware),
  );
}

function getAvailableParallelism() {
  if (typeof os.availableParallelism === "function") {
    return os.availableParallelism();
  }

  return os.cpus().length;
}

/**
 * @param {number} value
 * @returns {number}
 */
function normalizeAvailableParallelism(value) {
  return Number.isInteger(value) && value > 0 ? value : 0;
}

/**
 * @param {string | undefined} value
 * @returns {number | null}
 */
function parsePositiveInteger(value) {
  const parsed = Number.parseInt(value || "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export {
  AUTO_ISOLATED_PARALLELISM_CAP,
  AUTO_STATIC_PARALLELISM_CAP,
  DEFAULT_ISOLATED_PARALLELISM,
  DEFAULT_STATIC_PARALLELISM,
  calculateAutoIsolatedParallelism,
  calculateAutoStaticParallelism,
  resolveIsolatedFilesParallelism,
  resolveIsolatedRegressionParallelism,
  resolveStaticRegressionParallelism,
  runLimitedItems,
};
