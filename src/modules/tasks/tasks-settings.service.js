import { taskRemindersService } from "./task-reminders.service.js";

const MODULE_ID = "tasks";

async function read(context) {
  const workspaceId = readWorkspaceId(context);
  const { settingsService } = await import("../../services/settings.service.js");
  const [taskTimersEnabled, reminderDefaults] = await Promise.all([
    settingsService.getValue(context, MODULE_ID, "taskTimersEnabled"),
    taskRemindersService.readWorkspaceDefaults(workspaceId),
  ]);

  return {
    taskTimersEnabled: taskTimersEnabled !== false,
    taskReminderDefaults: reminderDefaults.offsets,
  };
}

async function readTaskTimersEnabled(context) {
  const { settingsService } = await import("../../services/settings.service.js");
  return (await settingsService.getValue(context, MODULE_ID, "taskTimersEnabled")) !== false;
}

function readWorkspaceId(context) {
  return typeof context === "string"
    ? context
    : String(context?.workspace_id || context?.workspaceId || "").trim();
}

export const tasksSettingsService = {
  read,
  readTaskTimersEnabled,
};
