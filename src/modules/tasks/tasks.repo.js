import { randomUUID } from "node:crypto";
import { db } from "../../core/database.js";

async function queryList(workspaceId, options = {}) {
  const normalizedLimit = normalizePositiveInteger(options.limit, 0);
  const normalizedOffset = normalizePositiveInteger(options.offset, 0);
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

  const rows = await db.query(taskSelectSql(`
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

async function readAll(workspaceId) {
  const [tasks, assignees] = await Promise.all([
    db.query(taskSelectSql(`
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

async function readStatusByIds(workspaceId, taskIds = []) {
  const ids = [...new Set((Array.isArray(taskIds) ? taskIds : [])
    .map((taskId) => String(taskId || "").trim())
    .filter(Boolean))];

  if (ids.length === 0) {
    return [];
  }

  return db.query(`
SELECT task_id, workspace_id, client_id, project_id, status
FROM tasks
WHERE tasks.workspace_id = :workspaceId
  AND tasks.task_id IN (:taskIds);
`, {
    taskIds: ids,
    workspaceId,
  });
}

async function readByIds(workspaceId, taskIds = []) {
  const ids = [...new Set((Array.isArray(taskIds) ? taskIds : [])
    .map((taskId) => String(taskId || "").trim())
    .filter(Boolean))];

  if (ids.length === 0) {
    return [];
  }

  const rows = await db.query(taskSelectSql(`
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

async function create(workspaceId, task) {
  const now = new Date().toISOString();
  const taskId = task.task_id || randomUUID();

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
  return readById(workspaceId, taskId);
}

async function update(workspaceId, task) {
  const now = new Date().toISOString();

  await db.run(taskUpdateSql(), taskWriteParams({ now, task, taskId: task.task_id, workspaceId }));

  if (Array.isArray(task.assignee_ids)) {
    await replaceAssignees(workspaceId, task.task_id, task.assignee_ids, task.updated_by_user_id);
  }

  return readById(workspaceId, task.task_id);
}

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

async function replaceAssignees(workspaceId, taskId, assigneeIds, assignedByUserId) {
  const now = new Date().toISOString();
  const uniqueAssigneeIds = [...new Set((assigneeIds || []).map((id) => String(id || "").trim()).filter(Boolean))];

  await db.transaction(async (transaction) => {
    await replaceAssigneesWithExecutor(transaction, workspaceId, taskId, uniqueAssigneeIds, assignedByUserId, now);
  });
}

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
        assignedByUserId,
        taskAssigneeId: randomUUID(),
        taskId,
        userId,
        workspaceId,
      });
  }
}

async function readAssigneesForWorkspace(workspaceId) {
  return db.query(assigneeSelectSql(`
WHERE task_assignees.workspace_id = :workspaceId
  AND task_assignees.removed_at IS NULL
ORDER BY users.username;
`), { workspaceId });
}

async function readAssigneesForTasks(workspaceId, taskIds) {
  const uniqueTaskIds = [...new Set((taskIds || []).map((taskId) => String(taskId || "").trim()).filter(Boolean))];

  if (uniqueTaskIds.length === 0) {
    return [];
  }

  return db.query(assigneeSelectSql(`
WHERE task_assignees.workspace_id = :workspaceId
  AND task_assignees.task_id IN (:taskIds)
  AND task_assignees.removed_at IS NULL
ORDER BY users.username;
`), {
    taskIds: uniqueTaskIds,
    workspaceId,
  });
}

async function readByRecurrenceInstance(workspaceId, templateId, instanceDate) {
  const rows = await db.query(taskSelectSql(`
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

async function readFutureRecurrenceInstances(workspaceId, templateId, afterInstanceDate) {
  const rows = await db.query(taskSelectSql(`
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

async function readDueBetween(workspaceId, startDate, endDate, options = {}) {
  const statuses = Array.isArray(options.statuses) && options.statuses.length
    ? options.statuses
    : ["open", "in_progress", "blocked"];
  const statusParams = Object.fromEntries(
    Array.from({ length: 5 }, (_, index) => [`calendarStatus${index}`, statuses[index] || null]),
  );
  const [tasks, assignees] = await Promise.all([
    db.query(taskSelectSql(`
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
    }),
    readAssigneesForWorkspace(workspaceId),
  ]);

  return attachAssignees(tasks.map(taskRowToAppValue), assignees);
}

async function readReminderSchedulingCandidates(workspaceId, options = {}) {
  const normalizedLimit = normalizePositiveInteger(options.limit, 500);
  const normalizedOffset = normalizePositiveInteger(options.offset, 0);
  const rows = await db.query(taskSelectSql(`
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

function applyNextActionFilter(conditions, options) {
  if (options.requireNextAction === true) {
    conditions.push("TRIM(COALESCE(tasks.next_action, '')) <> ''");
  }
}

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

function applyTaskViewFilter(conditions, options, params) {
  const taskView = normalizedFilter(options.taskView);
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

function applyStatusFilter(conditions, options, params) {
  const statusFilter = normalizedFilter(options.statusFilter);

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

function applyQuickFilter(conditions, options, params) {
  const quickFilter = normalizedFilter(options.quickFilter);

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

function applyDueFilter(conditions, options, params) {
  const dueFilter = normalizedFilter(options.dueFilter);

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

function applyAssigneeFilters(conditions, options, params) {
  const assigneeFilter = normalizedFilter(options.assigneeFilter);

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

function taskListOrderSql(sort) {
  const dueSort = "COALESCE(tasks.due_at_utc, COALESCE(tasks.due_date, '9999-12-31') || 'T' || COALESCE(tasks.due_time, '23:59') || ':00')";
  const stableTitle = "tasks.title ASC, tasks.created_at ASC, tasks.task_id ASC";
  const priorityRank = "CASE tasks.priority WHEN 'urgent' THEN 4 WHEN 'high' THEN 3 WHEN 'normal' THEN 2 WHEN 'low' THEN 1 ELSE 0 END";
  const statusRank = "CASE tasks.status WHEN 'blocked' THEN 1 WHEN 'in_progress' THEN 2 WHEN 'open' THEN 3 WHEN 'complete' THEN 4 WHEN 'archived' THEN 5 ELSE 99 END";

  if (sort === "priority") {
    return `ORDER BY ${priorityRank} DESC, ${dueSort} ASC, ${stableTitle}`;
  }

  if (sort === "status") {
    return `ORDER BY ${statusRank} ASC, ${dueSort} ASC, ${stableTitle}`;
  }

  if (sort === "last_worked") {
    return `ORDER BY COALESCE(tasks.last_worked_at, '') DESC, ${dueSort} ASC, ${stableTitle}`;
  }

  if (sort === "updated") {
    return `ORDER BY COALESCE(tasks.updated_at, '') DESC, ${dueSort} ASC, ${stableTitle}`;
  }

  if (sort === "context") {
    return `ORDER BY COALESCE(clients.name, '') ASC, COALESCE(projects.name, '') ASC, ${dueSort} ASC, ${stableTitle}`;
  }

  if (sort === "created") {
    return `ORDER BY COALESCE(tasks.created_at, '') DESC, ${stableTitle}`;
  }

  if (sort === "created_asc") {
    return `ORDER BY COALESCE(tasks.created_at, '') ASC, ${stableTitle}`;
  }

  return `ORDER BY ${dueSort} ASC, ${priorityRank} DESC, ${stableTitle}`;
}

function activeTaskSql() {
  return "tasks.status NOT IN ('complete', 'archived')";
}

function statusFilterOverridesActiveScope(options) {
  // An explicit terminal status (complete/archived/history) OR "all" widens past a saved view's
  // active-only scope. This is always a deliberate user choice: the active-scoped saved views
  // default their Status control to "active", so the uncluttered landing stays active-only and
  // only an explicit Status selection surfaces completed/archived work.
  const status = normalizedFilter(options.statusFilter);
  return status === "complete" || status === "archived" || status === "history" || status === "all";
}

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

function normalizePositiveInteger(value, fallback) {
  const number = Number.parseInt(value, 10);
  return Number.isInteger(number) && number > 0 ? number : fallback;
}

function normalizedFilter(value) {
  return String(value || "").trim().toLowerCase();
}

function taskWriteParams({ includeCreatedAt = false, now, task, taskId, workspaceId }) {
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

function textParam(value) {
  return String(value ?? "");
}

function nullableTextParam(value) {
  return value === null || value === undefined || String(value).trim() === ""
    ? null
    : String(value);
}

function nullableIntegerParam(value) {
  return value === null || value === undefined || value === ""
    ? null
    : Number(value);
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
  queryList,
  readAll,
  readById,
  readByIds,
  readStatusByIds,
  readByRecurrenceInstance,
  readFutureRecurrenceInstances,
  readDueBetween,
  readRecurrenceInstanceStats,
  readReminderSchedulingCandidates,
  markWorkedAt,
  update,
  updateProjectCascade,
};
