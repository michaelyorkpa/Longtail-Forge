import { registerSearchIndexer } from "../../core/search/indexer-registry.js";
import { readSearchTagsText } from "../../core/search/tag-text.js";
import { clientsRepository } from "./clients.repo.js";
import { projectsRepository } from "./projects.repo.js";

const CLIENTS_SEARCH_INDEXER_ID = "client-projects.clients";
const PROJECTS_SEARCH_INDEXER_ID = "client-projects.projects";

function registerClientProjectsSearchIndexers() {
  const unregisterClients = registerSearchIndexer(CLIENTS_SEARCH_INDEXER_ID, indexClientRecord);
  const unregisterProjects = registerSearchIndexer(PROJECTS_SEARCH_INDEXER_ID, indexProjectRecord);

  return () => {
    unregisterClients();
    unregisterProjects();
  };
}

async function indexClientRecord({ workspaceId, recordId }) {
  if (!recordId) {
    const clients = await clientsRepository.readAll(workspaceId);
    const documents = [];

    for (const client of clients) {
      documents.push(await clientToSearchDocument(client));
    }

    return { documents };
  }

  const client = await clientsRepository.readById(workspaceId, recordId);

  if (!client) {
    return null;
  }

  return clientToSearchDocument(client);
}

async function clientToSearchDocument(client) {
  const tagsText = await readSearchTagsText({
    workspaceId: client.workspace_id,
    targetType: "client",
    targetId: client.id,
  });
  const body = [
    client.billing_contact?.name,
    client.billing_contact?.email,
    client.billing_contact?.alternate_name,
    client.billing_contact?.alternate_email,
    client.billing_contact?.phone_number,
    client.billing_contact?.city,
    client.billing_contact?.state,
    client.billing_contact?.zip_code,
  ].filter(Boolean).join("\n");

  return {
    workspace_id: client.workspace_id,
    id: client.id,
    name: client.name,
    summary: client.status,
    body,
    tags_text: tagsText,
    search_status: normalizeClientProjectStatus(client.status),
    record_created_at: client.created_at,
    record_updated_at: client.updated_at,
  };
}

async function indexProjectRecord({ workspaceId, recordId }) {
  if (!recordId) {
    const projects = await projectsRepository.readAll(workspaceId);
    const documents = [];

    for (const project of projects) {
      documents.push(await projectToSearchDocument(project));
    }

    return { documents };
  }

  const project = await projectsRepository.readById(workspaceId, recordId);

  if (!project) {
    return null;
  }

  return projectToSearchDocument(project);
}

async function projectToSearchDocument(project) {
  const tagsText = await readSearchTagsText({
    workspaceId: project.workspace_id,
    targetType: "project",
    targetId: project.id,
  });
  const body = [
    project.client_name,
    project.parent_project_name,
    project.taskDefaults?.priority,
    project.taskDefaults?.status,
    project.taskDefaults?.defaultAssigneeMode,
  ].filter(Boolean).join("\n");

  return {
    workspace_id: project.workspace_id,
    id: project.id,
    name: project.name,
    summary: [project.status, project.client_name].filter(Boolean).join(" - "),
    body,
    tags_text: tagsText,
    client_id: project.client_id,
    search_status: normalizeClientProjectStatus(project.status),
    record_created_at: project.created_at,
    record_updated_at: project.updated_at,
  };
}

function normalizeClientProjectStatus(status) {
  const normalized = String(status || "").trim().toLowerCase();

  if (normalized === "inactive" || normalized === "archived") {
    return "archived";
  }
  if (normalized === "completed") {
    return "completed";
  }

  return "active";
}

export {
  CLIENTS_SEARCH_INDEXER_ID,
  PROJECTS_SEARCH_INDEXER_ID,
  indexClientRecord,
  indexProjectRecord,
  registerClientProjectsSearchIndexers,
};
