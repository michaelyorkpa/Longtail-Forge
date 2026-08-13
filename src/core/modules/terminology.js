/** @typedef {import("../../types/framework-contracts.js").TerminologyMap} TerminologyMap */
/** @typedef {import("../../types/framework-contracts.js").ModuleManifest} ModuleManifest */
/** @typedef {import("../../types/framework-contracts.js").EventSummaryDeclaration} EventSummaryDeclaration */
/** @typedef {import("../../types/framework-contracts.js").ViewSurfaceDescriptor} ViewSurfaceDescriptor */

/** @type {readonly ("default" | "business" | "personal" | "family")[]} */
const WORKSPACE_TERMINOLOGY_KEYS = ["default", "business", "personal", "family"];
/** @type {Record<string, string>} */
const TERM_FIELD_ALIASES = {
  createButton: "createButtonLabel",
  emptyState: "emptyStateLabel",
};
/** @type {Record<string, string>} */
const TERM_FIELD_REVERSE_ALIASES = Object.fromEntries(
  Object.entries(TERM_FIELD_ALIASES).map(([sourceField, targetField]) => [targetField, sourceField]),
);

/** @param {TerminologyMap} [terminology] @param {unknown} [workspaceType] @returns {Record<string, string>} */
function resolveWorkspaceTerminology(terminology = {}, workspaceType = "default") {
  const normalizedWorkspaceType = normalizeWorkspaceType(workspaceType);
  const resolved = {
    ...(terminology.default || {}),
  };

  if (normalizedWorkspaceType === "family") {
    Object.assign(resolved, terminology.personal || {});
  }

  Object.assign(resolved, terminology[normalizedWorkspaceType] || {});

  return resolved;
}

/**
 * @template {object} Definition
 * @param {Definition} moduleDefinition
 * @param {string} workspaceType
 * @returns {Definition & {publicApiEndpoints: import("../../types/framework-contracts.js").PublicApiEndpointContribution[], viewSurfaces: ViewSurfaceDescriptor[]}}
 */
function resolveModuleDefinitionTerminology(moduleDefinition, workspaceType) {
  const manifest = /** @type {ModuleManifest} */ (/** @type {unknown} */ (moduleDefinition));
  const terms = resolveWorkspaceTerminology(manifest.terminology, workspaceType);
  const resolvedModule = applyTerminology(manifest, terms, { moduleLabel: true });

  return /** @type {Definition & {publicApiEndpoints: import("../../types/framework-contracts.js").PublicApiEndpointContribution[], viewSurfaces: ViewSurfaceDescriptor[]}} */ (/** @type {unknown} */ ({
    ...resolvedModule,
    navigation: resolveTerminologyList(manifest.navigation, workspaceType, "navigation"),
    dashboard: resolveTerminologyList(manifest.dashboard, workspaceType),
    reporting: resolveTerminologyList(manifest.reporting, workspaceType),
    workbench: resolveTerminologyList(manifest.workbench, workspaceType),
    settings: resolveTerminologyList(manifest.settings, workspaceType),
    permissions: resolveTerminologyList(manifest.permissions, workspaceType),
    resourceDefinitions: resolveTerminologyList(manifest.resourceDefinitions, workspaceType),
    auditRecordTypes: resolveTerminologyList(manifest.auditRecordTypes, workspaceType),
    apiScopes: resolveTerminologyList(manifest.apiScopes, workspaceType),
    eventTypes: resolveTerminologyList(manifest.eventTypes, workspaceType),
    eventSummaries: resolveEventSummaries(
      /** @type {readonly import("../../types/framework-contracts.js").EventSummaryDeclaration[] | undefined} */ (
        Array.isArray(manifest.eventSummaries) ? manifest.eventSummaries : undefined
      ),
      workspaceType,
    ),
    timerSources: resolveTerminologyList(manifest.timerSources, workspaceType),
    workItemSources: resolveTerminologyList(manifest.workItemSources, workspaceType),
    notificationEvents: resolveTerminologyList(manifest.notificationEvents, workspaceType),
    notificationTemplates: resolveTerminologyList(manifest.notificationTemplates, workspaceType),
    searchableTypes: resolveTerminologyList(manifest.searchableTypes, workspaceType),
    taggableTypes: resolveTerminologyList(manifest.taggableTypes, workspaceType),
    publicApiEndpoints: [...(/** @type {import("../../types/framework-contracts.js").PublicApiEndpointContribution[]} */ (manifest.publicApiEndpoints || []))],
    viewSurfaces: resolveViewSurfaceTerminologyList(manifest.viewSurfaces, terms),
    terminology: manifest.terminology,
  }));
}

/**
 * @template {object} Contribution
 * @param {Contribution} contribution
 * @param {string} workspaceType
 * @param {string} [fieldName]
 * @returns {Contribution}
 */
function resolveContributionTerminology(contribution, workspaceType, fieldName = "") {
  const contributionTerms = resolveWorkspaceTerminology(readTerminology(contribution), workspaceType);

  return applyTerminology(contribution, contributionTerms, { navigation: fieldName === "navigation" });
}

/**
 * @template Contribution
 * @param {readonly Contribution[] | undefined} items
 * @param {unknown} workspaceType
 * @param {string} [fieldName]
 * @returns {Contribution[]}
 */
function resolveTerminologyList(items = [], workspaceType, fieldName = "") {
  return (items || []).map((item) => {
    if (!item || typeof item !== "object") {
      return item;
    }
    return /** @type {Contribution} */ (applyTerminology(
      item,
      resolveWorkspaceTerminology(readTerminology(item), workspaceType),
      { navigation: fieldName === "navigation" },
    ));
  });
}

/** @param {readonly EventSummaryDeclaration[] | undefined} [eventSummaries] @param {unknown} [workspaceType] @returns {EventSummaryDeclaration[]} */
function resolveEventSummaries(eventSummaries = [], workspaceType) {
  return (eventSummaries || []).map((summary) => {
    const resolved = applyTerminology(summary, resolveWorkspaceTerminology(summary.terminology, workspaceType));

    return {
      ...resolved,
      activity: summary.activity
        ? applyTerminology(summary.activity, resolveWorkspaceTerminology(summary.activity.terminology, workspaceType))
        : summary.activity,
      notification: summary.notification
        ? applyTerminology(summary.notification, resolveWorkspaceTerminology(summary.notification.terminology, workspaceType))
        : summary.notification,
    };
  });
}

/** @param {readonly ViewSurfaceDescriptor[] | undefined} [viewSurfaces] @param {Record<string, string>} [terms] @returns {ViewSurfaceDescriptor[]} */
function resolveViewSurfaceTerminologyList(viewSurfaces = [], terms = {}) {
  return (viewSurfaces || []).map((surface) => /** @type {ViewSurfaceDescriptor} */ (resolveDescriptorTerminology(surface, terms)));
}

/** @param {unknown} value @param {Record<string, string>} [terms] @returns {unknown} */
function resolveDescriptorTerminology(value, terms = {}) {
  if (Array.isArray(value)) {
    return value.map((item) => resolveDescriptorTerminology(item, terms));
  }

  if (!isPlainObject(value)) {
    return value;
  }

  /** @type {Record<string, unknown>} */
  const resolved = {};
  for (const [fieldName, fieldValue] of Object.entries(value)) {
    resolved[fieldName] = resolveDescriptorTerminology(fieldValue, terms);
  }

  applyDescriptorTerm(resolved, "label", "labelKey", terms);
  applyDescriptorTerm(resolved, "title", "titleKey", terms);
  applyDescriptorTerm(resolved, "description", "descriptionKey", terms);

  return resolved;
}

/** @param {Record<string, unknown>} object @param {string} valueField @param {string} keyField @param {Record<string, string>} terms */
function applyDescriptorTerm(object, valueField, keyField, terms) {
  const termKey = object[keyField];
  if (typeof termKey !== "string") {
    return;
  }

  const aliasKey = TERM_FIELD_REVERSE_ALIASES[termKey];
  const resolvedTerm = terms[termKey] || terms[aliasKey];
  if (resolvedTerm) {
    object[valueField] = resolvedTerm;
  }
}

/**
 * @template {object} Item
 * @param {Item} item
 * @param {Record<string, string>} [terms]
 * @param {{ navigation?: boolean, moduleLabel?: boolean }} [options]
 * @returns {Item}
 */
function applyTerminology(item, terms = {}, options = {}) {
  const resolved = /** @type {Record<string, unknown>} */ ({ ...item });
  const label = options.navigation
    ? terms.navigationLabel || terms.label
    : terms.label;

  if (label) {
    resolved.label = label;
    if (options.moduleLabel) {
      resolved.name = label;
      resolved.displayName = label;
    }
  }

  for (const [termField, value] of Object.entries(terms)) {
    if (!value || termField === "label" || termField === "navigationLabel") {
      continue;
    }

    const targetField = TERM_FIELD_ALIASES[termField] || termField;
    resolved[targetField] = value;
  }

  return /** @type {Item} */ (resolved);
}

/** @param {object} value @returns {TerminologyMap | undefined} */
function readTerminology(value) {
  if (!("terminology" in value) || !value.terminology || typeof value.terminology !== "object") {
    return undefined;
  }
  return /** @type {TerminologyMap} */ (value.terminology);
}

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype;
}

/**
 * @param {unknown} workspaceType
 * @returns {"default" | "business" | "personal" | "family"}
 */
function normalizeWorkspaceType(workspaceType) {
  const normalized = String(workspaceType || "").trim().toLowerCase();
  if (normalized === "business" || normalized === "personal" || normalized === "family") {
    return normalized;
  }
  return "default";
}

export {
  WORKSPACE_TERMINOLOGY_KEYS,
  resolveContributionTerminology,
  resolveDescriptorTerminology,
  resolveModuleDefinitionTerminology,
  resolveWorkspaceTerminology,
};
