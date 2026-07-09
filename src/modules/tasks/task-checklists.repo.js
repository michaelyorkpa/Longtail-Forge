import { randomUUID } from "node:crypto";
import { db } from "../../core/database.js";

async function readForTask(workspaceId, taskId) {
  const rows = await db.query(`
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
WHERE workspace_id = :workspaceId
  AND task_id = :taskId
  AND deleted_at IS NULL
ORDER BY sort_order, created_at;
`, {
    taskId: textParam(taskId),
    workspaceId: textParam(workspaceId),
  });
  return rows.map(checklistRowToAppValue);
}

async function readProgressForTasks(workspaceId, taskIds) {
  const uniqueTaskIds = [...new Set((taskIds || []).map((taskId) => String(taskId || "").trim()).filter(Boolean))];
  if (uniqueTaskIds.length === 0) return new Map();

  const rows = await db.query(`
SELECT
  task_checklist_items.task_id,
  COUNT(*) AS total_count,
  SUM(CASE WHEN task_checklist_items.is_checked = :checkedValue THEN 1 ELSE 0 END) AS completed_count,
  (
    SELECT next_items.label
    FROM task_checklist_items AS next_items
    WHERE next_items.workspace_id = task_checklist_items.workspace_id
      AND next_items.task_id = task_checklist_items.task_id
      AND next_items.deleted_at IS NULL
      AND next_items.is_checked != :checkedValue
    ORDER BY next_items.sort_order, next_items.created_at
    LIMIT 1
  ) AS next_incomplete_item_label
FROM task_checklist_items
WHERE task_checklist_items.workspace_id = :workspaceId
  AND task_checklist_items.task_id IN (:taskIds)
  AND task_checklist_items.deleted_at IS NULL
GROUP BY task_checklist_items.task_id;
`, {
    checkedValue: db.dialect.boolean.bind(true),
    taskIds: uniqueTaskIds,
    workspaceId: textParam(workspaceId),
  });
  return rows.reduce((progressByTaskId, row) => {
    progressByTaskId.set(row.task_id, {
      completed_count: Number.parseInt(row.completed_count, 10) || 0,
      next_incomplete_item_label: row.next_incomplete_item_label || "",
      total_count: Number.parseInt(row.total_count, 10) || 0,
    });
    return progressByTaskId;
  }, new Map());
}

async function readById(workspaceId, itemId) {
  const row = await db.get(`
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
WHERE workspace_id = :workspaceId
  AND task_checklist_item_id = :itemId
LIMIT 1;
`, {
    itemId: textParam(itemId),
    workspaceId: textParam(workspaceId),
  });
  return row ? checklistRowToAppValue(row) : null;
}

async function create(workspaceId, taskId, item) {
  const now = new Date().toISOString();
  const itemId = item.task_checklist_item_id || randomUUID();
  const sortOrder = Number.isInteger(item.sort_order)
    ? item.sort_order
    : await nextSortOrder(workspaceId, taskId);

  await db.run(`
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
  :itemId,
  :workspaceId,
  :taskId,
  :label,
  :isChecked,
  :completedAt,
  :completedByUserId,
  :sortOrder,
  NULL,
  NULL,
  :createdByUserId,
  :updatedByUserId,
  :now,
  :now
);
`, {
    completedAt: nullableTextParam(item.completed_at),
    completedByUserId: nullableTextParam(item.completed_by_user_id),
    createdByUserId: nullableTextParam(item.created_by_user_id),
    isChecked: booleanParam(item.is_checked),
    itemId: textParam(itemId),
    label: textParam(item.label),
    now,
    sortOrder: integerParam(sortOrder),
    taskId: textParam(taskId),
    updatedByUserId: nullableTextParam(item.updated_by_user_id || item.created_by_user_id),
    workspaceId: textParam(workspaceId),
  });
  return readById(workspaceId, itemId);
}

async function update(workspaceId, item) {
  const now = new Date().toISOString();
  await db.run(`
UPDATE task_checklist_items
SET
  label = :label,
  is_checked = :isChecked,
  completed_at = :completedAt,
  completed_by_user_id = :completedByUserId,
  sort_order = :sortOrder,
  updated_by_user_id = :updatedByUserId,
  updated_at = :now
WHERE workspace_id = :workspaceId
  AND task_checklist_item_id = :itemId
  AND deleted_at IS NULL;
`, {
    completedAt: nullableTextParam(item.completed_at),
    completedByUserId: nullableTextParam(item.completed_by_user_id),
    isChecked: booleanParam(item.is_checked),
    itemId: textParam(item.task_checklist_item_id),
    label: textParam(item.label),
    now,
    sortOrder: integerParam(item.sort_order),
    updatedByUserId: nullableTextParam(item.updated_by_user_id),
    workspaceId: textParam(workspaceId),
  });
  return readById(workspaceId, item.task_checklist_item_id);
}

async function reorder(workspaceId, taskId, itemIds, updatedByUserId) {
  const now = new Date().toISOString();
  await db.transaction(async (transaction) => {
    for (const [index, itemId] of itemIds.entries()) {
      await transaction.run(`
UPDATE task_checklist_items
SET sort_order = :sortOrder,
    updated_by_user_id = :updatedByUserId,
    updated_at = :now
WHERE workspace_id = :workspaceId
  AND task_id = :taskId
  AND task_checklist_item_id = :itemId
  AND deleted_at IS NULL;
`, {
        itemId: textParam(itemId),
        now,
        sortOrder: integerParam((index + 1) * 1000),
        taskId: textParam(taskId),
        updatedByUserId: nullableTextParam(updatedByUserId),
        workspaceId: textParam(workspaceId),
      });
    }
  });
  return readForTask(workspaceId, taskId);
}

async function softDelete(workspaceId, itemId, deletedByUserId) {
  const now = new Date().toISOString();
  await db.run(`
UPDATE task_checklist_items
SET deleted_at = :now,
    deleted_by_user_id = :deletedByUserId,
    updated_by_user_id = :deletedByUserId,
    updated_at = :now
WHERE workspace_id = :workspaceId
  AND task_checklist_item_id = :itemId
  AND deleted_at IS NULL;
`, {
    deletedByUserId: nullableTextParam(deletedByUserId),
    itemId: textParam(itemId),
    now,
    workspaceId: textParam(workspaceId),
  });
  return readById(workspaceId, itemId);
}

async function replaceStructureForTask(workspaceId, taskId, items, updatedByUserId) {
  const now = new Date().toISOString();
  const normalizedItems = normalizeChecklistStructureItems(items);
  const existingItems = await readForTask(workspaceId, taskId);
  const existingByLabel = existingItems.reduce((map, item) => {
    const key = checklistMatchKey(item.label);
    if (!map.has(key)) {
      map.set(key, []);
    }

    map.get(key).push(item);
    return map;
  }, new Map());
  const retainedItemIds = new Set();

  await db.transaction(async (transaction) => {
    for (const [index, item] of normalizedItems.entries()) {
      const matched = existingByLabel.get(checklistMatchKey(item.label))?.shift() || null;
      const sortOrder = integerParam(item.sort_order || ((index + 1) * 1000));

      if (matched) {
        retainedItemIds.add(matched.task_checklist_item_id);
        await transaction.run(`
UPDATE task_checklist_items
SET label = :label,
    sort_order = :sortOrder,
    updated_by_user_id = :updatedByUserId,
    updated_at = :now
WHERE workspace_id = :workspaceId
  AND task_id = :taskId
  AND task_checklist_item_id = :itemId
  AND deleted_at IS NULL;
`, {
          itemId: textParam(matched.task_checklist_item_id),
          label: textParam(item.label),
          now,
          sortOrder,
          taskId: textParam(taskId),
          updatedByUserId: nullableTextParam(updatedByUserId),
          workspaceId: textParam(workspaceId),
        });
        continue;
      }

      await transaction.run(`
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
  :itemId,
  :workspaceId,
  :taskId,
  :label,
  :isChecked,
  NULL,
  NULL,
  :sortOrder,
  NULL,
  NULL,
  :createdByUserId,
  :updatedByUserId,
  :now,
  :now
);
`, {
        createdByUserId: nullableTextParam(updatedByUserId),
        isChecked: booleanParam(false),
        itemId: randomUUID(),
        label: textParam(item.label),
        now,
        sortOrder,
        taskId: textParam(taskId),
        updatedByUserId: nullableTextParam(updatedByUserId),
        workspaceId: textParam(workspaceId),
      });
    }

    for (const existing of existingItems) {
      if (retainedItemIds.has(existing.task_checklist_item_id)) {
        continue;
      }

      await transaction.run(`
UPDATE task_checklist_items
SET deleted_at = :now,
    deleted_by_user_id = :updatedByUserId,
    updated_by_user_id = :updatedByUserId,
    updated_at = :now
WHERE workspace_id = :workspaceId
  AND task_id = :taskId
  AND task_checklist_item_id = :itemId
  AND deleted_at IS NULL;
`, {
        itemId: textParam(existing.task_checklist_item_id),
        now,
        taskId: textParam(taskId),
        updatedByUserId: nullableTextParam(updatedByUserId),
        workspaceId: textParam(workspaceId),
      });
    }
  });

  return readForTask(workspaceId, taskId);
}

async function nextSortOrder(workspaceId, taskId) {
  const row = await db.get(`
SELECT COALESCE(MAX(sort_order), 0) + 1000 AS next_sort_order
FROM task_checklist_items
WHERE workspace_id = :workspaceId
  AND task_id = :taskId
  AND deleted_at IS NULL;
`, {
    taskId: textParam(taskId),
    workspaceId: textParam(workspaceId),
  });
  return Number.parseInt(row?.next_sort_order, 10) || 1000;
}

function checklistRowToAppValue(row) {
  return {
    completed_at: row.completed_at || "",
    completed_by_user_id: row.completed_by_user_id || "",
    created_at: row.created_at || "",
    created_by_user_id: row.created_by_user_id || "",
    deleted_at: row.deleted_at || "",
    deleted_by_user_id: row.deleted_by_user_id || "",
    is_checked: db.dialect.boolean.read(row.is_checked) === true,
    label: row.label || "",
    sort_order: Number.parseInt(row.sort_order, 10) || 0,
    task_checklist_item_id: row.task_checklist_item_id,
    task_id: row.task_id,
    updated_at: row.updated_at || "",
    updated_by_user_id: row.updated_by_user_id || "",
    workspace_id: row.workspace_id,
  };
}

function booleanParam(value) {
  return db.dialect.boolean.bind(Boolean(value));
}

function integerParam(value) {
  const integer = Number.parseInt(value, 10);
  return Number.isFinite(integer) ? integer : 0;
}

function normalizeChecklistStructureItems(items = []) {
  return (Array.isArray(items) ? items : [])
    .map((item, index) => ({
      ...item,
      label: String(item?.label || "").trim(),
      sort_order: integerParam(item?.sort_order || ((index + 1) * 1000)),
    }))
    .filter((item) => item.label);
}

function checklistMatchKey(label) {
  return String(label || "").trim();
}

function nullableTextParam(value) {
  const text = String(value ?? "").trim();
  return text ? text : null;
}

function textParam(value) {
  return String(value ?? "");
}

export const taskChecklistsRepository = {
  create,
  readById,
  readForTask,
  readProgressForTasks,
  reorder,
  replaceStructureForTask,
  softDelete,
  update,
};
