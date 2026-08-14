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

/** @typedef {import("../types/http-contracts.js").WorkspaceRequestSession} WorkspaceRequestSession */
/** @typedef {import("../types/framework-contracts.js").ModuleSettingDefinition} ModuleSettingDefinition */
/** @typedef {import("../core/settings/framework-settings-registry.js").FrameworkSettingDefinition} FrameworkSettingDefinition */
/** @typedef {string | {workspace_id?: unknown, workspaceId?: unknown}} SettingsContext */
/** @typedef {Record<string, unknown> & {frameworkSettings?: unknown, moduleSettings?: unknown, workspaceType?: unknown, workspace_type?: unknown}} SettingsPayload */
/** @typedef {{moduleId: string, moduleName?: string, previousValue: unknown, recordUrl?: string, setting: ModuleSettingDefinition, value: unknown}} SettingChange */
/** @typedef {Map<string, Map<string, unknown>>} SubmittedModuleSettings */

/**
 * @param {WorkspaceRequestSession} session
 */
async function read(session) {
  return readInternal(session);
}

/**
 * @param {WorkspaceRequestSession} session
 */
async function readInternal(session) {
  const workspaceSettings = await settingsRepository.readWorkspaceSettings(session.workspace_id);
  const settings = await modulesService.decorateWorkspaceSettings(workspaceSettings, session.workspace_id);
  await hydrateModuleSettingValues(settings.moduleSettings, session.workspace_id);
  return settings;
}

/**
 * @param {WorkspaceRequestSession} session
 */
async function readWorkspaceBootstrap(session) {
  const [settings, workspaceDeletion, permissionIds] = await Promise.all([
    read(session),
    workspaceDeletionService.readBootstrapState(session.workspace_id),
    permissionsService.listGrantedPermissionIdsInAnyScope(session),
  ]);

  return {
    enabledModules: settings.enabledModules,
    permissionIds,
    workspaceCapabilities: settings.workspaceCapabilities,
    workspaceId: settings.workspaceId,
    workspaceName: settings.workspaceName,
    workspaceType: settings.workspaceType,
    workspaceDeletion,
  };
}

/** @param {SettingsContext} context @param {string} moduleId @param {string} settingId */
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

/** @param {SettingsContext} context @param {string} settingId */
async function getFrameworkValue(context, settingId) {
  const workspaceId = readWorkspaceId(context);
  const definition = readFrameworkSettingDefinition(settingId);
  return readSettingValue(workspaceId, FRAMEWORK_SETTING_NAMESPACE, definition);
}

/** @param {SettingsContext} context @param {string} moduleId @param {string} settingId @param {unknown} rawValue */
async function setValue(context, moduleId, settingId, rawValue) {
  const workspaceId = readWorkspaceId(context);
  const definition = readModuleSettingDefinition(moduleId, settingId);
  return setResolvedValue(context, workspaceId, moduleId, definition, rawValue);
}

/** @param {SettingsContext} context @param {string} settingId @param {unknown} rawValue */
async function setFrameworkValue(context, settingId, rawValue) {
  const workspaceId = readWorkspaceId(context);
  const definition = readFrameworkSettingDefinition(settingId);
  return setResolvedValue(context, workspaceId, FRAMEWORK_SETTING_NAMESPACE, definition, rawValue);
}

/** @param {SettingsContext} context @param {string} workspaceId @param {string} moduleId @param {ModuleSettingDefinition} definition @param {unknown} rawValue */
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

/** @param {unknown} rawPayload @param {WorkspaceRequestSession} session */
async function save(rawPayload, session) {
  const payload = /** @type {SettingsPayload} */ (isPlainObject(rawPayload) ? rawPayload : {});
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

/** @param {SettingsPayload} payload @param {string} currentWorkspaceType */
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

/** @param {SettingsPayload} payload */
function rejectTopLevelModuleSettingAliases(payload) {
  const submittedAlias = modulesService.listModules()
    .flatMap((moduleDefinition) => moduleDefinition.settings || [])
    .find((setting) => Object.hasOwn(payload || {}, setting.id));

  if (submittedAlias) {
    throw new AppError(`Use moduleSettings for module setting '${submittedAlias.id}'.`, 400);
  }
}

/** @param {SettingsPayload} payload @param {Awaited<ReturnType<typeof readInternal>>} previousSettings @returns {SettingChange[]} */
function resolveModuleSettingChanges(payload, previousSettings) {
  const submittedSettings = readSubmittedModuleSettings(payload);
  const definitions = buildModuleSettingDefinitionMap(previousSettings.moduleSettings || []);
  /** @type {SettingChange[]} */
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

/** @param {SettingsPayload} payload @param {WorkspaceRequestSession} session @returns {Promise<SettingChange[]>} */
async function resolveFrameworkSettingChanges(payload, session) {
  const submittedSettings = readSubmittedFrameworkSettings(payload);
  /** @type {SettingChange[]} */
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

/** @param {SettingsPayload} payload @returns {Map<string, unknown>} */
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

/** @param {SettingsPayload} payload @returns {SubmittedModuleSettings} */
function readSubmittedModuleSettings(payload) {
  /** @type {SubmittedModuleSettings} */
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

/** @param {SubmittedModuleSettings} submittedSettings @param {string} moduleId @param {string} settingId @param {unknown} value */
function addSubmittedModuleSetting(submittedSettings, moduleId, settingId, value) {
  const normalizedModuleId = String(moduleId || "").trim();
  const normalizedSettingId = String(settingId || "").trim();

  if (!normalizedModuleId || !normalizedSettingId) {
    throw new AppError("Module setting IDs are required.", 400);
  }

  if (!submittedSettings.has(normalizedModuleId)) {
    submittedSettings.set(normalizedModuleId, new Map());
  }

  submittedSettings.get(normalizedModuleId)?.set(normalizedSettingId, value);
}

/** @param {Awaited<ReturnType<typeof readInternal>>["moduleSettings"]} moduleSettings */
function buildModuleSettingDefinitionMap(moduleSettings) {
  /** @type {Map<string, {module: (typeof moduleSettings)[number], setting: ModuleSettingDefinition & {value?: unknown}}>} */
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

/**
 * @param {string} moduleId
 * @param {string} settingId
 */
function readModuleSettingDefinition(moduleId, settingId) {
  const moduleDefinition = modulesService.listModules().find((item) => item.id === moduleId);
  const setting = moduleDefinition?.settings?.find((item) => item.id === settingId);
  if (!setting) {
    throw new AppError(`Unknown module setting '${moduleId}.${settingId}'.`, 400);
  }
  return setting;
}

/**
 * @param {unknown} settingId
 */
function readFrameworkSettingDefinition(settingId) {
  const definition = getFrameworkSettingDefinition(settingId);
  if (!definition) {
    throw new AppError(`Unknown framework setting '${settingId}'.`, 400);
  }
  return definition;
}

/** @param {Awaited<ReturnType<typeof readInternal>>["moduleSettings"]} moduleSettings @param {string} workspaceId */
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

/**
 * @param {string} workspaceId
 * @param {string} moduleId
 * @param {import("../types/framework-contracts.js").ModuleSettingDefinition} definition
 */
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

/** @param {WorkspaceRequestSession} session @param {SettingChange[]} changes */
async function persistModuleSettingChanges(session, changes) {
  for (const change of changes) {
    if (change.setting.moduleStatus === true) {
      if (typeof change.value !== "boolean") {
        throw new AppError(`Module status setting '${change.moduleId}.${change.setting.id}' must be a boolean.`, 400);
      }
      await modulesService.setModuleStatus(session.workspace_id, change.moduleId, change.value, { session });
    } else {
      await persistSettingValue(session.workspace_id, change, session);
    }
  }
}

/** @param {string} workspaceId @param {SettingChange} change @param {SettingsContext} context */
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

/** @param {WorkspaceRequestSession} session @param {SettingChange[]} changes */
async function runModuleSettingEffects(session, changes) {
  for (const change of changes) {
    await runOnChangeEffect(session.workspace_id, change, session);
  }
}

/** @param {string} workspaceId @param {SettingChange} change @param {SettingsContext} context */
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

/** @param {WorkspaceRequestSession} session @param {SettingChange[]} changes */
async function recordModuleSettingChanges(session, changes) {
  for (const change of changes.filter((item) => item.setting.moduleStatus !== true)) {
    await auditService.record({
      session,
      workspaceId: session.workspace_id,
      action: "module.setting_updated",
      changeType: "settings_change",
      recordType: "module_setting",
      recordId: `${change.moduleId}.${change.setting.id}`,
      recordLabel: `${change.moduleName || change.moduleId} - ${change.setting.label}`,
      recordUrl: change.recordUrl || "workspace-settings.html",
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

/** @param {ModuleSettingDefinition} setting @param {unknown} value @param {string} moduleId */
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

/**
 * @param {ModuleSettingDefinition & {defaultValue?: unknown}} setting
 */
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

/**
 * @param {unknown} value
 */
function cloneSettingValue(value) {
  if (value === null || typeof value !== "object") {
    return value;
  }
  return JSON.parse(JSON.stringify(value));
}

/** @param {SettingsContext} context */
function readWorkspaceId(context) {
  const workspaceId = typeof context === "string"
    ? context.trim()
    : String(context?.workspace_id || context?.workspaceId || "").trim();
  if (!workspaceId) {
    throw new AppError("A workspace-scoped settings context is required.", 400);
  }
  return workspaceId;
}

/**
 * @param {import("../core/settings/framework-settings-registry.js").FrameworkSettingDefinition} definition
 */
function registerFrameworkSetting(definition) {
  return registerFrameworkSettingDefinition(definition);
}

/** @param {unknown} left @param {unknown} right */
function settingValuesEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype;
}

const settingsServiceInternal = {
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

export const settingsService = settingsServiceInternal;
