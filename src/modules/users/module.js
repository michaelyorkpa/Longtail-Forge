import { usersRoutes } from "../../routes/users.routes.js";

const usersModule = {
  id: "users",
  name: "Users",
  displayName: "Users",
  description: "User administration, profile settings, and role assignment surfaces.",
  category: "core-admin",
  version: "0.31.20",
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
  permissions: [
    {
      id: "users.manage",
      moduleId: "users",
      label: "Manage Users",
      description: "Create, update, deactivate, and assign users.",
      resource: "users",
      operation: "manage",
    },
    {
      id: "roles.assign",
      moduleId: "users",
      label: "Assign Roles",
      description: "Add and remove scoped role assignments.",
      resource: "users",
      operation: "assign",
    },
  ],
  defaultRolePermissions: [
    { roleId: "super_admin", permissions: ["users.manage", "roles.assign"] },
    { roleId: "workspace_admin", permissions: ["users.manage", "roles.assign"] },
    { roleId: "client_admin", permissions: ["roles.assign"] },
    { roleId: "project_admin", permissions: ["roles.assign"] },
  ],
  resourceDefinitions: [
    {
      key: "users",
      moduleId: "users",
      label: "Users",
      operations: ["read", "create", "update", "delete", "assign", "manage"],
    },
  ],
  auditRecordTypes: [
    {
      recordType: "user",
      moduleId: "users",
      label: "User",
      description: "User profile and user lifecycle audit history.",
    },
    {
      recordType: "workspace_membership",
      moduleId: "users",
      label: "Workspace Membership",
      description: "Workspace membership lifecycle audit history.",
    },
    {
      recordType: "user_role_assignment",
      moduleId: "users",
      label: "User Role Assignment",
      description: "Scoped role assignment audit history.",
    },
  ],
  publicApiEndpoints: [],
  apiScopes: [],
  workbench: [],
  timerSources: [],
  workItemSources: [],
  workspaceCapabilityRequirements: ["team_members", "permissions", "family_permissions"],
};

export { usersModule };
