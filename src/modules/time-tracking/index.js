// Public entry point for the Time Tracking module.
//
// Framework/shared code and other modules import Time Tracking capabilities
// from here. Do not import this module's internal repositories/services/routes
// directly from outside the module; the module-import-boundaries guardrail
// rejects new deep imports. Everything exported here is a supported
// cross-module contract.

export { timeTrackingModule } from "./module.js";
export { activeTimersService } from "./active-timers.service.js";
export { activeTimersRepository } from "./active-timers.repo.js";
export { timeEntriesService } from "./time-entries.service.js";
export { timeEntriesRepository } from "./time-entries.repo.js";
