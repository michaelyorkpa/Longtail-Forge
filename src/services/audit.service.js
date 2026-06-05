import { randomUUID } from "node:crypto";
import { auditLogsRepository } from "../repositories/audit-logs.repo.js";
import { userWorkspacesRepository } from "../repositories/user-workspaces.repo.js";
import { settingsRepository } from "../repositories/settings.repo.js";
import { clientsRepository } from "../modules/client-projects/clients.repo.js";
import { projectsRepository } from "../modules/client-projects/projects.repo.js";
import { modulesService } from "../core/modules/modules.service.js";
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
  "workspace",
  "module",
  "workspace_membership",
  "workspace_setting",
  "user",
  "client",
  "project",
  "task",
  "time_entry",
  "module_setting",
  "user_role_assignment",
  "api_key",
]);

async function record(event) {
  const workspaceId = event.workspaceId || event.session?.workspace_id || "";
  const action = String(event.action || "").trim();

  if (!workspaceId || !action) {
    return null;
  }

  const changeType = normalizeChangeType(event.changeType);
  const recordType = normalizeRecordType(event.recordType, { allowUnknown: event.allowUnknownRecordType === true });

  const auditSettings = await readAuditSettings(workspaceId);
  await cleanupExpired(workspaceId, auditSettings.retentionDays);

  if (!event.force && !auditSettings.loggingEnabled) {
    return null;
  }

  const entry = {
    audit_id: event.auditId || randomUUID(),
    workspace_id: workspaceId,
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
    ip_address: nullableString(event.ipAddress || event.session?.ip_address),
  };

  await auditLogsRepository.create(entry);
  return entry;
}

function listAuditRecordTypes() {
  const recordTypes = [
    ...[...RECORD_TYPES].map((recordType) => ({
      recordType,
      moduleId: "framework",
      label: titleize(recordType),
      description: `Framework audit record type ${recordType}.`,
    })),
    ...modulesService.listModuleAuditRecordTypes(),
  ];

  return [...recordTypes.reduce((byRecordType, recordType) => {
    byRecordType.set(recordType.recordType, recordType);
    return byRecordType;
  }, new Map()).values()]
    .sort((left, right) => left.recordType.localeCompare(right.recordType));
}

function listAuditChangeTypes() {
  return [...CHANGE_TYPES].sort();
}

async function list(session, filters = {}) {
  const workspaceScope = await resolveAuditWorkspaceScope(session, filters.workspaceId || filters.workspace_id);
  await Promise.all(workspaceScope.workspaceIds.map(async (workspaceId) => {
    const settings = await readAuditSettings(workspaceId);
    await cleanupExpired(workspaceId, settings.retentionDays);
  }));
  const normalizedFilters = normalizeFilters({
    ...filters,
    timezone: session.timezone,
  });
  const canFilterWorkspaces = await permissionsService.isSuperAdmin(session);
  const [auditLogs, total, filterOptions, workspaceOptions, projectOptions, clientOptions] = await Promise.all([
    auditLogsRepository.searchForScope(workspaceScope, normalizedFilters),
    auditLogsRepository.countSearchForScope(workspaceScope, normalizedFilters),
    auditLogsRepository.readFilterOptionsForScope(workspaceScope),
    canFilterWorkspaces ? readAuditWorkspaceOptions() : Promise.resolve([]),
    readProjectOptionsForScope(workspaceScope),
    readClientOptionsForScope(workspaceScope),
  ]);
  const limit = normalizeLimit(normalizedFilters.limit);
  const offset = normalizeOffset(normalizedFilters.offset);

  return {
    auditLogs,
    filterOptions: {
      ...filterOptions,
      clients: clientOptions,
      projects: projectOptions,
      workspaces: workspaceOptions,
    },
    pagination: {
      limit,
      offset,
      total,
    },
    workspaceId: workspaceScope.selectedWorkspaceId,
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
    "ip_address",
  ];
  const rows = result.auditLogs.map((log) => headers.map((header) => csvValue(log[header] || "")).join(","));

  return `${headers.join(",")}\n${rows.join("\n")}${rows.length > 0 ? "\n" : ""}`;
}

async function cleanupExpired(workspaceId, retentionDays) {
  const days = Number.parseInt(retentionDays, 10) || 30;
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  await auditLogsRepository.removeBefore(workspaceId, cutoff);
}

async function resolveAuditWorkspaceScope(session, requestedWorkspaceId) {
  const workspaceId = nullableString(requestedWorkspaceId) || session.workspace_id;

  if (workspaceId === "all") {
    return {
      selectedWorkspaceId: "all",
      workspaceIds: await readAccessibleAuditWorkspaceIds(session),
    };
  }

  if (workspaceId === session.workspace_id || await permissionsService.isSuperAdmin(session)) {
    return {
      selectedWorkspaceId: workspaceId,
      workspaceIds: [workspaceId],
    };
  }

  throw new AppError("You cannot view audit logs for that workspace.", 403);
}

async function readAuditWorkspaceOptions() {
  return [
    {
      label: "All workspaces",
      value: "all",
    },
    ...(await userWorkspacesRepository.readAllWorkspaces()).map((workspace) => ({
    label: workspace.workspace_name || workspace.workspace_id,
    value: workspace.workspace_id,
    })),
  ];
}

function normalizeFilters(filters) {
  return {
    actorUserId: nullableString(filters.actorUserId),
    changeType: nullableString(filters.changeType),
    dateFrom: normalizeDateBound(filters.dateFrom, filters.timezone, "start"),
    dateTo: normalizeDateBound(filters.dateTo, filters.timezone, "end"),
    limit: filters.limit,
    offset: filters.offset,
    clientId: nullableString(filters.clientId || filters.client_id),
    projectId: nullableString(filters.projectId || filters.project_id),
    recordType: nullableString(filters.recordType),
    workspaceId: nullableString(filters.workspaceId || filters.workspace_id),
  };
}

async function readAccessibleAuditWorkspaceIds(session) {
  if (await permissionsService.isSuperAdmin(session)) {
    return (await userWorkspacesRepository.readAllWorkspaces()).map((workspace) => workspace.workspace_id);
  }

  return (await userWorkspacesRepository.readForUser(session.user_id))
    .filter((membership) => membership.status === "active")
    .map((membership) => membership.workspace_id);
}

async function readClientOptionsForScope(workspaceScope) {
  const options = await Promise.all(workspaceScope.workspaceIds.map(readClientOptions));

  return options.flat();
}

async function readProjectOptionsForScope(workspaceScope) {
  const options = await Promise.all(workspaceScope.workspaceIds.map(readProjectOptions));

  return options.flat();
}

async function readClientOptions(workspaceId) {
  const settings = await settingsRepository.readWorkspaceSettings(workspaceId);

  if (settings.workspaceType !== "business") {
    return [];
  }

  return (await clientsRepository.readAll(workspaceId))
    .filter((client) => !isArchivedOption(client))
    .map((client) => ({
      label: client.name,
      value: client.id,
    }));
}

async function readProjectOptions(workspaceId) {
  return (await projectsRepository.readAll(workspaceId))
    .filter((project) => !isArchivedOption(project))
    .map((project) => ({
      label: project.name,
      value: project.id,
    }));
}

function isArchivedOption(record) {
  return ["inactive", "archived", "completed"].includes(String(record?.status || "").trim().toLowerCase());
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

async function readAuditSettings(workspaceId) {
  const settings = await settingsRepository.readWorkspaceSettings(workspaceId);

  return settings.audit;
}

function normalizeChangeType(value) {
  const normalized = String(value || "").trim();

  if (!CHANGE_TYPES.has(normalized)) {
    throw new AppError(`Unknown audit change type '${normalized || "<empty>"}'.`, 400);
  }

  return normalized;
}

function normalizeRecordType(value, options = {}) {
  const normalized = String(value || "").trim();

  if (!normalized) {
    throw new AppError("Audit record type is required.", 400);
  }

  if (eventRecordTypes().has(normalized)) {
    return normalized;
  }

  if (options.allowUnknown) {
    return normalized;
  }

  throw new AppError(`Unknown audit record type '${normalized}'.`, 400);
}

function eventRecordTypes() {
  return new Set([
    ...RECORD_TYPES,
    ...modulesService.listModuleAuditRecordTypes().map((recordType) => recordType.recordType),
  ]);
}

function titleize(value) {
  return String(value || "")
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
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
  listAuditChangeTypes,
  listAuditRecordTypes,
  list,
  record,
};
