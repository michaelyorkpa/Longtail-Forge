import { clientsRoutes } from "./clients.routes.js";

const clientProjectsModule = {
  id: "client-projects",
  name: "Clients and Projects",
  displayName: "Clients and Projects",
  description: "Client and project records, billing defaults, and nested compatibility read models.",
  category: "core-workflow",
  version: "0.30.8",
  enabledByDefault: true,
  historicalReadAccess: true,
  browserApiRoutes: [clientsRoutes],
  publicApiRoutes: [],
  browserAssetsDir: new URL("../../../public/js/", import.meta.url),
  migrationsDir: new URL("./migrations/", import.meta.url),
  protectedViewsDir: new URL("../../../views/protected/", import.meta.url),
  seedHooks: [],
  repairHooks: [],
  navigation: [
    { label: "Projects", href: "projects.html" },
    { label: "Clients", href: "clients.html", parent: "projects.html" },
  ],
  dashboard: [
    { id: "project-summary", label: "Project Summary" },
  ],
  publicApiEndpoints: [
    { method: "GET", path: "/api/v1/clients", scope: "clients:read" },
    { method: "GET", path: "/api/v1/clients/:clientId", scope: "clients:read" },
    { method: "GET", path: "/api/v1/projects", scope: "projects:read" },
    { method: "GET", path: "/api/v1/projects/:projectId", scope: "projects:read" },
  ],
  requiredPermissions: [
    "clients.manage",
    "projects.manage",
    "billing.manage",
  ],
  workspaceCapabilityRequirements: ["clients_projects", "projects"],
  seedData: [],
};

export { clientProjectsModule };
