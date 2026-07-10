// @ts-check
import { randomUUID } from "node:crypto";
import { modulesService } from "../core/modules/modules.service.js";
import { db } from "../core/database.js";
import { AppError } from "../utils/app-error.js";
import { readResumeStateReadResolver } from "./work-resume-state-read-checks.js";

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;
const TEXT_LIMITS = Object.freeze({
  blocked_reason: 1000,
  context_label_snapshot: 240,
  handoff_note: 1000,
  last_action_label: 160,
  last_action_type: 80,
  module_id: 80,
  next_action: 1000,
  priority_snapshot: 80,
  record_id: 160,
  record_type: 80,
  source_url: 1000,
  status_snapshot: 80,
  title_snapshot: 240,
});
const PRIMARY_HIDDEN_STATUSES = new Set(["archived", "completed", "deleted", "finalized"]);
const EXPLICIT_HISTORY_MODES = new Set(["recent", "history"]);
const SUPPORTED_MODES = new Set(["left_off", "active", "recent", "history"]);
const RESUME_STATE_COLUMNS = [
  "resume_state_id",
  "workspace_id",
  "user_id",
  "module_id",
  "record_type",
  "record_id",
  "client_id",
  "project_id",
  "source_url",
  "title_snapshot",
  "context_label_snapshot",
  "last_action_type",
  "last_action_label",
  "last_worked_at",
  "handoff_note",
  "next_action",
  "blocked_reason",
  "status_snapshot",
  "priority_snapshot",
  "due_at_snapshot",
  "resume_rank_hint",
  "metadata_json",
  "dismissed_at",
  "dismissed_source_updated_at",
  "created_at",
  "updated_at",
];
const RESUME_STATE_UPSERT_UPDATE_COLUMNS = [
  "client_id",
  "project_id",
  "source_url",
  "title_snapshot",
  "context_label_snapshot",
  "last_action_type",
  "last_action_label",
  "last_worked_at",
  "handoff_note",
  "next_action",
  "blocked_reason",
  "status_snapshot",
  "priority_snapshot",
  "due_at_snapshot",
  "resume_rank_hint",
  "metadata_json",
  "dismissed_at",
  "dismissed_source_updated_at",
  "updated_at",
];
const RESUME_STATE_UPSERT_SQL = `${db.dialect.conflict.buildInsertOnConflictDoUpdate({
  columns: RESUME_STATE_COLUMNS,
  conflictColumns: ["workspace_id", "user_id", "module_id", "record_type", "record_id"],
  tableName: "work_resume_state",
  updateColumns: RESUME_STATE_UPSERT_UPDATE_COLUMNS,
})};`;
const CONTEXT_LOOKUPS = Object.freeze({
  clients: Object.freeze({
    idColumn: "id",
    query: `
SELECT id AS id
FROM clients
WHERE workspace_id = :workspaceId
  AND id = :contextId
LIMIT 1;
`,
  }),
  projects: Object.freeze({
    idColumn: "id",
    query: `
SELECT id AS id
FROM projects
WHERE workspace_id = :workspaceId
  AND id = :contextId
LIMIT 1;
`,
  }),
});

async function upsertResumeState(session, payload = {}) {
  assertSession(session);
  const normalized = await normalizeUpsertPayload(session, payload);
  const previous = await readBySource(
    normalized.workspace_id,
    normalized.user_id,
    normalized.module_id,
    normalized.record_type,
    normalized.record_id,
  );
  const now = new Date().toISOString();
  const sourceUpdatedAt = normalized.last_worked_at || normalized.updated_at || now;
  const shouldClearDismissal = previous?.dismissed_at &&
    compareIso(sourceUpdatedAt, previous.dismissed_source_updated_at || previous.last_worked_at || previous.updated_at) > 0;

  await db.run(RESUME_STATE_UPSERT_SQL, resumeStateWriteParams({
    dismissedSourceUpdatedAt: shouldClearDismissal ? null : previous?.dismissed_source_updated_at,
    dismissedAt: shouldClearDismissal ? null : previous?.dismissed_at,
    normalized,
    now,
    resumeStateId: previous?.resume_state_id || normalized.resume_state_id || randomUUID(),
    rowCreatedAt: previous?.created_at || now,
  }));

  return readBySource(
    normalized.workspace_id,
    normalized.user_id,
    normalized.module_id,
    normalized.record_type,
    normalized.record_id,
  );
}

async function dismissResumeState(session, resumeStateId) {
  assertSession(session);
  const normalizedResumeStateId = normalizeText(resumeStateId, 160);

  if (!normalizedResumeStateId) {
    throw new AppError("Resume state ID is required.", 400);
  }

  const row = await readById(session.workspace_id, session.user_id, normalizedResumeStateId);

  if (!row) {
    throw new AppError("Resume state was not found.", 404);
  }

  const now = new Date().toISOString();
  const sourceUpdatedAt = row.last_worked_at || row.updated_at || now;

  await db.run(`
UPDATE work_resume_state
SET dismissed_at = :dismissedAt,
    dismissed_source_updated_at = :dismissedSourceUpdatedAt,
    updated_at = :updatedAt
WHERE workspace_id = :workspaceId
  AND user_id = :userId
  AND resume_state_id = :resumeStateId;
`, {
    dismissedAt: now,
    dismissedSourceUpdatedAt: sourceUpdatedAt,
    resumeStateId: textParam(normalizedResumeStateId),
    updatedAt: now,
    userId: textParam(session.user_id),
    workspaceId: textParam(session.workspace_id),
  });

  return readById(session.workspace_id, session.user_id, normalizedResumeStateId);
}

async function listResumeState(session, query = {}) {
  assertSession(session);
  const normalizedQuery = normalizeListQuery(query);
  const params = {
    limit: integerParam(normalizedQuery.limit * 3),
    userId: textParam(session.user_id),
    workspaceId: textParam(session.workspace_id),
  };
  const whereClauses = [
    "workspace_id = :workspaceId",
    "user_id = :userId",
  ];

  if (normalizedQuery.module_id) {
    params.moduleId = textParam(normalizedQuery.module_id);
    whereClauses.push("module_id = :moduleId");
  }
  if (normalizedQuery.record_type) {
    params.recordType = textParam(normalizedQuery.record_type);
    whereClauses.push("record_type = :recordType");
  }
  if (normalizedQuery.client_id) {
    params.clientId = textParam(normalizedQuery.client_id);
    whereClauses.push("client_id = :clientId");
  }
  if (normalizedQuery.project_id) {
    params.projectId = textParam(normalizedQuery.project_id);
    whereClauses.push("project_id = :projectId");
  }

  const listSql = `
SELECT *
FROM work_resume_state
WHERE ${whereClauses.join("\n  AND ")}
ORDER BY
  CASE WHEN last_action_type IN ('timer.started', 'timer.running', 'timer.resumed') THEN 0 ELSE 1 END,
  due_at_snapshot IS NULL,
  due_at_snapshot ASC,
  resume_rank_hint DESC,
  COALESCE(last_worked_at, updated_at) DESC
LIMIT :limit;
`;
  const rows = await db.query(listSql, params);
  const results = [];

  for (const row of rows) {
    const guarded = await shapeReadableRow(row, normalizedQuery, session);

    if (guarded) {
      results.push(guarded);
    }

    if (results.length >= normalizedQuery.limit) {
      break;
    }
  }

  return {
    items: results,
    mode: normalizedQuery.mode,
  };
}

async function removeResumeStateForRecord(workspaceId, moduleId, recordType, recordId) {
  const normalizedWorkspaceId = normalizeText(workspaceId, 160);
  const normalizedModuleId = normalizeText(moduleId, TEXT_LIMITS.module_id);
  const normalizedRecordType = normalizeText(recordType, TEXT_LIMITS.record_type);
  const normalizedRecordId = normalizeText(recordId, TEXT_LIMITS.record_id);

  if (!normalizedWorkspaceId || !normalizedModuleId || !normalizedRecordType || !normalizedRecordId) {
    throw new AppError("Workspace, module, record type, and record ID are required.", 400);
  }

  await db.run(`
DELETE FROM work_resume_state
WHERE workspace_id = :workspaceId
  AND module_id = :moduleId
  AND record_type = :recordType
  AND record_id = :recordId;
`, {
    moduleId: textParam(normalizedModuleId),
    recordId: textParam(normalizedRecordId),
    recordType: textParam(normalizedRecordType),
    workspaceId: textParam(normalizedWorkspaceId),
  });

  return {
    moduleId: normalizedModuleId,
    recordId: normalizedRecordId,
    recordType: normalizedRecordType,
    removed: true,
    workspaceId: normalizedWorkspaceId,
  };
}

async function normalizeUpsertPayload(session, payload) {
  const workspaceId = normalizeText(payload.workspace_id || payload.workspaceId || session.workspace_id, 160);
  const userId = normalizeText(payload.user_id || payload.userId || session.user_id, 160);
  const moduleId = normalizeRequiredText(payload.module_id || payload.moduleId, "Module ID", TEXT_LIMITS.module_id);
  const recordType = normalizeRequiredText(payload.record_type || payload.recordType, "Record type", TEXT_LIMITS.record_type);
  const recordId = normalizeRequiredText(payload.record_id || payload.recordId, "Record ID", TEXT_LIMITS.record_id);

  if (workspaceId !== session.workspace_id || userId !== session.user_id) {
    throw new AppError("Resume state writes must stay in the current user workspace.", 403);
  }

  if (!modulesService.getModule(moduleId)) {
    throw new AppError("Resume state module is not registered.", 400);
  }

  await assertOptionalContextInWorkspace(workspaceId, "clients", "id", payload.client_id || payload.clientId, "client");
  await assertOptionalContextInWorkspace(workspaceId, "projects", "id", payload.project_id || payload.projectId, "project");

  return {
    blocked_reason: normalizeNullableText(payload.blocked_reason || payload.blockedReason, TEXT_LIMITS.blocked_reason),
    client_id: normalizeNullableText(payload.client_id || payload.clientId, 160),
    context_label_snapshot: normalizeText(payload.context_label_snapshot || payload.contextLabelSnapshot, TEXT_LIMITS.context_label_snapshot),
    due_at_snapshot: normalizeNullableDateText(payload.due_at_snapshot || payload.dueAtSnapshot),
    handoff_note: normalizeNullableText(payload.handoff_note || payload.handoffNote, TEXT_LIMITS.handoff_note),
    last_action_label: normalizeText(payload.last_action_label || payload.lastActionLabel, TEXT_LIMITS.last_action_label),
    last_action_type: normalizeText(payload.last_action_type || payload.lastActionType, TEXT_LIMITS.last_action_type),
    last_worked_at: normalizeNullableDateText(payload.last_worked_at || payload.lastWorkedAt),
    metadata_json: normalizeMetadataJson(payload.metadata_json ?? payload.metadataJson ?? payload.metadata),
    module_id: moduleId,
    next_action: normalizeNullableText(payload.next_action || payload.nextAction, TEXT_LIMITS.next_action),
    priority_snapshot: normalizeNullableText(payload.priority_snapshot || payload.prioritySnapshot, TEXT_LIMITS.priority_snapshot),
    project_id: normalizeNullableText(payload.project_id || payload.projectId, 160),
    record_id: recordId,
    record_type: recordType,
    resume_rank_hint: normalizeRankHint(payload.resume_rank_hint ?? payload.resumeRankHint),
    resume_state_id: normalizeNullableText(payload.resume_state_id || payload.resumeStateId, 160),
    source_url: normalizeNullableText(payload.source_url || payload.sourceUrl, TEXT_LIMITS.source_url),
    status_snapshot: normalizeNullableText(payload.status_snapshot || payload.statusSnapshot, TEXT_LIMITS.status_snapshot),
    title_snapshot: normalizeText(payload.title_snapshot || payload.titleSnapshot || payload.title, TEXT_LIMITS.title_snapshot),
    updated_at: normalizeNullableDateText(payload.updated_at || payload.updatedAt),
    user_id: userId,
    workspace_id: workspaceId,
  };
}

async function shapeReadableRow(row, query, session) {
  const moduleDefinition = modulesService.getModule(row.module_id);

  if (!moduleDefinition) {
    return null;
  }

  const moduleStatus = await modulesService.readModuleStatus(row.workspace_id, row.module_id);
  const explicitHistoryMode = EXPLICIT_HISTORY_MODES.has(query.mode);

  if (moduleStatus !== "enabled" && !(explicitHistoryMode && moduleDefinition.historicalReadAccess !== false)) {
    return null;
  }

  if (!explicitHistoryMode && isDismissed(row)) {
    return null;
  }

  const readCheck = await runReadCheck(row, session);

  if (!readCheck.readable) {
    return null;
  }

  const lifecycleStatus = normalizeText(readCheck.status || row.status_snapshot, TEXT_LIMITS.status_snapshot);

  if (query.mode === "active" && !isActiveResumeRow(row, lifecycleStatus)) {
    return null;
  }

  const hiddenFromPrimary = readCheck.deleted === true ||
    PRIMARY_HIDDEN_STATUSES.has(lifecycleStatus) ||
    readCheck.archived === true ||
    readCheck.completed === true ||
    readCheck.finalized === true;

  if (!explicitHistoryMode && hiddenFromPrimary) {
    return null;
  }

  return {
    blocked_reason: row.blocked_reason || "",
    client_id: row.client_id || "",
    context_label_snapshot: row.context_label_snapshot || "",
    created_at: row.created_at,
    dismissed_at: row.dismissed_at || "",
    due_at_snapshot: row.due_at_snapshot || "",
    handoff_note: row.handoff_note || "",
    last_action_label: row.last_action_label || "",
    last_action_type: row.last_action_type || "",
    last_worked_at: row.last_worked_at || "",
    metadata: parseMetadata(row.metadata_json),
    module_id: row.module_id,
    next_action: row.next_action || "",
    priority_snapshot: row.priority_snapshot || "",
    project_id: row.project_id || "",
    record_id: row.record_id,
    record_type: row.record_type,
    resume_rank_hint: Number.parseInt(row.resume_rank_hint, 10) || 0,
    resume_state_id: row.resume_state_id,
    source_url: readCheck.source_url === false ? "" : row.source_url || "",
    status_snapshot: lifecycleStatus || "",
    title_snapshot: readCheck.title === false ? "" : row.title_snapshot || "",
    updated_at: row.updated_at,
  };
}

async function runReadCheck(row, session) {
  const resolver = readResumeStateReadResolver(row.module_id, row.record_type);

  if (!resolver) {
    return { readable: false };
  }

  const result = await resolver({
    moduleId: row.module_id,
    recordId: row.record_id,
    recordType: row.record_type,
    row,
    session,
    userId: row.user_id,
    workspaceId: row.workspace_id,
  });

  return result && typeof result === "object"
    ? { readable: result.readable === true || result.canRead === true, ...result }
    : { readable: result === true };
}

async function assertOptionalContextInWorkspace(workspaceId, tableName, idColumn, value, label) {
  const normalizedValue = normalizeNullableText(value, 160);

  if (!normalizedValue) {
    return;
  }

  const lookup = resolveContextLookup(tableName, idColumn);
  const row = await db.get(lookup.query, {
    contextId: textParam(normalizedValue),
    workspaceId: textParam(workspaceId),
  });

  if (!row) {
    throw new AppError(`Resume state ${label} context was not found in the current workspace.`, 400);
  }
}

async function readBySource(workspaceId, userId, moduleId, recordType, recordId) {
  return db.get(`
SELECT *
FROM work_resume_state
WHERE workspace_id = :workspaceId
  AND user_id = :userId
  AND module_id = :moduleId
  AND record_type = :recordType
  AND record_id = :recordId
LIMIT 1;
`, {
    moduleId: textParam(moduleId),
    recordId: textParam(recordId),
    recordType: textParam(recordType),
    userId: textParam(userId),
    workspaceId: textParam(workspaceId),
  });
}

async function readById(workspaceId, userId, resumeStateId) {
  return db.get(`
SELECT *
FROM work_resume_state
WHERE workspace_id = :workspaceId
  AND user_id = :userId
  AND resume_state_id = :resumeStateId
LIMIT 1;
`, {
    resumeStateId: textParam(resumeStateId),
    userId: textParam(userId),
    workspaceId: textParam(workspaceId),
  });
}

function resolveContextLookup(tableName, idColumn) {
  const lookup = CONTEXT_LOOKUPS[tableName];

  if (!lookup || lookup.idColumn !== idColumn) {
    throw new AppError("Resume state context lookup is not supported.", 500);
  }

  return lookup;
}

function resumeStateWriteParams({
  dismissedAt,
  dismissedSourceUpdatedAt,
  normalized,
  now,
  resumeStateId,
  rowCreatedAt,
}) {
  return {
    blocked_reason: nullableTextParam(normalized.blocked_reason),
    client_id: nullableTextParam(normalized.client_id),
    context_label_snapshot: textParam(normalized.context_label_snapshot),
    created_at: textParam(rowCreatedAt),
    dismissed_at: nullableTextParam(dismissedAt),
    dismissed_source_updated_at: nullableTextParam(dismissedSourceUpdatedAt),
    due_at_snapshot: nullableTextParam(normalized.due_at_snapshot),
    handoff_note: nullableTextParam(normalized.handoff_note),
    last_action_label: textParam(normalized.last_action_label),
    last_action_type: textParam(normalized.last_action_type),
    last_worked_at: nullableTextParam(normalized.last_worked_at),
    metadata_json: textParam(normalized.metadata_json),
    module_id: textParam(normalized.module_id),
    next_action: nullableTextParam(normalized.next_action),
    priority_snapshot: nullableTextParam(normalized.priority_snapshot),
    project_id: nullableTextParam(normalized.project_id),
    record_id: textParam(normalized.record_id),
    record_type: textParam(normalized.record_type),
    resume_rank_hint: integerParam(normalized.resume_rank_hint),
    resume_state_id: textParam(resumeStateId),
    source_url: nullableTextParam(normalized.source_url),
    status_snapshot: nullableTextParam(normalized.status_snapshot),
    title_snapshot: textParam(normalized.title_snapshot),
    updated_at: textParam(now),
    user_id: textParam(normalized.user_id),
    workspace_id: textParam(normalized.workspace_id),
  };
}

function normalizeListQuery(query = {}) {
  const mode = normalizeText(query.mode || "left_off", 24);
  const normalizedMode = SUPPORTED_MODES.has(mode) ? mode : "left_off";

  return {
    client_id: normalizeNullableText(query.client_id || query.clientId, 160),
    limit: Math.min(Math.max(Number.parseInt(query.limit, 10) || DEFAULT_LIMIT, 1), MAX_LIMIT),
    mode: normalizedMode,
    module_id: normalizeNullableText(query.module_id || query.moduleId, TEXT_LIMITS.module_id),
    project_id: normalizeNullableText(query.project_id || query.projectId, 160),
    record_type: normalizeNullableText(query.record_type || query.recordType, TEXT_LIMITS.record_type),
  };
}

function assertSession(session) {
  if (!session?.workspace_id || !session?.user_id) {
    throw new AppError("A signed-in workspace session is required.", 401);
  }
}

function normalizeRequiredText(value, label, limit) {
  const normalizedValue = normalizeText(value, limit);

  if (!normalizedValue) {
    throw new AppError(`${label} is required.`, 400);
  }

  return normalizedValue;
}

function normalizeNullableText(value, limit) {
  const normalizedValue = normalizeText(value, limit);
  return normalizedValue || null;
}

function normalizeText(value, limit) {
  return String(value ?? "").trim().slice(0, limit);
}

function normalizeNullableDateText(value) {
  const normalizedValue = normalizeNullableText(value, 40);
  return normalizedValue || null;
}

function normalizeRankHint(value) {
  return Math.max(Math.min(Number.parseInt(value, 10) || 0, 1000), -1000);
}

function textParam(value) {
  return String(value ?? "");
}

function nullableTextParam(value) {
  const text = String(value ?? "").trim();
  return text ? text : null;
}

function integerParam(value) {
  const numberValue = Number.parseInt(value, 10);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function normalizeMetadataJson(value) {
  if (value === null || value === undefined || value === "") {
    return "{}";
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return JSON.stringify(parsed && typeof parsed === "object" ? parsed : {});
    } catch {
      return "{}";
    }
  }

  return JSON.stringify(typeof value === "object" ? value : {});
}

function parseMetadata(value) {
  try {
    const parsed = JSON.parse(value || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function isDismissed(row) {
  if (!row.dismissed_at) {
    return false;
  }

  const sourceUpdatedAt = row.last_worked_at || row.updated_at;
  const dismissedSourceUpdatedAt = row.dismissed_source_updated_at || row.dismissed_at;

  return compareIso(sourceUpdatedAt, dismissedSourceUpdatedAt) <= 0;
}

function isActiveResumeRow(row, lifecycleStatus) {
  const normalizedStatus = normalizeText(lifecycleStatus || row.status_snapshot, TEXT_LIMITS.status_snapshot);
  const actionType = normalizeText(row.last_action_type, TEXT_LIMITS.last_action_type);

  return ["active", "running"].includes(normalizedStatus) ||
    ["timer.started", "timer.running", "timer.resumed"].includes(actionType);
}

function compareIso(left, right) {
  const leftValue = String(left || "");
  const rightValue = String(right || "");

  if (!leftValue && !rightValue) {
    return 0;
  }

  if (!leftValue) {
    return -1;
  }

  if (!rightValue) {
    return 1;
  }

  return leftValue.localeCompare(rightValue);
}

export const workResumeStateService = {
  dismissResumeState,
  listResumeState,
  removeResumeStateForRecord,
  upsertResumeState,
};