import { tasksRoutes } from "./tasks.routes.js";
import { tasksPublicApiRoutes } from "./public-api.routes.js";

const tasksModule = {
  id: "tasks",
  name: "Tasks",
  displayName: "Tasks",
  description: "Workspace, client, and project task tracking with scoped assignment and due-date foundations.",
  category: "core-workflow",
  version: "0.31.6",
  enabledByDefault: true,
  historicalReadAccess: true,
  browserApiRoutes: [tasksRoutes],
  publicApiRoutes: [tasksPublicApiRoutes],
  browserAssetsDir: new URL("../../../public/js/", import.meta.url),
  migrationsDir: null,
  protectedViewsDir: new URL("../../../views/protected/", import.meta.url),
  seedHooks: [],
  repairHooks: [],
  navigation: [
    { label: "Tasks", href: "tasks.html", parent: "projects.html", counts: ["overdue", "dueSoon"] },
  ],
  dashboard: [
    {
      id: "task-summary",
      label: "Task Summary",
      renderer: "task-summary",
      counts: ["overdue", "dueSoon", "assignedToMe"],
      links: ["overdue", "dueSoon", "assignedToMe"],
    },
  ],
  reporting: [],
  publicApiEndpoints: [
    { method: "GET", path: "/api/v1/tasks", scope: "tasks:read" },
    { method: "GET", path: "/api/v1/tasks/:taskId", scope: "tasks:read" },
    { method: "POST", path: "/api/v1/tasks", scope: "tasks:write" },
    { method: "PUT", path: "/api/v1/tasks/:taskId", scope: "tasks:write" },
    { method: "POST", path: "/api/v1/tasks/:taskId/complete", scope: "tasks:write" },
    { method: "POST", path: "/api/v1/tasks/:taskId/reopen", scope: "tasks:write" },
    { method: "POST", path: "/api/v1/tasks/:taskId/archive", scope: "tasks:write" },
    { method: "POST", path: "/api/v1/tasks/:taskId/restore", scope: "tasks:write" },
  ],
  requiredPermissions: [
    "tasks.create",
    "tasks.view",
    "tasks.edit_own",
    "tasks.edit_all",
    "tasks.assign",
    "tasks.complete",
    "tasks.archive",
    "tasks.restore",
  ],
  workspaceCapabilityRequirements: ["projects", "clients_projects"],
  settings: [
    {
      id: "tasksEnabled",
      label: "Tasks",
      type: "boolean",
      moduleStatus: true,
    },
    {
      id: "taskTimersEnabled",
      label: "Task Timers",
      type: "boolean",
      moduleStatus: false,
    },
  ],
  frameworkDependencies: [
    "audit-service",
    "client-projects",
    "module-access",
    "permissions-service",
    "timezone-normalization",
    "workspace-settings",
  ],
  seedData: [],
};

export { tasksModule };
