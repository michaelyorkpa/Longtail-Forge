import { randomUUID } from "node:crypto";
import { timeEntriesRepository } from "./time-entries.repo.js";
import { auditService } from "../../core/audit.js";
import { assertModuleWriteEnabled } from "../../core/modules/module-access.js";
import { resolveProjectRecordScope } from "../../core/record-scope.js";
import { normalizeTimeEntry } from "../../utils/normalizers.js";
import { normalizeUtcIso } from "../../utils/timezones.js";

const MODULE_ID = "time-tracking";

async function listTimeEntries(context, query) {
  const entries = await timeEntriesRepository.readAll(context.organization_id);
  return paged(entries.map((entry) => withWorkspaceAlias(entry, context)), query);
}

async function createTimeEntry(context, payload) {
  await assertModuleWriteEnabled(context, MODULE_ID);
  const { client, project } = await resolveProjectRecordScope(context.organization_id, payload, {
    archivedClientMessage: "Archived clients cannot receive new time entries.",
    archivedProjectMessage: "Archived projects cannot receive new time entries.",
    clientNotFoundMessage: "Client was not found.",
    projectNotFoundMessage: "Project was not found.",
  });

  const entryId = payload.entry_id || randomUUID();
  const entry = normalizeTimeEntry({
    entry_id: entryId,
    organization_id: context.organization_id,
    user_id: context.user_id,
    client_id: client?.id || "",
    client_name: client?.name || "",
    project_id: project.id,
    project_name: project.name,
    description: payload.description,
    start_time: normalizeUtcIso(payload.start_time, context.timezone),
    end_time: normalizeUtcIso(payload.end_time, context.timezone),
    duration_seconds: payload.duration_seconds,
    duration_hours: payload.duration_hours,
    billable: payload.billable ?? project.billable ?? client?.billable ?? "yes",
    invoice_status: payload.invoice_status || "unbilled",
  });

  await timeEntriesRepository.create(entry);
  await auditService.record({
    session: context,
    action: "public_api_time_entry_created",
    changeType: "create",
    recordType: "time_entry",
    recordId: entryId,
    recordLabel: entry.client_name ? `${entry.client_name} / ${entry.project_name}` : entry.project_name,
    recordUrl: `edit-entries.html?entry=${encodeURIComponent(entryId)}`,
    previousValue: null,
    newValue: entry,
    metadata: {
      api_key_id: context.api_key_id,
      public_api_version: "v1",
      workspace_id: context.workspace_id,
    },
  });

  return withWorkspaceAlias(entry, context);
}

function withWorkspaceAlias(record, context) {
  if (!record || typeof record !== "object") {
    return record;
  }

  return {
    ...record,
    workspace_id: record.workspace_id || record.organization_id || context.workspace_id || context.organization_id,
  };
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

export const timeTrackingPublicApiService = {
  createTimeEntry,
  listTimeEntries,
};
