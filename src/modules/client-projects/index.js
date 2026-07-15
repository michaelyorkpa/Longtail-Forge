// Public entry point for the Clients/Projects module.
//
// Framework/shared code and other modules import Clients/Projects capabilities
// from here. Do not import this module's internal repositories/services/routes
// directly from outside the module; the module-import-boundaries guardrail
// rejects new deep imports. Everything exported here is a supported
// cross-module contract.

export { clientsService } from "./clients.service.js";
export { clientsRepository } from "./clients.repo.js";
export { projectsRepository } from "./projects.repo.js";
export { clientProjectSettingsService } from "./client-project-settings.service.js";
