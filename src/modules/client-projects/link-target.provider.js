// @ts-check
import { clientsRepository } from "./clients.repo.js";
import { clientsService } from "./clients.service.js";
import { projectsRepository } from "./projects.repo.js";
import { permissionsService } from "../../core/permissions.js";
import { workspacesRepository } from "../../repositories/workspaces.repo.js";
import { normalizeWorkspaceType } from "../../utils/workspaces.js";
import {
  readableTargetLabel,
  sortText,
  targetSourceUrl,
} from "../../core/linked-context/link-target-shape.js";

/** @typedef {import("../../types/link-target-directory-contracts.js").LinkTargetSession} LinkTargetSession */
/** @typedef {import("../../types/link-target-directory-contracts.js").LinkTargetAccessState} LinkTargetAccessState */
/** @typedef {import("../../types/link-target-directory-contracts.js").LinkTargetCandidate} LinkTargetCandidate */
/** @typedef {import("../../types/link-target-directory-contracts.js").LinkTargetDirectoryContext} LinkTargetDirectoryContext */
/** @typedef {import("../../types/link-target-directory-contracts.js").LinkTargetProviderOptions} LinkTargetProviderOptions */
/** @typedef {import("../../types/link-target-directory-contracts.js").LinkTargetType} LinkTargetType */

/** @typedef {{ id: string; name?: string; label?: string; display_label?: string; displayLabel?: string; sort_key?: string; sortKey?: string; status?: string }} ClientTargetRow */
/** @typedef {{ id: string; name?: string; label?: string; client_id?: string; clientId?: string; client_name?: string; clientName?: string; status?: string }} ProjectTargetRow */
/** @typedef {{ workspace_type?: string; workspace_name?: string; name?: string }} WorkspaceTargetRow */

/** @type {readonly LinkTargetType[]} */
const targetTypes = Object.freeze(["client", "project"]);

/**
 * @param {LinkTargetSession} session
 * @returns {Promise<LinkTargetDirectoryContext>}
 */
async function readContext(session) {
  /** @type {WorkspaceTargetRow | null} */
  const workspace = await workspacesRepository.readById(session.workspace_id);
  const isBusinessWorkspace = normalizeWorkspaceType(workspace?.workspace_type) === "business";
  /** @type {ProjectTargetRow[]} */
  const projects = await permissionsService.filterReadableProjects(
    session,
    await projectsRepository.readAll(session.workspace_id),
  );
  /** @type {ClientTargetRow[]} */
  const clients = isBusinessWorkspace
    ? (await clientsService.listClients(session, {
        include_depth: true,
        shape: "flat",
        status: "All",
      })).clients || []
    : [];

  return {
    clientsById: new Map(clients.map((client) => [client.id, {
      id: client.id,
      label: clientPlainLabel(client),
    }])),
    isBusinessWorkspace,
    projectsById: new Map(projects.map((project) => [project.id, {
      id: project.id,
      label: projectPlainLabel(project),
      clientId: textValue(project.client_id || project.clientId),
      clientName: textValue(project.client_name || project.clientName),
    }])),
    workspaceId: session.workspace_id,
    workspaceName: readableTargetLabel(workspace?.workspace_name || workspace?.name, "workspace"),
  };
}

/**
 * @param {LinkTargetSession} session
 * @param {LinkTargetType} targetType
 * @param {LinkTargetProviderOptions} options
 * @returns {Promise<LinkTargetCandidate[]>}
 */
async function list(session, targetType, options) {
  if (targetType === "client") {
    if (!options.context.isBusinessWorkspace) return [];
    /** @type {ClientTargetRow[]} */
    const clients = (await clientsService.listClients(session, {
      include_depth: true,
      shape: "flat",
      status: "All",
    })).clients || [];
    return clients.map((client, index) => clientCandidate(client, session.workspace_id, index, true));
  }

  if (targetType === "project") {
    /** @type {ProjectTargetRow[]} */
    const projects = await permissionsService.filterReadableProjects(
      session,
      await projectsRepository.readAll(session.workspace_id),
    );
    const omitBusinessContext = options.clientContext?.mode === "client" || options.clientContext?.mode === "workspace";
    return projects.map((project) => projectCandidate(project, options.context, omitBusinessContext));
  }

  return [];
}

/**
 * @param {LinkTargetSession} session
 * @param {LinkTargetType} targetType
 * @param {string} targetId
 * @param {LinkTargetProviderOptions} options
 * @returns {Promise<LinkTargetCandidate | null>}
 */
async function read(session, targetType, targetId, options) {
  if (targetType === "client") {
    if (!options.context.isBusinessWorkspace) return null;
    /** @type {ClientTargetRow | null} */
    const client = await clientsRepository.readById(session.workspace_id, targetId);
    if (!client || !(await canReadClient(session, client))) return null;
    return clientCandidate(client, session.workspace_id, 0, false);
  }

  if (targetType === "project") {
    /** @type {ProjectTargetRow | null} */
    const project = await projectsRepository.readById(session.workspace_id, targetId);
    if (!project || !(await canReadProject(session, project))) return null;
    return projectCandidate(project, options.context, false);
  }

  return null;
}

/**
 * @param {LinkTargetSession} session
 * @param {LinkTargetType} targetType
 * @param {readonly string[]} targetIds
 * @returns {Promise<Map<string, LinkTargetAccessState>>}
 */
async function readAccess(session, targetType, targetIds) {
  /** @type {Map<string, LinkTargetAccessState>} */
  const states = new Map(targetIds.map((targetId) => [targetId, "unavailable"]));
  if (targetIds.length === 0) return states;

  if (targetType === "client") {
    /** @type {WorkspaceTargetRow | null} */
    const workspace = await workspacesRepository.readById(session.workspace_id);
    if (normalizeWorkspaceType(workspace?.workspace_type) !== "business") return states;
    /** @type {ClientTargetRow[]} */
    const clients = await clientsRepository.readByIds(session.workspace_id, [...targetIds]);
    for (const client of clients) {
      states.set(client.id, (await canReadClient(session, client)) ? "readable" : "forbidden");
    }
  }

  if (targetType === "project") {
    /** @type {ProjectTargetRow[]} */
    const projects = await projectsRepository.readByIds(session.workspace_id, [...targetIds]);
    for (const project of projects) {
      states.set(project.id, (await canReadProject(session, project)) ? "readable" : "forbidden");
    }
  }

  return states;
}

/** @param {ClientTargetRow} client @param {string} workspaceId @param {number} index @param {boolean} preserveProviderDisplay */
function clientCandidate(client, workspaceId, index, preserveProviderDisplay) {
  const label = clientPlainLabel(client);
  return {
    moduleId: "client-projects",
    targetType: /** @type {const} */ ("client"),
    targetId: client.id,
    label,
    displayLabel: preserveProviderDisplay ? providerDisplayLabel(client.display_label || client.displayLabel) || label : label,
    secondaryLabel: "",
    sortKey: preserveProviderDisplay ? textValue(client.sort_key || client.sortKey) || String(index).padStart(6, "0") : sortText(label),
    sourceUrl: targetSourceUrl("client", client.id),
    clientId: client.id,
    workspaceId,
    status: client.status || "",
    suggestedLibraryBucket: "ongoing_area",
  };
}

/** @param {ProjectTargetRow} project @param {LinkTargetDirectoryContext} context @param {boolean} omitBusinessContext */
function projectCandidate(project, context, omitBusinessContext) {
  const label = projectPlainLabel(project);
  const projectContext = projectContextLabel(project, context);
  const showBusinessContext = context.isBusinessWorkspace && !omitBusinessContext;
  const clientId = textValue(project.client_id || project.clientId);
  const displayLabel = showBusinessContext ? `${label} - ${projectContext}` : label;
  const sortKey = showBusinessContext
    ? [clientId ? "1" : "0", sortText(projectContext), sortText(label)].join("|")
    : sortText(label);
  return {
    moduleId: "client-projects",
    targetType: /** @type {const} */ ("project"),
    targetId: project.id,
    label,
    displayLabel,
    secondaryLabel: showBusinessContext ? projectContext : "",
    sortKey,
    subtitle: showBusinessContext ? projectContext : "",
    sourceUrl: targetSourceUrl("project", project.id),
    clientId,
    clientName: textValue(project.client_name || project.clientName),
    projectId: project.id,
    projectName: label,
    workspaceId: context.workspaceId,
    workspaceName: context.workspaceName,
    suggestedLibraryBucket: "ongoing_area",
  };
}

/** @param {LinkTargetSession} session @param {ClientTargetRow} client */
async function canReadClient(session, client) {
  return permissionsService.can(session, "clients.manage", {
    workspace_id: session.workspace_id,
    client_id: client.id,
    operation: "read",
  });
}

/** @param {LinkTargetSession} session @param {ProjectTargetRow} project */
async function canReadProject(session, project) {
  return permissionsService.can(session, "projects.manage", {
    workspace_id: session.workspace_id,
    client_id: textValue(project.client_id || project.clientId),
    project_id: project.id,
    operation: "read",
  });
}

/** @param {ClientTargetRow} client */
function clientPlainLabel(client) {
  return readableTargetLabel(client.name || client.label, "client");
}

/** @param {ProjectTargetRow} project */
function projectPlainLabel(project) {
  return readableTargetLabel(project.name || project.label, "project");
}

/** @param {ProjectTargetRow} project @param {LinkTargetDirectoryContext} context */
function projectContextLabel(project, context) {
  const clientId = textValue(project.client_id || project.clientId);
  if (clientId) return readableTargetLabel(project.client_name || project.clientName, "client");
  return context.workspaceName;
}

/** @param {unknown} value */
function providerDisplayLabel(value) {
  if (value === null || value === undefined) return "";
  const text = String(value);
  return text.trim() ? text : "";
}

/** @param {unknown} value */
function textValue(value) {
  return String(value ?? "").trim();
}

const clientProjectsLinkTargetProvider = Object.freeze({
  targetTypes,
  list,
  read,
  readAccess,
  readContext,
});

export { clientProjectsLinkTargetProvider };
