// @ts-check

import { taskRemindersService } from "./task-reminders.service.js";

/** @typedef {import("../../types/task-workflow-contracts.js").TaskSettingsContext} TaskSettingsContext */

const MODULE_ID = "tasks";

/** @param {unknown} context */
async function read(context) {
  const workspaceId = readWorkspaceId(context);
  const { settingsService } = await import("../../services/settings.service.js");
  const settingsContext = /** @type {Parameters<typeof settingsService.getValue>[0]} */ (context);
  const [taskTimersEnabled, reminderDefaults] = await Promise.all([
    settingsService.getValue(settingsContext, MODULE_ID, "taskTimersEnabled"),
    taskRemindersService.readWorkspaceDefaults(workspaceId),
  ]);

  return {
    taskTimersEnabled: taskTimersEnabled !== false,
    taskReminderDefaults: reminderDefaults.offsets,
  };
}

/** @param {unknown} context */
async function readTaskTimersEnabled(context) {
  const { settingsService } = await import("../../services/settings.service.js");
  return (await settingsService.getValue(
    /** @type {Parameters<typeof settingsService.getValue>[0]} */ (context),
    MODULE_ID,
    "taskTimersEnabled",
  )) !== false;
}

/** @param {unknown} context */
function readWorkspaceId(context) {
  return typeof context === "string"
    ? context
    : String(
      context && typeof context === "object"
        ? /** @type {TaskSettingsContext} */ (context).workspace_id
          || /** @type {TaskSettingsContext} */ (context).workspaceId
          || ""
        : "",
    ).trim();
}

export const tasksSettingsService = {
  read,
  readTaskTimersEnabled,
};
