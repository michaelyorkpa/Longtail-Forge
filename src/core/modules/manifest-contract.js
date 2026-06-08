const ACTIVE_MANIFEST_FIELDS = new Set([
  "id",
  "name",
  "displayName",
  "description",
  "terminology",
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
  "protectedViews",
  "publicViews",
  "browserAssets",
  "navigation",
  "dashboard",
  "reporting",
  "workbench",
  "settings",
  "permissions",
  "requiredPermissions",
  "defaultRolePermissions",
  "resourceDefinitions",
  "publicApiEndpoints",
  "apiScopes",
  "auditRecordTypes",
  "eventTypes",
  "eventSummaries",
  "timerSources",
  "workItemSources",
  "taggableTypes",
  "searchableTypes",
  "hooks",
  "frameworkDependencies",
  "moduleDependencies",
  "seedHooks",
  "repairHooks",
  "workspaceCapabilityRequirements",
]);

const RESERVED_MANIFEST_FIELDS = new Set([
  "notificationEvents",
  "notificationTemplates",
  "notificationFollowTargets",
]);

const MODULE_ID_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const HTTP_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);
const SETTING_FIELD_TYPES = new Set(["boolean", "text", "number", "select", "multi-select", "info"]);
const NOTIFICATION_PRIORITIES = new Set(["low", "normal", "high", "urgent"]);
const NOTIFICATION_RECIPIENT_MODES = new Set(["actor", "assignees", "workspace_admins", "explicit_users"]);
const TERMINOLOGY_WORKSPACE_TYPES = new Set(["default", "business", "personal", "family"]);
const TERMINOLOGY_FIELDS = new Set([
  "label",
  "singular",
  "plural",
  "shortLabel",
  "navigationLabel",
  "emptyState",
  "emptyStateLabel",
  "createButton",
  "createButtonLabel",
  "description",
]);

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
  validateTerminology(moduleDefinition.terminology, "terminology", errors);
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
  optionalStringArray(moduleDefinition, "frameworkDependencies", errors);
  optionalStringArray(moduleDefinition, "moduleDependencies", errors);
  optionalStringArray(moduleDefinition, "workspaceCapabilityRequirements", errors);
  optionalArray(moduleDefinition, "seedHooks", errors);
  optionalArray(moduleDefinition, "repairHooks", errors);
  validateNavigation(moduleDefinition.navigation, errors);
  validateViews(moduleDefinition.protectedViews, moduleDefinition.id, "protectedViews", errors);
  validateViews(moduleDefinition.publicViews, moduleDefinition.id, "publicViews", errors);
  validateBrowserAssets(moduleDefinition.browserAssets, moduleDefinition.id, errors);
  validateDashboard(moduleDefinition.dashboard, errors);
  validateWorkbench(moduleDefinition.workbench, errors);
  validateSettings(moduleDefinition.settings, errors);
  validatePermissions(moduleDefinition.permissions, moduleDefinition.id, errors);
  validateDefaultRolePermissions(moduleDefinition.defaultRolePermissions, errors);
  validateResourceDefinitions(moduleDefinition.resourceDefinitions, moduleDefinition.id, errors);
  validateApiScopes(moduleDefinition.apiScopes, moduleDefinition.id, errors);
  validateAuditRecordTypes(moduleDefinition.auditRecordTypes, moduleDefinition.id, errors);
  validateEventTypes(moduleDefinition.eventTypes, moduleDefinition.id, errors);
  validateEventSummaries(moduleDefinition.eventSummaries, moduleDefinition.id, errors);
  validatePublicApiEndpoints(moduleDefinition.publicApiEndpoints, errors);
  validateHooks(moduleDefinition.hooks, errors);
  validateTimerSources(moduleDefinition.timerSources, moduleDefinition.id, errors);
  validateWorkItemSources(moduleDefinition.workItemSources, moduleDefinition.id, errors);
  validateTaggableTypes(moduleDefinition.taggableTypes, moduleDefinition.id, errors);
  validateSearchableTypes(moduleDefinition.searchableTypes, moduleDefinition.id, errors);
  validateNotificationEvents(moduleDefinition.notificationEvents, moduleDefinition.id, errors);
  validateNotificationTemplates(moduleDefinition.notificationTemplates, moduleDefinition.id, errors);
  validateNotificationFollowTargets(moduleDefinition.notificationFollowTargets, moduleDefinition.id, errors);
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
    if (!["notificationEvents", "notificationTemplates"].includes(fieldName)) {
      optionalArray(moduleDefinition, fieldName, errors);
    }
  }
}

function validateNotificationEvents(notificationEvents, moduleId, errors) {
  optionalArrayOfObjects(notificationEvents, "notificationEvents", errors, (item, index) => {
    requireString(item, "id", errors, { prefix: `notificationEvents[${index}]` });
    validateModuleIdValue(item, "moduleId", moduleId, errors, { prefix: `notificationEvents[${index}]` });
    requireString(item, "label", errors, { prefix: `notificationEvents[${index}]` });
    requireString(item, "description", errors, { prefix: `notificationEvents[${index}]` });
    requireBoolean(item, "defaultEnabled", errors, { prefix: `notificationEvents[${index}]` });
    requireString(item, "defaultPriority", errors, { prefix: `notificationEvents[${index}]` });
    if (typeof item.defaultPriority === "string" && !NOTIFICATION_PRIORITIES.has(item.defaultPriority)) {
      errors.push(`notificationEvents[${index}].defaultPriority must be low, normal, high, or urgent.`);
    }
    optionalString(item, "recipientResolver", errors, { prefix: `notificationEvents[${index}]` });
    optionalString(item, "recipientMode", errors, { prefix: `notificationEvents[${index}]` });
    if (!item.recipientResolver && !item.recipientMode) {
      errors.push(`notificationEvents[${index}] must include recipientResolver or recipientMode.`);
    }
    if (typeof item.recipientMode === "string" && !NOTIFICATION_RECIPIENT_MODES.has(item.recipientMode)) {
      errors.push(`notificationEvents[${index}].recipientMode must be a framework-recognized recipient mode.`);
    }
    validateTerminology(item.terminology, `notificationEvents[${index}].terminology`, errors);
  });
}

function validateNotificationTemplates(notificationTemplates, moduleId, errors) {
  optionalArrayOfObjects(notificationTemplates, "notificationTemplates", errors, (item, index) => {
    requireString(item, "id", errors, { prefix: `notificationTemplates[${index}]` });
    validateModuleIdValue(item, "moduleId", moduleId, errors, { prefix: `notificationTemplates[${index}]` });
    requireString(item, "event", errors, { prefix: `notificationTemplates[${index}]` });
    requireString(item, "title", errors, { prefix: `notificationTemplates[${index}]` });
    requireString(item, "body", errors, { prefix: `notificationTemplates[${index}]` });
    optionalString(item, "url", errors, { prefix: `notificationTemplates[${index}]` });
    optionalString(item, "recordLinkPattern", errors, { prefix: `notificationTemplates[${index}]` });
    if (item.url !== undefined) {
      validateRelativeUrl(item.url, `notificationTemplates[${index}].url`, errors);
    }
    if (item.recordLinkPattern !== undefined) {
      validateRelativeUrl(item.recordLinkPattern, `notificationTemplates[${index}].recordLinkPattern`, errors);
    }
    validateTerminology(item.terminology, `notificationTemplates[${index}].terminology`, errors);
  });
}

function validateNotificationFollowTargets(notificationFollowTargets, moduleId, errors) {
  optionalArrayOfObjects(notificationFollowTargets, "notificationFollowTargets", errors, (item, index) => {
    requireString(item, "targetType", errors, { prefix: `notificationFollowTargets[${index}]` });
    validateModuleIdValue(item, "moduleId", moduleId, errors, { prefix: `notificationFollowTargets[${index}]` });
    requireString(item, "label", errors, { prefix: `notificationFollowTargets[${index}]` });
    requireString(item, "description", errors, { prefix: `notificationFollowTargets[${index}]` });
    requireString(item, "requiredReadPermission", errors, { prefix: `notificationFollowTargets[${index}]` });
    optionalStringArray(item, "eventTypes", errors, { prefix: `notificationFollowTargets[${index}]` });
  });
}

function validateNavigation(navigation, errors) {
  optionalArrayOfObjects(navigation, "navigation", errors, (item, index) => {
    requireString(item, "label", errors, { prefix: `navigation[${index}]` });
    requireString(item, "href", errors, { prefix: `navigation[${index}]` });
    validateTerminology(item.terminology, `navigation[${index}].terminology`, errors);
    optionalStringArray(item, "requiredPermissions", errors, { prefix: `navigation[${index}]` });
  });
}

function validateViews(views, moduleId, fieldName, errors) {
  optionalArrayOfObjects(views, fieldName, errors, (item, index) => {
    requireString(item, "id", errors, { prefix: `${fieldName}[${index}]` });
    requireString(item, "path", errors, { prefix: `${fieldName}[${index}]` });
    validateModuleIdValue(item, "moduleId", moduleId, errors, { prefix: `${fieldName}[${index}]` });
    requireString(item, "file", errors, { prefix: `${fieldName}[${index}]` });
    optionalStringArray(item, "requiredPermissions", errors, { prefix: `${fieldName}[${index}]` });
    optionalStringArray(item, "requiredWorkspaceCapabilities", errors, { prefix: `${fieldName}[${index}]` });
    optionalBoolean(item, "allowDisabledRead", errors, { prefix: `${fieldName}[${index}]` });
  });
}

function validateBrowserAssets(browserAssets, moduleId, errors) {
  optionalArrayOfObjects(browserAssets, "browserAssets", errors, (item, index) => {
    requireString(item, "id", errors, { prefix: `browserAssets[${index}]` });
    validateModuleIdValue(item, "moduleId", moduleId, errors, { prefix: `browserAssets[${index}]` });
    requireString(item, "path", errors, { prefix: `browserAssets[${index}]` });
    requireString(item, "type", errors, { prefix: `browserAssets[${index}]` });
    if (typeof item.type === "string" && !["script", "style"].includes(item.type)) {
      errors.push(`browserAssets[${index}].type must be script or style.`);
    }
    optionalStringArray(item, "views", errors, { prefix: `browserAssets[${index}]` });
    optionalStringArray(item, "requiredPermissions", errors, { prefix: `browserAssets[${index}]` });
    optionalStringArray(item, "requiredWorkspaceCapabilities", errors, { prefix: `browserAssets[${index}]` });
  });
}

function validateDashboard(dashboard, errors) {
  optionalArrayOfObjects(dashboard, "dashboard", errors, (item, index) => {
    requireString(item, "id", errors, { prefix: `dashboard[${index}]` });
    requireString(item, "label", errors, { prefix: `dashboard[${index}]` });
    requireString(item, "renderer", errors, { prefix: `dashboard[${index}]` });
    requireString(item, "moduleId", errors, { prefix: `dashboard[${index}]` });
    optionalString(item, "description", errors, { prefix: `dashboard[${index}]` });
    optionalStringArray(item, "requiredPermissions", errors, { prefix: `dashboard[${index}]` });
    optionalStringArray(item, "requiredWorkspaceCapabilities", errors, { prefix: `dashboard[${index}]` });
    optionalStringArray(item, "requiresEnabledModules", errors, { prefix: `dashboard[${index}]` });
    optionalNumber(item, "sortOrder", errors, { prefix: `dashboard[${index}]` });
    validateTerminology(item.terminology, `dashboard[${index}].terminology`, errors);
  });
}

function validateWorkbench(workbench, errors) {
  optionalArrayOfObjects(workbench, "workbench", errors, (item, index) => {
    requireString(item, "id", errors, { prefix: `workbench[${index}]` });
    requireString(item, "label", errors, { prefix: `workbench[${index}]` });
    requireString(item, "renderer", errors, { prefix: `workbench[${index}]` });
    requireString(item, "moduleId", errors, { prefix: `workbench[${index}]` });
    optionalString(item, "description", errors, { prefix: `workbench[${index}]` });
    optionalString(item, "sourceType", errors, { prefix: `workbench[${index}]` });
    optionalString(item, "listRoute", errors, { prefix: `workbench[${index}]` });
    optionalStringArray(item, "requiredPermissions", errors, { prefix: `workbench[${index}]` });
    optionalStringArray(item, "requiredWorkspaceCapabilities", errors, { prefix: `workbench[${index}]` });
    optionalStringArray(item, "requiresEnabledModules", errors, { prefix: `workbench[${index}]` });
    optionalArrayOfObjects(item.actions, `workbench[${index}].actions`, errors, (action, actionIndex) => {
      requireString(action, "id", errors, { prefix: `workbench[${index}].actions[${actionIndex}]` });
      requireString(action, "label", errors, { prefix: `workbench[${index}].actions[${actionIndex}]` });
      optionalString(action, "route", errors, { prefix: `workbench[${index}].actions[${actionIndex}]` });
    });
    optionalBoolean(item, "defaultCollapsed", errors, { prefix: `workbench[${index}]` });
    optionalNumber(item, "sortOrder", errors, { prefix: `workbench[${index}]` });
    validateTerminology(item.terminology, `workbench[${index}].terminology`, errors);
  });
}

function validateSettings(settings, errors) {
  optionalArrayOfObjects(settings, "settings", errors, (item, index) => {
    requireString(item, "id", errors, { prefix: `settings[${index}]` });
    requireString(item, "label", errors, { prefix: `settings[${index}]` });
    requireString(item, "type", errors, { prefix: `settings[${index}]` });
    if (typeof item.type === "string" && !SETTING_FIELD_TYPES.has(item.type)) {
      errors.push(`settings[${index}].type must be one of ${Array.from(SETTING_FIELD_TYPES).join(", ")}.`);
    }
    optionalString(item, "description", errors, { prefix: `settings[${index}]` });
    optionalString(item, "placeholder", errors, { prefix: `settings[${index}]` });
    optionalString(item, "inputmode", errors, { prefix: `settings[${index}]` });
    optionalString(item, "readOnlyReason", errors, { prefix: `settings[${index}]` });
    optionalString(item, "disabledReason", errors, { prefix: `settings[${index}]` });
    optionalStringArray(item, "requiredPermissions", errors, { prefix: `settings[${index}]` });
    optionalArrayOfObjects(item.options, `settings[${index}].options`, errors, (option, optionIndex) => {
      requireString(option, "label", errors, { prefix: `settings[${index}].options[${optionIndex}]` });
      requireString(option, "value", errors, { prefix: `settings[${index}].options[${optionIndex}]` });
    });
    optionalNumber(item, "min", errors, { prefix: `settings[${index}]` });
    optionalNumber(item, "max", errors, { prefix: `settings[${index}]` });
    optionalNumber(item, "step", errors, { prefix: `settings[${index}]` });
    optionalBoolean(item, "moduleStatus", errors, { prefix: `settings[${index}]` });
    optionalBoolean(item, "readOnly", errors, { prefix: `settings[${index}]` });
    optionalBoolean(item, "required", errors, { prefix: `settings[${index}]` });
    validateTerminology(item.terminology, `settings[${index}].terminology`, errors);
  });
}

function validatePermissions(permissions, moduleId, errors) {
  optionalArrayOfObjects(permissions, "permissions", errors, (item, index) => {
    requireString(item, "id", errors, { prefix: `permissions[${index}]` });
    validateModuleIdValue(item, "moduleId", moduleId, errors, { prefix: `permissions[${index}]` });
    requireString(item, "label", errors, { prefix: `permissions[${index}]` });
    requireString(item, "description", errors, { prefix: `permissions[${index}]` });
    optionalString(item, "resource", errors, { prefix: `permissions[${index}]` });
    optionalString(item, "operation", errors, { prefix: `permissions[${index}]` });
    validateTerminology(item.terminology, `permissions[${index}].terminology`, errors);
  });
}

function validateDefaultRolePermissions(defaultRolePermissions, errors) {
  optionalArrayOfObjects(defaultRolePermissions, "defaultRolePermissions", errors, (item, index) => {
    requireString(item, "roleId", errors, { prefix: `defaultRolePermissions[${index}]` });
    optionalStringArray(item, "permissions", errors, { prefix: `defaultRolePermissions[${index}]` });
  });
}

function validateResourceDefinitions(resourceDefinitions, moduleId, errors) {
  optionalArrayOfObjects(resourceDefinitions, "resourceDefinitions", errors, (item, index) => {
    requireString(item, "key", errors, { prefix: `resourceDefinitions[${index}]` });
    validateModuleIdValue(item, "moduleId", moduleId, errors, { prefix: `resourceDefinitions[${index}]` });
    requireString(item, "label", errors, { prefix: `resourceDefinitions[${index}]` });
    optionalStringArray(item, "operations", errors, { prefix: `resourceDefinitions[${index}]` });
    validateTerminology(item.terminology, `resourceDefinitions[${index}].terminology`, errors);
  });
}

function validateApiScopes(apiScopes, moduleId, errors) {
  if (apiScopes === undefined) {
    return;
  }

  if (!Array.isArray(apiScopes)) {
    errors.push("apiScopes must be an array.");
    return;
  }

  apiScopes.forEach((item, index) => {
    if (typeof item === "string") {
      if (!item.trim()) {
        errors.push(`apiScopes[${index}] must be a non-empty string.`);
      }
      return;
    }

    if (!isPlainObject(item)) {
      errors.push(`apiScopes[${index}] must be a string or object.`);
      return;
    }

    requireString(item, "id", errors, { prefix: `apiScopes[${index}]` });
    validateModuleIdValue(item, "moduleId", moduleId, errors, { prefix: `apiScopes[${index}]` });
    requireString(item, "label", errors, { prefix: `apiScopes[${index}]` });
    requireString(item, "description", errors, { prefix: `apiScopes[${index}]` });
    optionalString(item, "access", errors, { prefix: `apiScopes[${index}]` });
    validateTerminology(item.terminology, `apiScopes[${index}].terminology`, errors);
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

function validateEventTypes(eventTypes, moduleId, errors) {
  optionalArrayOfObjects(eventTypes, "eventTypes", errors, (item, index) => {
    requireString(item, "event", errors, { prefix: `eventTypes[${index}]` });
    validateModuleIdValue(item, "moduleId", moduleId, errors, { prefix: `eventTypes[${index}]` });
    requireString(item, "label", errors, { prefix: `eventTypes[${index}]` });
    requireString(item, "description", errors, { prefix: `eventTypes[${index}]` });
    optionalString(item, "recordType", errors, { prefix: `eventTypes[${index}]` });
    validateTerminology(item.terminology, `eventTypes[${index}].terminology`, errors);
  });
}

function validateAuditRecordTypes(auditRecordTypes, moduleId, errors) {
  optionalArrayOfObjects(auditRecordTypes, "auditRecordTypes", errors, (item, index) => {
    requireString(item, "recordType", errors, { prefix: `auditRecordTypes[${index}]` });
    validateModuleIdValue(item, "moduleId", moduleId, errors, { prefix: `auditRecordTypes[${index}]` });
    requireString(item, "label", errors, { prefix: `auditRecordTypes[${index}]` });
    requireString(item, "description", errors, { prefix: `auditRecordTypes[${index}]` });
    validateTerminology(item.terminology, `auditRecordTypes[${index}].terminology`, errors);
  });
}

function validateEventSummaries(eventSummaries, moduleId, errors) {
  optionalArrayOfObjects(eventSummaries, "eventSummaries", errors, (item, index) => {
    requireString(item, "event", errors, { prefix: `eventSummaries[${index}]` });
    validateModuleIdValue(item, "moduleId", moduleId, errors, { prefix: `eventSummaries[${index}]` });
    optionalPlainObject(item, "activity", errors, { prefix: `eventSummaries[${index}]` });
    optionalPlainObject(item, "notification", errors, { prefix: `eventSummaries[${index}]` });
    validateSummaryObject(item.activity, `eventSummaries[${index}].activity`, errors, ["label", "summary", "url"]);
    validateSummaryObject(item.notification, `eventSummaries[${index}].notification`, errors, ["title", "body", "url", "recipientHints"]);
    validateTerminology(item.terminology, `eventSummaries[${index}].terminology`, errors);
    validateTerminology(item.activity?.terminology, `eventSummaries[${index}].activity.terminology`, errors);
    validateTerminology(item.notification?.terminology, `eventSummaries[${index}].notification.terminology`, errors);
  });
}

function validateSummaryObject(summary, prefix, errors, fieldNames) {
  if (summary === undefined) {
    return;
  }

  for (const fieldName of fieldNames) {
    const value = summary[fieldName];
    if (value !== undefined && typeof value !== "string" && typeof value !== "function" && !Array.isArray(value)) {
      errors.push(`${prefix}.${fieldName} must be a string, function, or array.`);
    }
  }
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

  optionalArrayOfObjects(hooks.events, "hooks.events", errors, (item, index) => {
    requireString(item, "event", errors, { prefix: `hooks.events[${index}]` });
    optionalString(item, "id", errors, { prefix: `hooks.events[${index}]` });
    if (typeof item.handler !== "function") {
      errors.push(`hooks.events[${index}].handler must be a function.`);
    }
  });
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
    optionalString(item, "removeRoute", errors, { prefix: `timerSources[${index}]` });
    optionalStringArray(item, "requiredPermissions", errors, { prefix: `timerSources[${index}]` });
    optionalStringArray(item, "requiredModules", errors, { prefix: `timerSources[${index}]` });
    validateTerminology(item.terminology, `timerSources[${index}].terminology`, errors);
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
    validateTerminology(item.terminology, `workItemSources[${index}].terminology`, errors);
  });
}

function validateTaggableTypes(taggableTypes, moduleId, errors) {
  optionalArrayOfObjects(taggableTypes, "taggableTypes", errors, (item, index) => {
    requireString(item, "targetType", errors, { prefix: `taggableTypes[${index}]` });
    validateModuleIdValue(item, "moduleId", moduleId, errors, { prefix: `taggableTypes[${index}]` });
    requireString(item, "label", errors, { prefix: `taggableTypes[${index}]` });
    requireString(item, "description", errors, { prefix: `taggableTypes[${index}]` });
    requireString(item, "tableName", errors, { prefix: `taggableTypes[${index}]` });
    requireString(item, "idField", errors, { prefix: `taggableTypes[${index}]` });
    requireString(item, "labelField", errors, { prefix: `taggableTypes[${index}]` });
    requireString(item, "workspaceField", errors, { prefix: `taggableTypes[${index}]` });
    optionalString(item, "clientField", errors, { prefix: `taggableTypes[${index}]` });
    optionalString(item, "projectField", errors, { prefix: `taggableTypes[${index}]` });
    requireString(item, "requiredReadPermission", errors, { prefix: `taggableTypes[${index}]` });
    requireString(item, "requiredTagPermission", errors, { prefix: `taggableTypes[${index}]` });
    optionalStringArray(item, "requiredModules", errors, { prefix: `taggableTypes[${index}]` });
    validateTerminology(item.terminology, `taggableTypes[${index}].terminology`, errors);
  });
}

function validateSearchableTypes(searchableTypes, moduleId, errors) {
  optionalArrayOfObjects(searchableTypes, "searchableTypes", errors, (item, index) => {
    requireString(item, "recordType", errors, { prefix: `searchableTypes[${index}]` });
    validateModuleIdValue(item, "moduleId", moduleId, errors, { prefix: `searchableTypes[${index}]` });
    optionalString(item, "label", errors, { prefix: `searchableTypes[${index}]` });
    optionalString(item, "description", errors, { prefix: `searchableTypes[${index}]` });
    requireString(item, "idField", errors, { prefix: `searchableTypes[${index}]` });
    requireString(item, "titleField", errors, { prefix: `searchableTypes[${index}]` });
    requireString(item, "summaryField", errors, { prefix: `searchableTypes[${index}]` });
    requireStringArray(item, "bodyFields", errors, { prefix: `searchableTypes[${index}]` });
    requireString(item, "workspaceField", errors, { prefix: `searchableTypes[${index}]` });
    optionalString(item, "clientField", errors, { prefix: `searchableTypes[${index}]` });
    optionalString(item, "projectField", errors, { prefix: `searchableTypes[${index}]` });
    requireString(item, "requiredReadPermission", errors, { prefix: `searchableTypes[${index}]` });
    requireString(item, "indexer", errors, { prefix: `searchableTypes[${index}]` });
    optionalStringArray(item, "requiredModules", errors, { prefix: `searchableTypes[${index}]` });
    optionalString(item, "tagsTextField", errors, { prefix: `searchableTypes[${index}]` });
    optionalString(item, "visibilityField", errors, { prefix: `searchableTypes[${index}]` });
    optionalString(item, "recordStatusField", errors, { prefix: `searchableTypes[${index}]` });
    optionalString(item, "sourceLabel", errors, { prefix: `searchableTypes[${index}]` });
    validateTerminology(item.terminology, `searchableTypes[${index}].terminology`, errors);

    if (Array.isArray(item.bodyFields) && item.bodyFields.length === 0) {
      errors.push(`searchableTypes[${index}].bodyFields must include at least one field when provided.`);
    }
    if (item.indexer !== undefined && typeof item.indexer !== "string") {
      errors.push(`searchableTypes[${index}].indexer must be a framework search indexer registry ID, not a function reference.`);
    }
  });
}

function validateTerminology(terminology, prefix, errors) {
  if (terminology === undefined) {
    return;
  }

  if (!isPlainObject(terminology)) {
    errors.push(`${prefix} must be an object.`);
    return;
  }

  for (const [workspaceType, terms] of Object.entries(terminology)) {
    if (!TERMINOLOGY_WORKSPACE_TYPES.has(workspaceType)) {
      errors.push(`${prefix}.${workspaceType} is not a supported workspace type.`);
      continue;
    }

    if (!isPlainObject(terms)) {
      errors.push(`${prefix}.${workspaceType} must be an object.`);
      continue;
    }

    for (const [fieldName, value] of Object.entries(terms)) {
      if (!TERMINOLOGY_FIELDS.has(fieldName)) {
        errors.push(`${prefix}.${workspaceType}.${fieldName} is not a supported terminology field.`);
      } else if (typeof value !== "string") {
        errors.push(`${prefix}.${workspaceType}.${fieldName} must be a string.`);
      }
    }
  }
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

function requireStringArray(object, fieldName, errors, options = {}) {
  const value = object[fieldName];
  if (!Array.isArray(value) || value.length === 0 || value.some((item) => typeof item !== "string" || item.trim() === "")) {
    errors.push(`${formatFieldName(fieldName, options.prefix)} is required and must be a non-empty array of non-empty strings.`);
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

function validateRelativeUrl(value, fieldName, errors) {
  if (typeof value === "string" && /^[a-z][a-z0-9+.-]*:/i.test(value)) {
    errors.push(`${fieldName} must be relative.`);
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
