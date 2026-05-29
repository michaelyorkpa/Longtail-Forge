import { clientsRoutes } from "./clients.routes.js";

const clientProjectsModule = {
  id: "client-projects",
  name: "Clients and Projects",
  description: "Client and project records, billing defaults, and nested compatibility read models.",
  category: "core-workflow",
  version: "0.26.0",
  enabledByDefault: true,
  browserApiRoutes: [clientsRoutes],
  browserAssetsDir: new URL("../../../public/js/", import.meta.url),
  migrationsDir: new URL("./migrations/", import.meta.url),
  protectedViewsDir: new URL("../../../views/protected/", import.meta.url),
  seedData: [],
};

export { clientProjectsModule };
