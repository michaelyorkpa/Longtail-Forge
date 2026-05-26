import express from "express";
import cookieParser from "cookie-parser";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "./config.js";
import { initializeDatabase } from "./db/index.js";
import { errorHandler } from "./middleware/error-handler.js";
import { requireAuth } from "./middleware/require-auth.js";
import { authRoutes } from "./routes/auth.routes.js";
import { clientsRoutes } from "./routes/clients.routes.js";
import { settingsRoutes } from "./routes/settings.routes.js";
import { staticRoutes } from "./routes/static.routes.js";
import { timeEntriesRoutes } from "./routes/time-entries.routes.js";
import { usersRoutes } from "./routes/users.routes.js";

function createApp() {
  const app = express();
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

  app.disable("x-powered-by");
  app.use(cookieParser());
  app.use(express.static(path.join(root, "public")));
  app.use("/api", authRoutes);
  app.use(requireAuth);
  app.use("/api", timeEntriesRoutes);
  app.use("/api", clientsRoutes);
  app.use("/api", settingsRoutes);
  app.use("/api", usersRoutes);
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
