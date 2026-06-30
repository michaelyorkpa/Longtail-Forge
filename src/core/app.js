import express from "express";
import cookieParser from "cookie-parser";
import { config, logRuntimeConfigWarnings } from "../config.js";
import { formatDatabaseHealth, initializeDatabase } from "../db/index.js";
import { errorHandler } from "../middleware/error-handler.js";
import { requireAuth } from "../middleware/require-auth.js";
import { appInfoRoutes } from "../routes/app-info.routes.js";
import { appShellRoutes } from "../routes/app-shell.routes.js";
import { apiKeysRoutes } from "../routes/api-keys.routes.js";
import { auditRoutes } from "../routes/audit.routes.js";
import { authRoutes } from "../routes/auth.routes.js";
import { filesRoutes } from "../routes/files.routes.js";
import { helpRoutes } from "../routes/help.routes.js";
import { publicApiRoutes } from "../routes/public-api.routes.js";
import { notificationsRoutes } from "../routes/notifications.routes.js";
import { permissionsRoutes } from "../routes/permissions.routes.js";
import { reportingRoutes } from "../routes/reporting.routes.js";
import { searchIndexRoutes } from "../routes/search-index.routes.js";
import { searchRoutes } from "../routes/search.routes.js";
import { settingsRoutes } from "../routes/settings.routes.js";
import { staticRoutes } from "../routes/static.routes.js";
import { workResumeRoutes } from "../routes/work-resume.routes.js";
import { workbenchRoutes } from "../routes/workbench.routes.js";
import { requireModuleBrowserWritesEnabledForRouter } from "./modules/module-access.js";
import { modulesService } from "./modules/modules.service.js";
import { notificationsService } from "../services/notifications.service.js";
import { searchIndexRebuildService } from "../services/search-index-rebuild.service.js";
import { registerInitialResumeStateProducerEventHandlers } from "../services/work-resume-state-initial-producers.js";

function createApp() {
  const app = express();
  notificationsService.registerEventHandlers();
  registerInitialResumeStateProducerEventHandlers();

  app.disable("x-powered-by");
  app.use(cookieParser());
  app.use(express.static(config.publicDir));
  app.use("/api", appInfoRoutes);
  app.use("/api", authRoutes);
  app.use(publicApiRoutes);
  for (const moduleRoutes of modulesService.listModuleRoutes("public")) {
    app.use(moduleRoutes);
  }
  app.use(requireAuth);
  app.use("/api", appShellRoutes);
  app.use("/api", apiKeysRoutes);
  app.use("/api", auditRoutes);
  app.use("/api", filesRoutes);
  app.use("/api", helpRoutes);
  app.use("/api", notificationsRoutes);
  app.use("/api", permissionsRoutes);
  app.use("/api", reportingRoutes);
  app.use("/api", searchIndexRoutes);
  app.use("/api", searchRoutes);
  app.use("/api", settingsRoutes);
  app.use("/api", workResumeRoutes);
  app.use("/api", workbenchRoutes);
  for (const moduleRoute of modulesService.listModuleRouteEntries("browser")) {
    const moduleDefinition = modulesService.getModule(moduleRoute.moduleId);

    if (moduleDefinition?.canDisable === false) {
      app.use("/api", moduleRoute.router);
      continue;
    }

    app.use(
      "/api",
      requireModuleBrowserWritesEnabledForRouter(moduleRoute.moduleId, moduleRoute.router),
      moduleRoute.router,
    );
  }
  app.use("/api", (request, response, next) => {
    if (request.method === "GET") {
      next();
      return;
    }

    response.status(405).json({ error: "Method not allowed" });
  });
  app.use(staticRoutes);

  app.use(errorHandler);

  return app;
}

async function startServer() {
  try {
    logRuntimeConfigWarnings();
    const databaseHealth = await initializeDatabase();
    console.log(formatDatabaseHealth(databaseHealth));
    scheduleStartupSearchIndexRebuild();
    const app = createApp();

    app.listen(config.port, config.host, () => {
      console.log(
        `Longtail Forge running at http://${config.host}:${config.port}/index.html`,
      );
    });
  } catch (error) {
    console.error("The local database could not be initialized.");
    console.error(error.message || error);
    process.exitCode = 1;
  }
}

function scheduleStartupSearchIndexRebuild() {
  setTimeout(async () => {
    try {
      const summary = await searchIndexRebuildService.rebuildApp({
        audit: false,
        source: "startup",
      });

      console.log(
        `[search-index-startup] indexed=${summary.counts.indexed} removed=${summary.counts.removed} repaired=${summary.counts.repaired} failed=${summary.counts.failed}`,
      );
    } catch (error) {
      console.warn("[search-index-startup] Search index rebuild failed.");
      console.warn(error.message || error);
    }
  }, 0);
}

export { createApp, startServer };
