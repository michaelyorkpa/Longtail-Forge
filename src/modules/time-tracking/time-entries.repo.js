// @ts-check
import { db } from "../../core/database.js";
import { normalizeTimeEntry } from "../../utils/normalizers.js";

/** @typedef {import("../../utils/normalizers.js").TimeEntry} TimeEntry */
/** @typedef {{ total: number | string }} CountRow */
/** @typedef {import("../../types/time-tracking-contracts.d.ts").DashboardEffortReadOptions} DashboardEffortReadOptions */
/** @typedef {import("../../types/time-tracking-contracts.d.ts").ProjectScopeUpdate} ProjectScopeUpdate */
/** @typedef {import("../../types/time-tracking-contracts.d.ts").TimeEntryRow} TimeEntryRow */
/** @typedef {import("../../types/time-tracking-contracts.d.ts").TimeEntryWriteParameters} TimeEntryWriteParameters */

/** @param {string} workspaceId */
async function readAll(workspaceId) {
  const rows = /** @type {TimeEntryRow[]} */ (await db.query(`
SELECT
  entry_id,
  workspace_id,
  user_id,
  client_id,
  client_name,
  project_id,
  project_name,
  task_id,
  description,
  start_time,
  end_time,
  duration_seconds,
  duration_hours,
  billable,
  invoice_status,
  created_at,
  updated_at
FROM time_entries
WHERE workspace_id = :workspaceId
ORDER BY end_time;
`, { workspaceId: textParam(workspaceId) }));

  return rows.map(timeEntryRowToAppValue);
}

/** @param {string} workspaceId @param {DashboardEffortReadOptions} [options] */
async function readDashboardEffortSummary(workspaceId, options = {}) {
  const limit = normalizeDashboardRowLimit(options.limit);
  const visibility = options.visibility || {};
  const params = {
    canReadAll: visibility.all ? 1 : 0,
    editAllClientIds: nonEmptyIdList(visibility.editAllClientIds),
    editAllProjectIds: nonEmptyIdList(visibility.editAllProjectIds),
    readableClientIds: nonEmptyIdList(visibility.clientIds),
    readableProjectIds: nonEmptyIdList(visibility.projectIds),
    visibleUserId: textParam(visibility.userId),
    windowEnd: textParam(options.windowEnd),
    windowStart: textParam(options.windowStart),
    workspaceId: textParam(workspaceId),
  };
  const [summary, rawRows] = await Promise.all([
    db.get(`
SELECT
  COUNT(*) AS entries_count,
  COALESCE(SUM(CASE WHEN end_time >= :todayStart THEN duration_seconds ELSE 0 END), 0) AS today_seconds,
  COALESCE(SUM(duration_seconds), 0) AS total_seconds
FROM time_entries
WHERE workspace_id = :workspaceId
  AND end_time >= :windowStart
  AND end_time < :windowEnd
  AND (
    :canReadAll = 1
    OR (
      (
        user_id = :visibleUserId
        OR client_id IN (:editAllClientIds)
        OR project_id IN (:editAllProjectIds)
      )
      AND (
        client_id IN (:readableClientIds)
        OR project_id IN (:readableProjectIds)
      )
    )
  );
`, { ...params, todayStart: textParam(options.todayStart) }),
    db.query(`
SELECT
  entry_id,
  workspace_id,
  user_id,
  client_id,
  client_name,
  project_id,
  project_name,
  task_id,
  description,
  start_time,
  end_time,
  duration_seconds,
  duration_hours,
  billable,
  invoice_status,
  created_at,
  updated_at
FROM time_entries
WHERE workspace_id = :workspaceId
  AND end_time >= :windowStart
  AND end_time < :windowEnd
  AND (
    :canReadAll = 1
    OR (
      (
        user_id = :visibleUserId
        OR client_id IN (:editAllClientIds)
        OR project_id IN (:editAllProjectIds)
      )
      AND (
        client_id IN (:readableClientIds)
        OR project_id IN (:readableProjectIds)
      )
    )
  )
ORDER BY end_time DESC, entry_id DESC
LIMIT :limit;
`, { ...params, limit }),
  ]);
  const rows = /** @type {TimeEntryRow[]} */ (rawRows);

  return {
    entries: rows.map(timeEntryRowToAppValue),
    entriesCount: Number(summary?.entries_count) || 0,
    todaySeconds: Number(summary?.today_seconds) || 0,
    totalSeconds: Number(summary?.total_seconds) || 0,
  };
}

/** @param {string} workspaceId @param {string} entryId */
async function readById(workspaceId, entryId) {
  const row = /** @type {TimeEntryRow | null} */ (await db.get(`
SELECT
  entry_id,
  workspace_id,
  user_id,
  client_id,
  client_name,
  project_id,
  project_name,
  task_id,
  description,
  start_time,
  end_time,
  duration_seconds,
  duration_hours,
  billable,
  invoice_status,
  created_at,
  updated_at
FROM time_entries
WHERE workspace_id = :workspaceId
  AND entry_id = :entryId
LIMIT 1;
`, {
    entryId: textParam(entryId),
    workspaceId: textParam(workspaceId),
  }));

  return row ? timeEntryRowToAppValue(row) : null;
}

/** @param {string} workspaceId @param {string} projectId */
async function readByProjectId(workspaceId, projectId) {
  const rows = /** @type {TimeEntryRow[]} */ (await db.query(`
SELECT
  entry_id,
  workspace_id,
  user_id,
  client_id,
  client_name,
  project_id,
  project_name,
  task_id,
  description,
  start_time,
  end_time,
  duration_seconds,
  duration_hours,
  billable,
  invoice_status,
  created_at,
  updated_at
FROM time_entries
WHERE workspace_id = :workspaceId
  AND project_id = :projectId
ORDER BY end_time;
`, {
    projectId: textParam(projectId),
    workspaceId: textParam(workspaceId),
  }));

  return rows.map(timeEntryRowToAppValue);
}

/** @param {TimeEntry} entry */
async function create(entry) {
  const now = new Date().toISOString();
  await db.run(`
INSERT INTO time_entries (
  entry_id,
  workspace_id,
  user_id,
  client_id,
  client_name,
  project_id,
  project_name,
  task_id,
  description,
  start_time,
  end_time,
  duration_seconds,
  duration_hours,
  billable,
  invoice_status,
  created_at,
  updated_at
)
VALUES (
  :entryId,
  :workspaceId,
  :userId,
  :clientId,
  :clientName,
  :projectId,
  :projectName,
  :taskId,
  :description,
  :startTime,
  :endTime,
  :durationSeconds,
  :durationHours,
  :billable,
  :invoiceStatus,
  :createdAt,
  :updatedAt
);
`, timeEntryWriteParams(entry, now, { includeCreatedAt: true }));
}

/** @param {TimeEntry} entry */
async function update(entry) {
  const now = new Date().toISOString();
  await db.run(`
UPDATE time_entries
SET
  workspace_id = :workspaceId,
  user_id = :userId,
  client_id = :clientId,
  client_name = :clientName,
  project_id = :projectId,
  project_name = :projectName,
  task_id = :taskId,
  description = :description,
  start_time = :startTime,
  end_time = :endTime,
  duration_seconds = :durationSeconds,
  duration_hours = :durationHours,
  billable = :billable,
  invoice_status = :invoiceStatus,
  updated_at = :updatedAt
WHERE workspace_id = :workspaceId
  AND entry_id = :entryId;
`, timeEntryWriteParams(entry, now));
}

/** @param {string} workspaceId @param {string} projectId */
async function countByProjectId(workspaceId, projectId) {
  const row = /** @type {CountRow | null} */ (await db.get(`
SELECT COUNT(*) AS total
FROM time_entries
WHERE workspace_id = :workspaceId
  AND project_id = :projectId;
`, {
    projectId: textParam(projectId),
    workspaceId: textParam(workspaceId),
  }));

  return Number.parseInt(String(row?.total ?? ""), 10) || 0;
}

/** @param {string} workspaceId @param {string} taskId */
async function hasForTask(workspaceId, taskId) {
  const row = await db.get(`
SELECT 1 AS has_entry
FROM time_entries
WHERE workspace_id = :workspaceId
  AND task_id = :taskId
LIMIT 1;
`, {
    taskId: textParam(taskId),
    workspaceId: textParam(workspaceId),
  });

  return Boolean(row?.has_entry);
}

/** @param {string} workspaceId @param {string} projectId @param {ProjectScopeUpdate} scope */
async function updateProjectScope(workspaceId, projectId, scope) {
  const now = new Date().toISOString();

  await db.run(`
UPDATE time_entries
SET
  client_id = :clientId,
  client_name = :clientName,
  project_name = :projectName,
  updated_at = :updatedAt
WHERE workspace_id = :workspaceId
  AND project_id = :projectId;
`, {
    clientId: nullableTextParam(scope.client_id),
    clientName: textParam(scope.client_name),
    projectId: textParam(projectId),
    projectName: textParam(scope.project_name),
    updatedAt: textParam(now),
    workspaceId: textParam(workspaceId),
  });
}

/** @param {string} workspaceId @param {string} entryId */
async function remove(workspaceId, entryId) {
  await db.run(`
DELETE FROM time_entries
WHERE workspace_id = :workspaceId
  AND entry_id = :entryId;
`, {
    entryId: textParam(entryId),
    workspaceId: textParam(workspaceId),
  });
}

/** @param {TimeEntryRow} row */
function timeEntryRowToAppValue(row) {
  return normalizeTimeEntry({
    entry_id: row.entry_id,
    workspace_id: row.workspace_id,
    user_id: row.user_id,
    client_id: row.client_id,
    client_name: row.client_name,
    project_id: row.project_id,
    project_name: row.project_name,
    task_id: row.task_id,
    description: row.description,
    start_time: row.start_time,
    end_time: row.end_time,
    duration_seconds: row.duration_seconds,
    duration_hours: row.duration_hours,
    billable: row.billable,
    invoice_status: row.invoice_status,
    created_at: row.created_at,
    updated_at: row.updated_at,
  });
}

/**
 * @param {TimeEntry} entry
 * @param {string} now
 * @param {{ includeCreatedAt?: boolean }} [options]
 */
function timeEntryWriteParams(entry, now, options = {}) {
  /** @type {TimeEntryWriteParameters} */
  const params = {
    billable: textParam(entry.billable),
    clientId: nullableTextParam(entry.client_id),
    clientName: textParam(entry.client_name),
    description: textParam(entry.description),
    durationHours: textParam(entry.duration_hours),
    durationSeconds: integerParam(entry.duration_seconds),
    endTime: textParam(entry.end_time),
    entryId: textParam(entry.entry_id),
    invoiceStatus: textParam(entry.invoice_status),
    projectId: textParam(entry.project_id),
    projectName: textParam(entry.project_name),
    startTime: textParam(entry.start_time),
    taskId: nullableTextParam(entry.task_id),
    updatedAt: textParam(now),
    userId: textParam(entry.user_id),
    workspaceId: textParam(entry.workspace_id),
  };

  if (options.includeCreatedAt) {
    params.createdAt = textParam(now);
  }

  return params;
}

/** @param {unknown} value */
function textParam(value) {
  return String(value ?? "");
}

/** @param {unknown} value */
function nullableTextParam(value) {
  return value === null || value === undefined || String(value).trim() === ""
    ? null
    : String(value);
}

/** @param {unknown} value */
function integerParam(value) {
  const numberValue = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

/** @param {unknown} value */
function normalizeDashboardRowLimit(value) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 10) : 3;
}

/** @param {unknown} values @returns {string[]} */
function normalizeIdList(values = []) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map((value) => textParam(value).trim())
    .filter(Boolean))];
}

/** @param {unknown} values @returns {string[]} */
function nonEmptyIdList(values = []) {
  const normalized = normalizeIdList(values);
  return normalized.length > 0 ? normalized : [""];
}

export const timeEntriesRepository = {
  countByProjectId,
  create,
  hasForTask,
  remove,
  readAll,
  readDashboardEffortSummary,
  readById,
  readByProjectId,
  update,
  updateProjectScope,
};
