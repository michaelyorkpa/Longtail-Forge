import { randomUUID } from "node:crypto";
import { tasksRepository } from "./tasks.repo.js";
import { taskChecklistsRepository } from "./task-checklists.repo.js";
import { taskRecurrenceService } from "./task-recurrence.service.js";
import { taskRelationshipsRepository } from "./task-relationships.repo.js";
import { taskRemindersService } from "./task-reminders.service.js";
import { taskTimersService } from "./task-timers.service.js";
import { clientsService } from "../client-projects/clients.service.js";
import { clientsRepository } from "../client-projects/clients.repo.js";
import { projectsRepository } from "../client-projects/projects.repo.js";
import { settingsRepository } from "../../repositories/settings.repo.js";
import { permissionsRepository } from "../../repositories/permissions.repo.js";
import { modulesService } from "../../core/modules/modules.service.js";
import { usersRepository } from "../../repositories/users.repo.js";
import { assertModuleWriteEnabled } from "../../core/modules/module-access.js";
import { auditService } from "../../core/audit.js";
import { tagsService } from "../../services/tags.service.js";
import { searchIndexSyncService } from "../../services/search-index-sync.service.js";
import { AppError } from "../../core/errors.js";
import { permissionsService } from "../../core/permissions.js";
import { normalizeUtcIso } from "../../utils/timezones.js";

const TASKS_MODULE_ID = "tasks";
const STATUSES = new Set(["open", "in_progress", "blocked", "complete", "archived"]);
const PRIORITIES = new Set(["low", "normal", "high", "urgent"]);
const TASK_VIEW_FILTERS = new Set(["my", "all", "unassigned", "overdue", "today", "week", "completed", "archived"]);
const TASK_LIST_DEFAULT_PAGE_SIZE = 100;
const TASK_LIST_MAX_PAGE_SIZE = 200;
const TASK_LIST_BATCH_MULTIPLIER = 5;
const TASK_LIST_MAX_CANDIDATE_SCAN = 1000;
const TASK_OPTION_MAX_ITEMS = 200;

async function list(session, query = {}) {
  const { options, pagination, tasks } = await queryTasks(session, query, { paginate: true });

  return {
    tasks,
    currentUserId: session.user_id,
    options,
    pagination,
  };
}

async function listAll(session, query = {}) {
  const { options, tasks } = await queryTasks(session, query);

  return {
    tasks,
    currentUserId: session.user_id,
    options,
  };
}

async function queryTasks(session, query = {}, options = {}) {
  const timers = await taskTimersService.list(session);
  const timerByTaskId = new Map((timers.timers || []).map((timer) => [timer.task_id, timer]));
  const pagination = normalizeTaskPagination(query, options);
  const repositoryQuery = taskListRepositoryQuery(session, query);
  const tasks = [];
  let offset = pagination?.offset || 0;
  let hasMoreCandidates = false;
  let nextCursor = "";
  let scannedCandidates = 0;

  do {
    const batchLimit = pagination
      ? Math.min(
          TASK_LIST_MAX_CANDIDATE_SCAN - scannedCandidates,
          Math.max(pagination.pageSize * TASK_LIST_BATCH_MULTIPLIER, pagination.pageSize + 1),
        )
      : 0;
    const result = await tasksRepository.queryList(session.workspace_id, {
      ...repositoryQuery,
      limit: batchLimit,
      offset,
    });
    const candidates = result.tasks || [];

    if (candidates.length === 0) {
      hasMoreCandidates = false;
      break;
    }

    const filteredTasks = await filterAndShapeTaskListCandidates({
      candidates,
      offset,
      query,
      session,
      timerByTaskId,
    });

    for (const task of filteredTasks) {
      const rawCandidateOffset = Number(task.__candidateOffset);
      const candidateOffset = Number.isInteger(rawCandidateOffset) && rawCandidateOffset >= 0
        ? rawCandidateOffset
        : offset;
      tasks.push(stripTaskListCandidateMetadata(task));

      if (pagination && tasks.length >= pagination.pageSize) {
        const moreCandidatesInBatch = candidateOffset < offset + candidates.length - 1;
        hasMoreCandidates = moreCandidatesInBatch || Boolean(result.hasMore);
        nextCursor = hasMoreCandidates ? encodeTaskCursor(candidateOffset + 1) : "";
        return queryTasksResult({
          pagination,
          query,
          session,
          tasks,
          timers: timers.timers || [],
          nextCursor,
        });
      }
    }

    scannedCandidates += candidates.length;
    offset = result.nextOffset;
    hasMoreCandidates = Boolean(result.hasMore) && (!pagination || scannedCandidates < TASK_LIST_MAX_CANDIDATE_SCAN);
  } while (pagination && hasMoreCandidates && tasks.length < pagination.pageSize);

  nextCursor = pagination && hasMoreCandidates ? encodeTaskCursor(offset) : "";
  return queryTasksResult({
    pagination,
    query,
    session,
    tasks,
    timers: timers.timers || [],
    nextCursor,
  });
}

async function filterAndShapeTaskListCandidates({ candidates, offset, query, session, timerByTaskId }) {
  const readableTasks = [];

  for (let index = 0; index < candidates.length; index += 1) {
    const task = {
      ...candidates[index],
      __candidateOffset: offset + index,
    };

    if (await canReadTask(session, task)) {
      readableTasks.push(task);
    }
  }

  const taggedTasks = await tagsService.decorateRecordsForTarget(
    session,
    "task",
    await tagsService.filterRecordsByTags(session, "task", readableTasks, query.tagIds || query.tag_ids || query.tags),
  );
  const tasksWithDetails = await attachTaskListProjectionDetails(taggedTasks);

  return tasksWithDetails.filter((task) => taskMatchesCanonicalQuery(task, query, session, timerByTaskId));
}

async function queryTasksResult({ pagination, query, session, tasks, timers, nextCursor = "" }) {
  return {
    tasks: sortCanonicalTasks(tasks, query),
    currentUserId: session.user_id,
    options: await readOptions(session),
    pagination: pagination ? {
      hasMore: Boolean(nextCursor),
      limit: pagination.pageSize,
      nextCursor,
      pageSize: pagination.pageSize,
    } : null,
    timers,
  };
}

function taskListRepositoryQuery(session, query = {}) {
  const now = new Date();
  const today = localDateKey(now, session.timezone);
  const taskView = normalizedTaskView(query.taskView || query.task_view || query.view);
  const quickFilter = normalizedTaskFilter(query.quickFilter || query.quick_filter || (!taskView ? query.assigneeFilter || query.assignee_filter : ""));

  return {
    assigneeFilter: normalizedTaskFilter(query.assignee || query.assignee_scope || query.assignee_filter_value),
    assigneeId: String(query.assigneeId || query.assignee_id || "").trim(),
    clientId: String(query.clientId || query.client_id || "").trim(),
    currentUserId: session.user_id,
    currentWeekEnd: currentWeekEndKey(today),
    dueFilter: normalizedTaskFilter(query.due || query.due_filter) || quickDueFilter(quickFilter),
    dueSoonCutoff: addDaysKey(today, 7),
    hasClientFilter: hasQueryFilter(query, ["clientId", "client_id"]),
    hasProjectFilter: hasQueryFilter(query, ["projectId", "project_id"]),
    nowIso: now.toISOString(),
    projectId: String(query.projectId || query.project_id || "").trim(),
    quickFilter,
    sort: normalizedTaskSort(query.sort || query.sort_by || query.order),
    statusFilter: normalizedTaskFilter(query.status || query.status_filter || query.filter),
    taskView,
    today,
  };
}

function normalizeTaskPagination(query = {}, options = {}) {
  if (!options.paginate) {
    return null;
  }

  const requestedPageSize = Number.parseInt(query.limit || query.page_size || query.pageSize || "", 10);
  const pageSize = Math.min(
    TASK_LIST_MAX_PAGE_SIZE,
    Math.max(1, Number.isInteger(requestedPageSize) && requestedPageSize > 0
      ? requestedPageSize
      : TASK_LIST_DEFAULT_PAGE_SIZE),
  );
  const cursorOffset = query.cursor ? decodeTaskCursor(query.cursor) : 0;
  const offset = cursorOffset || normalizeOffset(query.offset);

  return {
    offset,
    pageSize,
  };
}

function normalizeOffset(value) {
  const offset = Number.parseInt(value || "", 10);
  return Number.isInteger(offset) && offset > 0 ? offset : 0;
}

function encodeTaskCursor(offset) {
  return Buffer.from(JSON.stringify({ offset: Math.max(0, Number(offset) || 0) })).toString("base64url");
}

function decodeTaskCursor(cursor) {
  try {
    const parsed = JSON.parse(Buffer.from(String(cursor || ""), "base64url").toString("utf8"));
    const offset = Number.parseInt(parsed?.offset, 10);

    if (Number.isInteger(offset) && offset >= 0) {
      return offset;
    }
  } catch {
    // Fall through to the canonical 400 below.
  }

  throw new AppError("Task list cursor is invalid.", 400);
}

function stripTaskListCandidateMetadata(task) {
  const { __candidateOffset, ...publicTask } = task;
  return publicTask;
}

async function summary(session) {
  const { tasks } = await queryTasks(session);
  const now = new Date();
  const today = localDateKey(now, session.timezone);
  const dueSoonCutoff = addDaysKey(today, 7);
  const activeTasks = tasks.filter(isActiveTask);
  const assignedToMe = activeTasks.filter((task) => (task.assignee_ids || []).includes(session.user_id));
  const overdue = activeTasks.filter((task) => isTaskOverdue(task, now, today));
  const dueSoon = activeTasks.filter((task) =>
    isTaskDueSoon(task, now, today, dueSoonCutoff),
  );

  return {
    counts: {
      active: activeTasks.length,
      assignedToMe: assignedToMe.length,
      overdue: overdue.length,
      dueSoon: dueSoon.length,
      completed: tasks.filter((task) => task.status === "complete").length,
      archived: tasks.filter((task) => task.status === "archived").length,
    },
    overdue: sortTaskSummaryRows(overdue).slice(0, 5).map((task) => taskSummaryRow(task, session.user_id)),
    dueSoon: sortTaskSummaryRows(dueSoon).slice(0, 5).map((task) => taskSummaryRow(task, session.user_id)),
    assignedToMe: sortTaskSummaryRows(assignedToMe).slice(0, 5).map((task) => taskSummaryRow(task, session.user_id)),
  };
}

async function listWorkItems(session, query = {}) {
  const result = await queryTasks(session, {
    status: "active",
    sort: "due_at",
    ...query,
  });
  const timerByTaskId = new Map((result.timers || []).map((timer) => [timer.task_id, timer]));

  return {
    source_module_id: TASKS_MODULE_ID,
    source_type: "task",
    items: result.tasks.map((task) => taskWorkItemSummary(task, {
      currentUserId: session.user_id,
      timer: timerByTaskId.get(task.task_id),
    })),
    options: result.options,
  };
}

async function calendarWindow(session, query = {}) {
  const today = localDateKey(new Date(), session.timezone);
  const startDate = normalizeDueDate(query.start || query.startDate || query.start_date) || today;
  const endDate = normalizeDueDate(query.end || query.endDate || query.end_date) || addDaysKey(startDate, 30);

  if (endDate < startDate) {
    throw new AppError("Calendar end date must be on or after the start date.", 400);
  }

  const tasks = await tasksRepository.readDueBetween(session.workspace_id, startDate, endDate);
  const readableTasks = [];

  for (const task of tasks) {
    if (await canReadTask(session, task)) {
      readableTasks.push(task);
    }
  }

  return {
    range: {
      startDate,
      endDate,
    },
    tasks: readableTasks.map(taskCalendarRow),
  };
}

async function read(taskId, session) {
  const task = await readTaskOrThrow(session.workspace_id, taskId);
  await assertCanReadTask(session, task);

  return {
    task: await attachTaskDetails((await tagsService.decorateRecordsForTarget(session, "task", [task]))[0]),
    currentUserId: session.user_id,
    options: await readOptions(session),
  };
}

async function create(payload, session) {
  await assertModuleWriteEnabled(session, TASKS_MODULE_ID);
  const projectId = payload?.project_id || payload?.projectId;
  const taskDefaults = await readProjectTaskDefaults(session, projectId);
  const defaultAssigneeIds = await resolveCreateDefaultAssigneeIds({
    payload,
    projectId,
    session,
    taskDefaults,
  });
  const normalizedTask = await normalizeTaskPayload({
    payload,
    session,
    fallback: {
      task_id: payload?.task_id || payload?.id || randomUUID(),
      status: taskDefaults.status,
      priority: taskDefaults.priority,
      created_by_user_id: session.user_id,
      updated_by_user_id: session.user_id,
      assignee_ids: defaultAssigneeIds,
    },
  });
  normalizedTask.last_worked_at = new Date().toISOString();

  await permissionsService.assertCan(session, "tasks.create", taskResource(normalizedTask));
  await assertAssigneesEligible(session, normalizedTask);

  const recurrence = readRecurrencePayload(payload);
  if (recurrence.enabled) {
    const template = await taskRecurrenceService.createTemplateFromTask({
      session,
      task: normalizedTask,
      recurrence,
    });
    normalizedTask.recurrence_template_id = template.recurrence_template_id;
    normalizedTask.recurrence_instance_date = normalizedTask.due_date;
  }

  const task = await tasksRepository.create(session.workspace_id, normalizedTask);
  await saveTaskReminderOverride(session.workspace_id, task.task_id, payload);
  await saveTargetTags(session, "task", task.task_id, payload);
  if (task.project_id) {
    await requestTagPropagationRefresh(session, "task", task.task_id, "task.created_with_project");
  }
  const taskWithDetails = await readTaggedTaskWithDetails(session, task.task_id);
  await recordTaskAudit({
    session,
    action: "task_created",
    changeType: "create",
    previousValue: null,
    newValue: taskWithDetails,
  });
  await emitTaskEvent("task.created", {
    session,
    previousValue: null,
    newValue: taskWithDetails,
  });
  await syncTaskSearchIndex(session.workspace_id, taskWithDetails.task_id, "task.created");

  if (recurrence.enabled) {
    await recordRecurrenceAudit({
      session,
      action: "task_recurrence_template_created",
      changeType: "create",
      previousValue: null,
      newValue: taskWithDetails,
    });
  }

  return { task: taskWithDetails };
}

async function update(taskId, payload, session) {
  await assertModuleWriteEnabled(session, TASKS_MODULE_ID);
  const previousTask = await readTaskOrThrow(session.workspace_id, taskId);
  await assertCanEditTask(session, previousTask);
  const previousProjectId = previousTask.project_id || "";

  const normalizedTask = await normalizeTaskPayload({
    payload,
    session,
    fallback: {
      ...previousTask,
      task_id: previousTask.task_id,
      updated_by_user_id: session.user_id,
    },
  });
  normalizedTask.last_worked_at = new Date().toISOString();

  if (
    previousTask.client_id !== normalizedTask.client_id ||
    previousTask.project_id !== normalizedTask.project_id
  ) {
    await assertCanEditTask(session, normalizedTask);
  }

  await assertStatusTransitionAllowed(session, previousTask, normalizedTask);
  await assertBlockingChildrenAllowStatus(session, normalizedTask);
  await assertAssigneesEligible(session, normalizedTask);

  if (assigneesChanged(previousTask, normalizedTask)) {
    await permissionsService.assertCan(session, "tasks.assign", taskResource(normalizedTask));
  }

  const recurrence = readRecurrencePayload(payload);
  if (previousTask.recurrence_template_id && recurrence.hasPayload && recurrence.applyTo === "future") {
    await taskRecurrenceService.updateTemplateFromTask({
      session,
      task: {
        ...normalizedTask,
        recurrence_template_id: previousTask.recurrence_template_id,
      },
      recurrence,
    });
    await recordRecurrenceAudit({
      session,
      action: "task_recurrence_template_updated",
      changeType: "update",
      previousValue: previousTask,
      newValue: normalizedTask,
    });
  } else if (!previousTask.recurrence_template_id && recurrence.enabled) {
    const template = await taskRecurrenceService.createTemplateFromTask({
      session,
      task: normalizedTask,
      recurrence,
    });
    normalizedTask.recurrence_template_id = template.recurrence_template_id;
    normalizedTask.recurrence_instance_date = normalizedTask.due_date;
    await recordRecurrenceAudit({
      session,
      action: "task_recurrence_template_created",
      changeType: "create",
      previousValue: null,
      newValue: normalizedTask,
    });
  } else if (previousTask.recurrence_template_id && recurrence.hasPayload && !recurrence.enabled && recurrence.applyTo !== "future") {
    normalizedTask.recurrence_template_id = "";
    normalizedTask.recurrence_instance_date = "";
  }

  const task = await tasksRepository.update(session.workspace_id, normalizedTask);
  await saveTaskReminderOverride(session.workspace_id, task.task_id, payload);
  await saveTargetTags(session, "task", task.task_id, payload);
  if (previousProjectId !== (task.project_id || "")) {
    await requestTagPropagationRefresh(session, "task", task.task_id, "task.project_changed");
  }
  const taskWithDetails = await readTaggedTaskWithDetails(session, task.task_id);
  await recordTaskAudit({
    session,
    action: "task_updated",
    changeType: "update",
    previousValue: previousTask,
    newValue: taskWithDetails,
  });
  await emitTaskEvent("task.updated", {
    session,
    previousValue: previousTask,
    newValue: taskWithDetails,
  });
  await syncTaskSearchIndex(session.workspace_id, taskWithDetails.task_id, "task.updated");
  if (previousTask.status !== taskWithDetails.status) {
    if (isIncompleteBlockingChild(taskWithDetails)) {
      await blockParentsForIncompleteChild(session, taskWithDetails);
    } else {
      await recoverParentsAfterChildStatusChange(session, taskWithDetails);
    }
  }
  if (assigneesChanged(previousTask, taskWithDetails)) {
    await emitTaskEvent("task.assigned", {
      session,
      previousValue: previousTask,
      newValue: taskWithDetails,
    });
  }

  return { task: taskWithDetails };
}

async function complete(taskId, session) {
  await assertModuleWriteEnabled(session, TASKS_MODULE_ID);
  const previousTask = await readTaskOrThrow(session.workspace_id, taskId);
  await assertCanCompleteTask(session, previousTask);
  if (await taskTimersService.hasActiveTaskTimers(session.workspace_id, previousTask.task_id)) {
    throw new AppError("Tasks cannot be completed while they have active task timers.", 400);
  }
  const completedAt = new Date().toISOString();
  const task = await attachTaskDetails(await tasksRepository.update(session.workspace_id, {
    ...previousTask,
    status: "complete",
    completed_at: completedAt,
    completed_by_user_id: session.user_id,
    last_worked_at: completedAt,
    updated_by_user_id: session.user_id,
    assignee_ids: previousTask.assignee_ids,
  }));

  await recordTaskAudit({
    session,
    action: "task_completed",
    changeType: "update",
    previousValue: previousTask,
    newValue: task,
  });
  await emitTaskEvent("task.completed", {
    session,
    previousValue: previousTask,
    newValue: task,
  });
  await syncTaskSearchIndex(session.workspace_id, task.task_id, "task.completed");
  await recoverParentsAfterChildStatusChange(session, task);

  const recurrenceResult = await taskRecurrenceService.createNextInstance({
    session,
    completedTask: task,
    createTask: {
      findExisting: async (templateId, instanceDate) =>
        attachTaskDetails(await tasksRepository.readByRecurrenceInstance(session.workspace_id, templateId, instanceDate)),
      create: async (nextTask) => {
        const created = await tasksRepository.create(session.workspace_id, {
          ...nextTask,
          created_by_user_id: previousTask.created_by_user_id || session.user_id,
          updated_by_user_id: session.user_id,
          completed_at: "",
          completed_by_user_id: "",
          archived_at: "",
          archived_by_user_id: "",
        });
        return attachTaskDetails(created);
      },
    },
  });
  const createdTask = recurrenceResult?.task || null;

  if (createdTask && recurrenceResult.wasCreated) {
    await recordTaskAudit({
      session,
      action: "task_recurrence_instance_created",
      changeType: "create",
      previousValue: null,
      newValue: createdTask,
    });
    await emitTaskEvent("task.created", {
      session,
      previousValue: null,
      newValue: createdTask,
      metadata: {
        recurrence_template_id: createdTask.recurrence_template_id || "",
        source_task_id: task.task_id,
      },
    });
    await syncTaskSearchIndex(session.workspace_id, createdTask.task_id, "task.recurrence_instance_created");
  }

  return { task, createdTask };
}

async function reopen(taskId, session) {
  await assertModuleWriteEnabled(session, TASKS_MODULE_ID);
  const previousTask = await readTaskOrThrow(session.workspace_id, taskId);
  await assertCanCompleteTask(session, previousTask);
  const task = await attachTaskDetails(await tasksRepository.update(session.workspace_id, {
    ...previousTask,
    status: "open",
    completed_at: "",
    completed_by_user_id: "",
    last_worked_at: new Date().toISOString(),
    updated_by_user_id: session.user_id,
    assignee_ids: previousTask.assignee_ids,
  }));

  await recordTaskAudit({
    session,
    action: "task_reopened",
    changeType: "restore",
    previousValue: previousTask,
    newValue: task,
  });
  await emitTaskEvent("task.updated", {
    session,
    previousValue: previousTask,
    newValue: task,
    metadata: {
      transition: "reopened",
    },
  });
  await syncTaskSearchIndex(session.workspace_id, task.task_id, "task.reopened");
  await blockParentsForIncompleteChild(session, task);

  return { task };
}

async function archive(taskId, session) {
  await assertModuleWriteEnabled(session, TASKS_MODULE_ID);
  const previousTask = await readTaskOrThrow(session.workspace_id, taskId);

  await permissionsService.assertCan(session, "tasks.archive", taskResource(previousTask));
  const archivedAt = new Date().toISOString();
  const task = await attachTaskDetails(await tasksRepository.update(session.workspace_id, {
    ...previousTask,
    status: "archived",
    archived_at: archivedAt,
    archived_by_user_id: session.user_id,
    last_worked_at: archivedAt,
    updated_by_user_id: session.user_id,
    assignee_ids: previousTask.assignee_ids,
  }));

  await recordTaskAudit({
    session,
    action: "task_archived",
    changeType: "archive",
    previousValue: previousTask,
    newValue: task,
  });
  await emitTaskEvent("task.archived", {
    session,
    previousValue: previousTask,
    newValue: task,
  });
  await syncTaskSearchIndex(session.workspace_id, task.task_id, "task.archived");

  return { task };
}

async function restore(taskId, session) {
  await assertModuleWriteEnabled(session, TASKS_MODULE_ID);
  const previousTask = await readTaskOrThrow(session.workspace_id, taskId);

  await permissionsService.assertCan(session, "tasks.restore", taskResource(previousTask));
  const task = await attachTaskDetails(await tasksRepository.update(session.workspace_id, {
    ...previousTask,
    status: previousTask.completed_at ? "complete" : "open",
    archived_at: "",
    archived_by_user_id: "",
    last_worked_at: new Date().toISOString(),
    updated_by_user_id: session.user_id,
    assignee_ids: previousTask.assignee_ids,
  }));

  await recordTaskAudit({
    session,
    action: "task_restored",
    changeType: "restore",
    previousValue: previousTask,
    newValue: task,
  });
  await emitTaskEvent("task.restored", {
    session,
    previousValue: previousTask,
    newValue: task,
  });
  await syncTaskSearchIndex(session.workspace_id, task.task_id, "task.restored");
  if (task.status === "complete") {
    await recoverParentsAfterChildStatusChange(session, task);
  } else {
    await blockParentsForIncompleteChild(session, task);
  }

  return { task };
}

async function listRelationships(taskId, session) {
  const task = await readTaskOrThrow(session.workspace_id, taskId);
  await assertCanReadTask(session, task);

  return {
    relationships: await readableRelationshipsForTask(session, task.task_id),
    relationshipSummary: await taskRelationshipsRepository.relationshipSummary(session.workspace_id, task.task_id),
  };
}

async function addChildTask(parentTaskId, payload, session) {
  await assertModuleWriteEnabled(session, TASKS_MODULE_ID);
  const parentTask = await readTaskOrThrow(session.workspace_id, parentTaskId);
  const childTask = await readTaskOrThrow(session.workspace_id, payload?.child_task_id || payload?.childTaskId);
  await assertCanEditTask(session, parentTask);
  await assertCanReadTask(session, childTask);
  await assertCanRelateTasks(session, parentTask, childTask);

  const existing = await taskRelationshipsRepository.readActivePair(session.workspace_id, parentTask.task_id, childTask.task_id);
  const relationship = existing
    ? await taskRelationshipsRepository.update(session.workspace_id, {
      ...existing,
      is_blocking: Boolean(payload?.is_blocking ?? payload?.blocking),
      updated_by_user_id: session.user_id,
    })
    : await taskRelationshipsRepository.create(session.workspace_id, {
      parent_task_id: parentTask.task_id,
      child_task_id: childTask.task_id,
      is_blocking: Boolean(payload?.is_blocking ?? payload?.blocking),
      created_by_user_id: session.user_id,
      updated_by_user_id: session.user_id,
    });

  if (relationship.is_blocking && isIncompleteBlockingChild(childTask)) {
    await blockParentForChild(session, parentTask, childTask);
  }

  await syncTaskSearchIndex(session.workspace_id, parentTask.task_id, "task.relationship_added");
  await syncTaskSearchIndex(session.workspace_id, childTask.task_id, "task.relationship_added");
  await emitTaskRelationshipEvent("task.relationship.created", { session, relationship, parentTask, childTask });

  return listRelationships(parentTask.task_id, session);
}

async function updateChildTaskRelationship(parentTaskId, childTaskId, payload, session) {
  await assertModuleWriteEnabled(session, TASKS_MODULE_ID);
  const parentTask = await readTaskOrThrow(session.workspace_id, parentTaskId);
  const childTask = await readTaskOrThrow(session.workspace_id, childTaskId);
  await assertCanEditTask(session, parentTask);
  await assertCanReadTask(session, childTask);
  const relationship = await readActiveRelationshipOrThrow(session.workspace_id, parentTask.task_id, childTask.task_id);
  const updated = await taskRelationshipsRepository.update(session.workspace_id, {
    ...relationship,
    is_blocking: Boolean(payload?.is_blocking ?? payload?.blocking),
    updated_by_user_id: session.user_id,
  });

  if (updated.is_blocking && isIncompleteBlockingChild(childTask)) {
    await blockParentForChild(session, parentTask, childTask);
  } else {
    await recoverParentIfNoBlockingChildren(session, parentTask);
  }

  await syncTaskSearchIndex(session.workspace_id, parentTask.task_id, "task.relationship_updated");
  await emitTaskRelationshipEvent("task.relationship.updated", { session, relationship: updated, parentTask, childTask });

  return listRelationships(parentTask.task_id, session);
}

async function removeChildTaskRelationship(parentTaskId, childTaskId, session) {
  await assertModuleWriteEnabled(session, TASKS_MODULE_ID);
  const parentTask = await readTaskOrThrow(session.workspace_id, parentTaskId);
  const childTask = await readTaskOrThrow(session.workspace_id, childTaskId);
  await assertCanEditTask(session, parentTask);
  const relationship = await readActiveRelationshipOrThrow(session.workspace_id, parentTask.task_id, childTask.task_id);
  await taskRelationshipsRepository.remove(session.workspace_id, relationship.task_relationship_id, session.user_id);
  await recoverParentIfNoBlockingChildren(session, parentTask);
  await syncTaskSearchIndex(session.workspace_id, parentTask.task_id, "task.relationship_removed");
  await syncTaskSearchIndex(session.workspace_id, childTask.task_id, "task.relationship_removed");
  await emitTaskRelationshipEvent("task.relationship.removed", { session, relationship, parentTask, childTask });

  return listRelationships(parentTask.task_id, session);
}

async function listChecklistItems(taskId, session) {
  const task = await readTaskOrThrow(session.workspace_id, taskId);
  await assertCanReadTask(session, task);

  const items = await taskChecklistsRepository.readForTask(session.workspace_id, task.task_id);
  return {
    items,
    checklistProgress: taskChecklistProgress(items),
  };
}

async function addChecklistItem(taskId, payload, session) {
  await assertModuleWriteEnabled(session, TASKS_MODULE_ID);
  const task = await readTaskOrThrow(session.workspace_id, taskId);
  await assertCanEditTask(session, task);

  const item = await taskChecklistsRepository.create(session.workspace_id, task.task_id, {
    label: normalizeChecklistLabel(payload?.label || payload?.title),
    created_by_user_id: session.user_id,
    updated_by_user_id: session.user_id,
  });

  return finalizeChecklistMutation({
    session,
    task,
    action: "task_checklist_item_created",
    eventName: "task.checklist_item.created",
    previousItem: null,
    item,
  });
}

async function updateChecklistItem(taskId, itemId, payload, session) {
  await assertModuleWriteEnabled(session, TASKS_MODULE_ID);
  const task = await readTaskOrThrow(session.workspace_id, taskId);
  await assertCanEditTask(session, task);
  const previousItem = await readChecklistItemOrThrow(session.workspace_id, itemId, task.task_id);
  const nextChecked = Object.hasOwn(payload || {}, "is_checked")
    ? Boolean(payload.is_checked)
    : Object.hasOwn(payload || {}, "checked")
      ? Boolean(payload.checked)
      : previousItem.is_checked;
  const item = await taskChecklistsRepository.update(session.workspace_id, {
    ...previousItem,
    label: normalizeChecklistLabel(valueOrFallback(payload, "label", previousItem.label)),
    is_checked: nextChecked,
    completed_at: nextChecked
      ? previousItem.completed_at || new Date().toISOString()
      : "",
    completed_by_user_id: nextChecked
      ? previousItem.completed_by_user_id || session.user_id
      : "",
    updated_by_user_id: session.user_id,
  });

  return finalizeChecklistMutation({
    session,
    task,
    action: "task_checklist_item_updated",
    eventName: "task.checklist_item.updated",
    previousItem,
    item,
  });
}

async function checkChecklistItem(taskId, itemId, session) {
  return setChecklistItemChecked(taskId, itemId, true, session);
}

async function uncheckChecklistItem(taskId, itemId, session) {
  return setChecklistItemChecked(taskId, itemId, false, session);
}

async function reorderChecklistItems(taskId, payload, session) {
  await assertModuleWriteEnabled(session, TASKS_MODULE_ID);
  const task = await readTaskOrThrow(session.workspace_id, taskId);
  await assertCanEditTask(session, task);
  const currentItems = await taskChecklistsRepository.readForTask(session.workspace_id, task.task_id);
  const requestedIds = normalizeChecklistItemIds(payload?.item_ids || payload?.itemIds || []);
  const currentIds = currentItems.map((item) => item.task_checklist_item_id);

  if (requestedIds.length !== currentIds.length || requestedIds.some((itemId) => !currentIds.includes(itemId))) {
    throw new AppError("Checklist reorder must include each active checklist item once.", 400);
  }

  const items = await taskChecklistsRepository.reorder(session.workspace_id, task.task_id, requestedIds, session.user_id);
  return finalizeChecklistMutation({
    session,
    task,
    action: "task_checklist_items_reordered",
    eventName: "task.checklist_items.reordered",
    previousItem: null,
    item: null,
    items,
  });
}

async function deleteChecklistItem(taskId, itemId, session) {
  await assertModuleWriteEnabled(session, TASKS_MODULE_ID);
  const task = await readTaskOrThrow(session.workspace_id, taskId);
  await assertCanEditTask(session, task);
  const previousItem = await readChecklistItemOrThrow(session.workspace_id, itemId, task.task_id);
  await taskChecklistsRepository.softDelete(session.workspace_id, previousItem.task_checklist_item_id, session.user_id);

  return finalizeChecklistMutation({
    session,
    task,
    action: "task_checklist_item_deleted",
    eventName: "task.checklist_item.deleted",
    previousItem,
    item: null,
  });
}

async function bulkUpdate(payload, session) {
  await assertModuleWriteEnabled(session, TASKS_MODULE_ID);
  const taskIds = normalizeAssigneeIds(payload?.task_ids || payload?.taskIds || []);
  const action = String(payload?.action || "").trim();
  const results = [];
  const errors = [];

  if (["tag_add", "tag_remove", "tag_replace"].includes(action)) {
    const tagResult = await tagsService.bulkAssign(session, {
      action: action.replace("tag_", ""),
      tagIds: payload.tagIds || payload.tag_ids || [],
      targetIds: taskIds,
      targetType: "task",
    });
    for (const changed of tagResult.changed || []) {
      results.push(await readTaggedTaskWithDetails(session, changed.target_id));
    }
    return {
      tasks: results,
      errors: (tagResult.errors || []).map((error) => ({
        message: error.message || "Task tags could not be updated.",
        status: error.status || 500,
        task_id: error.target_id,
      })),
      tagBulkResult: tagResult,
    };
  }

  for (const taskId of taskIds) {
    try {
      const result = await applyBulkAction(taskId, action, payload, session);
      results.push(result.task);
    } catch (error) {
      errors.push({
        task_id: taskId,
        message: error.message || "Task could not be updated.",
        status: error.status || error.statusCode || 500,
      });
    }
  }

  return { tasks: results, errors };
}

async function readOptions(session) {
  const [settings, users] = await Promise.all([
    settingsRepository.readWorkspaceSettings(session.workspace_id),
    usersRepository.readAll(session.workspace_id),
  ]);
  const [moduleContext, clientOptions, projectOptions, taskOptions] = await Promise.all([
    modulesService.readWorkspaceModuleContext(session.workspace_id),
    readClientOptionPayload(session, settings),
    readProjectOptionPayload(session),
    readTaskOptionPayload(session),
  ]);

  return {
    workspaceType: settings.workspaceType,
    clients: clientOptions,
    projects: projectOptions,
    tasks: taskOptions,
    users: users.filter((user) => user.userStatus === "active"),
    priorities: [...PRIORITIES],
    statuses: [...STATUSES],
    taskTimersEnabled: settings.taskTimersEnabled !== false,
    timeTrackingEnabled: moduleContext.moduleStatusById["time-tracking"] === "enabled",
  };
}

async function readClientOptionPayload(session, settings) {
  if (settings.workspaceType !== "business") {
    return [];
  }

  const result = await clientsService.listClients(session, {
    include_depth: true,
    shape: "flat",
    status: "Active",
  });

  return (result.clients || []).map((client) => ({
    ...client,
    optionLabel: client.display_label || client.name || "",
    displayName: client.display_label || client.name || "",
    hierarchyDepth: Number(client.depth) || 0,
  }));
}

async function readProjectOptionPayload(session) {
  const result = await clientsService.listProjects(session, {
    client: "All",
    include_depth: true,
    shape: "flat",
    status: "Active",
  });

  return (result.projects || []).map((project) => ({
    ...project,
    optionLabel: project.display_label || project.name || "",
    displayName: project.display_label || project.name || "",
    hierarchyDepth: Number(project.depth) || 0,
  }));
}

async function readTaskOptionPayload(session, query = {}) {
  const includeCompleted = readBoolean(query.include_completed || query.includeCompleted);
  const includeArchived = readBoolean(query.include_archived || query.includeArchived);
  const status = includeArchived
    ? "all"
    : includeCompleted
      ? "history"
      : "active";
  const repositoryQuery = taskListRepositoryQuery(session, {
    sort: "context",
    status,
  });
  const result = await tasksRepository.queryList(session.workspace_id, {
    ...repositoryQuery,
    limit: TASK_OPTION_MAX_ITEMS,
    offset: 0,
  });
  const readable = [];

  for (const task of result.tasks || []) {
    if (await canReadTask(session, task) && matchesStatusFilter(task, status)) {
      readable.push(task);
    }
  }

  return sortCanonicalTasks(readable, { sort: "context" }).map(taskPickerOption);
}

function taskPickerOption(task) {
  return {
    task_id: task.task_id,
    id: task.task_id,
    label: task.title || "Untitled Task",
    optionLabel: taskOptionLabel(task),
    displayName: taskOptionLabel(task),
    status: task.status || "open",
    priority: task.priority || "normal",
    client_id: task.client_id || "",
    client_name: task.client_name || "",
    project_id: task.project_id || "",
    project_name: task.project_name || "",
    due_date: task.due_date || "",
    due_time: task.due_time || "",
  };
}

function taskOptionLabel(task) {
  const context = [task.client_name, task.project_name].filter(Boolean).join(" / ");
  return context ? `${task.title || "Untitled Task"} (${context})` : task.title || "Untitled Task";
}

async function readProjectTaskDefaults(session, projectId) {
  const normalizedProjectId = String(projectId || "").trim();

  if (!normalizedProjectId) {
    return {
      priority: "normal",
      status: "open",
      sortOrder: ["due_date", "priority", "status"],
    };
  }

  const project = await projectsRepository.readById(session.workspace_id, normalizedProjectId);
  const defaults = project?.taskDefaults || {};

  return {
    priority: normalizePriority(defaults.priority),
    status: normalizeStatus(defaults.status),
    sortOrder: Array.isArray(defaults.sortOrder) ? defaults.sortOrder : ["due_date", "priority", "status"],
    defaultAssigneeMode: normalizeProjectDefaultAssigneeMode(defaults.defaultAssigneeMode),
  };
}

async function resolveCreateDefaultAssigneeIds({ payload = {}, projectId = "", session, taskDefaults = {} }) {
  if (hasAssigneePayload(payload)) {
    return normalizeAssigneeIds(
      Array.isArray(payload.assignee_ids)
        ? payload.assignee_ids
        : Array.isArray(payload.assignees)
          ? payload.assignees.map((assignee) => assignee.user_id || assignee)
          : payload.assigneeIds,
    );
  }

  const mode = normalizeProjectDefaultAssigneeMode(taskDefaults.defaultAssigneeMode);

  if (mode === "unassigned") {
    return [];
  }

  if (mode !== "project_admin") {
    return [session.user_id];
  }

  const adminUserId = await resolveProjectAdminDefaultAssignee(session, projectId);
  return adminUserId ? [adminUserId] : [];
}

function hasAssigneePayload(payload = {}) {
  return Object.hasOwn(payload, "assignee_ids") ||
    Object.hasOwn(payload, "assigneeIds") ||
    Object.hasOwn(payload, "assignees");
}

async function resolveProjectAdminDefaultAssignee(session, projectId) {
  const normalizedProjectId = String(projectId || "").trim();

  if (!normalizedProjectId) {
    return "";
  }

  const [settings, project] = await Promise.all([
    settingsRepository.readWorkspaceSettings(session.workspace_id),
    projectsRepository.readById(session.workspace_id, normalizedProjectId),
  ]);

  if (!project) {
    return "";
  }

  const projectAdmin = project.client_id
    ? await permissionsRepository.readOldestActiveUserForRoleScope(
        session.workspace_id,
        "project_admin",
        "client",
        project.client_id,
      )
    : null;

  if (projectAdmin?.user_id) {
    return projectAdmin.user_id;
  }

  const clientAdmin = settings.workspaceType === "business" && project.client_id
    ? await permissionsRepository.readOldestActiveUserForRoleScope(
        session.workspace_id,
        "client_admin",
        "client",
        project.client_id,
      )
    : null;

  if (clientAdmin?.user_id) {
    return clientAdmin.user_id;
  }

  const workspaceAdmin = await permissionsRepository.readOldestActiveUserForRoleScope(
    session.workspace_id,
    "workspace_admin",
    "workspace",
    session.workspace_id,
  );

  return workspaceAdmin?.user_id || "";
}

function normalizeProjectDefaultAssigneeMode(value) {
  const mode = String(value || "").trim();
  return ["creator", "project_admin", "unassigned"].includes(mode) ? mode : "creator";
}

async function applyBulkAction(taskId, action, payload, session) {
  if (action === "archive") {
    return archive(taskId, session);
  }

  if (action === "restore") {
    return restore(taskId, session);
  }

  const previousTask = await readTaskOrThrow(session.workspace_id, taskId);

  if (action === "status") {
    return update(taskId, { status: payload.status }, session);
  }

  if (action === "priority") {
    return update(taskId, { priority: payload.priority }, session);
  }

  if (action === "due_date") {
    const dueDate = normalizeDueDate(payload.due_date || payload.dueDate);
    return update(taskId, {
      due_date: dueDate,
      due_time: dueDate ? previousTask.due_time : "",
    }, session);
  }

  if (action === "due_time") {
    return update(taskId, {
      due_time: normalizeDueTime(payload.due_time || payload.dueTime),
    }, session);
  }

  if (action === "assignee_replace") {
    return update(taskId, {
      assignee_ids: normalizeAssigneeIds(payload.assignee_ids || payload.assigneeIds || []),
    }, session);
  }

  if (action === "assignee_add" || action === "assignee_remove") {
    const selectedAssigneeIds = normalizeAssigneeIds(payload.assignee_ids || payload.assigneeIds || []);
    const currentAssigneeIds = new Set(previousTask.assignee_ids || []);

    selectedAssigneeIds.forEach((assigneeId) => {
      if (action === "assignee_add") {
        currentAssigneeIds.add(assigneeId);
      } else {
        currentAssigneeIds.delete(assigneeId);
      }
    });

    return update(taskId, { assignee_ids: [...currentAssigneeIds] }, session);
  }

  throw new AppError("Unsupported bulk task action.", 400);
}

async function normalizeTaskPayload({ payload = {}, session, fallback }) {
  const scope = await resolveTaskScope({
    session,
    clientId: valueOrFallback(payload, "client_id", fallback.client_id),
    projectId: valueOrFallback(payload, "project_id", fallback.project_id),
  });
  const scopeChanged = scope.clientId !== (fallback.client_id || "") ||
    scope.projectId !== (fallback.project_id || "");
  const billableSource = Object.hasOwn(payload || {}, "billable")
    ? payload.billable
    : scopeChanged
      ? scope.billable
      : fallback.billable || scope.billable;
  const title = String(valueOrFallback(payload, "title", fallback.title) || "").trim();
  const status = normalizeStatus(valueOrFallback(payload, "status", fallback.status));
  const priority = normalizePriority(valueOrFallback(payload, "priority", fallback.priority));
  const billable = normalizeBillableFlag(billableSource);
  const dueDate = normalizeDueDate(valueOrFallback(payload, "due_date", fallback.due_date));
  const dueTime = normalizeDueTime(valueOrFallback(payload, "due_time", fallback.due_time));
  const dueTimezone = dueDate
    ? String(valueOrFallback(payload, "due_timezone", fallback.due_timezone || session.timezone) || session.timezone || "").trim()
    : "";
  const recurrenceTemplateId = String(valueOrFallback(payload, "recurrence_template_id", fallback.recurrence_template_id) || "").trim();
  const recurrenceInstanceDate = normalizeDueDate(valueOrFallback(payload, "recurrence_instance_date", fallback.recurrence_instance_date));

  if (!title) {
    throw new AppError("Task title is required.", 400);
  }

  if (dueTime && !dueDate) {
    throw new AppError("A due time requires a due date.", 400);
  }

  const now = new Date().toISOString();
  const preserveCompletedState = status === "complete" || (status === "archived" && fallback.completed_at);

  return {
    task_id: String(fallback.task_id || payload.task_id || payload.id || "").trim(),
    workspace_id: session.workspace_id,
    client_id: scope.clientId,
    project_id: scope.projectId,
    title,
    description: String(valueOrFallback(payload, "description", fallback.description) || "").trim(),
    next_action: normalizeTaskContextText(valueOrFallback(payload, "next_action", fallback.next_action)),
    blocked_reason: normalizeTaskContextText(valueOrFallback(payload, "blocked_reason", fallback.blocked_reason)),
    resume_note: normalizeTaskContextText(
      Object.hasOwn(payload || {}, "handoff_note")
        ? payload.handoff_note
        : valueOrFallback(payload, "resume_note", fallback.resume_note),
    ),
    status,
    priority,
    billable,
    due_date: dueDate,
    due_time: dueTime,
    due_timezone: dueTimezone,
    due_at_utc: dueDate && dueTime ? normalizeUtcIso(`${dueDate}T${dueTime}:00`, dueTimezone || session.timezone) : "",
    source_type: String(valueOrFallback(payload, "source_type", fallback.source_type) || "manual").trim() || "manual",
    source_id: String(valueOrFallback(payload, "source_id", fallback.source_id) || "").trim(),
    archived_at: status === "archived" ? fallback.archived_at || now : "",
    reminder_override_enabled: readReminderOverrideEnabled(payload, fallback),
    recurrence_template_id: recurrenceTemplateId,
    recurrence_instance_date: recurrenceTemplateId ? recurrenceInstanceDate || dueDate : "",
    completed_at: preserveCompletedState ? fallback.completed_at || now : "",
    last_worked_at: valueOrFallback(payload, "last_worked_at", fallback.last_worked_at) || now,
    created_by_user_id: fallback.created_by_user_id || session.user_id,
    updated_by_user_id: session.user_id,
    completed_by_user_id: preserveCompletedState ? fallback.completed_by_user_id || session.user_id : "",
    archived_by_user_id: status === "archived" ? fallback.archived_by_user_id || session.user_id : "",
    assignee_ids: normalizeAssigneeIds(
      Array.isArray(payload.assignee_ids)
        ? payload.assignee_ids
        : Array.isArray(payload.assignees)
          ? payload.assignees.map((assignee) => assignee.user_id || assignee)
          : fallback.assignee_ids || [],
    ),
  };
}

async function resolveTaskScope({ session, clientId, projectId }) {
  const settings = await settingsRepository.readWorkspaceSettings(session.workspace_id);
  const normalizedProjectId = String(projectId || "").trim();
  const rawClientId = String(clientId || "").trim();
  const requestedClientId = settings.workspaceType === "business" ? rawClientId : "";

  if (settings.workspaceType !== "business" && rawClientId) {
    throw new AppError("Clients are only available in Business workspaces.", 403);
  }

  if (normalizedProjectId) {
    const project = await projectsRepository.readById(session.workspace_id, normalizedProjectId);

    if (!project) {
      throw new AppError("Project not found.", 404);
    }

    if (!isActiveStatus(project.status)) {
      throw new AppError("Archived projects cannot receive tasks.", 400);
    }

    if (requestedClientId && requestedClientId !== (project.client_id || "")) {
      throw new AppError("Task client must match the selected project's client.", 400);
    }

    return {
      projectId: project.id,
      clientId: project.client_id || "",
      billable: normalizeBillableFlag(project.billable),
    };
  }

  if (requestedClientId) {
    const client = await clientsRepository.readById(session.workspace_id, requestedClientId);

    if (!client) {
      throw new AppError("Client not found.", 404);
    }

    if (!isActiveStatus(client.status)) {
      throw new AppError("Archived clients cannot receive tasks.", 400);
    }

    return {
      projectId: "",
      clientId: client.id,
      billable: normalizeBillableFlag(client.billable),
    };
  }

  return {
    projectId: "",
    clientId: "",
    billable: "yes",
  };
}

async function assertAssigneesEligible(session, task) {
  const users = await usersRepository.readAll(session.workspace_id);
  const activeUserIds = new Set(users.filter((user) => user.userStatus === "active").map((user) => user.user_id));

  for (const userId of task.assignee_ids) {
    if (!activeUserIds.has(userId)) {
      throw new AppError("Task assignees must be active users in this workspace.", 400);
    }

    const assigneeSession = {
      ...session,
      user_id: userId,
    };

    if (!(await permissionsService.can(assigneeSession, "tasks.view", taskResource(task)))) {
      throw new AppError("Task assignees must be allowed to view the selected task scope.", 400);
    }
  }
}

async function readTaskOrThrow(workspaceId, taskId) {
  const decodedTaskId = decodeURIComponent(taskId || "");
  const task = decodedTaskId ? await tasksRepository.readById(workspaceId, decodedTaskId) : null;

  if (!task) {
    throw new AppError("Task not found.", 404);
  }

  return task;
}

async function assertCanReadTask(session, task) {
  if (!(await canReadTask(session, task))) {
    throw new AppError("You do not have permission to perform that action.", 403);
  }
}

async function canReadTask(session, task) {
  return permissionsService.can(session, "tasks.view", taskResource(task));
}

async function assertCanEditTask(session, task) {
  if (await permissionsService.can(session, "tasks.edit_all", taskResource(task))) {
    return;
  }

  if (isOwnTask(session, task) && await permissionsService.can(session, "tasks.edit_own", taskResource(task))) {
    return;
  }

  throw new AppError("You do not have permission to perform that action.", 403);
}

async function assertCanCompleteTask(session, task) {
  if (!(await permissionsService.can(session, "tasks.complete", taskResource(task)))) {
    throw new AppError("You do not have permission to perform that action.", 403);
  }

  if (await permissionsService.can(session, "tasks.edit_all", taskResource(task)) || isOwnTask(session, task)) {
    return;
  }

  throw new AppError("You do not have permission to perform that action.", 403);
}

async function assertStatusTransitionAllowed(session, previousTask, nextTask) {
  if (previousTask.status !== "archived" && nextTask.status === "archived") {
    await permissionsService.assertCan(session, "tasks.archive", taskResource(previousTask));
  }

  if (previousTask.status === "archived" && nextTask.status !== "archived") {
    await permissionsService.assertCan(session, "tasks.restore", taskResource(previousTask));
  }

  if (previousTask.status !== "complete" && nextTask.status === "complete") {
    await assertCanCompleteTask(session, previousTask);
  }

  if (previousTask.status === "complete" && nextTask.status !== "complete") {
    await assertCanCompleteTask(session, previousTask);
  }
}

async function assertBlockingChildrenAllowStatus(session, task) {
  if (task.status !== "in_progress") {
    return;
  }

  const blockingChildren = await taskRelationshipsRepository.readBlockingChildren(session.workspace_id, task.task_id);
  const incomplete = blockingChildren.filter((relationship) => !isCompleteOrArchivedStatus(relationship.child_status));

  if (incomplete.length > 0) {
    throw new AppError("Task cannot move to In Progress while blocking child tasks are incomplete.", 400);
  }
}

async function assertCanRelateTasks(session, parentTask, childTask) {
  if (parentTask.task_id === childTask.task_id) {
    throw new AppError("A task cannot be its own child.", 400);
  }

  if (parentTask.workspace_id !== childTask.workspace_id || parentTask.workspace_id !== session.workspace_id) {
    throw new AppError("Task relationships must stay within the same workspace.", 400);
  }

  const settings = await settingsRepository.readWorkspaceSettings(session.workspace_id);
  if (
    settings.workspaceType === "business" &&
    parentTask.client_id &&
    childTask.client_id &&
    parentTask.client_id !== childTask.client_id
  ) {
    throw new AppError("Parent and child tasks with client context must stay within the same client.", 400);
  }

  if (await taskRelationshipsRepository.hasPath(session.workspace_id, childTask.task_id, parentTask.task_id)) {
    throw new AppError("Task relationship would create a circular reference.", 400);
  }
}

async function readActiveRelationshipOrThrow(workspaceId, parentTaskId, childTaskId) {
  const relationship = await taskRelationshipsRepository.readActivePair(workspaceId, parentTaskId, childTaskId);

  if (!relationship) {
    throw new AppError("Task relationship not found.", 404);
  }

  return relationship;
}

async function blockParentsForIncompleteChild(session, childTask) {
  if (!isIncompleteBlockingChild(childTask)) {
    return;
  }

  const relationships = await taskRelationshipsRepository.readParents(session.workspace_id, childTask.task_id);
  for (const relationship of relationships.filter((item) => item.is_blocking)) {
    const parentTask = await tasksRepository.readById(session.workspace_id, relationship.parent_task_id);
    if (parentTask) {
      await blockParentForChild(session, parentTask, childTask);
    }
  }
}

async function blockParentForChild(session, parentTask, childTask) {
  if (isCompleteOrArchivedStatus(parentTask.status)) {
    return;
  }

  const now = new Date().toISOString();
  const blockedReason = parentTask.blocked_reason ||
    autoBlockedReason([childTask.title || childTask.task_id]);
  await tasksRepository.update(session.workspace_id, {
    ...parentTask,
    status: "blocked",
    blocked_reason: blockedReason,
    last_worked_at: now,
    updated_by_user_id: session.user_id,
    assignee_ids: parentTask.assignee_ids || [],
  });
  const updatedTask = await readTaggedTaskWithDetails(session, parentTask.task_id);
  await emitTaskEvent("task.updated", {
    session,
    previousValue: parentTask,
    newValue: updatedTask,
    metadata: {
      status_transition_reason: "blocked_by_child",
      blocking_child_task_id: childTask.task_id,
      blocking_child_title: childTask.title || "",
    },
  });
  await syncTaskSearchIndex(session.workspace_id, parentTask.task_id, "task.blocked_by_child");
}

async function recoverParentsAfterChildStatusChange(session, childTask) {
  const relationships = await taskRelationshipsRepository.readParents(session.workspace_id, childTask.task_id);

  for (const relationship of relationships.filter((item) => item.is_blocking)) {
    const parentTask = await tasksRepository.readById(session.workspace_id, relationship.parent_task_id);
    if (parentTask) {
      await recoverParentIfNoBlockingChildren(session, parentTask);
    }
  }
}

async function recoverParentIfNoBlockingChildren(session, parentTask) {
  if (parentTask.status !== "blocked") {
    return;
  }

  const blockingChildren = await taskRelationshipsRepository.readBlockingChildren(session.workspace_id, parentTask.task_id);
  const incomplete = blockingChildren.filter((relationship) => !isCompleteOrArchivedStatus(relationship.child_status));

  if (incomplete.length > 0) {
    return;
  }

  if (parentTask.blocked_reason && !parentTask.blocked_reason.startsWith("Blocked by incomplete child task")) {
    return;
  }

  const now = new Date().toISOString();
  await tasksRepository.update(session.workspace_id, {
    ...parentTask,
    status: "open",
    blocked_reason: "",
    last_worked_at: now,
    updated_by_user_id: session.user_id,
    assignee_ids: parentTask.assignee_ids || [],
  });
  const updatedTask = await readTaggedTaskWithDetails(session, parentTask.task_id);
  await emitTaskEvent("task.updated", {
    session,
    previousValue: parentTask,
    newValue: updatedTask,
    metadata: {
      status_transition_reason: "unblocked_by_child",
    },
  });
  await syncTaskSearchIndex(session.workspace_id, parentTask.task_id, "task.unblocked_by_child");
}

function isIncompleteBlockingChild(task) {
  return !isCompleteOrArchivedStatus(task.status);
}

function isCompleteOrArchivedStatus(status) {
  return status === "complete" || status === "archived";
}

function autoBlockedReason(childTitles) {
  const label = childTitles.filter(Boolean).slice(0, 2).join(", ") || "blocking child task";
  return `Blocked by incomplete child task: ${label}`;
}

function isOwnTask(session, task) {
  return task.created_by_user_id === session.user_id ||
    (task.assignee_ids || []).includes(session.user_id);
}

function taskResource(task) {
  return {
    workspace_id: task.workspace_id,
    client_id: task.client_id || "",
    project_id: task.project_id || "",
  };
}

function valueOrFallback(payload, key, fallback) {
  return Object.hasOwn(payload || {}, key) ? payload[key] : fallback;
}

function readReminderOverrideEnabled(payload, fallback) {
  if (Object.hasOwn(payload || {}, "reminderOverrideEnabled")) {
    return Boolean(payload.reminderOverrideEnabled);
  }

  if (Object.hasOwn(payload || {}, "reminder_override_enabled")) {
    return Boolean(payload.reminder_override_enabled);
  }

  return Boolean(fallback.reminder_override_enabled);
}

async function saveTaskReminderOverride(workspaceId, taskId, payload = {}) {
  const hasReminderPayload = Object.hasOwn(payload, "reminderPolicy") ||
    Object.hasOwn(payload, "reminder_policy") ||
    Object.hasOwn(payload, "reminderOverrideEnabled") ||
    Object.hasOwn(payload, "reminder_override_enabled");

  if (!hasReminderPayload) {
    return;
  }

  const overrideEnabled = readReminderOverrideEnabled(payload, {});
  const policy = payload.reminderPolicy || payload.reminder_policy || {};
  await taskRemindersService.saveTargetPolicy(workspaceId, "task", taskId, policy, !overrideEnabled);
}

async function saveTargetTags(session, targetType, targetId, payload = {}) {
  if (!Object.hasOwn(payload || {}, "tagIds") && !Object.hasOwn(payload || {}, "tag_ids")) {
    return;
  }

  await tagsService.replaceAssignments(session, {
    targetId,
    targetType,
    tagIds: payload.tagIds || payload.tag_ids || [],
  });
}

async function requestTagPropagationRefresh(session, targetType, targetId, reason) {
  try {
    await tagsService.refreshPropagatedAssignmentsForTarget(session, {
      reason,
      targetId,
      targetType,
    });
  } catch (error) {
    console.error(`[tasks] Tag propagation refresh failed for ${targetType}:${targetId}:`, error);
  }
}

async function readTaggedTaskWithDetails(session, taskId) {
  const task = await readTaskOrThrow(session.workspace_id, taskId);
  return attachTaskDetails((await tagsService.decorateRecordsForTarget(session, "task", [task]))[0]);
}

async function readableRelationshipsForTask(session, taskId) {
  const relationships = await taskRelationshipsRepository.readForTask(session.workspace_id, taskId);
  const readable = [];

  for (const relationship of relationships) {
    const isParentSide = relationship.parent_task_id === taskId;
    const relatedTaskId = isParentSide ? relationship.child_task_id : relationship.parent_task_id;
    const relatedTask = await tasksRepository.readById(session.workspace_id, relatedTaskId);
    const canReadRelated = relatedTask ? await canReadTask(session, relatedTask) : false;

    readable.push({
      task_relationship_id: relationship.task_relationship_id,
      direction: isParentSide ? "child" : "parent",
      parent_task_id: relationship.parent_task_id,
      child_task_id: relationship.child_task_id,
      is_blocking: relationship.is_blocking,
      related_task_id: relatedTaskId,
      related_task_readable: canReadRelated,
      related_task: canReadRelated && relatedTask
        ? taskRelationshipTaskSummary(relatedTask)
        : null,
      created_at: relationship.created_at,
      updated_at: relationship.updated_at,
    });
  }

  return readable;
}

function taskRelationshipTaskSummary(task) {
  return {
    task_id: task.task_id,
    title: task.title,
    status: task.status,
    client_id: task.client_id || "",
    client_name: task.client_name || "",
    project_id: task.project_id || "",
    project_name: task.project_name || "",
    url: taskUrl(task),
  };
}

async function setChecklistItemChecked(taskId, itemId, checked, session) {
  await assertModuleWriteEnabled(session, TASKS_MODULE_ID);
  const task = await readTaskOrThrow(session.workspace_id, taskId);
  await assertCanEditTask(session, task);
  const previousItem = await readChecklistItemOrThrow(session.workspace_id, itemId, task.task_id);

  if (previousItem.is_checked === checked) {
    return {
      item: previousItem,
      task: await readTaggedTaskWithDetails(session, task.task_id),
      items: await taskChecklistsRepository.readForTask(session.workspace_id, task.task_id),
    };
  }

  const item = await taskChecklistsRepository.update(session.workspace_id, {
    ...previousItem,
    is_checked: checked,
    completed_at: checked ? new Date().toISOString() : "",
    completed_by_user_id: checked ? session.user_id : "",
    updated_by_user_id: session.user_id,
  });

  return finalizeChecklistMutation({
    session,
    task,
    action: checked ? "task_checklist_item_checked" : "task_checklist_item_unchecked",
    eventName: checked ? "task.checklist_item.checked" : "task.checklist_item.unchecked",
    previousItem,
    item,
  });
}

async function readChecklistItemOrThrow(workspaceId, itemId, taskId) {
  const item = await taskChecklistsRepository.readById(workspaceId, decodeURIComponent(itemId || ""));

  if (!item || item.task_id !== taskId || item.deleted_at) {
    throw new AppError("Checklist item not found.", 404);
  }

  return item;
}

async function finalizeChecklistMutation({ session, task, action, eventName, previousItem, item, items = null }) {
  const workedAt = new Date().toISOString();
  await tasksRepository.markWorkedAt(session.workspace_id, task.task_id, workedAt, session.user_id);
  const currentItems = items || await taskChecklistsRepository.readForTask(session.workspace_id, task.task_id);
  const checklistProgress = taskChecklistProgress(currentItems);
  const taskWithDetails = await readTaggedTaskWithDetails(session, task.task_id);
  const nextItem = item || previousItem || currentItems[0] || {};

  await auditService.record({
    session,
    action,
    changeType: action.endsWith("_deleted") ? "delete" : action.endsWith("_created") ? "create" : "update",
    recordType: "task_checklist_item",
    recordId: nextItem.task_checklist_item_id || task.task_id,
    recordLabel: nextItem.label || task.title,
    recordUrl: taskUrl(task),
    previousValue: previousItem,
    newValue: item,
    metadata: {
      task_id: task.task_id,
      task_title: task.title,
      checklist_progress: checklistProgress,
    },
  });
  await modulesService.emitInternalEvent(eventName, {
    session,
    moduleId: TASKS_MODULE_ID,
    recordType: "task_checklist_item",
    recordId: nextItem.task_checklist_item_id || task.task_id,
    previousValue: previousItem,
    newValue: item,
    source: session?.api_key_id ? "public_api" : "manual",
    metadata: {
      task_id: task.task_id,
      task_title: task.title,
      target_type: "task",
      target_id: task.task_id,
      checklist_progress: checklistProgress,
      item_count: checklistProgress.total_count,
      completed_count: checklistProgress.completed_count,
    },
  });
  await syncTaskSearchIndex(session.workspace_id, task.task_id, eventName);

  return {
    item,
    items: currentItems,
    checklistProgress,
    task: taskWithDetails,
  };
}

async function attachReminderDetailsToTask(task) {
  if (!task) {
    return null;
  }

  return {
    ...task,
    reminderDetails: await taskRemindersService.readTaskReminderDetails(task),
  };
}

async function attachTaskListProjectionDetails(tasks) {
  if (!Array.isArray(tasks) || tasks.length === 0) {
    return [];
  }

  const taskIds = tasks.map((task) => task.task_id).filter(Boolean);
  const [checklistProgressByTaskId, relationshipSummaryByTaskId] = await Promise.all([
    taskChecklistsRepository.readProgressForTasks(tasks[0].workspace_id, taskIds),
    taskRelationshipsRepository.relationshipSummariesForTasks(tasks[0].workspace_id, taskIds),
  ]);

  return Promise.all(tasks.map(async (task) => {
    const checklistProgress = checklistProgressByTaskId.get(task.task_id) || emptyChecklistProgress();
    const relationshipSummary = relationshipSummaryByTaskId.get(task.task_id) || emptyRelationshipSummary();
    const taskWithListDetails = {
      ...task,
      checklistProgress,
      relationshipSummary,
      completionMetrics: taskCompletionMetrics(task),
      reminderDetails: await taskRemindersService.readTaskReminderDetails(task),
    };

    return {
      ...taskWithListDetails,
      resumeContext: taskResumeContext(taskWithListDetails),
    };
  }));
}

async function attachTaskDetails(task) {
  if (!task) {
    return null;
  }

  const taskWithReminders = await attachReminderDetailsToTask(task);
  const checklistItems = await taskChecklistsRepository.readForTask(task.workspace_id, task.task_id);
  const checklistProgress = taskChecklistProgress(checklistItems);
  const relationshipSummary = await taskRelationshipsRepository.relationshipSummary(task.workspace_id, task.task_id);
  return {
    ...taskWithReminders,
    checklistItems,
    checklistProgress,
    relationshipSummary,
    completionMetrics: taskCompletionMetrics(taskWithReminders),
    resumeContext: taskResumeContext({ ...taskWithReminders, checklistProgress, relationshipSummary }),
    recurrenceDetails: await taskRecurrenceService.readTaskRecurrenceDetails(taskWithReminders),
  };
}

function normalizeStatus(value) {
  const status = String(value || "").trim();
  return STATUSES.has(status) ? status : "open";
}

function normalizePriority(value) {
  const priority = String(value || "").trim();
  return PRIORITIES.has(priority) ? priority : "normal";
}

function normalizeDueDate(value) {
  const text = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}

function normalizeDueTime(value) {
  const text = String(value || "").trim();
  if (!text) {
    return "";
  }

  const match = text.match(/^(\d{2}):(\d{2})/);
  if (!match) {
    throw new AppError("Due time must be in HH:MM format.", 400);
  }

  const hour = Number(match[1]);
  const minute = Number(match[2]);

  if (hour > 23 || minute > 59) {
    throw new AppError("Due time must be in HH:MM format.", 400);
  }

  return `${match[1]}:${match[2]}`;
}

function normalizeAssigneeIds(assigneeIds) {
  return [...new Set((assigneeIds || []).map((id) => String(id || "").trim()).filter(Boolean))];
}

function normalizeTaskContextText(value) {
  return String(value || "").trim();
}

function normalizeChecklistLabel(value) {
  const label = String(value || "").trim();

  if (!label) {
    throw new AppError("Checklist item label is required.", 400);
  }

  return label.slice(0, 240);
}

function normalizeChecklistItemIds(itemIds) {
  return [...new Set((itemIds || []).map((id) => String(id || "").trim()).filter(Boolean))];
}

function normalizeBillableFlag(value, fallback = "yes") {
  if (value === false || value === "no") {
    return "no";
  }

  if (value === true || value === "yes") {
    return "yes";
  }

  return fallback === "no" ? "no" : "yes";
}

function sortTaskSummaryRows(tasks) {
  return [...tasks].sort((firstTask, secondTask) =>
    String(firstTask.due_date || "9999-12-31").localeCompare(String(secondTask.due_date || "9999-12-31")) ||
    priorityRank(secondTask.priority) - priorityRank(firstTask.priority) ||
    String(secondTask.updated_at || "").localeCompare(String(firstTask.updated_at || "")),
  );
}

function taskMatchesCanonicalQuery(task, query = {}, session = {}, timerByTaskId = new Map()) {
  const now = new Date();
  const today = localDateKey(now, session.timezone);
  const dueSoonCutoff = addDaysKey(today, 7);
  const currentWeekEnd = currentWeekEndKey(today);
  const taskView = normalizedTaskView(query.taskView || query.task_view || query.view);
  const statusFilter = normalizedTaskFilter(query.status || query.status_filter || query.filter);
  const quickFilter = normalizedTaskFilter(query.quickFilter || query.quick_filter || (!taskView ? query.assigneeFilter || query.assignee_filter : ""));
  const dueFilter = normalizedTaskFilter(query.due || query.due_filter) || quickDueFilter(quickFilter);
  const timerFilter = normalizedTaskFilter(query.timer || query.timer_status);
  const assigneeFilter = normalizedTaskFilter(query.assignee || query.assignee_scope || query.assignee_filter_value);
  const projectId = String(query.projectId || query.project_id || "").trim();
  const clientId = String(query.clientId || query.client_id || "").trim();
  const assigneeId = String(query.assigneeId || query.assignee_id || "").trim();
  const hasProjectFilter = hasQueryFilter(query, ["projectId", "project_id"]);
  const hasClientFilter = hasQueryFilter(query, ["clientId", "client_id"]);

  if (taskView && !matchesTaskView(task, taskView, session.user_id, today, currentWeekEnd)) {
    return false;
  }

  if (!matchesStatusFilter(task, statusFilter)) {
    return false;
  }

  if (!taskView && !matchesQuickFilter(task, quickFilter, session.user_id)) {
    return false;
  }

  if (!matchesDueFilter(task, dueFilter, now, today, dueSoonCutoff)) {
    return false;
  }

  if (hasProjectFilter && projectId !== "all" && (task.project_id || "") !== projectId) {
    return false;
  }

  if (hasClientFilter && clientId !== "all" && (task.client_id || "") !== clientId) {
    return false;
  }

  if (!matchesAdvancedAssigneeFilter(task, assigneeFilter, assigneeId, session.user_id)) {
    return false;
  }

  if (timerFilter) {
    const timer = timerByTaskId.get(task.task_id);
    if (timerFilter === "has_timer" && !timer) {
      return false;
    }
    if (["running", "paused"].includes(timerFilter) && timer?.timer_status !== timerFilter) {
      return false;
    }
  }

  return true;
}

function matchesTaskView(task, taskView, currentUserId, today, currentWeekEnd) {
  if (taskView === "my") {
    return isActiveTask(task) && (task.assignee_ids || []).includes(currentUserId);
  }

  if (taskView === "all") {
    return isActiveTask(task);
  }

  if (taskView === "unassigned") {
    return isActiveTask(task) && (task.assignee_ids || []).length === 0;
  }

  if (taskView === "overdue") {
    return isActiveTask(task) && Boolean(task.due_date) && task.due_date < today;
  }

  if (taskView === "today") {
    return isActiveTask(task) && task.due_date === today;
  }

  if (taskView === "week") {
    return isActiveTask(task) && Boolean(task.due_date) && task.due_date >= today && task.due_date <= currentWeekEnd;
  }

  if (taskView === "completed") {
    return task.status === "complete";
  }

  if (taskView === "archived") {
    return task.status === "archived";
  }

  return true;
}

function matchesStatusFilter(task, filter) {
  if (!filter || filter === "all") {
    return true;
  }

  if (filter === "active") {
    return !["complete", "archived"].includes(task.status);
  }

  if (filter === "history") {
    return ["complete", "archived"].includes(task.status);
  }

  return task.status === filter;
}

function matchesQuickFilter(task, filter, currentUserId) {
  if (!filter || filter === "all") {
    return true;
  }

  if (["my", "assigned_to_me", "assigned"].includes(filter)) {
    return (task.assignee_ids || []).includes(currentUserId);
  }

  if (filter === "unassigned") {
    return (task.assignee_ids || []).length === 0;
  }

  if (["in_progress", "blocked"].includes(filter)) {
    return task.status === filter;
  }

  if (["overdue", "today", "week", "next_due"].includes(filter)) {
    return true;
  }

  return true;
}

function matchesAdvancedAssigneeFilter(task, filter, assigneeId, currentUserId) {
  if (filter === "me" || filter === "assigned_to_me") {
    return (task.assignee_ids || []).includes(currentUserId);
  }

  if (filter === "unassigned") {
    return (task.assignee_ids || []).length === 0;
  }

  if (assigneeId) {
    return (task.assignee_ids || []).includes(assigneeId);
  }

  return true;
}

function quickDueFilter(filter) {
  return ["overdue", "today", "week", "next_due"].includes(filter) ? filter : "";
}

function matchesDueFilter(task, filter, now, today, dueSoonCutoff) {
  if (!filter || filter === "all") {
    return true;
  }

  if (filter === "overdue") {
    return isActiveTask(task) && isTaskOverdue(task, now, today);
  }

  if (filter === "today") {
    return isActiveTask(task) && task.due_date === today && !isTaskOverdue(task, now, today);
  }

  if (filter === "week") {
    return isActiveTask(task) && isTaskDueSoon(task, now, today, dueSoonCutoff);
  }

  if (filter === "next_due") {
    return isActiveTask(task) && Boolean(task.due_date);
  }

  return true;
}

function sortCanonicalTasks(tasks, query = {}) {
  const sort = normalizedTaskSort(query.sort || query.sort_by || query.order);

  return [...tasks].sort((left, right) => compareCanonicalTasks(left, right, sort));
}

function compareCanonicalTasks(left, right, sort) {
  if (sort === "priority") {
    return priorityRank(right.priority) - priorityRank(left.priority) || compareByDueAt(left, right) || compareByStableTitle(left, right);
  }

  if (sort === "status") {
    return statusRank(left.status) - statusRank(right.status) || compareByDueAt(left, right) || compareByStableTitle(left, right);
  }

  if (sort === "last_worked") {
    return compareDesc(left.last_worked_at, right.last_worked_at) || compareByDueAt(left, right) || compareByStableTitle(left, right);
  }

  if (sort === "updated") {
    return compareDesc(left.updated_at, right.updated_at) || compareByDueAt(left, right) || compareByStableTitle(left, right);
  }

  if (sort === "context") {
    return String(left.client_name || "").localeCompare(String(right.client_name || "")) ||
      String(left.project_name || "").localeCompare(String(right.project_name || "")) ||
      compareByDueAt(left, right) ||
      compareByStableTitle(left, right);
  }

  if (sort === "created") {
    return compareDesc(left.created_at, right.created_at) || compareByStableTitle(left, right);
  }

  if (sort === "created_asc") {
    return String(left.created_at || "").localeCompare(String(right.created_at || "")) || compareByStableTitle(left, right);
  }

  return compareByDueAt(left, right) || priorityRank(right.priority) - priorityRank(left.priority) || compareByStableTitle(left, right);
}

function compareByDueAt(left, right) {
  return String(taskDueSortValue(left)).localeCompare(String(taskDueSortValue(right)));
}

function compareByStableTitle(left, right) {
  return String(left.title || "").localeCompare(String(right.title || "")) ||
    String(left.created_at || "").localeCompare(String(right.created_at || "")) ||
    String(left.task_id || "").localeCompare(String(right.task_id || ""));
}

function compareDesc(leftValue, rightValue) {
  return String(rightValue || "").localeCompare(String(leftValue || ""));
}

function taskDueSortValue(task) {
  if (task.due_at_utc) {
    return task.due_at_utc;
  }

  return `${task.due_date || "9999-12-31"}T${task.due_time || "23:59"}:00`;
}

function normalizedTaskFilter(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizedTaskView(value) {
  const taskView = normalizedTaskFilter(value);
  const aliases = {
    assigned: "my",
    assigned_to_me: "my",
    complete: "completed",
    due_today: "today",
    due_this_week: "week",
  };
  const normalized = aliases[taskView] || taskView;
  return TASK_VIEW_FILTERS.has(normalized) ? normalized : "";
}

function readBoolean(value) {
  return value === true || value === "true" || value === "1" || value === 1;
}

function hasQueryFilter(query, keys) {
  return keys.some((key) => Object.hasOwn(query || {}, key));
}

function normalizedTaskSort(value) {
  const sort = String(value || "due_at").trim().toLowerCase();
  const aliases = {
    due: "due_at",
    due_date: "due_at",
    due_time: "due_at",
    priority_desc: "priority",
    last_worked_at: "last_worked",
    recent: "updated",
    recently_updated: "updated",
    project_client: "context",
    client_project: "context",
    oldest: "created_asc",
  };

  return aliases[sort] || sort;
}

function statusRank(status) {
  return {
    blocked: 1,
    in_progress: 2,
    open: 3,
    complete: 4,
    archived: 5,
  }[status] || 99;
}

function isActiveTask(task) {
  return !["complete", "archived"].includes(task.status || "");
}

function isTaskOverdue(task, now, today) {
  if (!task.due_date) {
    return false;
  }

  if (task.due_time && task.due_at_utc) {
    const dueAt = new Date(task.due_at_utc);
    return !Number.isNaN(dueAt.getTime()) && dueAt.getTime() < now.getTime();
  }

  return task.due_date < today;
}

function isTaskDueSoon(task, now, today, dueSoonCutoff) {
  if (!task.due_date || task.due_date < today || task.due_date > dueSoonCutoff) {
    return false;
  }

  return !isTaskOverdue(task, now, today);
}

function taskSummaryRow(task, currentUserId = "") {
  return {
    task_id: task.task_id,
    title: task.title,
    description_excerpt: descriptionExcerpt(task.description),
    next_action: task.next_action || "",
    blocked_reason: task.status === "blocked" ? task.blocked_reason || "" : "",
    resume_note: task.resume_note || "",
    status: task.status,
    priority: task.priority,
    billable: task.billable,
    due_date: task.due_date,
    due_time: task.due_time,
    due_timezone: task.due_timezone,
    due_at_utc: task.due_at_utc,
    due_at: task.due_at_utc || task.due_date || "",
    last_worked_at: task.last_worked_at || task.updated_at || task.created_at || "",
    completionMetrics: taskCompletionMetrics(task),
    checklistProgress: task.checklistProgress || emptyChecklistProgress(),
    relationshipSummary: task.relationshipSummary || emptyRelationshipSummary(),
    client_id: task.client_id,
    client_name: task.client_name,
    project_id: task.project_id,
    project_name: task.project_name,
    assignee_ids: task.assignee_ids || [],
    assigned_to_current_user: (task.assignee_ids || []).includes(currentUserId),
    url: taskUrl(task),
    resumeContext: taskResumeContext(task),
  };
}

function taskWorkItemSummary(task, { currentUserId = "", timer = null } = {}) {
  const sourceUrl = taskUrl(task);
  const timerStatus = timer?.timer_status || "";
  const elapsedSeconds = timer ? Number(timer.accumulated_elapsed_seconds) || 0 : 0;
  const resumeContext = taskResumeContext(task);

  return {
    source_module_id: TASKS_MODULE_ID,
    source_type: "task",
    source_id: task.task_id,
    source_label: task.title,
    source_url: sourceUrl,
    source: {
      module_id: TASKS_MODULE_ID,
      type: "task",
      id: task.task_id,
      label: task.title,
      url: sourceUrl,
      enabled: true,
    },
    task_id: task.task_id,
    title: task.title,
    description: task.description || "",
    description_excerpt: descriptionExcerpt(task.description),
    status: task.status || "open",
    priority: task.priority || "normal",
    due_date: task.due_date || "",
    due_time: task.due_time || "",
    due_at: task.due_at_utc || task.due_date || "",
    due_at_utc: task.due_at_utc || "",
    client_id: task.client_id || "",
    client_name: task.client_name || "",
    project_id: task.project_id || "",
    project_name: task.project_name || "",
    assignee_ids: task.assignee_ids || [],
    assignees: task.assignees || [],
    assigned_to_current_user: (task.assignee_ids || []).includes(currentUserId),
    direct_tags: safeTaskTags(task.directTags),
    directTags: safeTaskTags(task.directTags),
    propagated_tag_count: Array.isArray(task.propagatedTags) ? task.propagatedTags.length : 0,
    propagatedTagCount: Array.isArray(task.propagatedTags) ? task.propagatedTags.length : 0,
    next_action: task.next_action || "",
    blocked_reason: task.status === "blocked" ? task.blocked_reason || "" : "",
    resume_note: task.resume_note || "",
    checklist_progress: task.checklistProgress || emptyChecklistProgress(),
    checklistProgress: task.checklistProgress || emptyChecklistProgress(),
    relationship_summary: task.relationshipSummary || emptyRelationshipSummary(),
    relationshipSummary: task.relationshipSummary || emptyRelationshipSummary(),
    timer_status: timerStatus,
    elapsed_seconds: elapsedSeconds,
    timer,
    last_worked_at: task.last_worked_at || task.updated_at || task.created_at || "",
    updated_at: task.updated_at || "",
    completion_metrics: taskCompletionMetrics(task),
    completionMetrics: taskCompletionMetrics(task),
    active_candidate: resumeContext.active_candidate,
    resume_context: resumeContext,
    resumeContext,
  };
}

function safeTaskTags(tags = []) {
  return (Array.isArray(tags) ? tags : [])
    .map((tag) => ({
      color: tag.color || "",
      name: tag.name || tag.slug || "",
      slug: tag.slug || "",
      tag_id: tag.tag_id || "",
    }))
    .filter((tag) => tag.tag_id && tag.name);
}

function descriptionExcerpt(description, maxLength = 160) {
  const text = String(description || "").replace(/\s+/g, " ").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 1).trim()}...` : text;
}

function taskCalendarRow(task) {
  const base = taskSummaryRow(task);

  return {
    ...base,
    id: task.task_id,
    allDay: !task.due_time,
    startDate: task.due_date,
    startDateTimeUtc: task.due_at_utc || "",
    endDate: task.due_date,
    source: {
      type: "task",
      id: task.task_id,
    },
  };
}

function taskUrl(task) {
  return `tasks.html?task=${encodeURIComponent(task.task_id || "")}`;
}

function priorityRank(priority) {
  return {
    urgent: 4,
    high: 3,
    normal: 2,
    low: 1,
  }[priority] || 0;
}

function localDateKey(date, timezone = "America/New_York") {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone || "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function addDaysKey(dateKey, days) {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return localDateKey(date);
}

function currentWeekEndKey(dateKey) {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  const daysUntilSaturday = (6 - date.getUTCDay() + 7) % 7;
  return addCalendarDaysKey(dateKey, daysUntilSaturday);
}

function addCalendarDaysKey(dateKey, days) {
  const date = new Date(`${dateKey}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function isActiveStatus(status) {
  return !["inactive", "archived"].includes(String(status || "").trim().toLowerCase());
}

function assigneesChanged(previousTask, nextTask) {
  const previous = [...(previousTask.assignee_ids || [])].sort().join(",");
  const next = [...(nextTask.assignee_ids || [])].sort().join(",");

  return previous !== next;
}

async function recordTaskAudit({ session, action, changeType, previousValue, newValue }) {
  await auditService.record({
    session,
    action,
    changeType,
    recordType: "task",
    recordId: newValue?.task_id || previousValue?.task_id,
    recordLabel: newValue?.title || previousValue?.title,
    recordUrl: `tasks.html?task=${encodeURIComponent(newValue?.task_id || previousValue?.task_id || "")}`,
    previousValue,
    newValue,
    metadata: {
      summary: taskAuditSummary(previousValue, newValue),
      task_id: newValue?.task_id || previousValue?.task_id,
      client_id: newValue?.client_id || previousValue?.client_id || "",
      client_name: newValue?.client_name || previousValue?.client_name || "",
      project_id: newValue?.project_id || previousValue?.project_id || "",
      project_name: newValue?.project_name || previousValue?.project_name || "",
      assignee_ids: newValue?.assignee_ids || [],
      next_action: newValue?.next_action || previousValue?.next_action || "",
      blocked_reason: newValue?.blocked_reason || previousValue?.blocked_reason || "",
      resume_note: newValue?.resume_note || previousValue?.resume_note || "",
      checklist_progress: (newValue || previousValue)?.checklistProgress || emptyChecklistProgress(),
      relationship_summary: (newValue || previousValue)?.relationshipSummary || emptyRelationshipSummary(),
      resume_context: taskResumeContext(newValue || previousValue || {}),
    },
  });
}

async function emitTaskEvent(eventName, { session, previousValue, newValue, metadata = {} }) {
  const task = newValue || previousValue || {};

  await modulesService.emitInternalEvent(eventName, {
    session,
    moduleId: TASKS_MODULE_ID,
    recordType: "task",
    recordId: task.task_id,
    previousValue,
    newValue,
    source: session?.api_key_id ? "public_api" : "manual",
    metadata: {
      task_id: task.task_id,
      client_id: task.client_id || "",
      project_id: task.project_id || "",
      status: task.status || "",
      last_worked_at: task.last_worked_at || "",
      completion_metrics: taskCompletionMetrics(task),
      checklist_progress: task.checklistProgress || emptyChecklistProgress(),
      relationship_summary: task.relationshipSummary || emptyRelationshipSummary(),
      next_action: task.next_action || "",
      blocked_reason: task.status === "blocked" ? task.blocked_reason || "" : "",
      resume_note: task.resume_note || "",
      resume_context: taskResumeContext(task),
      ...metadata,
    },
  });
}

async function emitTaskRelationshipEvent(eventName, { session, relationship, parentTask, childTask }) {
  await modulesService.emitInternalEvent(eventName, {
    session,
    moduleId: TASKS_MODULE_ID,
    recordType: "task_relationship",
    recordId: relationship.task_relationship_id,
    previousValue: null,
    newValue: relationship,
    source: session?.api_key_id ? "public_api" : "manual",
    metadata: {
      task_relationship_id: relationship.task_relationship_id,
      parent_task_id: parentTask.task_id,
      parent_title: parentTask.title,
      child_task_id: childTask.task_id,
      child_title: childTask.title,
      is_blocking: relationship.is_blocking,
      relationship_summary: taskRelationshipsRepository.relationshipSummary
        ? await taskRelationshipsRepository.relationshipSummary(session.workspace_id, parentTask.task_id)
        : emptyRelationshipSummary(),
    },
  });
}

async function syncTaskSearchIndex(workspaceId, taskId, reason) {
  await searchIndexSyncService.reindexRecord({
    workspaceId,
    moduleId: TASKS_MODULE_ID,
    recordType: "task",
    recordId: taskId,
    reason,
  });
}

async function recordRecurrenceAudit({ session, action, changeType, previousValue, newValue }) {
  const templateId = newValue?.recurrence_template_id || previousValue?.recurrence_template_id || "";

  await auditService.record({
    session,
    action,
    changeType,
    recordType: "task_recurrence_template",
    recordId: templateId,
    recordLabel: newValue?.title || previousValue?.title || "Task recurrence",
    recordUrl: `tasks.html?task=${encodeURIComponent(newValue?.task_id || previousValue?.task_id || "")}`,
    previousValue,
    newValue,
    metadata: {
      summary: templateId
        ? `Updated recurring task series for "${newValue?.title || previousValue?.title || "Task"}"`
        : `Created recurring task series for "${newValue?.title || "Task"}"`,
      recurrence_template_id: templateId,
      task_id: newValue?.task_id || previousValue?.task_id || "",
    },
  });
}

function readRecurrencePayload(payload = {}) {
  const raw = payload.recurrence || payload.recurrenceDetails || {};
  const hasPayload = Object.hasOwn(payload, "recurrence") || Object.hasOwn(payload, "recurrenceDetails");

  return {
    hasPayload,
    enabled: Boolean(raw.enabled),
    applyTo: raw.applyTo === "future" ? "future" : "instance",
    frequency: raw.frequency,
    interval: raw.interval,
    endDate: raw.endDate || raw.end_date || "",
  };
}

function taskAuditSummary(previousTask, nextTask) {
  if (!previousTask && nextTask) {
    return `Created task "${nextTask.title}"`;
  }

  if (previousTask && !nextTask) {
    return `Removed task "${previousTask.title}"`;
  }

  const changes = [];

  if (previousTask?.status !== nextTask?.status) {
    changes.push(`status ${formatAuditToken(previousTask?.status)} to ${formatAuditToken(nextTask?.status)}`);
  }

  if (previousTask?.priority !== nextTask?.priority) {
    changes.push(`priority ${formatAuditToken(previousTask?.priority)} to ${formatAuditToken(nextTask?.priority)}`);
  }

  if (previousTask?.due_date !== nextTask?.due_date || previousTask?.due_time !== nextTask?.due_time) {
    changes.push(`due ${formatAuditDue(previousTask)} to ${formatAuditDue(nextTask)}`);
  }

  if (previousTask?.next_action !== nextTask?.next_action) {
    changes.push("next action");
  }

  if (previousTask?.blocked_reason !== nextTask?.blocked_reason) {
    changes.push("blocked reason");
  }

  if (previousTask?.resume_note !== nextTask?.resume_note) {
    changes.push("resume note");
  }

  if (previousTask?.client_id !== nextTask?.client_id || previousTask?.project_id !== nextTask?.project_id) {
    changes.push(`scope ${formatAuditScope(previousTask)} to ${formatAuditScope(nextTask)}`);
  }

  if (assigneesChanged(previousTask || {}, nextTask || {})) {
    changes.push(`assignees ${nextTask?.assignees?.length || 0}`);
  }

  return changes.length > 0
    ? `Updated task "${nextTask?.title || previousTask?.title}": ${changes.join(", ")}`
    : `Updated task "${nextTask?.title || previousTask?.title}"`;
}

function formatAuditToken(value) {
  return String(value || "none").replaceAll("_", " ");
}

function formatAuditDue(task) {
  if (!task?.due_date) {
    return "none";
  }

  return task.due_time ? `${task.due_date} ${task.due_time}` : task.due_date;
}

function formatAuditScope(task) {
  if (task?.client_name && task?.project_name) {
    return `${task.client_name} / ${task.project_name}`;
  }

  return task?.project_name || task?.client_name || "workspace";
}

function taskResumeContext(task = {}) {
  const activeCandidate = !["complete", "archived"].includes(task.status || "");

  return {
    source_module_id: TASKS_MODULE_ID,
    source_type: "task",
    source_id: task.task_id || "",
    source_label: task.title || "",
    source_url: task.task_id ? taskUrl(task) : "",
    status: task.status || "open",
    last_worked_at: task.last_worked_at || task.updated_at || task.created_at || "",
    completion_metrics: taskCompletionMetrics(task),
    next_action: task.next_action || "",
    blocked_reason: task.status === "blocked" ? task.blocked_reason || "" : "",
    resume_note: task.resume_note || "",
    checklist_progress: task.checklistProgress || emptyChecklistProgress(),
    relationship_summary: task.relationshipSummary || emptyRelationshipSummary(),
    active_candidate: activeCandidate,
    client_id: task.client_id || "",
    client_name: task.client_name || "",
    project_id: task.project_id || "",
    project_name: task.project_name || "",
    updated_at: task.updated_at || "",
  };
}

function taskChecklistProgress(items = []) {
  const activeItems = Array.isArray(items) ? items.filter((item) => !item.deleted_at) : [];
  const completedCount = activeItems.filter((item) => item.is_checked).length;
  const nextIncomplete = activeItems.find((item) => !item.is_checked);

  return {
    total_count: activeItems.length,
    completed_count: completedCount,
    open_count: activeItems.length - completedCount,
    next_incomplete_item_label: nextIncomplete?.label || "",
    percent_complete: activeItems.length > 0 ? Math.round((completedCount / activeItems.length) * 100) : 0,
  };
}

function emptyChecklistProgress() {
  return taskChecklistProgress([]);
}

function emptyRelationshipSummary() {
  return {
    child_count: 0,
    blocking_child_count: 0,
    incomplete_blocking_child_count: 0,
    parent_count: 0,
    blocking_parent_count: 0,
  };
}

function taskCompletionMetrics(task = {}) {
  const createdAt = task.created_at || "";
  const completedAt = task.completed_at || "";
  const durationSeconds = completedAt ? secondsBetweenIso(createdAt, completedAt) : null;

  return {
    created_at: createdAt,
    completed_at: completedAt,
    duration_seconds: durationSeconds,
    duration_label: durationSeconds === null ? "" : formatDurationLabel(durationSeconds),
  };
}

function secondsBetweenIso(start, end) {
  const startTime = Date.parse(start || "");
  const endTime = Date.parse(end || "");

  if (!Number.isFinite(startTime) || !Number.isFinite(endTime) || endTime < startTime) {
    return null;
  }

  return Math.round((endTime - startTime) / 1000);
}

function formatDurationLabel(totalSeconds) {
  const seconds = Math.max(0, Number(totalSeconds) || 0);
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (days > 0) {
    return `${days}d ${hours}h`;
  }

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }

  if (minutes > 0) {
    return `${minutes}m`;
  }

  return `${seconds}s`;
}

export const tasksService = {
  addChecklistItem,
  addChildTask,
  archive,
  bulkUpdate,
  calendarWindow,
  checkChecklistItem,
  complete,
  create,
  deleteChecklistItem,
  list,
  listAll,
  listChecklistItems,
  listWorkItems,
  listRelationships,
  read,
  reopen,
  removeChildTaskRelationship,
  reorderChecklistItems,
  restore,
  summary,
  uncheckChecklistItem,
  update,
  updateChecklistItem,
  updateChildTaskRelationship,
};
