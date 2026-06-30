import { randomUUID } from "node:crypto";
import {
  db,
  querySql,
  runSql,
  sqlInteger,
  sqlNullableText,
  sqlText,
} from "../../core/database.js";

async function readAll(workspaceId) {
  const [tasks, assignees] = await Promise.all([
    querySql(taskSelectSql(`
WHERE tasks.workspace_id = ${sqlText(workspaceId)}
ORDER BY
  CASE WHEN tasks.archived_at IS NULL THEN 0 ELSE 1 END,
  COALESCE(tasks.due_date, '9999-12-31'),
  COALESCE(tasks.due_time, '23:59'),
  tasks.updated_at DESC;
`)),
    readAssigneesForWorkspace(workspaceId),
  ]);

  return attachAssignees(tasks.map(taskRowToAppValue), assignees);
}

async function readById(workspaceId, taskId) {
  const rows = await db.query(taskSelectSql(`
WHERE tasks.workspace_id = :workspaceId
  AND tasks.task_id = :taskId
LIMIT 1;
`), { taskId, workspaceId });

  if (!rows[0]) {
    return null;
  }

  const assignees = await readAssigneesForTask(workspaceId, taskId);
  return attachAssignees([taskRowToAppValue(rows[0])], assignees)[0];
}

async function create(workspaceId, task) {
  const now = new Date().toISOString();
  const taskId = task.task_id || randomUUID();

  await runSql(`
INSERT INTO tasks (
  task_id,
  workspace_id,
  client_id,
  project_id,
  title,
  description,
  next_action,
  blocked_reason,
  resume_note,
  status,
  priority,
  billable,
  due_date,
  due_time,
  due_timezone,
  due_at_utc,
  source_type,
  source_id,
  archived_at,
  reminder_override_enabled,
  recurrence_template_id,
  recurrence_instance_date,
  completed_at,
  created_by_user_id,
  updated_by_user_id,
  completed_by_user_id,
  archived_by_user_id,
  last_worked_at,
  created_at,
  updated_at
)
VALUES (
  ${sqlText(taskId)},
  ${sqlText(workspaceId)},
  ${sqlNullableText(task.client_id)},
  ${sqlNullableText(task.project_id)},
  ${sqlText(task.title)},
  ${sqlText(task.description)},
  ${sqlText(task.next_action)},
  ${sqlText(task.blocked_reason)},
  ${sqlText(task.resume_note)},
  ${sqlText(task.status)},
  ${sqlText(task.priority)},
  ${sqlText(task.billable === "no" ? "no" : "yes")},
  ${sqlNullableText(task.due_date)},
  ${sqlNullableText(task.due_time)},
  ${sqlNullableText(task.due_timezone)},
  ${sqlNullableText(task.due_at_utc)},
  ${sqlText(task.source_type || "manual")},
  ${sqlNullableText(task.source_id)},
  ${sqlNullableText(task.archived_at)},
  ${sqlInteger(task.reminder_override_enabled ? 1 : 0)},
  ${sqlNullableText(task.recurrence_template_id)},
  ${sqlNullableText(task.recurrence_instance_date)},
  ${sqlNullableText(task.completed_at)},
  ${sqlNullableText(task.created_by_user_id)},
  ${sqlNullableText(task.updated_by_user_id)},
  ${sqlNullableText(task.completed_by_user_id)},
  ${sqlNullableText(task.archived_by_user_id)},
  ${sqlNullableText(task.last_worked_at)},
  ${sqlText(now)},
  ${sqlText(now)}
);
`);

  await replaceAssignees(workspaceId, taskId, task.assignee_ids || [], task.updated_by_user_id || task.created_by_user_id);
  return readById(workspaceId, taskId);
}

async function update(workspaceId, task) {
  const now = new Date().toISOString();

  await runSql(`
UPDATE tasks
SET
  client_id = ${sqlNullableText(task.client_id)},
  project_id = ${sqlNullableText(task.project_id)},
  title = ${sqlText(task.title)},
  description = ${sqlText(task.description)},
  next_action = ${sqlText(task.next_action)},
  blocked_reason = ${sqlText(task.blocked_reason)},
  resume_note = ${sqlText(task.resume_note)},
  status = ${sqlText(task.status)},
  priority = ${sqlText(task.priority)},
  billable = ${sqlText(task.billable === "no" ? "no" : "yes")},
  due_date = ${sqlNullableText(task.due_date)},
  due_time = ${sqlNullableText(task.due_time)},
  due_timezone = ${sqlNullableText(task.due_timezone)},
  due_at_utc = ${sqlNullableText(task.due_at_utc)},
  source_type = ${sqlText(task.source_type || "manual")},
  source_id = ${sqlNullableText(task.source_id)},
  archived_at = ${sqlNullableText(task.archived_at)},
  reminder_override_enabled = ${sqlInteger(task.reminder_override_enabled ? 1 : 0)},
  recurrence_template_id = ${sqlNullableText(task.recurrence_template_id)},
  recurrence_instance_date = ${sqlNullableText(task.recurrence_instance_date)},
  completed_at = ${sqlNullableText(task.completed_at)},
  updated_by_user_id = ${sqlNullableText(task.updated_by_user_id)},
  completed_by_user_id = ${sqlNullableText(task.completed_by_user_id)},
  archived_by_user_id = ${sqlNullableText(task.archived_by_user_id)},
  last_worked_at = ${sqlNullableText(task.last_worked_at)},
  updated_at = ${sqlText(now)}
WHERE workspace_id = ${sqlText(workspaceId)}
  AND task_id = ${sqlText(task.task_id)};
`);

  if (Array.isArray(task.assignee_ids)) {
    await replaceAssignees(workspaceId, task.task_id, task.assignee_ids, task.updated_by_user_id);
  }

  return readById(workspaceId, task.task_id);
}

async function replaceAssignees(workspaceId, taskId, assigneeIds, assignedByUserId) {
  const now = new Date().toISOString();
  const uniqueAssigneeIds = [...new Set((assigneeIds || []).map((id) => String(id || "").trim()).filter(Boolean))];
  const inserts = uniqueAssigneeIds.map((userId) => `
INSERT INTO task_assignees (
  task_assignee_id,
  workspace_id,
  task_id,
  assignee_type,
  user_id,
  role_id,
  assigned_by_user_id,
  assigned_at,
  removed_at
)
VALUES (
  ${sqlText(randomUUID())},
  ${sqlText(workspaceId)},
  ${sqlText(taskId)},
  'user',
  ${sqlText(userId)},
  NULL,
  ${sqlNullableText(assignedByUserId)},
  ${sqlText(now)},
  NULL
);
`).join("\n");

  await runSql(`
BEGIN TRANSACTION;
UPDATE task_assignees
SET removed_at = ${sqlText(now)}
WHERE workspace_id = ${sqlText(workspaceId)}
  AND task_id = ${sqlText(taskId)}
  AND removed_at IS NULL;
${inserts}
COMMIT;
`);
}

async function readAssigneesForWorkspace(workspaceId) {
  return querySql(assigneeSelectSql(`
WHERE task_assignees.workspace_id = ${sqlText(workspaceId)}
  AND task_assignees.removed_at IS NULL
ORDER BY users.username;
`));
}

async function readByRecurrenceInstance(workspaceId, templateId, instanceDate) {
  const rows = await querySql(taskSelectSql(`
WHERE tasks.workspace_id = ${sqlText(workspaceId)}
  AND tasks.recurrence_template_id = ${sqlText(templateId)}
  AND tasks.recurrence_instance_date = ${sqlText(instanceDate)}
LIMIT 1;
`));

  if (!rows[0]) {
    return null;
  }

  const assignees = await readAssigneesForTask(workspaceId, rows[0].task_id);
  return attachAssignees([taskRowToAppValue(rows[0])], assignees)[0];
}

async function readDueBetween(workspaceId, startDate, endDate) {
  const [tasks, assignees] = await Promise.all([
    querySql(taskSelectSql(`
WHERE tasks.workspace_id = ${sqlText(workspaceId)}
  AND tasks.due_date IS NOT NULL
  AND tasks.due_date >= ${sqlText(startDate)}
  AND tasks.due_date <= ${sqlText(endDate)}
  AND tasks.status != 'archived'
ORDER BY
  tasks.due_date,
  COALESCE(tasks.due_time, '23:59'),
  tasks.priority DESC,
  tasks.updated_at DESC;
`)),
    readAssigneesForWorkspace(workspaceId),
  ]);

  return attachAssignees(tasks.map(taskRowToAppValue), assignees);
}

async function readAssigneesForTask(workspaceId, taskId) {
  return db.query(assigneeSelectSql(`
WHERE task_assignees.workspace_id = :workspaceId
  AND task_assignees.task_id = :taskId
  AND task_assignees.removed_at IS NULL
ORDER BY users.username;
`), { taskId, workspaceId });
}

async function markWorkedAt(workspaceId, taskId, workedAt, userId = "") {
  const timestamp = workedAt || new Date().toISOString();

  await runSql(`
UPDATE tasks
SET last_worked_at = ${sqlText(timestamp)},
    updated_by_user_id = COALESCE(${sqlNullableText(userId)}, updated_by_user_id),
    updated_at = ${sqlText(timestamp)}
WHERE workspace_id = ${sqlText(workspaceId)}
  AND task_id = ${sqlText(taskId)};
`);

  return readById(workspaceId, taskId);
}

function taskSelectSql(whereSql) {
  return `
SELECT
  tasks.task_id,
  tasks.workspace_id,
  tasks.client_id,
  clients.name AS client_name,
  tasks.project_id,
  projects.name AS project_name,
  tasks.title,
  tasks.description,
  tasks.next_action,
  tasks.blocked_reason,
  tasks.resume_note,
  tasks.status,
  tasks.priority,
  tasks.billable,
  tasks.due_date,
  tasks.due_time,
  tasks.due_timezone,
  tasks.due_at_utc,
  tasks.source_type,
  tasks.source_id,
  tasks.archived_at,
  tasks.reminder_override_enabled,
  tasks.recurrence_template_id,
  tasks.recurrence_instance_date,
  tasks.completed_at,
  tasks.created_by_user_id,
  tasks.updated_by_user_id,
  tasks.completed_by_user_id,
  tasks.archived_by_user_id,
  tasks.last_worked_at,
  tasks.created_at,
  tasks.updated_at
FROM tasks
LEFT JOIN clients
  ON clients.workspace_id = tasks.workspace_id
  AND clients.id = tasks.client_id
LEFT JOIN projects
  ON projects.workspace_id = tasks.workspace_id
  AND projects.id = tasks.project_id
${whereSql}`;
}

function assigneeSelectSql(whereSql) {
  return `
SELECT
  task_assignees.task_assignee_id,
  task_assignees.workspace_id,
  task_assignees.task_id,
  task_assignees.user_id,
  users.username,
  users.display_name
FROM task_assignees
LEFT JOIN users
  ON users.user_id = task_assignees.user_id
${whereSql}`;
}

function attachAssignees(tasks, assignees) {
  const assigneesByTask = assignees.reduce((map, assignee) => {
    if (!map.has(assignee.task_id)) {
      map.set(assignee.task_id, []);
    }

    map.get(assignee.task_id).push(assigneeRowToAppValue(assignee));
    return map;
  }, new Map());

  return tasks.map((task) => ({
    ...task,
    assignees: assigneesByTask.get(task.task_id) || [],
    assignee_ids: (assigneesByTask.get(task.task_id) || []).map((assignee) => assignee.user_id),
  }));
}

function taskRowToAppValue(row) {
  return {
    task_id: row.task_id,
    workspace_id: row.workspace_id,
    client_id: row.client_id || "",
    client_name: row.client_name || "",
    project_id: row.project_id || "",
    project_name: row.project_name || "",
    title: row.title,
    description: row.description || "",
    next_action: row.next_action || "",
    blocked_reason: row.blocked_reason || "",
    resume_note: row.resume_note || "",
    status: row.status || "open",
    priority: row.priority || "normal",
    billable: row.billable === "no" ? "no" : "yes",
    due_date: row.due_date || "",
    due_time: row.due_time || "",
    due_timezone: row.due_timezone || "",
    due_at_utc: row.due_at_utc || "",
    source_type: row.source_type || "manual",
    source_id: row.source_id || "",
    archived_at: row.archived_at || "",
    reminder_override_enabled: Number(row.reminder_override_enabled) === 1,
    recurrence_template_id: row.recurrence_template_id || "",
    recurrence_instance_date: row.recurrence_instance_date || "",
    completed_at: row.completed_at || "",
    created_by_user_id: row.created_by_user_id || "",
    updated_by_user_id: row.updated_by_user_id || "",
    completed_by_user_id: row.completed_by_user_id || "",
    archived_by_user_id: row.archived_by_user_id || "",
    last_worked_at: row.last_worked_at || row.updated_at || row.created_at || "",
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function assigneeRowToAppValue(row) {
  return {
    task_assignee_id: row.task_assignee_id,
    user_id: row.user_id || "",
    username: row.username || "",
    displayName: row.display_name || row.username || row.user_id || "",
  };
}

export const tasksRepository = {
  create,
  readAll,
  readById,
  readByRecurrenceInstance,
  readDueBetween,
  markWorkedAt,
  update,
};
