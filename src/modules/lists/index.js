// Public entry point for the Lists module.
//
// Framework/shared code and other modules import Lists capabilities from here.
// Do not import this module's internal repositories/services/routes directly
// from outside the module; the module-import-boundaries guardrail rejects new
// deep imports. Everything exported here is a supported cross-module contract.

export { listsModule } from "./module.js";
export { listsService } from "./lists.service.js";
export { listsRepository } from "./lists.repo.js";
export { LIST_STATUSES } from "./storage-contract.js";
export { LIST_PERMISSIONS, listResource } from "./access-policy.js";
