import { usersRoutes } from "../../routes/users.routes.js";

const usersModule = {
  id: "users",
  name: "Users",
  displayName: "Users",
  description: "User administration, profile settings, and role assignment surfaces.",
  category: "core-admin",
  version: "0.31.15",
  enabledByDefault: true,
  canDisable: false,
  historicalReadAccess: false,
  browserApiRoutes: [usersRoutes],
  publicApiRoutes: [],
  browserAssetsDir: new URL("../../../public/js/", import.meta.url),
  migrationsDir: new URL("./migrations/", import.meta.url),
  protectedViewsDir: new URL("../../../views/protected/", import.meta.url),
  seedHooks: [],
  repairHooks: [],
  navigation: [
    { label: "User Admin", href: "user-admin.html", parent: "settings.html" },
    { label: "User Settings", href: "user-settings.html", parent: "settings.html" },
  ],
  protectedViews: [
    {
      id: "user-admin",
      path: "/user-admin.html",
      moduleId: "users",
      file: "user-admin.html",
      requiredPermissions: ["users.manage"],
      requiredWorkspaceCapabilities: ["team_members", "permissions", "family_permissions"],
    },
  ],
  publicViews: [],
  browserAssets: [
    {
      id: "user-admin-script",
      moduleId: "users",
      path: "/js/user-admin.js",
      type: "script",
      views: ["user-admin"],
      requiredPermissions: ["users.manage"],
    },
  ],
  dashboard: [],
  requiredPermissions: [
    "users.manage",
    "roles.assign",
  ],
  publicApiEndpoints: [],
  apiScopes: [],
  workbench: [],
  timerSources: [],
  workItemSources: [],
  workspaceCapabilityRequirements: ["team_members", "permissions", "family_permissions"],
};

export { usersModule };
