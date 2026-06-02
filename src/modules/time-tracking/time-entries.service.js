import { randomUUID } from "node:crypto";
import { clientsRepository } from "../client-projects/clients.repo.js";
import { projectsRepository } from "../client-projects/projects.repo.js";
import { timeEntriesRepository } from "./time-entries.repo.js";
import { modulesService } from "../../core/modules/modules.service.js";
import { auditService } from "../../core/audit.js";
import { AppError } from "../../core/errors.js";
import { permissionsService } from "../../core/permissions.js";
import { normalizeTimeEntry } from "../../utils/normalizers.js";
import { normalizeUtcIso } from "../../utils/timezones.js";

async function create(entry, session) {
  await assertTimeTrackingEnabled(session);
  const scope = await resolveTimeEntryScope(session.organization_id, entry);

  await permissionsService.assertCan(session, "time_entries.create", {
    organization_id: session.organization_id,
    client_id: scope.client?.id || "",
    project_id: scope.project.id,
    operation: "create",
  });

  const entryId = randomUUID();
  const data = normalizeTimeEntry({
    entry_id: entryId,
    organization_id: session.organization_id,
    user_id: session.user_id,
    client_id: scope.client?.id || "",
    client_name: scope.client?.name || "",
    project_id: scope.project.id,
    project_name: scope.project.name,
    description: entry.description,
    start_time: normalizeUtcIso(entry.start_time, session.timezone),
    end_time: normalizeUtcIso(entry.end_time, session.timezone),
    duration_seconds: entry.duration_seconds,
    duration_hours: entry.duration_hours,
    billable: entry.billable ?? scope.project.billable ?? scope.client?.billable ?? "yes",
    invoice_status: entry.invoice_status || "unbilled",
  });

  await timeEntriesRepository.create(data);
  await auditService.record({
    session,
    action: "time_entry_created",
    changeType: "create",
    recordType: "time_entry",
    recordId: entryId,
    recordLabel: data.client_name ? `${data.client_name} / ${data.project_name}` : data.project_name,
    recordUrl: `edit-entries.html?entry=${encodeURIComponent(entryId)}`,
    previousValue: null,
    newValue: data,
    metadata: {
      client_id: data.client_id,
      client_name: data.client_name,
      project_id: data.project_id,
      project_name: data.project_name,
      storage: "database",
    },
  });

  return { entry_id: entryId, storage: "database" };
}

async function update(payload, entryId, session) {
  await assertTimeTrackingEnabled(session);
  const decodedEntryId = decodeURIComponent(entryId || "");
  const previousEntry = await timeEntriesRepository.readById(session.organization_id, decodedEntryId);

  if (!decodedEntryId || !previousEntry) {
    throw new AppError("Time entry not found", 404);
  }

  const action = previousEntry.user_id === session.user_id ? "time_entries.edit_own" : "time_entries.edit_all";
  await permissionsService.assertCan(session, action, {
    organization_id: session.organization_id,
    client_id: previousEntry.client_id,
    project_id: previousEntry.project_id,
    operation: "update",
  });

  const scope = await resolveTimeEntryScope(session.organization_id, {
    ...previousEntry,
    ...payload,
  });
  const updatedEntry = normalizeTimeEntry({
    ...payload,
    start_time: normalizeUtcIso(payload.start_time, session.timezone),
    end_time: normalizeUtcIso(payload.end_time, session.timezone),
    entry_id: decodedEntryId,
    organization_id: session.organization_id,
    user_id: previousEntry.user_id,
    client_id: scope.client?.id || "",
    client_name: scope.client?.name || "",
    project_id: scope.project.id,
    project_name: scope.project.name,
  });

  await timeEntriesRepository.update(updatedEntry);
  await auditService.record({
    session,
    action: "time_entry_updated",
    changeType: "update",
    recordType: "time_entry",
    recordId: decodedEntryId,
    recordLabel: updatedEntry.client_name
      ? `${updatedEntry.client_name} / ${updatedEntry.project_name}`
      : updatedEntry.project_name,
    recordUrl: `edit-entries.html?entry=${encodeURIComponent(decodedEntryId)}`,
    previousValue: previousEntry,
    newValue: updatedEntry,
    metadata: {
      old_client_id: previousEntry.client_id,
      old_project_id: previousEntry.project_id,
      old_duration_seconds: previousEntry.duration_seconds,
      new_duration_seconds: updatedEntry.duration_seconds,
    },
  });

  return { entry: updatedEntry, storage: "database" };
}

async function remove(entryId, session) {
  await assertTimeTrackingEnabled(session);
  const decodedEntryId = decodeURIComponent(entryId || "");
  const previousEntry = await timeEntriesRepository.readById(session.organization_id, decodedEntryId);

  if (!decodedEntryId || !previousEntry) {
    throw new AppError("Time entry not found", 404);
  }

  const action = previousEntry.user_id === session.user_id ? "time_entries.edit_own" : "time_entries.edit_all";
  await permissionsService.assertCan(session, action, {
    organization_id: session.organization_id,
    client_id: previousEntry.client_id,
    project_id: previousEntry.project_id,
    operation: "delete",
  });

  await timeEntriesRepository.remove(session.organization_id, decodedEntryId);
  await auditService.record({
    session,
    action: "time_entry_deleted",
    changeType: "delete",
    recordType: "time_entry",
    recordId: decodedEntryId,
    recordLabel: previousEntry.client_name
      ? `${previousEntry.client_name} / ${previousEntry.project_name}`
      : previousEntry.project_name,
    recordUrl: `edit-entries.html?entry=${encodeURIComponent(decodedEntryId)}`,
    previousValue: previousEntry,
    newValue: null,
    metadata: {
      duration_seconds: previousEntry.duration_seconds,
      invoice_status: previousEntry.invoice_status,
    },
  });

  return { entry_id: decodedEntryId, deleted: true };
}

async function list(session) {
  const entries = await timeEntriesRepository.readAll(session.organization_id);
  return { entries: await permissionsService.filterReadableTimeEntries(session, entries) };
}

async function resolveTimeEntryScope(organizationId, entry) {
  const projectId = String(entry.project_id || "").trim();
  const project = projectId ? await projectsRepository.readById(organizationId, projectId) : null;

  if (!project) {
    throw new AppError("Project not found", 404);
  }

  const requestedClientId = String(entry.client_id || "").trim();
  const effectiveClientId = project.client_id || requestedClientId;
  const client = effectiveClientId
    ? await clientsRepository.readById(organizationId, effectiveClientId)
    : null;

  if (effectiveClientId && !client) {
    throw new AppError("Client not found", 404);
  }

  if (requestedClientId && project.client_id && requestedClientId !== project.client_id) {
    throw new AppError("Project not found", 404);
  }

  return { client, project };
}

async function assertTimeTrackingEnabled(session) {
  const status = await modulesService.readModuleStatus(session.organization_id, "time-tracking");

  if (status !== "enabled") {
    throw new AppError("Time tracking is turned off for this workspace.", 403);
  }
}

export const timeEntriesService = {
  create,
  list,
  remove,
  update,
};
