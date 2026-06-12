import { randomUUID } from "node:crypto";
import {
  querySql,
  runSql,
  sqlInteger,
  sqlNullableText,
  sqlText,
} from "../../core/database.js";

async function readForTask(workspaceId, taskId) {
  const rows = await querySql(`
SELECT
  task_checklist_item_id,
  workspace_id,
  task_id,
  label,
  is_checked,
  completed_at,
  completed_by_user_id,
  sort_order,
  deleted_at,
  deleted_by_user_id,
  created_by_user_id,
  updated_by_user_id,
  created_at,
  updated_at
FROM task_checklist_items
WHERE workspace_id = ${sqlText(workspaceId)}
  AND task_id = ${sqlText(taskId)}
  AND deleted_at IS NULL
ORDER BY sort_order, created_at;
`);

  return rows.map(checklistRowToAppValue);
}

async function readById(workspaceId, itemId) {
  const rows = await querySql(`
SELECT
  task_checklist_item_id,
  workspace_id,
  task_id,
  label,
  is_checked,
  completed_at,
  completed_by_user_id,
  sort_order,
  deleted_at,
  deleted_by_user_id,
  created_by_user_id,
  updated_by_user_id,
  created_at,
  updated_at
FROM task_checklist_items
WHERE workspace_id = ${sqlText(workspaceId)}
  AND task_checklist_item_id = ${sqlText(itemId)}
LIMIT 1;
`);

  return rows[0] ? checklistRowToAppValue(rows[0]) : null;
}

async function create(workspaceId, taskId, item) {
  const now = new Date().toISOString();
  const itemId = item.task_checklist_item_id || randomUUID();
  const sortOrder = Number.isInteger(item.sort_order)
    ? item.sort_order
    : await nextSortOrder(workspaceId, taskId);

  await runSql(`
INSERT INTO task_checklist_items (
  task_checklist_item_id,
  workspace_id,
  task_id,
  label,
  is_checked,
  completed_at,
  completed_by_user_id,
  sort_order,
  deleted_at,
  deleted_by_user_id,
  created_by_user_id,
  updated_by_user_id,
  created_at,
  updated_at
)
VALUES (
  ${sqlText(itemId)},
  ${sqlText(workspaceId)},
  ${sqlText(taskId)},
  ${sqlText(item.label)},
  ${sqlInteger(item.is_checked ? 1 : 0)},
  ${sqlNullableText(item.completed_at)},
  ${sqlNullableText(item.completed_by_user_id)},
  ${sqlInteger(sortOrder)},
  NULL,
  NULL,
  ${sqlNullableText(item.created_by_user_id)},
  ${sqlNullableText(item.updated_by_user_id || item.created_by_user_id)},
  ${sqlText(now)},
  ${sqlText(now)}
);
`);

  return readById(workspaceId, itemId);
}

async function update(workspaceId, item) {
  const now = new Date().toISOString();

  await runSql(`
UPDATE task_checklist_items
SET
  label = ${sqlText(item.label)},
  is_checked = ${sqlInteger(item.is_checked ? 1 : 0)},
  completed_at = ${sqlNullableText(item.completed_at)},
  completed_by_user_id = ${sqlNullableText(item.completed_by_user_id)},
  sort_order = ${sqlInteger(item.sort_order)},
  updated_by_user_id = ${sqlNullableText(item.updated_by_user_id)},
  updated_at = ${sqlText(now)}
WHERE workspace_id = ${sqlText(workspaceId)}
  AND task_checklist_item_id = ${sqlText(item.task_checklist_item_id)}
  AND deleted_at IS NULL;
`);

  return readById(workspaceId, item.task_checklist_item_id);
}

async function reorder(workspaceId, taskId, itemIds, updatedByUserId) {
  const now = new Date().toISOString();
  const statements = itemIds.map((itemId, index) => `
UPDATE task_checklist_items
SET sort_order = ${sqlInteger((index + 1) * 1000)},
    updated_by_user_id = ${sqlNullableText(updatedByUserId)},
    updated_at = ${sqlText(now)}
WHERE workspace_id = ${sqlText(workspaceId)}
  AND task_id = ${sqlText(taskId)}
  AND task_checklist_item_id = ${sqlText(itemId)}
  AND deleted_at IS NULL;
`).join("\n");

  await runSql(`
BEGIN TRANSACTION;
${statements}
COMMIT;
`);

  return readForTask(workspaceId, taskId);
}

async function softDelete(workspaceId, itemId, deletedByUserId) {
  const now = new Date().toISOString();

  await runSql(`
UPDATE task_checklist_items
SET deleted_at = ${sqlText(now)},
    deleted_by_user_id = ${sqlNullableText(deletedByUserId)},
    updated_by_user_id = ${sqlNullableText(deletedByUserId)},
    updated_at = ${sqlText(now)}
WHERE workspace_id = ${sqlText(workspaceId)}
  AND task_checklist_item_id = ${sqlText(itemId)}
  AND deleted_at IS NULL;
`);

  return readById(workspaceId, itemId);
}

async function nextSortOrder(workspaceId, taskId) {
  const rows = await querySql(`
SELECT COALESCE(MAX(sort_order), 0) + 1000 AS next_sort_order
FROM task_checklist_items
WHERE workspace_id = ${sqlText(workspaceId)}
  AND task_id = ${sqlText(taskId)}
  AND deleted_at IS NULL;
`);

  return Number.parseInt(rows[0]?.next_sort_order, 10) || 1000;
}

function checklistRowToAppValue(row) {
  return {
    task_checklist_item_id: row.task_checklist_item_id,
    workspace_id: row.workspace_id,
    task_id: row.task_id,
    label: row.label || "",
    is_checked: Number(row.is_checked) === 1,
    completed_at: row.completed_at || "",
    completed_by_user_id: row.completed_by_user_id || "",
    sort_order: Number.parseInt(row.sort_order, 10) || 0,
    deleted_at: row.deleted_at || "",
    deleted_by_user_id: row.deleted_by_user_id || "",
    created_by_user_id: row.created_by_user_id || "",
    updated_by_user_id: row.updated_by_user_id || "",
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export const taskChecklistsRepository = {
  create,
  readById,
  readForTask,
  reorder,
  softDelete,
  update,
};
