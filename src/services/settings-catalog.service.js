import { modulesService } from "../core/modules/modules.service.js";
import { permissionsService } from "./permissions.service.js";
import { settingsService } from "./settings.service.js";
import { listFrameworkSettingDefinitions } from "../core/settings/framework-settings-registry.js";
import "../core/settings/workbench-focus-policy.js";

const SETTINGS_ATTACHMENT_POINTS = Object.freeze([
  Object.freeze({ id: "workspace", label: "Workspace Settings" }),
  Object.freeze({ id: "user", label: "User Settings" }),
  Object.freeze({ id: "module", label: "Module Settings" }),
  Object.freeze({ id: "new-workspace", label: "New Workspace" }),
]);

/** @typedef {import("../types/http-contracts.js").WorkspaceRequestSession} WorkspaceRequestSession */
/** @typedef {{ id: string, moduleId: string, label: string, type: string, placement: "workspace"|"user"|"module"|"new-workspace", moduleStatus?: boolean, readOnly?: boolean, readOnlyReason?: string, disabledReason?: string, value?: unknown, default?: unknown, options?: {label: string, value: string}[], [key: string]: unknown }} CatalogSetting */
/** @typedef {import("../types/framework-contracts.js").ModuleSettingDefinition & {moduleId?: string, value?: unknown}} DecoratedSetting */
/** @typedef {{ moduleId: string, name: string, displayName: string }} ModuleMetadata */
/** @typedef {{ id: string, moduleId: string, name: string, displayName: string, placement: string, settings: CatalogSetting[], lifecycle?: boolean }} SettingSection */
/** @typedef {{ workspace: SettingSection[], user: SettingSection[], module: Record<string, SettingSection[]>, "new-workspace": SettingSection[] }} SettingsAttachments */
/** @typedef {{ moduleId: string, name?: string, displayName?: string, settings?: DecoratedSetting[] }} ModuleSettingsDefinition */
/** @typedef {Map<string, ModuleMetadata>} ModuleMetadataMap */

/** @param {WorkspaceRequestSession} session */
async function read(session) {
  const workspaceId = session.workspace_id;
  const [settings, contributions, canManageWorkspaceSettings] = await Promise.all([
    settingsService.read(session),
    modulesService.listSettingsContributions(workspaceId, session),
    permissionsService.canInAnyScope(session, "workspace_settings.manage", {
      workspace_id: workspaceId,
      operation: "read",
    }),
  ]);
  const decoratedByKey = buildDecoratedSettingMap(settings.moduleSettings);
  const moduleMetadata = buildModuleMetadata(settings.moduleSettings);
  const attachments = createEmptyAttachments();

  for (const contribution of contributions) {
    const placement = contribution.placement;
    if (!isSettingsPlacement(placement) || !Object.hasOwn(attachments, placement) || contribution.moduleStatus === true) {
      continue;
    }
    if (["workspace", "module"].includes(placement) && !canManageWorkspaceSettings) {
      continue;
    }

    const decorated = decoratedByKey.get(`${contribution.moduleId}.${contribution.id}`);
    addSettingToAttachment(attachments, placement, hydrateContribution(contribution, decorated), moduleMetadata);
  }

  if (canManageWorkspaceSettings) {
    addModuleLifecycleSections(attachments.workspace, settings.moduleSettings, moduleMetadata);
  }

  await addFrameworkSettingSections(attachments, session, settings, moduleMetadata);

  sortAttachments(attachments);
  return {
    attachmentPoints: SETTINGS_ATTACHMENT_POINTS.map((point) => ({ ...point })),
    attachments,
  };
}

/** @param {SettingsAttachments} attachments @param {WorkspaceRequestSession} session @param {{ enabledModules?: string[], workspaceCapabilities?: { availableTools?: string[] } }} settings @param {ModuleMetadataMap} moduleMetadata */
async function addFrameworkSettingSections(attachments, session, settings, moduleMetadata) {
  const enabledModules = new Set(settings.enabledModules || []);
  const availableTools = new Set(settings.workspaceCapabilities?.availableTools || []);

  for (const definition of listFrameworkSettingDefinitions()) {
    if (!(await frameworkDefinitionEligible(definition, session, enabledModules, availableTools))) {
      continue;
    }
    const moduleId = definition.moduleId || "framework";
    if (!moduleMetadata.has(moduleId)) {
      moduleMetadata.set(moduleId, {
        moduleId,
        name: definition.moduleName || moduleId,
        displayName: definition.moduleName || moduleId,
      });
    }
    const setting = {
      ...definition,
      moduleId,
      target: "framework",
      value: await settingsService.getFrameworkValue(session, definition.id),
    };
    const placement = definition.placement;
    if (isSettingsPlacement(placement)) {
      addSettingToAttachment(attachments, placement, { ...setting, placement }, moduleMetadata);
    }
  }
}

/** @param {import("../core/settings/framework-settings-registry.js").FrameworkSettingDefinition} definition @param {WorkspaceRequestSession} session @param {Set<string>} enabledModules @param {Set<string>} availableTools */
async function frameworkDefinitionEligible(definition, session, enabledModules, availableTools) {
  if (!(definition.requiredModules || []).every((moduleId) => enabledModules.has(moduleId)) ||
      !(definition.requiresEnabledModules || []).every((moduleId) => enabledModules.has(moduleId))) {
    return false;
  }
  const requiredCapabilities = definition.requiredWorkspaceCapabilities || [];
  if (requiredCapabilities.length > 0 && !requiredCapabilities.some((capability) => availableTools.has(capability))) {
    return false;
  }
  for (const permissionId of definition.requiredPermissions || []) {
    if (!(await permissionsService.canInAnyScope(session, permissionId, {
      workspace_id: session.workspace_id,
      operation: "read",
    }))) {
      return false;
    }
  }
  return true;
}

/** @returns {SettingsAttachments} */
function createEmptyAttachments() {
  return {
    workspace: [],
    user: [],
    module: {},
    "new-workspace": [],
  };
}

/** @param {ModuleSettingsDefinition[]} [moduleSettings] @returns {Map<string, DecoratedSetting>} */
function buildDecoratedSettingMap(moduleSettings = []) {
  return new Map((moduleSettings || []).flatMap((moduleDefinition) => (
    (moduleDefinition.settings || []).map((setting) => [
      `${moduleDefinition.moduleId}.${setting.id}`,
      setting,
    ])
  )));
}

/** @param {ModuleSettingsDefinition[]} [moduleSettings] @returns {ModuleMetadataMap} */
function buildModuleMetadata(moduleSettings = []) {
  return new Map((moduleSettings || []).map((moduleDefinition) => [moduleDefinition.moduleId, {
    moduleId: moduleDefinition.moduleId,
    name: moduleDefinition.name || moduleDefinition.moduleId,
    displayName: moduleDefinition.displayName || moduleDefinition.name || moduleDefinition.moduleId,
  }]));
}

/** @param {CatalogSetting} contribution @param {DecoratedSetting | undefined} decorated @returns {CatalogSetting} */
function hydrateContribution(contribution, decorated) {
  return {
    ...contribution,
    readOnly: contribution.readOnly === true || decorated?.readOnly === true,
    readOnlyReason: contribution.readOnlyReason || contribution.disabledReason || decorated?.readOnlyReason || "",
    value: decorated?.value ?? contribution.default ?? defaultSettingValue(contribution),
  };
}

/** @param {SettingsAttachments} attachments @param {"workspace" | "user" | "module" | "new-workspace"} placement @param {CatalogSetting} setting @param {ModuleMetadataMap} moduleMetadata */
function addSettingToAttachment(attachments, placement, setting, moduleMetadata) {
  const target = placement === "module"
    ? attachments.module[setting.moduleId] ||= []
    : attachments[placement];
  const section = findOrCreateSection(target, setting.moduleId, placement, moduleMetadata);
  section.settings.push(setting);
}

/** @param {SettingSection[]} sections @param {string} moduleId @param {string} placement @param {ModuleMetadataMap} moduleMetadata */
function findOrCreateSection(sections, moduleId, placement, moduleMetadata) {
  let section = sections.find((candidate) => candidate.moduleId === moduleId);
  if (section) {
    return section;
  }

  const metadata = moduleMetadata.get(moduleId) || {
    moduleId,
    name: moduleId,
    displayName: moduleId,
  };
  section = {
    ...metadata,
    id: `${placement}.${moduleId}`,
    placement,
    settings: [],
  };
  sections.push(section);
  return section;
}

/** @param {SettingSection[]} sections @param {ModuleSettingsDefinition[]} moduleSettings @param {ModuleMetadataMap} moduleMetadata */
function addModuleLifecycleSections(sections, moduleSettings = [], moduleMetadata) {
  for (const moduleDefinition of moduleSettings || []) {
    const lifecycleSettings = (moduleDefinition.settings || [])
      .filter((setting) => setting.moduleStatus === true && setting.placement === "workspace")
      .map((setting) => ({
        ...setting,
        moduleId: setting.moduleId || moduleDefinition.moduleId,
        placement: /** @type {const} */ ("workspace"),
      }));
    if (lifecycleSettings.length === 0) {
      continue;
    }
    const section = findOrCreateSection(sections, moduleDefinition.moduleId, "workspace", moduleMetadata);
    section.lifecycle = true;
    section.settings.push(...lifecycleSettings);
  }
}

/** @param {unknown} value @returns {value is "workspace" | "user" | "module" | "new-workspace"} */
function isSettingsPlacement(value) {
  return value === "workspace" || value === "user" || value === "module" || value === "new-workspace";
}

/** @param {SettingsAttachments} attachments */
function sortAttachments(attachments) {
  /** @param {SettingSection[]} sections */
  const sortSections = (sections) => sections.sort((left, right) => (
    left.displayName.localeCompare(right.displayName) || left.moduleId.localeCompare(right.moduleId)
  )).forEach((section) => section.settings.sort((left, right) => (
    left.label.localeCompare(right.label) || left.id.localeCompare(right.id)
  )));

  sortSections(attachments.workspace);
  sortSections(attachments.user);
  sortSections(attachments["new-workspace"]);
  Object.keys(attachments.module).sort().forEach((moduleId) => sortSections(attachments.module[moduleId]));
}

/**
 * @param {{ type: string; }} setting
 */
function defaultSettingValue(setting) {
  if (["boolean", "toggle"].includes(setting.type)) {
    return false;
  }
  if (setting.type === "multi-select") {
    return [];
  }
  return "";
}

const settingsCatalogServiceInternal = {
  read,
};

export const settingsCatalogService = /** @type {import("../types/framework-contracts.js").ValidatedService<typeof settingsCatalogServiceInternal>} */ (settingsCatalogServiceInternal);

export { SETTINGS_ATTACHMENT_POINTS };
