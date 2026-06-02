import { clientsRepository } from "../repositories/clients.repo.js";
import { projectsRepository } from "../repositories/projects.repo.js";
import { AppError } from "../utils/app-error.js";

async function listClients(context, query) {
  const clients = await clientsRepository.readAll(context.organization_id);
  return paged(clients.map((client) => withWorkspaceAlias(client, context)), query);
}

async function readClient(context, clientId) {
  const client = await clientsRepository.readById(context.organization_id, decodeURIComponent(clientId || ""));

  if (!client) {
    throw new AppError("Client was not found.", 404);
  }

  return withWorkspaceAlias(client, context);
}

async function listProjects(context, query) {
  const projects = await projectsRepository.readAll(context.organization_id);
  return paged(projects.map((project) => withWorkspaceAlias(project, context)), query);
}

async function readProject(context, projectId) {
  const project = await projectsRepository.readById(context.organization_id, decodeURIComponent(projectId || ""));

  if (!project) {
    throw new AppError("Project was not found.", 404);
  }

  return withWorkspaceAlias(project, context);
}

function withWorkspaceAlias(record, context) {
  if (!record || typeof record !== "object") {
    return record;
  }

  const workspaceId = record.workspace_id || record.organization_id || context.workspace_id || context.organization_id;

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
