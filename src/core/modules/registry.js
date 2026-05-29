import { clientProjectsModule } from "../../modules/client-projects/module.js";
import { timeTrackingModule } from "../../modules/time-tracking/module.js";
import { usersModule } from "../../modules/users/module.js";

const moduleDefinitions = [
  clientProjectsModule,
  timeTrackingModule,
  usersModule,
];

function listModules() {
  return moduleDefinitions.map((definition) => ({ ...definition }));
}

function listBrowserApiRoutes() {
  return moduleDefinitions.flatMap((definition) => definition.browserApiRoutes || []);
}

function listModuleMigrationSources() {
  return moduleDefinitions
    .filter((definition) => definition.migrationsDir)
    .map((definition) => ({
      moduleId: definition.id,
      migrationsDir: definition.migrationsDir,
    }));
}

export { listBrowserApiRoutes, listModuleMigrationSources, listModules };
