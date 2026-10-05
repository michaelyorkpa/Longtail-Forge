const FRAMEWORK_SETTING_NAMESPACE = "framework";
/** @typedef {Partial<import("../../types/framework-contracts.js").ModuleSettingDefinition> & Pick<import("../../types/framework-contracts.js").ModuleSettingDefinition, "id" | "label" | "type"> & {defaultValue?: unknown, moduleId?: string, moduleName?: string, recordUrl?: string}} FrameworkSettingDefinition */
/** @typedef {FrameworkSettingDefinition & { placement: import("../../types/framework-contracts.js").ModuleSettingDefinition["placement"] }} RegisteredFrameworkSettingDefinition */
/** @type {Map<string, ReturnType<typeof freezeDefinition>>} */
const FRAMEWORK_SETTING_DEFINITIONS = new Map();

/** @param {FrameworkSettingDefinition} definition */
function registerFrameworkSettingDefinition(definition) {
  const settingId = String(definition?.id || "").trim();
  if (!settingId) {
    throw new TypeError("Framework setting definitions require an ID.");
  }
  if (FRAMEWORK_SETTING_DEFINITIONS.has(settingId)) {
    throw new TypeError(`Framework setting '${settingId}' is already registered.`);
  }

  const registeredDefinition = freezeDefinition({
    ...definition,
    id: settingId,
    target: FRAMEWORK_SETTING_NAMESPACE,
  });
  FRAMEWORK_SETTING_DEFINITIONS.set(settingId, registeredDefinition);
  return () => FRAMEWORK_SETTING_DEFINITIONS.delete(settingId);
}

/** @param {unknown} settingId */
function getFrameworkSettingDefinition(settingId) {
  const definition = FRAMEWORK_SETTING_DEFINITIONS.get(String(settingId || "").trim());
  return definition ? cloneDefinition(definition) : null;
}

function listFrameworkSettingDefinitions() {
  return [...FRAMEWORK_SETTING_DEFINITIONS.values()]
    .map(cloneDefinition)
    .sort((left, right) => left.id.localeCompare(right.id));
}

/** @param {FrameworkSettingDefinition} definition @returns {Readonly<RegisteredFrameworkSettingDefinition>} */
function freezeDefinition(definition) {
  return /** @type {Readonly<RegisteredFrameworkSettingDefinition>} */ (Object.freeze({
    ...definition,
    placement: definition.placement || "workspace",
    options: Object.freeze((definition.options || []).map((option) => Object.freeze({ ...option }))),
    requiredModules: Object.freeze([...(definition.requiredModules || [])]),
    requiredPermissions: Object.freeze([...(definition.requiredPermissions || [])]),
    requiredWorkspaceCapabilities: Object.freeze([...(definition.requiredWorkspaceCapabilities || [])]),
    requiresEnabledModules: Object.freeze([...(definition.requiresEnabledModules || [])]),
  }));
}

/** @param {ReturnType<typeof freezeDefinition>} definition @returns {RegisteredFrameworkSettingDefinition} */
function cloneDefinition(definition) {
  return {
    ...definition,
    options: (definition.options || []).map((option) => ({ ...option })),
    requiredModules: [...(definition.requiredModules || [])],
    requiredPermissions: [...(definition.requiredPermissions || [])],
    requiredWorkspaceCapabilities: [...(definition.requiredWorkspaceCapabilities || [])],
    requiresEnabledModules: [...(definition.requiresEnabledModules || [])],
  };
}

export {
  FRAMEWORK_SETTING_NAMESPACE,
  getFrameworkSettingDefinition,
  listFrameworkSettingDefinitions,
  registerFrameworkSettingDefinition,
};
