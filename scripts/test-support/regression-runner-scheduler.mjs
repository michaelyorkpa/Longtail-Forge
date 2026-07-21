import os from "node:os";

const AUTO_ISOLATED_PARALLELISM_CAP = 6;
const DEFAULT_ISOLATED_PARALLELISM = 4;

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

function resolveIsolatedFilesParallelism(options = {}) {
  return resolveRegressionParallelism({
    ...options,
    directOverrideName: "LTF_ISOLATED_FILES_PARALLELISM",
  });
}

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

async function runLimitedItems(items, concurrency, runItem) {
  const effectiveConcurrency = Math.max(1, concurrency || 1);
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

function getAvailableParallelism() {
  if (typeof os.availableParallelism === "function") {
    return os.availableParallelism();
  }

  return os.cpus().length;
}

function normalizeAvailableParallelism(value) {
  return Number.isInteger(value) && value > 0 ? value : 0;
}

function parsePositiveInteger(value) {
  const parsed = Number.parseInt(value || "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export {
  AUTO_ISOLATED_PARALLELISM_CAP,
  DEFAULT_ISOLATED_PARALLELISM,
  calculateAutoIsolatedParallelism,
  resolveIsolatedFilesParallelism,
  resolveIsolatedRegressionParallelism,
  runLimitedItems,
};
