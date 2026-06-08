import { randomUUID } from "node:crypto";
import { tasksRepository } from "./tasks.repo.js";
import { taskRecurrenceService } from "./task-recurrence.service.js";
import { taskRemindersService } from "./task-reminders.service.js";
import { taskTimersService } from "./task-timers.service.js";
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

async function list(session, query = {}) {
  const tasks = await tasksRepository.readAll(session.workspace_id);
  const readableTasks = [];

  for (const task of tasks) {
    if (await canReadTask(session, task)) {
      readableTasks.push(task);
    }
  }

  const taggedTasks = await tagsService.decorateRecordsForTarget(
    session,
    "task",
    await tagsService.filterRecordsByTags(session, "task", readableTasks, query.tagIds || query.tag_ids || query.tags),
  );

  return {
    tasks: await attachReminderDetails(taggedTasks),
    currentUserId: session.user_id,
    options: await readOptions(session),
  };
}

async function summary(session) {
  const { tasks } = await list(session);
  const now = new Date();
  const today = localDateKey(now, session.timezone);
  const dueSoonCutoff = addDaysKey(today, 7);
  const activeTasks = tasks.filter((task) => !["complete", "archived"].includes(task.status));
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
    overdue: sortTaskSummaryRows(overdue).slice(0, 5).map(taskSummaryRow),
    dueSoon: sortTaskSummaryRows(dueSoon).slice(0, 5).map(taskSummaryRow),
    assignedToMe: sortTaskSummaryRows(assignedToMe).slice(0, 5).map(taskSummaryRow),
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

  const normalizedTask = await normalizeTaskPayload({
    payload,
    session,
    fallback: {
      ...previousTask,
      task_id: previousTask.task_id,
      updated_by_user_id: session.user_id,
    },
  });

  if (
    previousTask.client_id !== normalizedTask.client_id ||
    previousTask.project_id !== normalizedTask.project_id
  ) {
    await assertCanEditTask(session, normalizedTask);
  }

  await assertStatusTransitionAllowed(session, previousTask, normalizedTask);
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

  return { task };
}

async function bulkUpdate(payload, session) {
  await assertModuleWriteEnabled(session, TASKS_MODULE_ID);
  const taskIds = normalizeAssigneeIds(payload?.task_ids || payload?.taskIds || []);
  const action = String(payload?.action || "").trim();
  const results = [];
  const errors = [];

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
  const [settings, clients, projects, users] = await Promise.all([
    settingsRepository.readWorkspaceSettings(session.workspace_id),
    clientsRepository.readAll(session.workspace_id),
    projectsRepository.readAll(session.workspace_id),
    usersRepository.readAll(session.workspace_id),
  ]);
  const moduleContext = await modulesService.readWorkspaceModuleContext(session.workspace_id);
  const visibleProjects = await permissionsService.filterReadableProjects(session, projects);
  const visibleClients = settings.workspaceType === "business"
    ? await permissionsService.filterReadableClients(session, clients)
    : [];

  return {
    workspaceType: settings.workspaceType,
    clients: visibleClients.filter((client) => isActiveStatus(client.status)),
    projects: visibleProjects.filter((project) => isActiveStatus(project.status)),
    users: users.filter((user) => user.userStatus === "active"),
    priorities: [...PRIORITIES],
    statuses: [...STATUSES],
    taskTimersEnabled: settings.taskTimersEnabled !== false,
    timeTrackingEnabled: moduleContext.moduleStatusById["time-tracking"] === "enabled",
  };
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

  const previousTask = await readTaskOrThrow(session.workspace_id, taskId);

  if (action === "status") {
    return update(taskId, { status: payload.status }, session);
  }

  if (action === "priority") {
    return update(taskId, { priority: payload.priority }, session);
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

async function readTaggedTaskWithDetails(session, taskId) {
  const task = await readTaskOrThrow(session.workspace_id, taskId);
  return attachTaskDetails((await tagsService.decorateRecordsForTarget(session, "task", [task]))[0]);
}

async function attachReminderDetails(tasks) {
  return Promise.all(tasks.map(attachTaskDetails));
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

async function attachTaskDetails(task) {
  if (!task) {
    return null;
  }

  const taskWithReminders = await attachReminderDetailsToTask(task);
  return {
    ...taskWithReminders,
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

function taskSummaryRow(task) {
  return {
    task_id: task.task_id,
    title: task.title,
    status: task.status,
    priority: task.priority,
    billable: task.billable,
    due_date: task.due_date,
    due_time: task.due_time,
    due_timezone: task.due_timezone,
    due_at_utc: task.due_at_utc,
    client_id: task.client_id,
    client_name: task.client_name,
    project_id: task.project_id,
    project_name: task.project_name,
    assignee_ids: task.assignee_ids || [],
    url: taskUrl(task),
  };
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
      ...metadata,
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

export const tasksService = {
  archive,
  bulkUpdate,
  calendarWindow,
  complete,
  create,
  list,
  read,
  reopen,
  restore,
  summary,
  update,
};
