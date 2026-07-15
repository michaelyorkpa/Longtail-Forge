import { config } from "../config.js";
import { getJobWorkerStatus } from "../core/jobs/index.js";
import { readSeparateWorkerReadiness } from "../core/jobs/worker-process-lock.js";
import { readMigrationReadiness } from "../db/migrations.js";
import { readDatabaseHealth } from "../db/provider.js";

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
        && ["idle", "running"].includes(status.state);
    }

    if (workerMode === "separate") {
      return readSeparateWorker();
    }

    return false;
  }

  return Object.freeze({ isReady });
}

function databaseIsReady(health) {
  if (!health || typeof health !== "object") {
    return false;
  }

  if (health.provider === "sqlite") {
    return health.databaseFileWritable === true
      && health.foreignKeysEnabled === true
      && health.busyTimeoutMs === config.sqlite.busyTimeoutMs
      && health.journalMode === config.sqlite.journalMode;
  }

  return health.ready === true;
}

const operationalReadinessService = createOperationalReadinessService();

export {
  createOperationalReadinessService,
  operationalReadinessService,
};
