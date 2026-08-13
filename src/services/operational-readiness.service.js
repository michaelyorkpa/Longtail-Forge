import { config } from "../config.js";
import { getJobWorkerStatus } from "../core/jobs/index.js";
import { readSeparateWorkerReadiness } from "../core/jobs/worker-process-lock.js";
import { readMigrationReadiness } from "../db/migrations.js";
import { readDatabaseHealth } from "../db/provider.js";

/**
 * @typedef {Object} OperationalReadinessDependencies
 * @property {() => Promise<unknown>} [readDatabaseHealth]
 * @property {() => Promise<boolean>} [readMigrationReadiness]
 * @property {() => { mode?: string, state?: string, timerActive?: boolean }} [getJobWorkerStatus]
 * @property {() => Promise<boolean>} [readSeparateWorkerReadiness]
 * @property {string} [workerMode]
 */
/** @param {OperationalReadinessDependencies} [dependencies] */
function createOperationalReadinessService(dependencies = {}) {
  const readDatabase = dependencies.readDatabaseHealth || readDatabaseHealth;
  const readMigrations = dependencies.readMigrationReadiness || readMigrationReadiness;
  const readInlineWorker = dependencies.getJobWorkerStatus || getJobWorkerStatus;
  const readSeparateWorker = dependencies.readSeparateWorkerReadiness || readSeparateWorkerReadiness;
  const workerMode = dependencies.workerMode || config.worker.mode;

  async function isReady() {
    try {
      const databaseHealth = await readDatabase();
      if (!databaseIsReady(databaseHealth)) {
        return false;
      }

      if (!(await readMigrations())) {
        return false;
      }

      return await workerIsReady();
    } catch {
      return false;
    }
  }

  async function workerIsReady() {
    if (workerMode === "inline") {
      const status = readInlineWorker();
      return status?.mode === "inline"
        && status.timerActive === true
        && ["idle", "running"].includes(String(status.state || ""));
    }

    if (workerMode === "separate") {
      return readSeparateWorker();
    }

    return false;
  }

  return Object.freeze({ isReady });
}

/** @param {unknown} health */
function databaseIsReady(health) {
  if (!health || typeof health !== "object") {
    return false;
  }

  const readiness = /** @type {Record<string, unknown>} */ (health);
  if (readiness.provider === "sqlite") {
    return readiness.databaseFileWritable === true
      && readiness.foreignKeysEnabled === true
      && readiness.busyTimeoutMs === config.sqlite.busyTimeoutMs
      && readiness.journalMode === config.sqlite.journalMode;
  }

  return readiness.ready === true;
}

const operationalReadinessService = createOperationalReadinessService();

export {
  createOperationalReadinessService,
  operationalReadinessService,
};
