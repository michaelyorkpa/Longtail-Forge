import { querySql, runSql, sqlInteger, sqlNullableText, sqlText } from "../../core/database.js";
import { normalizeTimeEntry } from "../../utils/normalizers.js";

async function readAll(workspaceId) {
  const rows = await querySql(`
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
WHERE workspace_id = ${sqlText(workspaceId)}
ORDER BY end_time;
`);

  return rows.map(timeEntryRowToAppValue);
}

async function readById(workspaceId, entryId) {
  const rows = await querySql(`
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
WHERE workspace_id = ${sqlText(workspaceId)}
  AND entry_id = ${sqlText(entryId)}
LIMIT 1;
`);

  return rows[0] ? timeEntryRowToAppValue(rows[0]) : null;
}

async function readByProjectId(workspaceId, projectId) {
  const rows = await querySql(`
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
WHERE workspace_id = ${sqlText(workspaceId)}
  AND project_id = ${sqlText(projectId)}
ORDER BY end_time;
`);

  return rows.map(timeEntryRowToAppValue);
}

async function create(entry) {
  const now = new Date().toISOString();
  await runSql(createTimeEntryInsertSql(entry, now));
}

async function update(entry) {
  const now = new Date().toISOString();
  await runSql(`
UPDATE time_entries
SET
  workspace_id = ${sqlText(entry.workspace_id)},
  user_id = ${sqlText(entry.user_id)},
  client_id = ${sqlNullableText(entry.client_id)},
  client_name = ${sqlText(entry.client_name)},
  project_id = ${sqlText(entry.project_id)},
  project_name = ${sqlText(entry.project_name)},
  task_id = ${sqlNullableText(entry.task_id)},
  description = ${sqlText(entry.description)},
  start_time = ${sqlText(entry.start_time)},
  end_time = ${sqlText(entry.end_time)},
  duration_seconds = ${sqlInteger(entry.duration_seconds)},
  duration_hours = ${sqlText(entry.duration_hours)},
  billable = ${sqlText(entry.billable)},
  invoice_status = ${sqlText(entry.invoice_status)},
  updated_at = ${sqlText(now)}
WHERE workspace_id = ${sqlText(entry.workspace_id)}
  AND entry_id = ${sqlText(entry.entry_id)};
`);
}

async function countByProjectId(workspaceId, projectId) {
  const rows = await querySql(`
SELECT COUNT(*) AS total
FROM time_entries
WHERE workspace_id = ${sqlText(workspaceId)}
  AND project_id = ${sqlText(projectId)};
`);

  return Number.parseInt(rows[0]?.total, 10) || 0;
}

async function updateProjectScope(workspaceId, projectId, scope) {
  const now = new Date().toISOString();

  await runSql(`
UPDATE time_entries
SET
  client_id = ${sqlNullableText(scope.client_id)},
  client_name = ${sqlText(scope.client_name)},
  project_name = ${sqlText(scope.project_name)},
  updated_at = ${sqlText(now)}
WHERE workspace_id = ${sqlText(workspaceId)}
  AND project_id = ${sqlText(projectId)};
`);
}

async function remove(workspaceId, entryId) {
  await runSql(`
DELETE FROM time_entries
WHERE workspace_id = ${sqlText(workspaceId)}
  AND entry_id = ${sqlText(entryId)};
`);
}

function createTimeEntryInsertSql(entry, now) {
  return `
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
  ${sqlText(entry.entry_id)},
  ${sqlText(entry.workspace_id)},
  ${sqlText(entry.user_id)},
  ${sqlNullableText(entry.client_id)},
  ${sqlText(entry.client_name)},
  ${sqlText(entry.project_id)},
  ${sqlText(entry.project_name)},
  ${sqlNullableText(entry.task_id)},
  ${sqlText(entry.description)},
  ${sqlText(entry.start_time)},
  ${sqlText(entry.end_time)},
  ${sqlInteger(entry.duration_seconds)},
  ${sqlText(entry.duration_hours)},
  ${sqlText(entry.billable)},
  ${sqlText(entry.invoice_status)},
  ${sqlText(now)},
  ${sqlText(now)}
);`;
}

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

export const timeEntriesRepository = {
  countByProjectId,
  create,
  remove,
  readAll,
  readById,
  readByProjectId,
  update,
  updateProjectScope,
};
