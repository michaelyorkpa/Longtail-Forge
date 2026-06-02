import { clientsRepository } from "../modules/client-projects/clients.repo.js";
import { projectsRepository } from "../modules/client-projects/projects.repo.js";
import { AppError } from "../utils/app-error.js";

function assertWorkspaceScope(workspaceId) {
  if (!String(workspaceId || "").trim()) {
    throw new AppError("Workspace context is required.", 400);
  }
}

async function readClientScope(workspaceId, clientId, options = {}) {
  assertWorkspaceScope(workspaceId);
  const normalizedClientId = String(clientId || "").trim();

  if (!normalizedClientId) {
    if (options.required) {
      throw new AppError(options.notFoundMessage || "Client not found", 404);
    }

    return null;
  }

  const client = await clientsRepository.readById(workspaceId, normalizedClientId);

  if (!client) {
    throw new AppError(options.notFoundMessage || "Client not found", 404);
  }

  if (!options.allowArchived && isArchivedRecord(client)) {
    throw new AppError(options.archivedMessage || "Archived clients cannot be used for new work.", 400);
  }

  return client;
}

async function readProjectScope(workspaceId, projectId, options = {}) {
  assertWorkspaceScope(workspaceId);
  const normalizedProjectId = String(projectId || "").trim();

  if (!normalizedProjectId) {
    if (options.required === false) {
      return null;
    }

    throw new AppError(options.notFoundMessage || "Project not found", 404);
  }

  const project = await projectsRepository.readById(workspaceId, normalizedProjectId);

  if (!project) {
    throw new AppError(options.notFoundMessage || "Project not found", 404);
  }

  if (!options.allowArchived && isArchivedRecord(project)) {
    throw new AppError(options.archivedMessage || "Archived projects cannot be used for new work.", 400);
  }

  return project;
}

async function resolveProjectRecordScope(workspaceId, record, options = {}) {
  const project = await readProjectScope(workspaceId, record?.project_id, {
    archivedMessage: options.archivedProjectMessage,
    notFoundMessage: options.projectNotFoundMessage,
    allowArchived: Boolean(options.allowArchivedProject),
  });
  const requestedClientId = String(record?.client_id || "").trim();
  const effectiveClientId = project.client_id || requestedClientId;
  const client = await readClientScope(workspaceId, effectiveClientId, {
    archivedMessage: options.archivedClientMessage,
    notFoundMessage: options.clientNotFoundMessage,
    allowArchived: Boolean(options.allowArchivedClient),
  });

  if (requestedClientId && project.client_id && requestedClientId !== project.client_id) {
    throw new AppError(options.projectNotFoundMessage || "Project not found", 404);
  }

  return { client, project };
}

function isArchivedRecord(record) {
  const status = String(record?.status || "").trim().toLowerCase();
  return status === "inactive" || status === "archived" || status === "completed";
}

export {
  assertWorkspaceScope,
  isArchivedRecord,
  readClientScope,
  readProjectScope,
  resolveProjectRecordScope,
};
