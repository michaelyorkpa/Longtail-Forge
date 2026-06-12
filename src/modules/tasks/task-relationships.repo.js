import { randomUUID } from "node:crypto";
import {
  querySql,
  runSql,
  sqlInteger,
  sqlNullableText,
  sqlText,
} from "../../core/database.js";

async function create(workspaceId, relationship) {
  const now = new Date().toISOString();
  const relationshipId = relationship.task_relationship_id || randomUUID();

  await runSql(`
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
  ${sqlText(relationshipId)},
  ${sqlText(workspaceId)},
  ${sqlText(relationship.parent_task_id)},
  ${sqlText(relationship.child_task_id)},
  ${sqlInteger(relationship.is_blocking ? 1 : 0)},
  ${sqlNullableText(relationship.created_by_user_id)},
  ${sqlNullableText(relationship.updated_by_user_id || relationship.created_by_user_id)},
  NULL,
  NULL,
  ${sqlText(now)},
  ${sqlText(now)}
);
`);

  return readById(workspaceId, relationshipId);
}

async function update(workspaceId, relationship) {
  const now = new Date().toISOString();

  await runSql(`
UPDATE task_relationships
SET is_blocking = ${sqlInteger(relationship.is_blocking ? 1 : 0)},
    updated_by_user_id = ${sqlNullableText(relationship.updated_by_user_id)},
    updated_at = ${sqlText(now)}
WHERE workspace_id = ${sqlText(workspaceId)}
  AND task_relationship_id = ${sqlText(relationship.task_relationship_id)}
  AND removed_at IS NULL;
`);

  return readById(workspaceId, relationship.task_relationship_id);
}

async function remove(workspaceId, relationshipId, removedByUserId) {
  const now = new Date().toISOString();

  await runSql(`
UPDATE task_relationships
SET removed_at = ${sqlText(now)},
    removed_by_user_id = ${sqlNullableText(removedByUserId)},
    updated_by_user_id = ${sqlNullableText(removedByUserId)},
    updated_at = ${sqlText(now)}
WHERE workspace_id = ${sqlText(workspaceId)}
  AND task_relationship_id = ${sqlText(relationshipId)}
  AND removed_at IS NULL;
`);

  return readById(workspaceId, relationshipId);
}

async function readById(workspaceId, relationshipId) {
  const rows = await querySql(relationshipSelectSql(`
WHERE task_relationships.workspace_id = ${sqlText(workspaceId)}
  AND task_relationships.task_relationship_id = ${sqlText(relationshipId)}
LIMIT 1;
`));

  return rows[0] ? relationshipRowToAppValue(rows[0]) : null;
}

async function readActivePair(workspaceId, parentTaskId, childTaskId) {
  const rows = await querySql(relationshipSelectSql(`
WHERE task_relationships.workspace_id = ${sqlText(workspaceId)}
  AND task_relationships.parent_task_id = ${sqlText(parentTaskId)}
  AND task_relationships.child_task_id = ${sqlText(childTaskId)}
  AND task_relationships.removed_at IS NULL
LIMIT 1;
`));

  return rows[0] ? relationshipRowToAppValue(rows[0]) : null;
}

async function readForTask(workspaceId, taskId) {
  const rows = await querySql(relationshipSelectSql(`
WHERE task_relationships.workspace_id = ${sqlText(workspaceId)}
  AND task_relationships.removed_at IS NULL
  AND (
    task_relationships.parent_task_id = ${sqlText(taskId)}
    OR task_relationships.child_task_id = ${sqlText(taskId)}
  )
ORDER BY task_relationships.created_at;
`));

  return rows.map(relationshipRowToAppValue);
}

async function readChildren(workspaceId, parentTaskId) {
  const rows = await querySql(relationshipSelectSql(`
WHERE task_relationships.workspace_id = ${sqlText(workspaceId)}
  AND task_relationships.parent_task_id = ${sqlText(parentTaskId)}
  AND task_relationships.removed_at IS NULL
ORDER BY child_tasks.status, child_tasks.due_date, child_tasks.title;
`));

  return rows.map(relationshipRowToAppValue);
}

async function readParents(workspaceId, childTaskId) {
  const rows = await querySql(relationshipSelectSql(`
WHERE task_relationships.workspace_id = ${sqlText(workspaceId)}
  AND task_relationships.child_task_id = ${sqlText(childTaskId)}
  AND task_relationships.removed_at IS NULL
ORDER BY parent_tasks.status, parent_tasks.due_date, parent_tasks.title;
`));

  return rows.map(relationshipRowToAppValue);
}

async function readBlockingChildren(workspaceId, parentTaskId) {
  const rows = await querySql(relationshipSelectSql(`
WHERE task_relationships.workspace_id = ${sqlText(workspaceId)}
  AND task_relationships.parent_task_id = ${sqlText(parentTaskId)}
  AND task_relationships.is_blocking = 1
  AND task_relationships.removed_at IS NULL
ORDER BY child_tasks.status, child_tasks.due_date, child_tasks.title;
`));

  return rows.map(relationshipRowToAppValue);
}

async function hasPath(workspaceId, startParentTaskId, targetChildTaskId) {
  const rows = await querySql(`
WITH RECURSIVE task_tree(task_id) AS (
  SELECT child_task_id
  FROM task_relationships
  WHERE workspace_id = ${sqlText(workspaceId)}
    AND parent_task_id = ${sqlText(startParentTaskId)}
    AND removed_at IS NULL
  UNION
  SELECT task_relationships.child_task_id
  FROM task_relationships
  INNER JOIN task_tree
    ON task_tree.task_id = task_relationships.parent_task_id
  WHERE task_relationships.workspace_id = ${sqlText(workspaceId)}
    AND task_relationships.removed_at IS NULL
)
SELECT task_id
FROM task_tree
WHERE task_id = ${sqlText(targetChildTaskId)}
LIMIT 1;
`);

  return rows.length > 0;
}

async function relationshipSummary(workspaceId, taskId) {
  const rows = await querySql(`
SELECT
  SUM(CASE WHEN parent_task_id = ${sqlText(taskId)} THEN 1 ELSE 0 END) AS child_count,
  SUM(CASE WHEN parent_task_id = ${sqlText(taskId)} AND is_blocking = 1 THEN 1 ELSE 0 END) AS blocking_child_count,
  SUM(CASE WHEN parent_task_id = ${sqlText(taskId)} AND is_blocking = 1 AND child_tasks.status NOT IN ('complete', 'archived') THEN 1 ELSE 0 END) AS incomplete_blocking_child_count,
  SUM(CASE WHEN child_task_id = ${sqlText(taskId)} THEN 1 ELSE 0 END) AS parent_count,
  SUM(CASE WHEN child_task_id = ${sqlText(taskId)} AND is_blocking = 1 THEN 1 ELSE 0 END) AS blocking_parent_count
FROM task_relationships
LEFT JOIN tasks AS child_tasks
  ON child_tasks.workspace_id = task_relationships.workspace_id
  AND child_tasks.task_id = task_relationships.child_task_id
WHERE task_relationships.workspace_id = ${sqlText(workspaceId)}
  AND task_relationships.removed_at IS NULL
  AND (
    task_relationships.parent_task_id = ${sqlText(taskId)}
    OR task_relationships.child_task_id = ${sqlText(taskId)}
  );
`);
  const row = rows[0] || {};

  return {
    child_count: Number(row.child_count) || 0,
    blocking_child_count: Number(row.blocking_child_count) || 0,
    incomplete_blocking_child_count: Number(row.incomplete_blocking_child_count) || 0,
    parent_count: Number(row.parent_count) || 0,
    blocking_parent_count: Number(row.blocking_parent_count) || 0,
  };
}

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
    is_blocking: Number(row.is_blocking) === 1,
    created_by_user_id: row.created_by_user_id || "",
    updated_by_user_id: row.updated_by_user_id || "",
    removed_at: row.removed_at || "",
    removed_by_user_id: row.removed_by_user_id || "",
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export const taskRelationshipsRepository = {
  create,
  hasPath,
  readActivePair,
  readBlockingChildren,
  readById,
  readChildren,
  readForTask,
  readParents,
  relationshipSummary,
  remove,
  update,
};
