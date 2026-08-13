/** @typedef {{ context?: unknown, definition: import("../../types/framework-contracts.js").ModuleSettingDefinition, moduleId: string, previousValue?: unknown, settingId: string, value?: unknown, workspaceId: string }} SettingPersistenceContext */
/** @typedef {SettingPersistenceContext & { context: unknown }} SettingEffectContext */
/** @typedef {{ read: (input: SettingPersistenceContext) => unknown | Promise<unknown>, write: (input: SettingPersistenceContext) => unknown | Promise<unknown>, recordUrl?: string }} SettingPersistenceHandler */
/** @typedef {(input: SettingEffectContext) => unknown | Promise<unknown>} SettingOnChangeEffect */

/** @type {Map<string, SettingPersistenceHandler>} */
const SETTING_PERSISTENCE_HANDLERS = new Map();
/** @type {Map<string, SettingOnChangeEffect>} */
const SETTING_ON_CHANGE_EFFECTS = new Map();

/**
 * @param {string} key
 */
function getPersistenceHandler(key) {
  return SETTING_PERSISTENCE_HANDLERS.get(normalizeRegistryKey(key)) || null;
}

/**
 * @param {string} key
 */
function getOnChangeEffect(key) {
  return SETTING_ON_CHANGE_EFFECTS.get(normalizeRegistryKey(key)) || null;
}

/**
 * @param {string} key
 * @param {SettingPersistenceHandler} handler
 */
function registerPersistenceHandler(key, handler) {
  const registryKey = normalizeRegistryKey(key);
  if (!handler || typeof handler !== "object" ||
      typeof handler.read !== "function" || typeof handler.write !== "function") {
    throw new TypeError(`Persistence handler '${registryKey}' must provide read and write.`);
  }
  if (SETTING_PERSISTENCE_HANDLERS.has(registryKey)) {
    throw new TypeError(`Persistence handler '${registryKey}' is already registered.`);
  }
  SETTING_PERSISTENCE_HANDLERS.set(registryKey, Object.freeze({ ...handler }));
  return () => SETTING_PERSISTENCE_HANDLERS.delete(registryKey);
}

/**
 * @param {string} key
 * @param {SettingOnChangeEffect} effect
 */
function registerOnChangeEffect(key, effect) {
  const registryKey = normalizeRegistryKey(key);
  if (typeof effect !== "function") {
    throw new TypeError(`On-change effect '${registryKey}' must be a function.`);
  }
  if (SETTING_ON_CHANGE_EFFECTS.has(registryKey)) {
    throw new TypeError(`On-change effect '${registryKey}' is already registered.`);
  }
  SETTING_ON_CHANGE_EFFECTS.set(registryKey, effect);
  return () => SETTING_ON_CHANGE_EFFECTS.delete(registryKey);
}

/**
 * @param {unknown} key
 */
function normalizeRegistryKey(key) {
  const registryKey = String(key || "").trim();
  if (!registryKey.includes(".") || registryKey.startsWith(".") || registryKey.endsWith(".")) {
    throw new TypeError("Setting registry keys must use '<moduleId>.<settingId>'.");
  }
  return registryKey;
}

export {
  getOnChangeEffect,
  getPersistenceHandler,
  registerOnChangeEffect,
  registerPersistenceHandler,
};
