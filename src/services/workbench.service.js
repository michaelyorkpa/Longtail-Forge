import { modulesService } from "../core/modules/modules.service.js";
import { activeTimersService } from "../modules/time-tracking/active-timers.service.js";
import { taskTimersService } from "../modules/tasks/task-timers.service.js";
import { tasksService } from "../modules/tasks/tasks.service.js";

const TASKS_MODULE_ID = "tasks";
const TIME_TRACKING_MODULE_ID = "time-tracking";

async function bootstrap(session) {
  // TODO 0.31.10-0.31.15: replace this pragmatic first-party assembly with registry-driven Workbench card, timer-source, and workbench item contributions.
  const moduleContext = await modulesService.readWorkspaceModuleContext(session.workspace_id);
  const moduleStatusById = moduleContext.moduleStatusById || {};
  const timeTrackingEnabled = moduleStatusById[TIME_TRACKING_MODULE_ID] === "enabled";
  const tasksEnabled = moduleStatusById[TASKS_MODULE_ID] === "enabled";
  const [timerResult, taskResult, taskTimerResult] = await Promise.all([
    activeTimersService.listAll(session),
    tasksEnabled ? tasksService.list(session) : Promise.resolve(null),
    tasksEnabled ? taskTimersService.list(session) : Promise.resolve({ timers: [] }),
  ]);

  return {
    currentUserId: session.user_id,
    modules: {
      tasks: { enabled: tasksEnabled },
      timeTracking: { enabled: timeTrackingEnabled },
    },
    timers: (timerResult.timers || []).map((timer) => normalizeTimer(timer, moduleStatusById)),
    taskItems: taskResult
      ? (taskResult.tasks || []).map((task) => normalizeTaskItem(task, taskTimerResult.timers || [], session.user_id))
      : [],
    taskOptions: taskResult?.options || null,
  };
}

function normalizeTimer(timer, moduleStatusById) {
  const sourceModuleId = timer.source_module_id || "";
  const sourceType = timer.source_type || "manual";
  const sourceEnabled = !sourceModuleId || moduleStatusById[sourceModuleId] === "enabled";

  return {
    active_timer_id: timer.active_timer_id,
    timer_slot: timer.timer_slot,
    source_module_id: sourceModuleId,
    source_type: sourceType,
    source_id: timer.source_id || "",
    source_label: timer.source_label || timer.description || sourceLabel(sourceType),
    source_url: timer.source_url || "",
    source_enabled: sourceEnabled,
    client_id: timer.client_id || "",
    client_name: timer.client_name || "",
    project_id: timer.project_id || "",
    project_name: timer.project_name || "",
    description: timer.description || "",
    billable: timer.billable === "no" ? "no" : "yes",
    accumulated_elapsed_seconds: Number(timer.accumulated_elapsed_seconds) || 0,
    last_active_start_time: timer.last_active_start_time || null,
    timer_status: timer.timer_status === "running" ? "running" : "paused",
    created_at: timer.created_at,
    updated_at: timer.updated_at,
  };
}

function normalizeTaskItem(task, taskTimers, currentUserId) {
  const timer = taskTimers.find((item) => item.task_id === task.task_id) || null;

  return {
    source_module_id: "tasks",
    source_type: "task",
    source_id: task.task_id,
    source_label: task.title,
    source_url: `tasks.html?task=${encodeURIComponent(task.task_id)}`,
    task_id: task.task_id,
    title: task.title,
    description: task.description || "",
    client_id: task.client_id || "",
    client_name: task.client_name || "",
    project_id: task.project_id || "",
    project_name: task.project_name || "",
    status: task.status || "open",
    priority: task.priority || "normal",
    due_date: task.due_date || "",
    due_time: task.due_time || "",
    assignee_ids: task.assignee_ids || [],
    assignees: task.assignees || [],
    assigned_to_current_user: (task.assignee_ids || []).includes(currentUserId),
    timer_status: timer?.timer_status || "",
    elapsed_seconds: timer ? Number(timer.accumulated_elapsed_seconds) || 0 : 0,
    timer,
  };
}

function sourceLabel(sourceType) {
  if (sourceType === "task") {
    return "Task";
  }

  return "Manual";
}

export const workbenchService = {
  bootstrap,
};
