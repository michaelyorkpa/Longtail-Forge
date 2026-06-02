import { randomUUID } from "node:crypto";
import { auditLogsRepository } from "../repositories/audit-logs.repo.js";
import { userWorkspacesRepository } from "../repositories/user-workspaces.repo.js";
import { settingsRepository } from "../repositories/settings.repo.js";
import { permissionsService } from "./permissions.service.js";
import { AppError } from "../utils/app-error.js";
import { localDateBoundToUtcIso, normalizeUtcIso } from "../utils/timezones.js";

const CHANGE_TYPES = new Set([
  "create",
  "update",
  "delete",
  "archive",
  "restore",
  "login",
  "logout",
  "settings_change",
]);

const RECORD_TYPES = new Set([
  "organization",
  "organization_setting",
  "workspace",
  "workspace_membership",
  "workspace_setting",
  "user",
  "client",
  "project",
  "time_entry",
  "user_role_assignment",
  "api_key",
]);

async function record(event) {
  const organizationId = event.organizationId || event.session?.organization_id || "";
  const action = String(event.action || "").trim();
  const changeType = normalizeEnum(event.changeType, CHANGE_TYPES, "update");
  const recordType = normalizeEnum(event.recordType, RECORD_TYPES, "workspace");

  if (!organizationId || !action) {
    return null;
  }

  const auditSettings = await readAuditSettings(organizationId);
  await cleanupExpired(organizationId, auditSettings.retentionDays);

  if (!event.force && !auditSettings.loggingEnabled) {
    return null;
  }

  const entry = {
    audit_id: event.auditId || randomUUID(),
    organization_id: organizationId,
    created_at: normalizeUtcIso(event.createdAt, event.session?.timezone),
    actor_user_id: event.actorUserId ?? event.session?.user_id ?? null,
    actor_user_name: event.actorUserName ?? event.session?.username ?? null,
    action,
    change_type: changeType,
    record_type: recordType,
    record_id: nullableString(event.recordId),
    record_label: nullableString(event.recordLabel),
    record_url: nullableString(event.recordUrl),
    previous_value_json: stringifyNullableJson(event.previousValue),
    new_value_json: stringifyNullableJson(event.newValue),
    metadata_json: stringifyNullableJson(event.metadata),
  };

  await auditLogsRepository.create(entry);
  return entry;
}

async function list(session, filters = {}) {
  const workspaceId = await resolveAuditWorkspaceId(session, filters.workspaceId || filters.workspace_id);
  const settings = await readAuditSettings(workspaceId);
  await cleanupExpired(workspaceId, settings.retentionDays);
  const normalizedFilters = normalizeFilters({
    ...filters,
    timezone: session.timezone,
  });
  const canFilterWorkspaces = await permissionsService.isSuperAdmin(session);
  const [auditLogs, total, filterOptions, workspaceOptions] = await Promise.all([
    auditLogsRepository.search(workspaceId, normalizedFilters),
    auditLogsRepository.countSearch(workspaceId, normalizedFilters),
    auditLogsRepository.readFilterOptions(workspaceId),
    canFilterWorkspaces ? readAuditWorkspaceOptions() : Promise.resolve([]),
  ]);
  const limit = normalizeLimit(normalizedFilters.limit);
  const offset = normalizeOffset(normalizedFilters.offset);

  return {
    auditLogs,
    filterOptions: {
      ...filterOptions,
      workspaces: workspaceOptions,
    },
    pagination: {
      limit,
      offset,
      total,
    },
    workspaceId,
  };
}

async function exportCsv(session, filters = {}) {
  const result = await list(session, {
    ...filters,
    limit: 1000,
  });
  const headers = [
    "created_at",
    "actor_user_name",
    "action",
    "change_type",
    "record_type",
    "record_id",
    "record_label",
    "record_url",
  ];
  const rows = result.auditLogs.map((log) => headers.map((header) => csvValue(log[header] || "")).join(","));

  return `${headers.join(",")}\n${rows.join("\n")}${rows.length > 0 ? "\n" : ""}`;
}

async function cleanupExpired(organizationId, retentionDays) {
  const days = Number.parseInt(retentionDays, 10) || 30;
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  await auditLogsRepository.removeBefore(organizationId, cutoff);
}

async function resolveAuditWorkspaceId(session, requestedWorkspaceId) {
  const workspaceId = nullableString(requestedWorkspaceId) || session.organization_id;

  if (workspaceId === session.organization_id) {
    return workspaceId;
  }

  if (await permissionsService.isSuperAdmin(session)) {
    return workspaceId;
  }

  throw new AppError("You cannot view audit logs for that workspace.", 403);
}

async function readAuditWorkspaceOptions() {
  return (await userWorkspacesRepository.readAllWorkspaces()).map((workspace) => ({
    label: workspace.workspace_name || workspace.workspace_id,
    value: workspace.workspace_id,
  }));
}

function normalizeFilters(filters) {
  return {
    actorUserId: nullableString(filters.actorUserId),
    changeType: nullableString(filters.changeType),
    dateFrom: normalizeDateBound(filters.dateFrom, filters.timezone, "start"),
    dateTo: normalizeDateBound(filters.dateTo, filters.timezone, "end"),
    limit: filters.limit,
    offset: filters.offset,
    recordType: nullableString(filters.recordType),
    workspaceId: nullableString(filters.workspaceId || filters.workspace_id),
  };
}

function normalizeLimit(value) {
  return Math.max(1, Math.min(1000, Number.parseInt(value, 10) || 500));
}

function normalizeOffset(value) {
  return Math.max(0, Number.parseInt(value, 10) || 0);
}

function normalizeDateBound(value, timezone, edge) {
  const text = nullableString(value);

  if (!text) {
    return "";
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return localDateBoundToUtcIso(text, timezone, edge);
  }

  return normalizeUtcIso(text, timezone);
}

function csvValue(value) {
  const text = String(value ?? "");

  if (/[",\n\r]/.test(text)) {
    return `"${text.replaceAll("\"", "\"\"")}"`;
  }

  return text;
}

async function readAuditSettings(organizationId) {
  const settings = await settingsRepository.readOrganizationSettings(organizationId);

  return settings.audit;
}

function normalizeEnum(value, allowedValues, fallback) {
  const normalized = String(value || "").trim();
  return allowedValues.has(normalized) ? normalized : fallback;
}

function nullableString(value) {
  if (value === null || value === undefined) {
    return null;
  }

  const text = String(value).trim();
  return text || null;
}

function stringifyNullableJson(value) {
  if (value === null || value === undefined) {
    return null;
  }

  return JSON.stringify(value);
}

export const auditService = {
  cleanupExpired,
  exportCsv,
  list,
  record,
};
