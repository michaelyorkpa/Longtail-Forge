import { randomUUID } from "node:crypto";
import {
  querySql,
  runSql,
  sqlInteger,
  sqlNullableText,
  sqlText,
} from "../../core/database.js";

async function readAllForUser(workspaceId, userId) {
  const rows = await querySql(selectSql(`
WHERE workspace_id = ${sqlText(workspaceId)}
  AND user_id = ${sqlText(userId)}
ORDER BY updated_at DESC;
`));

  return rows.map(rowToAppValue);
}

async function readByTask(workspaceId, userId, taskId) {
  const rows = await querySql(selectSql(`
WHERE workspace_id = ${sqlText(workspaceId)}
  AND user_id = ${sqlText(userId)}
  AND task_id = ${sqlText(taskId)}
LIMIT 1;
`));

  return rows[0] ? rowToAppValue(rows[0]) : null;
}

async function hasActiveForTask(workspaceId, taskId) {
  const rows = await querySql(`
SELECT active_task_timer_id
FROM active_task_timers
WHERE workspace_id = ${sqlText(workspaceId)}
  AND task_id = ${sqlText(taskId)}
LIMIT 1;
`);

  return rows.length > 0;
}

async function upsert(timer) {
  const now = new Date().toISOString();
  const timerId = timer.active_task_timer_id || randomUUID();

  if (timer.timer_status === "running") {
    await pauseOtherRunningTaskTimers(timer.workspace_id, timer.user_id, timer.task_id, now);
  }

  await runSql(`
INSERT INTO active_task_timers (
  active_task_timer_id,
  workspace_id,
  user_id,
  task_id,
  client_id,
  client_name,
  project_id,
  project_name,
  description,
  billable,
  accumulated_elapsed_seconds,
  last_active_start_time,
  timer_status,
  created_at,
  updated_at
)
VALUES (
  ${sqlText(timerId)},
  ${sqlText(timer.workspace_id)},
  ${sqlText(timer.user_id)},
  ${sqlText(timer.task_id)},
  ${sqlNullableText(timer.client_id)},
  ${sqlText(timer.client_name)},
  ${sqlText(timer.project_id)},
  ${sqlText(timer.project_name)},
  ${sqlText(timer.description)},
  ${sqlText(timer.billable)},
  ${sqlInteger(timer.accumulated_elapsed_seconds)},
  ${sqlNullableText(timer.last_active_start_time)},
  ${sqlText(timer.timer_status)},
  ${sqlText(now)},
  ${sqlText(now)}
)
ON CONFLICT(workspace_id, user_id, task_id) DO UPDATE SET
  client_id = excluded.client_id,
  client_name = excluded.client_name,
  project_id = excluded.project_id,
  project_name = excluded.project_name,
  description = excluded.description,
  billable = excluded.billable,
  accumulated_elapsed_seconds = excluded.accumulated_elapsed_seconds,
  last_active_start_time = excluded.last_active_start_time,
  timer_status = excluded.timer_status,
  updated_at = excluded.updated_at;
`);

  return readByTask(timer.workspace_id, timer.user_id, timer.task_id);
}

async function pauseRunningForUser(workspaceId, userId) {
  const now = new Date().toISOString();

  await runSql(`
UPDATE active_task_timers
SET accumulated_elapsed_seconds = accumulated_elapsed_seconds +
      CASE
        WHEN last_active_start_time IS NULL THEN 0
        ELSE MAX(0, CAST((julianday(${sqlText(now)}) - julianday(last_active_start_time)) * 86400 AS INTEGER))
      END,
    last_active_start_time = NULL,
    timer_status = 'paused',
    updated_at = ${sqlText(now)}
WHERE workspace_id = ${sqlText(workspaceId)}
  AND user_id = ${sqlText(userId)}
  AND timer_status = 'running';
`);
}

async function remove(workspaceId, userId, taskId) {
  await runSql(`
DELETE FROM active_task_timers
WHERE workspace_id = ${sqlText(workspaceId)}
  AND user_id = ${sqlText(userId)}
  AND task_id = ${sqlText(taskId)};
`);
}

async function pauseOtherRunningTaskTimers(workspaceId, userId, activeTaskId, now) {
  await runSql(`
UPDATE active_task_timers
SET accumulated_elapsed_seconds = accumulated_elapsed_seconds +
      CASE
        WHEN last_active_start_time IS NULL THEN 0
        ELSE MAX(0, CAST((julianday(${sqlText(now)}) - julianday(last_active_start_time)) * 86400 AS INTEGER))
      END,
    last_active_start_time = NULL,
    timer_status = 'paused',
    updated_at = ${sqlText(now)}
WHERE workspace_id = ${sqlText(workspaceId)}
  AND user_id = ${sqlText(userId)}
  AND task_id != ${sqlText(activeTaskId)}
  AND timer_status = 'running';
`);
}

function selectSql(whereSql) {
  return `
SELECT
  active_task_timer_id,
  workspace_id,
  user_id,
  task_id,
  client_id,
  client_name,
  project_id,
  project_name,
  description,
  billable,
  accumulated_elapsed_seconds,
  last_active_start_time,
  timer_status,
  created_at,
  updated_at
FROM active_task_timers
${whereSql}`;
}

function rowToAppValue(row) {
  return {
    active_task_timer_id: row.active_task_timer_id,
    workspace_id: row.workspace_id,
    user_id: row.user_id,
    task_id: row.task_id,
    client_id: row.client_id || "",
    client_name: row.client_name || "",
    project_id: row.project_id || "",
    project_name: row.project_name || "",
    description: row.description || "",
    billable: row.billable === "no" ? "no" : "yes",
    accumulated_elapsed_seconds: Number(row.accumulated_elapsed_seconds) || 0,
    last_active_start_time: row.last_active_start_time || null,
    timer_status: row.timer_status === "running" ? "running" : "paused",
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export const taskTimersRepository = {
  hasActiveForTask,
  pauseRunningForUser,
  readAllForUser,
  readByTask,
  remove,
  upsert,
};
