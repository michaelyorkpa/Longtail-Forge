import { config, logRuntimeConfigWarnings } from "../../config.js";
import {
  closeDatabase,
  formatDatabaseHealth,
  initializeWorkerDatabase,
} from "../../db/index.js";
import {
  formatJobWorkerStatus,
  getJobWorkerStatus,
  startJobWorker,
  stopJobWorker,
} from "./job-runner.js";
import { acquireWorkerProcessLock } from "./worker-process-lock.js";

let workerLock = null;
let shuttingDown = false;

async function startWorkerProcess(options = {}) {
  const logger = options.logger || console;
  logRuntimeConfigWarnings(logger.warn?.bind(logger) || console.warn);

  if (config.worker.mode === "disabled") {
    logger.log("[job-worker] mode=disabled state=disabled");
    return getJobWorkerStatus();
  }

  if (config.worker.mode !== "separate") {
    throw new Error("node worker.js requires LONGTAIL_WORKER_MODE=separate. Use inline mode from the app server, or disabled mode for troubleshooting.");
  }

  workerLock = await acquireWorkerProcessLock();
  logger.log(`[job-worker] acquired_lock=${workerLock.lockPath}`);

  const databaseHealth = await initializeWorkerDatabase();
  logger.log(formatDatabaseHealth(databaseHealth));

  await startJobWorker({
    logger,
    mode: "separate",
    workerId: config.worker.id,
  });
  logger.log(formatJobWorkerStatus());
  registerShutdownHandlers(logger);

  return getJobWorkerStatus();
}

async function startWorkerCli() {
  try {
    await startWorkerProcess();
  } catch (error) {
    console.error("[job-worker] Worker startup failed.");
    console.error(error.message || error);
    await releaseWorkerResources();
    process.exitCode = 1;
  }
}

function registerShutdownHandlers(logger) {
  const shutdown = (signal) => {
    void shutdownWorker(signal, logger);
  };

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

async function shutdownWorker(signal, logger = console) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  logger.log(`[job-worker] ${signal} received; stopping.`);
  await stopJobWorker({ logger });
  logger.log(formatJobWorkerStatus());
  await releaseWorkerResources();
  process.exitCode = 0;
}

async function releaseWorkerResources() {
  if (workerLock) {
    await workerLock.release().catch((error) => {
      console.warn("[job-worker] Failed to release worker lock.");
      console.warn(error.message || error);
    });
    workerLock = null;
  }

  await closeDatabase();
}

export {
  releaseWorkerResources,
  startWorkerCli,
  startWorkerProcess,
};
