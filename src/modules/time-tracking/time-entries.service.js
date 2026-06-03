import { randomUUID } from "node:crypto";
import { timeEntriesRepository } from "./time-entries.repo.js";
import { assertModuleWriteEnabled } from "../../core/modules/module-access.js";
import { auditService } from "../../core/audit.js";
import { AppError } from "../../core/errors.js";
import { permissionsService } from "../../core/permissions.js";
import { resolveProjectRecordScope } from "../../core/record-scope.js";
import { normalizeTimeEntry } from "../../utils/normalizers.js";
import { normalizeUtcIso } from "../../utils/timezones.js";

const MODULE_ID = "time-tracking";

async function create(entry, session) {
  await assertModuleWriteEnabled(session, MODULE_ID);
  const scope = await resolveTimeEntryScope(session.workspace_id, entry);

  await permissionsService.assertCan(session, "time_entries.create", {
    workspace_id: session.workspace_id,
    client_id: scope.client?.id || "",
    project_id: scope.project.id,
    operation: "create",
  });

  const entryId = randomUUID();
  const data = normalizeTimeEntry({
    entry_id: entryId,
    workspace_id: session.workspace_id,
    user_id: session.user_id,
    client_id: scope.client?.id || "",
    client_name: scope.client?.name || "",
    project_id: scope.project.id,
    project_name: scope.project.name,
    task_id: entry.task_id,
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
  await assertModuleWriteEnabled(session, MODULE_ID);
  const decodedEntryId = decodeURIComponent(entryId || "");
  const previousEntry = await timeEntriesRepository.readById(session.workspace_id, decodedEntryId);

  if (!decodedEntryId || !previousEntry) {
    throw new AppError("Time entry not found", 404);
  }

  const action = previousEntry.user_id === session.user_id ? "time_entries.edit_own" : "time_entries.edit_all";
  await permissionsService.assertCan(session, action, {
    workspace_id: session.workspace_id,
    client_id: previousEntry.client_id,
    project_id: previousEntry.project_id,
    operation: "update",
  });

  const scope = await resolveTimeEntryScope(session.workspace_id, {
    ...previousEntry,
    ...payload,
  });
  const updatedEntry = normalizeTimeEntry({
    ...payload,
    start_time: normalizeUtcIso(payload.start_time, session.timezone),
    end_time: normalizeUtcIso(payload.end_time, session.timezone),
    entry_id: decodedEntryId,
    workspace_id: session.workspace_id,
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
  await assertModuleWriteEnabled(session, MODULE_ID);
  const decodedEntryId = decodeURIComponent(entryId || "");
  const previousEntry = await timeEntriesRepository.readById(session.workspace_id, decodedEntryId);

  if (!decodedEntryId || !previousEntry) {
    throw new AppError("Time entry not found", 404);
  }

  const action = previousEntry.user_id === session.user_id ? "time_entries.edit_own" : "time_entries.edit_all";
  await permissionsService.assertCan(session, action, {
    workspace_id: session.workspace_id,
    client_id: previousEntry.client_id,
    project_id: previousEntry.project_id,
    operation: "delete",
  });

  await timeEntriesRepository.remove(session.workspace_id, decodedEntryId);
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
  const entries = await timeEntriesRepository.readAll(session.workspace_id);
  return { entries: await permissionsService.filterReadableTimeEntries(session, entries) };
}

async function resolveTimeEntryScope(workspaceId, entry) {
  return resolveProjectRecordScope(workspaceId, entry, {
    archivedClientMessage: "Archived clients cannot receive new time entries.",
    archivedProjectMessage: "Archived projects cannot receive new time entries.",
    clientNotFoundMessage: "Client not found",
    projectNotFoundMessage: "Project not found",
  });
}

export const timeEntriesService = {
  create,
  list,
  remove,
  update,
};
