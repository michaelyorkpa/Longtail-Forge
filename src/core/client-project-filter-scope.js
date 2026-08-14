import { clientsRepository } from "../modules/client-projects/clients.repo.js";
import { projectsRepository } from "../modules/client-projects/projects.repo.js";
import { settingsRepository } from "../repositories/settings.repo.js";
import { permissionsService } from "../services/permissions.service.js";

const FILTER_SCOPE_MODES = Object.freeze({
  all: "all",
  blank: "blank",
  ids: "ids",
});

/** @typedef {"all" | "blank" | "ids"} FilterScopeMode */
/** @typedef {{ hasClientFilter?: boolean, hasProjectFilter?: boolean, clientId?: unknown, projectId?: unknown }} ClientProjectFilterOptions */
/** @typedef {{ id: string, parent_client_id?: unknown } & Record<string, unknown>} ScopedClientRecord */
/** @typedef {{ id: string, client_id?: unknown, parent_project_id?: unknown } & Record<string, unknown>} ScopedProjectRecord */
/** @typedef {{ clientFilterMode: FilterScopeMode, clientId: string, clientIds: string[], clientProjectIds: string[], hasClientFilter: boolean, hasProjectFilter: boolean, omitClientFilterBecauseProjectSelected: boolean, projectFilterMode: FilterScopeMode, projectId: string, projectIds: string[], usesClientScope: boolean, workspaceType: string }} ClientProjectFilterScope */

/** @param {import("../types/http-contracts.js").AuthorizationSession & {workspace_id: string}} session @param {ClientProjectFilterOptions} [options] @returns {Promise<ClientProjectFilterScope>} */
async function resolveClientProjectFilterScope(session, options = {}) {
  const workspaceId = String(session?.workspace_id || "").trim();
  const settings = workspaceId
    ? await settingsRepository.readWorkspaceSettings(workspaceId)
    : { workspaceType: "business" };
  const workspaceType = normalizeWorkspaceType(settings?.workspaceType);
  const usesClientScope = workspaceType === "business";
  const hasClientFilter = Boolean(options.hasClientFilter) && usesClientScope;
  const hasProjectFilter = Boolean(options.hasProjectFilter);
  const clientId = normalizeFilterValue(options.clientId);
  const projectId = normalizeFilterValue(options.projectId);
  const clientFilterMode = resolveFilterMode(clientId, hasClientFilter);
  const projectFilterMode = resolveFilterMode(projectId, hasProjectFilter);
  /** @type {ClientProjectFilterScope} */
  const scope = {
    clientFilterMode,
    clientId,
    clientIds: [],
    clientProjectIds: [],
    hasClientFilter: hasClientFilter && clientFilterMode !== FILTER_SCOPE_MODES.all,
    hasProjectFilter: hasProjectFilter && projectFilterMode !== FILTER_SCOPE_MODES.all,
    omitClientFilterBecauseProjectSelected: projectFilterMode === FILTER_SCOPE_MODES.ids,
    projectFilterMode,
    projectId,
    projectIds: [],
    usesClientScope,
    workspaceType,
  };

  if (
    (!scope.hasClientFilter || clientFilterMode !== FILTER_SCOPE_MODES.ids) &&
    (!scope.hasProjectFilter || projectFilterMode !== FILTER_SCOPE_MODES.ids)
  ) {
    return scope;
  }

  const needsClients = scope.hasClientFilter && clientFilterMode === FILTER_SCOPE_MODES.ids;
  const needsProjects = needsClients || (scope.hasProjectFilter && projectFilterMode === FILTER_SCOPE_MODES.ids);
  const [clients, projects] = await Promise.all([
    needsClients ? clientsRepository.readAll(workspaceId) : [],
    needsProjects ? projectsRepository.readAll(workspaceId) : [],
  ]);
  const [readableClients, readableProjects] = await Promise.all([
    needsClients ? permissionsService.filterReadableClients(session, clients) : [],
    needsProjects ? permissionsService.filterReadableProjects(session, projects) : [],
  ]);
  const readableClientIds = new Set(/** @type {ScopedClientRecord[]} */ (readableClients || []).map((client) => client.id));
  const readableProjectIds = new Set(/** @type {ScopedProjectRecord[]} */ (readableProjects || []).map((project) => project.id));

  if (scope.hasClientFilter && clientFilterMode === FILTER_SCOPE_MODES.ids) {
    const scopedClientIds = collectScopedIds(clients, clientId, "id", "parent_client_id");
    scope.clientIds = scopedClientIds.filter((id) => readableClientIds.has(id));
    scope.clientProjectIds = projects
      .filter((project) => scopedClientIds.includes(String(project.client_id || "").trim()))
      .map((project) => String(project.id || "").trim())
      .filter((id) => readableProjectIds.has(id));
  }

  if (scope.hasProjectFilter && projectFilterMode === FILTER_SCOPE_MODES.ids) {
    const scopedProjectIds = collectScopedIds(projects, projectId, "id", "parent_project_id");
    scope.projectIds = scopedProjectIds.filter((id) => readableProjectIds.has(id));
  }

  return scope;
}

/**
 * @param {string} value
 * @param {boolean} hasFilter
 */
function resolveFilterMode(value, hasFilter) {
  if (!hasFilter || value === "all") {
    return FILTER_SCOPE_MODES.all;
  }
  if (!value) {
    return FILTER_SCOPE_MODES.blank;
  }
  return FILTER_SCOPE_MODES.ids;
}

/** @param {Record<string, unknown>[]} [records] @param {unknown} [selectedId] @param {string} [idField] @param {string} [parentField] */
function collectScopedIds(records = [], selectedId = "", idField = "id", parentField = "parent_id") {
  const normalizedSelectedId = String(selectedId || "").trim();

  if (!normalizedSelectedId) {
    return [];
  }

  const descendants = collectDescendantIds(records, normalizedSelectedId, idField, parentField);
  return [normalizedSelectedId, ...descendants];
}

/** @param {Record<string, unknown>[]} [records] @param {unknown} [recordId] @param {string} [idField] @param {string} [parentField] */
function collectDescendantIds(records = [], recordId = "", idField = "id", parentField = "parent_id") {
  const normalizedRecordId = String(recordId || "").trim();

  if (!normalizedRecordId) {
    return [];
  }

  /** @type {string[]} */
  const descendants = [];
  /** @type {Set<string>} */
  const visited = new Set();
  const pending = [normalizedRecordId];

  while (pending.length > 0) {
    const currentId = pending.pop();

    for (const record of records || []) {
      const parentId = String(record?.[parentField] || "").trim();
      const candidateId = String(record?.[idField] || "").trim();

      if (!candidateId || parentId !== currentId || visited.has(candidateId)) {
        continue;
      }

      visited.add(candidateId);
      descendants.push(candidateId);
      pending.push(candidateId);
    }
  }

  return descendants;
}

/** @param {unknown} value */
function normalizeFilterValue(value) {
  return String(value || "").trim();
}

/**
 * @param {string} workspaceType
 */
function normalizeWorkspaceType(workspaceType) {
  return String(workspaceType || "").trim().toLowerCase() || "business";
}

export {
  FILTER_SCOPE_MODES,
  resolveClientProjectFilterScope,
};
