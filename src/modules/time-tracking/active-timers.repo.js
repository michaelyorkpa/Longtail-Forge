import {
  querySql,
  runSql,
  sqlInteger,
  sqlNullableText,
  sqlText,
} from "../../core/database.js";

async function readAll(organizationId, userId) {
  const rows = await querySql(`
SELECT
  active_timer_id,
  organization_id,
  user_id,
  timer_slot,
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
FROM active_timers
WHERE organization_id = ${sqlText(organizationId)}
  AND user_id = ${sqlText(userId)}
ORDER BY CAST(timer_slot AS INTEGER), timer_slot;
`);

  return rows.map(activeTimerRowToAppValue);
}

async function readBySlot(organizationId, userId, timerSlot) {
  const rows = await querySql(`
SELECT
  active_timer_id,
  organization_id,
  user_id,
  timer_slot,
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
FROM active_timers
WHERE organization_id = ${sqlText(organizationId)}
  AND user_id = ${sqlText(userId)}
  AND timer_slot = ${sqlText(timerSlot)}
LIMIT 1;
`);

  return rows[0] ? activeTimerRowToAppValue(rows[0]) : null;
}

async function upsert(timer) {
  const now = new Date().toISOString();

  if (timer.timer_status === "running") {
    await pauseOtherRunningTimers(timer.organization_id, timer.user_id, timer.timer_slot, now);
  }

  await runSql(`
INSERT INTO active_timers (
  active_timer_id,
  organization_id,
  user_id,
  timer_slot,
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
  ${sqlText(timer.active_timer_id)},
  ${sqlText(timer.organization_id)},
  ${sqlText(timer.user_id)},
  ${sqlText(timer.timer_slot)},
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
ON CONFLICT(organization_id, user_id, timer_slot) DO UPDATE SET
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

  return readBySlot(timer.organization_id, timer.user_id, timer.timer_slot);
}

async function pauseOtherRunningTimers(organizationId, userId, activeTimerSlot, now) {
  await runSql(`
UPDATE active_timers
SET accumulated_elapsed_seconds = accumulated_elapsed_seconds +
      CASE
        WHEN last_active_start_time IS NULL THEN 0
        ELSE MAX(0, CAST((julianday(${sqlText(now)}) - julianday(last_active_start_time)) * 86400 AS INTEGER))
      END,
    last_active_start_time = NULL,
    timer_status = 'paused',
    updated_at = ${sqlText(now)}
WHERE organization_id = ${sqlText(organizationId)}
  AND user_id = ${sqlText(userId)}
  AND timer_slot != ${sqlText(activeTimerSlot)}
  AND timer_status = 'running';
`);
}

async function remove(organizationId, userId, timerSlot) {
  await runSql(`
DELETE FROM active_timers
WHERE organization_id = ${sqlText(organizationId)}
  AND user_id = ${sqlText(userId)}
  AND timer_slot = ${sqlText(timerSlot)};
`);
}

function activeTimerRowToAppValue(row) {
  return {
    active_timer_id: row.active_timer_id,
    organization_id: row.organization_id,
    user_id: row.user_id,
    timer_slot: row.timer_slot,
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

export const activeTimersRepository = {
  readAll,
  readBySlot,
  remove,
  upsert,
};
