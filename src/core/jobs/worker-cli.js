import { config, logRuntimeConfigWarnings } from "../../config.js";
import {
  closeDatabase,
  formatDatabaseHealth,
  formatStartupPhase,
  initializeWorkerDatabase,
} from "../../db/index.js";
import {
  formatJobWorkerStatus,
  getJobWorkerStatus,
  startJobWorker,
  stopJobWorker,
} from "./job-runner.js";
import { acquireWorkerProcessLock } from "./worker-process-lock.js";
import { filesService } from "../../services/files.service.js";
import { registerFutureImportJobHandlers } from "../../services/import-jobs.service.js";
import { jobsService } from "../../services/jobs.service.js";
import { notificationsService } from "../../services/notifications.service.js";
import { registerSearchIndexJobHandlers } from "../../services/search-index-jobs.service.js";
import { assertRuntimeDataPathsReady } from "../runtime-readiness.js";
import { operationalLogger } from "../operational-logger.js";
import { workspacePurgeService } from "../../services/workspace-purge.service.js";
import { activateModuleRuntime, runModuleStartupTasks } from "../modules/module-runtime.js";
import { registerFrameworkHelpSearchIndexers } from "../help/search-indexers.js";
import { assertPublicDemoRuntimeReady } from "../public-demo-runtime.js";

let workerLock = null;
let shuttingDown = false;

async function startWorkerProcess(options = {}) {
  const logger = options.logger || console;
  logRuntimeConfigWarnings(config.environment === "production"
    ? () => operationalLogger.warn("runtime.configuration.unsafe_override")
    : (logger.warn?.bind(logger) || console.warn));

  if (config.worker.mode === "disabled") {
    logger.log("[job-worker] mode=disabled state=disabled");
    return getJobWorkerStatus();
  }

  if (config.worker.mode !== "separate") {
    throw new Error("node worker.js requires LONGTAIL_WORKER_MODE=separate. Use inline mode from the app server, or disabled mode for troubleshooting.");
  }

  await assertPublicDemoRuntimeReady();
  await assertRuntimeDataPathsReady();
  await filesService.assertConfiguredFileStorageProviderReady();
  await filesService.assertConfiguredFileScannerReady();
  workerLock = await acquireWorkerProcessLock();
  logger.log(`[job-worker] acquired_lock=${workerLock.lockPath}`);

  const databaseHealth = await initializeWorkerDatabase({
    report: (event) => logger.log(formatStartupPhase(event)),
  });
  logger.log(formatDatabaseHealth(databaseHealth));
  const retentionPrune = await jobsService.pruneOldJobs();
  logger.log(`[job-retention] prune=complete completed_deleted=${retentionPrune.completed.deleted} dead_deleted=${retentionPrune.dead.deleted}`);
  registerFrameworkHelpSearchIndexers();
  activateModuleRuntime("worker");
  registerSearchIndexJobHandlers();
  filesService.registerFileScanJobHandlers();
  registerFutureImportJobHandlers();
  workspacePurgeService.registerWorkspacePurgeJobHandlers();
  notificationsService.registerNotificationJobHandlers();
  await runModuleStartupTasks("worker", { logger });

  await startJobWorker({
    logger,
    mode: "separate",
    workerId: config.worker.id,
  });
  await workerLock.markReady();
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
