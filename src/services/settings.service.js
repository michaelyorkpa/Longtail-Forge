import { settingsRepository } from "../repositories/settings.repo.js";
import { modulesService } from "../core/modules/modules.service.js";
import { auditService } from "./audit.service.js";
import { securityEventsService } from "../security/security-events.js";
import { permissionsService } from "./permissions.service.js";
import {
  FRAMEWORK_SETTING_NAMESPACE,
  getFrameworkSettingDefinition,
  registerFrameworkSettingDefinition,
} from "../core/settings/framework-settings-registry.js";
import {
  getOnChangeEffect,
  getPersistenceHandler,
  registerOnChangeEffect,
  registerPersistenceHandler,
} from "../core/settings/settings-behavior-registry.js";
import { AppError } from "../utils/app-error.js";
import { workspaceDeletionService } from "./workspace-deletion.service.js";
import { normalizeSettings } from "../utils/normalizers.js";

async function read(session) {
  return readInternal(session);
}

async function readInternal(session) {
  const workspaceSettings = await settingsRepository.readWorkspaceSettings(session.workspace_id);
  const settings = await modulesService.decorateWorkspaceSettings(workspaceSettings, session.workspace_id);
  await hydrateModuleSettingValues(settings.moduleSettings, session.workspace_id);
  return settings;
}

async function readWorkspaceBootstrap(session) {
  const [settings, workspaceDeletion] = await Promise.all([
    read(session),
    workspaceDeletionService.readBootstrapState(session.workspace_id),
  ]);

  return {
    enabledModules: settings.enabledModules,
    workspaceCapabilities: settings.workspaceCapabilities,
    workspaceId: settings.workspaceId,
    workspaceName: settings.workspaceName,
    workspaceType: settings.workspaceType,
    workspaceDeletion,
  };
}

async function getValue(context, moduleId, settingId) {
  const workspaceId = readWorkspaceId(context);
  const definition = readModuleSettingDefinition(moduleId, settingId);

  if (definition.moduleStatus === true) {
    const settings = await modulesService.decorateWorkspaceSettings(
      await settingsRepository.readWorkspaceSettings(workspaceId),
      workspaceId,
    );
    const moduleDefinition = settings.moduleSettings.find((item) => item.moduleId === moduleId);
    const setting = moduleDefinition?.settings.find((item) => item.id === settingId);
    if (!setting) {
      throw new AppError(`Unknown module setting '${moduleId}.${settingId}'.`, 400);
    }
    return setting.value;
  }

  return readSettingValue(workspaceId, moduleId, definition);
}

async function getFrameworkValue(context, settingId) {
  const workspaceId = readWorkspaceId(context);
  const definition = readFrameworkSettingDefinition(settingId);
  return readSettingValue(workspaceId, FRAMEWORK_SETTING_NAMESPACE, definition);
}

async function setValue(context, moduleId, settingId, rawValue) {
  const workspaceId = readWorkspaceId(context);
  const definition = readModuleSettingDefinition(moduleId, settingId);
  return setResolvedValue(context, workspaceId, moduleId, definition, rawValue);
}

async function setFrameworkValue(context, settingId, rawValue) {
  const workspaceId = readWorkspaceId(context);
  const definition = readFrameworkSettingDefinition(settingId);
  return setResolvedValue(context, workspaceId, FRAMEWORK_SETTING_NAMESPACE, definition, rawValue);
}

async function setResolvedValue(context, workspaceId, moduleId, definition, rawValue) {
  if (definition.readOnly === true || definition.type === "info") {
    throw new AppError(`Setting '${moduleId}.${definition.id}' is read-only.`, 400);
  }
  if (definition.moduleStatus === true) {
    throw new AppError(`Setting '${moduleId}.${definition.id}' uses the module status lifecycle.`, 400);
  }

  const value = validateSettingValue(definition, rawValue, moduleId);
  const previousValue = await readSettingValue(workspaceId, moduleId, definition);
  if (settingValuesEqual(previousValue, value)) {
    return { changed: false, value };
  }

  const change = {
    moduleId,
    previousValue,
    setting: definition,
    value,
  };
  await persistSettingValue(workspaceId, change, context);
  await runOnChangeEffect(workspaceId, change, context);
  return { changed: true, value };
}

async function save(payload, session) {
  await permissionsService.assertCan(session, "workspace_settings.manage", {
    workspace_id: session.workspace_id,
    operation: "update",
  });
  rejectTopLevelModuleSettingAliases(payload);

  const previousSettings = await readInternal(session);
  assertWorkspaceTypeImmutable(payload, previousSettings.workspaceType);
  const data = normalizeSettings({
    ...previousSettings,
    ...payload,
  });
  if (
    data.workspaceName !== previousSettings.workspaceName &&
    !(await permissionsService.isWorkspaceAdministrator(session))
  ) {
    throw new AppError("Only a Workspace Administrator or Super Admin may rename a workspace.", 403);
  }
  const moduleSettingChanges = resolveModuleSettingChanges(payload, previousSettings);
  const frameworkSettingChanges = await resolveFrameworkSettingChanges(payload, session);
  const contributedSettingChanges = [...moduleSettingChanges, ...frameworkSettingChanges];
  const auditSettingChanged = previousSettings.audit.loggingEnabled !== data.audit.loggingEnabled ||
    previousSettings.audit.retentionDays !== data.audit.retentionDays;
  const moduleSettingChanged = contributedSettingChanges.length > 0;
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
  await persistModuleSettingChanges(session, contributedSettingChanges);
  await runModuleSettingEffects(session, contributedSettingChanges);
  await recordModuleSettingChanges(session, contributedSettingChanges);

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

  if (auditSettingChanged) {
    await securityEventsService.record({
      actorUserId: session.user_id,
      actorUserName: session.username,
      eventType: "security.configuration.audit_updated",
      ipAddress: session.ip_address,
      metadata: {
        logging_enabled: data.audit.loggingEnabled,
        retention_days: data.audit.retentionDays,
      },
      outcome: "success",
      reasonClass: "security_configuration_changed",
      recordId: session.workspace_id,
      session,
      workspaceId: session.workspace_id,
    });
  }

  return {
    data: await readInternal(session),
  };
}

function assertWorkspaceTypeImmutable(payload, currentWorkspaceType) {
  for (const submittedKey of ["workspaceType", "workspace_type"]) {
    if (Object.hasOwn(payload || {}, submittedKey)) {
      const submittedWorkspaceType = String(payload[submittedKey] || "").trim();
      if (submittedWorkspaceType !== currentWorkspaceType) {
        throw new AppError("Workspace type cannot be changed after creation.", 400);
      }
    }
  }
}

function rejectTopLevelModuleSettingAliases(payload) {
  const submittedAlias = modulesService.listModules()
    .flatMap((moduleDefinition) => moduleDefinition.settings || [])
    .find((setting) => Object.hasOwn(payload || {}, setting.id));

  if (submittedAlias) {
    throw new AppError(`Use moduleSettings for module setting '${submittedAlias.id}'.`, 400);
  }
}

function resolveModuleSettingChanges(payload, previousSettings) {
  const submittedSettings = readSubmittedModuleSettings(payload);
  const definitions = buildModuleSettingDefinitionMap(previousSettings.moduleSettings || []);
  const changes = [];

  for (const [moduleId, settings] of submittedSettings.entries()) {
    for (const [settingId, rawValue] of settings.entries()) {
      const definition = definitions.get(`${moduleId}.${settingId}`);

      if (!definition) {
        throw new AppError(`Unknown module setting '${moduleId}.${settingId}'.`, 400);
      }
      if (definition.setting.readOnly === true || definition.setting.type === "info") {
        throw new AppError(`Module setting '${moduleId}.${settingId}' is read-only.`, 400);
      }

      const value = validateSettingValue(definition.setting, rawValue, moduleId);
      const previousValue = definition.setting.value;
      if (settingValuesEqual(previousValue, value)) {
        continue;
      }

      const handler = getPersistenceHandler(`${moduleId}.${settingId}`);
      changes.push({
        moduleId,
        moduleName: definition.module.displayName || definition.module.name || moduleId,
        previousValue,
        recordUrl: handler?.recordUrl || "workspace-settings.html",
        setting: definition.setting,
        value,
      });
    }
  }

  return changes;
}

async function resolveFrameworkSettingChanges(payload, session) {
  const submittedSettings = readSubmittedFrameworkSettings(payload);
  const changes = [];

  for (const [settingId, rawValue] of submittedSettings.entries()) {
    const definition = readFrameworkSettingDefinition(settingId);
    if (definition.readOnly === true || definition.type === "info") {
      throw new AppError(`Framework setting '${settingId}' is read-only.`, 400);
    }
    for (const permissionId of definition.requiredPermissions || []) {
      await permissionsService.assertCan(session, permissionId, {
        workspace_id: session.workspace_id,
        operation: "update",
      });
    }

    const value = validateSettingValue(definition, rawValue, FRAMEWORK_SETTING_NAMESPACE);
    const previousValue = await readSettingValue(
      session.workspace_id,
      FRAMEWORK_SETTING_NAMESPACE,
      definition,
    );
    if (settingValuesEqual(previousValue, value)) {
      continue;
    }

    const handler = getPersistenceHandler(`${FRAMEWORK_SETTING_NAMESPACE}.${settingId}`);
    changes.push({
      moduleId: FRAMEWORK_SETTING_NAMESPACE,
      moduleName: definition.moduleName || "Framework",
      previousValue,
      recordUrl: handler?.recordUrl || definition.recordUrl || "workspace-settings.html",
      setting: definition,
      value,
    });
  }

  return changes;
}

function readSubmittedFrameworkSettings(payload) {
  if (payload?.frameworkSettings === undefined) {
    return new Map();
  }
  if (!isPlainObject(payload.frameworkSettings)) {
    throw new AppError("frameworkSettings must be an object keyed by setting ID.", 400);
  }

  return new Map(Object.entries(payload.frameworkSettings).map(([settingId, value]) => {
    const normalizedSettingId = String(settingId || "").trim();
    if (!normalizedSettingId) {
      throw new AppError("Framework setting IDs are required.", 400);
    }
    return [normalizedSettingId, value];
  }));
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

function readModuleSettingDefinition(moduleId, settingId) {
  const moduleDefinition = modulesService.listModules().find((item) => item.id === moduleId);
  const setting = moduleDefinition?.settings?.find((item) => item.id === settingId);
  if (!setting) {
    throw new AppError(`Unknown module setting '${moduleId}.${settingId}'.`, 400);
  }
  return setting;
}

function readFrameworkSettingDefinition(settingId) {
  const definition = getFrameworkSettingDefinition(settingId);
  if (!definition) {
    throw new AppError(`Unknown framework setting '${settingId}'.`, 400);
  }
  return definition;
}

async function hydrateModuleSettingValues(moduleSettings, workspaceId) {
  await Promise.all((moduleSettings || []).flatMap((moduleDefinition) =>
    (moduleDefinition.settings || [])
      .filter((setting) => setting.moduleStatus !== true)
      .map(async (setting) => {
        setting.value = await readSettingValue(
          workspaceId,
          moduleDefinition.moduleId,
          setting,
        );
      })));
}

async function readSettingValue(workspaceId, moduleId, definition) {
  const key = `${moduleId}.${definition.id}`;
  const handler = getPersistenceHandler(key);
  let value;

  if (handler) {
    value = await handler.read({
      definition,
      moduleId,
      settingId: definition.id,
      workspaceId,
    });
  } else {
    const row = await settingsRepository.readModuleSetting(workspaceId, moduleId, definition.id);
    if (!row) {
      return defaultSettingValue(definition);
    }
    try {
      value = JSON.parse(row.setting_value_json);
    } catch {
      throw new AppError(`Stored setting '${key}' is invalid.`, 500);
    }
  }

  try {
    return validateSettingValue(definition, value, moduleId);
  } catch (error) {
    if (error instanceof AppError && error.statusCode === 400) {
      throw new AppError(`Stored setting '${key}' is invalid.`, 500);
    }
    throw error;
  }
}

async function persistModuleSettingChanges(session, changes) {
  for (const change of changes) {
    if (change.setting.moduleStatus === true) {
      await modulesService.setModuleStatus(session.workspace_id, change.moduleId, change.value, { session });
    } else {
      await persistSettingValue(session.workspace_id, change, session);
    }
  }
}

async function persistSettingValue(workspaceId, change, context) {
  const key = `${change.moduleId}.${change.setting.id}`;
  const handler = getPersistenceHandler(key);
  if (handler) {
    await handler.write({
      context,
      definition: change.setting,
      moduleId: change.moduleId,
      previousValue: change.previousValue,
      settingId: change.setting.id,
      value: change.value,
      workspaceId,
    });
    return;
  }

  await settingsRepository.saveModuleSetting(
    workspaceId,
    change.moduleId,
    change.setting.id,
    change.value,
  );
}

async function runModuleSettingEffects(session, changes) {
  for (const change of changes) {
    await runOnChangeEffect(session.workspace_id, change, session);
  }
}

async function runOnChangeEffect(workspaceId, change, context) {
  const effect = getOnChangeEffect(`${change.moduleId}.${change.setting.id}`);
  if (!effect) {
    return;
  }
  await effect({
    context,
    definition: change.setting,
    moduleId: change.moduleId,
    previousValue: change.previousValue,
    settingId: change.setting.id,
    value: change.value,
    workspaceId,
  });
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

function validateSettingValue(setting, value, moduleId) {
  if (setting.type === "boolean" || setting.type === "toggle") {
    if (typeof value !== "boolean") {
      throw new AppError(`Setting '${moduleId}.${setting.id}' must be a boolean.`, 400);
    }
    return value;
  }

  if (setting.type === "text" || setting.type === "textarea") {
    if (typeof value !== "string") {
      throw new AppError(`Setting '${moduleId}.${setting.id}' must be text.`, 400);
    }
    return value.trim();
  }

  if (setting.type === "number") {
    const numberValue = Number(value);
    if (!Number.isFinite(numberValue)) {
      throw new AppError(`Setting '${moduleId}.${setting.id}' must be a number.`, 400);
    }
    if (typeof setting.min === "number" && numberValue < setting.min) {
      throw new AppError(`Setting '${moduleId}.${setting.id}' is below the allowed minimum.`, 400);
    }
    if (typeof setting.max === "number" && numberValue > setting.max) {
      throw new AppError(`Setting '${moduleId}.${setting.id}' is above the allowed maximum.`, 400);
    }
    return numberValue;
  }

  if (setting.type === "select" || setting.type === "radio") {
    const selectedValue = String(value || "").trim();
    const allowedValues = new Set((setting.options || []).map((option) => option.value));
    if (!allowedValues.has(selectedValue)) {
      throw new AppError(`Setting '${moduleId}.${setting.id}' must be one of its registered options.`, 400);
    }
    return selectedValue;
  }

  if (setting.type === "multi-select") {
    if (!Array.isArray(value)) {
      throw new AppError(`Setting '${moduleId}.${setting.id}' must be a list.`, 400);
    }
    const allowedValues = new Set((setting.options || []).map((option) => option.value));
    const selectedValues = value.map((item) => String(item || "").trim()).filter(Boolean);
    if (selectedValues.some((item) => !allowedValues.has(item))) {
      throw new AppError(`Setting '${moduleId}.${setting.id}' contains an unregistered option.`, 400);
    }
    return selectedValues;
  }

  throw new AppError(`Setting '${moduleId}.${setting.id}' is read-only.`, 400);
}

function defaultSettingValue(setting) {
  if (Object.hasOwn(setting, "defaultValue")) {
    return cloneSettingValue(setting.defaultValue);
  }
  if (Object.hasOwn(setting, "default")) {
    return cloneSettingValue(setting.default);
  }
  if (setting.type === "boolean" || setting.type === "toggle") {
    return false;
  }
  if (setting.type === "number") {
    return "";
  }
  if (setting.type === "multi-select") {
    return [];
  }
  return "";
}

function cloneSettingValue(value) {
  if (value === null || typeof value !== "object") {
    return value;
  }
  return JSON.parse(JSON.stringify(value));
}

function readWorkspaceId(context) {
  const workspaceId = typeof context === "string"
    ? context.trim()
    : String(context?.workspace_id || context?.workspaceId || "").trim();
  if (!workspaceId) {
    throw new AppError("A workspace-scoped settings context is required.", 400);
  }
  return workspaceId;
}

function registerFrameworkSetting(definition) {
  return registerFrameworkSettingDefinition(definition);
}

function settingValuesEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype;
}

export const settingsService = {
  getFrameworkValue,
  getValue,
  read,
  readWorkspaceBootstrap,
  registerFrameworkSetting,
  registerOnChangeEffect,
  registerPersistenceHandler,
  save,
  setFrameworkValue,
  setValue,
};
