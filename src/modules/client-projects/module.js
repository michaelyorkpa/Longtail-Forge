import { clientsRoutes } from "./clients.routes.js";

const clientProjectsModule = {
  id: "client-projects",
  name: "Clients and Projects",
  displayName: "Clients and Projects",
  description: "Client and project records, billing defaults, and nested compatibility read models.",
  category: "core-workflow",
  version: "0.31.15",
  enabledByDefault: true,
  canDisable: false,
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
  protectedViews: [
    {
      id: "clients",
      path: "/clients.html",
      moduleId: "client-projects",
      file: "clients.html",
      requiredWorkspaceCapabilities: ["clients_projects"],
    },
    {
      id: "projects",
      path: "/projects.html",
      moduleId: "client-projects",
      file: "projects.html",
      requiredWorkspaceCapabilities: ["projects", "clients_projects"],
    },
    {
      id: "clients-projects-legacy",
      path: "/clients-projects.html",
      moduleId: "client-projects",
      file: "clients-projects.html",
      requiredWorkspaceCapabilities: ["projects", "clients_projects"],
    },
  ],
  publicViews: [],
  browserAssets: [
    {
      id: "clients-projects-script",
      moduleId: "client-projects",
      path: "/js/clients-projects.js",
      type: "script",
      views: ["clients", "projects", "clients-projects-legacy"],
    },
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
  apiScopes: ["clients:read", "projects:read"],
  workbench: [],
  timerSources: [],
  workItemSources: [],
  workspaceCapabilityRequirements: ["clients_projects", "projects"],
};

export { clientProjectsModule };
