import { createRecordId } from "../../core/identifiers.js";
import { AppError } from "../../core/errors.js";
import { timeEntriesRepository } from "./time-entries.repo.js";
import { auditService } from "../../core/audit.js";
import { assertModuleWriteEnabled } from "../../core/modules/module-access.js";
import { resolveProjectRecordScope } from "../../core/record-scope.js";
import { normalizeTimeEntry } from "../../utils/normalizers.js";
import { normalizeUtcIso } from "../../utils/timezones.js";
import { workspaceSupportsBillable } from "../../utils/workspaces.js";
import { settingsRepository } from "../../repositories/settings.repo.js";
import {
  PublicApiTimeEntryCreateSchema,
  parseTimeTrackingEdgePayload,
} from "./time-tracking.contracts.js";

/** @typedef {import("zod").infer<typeof PublicApiTimeEntryCreateSchema>} PublicApiTimeEntryCreatePayload */
/** @typedef {import("../../types/time-tracking-contracts.d.ts").PublicApiContext} PublicApiContext */
/** @typedef {import("../../types/time-tracking-contracts.d.ts").PublicApiQuery} PublicApiQuery */
/** @typedef {import("../../types/time-tracking-contracts.d.ts").TimeEntryRecord} TimeEntryRecord */

const MODULE_ID = "time-tracking";

/** @param {PublicApiContext} context @param {PublicApiQuery} query */
async function listTimeEntries(context, query) {
  const [storedEntries, settings] = await Promise.all([
    timeEntriesRepository.readAll(context.workspace_id),
    settingsRepository.readWorkspaceSettings(context.workspace_id),
  ]);
  const entries = workspaceSupportsBillable(settings.workspaceType)
    ? storedEntries
    : storedEntries.map((entry) => ({ ...entry, billable: "no" }));
  return paged(entries.map((entry) => withWorkspaceAlias(entry, context)), query);
}

/** @param {PublicApiContext} context @param {unknown} rawPayload */
async function createTimeEntry(context, rawPayload) {
  await assertModuleWriteEnabled(context, MODULE_ID);
  const payload = parseTimeTrackingEdgePayload(PublicApiTimeEntryCreateSchema, rawPayload);
  const [{ client, project }, settings] = await Promise.all([
    resolveProjectRecordScope(context.workspace_id, payload, {
      archivedClientMessage: "Archived clients cannot receive new time entries.",
      archivedProjectMessage: "Archived projects cannot receive new time entries.",
      clientNotFoundMessage: "Client was not found.",
      projectNotFoundMessage: "Project was not found.",
    }),
    settingsRepository.readWorkspaceSettings(context.workspace_id),
  ]);
  if (!project) {
    throw new AppError("Project was not found.", 404);
  }

  const entryId = payload.entry_id || createRecordId();
  const duration = normalizePublicApiDuration(payload);
  const entry = normalizeTimeEntry({
    entry_id: entryId,
    workspace_id: context.workspace_id,
    user_id: context.user_id,
    client_id: client?.id || "",
    client_name: client?.name || "",
    project_id: project.id,
    project_name: project.name,
    task_id: payload.task_id,
    description: payload.description,
    start_time: normalizeUtcIso(payload.start_time, context.timezone),
    end_time: normalizeUtcIso(payload.end_time, context.timezone),
    duration_seconds: duration.durationSeconds,
    duration_hours: duration.durationHours,
    billable: workspaceSupportsBillable(settings.workspaceType)
      ? payload.billable ?? project.billable ?? client?.billable ?? "yes"
      : "no",
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
    recordUrl: `time-entries.html?entry=${encodeURIComponent(entryId)}`,
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

/** @param {PublicApiTimeEntryCreatePayload} payload */
function normalizePublicApiDuration(payload) {
  const hasDurationSeconds = payload.duration_seconds !== undefined;
  const hasDurationHours = payload.duration_hours !== undefined;

  if (!hasDurationSeconds && !hasDurationHours) {
    return {
      durationHours: payload.duration_hours,
      durationSeconds: payload.duration_seconds,
    };
  }

  const parsedSeconds = hasDurationSeconds
    ? Number.parseInt(String(payload.duration_seconds), 10)
    : Math.round(Number(payload.duration_hours) * 3600);
  const durationSeconds = Number.isFinite(parsedSeconds) ? parsedSeconds : 0;

  return {
    durationHours: (durationSeconds / 3600).toFixed(4),
    durationSeconds,
  };
}

/** @template {Record<string, unknown>} RecordType @param {RecordType} record @param {PublicApiContext} context */
function withWorkspaceAlias(record, context) {
  if (!record || typeof record !== "object") {
    return record;
  }

  return {
    ...record,
    workspace_id: record.workspace_id || context.workspace_id,
  };
}

/** @template Item @param {Item[]} items @param {PublicApiQuery} query */
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

/** @param {unknown} value @param {number} min @param {number} max @param {number} fallback */
function clampInteger(value, min, max, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(Math.max(parsed, min), max);
}

export const timeTrackingPublicApiService = {
  createTimeEntry,
  listTimeEntries,
};
