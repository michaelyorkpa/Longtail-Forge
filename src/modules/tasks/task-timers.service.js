import { randomUUID } from "node:crypto";
import { taskTimersRepository } from "./task-timers.repo.js";
import { tasksRepository } from "./tasks.repo.js";
import { activeTimersService } from "../time-tracking/active-timers.service.js";
import { modulesService } from "../../core/modules/modules.service.js";
import { auditService } from "../../core/audit.js";
import { AppError } from "../../core/errors.js";
import { permissionsService } from "../../core/permissions.js";
import { settingsRepository } from "../../repositories/settings.repo.js";
import { normalizeUtcIso } from "../../utils/timezones.js";

const TASKS_MODULE_ID = "tasks";
const TIME_TRACKING_MODULE_ID = "time-tracking";

async function list(session) {
  return {
    timers: await taskTimersRepository.readAllForUser(session.workspace_id, session.user_id),
  };
}

async function save(taskId, payload, session) {
  const task = await readEligibleTask(taskId, session);
  await assertTaskTimersEnabled(session);
  await assertCanUseTaskTimer(session, task);

  const timerStatus = payload?.timer_status === "running" ? "running" : "paused";
  const existingTimer = await taskTimersRepository.readByTask(session.workspace_id, session.user_id, task.task_id);
  const transition = timerStatus === "running"
    ? await transitionTaskToInProgressForTimerStart(task, existingTimer, session)
    : taskTimerTransitionMetadata(existingTimer);
  const elapsedSeconds = Math.max(0, Number.parseInt(payload?.accumulated_elapsed_seconds, 10) || 0);
  const result = await activeTimersService.saveSourced(taskTimerSource(task), {
    active_timer_id: payload?.active_timer_id || payload?.active_task_timer_id || randomUUID(),
    client_id: task.client_id,
    client_name: task.client_name,
    project_id: task.project_id,
    project_name: task.project_name,
    description: task.title,
    billable: task.billable === "no" ? "no" : "yes",
    accumulated_elapsed_seconds: elapsedSeconds,
    last_active_start_time: timerStatus === "running" ? normalizeUtcIso(payload?.last_active_start_time, session.timezone) : null,
    sourceMetadata: {
      taskTimerStatusTransition: transition,
    },
    timer_status: timerStatus,
  }, session);

  return { timer: taskTimerFromUnified(result.timer, task) };
}

async function remove(taskId, session) {
  await assertTaskTimersEnabled(session);
  const task = await readTaskOrThrow(taskId, session);
  const timer = await taskTimersRepository.readByTask(session.workspace_id, session.user_id, task.task_id);
  await activeTimersService.removeSourced(taskTimerSource(task), session);
  await revertTaskTimerStartTransition(task, timer, session);

  return {
    task_id: task.task_id,
    removed: true,
  };
}

async function finalize(taskId, payload, session) {
  const task = await readEligibleTask(taskId, session);
  await assertTaskTimersEnabled(session);
  await assertCanUseTaskTimer(session, task);

  const activeTimer = await taskTimersRepository.readByTask(session.workspace_id, session.user_id, task.task_id);
  const result = await activeTimersService.finalizeSourced(taskTimerSource(task), payload, session, {
    client_id: task.client_id,
    client_name: task.client_name,
    project_id: task.project_id,
    project_name: task.project_name,
    task_id: task.task_id,
    description: task.title,
    billable: task.billable === "no" ? "no" : "yes",
    invoice_status: "unbilled",
  });
  await auditService.record({
    session,
    action: "task_timer_finalized",
    changeType: "create",
    recordType: "task",
    recordId: task.task_id,
    recordLabel: task.title,
    recordUrl: `tasks.html?task=${encodeURIComponent(task.task_id)}`,
    previousValue: activeTimer,
    newValue: {
      ...result,
      task_id: task.task_id,
      duration_seconds: result.duration_seconds,
    },
    metadata: {
      task_id: task.task_id,
      project_id: task.project_id,
      client_id: task.client_id,
      time_entry_id: result.entry_id,
    },
  });

  return {
    ...result,
    task_timer_removed: true,
    task_id: task.task_id,
  };
}

async function hasActiveTaskTimers(workspaceId, taskId) {
  return taskTimersRepository.hasActiveForTask(workspaceId, taskId);
}

async function assertTaskTimersEnabled(session) {
  const [tasksWritable, timeWritable, settings] = await Promise.all([
    modulesService.canWriteModule(session.workspace_id, TASKS_MODULE_ID),
    modulesService.canWriteModule(session.workspace_id, TIME_TRACKING_MODULE_ID),
    settingsRepository.readWorkspaceSettings(session.workspace_id),
  ]);

  if (!tasksWritable) {
    throw new AppError("This module is disabled for this workspace.", 403);
  }

  if (!timeWritable) {
    throw new AppError("Time Tracking is disabled for this workspace.", 403);
  }

  if (settings.taskTimersEnabled === false) {
    throw new AppError("Task timers are disabled for this workspace.", 403);
  }
}

async function readEligibleTask(taskId, session) {
  const task = await readTaskOrThrow(taskId, session);

  if (task.status === "complete" || task.status === "archived") {
    throw new AppError("Completed or archived tasks cannot use task timers.", 400);
  }

  if (!task.project_id) {
    throw new AppError("Task timers require a project-linked task.", 400);
  }

  return task;
}

async function readTaskOrThrow(taskId, session) {
  const task = await tasksRepository.readById(session.workspace_id, decodeURIComponent(taskId || ""));

  if (!task) {
    throw new AppError("Task not found.", 404);
  }

  return task;
}

async function assertCanUseTaskTimer(session, task) {
  await permissionsService.assertCan(session, "tasks.view", taskResource(task));
  await permissionsService.assertCan(session, "time_entries.create", {
    workspace_id: session.workspace_id,
    client_id: task.client_id,
    project_id: task.project_id,
    operation: "task_timer",
  });
}

async function transitionTaskToInProgressForTimerStart(task, existingTimer, session) {
  const existingTransition = taskTimerTransitionMetadata(existingTimer);

  if (existingTransition.movedTaskFromOpen === true) {
    return existingTransition;
  }

  if (task.status !== "open") {
    return {
      movedTaskFromOpen: false,
      previousStatus: task.status,
    };
  }

  const updatedTask = await tasksRepository.update(session.workspace_id, {
    ...task,
    status: "in_progress",
    updated_by_user_id: session.user_id,
    assignee_ids: task.assignee_ids,
  });

  await recordTaskTimerStatusAudit({
    session,
    action: "task_timer_status_started",
    previousTask: task,
    nextTask: updatedTask,
    transition: {
      from: "open",
      to: "in_progress",
    },
  });

  return {
    movedTaskFromOpen: true,
    previousStatus: "open",
  };
}

async function revertTaskTimerStartTransition(task, timer, session) {
  const transition = taskTimerTransitionMetadata(timer);

  if (transition.movedTaskFromOpen !== true || task.status !== "in_progress") {
    return null;
  }

  const updatedTask = await tasksRepository.update(session.workspace_id, {
    ...task,
    status: "open",
    updated_by_user_id: session.user_id,
    assignee_ids: task.assignee_ids,
  });

  await recordTaskTimerStatusAudit({
    session,
    action: "task_timer_status_reverted",
    previousTask: task,
    nextTask: updatedTask,
    transition: {
      from: "in_progress",
      to: "open",
    },
  });

  return updatedTask;
}

function taskTimerTransitionMetadata(timer) {
  const metadata = timer?.sourceMetadata || parseTimerSourceMetadata(timer?.source_metadata_json);
  const transition = metadata?.taskTimerStatusTransition || {};

  return {
    movedTaskFromOpen: transition.movedTaskFromOpen === true,
    previousStatus: transition.previousStatus || "",
  };
}

function parseTimerSourceMetadata(value) {
  try {
    const parsed = JSON.parse(String(value || "{}"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

async function recordTaskTimerStatusAudit({ session, action, previousTask, nextTask, transition }) {
  await auditService.record({
    session,
    action,
    changeType: "update",
    recordType: "task",
    recordId: nextTask?.task_id || previousTask?.task_id,
    recordLabel: nextTask?.title || previousTask?.title,
    recordUrl: `tasks.html?task=${encodeURIComponent(nextTask?.task_id || previousTask?.task_id || "")}`,
    previousValue: previousTask,
    newValue: nextTask,
    metadata: {
      task_id: nextTask?.task_id || previousTask?.task_id,
      client_id: nextTask?.client_id || previousTask?.client_id || "",
      project_id: nextTask?.project_id || previousTask?.project_id || "",
      source: "task_timer_lifecycle",
      transition,
    },
  });
}

function taskResource(task) {
  return {
    workspace_id: task.workspace_id,
    client_id: task.client_id || "",
    project_id: task.project_id || "",
  };
}

function taskTimerSource(task) {
  return {
    source_module_id: TASKS_MODULE_ID,
    source_type: "task",
    source_id: task.task_id,
    source_label: task.title,
    source_url: `tasks.html?task=${encodeURIComponent(task.task_id)}`,
  };
}

function taskTimerFromUnified(timer, task) {
  return {
    ...timer,
    active_task_timer_id: timer.active_timer_id,
    task_id: task.task_id,
  };
}

export const taskTimersService = {
  finalize,
  hasActiveTaskTimers,
  list,
  remove,
  save,
};
