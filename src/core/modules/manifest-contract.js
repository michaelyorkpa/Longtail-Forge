import { config } from "../../config.js";
import { listTagPropagationResolverIds } from "../../services/tag-propagation-registry.js";
import { listFrameworkSettingDefinitions } from "../settings/framework-settings-registry.js";
import { LINKED_CONTEXT_TARGET_RESPONSE_CONTRACT } from "../linked-context/provider-contract.js";
import { listFrameworkPermissionIds } from "../permissions/framework-permission-catalog.js";
import { getPublicDemoCapability } from "../public-demo-capabilities.js";

/** @typedef {Record<string, unknown>} ManifestObject */
/** @typedef {import("../../types/framework-contracts.js").ModuleManifest} ModuleManifest */
/** @typedef {import("../../types/framework-contracts.js").ModuleSettingDefinition} ModuleSettingDefinition */
/** @typedef {Partial<ModuleSettingDefinition> & ManifestObject} ModuleSettingCandidate */
/** @typedef {import("../../types/framework-contracts.js").ViewSurfaceDescriptor} ViewSurfaceDescriptor */
/** @typedef {Partial<ModuleManifest> & ManifestObject} ManifestCandidate */
/** @typedef {{ prefix?: string, pattern?: RegExp, nullable?: boolean }} ValidationOptions */
/** @typedef {(item: ManifestObject, index: number) => void} ManifestObjectValidator */
/**
 * @typedef {object} ManifestReferenceContext
 * @property {Set<string>} allModuleIds
 * @property {Set<string>} allPermissionIds
 * @property {Set<string>} allProtectedViewKeys
 * @property {Set<string>} allResolverIds
 * @property {Set<string>} allTaggableTypes
 * @property {Set<string>} frameworkSettingIds
 */

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
  "linkedContextProviders",
  "taggableTypes",
  "tagPropagation",
  "searchableTypes",
  "attachableTypes",
  "protectedContentConsumers",
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
const SETTING_BEHAVIOR_ID_PATTERN = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*(?:\.[A-Za-z_][A-Za-z0-9_]*)+$/;
const HELP_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const HTTP_METHODS = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);
const SETTING_FIELD_TYPES = new Set(["boolean", "toggle", "text", "textarea", "number", "select", "multi-select", "radio", "info"]);
const SETTING_PLACEMENTS = new Set(["workspace", "user", "module", "new-workspace"]);
const SETTING_TARGETS = new Set(["module", "framework"]);
const SETTING_VISIBLE_WHEN_FIELDS = new Set(["settingId", "equals"]);
const SETTINGS_CONTRIBUTION_FIELDS = new Set([
  "id",
  "label",
  "type",
  "placement",
  "target",
  "protected",
  "ownerOnly",
  "readOnly",
  "description",
  "placeholder",
  "inputmode",
  "readOnlyReason",
  "disabledReason",
  "requiredPermissions",
  "requiredWorkspaceCapabilities",
  "requiresEnabledModules",
  "requiredModules",
  "handler",
  "onChangeEffect",
  "options",
  "min",
  "max",
  "step",
  "rows",
  "spellcheck",
  "default",
  "visibleWhen",
  "required",
  "moduleStatus",
  "terminology",
]);
const VIEW_FIELD_TYPES = new Set([
  "text",
  "number",
  "select",
  "multi-select",
  "boolean",
  "checkbox",
  "toggle",
  "switch",
  "radio",
  "textarea",
  "date",
  "time",
  "hidden",
  "search",
  "url",
]);
const NOTIFICATION_PRIORITIES = new Set(["low", "normal", "high", "urgent"]);
const NOTIFICATION_RECIPIENT_MODES = new Set(["actor", "assignees", "workspace_admins", "explicit_users"]);
const TERMINOLOGY_WORKSPACE_TYPES = new Set(["default", "business", "personal", "family"]);
const DASHBOARD_PLACEMENTS = new Set(["pulse", "attention", "calendar", "today", "main", "activity", "secondary"]);
const REPORTING_HOST_ASSET_TARGET = "framework:reporting";
const REPORTING_FILTER_TYPES = new Set([
  "billing-period",
  "custom-date-range",
  "scope",
  "project-multi-select",
  "tag",
  "boolean",
]);
const REPORTING_CONTRIBUTION_FIELDS = new Set([
  "id",
  "moduleId",
  "label",
  "description",
  "category",
  "renderer",
  "runner",
  "requiredPermissions",
  "requiredWorkspaceCapabilities",
  "requiresEnabledModules",
  "sortOrder",
  "filters",
  "browserAssetIds",
]);
const REPORTING_FILTER_FIELDS = new Set([
  "id",
  "label",
  "type",
  "queryKeys",
  "defaultValue",
  "required",
  "visibleWhen",
]);
const REPORTING_FILTER_VISIBLE_WHEN_FIELDS = new Set(["filterId", "equals"]);
const VIEW_SURFACE_LAYOUTS = new Set(["single-column", "stacked", "sidebar-detail", "slide-out-sidebar", "table-page"]);
const VIEW_FILTER_PLACEMENTS = new Set(["inline", "slide-out-sidebar"]);
const VIEW_SIDEBAR_PANEL_TYPES = new Set(["filters", "navigation", "index"]);
const VIEW_SURFACE_FIELDS = new Set([
  "id",
  "moduleId",
  "viewId",
  "layout",
  "filterPlacement",
  "pageHeader",
  "sidebarLabel",
  "sidebarPanels",
  "filters",
  "indexPanel",
  "table",
  "detail",
  "modals",
  "dataSource",
  "actions",
  "regions",
]);
const VIEW_LABEL_FIELDS = new Set(["label", "labelKey", "title", "titleKey", "description", "descriptionKey"]);
const VIEW_PAGE_HEADER_FIELDS = new Set([...VIEW_LABEL_FIELDS, "primaryAction"]);
const VIEW_FILTER_FIELDS = new Set(["id", "field", "type", "label", "labelKey", "options", "optionsSource", "default", "queryKey"]);
const VIEW_REGION_FIELDS = new Set([...VIEW_LABEL_FIELDS, "id", "behavior", "placement", "className", "ariaLabel"]);
const VIEW_SIDEBAR_PANEL_FIELDS = new Set([...VIEW_LABEL_FIELDS, "id", "type", "behavior", "collapsible", "open", "emptyState", "className", "ariaLabel", "footer"]);
const VIEW_SIDEBAR_PANEL_FOOTER_FIELDS = new Set([...VIEW_LABEL_FIELDS, "id", "behavior", "className", "ariaLabel"]);
const VIEW_CHIP_FIELDS = new Set(["field", "label", "labelKey"]);
const VIEW_VISIBLE_WHEN_FIELDS = new Set(["field", "equals", "in", "truthy", "falsy"]);
const VIEW_INDEX_PANEL_FIELDS = new Set([...VIEW_LABEL_FIELDS, "items", "itemTitleField", "itemSubtitleField", "itemMetaFields", "itemDepthField", "itemParentField", "itemPathField", "emptyState", "initialSelection", "collapseOnSelect"]);
const VIEW_TABLE_FIELDS = new Set(["columns", "secondaryRows", "rowActions", "rowActionsHeaderLabel", "emptyState", "overflow", "hierarchy", "selection"]);
const VIEW_TABLE_HIERARCHY_FIELDS = new Set(["depthField", "parentField", "pathField"]);
const VIEW_TABLE_SELECTION_FIELDS = new Set(["enabled", "label", "labelKey", "headerLabel", "recordType", "labelField"]);
const VIEW_TABLE_COLUMN_FIELDS = new Set(["id", "field", "label", "labelKey", "formatter", "width", "widthHint", "align", "depthField", "chipsField", "chipLabelField"]);
const VIEW_TABLE_SECONDARY_ROW_FIELDS = new Set([...VIEW_LABEL_FIELDS, "id", "field", "formatter", "chipsField", "chipLabelField", "startColumn", "endBeforeColumn", "hideWhenEmpty", "className"]);
const VIEW_TABLE_COLUMN_FORMATTERS = new Set(["text", "hierarchy-label", "chip-list"]);
const VIEW_DETAIL_FIELDS = new Set([
  "header",
  "badgeRow",
  "metadataRow",
  "actionStrip",
  "summaryPanels",
  "linkedRecords",
  "itemForm",
  "itemRows",
  "emptyState",
  "regions",
]);
const VIEW_SUMMARY_PANEL_FIELDS = new Set([...VIEW_LABEL_FIELDS, "messageField", "items"]);
const VIEW_SUMMARY_PANEL_ITEM_FIELDS = new Set(["label", "field", "value"]);
const VIEW_MODAL_FIELDS = new Set(["id", "label", "labelKey", "title", "titleKey", "size", "fields", "footerActions", "actions"]);
const VIEW_FIELD_FIELDS = new Set([
  "id",
  "field",
  "type",
  "label",
  "labelKey",
  "required",
  "options",
  "optionsSource",
  "default",
  "placeholder",
  "min",
  "max",
  "step",
  "inputmode",
  "rows",
  "autocomplete",
  "placement",
  "behavior",
  "hidden",
  "width",
]);
const VIEW_ITEM_ROWS_FIELDS = new Set([
  "itemsField",
  "columns",
  "actions",
  "emptyState",
  "itemTitleField",
  "itemSubtitleField",
  "chips",
  "metaFields",
  "rowActions",
  "actionsLabel",
]);
const VIEW_ITEM_ROW_COLUMN_FIELDS = new Set(["id", "field", "label", "labelKey", "type", "formatter"]);
const VIEW_LINKED_RECORDS_FIELDS = new Set([
  "title",
  "label",
  "recordsField",
  "targetTypeField",
  "targetLabelField",
  "targetUrlField",
  "targetIdField",
  "emptyState",
  "fields",
  "actions",
]);
const VIEW_DATA_SOURCE_FIELDS = new Set(["route", "method", "recordsKey", "fieldBindings"]);
const VIEW_ACTION_FIELDS = new Set([
  "publicDemoCapability",
  "id",
  "label",
  "labelKey",
  "role",
  "icon",
  "iconOnly",
  "title",
  "route",
  "method",
  "confirm",
  "requiredPermissions",
  "behavior",
  "visibleWhen",
]);
const VIEW_ACTION_ROLES = new Set(["primary", "secondary", "destructive", "utility"]);
const LINKED_CONTEXT_PROVIDER_FIELDS = new Set([
  "id",
  "moduleId",
  "targetType",
  "label",
  "description",
  "provider",
  "responseContract",
  "requiredReadPermission",
  "requiredPermissions",
  "requiredModules",
  "requiredWorkspaceCapabilities",
  "workspaceTypes",
  "terminology",
]);
const CORE_PERMISSION_IDS = new Set([
  "files.view",
  "files.upload",
  "files.download",
  "files.delete",
  "files.manage_quarantine",
  "files.manage_workspace_settings",
  ...listFrameworkPermissionIds(),
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
  "file.attachment.context_updated",
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

/**
 * @param {unknown} moduleDefinition
 * @param {Set<string>} [allModuleIds]
 */
function validateModuleManifest(moduleDefinition, allModuleIds = new Set()) {
  /**
 * @type {string[]}
 */
  const errors = [];
  if (!isPlainObject(moduleDefinition)) {
    return ["Module manifest must be a plain object."];
  }

  const manifest = /** @type {ManifestCandidate} */ (moduleDefinition);
  const moduleLabel = manifest.id || manifest.name || "<unknown>";

  validateKnownFields(manifest, errors);
  requireString(manifest, "id", errors, { pattern: MODULE_ID_PATTERN });
  requireString(manifest, "name", errors);
  requireString(manifest, "displayName", errors);
  requireString(manifest, "description", errors);
  validateTerminology(manifest.terminology, "terminology", errors);
  requireString(manifest, "category", errors);
  requireString(manifest, "version", errors);
  requireBoolean(manifest, "enabledByDefault", errors);
  optionalBoolean(manifest, "canDisable", errors);
  optionalBoolean(manifest, "historicalReadAccess", errors);
  optionalUrlOrString(manifest, "migrationsDir", errors, { nullable: true });
  optionalUrlOrString(manifest, "protectedViewsDir", errors);
  optionalUrlOrString(manifest, "publicViewsDir", errors);
  optionalUrlOrString(manifest, "browserAssetsDir", errors);
  optionalArray(manifest, "browserApiRoutes", errors);
  optionalArray(manifest, "publicApiRoutes", errors);
  optionalStringArray(manifest, "requiredPermissions", errors);
  optionalStringArray(manifest, "frameworkDependencies", errors);
  optionalStringArray(manifest, "moduleDependencies", errors);
  optionalStringArray(manifest, "workspaceCapabilityRequirements", errors);
  optionalArray(manifest, "seedHooks", errors);
  optionalArray(manifest, "repairHooks", errors);
  validateNavigation(manifest.navigation, errors);
  validateViews(manifest.protectedViews, manifest.id, "protectedViews", errors);
  validateViews(manifest.publicViews, manifest.id, "publicViews", errors);
  validateViewSurfaces(manifest.viewSurfaces, errors);
  validateBrowserAssets(manifest.browserAssets, manifest.id, errors);
  validateDashboard(manifest.dashboard, errors);
  validateReporting(manifest.reporting, manifest.id, errors);
  validateWorkbench(manifest.workbench, errors);
  validateSettingsContributions(manifest.settings, errors);
  validatePermissions(manifest.permissions, manifest.id, errors);
  validateDefaultRolePermissions(manifest.defaultRolePermissions, errors);
  validateResourceDefinitions(manifest.resourceDefinitions, manifest.id, errors);
  validateApiScopes(manifest.apiScopes, manifest.id, errors);
  validateAuditRecordTypes(manifest.auditRecordTypes, manifest.id, errors);
  validateEventTypes(manifest.eventTypes, manifest.id, errors);
  validateEventSummaries(manifest.eventSummaries, manifest.id, errors);
  validatePublicApiEndpoints(manifest.publicApiEndpoints, errors);
  validateHooks(manifest.hooks, errors);
  validateTimerSources(manifest.timerSources, manifest.id, errors);
  validateWorkItemSources(manifest.workItemSources, manifest.id, errors);
  validateLinkedContextProviders(manifest.linkedContextProviders, manifest.id, errors);
  validateTaggableTypes(manifest.taggableTypes, manifest.id, errors);
  validateTagPropagationDescriptors(manifest.tagPropagation, manifest.id, errors);
  validateSearchableTypes(manifest.searchableTypes, manifest.id, errors);
  validateAttachableTypes(manifest.attachableTypes, manifest.id, errors);
  validateProtectedContentConsumers(manifest.protectedContentConsumers, manifest.id, errors);
  validateHelpContribution(/** @type {import("../../types/help-static-contracts.js").HelpContribution|undefined} */ (manifest.help), {
    ownerId: manifest.id,
    ownerType: "module",
    fieldName: "help",
    errors,
  });
  validateNotificationEvents(manifest.notificationEvents, manifest.id, errors);
  validateNotificationTemplates(manifest.notificationTemplates, manifest.id, errors);
  validateNotificationFollowTargets(manifest.notificationFollowTargets, manifest.id, errors);
  validateReservedFields(manifest, errors);

  for (const dependencyId of manifest.moduleDependencies || []) {
    if (!allModuleIds.has(dependencyId)) {
      errors.push(`moduleDependencies references unknown module '${dependencyId}'.`);
    }
  }

  return errors.map((error) => `${moduleLabel}: ${error}`);
}

/** @param {unknown[]} rawModuleDefinitions */
function validateModuleManifests(rawModuleDefinitions) {
  const moduleDefinitions = /** @type {ModuleManifest[]} */ (/** @type {unknown} */ (rawModuleDefinitions));
  const errors = [];
  const seenIds = new Set();
  const allModuleIds = new Set();
  const allTaggableTypes = new Set();
  const allAttachableTypes = new Set();
  const allPermissionIds = new Set(CORE_PERMISSION_IDS);
  const allResolverIds = new Set(listTagPropagationResolverIds());
  const allProtectedViewKeys = new Set();
  const allViewSurfaceIds = new Set();
  const frameworkSettingIds = new Set(listFrameworkSettingDefinitions().map((setting) => setting.id));

  for (const moduleDefinition of moduleDefinitions) {
    if (moduleDefinition?.id) {
      if (seenIds.has(moduleDefinition.id)) {
        errors.push(`${moduleDefinition.id}: id must be unique.`);
      }
      seenIds.add(moduleDefinition.id);
      allModuleIds.add(moduleDefinition.id);
    }
    for (const protectedView of moduleDefinition?.protectedViews || []) {
      if (moduleDefinition?.id && isPlainObject(protectedView) && typeof protectedView.id === "string") {
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
    for (const permission of /** @type {import("../../types/framework-contracts.js").PermissionContribution[]} */ (moduleDefinition?.permissions || [])) {
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
    errors.push(...validateLinkedContextProviderReferences(moduleDefinition, {
      allModuleIds,
      allPermissionIds,
    }));
    errors.push(...validateViewSurfaceReferences(moduleDefinition, {
      allModuleIds,
      allPermissionIds,
      allProtectedViewKeys,
    }));
    errors.push(...validateReportingReferences(moduleDefinition, {
      allModuleIds,
      allPermissionIds,
    }));
    errors.push(...validateSettingsReferences(moduleDefinition, {
      allModuleIds,
      allPermissionIds,
      frameworkSettingIds,
    }));
    errors.push(...validateResourceDefinitionReferences(moduleDefinition, { allPermissionIds }));
  }

  const propagationIds = moduleDefinitions.flatMap((moduleDefinition) => (
    /** @type {Array<{id?: string}>} */ (Array.isArray(moduleDefinition?.tagPropagation) ? moduleDefinition.tagPropagation : [])
  ).map((descriptor) => descriptor?.id).filter(Boolean));
  assertUniqueHelpValues("tagPropagation id", propagationIds, errors);

  if (errors.length > 0) {
    throw new Error(`Invalid module manifest configuration:\n- ${errors.join("\n- ")}`);
  }
}

/**
 * @param {{}} moduleDefinition
 * @param {string[]} errors
 */
/**
 * @param {ManifestObject} moduleDefinition
 * @param {string[]} errors
 */
function validateKnownFields(moduleDefinition, errors) {
  for (const fieldName of Object.keys(moduleDefinition)) {
    if (!ACTIVE_MANIFEST_FIELDS.has(fieldName) && !RESERVED_MANIFEST_FIELDS.has(fieldName)) {
      errors.push(`unknown manifest field '${fieldName}'.`);
    }
  }
}

/**
 * @param {ManifestObject} moduleDefinition
 * @param {string[]} errors
 */
function validateReservedFields(moduleDefinition, errors) {
  for (const fieldName of RESERVED_MANIFEST_FIELDS) {
    if (!["notificationEvents", "notificationTemplates"].includes(fieldName)) {
      optionalArray(moduleDefinition, fieldName, errors);
    }
  }
}

/**
 * @param {unknown} notificationEvents
 * @param {unknown} moduleId
 * @param {string[]} errors
 */
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
    optionalBoolean(item, "suppressActorSubscriptions", errors, { prefix: `notificationEvents[${index}]` });
    if (!item.recipientResolver && !item.recipientMode) {
      errors.push(`notificationEvents[${index}] must include recipientResolver or recipientMode.`);
    }
    if (typeof item.recipientMode === "string" && !NOTIFICATION_RECIPIENT_MODES.has(item.recipientMode)) {
      errors.push(`notificationEvents[${index}].recipientMode must be a framework-recognized recipient mode.`);
    }
    validateTerminology(item.terminology, `notificationEvents[${index}].terminology`, errors);
  });
}

/**
 * @param {unknown} notificationTemplates
 * @param {unknown} moduleId
 * @param {string[]} errors
 */
function validateNotificationTemplates(notificationTemplates, moduleId, errors) {
  optionalArrayOfObjects(notificationTemplates, "notificationTemplates", errors, (item, index) => {
    requireString(item, "id", errors, { prefix: `notificationTemplates[${index}]` });
    validateModuleIdValue(item, "moduleId", moduleId, errors, { prefix: `notificationTemplates[${index}]` });
    requireString(item, "event", errors, { prefix: `notificationTemplates[${index}]` });
    requireString(item, "title", errors, { prefix: `notificationTemplates[${index}]` });
    requireString(item, "body", errors, { prefix: `notificationTemplates[${index}]` });
    optionalString(item, "url", errors, { prefix: `notificationTemplates[${index}]` });
    optionalString(item, "recordLinkPattern", errors, { prefix: `notificationTemplates[${index}]` });
    if (typeof item.url === "string") {
      validateRelativeUrl(item.url, `notificationTemplates[${index}].url`, errors);
    }
    if (typeof item.recordLinkPattern === "string") {
      validateRelativeUrl(item.recordLinkPattern, `notificationTemplates[${index}].recordLinkPattern`, errors);
    }
    validateTerminology(item.terminology, `notificationTemplates[${index}].terminology`, errors);
  });
}

/**
 * @param {unknown} notificationFollowTargets
 * @param {unknown} moduleId
 * @param {string[]} errors
 */
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

/**
 * @param {unknown} navigation
 * @param {string[]} errors
 */
function validateNavigation(navigation, errors) {
  optionalArrayOfObjects(navigation, "navigation", errors, (item, index) => {
    requireString(item, "label", errors, { prefix: `navigation[${index}]` });
    requireString(item, "href", errors, { prefix: `navigation[${index}]` });
    validateTerminology(item.terminology, `navigation[${index}].terminology`, errors);
    optionalStringArray(item, "requiredPermissions", errors, { prefix: `navigation[${index}]` });
  });
}

/**
 * @param {unknown} views
 * @param {unknown} moduleId
 * @param {string} fieldName
 * @param {string[]} errors
 */
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

/**
 * @param {unknown} viewSurfaces
 * @param {string[]} errors
 */
function validateViewSurfaces(viewSurfaces, errors) {
  optionalArrayOfObjects(viewSurfaces, "viewSurfaces", errors, (surface, index) => {
    const prefix = `viewSurfaces[${index}]`;

    validateKnownObjectFields(surface, VIEW_SURFACE_FIELDS, prefix, errors);
    requireString(surface, "id", errors, { prefix });
    requireString(surface, "moduleId", errors, { prefix });
    requireString(surface, "viewId", errors, { prefix });
    requireString(surface, "layout", errors, { prefix });
    if (typeof surface.layout === "string" && !VIEW_SURFACE_LAYOUTS.has(surface.layout)) {
      errors.push(`${prefix}.layout must be single-column, stacked, sidebar-detail, slide-out-sidebar, or table-page.`);
    }
    optionalString(surface, "filterPlacement", errors, { prefix });
    if (typeof surface.filterPlacement === "string" && !VIEW_FILTER_PLACEMENTS.has(surface.filterPlacement)) {
      errors.push(`${prefix}.filterPlacement must be inline or slide-out-sidebar.`);
    }
    validateDataSourceDescriptor(surface.dataSource, `${prefix}.dataSource`, errors, { required: true });
    validatePageHeaderDescriptor(surface.pageHeader, `${prefix}.pageHeader`, errors);
    optionalString(surface, "sidebarLabel", errors, { prefix });
    validateSidebarPanelsDescriptor(surface.sidebarPanels, `${prefix}.sidebarPanels`, errors);
    validateFiltersDescriptor(surface.filters, `${prefix}.filters`, errors);
    validateIndexPanelDescriptor(surface.indexPanel, `${prefix}.indexPanel`, errors);
    validateTableDescriptor(surface.table, `${prefix}.table`, errors);
    validateDetailDescriptor(surface.detail, `${prefix}.detail`, errors);
    validateModalsDescriptor(surface.modals, `${prefix}.modals`, errors);
    validateActionsDescriptor(surface.actions, `${prefix}.actions`, errors);
    validateRegionsDescriptor(surface.regions, `${prefix}.regions`, errors);
  });
}

/**
 * @param {ModuleManifest} moduleDefinition
 * @param {{ allModuleIds: Set<string>; allPermissionIds: Set<string>; allProtectedViewKeys: Set<string>; }} context
 */
function validateViewSurfaceReferences(moduleDefinition, context) {
  /**
 * @type {string[]}
 */
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

/**
 * @param {ViewSurfaceDescriptor} surface
 * @param {string} prefix
 * @returns {{ action: unknown, prefix: string }[]}
 */
function listViewSurfaceActions(surface, prefix) {
  const actions = [];
  if (surface?.pageHeader?.primaryAction) {
    actions.push({ action: surface.pageHeader.primaryAction, prefix: `${prefix}.pageHeader.primaryAction` });
  }
  collectActionArray(surface?.actions, `${prefix}.actions`, actions);
  collectActionArray(surface?.table?.rowActions, `${prefix}.table.rowActions`, actions);
  collectActionArray(surface?.detail?.actionStrip?.actions, `${prefix}.detail.actionStrip.actions`, actions);
  collectActionArray(surface?.detail?.itemForm?.actions, `${prefix}.detail.itemForm.actions`, actions);
  collectActionArray(surface?.detail?.itemRows?.actions, `${prefix}.detail.itemRows.actions`, actions);
  collectActionArray(surface?.detail?.itemRows?.rowActions, `${prefix}.detail.itemRows.rowActions`, actions);
  collectActionArray(surface?.detail?.linkedRecords?.actions, `${prefix}.detail.linkedRecords.actions`, actions);
  for (const [modalIndex, modal] of (Array.isArray(surface?.modals) ? surface.modals : []).entries()) {
    collectActionArray(modal?.footerActions, `${prefix}.modals[${modalIndex}].footerActions`, actions);
    collectActionArray(modal?.actions, `${prefix}.modals[${modalIndex}].actions`, actions);
  }
  return actions;
}

/**
 * @param {unknown} actionArray
 * @param {string} prefix
 * @param {{ action: unknown; prefix: string; }[]} actions
 */
function collectActionArray(actionArray, prefix, actions) {
  if (!Array.isArray(actionArray)) {
    return;
  }
  actionArray.forEach((action, index) => {
    actions.push({ action, prefix: `${prefix}[${index}]` });
  });
}

/**
 * @param {unknown} action
 * @param {string} prefix
 * @param {string} moduleLabel
 * @param {{ allPermissionIds: Set<string> }} context
 * @param {string[]} errors
 */
function validateViewActionReference(action, prefix, moduleLabel, context, errors) {
  if (!isPlainObject(action)) {
    return;
  }
    if (typeof action.role === "string" && !VIEW_ACTION_ROLES.has(action.role)) {
    errors.push(`${moduleLabel}: ${prefix}.role must be primary, secondary, destructive, or utility.`);
  }
  validateViewRouteReference(action.route, `${prefix}.route`, moduleLabel, errors);
  validateViewMethodReference(action.method, `${prefix}.method`, moduleLabel, errors);
  for (const permissionId of (Array.isArray(action.requiredPermissions) ? action.requiredPermissions : [])) {
    if (typeof permissionId !== "string") {
      continue;
    }
    if (!context.allPermissionIds.has(permissionId)) {
      errors.push(`${moduleLabel}: ${prefix}.requiredPermissions references unknown permission '${permissionId}'.`);
    }
  }
}

/**
 * @param {unknown} route
 * @param {string} prefix
 * @param {string} moduleLabel
 * @param {string[]} errors
 */
function validateViewRouteReference(route, prefix, moduleLabel, errors) {
  if (route === undefined) {
    return;
  }
  if (typeof route !== "string" || route.trim() === "") {
    return;
  }
  /**
 * @type {string[]}
 */
  const routeErrors = [];
  validateRelativeUrl(route, prefix, routeErrors);
  if (!route.startsWith("/")) {
    routeErrors.push(`${prefix} must be a local route path.`);
  }
  for (const error of routeErrors) {
    errors.push(`${moduleLabel}: ${error}`);
  }
}

/**
 * @param {unknown} method
 * @param {string} prefix
 * @param {string} moduleLabel
 * @param {string[]} errors
 */
function validateViewMethodReference(method, prefix, moduleLabel, errors) {
  if (method === undefined) {
    return;
  }
  if (typeof method === "string" && !HTTP_METHODS.has(method)) {
    errors.push(`${moduleLabel}: ${prefix} must be a supported HTTP method.`);
  }
}

/**
 * @param {unknown} sidebarPanels
 * @param {string} prefix
 * @param {string[]} errors
 */
function validateSidebarPanelsDescriptor(sidebarPanels, prefix, errors) {
  optionalArrayOfObjects(sidebarPanels, prefix, errors, (panel, index) => {
    const panelPrefix = `${prefix}[${index}]`;
    validateKnownObjectFields(panel, VIEW_SIDEBAR_PANEL_FIELDS, panelPrefix, errors);
    requireString(panel, "id", errors, { prefix: panelPrefix });
    requireString(panel, "type", errors, { prefix: panelPrefix });
    if (typeof panel.type === "string" && !VIEW_SIDEBAR_PANEL_TYPES.has(panel.type)) {
      errors.push(`${panelPrefix}.type must be filters, navigation, or index.`);
    }
    validateLabelDescriptor(panel, panelPrefix, errors);
    optionalString(panel, "behavior", errors, { prefix: panelPrefix });
    if (panel.type === "navigation") {
      requireString(panel, "behavior", errors, { prefix: panelPrefix });
    }
    optionalBoolean(panel, "collapsible", errors, { prefix: panelPrefix });
    optionalBoolean(panel, "open", errors, { prefix: panelPrefix });
    optionalPlainObject(panel, "emptyState", errors, { prefix: panelPrefix });
    optionalString(panel, "className", errors, { prefix: panelPrefix });
    optionalString(panel, "ariaLabel", errors, { prefix: panelPrefix });
    validateSidebarPanelFooterDescriptor(panel.footer, `${panelPrefix}.footer`, errors);
  });
}

/**
 * @param {unknown} footer
 * @param {string} prefix
 * @param {string[]} errors
 */
function validateSidebarPanelFooterDescriptor(footer, prefix, errors) {
  if (footer === undefined) {
    return;
  }
  if (!isPlainObject(footer)) {
    errors.push(`${prefix} must be an object.`);
    return;
  }
  validateKnownObjectFields(footer, VIEW_SIDEBAR_PANEL_FOOTER_FIELDS, prefix, errors);
  validateLabelDescriptor(footer, prefix, errors);
  optionalString(footer, "id", errors, { prefix });
  optionalString(footer, "behavior", errors, { prefix });
  optionalString(footer, "className", errors, { prefix });
  optionalString(footer, "ariaLabel", errors, { prefix });
}

/**
 * @param {unknown} pageHeader
 * @param {string} prefix
 * @param {string[]} errors
 */
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

/**
 * @param {unknown} filters
 * @param {string} prefix
 * @param {string[]} errors
 */
function validateFiltersDescriptor(filters, prefix, errors) {
  optionalArrayOfObjects(filters, prefix, errors, (filter, index) => {
    const filterPrefix = `${prefix}[${index}]`;
    validateKnownObjectFields(filter, VIEW_FILTER_FIELDS, filterPrefix, errors);
    requireString(filter, "field", errors, { prefix: filterPrefix });
    requireString(filter, "type", errors, { prefix: filterPrefix });
    validateLabelDescriptor(filter, filterPrefix, errors);
    optionalArray(filter, "options", errors);
    optionalString(filter, "optionsSource", errors, { prefix: filterPrefix });
    optionalString(filter, "queryKey", errors, { prefix: filterPrefix });
  });
}

/**
 * @param {unknown} regions
 * @param {string} prefix
 * @param {string[]} errors
 */
function validateRegionsDescriptor(regions, prefix, errors) {
  optionalArrayOfObjects(regions, prefix, errors, (region, index) => {
    const regionPrefix = `${prefix}[${index}]`;
    validateKnownObjectFields(region, VIEW_REGION_FIELDS, regionPrefix, errors);
    requireString(region, "id", errors, { prefix: regionPrefix });
    requireString(region, "behavior", errors, { prefix: regionPrefix });
    validateLabelDescriptor(region, regionPrefix, errors);
    optionalString(region, "placement", errors, { prefix: regionPrefix });
    optionalString(region, "className", errors, { prefix: regionPrefix });
    optionalString(region, "ariaLabel", errors, { prefix: regionPrefix });
  });
}

/**
 * @param {unknown} indexPanel
 * @param {string} prefix
 * @param {string[]} errors
 */
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
  optionalString(indexPanel, "itemDepthField", errors, { prefix });
  optionalString(indexPanel, "itemParentField", errors, { prefix });
  optionalString(indexPanel, "itemPathField", errors, { prefix });
  optionalPlainObject(indexPanel, "emptyState", errors, { prefix });
  optionalString(indexPanel, "initialSelection", errors, { prefix });
  if (typeof indexPanel.initialSelection === "string" && !["first", "none"].includes(indexPanel.initialSelection)) {
    errors.push(`${prefix}.initialSelection must be first or none.`);
  }
  optionalBoolean(indexPanel, "collapseOnSelect", errors, { prefix });
}

/**
 * @param {unknown} table
 * @param {string} prefix
 * @param {string[]} errors
 */
function validateTableDescriptor(table, prefix, errors) {
  if (table === undefined) {
    return;
  }
  if (!isPlainObject(table)) {
    errors.push(`${prefix} must be an object.`);
    return;
  }
  validateKnownObjectFields(table, VIEW_TABLE_FIELDS, prefix, errors);
  validateTableHierarchyDescriptor(table.hierarchy, `${prefix}.hierarchy`, errors);
  validateTableSelectionDescriptor(table.selection, `${prefix}.selection`, errors);
  optionalArrayOfObjects(table.columns, `${prefix}.columns`, errors, (column, index) => {
    const columnPrefix = `${prefix}.columns[${index}]`;
    validateKnownObjectFields(column, VIEW_TABLE_COLUMN_FIELDS, columnPrefix, errors);
    requireString(column, "field", errors, { prefix: columnPrefix });
    validateLabelDescriptor(column, columnPrefix, errors);
    optionalString(column, "formatter", errors, { prefix: columnPrefix });
    if (typeof column.formatter === "string" && !VIEW_TABLE_COLUMN_FORMATTERS.has(column.formatter)) {
      errors.push(`${columnPrefix}.formatter must be text, hierarchy-label, or chip-list.`);
    }
    optionalString(column, "width", errors, { prefix: columnPrefix });
    optionalString(column, "widthHint", errors, { prefix: columnPrefix });
    optionalString(column, "align", errors, { prefix: columnPrefix });
    optionalString(column, "depthField", errors, { prefix: columnPrefix });
    optionalString(column, "chipsField", errors, { prefix: columnPrefix });
    optionalString(column, "chipLabelField", errors, { prefix: columnPrefix });
  });
  validateTableSecondaryRowsDescriptor(table.secondaryRows, `${prefix}.secondaryRows`, errors);
  validateActionsDescriptor(table.rowActions, `${prefix}.rowActions`, errors);
  optionalString(table, "rowActionsHeaderLabel", errors, { prefix });
  optionalPlainObject(table, "emptyState", errors, { prefix });
  optionalBoolean(table, "overflow", errors, { prefix });
}

/**
 * @param {unknown} secondaryRows
 * @param {string} prefix
 * @param {string[]} errors
 */
function validateTableSecondaryRowsDescriptor(secondaryRows, prefix, errors) {
  optionalArrayOfObjects(secondaryRows, prefix, errors, (row, index) => {
    const rowPrefix = `${prefix}[${index}]`;
    validateKnownObjectFields(row, VIEW_TABLE_SECONDARY_ROW_FIELDS, rowPrefix, errors);
    requireString(row, "id", errors, { prefix: rowPrefix });
    validateLabelDescriptor(row, rowPrefix, errors);
    optionalString(row, "field", errors, { prefix: rowPrefix });
    optionalString(row, "formatter", errors, { prefix: rowPrefix });
    if (typeof row.formatter === "string" && !VIEW_TABLE_COLUMN_FORMATTERS.has(row.formatter)) {
      errors.push(`${rowPrefix}.formatter must be text, hierarchy-label, or chip-list.`);
    }
    optionalString(row, "chipsField", errors, { prefix: rowPrefix });
    optionalString(row, "chipLabelField", errors, { prefix: rowPrefix });
    optionalString(row, "startColumn", errors, { prefix: rowPrefix });
    optionalString(row, "endBeforeColumn", errors, { prefix: rowPrefix });
    optionalBoolean(row, "hideWhenEmpty", errors, { prefix: rowPrefix });
    optionalString(row, "className", errors, { prefix: rowPrefix });
  });
}

/**
 * @param {unknown} selection
 * @param {string} prefix
 * @param {string[]} errors
 */
function validateTableSelectionDescriptor(selection, prefix, errors) {
  if (selection === undefined) {
    return;
  }
  if (!isPlainObject(selection)) {
    errors.push(`${prefix} must be an object.`);
    return;
  }
  validateKnownObjectFields(selection, VIEW_TABLE_SELECTION_FIELDS, prefix, errors);
  optionalBoolean(selection, "enabled", errors, { prefix });
  validateLabelDescriptor(selection, prefix, errors);
  optionalString(selection, "headerLabel", errors, { prefix });
  optionalString(selection, "recordType", errors, { prefix });
  optionalString(selection, "labelField", errors, { prefix });
}

/**
 * @param {unknown} hierarchy
 * @param {string} prefix
 * @param {string[]} errors
 */
function validateTableHierarchyDescriptor(hierarchy, prefix, errors) {
  if (hierarchy === undefined) {
    return;
  }
  if (!isPlainObject(hierarchy)) {
    errors.push(`${prefix} must be an object.`);
    return;
  }
  validateKnownObjectFields(hierarchy, VIEW_TABLE_HIERARCHY_FIELDS, prefix, errors);
  optionalString(hierarchy, "depthField", errors, { prefix });
  optionalString(hierarchy, "parentField", errors, { prefix });
  optionalString(hierarchy, "pathField", errors, { prefix });
}

/**
 * @param {unknown} detail
 * @param {string} prefix
 * @param {string[]} errors
 */
function validateDetailDescriptor(detail, prefix, errors) {
  if (detail === undefined) {
    return;
  }
  if (!isPlainObject(detail)) {
    errors.push(`${prefix} must be an object.`);
    return;
  }
  validateKnownObjectFields(detail, VIEW_DETAIL_FIELDS, prefix, errors);
  for (const fieldName of ["header", "badgeRow", "metadataRow", "actionStrip", "emptyState"]) {
    optionalPlainObject(detail, fieldName, errors, { prefix });
  }
  const actionStrip = isPlainObject(detail.actionStrip) ? detail.actionStrip : undefined;
  validateActionsDescriptor(actionStrip?.actions, `${prefix}.actionStrip.actions`, errors);
  validateLinkedRecordsDescriptor(detail.linkedRecords, `${prefix}.linkedRecords`, errors);
  validateItemFormDescriptor(detail.itemForm, `${prefix}.itemForm`, errors);
  validateItemRowsDescriptor(detail.itemRows, `${prefix}.itemRows`, errors);
  validateRegionsDescriptor(detail.regions, `${prefix}.regions`, errors);
  optionalArrayOfObjects(detail.summaryPanels, `${prefix}.summaryPanels`, errors, (panel, panelIndex) => {
    const panelPrefix = `${prefix}.summaryPanels[${panelIndex}]`;
    validateKnownObjectFields(panel, VIEW_SUMMARY_PANEL_FIELDS, panelPrefix, errors);
    validateLabelDescriptor(panel, panelPrefix, errors);
    optionalString(panel, "messageField", errors, { prefix: panelPrefix });
    optionalArrayOfObjects(panel.items, `${panelPrefix}.items`, errors, (item, itemIndex) => {
      const itemPrefix = `${panelPrefix}.items[${itemIndex}]`;
      validateKnownObjectFields(item, VIEW_SUMMARY_PANEL_ITEM_FIELDS, itemPrefix, errors);
      optionalString(item, "label", errors, { prefix: itemPrefix });
      optionalString(item, "field", errors, { prefix: itemPrefix });
    });
  });
}

/**
 * @param {unknown} linkedRecords
 * @param {string} prefix
 * @param {string[]} errors
 */
function validateLinkedRecordsDescriptor(linkedRecords, prefix, errors) {
  if (linkedRecords === undefined) {
    return;
  }
  if (!isPlainObject(linkedRecords)) {
    errors.push(`${prefix} must be an object.`);
    return;
  }
  validateKnownObjectFields(linkedRecords, VIEW_LINKED_RECORDS_FIELDS, prefix, errors);
  validateLabelDescriptor(linkedRecords, prefix, errors);
  optionalString(linkedRecords, "recordsField", errors, { prefix });
  optionalString(linkedRecords, "targetTypeField", errors, { prefix });
  optionalString(linkedRecords, "targetLabelField", errors, { prefix });
  optionalString(linkedRecords, "targetUrlField", errors, { prefix });
  optionalString(linkedRecords, "targetIdField", errors, { prefix });
  optionalPlainObject(linkedRecords, "emptyState", errors, { prefix });
  optionalArrayOfObjects(linkedRecords.fields, `${prefix}.fields`, errors, (field, fieldIndex) => {
    const fieldPrefix = `${prefix}.fields[${fieldIndex}]`;
    validateKnownObjectFields(field, VIEW_FIELD_FIELDS, fieldPrefix, errors);
    requireString(field, "field", errors, { prefix: fieldPrefix });
    requireString(field, "type", errors, { prefix: fieldPrefix });
    validateViewFieldType(field, fieldPrefix, errors);
    validateLabelDescriptor(field, fieldPrefix, errors);
    optionalBoolean(field, "required", errors, { prefix: fieldPrefix });
    optionalArray(field, "options", errors);
    optionalString(field, "optionsSource", errors, { prefix: fieldPrefix });
    optionalString(field, "behavior", errors, { prefix: fieldPrefix });
  });
  validateActionsDescriptor(linkedRecords.actions, `${prefix}.actions`, errors);
}

/**
 * @param {unknown} itemForm
 * @param {string} prefix
 * @param {string[]} errors
 */
function validateItemFormDescriptor(itemForm, prefix, errors) {
  if (itemForm === undefined) {
    return;
  }
  if (!isPlainObject(itemForm)) {
    errors.push(`${prefix} must be an object.`);
    return;
  }
  validateKnownObjectFields(itemForm, new Set(["title", "label", "fields", "actions", "emptyState", "editable"]), prefix, errors);
  validateLabelDescriptor(itemForm, prefix, errors);
  optionalBoolean(itemForm, "editable", errors, { prefix });
  optionalArrayOfObjects(itemForm.fields, `${prefix}.fields`, errors, (field, fieldIndex) => {
    const fieldPrefix = `${prefix}.fields[${fieldIndex}]`;
    validateKnownObjectFields(field, VIEW_FIELD_FIELDS, fieldPrefix, errors);
    requireString(field, "field", errors, { prefix: fieldPrefix });
    requireString(field, "type", errors, { prefix: fieldPrefix });
    validateViewFieldType(field, fieldPrefix, errors);
    validateLabelDescriptor(field, fieldPrefix, errors);
    optionalBoolean(field, "required", errors, { prefix: fieldPrefix });
    optionalBoolean(field, "hidden", errors, { prefix: fieldPrefix });
    optionalArray(field, "options", errors);
    optionalString(field, "optionsSource", errors, { prefix: fieldPrefix });
    optionalString(field, "placement", errors, { prefix: fieldPrefix });
    optionalString(field, "behavior", errors, { prefix: fieldPrefix });
  });
  validateActionsDescriptor(itemForm.actions, `${prefix}.actions`, errors);
}

/**
 * @param {unknown} itemRows
 * @param {string} prefix
 * @param {string[]} errors
 */
function validateItemRowsDescriptor(itemRows, prefix, errors) {
  if (itemRows === undefined) {
    return;
  }
  if (!isPlainObject(itemRows)) {
    errors.push(`${prefix} must be an object.`);
    return;
  }
  validateKnownObjectFields(itemRows, VIEW_ITEM_ROWS_FIELDS, prefix, errors);
  optionalString(itemRows, "itemsField", errors, { prefix });
  optionalString(itemRows, "itemTitleField", errors, { prefix });
  optionalString(itemRows, "itemSubtitleField", errors, { prefix });
  optionalString(itemRows, "actionsLabel", errors, { prefix });
  optionalStringArray(itemRows, "metaFields", errors, { prefix });
  optionalArrayOfObjects(itemRows.chips, `${prefix}.chips`, errors, (chip, chipIndex) => {
    const chipPrefix = `${prefix}.chips[${chipIndex}]`;
    validateKnownObjectFields(chip, VIEW_CHIP_FIELDS, chipPrefix, errors);
    requireString(chip, "field", errors, { prefix: chipPrefix });
    validateLabelDescriptor(chip, chipPrefix, errors);
  });
  optionalArrayOfObjects(itemRows.columns, `${prefix}.columns`, errors, (column, columnIndex) => {
    const columnPrefix = `${prefix}.columns[${columnIndex}]`;
    validateKnownObjectFields(column, VIEW_ITEM_ROW_COLUMN_FIELDS, columnPrefix, errors);
    requireString(column, "id", errors, { prefix: columnPrefix });
    validateLabelDescriptor(column, columnPrefix, errors);
    optionalString(column, "field", errors, { prefix: columnPrefix });
    optionalString(column, "type", errors, { prefix: columnPrefix });
    optionalString(column, "formatter", errors, { prefix: columnPrefix });
  });
  validateActionsDescriptor(itemRows.actions, `${prefix}.actions`, errors);
  validateActionsDescriptor(itemRows.rowActions, `${prefix}.rowActions`, errors);
  optionalPlainObject(itemRows, "emptyState", errors, { prefix });
}

/**
 * @param {unknown} modals
 * @param {string} prefix
 * @param {string[]} errors
 */
function validateModalsDescriptor(modals, prefix, errors) {
  optionalArrayOfObjects(modals, prefix, errors, (modal, index) => {
    const modalPrefix = `${prefix}[${index}]`;
    validateKnownObjectFields(modal, VIEW_MODAL_FIELDS, modalPrefix, errors);
    requireString(modal, "id", errors, { prefix: modalPrefix });
    validateLabelDescriptor(modal, modalPrefix, errors);
    optionalString(modal, "size", errors, { prefix: modalPrefix });
    if (modal.size !== undefined && modal.size !== "wide") {
      errors.push(`${modalPrefix}.size must be wide when provided.`);
    }
    optionalArrayOfObjects(modal.fields, `${modalPrefix}.fields`, errors, (field, fieldIndex) => {
      const fieldPrefix = `${modalPrefix}.fields[${fieldIndex}]`;
      validateKnownObjectFields(field, VIEW_FIELD_FIELDS, fieldPrefix, errors);
      requireString(field, "field", errors, { prefix: fieldPrefix });
      requireString(field, "type", errors, { prefix: fieldPrefix });
      validateViewFieldType(field, fieldPrefix, errors);
      validateLabelDescriptor(field, fieldPrefix, errors);
      optionalBoolean(field, "required", errors, { prefix: fieldPrefix });
      optionalArray(field, "options", errors);
      optionalString(field, "optionsSource", errors, { prefix: fieldPrefix });
    });
    validateActionsDescriptor(modal.footerActions, `${modalPrefix}.footerActions`, errors);
    validateActionsDescriptor(modal.actions, `${modalPrefix}.actions`, errors);
  });
}

/**
 * @param {ManifestObject} field
 * @param {string} prefix
 * @param {string[]} errors
 */
function validateViewFieldType(field, prefix, errors) {
  if (typeof field.type === "string" && !VIEW_FIELD_TYPES.has(field.type)) {
    errors.push(`${prefix}.type must be one of ${Array.from(VIEW_FIELD_TYPES).join(", ")}.`);
  }
}

/**
 * @param {unknown} dataSource
 * @param {string} prefix
 * @param {string[]} errors
 * @param {{ required?: boolean }} [options]
 */
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
  optionalString(dataSource, "recordsKey", errors, { prefix });
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

/**
 * @param {unknown} actions
 * @param {string} prefix
 * @param {string[]} errors
 */
function validateActionsDescriptor(actions, prefix, errors) {
  optionalArrayOfObjects(actions, prefix, errors, (action, index) => {
    validateActionDescriptor(action, `${prefix}[${index}]`, errors);
  });
}

/**
 * @param {unknown} action
 * @param {string} prefix
 * @param {string[]} errors
 */
function validateActionDescriptor(action, prefix, errors) {
  if (!isPlainObject(action)) {
    errors.push(`${prefix} must be an object.`);
    return;
  }
  validateKnownObjectFields(action, VIEW_ACTION_FIELDS, prefix, errors);
  requireString(action, "id", errors, { prefix });
  requirePublicDemoCapabilityDeclaration(action, prefix, errors);
  validateLabelDescriptor(action, prefix, errors);
  optionalString(action, "role", errors, { prefix });
  optionalString(action, "icon", errors, { prefix });
  optionalBoolean(action, "iconOnly", errors, { prefix });
  optionalString(action, "title", errors, { prefix });
  optionalString(action, "route", errors, { prefix });
  optionalString(action, "method", errors, { prefix });
  optionalString(action, "behavior", errors, { prefix });
  optionalStringArray(action, "requiredPermissions", errors, { prefix });
  if (action.confirm !== undefined && typeof action.confirm !== "string" && !isPlainObject(action.confirm)) {
    errors.push(`${prefix}.confirm must be a string or object.`);
  }
  if (action.visibleWhen !== undefined) {
    if (!isPlainObject(action.visibleWhen)) {
      errors.push(`${prefix}.visibleWhen must be an object.`);
    } else {
      validateKnownObjectFields(action.visibleWhen, VIEW_VISIBLE_WHEN_FIELDS, `${prefix}.visibleWhen`, errors);
      requireString(action.visibleWhen, "field", errors, { prefix: `${prefix}.visibleWhen` });
      optionalArray(action.visibleWhen, "in", errors);
      optionalBoolean(action.visibleWhen, "truthy", errors, { prefix: `${prefix}.visibleWhen` });
      optionalBoolean(action.visibleWhen, "falsy", errors, { prefix: `${prefix}.visibleWhen` });
    }
  }
}

/**
 * @param {ManifestObject} object
 * @param {string} prefix
 * @param {string[]} errors
 */
function validateLabelDescriptor(object, prefix, errors) {
  for (const fieldName of VIEW_LABEL_FIELDS) {
    optionalString(object, fieldName, errors, { prefix });
  }
}

/**
 * @param {unknown} browserAssets
 * @param {unknown} moduleId
 * @param {string[]} errors
 */
function validateBrowserAssets(browserAssets, moduleId, errors) {
  const seenIds = new Set();

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
    if (typeof item.id === "string" && seenIds.has(item.id)) {
      errors.push(`browserAssets[${index}].id '${item.id}' is duplicated.`);
    }
    seenIds.add(item.id);
  });
}

/**
 * @param {unknown} dashboard
 * @param {string[]} errors
 */
function validateDashboard(dashboard, errors) {
  optionalArrayOfObjects(dashboard, "dashboard", errors, (item, index) => {
    requireString(item, "id", errors, { prefix: `dashboard[${index}]` });
    requireString(item, "label", errors, { prefix: `dashboard[${index}]` });
    requireString(item, "renderer", errors, { prefix: `dashboard[${index}]` });
    requireString(item, "moduleId", errors, { prefix: `dashboard[${index}]` });
    optionalString(item, "description", errors, { prefix: `dashboard[${index}]` });
    optionalString(item, "dataRoute", errors, { prefix: `dashboard[${index}]` });
    optionalString(item, "placement", errors, { prefix: `dashboard[${index}]` });
    if (typeof item.placement === "string" && !DASHBOARD_PLACEMENTS.has(item.placement)) {
      errors.push(`dashboard[${index}].placement must be one of ${[...DASHBOARD_PLACEMENTS].join(", ")}.`);
    }
    optionalStringArray(item, "requiredPermissions", errors, { prefix: `dashboard[${index}]` });
    optionalStringArray(item, "requiredWorkspaceCapabilities", errors, { prefix: `dashboard[${index}]` });
    optionalStringArray(item, "requiresEnabledModules", errors, { prefix: `dashboard[${index}]` });
    optionalNumber(item, "sortOrder", errors, { prefix: `dashboard[${index}]` });
    validateTerminology(item.terminology, `dashboard[${index}].terminology`, errors);
  });
}

/**
 * @param {unknown} reporting
 * @param {unknown} moduleId
 * @param {string[]} errors
 */
function validateReporting(reporting, moduleId, errors) {
  const seenIds = new Set();

  optionalArrayOfObjects(reporting, "reporting", errors, (item, index) => {
    const prefix = `reporting[${index}]`;
    validateKnownObjectFields(item, REPORTING_CONTRIBUTION_FIELDS, prefix, errors);
    requireString(item, "id", errors, { prefix, pattern: HELP_ID_PATTERN });
    validateModuleIdValue(item, "moduleId", moduleId, errors, { prefix, pattern: HELP_ID_PATTERN });
    requireString(item, "label", errors, { prefix });
    requireString(item, "description", errors, { prefix });
    requireString(item, "category", errors, { prefix });
    requireString(item, "renderer", errors, { prefix, pattern: HELP_ID_PATTERN });
    requireString(item, "runner", errors, { prefix, pattern: HELP_ID_PATTERN });
    requireStringArrayField(item, "requiredPermissions", errors, { prefix });
    requireStringArrayField(item, "requiredWorkspaceCapabilities", errors, { prefix });
    requireStringArrayField(item, "requiresEnabledModules", errors, { prefix });
    optionalNumber(item, "sortOrder", errors, { prefix });
    requireStringArray(item, "browserAssetIds", errors, { prefix });
    validateReportingFilters(item.filters, prefix, errors);

    if (typeof item.id === "string" && seenIds.has(item.id)) {
      errors.push(`${prefix}.id '${item.id}' is duplicated.`);
    }
    seenIds.add(item.id);
  });
}

/**
 * @param {unknown} filters
 * @param {string} reportPrefix
 * @param {string[]} errors
 */
function validateReportingFilters(filters, reportPrefix, errors) {
  const seenIds = new Set();
  const seenQueryKeys = new Set();

  requiredArrayOfObjects(filters, `${reportPrefix}.filters`, errors, (filter, index) => {
    const prefix = `${reportPrefix}.filters[${index}]`;
    validateKnownObjectFields(filter, REPORTING_FILTER_FIELDS, prefix, errors);
    requireString(filter, "id", errors, { prefix, pattern: HELP_ID_PATTERN });
    requireString(filter, "label", errors, { prefix });
    requireString(filter, "type", errors, { prefix });
    if (typeof filter.type === "string" && !REPORTING_FILTER_TYPES.has(filter.type)) {
      errors.push(`${prefix}.type must be one of ${[...REPORTING_FILTER_TYPES].join(", ")}.`);
    }
    requireStringArray(filter, "queryKeys", errors, { prefix });
    const expectedQueryKeyCount = filter.type === "custom-date-range" ? 2 : 1;
    if (Array.isArray(filter.queryKeys) && filter.queryKeys.length !== expectedQueryKeyCount) {
      errors.push(`${prefix}.queryKeys must contain exactly ${expectedQueryKeyCount} ${expectedQueryKeyCount === 1 ? "key" : "keys"} for '${filter.type || "unknown"}'.`);
    }
    for (const queryKey of (Array.isArray(filter.queryKeys) ? filter.queryKeys : [])) {
      if (typeof queryKey !== "string") {
        continue;
      }
      if (!/^[A-Za-z][A-Za-z0-9]*$/.test(queryKey)) {
        errors.push(`${prefix}.queryKeys entry '${queryKey}' must be a safe query parameter name.`);
      } else if (seenQueryKeys.has(queryKey)) {
        errors.push(`${prefix}.queryKeys entry '${queryKey}' is duplicated across report filters.`);
      }
      seenQueryKeys.add(queryKey);
    }
    optionalBoolean(filter, "required", errors, { prefix });
    validateReportingFilterDefault(filter, prefix, errors);

    if (filter.visibleWhen !== undefined) {
      if (!isPlainObject(filter.visibleWhen)) {
        errors.push(`${prefix}.visibleWhen must be an object.`);
      } else {
        validateKnownObjectFields(filter.visibleWhen, REPORTING_FILTER_VISIBLE_WHEN_FIELDS, `${prefix}.visibleWhen`, errors);
        requireString(filter.visibleWhen, "filterId", errors, { prefix: `${prefix}.visibleWhen` });
        requireString(filter.visibleWhen, "equals", errors, { prefix: `${prefix}.visibleWhen` });
      }
    }

    if (typeof filter.id === "string" && seenIds.has(filter.id)) {
      errors.push(`${prefix}.id '${filter.id}' is duplicated.`);
    }
    seenIds.add(filter.id);
  });
}

/**
 * @param {ManifestObject} filter
 * @param {string} prefix
 * @param {string[]} errors
 */
function validateReportingFilterDefault(filter, prefix, errors) {
  const value = filter.defaultValue;
  const fieldName = `${prefix}.defaultValue`;

  if (value === undefined || value === null) {
    return;
  }

  if (typeof filter.type === "string" && ["project-multi-select", "tag"].includes(filter.type)) {
    if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
      errors.push(`${fieldName} must be a list of strings for '${filter.type}'.`);
    }
    return;
  }

  if (filter.type === "boolean") {
    if (typeof value !== "boolean") {
      errors.push(`${fieldName} must be a boolean for 'boolean'.`);
    }
    return;
  }

  if (typeof value !== "string") {
    errors.push(`${fieldName} must be a string for '${filter.type || "unknown"}'.`);
    return;
  }

  if (filter.type === "billing-period" && !["current", "last", "custom"].includes(value)) {
    errors.push(`${fieldName} must be current, last, or custom for 'billing-period'.`);
  }
}

/**
 * @param {ModuleManifest} moduleDefinition
 * @param {{ allModuleIds: Set<string>; allPermissionIds: Set<string>; }} context
 */
function validateReportingReferences(moduleDefinition, context) {
  /**
 * @type {string[]}
 */
  const errors = [];
  const moduleLabel = moduleDefinition?.id || moduleDefinition?.name || "<unknown>";
  const assetsById = new Map((moduleDefinition?.browserAssets || []).map((asset) => [asset?.id, asset]));
  const reports = Array.isArray(moduleDefinition?.reporting) ? moduleDefinition.reporting : [];

  reports.forEach((report, index) => {
    const prefix = `reporting[${index}]`;

    if (!report?.requiredPermissions?.includes("reporting.view")) {
      errors.push(`${moduleLabel}: ${prefix}.requiredPermissions must include framework permission 'reporting.view'.`);
    }

    for (const permissionId of report?.requiredPermissions || []) {
      if (!context.allPermissionIds.has(permissionId)) {
        errors.push(`${moduleLabel}: ${prefix}.requiredPermissions references unknown permission '${permissionId}'.`);
      }
    }

    for (const requiredModuleId of report?.requiresEnabledModules || []) {
      if (!context.allModuleIds.has(requiredModuleId)) {
        errors.push(`${moduleLabel}: ${prefix}.requiresEnabledModules references unknown module '${requiredModuleId}'.`);
      }
    }

    for (const assetId of report?.browserAssetIds || []) {
      const asset = assetsById.get(assetId);
      if (!asset) {
        errors.push(`${moduleLabel}: ${prefix}.browserAssetIds references unknown module browser asset '${assetId}'.`);
        continue;
      }
      if (asset.moduleId !== moduleDefinition.id) {
        errors.push(`${moduleLabel}: ${prefix}.browserAssetIds asset '${assetId}' must be owned by module '${moduleDefinition.id}'.`);
      }
      if (!asset.views?.includes(REPORTING_HOST_ASSET_TARGET)) {
        errors.push(`${moduleLabel}: ${prefix}.browserAssetIds asset '${assetId}' must declare the '${REPORTING_HOST_ASSET_TARGET}' host target.`);
      }
      if (!isSafeLocalBrowserAssetPath(asset.path)) {
        errors.push(`${moduleLabel}: ${prefix}.browserAssetIds asset '${assetId}' must use a safe local browser path without a query or fragment.`);
      }
    }

    const filterIds = new Set((report?.filters || []).map((filter) => filter?.id).filter(Boolean));
    for (const [filterIndex, filter] of (report?.filters || []).entries()) {
      const dependencyId = filter?.visibleWhen?.filterId;
      if (dependencyId && !filterIds.has(dependencyId)) {
        errors.push(`${moduleLabel}: ${prefix}.filters[${filterIndex}].visibleWhen.filterId references unknown filter '${dependencyId}'.`);
      }
    }
  });

  return errors;
}

/**
 * @param {unknown} workbench
 * @param {string[]} errors
 */
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

/**
 * @param {unknown} settings
 * @param {string[]} errors
 */
function validateSettingsContributions(settings, errors) {
  const seenIds = new Set();

  optionalArrayOfObjects(settings, "settings", errors, (item, index) => {
    const prefix = `settings[${index}]`;
    validateKnownObjectFields(item, SETTINGS_CONTRIBUTION_FIELDS, prefix, errors);
    requireString(item, "id", errors, { prefix, pattern: IDENTIFIER_PATTERN });
    requireString(item, "label", errors, { prefix });
    requireString(item, "type", errors, { prefix });
    if (typeof item.type === "string" && !SETTING_FIELD_TYPES.has(item.type)) {
      errors.push(`${prefix}.type must be one of ${Array.from(SETTING_FIELD_TYPES).join(", ")}.`);
    }
    requireString(item, "placement", errors, { prefix });
    if (typeof item.placement === "string" && !SETTING_PLACEMENTS.has(item.placement)) {
      errors.push(`${prefix}.placement must be one of ${[...SETTING_PLACEMENTS].join(", ")}.`);
    }
    optionalString(item, "target", errors, { prefix });
    if (typeof item.target === "string" && !SETTING_TARGETS.has(item.target)) {
      errors.push(`${prefix}.target must be one of ${[...SETTING_TARGETS].join(", ")}.`);
    }
    if (item.target === "framework") {
      errors.push(`${prefix}.target 'framework' is reserved for framework-registered settings.`);
    }
    optionalBoolean(item, "protected", errors, { prefix });
    if (item.protected === true) {
      errors.push(`${prefix}.protected may only be set by a framework-registered setting.`);
    }
    optionalBoolean(item, "ownerOnly", errors, { prefix });
    optionalBoolean(item, "readOnly", errors, { prefix });
    optionalString(item, "description", errors, { prefix });
    optionalString(item, "placeholder", errors, { prefix });
    optionalString(item, "inputmode", errors, { prefix });
    optionalString(item, "readOnlyReason", errors, { prefix });
    optionalString(item, "disabledReason", errors, { prefix });
    optionalStringArray(item, "requiredPermissions", errors, { prefix });
    optionalStringArray(item, "requiredWorkspaceCapabilities", errors, { prefix });
    optionalStringArray(item, "requiresEnabledModules", errors, { prefix });
    optionalStringArray(item, "requiredModules", errors, { prefix });
    optionalString(item, "handler", errors, { prefix, pattern: SETTING_BEHAVIOR_ID_PATTERN });
    optionalString(item, "onChangeEffect", errors, { prefix, pattern: SETTING_BEHAVIOR_ID_PATTERN });
    const optionValues = new Set();
    optionalArrayOfObjects(item.options, `${prefix}.options`, errors, (option, optionIndex) => {
      const optionPrefix = `${prefix}.options[${optionIndex}]`;
      validateKnownObjectFields(option, new Set(["label", "value"]), optionPrefix, errors);
      requireString(option, "label", errors, { prefix: optionPrefix });
      requireString(option, "value", errors, { prefix: optionPrefix });
      if (typeof option.value === "string" && optionValues.has(option.value)) {
        errors.push(`${optionPrefix}.value '${option.value}' is duplicated.`);
      }
      optionValues.add(option.value);
    });
    if (typeof item.type === "string" && ["select", "multi-select", "radio"].includes(item.type) && (!Array.isArray(item.options) || item.options.length === 0)) {
      errors.push(`${prefix}.options must contain at least one option for '${item.type}'.`);
    }
    optionalNumber(item, "min", errors, { prefix });
    optionalNumber(item, "max", errors, { prefix });
    optionalNumber(item, "step", errors, { prefix });
    optionalNumber(item, "rows", errors, { prefix });
    optionalBoolean(item, "spellcheck", errors, { prefix });
    if (typeof item.min === "number" && typeof item.max === "number" && item.min > item.max) {
      errors.push(`${prefix}.min must be less than or equal to max.`);
    }
    if (typeof item.step === "number" && item.step <= 0) {
      errors.push(`${prefix}.step must be greater than zero.`);
    }
    optionalBoolean(item, "moduleStatus", errors, { prefix });
    if (item.moduleStatus === true && item.type !== "boolean" && item.type !== "toggle") {
      errors.push(`${prefix}.moduleStatus requires a boolean or toggle type.`);
    }
    optionalBoolean(item, "required", errors, { prefix });
    if (item.type === "info" && item.readOnly !== true) {
      errors.push(`${prefix}.type 'info' must be read-only.`);
    }
    validateSettingDefault(item, prefix, errors);
    validateSettingVisibleWhen(item.visibleWhen, prefix, errors);
    validateTerminology(item.terminology, `${prefix}.terminology`, errors);

    if (typeof item.id === "string" && seenIds.has(item.id)) {
      errors.push(`${prefix}.id '${item.id}' is duplicated.`);
    }
    seenIds.add(item.id);
  });
}

/**
 * @param {unknown} visibleWhen
 * @param {string} prefix
 * @param {string[]} errors
 */
function validateSettingVisibleWhen(visibleWhen, prefix, errors) {
  if (visibleWhen === undefined) {
    return;
  }
  if (!isPlainObject(visibleWhen)) {
    errors.push(`${prefix}.visibleWhen must be an object.`);
    return;
  }

  validateKnownObjectFields(visibleWhen, SETTING_VISIBLE_WHEN_FIELDS, `${prefix}.visibleWhen`, errors);
  requireString(visibleWhen, "settingId", errors, { prefix: `${prefix}.visibleWhen`, pattern: IDENTIFIER_PATTERN });
  if (!Object.hasOwn(visibleWhen, "equals")) {
    errors.push(`${prefix}.visibleWhen.equals is required.`);
    return;
  }
  if (!["string", "number", "boolean"].includes(typeof visibleWhen.equals) ||
      (typeof visibleWhen.equals === "number" && !Number.isFinite(visibleWhen.equals))) {
    errors.push(`${prefix}.visibleWhen.equals must be text, a finite number, or a boolean.`);
  }
}

/**
 * @param {ModuleSettingCandidate} setting
 * @param {string} prefix
 * @param {string[]} errors
 */
function validateSettingDefault(setting, prefix, errors) {
  if (!Object.hasOwn(setting, "default")) {
    return;
  }

  const value = setting.default;
  const settingType = setting.type;
  if (typeof settingType === "string" && ["boolean", "toggle"].includes(settingType) && typeof value !== "boolean") {
    errors.push(`${prefix}.default must be a boolean for '${setting.type}'.`);
    return;
  }
  if (typeof settingType === "string" && ["text", "textarea", "info"].includes(settingType) && typeof value !== "string") {
    errors.push(`${prefix}.default must be text for '${setting.type}'.`);
    return;
  }
  if (setting.type === "number") {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      errors.push(`${prefix}.default must be a finite number for 'number'.`);
      return;
    }
    if (typeof setting.min === "number" && value < setting.min) {
      errors.push(`${prefix}.default is below min.`);
    }
    if (typeof setting.max === "number" && value > setting.max) {
      errors.push(`${prefix}.default is above max.`);
    }
    return;
  }

  const optionValues = new Set((setting.options || []).map((option) => option.value));
  if (typeof settingType === "string" && ["select", "radio"].includes(settingType) && (typeof value !== "string" || !optionValues.has(value))) {
    errors.push(`${prefix}.default must match a registered option for '${setting.type}'.`);
  }
  if (setting.type === "multi-select" && (
    !Array.isArray(value) || value.some((item) => typeof item !== "string" || !optionValues.has(item))
  )) {
    errors.push(`${prefix}.default must be a list of registered options for 'multi-select'.`);
  }
}

/**
 * @param {ModuleManifest} moduleDefinition
 * @param {{ allModuleIds: Set<string>; allPermissionIds: Set<string>; frameworkSettingIds: Set<string>; }} context
 */
function validateSettingsReferences(moduleDefinition, context) {
  /**
 * @type {string[]}
 */
  const errors = [];
  const moduleLabel = moduleDefinition?.id || moduleDefinition?.name || "<unknown>";
  const settings = Array.isArray(moduleDefinition?.settings) ? moduleDefinition.settings : [];
  const settingsById = new Map(settings.map((setting) => [setting?.id, setting]));

  settings.forEach((setting, index) => {
    const prefix = `settings[${index}]`;
    for (const permissionId of setting?.requiredPermissions || []) {
      if (!context.allPermissionIds.has(permissionId)) {
        errors.push(`${moduleLabel}: ${prefix}.requiredPermissions references unknown permission '${permissionId}'.`);
      }
    }
    for (const fieldName of ["requiresEnabledModules", "requiredModules"]) {
      const requiredModuleIds = setting?.[fieldName];
      for (const requiredModuleId of (Array.isArray(requiredModuleIds) ? requiredModuleIds : [])) {
        if (typeof requiredModuleId !== "string") continue;
        if (!context.allModuleIds.has(requiredModuleId)) {
          errors.push(`${moduleLabel}: ${prefix}.${fieldName} references unknown module '${requiredModuleId}'.`);
        }
      }
    }
    if (context.frameworkSettingIds.has(setting?.id)) {
      errors.push(`${moduleLabel}: ${prefix}.id '${setting.id}' conflicts with a framework-registered setting.`);
    }
    const dependencyId = setting?.visibleWhen?.settingId;
    if (dependencyId) {
      const dependency = settingsById.get(dependencyId);
      if (!dependency) {
        errors.push(`${moduleLabel}: ${prefix}.visibleWhen.settingId references unknown setting '${dependencyId}'.`);
      } else if (dependencyId === setting.id) {
        errors.push(`${moduleLabel}: ${prefix}.visibleWhen.settingId cannot reference itself.`);
      } else {
        validateSettingVisibleWhenValue(setting.visibleWhen?.equals, dependency, `${moduleLabel}: ${prefix}`, errors);
      }
    }
  });

  validateSettingVisibilityCycles(settingsById, moduleLabel, errors);

  return errors;
}

/**
 * @param {Map<string, ModuleSettingDefinition>} settingsById
 * @param {string} moduleLabel
 * @param {string[]} errors
 */
function validateSettingVisibilityCycles(settingsById, moduleLabel, errors) {
  const reportedCycles = new Set();
  for (const setting of settingsById.values()) {
    const path = [];
    const pathIndexes = new Map();
    /** @type {ModuleSettingDefinition|undefined} */
    let current = setting;
    while (current?.visibleWhen?.settingId && settingsById.has(current.visibleWhen.settingId)) {
      if (pathIndexes.has(current.id)) {
        const cycle = path.slice(pathIndexes.get(current.id)).concat(current.id);
        const cycleKey = [...new Set(cycle)].sort().join("|");
        if (!reportedCycles.has(cycleKey)) {
          reportedCycles.add(cycleKey);
          errors.push(`${moduleLabel}: settings visibleWhen dependencies must not form a cycle (${cycle.join(" depends on ")}).`);
        }
        break;
      }
      pathIndexes.set(current.id, path.length);
      path.push(current.id);
      current = settingsById.get(current.visibleWhen.settingId);
    }
  }
}

/**
 * @param {unknown} value
 * @param {ModuleSettingDefinition} dependency
 * @param {string} prefix
 * @param {string[]} errors
 */
function validateSettingVisibleWhenValue(value, dependency, prefix, errors) {
  const expectedType = dependency.type;
  const valid = ["boolean", "toggle"].includes(expectedType)
    ? typeof value === "boolean"
    : expectedType === "number"
      ? typeof value === "number" && Number.isFinite(value)
      : ["text", "select", "radio", "multi-select"].includes(expectedType)
        ? typeof value === "string"
        : false;
  if (!valid) {
    errors.push(`${prefix}.visibleWhen.equals must match setting '${dependency.id}' type '${expectedType}'.`);
  }
}

/**
 * @param {unknown} permissions
 * @param {unknown} moduleId
 * @param {string[]} errors
 */
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

/**
 * @param {unknown} defaultRolePermissions
 * @param {string[]} errors
 */
function validateDefaultRolePermissions(defaultRolePermissions, errors) {
  optionalArrayOfObjects(defaultRolePermissions, "defaultRolePermissions", errors, (item, index) => {
    requireString(item, "roleId", errors, { prefix: `defaultRolePermissions[${index}]` });
    optionalStringArray(item, "permissions", errors, { prefix: `defaultRolePermissions[${index}]` });
  });
}

/**
 * @param {unknown} resourceDefinitions
 * @param {unknown} moduleId
 * @param {string[]} errors
 */
function validateResourceDefinitions(resourceDefinitions, moduleId, errors) {
  optionalArrayOfObjects(resourceDefinitions, "resourceDefinitions", errors, (item, index) => {
    requireString(item, "key", errors, { prefix: `resourceDefinitions[${index}]` });
    validateModuleIdValue(item, "moduleId", moduleId, errors, { prefix: `resourceDefinitions[${index}]` });
    requireString(item, "label", errors, { prefix: `resourceDefinitions[${index}]` });
    optionalStringArray(item, "operations", errors, { prefix: `resourceDefinitions[${index}]` });
    optionalStringArray(item, "requiredPermissions", errors, { prefix: `resourceDefinitions[${index}]` });
    validateTerminology(item.terminology, `resourceDefinitions[${index}].terminology`, errors);
  });
}

/**
 * @param {ModuleManifest} moduleDefinition
 * @param {{ allPermissionIds: Set<string>; }} context
 */
function validateResourceDefinitionReferences(moduleDefinition, context) {
  /**
 * @type {string[]}
 */
  const errors = [];
  const moduleLabel = moduleDefinition?.id || moduleDefinition?.name || "<unknown>";

  (moduleDefinition?.resourceDefinitions || []).forEach((resource, index) => {
    for (const permissionId of resource?.requiredPermissions || []) {
      if (!context.allPermissionIds.has(permissionId)) {
        errors.push(`${moduleLabel}: resourceDefinitions[${index}].requiredPermissions references unknown permission '${permissionId}'.`);
      }
    }
  });

  return errors;
}

/**
 * @param {unknown} apiScopes
 * @param {unknown} moduleId
 * @param {string[]} errors
 */
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
    requirePublicDemoCapabilityDeclaration(item, `apiScopes[${index}]`, errors);
    optionalString(item, "access", errors, { prefix: `apiScopes[${index}]` });
    optionalStringArray(item, "workspaceTypes", errors, { prefix: `apiScopes[${index}]` });
    validateTerminology(item.terminology, `apiScopes[${index}].terminology`, errors);
  });
}

/**
 * @param {unknown} publicApiEndpoints
 * @param {string[]} errors
 */
function validatePublicApiEndpoints(publicApiEndpoints, errors) {
  optionalArrayOfObjects(publicApiEndpoints, "publicApiEndpoints", errors, (item, index) => {
    requireString(item, "method", errors, { prefix: `publicApiEndpoints[${index}]` });
    if (typeof item.method === "string" && !HTTP_METHODS.has(item.method)) {
      errors.push(`publicApiEndpoints[${index}].method must be a supported HTTP method.`);
    }
    requireString(item, "path", errors, { prefix: `publicApiEndpoints[${index}]` });
    requireString(item, "scope", errors, { prefix: `publicApiEndpoints[${index}]` });
    requirePublicDemoCapabilityDeclaration(item, `publicApiEndpoints[${index}]`, errors);
  });
}

/**
 * @param {ManifestObject} item
 * @param {string} prefix
 * @param {string[]} errors
 */
function requirePublicDemoCapabilityDeclaration(item, prefix, errors) {
  if (typeof item.publicDemoCapability !== "string" || !item.publicDemoCapability.trim()) {
    if (config.demo.enabled) {
      errors.push(`${prefix}.publicDemoCapability is required in public-demo mode.`);
    }
    return;
  }
  try {
    getPublicDemoCapability(item.publicDemoCapability);
  } catch {
    errors.push(`${prefix}.publicDemoCapability must name a declared public-demo capability.`);
  }
}

/**
 * @param {unknown} eventTypes
 * @param {unknown} moduleId
 * @param {string[]} errors
 */
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

/**
 * @param {unknown} auditRecordTypes
 * @param {unknown} moduleId
 * @param {string[]} errors
 */
function validateAuditRecordTypes(auditRecordTypes, moduleId, errors) {
  optionalArrayOfObjects(auditRecordTypes, "auditRecordTypes", errors, (item, index) => {
    requireString(item, "recordType", errors, { prefix: `auditRecordTypes[${index}]` });
    validateModuleIdValue(item, "moduleId", moduleId, errors, { prefix: `auditRecordTypes[${index}]` });
    requireString(item, "label", errors, { prefix: `auditRecordTypes[${index}]` });
    requireString(item, "description", errors, { prefix: `auditRecordTypes[${index}]` });
    validateTerminology(item.terminology, `auditRecordTypes[${index}].terminology`, errors);
  });
}

/**
 * @param {unknown} eventSummaries
 * @param {unknown} moduleId
 * @param {string[]} errors
 */
function validateEventSummaries(eventSummaries, moduleId, errors) {
  optionalArrayOfObjects(eventSummaries, "eventSummaries", errors, (item, index) => {
    requireString(item, "event", errors, { prefix: `eventSummaries[${index}]` });
    validateModuleIdValue(item, "moduleId", moduleId, errors, { prefix: `eventSummaries[${index}]` });
    optionalPlainObject(item, "activity", errors, { prefix: `eventSummaries[${index}]` });
    optionalPlainObject(item, "notification", errors, { prefix: `eventSummaries[${index}]` });
    validateSummaryObject(item.activity, `eventSummaries[${index}].activity`, errors, ["label", "summary", "url"]);
    validateSummaryObject(item.notification, `eventSummaries[${index}].notification`, errors, ["title", "body", "url", "recipientHints"]);
    validateTerminology(item.terminology, `eventSummaries[${index}].terminology`, errors);
    validateTerminology(isPlainObject(item.activity) ? item.activity.terminology : undefined, `eventSummaries[${index}].activity.terminology`, errors);
    validateTerminology(isPlainObject(item.notification) ? item.notification.terminology : undefined, `eventSummaries[${index}].notification.terminology`, errors);
  });
}

/**
 * @param {unknown} summary
 * @param {string} prefix
 * @param {string[]} errors
 * @param {string[]} fieldNames
 */
function validateSummaryObject(summary, prefix, errors, fieldNames) {
  if (summary === undefined) {
    return;
  }

  if (!isPlainObject(summary)) {
    errors.push(`${prefix} must be an object.`);
    return;
  }

  for (const fieldName of fieldNames) {
    const value = summary[fieldName];
    if (value !== undefined && typeof value !== "string" && typeof value !== "function" && !Array.isArray(value)) {
      errors.push(`${prefix}.${fieldName} must be a string, function, or array.`);
    }
  }
}

/**
 * @param {unknown} hooks
 * @param {string[]} errors
 */
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

/**
 * @param {unknown} timerSources
 * @param {unknown} moduleId
 * @param {string[]} errors
 */
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

/**
 * @param {unknown} workItemSources
 * @param {unknown} moduleId
 * @param {string[]} errors
 */
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

/**
 * @param {unknown} taggableTypes
 * @param {unknown} moduleId
 * @param {string[]} errors
 */
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

/**
 * @param {unknown} linkedContextProviders
 * @param {unknown} moduleId
 * @param {string[]} errors
 */
function validateLinkedContextProviders(linkedContextProviders, moduleId, errors) {
  optionalArrayOfObjects(linkedContextProviders, "linkedContextProviders", errors, (item, index) => {
    const prefix = `linkedContextProviders[${index}]`;

    validateKnownObjectFields(item, LINKED_CONTEXT_PROVIDER_FIELDS, prefix, errors);
    requireString(item, "id", errors, { prefix });
    validateModuleIdValue(item, "moduleId", moduleId, errors, { prefix });
    requireString(item, "targetType", errors, { prefix });
    requireString(item, "label", errors, { prefix });
    requireString(item, "description", errors, { prefix });
    requireString(item, "provider", errors, { prefix });
    requireString(item, "responseContract", errors, { prefix });
    requireString(item, "requiredReadPermission", errors, { prefix });
    requireStringArray(item, "requiredPermissions", errors, { prefix });
    optionalStringArray(item, "requiredModules", errors, { prefix });
    optionalStringArray(item, "requiredWorkspaceCapabilities", errors, { prefix });
    optionalStringArray(item, "workspaceTypes", errors, { prefix });
    validateTerminology(item.terminology, `${prefix}.terminology`, errors);

    if (item.responseContract !== undefined && item.responseContract !== LINKED_CONTEXT_TARGET_RESPONSE_CONTRACT) {
      errors.push(`${prefix}.responseContract must be ${LINKED_CONTEXT_TARGET_RESPONSE_CONTRACT}.`);
    }
    if (
      item.requiredReadPermission &&
      Array.isArray(item.requiredPermissions) &&
      !item.requiredPermissions.includes(item.requiredReadPermission)
    ) {
      errors.push(`${prefix}.requiredPermissions must include requiredReadPermission.`);
    }
  });
}

/**
 * @param {ModuleManifest} moduleDefinition
 * @param {{ allModuleIds: Set<string>; allPermissionIds: Set<string>; }} context
 */
function validateLinkedContextProviderReferences(moduleDefinition, context) {
  /**
 * @type {string[]}
 */
  const errors = [];
  const descriptors = Array.isArray(moduleDefinition?.linkedContextProviders) ? moduleDefinition.linkedContextProviders : [];

  descriptors.forEach((descriptor, index) => {
    const prefix = `linkedContextProviders[${index}]`;
    const moduleLabel = moduleDefinition?.id || moduleDefinition?.name || "<unknown>";

    if (!isPlainObject(descriptor)) {
      return;
    }

    if (typeof descriptor.moduleId === "string" && !context.allModuleIds.has(descriptor.moduleId)) {
      errors.push(`${moduleLabel}: ${prefix}.moduleId references unknown module '${descriptor.moduleId}'.`);
    }
    for (const moduleId of (Array.isArray(descriptor.requiredModules) ? descriptor.requiredModules : [])) {
      if (typeof moduleId !== "string") continue;
      if (!context.allModuleIds.has(moduleId)) {
        errors.push(`${moduleLabel}: ${prefix}.requiredModules references unknown module '${moduleId}'.`);
      }
    }
    for (const fieldName of ["requiredReadPermission"]) {
      const permissionId = descriptor?.[fieldName];
      if (typeof permissionId === "string" && !context.allPermissionIds.has(permissionId)) {
        errors.push(`${moduleLabel}: ${prefix}.${fieldName} references unknown permission '${permissionId}'.`);
      }
    }
    for (const permissionId of (Array.isArray(descriptor.requiredPermissions) ? descriptor.requiredPermissions : [])) {
      if (typeof permissionId === "string" && !context.allPermissionIds.has(permissionId)) {
        errors.push(`${moduleLabel}: ${prefix}.requiredPermissions references unknown permission '${permissionId}'.`);
      }
    }
  });

  return errors;
}

/**
 * @param {unknown} tagPropagation
 * @param {unknown} moduleId
 * @param {string[]} errors
 */
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

/**
 * @param {ModuleManifest} moduleDefinition
 * @param {{ allModuleIds: Set<string>; allResolverIds: Set<string>; allTaggableTypes: Set<string>; }} context
 */
function validateTagPropagationReferences(moduleDefinition, context) {
  /**
 * @type {string[]}
 */
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

/**
 * @param {unknown} searchableTypes
 * @param {unknown} moduleId
 * @param {string[]} errors
 */
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

/**
 * @param {unknown} attachableTypes
 * @param {unknown} moduleId
 * @param {string[]} errors
 */
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

    for (const category of (Array.isArray(item.allowedFileCategories) ? item.allowedFileCategories : [])) {
      if (typeof category !== "string") continue;
      if (!FILE_CATEGORY_VALUES.has(category)) {
        errors.push(`${prefix}.allowedFileCategories contains unsupported category '${category}'.`);
      }
    }
    for (const visibility of (Array.isArray(item.allowedVisibilityValues) ? item.allowedVisibilityValues : [])) {
      if (typeof visibility !== "string") continue;
      if (!ATTACHMENT_VISIBILITY_VALUES.has(visibility)) {
        errors.push(`${prefix}.allowedVisibilityValues contains unsupported visibility '${visibility}'.`);
      }
    }
    for (const eventName of (Array.isArray(item.lifecycleEvents) ? item.lifecycleEvents : [])) {
      if (typeof eventName !== "string") continue;
      if (!FILE_LIFECYCLE_EVENT_VALUES.has(eventName)) {
        errors.push(`${prefix}.lifecycleEvents contains invalid hook name '${eventName}'.`);
      }
    }
    if (typeof item.maxFilesPerRecord === "number" && item.maxFilesPerRecord < 1) {
      errors.push(`${prefix}.maxFilesPerRecord must be at least 1.`);
    }
    if (typeof item.maxFileSizeBytes === "number" && item.maxFileSizeBytes < 1) {
      errors.push(`${prefix}.maxFileSizeBytes must be at least 1.`);
    }
  });
}

/**
 * @param {unknown} consumers
 * @param {unknown} moduleId
 * @param {string[]} errors
 */
function validateProtectedContentConsumers(consumers, moduleId, errors) {
  optionalArrayOfObjects(consumers, "protectedContentConsumers", errors, (item, index) => {
    const prefix = `protectedContentConsumers[${index}]`;
    requireString(item, "id", errors, { prefix });
    validateModuleIdValue(item, "moduleId", moduleId, errors, { prefix });
    requireString(item, "recordType", errors, { prefix });
    requireString(item, "surface", errors, { prefix });
    requireString(item, "assertion", errors, { prefix });
    requireString(item, "behavior", errors, { prefix });
    if (typeof item.behavior === "string" && !["authorize", "exclude"].includes(item.behavior)) {
      errors.push(`${prefix}.behavior must be 'authorize' or 'exclude'.`);
    }
  });

  const ids = new Set();
  for (const [index, item] of (Array.isArray(consumers) ? consumers : []).entries()) {
    if (!item?.id || ids.has(item.id)) {
      if (item?.id) errors.push(`protectedContentConsumers[${index}].id must be unique.`);
      continue;
    }
    ids.add(item.id);
  }
}

/**
 * @param {ModuleManifest} moduleDefinition
 * @param {{ allModuleIds: Set<string>; allPermissionIds: Set<string>; }} context
 */
function validateAttachableTypeReferences(moduleDefinition, context) {
  /**
 * @type {string[]}
 */
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
      if (typeof permissionId === "string" && !context.allPermissionIds.has(permissionId)) {
        errors.push(`${moduleLabel}: ${prefix}.${fieldName} references unknown permission '${permissionId}'.`);
      }
    }
  });

  return errors;
}

/**
 * @param {unknown} help
 * @param {{ ownerId?: string, ownerType?: string, fieldName?: string, errors?: string[] }} [options]
 */
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

  validateHelpUniqueness(/** @type {import("../../types/help-static-contracts.js").HelpContribution} */ (/** @type {unknown} */ (help)), fieldName, errors);
  validateHelpArticleSections(/** @type {import("../../types/help-static-contracts.js").HelpContribution} */ (/** @type {unknown} */ (help)), fieldName, errors);

  return errors;
}

/**
 * @param {ManifestObject} item
 * @param {string} ownerId
 * @param {string} ownerType
 * @param {string[]} errors
 * @param {string} prefix
 */
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

/**
 * @param {import("../../types/help-static-contracts.js").HelpContribution} help
 * @param {string} fieldName
 * @param {string[]} errors
 */
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

/**
 * @param {import("../../types/help-static-contracts.js").HelpContribution} help
 * @param {string} fieldName
 * @param {string[]} errors
 */
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

/**
 * @param {string} label
 * @param {unknown[]} values
 * @param {string[]} errors
 */
function assertUniqueHelpValues(label, values, errors) {
  const seen = new Set();

  for (const value of values.filter(Boolean)) {
    if (seen.has(value)) {
      errors.push(`${label} '${value}' is duplicated.`);
    }
    seen.add(value);
  }
}

/**
 * @param {unknown} terminology
 * @param {string} prefix
 * @param {string[]} errors
 */
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

/**
 * @param {{}} object
 * @param {Set<string>} allowedFields
 * @param {string} prefix
 * @param {string[]} errors
 */
function validateKnownObjectFields(object, allowedFields, prefix, errors) {
  for (const fieldName of Object.keys(object)) {
    if (!allowedFields.has(fieldName)) {
      errors.push(`${prefix}.${fieldName} is not a supported field.`);
    }
  }
}

/**
 * @param {ManifestObject} object
 * @param {string} fieldName
 * @param {unknown} expectedValue
 * @param {string[]} errors
 * @param {ValidationOptions} [options]
 */
function validateModuleIdValue(object, fieldName, expectedValue, errors, options = {}) {
  requireString(object, fieldName, errors, options);
  if (object[fieldName] && object[fieldName] !== expectedValue) {
    errors.push(formatFieldName(fieldName, options.prefix) + ` must match module id '${expectedValue}'.`);
  }
}

/**
 * @param {unknown} value
 * @param {string} fieldName
 * @param {string[]} errors
 * @param {ManifestObjectValidator} validator
 */
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

/**
 * @param {unknown} value
 * @param {string} fieldName
 * @param {string[]} errors
 * @param {ManifestObjectValidator} validator
 */
function requiredArrayOfObjects(value, fieldName, errors, validator) {
  if (!Array.isArray(value)) {
    errors.push(`${fieldName} is required and must be an array.`);
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

/**
 * @param {ManifestObject} object
 * @param {string} fieldName
 * @param {string[]} errors
 * @param {ValidationOptions} [options]
 */
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

/**
 * @param {ManifestObject} object
 * @param {string} fieldName
 * @param {string[]} errors
 * @param {ValidationOptions} [options]
 */
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

/**
 * @param {ManifestObject} object
 * @param {string} fieldName
 * @param {string[]} errors
 * @param {ValidationOptions} [options]
 */
function requireBoolean(object, fieldName, errors, options = {}) {
  if (typeof object[fieldName] !== "boolean") {
    errors.push(`${formatFieldName(fieldName, options.prefix)} is required and must be a boolean.`);
  }
}

/**
 * @param {ManifestObject} object
 * @param {string} fieldName
 * @param {string[]} errors
 * @param {ValidationOptions} [options]
 */
function optionalBoolean(object, fieldName, errors, options = {}) {
  const value = object[fieldName];
  if (value !== undefined && typeof value !== "boolean") {
    errors.push(`${formatFieldName(fieldName, options.prefix)} must be a boolean.`);
  }
}

/**
 * @param {ManifestObject} object
 * @param {string} fieldName
 * @param {string[]} errors
 * @param {ValidationOptions} [options]
 */
function optionalNumber(object, fieldName, errors, options = {}) {
  const value = object[fieldName];
  if (value !== undefined && typeof value !== "number") {
    errors.push(`${formatFieldName(fieldName, options.prefix)} must be a number.`);
  }
}

/**
 * @param {ManifestObject} object
 * @param {string} fieldName
 * @param {string[]} errors
 */
function optionalArray(object, fieldName, errors) {
  const value = object[fieldName];
  if (value !== undefined && value !== null && !Array.isArray(value)) {
    errors.push(`${fieldName} must be an array.`);
  }
}

/**
 * @param {ManifestObject} object
 * @param {string} fieldName
 * @param {string[]} errors
 * @param {ValidationOptions} [options]
 */
function optionalStringArray(object, fieldName, errors, options = {}) {
  const value = object[fieldName];
  if (value === undefined) {
    return;
  }
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.trim() === "")) {
    errors.push(`${formatFieldName(fieldName, options.prefix)} must be an array of non-empty strings.`);
  }
}

/**
 * @param {ManifestObject} object
 * @param {string} fieldName
 * @param {string[]} errors
 * @param {ValidationOptions} [options]
 */
function requireStringArray(object, fieldName, errors, options = {}) {
  const value = object[fieldName];
  if (!Array.isArray(value) || value.length === 0 || value.some((item) => typeof item !== "string" || item.trim() === "")) {
    errors.push(`${formatFieldName(fieldName, options.prefix)} is required and must be a non-empty array of non-empty strings.`);
  }
}

/**
 * @param {ManifestObject} object
 * @param {string} fieldName
 * @param {string[]} errors
 * @param {ValidationOptions} [options]
 */
function requireStringArrayField(object, fieldName, errors, options = {}) {
  const value = object[fieldName];
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.trim() === "")) {
    errors.push(`${formatFieldName(fieldName, options.prefix)} is required and must be an array of non-empty strings.`);
  }
}

/**
 * @param {ManifestObject} object
 * @param {string} fieldName
 * @param {string[]} errors
 * @param {ValidationOptions} [options]
 */
function optionalPlainObject(object, fieldName, errors, options = {}) {
  const value = object[fieldName];
  if (value !== undefined && !isPlainObject(value)) {
    errors.push(`${formatFieldName(fieldName, options.prefix)} must be an object.`);
  }
}

/**
 * @param {ManifestObject} object
 * @param {string} fieldName
 * @param {string[]} errors
 * @param {ValidationOptions} [options]
 */
function optionalUrlOrString(object, fieldName, errors, options = {}) {
  const value = object[fieldName];
  if (value === undefined || (options.nullable && value === null)) {
    return;
  }
  if (!(value instanceof URL) && typeof value !== "string") {
    errors.push(`${fieldName} must be a URL or string.`);
  }
}

/**
 * @param {unknown} value
 * @param {string} fieldName
 * @param {string[]} errors
 */
function validateRelativeUrl(value, fieldName, errors) {
  if (typeof value === "string" && /^[a-z][a-z0-9+.-]*:/i.test(value)) {
    errors.push(`${fieldName} must be relative.`);
  }
}

/**
 * @param {unknown} value
 * @param {string} fieldName
 * @param {string[]} errors
 */
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

/** @param {unknown} value */
function isSafeLocalBrowserAssetPath(value) {
  const pathName = String(value || "").trim();

  return /^\/[A-Za-z0-9._/-]+$/.test(pathName) &&
    !pathName.startsWith("//") &&
    !pathName.split("/").includes("..");
}

/**
 * @param {string} fieldName
 * @param {string|undefined} prefix
 */
function formatFieldName(fieldName, prefix) {
  return prefix ? `${prefix}.${fieldName}` : fieldName;
}

/**
 * @param {unknown} value
 * @returns {value is ManifestObject}
 */
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
