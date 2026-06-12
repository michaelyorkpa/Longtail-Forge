import { clientsService } from "../modules/client-projects/clients.service.js";
import { clientsRepository } from "../modules/client-projects/clients.repo.js";
import { projectsRepository } from "../modules/client-projects/projects.repo.js";
import { settingsRepository } from "../repositories/settings.repo.js";
import { AppError } from "../utils/app-error.js";

async function listClients(context, query) {
  await assertBusinessWorkspace(context);
  const { clients } = await clientsService.listClients(context, query);
  return paged(clients.map((client) => withWorkspaceAlias(client, context)), query);
}

async function readClient(context, clientId) {
  await assertBusinessWorkspace(context);
  const client = await clientsRepository.readById(context.workspace_id, decodeURIComponent(clientId || ""));

  if (!client) {
    throw new AppError("Client was not found.", 404);
  }

  return withWorkspaceAlias(client, context);
}

async function assertBusinessWorkspace(context) {
  const settings = await settingsRepository.readWorkspaceSettings(context.workspace_id);

  if (settings.workspaceType === "business") {
    return;
  }

  throw new AppError("Clients are only available in Business workspaces.", 403);
}

async function listProjects(context, query) {
  const { projects } = await clientsService.listProjects(context, query);
  return paged(projects.map((project) => withWorkspaceAlias(project, context)), query);
}

async function readProject(context, projectId) {
  const project = await projectsRepository.readById(context.workspace_id, decodeURIComponent(projectId || ""));

  if (!project) {
    throw new AppError("Project was not found.", 404);
  }

  return withWorkspaceAlias(project, context);
}

function withWorkspaceAlias(record, context) {
  if (!record || typeof record !== "object") {
    return record;
  }

  const workspaceId = record.workspace_id || context.workspace_id;

  return {
    ...record,
    workspace_id: workspaceId,
    projects: Array.isArray(record.projects)
      ? record.projects.map((project) => withWorkspaceAlias(project, context))
      : record.projects,
  };
}

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

function clampInteger(value, min, max, fallback) {
  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(Math.max(parsed, min), max);
}

export const publicApiService = {
  listClients,
  listProjects,
  readClient,
  readProject,
};
