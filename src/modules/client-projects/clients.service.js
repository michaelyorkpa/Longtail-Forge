import { randomUUID } from "node:crypto";
import { clientsRepository } from "./clients.repo.js";
import { projectsRepository } from "./projects.repo.js";
import { auditService } from "../../core/audit.js";
import { tagsService } from "../../services/tags.service.js";
import { searchIndexSyncService } from "../../services/search-index-sync.service.js";
import { AppError } from "../../core/errors.js";
import { permissionsService } from "../../core/permissions.js";
import { isArchivedRecord, readClientScope } from "../../core/record-scope.js";
import { settingsRepository } from "../../repositories/settings.repo.js";
import { normalizeClientProjectData } from "../../utils/normalizers.js";
import { planProjectUpdate } from "./project-update-planner.js";
import { timeEntriesRepository } from "../time-tracking/time-entries.repo.js";
import { taskRemindersService } from "../tasks/task-reminders.service.js";

async function readClientProjects(session) {
  const data = await attachReminderPolicies(await readClientProjectData(session.workspace_id), session.workspace_id);
  const workspaceSettings = await settingsRepository.readWorkspaceSettings(session.workspace_id);
  const clients = workspaceSettings.workspaceType === "business" ? data.clients : [];
  const allProjects = data.clients.flatMap((client) => (
    client.projects.map((project) => ({ ...project, client_id: client.id }))
  )).concat(data.workspaceProjects || []);
  const readableClients = await permissionsService.filterReadableClients(session, clients);
  const readableProjects = await permissionsService.filterReadableProjects(session, allProjects);
  const readableClientIds = new Set(readableClients.map((client) => client.id));
  const readableProjectClientIds = new Set(readableProjects.map((project) => project.client_id));
  const readableProjectIds = new Set(readableProjects.map((project) => project.id));

  const workspaceProjects = buildProjectShape(await tagsService.decorateRecordsForTarget(
    session,
    "project",
    (data.workspaceProjects || []).filter((project) => readableProjectIds.has(project.id)),
  ), { shape: "flat", includeDepth: true }).map(stripProjectClientIdForWorkspacePayload);
  const decoratedClients = await tagsService.decorateRecordsForTarget(
    session,
    "client",
    clients.filter((client) => readableClientIds.has(client.id) || readableProjectClientIds.has(client.id)),
  );
  const projectAssignments = await tagsService.decorateRecordsForTarget(session, "project", readableProjects);
  const projectsById = new Map(projectAssignments.map((project) => [project.id, project]));
  const shapedClients = buildClientShape(decoratedClients, { shape: "flat", includeDepth: true });

  return {
    workspaceProjects,
    clients: shapedClients
      .map((client) => ({
        ...client,
        projects: buildProjectShape(client.projects.filter((project) => (
          readableClientIds.has(client.id) || readableProjectIds.has(project.id)
        )).map((project) => projectsById.get(project.id) || project), {
          shape: "flat",
          includeDepth: true,
        }).map(stripProjectClientIdForNestedPayload),
      })),
  };
}

async function saveClientProjects() {
  throw new AppError(
    "Whole-tree client/project saves are deprecated. Use granular client and project endpoints.",
    410,
  );
}

async function readClientProjectData(workspaceId) {
  const clients = await clientsRepository.readAll(workspaceId);
  const projects = await projectsRepository.readAll(workspaceId);
  const descendantClientIdsByClient = buildDescendantIdMap(clients, "parent_client_id");
  const workspaceProjects = [];
  const projectsByClientId = projects.reduce((projectsByClient, project) => {
    const projectValue = { ...project };
    delete projectValue.client_id;

    if (!project.client_id) {
      workspaceProjects.push(project);
      return projectsByClient;
    }

    if (!projectsByClient.has(project.client_id)) {
      projectsByClient.set(project.client_id, []);
    }

    projectsByClient.get(project.client_id).push(projectValue);
    return projectsByClient;
  }, new Map());

  return {
    ...normalizeClientProjectData({
    clients: clients.map((client) => ({
      ...client,
      childScopeIds: descendantClientIdsByClient.get(client.id) || [],
      projects: projectsByClientId.get(client.id) || [],
    })),
    }),
    workspaceProjects,
  };
}

function buildDescendantIdMap(records, parentField) {
  return records.reduce((descendantsById, record) => {
    descendantsById.set(record.id, collectDescendantIds(records, record.id, parentField));
    return descendantsById;
  }, new Map());
}

function buildClientShape(clients, options = {}) {
  const includeDepth = options.includeDepth === true;
  const shape = options.shape === "tree" ? "tree" : "flat";
  const orderedClients = sortHierarchy(clients, {
    idField: "id",
    parentField: "parent_client_id",
    labelField: "name",
  }).map(({ record, depth, path }, index) => decorateClientShape(record, { depth, includeDepth, path, sortOrder: index }));

  if (shape === "tree") {
    return buildNestedTree(orderedClients, {
      idField: "id",
      parentField: "parent_client_id",
      childrenField: "children",
    });
  }

  return orderedClients;
}

function buildProjectShape(projects, options = {}) {
  const includeDepth = options.includeDepth === true;
  const shape = options.shape === "tree" ? "tree" : "flat";
  const orderedProjects = sortProjectHierarchy(projects)
    .map(({ record, depth, path }) => decorateProjectShape(record, { depth, includeDepth, path }));

  if (shape === "tree") {
    return buildNestedTree(orderedProjects, {
      idField: "id",
      parentField: "parent_project_id",
      childrenField: "children",
    });
  }

  return orderedProjects;
}

function buildProjectReadShape(projects, clients, options = {}) {
  const includeDepth = options.includeDepth === true;
  const shape = options.shape === "tree" ? "tree" : "flat";
  const orderedProjects = projectReadGroups(projects, clients)
    .flatMap((groupProjects) => sortProjectHierarchy(groupProjects))
    .map(({ record, depth, path }) => decorateProjectShape(record, { depth, includeDepth, path }));

  if (shape === "tree") {
    return buildNestedTree(orderedProjects, {
      idField: "id",
      parentField: "parent_project_id",
      childrenField: "children",
    });
  }

  return orderedProjects;
}

function projectReadGroups(projects, clients) {
  const workspaceProjects = [];
  const projectsByClientId = projects.reduce((map, project) => {
    const clientId = String(project.client_id || "").trim();

    if (!clientId) {
      workspaceProjects.push(project);
      return map;
    }

    if (!map.has(clientId)) {
      map.set(clientId, []);
    }

    map.get(clientId).push(project);
    return map;
  }, new Map());
  const orderedClients = sortHierarchy(clients, {
    idField: "id",
    parentField: "parent_client_id",
    labelField: "name",
  }).map(({ record }) => record);
  const groupedClientIds = new Set();
  const groups = [];

  if (workspaceProjects.length > 0) {
    groups.push(workspaceProjects);
  }

  orderedClients.forEach((client) => {
    const clientId = String(client.id || "").trim();
    const clientProjects = projectsByClientId.get(clientId) || [];

    groupedClientIds.add(clientId);
    if (clientProjects.length > 0) {
      groups.push(clientProjects);
    }
  });

  [...projectsByClientId.entries()]
    .filter(([clientId]) => !groupedClientIds.has(clientId))
    .sort(([, leftProjects], [, rightProjects]) => compareProjectClientGroups(leftProjects, rightProjects))
    .forEach(([, clientProjects]) => {
      groups.push(clientProjects);
    });

  return groups;
}

function sortProjectHierarchy(projects) {
  return sortHierarchy(projects, {
    idField: "id",
    parentField: "parent_project_id",
    labelField: "name",
  });
}

function compareProjectClientGroups(leftProjects, rightProjects) {
  const leftProject = leftProjects[0] || {};
  const rightProject = rightProjects[0] || {};
  return compareLabels(leftProject.client_name, rightProject.client_name) ||
    compareLabels(leftProject.client_id, rightProject.client_id);
}

function sortHierarchy(records, { idField, parentField, labelField }) {
  const byParentId = records.reduce((map, record) => {
    const parentId = String(record[parentField] || "").trim();

    if (!map.has(parentId)) {
      map.set(parentId, []);
    }

    map.get(parentId).push(record);
    return map;
  }, new Map());
  const sorted = [];
  const visited = new Set();
  const visit = (parentId, depth, path) => {
    const children = [...(byParentId.get(parentId) || [])].sort((left, right) => (
      compareLabels(left[labelField], right[labelField]) || compareLabels(left[idField], right[idField])
    ));

    children.forEach((record) => {
      const id = String(record[idField] || "").trim();

      if (!id || visited.has(id)) {
        return;
      }

      visited.add(id);
      const nextPath = [...path, String(record[labelField] || "").trim()].filter(Boolean);
      sorted.push({ depth, path: nextPath, record });
      visit(id, depth + 1, nextPath);
    });
  };

  visit("", 0, []);

  [...byParentId.keys()]
    .filter((parentId) => parentId && !records.some((record) => String(record[idField] || "").trim() === parentId))
    .sort()
    .forEach((orphanParentId) => visit(orphanParentId, 0, []));

  records
    .filter((record) => !visited.has(String(record[idField] || "").trim()))
    .sort((left, right) => (
      compareLabels(left[labelField], right[labelField]) || compareLabels(left[idField], right[idField])
    ))
    .forEach((record) => {
      const id = String(record[idField] || "").trim();
      if (!id || visited.has(id)) {
        return;
      }
      visited.add(id);
      sorted.push({ depth: 0, path: [String(record[labelField] || "").trim()].filter(Boolean), record });
    });

  return sorted;
}

function compareLabels(left, right) {
  return String(left || "").localeCompare(String(right || ""), undefined, {
    sensitivity: "base",
  });
}

function buildNestedTree(flatRecords, { idField, parentField, childrenField }) {
  const nodesById = new Map(flatRecords.map((record) => [record[idField], { ...record, [childrenField]: [] }]));
  const roots = [];

  flatRecords.forEach((record) => {
    const node = nodesById.get(record[idField]);
    const parentId = record[parentField] || "";
    const parentNode = parentId ? nodesById.get(parentId) : null;

    if (parentNode && parentNode !== node) {
      parentNode[childrenField].push(node);
    } else {
      roots.push(node);
    }
  });

  return roots;
}

function decorateClientShape(client, { depth, includeDepth, path, sortOrder }) {
  return {
    ...client,
    ...(includeDepth ? {
      depth,
      display_label: formatIndentedLabel(client.name, depth),
      display_path: path,
      sort_key: formatHierarchySortKey(sortOrder),
      billing_display: formatBillingDisplay(client),
      tag_summary: formatTagSummary(client.tags),
    } : {}),
  };
}

function decorateProjectShape(project, { depth, includeDepth, path }) {
  return {
    ...project,
    ...(includeDepth ? {
      depth,
      display_label: formatIndentedLabel(project.name, depth),
      display_path: path,
      billing_display: formatBillingDisplay(project),
      tag_summary: formatTagSummary(project.tags),
    } : {}),
  };
}

function formatIndentedLabel(label, depth) {
  const text = String(label || "").trim();
  return depth > 0 ? `${"  ".repeat(depth)}- ${text}` : text;
}

function formatHierarchySortKey(sortOrder) {
  return String(Number(sortOrder) || 0).padStart(6, "0");
}

function formatBillingDisplay(record) {
  if (String(record?.billable || "").toLowerCase() === "no") {
    return "Non-billable";
  }

  const rate = record?.billing_rate;
  if (rate !== null && rate !== undefined && String(rate).trim()) {
    return `Billable: ${rate}`;
  }

  return "Billable";
}

function formatTagSummary(tags = []) {
  return Array.isArray(tags)
    ? tags.map((tag) => tag?.name || tag?.slug || "").filter(Boolean).join(", ")
    : "";
}

function normalizeClientShapeOptions(query = {}) {
  return {
    includeDepth: readBoolean(query.include_depth || query.includeDepth),
    scope: String(query.scope || "").trim() === "top_level" ? "top_level" : "all",
    shape: String(query.shape || "").trim() === "tree" ? "tree" : "flat",
  };
}

function normalizeProjectShapeOptions(query = {}) {
  return {
    includeDepth: readBoolean(query.include_depth || query.includeDepth),
    shape: String(query.shape || "").trim() === "tree" ? "tree" : "flat",
  };
}

function normalizeClientStatusFilter(status) {
  const normalizedStatus = String(status || "Active").trim().toLowerCase();

  if (normalizedStatus === "inactive") {
    return "Inactive";
  }

  if (normalizedStatus === "all") {
    return "All";
  }

  return "Active";
}

function normalizeProjectStatusFilter(status) {
  const normalizedStatus = String(status || "Active").trim().toLowerCase();

  if (normalizedStatus === "inactive") {
    return "Inactive";
  }

  if (normalizedStatus === "completed") {
    return "Completed";
  }

  if (normalizedStatus === "all") {
    return "All";
  }

  return "Active";
}

function normalizeProjectClientFilter(clientFilter) {
  const value = String(clientFilter || "All").trim();

  if (!value || value.toLowerCase() === "all") {
    return { type: "all", value: "" };
  }

  if (value.toLowerCase() === "workspace") {
    return { type: "workspace", value: "" };
  }

  return { type: "client", value };
}

function filterProjectsByClient(projects, clientFilter) {
  if (clientFilter.type === "workspace") {
    return projects.filter((project) => !project.client_id);
  }

  if (clientFilter.type === "client") {
    return projects.filter((project) => project.client_id === clientFilter.value);
  }

  return projects;
}

function readBoolean(value) {
  return value === true || value === "true" || value === "1" || value === 1;
}

function stripProjectClientIdForNestedPayload(project) {
  const nextProject = { ...project };
  delete nextProject.client_id;
  return nextProject;
}

function stripProjectClientIdForWorkspacePayload(project) {
  return {
    ...project,
    client_id: "",
  };
}

async function listClients(session, query = {}) {
  await assertBusinessWorkspace(session);
  const clients = await clientsRepository.readAll(session.workspace_id);
  const readableClients = await permissionsService.filterReadableClients(session, clients);
  const status = normalizeClientStatusFilter(query.status);
  const shapeOptions = normalizeClientShapeOptions(query);
  const statusFilteredClients = status === "All"
    ? readableClients
    : readableClients.filter((client) => client.status === status);
  const scopedClients = shapeOptions.scope === "top_level"
    ? statusFilteredClients.filter((client) => !client.parent_client_id)
    : statusFilteredClients;
  const tagFilters = await tagsService.resolveTagFilterValues(
    session,
    query.tagIds || query.tag_ids || query.tags,
  );
  const filteredClients = await tagsService.filterRecordsByTags(
    session,
    "client",
    scopedClients,
    tagFilters,
  );

  const decoratedClients = await tagsService.decorateRecordsForTarget(session, "client", filteredClients);
  return { clients: buildClientShape(decoratedClients, shapeOptions) };
}

async function readClient(clientId, session) {
  await assertBusinessWorkspace(session);
  const decodedClientId = decodeURIComponent(clientId || "");
  const client = await clientsRepository.readById(session.workspace_id, decodedClientId);

  if (!decodedClientId || !client) {
    throw new AppError("Client not found", 404);
  }

  await permissionsService.assertCan(session, "clients.manage", {
    workspace_id: session.workspace_id,
    client_id: decodedClientId,
    operation: "read",
  });

  return { client: (await tagsService.decorateRecordsForTarget(session, "client", [client]))[0] };
}

async function createClient(payload, session) {
  await assertBusinessWorkspace(session);
  await permissionsService.assertCan(session, "clients.manage", {
    workspace_id: session.workspace_id,
    operation: "create",
  });
  const client = normalizeClientPayload(payload, { id: payload?.id || randomUUID() });
  const parentClient = await validateClientParent(session.workspace_id, client.id, client.parent_client_id);

  if (parentClient) {
    await permissionsService.assertCan(session, "clients.manage", {
      workspace_id: session.workspace_id,
      client_id: parentClient.id,
      operation: "update",
    });
  }

  await clientsRepository.create(session.workspace_id, client);
  await saveClientReminderPolicy(session.workspace_id, client.id, payload);
  await saveTargetTags(session, "client", client.id, payload);
  if (client.parent_client_id) {
    await requestTagPropagationRefresh(session, "client", client.id, "client.created_with_parent");
  }
  await recordAudit(payload?.action, {
    session,
    action: "client_created",
    changeType: "create",
    recordType: "client",
    recordId: client.id,
    recordLabel: client.name,
    recordUrl: `clients.html?client=${encodeURIComponent(client.id)}`,
    previousValue: null,
    newValue: client,
    metadata: clientMetadata(client, parentClient),
  });
  await syncClientSearchIndex(session.workspace_id, client.id, "client.created");

  return { client: (await tagsService.decorateRecordsForTarget(session, "client", [client]))[0] };
}

async function updateClient(clientId, payload, session) {
  await assertBusinessWorkspace(session);
  const decodedClientId = decodeURIComponent(clientId || "");
  const previousClient = await clientsRepository.readById(session.workspace_id, decodedClientId);

  if (!decodedClientId || !previousClient) {
    throw new AppError("Client not found", 404);
  }

  await permissionsService.assertCan(session, "clients.manage", {
    workspace_id: session.workspace_id,
    client_id: decodedClientId,
    operation: "update",
  });

  if (billingDetailsChanged(previousClient, payload)) {
    await permissionsService.assertCan(session, "billing.manage", {
      workspace_id: session.workspace_id,
      client_id: decodedClientId,
    });
  }

  const client = normalizeClientPayload(payload, {
    ...previousClient,
    id: decodedClientId,
  });
  const parentChanged = (previousClient.parent_client_id || "") !== (client.parent_client_id || "");
  const parentClient = await validateClientParent(session.workspace_id, client.id, client.parent_client_id);

  if (parentChanged && parentClient) {
    await permissionsService.assertCan(session, "clients.manage", {
      workspace_id: session.workspace_id,
      client_id: parentClient.id,
      operation: "update",
    });
  }

  await clientsRepository.update(session.workspace_id, client);
  await saveClientReminderPolicy(session.workspace_id, client.id, payload);
  await saveTargetTags(session, "client", client.id, payload);
  if (parentChanged) {
    await requestTagPropagationRefresh(session, "client", client.id, "client.parent_changed");
  }
  await recordAudit(payload?.action, {
    session,
    action: "client_updated",
    changeType: "update",
    recordType: "client",
    recordId: client.id,
    recordLabel: client.name,
    recordUrl: `clients.html?client=${encodeURIComponent(client.id)}`,
    previousValue: previousClient,
    newValue: client,
    metadata: {
      old_client_name: previousClient.name,
      old_status: previousClient.status,
      new_status: client.status,
      old_parent_client_id: previousClient.parent_client_id || "",
      old_parent_client_name: await readClientName(session.workspace_id, previousClient.parent_client_id),
      new_parent_client_id: client.parent_client_id || "",
      new_parent_client_name: parentClient?.name || "",
      ...clientMetadata(client, parentClient),
    },
  });
  await syncClientSearchIndex(session.workspace_id, client.id, "client.updated");

  return { client: (await tagsService.decorateRecordsForTarget(session, "client", [client]))[0] };
}

async function archiveClient(clientId, payload, session) {
  await assertBusinessWorkspace(session);
  const decodedClientId = decodeURIComponent(clientId || "");
  const previousClient = await clientsRepository.readById(session.workspace_id, decodedClientId);

  if (!decodedClientId || !previousClient) {
    throw new AppError("Client not found", 404);
  }

  await permissionsService.assertCan(session, "clients.manage", {
    workspace_id: session.workspace_id,
    client_id: decodedClientId,
    operation: "delete",
  });

  await clientsRepository.archive(session.workspace_id, decodedClientId);
  await recordAudit(payload?.action, {
    session,
    action: "client_archived",
    changeType: "archive",
    recordType: "client",
    recordId: previousClient.id,
    recordLabel: previousClient.name,
    recordUrl: `clients.html?client=${encodeURIComponent(previousClient.id)}`,
    previousValue: previousClient,
    newValue: {
      ...previousClient,
      status: "Inactive",
    },
    metadata: {
      old_status: previousClient.status,
      new_status: "Inactive",
    },
  });
  await syncClientSearchIndex(session.workspace_id, decodedClientId, "client.archived");
  await syncProjectSearchIndexForClient(session.workspace_id, decodedClientId, "client.archived_projects");

  return { client_id: decodedClientId, archived: true };
}

async function listProjects(session, query = {}) {
  const clients = await clientsRepository.readAll(session.workspace_id);
  const projects = await projectsRepository.readAll(session.workspace_id);
  const readableClients = await permissionsService.filterReadableClients(session, clients);
  const readableProjects = await permissionsService.filterReadableProjects(session, projects);
  const readableClientIds = new Set(readableClients.map((client) => client.id));
  const readableProjectClientIds = new Set(readableProjects.map((project) => project.client_id).filter(Boolean));
  const orderingClients = clients.filter((client) => (
    readableClientIds.has(client.id) || readableProjectClientIds.has(client.id)
  ));
  const status = normalizeProjectStatusFilter(query.status);
  const clientFilter = normalizeProjectClientFilter(query.client || query.client_id || query.clientId);
  const shapeOptions = normalizeProjectShapeOptions(query);
  const statusFilteredProjects = status === "All"
    ? readableProjects
    : readableProjects.filter((project) => project.status === status);
  const clientFilteredProjects = filterProjectsByClient(statusFilteredProjects, clientFilter);
  const tagFilters = await tagsService.resolveTagFilterValues(
    session,
    query.tagIds || query.tag_ids || query.tags,
  );
  const filteredProjects = await tagsService.filterRecordsByTags(
    session,
    "project",
    clientFilteredProjects,
    tagFilters,
  );

  const decoratedProjects = await tagsService.decorateRecordsForTarget(session, "project", filteredProjects);
  return { projects: buildProjectReadShape(decoratedProjects, orderingClients, shapeOptions) };
}

async function listClientProjects(clientId, session) {
  await assertBusinessWorkspace(session);
  const decodedClientId = decodeURIComponent(clientId || "");
  const client = await clientsRepository.readById(session.workspace_id, decodedClientId);

  if (!decodedClientId || !client) {
    throw new AppError("Client not found", 404);
  }

  await permissionsService.assertCan(session, "projects.manage", {
    workspace_id: session.workspace_id,
    client_id: decodedClientId,
    operation: "read",
  });

  return {
    client,
    projects: await tagsService.decorateRecordsForTarget(
      session,
      "project",
      await projectsRepository.readByClientId(session.workspace_id, decodedClientId),
    ),
  };
}

async function readProject(projectId, session) {
  const decodedProjectId = decodeURIComponent(projectId || "");
  const project = await projectsRepository.readById(session.workspace_id, decodedProjectId);

  if (!decodedProjectId || !project) {
    throw new AppError("Project not found", 404);
  }

  await permissionsService.assertCan(session, "projects.manage", {
    workspace_id: session.workspace_id,
    client_id: project.client_id,
    project_id: decodedProjectId,
    operation: "read",
  });

  return { project: (await tagsService.decorateRecordsForTarget(session, "project", [project]))[0] };
}

async function createProject(clientId, payload, session) {
  const workspaceSettings = await settingsRepository.readWorkspaceSettings(session.workspace_id);
  const usesProjectRoundingOnly = workspaceUsesProjectRoundingOnly(workspaceSettings.workspaceType);
  const normalizedPayload = normalizeProjectPayloadForWorkspace(payload, usesProjectRoundingOnly);
  const projectId = normalizedPayload?.id || randomUUID();
  const decodedClientId = usesProjectRoundingOnly
    ? ""
    : decodeURIComponent(clientId || normalizedPayload?.client_id || "");
  const client = decodedClientId
    ? await readClientScope(session.workspace_id, decodedClientId, {
        archivedMessage: "Archived clients cannot receive new projects.",
        notFoundMessage: "Client not found",
      })
    : null;
  const parentProject = await validateProjectParent(
    session.workspace_id,
    projectId,
    normalizedPayload?.parent_project_id || normalizedPayload?.parentProjectId || "",
    decodedClientId,
  );

  await permissionsService.assertCan(session, "projects.manage", {
    workspace_id: session.workspace_id,
    client_id: decodedClientId || "",
    operation: "create",
  });

  if (parentProject) {
    await permissionsService.assertCan(session, "projects.manage", {
      workspace_id: session.workspace_id,
      client_id: parentProject.client_id,
      project_id: parentProject.id,
      operation: "update",
    });
  }

  const project = normalizeProjectPayload(normalizedPayload, {
    id: projectId,
    client_id: decodedClientId,
  }, client?.billable || "yes");
  project.workspace_id = session.workspace_id;
  project.parent_project_id = parentProject?.id || "";

  await assertUniqueProjectNameInScope(session.workspace_id, project.client_id, project.name);

  await projectsRepository.create(session.workspace_id, decodedClientId, project);
  await saveProjectReminderPolicy(session.workspace_id, project.id, normalizedPayload);
  await saveTargetTags(session, "project", project.id, normalizedPayload);
  if (project.client_id || project.parent_project_id) {
    await requestTagPropagationRefresh(session, "project", project.id, "project.created_with_relationship");
  }
  await recordAudit(normalizedPayload?.action, {
    session,
    action: "project_created",
    changeType: "create",
    recordType: "project",
    recordId: project.id,
    recordLabel: project.name,
    recordUrl: client ? `projects.html?client=${encodeURIComponent(client.id)}` : "projects.html",
    previousValue: null,
    newValue: project,
    metadata: projectMetadata(client, project, parentProject),
  });
  await syncProjectSearchIndex(session.workspace_id, project.id, "project.created");

  return { project: (await tagsService.decorateRecordsForTarget(session, "project", [project]))[0] };
}

async function assertBusinessWorkspace(session) {
  const settings = await settingsRepository.readWorkspaceSettings(session.workspace_id);

  if (settings.workspaceType === "business") {
    return;
  }

  throw new AppError("Clients are only available in Business workspaces.", 403);
}

async function updateProject(projectId, payload, session) {
  const workspaceSettings = await settingsRepository.readWorkspaceSettings(session.workspace_id);
  const usesProjectRoundingOnly = workspaceUsesProjectRoundingOnly(workspaceSettings.workspaceType);
  const normalizedPayload = normalizeProjectPayloadForWorkspace(payload, usesProjectRoundingOnly);
  const decodedProjectId = decodeURIComponent(projectId || "");
  const updatePlan = await planProjectUpdate({
    workspaceId: session.workspace_id,
    projectId: decodedProjectId,
    payload: normalizedPayload,
    usesProjectRoundingOnly,
  });
  const previousProject = updatePlan.previousProject;
  const client = updatePlan.targetClient;
  const parentProject = updatePlan.targetParentProject;

  await permissionsService.assertCan(session, "projects.manage", {
    workspace_id: session.workspace_id,
    client_id: previousProject.client_id,
    project_id: decodedProjectId,
    operation: "update",
  });

  if (updatePlan.move.isMove) {
    await permissionsService.assertCan(session, "projects.manage", {
      workspace_id: session.workspace_id,
      client_id: updatePlan.move.toClientId,
      project_id: decodedProjectId,
      operation: "update",
    });
  }

  if (updatePlan.parentMove.isMove && parentProject) {
    await permissionsService.assertCan(session, "projects.manage", {
      workspace_id: session.workspace_id,
      client_id: parentProject.client_id,
      project_id: parentProject.id,
      operation: "update",
    });
  }

  if (!usesProjectRoundingOnly && billingDetailsChanged(previousProject, normalizedPayload)) {
    await permissionsService.assertCan(session, "billing.manage", {
      workspace_id: session.workspace_id,
      client_id: previousProject.client_id,
      project_id: decodedProjectId,
    });

    if (updatePlan.move.isMove) {
      await permissionsService.assertCan(session, "billing.manage", {
        workspace_id: session.workspace_id,
        client_id: updatePlan.move.toClientId,
        project_id: decodedProjectId,
      });
    }
  }

  const project = normalizeProjectPayload(normalizedPayload, {
    ...previousProject,
    id: decodedProjectId,
    client_id: client?.id || "",
  }, client?.billable || previousProject.billable || "yes");
  project.workspace_id = session.workspace_id;
  project.parent_project_id = parentProject?.id || "";

  await assertUniqueProjectNameInScope(session.workspace_id, project.client_id, project.name, decodedProjectId);

  await assertProjectRecordMaintenanceConfirmed({
    workspaceId: session.workspace_id,
    project,
    previousProject,
    updatePlan,
    payload: normalizedPayload,
  });

  await projectsRepository.update(session.workspace_id, project);
  await saveProjectReminderPolicy(session.workspace_id, project.id, normalizedPayload);
  await saveTargetTags(session, "project", project.id, normalizedPayload);
  if (updatePlan.move.isMove || updatePlan.parentMove.isMove) {
    await requestTagPropagationRefresh(session, "project", project.id, "project.relationship_changed");
  }
  const downstreamRecords = await applyConfirmedProjectRecordMaintenance({
    workspaceId: session.workspace_id,
    project,
    previousProject,
    targetClient: client,
    updatePlan,
  });
  await recordAudit(normalizedPayload?.action, {
    session,
    action: "project_updated",
    changeType: "update",
    recordType: "project",
    recordId: project.id,
    recordLabel: project.name,
    recordUrl: client ? `projects.html?client=${encodeURIComponent(client.id)}` : "projects.html",
    previousValue: previousProject,
    newValue: project,
    metadata: {
      old_project_name: previousProject.name,
      old_status: previousProject.status,
      new_status: project.status,
      old_billable: previousProject.billable,
      new_billable: project.billable,
      old_parent_project_id: previousProject.parent_project_id || "",
      old_parent_project_name: await readProjectName(session.workspace_id, previousProject.parent_project_id),
      new_parent_project_id: project.parent_project_id || "",
      new_parent_project_name: parentProject?.name || "",
      downstream_records: downstreamRecords,
      ...projectMetadata(client, project, parentProject),
    },
  });
  await syncProjectSearchIndex(session.workspace_id, project.id, "project.updated");
  if (downstreamRecords.time_entries_updated > 0) {
    await syncTimeEntrySearchIndexForProject(session.workspace_id, project.id, "project.updated_time_entries");
  }

  return { project: (await tagsService.decorateRecordsForTarget(session, "project", [project]))[0] };
}

async function assertProjectRecordMaintenanceConfirmed({
  workspaceId,
  project,
  updatePlan,
  payload,
}) {
  const projectMoved = updatePlan.move.isMove || updatePlan.parentMove.isMove;
  const timeEntryCount = await timeEntriesRepository.countByProjectId(workspaceId, project.id);

  if (projectMoved && timeEntryCount > 0 && payload?.confirm_downstream_update !== true) {
    throw new AppError("Confirm downstream record updates before moving or renaming this project.", 409);
  }
}

async function applyConfirmedProjectRecordMaintenance({
  workspaceId,
  project,
  targetClient,
  updatePlan,
}) {
  const projectMoved = updatePlan.move.isMove || updatePlan.parentMove.isMove;
  const timeEntryCount = await timeEntriesRepository.countByProjectId(workspaceId, project.id);

  if (!projectMoved || timeEntryCount === 0) {
    return {
      time_entries_updated: 0,
      confirmation_required: false,
      activeTimers: "resolve_scope_on_next_save_or_finalize",
      futureRecordTypes: ["tasks", "notes", "knowledge_base"],
    };
  }

  await timeEntriesRepository.updateProjectScope(workspaceId, project.id, {
    client_id: project.client_id || "",
    client_name: targetClient?.name || "",
    project_name: project.name,
  });

  return {
    time_entries_updated: timeEntryCount,
    confirmation_required: true,
    activeTimers: "resolve_scope_on_next_save_or_finalize",
    futureRecordTypes: ["tasks", "notes", "knowledge_base"],
  };
}

async function saveTargetTags(session, targetType, targetId, payload = {}) {
  if (!Object.hasOwn(payload || {}, "tagIds") && !Object.hasOwn(payload || {}, "tag_ids")) {
    return;
  }

  await tagsService.replaceAssignments(session, {
    targetId,
    targetType,
    tagIds: payload.tagIds || payload.tag_ids || [],
  });
}

async function requestTagPropagationRefresh(session, targetType, targetId, reason) {
  try {
    await tagsService.refreshPropagatedAssignmentsForTarget(session, {
      reason,
      targetId,
      targetType,
    });
  } catch (error) {
    console.error(`[client-projects] Tag propagation refresh failed for ${targetType}:${targetId}:`, error);
  }
}

async function archiveProject(projectId, payload, session) {
  const decodedProjectId = decodeURIComponent(projectId || "");
  const previousProject = await projectsRepository.readById(session.workspace_id, decodedProjectId);

  if (!decodedProjectId || !previousProject) {
    throw new AppError("Project not found", 404);
  }

  await permissionsService.assertCan(session, "projects.manage", {
    workspace_id: session.workspace_id,
    client_id: previousProject.client_id,
    project_id: decodedProjectId,
    operation: "delete",
  });

  const client = await clientsRepository.readById(session.workspace_id, previousProject.client_id);

  await projectsRepository.archive(session.workspace_id, decodedProjectId);
  await recordAudit(payload?.action, {
    session,
    action: "project_archived",
    changeType: "archive",
    recordType: "project",
    recordId: previousProject.id,
    recordLabel: previousProject.name,
    recordUrl: previousProject.client_id ? `projects.html?client=${encodeURIComponent(previousProject.client_id)}` : "projects.html",
    previousValue: previousProject,
    newValue: {
      ...previousProject,
      status: "Inactive",
    },
    metadata: {
      client_id: previousProject.client_id,
      client_name: client?.name || "",
      old_status: previousProject.status,
      new_status: "Inactive",
    },
  });
  await syncProjectSearchIndex(session.workspace_id, decodedProjectId, "project.archived");

  return { project_id: decodedProjectId, archived: true };
}

async function syncClientSearchIndex(workspaceId, clientId, reason) {
  await searchIndexSyncService.reindexRecord({
    workspaceId,
    moduleId: "client-projects",
    recordType: "client",
    recordId: clientId,
    reason,
  });
}

async function syncProjectSearchIndex(workspaceId, projectId, reason) {
  await searchIndexSyncService.reindexRecord({
    workspaceId,
    moduleId: "client-projects",
    recordType: "project",
    recordId: projectId,
    reason,
  });
}

async function syncProjectSearchIndexForClient(workspaceId, clientId, reason) {
  const projects = await projectsRepository.readByClientId(workspaceId, clientId);
  await searchIndexSyncService.reindexRecords(projects.map((project) => ({
    workspaceId,
    moduleId: "client-projects",
    recordType: "project",
    recordId: project.id,
    reason,
  })));
}

async function syncTimeEntrySearchIndexForProject(workspaceId, projectId, reason) {
  const entries = await timeEntriesRepository.readByProjectId(workspaceId, projectId);
  await searchIndexSyncService.reindexRecords(entries.map((entry) => ({
    workspaceId,
    moduleId: "time-tracking",
    recordType: "time_entry",
    recordId: entry.entry_id,
    reason,
  })));
}

function normalizeClientPayload(payload, fallback = {}) {
  const normalized = normalizeClientProjectData({
    clients: [{
      ...fallback,
      ...payload,
      projects: [],
    }],
  }).clients[0];

  if (!normalized.id || !normalized.name) {
    throw new AppError("Client id and name are required", 400);
  }

  return normalized;
}

function normalizeProjectPayload(payload, fallback = {}, fallbackBillable = "yes") {
  const normalizedData = normalizeClientProjectData({
    clients: [{
      id: "client",
      name: "Client",
      billable: fallbackBillable,
      projects: [{
        ...fallback,
        ...payload,
      }],
    }],
  });
  const project = normalizedData.clients[0].projects[0];

  if (!project.id || !project.name) {
    throw new AppError("Project id and name are required", 400);
  }

  return {
    ...project,
    client_id: Object.hasOwn(payload || {}, "client_id")
      ? String(payload.client_id || "").trim()
      : String(fallback.client_id || "").trim(),
    parent_project_id: Object.hasOwn(payload || {}, "parent_project_id")
      ? String(payload.parent_project_id || "").trim()
      : Object.hasOwn(payload || {}, "parentProjectId")
        ? String(payload.parentProjectId || "").trim()
        : String(fallback.parent_project_id || "").trim(),
  };
}

async function validateClientParent(workspaceId, clientId, parentClientId) {
  const normalizedClientId = String(clientId || "").trim();
  const normalizedParentId = String(parentClientId || "").trim();

  if (!normalizedParentId) {
    return null;
  }

  if (normalizedParentId === normalizedClientId) {
    throw new AppError("A client cannot be its own parent.", 400);
  }

  const clients = await clientsRepository.readAll(workspaceId);
  const parentClient = clients.find((client) => client.id === normalizedParentId);

  if (!parentClient) {
    throw new AppError("Parent client not found.", 404);
  }

  if (isArchivedRecord(parentClient)) {
    throw new AppError("Archived clients cannot be used as parent clients.", 400);
  }

  const descendants = collectDescendantIds(clients, normalizedClientId, "parent_client_id");
  if (descendants.has(normalizedParentId)) {
    throw new AppError("A client cannot be nested below one of its descendants.", 400);
  }

  return parentClient;
}

async function validateProjectParent(workspaceId, projectId, parentProjectId, clientId) {
  const normalizedProjectId = String(projectId || "").trim();
  const normalizedParentId = String(parentProjectId || "").trim();
  const normalizedClientId = String(clientId || "").trim();

  if (!normalizedParentId) {
    return null;
  }

  if (normalizedParentId === normalizedProjectId) {
    throw new AppError("A project cannot be its own parent.", 400);
  }

  const projects = await projectsRepository.readAll(workspaceId);
  const parentProject = projects.find((project) => project.id === normalizedParentId);

  if (!parentProject) {
    throw new AppError("Parent project not found.", 404);
  }

  if (isArchivedRecord(parentProject)) {
    throw new AppError("Archived projects cannot be used as parent projects.", 400);
  }

  if ((parentProject.client_id || "") !== normalizedClientId) {
    throw new AppError("Parent project must belong to the same client or workspace project scope.", 400);
  }

  const descendants = collectDescendantIds(projects, normalizedProjectId, "parent_project_id");
  if (descendants.has(normalizedParentId)) {
    throw new AppError("A project cannot be nested below one of its descendants.", 400);
  }

  return parentProject;
}

function collectDescendantIds(records, recordId, parentField) {
  const descendants = new Set();
  const pending = [recordId];

  while (pending.length > 0) {
    const currentId = pending.pop();
    records
      .filter((record) => (record[parentField] || "") === currentId)
      .forEach((record) => {
        if (!descendants.has(record.id)) {
          descendants.add(record.id);
          pending.push(record.id);
        }
      });
  }

  return descendants;
}

async function readClientName(workspaceId, clientId) {
  if (!clientId) {
    return "";
  }

  return (await clientsRepository.readById(workspaceId, clientId))?.name || "";
}

async function readProjectName(workspaceId, projectId) {
  if (!projectId) {
    return "";
  }

  return (await projectsRepository.readById(workspaceId, projectId))?.name || "";
}

function normalizeProjectPayloadForWorkspace(payload = {}, usesProjectRoundingOnly = false) {
  if (!usesProjectRoundingOnly) {
    return payload;
  }

  return {
    ...payload,
    client_id: "",
    billable: "no",
    billing_rate: null,
    billing_period: null,
    billingPeriod: null,
  };
}

function workspaceUsesProjectRoundingOnly(workspaceType) {
  return workspaceType === "personal" || workspaceType === "family";
}

async function assertUniqueProjectNameInScope(workspaceId, clientId, projectName, excludeProjectId = "") {
  const existingProject = await projectsRepository.readByNameInScope(
    workspaceId,
    clientId,
    projectName,
    excludeProjectId,
  );

  if (existingProject) {
    throw new AppError("Project name already exists for this workspace/client.", 409);
  }
}

async function recordAudit(providedAction, auditEvent) {
  await auditService.record({
    ...auditEvent,
    action: providedAction?.action || auditEvent.action,
    metadata: {
      ...(auditEvent.metadata || {}),
      provided_action: providedAction || null,
    },
  });
}

async function attachReminderPolicies(data, workspaceId) {
  const clients = await Promise.all((data.clients || []).map(async (client) => ({
    ...client,
    taskReminderPolicy: await taskRemindersService.readTargetPolicy(workspaceId, "client", client.id),
    projects: await Promise.all((client.projects || []).map(async (project) => ({
      ...project,
      taskReminderPolicy: await taskRemindersService.readTargetPolicy(workspaceId, "project", project.id),
    }))),
  })));
  const workspaceProjects = await Promise.all((data.workspaceProjects || []).map(async (project) => ({
    ...project,
    taskReminderPolicy: await taskRemindersService.readTargetPolicy(workspaceId, "project", project.id),
  })));

  return {
    ...data,
    clients,
    workspaceProjects,
  };
}

async function saveClientReminderPolicy(workspaceId, clientId, payload = {}) {
  if (!hasTaskReminderPolicyPayload(payload)) {
    return;
  }

  await taskRemindersService.saveTargetPolicy(
    workspaceId,
    "client",
    clientId,
    payload.taskReminderPolicy || payload.task_reminder_policy,
    readReminderPolicyInherited(payload),
  );
}

async function saveProjectReminderPolicy(workspaceId, projectId, payload = {}) {
  if (!hasTaskReminderPolicyPayload(payload)) {
    return;
  }

  await taskRemindersService.saveTargetPolicy(
    workspaceId,
    "project",
    projectId,
    payload.taskReminderPolicy || payload.task_reminder_policy,
    readReminderPolicyInherited(payload),
  );
}

function hasTaskReminderPolicyPayload(payload) {
  return Object.hasOwn(payload || {}, "taskReminderPolicy") ||
    Object.hasOwn(payload || {}, "task_reminder_policy");
}

function readReminderPolicyInherited(payload) {
  const policy = payload.taskReminderPolicy || payload.task_reminder_policy || {};
  return policy.inherited !== false;
}

function clientMetadata(client, parentClient = null) {
  return {
    client_id: client.id,
    client_name: client.name,
    parent_client_id: client.parent_client_id || "",
    parent_client_name: parentClient?.name || "",
    status: client.status,
    billable: client.billable,
    billing_rate: client.billing_rate,
  };
}

function projectMetadata(client, project, parentProject = null) {
  return {
    client_id: client?.id || "",
    client_name: client?.name || "",
    project_id: project.id,
    project_name: project.name,
    parent_project_id: project.parent_project_id || "",
    parent_project_name: parentProject?.name || "",
    status: project.status,
    billable: project.billable,
    billing_rate: project.billing_rate,
  };
}

function billingDetailsChanged(previousRecord, payload = {}) {
  const billingFields = [
    "billable",
    "billing_rate",
    "billingPeriod",
    "billing_period_type",
    "billing_period_start_day",
    "billingRounding",
    "billing_rounding",
    "billing_rounding_enabled",
    "billing_rounding_increment",
  ];

  return billingFields.some((field) => Object.hasOwn(payload, field) && payload[field] !== previousRecord[field]);
}

export const clientsService = {
  archiveClient,
  archiveProject,
  createClient,
  createProject,
  listClientProjects,
  listClients,
  listProjects,
  readClient,
  readClientProjects,
  readProject,
  saveClientProjects,
  updateClient,
  updateProject,
};
