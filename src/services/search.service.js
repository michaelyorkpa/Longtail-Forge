import { modulesService } from "../core/modules/modules.service.js";
import {
  getSearchBackendAdapter,
  listSearchBackendAdapters,
  SQLITE_SEARCH_ADAPTER_ID,
} from "../core/search/adapters/registry.js";
import { hasSearchIndexer, listSearchIndexerIds } from "../core/search/indexer-registry.js";
import { AppError } from "../utils/app-error.js";

const SEARCH_SERVICE_VERSION = "0.32.6.7";

const SEARCH_CAPABILITIES = Object.freeze({
  owner: "framework",
  serviceVersion: SEARCH_SERVICE_VERSION,
  workspaceAware: true,
  moduleAware: true,
  permissionAware: true,
  tagAware: true,
  notificationRecordSearchDeferred: true,
  globalApiEnabled: false,
  globalBrowserUiEnabled: false,
  recordIndexingEnabled: false,
  rebuildToolsEnabled: false,
  adapterBacked: true,
  canonicalIndexEnabled: true,
  canonicalIndexTable: "search_index",
  prototypeIndexWritesEnabled: true,
  prototypeSearchEnabled: true,
  defaultAdapterId: SQLITE_SEARCH_ADAPTER_ID,
  backendNeutralQueryModel: true,
  disabledModulesHiddenFromActiveSearch: true,
  metadataSemantics: Object.freeze({
    visibility: "search_visibility_metadata_not_permission_source",
    recordStatus: "search_filter_metadata_not_universal_workflow_state",
    source: "display_source_label_not_permission_source",
    tags: "canonical_tag_assignments_for_exact_filtering",
  }),
});

const DECLARATION_STRING_FIELDS = [
  "recordType",
  "moduleId",
  "idField",
  "titleField",
  "summaryField",
  "workspaceField",
  "requiredReadPermission",
  "indexer",
];

function getCapabilities() {
  return {
    ...SEARCH_CAPABILITIES,
    availableAdapters: listSearchBackendAdapters(),
    registeredIndexerIds: listSearchIndexerIds(),
  };
}

async function getRuntimeCapabilities(options = {}) {
  const adapterId = options.adapterId || SQLITE_SEARCH_ADAPTER_ID;
  const adapter = getSearchBackendAdapter(adapterId);

  if (!adapter) {
    throw new AppError(`Search backend adapter '${adapterId}' is not registered.`, 500);
  }

  const backend = await adapter.getCapabilities({ refresh: options.refresh === true });

  return {
    ...getCapabilities(),
    backend,
  };
}

async function ensureSearchBackendStorage(options = {}) {
  const adapterId = options.adapterId || SQLITE_SEARCH_ADAPTER_ID;
  const adapter = getSearchBackendAdapter(adapterId);

  if (!adapter?.ensureStorage) {
    throw new AppError(`Search backend adapter '${adapterId}' does not expose storage setup.`, 500);
  }

  return adapter.ensureStorage({ refresh: options.refresh === true });
}

function listSearchableTypes() {
  return modulesService.listSearchableTypes().map(normalizeSearchableType);
}

async function listActiveSearchableTypes(workspaceId) {
  return (await modulesService.listActiveSearchableTypes(workspaceId)).map(normalizeSearchableType);
}

function validateSearchableTypeDeclaration(declaration, options = {}) {
  const errors = [];
  const normalized = normalizeSearchableType(declaration);

  if (!isPlainObject(declaration)) {
    return {
      valid: false,
      errors: ["Searchable type declaration must be a plain object."],
      declaration: normalized,
    };
  }

  for (const fieldName of DECLARATION_STRING_FIELDS) {
    if (typeof declaration[fieldName] !== "string" || !declaration[fieldName].trim()) {
      errors.push(`${fieldName} is required and must be a non-empty string.`);
    }
  }

  if (declaration.indexer !== undefined && typeof declaration.indexer !== "string") {
    errors.push("indexer must be a framework search indexer registry ID, not a direct function reference.");
  }

  if (declaration.bodyFields !== undefined) {
    if (!Array.isArray(declaration.bodyFields) || declaration.bodyFields.length === 0) {
      errors.push("bodyFields must be a non-empty array when provided.");
    } else if (declaration.bodyFields.some((fieldName) => typeof fieldName !== "string" || !fieldName.trim())) {
      errors.push("bodyFields must contain only non-empty strings.");
    }
  } else {
    errors.push("bodyFields is required and must be a non-empty array.");
  }

  for (const fieldName of [
    "label",
    "description",
    "clientField",
    "projectField",
    "tagsTextField",
    "visibilityField",
    "recordStatusField",
    "sourceLabel",
  ]) {
    if (declaration[fieldName] !== undefined && typeof declaration[fieldName] !== "string") {
      errors.push(`${fieldName} must be a string when provided.`);
    }
  }

  if (declaration.requiredModules !== undefined) {
    if (!Array.isArray(declaration.requiredModules)) {
      errors.push("requiredModules must be an array of non-empty strings when provided.");
    } else if (declaration.requiredModules.some((moduleId) => typeof moduleId !== "string" || !moduleId.trim())) {
      errors.push("requiredModules must contain only non-empty strings.");
    }
  }

  if (options.requireRegisteredIndexer && declaration.indexer && !hasSearchIndexer(declaration.indexer)) {
    errors.push(`indexer '${declaration.indexer}' is not registered.`);
  }

  return {
    valid: errors.length === 0,
    errors,
    declaration: normalized,
  };
}

function validateSearchableTypeDeclarations(declarations = [], options = {}) {
  const errors = [];
  const seenRecordTypes = new Set();

  for (const [index, declaration] of declarations.entries()) {
    const result = validateSearchableTypeDeclaration(declaration, options);

    for (const error of result.errors) {
      errors.push(`searchableTypes[${index}]: ${error}`);
    }

    if (result.declaration.recordType) {
      if (seenRecordTypes.has(result.declaration.recordType)) {
        errors.push(`searchableTypes[${index}]: recordType '${result.declaration.recordType}' is duplicated.`);
      }
      seenRecordTypes.add(result.declaration.recordType);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

function composePermissionSafeSearchFilters({ session, searchableType, filters = {} }) {
  if (!session?.workspace_id) {
    throw new AppError("Search requires an active workspace session.", 400);
  }

  const validation = validateSearchableTypeDeclaration(searchableType);
  if (!validation.valid) {
    throw new AppError(`Invalid searchable type declaration: ${validation.errors.join("; ")}`, 500);
  }

  const declaration = validation.declaration;
  const workspaceId = filters.workspaceId || filters.workspace_id || session.workspace_id;

  if (workspaceId !== session.workspace_id) {
    throw new AppError("Search filters must stay inside the active workspace.", 403);
  }

  return {
    workspaceId,
    moduleId: declaration.moduleId,
    recordType: declaration.recordType,
    requiredReadPermission: declaration.requiredReadPermission,
    requiredModules: [...declaration.requiredModules],
    text: typeof filters.text === "string" ? filters.text.trim() : "",
    scopes: {
      clientId: filters.clientId || filters.client_id || null,
      projectId: filters.projectId || filters.project_id || null,
    },
    exactTagIds: normalizeIdList(filters.tagIds || filters.tag_ids),
    recordStatus: normalizeNullableString(filters.recordStatus || filters.record_status || filters.status),
    status: normalizeNullableString(filters.recordStatus || filters.record_status || filters.status),
    visibility: filters.visibility || null,
    source: null,
    permissionFilterRequired: true,
    moduleMustBeEnabled: true,
    tagFilterSource: "canonical_tag_assignments",
    metadataSemantics: SEARCH_CAPABILITIES.metadataSemantics,
    declaration,
  };
}

async function composePermissionSafeSearchRequest({ session, filters = {} } = {}) {
  if (!session?.workspace_id) {
    throw new AppError("Search requires an active workspace session.", 400);
  }

  const workspaceId = filters.workspaceId || filters.workspace_id || session.workspace_id;

  if (workspaceId !== session.workspace_id) {
    throw new AppError("Search filters must stay inside the active workspace.", 403);
  }

  const allowedModuleIds = new Set(normalizeFilterList(filters.moduleIds || filters.module_ids || filters.moduleId || filters.module_id));
  const allowedRecordTypes = new Set(normalizeFilterList(
    filters.recordTypes || filters.record_types || filters.recordType || filters.record_type,
  ));
  const activeSearchableTypes = await listActiveSearchableTypes(workspaceId);
  const targets = activeSearchableTypes
    .filter((declaration) => allowedModuleIds.size === 0 || allowedModuleIds.has(declaration.moduleId))
    .filter((declaration) => allowedRecordTypes.size === 0 || allowedRecordTypes.has(declaration.recordType))
    .map((declaration) => composePermissionSafeSearchFilters({
      session,
      searchableType: declaration,
      filters,
    }))
    .map(({ declaration, ...target }) => ({
      ...target,
      sourceLabel: declaration.sourceLabel || declaration.label || declaration.moduleId,
      fields: {
        id: declaration.idField,
        title: declaration.titleField,
        summary: declaration.summaryField,
        body: [...declaration.bodyFields],
        workspace: declaration.workspaceField,
        client: declaration.clientField || null,
        project: declaration.projectField || null,
        tagsText: declaration.tagsTextField || null,
        visibility: declaration.visibilityField || null,
        recordStatus: declaration.recordStatusField || null,
      },
    }));

  return {
    workspaceId,
    backendNeutral: true,
    adapterSyntax: null,
    text: typeof filters.text === "string" ? filters.text.trim() : "",
    scopes: {
      clientId: filters.clientId || filters.client_id || null,
      projectId: filters.projectId || filters.project_id || null,
    },
    exactTagIds: normalizeIdList(filters.tagIds || filters.tag_ids),
    recordStatus: normalizeNullableString(filters.recordStatus || filters.record_status || filters.status),
    visibility: normalizeNullableString(filters.visibility),
    disabledModulePolicy: "hide_active_search_results",
    permissionPolicy: "require_declared_read_permission_per_target",
    tagFilterSource: "canonical_tag_assignments",
    metadataSemantics: SEARCH_CAPABILITIES.metadataSemantics,
    targets,
  };
}

async function upsertSearchDocuments(documents = [], options = {}) {
  const adapterId = options.adapterId || SQLITE_SEARCH_ADAPTER_ID;
  const adapter = getSearchBackendAdapter(adapterId);

  if (!adapter?.upsertDocuments) {
    throw new AppError(`Search backend adapter '${adapterId}' does not support prototype search index writes.`, 500);
  }

  return adapter.upsertDocuments(documents, options);
}

async function executeSearch(request, options = {}) {
  const adapterId = options.adapterId || SQLITE_SEARCH_ADAPTER_ID;
  const adapter = getSearchBackendAdapter(adapterId);

  if (!adapter?.search) {
    throw new AppError(`Search backend adapter '${adapterId}' does not support prototype search execution.`, 500);
  }

  return adapter.search(request, options);
}

function normalizeSearchableType(declaration = {}) {
  return {
    recordType: normalizeString(declaration.recordType),
    moduleId: normalizeString(declaration.moduleId),
    label: normalizeString(declaration.label),
    description: normalizeString(declaration.description),
    idField: normalizeString(declaration.idField),
    titleField: normalizeString(declaration.titleField),
    summaryField: normalizeString(declaration.summaryField),
    bodyFields: Array.isArray(declaration.bodyFields)
      ? declaration.bodyFields.map(normalizeString).filter(Boolean)
      : [],
    workspaceField: normalizeString(declaration.workspaceField),
    clientField: normalizeString(declaration.clientField),
    projectField: normalizeString(declaration.projectField),
    requiredReadPermission: normalizeString(declaration.requiredReadPermission),
    indexer: normalizeString(declaration.indexer),
    requiredModules: Array.isArray(declaration.requiredModules)
      ? declaration.requiredModules.map(normalizeString).filter(Boolean)
      : [],
    tagsTextField: normalizeString(declaration.tagsTextField),
    visibilityField: normalizeString(declaration.visibilityField),
    recordStatusField: normalizeString(declaration.recordStatusField),
    sourceLabel: normalizeString(declaration.sourceLabel),
  };
}

function normalizeSearchDocument(searchableType, document = {}) {
  const validation = validateSearchableTypeDeclaration(searchableType);

  if (!validation.valid) {
    throw new AppError(`Invalid searchable type declaration: ${validation.errors.join("; ")}`, 500);
  }

  const declaration = validation.declaration;
  const recordId = normalizeString(document.recordId || document.record_id || document[declaration.idField]);
  const workspaceId = normalizeString(document.workspaceId || document.workspace_id || document[declaration.workspaceField]);
  const moduleId = normalizeString(document.moduleId || document.module_id || declaration.moduleId);
  const recordType = normalizeString(document.recordType || document.record_type || declaration.recordType);
  const title = normalizeString(document.title || document[declaration.titleField]);
  const summary = normalizeString(document.summary || document[declaration.summaryField]);
  const body = normalizeBody(document.body, document, declaration.bodyFields);
  const errors = [];

  for (const [fieldName, value] of Object.entries({
    workspaceId,
    moduleId,
    recordType,
    recordId,
  })) {
    if (!value) {
      errors.push(`${fieldName} is required.`);
    }
  }

  if (moduleId && moduleId !== declaration.moduleId) {
    errors.push(`moduleId must match searchable declaration module '${declaration.moduleId}'.`);
  }
  if (recordType && recordType !== declaration.recordType) {
    errors.push(`recordType must match searchable declaration record type '${declaration.recordType}'.`);
  }

  if (errors.length > 0) {
    throw new AppError(`Invalid search document: ${errors.join(" ")}`, 400);
  }

  return {
    search_index_id: normalizeString(document.searchIndexId || document.search_index_id) ||
      `${workspaceId}:${moduleId}:${recordType}:${recordId}`,
    workspace_id: workspaceId,
    module_id: moduleId,
    record_type: recordType,
    record_id: recordId,
    title,
    summary,
    body,
    tags_text: normalizeTagsText(document.tagsText || document.tags_text || document[declaration.tagsTextField]),
    client_id: normalizeNullableString(document.clientId || document.client_id || document[declaration.clientField]),
    project_id: normalizeNullableString(document.projectId || document.project_id || document[declaration.projectField]),
    visibility: normalizeString(document.visibility || document[declaration.visibilityField]) || "normal",
    record_status: normalizeString(document.recordStatus || document.record_status || document[declaration.recordStatusField]) || "active",
    source: normalizeString(document.source || declaration.sourceLabel || declaration.label || declaration.moduleId),
    record_created_at: normalizeNullableString(document.recordCreatedAt || document.record_created_at || document.created_at),
    record_updated_at: normalizeNullableString(document.recordUpdatedAt || document.record_updated_at || document.updated_at),
    indexed_at: normalizeString(document.indexedAt || document.indexed_at) || new Date().toISOString(),
  };
}

function normalizeIdList(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => String(item || "").trim())
    .filter(Boolean);
}

function normalizeFilterList(value) {
  if (Array.isArray(value)) {
    return normalizeIdList(value);
  }

  return normalizeString(value) ? [normalizeString(value)] : [];
}

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeNullableString(value) {
  const normalized = normalizeString(value);
  return normalized || null;
}

function normalizeBody(value, document, bodyFields) {
  if (typeof value === "string") {
    return value.trim();
  }

  return bodyFields
    .map((fieldName) => normalizeString(document[fieldName]))
    .filter(Boolean)
    .join("\n");
}

function normalizeTagsText(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => typeof item === "string" ? item.trim() : normalizeString(item?.name || item?.slug))
      .filter(Boolean)
      .join(" ");
  }

  return normalizeString(value);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype;
}

export const searchService = {
  composePermissionSafeSearchRequest,
  composePermissionSafeSearchFilters,
  ensureSearchBackendStorage,
  executeSearch,
  getCapabilities,
  getRuntimeCapabilities,
  listActiveSearchableTypes,
  listSearchableTypes,
  normalizeSearchDocument,
  upsertSearchDocuments,
  validateSearchableTypeDeclaration,
  validateSearchableTypeDeclarations,
};
