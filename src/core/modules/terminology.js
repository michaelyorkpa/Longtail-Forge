const WORKSPACE_TERMINOLOGY_KEYS = ["default", "business", "personal", "family"];
const TERM_FIELD_ALIASES = {
  createButton: "createButtonLabel",
  emptyState: "emptyStateLabel",
};

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

function resolveModuleDefinitionTerminology(moduleDefinition, workspaceType) {
  const terms = resolveWorkspaceTerminology(moduleDefinition.terminology, workspaceType);
  const resolvedModule = applyTerminology(moduleDefinition, terms, { moduleLabel: true });

  return {
    ...resolvedModule,
    navigation: resolveTerminologyList(moduleDefinition.navigation, workspaceType, "navigation"),
    dashboard: resolveTerminologyList(moduleDefinition.dashboard, workspaceType),
    reporting: resolveTerminologyList(moduleDefinition.reporting, workspaceType),
    workbench: resolveTerminologyList(moduleDefinition.workbench, workspaceType),
    settings: resolveTerminologyList(moduleDefinition.settings, workspaceType),
    permissions: resolveTerminologyList(moduleDefinition.permissions, workspaceType),
    resourceDefinitions: resolveTerminologyList(moduleDefinition.resourceDefinitions, workspaceType),
    auditRecordTypes: resolveTerminologyList(moduleDefinition.auditRecordTypes, workspaceType),
    apiScopes: resolveTerminologyList(moduleDefinition.apiScopes, workspaceType),
    eventTypes: resolveTerminologyList(moduleDefinition.eventTypes, workspaceType),
    eventSummaries: resolveEventSummaries(moduleDefinition.eventSummaries, workspaceType),
    timerSources: resolveTerminologyList(moduleDefinition.timerSources, workspaceType),
    workItemSources: resolveTerminologyList(moduleDefinition.workItemSources, workspaceType),
    notificationEvents: resolveTerminologyList(moduleDefinition.notificationEvents, workspaceType),
    notificationTemplates: resolveTerminologyList(moduleDefinition.notificationTemplates, workspaceType),
    searchableTypes: resolveTerminologyList(moduleDefinition.searchableTypes, workspaceType),
    taggableTypes: resolveTerminologyList(moduleDefinition.taggableTypes, workspaceType),
    terminology: moduleDefinition.terminology,
  };
}

function resolveContributionTerminology(contribution, workspaceType, fieldName = "") {
  const contributionTerms = resolveWorkspaceTerminology(contribution.terminology, workspaceType);

  return applyTerminology(contribution, contributionTerms, { navigation: fieldName === "navigation" });
}

function resolveTerminologyList(items = [], workspaceType, fieldName = "") {
  return (items || []).map((item) => applyTerminology(
    item,
    resolveWorkspaceTerminology(item.terminology, workspaceType),
    { navigation: fieldName === "navigation" },
  ));
}

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

function applyTerminology(item = {}, terms = {}, options = {}) {
  const resolved = { ...item };
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

  return resolved;
}

function normalizeWorkspaceType(workspaceType) {
  const normalized = String(workspaceType || "").trim().toLowerCase();
  return WORKSPACE_TERMINOLOGY_KEYS.includes(normalized)
    ? normalized
    : "default";
}

export {
  WORKSPACE_TERMINOLOGY_KEYS,
  resolveContributionTerminology,
  resolveModuleDefinitionTerminology,
  resolveWorkspaceTerminology,
};
