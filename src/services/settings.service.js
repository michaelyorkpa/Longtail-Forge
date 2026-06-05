import { settingsRepository } from "../repositories/settings.repo.js";
import { modulesService } from "../core/modules/modules.service.js";
import { auditService } from "./audit.service.js";
import { permissionsService } from "./permissions.service.js";
import { taskRemindersService } from "../modules/tasks/task-reminders.service.js";
import { AppError } from "../utils/app-error.js";
import { normalizeSettings } from "../utils/normalizers.js";

const TIME_TRACKING_MODULE_ID = "time-tracking";
const TASKS_MODULE_ID = "tasks";
const MODULE_SETTING_HANDLERS = new Map([
  ["tasks.taskTimersEnabled", {
    apply(data, value) {
      data.taskTimersEnabled = value;
    },
    read(settings) {
      return settings.taskTimersEnabled !== false;
    },
    recordUrl: "tasks-settings.html",
  }],
]);

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
  rejectLegacyModuleSettingAliases(payload);

  const previousSettings = await read(session);
  const data = normalizeSettings({
    ...previousSettings,
    ...payload,
  });
  const moduleSettingChanges = resolveModuleSettingChanges(payload, previousSettings, data);
  const timeTrackingEnabled = readModuleStatusSetting(moduleSettingChanges, TIME_TRACKING_MODULE_ID, previousSettings.timeTrackingEnabled);
  const tasksEnabled = readModuleStatusSetting(moduleSettingChanges, TASKS_MODULE_ID, previousSettings.tasksEnabled);
  const auditSettingChanged = previousSettings.audit.loggingEnabled !== data.audit.loggingEnabled ||
    previousSettings.audit.retentionDays !== data.audit.retentionDays;
  const moduleSettingChanged = moduleSettingChanges.length > 0;
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
  await modulesService.setModuleStatus(session.workspace_id, TIME_TRACKING_MODULE_ID, timeTrackingEnabled, { session });
  await modulesService.setModuleStatus(session.workspace_id, TASKS_MODULE_ID, tasksEnabled, { session });
  await recordModuleSettingChanges(session, moduleSettingChanges);

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

function rejectLegacyModuleSettingAliases(payload) {
  const legacyAliases = ["timeTrackingEnabled", "tasksEnabled", "taskTimersEnabled"];
  const submittedAlias = legacyAliases.find((settingId) => Object.hasOwn(payload || {}, settingId));

  if (submittedAlias) {
    throw new AppError(`Use moduleSettings for module setting '${submittedAlias}'.`, 400);
  }
}

function resolveModuleSettingChanges(payload, previousSettings, data) {
  const submittedSettings = readSubmittedModuleSettings(payload);
  const definitions = buildModuleSettingDefinitionMap(previousSettings.moduleSettings || []);
  const changes = [];

  for (const [moduleId, settings] of submittedSettings.entries()) {
    for (const [settingId, rawValue] of settings.entries()) {
      const definition = definitions.get(`${moduleId}.${settingId}`);

      if (!definition) {
        throw new AppError(`Unknown module setting '${moduleId}.${settingId}'.`, 400);
      }

      if (definition.setting.readOnly === true) {
        throw new AppError(`Module setting '${moduleId}.${settingId}' is read-only.`, 400);
      }

      const value = validateModuleSettingValue(definition.setting, rawValue, moduleId);
      const previousValue = readPreviousModuleSettingValue(definition, previousSettings);

      if (definition.setting.moduleStatus === true) {
        changes.push({
          moduleId,
          moduleName: definition.module.displayName || definition.module.name || moduleId,
          recordUrl: "workspace-settings.html",
          setting: definition.setting,
          previousValue,
          value,
        });
        continue;
      }

      const handler = MODULE_SETTING_HANDLERS.get(`${moduleId}.${settingId}`);

      if (!handler) {
        throw new AppError(`Module setting '${moduleId}.${settingId}' does not have a server-side settings handler.`, 400);
      }

      handler.apply(data, value);
      if (!moduleSettingValuesEqual(previousValue, value)) {
        changes.push({
          moduleId,
          moduleName: definition.module.displayName || definition.module.name || moduleId,
          recordUrl: handler.recordUrl || "workspace-settings.html",
          setting: definition.setting,
          previousValue,
          value,
        });
      }
    }
  }

  return changes;
}

function readSubmittedModuleSettings(payload) {
  const submittedSettings = new Map();
  const moduleSettings = payload?.moduleSettings;

  if (moduleSettings === undefined) {
    return submittedSettings;
  }

  if (!isPlainObject(moduleSettings)) {
    throw new AppError("moduleSettings must be an object keyed by module ID.", 400);
  }

  for (const [moduleId, settings] of Object.entries(moduleSettings)) {
    if (!isPlainObject(settings)) {
      throw new AppError(`moduleSettings.${moduleId} must be an object keyed by setting ID.`, 400);
    }

    for (const [settingId, value] of Object.entries(settings)) {
      addSubmittedModuleSetting(submittedSettings, moduleId, settingId, value);
    }
  }

  return submittedSettings;
}

function addSubmittedModuleSetting(submittedSettings, moduleId, settingId, value) {
  const normalizedModuleId = String(moduleId || "").trim();
  const normalizedSettingId = String(settingId || "").trim();

  if (!normalizedModuleId || !normalizedSettingId) {
    throw new AppError("Module setting IDs are required.", 400);
  }

  if (!submittedSettings.has(normalizedModuleId)) {
    submittedSettings.set(normalizedModuleId, new Map());
  }

  submittedSettings.get(normalizedModuleId).set(normalizedSettingId, value);
}

function buildModuleSettingDefinitionMap(moduleSettings) {
  const definitions = new Map();

  for (const moduleDefinition of moduleSettings) {
    for (const setting of moduleDefinition.settings || []) {
      definitions.set(`${moduleDefinition.moduleId}.${setting.id}`, {
        module: moduleDefinition,
        setting,
      });
    }
  }

  return definitions;
}

function validateModuleSettingValue(setting, value, moduleId) {
  if (setting.type === "boolean") {
    if (typeof value !== "boolean") {
      throw new AppError(`Module setting '${moduleId}.${setting.id}' must be a boolean.`, 400);
    }
    return value;
  }

  if (setting.type === "text") {
    if (typeof value !== "string") {
      throw new AppError(`Module setting '${moduleId}.${setting.id}' must be text.`, 400);
    }
    return value.trim();
  }

  if (setting.type === "number") {
    const numberValue = Number(value);
    if (!Number.isFinite(numberValue)) {
      throw new AppError(`Module setting '${moduleId}.${setting.id}' must be a number.`, 400);
    }
    if (typeof setting.min === "number" && numberValue < setting.min) {
      throw new AppError(`Module setting '${moduleId}.${setting.id}' is below the allowed minimum.`, 400);
    }
    if (typeof setting.max === "number" && numberValue > setting.max) {
      throw new AppError(`Module setting '${moduleId}.${setting.id}' is above the allowed maximum.`, 400);
    }
    return numberValue;
  }

  if (setting.type === "select") {
    const selectedValue = String(value || "").trim();
    const allowedValues = new Set((setting.options || []).map((option) => option.value));
    if (!allowedValues.has(selectedValue)) {
      throw new AppError(`Module setting '${moduleId}.${setting.id}' must be one of its registered options.`, 400);
    }
    return selectedValue;
  }

  if (setting.type === "multi-select") {
    if (!Array.isArray(value)) {
      throw new AppError(`Module setting '${moduleId}.${setting.id}' must be a list.`, 400);
    }
    const allowedValues = new Set((setting.options || []).map((option) => option.value));
    const selectedValues = value.map((item) => String(item || "").trim()).filter(Boolean);
    if (selectedValues.some((item) => !allowedValues.has(item))) {
      throw new AppError(`Module setting '${moduleId}.${setting.id}' contains an unregistered option.`, 400);
    }
    return selectedValues;
  }

  throw new AppError(`Module setting '${moduleId}.${setting.id}' is read-only.`, 400);
}

function readPreviousModuleSettingValue(definition, previousSettings) {
  if (definition.setting.moduleStatus === true) {
    return definition.module.status === "enabled";
  }

  const handler = MODULE_SETTING_HANDLERS.get(`${definition.module.moduleId}.${definition.setting.id}`);

  if (handler) {
    return handler.read(previousSettings);
  }

  return definition.setting.value;
}

function readModuleStatusSetting(changes, moduleId, fallback) {
  const change = changes.find((item) => item.moduleId === moduleId && item.setting.moduleStatus === true);

  return change ? change.value : fallback !== false;
}

async function recordModuleSettingChanges(session, changes) {
  for (const change of changes.filter((item) => item.setting.moduleStatus !== true)) {
    await auditService.record({
      session,
      workspaceId: session.workspace_id,
      action: "module.setting_updated",
      changeType: "settings_change",
      recordType: "module_setting",
      recordId: `${change.moduleId}.${change.setting.id}`,
      recordLabel: `${change.moduleName} - ${change.setting.label}`,
      recordUrl: change.recordUrl,
      previousValue: {
        module_id: change.moduleId,
        setting_id: change.setting.id,
        value: change.previousValue,
      },
      newValue: {
        module_id: change.moduleId,
        setting_id: change.setting.id,
        value: change.value,
      },
      metadata: {
        module_id: change.moduleId,
        setting_id: change.setting.id,
        workspace_id: session.workspace_id,
      },
    });
  }
}

function moduleSettingValuesEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype;
}

export const settingsService = {
  read,
  readWorkspaceBootstrap,
  save,
};
