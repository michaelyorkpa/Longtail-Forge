import { randomUUID } from "node:crypto";
import { clientsRepository } from "../repositories/clients.repo.js";
import { projectsRepository } from "../repositories/projects.repo.js";
import { timeEntriesRepository } from "../repositories/time-entries.repo.js";
import { auditService } from "./audit.service.js";
import { AppError } from "../utils/app-error.js";
import { normalizeTimeEntry } from "../utils/normalizers.js";

async function listClients(context, query) {
  const clients = await clientsRepository.readAll(context.organization_id);
  return paged(clients, query);
}

async function readClient(context, clientId) {
  const client = await clientsRepository.readById(context.organization_id, decodeURIComponent(clientId || ""));

  if (!client) {
    throw new AppError("Client was not found.", 404);
  }

  return client;
}

async function listProjects(context, query) {
  const projects = await projectsRepository.readAll(context.organization_id);
  return paged(projects, query);
}

async function readProject(context, projectId) {
  const project = await projectsRepository.readById(context.organization_id, decodeURIComponent(projectId || ""));

  if (!project) {
    throw new AppError("Project was not found.", 404);
  }

  return project;
}

async function listTimeEntries(context, query) {
  const entries = await timeEntriesRepository.readAll(context.organization_id);
  return paged(entries, query);
}

async function createTimeEntry(context, payload) {
  const client = await clientsRepository.readById(context.organization_id, payload.client_id);
  const project = await projectsRepository.readById(context.organization_id, payload.project_id);

  if (!client) {
    throw new AppError("Client was not found.", 404);
  }

  if (!project || project.client_id !== client.id) {
    throw new AppError("Project was not found.", 404);
  }

  const entryId = payload.entry_id || randomUUID();
  const entry = normalizeTimeEntry({
    entry_id: entryId,
    organization_id: context.organization_id,
    user_id: payload.user_id || context.user_id,
    client_id: client.id,
    client_name: client.name,
    project_id: project.id,
    project_name: project.name,
    description: payload.description,
    start_time: payload.start_time,
    end_time: payload.end_time,
    duration_seconds: payload.duration_seconds,
    duration_hours: payload.duration_hours,
    billable: payload.billable ?? project.billable ?? client.billable ?? "yes",
    invoice_status: payload.invoice_status || "unbilled",
  });

  await timeEntriesRepository.create(entry);
  await auditService.record({
    session: context,
    action: "public_api_time_entry_created",
    changeType: "create",
    recordType: "time_entry",
    recordId: entryId,
    recordLabel: `${entry.client_name} / ${entry.project_name}`,
    recordUrl: `edit-entries.html?entry=${encodeURIComponent(entryId)}`,
    previousValue: null,
    newValue: entry,
    metadata: {
      api_key_id: context.api_key_id,
      public_api_version: "v1",
    },
  });

  return entry;
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
  createTimeEntry,
  listClients,
  listProjects,
  listTimeEntries,
  readClient,
  readProject,
};
