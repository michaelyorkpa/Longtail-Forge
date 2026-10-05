import { createRecordId } from "../../core/identifiers.js";
import { db } from "../../core/database.js";

/** @typedef {import("../../types/task-workflow-contracts.js").TaskRelationship} TaskRelationship */
/** @typedef {import("../../types/task-workflow-contracts.js").TaskRelationshipRow} TaskRelationshipRow */
/** @typedef {import("../../types/task-workflow-contracts.js").TaskRelationshipSummary} TaskRelationshipSummary */
/** @typedef {import("../../types/task-workflow-contracts.js").TaskRelationshipWrite} TaskRelationshipWrite */

/** @param {string} workspaceId @param {TaskRelationshipWrite} relationship */
async function create(workspaceId, relationship) {
  const now = new Date().toISOString();
  const relationshipId = relationship.task_relationship_id || createRecordId();

  await db.run(`
INSERT INTO task_relationships (
  task_relationship_id,
  workspace_id,
  parent_task_id,
  child_task_id,
  is_blocking,
  created_by_user_id,
  updated_by_user_id,
  removed_at,
  removed_by_user_id,
  created_at,
  updated_at
)
VALUES (
  :relationshipId,
  :workspaceId,
  :parentTaskId,
  :childTaskId,
  :isBlocking,
  :createdByUserId,
  :updatedByUserId,
  NULL,
  NULL,
  :now,
  :now
);
`, {
    childTaskId: textParam(relationship.child_task_id),
    createdByUserId: nullableTextParam(relationship.created_by_user_id),
    isBlocking: booleanParam(relationship.is_blocking),
    now,
    parentTaskId: textParam(relationship.parent_task_id),
    relationshipId,
    updatedByUserId: nullableTextParam(relationship.updated_by_user_id || relationship.created_by_user_id),
    workspaceId: textParam(workspaceId),
  });

  return readById(workspaceId, relationshipId);
}

/** @param {string} workspaceId @param {TaskRelationshipWrite} relationship */
async function update(workspaceId, relationship) {
  const now = new Date().toISOString();
  const relationshipId = textParam(relationship.task_relationship_id);

  await db.run(`
UPDATE task_relationships
SET is_blocking = :isBlocking,
    updated_by_user_id = :updatedByUserId,
    updated_at = :now
WHERE workspace_id = :workspaceId
  AND task_relationship_id = :relationshipId
  AND removed_at IS NULL;
`, {
    isBlocking: booleanParam(relationship.is_blocking),
    now,
    relationshipId,
    updatedByUserId: nullableTextParam(relationship.updated_by_user_id),
    workspaceId: textParam(workspaceId),
  });

  return readById(workspaceId, relationshipId);
}

/** @param {string} workspaceId @param {string} relationshipId @param {string | null | undefined} removedByUserId */
async function remove(workspaceId, relationshipId, removedByUserId) {
  const now = new Date().toISOString();

  await db.run(`
UPDATE task_relationships
SET removed_at = :now,
    removed_by_user_id = :removedByUserId,
    updated_by_user_id = :removedByUserId,
    updated_at = :now
WHERE workspace_id = :workspaceId
  AND task_relationship_id = :relationshipId
  AND removed_at IS NULL;
`, {
    now,
    relationshipId: textParam(relationshipId),
    removedByUserId: nullableTextParam(removedByUserId),
    workspaceId: textParam(workspaceId),
  });

  return readById(workspaceId, relationshipId);
}

/** @param {string} workspaceId @param {string} relationshipId @returns {Promise<TaskRelationship | null>} */
async function readById(workspaceId, relationshipId) {
  const row = /** @type {TaskRelationshipRow | undefined} */ (await db.get(relationshipSelectSql(`
WHERE task_relationships.workspace_id = :workspaceId
  AND task_relationships.task_relationship_id = :relationshipId
LIMIT 1;
`), {
    relationshipId: textParam(relationshipId),
    workspaceId: textParam(workspaceId),
  }));

  return row ? relationshipRowToAppValue(row) : null;
}

/** @param {string} workspaceId @param {string} parentTaskId @param {string} childTaskId */
async function readActivePair(workspaceId, parentTaskId, childTaskId) {
  const row = /** @type {TaskRelationshipRow | undefined} */ (await db.get(relationshipSelectSql(`
WHERE task_relationships.workspace_id = :workspaceId
  AND task_relationships.parent_task_id = :parentTaskId
  AND task_relationships.child_task_id = :childTaskId
  AND task_relationships.removed_at IS NULL
LIMIT 1;
`), {
    childTaskId: textParam(childTaskId),
    parentTaskId: textParam(parentTaskId),
    workspaceId: textParam(workspaceId),
  }));

  return row ? relationshipRowToAppValue(row) : null;
}

/** @param {string} workspaceId @param {string} taskId */
async function readForTask(workspaceId, taskId) {
  const rows = /** @type {TaskRelationshipRow[]} */ (await db.query(relationshipSelectSql(`
WHERE task_relationships.workspace_id = :workspaceId
  AND task_relationships.removed_at IS NULL
  AND (
    task_relationships.parent_task_id = :taskId
    OR task_relationships.child_task_id = :taskId
  )
ORDER BY task_relationships.created_at;
`), {
    taskId: textParam(taskId),
    workspaceId: textParam(workspaceId),
  }));

  return rows.map(relationshipRowToAppValue);
}

/** @param {string} workspaceId @param {string} parentTaskId */
async function readChildren(workspaceId, parentTaskId) {
  const rows = /** @type {TaskRelationshipRow[]} */ (await db.query(relationshipSelectSql(`
WHERE task_relationships.workspace_id = :workspaceId
  AND task_relationships.parent_task_id = :parentTaskId
  AND task_relationships.removed_at IS NULL
ORDER BY child_tasks.status, child_tasks.due_date, child_tasks.title;
`), {
    parentTaskId: textParam(parentTaskId),
    workspaceId: textParam(workspaceId),
  }));

  return rows.map(relationshipRowToAppValue);
}

/** @param {string} workspaceId @param {string} parentTaskId */
async function readDescendantTaskIds(workspaceId, parentTaskId) {
  const rows = /** @type {Array<{ task_id?: unknown }>} */ (await db.query(`
WITH RECURSIVE task_tree(task_id) AS (
  SELECT task_relationships.child_task_id
  FROM task_relationships
  INNER JOIN tasks AS child_tasks
    ON child_tasks.workspace_id = task_relationships.workspace_id
    AND child_tasks.task_id = task_relationships.child_task_id
  WHERE task_relationships.workspace_id = :workspaceId
    AND task_relationships.parent_task_id = :parentTaskId
    AND task_relationships.removed_at IS NULL
  UNION
  SELECT task_relationships.child_task_id
  FROM task_relationships
  INNER JOIN task_tree
    ON task_tree.task_id = task_relationships.parent_task_id
  INNER JOIN tasks AS child_tasks
    ON child_tasks.workspace_id = task_relationships.workspace_id
    AND child_tasks.task_id = task_relationships.child_task_id
  WHERE task_relationships.workspace_id = :workspaceId
    AND task_relationships.removed_at IS NULL
)
SELECT task_id
FROM task_tree
ORDER BY task_id;
`, {
    parentTaskId: textParam(parentTaskId),
    workspaceId: textParam(workspaceId),
  }));

  return rows.map((row) => String(row.task_id || "").trim()).filter(Boolean);
}

/** @param {string} workspaceId @param {string} childTaskId */
async function readParents(workspaceId, childTaskId) {
  const rows = /** @type {TaskRelationshipRow[]} */ (await db.query(relationshipSelectSql(`
WHERE task_relationships.workspace_id = :workspaceId
  AND task_relationships.child_task_id = :childTaskId
  AND task_relationships.removed_at IS NULL
ORDER BY parent_tasks.status, parent_tasks.due_date, parent_tasks.title;
`), {
    childTaskId: textParam(childTaskId),
    workspaceId: textParam(workspaceId),
  }));

  return rows.map(relationshipRowToAppValue);
}

/** @param {string} workspaceId @param {string[]} childTaskIds */
async function readParentsForTasks(workspaceId, childTaskIds) {
  const uniqueTaskIds = [...new Set((childTaskIds || []).map((taskId) => String(taskId || "").trim()).filter(Boolean))];
  if (uniqueTaskIds.length === 0) {
    return [];
  }

  const rows = /** @type {TaskRelationshipRow[]} */ (await db.query(relationshipSelectSql(`
WHERE task_relationships.workspace_id = :workspaceId
  AND task_relationships.child_task_id IN (:taskIds)
  AND task_relationships.removed_at IS NULL
ORDER BY task_relationships.child_task_id, task_relationships.created_at, task_relationships.task_relationship_id;
`), {
    taskIds: uniqueTaskIds,
    workspaceId: textParam(workspaceId),
  }));

  return rows.map(relationshipRowToAppValue);
}

/** @param {string} workspaceId @param {string} parentTaskId */
async function readBlockingChildren(workspaceId, parentTaskId) {
  const rows = /** @type {TaskRelationshipRow[]} */ (await db.query(relationshipSelectSql(`
WHERE task_relationships.workspace_id = :workspaceId
  AND task_relationships.parent_task_id = :parentTaskId
  AND task_relationships.is_blocking = :blockingValue
  AND task_relationships.removed_at IS NULL
ORDER BY child_tasks.status, child_tasks.due_date, child_tasks.title;
`), {
    blockingValue: db.dialect.boolean.bind(true),
    parentTaskId: textParam(parentTaskId),
    workspaceId: textParam(workspaceId),
  }));

  return rows.map(relationshipRowToAppValue);
}

/** @param {string} workspaceId @param {string} startParentTaskId @param {string} targetChildTaskId */
async function hasPath(workspaceId, startParentTaskId, targetChildTaskId) {
  const row = await db.get(`
WITH RECURSIVE task_tree(task_id) AS (
  SELECT child_task_id
  FROM task_relationships
  WHERE workspace_id = :workspaceId
    AND parent_task_id = :startParentTaskId
    AND removed_at IS NULL
  UNION
  SELECT task_relationships.child_task_id
  FROM task_relationships
  INNER JOIN task_tree
    ON task_tree.task_id = task_relationships.parent_task_id
  WHERE task_relationships.workspace_id = :workspaceId
    AND task_relationships.removed_at IS NULL
)
SELECT task_id
FROM task_tree
WHERE task_id = :targetChildTaskId
LIMIT 1;
`, {
    startParentTaskId: textParam(startParentTaskId),
    targetChildTaskId: textParam(targetChildTaskId),
    workspaceId: textParam(workspaceId),
  });

  return Boolean(row);
}

/** @param {string} workspaceId @param {string} taskId @returns {Promise<TaskRelationshipSummary>} */
async function relationshipSummary(workspaceId, taskId) {
  const row = /** @type {Partial<TaskRelationshipSummary> | undefined} */ (await db.get(`
SELECT
  SUM(CASE WHEN parent_task_id = :taskId THEN 1 ELSE 0 END) AS child_count,
  SUM(CASE WHEN parent_task_id = :taskId AND is_blocking = :blockingValue THEN 1 ELSE 0 END) AS blocking_child_count,
  SUM(CASE WHEN parent_task_id = :taskId AND is_blocking = :blockingValue AND child_tasks.status NOT IN ('complete', 'archived') THEN 1 ELSE 0 END) AS incomplete_blocking_child_count,
  SUM(CASE WHEN child_task_id = :taskId THEN 1 ELSE 0 END) AS parent_count,
  SUM(CASE WHEN child_task_id = :taskId AND is_blocking = :blockingValue THEN 1 ELSE 0 END) AS blocking_parent_count
FROM task_relationships
LEFT JOIN tasks AS child_tasks
  ON child_tasks.workspace_id = task_relationships.workspace_id
  AND child_tasks.task_id = task_relationships.child_task_id
WHERE task_relationships.workspace_id = :workspaceId
  AND task_relationships.removed_at IS NULL
  AND (
    task_relationships.parent_task_id = :taskId
    OR task_relationships.child_task_id = :taskId
  );
`, {
    blockingValue: db.dialect.boolean.bind(true),
    taskId: textParam(taskId),
    workspaceId: textParam(workspaceId),
  })) || {};

  return {
    child_count: Number(row.child_count) || 0,
    blocking_child_count: Number(row.blocking_child_count) || 0,
    incomplete_blocking_child_count: Number(row.incomplete_blocking_child_count) || 0,
    parent_count: Number(row.parent_count) || 0,
    blocking_parent_count: Number(row.blocking_parent_count) || 0,
  };
}

/** @param {string} workspaceId @param {string[]} taskIds @returns {Promise<Map<string, TaskRelationshipSummary>>} */
async function relationshipSummariesForTasks(workspaceId, taskIds) {
  const uniqueTaskIds = [...new Set((taskIds || []).map((taskId) => String(taskId || "").trim()).filter(Boolean))];

  if (uniqueTaskIds.length === 0) {
    return new Map();
  }

  const rows = /** @type {Array<TaskRelationshipSummary & { task_id: string }>} */ (/** @type {unknown} */ (await db.query(`
SELECT
  task_relationships.parent_task_id AS task_id,
  COUNT(*) AS child_count,
  SUM(CASE WHEN task_relationships.is_blocking = :blockingValue THEN 1 ELSE 0 END) AS blocking_child_count,
  SUM(CASE WHEN task_relationships.is_blocking = :blockingValue AND child_tasks.status NOT IN ('complete', 'archived') THEN 1 ELSE 0 END) AS incomplete_blocking_child_count,
  0 AS parent_count,
  0 AS blocking_parent_count
FROM task_relationships
LEFT JOIN tasks AS child_tasks
  ON child_tasks.workspace_id = task_relationships.workspace_id
  AND child_tasks.task_id = task_relationships.child_task_id
WHERE task_relationships.workspace_id = :workspaceId
  AND task_relationships.removed_at IS NULL
  AND task_relationships.parent_task_id IN (:taskIds)
GROUP BY task_relationships.parent_task_id
UNION ALL
SELECT
  task_relationships.child_task_id AS task_id,
  0 AS child_count,
  0 AS blocking_child_count,
  0 AS incomplete_blocking_child_count,
  COUNT(*) AS parent_count,
  SUM(CASE WHEN task_relationships.is_blocking = :blockingValue THEN 1 ELSE 0 END) AS blocking_parent_count
FROM task_relationships
WHERE task_relationships.workspace_id = :workspaceId
  AND task_relationships.removed_at IS NULL
  AND task_relationships.child_task_id IN (:taskIds)
GROUP BY task_relationships.child_task_id;
`, {
    blockingValue: db.dialect.boolean.bind(true),
    taskIds: uniqueTaskIds,
    workspaceId: textParam(workspaceId),
  })));

  return rows.reduce(/** @param {Map<string, TaskRelationshipSummary>} map @param {typeof rows[number]} row */ (map, row) => {
    const summary = map.get(row.task_id) || emptyRelationshipSummary();
    summary.child_count += Number(row.child_count) || 0;
    summary.blocking_child_count += Number(row.blocking_child_count) || 0;
    summary.incomplete_blocking_child_count += Number(row.incomplete_blocking_child_count) || 0;
    summary.parent_count += Number(row.parent_count) || 0;
    summary.blocking_parent_count += Number(row.blocking_parent_count) || 0;
    map.set(row.task_id, summary);
    return map;
  }, new Map());
}

/** @param {string} whereSql */
function relationshipSelectSql(whereSql) {
  return `
SELECT
  task_relationships.task_relationship_id,
  task_relationships.workspace_id,
  task_relationships.parent_task_id,
  parent_tasks.title AS parent_title,
  parent_tasks.status AS parent_status,
  parent_tasks.client_id AS parent_client_id,
  parent_tasks.project_id AS parent_project_id,
  task_relationships.child_task_id,
  child_tasks.title AS child_title,
  child_tasks.status AS child_status,
  child_tasks.client_id AS child_client_id,
  child_tasks.project_id AS child_project_id,
  task_relationships.is_blocking,
  task_relationships.created_by_user_id,
  task_relationships.updated_by_user_id,
  task_relationships.removed_at,
  task_relationships.removed_by_user_id,
  task_relationships.created_at,
  task_relationships.updated_at
FROM task_relationships
LEFT JOIN tasks AS parent_tasks
  ON parent_tasks.workspace_id = task_relationships.workspace_id
  AND parent_tasks.task_id = task_relationships.parent_task_id
LEFT JOIN tasks AS child_tasks
  ON child_tasks.workspace_id = task_relationships.workspace_id
  AND child_tasks.task_id = task_relationships.child_task_id
${whereSql}`;
}

/** @param {TaskRelationshipRow} row @returns {TaskRelationship} */
function relationshipRowToAppValue(row) {
  return {
    task_relationship_id: row.task_relationship_id,
    workspace_id: row.workspace_id,
    parent_task_id: row.parent_task_id,
    parent_title: row.parent_title || "",
    parent_status: row.parent_status || "",
    parent_client_id: row.parent_client_id || "",
    parent_project_id: row.parent_project_id || "",
    child_task_id: row.child_task_id,
    child_title: row.child_title || "",
    child_status: row.child_status || "",
    child_client_id: row.child_client_id || "",
    child_project_id: row.child_project_id || "",
    is_blocking: db.dialect.boolean.read(row.is_blocking) === true,
    created_by_user_id: row.created_by_user_id || "",
    updated_by_user_id: row.updated_by_user_id || "",
    removed_at: row.removed_at || "",
    removed_by_user_id: row.removed_by_user_id || "",
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/** @returns {TaskRelationshipSummary} */
function emptyRelationshipSummary() {
  return {
    child_count: 0,
    blocking_child_count: 0,
    incomplete_blocking_child_count: 0,
    parent_count: 0,
    blocking_parent_count: 0,
  };
}

/** @param {unknown} value */
function textParam(value) {
  return String(value ?? "");
}

/** @param {unknown} value */
function nullableTextParam(value) {
  const text = String(value ?? "").trim();
  return text ? text : null;
}

/** @param {unknown} value */
function booleanParam(value) {
  return db.dialect.boolean.bind(Boolean(value));
}

export const taskRelationshipsRepository = {
  create,
  hasPath,
  readActivePair,
  readBlockingChildren,
  readById,
  readChildren,
  readDescendantTaskIds,
  readForTask,
  readParents,
  readParentsForTasks,
  relationshipSummariesForTasks,
  relationshipSummary,
  remove,
  update,
};
