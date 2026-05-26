import { clientsRepository } from "../repositories/clients.repo.js";
import { projectsRepository } from "../repositories/projects.repo.js";
import { appendAppLog } from "../utils/app-log.js";
import { normalizeClientProjectData } from "../utils/normalizers.js";

async function readClientProjects(session) {
  return readClientProjectData(session.organization_id);
}

async function saveClientProjects(payload, session) {
  const data = normalizeClientProjectData(payload.data);
  const actions = Array.isArray(payload.actions) ? payload.actions : [];

  await saveClientProjectData(data, session.organization_id);

  if (actions.length === 0) {
    await appendAppLog({
      action: "client_project_file_saved",
      details: "No action details provided",
    });
  } else {
    for (const action of actions) {
      await appendAppLog(action);
    }
  }

  return { data };
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

async function saveClientProjectData(data, organizationId) {
  const normalizedData = normalizeClientProjectData(data);

  await clientsRepository.replaceAll(organizationId, normalizedData.clients);
}

export const clientsService = {
  readClientProjects,
  saveClientProjects,
};
