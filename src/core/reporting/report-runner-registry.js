// @ts-check

const REPORT_RUNNER_ID_PATTERN = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;

/** @type {Map<string, import("../../types/framework-contracts.js").ReportRunner>} */
const runnersById = new Map();

/**
 * Register executable report behavior outside the data-only module manifest.
 *
 * @param {string} runnerId
 * @param {import("../../types/framework-contracts.js").ReportRunner} runner
 * @param {{ replace?: boolean }} [options]
 */
function registerReportRunner(runnerId, runner, options = {}) {
  const normalizedRunnerId = normalizeReportRunnerId(runnerId);

  if (typeof runner !== "function") {
    throw new TypeError(`Report runner '${normalizedRunnerId}' must be a function.`);
  }

  if (!options.replace && runnersById.has(normalizedRunnerId)) {
    throw new Error(`Report runner '${normalizedRunnerId}' is already registered.`);
  }

  runnersById.set(normalizedRunnerId, runner);

  return () => {
    if (runnersById.get(normalizedRunnerId) === runner) {
      runnersById.delete(normalizedRunnerId);
    }
  };
}

function getReportRunner(runnerId) {
  return runnersById.get(normalizeReportRunnerId(runnerId)) || null;
}

function listReportRunnerIds() {
  return [...runnersById.keys()].sort();
}

function clearReportRunnersForTests() {
  runnersById.clear();
}

function normalizeReportRunnerId(runnerId) {
  const normalizedRunnerId = String(runnerId || "").trim();

  if (!REPORT_RUNNER_ID_PATTERN.test(normalizedRunnerId)) {
    throw new TypeError("Report runner ID must be a non-empty stable data identifier.");
  }

  return normalizedRunnerId;
}

export {
  clearReportRunnersForTests,
  getReportRunner,
  listReportRunnerIds,
  registerReportRunner,
};
