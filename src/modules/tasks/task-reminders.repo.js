import { randomUUID } from "node:crypto";
import { querySql, runSql, sqlInteger, sqlText } from "../../core/database.js";

const TARGET_TYPES = new Set(["workspace", "client", "project", "task"]);
const DUE_KINDS = new Set(["date_only", "date_time"]);

async function readOffsets(workspaceId, targetType, targetId) {
  if (!TARGET_TYPES.has(targetType) || !targetId) {
    return [];
  }

  const rows = await querySql(`
SELECT reminder_offset_id, workspace_id, target_type, target_id, due_kind, offset_minutes, sort_order
FROM task_reminder_offsets
WHERE workspace_id = ${sqlText(workspaceId)}
  AND target_type = ${sqlText(targetType)}
  AND target_id = ${sqlText(targetId)}
ORDER BY due_kind, sort_order, offset_minutes;
`);

  return rows.map(offsetRowToAppValue);
}

async function readOffsetsForTargets(workspaceId, targets) {
  if (!Array.isArray(targets) || targets.length === 0) {
    return new Map();
  }

  const whereSql = targets
    .filter((target) => TARGET_TYPES.has(target.targetType) && target.targetId)
    .map((target) => `(target_type = ${sqlText(target.targetType)} AND target_id = ${sqlText(target.targetId)})`)
    .join(" OR ");

  if (!whereSql) {
    return new Map();
  }

  const rows = await querySql(`
SELECT reminder_offset_id, workspace_id, target_type, target_id, due_kind, offset_minutes, sort_order
FROM task_reminder_offsets
WHERE workspace_id = ${sqlText(workspaceId)}
  AND (${whereSql})
ORDER BY target_type, target_id, due_kind, sort_order, offset_minutes;
`);

  return rows.reduce((map, row) => {
    const key = reminderKey(row.target_type, row.target_id);
    if (!map.has(key)) {
      map.set(key, []);
    }
    map.get(key).push(offsetRowToAppValue(row));
    return map;
  }, new Map());
}

async function replaceOffsets(workspaceId, targetType, targetId, offsets) {
  if (!TARGET_TYPES.has(targetType) || !targetId) {
    return;
  }

  const now = new Date().toISOString();
  const statements = [
    "BEGIN TRANSACTION;",
    `
DELETE FROM task_reminder_offsets
WHERE workspace_id = ${sqlText(workspaceId)}
  AND target_type = ${sqlText(targetType)}
  AND target_id = ${sqlText(targetId)};
`,
  ];

  offsets.forEach((offset, index) => {
    if (!DUE_KINDS.has(offset.due_kind)) {
      return;
    }

    statements.push(`
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
  ${sqlText(randomUUID())},
  ${sqlText(workspaceId)},
  ${sqlText(targetType)},
  ${sqlText(targetId)},
  ${sqlText(offset.due_kind)},
  ${sqlInteger(offset.offset_minutes)},
  ${sqlInteger(index)},
  ${sqlText(now)},
  ${sqlText(now)}
);
`);
  });

  statements.push("COMMIT;");
  await runSql(statements.join("\n"));
}

function reminderKey(targetType, targetId) {
  return `${targetType}:${targetId}`;
}

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

export const taskRemindersRepository = {
  readOffsets,
  readOffsetsForTargets,
  reminderKey,
  replaceOffsets,
};
