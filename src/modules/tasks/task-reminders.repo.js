// @ts-check

import { createRecordId } from "../../core/identifiers.js";
import { db } from "../../core/database.js";

/** @typedef {import("../../types/task-workflow-contracts.js").TaskReminderDueKind} TaskReminderDueKind */
/** @typedef {import("../../types/task-workflow-contracts.js").TaskReminderOffset} TaskReminderOffset */
/** @typedef {import("../../types/task-workflow-contracts.js").TaskReminderOffsetWrite} TaskReminderOffsetWrite */
/** @typedef {import("../../types/task-workflow-contracts.js").TaskReminderTarget} TaskReminderTarget */
/** @typedef {import("../../types/task-workflow-contracts.js").TaskReminderTargetInput} TaskReminderTargetInput */
/** @typedef {import("../../types/task-workflow-contracts.js").TaskReminderTargetType} TaskReminderTargetType */

/** @type {ReadonlySet<TaskReminderTargetType>} */
const TARGET_TYPES = new Set(["workspace", "client", "project", "task"]);
/** @type {ReadonlySet<TaskReminderDueKind>} */
const DUE_KINDS = new Set(["date_only", "date_time"]);

/** @param {string} workspaceId @param {string} targetType @param {unknown} targetId */
async function readOffsets(workspaceId, targetType, targetId) {
  if (!TARGET_TYPES.has(/** @type {TaskReminderTargetType} */ (targetType)) || !targetId) {
    return [];
  }

  const rows = /** @type {TaskReminderOffset[]} */ (/** @type {unknown} */ (await db.query(`
SELECT reminder_offset_id, workspace_id, target_type, target_id, due_kind, offset_minutes, sort_order
FROM task_reminder_offsets
WHERE workspace_id = :workspaceId
  AND target_type = :targetType
  AND target_id = :targetId
ORDER BY due_kind, sort_order, offset_minutes;
`, {
    targetId: textParam(targetId),
    targetType: textParam(targetType),
    workspaceId: textParam(workspaceId),
  })));

  return rows.map(offsetRowToAppValue);
}

/** @param {string} workspaceId @param {TaskReminderTargetInput[]} targets @returns {Promise<Map<string, TaskReminderOffset[]>>} */
async function readOffsetsForTargets(workspaceId, targets) {
  if (!Array.isArray(targets) || targets.length === 0) {
    return new Map();
  }

  /** @type {Record<string, string>} */
  const params = {
    workspaceId: textParam(workspaceId),
  };
  const whereSql = targets
    .filter((target) => TARGET_TYPES.has(/** @type {TaskReminderTargetType} */ (target.targetType)) && target.targetId)
    .map((target, index) => {
      const targetTypeKey = `targetType${index}`;
      const targetIdKey = `targetId${index}`;
      params[targetTypeKey] = textParam(target.targetType);
      params[targetIdKey] = textParam(target.targetId);
      return `(target_type = :${targetTypeKey} AND target_id = :${targetIdKey})`;
    })
    .join(" OR ");

  if (!whereSql) {
    return new Map();
  }

  const rows = /** @type {TaskReminderOffset[]} */ (/** @type {unknown} */ (await db.query(`
SELECT reminder_offset_id, workspace_id, target_type, target_id, due_kind, offset_minutes, sort_order
FROM task_reminder_offsets
WHERE workspace_id = :workspaceId
  AND (${whereSql})
  ORDER BY target_type, target_id, due_kind, sort_order, offset_minutes;
`, params)));

  return rows.reduce(/** @param {Map<string, TaskReminderOffset[]>} map @param {TaskReminderOffset} row */ (map, row) => {
    const key = reminderKey(row.target_type, row.target_id);
    if (!map.has(key)) {
      map.set(key, []);
    }
    map.get(key)?.push(offsetRowToAppValue(row));
    return map;
  }, new Map());
}

/** @param {string} workspaceId @param {string} targetType @param {unknown} targetId @param {TaskReminderOffsetWrite[]} offsets */
async function replaceOffsets(workspaceId, targetType, targetId, offsets) {
  if (!TARGET_TYPES.has(/** @type {TaskReminderTargetType} */ (targetType)) || !targetId) {
    return;
  }

  const now = new Date().toISOString();
  await db.transaction(async (transaction) => {
    await transaction.run(`
DELETE FROM task_reminder_offsets
WHERE workspace_id = :workspaceId
  AND target_type = :targetType
  AND target_id = :targetId;
`, {
      targetId: textParam(targetId),
      targetType: textParam(targetType),
      workspaceId: textParam(workspaceId),
    });

    for (const [index, offset] of offsets.entries()) {
      if (!DUE_KINDS.has(/** @type {TaskReminderDueKind} */ (offset.due_kind))) {
        continue;
      }

      await transaction.run(`
INSERT INTO task_reminder_offsets (
  reminder_offset_id,
  workspace_id,
  target_type,
  target_id,
  due_kind,
  offset_minutes,
  sort_order,
  created_at,
  updated_at
)
VALUES (
  :reminderOffsetId,
  :workspaceId,
  :targetType,
  :targetId,
  :dueKind,
  :offsetMinutes,
  :sortOrder,
  :createdAt,
  :updatedAt
);
`, {
        createdAt: now,
        dueKind: textParam(offset.due_kind),
        offsetMinutes: integerParam(offset.offset_minutes),
        reminderOffsetId: createRecordId(),
        sortOrder: integerParam(index),
        targetId: textParam(targetId),
        targetType: textParam(targetType),
        updatedAt: now,
        workspaceId: textParam(workspaceId),
      });
    }
  });
}

/** @param {string} targetType @param {unknown} targetId */
function reminderKey(targetType, targetId) {
  return `${targetType}:${targetId}`;
}

/** @param {TaskReminderOffset} row @returns {TaskReminderOffset} */
function offsetRowToAppValue(row) {
  return {
    reminder_offset_id: row.reminder_offset_id,
    workspace_id: row.workspace_id,
    target_type: row.target_type,
    target_id: row.target_id,
    due_kind: row.due_kind,
    offset_minutes: Number(row.offset_minutes) || 0,
    sort_order: Number(row.sort_order) || 0,
  };
}

/** @param {unknown} value */
function textParam(value) {
  return String(value ?? "");
}

/** @param {unknown} value */
function integerParam(value) {
  const numberValue = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

export const taskRemindersRepository = {
  readOffsets,
  readOffsetsForTargets,
  reminderKey,
  replaceOffsets,
};
