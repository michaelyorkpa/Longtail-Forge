import { randomUUID } from "node:crypto";
import { clientsRepository } from "../repositories/clients.repo.js";
import { projectsRepository } from "../repositories/projects.repo.js";
import { auditService } from "./audit.service.js";
import { permissionsService } from "./permissions.service.js";
import { AppError } from "../utils/app-error.js";
import { normalizeClientProjectData } from "../utils/normalizers.js";

async function readClientProjects(session) {
  const data = await readClientProjectData(session.organization_id);
  const allProjects = data.clients.flatMap((client) => (
    client.projects.map((project) => ({ ...project, client_id: client.id }))
  ));
  const readableClients = await permissionsService.filterReadableClients(session, data.clients);
  const readableProjects = await permissionsService.filterReadableProjects(session, allProjects);
  const readableClientIds = new Set(readableClients.map((client) => client.id));
  const readableProjectClientIds = new Set(readableProjects.map((project) => project.client_id));
  const readableProjectIds = new Set(readableProjects.map((project) => project.id));

  return {
    clients: data.clients
      .filter((client) => readableClientIds.has(client.id) || readableProjectClientIds.has(client.id))
      .map((client) => ({
        ...client,
        projects: client.projects.filter((project) => (
          readableClientIds.has(client.id) || readableProjectIds.has(project.id)
        )),
      })),
  };
}

async function saveClientProjects() {
  throw new AppError(
    "Whole-tree client/project saves are deprecated. Use granular client and project endpoints.",
    410,
  );
}

async function readClientProjectData(organizationId) {
  const clients = await clientsRepository.readAll(organizationId);
  const projects = await projectsRepository.readAll(organizationId);
  const projectsByClientId = projects.reduce((projectsByClient, project) => {
    const projectValue = { ...project };
    delete projectValue.client_id;

    if (!projectsByClient.has(project.client_id)) {
      projectsByClient.set(project.client_id, []);
    }

    projectsByClient.get(project.client_id).push(projectValue);
    return projectsByClient;
  }, new Map());

  return normalizeClientProjectData({
    clients: clients.map((client) => ({
      ...client,
      projects: projectsByClientId.get(client.id) || [],
    })),
  });
}

async function listClients(session) {
  const clients = await clientsRepository.readAll(session.organization_id);
  return { clients: await permissionsService.filterReadableClients(session, clients) };
}

async function readClient(clientId, session) {
  const decodedClientId = decodeURIComponent(clientId || "");
  const client = await clientsRepository.readById(session.organization_id, decodedClientId);

  if (!decodedClientId || !client) {
    throw new AppError("Client not found", 404);
  }

  await permissionsService.assertCan(session, "clients.manage", {
    organization_id: session.organization_id,
    client_id: decodedClientId,
    operation: "read",
  });

  return { client };
}

async function createClient(payload, session) {
  await permissionsService.assertCan(session, "clients.manage", {
    organization_id: session.organization_id,
    operation: "create",
  });
  const client = normalizeClientPayload(payload, { id: payload?.id || randomUUID() });

  await clientsRepository.create(session.organization_id, client);
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
    metadata: clientMetadata(client),
  });

  return { client };
}

async function updateClient(clientId, payload, session) {
  const decodedClientId = decodeURIComponent(clientId || "");
  const previousClient = await clientsRepository.readById(session.organization_id, decodedClientId);

  if (!decodedClientId || !previousClient) {
    throw new AppError("Client not found", 404);
  }

  await permissionsService.assertCan(session, "clients.manage", {
    organization_id: session.organization_id,
    client_id: decodedClientId,
    operation: "update",
  });

  if (billingDetailsChanged(previousClient, payload)) {
    await permissionsService.assertCan(session, "billing.manage", {
      organization_id: session.organization_id,
      client_id: decodedClientId,
    });
  }

  const client = normalizeClientPayload(payload, {
    ...previousClient,
    id: decodedClientId,
  });

  await clientsRepository.update(session.organization_id, client);
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
      ...clientMetadata(client),
    },
  });

  return { client };
}

async function archiveClient(clientId, payload, session) {
  const decodedClientId = decodeURIComponent(clientId || "");
  const previousClient = await clientsRepository.readById(session.organization_id, decodedClientId);

  if (!decodedClientId || !previousClient) {
    throw new AppError("Client not found", 404);
  }

  await permissionsService.assertCan(session, "clients.manage", {
    organization_id: session.organization_id,
    client_id: decodedClientId,
    operation: "delete",
  });

  await clientsRepository.archive(session.organization_id, decodedClientId);
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

  return { client_id: decodedClientId, archived: true };
}

async function listProjects(session) {
  const projects = await projectsRepository.readAll(session.organization_id);
  return { projects: await permissionsService.filterReadableProjects(session, projects) };
}

async function listClientProjects(clientId, session) {
  const decodedClientId = decodeURIComponent(clientId || "");
  const client = await clientsRepository.readById(session.organization_id, decodedClientId);

  if (!decodedClientId || !client) {
    throw new AppError("Client not found", 404);
  }

  await permissionsService.assertCan(session, "projects.manage", {
    organization_id: session.organization_id,
    client_id: decodedClientId,
    operation: "read",
  });

  return {
    client,
    projects: await projectsRepository.readByClientId(session.organization_id, decodedClientId),
  };
}

async function readProject(projectId, session) {
  const decodedProjectId = decodeURIComponent(projectId || "");
  const project = await projectsRepository.readById(session.organization_id, decodedProjectId);

  if (!decodedProjectId || !project) {
    throw new AppError("Project not found", 404);
  }

  await permissionsService.assertCan(session, "projects.manage", {
    organization_id: session.organization_id,
    client_id: project.client_id,
    project_id: decodedProjectId,
    operation: "read",
  });

  return { project };
}

async function createProject(clientId, payload, session) {
  const decodedClientId = decodeURIComponent(clientId || "");
  const client = await clientsRepository.readById(session.organization_id, decodedClientId);

  if (!decodedClientId || !client) {
    throw new AppError("Client not found", 404);
  }

  await permissionsService.assertCan(session, "projects.manage", {
    organization_id: session.organization_id,
    client_id: decodedClientId,
    operation: "create",
  });

  const project = normalizeProjectPayload(payload, {
    id: payload?.id || randomUUID(),
    client_id: decodedClientId,
  }, client.billable);

  await projectsRepository.create(session.organization_id, decodedClientId, project);
  await recordAudit(payload?.action, {
    session,
    action: "project_created",
    changeType: "create",
    recordType: "project",
    recordId: project.id,
    recordLabel: project.name,
    recordUrl: `projects.html?client=${encodeURIComponent(client.id)}`,
    previousValue: null,
    newValue: project,
    metadata: projectMetadata(client, project),
  });

  return { project };
}

async function updateProject(projectId, payload, session) {
  const decodedProjectId = decodeURIComponent(projectId || "");
  const previousProject = await projectsRepository.readById(session.organization_id, decodedProjectId);

  if (!decodedProjectId || !previousProject) {
    throw new AppError("Project not found", 404);
  }

  const clientId = payload?.client_id || previousProject.client_id;
  const client = await clientsRepository.readById(session.organization_id, clientId);

  if (!client) {
    throw new AppError("Client not found", 404);
  }

  await permissionsService.assertCan(session, "projects.manage", {
    organization_id: session.organization_id,
    client_id: client.id,
    project_id: decodedProjectId,
    operation: "update",
  });

  if (billingDetailsChanged(previousProject, payload)) {
    await permissionsService.assertCan(session, "billing.manage", {
      organization_id: session.organization_id,
      client_id: client.id,
      project_id: decodedProjectId,
    });
  }

  const project = normalizeProjectPayload(payload, {
    ...previousProject,
    id: decodedProjectId,
    client_id: client.id,
  }, client.billable);

  await projectsRepository.update(session.organization_id, project);
  await recordAudit(payload?.action, {
    session,
    action: "project_updated",
    changeType: "update",
    recordType: "project",
    recordId: project.id,
    recordLabel: project.name,
    recordUrl: `projects.html?client=${encodeURIComponent(client.id)}`,
    previousValue: previousProject,
    newValue: project,
    metadata: {
      old_project_name: previousProject.name,
      old_status: previousProject.status,
      new_status: project.status,
      old_billable: previousProject.billable,
      new_billable: project.billable,
      ...projectMetadata(client, project),
    },
  });

  return { project };
}

async function archiveProject(projectId, payload, session) {
  const decodedProjectId = decodeURIComponent(projectId || "");
  const previousProject = await projectsRepository.readById(session.organization_id, decodedProjectId);

  if (!decodedProjectId || !previousProject) {
    throw new AppError("Project not found", 404);
  }

  await permissionsService.assertCan(session, "projects.manage", {
    organization_id: session.organization_id,
    client_id: previousProject.client_id,
    project_id: decodedProjectId,
    operation: "delete",
  });

  const client = await clientsRepository.readById(session.organization_id, previousProject.client_id);

  await projectsRepository.archive(session.organization_id, decodedProjectId);
  await recordAudit(payload?.action, {
    session,
    action: "project_archived",
    changeType: "archive",
    recordType: "project",
    recordId: previousProject.id,
    recordLabel: previousProject.name,
    recordUrl: `projects.html?client=${encodeURIComponent(previousProject.client_id)}`,
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

  return { project_id: decodedProjectId, archived: true };
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
    client_id: fallback.client_id,
  };
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

function clientMetadata(client) {
  return {
    client_id: client.id,
    client_name: client.name,
    status: client.status,
    billable: client.billable,
    billing_rate: client.billing_rate,
  };
}

function projectMetadata(client, project) {
  return {
    client_id: client.id,
    client_name: client.name,
    project_id: project.id,
    project_name: project.name,
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
