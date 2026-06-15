import { listTagPropagationResolverIds } from "../../services/tag-propagation-registry.js";

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
  "viewSurfaces",
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
  "tagPropagation",
  "searchableTypes",
  "attachableTypes",
  "help",
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
const IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;
const HELP_ID_PATTERN = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;
const HELP_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const HTTP_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);
const SETTING_FIELD_TYPES = new Set(["boolean", "text", "number", "select", "multi-select", "info"]);
const NOTIFICATION_PRIORITIES = new Set(["low", "normal", "high", "urgent"]);
const NOTIFICATION_RECIPIENT_MODES = new Set(["actor", "assignees", "workspace_admins", "explicit_users"]);
const TERMINOLOGY_WORKSPACE_TYPES = new Set(["default", "business", "personal", "family"]);
const VIEW_SURFACE_LAYOUTS = new Set(["single-column", "split-list-detail", "table-page"]);
const VIEW_SURFACE_FIELDS = new Set([
  "id",
  "moduleId",
  "viewId",
  "layout",
  "pageHeader",
  "filters",
  "indexPanel",
  "table",
  "detail",
  "modals",
  "dataSource",
  "actions",
]);
const VIEW_LABEL_FIELDS = new Set(["label", "labelKey", "title", "titleKey", "description", "descriptionKey"]);
const VIEW_PAGE_HEADER_FIELDS = new Set([...VIEW_LABEL_FIELDS, "primaryAction"]);
const VIEW_FILTER_FIELDS = new Set(["id", "field", "type", "label", "labelKey", "options", "optionsSource", "default"]);
const VIEW_INDEX_PANEL_FIELDS = new Set([...VIEW_LABEL_FIELDS, "items", "itemTitleField", "itemSubtitleField", "itemMetaFields", "emptyState"]);
const VIEW_TABLE_FIELDS = new Set(["columns", "rowActions", "emptyState", "overflow"]);
const VIEW_TABLE_COLUMN_FIELDS = new Set(["id", "field", "label", "labelKey", "formatter", "width", "widthHint", "align"]);
const VIEW_DETAIL_FIELDS = new Set([
  "header",
  "badgeRow",
  "metadataRow",
  "actionStrip",
  "summaryPanels",
  "itemForm",
  "itemRows",
  "emptyState",
]);
const VIEW_MODAL_FIELDS = new Set(["id", "label", "labelKey", "title", "titleKey", "fields", "footerActions", "actions"]);
const VIEW_FIELD_FIELDS = new Set(["id", "field", "type", "label", "labelKey", "required", "options", "optionsSource", "default"]);
const VIEW_DATA_SOURCE_FIELDS = new Set(["route", "method", "fieldBindings"]);
const VIEW_ACTION_FIELDS = new Set([
  "id",
  "label",
  "labelKey",
  "role",
  "route",
  "method",
  "confirm",
  "requiredPermissions",
  "behavior",
]);
const VIEW_ACTION_ROLES = new Set(["primary", "secondary", "destructive", "utility"]);
const CORE_PERMISSION_IDS = new Set([
  "files.view",
  "files.upload",
  "files.download",
  "files.delete",
  "files.manage_quarantine",
  "files.manage_workspace_settings",
]);
const ATTACHMENT_VISIBILITY_VALUES = new Set(["private", "workspace", "client", "public"]);
const FILE_CATEGORY_VALUES = new Set(["document", "image", "audio", "video", "archive", "spreadsheet", "presentation", "pdf", "text", "other"]);
const FILE_LIFECYCLE_EVENT_VALUES = new Set([
  "file.upload.requested",
  "file.upload.accepted",
  "file.upload.rejected",
  "file.scan.pending",
  "file.scan.passed",
  "file.scan.failed",
  "file.quarantined",
  "file.available",
  "file.downloaded",
  "file.reported",
  "file.deleted",
  "file.attachment.created",
  "file.attachment.removed",
]);
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
  validateViewSurfaces(moduleDefinition.viewSurfaces, errors);
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
  validateTagPropagationDescriptors(moduleDefinition.tagPropagation, moduleDefinition.id, errors);
  validateSearchableTypes(moduleDefinition.searchableTypes, moduleDefinition.id, errors);
  validateAttachableTypes(moduleDefinition.attachableTypes, moduleDefinition.id, errors);
  validateHelpContribution(moduleDefinition.help, {
    ownerId: moduleDefinition.id,
    ownerType: "module",
    fieldName: "help",
    errors,
  });
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
  const allTaggableTypes = new Set();
  const allAttachableTypes = new Set();
  const allPermissionIds = new Set(CORE_PERMISSION_IDS);
  const allResolverIds = new Set(listTagPropagationResolverIds());
  const allProtectedViewKeys = new Set();
  const allViewSurfaceIds = new Set();

  for (const moduleDefinition of moduleDefinitions) {
    if (moduleDefinition?.id) {
      if (seenIds.has(moduleDefinition.id)) {
        errors.push(`${moduleDefinition.id}: id must be unique.`);
      }
      seenIds.add(moduleDefinition.id);
      allModuleIds.add(moduleDefinition.id);
    }
    for (const protectedView of moduleDefinition?.protectedViews || []) {
      if (moduleDefinition?.id && protectedView?.id) {
        allProtectedViewKeys.add(`${moduleDefinition.id}:${protectedView.id}`);
      }
    }
    for (const viewSurface of moduleDefinition?.viewSurfaces || []) {
      if (viewSurface?.id) {
        if (allViewSurfaceIds.has(viewSurface.id)) {
          errors.push(`${moduleDefinition.id}: viewSurfaces id '${viewSurface.id}' is duplicated.`);
        }
        allViewSurfaceIds.add(viewSurface.id);
      }
    }
    for (const taggableType of moduleDefinition?.taggableTypes || []) {
      if (taggableType?.targetType) {
        allTaggableTypes.add(`${taggableType.moduleId || moduleDefinition.id}:${taggableType.targetType}`);
      }
    }
    for (const attachableType of moduleDefinition?.attachableTypes || []) {
      if (attachableType?.targetType) {
        const attachableKey = `${attachableType.moduleId || moduleDefinition.id}:${attachableType.targetType}`;
        if (allAttachableTypes.has(attachableKey)) {
          errors.push(`${moduleDefinition.id}: attachableTypes target '${attachableKey}' is duplicated.`);
        }
        allAttachableTypes.add(attachableKey);
      }
    }
    for (const permission of moduleDefinition?.requiredPermissions || []) {
      allPermissionIds.add(permission);
    }
    for (const permission of moduleDefinition?.permissions || []) {
      if (permission?.id) {
        allPermissionIds.add(permission.id);
      }
    }
  }

  for (const moduleDefinition of moduleDefinitions) {
    errors.push(...validateModuleManifest(moduleDefinition, allModuleIds));
    errors.push(...validateTagPropagationReferences(moduleDefinition, {
      allModuleIds,
      allResolverIds,
      allTaggableTypes,
    }));
    errors.push(...validateAttachableTypeReferences(moduleDefinition, {
      allModuleIds,
      allPermissionIds,
    }));
    errors.push(...validateViewSurfaceReferences(moduleDefinition, {
      allModuleIds,
      allPermissionIds,
      allProtectedViewKeys,
    }));
  }

  const propagationIds = moduleDefinitions.flatMap((moduleDefinition) => (
    moduleDefinition?.tagPropagation || []
  ).map((descriptor) => descriptor?.id).filter(Boolean));
  assertUniqueHelpValues("tagPropagation id", propagationIds, errors);

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

function validateViewSurfaces(viewSurfaces, errors) {
  optionalArrayOfObjects(viewSurfaces, "viewSurfaces", errors, (surface, index) => {
    const prefix = `viewSurfaces[${index}]`;

    validateKnownObjectFields(surface, VIEW_SURFACE_FIELDS, prefix, errors);
    requireString(surface, "id", errors, { prefix });
    requireString(surface, "moduleId", errors, { prefix });
    requireString(surface, "viewId", errors, { prefix });
    requireString(surface, "layout", errors, { prefix });
    if (typeof surface.layout === "string" && !VIEW_SURFACE_LAYOUTS.has(surface.layout)) {
      errors.push(`${prefix}.layout must be single-column, split-list-detail, or table-page.`);
    }
    validateDataSourceDescriptor(surface.dataSource, `${prefix}.dataSource`, errors, { required: true });
    validatePageHeaderDescriptor(surface.pageHeader, `${prefix}.pageHeader`, errors);
    validateFiltersDescriptor(surface.filters, `${prefix}.filters`, errors);
    validateIndexPanelDescriptor(surface.indexPanel, `${prefix}.indexPanel`, errors);
    validateTableDescriptor(surface.table, `${prefix}.table`, errors);
    validateDetailDescriptor(surface.detail, `${prefix}.detail`, errors);
    validateModalsDescriptor(surface.modals, `${prefix}.modals`, errors);
    validateActionsDescriptor(surface.actions, `${prefix}.actions`, errors);
  });
}

function validateViewSurfaceReferences(moduleDefinition, context) {
  const errors = [];
  const moduleLabel = moduleDefinition?.id || moduleDefinition?.name || "<unknown>";
  const descriptors = Array.isArray(moduleDefinition?.viewSurfaces) ? moduleDefinition.viewSurfaces : [];

  descriptors.forEach((surface, index) => {
    const prefix = `viewSurfaces[${index}]`;
    const surfaceModuleId = surface?.moduleId || moduleDefinition?.id;

    if (surface?.moduleId && !context.allModuleIds.has(surface.moduleId)) {
      errors.push(`${moduleLabel}: ${prefix}.moduleId references unknown module '${surface.moduleId}'.`);
    }
    if (surfaceModuleId && surface?.viewId && !context.allProtectedViewKeys.has(`${surfaceModuleId}:${surface.viewId}`)) {
      errors.push(`${moduleLabel}: ${prefix}.viewId references unknown protected view '${surfaceModuleId}:${surface.viewId}'.`);
    }
    validateViewRouteReference(surface?.dataSource?.route, `${prefix}.dataSource.route`, moduleLabel, errors);
    validateViewMethodReference(surface?.dataSource?.method, `${prefix}.dataSource.method`, moduleLabel, errors);

    for (const { action, prefix: actionPrefix } of listViewSurfaceActions(surface, prefix)) {
      validateViewActionReference(action, actionPrefix, moduleLabel, context, errors);
    }
  });

  return errors;
}

function listViewSurfaceActions(surface, prefix) {
  const actions = [];
  if (surface?.pageHeader?.primaryAction) {
    actions.push({ action: surface.pageHeader.primaryAction, prefix: `${prefix}.pageHeader.primaryAction` });
  }
  collectActionArray(surface?.actions, `${prefix}.actions`, actions);
  collectActionArray(surface?.table?.rowActions, `${prefix}.table.rowActions`, actions);
  for (const [modalIndex, modal] of (Array.isArray(surface?.modals) ? surface.modals : []).entries()) {
    collectActionArray(modal?.footerActions, `${prefix}.modals[${modalIndex}].footerActions`, actions);
    collectActionArray(modal?.actions, `${prefix}.modals[${modalIndex}].actions`, actions);
  }
  return actions;
}

function collectActionArray(actionArray, prefix, actions) {
  if (!Array.isArray(actionArray)) {
    return;
  }
  actionArray.forEach((action, index) => {
    actions.push({ action, prefix: `${prefix}[${index}]` });
  });
}

function validateViewActionReference(action, prefix, moduleLabel, context, errors) {
  if (!isPlainObject(action)) {
    return;
  }
  if (action.role && !VIEW_ACTION_ROLES.has(action.role)) {
    errors.push(`${moduleLabel}: ${prefix}.role must be primary, secondary, destructive, or utility.`);
  }
  validateViewRouteReference(action.route, `${prefix}.route`, moduleLabel, errors);
  validateViewMethodReference(action.method, `${prefix}.method`, moduleLabel, errors);
  for (const permissionId of action.requiredPermissions || []) {
    if (!context.allPermissionIds.has(permissionId)) {
      errors.push(`${moduleLabel}: ${prefix}.requiredPermissions references unknown permission '${permissionId}'.`);
    }
  }
}

function validateViewRouteReference(route, prefix, moduleLabel, errors) {
  if (route === undefined) {
    return;
  }
  if (typeof route !== "string" || route.trim() === "") {
    return;
  }
  const routeErrors = [];
  validateRelativeUrl(route, prefix, routeErrors);
  if (!route.startsWith("/")) {
    routeErrors.push(`${prefix} must be a local route path.`);
  }
  for (const error of routeErrors) {
    errors.push(`${moduleLabel}: ${error}`);
  }
}

function validateViewMethodReference(method, prefix, moduleLabel, errors) {
  if (method === undefined) {
    return;
  }
  if (typeof method === "string" && !HTTP_METHODS.has(method)) {
    errors.push(`${moduleLabel}: ${prefix} must be a supported HTTP method.`);
  }
}

function validatePageHeaderDescriptor(pageHeader, prefix, errors) {
  if (pageHeader === undefined) {
    return;
  }
  if (!isPlainObject(pageHeader)) {
    errors.push(`${prefix} must be an object.`);
    return;
  }
  validateKnownObjectFields(pageHeader, VIEW_PAGE_HEADER_FIELDS, prefix, errors);
  validateLabelDescriptor(pageHeader, prefix, errors);
  if (pageHeader.primaryAction !== undefined) {
    validateActionDescriptor(pageHeader.primaryAction, `${prefix}.primaryAction`, errors);
  }
}

function validateFiltersDescriptor(filters, prefix, errors) {
  optionalArrayOfObjects(filters, prefix, errors, (filter, index) => {
    const filterPrefix = `${prefix}[${index}]`;
    validateKnownObjectFields(filter, VIEW_FILTER_FIELDS, filterPrefix, errors);
    requireString(filter, "field", errors, { prefix: filterPrefix });
    requireString(filter, "type", errors, { prefix: filterPrefix });
    validateLabelDescriptor(filter, filterPrefix, errors);
    optionalArray(filter, "options", errors);
    optionalString(filter, "optionsSource", errors, { prefix: filterPrefix });
  });
}

function validateIndexPanelDescriptor(indexPanel, prefix, errors) {
  if (indexPanel === undefined) {
    return;
  }
  if (!isPlainObject(indexPanel)) {
    errors.push(`${prefix} must be an object.`);
    return;
  }
  validateKnownObjectFields(indexPanel, VIEW_INDEX_PANEL_FIELDS, prefix, errors);
  validateLabelDescriptor(indexPanel, prefix, errors);
  optionalString(indexPanel, "items", errors, { prefix });
  optionalString(indexPanel, "itemTitleField", errors, { prefix });
  optionalString(indexPanel, "itemSubtitleField", errors, { prefix });
  optionalStringArray(indexPanel, "itemMetaFields", errors, { prefix });
  optionalPlainObject(indexPanel, "emptyState", errors, { prefix });
}

function validateTableDescriptor(table, prefix, errors) {
  if (table === undefined) {
    return;
  }
  if (!isPlainObject(table)) {
    errors.push(`${prefix} must be an object.`);
    return;
  }
  validateKnownObjectFields(table, VIEW_TABLE_FIELDS, prefix, errors);
  optionalArrayOfObjects(table.columns, `${prefix}.columns`, errors, (column, index) => {
    const columnPrefix = `${prefix}.columns[${index}]`;
    validateKnownObjectFields(column, VIEW_TABLE_COLUMN_FIELDS, columnPrefix, errors);
    requireString(column, "field", errors, { prefix: columnPrefix });
    validateLabelDescriptor(column, columnPrefix, errors);
    optionalString(column, "formatter", errors, { prefix: columnPrefix });
    optionalString(column, "width", errors, { prefix: columnPrefix });
    optionalString(column, "widthHint", errors, { prefix: columnPrefix });
    optionalString(column, "align", errors, { prefix: columnPrefix });
  });
  validateActionsDescriptor(table.rowActions, `${prefix}.rowActions`, errors);
  optionalPlainObject(table, "emptyState", errors, { prefix });
  optionalBoolean(table, "overflow", errors, { prefix });
}

function validateDetailDescriptor(detail, prefix, errors) {
  if (detail === undefined) {
    return;
  }
  if (!isPlainObject(detail)) {
    errors.push(`${prefix} must be an object.`);
    return;
  }
  validateKnownObjectFields(detail, VIEW_DETAIL_FIELDS, prefix, errors);
  for (const fieldName of ["header", "badgeRow", "metadataRow", "actionStrip", "itemForm", "itemRows", "emptyState"]) {
    optionalPlainObject(detail, fieldName, errors, { prefix });
  }
  optionalArrayOfObjects(detail.summaryPanels, `${prefix}.summaryPanels`, errors, (panel, panelIndex) => {
    const panelPrefix = `${prefix}.summaryPanels[${panelIndex}]`;
    validateKnownObjectFields(panel, VIEW_LABEL_FIELDS, panelPrefix, errors);
    validateLabelDescriptor(panel, panelPrefix, errors);
  });
}

function validateModalsDescriptor(modals, prefix, errors) {
  optionalArrayOfObjects(modals, prefix, errors, (modal, index) => {
    const modalPrefix = `${prefix}[${index}]`;
    validateKnownObjectFields(modal, VIEW_MODAL_FIELDS, modalPrefix, errors);
    requireString(modal, "id", errors, { prefix: modalPrefix });
    validateLabelDescriptor(modal, modalPrefix, errors);
    optionalArrayOfObjects(modal.fields, `${modalPrefix}.fields`, errors, (field, fieldIndex) => {
      const fieldPrefix = `${modalPrefix}.fields[${fieldIndex}]`;
      validateKnownObjectFields(field, VIEW_FIELD_FIELDS, fieldPrefix, errors);
      requireString(field, "field", errors, { prefix: fieldPrefix });
      requireString(field, "type", errors, { prefix: fieldPrefix });
      validateLabelDescriptor(field, fieldPrefix, errors);
      optionalBoolean(field, "required", errors, { prefix: fieldPrefix });
      optionalArray(field, "options", errors);
      optionalString(field, "optionsSource", errors, { prefix: fieldPrefix });
    });
    validateActionsDescriptor(modal.footerActions, `${modalPrefix}.footerActions`, errors);
    validateActionsDescriptor(modal.actions, `${modalPrefix}.actions`, errors);
  });
}

function validateDataSourceDescriptor(dataSource, prefix, errors, options = {}) {
  if (dataSource === undefined) {
    if (options.required) {
      errors.push(`${prefix} is required and must be an object.`);
    }
    return;
  }
  if (!isPlainObject(dataSource)) {
    errors.push(`${prefix} must be an object.`);
    return;
  }
  validateKnownObjectFields(dataSource, VIEW_DATA_SOURCE_FIELDS, prefix, errors);
  requireString(dataSource, "route", errors, { prefix });
  optionalString(dataSource, "method", errors, { prefix });
  if (!isPlainObject(dataSource.fieldBindings)) {
    errors.push(`${prefix}.fieldBindings is required and must be an object.`);
    return;
  }
  for (const [fieldName, value] of Object.entries(dataSource.fieldBindings)) {
    if (typeof value !== "string" || value.trim() === "") {
      errors.push(`${prefix}.fieldBindings.${fieldName} must be a non-empty string.`);
    }
  }
}

function validateActionsDescriptor(actions, prefix, errors) {
  optionalArrayOfObjects(actions, prefix, errors, (action, index) => {
    validateActionDescriptor(action, `${prefix}[${index}]`, errors);
  });
}

function validateActionDescriptor(action, prefix, errors) {
  if (!isPlainObject(action)) {
    errors.push(`${prefix} must be an object.`);
    return;
  }
  validateKnownObjectFields(action, VIEW_ACTION_FIELDS, prefix, errors);
  requireString(action, "id", errors, { prefix });
  validateLabelDescriptor(action, prefix, errors);
  optionalString(action, "role", errors, { prefix });
  optionalString(action, "route", errors, { prefix });
  optionalString(action, "method", errors, { prefix });
  optionalString(action, "behavior", errors, { prefix });
  optionalStringArray(action, "requiredPermissions", errors, { prefix });
  optionalPlainObject(action, "confirm", errors, { prefix });
}

function validateLabelDescriptor(object, prefix, errors) {
  for (const fieldName of VIEW_LABEL_FIELDS) {
    optionalString(object, fieldName, errors, { prefix });
  }
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
    optionalStringArray(item, "workspaceTypes", errors, { prefix: `apiScopes[${index}]` });
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

function validateTagPropagationDescriptors(tagPropagation, moduleId, errors) {
  optionalArrayOfObjects(tagPropagation, "tagPropagation", errors, (item, index) => {
    const prefix = `tagPropagation[${index}]`;

    requireString(item, "id", errors, { prefix });
    requireString(item, "sourceModuleId", errors, { prefix });
    requireString(item, "sourceTargetType", errors, { prefix });
    requireString(item, "targetModuleId", errors, { prefix });
    requireString(item, "targetType", errors, { prefix });
    requireString(item, "relationshipResolver", errors, { prefix });
    requireString(item, "workspaceField", errors, { prefix, pattern: IDENTIFIER_PATTERN });
    requireString(item, "sourceReadPermission", errors, { prefix });
    requireString(item, "targetReadPermission", errors, { prefix });
    requireString(item, "targetTagPermission", errors, { prefix });
    optionalStringArray(item, "requiredModules", errors, { prefix });
    optionalBoolean(item, "snapshotOnCreate", errors, { prefix });
    optionalBoolean(item, "propagateOnParentChange", errors, { prefix });
    optionalBoolean(item, "propagateOnRelationshipChange", errors, { prefix });
    validateTerminology(item.terminology, `${prefix}.terminology`, errors);

    if (item.sourceModuleId !== undefined && item.sourceModuleId !== moduleId && item.targetModuleId !== moduleId) {
      errors.push(`${prefix} must declare this module as sourceModuleId or targetModuleId.`);
    }
  });
}

function validateTagPropagationReferences(moduleDefinition, context) {
  const errors = [];
  const descriptors = Array.isArray(moduleDefinition?.tagPropagation) ? moduleDefinition.tagPropagation : [];

  descriptors.forEach((descriptor, index) => {
    const prefix = `tagPropagation[${index}]`;
    const moduleLabel = moduleDefinition?.id || moduleDefinition?.name || "<unknown>";

    if (descriptor?.sourceModuleId && !context.allModuleIds.has(descriptor.sourceModuleId)) {
      errors.push(`${moduleLabel}: ${prefix}.sourceModuleId references unknown module '${descriptor.sourceModuleId}'.`);
    }
    if (descriptor?.targetModuleId && !context.allModuleIds.has(descriptor.targetModuleId)) {
      errors.push(`${moduleLabel}: ${prefix}.targetModuleId references unknown module '${descriptor.targetModuleId}'.`);
    }
    if (descriptor?.sourceModuleId && descriptor?.sourceTargetType) {
      const sourceKey = `${descriptor.sourceModuleId}:${descriptor.sourceTargetType}`;
      if (!context.allTaggableTypes.has(sourceKey)) {
        errors.push(`${moduleLabel}: ${prefix}.sourceTargetType references unknown taggable type '${sourceKey}'.`);
      }
    }
    if (descriptor?.targetModuleId && descriptor?.targetType) {
      const targetKey = `${descriptor.targetModuleId}:${descriptor.targetType}`;
      if (!context.allTaggableTypes.has(targetKey)) {
        errors.push(`${moduleLabel}: ${prefix}.targetType references unknown taggable type '${targetKey}'.`);
      }
    }
    if (descriptor?.relationshipResolver && !context.allResolverIds.has(descriptor.relationshipResolver)) {
      errors.push(`${moduleLabel}: ${prefix}.relationshipResolver references unknown resolver '${descriptor.relationshipResolver}'.`);
    }
  });

  return errors;
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

function validateAttachableTypes(attachableTypes, moduleId, errors) {
  optionalArrayOfObjects(attachableTypes, "attachableTypes", errors, (item, index) => {
    const prefix = `attachableTypes[${index}]`;

    requireString(item, "targetType", errors, { prefix });
    validateModuleIdValue(item, "moduleId", moduleId, errors, { prefix });
    requireString(item, "label", errors, { prefix });
    requireString(item, "description", errors, { prefix });
    requireString(item, "tableName", errors, { prefix, pattern: IDENTIFIER_PATTERN });
    requireString(item, "idField", errors, { prefix, pattern: IDENTIFIER_PATTERN });
    requireString(item, "labelField", errors, { prefix, pattern: IDENTIFIER_PATTERN });
    requireString(item, "workspaceField", errors, { prefix, pattern: IDENTIFIER_PATTERN });
    optionalString(item, "clientField", errors, { prefix, pattern: IDENTIFIER_PATTERN });
    optionalString(item, "projectField", errors, { prefix, pattern: IDENTIFIER_PATTERN });
    requireString(item, "requiredReadPermission", errors, { prefix });
    requireString(item, "requiredAttachPermission", errors, { prefix });
    optionalString(item, "requiredRemovePermission", errors, { prefix });
    optionalStringArray(item, "allowedFileCategories", errors, { prefix });
    optionalStringArray(item, "allowedVisibilityValues", errors, { prefix });
    optionalStringArray(item, "lifecycleEvents", errors, { prefix });
    optionalNumber(item, "maxFilesPerRecord", errors, { prefix });
    optionalNumber(item, "maxFileSizeBytes", errors, { prefix });
    optionalStringArray(item, "requiredModules", errors, { prefix });
    optionalStringArray(item, "workspaceTypes", errors, { prefix });
    validateTerminology(item.terminology, `${prefix}.terminology`, errors);

    for (const category of item.allowedFileCategories || []) {
      if (!FILE_CATEGORY_VALUES.has(category)) {
        errors.push(`${prefix}.allowedFileCategories contains unsupported category '${category}'.`);
      }
    }
    for (const visibility of item.allowedVisibilityValues || []) {
      if (!ATTACHMENT_VISIBILITY_VALUES.has(visibility)) {
        errors.push(`${prefix}.allowedVisibilityValues contains unsupported visibility '${visibility}'.`);
      }
    }
    for (const eventName of item.lifecycleEvents || []) {
      if (!FILE_LIFECYCLE_EVENT_VALUES.has(eventName)) {
        errors.push(`${prefix}.lifecycleEvents contains invalid hook name '${eventName}'.`);
      }
    }
    if (item.maxFilesPerRecord !== undefined && item.maxFilesPerRecord < 1) {
      errors.push(`${prefix}.maxFilesPerRecord must be at least 1.`);
    }
    if (item.maxFileSizeBytes !== undefined && item.maxFileSizeBytes < 1) {
      errors.push(`${prefix}.maxFileSizeBytes must be at least 1.`);
    }
  });
}

function validateAttachableTypeReferences(moduleDefinition, context) {
  const errors = [];
  const descriptors = Array.isArray(moduleDefinition?.attachableTypes) ? moduleDefinition.attachableTypes : [];

  descriptors.forEach((descriptor, index) => {
    const prefix = `attachableTypes[${index}]`;
    const moduleLabel = moduleDefinition?.id || moduleDefinition?.name || "<unknown>";

    if (descriptor?.moduleId && !context.allModuleIds.has(descriptor.moduleId)) {
      errors.push(`${moduleLabel}: ${prefix}.moduleId references unknown module '${descriptor.moduleId}'.`);
    }
    for (const fieldName of ["requiredReadPermission", "requiredAttachPermission", "requiredRemovePermission"]) {
      const permissionId = descriptor?.[fieldName];
      if (permissionId && !context.allPermissionIds.has(permissionId)) {
        errors.push(`${moduleLabel}: ${prefix}.${fieldName} references unknown permission '${permissionId}'.`);
      }
    }
  });

  return errors;
}

function validateHelpContribution(help, options = {}) {
  const {
    ownerId = "",
    ownerType = "module",
    fieldName = "help",
    errors = [],
  } = options;

  if (help === undefined) {
    return errors;
  }

  if (!isPlainObject(help)) {
    errors.push(`${fieldName} must be an object.`);
    return errors;
  }

  optionalArrayOfObjects(help.sections, `${fieldName}.sections`, errors, (section, index) => {
    const prefix = `${fieldName}.sections[${index}]`;

    requireString(section, "id", errors, { prefix, pattern: HELP_ID_PATTERN });
    validateHelpOwner(section, ownerId, ownerType, errors, prefix);
    requireString(section, "title", errors, { prefix });
    optionalString(section, "description", errors, { prefix });
    optionalNumber(section, "sortOrder", errors, { prefix });
    optionalString(section, "audience", errors, { prefix });
    optionalStringArray(section, "tags", errors, { prefix });
    optionalStringArray(section, "requiredPermissions", errors, { prefix });
    optionalStringArray(section, "requiredWorkspaceCapabilities", errors, { prefix });
    optionalStringArray(section, "requiredModules", errors, { prefix });
    validateTerminology(section.terminology, `${prefix}.terminology`, errors);
  });

  optionalArrayOfObjects(help.articles, `${fieldName}.articles`, errors, (article, index) => {
    const prefix = `${fieldName}.articles[${index}]`;

    requireString(article, "id", errors, { prefix, pattern: HELP_ID_PATTERN });
    validateHelpOwner(article, ownerId, ownerType, errors, prefix);
    optionalString(article, "slug", errors, { prefix });
    if (typeof article.slug === "string" && !HELP_SLUG_PATTERN.test(article.slug)) {
      errors.push(`${prefix}.slug has an invalid format.`);
    }
    optionalString(article, "sectionId", errors, { prefix });
    requireString(article, "title", errors, { prefix });
    optionalString(article, "summary", errors, { prefix });
    optionalString(article, "description", errors, { prefix });
    optionalString(article, "body", errors, { prefix });
    optionalString(article, "contentPath", errors, { prefix });
    optionalNumber(article, "sortOrder", errors, { prefix });
    optionalString(article, "audience", errors, { prefix });
    optionalStringArray(article, "tags", errors, { prefix });
    optionalStringArray(article, "relatedArticleIds", errors, { prefix });
    optionalStringArray(article, "requiredPermissions", errors, { prefix });
    optionalStringArray(article, "requiredWorkspaceCapabilities", errors, { prefix });
    optionalStringArray(article, "requiredModules", errors, { prefix });
    validateTerminology(article.terminology, `${prefix}.terminology`, errors);

    if (!article.summary && !article.description) {
      errors.push(`${prefix} must include summary or description.`);
    }
    if (!article.body && !article.contentPath) {
      errors.push(`${prefix} must include body or contentPath.`);
    }
    if (article.contentPath !== undefined) {
      validateSafeRelativePath(article.contentPath, `${prefix}.contentPath`, errors);
      if (typeof article.contentPath === "string" && !article.contentPath.toLowerCase().endsWith(".md")) {
        errors.push(`${prefix}.contentPath must point to a Markdown file.`);
      }
    }
  });

  validateHelpUniqueness(help, fieldName, errors);
  validateHelpArticleSections(help, fieldName, errors);

  return errors;
}

function validateHelpOwner(item, ownerId, ownerType, errors, prefix) {
  optionalString(item, "ownerType", errors, { prefix });

  if (item.ownerType !== undefined && item.ownerType !== ownerType) {
    errors.push(`${prefix}.ownerType must be ${ownerType}.`);
  }

  if (ownerType === "module") {
    validateModuleIdValue(item, "moduleId", ownerId, errors, { prefix });
    return;
  }

  optionalString(item, "moduleId", errors, { prefix });
  if (item.moduleId) {
    errors.push(`${prefix}.moduleId must not be set for framework-owned help.`);
  }
}

function validateHelpUniqueness(help, fieldName, errors) {
  const sections = Array.isArray(help.sections) ? help.sections : [];
  const articles = Array.isArray(help.articles) ? help.articles : [];

  assertUniqueHelpValues(
    `${fieldName}.sections`,
    sections.map((section) => section.id),
    errors,
  );
  assertUniqueHelpValues(
    `${fieldName}.articles`,
    articles.map((article) => article.id),
    errors,
  );
  assertUniqueHelpValues(
    `${fieldName}.articles slug`,
    articles.map((article) => article.slug),
    errors,
  );
  assertUniqueHelpValues(
    `${fieldName}.articles contentPath`,
    articles.map((article) => article.contentPath),
    errors,
  );
}

function validateHelpArticleSections(help, fieldName, errors) {
  const sections = Array.isArray(help.sections) ? help.sections : [];
  const articles = Array.isArray(help.articles) ? help.articles : [];
  const sectionIds = new Set(sections.map((section) => section.id));

  articles.forEach((article, index) => {
    if (article.sectionId && !sectionIds.has(article.sectionId)) {
      errors.push(`${fieldName}.articles[${index}].sectionId references unknown help section '${article.sectionId}'.`);
    }
  });
}

function assertUniqueHelpValues(label, values, errors) {
  const seen = new Set();

  for (const value of values.filter(Boolean)) {
    if (seen.has(value)) {
      errors.push(`${label} '${value}' is duplicated.`);
    }
    seen.add(value);
  }
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

function validateKnownObjectFields(object, allowedFields, prefix, errors) {
  for (const fieldName of Object.keys(object)) {
    if (!allowedFields.has(fieldName)) {
      errors.push(`${prefix}.${fieldName} is not a supported field.`);
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
    return;
  }
  if (value !== undefined && options.pattern && !options.pattern.test(value)) {
    errors.push(`${formatFieldName(fieldName, options.prefix)} has an invalid format.`);
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

function validateSafeRelativePath(value, fieldName, errors) {
  validateRelativeUrl(value, fieldName, errors);

  if (typeof value !== "string") {
    return;
  }

  const normalized = value.replaceAll("\\", "/").trim();
  if (!normalized || normalized.startsWith("/") || normalized.startsWith("//") || normalized.split("/").includes("..")) {
    errors.push(`${fieldName} must be a safe relative path.`);
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
  validateHelpContribution,
  validateModuleManifest,
  validateModuleManifests,
};
