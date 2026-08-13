import { clientsService } from "../modules/client-projects/clients.service.js";
import { clientsRepository } from "../modules/client-projects/clients.repo.js";
import { projectsRepository } from "../modules/client-projects/projects.repo.js";
import { settingsRepository } from "../repositories/settings.repo.js";
import { AppError } from "../utils/app-error.js";

/** @typedef {import("../types/http-contracts.js").ApiSession} PublicApiContext */
/** @typedef {{ limit?: unknown, offset?: unknown } & Record<string, unknown>} PublicApiQuery */
/** @typedef {{ action?: string } & Record<string, unknown>} PublicApiMutationPayload */

/** @param {PublicApiContext} context @param {PublicApiQuery} query */
async function listClients(context, query) {
  await assertBusinessWorkspace(context);
  const { clients } = await clientsService.listClients(context, query);
  return paged(clients.map((client) => withWorkspaceAlias(client, context)), query);
}

/** @param {PublicApiContext} context @param {string} clientId */
async function readClient(context, clientId) {
  await assertBusinessWorkspace(context);
  const client = await clientsRepository.readById(context.workspace_id, decodeURIComponent(clientId || ""));

  if (!client) {
    throw new AppError("Client was not found.", 404);
  }

  return withWorkspaceAlias(client, context);
}

/** @param {PublicApiContext} context @param {unknown} rawPayload */
async function createClient(context, rawPayload) {
  const payload = /** @type {PublicApiMutationPayload} */ (rawPayload && typeof rawPayload === "object" ? rawPayload : {});
  const result = await clientsService.createClient({
    ...payload,
    action: payload?.action || "public_api_client_created",
  }, context);

  return withWorkspaceAlias(result.client, context);
}

/** @param {PublicApiContext} context @param {string} clientId @param {unknown} rawPayload */
async function updateClient(context, clientId, rawPayload) {
  const payload = /** @type {PublicApiMutationPayload} */ (rawPayload && typeof rawPayload === "object" ? rawPayload : {});
  const result = await clientsService.updateClient(clientId, {
    ...payload,
    action: payload?.action || "public_api_client_updated",
  }, context);

  return withWorkspaceAlias(result.client, context);
}

/** @param {PublicApiContext} context @param {string} clientId */
async function archiveClient(context, clientId) {
  const result = await clientsService.archiveClient(clientId, {
    action: "public_api_client_archived",
  }, context);

  return withWorkspaceAlias(result, context);
}

/** @param {PublicApiContext} context */
async function assertBusinessWorkspace(context) {
  const settings = await settingsRepository.readWorkspaceSettings(context.workspace_id);

  if (settings.workspaceType === "business") {
    return;
  }

  throw new AppError("Clients are only available in Business workspaces.", 403);
}

/** @param {PublicApiContext} context @param {PublicApiQuery} query */
async function listProjects(context, query) {
  const { projects } = await clientsService.listProjects(context, query);
  return paged(projects.map((project) => withWorkspaceAlias(project, context)), query);
}

/** @param {PublicApiContext} context @param {string} projectId */
async function readProject(context, projectId) {
  const project = await projectsRepository.readById(context.workspace_id, decodeURIComponent(projectId || ""));

  if (!project) {
    throw new AppError("Project was not found.", 404);
  }

  return withWorkspaceAlias(project, context);
}

/** @param {PublicApiContext} context @param {unknown} rawPayload @param {string} [clientId] */
async function createProject(context, rawPayload, clientId = "") {
  const payload = /** @type {PublicApiMutationPayload} */ (rawPayload && typeof rawPayload === "object" ? rawPayload : {});
  const result = await clientsService.createProject(clientId, {
    ...payload,
    action: payload?.action || "public_api_project_created",
  }, context);

  return withWorkspaceAlias(result.project, context);
}

/** @param {PublicApiContext} context @param {string} projectId @param {unknown} rawPayload */
async function updateProject(context, projectId, rawPayload) {
  const payload = /** @type {PublicApiMutationPayload} */ (rawPayload && typeof rawPayload === "object" ? rawPayload : {});
  const result = await clientsService.updateProject(projectId, {
    ...payload,
    action: payload?.action || "public_api_project_updated",
  }, context);

  return withWorkspaceAlias(result.project, context);
}

/** @param {PublicApiContext} context @param {string} projectId */
async function archiveProject(context, projectId) {
  const result = await clientsService.archiveProject(projectId, {
    action: "public_api_project_archived",
  }, context);

  return withWorkspaceAlias(result, context);
}

/**
 * @template RecordValue
 * @param {RecordValue} record
 * @param {PublicApiContext} context
 * @returns {RecordValue extends object ? RecordValue & { workspace_id: unknown, projects?: unknown } : RecordValue}
 */
function withWorkspaceAlias(record, context) {
  if (!record || typeof record !== "object") {
    return /** @type {RecordValue extends object ? RecordValue & { workspace_id: unknown, projects?: unknown } : RecordValue} */ (record);
  }

  const source = /** @type {Record<string, unknown>} */ (record);
  const workspaceId = source.workspace_id || context.workspace_id;

  return /** @type {RecordValue extends object ? RecordValue & { workspace_id: unknown, projects?: unknown } : RecordValue} */ ({
    ...source,
    workspace_id: workspaceId,
    projects: Array.isArray(source.projects)
      ? source.projects.map((project) => withWorkspaceAlias(project, context))
      : source.projects,
  });
}

/** @template Item @param {Item[]} items @param {PublicApiQuery} query */
function paged(items, query) {
  const limit = clampInteger(query.limit, 1, 100, 50);
  const offset = clampInteger(query.offset, 0, Number.MAX_SAFE_INTEGER, 0);

  return {
    data: items.slice(offset, offset + limit),
    pagination: {
      limit,
      offset,
      total: items.length,
      has_more: offset + limit < items.length,
    },
  };
}

/** @param {unknown} value @param {number} min @param {number} max @param {number} fallback */
function clampInteger(value, min, max, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(Math.max(parsed, min), max);
}

export const publicApiService = {
  archiveClient,
  archiveProject,
  createClient,
  createProject,
  listClients,
  listProjects,
  readClient,
  readProject,
  updateClient,
  updateProject,
};
