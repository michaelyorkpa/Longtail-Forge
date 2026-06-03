import { settingsRepository } from "../repositories/settings.repo.js";
import { modulesService } from "../core/modules/modules.service.js";
import { auditService } from "./audit.service.js";
import { permissionsService } from "./permissions.service.js";
import { taskRemindersService } from "../modules/tasks/task-reminders.service.js";
import { normalizeSettings } from "../utils/normalizers.js";

const TIME_TRACKING_MODULE_ID = "time-tracking";
const TASKS_MODULE_ID = "tasks";

async function read(session) {
  const settings = await modulesService.decorateWorkspaceSettings(
    await settingsRepository.readWorkspaceSettings(session.workspace_id),
    session.workspace_id,
  );
  const reminderDefaults = await taskRemindersService.readWorkspaceDefaults(session.workspace_id);

  return {
    ...settings,
    taskReminderDefaults: reminderDefaults.offsets,
  };
}

async function readWorkspaceBootstrap(session) {
  const settings = await read(session);

  return {
    enabledModules: settings.enabledModules,
    tasksEnabled: settings.tasksEnabled,
    taskTimersEnabled: settings.taskTimersEnabled,
    timeTrackingEnabled: settings.timeTrackingEnabled,
    workspaceCapabilities: settings.workspaceCapabilities,
    workspaceId: settings.workspaceId,
    workspaceName: settings.workspaceName,
    workspaceType: settings.workspaceType,
  };
}

async function save(payload, session) {
  await permissionsService.assertCan(session, "workspace_settings.manage", {
    workspace_id: session.workspace_id,
    operation: "update",
  });

  const data = normalizeSettings(payload);
  const previousSettings = await read(session);
  const timeTrackingEnabled = payload.timeTrackingEnabled !== false;
  const tasksEnabled = payload.tasksEnabled !== false;
  const taskTimersEnabled = payload.taskTimersEnabled !== false;
  data.timeTrackingEnabled = timeTrackingEnabled;
  data.tasksEnabled = tasksEnabled;
  data.taskTimersEnabled = taskTimersEnabled;
  const auditSettingChanged = previousSettings.audit.loggingEnabled !== data.audit.loggingEnabled ||
    previousSettings.audit.retentionDays !== data.audit.retentionDays;
  const moduleSettingChanged = previousSettings.timeTrackingEnabled !== timeTrackingEnabled ||
    previousSettings.tasksEnabled !== tasksEnabled ||
    previousSettings.taskTimersEnabled !== taskTimersEnabled;
  const auditDisabled = previousSettings.audit.loggingEnabled && !data.audit.loggingEnabled;
  const auditEnabled = !previousSettings.audit.loggingEnabled && data.audit.loggingEnabled;

  const auditEvent = {
    session,
    action: "workspace_settings_updated",
    changeType: "settings_change",
    recordType: "workspace_setting",
    recordId: session.workspace_id,
    recordLabel: data.workspaceName,
    recordUrl: "workspace-settings.html",
    previousValue: previousSettings,
    newValue: data,
    metadata: {
      setting_group: "workspace",
      audit_setting_changed: auditSettingChanged,
      module_setting_changed: moduleSettingChanged,
    },
  };

  if (auditDisabled) {
    await auditService.record({
      ...auditEvent,
      action: "audit_logging_disabled",
      force: true,
    });
  }

  await settingsRepository.saveWorkspaceSettings(session.workspace_id, data);
  if (Object.hasOwn(payload || {}, "taskReminderDefaults") || Object.hasOwn(payload || {}, "task_reminder_defaults")) {
    await taskRemindersService.saveWorkspaceDefaults(session.workspace_id, payload.taskReminderDefaults || payload.task_reminder_defaults);
  }
  await modulesService.setModuleStatus(session.workspace_id, TIME_TRACKING_MODULE_ID, timeTrackingEnabled);
  await modulesService.setModuleStatus(session.workspace_id, TASKS_MODULE_ID, tasksEnabled);

  if (auditEnabled) {
    await auditService.record({
      ...auditEvent,
      action: "audit_logging_enabled",
      force: true,
    });
  } else if (!auditDisabled) {
    await auditService.record(auditEvent);
  }

  await auditService.cleanupExpired(session.workspace_id, data.audit.retentionDays);

  const savedSettings = await modulesService.decorateWorkspaceSettings(data, session.workspace_id);
  const reminderDefaults = await taskRemindersService.readWorkspaceDefaults(session.workspace_id);

  return {
    data: {
      ...savedSettings,
      taskReminderDefaults: reminderDefaults.offsets,
    },
  };
}

export const settingsService = {
  read,
  readWorkspaceBootstrap,
  save,
};
