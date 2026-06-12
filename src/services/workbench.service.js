import { modulesService } from "../core/modules/modules.service.js";
import { activeTimersService } from "../modules/time-tracking/active-timers.service.js";
import { tasksService } from "../modules/tasks/tasks.service.js";

const TASKS_MODULE_ID = "tasks";
const TIME_TRACKING_MODULE_ID = "time-tracking";

async function bootstrap(session) {
  const [moduleContext, workbenchCards, timerSources, workItemSources] = await Promise.all([
    modulesService.readWorkspaceModuleContext(session.workspace_id),
    modulesService.listWorkbenchCards(session.workspace_id, session),
    modulesService.listTimerSources(session.workspace_id, session),
    modulesService.listWorkItemSources(session.workspace_id, session),
  ]);
  const moduleStatusById = moduleContext.moduleStatusById || {};
  const timeTrackingEnabled = moduleStatusById[TIME_TRACKING_MODULE_ID] === "enabled";
  const tasksEnabled = moduleStatusById[TASKS_MODULE_ID] === "enabled";
  const [timerResult, taskResult] = await Promise.all([
    activeTimersService.listAll(session),
    tasksEnabled ? tasksService.listWorkItems(session) : Promise.resolve(null),
  ]);

  return {
    currentUserId: session.user_id,
    modules: {
      tasks: { enabled: tasksEnabled },
      timeTracking: { enabled: timeTrackingEnabled },
    },
    registry: {
      workbenchCards,
      timerSources,
      workItemSources,
    },
    timers: (timerResult.timers || []).map((timer) => normalizeTimer(timer, moduleStatusById)),
    taskItems: taskResult?.items || [],
    taskOptions: taskResult?.options || null,
  };
}

async function listTaskWorkItems(session) {
  const [moduleContext, taskResult] = await Promise.all([
    modulesService.readWorkspaceModuleContext(session.workspace_id),
    tasksService.listWorkItems(session),
  ]);
  const tasksEnabled = moduleContext.moduleStatusById?.[TASKS_MODULE_ID] === "enabled";

  return {
    source_module_id: TASKS_MODULE_ID,
    source_type: "task",
    source_enabled: tasksEnabled,
    items: taskResult.items || [],
    options: taskResult.options || null,
  };
}

function normalizeTimer(timer, moduleStatusById) {
  const sourceModuleId = timer.source_module_id || "";
  const sourceType = timer.source_type || "manual";
  const sourceEnabled = !sourceModuleId || moduleStatusById[sourceModuleId] === "enabled";
  const sourceLabelValue = timer.source_label || timer.description || sourceLabel(sourceType);

  return {
    active_timer_id: timer.active_timer_id,
    timer_slot: timer.timer_slot,
    source_module_id: sourceModuleId,
    source_type: sourceType,
    source_id: timer.source_id || "",
    source_label: sourceLabelValue,
    source_url: timer.source_url || "",
    source_enabled: sourceEnabled,
    source: {
      module_id: sourceModuleId || TIME_TRACKING_MODULE_ID,
      type: sourceType,
      id: timer.source_id || "",
      label: sourceLabelValue,
      url: timer.source_url || "",
      enabled: sourceEnabled,
    },
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

function sourceLabel(sourceType) {
  if (sourceType === "task") {
    return "Task";
  }

  return "Manual";
}

export const workbenchService = {
  bootstrap,
  listTaskWorkItems,
};
