import {
  querySql,
  runSql,
  sqlInteger,
  sqlNullableText,
  sqlText,
} from "../../core/database.js";

async function readAll(workspaceId, userId) {
  return readAllBySource(workspaceId, userId, { sourceType: "manual" });
}

async function readAllWorkTimers(workspaceId, userId) {
  const rows = await querySql(selectSql(`
WHERE workspace_id = ${sqlText(workspaceId)}
  AND user_id = ${sqlText(userId)}
ORDER BY updated_at DESC, CAST(timer_slot AS INTEGER), timer_slot;
`));

  return rows.map(activeTimerRowToAppValue);
}

async function readAllBySource(workspaceId, userId, source) {
  const rows = await querySql(`
${selectSql(`
WHERE workspace_id = ${sqlText(workspaceId)}
  AND user_id = ${sqlText(userId)}
  AND source_type = ${sqlText(source.sourceType || "manual")}
  AND ${source.sourceModuleId ? `source_module_id = ${sqlText(source.sourceModuleId)}` : "source_module_id IS NULL"}
ORDER BY CAST(timer_slot AS INTEGER), timer_slot;
`)}
`);

  return rows.map(activeTimerRowToAppValue);
}

async function readBySlot(workspaceId, userId, timerSlot) {
  const rows = await querySql(selectSql(`
WHERE workspace_id = ${sqlText(workspaceId)}
  AND user_id = ${sqlText(userId)}
  AND timer_slot = ${sqlText(timerSlot)}
LIMIT 1;
`));

  return rows[0] ? activeTimerRowToAppValue(rows[0]) : null;
}

async function readBySource(workspaceId, userId, source) {
  const rows = await querySql(selectSql(`
WHERE workspace_id = ${sqlText(workspaceId)}
  AND user_id = ${sqlText(userId)}
  AND source_module_id = ${sqlText(source.sourceModuleId)}
  AND source_type = ${sqlText(source.sourceType)}
  AND source_id = ${sqlText(source.sourceId)}
LIMIT 1;
`));

  return rows[0] ? activeTimerRowToAppValue(rows[0]) : null;
}

async function upsert(timer) {
  const now = new Date().toISOString();

  if (timer.timer_status === "running") {
    await pauseOtherRunningTimers(timer.workspace_id, timer.user_id, timer.timer_slot, now);
  }

  await runSql(`
INSERT INTO active_work_timers (
  active_timer_id,
  workspace_id,
  user_id,
  timer_slot,
  source_module_id,
  source_type,
  source_id,
  source_label,
  source_url,
  source_metadata_json,
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
  ${sqlText(timer.workspace_id)},
  ${sqlText(timer.user_id)},
  ${sqlText(timer.timer_slot)},
  ${sqlNullableText(timer.source_module_id)},
  ${sqlText(timer.source_type || "manual")},
  ${sqlNullableText(timer.source_id)},
  ${sqlText(timer.source_label || "")},
  ${sqlText(timer.source_url || "")},
  ${sqlText(normalizeSourceMetadataJson(timer.source_metadata_json || timer.sourceMetadata))},
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
ON CONFLICT(workspace_id, user_id, timer_slot) DO UPDATE SET
  source_module_id = excluded.source_module_id,
  source_type = excluded.source_type,
  source_id = excluded.source_id,
  source_label = excluded.source_label,
  source_url = excluded.source_url,
  source_metadata_json = excluded.source_metadata_json,
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

  return readBySlot(timer.workspace_id, timer.user_id, timer.timer_slot);
}

async function pauseOtherRunningTimers(workspaceId, userId, activeTimerSlot, now) {
  await runSql(`
UPDATE active_work_timers
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
  AND timer_slot != ${sqlText(activeTimerSlot)}
  AND timer_status = 'running';
`);
}

async function pauseRunningForUser(workspaceId, userId) {
  const now = new Date().toISOString();

  await runSql(`
UPDATE active_work_timers
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

async function remove(workspaceId, userId, timerSlot) {
  await runSql(`
DELETE FROM active_work_timers
WHERE workspace_id = ${sqlText(workspaceId)}
  AND user_id = ${sqlText(userId)}
  AND timer_slot = ${sqlText(timerSlot)};
`);
}

async function compactManualTimerSlots(workspaceId, userId) {
  const timers = (await readAll(workspaceId, userId))
    .filter((timer) => isNumericTimerSlot(timer.timer_slot))
    .sort((firstTimer, secondTimer) =>
      Number.parseInt(firstTimer.timer_slot, 10) - Number.parseInt(secondTimer.timer_slot, 10),
    );
  const needsCompaction = timers.some((timer, index) => timer.timer_slot !== String(index + 1));

  if (!needsCompaction) {
    return timers;
  }

  const now = new Date().toISOString();

  for (const timer of timers) {
    await runSql(`
UPDATE active_work_timers
SET timer_slot = ${sqlText(`__compact:${timer.active_timer_id}`)},
    updated_at = ${sqlText(now)}
WHERE active_timer_id = ${sqlText(timer.active_timer_id)};
`);
  }

  for (const [index, timer] of timers.entries()) {
    await runSql(`
UPDATE active_work_timers
SET timer_slot = ${sqlText(String(index + 1))},
    updated_at = ${sqlText(now)}
WHERE active_timer_id = ${sqlText(timer.active_timer_id)};
`);
  }

  return readAll(workspaceId, userId);
}

async function removeBySource(workspaceId, userId, source) {
  await runSql(`
DELETE FROM active_work_timers
WHERE workspace_id = ${sqlText(workspaceId)}
  AND user_id = ${sqlText(userId)}
  AND source_module_id = ${sqlText(source.sourceModuleId)}
  AND source_type = ${sqlText(source.sourceType)}
  AND source_id = ${sqlText(source.sourceId)};
`);
}

async function hasSource(workspaceId, source) {
  const rows = await querySql(`
SELECT active_timer_id
FROM active_work_timers
WHERE workspace_id = ${sqlText(workspaceId)}
  AND source_module_id = ${sqlText(source.sourceModuleId)}
  AND source_type = ${sqlText(source.sourceType)}
  AND source_id = ${sqlText(source.sourceId)}
LIMIT 1;
`);

  return rows.length > 0;
}

function selectSql(whereSql) {
  return `
SELECT
  active_timer_id,
  workspace_id,
  user_id,
  timer_slot,
  source_module_id,
  source_type,
  source_id,
  source_label,
  source_url,
  source_metadata_json,
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
FROM active_work_timers
${whereSql}`;
}

function activeTimerRowToAppValue(row) {
  return {
    active_timer_id: row.active_timer_id,
    workspace_id: row.workspace_id,
    user_id: row.user_id,
    timer_slot: row.timer_slot,
    source_module_id: row.source_module_id || "",
    source_type: row.source_type || "manual",
    source_id: row.source_id || "",
    source_label: row.source_label || "",
    source_url: row.source_url || "",
    source_metadata_json: row.source_metadata_json || "{}",
    sourceMetadata: parseSourceMetadata(row.source_metadata_json),
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

function normalizeSourceMetadataJson(value) {
  if (!value) {
    return "{}";
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? JSON.stringify(parsed)
        : "{}";
    } catch {
      return "{}";
    }
  }

  if (typeof value === "object" && !Array.isArray(value)) {
    return JSON.stringify(value);
  }

  return "{}";
}

function parseSourceMetadata(value) {
  try {
    const parsed = JSON.parse(String(value || "{}"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function isNumericTimerSlot(timerSlot) {
  return /^[1-9]\d*$/.test(String(timerSlot || ""));
}

export const activeTimersRepository = {
  compactManualTimerSlots,
  hasSource,
  readAll,
  readAllBySource,
  readAllWorkTimers,
  readBySlot,
  readBySource,
  remove,
  removeBySource,
  pauseRunningForUser,
  upsert,
};
