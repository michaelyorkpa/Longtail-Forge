import { registerSearchIndexer } from "../../core/search/indexer-registry.js";
import { indexSearchReference } from "../../core/search/record-indexer.js";
import { readSearchTagsText } from "../../core/search/tag-text.js";
import { clientsRepository } from "./clients.repo.js";
import { projectsRepository } from "./projects.repo.js";

/** @typedef {import("../../types/framework-contracts.js").SearchReference} SearchReference */
/** @typedef {import("../../types/client-project-contracts.js").ClientRecord} ClientRecord */
/** @typedef {import("../../types/client-project-contracts.js").ProjectRecord} ProjectRecord */

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

/** @param {SearchReference} reference */
async function indexClientRecord(reference) {
  return indexSearchReference(reference, {
    readAll: (workspaceId) => clientsRepository.readAll(workspaceId),
    readOne: (workspaceId, recordId) => clientsRepository.readById(workspaceId, recordId),
    toDocument: clientToSearchDocument,
  });
}

/** @param {ClientRecord} client */
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
    client_id: client.id,
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

/** @param {SearchReference} reference */
async function indexProjectRecord(reference) {
  return indexSearchReference(reference, {
    readAll: (workspaceId) => projectsRepository.readAll(workspaceId),
    readOne: (workspaceId, recordId) => projectsRepository.readById(workspaceId, recordId),
    toDocument: projectToSearchDocument,
  });
}

/** @param {ProjectRecord} project */
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
    project_id: project.id,
    search_status: normalizeClientProjectStatus(project.status),
    record_created_at: project.created_at,
    record_updated_at: project.updated_at,
  };
}

/** @param {unknown} status @returns {"active" | "archived" | "completed"} */
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
