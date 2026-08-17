import { createRecordId } from "../../core/identifiers.js";
import { db } from "../../core/database.js";
import { taskCalendarFeedScopeSql } from "./task-calendar-feed.scope.js";
import {
  normalizeTaskListFilter,
  normalizeTaskListSort,
  taskStatusFilterOverridesActiveScope,
} from "./task-list-engine.js";

/** @typedef {import("../../types/database-contracts.d.ts").TransactionClient} TransactionClient */
/** @typedef {import("../../types/database-contracts.d.ts").DatabaseNamedParameterInput} DatabaseNamedParameterInput */
/** @typedef {import("../../types/database-contracts.d.ts").DatabaseParams} DatabaseParams */
/** @typedef {import("../../types/task-recurrence-contracts.d.ts").TaskRecord} TaskRecord */
/** @typedef {import("../../types/task-recurrence-contracts.d.ts").TaskAssignee} TaskAssignee */
/** @typedef {import("../../types/task-recurrence-contracts.d.ts").TaskRecurrenceTemplate} TaskRecurrenceTemplate */
/** @typedef {import("../../types/task-server-contracts.d.ts").TaskAssigneeRow} TaskAssigneeRow */
/** @typedef {import("../../types/task-server-contracts.d.ts").TaskDashboardCountRow} TaskDashboardCountRow */
/** @typedef {import("../../types/task-server-contracts.d.ts").TaskDatabaseRow} TaskDatabaseRow */
/** @typedef {import("../../types/task-server-contracts.d.ts").TaskRepositoryOptions} TaskRepositoryOptions */
/** @typedef {import("../../types/task-server-contracts.d.ts").TaskRecurrenceRecoveryResult} TaskRecurrenceRecoveryResult */
/** @typedef {import("../../types/task-server-contracts.d.ts").TaskWrite} TaskWrite */
/** @typedef {import("../../types/task-server-contracts.d.ts").TaskWriteParamsInput} TaskWriteParamsInput */
/** @typedef {import("../../types/task-status-contracts.d.ts").TaskStatusRow} TaskStatusRow */
/** @typedef {Record<string, DatabaseNamedParameterInput>} NamedParams */

const TASK_RECURRENCE_INSTANCE_INSERT_SQL = db.dialect.conflict.buildInsertOnConflictDoNothing({
  columns: [
    "task_id", "workspace_id", "client_id", "project_id", "title", "description",
    "next_action", "blocked_reason", "resume_note", "status", "priority", "estimate_minutes",
    "billable", "due_date", "due_time", "due_timezone", "due_at_utc", "source_type",
    "source_id", "archived_at", "reminder_override_enabled", "recurrence_template_id",
    "recurrence_instance_date", "completed_at", "created_by_user_id", "updated_by_user_id",
    "completed_by_user_id", "archived_by_user_id", "last_worked_at", "created_at", "updated_at",
  ],
  conflictColumns: ["workspace_id", "recurrence_template_id", "recurrence_instance_date"],
  returningColumns: ["task_id"],
  tableName: "tasks",
  valueExpressions: [
    ":taskId", ":workspaceId", ":clientId", ":projectId", ":title", ":description",
    ":nextAction", ":blockedReason", ":resumeNote", ":status", ":priority", ":estimateMinutes",
    ":billable", ":dueDate", ":dueTime", ":dueTimezone", ":dueAtUtc", ":sourceType",
    ":sourceId", ":archivedAt", ":reminderOverrideEnabled", ":recurrenceTemplateId",
    ":recurrenceInstanceDate", ":completedAt", ":createdByUserId", ":updatedByUserId",
    ":completedByUserId", ":archivedByUserId", ":lastWorkedAt", ":createdAt", ":updatedAt",
  ],
});

/** @param {string} workspaceId @param {TaskRepositoryOptions} options */
async function queryList(workspaceId, options = {}) {
  const normalizedLimit = normalizePositiveInteger(options.limit, 0);
  const normalizedOffset = normalizePositiveInteger(options.offset, 0);
  /** @type {NamedParams} */
  const params = {
    workspaceId,
  };
  const whereSql = taskListWhereSql(options, params);
  const orderSql = taskListOrderSql(options.sort);
  const limitSql = normalizedLimit > 0 ? "\nLIMIT :limit OFFSET :offset" : "";

  if (normalizedLimit > 0) {
    params.limit = normalizedLimit + 1;
    params.offset = normalizedOffset;
  }

  const rows = await queryTaskRows(taskSelectSql(`
${whereSql}
${orderSql}${limitSql};
`), params);
  const hasMore = normalizedLimit > 0 && rows.length > normalizedLimit;
  const taskRows = hasMore ? rows.slice(0, normalizedLimit) : rows;
  const assignees = await readAssigneesForTasks(
    workspaceId,
    taskRows.map((task) => task.task_id),
  );

  return {
    hasMore,
    nextOffset: normalizedOffset + taskRows.length,
    tasks: attachAssignees(taskRows.map(taskRowToAppValue), assignees),
  };
}

/** @param {string} workspaceId */
async function readAll(workspaceId) {
  const [tasks, assignees] = await Promise.all([
    queryTaskRows(taskSelectSql(`
WHERE tasks.workspace_id = :workspaceId
ORDER BY
  CASE WHEN tasks.archived_at IS NULL THEN 0 ELSE 1 END,
  COALESCE(tasks.due_date, '9999-12-31'),
  COALESCE(tasks.due_time, '23:59'),
  tasks.updated_at DESC;
`), { workspaceId }),
    readAssigneesForWorkspace(workspaceId),
  ]);

  return attachAssignees(tasks.map(taskRowToAppValue), assignees);
}

/** @param {string} workspaceId @param {string} taskId */
async function readById(workspaceId, taskId) {
  const rows = await queryTaskRows(taskSelectSql(`
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

/** @param {string} workspaceId @param {unknown[]} taskIds @returns {Promise<TaskStatusRow[]>} */
async function readStatusByIds(workspaceId, taskIds = []) {
  const ids = [...new Set((Array.isArray(taskIds) ? taskIds : [])
    .map((taskId) => String(taskId || "").trim())
    .filter(Boolean))];

  if (ids.length === 0) {
    return [];
  }

  const rows = await db.query(`
SELECT task_id, workspace_id, client_id, project_id, status
FROM tasks
WHERE tasks.workspace_id = :workspaceId
  AND tasks.task_id IN (:taskIds);
`, {
    taskIds: ids,
    workspaceId,
  });
  return rows.map((row) => ({
    task_id: String(row.task_id || ""),
    workspace_id: String(row.workspace_id || ""),
    client_id: row.client_id ? String(row.client_id) : null,
    project_id: row.project_id ? String(row.project_id) : null,
    status: String(row.status || "open"),
  }));
}

/** @param {string} workspaceId @param {unknown[]} taskIds */
async function readByIds(workspaceId, taskIds = []) {
  const ids = [...new Set((Array.isArray(taskIds) ? taskIds : [])
    .map((taskId) => String(taskId || "").trim())
    .filter(Boolean))];

  if (ids.length === 0) {
    return [];
  }

  const rows = await queryTaskRows(taskSelectSql(`
WHERE tasks.workspace_id = :workspaceId
  AND tasks.task_id IN (:taskIds)
ORDER BY tasks.updated_at DESC, ${db.dialect.comparison.orderByNoCase("tasks.title", "ASC")};
`), {
    taskIds: ids,
    workspaceId,
  });
  const assignees = await readAssigneesForTasks(workspaceId, rows.map((row) => row.task_id));

  return attachAssignees(rows.map(taskRowToAppValue), assignees);
}

/** @param {string} workspaceId @param {TaskWrite} task @returns {Promise<TaskRecord>} */
async function create(workspaceId, task) {
  const now = new Date().toISOString();
  const taskId = task.task_id || createRecordId();

  await db.run(`
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
  estimate_minutes,
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
  :taskId,
  :workspaceId,
  :clientId,
  :projectId,
  :title,
  :description,
  :nextAction,
  :blockedReason,
  :resumeNote,
  :status,
  :priority,
  :estimateMinutes,
  :billable,
  :dueDate,
  :dueTime,
  :dueTimezone,
  :dueAtUtc,
  :sourceType,
  :sourceId,
  :archivedAt,
  :reminderOverrideEnabled,
  :recurrenceTemplateId,
  :recurrenceInstanceDate,
  :completedAt,
  :createdByUserId,
  :updatedByUserId,
  :completedByUserId,
  :archivedByUserId,
  :lastWorkedAt,
  :createdAt,
  :updatedAt
);
`, taskWriteParams({ includeCreatedAt: true, now, task, taskId, workspaceId }));

  await replaceAssignees(workspaceId, taskId, task.assignee_ids || [], task.updated_by_user_id || task.created_by_user_id);
  return /** @type {TaskRecord} */ (await readById(workspaceId, taskId));
}

/** @param {string} workspaceId @param {TaskWrite} task */
async function createRecurrenceInstance(workspaceId, task) {
  const now = new Date().toISOString();
  const taskId = task.task_id || createRecordId();
  const params = taskWriteParams({ includeCreatedAt: true, now, task, taskId, workspaceId });
  let wasCreated = false;

  await db.transaction(async (transaction) => {
    const rows = await transaction.query(TASK_RECURRENCE_INSTANCE_INSERT_SQL, params);
    wasCreated = rows.some((row) => row.task_id === taskId);

    if (wasCreated) {
      await replaceAssigneesWithExecutor(
        transaction,
        workspaceId,
        taskId,
        task.assignee_ids || [],
        task.updated_by_user_id || task.created_by_user_id,
        now,
      );
    }
  });

  const materializedTask = wasCreated
    ? await readById(workspaceId, taskId)
    : await readByRecurrenceInstance(
        workspaceId,
        String(task.recurrence_template_id || ""),
        String(task.recurrence_instance_date || ""),
      );

  return {
    task: /** @type {TaskRecord} */ (materializedTask),
    wasCreated,
  };
}

/** @param {string} workspaceId @param {TaskWrite & { task_id: string }} task @returns {Promise<TaskRecord>} */
async function update(workspaceId, task) {
  const now = new Date().toISOString();

  await db.run(taskUpdateSql(), taskWriteParams({ now, task, taskId: task.task_id, workspaceId }));

  if (Array.isArray(task.assignee_ids)) {
    await replaceAssignees(workspaceId, task.task_id, task.assignee_ids, task.updated_by_user_id);
  }

  return /** @type {TaskRecord} */ (await readById(workspaceId, task.task_id));
}

/** @param {string} workspaceId @param {TaskWrite & { task_id: string }} rootTask @param {Array<TaskWrite & { task_id: string }>} descendantTasks */
async function updateProjectCascade(workspaceId, rootTask, descendantTasks = []) {
  const now = new Date().toISOString();

  await db.transaction(async (transaction) => {
    await transaction.run(taskUpdateSql(), taskWriteParams({
      now,
      task: rootTask,
      taskId: rootTask.task_id,
      workspaceId,
    }));
    if (Array.isArray(rootTask.assignee_ids)) {
      await replaceAssigneesWithExecutor(
        transaction,
        workspaceId,
        rootTask.task_id,
        rootTask.assignee_ids,
        rootTask.updated_by_user_id,
        now,
      );
    }

    for (const task of descendantTasks) {
      await transaction.run(`
UPDATE tasks
SET client_id = :clientId,
    project_id = :projectId,
    billable = :billable,
    updated_by_user_id = :updatedByUserId,
    last_worked_at = :lastWorkedAt,
    updated_at = :updatedAt
WHERE workspace_id = :workspaceId
  AND task_id = :taskId;
`, {
        billable: task.billable,
        clientId: task.client_id || null,
        lastWorkedAt: task.last_worked_at || now,
        projectId: task.project_id || null,
        taskId: task.task_id,
        updatedAt: now,
        updatedByUserId: task.updated_by_user_id || null,
        workspaceId,
      });
    }
  });

  return readByIds(workspaceId, [rootTask.task_id, ...descendantTasks.map((task) => task.task_id)]);
}

function taskUpdateSql() {
  return `
UPDATE tasks
SET
  client_id = :clientId,
  project_id = :projectId,
  title = :title,
  description = :description,
  next_action = :nextAction,
  blocked_reason = :blockedReason,
  resume_note = :resumeNote,
  status = :status,
  priority = :priority,
  estimate_minutes = :estimateMinutes,
  billable = :billable,
  due_date = :dueDate,
  due_time = :dueTime,
  due_timezone = :dueTimezone,
  due_at_utc = :dueAtUtc,
  source_type = :sourceType,
  source_id = :sourceId,
  archived_at = :archivedAt,
  reminder_override_enabled = :reminderOverrideEnabled,
  recurrence_template_id = :recurrenceTemplateId,
  recurrence_instance_date = :recurrenceInstanceDate,
  completed_at = :completedAt,
  updated_by_user_id = :updatedByUserId,
  completed_by_user_id = :completedByUserId,
  archived_by_user_id = :archivedByUserId,
  last_worked_at = :lastWorkedAt,
  updated_at = :updatedAt
WHERE workspace_id = :workspaceId
  AND task_id = :taskId;
`;
}

/** @param {string} workspaceId @param {string} taskId @param {unknown[]} assigneeIds @param {unknown} assignedByUserId */
async function replaceAssignees(workspaceId, taskId, assigneeIds, assignedByUserId) {
  const now = new Date().toISOString();
  const uniqueAssigneeIds = [...new Set((assigneeIds || []).map((id) => String(id || "").trim()).filter(Boolean))];

  await db.transaction(async (transaction) => {
    await replaceAssigneesWithExecutor(transaction, workspaceId, taskId, uniqueAssigneeIds, assignedByUserId, now);
  });
}

/** @param {TransactionClient} database @param {string} workspaceId @param {string} taskId @param {string[]} assigneeIds @param {unknown} assignedByUserId @param {string} now */
async function replaceAssigneesWithExecutor(database, workspaceId, taskId, assigneeIds, assignedByUserId, now) {
  await database.run(`
UPDATE task_assignees
SET removed_at = :removedAt
WHERE workspace_id = :workspaceId
  AND task_id = :taskId
  AND removed_at IS NULL;
`, { removedAt: now, taskId, workspaceId });

  for (const userId of assigneeIds) {
    await database.run(`
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
  :taskAssigneeId,
  :workspaceId,
  :taskId,
  'user',
  :userId,
  NULL,
  :assignedByUserId,
  :assignedAt,
  NULL
);
`, {
        assignedAt: now,
        assignedByUserId: nullableTextParam(assignedByUserId),
        taskAssigneeId: createRecordId(),
        taskId,
        userId,
        workspaceId,
      });
  }
}

/** @param {string} workspaceId */
async function readAssigneesForWorkspace(workspaceId) {
  return queryAssigneeRows(assigneeSelectSql(`
WHERE task_assignees.workspace_id = :workspaceId
  AND task_assignees.removed_at IS NULL
ORDER BY users.username;
`), { workspaceId });
}

/** @param {string} workspaceId @param {unknown[]} taskIds */
async function readAssigneesForTasks(workspaceId, taskIds) {
  const uniqueTaskIds = [...new Set((taskIds || []).map((taskId) => String(taskId || "").trim()).filter(Boolean))];

  if (uniqueTaskIds.length === 0) {
    return [];
  }

  return queryAssigneeRows(assigneeSelectSql(`
WHERE task_assignees.workspace_id = :workspaceId
  AND task_assignees.task_id IN (:taskIds)
  AND task_assignees.removed_at IS NULL
ORDER BY users.username;
`), {
    taskIds: uniqueTaskIds,
    workspaceId,
  });
}

/** @param {string} workspaceId @param {string} templateId @param {string} instanceDate */
async function readByRecurrenceInstance(workspaceId, templateId, instanceDate) {
  const rows = await queryTaskRows(taskSelectSql(`
WHERE tasks.workspace_id = :workspaceId
  AND tasks.recurrence_template_id = :templateId
  AND tasks.recurrence_instance_date = :instanceDate
LIMIT 1;
`), {
    instanceDate,
    templateId,
    workspaceId,
  });

  if (!rows[0]) {
    return null;
  }

  const assignees = await readAssigneesForTask(workspaceId, rows[0].task_id);
  return attachAssignees([taskRowToAppValue(rows[0])], assignees)[0];
}

/** @param {string} workspaceId @param {string} templateId @param {string} beforeDate */
async function readRecurrenceInstancesBefore(workspaceId, templateId, beforeDate) {
  const rows = await queryTaskRows(taskSelectSql(`
WHERE tasks.workspace_id = :workspaceId
  AND tasks.recurrence_template_id = :templateId
  AND tasks.recurrence_instance_date < :beforeDate
ORDER BY tasks.recurrence_instance_date, tasks.task_id;
`), { beforeDate, templateId, workspaceId });
  const assignees = await readAssigneesForTasks(workspaceId, rows.map((row) => row.task_id));
  return attachAssignees(rows.map(taskRowToAppValue), assignees);
}

/**
 * @param {string} workspaceId
 * @param {import("../../types/task-recurrence-contracts.d.ts").TaskRecurrenceRecoveryWrite} options
 */
async function recoverRecurrenceToCurrent(workspaceId, {
  actorUserId,
  expectedTaskIds = [],
  checkpointDate,
  expectedTemplate,
  targetTask = null,
  templateId,
}) {
  const now = new Date().toISOString();
  const targetTaskId = targetTask?.task_id || createRecordId();
  /** @type {TaskRecurrenceRecoveryResult | null} */
  let result = null;

  await db.transaction(async (transaction) => {
    const template = await transaction.get(`
SELECT recurrence_anchor_date, due_time, due_timezone, rrule, recurrence_end_date,
       recovery_checkpoint_date, template_status
FROM task_recurrence_templates
WHERE workspace_id = :workspaceId
  AND recurrence_template_id = :templateId
LIMIT 1;
`, { templateId, workspaceId });
    if (!template || template.template_status !== "active") {
      result = { status: "unavailable" };
      return;
    }
    if ((template.recovery_checkpoint_date || "") > checkpointDate
      || !recurrenceTemplateMatches(template, expectedTemplate)) {
      result = { status: "changed" };
      return;
    }

    const rows = await transaction.query(`
SELECT task_id
FROM tasks
WHERE workspace_id = :workspaceId
  AND recurrence_template_id = :templateId
  AND recurrence_instance_date < :checkpointDate
  AND status IN ('open', 'in_progress', 'blocked')
  AND archived_at IS NULL
ORDER BY recurrence_instance_date, task_id;
`, { checkpointDate, templateId, workspaceId });
    const taskIds = rows.map((row) => String(row.task_id || ""));
    const allowedIds = new Set(expectedTaskIds);
    if (taskIds.some((taskId) => !allowedIds.has(taskId))) {
      result = { status: "changed" };
      return;
    }

    if (taskIds.length > 0) {
      const timers = await transaction.query(`
SELECT source_id
FROM active_work_timers
WHERE workspace_id = :workspaceId
  AND source_module_id = 'tasks'
  AND source_type = 'task'
  AND source_id IN (:taskIds)
  AND timer_status IN ('running', 'paused')
LIMIT 1;
`, { taskIds, workspaceId });
      if (timers.length > 0) {
        result = { status: "timer_conflict", taskId: String(timers[0].source_id || "") };
        return;
      }

      await transaction.run(`
UPDATE tasks
SET status = 'complete',
    completed_at = :now,
    completed_by_user_id = :actorUserId,
    last_worked_at = :now,
    updated_by_user_id = :actorUserId,
    updated_at = :now
WHERE workspace_id = :workspaceId
  AND task_id IN (:taskIds)
  AND status IN ('open', 'in_progress', 'blocked')
  AND archived_at IS NULL;
`, { actorUserId, now, taskIds, workspaceId });
    }

    await transaction.run(`
UPDATE task_recurrence_templates
SET recovery_checkpoint_date = CASE
      WHEN recovery_checkpoint_date IS NULL OR recovery_checkpoint_date < :checkpointDate
        THEN :checkpointDate
      ELSE recovery_checkpoint_date
    END,
    updated_by_user_id = :actorUserId,
    updated_at = :now
WHERE workspace_id = :workspaceId
  AND recurrence_template_id = :templateId;
`, { actorUserId, checkpointDate, now, templateId, workspaceId });

    let targetCreated = false;
    if (targetTask) {
      const params = taskWriteParams({
        includeCreatedAt: true,
        now,
        task: { ...targetTask, task_id: targetTaskId },
        taskId: targetTaskId,
        workspaceId,
      });
      const inserted = await transaction.query(TASK_RECURRENCE_INSTANCE_INSERT_SQL, params);
      targetCreated = inserted.some((row) => row.task_id === targetTaskId);
      if (targetCreated) {
        await replaceAssigneesWithExecutor(
          transaction,
          workspaceId,
          targetTaskId,
          targetTask.assignee_ids || [],
          actorUserId,
          now,
        );
      }
    }

    result = { status: "recovered", completedTaskIds: taskIds, targetCreated, targetTaskId };
  });

  const recoveryResult = /** @type {TaskRecurrenceRecoveryResult | null} */ (result);
  if (recoveryResult?.status !== "recovered") {
    return recoveryResult;
  }
  return {
    ...recoveryResult,
    completedTasks: await readByIds(workspaceId, recoveryResult.completedTaskIds || []),
    targetTask: targetTask
      ? await readByRecurrenceInstance(workspaceId, templateId, checkpointDate)
      : null,
  };
}

/** @param {Record<string, unknown> | null} actual @param {TaskRecurrenceTemplate} expected */
function recurrenceTemplateMatches(actual, expected) {
  /** @type {Array<"recurrence_anchor_date" | "due_time" | "due_timezone" | "rrule" | "recurrence_end_date">} */
  const fields = [
    "recurrence_anchor_date",
    "due_time",
    "due_timezone",
    "rrule",
    "recurrence_end_date",
  ];
  return fields.every((key) => String(actual?.[key] || "") === String(expected?.[key] || ""));
}

/** @param {string} workspaceId @param {string} templateId @param {string} afterInstanceDate */
async function readFutureRecurrenceInstances(workspaceId, templateId, afterInstanceDate) {
  const rows = await queryTaskRows(taskSelectSql(`
WHERE tasks.workspace_id = :workspaceId
  AND tasks.recurrence_template_id = :templateId
  AND tasks.recurrence_instance_date IS NOT NULL
  AND tasks.recurrence_instance_date != ''
  AND tasks.recurrence_instance_date > :afterInstanceDate
  AND tasks.status NOT IN ('complete', 'archived')
ORDER BY tasks.recurrence_instance_date ASC, tasks.due_time ASC, tasks.created_at ASC;
`), {
    afterInstanceDate,
    templateId,
    workspaceId,
  });

  if (rows.length === 0) {
    return [];
  }

  const assignees = await readAssigneesForTasks(workspaceId, rows.map((row) => row.task_id));
  return attachAssignees(rows.map(taskRowToAppValue), assignees);
}

/** @param {string} workspaceId @param {string} templateId */
async function readRecurrenceInstanceStats(workspaceId, templateId) {
  const row = await db.get(`
SELECT
  COUNT(*) AS total,
  SUM(CASE WHEN tasks.status NOT IN ('complete', 'archived') THEN 1 ELSE 0 END) AS open_count,
  MAX(tasks.recurrence_instance_date) AS latest_instance_date
FROM tasks
WHERE tasks.workspace_id = :workspaceId
  AND tasks.recurrence_template_id = :templateId
  AND tasks.recurrence_instance_date IS NOT NULL
  AND tasks.recurrence_instance_date != '';
`, {
    templateId,
    workspaceId,
  });

  return {
    total: Number(row?.total) || 0,
    openCount: Number(row?.open_count) || 0,
    latestInstanceDate: row?.latest_instance_date || "",
  };
}

/** @param {string} workspaceId @param {string} startDate @param {string} endDate @param {TaskRepositoryOptions} options */
async function readDueBetween(workspaceId, startDate, endDate, options = {}) {
  const statuses = Array.isArray(options.statuses) && options.statuses.length
    ? options.statuses
    : ["open", "in_progress", "blocked"];
  const statusParams = Object.fromEntries(
    Array.from({ length: 5 }, (_, index) => [`calendarStatus${index}`, statuses[index] || null]),
  );
  const tasks = await queryTaskRows(taskCalendarSelectSql(`
WHERE tasks.workspace_id = :workspaceId
  AND tasks.due_date IS NOT NULL
  AND tasks.due_date >= :startDate
  AND tasks.due_date <= :endDate
  AND tasks.status IN (:calendarStatus0, :calendarStatus1, :calendarStatus2, :calendarStatus3, :calendarStatus4)
ORDER BY
  tasks.due_date,
  COALESCE(tasks.due_time, '23:59'),
  tasks.priority DESC,
  tasks.updated_at DESC;
`), {
    endDate,
    startDate,
    workspaceId,
    ...statusParams,
  });

  return tasks.map(taskCalendarRowToAppValue);
}

/** @param {string} workspaceId @param {string} startDate @param {string} endDate */
async function readRecurrenceInstancesBetween(workspaceId, startDate, endDate) {
  const rows = await db.query(`
SELECT
  task_id,
  recurrence_template_id,
  recurrence_instance_date
FROM tasks
WHERE workspace_id = :workspaceId
  AND recurrence_template_id IS NOT NULL
  AND recurrence_template_id != ''
  AND recurrence_instance_date IS NOT NULL
  AND recurrence_instance_date >= :startDate
  AND recurrence_instance_date <= :endDate
ORDER BY recurrence_instance_date, recurrence_template_id, task_id;
`, {
    endDate,
    startDate,
    workspaceId,
  });

  return rows.map((row) => ({
    task_id: row.task_id,
    recurrence_template_id: row.recurrence_template_id,
    recurrence_instance_date: row.recurrence_instance_date,
  }));
}

/** @param {string} workspaceId @param {string} startDate @param {string} endDate @param {TaskRepositoryOptions} options */
async function readCalendarFeedCandidates(workspaceId, startDate, endDate, options = {}) {
  const scope = taskCalendarFeedScopeSql(options.scope, {
    projectAlias: "projects",
    recordAlias: "tasks",
  });
  const query = taskCalendarSelectSql(`
WHERE tasks.workspace_id = :workspaceId
  AND ${scope.sql}
  AND (
    (
      tasks.due_date IS NOT NULL
      AND tasks.due_date >= :startDate
      AND tasks.due_date <= :endDate
    )
    OR (
      tasks.recurrence_instance_date IS NOT NULL
      AND tasks.recurrence_instance_date != ''
      AND tasks.recurrence_instance_date >= :startDate
      AND tasks.recurrence_instance_date <= :endDate
    )
  )
ORDER BY
  COALESCE(tasks.due_date, tasks.recurrence_instance_date),
  COALESCE(tasks.due_time, '23:59'),
  tasks.updated_at,
  tasks.task_id;
`);
  const tasks = await queryTaskRows(query, {
    endDate,
    startDate,
    workspaceId,
    ...scope.params,
  });

  return tasks.map(taskCalendarRowToAppValue);
}

/** @param {string} workspaceId @param {string} startDate @param {string} endDate @param {string[]} templateIds @param {TaskRepositoryOptions} options */
async function readCalendarFeedSuppressedInstances(
  workspaceId,
  startDate,
  endDate,
  templateIds,
  options = {},
) {
  if (!Array.isArray(templateIds) || templateIds.length === 0) {
    return [];
  }
  const scope = taskCalendarFeedScopeSql(options.scope, {
    projectAlias: "projects",
    recordAlias: "tasks",
  });
  if (scope.sql === "1 = 1") {
    return [];
  }
  const query = `
SELECT
  tasks.recurrence_template_id,
  tasks.recurrence_instance_date
FROM tasks
LEFT JOIN projects
  ON projects.workspace_id = tasks.workspace_id
  AND projects.id = tasks.project_id
WHERE tasks.workspace_id = :workspaceId
  AND tasks.recurrence_template_id IN (:templateIds)
  AND tasks.recurrence_instance_date IS NOT NULL
  AND tasks.recurrence_instance_date != ''
  AND tasks.recurrence_instance_date >= :startDate
  AND tasks.recurrence_instance_date <= :endDate
  AND NOT (${scope.sql})
ORDER BY tasks.recurrence_instance_date, tasks.recurrence_template_id;
`;
  return db.query(query, {
    endDate,
    startDate,
    templateIds,
    workspaceId,
    ...scope.params,
  });
}

/** @param {string} workspaceId @param {string} userId @param {TaskRepositoryOptions} options */
async function readDashboardCountGroups(workspaceId, userId, options = {}) {
  const sql = `
SELECT
  tasks.workspace_id,
  tasks.client_id,
  tasks.project_id,
  COUNT(CASE WHEN tasks.status NOT IN ('complete', 'archived') THEN 1 END) AS active_count,
  COUNT(CASE WHEN tasks.status = 'complete' THEN 1 END) AS completed_count,
  COUNT(CASE WHEN tasks.status = 'archived' THEN 1 END) AS archived_count,
  COUNT(CASE
    WHEN tasks.status NOT IN ('complete', 'archived')
      AND tasks.status = 'blocked'
    THEN 1
  END) AS blocked_count,
  COUNT(CASE
    WHEN tasks.status NOT IN ('complete', 'archived')
      AND ${dashboardOverdueSql()}
    THEN 1
  END) AS overdue_count,
  COUNT(CASE
    WHEN tasks.status NOT IN ('complete', 'archived')
      AND ${dashboardDueSoonSql()}
    THEN 1
  END) AS due_soon_count,
  COUNT(CASE
    WHEN tasks.status NOT IN ('complete', 'archived')
      AND ${assigneeExistsSql("currentUserId")}
    THEN 1
  END) AS assigned_to_me_count,
  COUNT(CASE
    WHEN tasks.status NOT IN ('complete', 'archived')
      AND ${dashboardTimerExistsSql()}
    THEN 1
  END) AS active_timer_count
FROM tasks
WHERE tasks.workspace_id = :workspaceId
GROUP BY tasks.workspace_id, tasks.client_id, tasks.project_id;
`;
  const rows = /** @type {TaskDashboardCountRow[]} */ (await db.query(sql, {
    currentUserId: userId,
    dueSoonCutoff: options.dueSoonCutoff || "",
    nowIso: options.nowIso || new Date().toISOString(),
    today: options.today || "",
    workspaceId,
  }));

  return rows.map(dashboardCountGroupRowToAppValue);
}

/** @param {string} workspaceId @param {string} userId @param {TaskRepositoryOptions} options */
async function readDashboardCandidates(workspaceId, userId, options = {}) {
  const candidateLimit = normalizePositiveInteger(options.candidateLimit, 5);
  const params = {
    candidateLimit,
    currentUserId: userId,
    dueSoonCutoff: options.dueSoonCutoff || "",
    nowIso: options.nowIso || new Date().toISOString(),
    today: options.today || "",
    workspaceId,
  };
  const sql = `
WITH dashboard_candidate_pool AS (
  ${dashboardCandidateSelect("attention_overdue", "attention", dashboardOverdueSql())}
  UNION ALL
  ${dashboardCandidateSelect("attention_blocked", "attention", "tasks.status = 'blocked'")}
  UNION ALL
  ${dashboardCandidateSelect("attention_timer", "attention", dashboardTimerExistsSql(), dashboardTimerRankSql())}
  UNION ALL
  ${dashboardCandidateSelect("attention_due_soon", "attention", dashboardDueSoonSql())}
  UNION ALL
  ${dashboardCandidateSelect("upcoming", "legacy", `tasks.status != 'blocked'
      AND ${dashboardDueSoonSql()}`)}
  UNION ALL
  ${dashboardCandidateSelect("legacy_overdue", "legacy", dashboardOverdueSql())}
  UNION ALL
  ${dashboardCandidateSelect("legacy_due_soon", "legacy", dashboardDueSoonSql())}
  UNION ALL
  ${dashboardCandidateSelect("legacy_assigned", "legacy", assigneeExistsSql("currentUserId"))}
),
dashboard_ranked_candidates AS (
  SELECT
    task_id,
    ROW_NUMBER() OVER (
      PARTITION BY
        workspace_id,
        COALESCE(client_id, ''),
        COALESCE(project_id, ''),
        candidate_category
      ORDER BY
        category_rank,
        CASE WHEN ordering_kind = 'attention' THEN due_sort END,
        CASE WHEN ordering_kind = 'legacy' THEN due_date END,
        priority_rank DESC,
        updated_at DESC,
        due_sort,
        title,
        created_at,
        task_id
    ) AS candidate_rank
  FROM dashboard_candidate_pool
)
${taskSelectSql(`
WHERE tasks.workspace_id = :workspaceId
  AND tasks.task_id IN (
    SELECT task_id
    FROM dashboard_ranked_candidates
    WHERE candidate_rank <= :candidateLimit
  )
ORDER BY tasks.updated_at DESC, tasks.title ASC, tasks.task_id ASC;
`)}
`;
  const rows = await queryTaskRows(sql, params);
  const assignees = await readAssigneesForTasks(workspaceId, rows.map((row) => row.task_id));

  return attachAssignees(rows.map(taskRowToAppValue), assignees);
}

/** @param {string} workspaceId @param {TaskRepositoryOptions} options */
async function readReminderSchedulingCandidates(workspaceId, options = {}) {
  const normalizedLimit = normalizePositiveInteger(options.limit, 500);
  const normalizedOffset = normalizePositiveInteger(options.offset, 0);
  const rows = await queryTaskRows(taskSelectSql(`
WHERE tasks.workspace_id = :workspaceId
  AND tasks.due_date IS NOT NULL
  AND tasks.status NOT IN ('complete', 'archived')
ORDER BY
  tasks.due_date,
  COALESCE(tasks.due_time, '23:59'),
  tasks.updated_at ASC,
  tasks.task_id ASC
LIMIT :limit OFFSET :offset;
`), {
    limit: normalizedLimit,
    offset: normalizedOffset,
    workspaceId,
  });
  const assignees = await readAssigneesForTasks(workspaceId, rows.map((row) => row.task_id));

  return attachAssignees(rows.map(taskRowToAppValue), assignees);
}

/** @param {string} workspaceId @param {string} taskId */
async function readAssigneesForTask(workspaceId, taskId) {
  return queryAssigneeRows(assigneeSelectSql(`
WHERE task_assignees.workspace_id = :workspaceId
  AND task_assignees.task_id = :taskId
  AND task_assignees.removed_at IS NULL
ORDER BY users.username;
`), { taskId, workspaceId });
}

/** @param {string} workspaceId @param {string} taskId @param {string | null | undefined} workedAt @param {string} userId */
async function markWorkedAt(workspaceId, taskId, workedAt, userId = "") {
  const timestamp = workedAt || new Date().toISOString();

  await db.run(`
UPDATE tasks
SET last_worked_at = :timestamp,
    updated_by_user_id = COALESCE(:userId, updated_by_user_id),
    updated_at = :timestamp
WHERE workspace_id = :workspaceId
  AND task_id = :taskId;
`, {
    taskId,
    timestamp,
    userId: nullableTextParam(userId),
    workspaceId,
  });

  return /** @type {TaskRecord} */ (await readById(workspaceId, taskId));
}

/** @param {string} sql @param {DatabaseParams} params */
async function queryTaskRows(sql, params = {}) {
  return /** @type {TaskDatabaseRow[]} */ (await db.query(sql, params));
}

/** @param {string} sql @param {DatabaseParams} params */
async function queryAssigneeRows(sql, params = {}) {
  return /** @type {TaskAssigneeRow[]} */ (await db.query(sql, params));
}

/** @param {string} whereSql */
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
  tasks.estimate_minutes,
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

/** @param {string} whereSql */
function taskCalendarSelectSql(whereSql) {
  return `
SELECT
  tasks.task_id,
  tasks.workspace_id,
  tasks.client_id,
  clients.name AS client_name,
  tasks.project_id,
  projects.name AS project_name,
  projects.client_id AS project_client_id,
  tasks.title,
  tasks.status,
  tasks.priority,
  tasks.due_date,
  tasks.due_time,
  tasks.due_timezone,
  tasks.due_at_utc,
  tasks.reminder_override_enabled,
  tasks.recurrence_template_id,
  tasks.recurrence_instance_date,
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

/** @param {TaskRepositoryOptions} options @param {NamedParams} params */
function taskListWhereSql(options, params) {
  const conditions = ["tasks.workspace_id = :workspaceId"];

  applyTaskViewFilter(conditions, options, params);
  applyStatusFilter(conditions, options, params);
  applyQuickFilter(conditions, options, params);
  applyDueFilter(conditions, options, params);
  applyDueWindowFilter(conditions, options, params);
  applyNextActionFilter(conditions, options);
  applyContextFilters(conditions, options, params);
  applyAssigneeFilters(conditions, options, params);

  return `WHERE ${conditions.join("\n  AND ")}`;
}

/** @param {string} category @param {string} orderingKind @param {string} conditionSql @param {string} categoryRankSql */
function dashboardCandidateSelect(category, orderingKind, conditionSql, categoryRankSql = "0") {
  return `
SELECT
  tasks.task_id,
  tasks.workspace_id,
  tasks.client_id,
  tasks.project_id,
  ${sqlStringLiteral(category)} AS candidate_category,
  ${sqlStringLiteral(orderingKind)} AS ordering_kind,
  ${categoryRankSql} AS category_rank,
  tasks.due_date,
  COALESCE(
    tasks.due_at_utc,
    COALESCE(tasks.due_date, '9999-12-31') || 'T' || COALESCE(tasks.due_time, '23:59') || ':00'
  ) AS due_sort,
  CASE tasks.priority
    WHEN 'urgent' THEN 4
    WHEN 'high' THEN 3
    WHEN 'normal' THEN 2
    WHEN 'low' THEN 1
    ELSE 0
  END AS priority_rank,
  tasks.updated_at,
  tasks.title,
  tasks.created_at
FROM tasks
WHERE tasks.workspace_id = :workspaceId
  AND tasks.status NOT IN ('complete', 'archived')
  AND ${conditionSql}`;
}

function dashboardOverdueSql() {
  return `tasks.due_date IS NOT NULL
      AND CASE
        WHEN tasks.due_time IS NOT NULL
          AND tasks.due_time != ''
          AND tasks.due_at_utc IS NOT NULL
          AND tasks.due_at_utc != ''
        THEN tasks.due_at_utc < :nowIso
        ELSE tasks.due_date < :today
      END`;
}

function dashboardDueSoonSql() {
  return `tasks.due_date IS NOT NULL
      AND tasks.due_date >= :today
      AND tasks.due_date <= :dueSoonCutoff
      AND NOT (${dashboardOverdueSql()})`;
}

function dashboardTimerExistsSql() {
  return `EXISTS (
    SELECT 1
    FROM active_work_timers
    WHERE active_work_timers.workspace_id = tasks.workspace_id
      AND active_work_timers.user_id = :currentUserId
      AND active_work_timers.source_module_id = 'tasks'
      AND active_work_timers.source_type = 'task'
      AND active_work_timers.source_id = tasks.task_id
      AND active_work_timers.timer_status IN ('running', 'paused')
  )`;
}

function dashboardTimerRankSql() {
  return `CASE
    WHEN EXISTS (
      SELECT 1
      FROM active_work_timers
      WHERE active_work_timers.workspace_id = tasks.workspace_id
        AND active_work_timers.user_id = :currentUserId
        AND active_work_timers.source_module_id = 'tasks'
        AND active_work_timers.source_type = 'task'
        AND active_work_timers.source_id = tasks.task_id
        AND active_work_timers.timer_status = 'running'
    ) THEN 0
    ELSE 1
  END`;
}

/** @param {unknown} value */
function sqlStringLiteral(value) {
  return `'${String(value || "").replaceAll("'", "''")}'`;
}

/** @param {string[]} conditions @param {TaskRepositoryOptions} options */
function applyNextActionFilter(conditions, options) {
  if (options.requireNextAction === true) {
    conditions.push("TRIM(COALESCE(tasks.next_action, '')) <> ''");
  }
}

/** @param {string[]} conditions @param {TaskRepositoryOptions} options @param {NamedParams} params */
function applyDueWindowFilter(conditions, options, params) {
  const dueWindowStart = String(options.dueWindowStart || "").trim();
  const dueWindowEnd = String(options.dueWindowEnd || "").trim();

  if (!dueWindowStart && !dueWindowEnd) {
    return;
  }

  conditions.push("tasks.due_date IS NOT NULL");

  if (dueWindowStart) {
    conditions.push("tasks.due_date >= :dueWindowStart");
    params.dueWindowStart = dueWindowStart;
  }

  if (dueWindowEnd) {
    conditions.push("tasks.due_date <= :dueWindowEnd");
    params.dueWindowEnd = dueWindowEnd;
  }
}

/** @param {string[]} conditions @param {TaskRepositoryOptions} options @param {NamedParams} params */
function applyTaskViewFilter(conditions, options, params) {
  const taskView = normalizeTaskListFilter(options.taskView);
  // When the Status filter explicitly targets terminal tasks (complete / archived /
  // history) or asks for everything (all), it must win over a saved view's implicit
  // active-only scope. Otherwise the two clauses contradict and the list is always empty
  // (e.g. "All" view + Status "Complete" => NOT complete AND complete).
  const scopeToActive = !statusFilterOverridesActiveScope(options);
  const pushActiveScope = () => {
    if (scopeToActive) {
      conditions.push(activeTaskSql());
    }
  };

  if (taskView === "my") {
    pushActiveScope();
    conditions.push(assigneeExistsSql("currentUserId"));
    params.currentUserId = options.currentUserId || "";
    return;
  }

  if (taskView === "all") {
    pushActiveScope();
    return;
  }

  if (taskView === "unassigned") {
    pushActiveScope();
    conditions.push(`NOT ${anyAssigneeExistsSql()}`);
    return;
  }

  if (taskView === "overdue") {
    pushActiveScope();
    conditions.push("tasks.due_date IS NOT NULL");
    conditions.push("tasks.due_date < :today");
    params.today = options.today || "";
    return;
  }

  if (taskView === "today") {
    pushActiveScope();
    conditions.push("tasks.due_date = :today");
    params.today = options.today || "";
    return;
  }

  if (taskView === "week") {
    pushActiveScope();
    conditions.push("tasks.due_date IS NOT NULL");
    conditions.push("tasks.due_date >= :today");
    conditions.push("tasks.due_date <= :currentWeekEnd");
    params.currentWeekEnd = options.currentWeekEnd || "";
    params.today = options.today || "";
    return;
  }

  if (taskView === "completed") {
    conditions.push("tasks.status = 'complete'");
    return;
  }

  if (taskView === "archived") {
    conditions.push("tasks.status = 'archived'");
  }
}

/** @param {string[]} conditions @param {TaskRepositoryOptions} options @param {NamedParams} params */
function applyStatusFilter(conditions, options, params) {
  const statusFilter = normalizeTaskListFilter(options.statusFilter);

  if (!statusFilter || statusFilter === "all") {
    return;
  }

  if (statusFilter === "active") {
    conditions.push(activeTaskSql());
    return;
  }

  if (statusFilter === "history") {
    conditions.push("tasks.status IN ('complete', 'archived')");
    return;
  }

  conditions.push("tasks.status = :statusFilter");
  params.statusFilter = statusFilter;
}

/** @param {string[]} conditions @param {TaskRepositoryOptions} options @param {NamedParams} params */
function applyQuickFilter(conditions, options, params) {
  const quickFilter = normalizeTaskListFilter(options.quickFilter);

  if (!quickFilter || quickFilter === "all" || options.taskView) {
    return;
  }

  if (["my", "assigned_to_me", "assigned"].includes(quickFilter)) {
    conditions.push(assigneeExistsSql("currentUserId"));
    params.currentUserId = options.currentUserId || "";
    return;
  }

  if (quickFilter === "unassigned") {
    conditions.push(`NOT ${anyAssigneeExistsSql()}`);
    return;
  }

  if (["in_progress", "blocked"].includes(quickFilter)) {
    conditions.push("tasks.status = :quickStatus");
    params.quickStatus = quickFilter;
  }
}

/** @param {string[]} conditions @param {TaskRepositoryOptions} options @param {NamedParams} params */
function applyDueFilter(conditions, options, params) {
  const dueFilter = normalizeTaskListFilter(options.dueFilter);

  if (!dueFilter || dueFilter === "all") {
    return;
  }

  if (dueFilter === "overdue") {
    conditions.push(activeTaskSql());
    conditions.push("tasks.due_date IS NOT NULL");
    conditions.push(`(
    (tasks.due_time IS NOT NULL AND tasks.due_at_utc IS NOT NULL AND tasks.due_at_utc < :nowIso)
    OR ((tasks.due_time IS NULL OR tasks.due_at_utc IS NULL) AND tasks.due_date < :today)
  )`);
    params.nowIso = options.nowIso || new Date().toISOString();
    params.today = options.today || "";
    return;
  }

  if (dueFilter === "today") {
    conditions.push(activeTaskSql());
    conditions.push("tasks.due_date = :today");
    conditions.push(`NOT (
    tasks.due_time IS NOT NULL
    AND tasks.due_at_utc IS NOT NULL
    AND tasks.due_at_utc < :nowIso
  )`);
    params.nowIso = options.nowIso || new Date().toISOString();
    params.today = options.today || "";
    return;
  }

  if (dueFilter === "week") {
    conditions.push(activeTaskSql());
    conditions.push("tasks.due_date IS NOT NULL");
    conditions.push("tasks.due_date >= :today");
    conditions.push("tasks.due_date <= :dueSoonCutoff");
    conditions.push(`NOT (
    tasks.due_time IS NOT NULL
    AND tasks.due_at_utc IS NOT NULL
    AND tasks.due_at_utc < :nowIso
  )`);
    params.dueSoonCutoff = options.dueSoonCutoff || "";
    params.nowIso = options.nowIso || new Date().toISOString();
    params.today = options.today || "";
    return;
  }

  if (dueFilter === "next_due") {
    conditions.push(activeTaskSql());
    conditions.push("tasks.due_date IS NOT NULL");
  }
}

/** @param {string[]} conditions @param {TaskRepositoryOptions} options @param {NamedParams} params */
function applyContextFilters(conditions, options, params) {
  if (options.hasProjectFilter) {
    if (options.projectFilterMode === "blank") {
      conditions.push("(tasks.project_id IS NULL OR tasks.project_id = '')");
    } else if (options.projectFilterMode === "ids") {
      if (!Array.isArray(options.projectIds) || options.projectIds.length === 0) {
        conditions.push("1 = 0");
      } else {
        conditions.push("tasks.project_id IN (:projectIds)");
        params.projectIds = options.projectIds;
      }
    }
  }

  if (!options.hasClientFilter || options.omitClientFilterBecauseProjectSelected) {
    return;
  }

  if (options.clientFilterMode === "blank") {
    conditions.push("(tasks.client_id IS NULL OR tasks.client_id = '')");
    return;
  }

  if (options.clientFilterMode !== "ids") {
    return;
  }

  const scopedClientIds = Array.isArray(options.clientIds) ? options.clientIds : [];
  const scopedProjectIds = Array.isArray(options.clientProjectIds) ? options.clientProjectIds : [];

  if (scopedClientIds.length === 0 && scopedProjectIds.length === 0) {
    conditions.push("1 = 0");
    return;
  }

  if (scopedClientIds.length > 0 && scopedProjectIds.length > 0) {
    conditions.push("(tasks.client_id IN (:clientIds) OR tasks.project_id IN (:clientProjectIds))");
    params.clientIds = scopedClientIds;
    params.clientProjectIds = scopedProjectIds;
    return;
  }

  if (scopedClientIds.length > 0) {
    conditions.push("tasks.client_id IN (:clientIds)");
    params.clientIds = scopedClientIds;
  } else if (scopedProjectIds.length > 0) {
    conditions.push("tasks.project_id IN (:clientProjectIds)");
    params.clientProjectIds = scopedProjectIds;
  }
}

/** @param {string[]} conditions @param {TaskRepositoryOptions} options @param {NamedParams} params */
function applyAssigneeFilters(conditions, options, params) {
  const assigneeFilter = normalizeTaskListFilter(options.assigneeFilter);

  if (assigneeFilter === "me" || assigneeFilter === "assigned_to_me") {
    conditions.push(assigneeExistsSql("currentUserId"));
    params.currentUserId = options.currentUserId || "";
    return;
  }

  if (assigneeFilter === "unassigned") {
    conditions.push(`NOT ${anyAssigneeExistsSql()}`);
    return;
  }

  if (options.assigneeId) {
    conditions.push(assigneeExistsSql("assigneeId"));
    params.assigneeId = options.assigneeId;
  }
}

/** @param {unknown} sort */
function taskListOrderSql(sort) {
  const normalizedSort = normalizeTaskListSort(sort);
  const dueSort = "COALESCE(tasks.due_at_utc, COALESCE(tasks.due_date, '9999-12-31') || 'T' || COALESCE(tasks.due_time, '23:59') || ':00')";
  const stableTitle = "tasks.title ASC, tasks.created_at ASC, tasks.task_id ASC";
  const priorityRank = "CASE tasks.priority WHEN 'urgent' THEN 4 WHEN 'high' THEN 3 WHEN 'normal' THEN 2 WHEN 'low' THEN 1 ELSE 0 END";
  const statusRank = "CASE tasks.status WHEN 'blocked' THEN 1 WHEN 'in_progress' THEN 2 WHEN 'open' THEN 3 WHEN 'complete' THEN 4 WHEN 'archived' THEN 5 ELSE 99 END";

  if (normalizedSort === "priority") {
    return `ORDER BY ${priorityRank} DESC, ${dueSort} ASC, ${stableTitle}`;
  }

  if (normalizedSort === "status") {
    return `ORDER BY ${statusRank} ASC, ${dueSort} ASC, ${stableTitle}`;
  }

  if (normalizedSort === "last_worked") {
    return `ORDER BY COALESCE(tasks.last_worked_at, '') DESC, ${dueSort} ASC, ${stableTitle}`;
  }

  if (normalizedSort === "updated") {
    return `ORDER BY COALESCE(tasks.updated_at, '') DESC, ${dueSort} ASC, ${stableTitle}`;
  }

  if (normalizedSort === "context") {
    return `ORDER BY COALESCE(clients.name, '') ASC, COALESCE(projects.name, '') ASC, ${dueSort} ASC, ${stableTitle}`;
  }

  if (normalizedSort === "created") {
    return `ORDER BY COALESCE(tasks.created_at, '') DESC, ${stableTitle}`;
  }

  if (normalizedSort === "created_asc") {
    return `ORDER BY COALESCE(tasks.created_at, '') ASC, ${stableTitle}`;
  }

  return `ORDER BY ${dueSort} ASC, ${priorityRank} DESC, ${stableTitle}`;
}

function activeTaskSql() {
  return "tasks.status NOT IN ('complete', 'archived')";
}

/** @param {TaskRepositoryOptions} options */
function statusFilterOverridesActiveScope(options) {
  // An explicit terminal status (complete/archived/history) OR "all" widens past a saved view's
  // active-only scope. This is always a deliberate user choice: the active-scoped saved views
  // default their Status control to "active", so the uncluttered landing stays active-only and
  // only an explicit Status selection surfaces completed/archived work.
  return taskStatusFilterOverridesActiveScope(options.statusFilter);
}

/** @param {string} userParam */
function assigneeExistsSql(userParam) {
  return `EXISTS (
    SELECT 1
    FROM task_assignees
    WHERE task_assignees.workspace_id = tasks.workspace_id
      AND task_assignees.task_id = tasks.task_id
      AND task_assignees.user_id = :${userParam}
      AND task_assignees.removed_at IS NULL
  )`;
}

function anyAssigneeExistsSql() {
  return `EXISTS (
    SELECT 1
    FROM task_assignees
    WHERE task_assignees.workspace_id = tasks.workspace_id
      AND task_assignees.task_id = tasks.task_id
      AND task_assignees.removed_at IS NULL
  )`;
}

/** @param {unknown} value @param {number} fallback */
function normalizePositiveInteger(value, fallback) {
  const number = Number.parseInt(String(value ?? ""), 10);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

/** @param {TaskWriteParamsInput} input */
function taskWriteParams({ includeCreatedAt = false, now, task, taskId, workspaceId }) {
  /** @type {NamedParams} */
  /** @type {NamedParams} */
  const params = {
    archivedAt: nullableTextParam(task.archived_at),
    archivedByUserId: nullableTextParam(task.archived_by_user_id),
    billable: task.billable === "no" ? "no" : "yes",
    blockedReason: textParam(task.blocked_reason),
    clientId: nullableTextParam(task.client_id),
    completedAt: nullableTextParam(task.completed_at),
    completedByUserId: nullableTextParam(task.completed_by_user_id),
    description: textParam(task.description),
    dueAtUtc: nullableTextParam(task.due_at_utc),
    dueDate: nullableTextParam(task.due_date),
    dueTime: nullableTextParam(task.due_time),
    dueTimezone: nullableTextParam(task.due_timezone),
    estimateMinutes: nullableIntegerParam(task.estimate_minutes),
    lastWorkedAt: nullableTextParam(task.last_worked_at),
    nextAction: textParam(task.next_action),
    priority: textParam(task.priority),
    projectId: nullableTextParam(task.project_id),
    recurrenceInstanceDate: nullableTextParam(task.recurrence_instance_date),
    recurrenceTemplateId: nullableTextParam(task.recurrence_template_id),
    reminderOverrideEnabled: db.dialect.boolean.bind(Boolean(task.reminder_override_enabled)),
    resumeNote: textParam(task.resume_note),
    sourceId: nullableTextParam(task.source_id),
    sourceType: textParam(task.source_type || "manual"),
    status: textParam(task.status),
    taskId: textParam(taskId),
    title: textParam(task.title),
    updatedAt: now,
    updatedByUserId: nullableTextParam(task.updated_by_user_id),
    workspaceId: textParam(workspaceId),
  };

  if (includeCreatedAt) {
    params.createdAt = now;
    params.createdByUserId = nullableTextParam(task.created_by_user_id);
  }

  return params;
}

/** @param {unknown} value */
function textParam(value) {
  return String(value ?? "");
}

/** @param {unknown} value */
function nullableTextParam(value) {
  return value === null || value === undefined || String(value).trim() === ""
    ? null
    : String(value);
}

/** @param {unknown} value */
function nullableIntegerParam(value) {
  return value === null || value === undefined || value === ""
    ? null
    : Number(value);
}

/** @param {string} whereSql */
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

/** @param {TaskRecord[]} tasks @param {TaskAssigneeRow[]} assignees */
function attachAssignees(tasks, assignees) {
  /** @type {Map<string, TaskAssignee[]>} */
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

/** @param {TaskDatabaseRow} row @returns {TaskRecord} */
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
    estimate_minutes: row.estimate_minutes === null || row.estimate_minutes === undefined
      ? null
      : Number(row.estimate_minutes),
    billable: row.billable === "no" ? "no" : "yes",
    due_date: row.due_date || "",
    due_time: row.due_time || "",
    due_timezone: row.due_timezone || "",
    due_at_utc: row.due_at_utc || "",
    source_type: row.source_type || "manual",
    source_id: row.source_id || "",
    archived_at: row.archived_at || "",
    reminder_override_enabled: db.dialect.boolean.read(row.reminder_override_enabled) === true,
    recurrence_template_id: row.recurrence_template_id || "",
    recurrence_instance_date: row.recurrence_instance_date || "",
    completed_at: row.completed_at || "",
    created_by_user_id: row.created_by_user_id || "",
    updated_by_user_id: row.updated_by_user_id || "",
    completed_by_user_id: row.completed_by_user_id || "",
    archived_by_user_id: row.archived_by_user_id || "",
    last_worked_at: row.last_worked_at || row.updated_at || row.created_at || "",
    created_at: row.created_at || "",
    updated_at: row.updated_at || "",
  };
}

/** @param {TaskDatabaseRow} row */
function taskCalendarRowToAppValue(row) {
  return {
    task_id: row.task_id,
    workspace_id: row.workspace_id,
    client_id: row.client_id || "",
    client_name: row.client_name || "",
    project_id: row.project_id || "",
    project_name: row.project_name || "",
    project_client_id: row.project_client_id || "",
    title: row.title,
    status: row.status || "open",
    priority: row.priority || "normal",
    due_date: row.due_date || "",
    due_time: row.due_time || "",
    due_timezone: row.due_timezone || "",
    due_at_utc: row.due_at_utc || "",
    reminder_override_enabled: db.dialect.boolean.read(row.reminder_override_enabled) === true,
    recurrence_template_id: row.recurrence_template_id || "",
    recurrence_instance_date: row.recurrence_instance_date || "",
    updated_at: row.updated_at || "",
  };
}

/** @param {TaskDashboardCountRow} row */
function dashboardCountGroupRowToAppValue(row) {
  return {
    workspace_id: row.workspace_id,
    client_id: row.client_id || "",
    project_id: row.project_id || "",
    active: Number(row.active_count) || 0,
    assignedToMe: Number(row.assigned_to_me_count) || 0,
    activeTimers: Number(row.active_timer_count) || 0,
    blocked: Number(row.blocked_count) || 0,
    overdue: Number(row.overdue_count) || 0,
    dueSoon: Number(row.due_soon_count) || 0,
    completed: Number(row.completed_count) || 0,
    archived: Number(row.archived_count) || 0,
  };
}

/** @param {TaskAssigneeRow} row */
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
  createRecurrenceInstance,
  queryList,
  readAll,
  readById,
  readByIds,
  readStatusByIds,
  readByRecurrenceInstance,
  readRecurrenceInstancesBefore,
  readFutureRecurrenceInstances,
  readDueBetween,
  readCalendarFeedCandidates,
  readCalendarFeedSuppressedInstances,
  readDashboardCandidates,
  readDashboardCountGroups,
  readRecurrenceInstanceStats,
  readRecurrenceInstancesBetween,
  readReminderSchedulingCandidates,
  recoverRecurrenceToCurrent,
  markWorkedAt,
  update,
  updateProjectCascade,
};
