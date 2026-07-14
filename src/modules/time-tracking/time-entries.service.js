import { randomUUID } from "node:crypto";
import { timeEntriesRepository } from "./time-entries.repo.js";
import { assertModuleWriteEnabled } from "../../core/modules/module-access.js";
import { auditService } from "../../core/audit.js";
import { tagsService } from "../../services/tags.service.js";
import { searchIndexSyncService } from "../../services/search-index-sync.service.js";
import { AppError } from "../../core/errors.js";
import { permissionsService } from "../../core/permissions.js";
import { resolveProjectRecordScope } from "../../core/record-scope.js";
import { normalizeTimeEntry } from "../../utils/normalizers.js";
import { normalizeUtcIso } from "../../utils/timezones.js";
import { workspaceSupportsBillable } from "../../utils/workspaces.js";
import { settingsRepository } from "../../repositories/settings.repo.js";
import {
  BrowserTimeEntryCreateSchema,
  BrowserTimeEntryUpdateSchema,
  parseTimeTrackingEdgePayload,
} from "./time-tracking.contracts.js";

const MODULE_ID = "time-tracking";

async function create(rawEntry, session) {
  const entry = parseTimeTrackingEdgePayload(BrowserTimeEntryCreateSchema, rawEntry);
  return createFromActiveTimer(entry, session);
}

// Active timer finalization constructs this object from an already-validated
// finalize payload plus the authoritative stored timer. It is intentionally
// not parsed again as an untrusted browser create payload.
async function createFromActiveTimer(entry, session) {
  await assertModuleWriteEnabled(session, MODULE_ID);
  const [scope, settings] = await Promise.all([
    resolveTimeEntryScope(session.workspace_id, entry),
    settingsRepository.readWorkspaceSettings(session.workspace_id),
  ]);

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
    billable: workspaceSupportsBillable(settings.workspaceType)
      ? entry.billable ?? scope.project.billable ?? scope.client?.billable ?? "yes"
      : "no",
    invoice_status: entry.invoice_status || "unbilled",
  });

  await timeEntriesRepository.create(data);
  await saveTargetTags(session, "time_entry", entryId, entry);
  await snapshotTimeEntryEffectiveTags(session, data, "time_entry.created");
  await requestTagPropagationRefresh(session, "time_entry", entryId, "time_entry.created");
  await auditService.record({
    session,
    action: "time_entry_created",
    changeType: "create",
    recordType: "time_entry",
    recordId: entryId,
    recordLabel: data.client_name ? `${data.client_name} / ${data.project_name}` : data.project_name,
    recordUrl: `time-entries.html?entry=${encodeURIComponent(entryId)}`,
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
  await syncTimeEntrySearchIndex(session.workspace_id, entryId, "time_entry.created");

  return {
    entry: (await tagsService.decorateRecordsForTarget(session, "time_entry", [data]))[0],
    entry_id: entryId,
    storage: "database",
  };
}

async function update(rawPayload, entryId, session) {
  await assertModuleWriteEnabled(session, MODULE_ID);
  const payload = parseTimeTrackingEdgePayload(BrowserTimeEntryUpdateSchema, rawPayload);
  const decodedEntryId = decodeURIComponent(entryId || "");
  const previousEntry = await timeEntriesRepository.readById(session.workspace_id, decodedEntryId);

  if (!decodedEntryId || !previousEntry) {
    throw new AppError("Time entry not found", 404);
  }

  const action = resolveTimeEntryEditPermission(session, previousEntry);
  await assertCanCorrectTimeEntry(session, action, previousEntry, previousEntry);

  const [scope, settings] = await Promise.all([
    resolveTimeEntryScope(session.workspace_id, {
      ...previousEntry,
      ...payload,
    }),
    settingsRepository.readWorkspaceSettings(session.workspace_id),
  ]);
  const nextScopeResource = {
    client_id: scope.client?.id || "",
    project_id: scope.project.id,
    workspace_id: session.workspace_id,
  };
  await assertCanCorrectTimeEntry(session, action, previousEntry, nextScopeResource);
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
    billable: workspaceSupportsBillable(settings.workspaceType)
      ? payload.billable ?? previousEntry.billable ?? scope.project.billable ?? scope.client?.billable ?? "yes"
      : "no",
  });

  await timeEntriesRepository.update(updatedEntry);
  await saveTargetTags(session, "time_entry", decodedEntryId, payload);
  await snapshotTimeEntryEffectiveTags(session, updatedEntry, "time_entry.updated");
  if ((previousEntry.project_id || "") !== (updatedEntry.project_id || "")) {
    await requestTagPropagationRefresh(session, "time_entry", decodedEntryId, "time_entry.project_changed");
  }
  const taggedEntry = (await tagsService.decorateRecordsForTarget(session, "time_entry", [updatedEntry]))[0];
  await auditService.record({
    session,
    action: "time_entry_updated",
    changeType: "update",
    recordType: "time_entry",
    recordId: decodedEntryId,
    recordLabel: updatedEntry.client_name
      ? `${updatedEntry.client_name} / ${updatedEntry.project_name}`
      : updatedEntry.project_name,
    recordUrl: `time-entries.html?entry=${encodeURIComponent(decodedEntryId)}`,
    previousValue: previousEntry,
    newValue: taggedEntry,
    metadata: {
      admin_correction: previousEntry.user_id !== session.user_id,
      corrected_user_id: previousEntry.user_id,
      old_client_id: previousEntry.client_id,
      old_project_id: previousEntry.project_id,
      old_duration_seconds: previousEntry.duration_seconds,
      new_duration_seconds: updatedEntry.duration_seconds,
      sensitive_fields_changed: sensitiveTimeEntryCorrectionFields(previousEntry, updatedEntry),
    },
  });
  await syncTimeEntrySearchIndex(session.workspace_id, decodedEntryId, "time_entry.updated");

  return { entry: taggedEntry, storage: "database" };
}

async function remove(entryId, session) {
  await assertModuleWriteEnabled(session, MODULE_ID);
  const decodedEntryId = decodeURIComponent(entryId || "");
  const previousEntry = await timeEntriesRepository.readById(session.workspace_id, decodedEntryId);

  if (!decodedEntryId || !previousEntry) {
    throw new AppError("Time entry not found", 404);
  }

  const action = resolveTimeEntryEditPermission(session, previousEntry);
  await assertTimeEntryEditPermission(session, action, {
    client_id: previousEntry.client_id,
    project_id: previousEntry.project_id,
  }, "delete");

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
    recordUrl: `time-entries.html?entry=${encodeURIComponent(decodedEntryId)}`,
    previousValue: previousEntry,
    newValue: null,
    metadata: {
      duration_seconds: previousEntry.duration_seconds,
      invoice_status: previousEntry.invoice_status,
    },
  });
  await searchIndexSyncService.removeRecord({
    workspaceId: session.workspace_id,
    moduleId: MODULE_ID,
    recordType: "time_entry",
    recordId: decodedEntryId,
    reason: "time_entry.deleted",
  });

  return { entry_id: decodedEntryId, deleted: true };
}

async function list(session, query = {}) {
  const [storedEntries, settings] = await Promise.all([
    timeEntriesRepository.readAll(session.workspace_id),
    settingsRepository.readWorkspaceSettings(session.workspace_id),
  ]);
  const entries = workspaceSupportsBillable(settings.workspaceType)
    ? storedEntries
    : storedEntries.map((entry) => ({ ...entry, billable: "no" }));
  const readableEntries = await permissionsService.filterReadableTimeEntries(session, entries);
  const filteredEntries = await tagsService.filterRecordsByTags(
    session,
    "time_entry",
    readableEntries,
    query.tagIds || query.tag_ids || query.tags,
  );

  return {
    entries: await tagsService.decorateRecordsForTarget(session, "time_entry", filteredEntries),
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

function resolveTimeEntryEditPermission(session, entry) {
  return entry.user_id === session.user_id ? "time_entries.edit_own" : "time_entries.edit_all";
}

async function assertCanCorrectTimeEntry(session, action, previousEntry, resource) {
  await assertTimeEntryEditPermission(session, action, resource, "update");

  if (previousEntry.user_id !== session.user_id) {
    await permissionsService.assertCan(session, "time_entries.edit_all", {
      workspace_id: session.workspace_id,
      client_id: resource.client_id || "",
      project_id: resource.project_id || "",
      operation: "update",
    });
  }
}

// Editing or deleting your own entry resolves to time_entries.edit_own, but edit_all is a strict
// superset of edit_own: a role permitted to correct anyone's entries (e.g. workspace_admin) must
// be able to correct its own. Accept either grant so those roles are not blocked from their own
// time. Correcting someone else's entry still requires edit_all (asserted separately by callers).
async function assertTimeEntryEditPermission(session, action, resource, operation) {
  const editResource = {
    workspace_id: session.workspace_id,
    client_id: resource.client_id || "",
    project_id: resource.project_id || "",
    operation,
  };

  if (action === "time_entries.edit_own") {
    const allowed = await permissionsService.can(session, "time_entries.edit_own", editResource)
      || await permissionsService.can(session, "time_entries.edit_all", editResource);
    if (!allowed) {
      throw new AppError("You do not have permission to perform that action.", 403);
    }
    return;
  }

  await permissionsService.assertCan(session, action, editResource);
}

function sensitiveTimeEntryCorrectionFields(previousEntry, updatedEntry) {
  return [
    previousEntry.user_id !== updatedEntry.user_id ? "user_id" : "",
    previousEntry.billable !== updatedEntry.billable ? "billable" : "",
    previousEntry.invoice_status !== updatedEntry.invoice_status ? "invoice_status" : "",
    previousEntry.client_id !== updatedEntry.client_id ? "client_id" : "",
    previousEntry.project_id !== updatedEntry.project_id ? "project_id" : "",
  ].filter(Boolean);
}

async function requestTagPropagationRefresh(session, targetType, targetId, reason) {
  try {
    await tagsService.refreshPropagatedAssignmentsForTarget(session, {
      reason,
      targetId,
      targetType,
    });
  } catch (error) {
    console.error(`[time-tracking] Tag propagation refresh failed for ${targetType}:${targetId}:`, error);
  }
}

async function snapshotTimeEntryEffectiveTags(session, entry, reason) {
  const sourceTargetType = entry.task_id ? "task" : "project";
  const sourceTargetId = entry.task_id || entry.project_id || "";

  if (!sourceTargetId) {
    return null;
  }

  if (sourceTargetType === "task") {
    await requestTagPropagationRefresh(session, "task", sourceTargetId, `${reason}.task_context`);
  }

  try {
    return await tagsService.snapshotEffectiveTagsForTarget(session, {
      propagationRuleId: sourceTargetType === "task"
        ? "time-entry.task-effective-tag-snapshot"
        : "time-entry.project-effective-tag-snapshot",
      replaceSnapshot: true,
      sourceTargetId,
      sourceTargetType,
      targetId: entry.entry_id,
      targetType: "time_entry",
    });
  } catch (error) {
    console.error(`[time-tracking] Effective tag snapshot failed for time_entry:${entry.entry_id}:`, error);
    return null;
  }
}

async function resolveTimeEntryScope(workspaceId, entry) {
  return resolveProjectRecordScope(workspaceId, entry, {
    archivedClientMessage: "Archived clients cannot receive new time entries.",
    archivedProjectMessage: "Archived projects cannot receive new time entries.",
    clientNotFoundMessage: "Client not found",
    projectNotFoundMessage: "Project not found",
  });
}

async function syncTimeEntrySearchIndex(workspaceId, entryId, reason) {
  await searchIndexSyncService.reindexRecord({
    workspaceId,
    moduleId: MODULE_ID,
    recordType: "time_entry",
    recordId: entryId,
    reason,
  });
}

export const timeEntriesService = {
  create,
  createFromActiveTimer,
  list,
  remove,
  update,
};
