import { clientProjectsModule } from "../../modules/client-projects/module.js";
import { tasksModule } from "../../modules/tasks/module.js";
import { timeTrackingModule } from "../../modules/time-tracking/module.js";
import { usersModule } from "../../modules/users/module.js";
import { validateModuleManifests } from "./manifest-contract.js";

const moduleDefinitions = [
  clientProjectsModule,
  tasksModule,
  timeTrackingModule,
  usersModule,
];

validateModuleManifests(moduleDefinitions);

function listModules() {
  return moduleDefinitions.map((definition) => ({ ...definition }));
}

function listBrowserApiRoutes() {
  return moduleDefinitions.flatMap((definition) => definition.browserApiRoutes || []);
}

function listPublicApiRoutes() {
  return moduleDefinitions.flatMap((definition) => definition.publicApiRoutes || []);
}

function listModuleMigrationSources() {
  return moduleDefinitions
    .filter((definition) => definition.migrationsDir)
    .map((definition) => ({
      moduleId: definition.id,
      migrationsDir: definition.migrationsDir,
    }));
}

export { listBrowserApiRoutes, listModuleMigrationSources, listModules, listPublicApiRoutes };
