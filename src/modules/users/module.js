import { usersRoutes } from "../../routes/users.routes.js";

const usersModule = {
  id: "users",
  name: "Users",
  description: "User administration, profile settings, and role assignment surfaces.",
  category: "core-admin",
  version: "0.26.0",
  enabledByDefault: true,
  browserApiRoutes: [usersRoutes],
  browserAssetsDir: new URL("../../../public/js/", import.meta.url),
  migrationsDir: new URL("./migrations/", import.meta.url),
  protectedViewsDir: new URL("../../../views/protected/", import.meta.url),
  seedData: [],
};

export { usersModule };
