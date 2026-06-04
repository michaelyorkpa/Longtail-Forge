import { randomUUID } from "node:crypto";
import { taskTimersRepository } from "./task-timers.repo.js";
import { tasksRepository } from "./tasks.repo.js";
import { activeTimersRepository } from "../time-tracking/active-timers.repo.js";
import { timeEntriesService } from "../time-tracking/time-entries.service.js";
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
  const elapsedSeconds = Math.max(0, Number.parseInt(payload?.accumulated_elapsed_seconds, 10) || 0);
  const timer = await taskTimersRepository.upsert({
    active_task_timer_id: payload?.active_task_timer_id || randomUUID(),
    workspace_id: session.workspace_id,
    user_id: session.user_id,
    task_id: task.task_id,
    client_id: task.client_id,
    client_name: task.client_name,
    project_id: task.project_id,
    project_name: task.project_name,
    description: task.title,
    billable: task.billable === "no" ? "no" : "yes",
    accumulated_elapsed_seconds: elapsedSeconds,
    last_active_start_time: timerStatus === "running" ? normalizeUtcIso(payload?.last_active_start_time, session.timezone) : null,
    timer_status: timerStatus,
  });

  if (timerStatus === "running") {
    await activeTimersRepository.pauseRunningForUser(session.workspace_id, session.user_id);
  }

  return { timer };
}

async function remove(taskId, session) {
  await assertTaskTimersEnabled(session);
  const task = await readTaskOrThrow(taskId, session);
  await taskTimersRepository.remove(session.workspace_id, session.user_id, task.task_id);

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
  const durationSeconds = Math.max(
    1,
    Number.parseInt(payload?.duration_seconds ?? activeTimer?.accumulated_elapsed_seconds, 10) || 0,
  );
  const endTime = payload?.end_time || new Date().toISOString();
  const startTime = payload?.start_time || new Date(new Date(endTime).getTime() - durationSeconds * 1000).toISOString();
  const result = await timeEntriesService.create({
    client_id: task.client_id,
    client_name: task.client_name,
    project_id: task.project_id,
    project_name: task.project_name,
    task_id: task.task_id,
    description: task.title,
    start_time: startTime,
    end_time: endTime,
    duration_seconds: durationSeconds,
    duration_hours: (durationSeconds / 3600).toFixed(4),
    billable: task.billable === "no" ? "no" : "yes",
    invoice_status: "unbilled",
  }, session);

  await taskTimersRepository.remove(session.workspace_id, session.user_id, task.task_id);
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
      duration_seconds: durationSeconds,
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

function taskResource(task) {
  return {
    workspace_id: task.workspace_id,
    client_id: task.client_id || "",
    project_id: task.project_id || "",
  };
}

export const taskTimersService = {
  finalize,
  hasActiveTaskTimers,
  list,
  remove,
  save,
};
