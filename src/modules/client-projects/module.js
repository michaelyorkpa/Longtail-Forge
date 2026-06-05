import { clientsRoutes } from "./clients.routes.js";

const clientProjectsModule = {
  id: "client-projects",
  name: "Clients and Projects",
  displayName: "Clients and Projects",
  description: "Client and project records, billing defaults, and workspace-scoped project context.",
  category: "core-workflow",
  version: "0.31.24.2",
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
  ],
  publicViews: [],
  browserAssets: [
    {
      id: "clients-projects-script",
      moduleId: "client-projects",
      path: "/js/clients-projects.js",
      type: "script",
      views: ["clients", "projects"],
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
  permissions: [
    {
      id: "clients.manage",
      moduleId: "client-projects",
      label: "Manage Clients",
      description: "Create, update, archive, and view clients.",
      resource: "clients",
      operation: "manage",
    },
    {
      id: "projects.manage",
      moduleId: "client-projects",
      label: "Manage Projects",
      description: "Create, update, archive, and view projects.",
      resource: "projects",
      operation: "manage",
    },
    {
      id: "billing.manage",
      moduleId: "client-projects",
      label: "Manage Billing Details",
      description: "Change billable status, rates, billing periods, and rounding.",
      resource: "billing",
      operation: "manage",
    },
  ],
  defaultRolePermissions: [
    { roleId: "super_admin", permissions: ["clients.manage", "projects.manage", "billing.manage"] },
    { roleId: "workspace_admin", permissions: ["clients.manage", "projects.manage", "billing.manage"] },
    { roleId: "client_admin", permissions: ["clients.manage", "projects.manage", "billing.manage"] },
    { roleId: "project_admin", permissions: ["projects.manage", "billing.manage"] },
  ],
  resourceDefinitions: [
    {
      key: "clients",
      moduleId: "client-projects",
      label: "Clients",
      operations: ["read", "create", "update", "archive", "restore", "manage"],
    },
    {
      key: "projects",
      moduleId: "client-projects",
      label: "Projects",
      operations: ["read", "create", "update", "archive", "restore", "manage"],
    },
    {
      key: "billing",
      moduleId: "client-projects",
      label: "Billing",
      operations: ["read", "update", "manage"],
    },
  ],
  auditRecordTypes: [
    {
      recordType: "client",
      moduleId: "client-projects",
      label: "Client",
      description: "Client records and client lifecycle audit history.",
    },
    {
      recordType: "project",
      moduleId: "client-projects",
      label: "Project",
      description: "Project records and project lifecycle audit history.",
    },
  ],
  apiScopes: [
    {
      id: "clients:read",
      moduleId: "client-projects",
      label: "Read Clients",
      description: "Read client records through the public API.",
      access: "read",
    },
    {
      id: "projects:read",
      moduleId: "client-projects",
      label: "Read Projects",
      description: "Read project records through the public API.",
      access: "read",
    },
  ],
  workbench: [],
  timerSources: [],
  workItemSources: [],
  workspaceCapabilityRequirements: ["clients_projects", "projects"],
};

export { clientProjectsModule };
