import { usersRoutes } from "../../routes/users.routes.js";

const usersModule = {
  id: "users",
  name: "Users",
  displayName: "Users",
  description: "User administration, profile settings, and role assignment surfaces.",
  category: "core-admin",
  version: "0.30.8",
  enabledByDefault: true,
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
  dashboard: [],
  requiredPermissions: [
    "users.manage",
    "roles.assign",
  ],
  workspaceCapabilityRequirements: ["team_members", "permissions", "family_permissions"],
  seedData: [],
};

export { usersModule };
