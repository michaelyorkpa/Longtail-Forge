import { db } from "../../core/database.js";

const ACTIVE_TIMER_COLUMNS = [
  "active_timer_id",
  "workspace_id",
  "user_id",
  "timer_slot",
  "source_module_id",
  "source_type",
  "source_id",
  "source_label",
  "source_url",
  "source_metadata_json",
  "client_id",
  "client_name",
  "project_id",
  "project_name",
  "description",
  "billable",
  "accumulated_elapsed_seconds",
  "last_active_start_time",
  "timer_status",
  "created_at",
  "updated_at",
];

const ACTIVE_TIMER_UPSERT_UPDATE_COLUMNS = [
  "source_module_id",
  "source_type",
  "source_id",
  "source_label",
  "source_url",
  "source_metadata_json",
  "client_id",
  "client_name",
  "project_id",
  "project_name",
  "description",
  "billable",
  "accumulated_elapsed_seconds",
  "last_active_start_time",
  "timer_status",
  "updated_at",
];

const ACTIVE_TIMER_VALUE_EXPRESSIONS = {
  accumulated_elapsed_seconds: ":accumulatedElapsedSeconds",
  active_timer_id: ":activeTimerId",
  billable: ":billable",
  client_id: ":clientId",
  client_name: ":clientName",
  created_at: ":now",
  description: ":description",
  last_active_start_time: ":lastActiveStartTime",
  project_id: ":projectId",
  project_name: ":projectName",
  source_id: ":sourceId",
  source_label: ":sourceLabel",
  source_metadata_json: ":sourceMetadataJson",
  source_module_id: ":sourceModuleId",
  source_type: ":sourceType",
  source_url: ":sourceUrl",
  timer_slot: ":timerSlot",
  timer_status: ":timerStatus",
  updated_at: ":now",
  user_id: ":userId",
  workspace_id: ":workspaceId",
};

async function readAll(workspaceId, userId) {
  return readAllBySource(workspaceId, userId, { sourceType: "manual" });
}

async function readAllWorkTimers(workspaceId, userId) {
  const rows = await db.query(selectSql(`
WHERE workspace_id = :workspaceId
  AND user_id = :userId
ORDER BY updated_at DESC, CAST(timer_slot AS INTEGER), timer_slot;
`), {
    userId: textParam(userId),
    workspaceId: textParam(workspaceId),
  });

  return rows.map(activeTimerRowToAppValue);
}

async function readAllBySource(workspaceId, userId, source) {
  const params = {
    sourceType: textParam(source.sourceType || "manual"),
    userId: textParam(userId),
    workspaceId: textParam(workspaceId),
  };
  const sourceModuleSql = source.sourceModuleId
    ? "source_module_id = :sourceModuleId"
    : "source_module_id IS NULL";

  if (source.sourceModuleId) {
    params.sourceModuleId = textParam(source.sourceModuleId);
  }

  const rows = await db.query(`
${selectSql(`
WHERE workspace_id = :workspaceId
  AND user_id = :userId
  AND source_type = :sourceType
  AND ${sourceModuleSql}
ORDER BY CAST(timer_slot AS INTEGER), timer_slot;
`)}
`, params);

  return rows.map(activeTimerRowToAppValue);
}

async function readBySlot(workspaceId, userId, timerSlot) {
  const row = await db.get(selectSql(`
WHERE workspace_id = :workspaceId
  AND user_id = :userId
  AND timer_slot = :timerSlot
LIMIT 1;
`), {
    timerSlot: textParam(timerSlot),
    userId: textParam(userId),
    workspaceId: textParam(workspaceId),
  });

  return row ? activeTimerRowToAppValue(row) : null;
}

async function readBySource(workspaceId, userId, source) {
  const row = await db.get(selectSql(`
WHERE workspace_id = :workspaceId
  AND user_id = :userId
  AND source_module_id = :sourceModuleId
  AND source_type = :sourceType
  AND source_id = :sourceId
LIMIT 1;
`), {
    sourceId: textParam(source.sourceId),
    sourceModuleId: textParam(source.sourceModuleId),
    sourceType: textParam(source.sourceType),
    userId: textParam(userId),
    workspaceId: textParam(workspaceId),
  });

  return row ? activeTimerRowToAppValue(row) : null;
}

async function convertManualToSource(workspaceId, userId, timerSlot, timer) {
  return db.transaction(async (transaction) => {
    const existingSource = await transaction.get(selectSql(`
WHERE workspace_id = :workspaceId
  AND user_id = :userId
  AND source_module_id = :sourceModuleId
  AND source_type = :sourceType
  AND source_id = :sourceId
LIMIT 1;
`), {
      sourceId: textParam(timer.source_id),
      sourceModuleId: textParam(timer.source_module_id),
      sourceType: textParam(timer.source_type),
      userId: textParam(userId),
      workspaceId: textParam(workspaceId),
    });

    if (existingSource) {
      return { status: "source_exists", timer: activeTimerRowToAppValue(existingSource) };
    }

    const manualTimer = await transaction.get(selectSql(`
WHERE workspace_id = :workspaceId
  AND user_id = :userId
  AND timer_slot = :timerSlot
  AND source_module_id IS NULL
  AND source_type = 'manual'
LIMIT 1;
`), {
      timerSlot: textParam(timerSlot),
      userId: textParam(userId),
      workspaceId: textParam(workspaceId),
    });

    if (!manualTimer) {
      return { status: "not_found", timer: null };
    }

    const now = new Date().toISOString();

    await transaction.run(`
UPDATE active_work_timers
SET timer_slot = :sourceTimerSlot,
    source_module_id = :sourceModuleId,
    source_type = :sourceType,
    source_id = :sourceId,
    source_label = :sourceLabel,
    source_url = :sourceUrl,
    source_metadata_json = :sourceMetadataJson,
    client_id = :clientId,
    client_name = :clientName,
    project_id = :projectId,
    project_name = :projectName,
    description = :description,
    billable = :billable,
    updated_at = :updatedAt
WHERE active_timer_id = :activeTimerId
  AND workspace_id = :workspaceId
  AND user_id = :userId;
`, {
      activeTimerId: textParam(manualTimer.active_timer_id),
      billable: textParam(timer.billable),
      clientId: nullableTextParam(timer.client_id),
      clientName: textParam(timer.client_name),
      description: textParam(timer.description),
      projectId: textParam(timer.project_id),
      projectName: textParam(timer.project_name),
      sourceId: textParam(timer.source_id),
      sourceLabel: textParam(timer.source_label),
      sourceMetadataJson: textParam(normalizeSourceMetadataJson(timer.sourceMetadata)),
      sourceModuleId: textParam(timer.source_module_id),
      sourceTimerSlot: textParam(timer.timer_slot),
      sourceType: textParam(timer.source_type),
      sourceUrl: textParam(timer.source_url),
      updatedAt: now,
      userId: textParam(userId),
      workspaceId: textParam(workspaceId),
    });

    const converted = await transaction.get(selectSql(`
WHERE active_timer_id = :activeTimerId
LIMIT 1;
`), {
      activeTimerId: textParam(manualTimer.active_timer_id),
    });

    return { status: "converted", timer: activeTimerRowToAppValue(converted) };
  });
}

async function upsert(timer) {
  const now = new Date().toISOString();

  if (timer.timer_status === "running") {
    await pauseOtherRunningTimers(timer.workspace_id, timer.user_id, timer.timer_slot, now);
  }

  await db.run(`${db.dialect.conflict.buildInsertOnConflictDoUpdate({
    columns: ACTIVE_TIMER_COLUMNS,
    conflictColumns: ["workspace_id", "user_id", "timer_slot"],
    tableName: "active_work_timers",
    updateColumns: ACTIVE_TIMER_UPSERT_UPDATE_COLUMNS,
    valueExpressions: ACTIVE_TIMER_VALUE_EXPRESSIONS,
  })};`, activeTimerWriteParams(timer, now));

  return readBySlot(timer.workspace_id, timer.user_id, timer.timer_slot);
}

async function pauseOtherRunningTimers(workspaceId, userId, activeTimerSlot, now) {
  await db.run(`
UPDATE active_work_timers
SET accumulated_elapsed_seconds = accumulated_elapsed_seconds +
      CASE
        WHEN last_active_start_time IS NULL THEN 0
        ELSE ${db.dialect.time.elapsedSecondsSince("last_active_start_time", ":updatedAt")}
      END,
    last_active_start_time = NULL,
    timer_status = 'paused',
    updated_at = :updatedAt
WHERE workspace_id = :workspaceId
  AND user_id = :userId
  AND timer_slot != :activeTimerSlot
  AND timer_status = 'running';
`, {
    activeTimerSlot,
    updatedAt: now,
    userId,
    workspaceId,
  });
}

async function pauseRunningForUser(workspaceId, userId) {
  const now = new Date().toISOString();

  await db.run(`
UPDATE active_work_timers
SET accumulated_elapsed_seconds = accumulated_elapsed_seconds +
      CASE
        WHEN last_active_start_time IS NULL THEN 0
        ELSE ${db.dialect.time.elapsedSecondsSince("last_active_start_time", ":updatedAt")}
      END,
    last_active_start_time = NULL,
    timer_status = 'paused',
    updated_at = :updatedAt
WHERE workspace_id = :workspaceId
  AND user_id = :userId
  AND timer_status = 'running';
`, {
    updatedAt: now,
    userId,
    workspaceId,
  });
}

async function remove(workspaceId, userId, timerSlot) {
  await db.run(`
DELETE FROM active_work_timers
WHERE workspace_id = :workspaceId
  AND user_id = :userId
  AND timer_slot = :timerSlot;
`, {
    timerSlot: textParam(timerSlot),
    userId: textParam(userId),
    workspaceId: textParam(workspaceId),
  });
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
    await db.run(`
UPDATE active_work_timers
SET timer_slot = :compactSlot,
    updated_at = :updatedAt
WHERE active_timer_id = :activeTimerId;
`, {
      activeTimerId: textParam(timer.active_timer_id),
      compactSlot: textParam(`__compact:${timer.active_timer_id}`),
      updatedAt: now,
    });
  }

  for (const [index, timer] of timers.entries()) {
    await db.run(`
UPDATE active_work_timers
SET timer_slot = :timerSlot,
    updated_at = :updatedAt
WHERE active_timer_id = :activeTimerId;
`, {
      activeTimerId: textParam(timer.active_timer_id),
      timerSlot: textParam(String(index + 1)),
      updatedAt: now,
    });
  }

  return readAll(workspaceId, userId);
}

async function removeBySource(workspaceId, userId, source) {
  await db.run(`
DELETE FROM active_work_timers
WHERE workspace_id = :workspaceId
  AND user_id = :userId
  AND source_module_id = :sourceModuleId
  AND source_type = :sourceType
  AND source_id = :sourceId;
`, {
    sourceId: textParam(source.sourceId),
    sourceModuleId: textParam(source.sourceModuleId),
    sourceType: textParam(source.sourceType),
    userId: textParam(userId),
    workspaceId: textParam(workspaceId),
  });
}

async function hasSource(workspaceId, source) {
  const row = await db.get(`
SELECT active_timer_id
FROM active_work_timers
WHERE workspace_id = :workspaceId
  AND source_module_id = :sourceModuleId
  AND source_type = :sourceType
  AND source_id = :sourceId
LIMIT 1;
`, {
    sourceId: textParam(source.sourceId),
    sourceModuleId: textParam(source.sourceModuleId),
    sourceType: textParam(source.sourceType),
    workspaceId: textParam(workspaceId),
  });

  return Boolean(row);
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

function activeTimerWriteParams(timer, now) {
  return {
    accumulatedElapsedSeconds: integerParam(timer.accumulated_elapsed_seconds),
    activeTimerId: textParam(timer.active_timer_id),
    billable: textParam(timer.billable),
    clientId: nullableTextParam(timer.client_id),
    clientName: textParam(timer.client_name),
    description: textParam(timer.description),
    lastActiveStartTime: nullableTextParam(timer.last_active_start_time),
    now,
    projectId: textParam(timer.project_id),
    projectName: textParam(timer.project_name),
    sourceId: nullableTextParam(timer.source_id),
    sourceLabel: textParam(timer.source_label || ""),
    sourceMetadataJson: textParam(normalizeSourceMetadataJson(timer.source_metadata_json || timer.sourceMetadata)),
    sourceModuleId: nullableTextParam(timer.source_module_id),
    sourceType: textParam(timer.source_type || "manual"),
    sourceUrl: textParam(timer.source_url || ""),
    timerSlot: textParam(timer.timer_slot),
    timerStatus: textParam(timer.timer_status),
    userId: textParam(timer.user_id),
    workspaceId: textParam(timer.workspace_id),
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

function isNumericTimerSlot(timerSlot) {
  return /^[1-9]\d*$/.test(String(timerSlot || ""));
}

export const activeTimersRepository = {
  compactManualTimerSlots,
  convertManualToSource,
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
