const ACTIVE_MANIFEST_FIELDS = new Set([
  "id",
  "name",
  "displayName",
  "description",
  "category",
  "version",
  "enabledByDefault",
  "canDisable",
  "historicalReadAccess",
  "browserApiRoutes",
  "publicApiRoutes",
  "migrationsDir",
  "protectedViewsDir",
  "publicViewsDir",
  "browserAssetsDir",
  "navigation",
  "dashboard",
  "reporting",
  "workbench",
  "settings",
  "requiredPermissions",
  "publicApiEndpoints",
  "apiScopes",
  "timerSources",
  "workItemSources",
  "hooks",
  "frameworkDependencies",
  "moduleDependencies",
  "seedHooks",
  "repairHooks",
  "workspaceCapabilityRequirements",
]);

const RESERVED_MANIFEST_FIELDS = new Set([
  "auditRecordTypes",
  "eventTypes",
  "notificationEvents",
  "notificationTemplates",
  "searchableTypes",
  "taggableTypes",
]);

const MODULE_ID_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const HTTP_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);

function validateModuleManifest(moduleDefinition, allModuleIds = new Set()) {
  const errors = [];
  const moduleLabel = moduleDefinition?.id || moduleDefinition?.name || "<unknown>";

  if (!isPlainObject(moduleDefinition)) {
    return ["Module manifest must be a plain object."];
  }

  validateKnownFields(moduleDefinition, errors);
  requireString(moduleDefinition, "id", errors, { pattern: MODULE_ID_PATTERN });
  requireString(moduleDefinition, "name", errors);
  requireString(moduleDefinition, "displayName", errors);
  requireString(moduleDefinition, "description", errors);
  requireString(moduleDefinition, "category", errors);
  requireString(moduleDefinition, "version", errors);
  requireBoolean(moduleDefinition, "enabledByDefault", errors);
  optionalBoolean(moduleDefinition, "canDisable", errors);
  optionalBoolean(moduleDefinition, "historicalReadAccess", errors);
  optionalUrlOrString(moduleDefinition, "migrationsDir", errors, { nullable: true });
  optionalUrlOrString(moduleDefinition, "protectedViewsDir", errors);
  optionalUrlOrString(moduleDefinition, "publicViewsDir", errors);
  optionalUrlOrString(moduleDefinition, "browserAssetsDir", errors);
  optionalArray(moduleDefinition, "browserApiRoutes", errors);
  optionalArray(moduleDefinition, "publicApiRoutes", errors);
  optionalStringArray(moduleDefinition, "requiredPermissions", errors);
  optionalStringArray(moduleDefinition, "apiScopes", errors);
  optionalStringArray(moduleDefinition, "frameworkDependencies", errors);
  optionalStringArray(moduleDefinition, "moduleDependencies", errors);
  optionalStringArray(moduleDefinition, "workspaceCapabilityRequirements", errors);
  optionalArray(moduleDefinition, "seedHooks", errors);
  optionalArray(moduleDefinition, "repairHooks", errors);
  validateNavigation(moduleDefinition.navigation, errors);
  validateDashboard(moduleDefinition.dashboard, errors);
  validateWorkbench(moduleDefinition.workbench, errors);
  validateSettings(moduleDefinition.settings, errors);
  validatePublicApiEndpoints(moduleDefinition.publicApiEndpoints, errors);
  validateHooks(moduleDefinition.hooks, errors);
  validateTimerSources(moduleDefinition.timerSources, moduleDefinition.id, errors);
  validateWorkItemSources(moduleDefinition.workItemSources, moduleDefinition.id, errors);
  validateReservedFields(moduleDefinition, errors);

  for (const dependencyId of moduleDefinition.moduleDependencies || []) {
    if (!allModuleIds.has(dependencyId)) {
      errors.push(`moduleDependencies references unknown module '${dependencyId}'.`);
    }
  }

  return errors.map((error) => `${moduleLabel}: ${error}`);
}

function validateModuleManifests(moduleDefinitions) {
  const errors = [];
  const seenIds = new Set();
  const allModuleIds = new Set();

  for (const moduleDefinition of moduleDefinitions) {
    if (moduleDefinition?.id) {
      if (seenIds.has(moduleDefinition.id)) {
        errors.push(`${moduleDefinition.id}: id must be unique.`);
      }
      seenIds.add(moduleDefinition.id);
      allModuleIds.add(moduleDefinition.id);
    }
  }

  for (const moduleDefinition of moduleDefinitions) {
    errors.push(...validateModuleManifest(moduleDefinition, allModuleIds));
  }

  if (errors.length > 0) {
    throw new Error(`Invalid module manifest configuration:\n- ${errors.join("\n- ")}`);
  }
}

function validateKnownFields(moduleDefinition, errors) {
  for (const fieldName of Object.keys(moduleDefinition)) {
    if (!ACTIVE_MANIFEST_FIELDS.has(fieldName) && !RESERVED_MANIFEST_FIELDS.has(fieldName)) {
      errors.push(`unknown manifest field '${fieldName}'.`);
    }
  }
}

function validateReservedFields(moduleDefinition, errors) {
  for (const fieldName of RESERVED_MANIFEST_FIELDS) {
    optionalArray(moduleDefinition, fieldName, errors);
  }
}

function validateNavigation(navigation, errors) {
  optionalArrayOfObjects(navigation, "navigation", errors, (item, index) => {
    requireString(item, "label", errors, { prefix: `navigation[${index}]` });
    requireString(item, "href", errors, { prefix: `navigation[${index}]` });
    optionalStringArray(item, "requiredPermissions", errors, { prefix: `navigation[${index}]` });
  });
}

function validateDashboard(dashboard, errors) {
  optionalArrayOfObjects(dashboard, "dashboard", errors, (item, index) => {
    requireString(item, "id", errors, { prefix: `dashboard[${index}]` });
    requireString(item, "label", errors, { prefix: `dashboard[${index}]` });
  });
}

function validateWorkbench(workbench, errors) {
  optionalArrayOfObjects(workbench, "workbench", errors, (item, index) => {
    requireString(item, "id", errors, { prefix: `workbench[${index}]` });
    requireString(item, "label", errors, { prefix: `workbench[${index}]` });
    requireString(item, "renderer", errors, { prefix: `workbench[${index}]` });
    requireString(item, "moduleId", errors, { prefix: `workbench[${index}]` });
    optionalStringArray(item, "requiredPermissions", errors, { prefix: `workbench[${index}]` });
    optionalStringArray(item, "requiredWorkspaceCapabilities", errors, { prefix: `workbench[${index}]` });
    optionalStringArray(item, "requiresEnabledModules", errors, { prefix: `workbench[${index}]` });
    optionalBoolean(item, "defaultCollapsed", errors, { prefix: `workbench[${index}]` });
    optionalNumber(item, "sortOrder", errors, { prefix: `workbench[${index}]` });
  });
}

function validateSettings(settings, errors) {
  optionalArrayOfObjects(settings, "settings", errors, (item, index) => {
    requireString(item, "id", errors, { prefix: `settings[${index}]` });
    requireString(item, "label", errors, { prefix: `settings[${index}]` });
    requireString(item, "type", errors, { prefix: `settings[${index}]` });
    optionalBoolean(item, "moduleStatus", errors, { prefix: `settings[${index}]` });
  });
}

function validatePublicApiEndpoints(publicApiEndpoints, errors) {
  optionalArrayOfObjects(publicApiEndpoints, "publicApiEndpoints", errors, (item, index) => {
    requireString(item, "method", errors, { prefix: `publicApiEndpoints[${index}]` });
    if (typeof item.method === "string" && !HTTP_METHODS.has(item.method)) {
      errors.push(`publicApiEndpoints[${index}].method must be a supported HTTP method.`);
    }
    requireString(item, "path", errors, { prefix: `publicApiEndpoints[${index}]` });
    requireString(item, "scope", errors, { prefix: `publicApiEndpoints[${index}]` });
  });
}

function validateHooks(hooks, errors) {
  if (hooks === undefined) {
    return;
  }

  if (!isPlainObject(hooks)) {
    errors.push("hooks must be an object.");
    return;
  }

  for (const hookName of [
    "onModuleEnabled",
    "onModuleDisabled",
    "onModuleInstalled",
    "onModuleUpdated",
    "onModuleRepaired",
  ]) {
    const hook = hooks[hookName];
    if (hook !== undefined && typeof hook !== "function") {
      errors.push(`hooks.${hookName} must be a function.`);
    }
  }
}

function validateTimerSources(timerSources, moduleId, errors) {
  optionalArrayOfObjects(timerSources, "timerSources", errors, (item, index) => {
    requireString(item, "sourceType", errors, { prefix: `timerSources[${index}]` });
    validateModuleIdValue(item, "moduleId", moduleId, errors, { prefix: `timerSources[${index}]` });
    requireString(item, "label", errors, { prefix: `timerSources[${index}]` });
    optionalString(item, "listRoute", errors, { prefix: `timerSources[${index}]` });
    optionalString(item, "startRoute", errors, { prefix: `timerSources[${index}]` });
    optionalString(item, "pauseRoute", errors, { prefix: `timerSources[${index}]` });
    optionalString(item, "finalizeRoute", errors, { prefix: `timerSources[${index}]` });
    optionalStringArray(item, "requiredPermissions", errors, { prefix: `timerSources[${index}]` });
    optionalStringArray(item, "requiredModules", errors, { prefix: `timerSources[${index}]` });
  });
}

function validateWorkItemSources(workItemSources, moduleId, errors) {
  optionalArrayOfObjects(workItemSources, "workItemSources", errors, (item, index) => {
    requireString(item, "sourceType", errors, { prefix: `workItemSources[${index}]` });
    validateModuleIdValue(item, "moduleId", moduleId, errors, { prefix: `workItemSources[${index}]` });
    requireString(item, "label", errors, { prefix: `workItemSources[${index}]` });
    requireString(item, "listRoute", errors, { prefix: `workItemSources[${index}]` });
    optionalStringArray(item, "requiredPermissions", errors, { prefix: `workItemSources[${index}]` });
    optionalStringArray(item, "requiredModules", errors, { prefix: `workItemSources[${index}]` });
    optionalPlainObject(item, "filterHints", errors, { prefix: `workItemSources[${index}]` });
    optionalPlainObject(item, "sortHints", errors, { prefix: `workItemSources[${index}]` });
  });
}

function validateModuleIdValue(object, fieldName, expectedValue, errors, options = {}) {
  requireString(object, fieldName, errors, options);
  if (object[fieldName] && object[fieldName] !== expectedValue) {
    errors.push(formatFieldName(fieldName, options.prefix) + ` must match module id '${expectedValue}'.`);
  }
}

function optionalArrayOfObjects(value, fieldName, errors, validator) {
  if (value === undefined) {
    return;
  }
  if (!Array.isArray(value)) {
    errors.push(`${fieldName} must be an array.`);
    return;
  }
  value.forEach((item, index) => {
    if (!isPlainObject(item)) {
      errors.push(`${fieldName}[${index}] must be an object.`);
      return;
    }
    validator(item, index);
  });
}

function requireString(object, fieldName, errors, options = {}) {
  const value = object[fieldName];
  const name = formatFieldName(fieldName, options.prefix);
  if (typeof value !== "string" || value.trim() === "") {
    errors.push(`${name} is required and must be a non-empty string.`);
    return;
  }
  if (options.pattern && !options.pattern.test(value)) {
    errors.push(`${name} has an invalid format.`);
  }
}

function optionalString(object, fieldName, errors, options = {}) {
  const value = object[fieldName];
  if (value !== undefined && typeof value !== "string") {
    errors.push(`${formatFieldName(fieldName, options.prefix)} must be a string.`);
  }
}

function requireBoolean(object, fieldName, errors, options = {}) {
  if (typeof object[fieldName] !== "boolean") {
    errors.push(`${formatFieldName(fieldName, options.prefix)} is required and must be a boolean.`);
  }
}

function optionalBoolean(object, fieldName, errors, options = {}) {
  const value = object[fieldName];
  if (value !== undefined && typeof value !== "boolean") {
    errors.push(`${formatFieldName(fieldName, options.prefix)} must be a boolean.`);
  }
}

function optionalNumber(object, fieldName, errors, options = {}) {
  const value = object[fieldName];
  if (value !== undefined && typeof value !== "number") {
    errors.push(`${formatFieldName(fieldName, options.prefix)} must be a number.`);
  }
}

function optionalArray(object, fieldName, errors) {
  const value = object[fieldName];
  if (value !== undefined && value !== null && !Array.isArray(value)) {
    errors.push(`${fieldName} must be an array.`);
  }
}

function optionalStringArray(object, fieldName, errors, options = {}) {
  const value = object[fieldName];
  if (value === undefined) {
    return;
  }
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.trim() === "")) {
    errors.push(`${formatFieldName(fieldName, options.prefix)} must be an array of non-empty strings.`);
  }
}

function optionalPlainObject(object, fieldName, errors, options = {}) {
  const value = object[fieldName];
  if (value !== undefined && !isPlainObject(value)) {
    errors.push(`${formatFieldName(fieldName, options.prefix)} must be an object.`);
  }
}

function optionalUrlOrString(object, fieldName, errors, options = {}) {
  const value = object[fieldName];
  if (value === undefined || (options.nullable && value === null)) {
    return;
  }
  if (!(value instanceof URL) && typeof value !== "string") {
    errors.push(`${fieldName} must be a URL or string.`);
  }
}

function formatFieldName(fieldName, prefix) {
  return prefix ? `${prefix}.${fieldName}` : fieldName;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype;
}

export {
  ACTIVE_MANIFEST_FIELDS,
  RESERVED_MANIFEST_FIELDS,
  validateModuleManifest,
  validateModuleManifests,
};
