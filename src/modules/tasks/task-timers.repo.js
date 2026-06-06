import { activeTimersRepository } from "../time-tracking/active-timers.repo.js";

const TASK_SOURCE = {
  sourceModuleId: "tasks",
  sourceType: "task",
};

async function readAllForUser(workspaceId, userId) {
  const timers = await activeTimersRepository.readAllBySource(workspaceId, userId, TASK_SOURCE);
  return timers.map(timerToTaskTimer);
}

async function readByTask(workspaceId, userId, taskId) {
  const timer = await activeTimersRepository.readBySource(workspaceId, userId, sourceForTask(taskId));
  return timer ? timerToTaskTimer(timer) : null;
}

async function hasActiveForTask(workspaceId, taskId) {
  return activeTimersRepository.hasSource(workspaceId, sourceForTask(taskId));
}

async function remove(workspaceId, userId, taskId) {
  await activeTimersRepository.removeBySource(workspaceId, userId, sourceForTask(taskId));
}

function sourceForTask(taskId) {
  return {
    ...TASK_SOURCE,
    sourceId: taskId,
  };
}

function timerToTaskTimer(timer) {
  return {
    active_task_timer_id: timer.active_timer_id,
    active_timer_id: timer.active_timer_id,
    workspace_id: timer.workspace_id,
    user_id: timer.user_id,
    task_id: timer.source_id,
    client_id: timer.client_id || "",
    client_name: timer.client_name || "",
    project_id: timer.project_id || "",
    project_name: timer.project_name || "",
    description: timer.description || "",
    billable: timer.billable === "no" ? "no" : "yes",
    accumulated_elapsed_seconds: Number(timer.accumulated_elapsed_seconds) || 0,
    last_active_start_time: timer.last_active_start_time || null,
    timer_status: timer.timer_status === "running" ? "running" : "paused",
    source_module_id: timer.source_module_id || "tasks",
    source_type: timer.source_type || "task",
    source_id: timer.source_id || "",
    source_label: timer.source_label || timer.description || "",
    source_url: timer.source_url || "",
    source_metadata_json: timer.source_metadata_json || "{}",
    sourceMetadata: timer.sourceMetadata || {},
    created_at: timer.created_at,
    updated_at: timer.updated_at,
  };
}

export const taskTimersRepository = {
  hasActiveForTask,
  readAllForUser,
  readByTask,
  remove,
};
