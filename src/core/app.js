// @ts-check

import express from "express";
import compression from "compression";
import cookieParser from "cookie-parser";
import { config, logRuntimeConfigWarnings } from "../config.js";
import { closeDatabase, formatDatabaseHealth, formatStartupPhase, initializeDatabase } from "../db/index.js";
import { errorHandler } from "../middleware/error-handler.js";
import { requireAuth } from "../middleware/require-auth.js";
import { supportViewRequestGate } from "../middleware/support-view-request-gate.js";
import { appInfoRoutes } from "../routes/app-info.routes.js";
import { publicDemoAccountRoutes } from "../routes/public-demo-account.routes.js";
import { accountExportRecoveryRoutes } from "../routes/account-export-recovery.routes.js";
import { appShellRoutes } from "../routes/app-shell.routes.js";
import { apiKeysRoutes } from "../routes/api-keys.routes.js";
import { auditRoutes } from "../routes/audit.routes.js";
import { authRoutes } from "../routes/auth.routes.js";
import { dashboardRoutes } from "../routes/dashboard.routes.js";
import { filesRoutes } from "../routes/files.routes.js";
import { helpRoutes } from "../routes/help.routes.js";
import { jobsRoutes } from "../routes/jobs.routes.js";
import { publicApiRoutes } from "../routes/public-api.routes.js";
import {
  privateFeedLifecycleRoutes,
  privateFeedPublicRoutes,
} from "../routes/private-feeds.routes.js";
import { notificationsRoutes } from "../routes/notifications.routes.js";
import { operationalHealthRoutes } from "../routes/operational-health.routes.js";
import { permissionsRoutes } from "../routes/permissions.routes.js";
import { reportingRoutes } from "../routes/reporting.routes.js";
import { runtimeDiagnosticsRoutes } from "../routes/runtime-diagnostics.routes.js";
import { searchIndexRoutes } from "../routes/search-index.routes.js";
import { searchRoutes } from "../routes/search.routes.js";
import { settingsRoutes } from "../routes/settings.routes.js";
import { supportViewRoutes } from "../routes/support-view.routes.js";
import { staticRoutes } from "../routes/static.routes.js";
import { workResumeRoutes } from "../routes/work-resume.routes.js";
import { workbenchRoutes } from "../routes/workbench.routes.js";
import { formatJobWorkerStatus, startJobWorker, stopJobWorker } from "./jobs/index.js";
import { requireModuleBrowserWritesEnabledForRouter } from "./modules/module-access.js";
import { modulesService } from "./modules/modules.service.js";
import { activateModuleRuntime, runModuleStartupTasks } from "./modules/module-runtime.js";
import { notificationsService } from "../services/notifications.service.js";
import { filesService } from "../services/files.service.js";
import { registerFutureImportJobHandlers } from "../services/import-jobs.service.js";
import { jobsService } from "../services/jobs.service.js";
import { workspacePurgeService } from "../services/workspace-purge.service.js";
import {
  queueSearchIndexRebuildIfEmpty,
  registerSearchIndexJobHandlers,
} from "../services/search-index-jobs.service.js";
import { registerInitialResumeStateProducerEventHandlers } from "../services/work-resume-state-initial-producers.js";
import { attachRequestContext, configureTrustedProxy } from "./request-context.js";
import { createTransportSecurityMiddleware } from "./transport-security.js";
import { createCsrfProtectionMiddleware } from "./csrf-protection.js";
import { securityEventsService } from "../security/security-events.js";
import { assertRuntimeDataPathsReady } from "./runtime-readiness.js";
import { createRequestLoggingMiddleware, operationalLogger } from "./operational-logger.js";
import { registerFrameworkHelpSearchIndexers } from "./help/search-indexers.js";
import { apiRouteBoundary, browserNotFound } from "./http-error-contract.js";
import { assertPublicDemoRuntimeReady } from "./public-demo-runtime.js";
import { requirePublicDemoCapability } from "./public-demo-enforcement.js";
import { createPublicDemoPerimeterMiddlewares } from "./public-demo-perimeter.js";
import { createPublicDemoBudgetMiddleware } from "./public-demo-budgets.js";

/** @typedef {import("node:http").Server} HttpServer */
/** @typedef {import("../types/route-contracts.js").RouterContract} RouterContract */
/** @typedef {import("../types/database-contracts.js").DatabaseStartupPhaseEvent} StartupPhaseEvent */

/** @returns {ReturnType<typeof express>} */
function createApp() {
  const app = express();
  registerFrameworkHelpSearchIndexers();
  activateModuleRuntime("app");
  registerSearchIndexJobHandlers();
  filesService.registerFileScanJobHandlers();
  registerFutureImportJobHandlers();
  workspacePurgeService.registerWorkspacePurgeJobHandlers();
  notificationsService.registerEventHandlers();
  registerInitialResumeStateProducerEventHandlers();
  securityEventsService.registerEventHandlers();

  app.disable("x-powered-by");
  app.set("query parser", "extended");
  configureTrustedProxy(app, config.security.trustedProxies);
  app.use(compression());
  app.use(attachRequestContext);
  app.use(createRequestLoggingMiddleware());
  app.use(createTransportSecurityMiddleware());
  app.use(...createPublicDemoPerimeterMiddlewares());
  app.use(cookieParser());
  app.use(createCsrfProtectionMiddleware());
  app.use(operationalHealthRoutes);
  app.use(express.static(config.publicDir));
  app.use("/api", appInfoRoutes);
  app.use("/api", publicDemoAccountRoutes);
  app.use("/api", authRoutes);
  app.use("/api/v1", requirePublicDemoCapability("api_keys"));
  app.use(publicApiRoutes);
  app.use(privateFeedPublicRoutes);
  for (const moduleRoutes of modulesService.listModuleRoutes("public")) {
    app.use(requireRouterContract(moduleRoutes));
  }
  app.use("/api/v1", apiRouteBoundary);
  app.use(requireAuth);
  app.use(supportViewRequestGate);
  app.use(createPublicDemoBudgetMiddleware());
  app.use("/api", accountExportRecoveryRoutes);
  app.use("/api", appShellRoutes);
  app.use("/api", apiKeysRoutes);
  app.use("/api", auditRoutes);
  app.use("/api", dashboardRoutes);
  app.use("/api", filesRoutes);
  app.use("/api", helpRoutes);
  app.use("/api", jobsRoutes);
  app.use("/api", notificationsRoutes);
  app.use("/api", privateFeedLifecycleRoutes);
  app.use("/api", permissionsRoutes);
  app.use("/api", reportingRoutes);
  app.use("/api", runtimeDiagnosticsRoutes);
  app.use("/api", searchIndexRoutes);
  app.use("/api", searchRoutes);
  app.use("/api", settingsRoutes);
  app.use("/api", supportViewRoutes);
  app.use("/api", workResumeRoutes);
  app.use("/api", workbenchRoutes);
  for (const moduleRoute of modulesService.listModuleRouteEntries("browser")) {
    const moduleDefinition = modulesService.getModule(moduleRoute.moduleId);
    const moduleRouter = requireRouterContract(moduleRoute.router);

    if (moduleDefinition?.canDisable === false) {
      app.use("/api", moduleRouter);
      continue;
    }

    app.use(
      "/api",
      requireModuleBrowserWritesEnabledForRouter(moduleRoute.moduleId, moduleRouter),
      moduleRouter,
    );
  }
  app.use("/api", apiRouteBoundary);
  app.use(staticRoutes);
  app.use(browserNotFound);

  app.use(errorHandler);

  return app;
}

/** @param {unknown} value @returns {RouterContract} */
function requireRouterContract(value) {
  if (isRouterContract(value)) {
    return value;
  }
  throw new TypeError("Registered module routes must provide an Express router.");
}

/** @param {unknown} value @returns {value is RouterContract} */
function isRouterContract(value) {
  return Boolean(
    (typeof value === "function" || (value !== null && typeof value === "object"))
      && "use" in value
      && typeof value.use === "function",
  );
}
/** @returns {Promise<void>} */
async function startServer() {
  try {
    logRuntimeConfigWarnings(config.environment === "production"
      ? () => operationalLogger.warn("runtime.configuration.unsafe_override", {})
      : console.warn);
    await assertPublicDemoRuntimeReady();
    await assertRuntimeDataPathsReady();
    await filesService.assertConfiguredFileStorageProviderReady();
    await filesService.assertConfiguredFileScannerReady();
    const databaseHealth = await initializeDatabase({ report: reportStartupPhase });
    if (config.environment === "production") {
      operationalLogger.info("database.ready", { component: databaseHealth.provider });
    } else {
      console.log(formatDatabaseHealth(databaseHealth));
    }
    queueStartupJobRetentionPrune();
    queueStartupSearchIndexRebuildIfEmpty();
    const app = createApp();
    await runModuleStartupTasks("app", { defer: true });

    const server = app.listen(config.port, config.host, () => {
      if (config.environment === "production") {
        operationalLogger.info("application.listening", { component: "http" });
      } else {
        console.log(
          `Longtail Forge running at http://${config.host}:${config.port}/index.html`,
        );
      }
      startConfiguredInlineWorker();
    });
    registerGracefulShutdown(server);
  } catch (error) {
    if (config.environment === "production") {
      operationalLogger.error("application.startup.failed", { errorType: readUnknownErrorType(error) });
    } else {
      console.error("Longtail Forge could not be started.");
      console.error(readUnknownErrorMessage(error));
    }
    process.exitCode = 1;
  }
}

/** @returns {void} */
function startConfiguredInlineWorker() {
  if (config.worker.mode === "separate") {
    console.log("[job-worker] mode=separate state=external");
    return;
  }

  if (config.worker.mode === "disabled") {
    console.log("[job-worker] mode=disabled state=disabled");
    return;
  }

  void startJobWorker({
    mode: "inline",
    workerId: config.worker.id,
  }).then((status) => {
    console.log(formatJobWorkerStatus(status));
  }).catch((error) => {
    console.warn("[job-worker] Inline worker failed to start.");
    console.warn(readUnknownErrorMessage(error));
  });
}

/** @param {StartupPhaseEvent} event @returns {void} */
function reportStartupPhase(event) {
  if (config.environment === "production") {
    operationalLogger.info("startup.phase", {
      component: event.id,
      durationMs: Math.round(event.durationMs),
      errorType: event.errorType,
      mode: event.lifecycle,
      source: event.owner,
      state: event.status,
    });
    return;
  }

  console.log(formatStartupPhase(event));
}

/** @param {HttpServer} server @returns {void} */
function registerGracefulShutdown(server) {
  let shuttingDown = false;
  /** @param {NodeJS.Signals} signal */
  const shutdown = (signal) => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    void (async () => {
      console.log(`[app-shutdown] ${signal} received; stopping.`);
      await stopJobWorker();
      await new Promise((resolve) => {
        server.close(resolve);
      });
      await closeDatabase();
      process.exitCode = 0;
    })().catch((error) => {
      console.error("[app-shutdown] Graceful shutdown failed.");
      console.error(readUnknownErrorMessage(error));
      process.exitCode = 1;
    });
  };

  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

/** @returns {void} */
function queueStartupJobRetentionPrune() {
  setTimeout(async () => {
    try {
      const result = await jobsService.pruneOldJobs();

      console.log(`[job-retention] prune=complete completed_deleted=${result.completed.deleted} dead_deleted=${result.dead.deleted}`);
    } catch (error) {
      console.warn("[job-retention] Job history pruning failed.");
      console.warn(readUnknownErrorMessage(error));
    }
  }, 0);
}

/** @returns {void} */
function queueStartupSearchIndexRebuildIfEmpty() {
  setTimeout(async () => {
    try {
      const result = await queueSearchIndexRebuildIfEmpty({
        source: "startup-empty-index",
      });

      if (result.skipped) {
        console.log(`[search-index-startup] rebuild_queue=skipped reason=${result.reason}`);
        return;
      }

      if ("queueAction" in result && "jobId" in result) {
        console.log(`[search-index-startup] rebuild_queue=${result.queueAction} job_id=${result.jobId}`);
      }
    } catch (error) {
      console.warn("[search-index-startup] Search index rebuild queue failed.");
      console.warn(readUnknownErrorMessage(error));
    }
  }, 0);
}

/** @param {unknown} error @returns {unknown} */
function readUnknownErrorMessage(error) {
  if (error && typeof error === "object" && "message" in error && error.message) {
    return error.message;
  }
  return error;
}

/** @param {unknown} error @returns {string} */
function readUnknownErrorType(error) {
  if (error && typeof error === "object" && "name" in error && error.name) {
    return String(error.name);
  }
  return "Error";
}

export { createApp, startServer };
