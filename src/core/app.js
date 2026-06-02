import express from "express";
import cookieParser from "cookie-parser";
import { config } from "../config.js";
import { initializeDatabase } from "../db/index.js";
import { errorHandler } from "../middleware/error-handler.js";
import { requireAuth } from "../middleware/require-auth.js";
import { appInfoRoutes } from "../routes/app-info.routes.js";
import { apiKeysRoutes } from "../routes/api-keys.routes.js";
import { auditRoutes } from "../routes/audit.routes.js";
import { authRoutes } from "../routes/auth.routes.js";
import { publicApiRoutes } from "../routes/public-api.routes.js";
import { permissionsRoutes } from "../routes/permissions.routes.js";
import { reportingRoutes } from "../routes/reporting.routes.js";
import { settingsRoutes } from "../routes/settings.routes.js";
import { staticRoutes } from "../routes/static.routes.js";
import { listBrowserApiRoutes, listPublicApiRoutes } from "./modules/registry.js";

function createApp() {
  const app = express();

  app.disable("x-powered-by");
  app.use(cookieParser());
  app.use(express.static(config.publicDir));
  app.use("/api", appInfoRoutes);
  app.use("/api", authRoutes);
  app.use(publicApiRoutes);
  for (const moduleRoutes of listPublicApiRoutes()) {
    app.use(moduleRoutes);
  }
  app.use(requireAuth);
  app.use("/api", apiKeysRoutes);
  app.use("/api", auditRoutes);
  app.use("/api", permissionsRoutes);
  app.use("/api", reportingRoutes);
  app.use("/api", settingsRoutes);
  for (const moduleRoutes of listBrowserApiRoutes()) {
    app.use("/api", moduleRoutes);
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
    await initializeDatabase();
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

export { createApp, startServer };
