import {
  CreateTaskSchema,
  TaskChecklistItemCreateSchema,
  TaskChecklistItemUpdateSchema,
  TaskChecklistReorderSchema,
  TaskChildRelationshipSchema,
  TaskRecurrenceMaterializeSchema,
  UpdateTaskSchema,
  parseTasksEdgePayload,
} from "./tasks.contracts.js";
import { tasksRepository } from "./tasks.repo.js";
import { taskChecklistsRepository } from "./task-checklists.repo.js";
import { taskRecurrenceService } from "./task-recurrence.service.js";
import { taskRelationshipsRepository } from "./task-relationships.repo.js";
import { taskRemindersService } from "./task-reminders.service.js";
import { tasksSettingsService } from "./tasks-settings.service.js";
import { taskTimersService } from "./task-timers.service.js";
import { taskWorkEvidenceService } from "./task-work-evidence.service.js";
import { taskCalendarRecurrenceInstanceKey } from "./task-calendar.shared.js";
import {
  TaskListCursorError,
  compareTaskDueOrder,
  compareTaskStableTitle,
  createTaskListFilterContext,
  encodeTaskCursor,
  normalizeTaskListPagination,
  sortCanonicalTasks,
  stripTaskListCandidateMetadata,
  taskMatchesCanonicalQuery,
  taskMatchesContextFilters,
  taskMatchesStatusFilter,
  visibleTaskListCandidates,
} from "./task-list-engine.js";
import {
  childStatusRollupEffect,
  isIncompleteTask,
  isTaskTerminalStatus,
  planParentBlockTransition,
  planParentRecoveryTransition,
  shouldPauseRunningTimersForBlockedTask,
} from "./task-block-recovery-engine.js";
import {
  queueTaskRecurrenceGeneration,
  queueTaskReminderJobsForTask,
} from "./task-jobs.service.js";
import { notesService } from "../notes/notes.service.js";
import { clientsService } from "../client-projects/clients.service.js";
import { clientsRepository } from "../client-projects/clients.repo.js";
import { projectsRepository } from "../client-projects/projects.repo.js";
import { settingsRepository } from "../../repositories/settings.repo.js";
import { permissionsRepository } from "../../repositories/permissions.repo.js";
import { modulesService } from "../../core/modules/modules.service.js";
import { usersRepository } from "../../repositories/users.repo.js";
import { assertModuleWriteEnabled } from "../../core/modules/module-access.js";
import { auditService } from "../../core/audit.js";
import { resolveClientProjectFilterScope } from "../../core/client-project-filter-scope.js";
import { createVisibleRecordBatch } from "../../core/list-enrichment.js";
import { tagsService } from "../../services/tags.service.js";
import { searchIndexSyncService } from "../../services/search-index-sync.service.js";
import { AppError } from "../../core/errors.js";
import { permissionsService } from "../../core/permissions.js";
import { normalizeUtcIso } from "../../utils/timezones.js";
import { workspaceSupportsBillable } from "../../utils/workspaces.js";

const TASKS_MODULE_ID = "tasks";
const STATUSES = new Set(["open", "in_progress", "blocked", "complete", "archived"]);
const PRIORITIES = new Set(["low", "normal", "high", "urgent"]);
const TASK_LIST_DEFAULT_PAGE_SIZE = 100;
const TASK_LIST_MAX_PAGE_SIZE = 200;
const TASK_LIST_BATCH_MULTIPLIER = 5;
const TASK_LIST_MAX_CANDIDATE_SCAN = 1000;
const TASK_OPTION_MAX_ITEMS = 200;
const TASK_WORK_ITEM_MAX_ITEMS = 200;
const TASK_CALENDAR_WINDOW_MAX_DAYS = 93;
const TASK_CALENDAR_REMINDER_LOOKAHEAD_DAYS = 7;
const DASHBOARD_TASK_ATTENTION_LIMIT = 5;
const DASHBOARD_TASK_UPCOMING_LIMIT = 5;
const DASHBOARD_TASK_PRESSURE_LIMIT = 5;
const DASHBOARD_WORKBENCH_URL = "workbench.html";
const DASHBOARD_TASKS_URL = "tasks.html";

async function list(session, query = {}) {
  const { options, pagination, tasks } = await queryTasks(session, query, { paginate: true });
  if (!pagination) {
    throw new Error("Task list pagination invariant failed.");
  }

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
  const repositoryQuery = await taskListRepositoryQuery(session, query);
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
      resolvedQuery: repositoryQuery,
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

async function filterAndShapeTaskListCandidates({ candidates, offset, query, resolvedQuery, session, timerByTaskId }) {
  const canReadTaskRow = await permissionsService.createPermissionEvaluator(session, "tasks.view");
  const readableTasks = visibleTaskListCandidates(
    candidates,
    offset,
    (task) => canReadTaskRow(taskResource(task)),
  );

  const taggedTasks = await tagsService.decorateRecordsForTarget(
    session,
    "task",
    await tagsService.filterRecordsByTags(session, "task", readableTasks, query.tagIds || query.tag_ids || query.tags),
  );
  const tasksWithDetails = await attachTaskListProjectionDetails(taggedTasks, session, { canReadTaskRow });

  return tasksWithDetails.filter((task) => taskMatchesCanonicalQuery(task, resolvedQuery, timerByTaskId));
}

async function queryTasksResult({ includeOptions = true, pagination, query, session, tasks, timers, nextCursor = "" }) {
  return {
    tasks: sortCanonicalTasks(tasks, query),
    currentUserId: session.user_id,
    options: includeOptions ? await readOptions(session) : null,
    pagination: pagination ? {
      hasMore: Boolean(nextCursor),
      limit: pagination.pageSize,
      nextCursor,
      pageSize: pagination.pageSize,
    } : null,
    timers,
  };
}

async function taskListRepositoryQuery(session, query = {}) {
  const now = new Date();
  const today = localDateKey(now, session.timezone);
  const scope = await resolveClientProjectFilterScope(session, {
    clientId: String(query.clientId || query.client_id || "").trim(),
    hasClientFilter: hasQueryFilter(query, ["clientId", "client_id"]),
    hasProjectFilter: hasQueryFilter(query, ["projectId", "project_id"]),
    projectId: String(query.projectId || query.project_id || "").trim(),
  });

  return createTaskListFilterContext(query, {
    currentUserId: session.user_id,
    currentWeekEnd: currentWeekEndKey(today),
    dueSoonCutoff: addDaysKey(today, 7),
    nowIso: now.toISOString(),
    scope,
    today,
  });
}

function normalizeTaskPagination(query = {}, options = {}) {
  try {
    return normalizeTaskListPagination(query, {
      defaultPageSize: TASK_LIST_DEFAULT_PAGE_SIZE,
      maxPageSize: TASK_LIST_MAX_PAGE_SIZE,
      paginate: options.paginate === true,
    });
  } catch (error) {
    if (error instanceof TaskListCursorError) {
      throw new AppError(error.message, 400);
    }
    throw error;
  }
}

async function summary(session) {
  const now = new Date();
  const today = localDateKey(now, session.timezone);
  const dueSoonCutoff = addDaysKey(today, 7);
  const [timerResult, settings, countGroups, candidateTasks, canReadTaskRow] = await Promise.all([
    taskTimersService.list(session),
    settingsRepository.readWorkspaceSettings(session.workspace_id, session),
    tasksRepository.readDashboardCountGroups(session.workspace_id, session.user_id, {
      dueSoonCutoff,
      nowIso: now.toISOString(),
      today,
    }),
    tasksRepository.readDashboardCandidates(session.workspace_id, session.user_id, {
      candidateLimit: Math.max(
        DASHBOARD_TASK_ATTENTION_LIMIT,
        DASHBOARD_TASK_UPCOMING_LIMIT,
        DASHBOARD_TASK_PRESSURE_LIMIT,
        5,
      ),
      dueSoonCutoff,
      nowIso: now.toISOString(),
      today,
    }),
    permissionsService.createPermissionEvaluator(session, "tasks.view"),
  ]);
  const timers = timerResult.timers || [];
  const counts = reduceDashboardCountGroups(
    countGroups.filter((group) => canReadTaskRow(taskResource(group))),
  );
  const tasks = await attachTaskListProjectionDetails(
    candidateTasks.filter((task) => canReadTaskRow(taskResource(task))),
    session,
    { canReadTaskRow },
  );
  const timerByTaskId = new Map((timers || [])
    .filter((timer) => timer.task_id)
    .map((timer) => [timer.task_id, timer]));
  const activeTasks = tasks.filter(isActiveTask);
  const assignedToMe = activeTasks.filter((task) => (task.assignee_ids || []).includes(session.user_id));
  const overdue = activeTasks.filter((task) => isTaskOverdue(task, now, today));
  const dueSoon = activeTasks.filter((task) =>
    isTaskDueSoon(task, now, today, dueSoonCutoff),
  );
  const dashboardContext = {
    currentUserId: session.user_id,
    dueSoonCutoff,
    now,
    timerByTaskId,
    today,
    workspaceType: settings.workspaceType || "business",
  };
  const attentionRows = dashboardAttentionRows(activeTasks, dashboardContext);
  const upcomingRows = dashboardUpcomingRows(activeTasks, dashboardContext);

  return {
    counts,
    metrics: {
      overdue: dashboardTaskMetric("Overdue", counts.overdue),
      dueSoon: dashboardTaskMetric("Due soon", counts.dueSoon),
      blocked: dashboardTaskMetric("Blocked", counts.blocked),
      assignedToMe: dashboardTaskMetric("Assigned to me", counts.assignedToMe, DASHBOARD_TASKS_URL),
    },
    actions: dashboardTaskActions(),
    attentionRows,
    upcomingRows,
    pressureRows: attentionRows.slice(0, DASHBOARD_TASK_PRESSURE_LIMIT),
    overdue: sortTaskSummaryRows(overdue).slice(0, 5).map((task) => taskSummaryRow(task, session.user_id)),
    dueSoon: sortTaskSummaryRows(dueSoon).slice(0, 5).map((task) => taskSummaryRow(task, session.user_id)),
    assignedToMe: sortTaskSummaryRows(assignedToMe).slice(0, 5).map((task) => taskSummaryRow(task, session.user_id)),
  };
}

async function listWorkItems(session, query = {}) {
  const result = await queryTasks(session, {
    limit: TASK_WORK_ITEM_MAX_ITEMS,
    status: "active",
    sort: "due_at",
    ...query,
  }, {
    includeOptions: false,
    paginate: true,
  });
  const timerByTaskId = new Map((result.timers || []).map((timer) => [timer.task_id, timer]));

  return {
    source_module_id: TASKS_MODULE_ID,
    source_type: "task",
    items: result.tasks.map((task) => taskWorkItemSummary(task, {
      currentUserId: session.user_id,
      timer: timerByTaskId.get(task.task_id),
    })),
  };
}

function reduceDashboardCountGroups(groups = []) {
  const counts = {
    active: 0,
    assignedToMe: 0,
    activeTimers: 0,
    blocked: 0,
    overdue: 0,
    dueSoon: 0,
    completed: 0,
    archived: 0,
  };

  for (const group of groups) {
    for (const key of Object.keys(counts)) {
      counts[key] += Number(group[key]) || 0;
    }
  }

  return counts;
}

async function listOptions(session) {
  return {
    currentUserId: session.user_id,
    options: await readOptions(session),
  };
}

async function listWorkbenchItems(session, query = {}) {
  const [moduleStatus, result] = await Promise.all([
    modulesService.readModuleStatus(session.workspace_id, TASKS_MODULE_ID),
    listWorkItems(session, query),
  ]);

  return {
    ...result,
    source_enabled: moduleStatus === "enabled",
  };
}

async function calendarWindow(session, query = {}) {
  const today = localDateKey(new Date(), session.timezone);
  const startDate = normalizeDueDate(query.start || query.startDate || query.start_date) || today;
  const endDate = normalizeDueDate(query.end || query.endDate || query.end_date) || addDaysKey(startDate, 30);

  if (endDate < startDate) {
    throw new AppError("Calendar end date must be on or after the start date.", 400);
  }

  if (calendarDayCount(startDate, endDate) > TASK_CALENDAR_WINDOW_MAX_DAYS) {
    throw new AppError(`Calendar range cannot exceed ${TASK_CALENDAR_WINDOW_MAX_DAYS} days.`, 400);
  }

  const reminderLookaheadEndDate = addCalendarDaysKey(endDate, TASK_CALENDAR_REMINDER_LOOKAHEAD_DAYS);
  const statuses = normalizeCalendarStatuses(query.statuses || query.status);
  const [scope, moduleStatus, dueTasks, activeTemplates, materializedInstances] = await Promise.all([
    resolveClientProjectFilterScope(session, {
      clientId: String(query.clientId || query.client_id || "").trim(),
      hasClientFilter: hasQueryFilter(query, ["clientId", "client_id"]),
      hasProjectFilter: hasQueryFilter(query, ["projectId", "project_id"]),
      projectId: String(query.projectId || query.project_id || "").trim(),
    }),
    modulesService.readModuleStatus(session.workspace_id, TASKS_MODULE_ID),
    tasksRepository.readDueBetween(session.workspace_id, startDate, reminderLookaheadEndDate, { statuses }),
    statuses.includes("open")
      ? taskRecurrenceService.listActiveTemplates(session.workspace_id, {
          fromDate: startDate,
          includeAssignees: false,
          throughDate: endDate,
        })
      : Promise.resolve([]),
    tasksRepository.readRecurrenceInstancesBetween(session.workspace_id, startDate, endDate),
  ]);
  const canReadTaskRow = await permissionsService.createPermissionEvaluator(session, "tasks.view");
  const readableTasks = dueTasks.filter((task) => (
    taskMatchesContextFilters(task, scope) && canReadTaskRow(taskResource(task))
  ));
  const readableTemplates = activeTemplates.filter((template) => (
    taskMatchesContextFilters(template, scope) && canReadTaskRow(taskResource(template))
  ));
  const materializedInstanceKeys = new Set(materializedInstances.map((task) => (
    taskCalendarRecurrenceInstanceKey(task.recurrence_template_id, task.recurrence_instance_date)
  )));
  const calendarRows = [
    ...readableTasks
      .filter((task) => task.due_date <= endDate)
      .map(taskCalendarRow),
    ...readableTemplates.flatMap((template) => (
      taskRecurrenceService.projectOccurrenceDates(template, startDate, endDate)
        .filter((instanceDate) => !materializedInstanceKeys.has(
          taskCalendarRecurrenceInstanceKey(template.recurrence_template_id, instanceDate),
        ))
        .map((instanceDate) => virtualTaskCalendarRow(template, instanceDate))
    )),
  ].sort(compareTaskCalendarRows);

  return {
    range: {
      startDate,
      endDate,
    },
    source_enabled: moduleStatus === "enabled",
    tasks: calendarRows,
    reminders: await calendarReminderMarkers(session, readableTasks, startDate, endDate),
  };
}

async function materializeRecurrenceInstance(rawPayload, session) {
  await assertModuleWriteEnabled(session, TASKS_MODULE_ID);
  const payload = parseTasksEdgePayload(TaskRecurrenceMaterializeSchema, rawPayload);
  const templateId = String(payload.templateId || payload.template_id || "").trim();
  const instanceDate = normalizeDueDate(payload.instanceDate || payload.instance_date);

  if (!templateId || !instanceDate) {
    throw new AppError("Recurrence template ID and instance date are required.", 400);
  }

  const existing = await tasksRepository.readByRecurrenceInstance(
    session.workspace_id,
    templateId,
    instanceDate,
  );
  if (existing) {
    await assertCanEditTask(session, existing);
    return {
      task: await readTaggedTaskWithDetails(session, existing.task_id),
      wasCreated: false,
    };
  }

  const template = await taskRecurrenceService.readTemplate(session.workspace_id, templateId);
  const isProjectedOccurrence = template?.template_status === "active"
    && taskRecurrenceService.projectOccurrenceDates(template, instanceDate, instanceDate).includes(instanceDate);

  if (!template || !isProjectedOccurrence) {
    throw new AppError("Planned recurrence occurrence not found.", 404);
  }

  await assertCanEditTask(session, template);
  const result = await taskRecurrenceService.materializeInstance({
    session,
    template,
    instanceDate,
    createTask: {
      findExisting: (candidateTemplateId, candidateInstanceDate) => (
        tasksRepository.readByRecurrenceInstance(
          session.workspace_id,
          candidateTemplateId,
          candidateInstanceDate,
        )
      ),
      create: (nextTask) => tasksRepository.createRecurrenceInstance(session.workspace_id, {
        ...nextTask,
        created_by_user_id: template.created_by_user_id || session.user_id,
        updated_by_user_id: session.user_id,
        completed_at: "",
        completed_by_user_id: "",
        archived_at: "",
        archived_by_user_id: "",
        last_worked_at: new Date().toISOString(),
      }),
    },
  });

  if (!result?.task?.task_id) {
    throw new AppError("The planned recurrence occurrence could not be opened.", 409);
  }

  await assertCanEditTask(session, result.task);
  const taskWithDetails = await readTaggedTaskWithDetails(session, result.task.task_id);

  if (result.wasCreated) {
    await recordTaskAudit({
      session,
      action: "task_recurrence_instance_materialized",
      changeType: "create",
      previousValue: null,
      newValue: taskWithDetails,
    });
    await emitTaskEvent("task.created", {
      session,
      previousValue: null,
      newValue: taskWithDetails,
      metadata: {
        materialized_on_touch: true,
        recurrence_instance_date: instanceDate,
        recurrence_template_id: templateId,
      },
    });
    await syncTaskSearchIndex(
      session.workspace_id,
      taskWithDetails.task_id,
      "task.recurrence_instance_materialized",
    );
    await queueTaskReminderJobsForTask(taskWithDetails, {
      reason: "task.recurrence_instance_materialized",
      session,
    });
  }

  return {
    task: taskWithDetails,
    wasCreated: result.wasCreated,
  };
}

async function calendarReminderMarkers(session, readableTasks, startDate, endDate) {
  const candidates = readableTasks.filter((task) => !["complete", "archived"].includes(task.status));
  const occurrencesByTaskId = await taskRemindersService.computeReminderOccurrencesForTasks(session.workspace_id, candidates);
  const markers = [];

  for (const task of candidates) {
    for (const occurrence of occurrencesByTaskId.get(task.task_id) || []) {
      const date = localDateKey(new Date(occurrence.reminder_at_utc), session.timezone);

      if (date >= startDate && date <= endDate) {
        markers.push({
          task_id: task.task_id,
          title: task.title,
          date,
          reminder_at_utc: occurrence.reminder_at_utc,
          due_at_utc: occurrence.due_at_utc,
          due_kind: occurrence.due_kind,
          offset_minutes: occurrence.offset_minutes,
          source: occurrence.source,
          url: taskUrl(task),
        });
      }
    }
  }

  return markers.sort((first, second) => first.reminder_at_utc.localeCompare(second.reminder_at_utc)
    || first.task_id.localeCompare(second.task_id));
}

async function read(taskId, session) {
  const task = await readTaskOrThrow(session.workspace_id, taskId);
  await assertCanReadTask(session, task);

  return {
    task: await attachTaskDetails((await tagsService.decorateRecordsForTarget(session, "task", [task]))[0], session),
    currentUserId: session.user_id,
    options: await readOptions(session),
  };
}

// Lightweight permission-checked read for callers (resume-state read checks)
// that need only the raw task, without options or detail enrichment.
async function readCore(taskId, session) {
  const task = await readTaskOrThrow(session.workspace_id, taskId);
  await assertCanReadTask(session, task);

  return {
    task,
    currentUserId: session.user_id,
  };
}

// Batched existence/status/readability check for resume-state scans: one
// IN-query over the record ids plus the in-memory permission evaluator.
async function readLifecycleForIds(session, taskIds = []) {
  const [statusRows, canReadTaskRow] = await Promise.all([
    tasksRepository.readStatusByIds(session.workspace_id, taskIds),
    permissionsService.createPermissionEvaluator(session, "tasks.view"),
  ]);
  const lifecycleByTaskId = new Map();

  for (const row of statusRows) {
    lifecycleByTaskId.set(row.task_id, canReadTaskRow(taskResource(row))
      ? {
          archived: row.status === "archived",
          completed: row.status === "complete",
          readable: true,
          status: row.status || "open",
        }
      : { readable: false });
  }

  return lifecycleByTaskId;
}

async function create(rawPayload, session) {
  await assertModuleWriteEnabled(session, TASKS_MODULE_ID);
  const payload = parseTasksEdgePayload(CreateTaskSchema, rawPayload);
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
      task_id: payload?.task_id || payload?.id,
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
  await queueTaskReminderJobsForTask(taskWithDetails, {
    reason: "task.created",
    session,
  });

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

async function update(taskId, rawPayload, session) {
  await assertModuleWriteEnabled(session, TASKS_MODULE_ID);
  const previousTask = await readTaskOrThrow(session.workspace_id, taskId);
  await assertCanEditTask(session, previousTask);
  const payload = applyResumeNoteAction(
    parseTasksEdgePayload(UpdateTaskSchema, rawPayload),
    previousTask,
  );
  if (payload.resume_note_action === "consume" && !String(previousTask.resume_note || "").trim()) {
    const unchangedTask = await readTaggedTaskWithDetails(session, previousTask.task_id);
    return {
      task: unchangedTask,
      tasks: [unchangedTask],
      recurrenceContinuity: null,
      recurrenceJob: null,
    };
  }
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

  const projectCascade = previousProjectId !== normalizedTask.project_id
    ? await prepareProjectCascade(session, previousTask.task_id, normalizedTask)
    : emptyProjectCascade();

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
    await syncRecurringChecklistStructure({
      session,
      sourceTask: previousTask,
    });
    await syncRecurringLinkedNoteStructure({
      session,
      sourceTask: previousTask,
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

  const updatedTaskRows = projectCascade.allPreviousTasks.length > 0
    ? await tasksRepository.updateProjectCascade(session.workspace_id, normalizedTask, projectCascade.changedTasks)
    : [await tasksRepository.update(session.workspace_id, normalizedTask)];
  const task = updatedTaskRows.find((candidate) => candidate.task_id === normalizedTask.task_id) || updatedTaskRows[0];
  await pauseRunningTimersForBlockedTask(task, session);
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
  await queueTaskReminderJobsForTask(taskWithDetails, {
    reason: "task.updated",
    session,
  });
  const parentRollupEffect = childStatusRollupEffect(previousTask.status, taskWithDetails.status);
  if (parentRollupEffect === "block_parents") {
    await blockParentsForIncompleteChild(session, taskWithDetails);
  } else if (parentRollupEffect === "recover_parents") {
    await recoverParentsAfterChildStatusChange(session, taskWithDetails);
  }
  if (assigneesChanged(previousTask, taskWithDetails)) {
    await emitTaskEvent("task.assigned", {
      session,
      previousValue: previousTask,
      newValue: taskWithDetails,
    });
  }

  const cascadedTasks = await finalizeProjectCascadeSideEffects({
    cascade: projectCascade,
    rootTaskId: taskWithDetails.task_id,
    session,
  });

  // A task can also reach "complete" through this generic update path (edit-dialog status
  // dropdown, bulk status action), not just the dedicated complete() endpoint. Queue the next
  // recurrence instance here too so the chain never silently stalls. Safe for non-recurring
  // tasks (skipped) and deduped against complete() by template + instance date.
  let recurrenceJob = null;
  let recurrenceContinuity = null;
  if (previousTask.status !== "complete" && taskWithDetails.status === "complete") {
    const recurrenceHandoff = await completeRecurrenceHandoff(taskWithDetails, session, {
      source: "task.updated",
    });
    recurrenceJob = recurrenceHandoff.recurrenceJob;
    recurrenceContinuity = recurrenceHandoff.recurrenceContinuity;
  }

  return {
    task: recurrenceContinuity
      ? { ...taskWithDetails, recurrenceContinuity }
      : taskWithDetails,
    tasks: [
      recurrenceContinuity ? { ...taskWithDetails, recurrenceContinuity } : taskWithDetails,
      ...cascadedTasks,
    ],
    recurrenceContinuity,
    recurrenceJob,
  };
}

function applyResumeNoteAction(payload, previousTask) {
  const action = String(payload.resume_note_action || "").trim();

  if (!action) {
    return payload;
  }

  if (["complete", "archived"].includes(String(previousTask.status || ""))) {
    throw new AppError("Resume notes can only change while a task is active.", 409);
  }

  if (action === "consume") {
    return {
      resume_note: "",
      resume_note_action: action,
    };
  }

  if (String(previousTask.status || "").trim() === "blocked"
    || String(previousTask.blocked_reason || "").trim()) {
    throw new AppError("Blocked tasks do not accept resume-note capture.", 409);
  }

  const resumeNote = normalizeTaskContextText(payload.resume_note);
  if (!resumeNote) {
    throw new AppError("Resume note is required.", 400);
  }
  if (String(previousTask.resume_note || "").trim()) {
    throw new AppError("This task already has a resume note.", 409);
  }

  return {
    resume_note: resumeNote,
    resume_note_action: action,
    status: "in_progress",
  };
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

  const recurrenceHandoff = await completeRecurrenceHandoff(task, session);

  return {
    task: recurrenceHandoff.recurrenceContinuity
      ? { ...task, recurrenceContinuity: recurrenceHandoff.recurrenceContinuity }
      : task,
    createdTask: null,
    recurrenceContinuity: recurrenceHandoff.recurrenceContinuity,
    recurrenceJob: recurrenceHandoff.recurrenceJob,
  };
}

async function recurrenceRecoveryPlan(session, task, { enforcePermissions = false, now = new Date() } = {}) {
  if (!task?.recurrence_template_id || !task?.recurrence_instance_date) {
    return null;
  }

  const template = await taskRecurrenceService.readTemplate(
    session.workspace_id,
    task.recurrence_template_id,
  );
  if (!template || template.template_status !== "active") {
    return null;
  }

  const targetDate = taskRecurrenceService.nextNotPassedOccurrenceDate(template, now, session.timezone);
  const today = localDateKey(now, session.timezone);
  const checkpointDate = targetDate || addCalendarDaysKey(today, 1);
  const instances = await tasksRepository.readRecurrenceInstancesBefore(
    session.workspace_id,
    template.recurrence_template_id,
    checkpointDate,
  );
  const targetTask = targetDate
    ? await tasksRepository.readByRecurrenceInstance(
        session.workspace_id,
        template.recurrence_template_id,
        targetDate,
      )
    : null;
  const activeTasks = instances.filter((instance) => (
    ["open", "in_progress", "blocked"].includes(instance.status) && !instance.archived_at
  ));
  const scheduledDates = taskRecurrenceService.projectOccurrenceDates(
    { ...template, recovery_checkpoint_date: "" },
    template.recovery_checkpoint_date || template.recurrence_anchor_date,
    addCalendarDaysKey(checkpointDate, -1),
  );
  const materializedDates = new Set(instances.map((instance) => instance.recurrence_instance_date));
  const skippedOccurrenceCount = scheduledDates.filter((date) => !materializedDates.has(date)).length;

  let permitted = true;
  try {
    await assertCanEditTask(session, template);
    if (targetTask) {
      await assertCanReadTask(session, targetTask);
      await assertCanEditTask(session, targetTask);
    }
    for (const instance of activeTasks) {
      await assertCanReadTask(session, instance);
      await assertCanCompleteTask(session, instance);
    }
  } catch (error) {
    permitted = false;
    if (enforcePermissions) {
      throw error;
    }
  }

  let blockedByActiveTimer = false;
  for (const instance of activeTasks) {
    if (await taskTimersService.hasActiveTaskTimers(session.workspace_id, instance.task_id)) {
      blockedByActiveTimer = true;
      break;
    }
  }

  return {
    available: permitted && (activeTasks.length > 0 || skippedOccurrenceCount > 0),
    blockedByActiveTimer,
    checkpointDate,
    completedTaskCount: activeTasks.length,
    eligible: permitted,
    seriesEnded: !targetDate,
    skippedOccurrenceCount,
    targetDate,
    unchangedHistoryCount: instances.length - activeTasks.length,
    instances,
    taskIds: activeTasks.map((instance) => instance.task_id),
    targetTask,
    template,
  };
}

async function skipToCurrent(taskId, session, options = {}) {
  await assertModuleWriteEnabled(session, TASKS_MODULE_ID);
  const sourceTask = await readTaskOrThrow(session.workspace_id, taskId);
  await assertCanReadTask(session, sourceTask);
  const plan = await recurrenceRecoveryPlan(session, sourceTask, {
    enforcePermissions: true,
    now: options.now || new Date(),
  });

  if (!plan?.available) {
    throw new AppError("This recurring task is already current.", 409);
  }
  if (plan.blockedByActiveTimer) {
    throw new AppError("Stop or save active timers on earlier tasks before skipping to current.", 409);
  }

  const targetDraft = plan.targetDate
    ? {
        ...taskRecurrenceService.instanceTaskDraft({
          session,
          template: plan.template,
          instanceDate: plan.targetDate,
        }),
        created_by_user_id: plan.template.created_by_user_id || session.user_id,
        updated_by_user_id: session.user_id,
        completed_at: "",
        completed_by_user_id: "",
        archived_at: "",
        archived_by_user_id: "",
        last_worked_at: new Date().toISOString(),
      }
    : null;
  const result = await tasksRepository.recoverRecurrenceToCurrent(session.workspace_id, {
    actorUserId: session.user_id,
    expectedTaskIds: plan.taskIds,
    checkpointDate: plan.checkpointDate,
    expectedTemplate: plan.template,
    targetTask: targetDraft,
    templateId: plan.template.recurrence_template_id,
  });

  if (result?.status === "timer_conflict") {
    throw new AppError("Stop or save active timers on earlier tasks before skipping to current.", 409);
  }
  if (result?.status !== "recovered") {
    throw new AppError("The recurrence changed while recovery was being prepared. Open the task and try again.", 409);
  }

  if (result.targetCreated && result.targetTask) {
    await taskRecurrenceService.copyMaterializedInstanceContext({
      session,
      task: result.targetTask,
      template: plan.template,
    });
  }

  for (const completedTask of result.completedTasks || []) {
    const previousTask = instancesById(plan, completedTask.task_id) || { ...completedTask, status: "open" };
    await recordTaskAudit({
      session,
      action: "task_completed",
      changeType: "update",
      previousValue: previousTask,
      newValue: completedTask,
      metadata: { recurrence_recovery: "skip_to_current", recovery_checkpoint_date: plan.checkpointDate },
    });
    await emitTaskEvent("task.completed", {
      session,
      previousValue: previousTask,
      newValue: completedTask,
      metadata: { recurrence_recovery: "skip_to_current", recovery_checkpoint_date: plan.checkpointDate },
    });
    await syncTaskSearchIndex(session.workspace_id, completedTask.task_id, "task.skip_to_current");
    await recoverParentsAfterChildStatusChange(session, completedTask);
  }

  if (result.targetCreated && result.targetTask) {
    await recordTaskAudit({
      session,
      action: "task_recurrence_instance_materialized",
      changeType: "create",
      previousValue: null,
      newValue: result.targetTask,
      metadata: { recurrence_recovery: "skip_to_current" },
    });
    await emitTaskEvent("task.created", {
      session,
      previousValue: null,
      newValue: result.targetTask,
      metadata: { recurrence_recovery: "skip_to_current" },
    });
    await syncTaskSearchIndex(session.workspace_id, result.targetTask.task_id, "task.skip_to_current");
    await queueTaskReminderJobsForTask(result.targetTask, { reason: "task.skip_to_current", session });
  }

  const targetTask = result.targetTask
    ? await readTaggedTaskWithDetails(session, result.targetTask.task_id)
    : null;
  return {
    completedTaskCount: result.completedTaskIds?.length || 0,
    retainedTargetCount: result.targetTask ? 1 : 0,
    seriesEnded: plan.seriesEnded,
    skippedOccurrenceCount: plan.skippedOccurrenceCount,
    targetTask,
    unchangedHistoryCount: plan.unchangedHistoryCount,
  };
}

function instancesById(plan, taskId) {
  return plan.instances?.find((task) => task.task_id === taskId) || null;
}

async function completeRecurrenceHandoff(completedTask, session, options = {}) {
  if (!completedTask?.recurrence_template_id || !completedTask?.recurrence_instance_date) {
    return {
      recurrenceContinuity: null,
      recurrenceJob: {
        queued: false,
      },
    };
  }

  let continuity = null;

  try {
    continuity = await taskRecurrenceService.prepareCompletionContinuity({
      session,
      completedTask,
      findExisting: (templateId, instanceDate) => tasksRepository.readByRecurrenceInstance(
        session.workspace_id,
        templateId,
        instanceDate,
      ),
    });

    if (!continuity || continuity.status === "ended" || continuity.status === "available") {
      return {
        recurrenceContinuity: continuity,
        recurrenceJob: {
          queued: false,
        },
      };
    }

    const queueResult = await (options.queueGeneration || queueTaskRecurrenceGeneration)({
      session,
      completedTask,
      source: options.source || "task.completed",
    });
    const queued = queueResult.queued === true || queueResult.deduped === true;

    return {
      recurrenceContinuity: {
        ...continuity,
        followUpQueued: queued,
        status: "pending",
      },
      recurrenceJob: {
        queued,
      },
    };
  } catch (error) {
    console.error(`[tasks] Recurrence follow-up handoff failed after completing ${completedTask.task_id}:`, error);
    return {
      recurrenceContinuity: {
        checklistTemplateSeeded: continuity?.checklistTemplateSeeded === true,
        followUpFailed: true,
        followUpQueued: false,
        isRecurring: true,
        nextScheduledDate: continuity?.nextScheduledDate || "",
        nextTask: continuity?.nextTask || null,
        status: "handoff_failed",
      },
      recurrenceJob: {
        failed: true,
        queued: false,
      },
    };
  }
}

async function readRecurrenceContinuity(taskId, session) {
  const task = await readTaskOrThrow(session.workspace_id, taskId);
  await assertCanReadTask(session, task);

  return {
    recurrenceContinuity: await readTaskCompletionContinuity(task),
  };
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
  await queueTaskReminderJobsForTask(task, {
    reason: "task.reopened",
    session,
  });
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
  await queueTaskReminderJobsForTask(task, {
    reason: "task.restored",
    session,
  });
  if (isTaskTerminalStatus(task.status)) {
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

async function addChildTask(parentTaskId, rawPayload, session) {
  await assertModuleWriteEnabled(session, TASKS_MODULE_ID);
  const payload = parseTasksEdgePayload(TaskChildRelationshipSchema, rawPayload);
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

  if (relationship.is_blocking && isIncompleteTask(childTask)) {
    await blockParentForChild(session, parentTask, childTask);
  }

  await syncTaskSearchIndex(session.workspace_id, parentTask.task_id, "task.relationship_added");
  await syncTaskSearchIndex(session.workspace_id, childTask.task_id, "task.relationship_added");
  await emitTaskRelationshipEvent("task.relationship.created", { session, relationship, parentTask, childTask });

  return listRelationships(parentTask.task_id, session);
}

async function updateChildTaskRelationship(parentTaskId, childTaskId, rawPayload, session) {
  await assertModuleWriteEnabled(session, TASKS_MODULE_ID);
  const payload = parseTasksEdgePayload(TaskChildRelationshipSchema, rawPayload);
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

  if (updated.is_blocking && isIncompleteTask(childTask)) {
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

async function addChecklistItem(taskId, rawPayload, session) {
  await assertModuleWriteEnabled(session, TASKS_MODULE_ID);
  const task = await readTaskOrThrow(session.workspace_id, taskId);
  await assertCanEditTask(session, task);
  const payload = parseTasksEdgePayload(TaskChecklistItemCreateSchema, rawPayload);

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

async function updateChecklistItem(taskId, itemId, rawPayload, session) {
  await assertModuleWriteEnabled(session, TASKS_MODULE_ID);
  const task = await readTaskOrThrow(session.workspace_id, taskId);
  await assertCanEditTask(session, task);
  const payload = parseTasksEdgePayload(TaskChecklistItemUpdateSchema, rawPayload);
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

async function reorderChecklistItems(taskId, rawPayload, session) {
  await assertModuleWriteEnabled(session, TASKS_MODULE_ID);
  const task = await readTaskOrThrow(session.workspace_id, taskId);
  await assertCanEditTask(session, task);
  const payload = parseTasksEdgePayload(TaskChecklistReorderSchema, rawPayload);
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
  const recurrenceContinuities = [];

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
      appendUniqueTasks(results, result.tasks || [result.task]);
      if (result.recurrenceContinuity) {
        recurrenceContinuities.push({
          task_id: result.task?.task_id || taskId,
          ...result.recurrenceContinuity,
        });
      }
    } catch (error) {
      errors.push({
        task_id: taskId,
        message: error.message || "Task could not be updated.",
        status: error.status || error.statusCode || 500,
      });
    }
  }

  return { tasks: results, errors, recurrenceContinuities };
}

async function readOptions(session) {
  const [settings, users, taskTimersEnabled] = await Promise.all([
    settingsRepository.readWorkspaceSettings(session.workspace_id),
    usersRepository.readAll(session.workspace_id),
    tasksSettingsService.readTaskTimersEnabled(session),
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
    taskTimersEnabled,
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
  const repositoryQuery = await taskListRepositoryQuery(session, {
    sort: "context",
    status,
  });
  const [result, canReadTaskRow] = await Promise.all([
    tasksRepository.queryList(session.workspace_id, {
      ...repositoryQuery,
      limit: TASK_OPTION_MAX_ITEMS,
      offset: 0,
    }),
    permissionsService.createPermissionEvaluator(session, "tasks.view"),
  ]);
  const readable = (result.tasks || []).filter((task) => (
    canReadTaskRow(taskResource(task)) && taskMatchesStatusFilter(task, status)
  ));

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

  const projectAdmin = await permissionsRepository.readOldestActiveUserForRoleScope(
    session.workspace_id,
    "project_admin",
    "project",
    project.id,
  );

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
    return update(taskId, {
      status: payload.status,
      blocked_reason: payload.blocked_reason || payload.blockedReason || "",
    }, session);
  }

  if (action === "priority") {
    return update(taskId, { priority: payload.priority }, session);
  }

  if (action === "project_assign") {
    const projectId = String(payload.project_id || payload.projectId || "").trim();

    if (!projectId) {
      throw new AppError("Project is required for bulk Project assignment.", 400);
    }

    return update(taskId, {
      client_id: String(payload.client_id || payload.clientId || "").trim(),
      project_id: projectId,
    }, session);
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

function emptyProjectCascade() {
  return {
    allPreviousTasks: [],
    changedTasks: [],
  };
}

async function prepareProjectCascade(session, rootTaskId, normalizedRootTask) {
  const descendantTaskIds = await taskRelationshipsRepository.readDescendantTaskIds(
    session.workspace_id,
    rootTaskId,
  );
  if (descendantTaskIds.length === 0) {
    return emptyProjectCascade();
  }

  const descendantRows = await tasksRepository.readByIds(session.workspace_id, descendantTaskIds);
  const descendantById = new Map(descendantRows.map((task) => [task.task_id, task]));
  const allPreviousTasks = descendantTaskIds.map((taskId) => descendantById.get(taskId)).filter(Boolean);
  const changedTasks = [];

  for (const previousTask of allPreviousTasks) {
    if (
      previousTask.project_id === normalizedRootTask.project_id &&
      previousTask.client_id === normalizedRootTask.client_id
    ) {
      continue;
    }

    await assertCanEditTask(session, previousTask);
    const normalizedTask = await normalizeTaskPayload({
      payload: {
        client_id: normalizedRootTask.client_id,
        project_id: normalizedRootTask.project_id,
      },
      session,
      fallback: {
        ...previousTask,
        task_id: previousTask.task_id,
        updated_by_user_id: session.user_id,
      },
    });
    normalizedTask.last_worked_at = normalizedRootTask.last_worked_at;
    await assertCanEditTask(session, normalizedTask);
    changedTasks.push(normalizedTask);
  }

  return { allPreviousTasks, changedTasks };
}

async function finalizeProjectCascadeSideEffects({ cascade, rootTaskId, session }) {
  if (cascade.allPreviousTasks.length === 0) {
    return [];
  }

  const changedById = new Map(cascade.changedTasks.map((task) => [task.task_id, task]));
  const refreshedTasks = [];

  for (const previousTask of cascade.allPreviousTasks) {
    if (changedById.has(previousTask.task_id)) {
      await requestTagPropagationRefresh(session, "task", previousTask.task_id, "task.project_cascaded");
    }
    const refreshedTask = await readTaggedTaskWithDetails(session, previousTask.task_id);
    refreshedTasks.push(refreshedTask);

    if (!changedById.has(previousTask.task_id)) {
      continue;
    }

    await recordTaskAudit({
      session,
      action: "task_updated",
      changeType: "update",
      previousValue: previousTask,
      newValue: refreshedTask,
    });
    await emitTaskEvent("task.updated", {
      session,
      previousValue: previousTask,
      newValue: refreshedTask,
      metadata: {
        project_cascade_root_task_id: rootTaskId,
      },
    });
    await syncTaskSearchIndex(session.workspace_id, refreshedTask.task_id, "task.project_cascaded");
    await queueTaskReminderJobsForTask(refreshedTask, {
      reason: "task.project_cascaded",
      session,
    });
  }

  return refreshedTasks;
}

function appendUniqueTasks(target, tasks) {
  for (const task of tasks || []) {
    if (task?.task_id && !target.some((candidate) => candidate.task_id === task.task_id)) {
      target.push(task);
    }
  }
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
  const estimateMinutes = normalizeTaskEstimateMinutes(valueOrFallback(payload, "estimate_minutes", fallback.estimate_minutes));
  const billable = scope.billableAllowed ? normalizeBillableFlag(billableSource) : "no";
  const dueDate = normalizeDueDate(valueOrFallback(payload, "due_date", fallback.due_date));
  const dueTime = normalizeDueTime(valueOrFallback(payload, "due_time", fallback.due_time));
  const dueTimezone = dueDate
    ? String(valueOrFallback(payload, "due_timezone", fallback.due_timezone || session.timezone) || session.timezone || "").trim()
    : "";
  const recurrenceTemplateId = String(valueOrFallback(payload, "recurrence_template_id", fallback.recurrence_template_id) || "").trim();
  const recurrenceInstanceDate = normalizeDueDate(valueOrFallback(payload, "recurrence_instance_date", fallback.recurrence_instance_date));
  const blockedReason = normalizeTaskContextText(valueOrFallback(payload, "blocked_reason", fallback.blocked_reason));

  if (!title) {
    throw new AppError("Task title is required.", 400);
  }

  if (dueTime && !dueDate) {
    throw new AppError("A due time requires a due date.", 400);
  }

  if (status === "blocked" && !blockedReason) {
    throw new AppError("Blocked Reason is required when a task is Blocked.", 400);
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
    blocked_reason: blockedReason,
    resume_note: normalizeTaskContextText(
      Object.hasOwn(payload || {}, "handoff_note")
        ? payload.handoff_note
        : valueOrFallback(payload, "resume_note", fallback.resume_note),
    ),
    status,
    priority,
    estimate_minutes: estimateMinutes,
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
  const billableAllowed = workspaceSupportsBillable(settings.workspaceType);
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
      billable: billableAllowed ? normalizeBillableFlag(project.billable) : "no",
      billableAllowed,
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
      billableAllowed,
    };
  }

  return {
    projectId: "",
    clientId: "",
    billable: billableAllowed ? "yes" : "no",
    billableAllowed,
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
  if (await canEditTask(session, task)) {
    return;
  }

  throw new AppError("You do not have permission to perform that action.", 403);
}

async function canEditTask(session, task) {
  if (await permissionsService.can(session, "tasks.edit_all", taskResource(task))) {
    return true;
  }

  if (isOwnTask(session, task) && await permissionsService.can(session, "tasks.edit_own", taskResource(task))) {
    return true;
  }

  return false;
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
  const incomplete = blockingChildren.filter((relationship) => isIncompleteTask(relationship.child_status));

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
  if (!isIncompleteTask(childTask)) {
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
  const transition = planParentBlockTransition({ parentTask, blockingChild: childTask });
  if (!transition.effects.persistTask || !transition.taskPatch) {
    return;
  }

  const now = new Date().toISOString();
  const blockedParent = await tasksRepository.update(session.workspace_id, {
    ...parentTask,
    status: transition.taskPatch.status,
    blocked_reason: transition.taskPatch.blocked_reason,
    last_worked_at: now,
    updated_by_user_id: session.user_id,
    assignee_ids: parentTask.assignee_ids || [],
  });
  if (transition.effects.pauseRunningTimers) {
    await pauseRunningTimersForBlockedTask(blockedParent, session);
  }
  const updatedTask = await readTaggedTaskWithDetails(session, parentTask.task_id);
  if (transition.effects.emitTaskUpdated) {
    await emitTaskEvent("task.updated", {
      session,
      previousValue: parentTask,
      newValue: updatedTask,
      metadata: transition.eventMetadata || undefined,
    });
  }
  if (transition.effects.reindexSearch) {
    await syncTaskSearchIndex(session.workspace_id, parentTask.task_id, transition.searchReason);
  }
}

async function pauseRunningTimersForBlockedTask(task, session) {
  if (!shouldPauseRunningTimersForBlockedTask(task)) {
    return;
  }

  await taskTimersService.pauseRunningForBlockedTask(task, session);
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
  const blockingChildren = await taskRelationshipsRepository.readBlockingChildren(session.workspace_id, parentTask.task_id);
  const transition = planParentRecoveryTransition({
    parentTask,
    incompleteBlockingChildCount: blockingChildren.filter((relationship) => isIncompleteTask(relationship.child_status)).length,
  });
  if (!transition.effects.persistTask || !transition.taskPatch) {
    return;
  }

  const now = new Date().toISOString();
  await tasksRepository.update(session.workspace_id, {
    ...parentTask,
    status: transition.taskPatch.status,
    blocked_reason: transition.taskPatch.blocked_reason,
    last_worked_at: now,
    updated_by_user_id: session.user_id,
    assignee_ids: parentTask.assignee_ids || [],
  });
  const updatedTask = await readTaggedTaskWithDetails(session, parentTask.task_id);
  if (transition.effects.emitTaskUpdated) {
    await emitTaskEvent("task.updated", {
      session,
      previousValue: parentTask,
      newValue: updatedTask,
      metadata: transition.eventMetadata || undefined,
    });
  }
  if (transition.effects.reindexSearch) {
    await syncTaskSearchIndex(session.workspace_id, parentTask.task_id, transition.searchReason);
  }
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

async function syncRecurringChecklistStructure({ session, sourceTask }) {
  const templateId = sourceTask?.recurrence_template_id || "";
  if (!templateId) {
    return {
      futureTaskCount: 0,
      templateChecklistItems: [],
    };
  }

  const sourceItems = recurringChecklistStructureItems(
    await taskChecklistsRepository.readForTask(session.workspace_id, sourceTask.task_id),
  );
  const templateChecklistItems = await taskRecurrenceService.replaceTemplateChecklist(
    session.workspace_id,
    templateId,
    sourceItems,
    session.user_id,
  );
  const anchorDate = sourceTask.recurrence_instance_date || sourceTask.due_date || "";
  if (!anchorDate) {
    return {
      futureTaskCount: 0,
      templateChecklistItems,
    };
  }

  const futureTasks = await tasksRepository.readFutureRecurrenceInstances(session.workspace_id, templateId, anchorDate);
  let futureTaskCount = 0;

  for (const futureTask of futureTasks) {
    if (!(await canEditTask(session, futureTask))) {
      continue;
    }

    const previousValue = await readTaggedTaskWithDetails(session, futureTask.task_id);
    await taskChecklistsRepository.replaceStructureForTask(
      session.workspace_id,
      futureTask.task_id,
      templateChecklistItems,
      session.user_id,
    );
    const newValue = await readTaggedTaskWithDetails(session, futureTask.task_id);
    await recordRecurringChecklistPropagation({
      session,
      previousValue,
      newValue,
      sourceTask,
      templateId,
    });
    await syncTaskSearchIndex(session.workspace_id, futureTask.task_id, "task.recurrence_checklist_propagated");
    futureTaskCount += 1;
  }

  return {
    futureTaskCount,
    templateChecklistItems,
  };
}

async function syncRecurringLinkedNoteStructure({ session, sourceTask }) {
  const templateId = sourceTask?.recurrence_template_id || "";
  if (!templateId) {
    return {
      futureTaskCount: 0,
      skipped: true,
      templateNoteLinks: [],
    };
  }

  const sourceResult = await notesService.readTaskLinkedNotePropagationStructure(session, sourceTask.task_id);
  if (sourceResult.skipped) {
    return {
      futureTaskCount: 0,
      skipped: true,
      templateNoteLinks: [],
    };
  }

  const templateNoteLinks = await taskRecurrenceService.replaceTemplateNoteLinks(
    session.workspace_id,
    templateId,
    sourceResult.links,
    session.user_id,
  );
  const anchorDate = sourceTask.recurrence_instance_date || sourceTask.due_date || "";
  if (!anchorDate) {
    return {
      futureTaskCount: 0,
      skipped: false,
      templateNoteLinks,
    };
  }

  const futureTasks = await tasksRepository.readFutureRecurrenceInstances(session.workspace_id, templateId, anchorDate);
  let futureTaskCount = 0;

  for (const futureTask of futureTasks) {
    if (!(await canEditTask(session, futureTask))) {
      continue;
    }

    const previousValue = await readTaggedTaskWithDetails(session, futureTask.task_id);
    const propagationResult = await notesService.replacePropagatedTaskLinkedNotes(session, {
      links: templateNoteLinks,
      sourceTaskId: sourceTask.task_id,
      taskId: futureTask.task_id,
      templateId,
    });
    if (propagationResult.skipped) {
      continue;
    }

    const newValue = await readTaggedTaskWithDetails(session, futureTask.task_id);
    await recordRecurringLinkedNotePropagation({
      session,
      previousValue,
      newValue,
      sourceTask,
      templateId,
      noteLinkCount: templateNoteLinks.length,
      propagationResult,
    });
    await syncTaskSearchIndex(session.workspace_id, futureTask.task_id, "task.recurrence_linked_notes_propagated");
    futureTaskCount += 1;
  }

  return {
    futureTaskCount,
    skipped: false,
    templateNoteLinks,
  };
}

function recurringChecklistStructureItems(items = []) {
  return (Array.isArray(items) ? items : [])
    .filter((item) => !item.deleted_at)
    .map((item, index) => ({
      label: normalizeChecklistLabel(item.label),
      sort_order: normalizeChecklistSortOrder(item.sort_order, index),
    }));
}

async function readTaggedTaskWithDetails(session, taskId) {
  const task = await readTaskOrThrow(session.workspace_id, taskId);
  return attachTaskDetails((await tagsService.decorateRecordsForTarget(session, "task", [task]))[0], session);
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
    estimate_minutes: task.estimate_minutes,
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
    checked,
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

async function finalizeChecklistMutation({ session, task, action, checked = null, eventName, previousItem, item, items = null }) {
  const workedAt = new Date().toISOString();
  await tasksRepository.markWorkedAt(session.workspace_id, task.task_id, workedAt, session.user_id);
  const currentItems = items || await taskChecklistsRepository.readForTask(session.workspace_id, task.task_id);
  const checklistProgress = taskChecklistProgress(currentItems);
  const transitionedTask = await applyChecklistDrivenStatusTransition({
    session,
    task,
    checked,
    currentItems,
    workedAt,
  });
  const taskWithDetails = transitionedTask || await readTaggedTaskWithDetails(session, task.task_id);
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

async function applyChecklistDrivenStatusTransition({ session, task, checked, currentItems, workedAt }) {
  const nextStatus = await checklistDrivenStatus(session.workspace_id, task, checked, currentItems);

  if (!nextStatus) {
    return null;
  }

  await tasksRepository.update(session.workspace_id, {
    ...task,
    blocked_reason: nextStatus === "in_progress" ? "" : task.blocked_reason,
    status: nextStatus,
    last_worked_at: workedAt,
    updated_by_user_id: session.user_id,
    assignee_ids: task.assignee_ids,
  });

  const taskWithDetails = await readTaggedTaskWithDetails(session, task.task_id);
  await recordTaskAudit({
    session,
    action: "task_updated",
    changeType: "update",
    previousValue: task,
    newValue: taskWithDetails,
  });
  await emitTaskEvent("task.updated", {
    session,
    previousValue: task,
    newValue: taskWithDetails,
    metadata: {
      transition: nextStatus === "in_progress"
        ? task.status === "blocked" ? "checklist_started_from_blocked" : "checklist_started"
        : "checklist_cleared",
    },
  });
  await syncTaskSearchIndex(session.workspace_id, task.task_id, "task.checklist_status_updated");
  await queueTaskReminderJobsForTask(taskWithDetails, {
    reason: "task.checklist_status_updated",
    session,
  });

  return taskWithDetails;
}

async function checklistDrivenStatus(workspaceId, task, checked, currentItems = []) {
  if (checked === true && (task.status === "open" || task.status === "blocked")) {
    return "in_progress";
  }

  if (checked === false && task.status === "in_progress") {
    const evidence = await taskWorkEvidenceService.readStartedWorkEvidence(
      workspaceId,
      task.task_id,
      currentItems,
    );
    return evidence.hasStartedWork ? "" : "open";
  }

  return "";
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

async function attachTaskListProjectionDetails(tasks, session, { canReadTaskRow = null } = {}) {
  if (!Array.isArray(tasks) || tasks.length === 0) {
    return [];
  }

  const batch = createVisibleRecordBatch(tasks, { idField: "task_id" });
  const [checklistProgressByTaskId, relationshipSummaryByTaskId, primaryParentByTaskId] = await Promise.all([
    taskChecklistsRepository.readProgressForTasks(tasks[0].workspace_id, batch.ids),
    taskRelationshipsRepository.relationshipSummariesForTasks(tasks[0].workspace_id, batch.ids),
    readPrimaryParentByTaskId(session, tasks, canReadTaskRow),
  ]);

  return tasks.map((task) => {
    const checklistProgress = checklistProgressByTaskId.get(task.task_id) || emptyChecklistProgress();
    const relationshipSummary = relationshipSummaryByTaskId.get(task.task_id) || emptyRelationshipSummary();
    const taskWithListDetails = {
      ...task,
      checklistProgress,
      parentTask: primaryParentByTaskId.get(task.task_id) || null,
      relationshipSummary,
      completionMetrics: taskCompletionMetrics(task),
    };

    return {
      ...taskWithListDetails,
      resumeContext: taskResumeContext(taskWithListDetails),
    };
  });
}

async function attachTaskDetails(task, session = null) {
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
    recurrenceContinuity: await readTaskCompletionContinuity(taskWithReminders),
    resumeContext: taskResumeContext({ ...taskWithReminders, checklistProgress, relationshipSummary }),
    recurrenceDetails: await taskRecurrenceService.readTaskRecurrenceDetails(taskWithReminders),
    recurrenceRecovery: session ? publicRecurrenceRecovery(await recurrenceRecoveryPlan(session, taskWithReminders)) : null,
  };
}

function publicRecurrenceRecovery(plan) {
  if (!plan) {
    return null;
  }
  return {
    available: plan.available,
    blockedByActiveTimer: plan.blockedByActiveTimer,
    completedTaskCount: plan.completedTaskCount,
    eligible: plan.eligible,
    seriesEnded: plan.seriesEnded,
    skippedOccurrenceCount: plan.skippedOccurrenceCount,
    targetDate: plan.targetDate,
    unchangedHistoryCount: plan.unchangedHistoryCount,
  };
}

async function readPrimaryParentByTaskId(session, tasks = [], canReadTaskRow = null) {
  const taskIds = tasks.map((task) => task.task_id).filter(Boolean);
  const [relationships, resolvedCanReadTaskRow] = await Promise.all([
    taskRelationshipsRepository.readParentsForTasks(session.workspace_id, taskIds),
    canReadTaskRow || permissionsService.createPermissionEvaluator(session, "tasks.view"),
  ]);
  const parentByTaskId = new Map();

  for (const relationship of relationships) {
    if (parentByTaskId.has(relationship.child_task_id) || !relationship.parent_title) {
      continue;
    }
    const readable = resolvedCanReadTaskRow({
      workspace_id: relationship.workspace_id,
      client_id: relationship.parent_client_id || "",
      project_id: relationship.parent_project_id || "",
    });
    if (readable) {
      parentByTaskId.set(relationship.child_task_id, {
        task_id: relationship.parent_task_id,
        title: relationship.parent_title,
        status: relationship.parent_status || "open",
      });
    }
  }

  return parentByTaskId;
}

async function readTaskCompletionContinuity(task) {
  if (task?.status !== "complete" || !task.recurrence_template_id || !task.recurrence_instance_date) {
    return null;
  }

  return taskRecurrenceService.readCompletionContinuity({
    session: {
      workspace_id: task.workspace_id,
    },
    completedTask: task,
    findExisting: (templateId, instanceDate) => tasksRepository.readByRecurrenceInstance(
      task.workspace_id,
      templateId,
      instanceDate,
    ),
  });
}

function normalizeStatus(value) {
  const status = String(value || "").trim();
  return STATUSES.has(status) ? status : "open";
}

function normalizePriority(value) {
  const priority = String(value || "").trim();
  return PRIORITIES.has(priority) ? priority : "normal";
}

function normalizeCalendarStatuses(value) {
  const values = (Array.isArray(value) ? value : [value])
    .flatMap((entry) => String(entry || "").split(","))
    .map((entry) => entry.trim().toLowerCase())
    .filter((entry) => STATUSES.has(entry));
  const uniqueValues = [...new Set(values)];

  return uniqueValues.length ? uniqueValues : ["open", "in_progress", "blocked"];
}

function normalizeTaskEstimateMinutes(value) {
  if (value === null || value === undefined || String(value).trim() === "") {
    return null;
  }

  const minutes = Number(value);
  if (!Number.isSafeInteger(minutes) || minutes < 0 || minutes % 15 !== 0) {
    throw new AppError("Task estimate must be blank or a non-negative multiple of 15 minutes.", 400);
  }

  return minutes;
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

function normalizeChecklistSortOrder(value, index = 0) {
  const sortOrder = Number.parseInt(value, 10);
  return Number.isFinite(sortOrder) ? sortOrder : (index + 1) * 1000;
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

function dashboardAttentionRows(activeTasks, context) {
  const rows = sortDashboardAttentionTasks(
    activeTasks.filter((task) => dashboardTaskReasons(task, context).length > 0),
    context,
  ).map((task) => dashboardTaskRow(task, context));

  return dedupeDashboardRows(rows).slice(0, DASHBOARD_TASK_ATTENTION_LIMIT);
}

function dashboardUpcomingRows(activeTasks, context) {
  const upcomingTasks = activeTasks.filter((task) =>
    task.status !== "blocked" &&
    isTaskDueSoon(task, context.now, context.today, context.dueSoonCutoff),
  );

  return sortTaskSummaryRows(upcomingTasks)
    .map((task) => dashboardTaskRow(task, {
      ...context,
      horizon: task.due_date === context.today ? "today" : "this-week",
      reasonBadge: task.due_date === context.today ? "Due today" : "This week",
      reasons: [task.due_date === context.today ? "Due today" : "This week"],
    }))
    .slice(0, DASHBOARD_TASK_UPCOMING_LIMIT);
}

function sortDashboardAttentionTasks(tasks, context) {
  return [...tasks].sort((leftTask, rightTask) =>
    dashboardAttentionRank(leftTask, context) - dashboardAttentionRank(rightTask, context) ||
    compareTaskDueOrder(leftTask, rightTask) ||
    priorityRank(rightTask.priority) - priorityRank(leftTask.priority) ||
    String(rightTask.updated_at || "").localeCompare(String(leftTask.updated_at || "")) ||
    compareTaskStableTitle(leftTask, rightTask),
  );
}

function dashboardAttentionRank(task, context) {
  if (isTaskOverdue(task, context.now, context.today)) {
    return 10;
  }

  if (task.status === "blocked") {
    return 20;
  }

  const timerStatus = context.timerByTaskId.get(task.task_id)?.timer_status || "";
  if (timerStatus === "running") {
    return 30;
  }

  if (timerStatus === "paused") {
    return 40;
  }

  if (isTaskDueSoon(task, context.now, context.today, context.dueSoonCutoff)) {
    return 50;
  }

  return 99;
}

function dashboardTaskRow(task, context) {
  const timer = context.timerByTaskId.get(task.task_id);
  const reasons = Array.isArray(context.reasons) ? context.reasons : dashboardTaskReasons(task, context);
  const reasonBadge = context.reasonBadge || reasons[0] || "Needs attention";

  return {
    id: task.task_id,
    task_id: task.task_id,
    dedupeKey: `tasks:task:${task.task_id}`,
    moduleId: TASKS_MODULE_ID,
    sourceLabel: "Tasks",
    recordType: "task",
    title: task.title || "Untitled task",
    status: task.status || "open",
    priority: task.priority || "normal",
    estimate_minutes: task.estimate_minutes,
    reasonBadge,
    reasons,
    horizon: context.horizon || "",
    contextLabel: dashboardTaskContextLabel(task, context.workspaceType),
    due_date: task.due_date || "",
    due_time: task.due_time || "",
    due_timezone: task.due_timezone || "",
    due_at: task.due_at_utc || task.due_date || "",
    dueLabel: dashboardTaskDueLabel(task),
    timerStatus: timer?.timer_status || "",
    assignedToCurrentUser: (task.assignee_ids || []).includes(context.currentUserId),
    action: dashboardTaskWorkbenchAction(task),
    secondaryAction: dashboardTaskActions().tasks,
  };
}

function dashboardTaskWorkbenchAction(task) {
  // Per-row Workbench handoffs deep-link into Task Focus for that task; the
  // panel-level Open Workbench action stays the generic Workbench entry.
  return {
    ...dashboardTaskActions().workbench,
    href: `${DASHBOARD_WORKBENCH_URL}?taskId=${encodeURIComponent(task.task_id)}`,
  };
}

function dashboardTaskReasons(task, context) {
  const reasons = [];
  const timer = context.timerByTaskId.get(task.task_id);

  if (isTaskOverdue(task, context.now, context.today)) {
    reasons.push("Overdue");
  }

  if (task.status === "blocked") {
    reasons.push("Blocked");
  }

  if (hasDashboardTaskTimer(timer)) {
    reasons.push(timer.timer_status === "running" ? "Timer running" : "Timer paused");
  }

  if (isTaskDueSoon(task, context.now, context.today, context.dueSoonCutoff)) {
    reasons.push(task.due_date === context.today ? "Due today" : "Due soon");
  }

  return reasons;
}

function dashboardTaskContextLabel(task, workspaceType = "business") {
  const clientName = String(task.client_name || "").trim();
  const projectName = String(task.project_name || "").trim();

  if (workspaceType === "business") {
    return [clientName, projectName].filter(Boolean).join(" / ") || "Workspace task";
  }

  return projectName || "Workspace task";
}

function dashboardTaskDueLabel(task) {
  if (!task.due_date) {
    return "No due date";
  }

  return task.due_time ? `Due ${task.due_date} at ${task.due_time}` : `Due ${task.due_date}`;
}

function dashboardTaskMetric(label, value, href = DASHBOARD_WORKBENCH_URL) {
  return {
    label,
    value: Number(value) || 0,
    href,
  };
}

function dashboardTaskActions() {
  return {
    workbench: {
      label: "Open Workbench",
      href: DASHBOARD_WORKBENCH_URL,
    },
    tasks: {
      label: "View Tasks",
      href: DASHBOARD_TASKS_URL,
    },
  };
}

function hasDashboardTaskTimer(timer) {
  return ["running", "paused"].includes(timer?.timer_status || "");
}

function dedupeDashboardRows(rows) {
  const seen = new Set();
  return rows.filter((row) => {
    const key = row.dedupeKey || row.id || row.task_id;
    if (!key || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function readBoolean(value) {
  return value === true || value === "true" || value === "1" || value === 1;
}

function hasQueryFilter(query, keys) {
  return keys.some((key) => Object.hasOwn(query || {}, key));
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
    estimate_minutes: task.estimate_minutes,
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
    description_excerpt: descriptionExcerpt(task.description),
    status: task.status || "open",
    priority: task.priority || "normal",
    estimate_minutes: task.estimate_minutes,
    due_date: task.due_date || "",
    due_time: task.due_time || "",
    due_at: task.due_at_utc || task.due_date || "",
    due_at_utc: task.due_at_utc || "",
    recurrence_template_id: task.recurrence_template_id || "",
    recurrence_instance_date: task.recurrence_instance_date || "",
    client_id: task.client_id || "",
    client_name: task.client_name || "",
    project_id: task.project_id || "",
    project_name: task.project_name || "",
    assignee_ids: task.assignee_ids || [],
    assignees: task.assignees || [],
    assigned_to_current_user: (task.assignee_ids || []).includes(currentUserId),
    direct_tags: safeTaskTags(task.directTags),
    propagated_tag_count: Array.isArray(task.propagatedTags) ? task.propagatedTags.length : 0,
    next_action: task.next_action || "",
    blocked_reason: task.status === "blocked" ? task.blocked_reason || "" : "",
    resume_note: task.resume_note || "",
    checklist_progress: task.checklistProgress || emptyChecklistProgress(),
    relationship_summary: task.relationshipSummary || emptyRelationshipSummary(),
    timer_status: timerStatus,
    elapsed_seconds: elapsedSeconds,
    timer,
    last_worked_at: task.last_worked_at || task.updated_at || task.created_at || "",
    created_at: task.created_at || "",
    updated_at: task.updated_at || "",
    completion_metrics: taskCompletionMetrics(task),
    active_candidate: resumeContext.active_candidate,
    resume_context: resumeContext,
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

/** @param {import("../../types/task-recurrence-contracts.d.ts").TaskRecord} task @returns {import("../../types/task-recurrence-contracts.d.ts").TaskCalendarRow} */
function taskCalendarRow(task) {
  return {
    task_id: task.task_id,
    id: task.task_id,
    title: task.title,
    status: task.status,
    priority: String(task.priority || "normal"),
    due_date: String(task.due_date || ""),
    due_time: String(task.due_time || ""),
    client_name: String(task.client_name || ""),
    project_name: String(task.project_name || ""),
    allDay: !task.due_time,
    endDate: String(task.due_date || ""),
    startDate: String(task.due_date || ""),
  };
}

/** @param {import("../../types/task-recurrence-contracts.d.ts").TaskRecurrenceTemplate} template @param {string} instanceDate @returns {import("../../types/task-recurrence-contracts.d.ts").TaskCalendarRow} */
function virtualTaskCalendarRow(template, instanceDate) {
  return {
    task_id: "",
    id: `recurrence:${template.recurrence_template_id}:${instanceDate}`,
    title: template.title,
    status: template.status || "open",
    priority: template.priority || "normal",
    due_date: instanceDate,
    due_time: template.due_time || "",
    client_name: template.client_name || "",
    project_name: template.project_name || "",
    allDay: !template.due_time,
    startDate: instanceDate,
    endDate: instanceDate,
    templateId: template.recurrence_template_id,
    instanceDate,
    virtual: true,
  };
}

/** @param {import("../../types/task-recurrence-contracts.d.ts").TaskCalendarRow} first @param {import("../../types/task-recurrence-contracts.d.ts").TaskCalendarRow} second */
function compareTaskCalendarRows(first, second) {
  return first.due_date.localeCompare(second.due_date)
    || String(first.due_time || "23:59").localeCompare(String(second.due_time || "23:59"));
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

function calendarDayCount(startKey, endKey) {
  const start = Date.parse(`${startKey}T00:00:00.000Z`);
  const end = Date.parse(`${endKey}T00:00:00.000Z`);
  return Math.round((end - start) / 86400000) + 1;
}

function isActiveStatus(status) {
  return !["inactive", "archived"].includes(String(status || "").trim().toLowerCase());
}

function assigneesChanged(previousTask, nextTask) {
  const previous = [...(previousTask.assignee_ids || [])].sort().join(",");
  const next = [...(nextTask.assignee_ids || [])].sort().join(",");

  return previous !== next;
}

async function recordTaskAudit({ session, action, changeType, previousValue, newValue, metadata = {} }) {
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
      ...metadata,
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

async function recordRecurringChecklistPropagation({ session, previousValue, newValue, sourceTask, templateId }) {
  const checklistProgress = newValue?.checklistProgress || emptyChecklistProgress();

  await auditService.record({
    session,
    action: "task_recurrence_checklist_propagated",
    changeType: "update",
    recordType: "task",
    recordId: newValue?.task_id || previousValue?.task_id,
    recordLabel: newValue?.title || previousValue?.title,
    recordUrl: `tasks.html?task=${encodeURIComponent(newValue?.task_id || previousValue?.task_id || "")}`,
    previousValue,
    newValue,
    metadata: {
      summary: `Propagated recurring checklist structure for "${newValue?.title || previousValue?.title || "Task"}"`,
      recurrence_template_id: templateId,
      source_task_id: sourceTask?.task_id || "",
      task_id: newValue?.task_id || previousValue?.task_id || "",
      checklist_progress: checklistProgress,
    },
  });

  await modulesService.emitInternalEvent("task.checklist_structure.propagated", {
    session,
    moduleId: TASKS_MODULE_ID,
    recordType: "task",
    recordId: newValue?.task_id || previousValue?.task_id,
    previousValue,
    newValue,
    source: session?.api_key_id ? "public_api" : "manual",
    metadata: {
      recurrence_template_id: templateId,
      source_task_id: sourceTask?.task_id || "",
      task_id: newValue?.task_id || previousValue?.task_id || "",
      checklist_progress: checklistProgress,
      item_count: checklistProgress.total_count,
      completed_count: checklistProgress.completed_count,
    },
  });
}

async function recordRecurringLinkedNotePropagation({
  session,
  previousValue,
  newValue,
  sourceTask,
  templateId,
  noteLinkCount = 0,
  propagationResult = {},
}) {
  await auditService.record({
    session,
    action: "task_recurrence_linked_notes_propagated",
    changeType: "update",
    recordType: "task",
    recordId: newValue?.task_id || previousValue?.task_id,
    recordLabel: newValue?.title || previousValue?.title,
    recordUrl: `tasks.html?task=${encodeURIComponent(newValue?.task_id || previousValue?.task_id || "")}`,
    previousValue,
    newValue,
    metadata: {
      summary: `Propagated recurring linked notes for "${newValue?.title || previousValue?.title || "Task"}"`,
      recurrence_template_id: templateId,
      source_task_id: sourceTask?.task_id || "",
      task_id: newValue?.task_id || previousValue?.task_id || "",
      note_link_count: noteLinkCount,
      created_link_count: propagationResult.createdCount || 0,
      removed_link_count: propagationResult.removedCount || 0,
    },
  });

  await modulesService.emitInternalEvent("task.linked_notes.propagated", {
    session,
    moduleId: TASKS_MODULE_ID,
    recordType: "task",
    recordId: newValue?.task_id || previousValue?.task_id,
    previousValue,
    newValue,
    source: session?.api_key_id ? "public_api" : "manual",
    metadata: {
      recurrence_template_id: templateId,
      source_task_id: sourceTask?.task_id || "",
      task_id: newValue?.task_id || previousValue?.task_id || "",
      note_link_count: noteLinkCount,
      created_link_count: propagationResult.createdCount || 0,
      removed_link_count: propagationResult.removedCount || 0,
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

  if (previousTask?.estimate_minutes !== nextTask?.estimate_minutes) {
    changes.push(`estimate ${formatAuditEstimate(previousTask)} to ${formatAuditEstimate(nextTask)}`);
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

function formatAuditEstimate(task) {
  return task?.estimate_minutes === null || task?.estimate_minutes === undefined
    ? "none"
    : `${task.estimate_minutes} minutes`;
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
    estimate_minutes: task.estimate_minutes,
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
  listOptions,
  listWorkbenchItems,
  listWorkItems,
  listRelationships,
  materializeRecurrenceInstance,
  read,
  readCore,
  readLifecycleForIds,
  readRecurrenceContinuity,
  skipToCurrent,
  reopen,
  removeChildTaskRelationship,
  reorderChecklistItems,
  restore,
  summary,
  uncheckChecklistItem,
  update,
  updateChecklistItem,
  updateChildTaskRelationship,
  completeRecurrenceHandoff,
};
