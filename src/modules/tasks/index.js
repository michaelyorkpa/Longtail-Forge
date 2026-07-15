// Public entry point for the Tasks module.
//
// Framework/shared code and other modules import Tasks capabilities from here.
// Do not import this module's internal repositories/services/routes directly
// from outside the module; the module-import-boundaries guardrail rejects new
// deep imports. Everything exported here is a supported cross-module contract.

export { tasksModule } from "./module.js";
export { tasksService } from "./tasks.service.js";
export { tasksRepository } from "./tasks.repo.js";
export { taskRemindersService } from "./task-reminders.service.js";
export { tasksSettingsService } from "./tasks-settings.service.js";
export {
  queueTaskRecurrenceSweepJobs,
  queueTaskReminderSweepJobs,
  registerTaskJobHandlers,
} from "./task-jobs.service.js";
