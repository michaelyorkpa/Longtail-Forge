// @ts-check
import { taskTimersRepository } from "./task-timers.repo.js";
import { tasksRepository } from "./tasks.repo.js";
import { activeTimersService } from "../time-tracking/index.js";
import { modulesService } from "../../core/modules/modules.service.js";
import { auditService } from "../../core/audit.js";
import { searchIndexSyncService } from "../../services/search-index-sync.service.js";
import { AppError } from "../../core/errors.js";
import { permissionsService } from "../../core/permissions.js";
import { tasksSettingsService } from "./tasks-settings.service.js";
import { taskWorkEvidenceService } from "./task-work-evidence.service.js";
import { normalizeUtcIso } from "../../utils/timezones.js";
import { normalizeTimeEntryBillable } from "../../utils/normalizers.js";

/** @typedef {import("../../types/task-workflow-contracts.js").TaskTimerAuditInput} TaskTimerAuditInput */
/** @typedef {import("../../types/task-workflow-contracts.js").TaskTimerFinalizeResult} TaskTimerFinalizeResult */
/** @typedef {import("../../types/task-workflow-contracts.js").TaskTimerLinkPayload} TaskTimerLinkPayload */
/** @typedef {import("../../types/task-workflow-contracts.js").TaskTimerLinkResult} TaskTimerLinkResult */
/** @typedef {import("../../types/task-workflow-contracts.js").TaskTimerRecord} TaskTimerRecord */
/** @typedef {import("../../types/task-workflow-contracts.js").TaskTimerRemoveResult} TaskTimerRemoveResult */
/** @typedef {import("../../types/task-workflow-contracts.js").TaskTimerResumeContext} TaskTimerResumeContext */
/** @typedef {import("../../types/task-workflow-contracts.js").TaskTimerSavePayload} TaskTimerSavePayload */
/** @typedef {import("../../types/task-workflow-contracts.js").TaskTimerSaveResult} TaskTimerSaveResult */
/** @typedef {import("../../types/task-workflow-contracts.js").TaskTimerSourceTask} TaskTimerSourceTask */
/** @typedef {import("../../types/task-workflow-contracts.js").TaskTimerTransition} TaskTimerTransition */
/** @typedef {import("../../types/task-workflow-contracts.js").TaskTimersService} TaskTimersService */
/** @typedef {import("../../types/task-workflow-contracts.js").TaskWorkflowSession} WorkspaceRequestSession */
/** @typedef {import("../../types/time-tracking-contracts.d.ts").ActiveTimerRecord} ActiveTimerRecord */

const TASKS_MODULE_ID = "tasks";
const TIME_TRACKING_MODULE_ID = "time-tracking";

/** @param {WorkspaceRequestSession} session */
async function list(session) {
  return {
    timers: await taskTimersRepository.readAllForUser(session.workspace_id, session.user_id),
  };
}

/** @param {TaskTimerSourceTask} task @param {WorkspaceRequestSession} session */
async function pauseRunningForBlockedTask(task, session) {
  return activeTimersService.pauseRunningSourced(taskTimerSource(task), session);
}

/** @param {string} taskId @param {TaskTimerSavePayload} payload @param {WorkspaceRequestSession} session @returns {Promise<TaskTimerSaveResult>} */
async function save(taskId, payload, session) {
  const task = await readEligibleTask(taskId, session);
  await assertTaskTimersEnabled(session);
  await assertCanUseTaskTimer(session, task);

  const timerStatus = payload?.timer_status === "running" ? "running" : "paused";
  const existingTimer = await taskTimersRepository.readByTask(session.workspace_id, session.user_id, task.task_id);
  const transition = timerStatus === "running"
    ? await transitionTaskToInProgressForTimerStart(task, existingTimer, session)
    : taskTimerTransitionMetadata(existingTimer);
  const elapsedSeconds = Math.max(0, Number.parseInt(String(payload?.accumulated_elapsed_seconds ?? ""), 10) || 0);
  let result;

  try {
    result = await activeTimersService.saveSourced(taskTimerSource(task), {
      active_timer_id: payload?.active_timer_id || payload?.active_task_timer_id,
      client_id: String(task.client_id || ""),
      client_name: String(task.client_name || ""),
      project_id: String(task.project_id || ""),
      project_name: String(task.project_name || ""),
      description: task.title,
      billable: taskTimerBillable(task),
      accumulated_elapsed_seconds: elapsedSeconds,
      last_active_start_time: timerStatus === "running" ? normalizeUtcIso(/** @type {import("../../utils/timezones.js").DateTimeInput} */ (payload?.last_active_start_time), session.timezone) : null,
      sourceMetadata: {
        taskTimerStatusTransition: transition,
      },
      timer_status: timerStatus,
    }, session);
  } catch (error) {
    if (transition.movedTaskToInProgress === true) {
      const transitionedTask = await tasksRepository.readById(session.workspace_id, task.task_id);
      await revertTaskTimerStartTransition(transitionedTask || task, {
        sourceMetadata: { taskTimerStatusTransition: transition },
      }, session, { force: true });
    }
    throw error;
  }
  await markTaskWorked(session, task.task_id, `task_timer_${timerStatus}`);
  const updatedTask = await tasksRepository.readById(session.workspace_id, task.task_id);

  return {
    task: updatedTask || task,
    timer: taskTimerFromUnified(result.timer, updatedTask || task),
  };
}

/** @param {string} taskId @param {TaskTimerLinkPayload} payload @param {WorkspaceRequestSession} session @returns {Promise<TaskTimerLinkResult>} */
async function linkManualTimer(taskId, payload, session) {
  const task = await readEligibleTask(taskId, session);
  await assertTaskTimersEnabled(session);
  await assertCanUseTaskTimer(session, task);
  const timerSlot = String(payload?.timer_slot || payload?.timerSlot || "").trim();

  if (!timerSlot) {
    throw new AppError("Timer slot is required.", 400);
  }

  const existingTaskTimer = await taskTimersRepository.readByTask(
    session.workspace_id,
    session.user_id,
    task.task_id,
  );

  if (existingTaskTimer) {
    throw new AppError("The selected task already has an active timer.", 409);
  }

  const transition = await transitionTaskToInProgressForTimerStart(task, null, session);
  let result;

  try {
    result = await activeTimersService.convertManualToSourced(timerSlot, taskTimerSource(task), {
      billable: taskTimerBillable(task),
      client_id: String(task.client_id || ""),
      client_name: String(task.client_name || ""),
      description: task.title,
      project_id: String(task.project_id || ""),
      project_name: String(task.project_name || ""),
      sourceMetadata: {
        linkedFromManualTimerSlot: timerSlot,
        taskTimerStatusTransition: transition,
      },
    }, session);
  } catch (error) {
    if (transition.movedTaskToInProgress === true) {
      const transitionedTask = await tasksRepository.readById(session.workspace_id, task.task_id);
      await revertTaskTimerStartTransition(transitionedTask || task, {
        sourceMetadata: { taskTimerStatusTransition: transition },
      }, session, { force: true });
    }
    throw error;
  }

  await auditService.record({
    session,
    action: "task_timer_linked",
    changeType: "update",
    recordType: "task",
    recordId: task.task_id,
    recordLabel: task.title,
    recordUrl: `tasks.html?task=${encodeURIComponent(task.task_id)}`,
    previousValue: {
      source_type: "manual",
      timer_slot: timerSlot,
    },
    newValue: {
      active_timer_id: result.timer.active_timer_id,
      source_type: "task",
      task_id: task.task_id,
      timer_status: result.timer.timer_status,
    },
    metadata: {
      client_id: task.client_id,
      project_id: task.project_id,
      source: "manual_timer_link",
      task_id: task.task_id,
    },
  });
  await markTaskWorked(session, task.task_id, "task_timer_linked");
  const updatedTask = await tasksRepository.readById(session.workspace_id, task.task_id);

  return {
    linked: true,
    manual_timers: result.timers,
    previous_timer_slot: timerSlot,
    task: updatedTask || task,
    timer: taskTimerFromUnified(result.timer, updatedTask || task),
  };
}

/** @param {string} taskId @param {WorkspaceRequestSession} session @returns {Promise<TaskTimerRemoveResult>} */
async function remove(taskId, session) {
  await assertTaskTimersEnabled(session);
  const task = await readTaskOrThrow(taskId, session);
  const timer = await taskTimersRepository.readByTask(session.workspace_id, session.user_id, task.task_id);
  await activeTimersService.removeSourced(taskTimerSource(task), session);
  await revertTaskTimerStartTransition(task, timer, session);
  await markTaskWorked(session, task.task_id, "task_timer_removed");
  const updatedTask = await tasksRepository.readById(session.workspace_id, task.task_id);

  return {
    task: updatedTask || task,
    task_id: task.task_id,
    removed: true,
  };
}

/** @param {string} taskId @param {unknown} payload @param {WorkspaceRequestSession} session @returns {Promise<TaskTimerFinalizeResult>} */
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
    billable: taskTimerBillable(task),
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
  await markTaskWorked(session, task.task_id, "task_timer_finalized");
  const updatedTask = await tasksRepository.readById(session.workspace_id, task.task_id);

  return {
    ...result,
    task: updatedTask || task,
    task_timer_removed: true,
    task_id: task.task_id,
  };
}

/** @param {string} workspaceId @param {string} taskId */
async function hasActiveTaskTimers(workspaceId, taskId) {
  return taskTimersRepository.hasActiveForTask(workspaceId, taskId);
}

/** @param {WorkspaceRequestSession} session */
async function assertTaskTimersEnabled(session) {
  const [tasksWritable, timeWritable, taskTimersEnabled] = await Promise.all([
    modulesService.canWriteModule(session.workspace_id, TASKS_MODULE_ID),
    modulesService.canWriteModule(session.workspace_id, TIME_TRACKING_MODULE_ID),
    tasksSettingsService.readTaskTimersEnabled(session),
  ]);

  if (!tasksWritable) {
    throw new AppError("This module is disabled for this workspace.", 403);
  }

  if (!timeWritable) {
    throw new AppError("Time Tracking is disabled for this workspace.", 403);
  }

  if (!taskTimersEnabled) {
    throw new AppError("Task timers are disabled for this workspace.", 403);
  }
}

/** @param {string} taskId @param {WorkspaceRequestSession} session @returns {Promise<TaskTimerSourceTask>} */
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

/** @param {string} taskId @param {WorkspaceRequestSession} session @returns {Promise<TaskTimerSourceTask>} */
async function readTaskOrThrow(taskId, session) {
  const task = await tasksRepository.readById(session.workspace_id, decodeURIComponent(taskId || ""));

  if (!task) {
    throw new AppError("Task not found.", 404);
  }

  return task;
}

/** @param {WorkspaceRequestSession} session @param {TaskTimerSourceTask} task */
async function assertCanUseTaskTimer(session, task) {
  await permissionsService.assertCan(session, "tasks.view", taskResource(task));
  await permissionsService.assertCan(session, "time_entries.create", {
    workspace_id: session.workspace_id,
    client_id: task.client_id,
    project_id: task.project_id,
    operation: "task_timer",
  });
}

/** @param {TaskTimerSourceTask} task @param {TaskTimerRecord | null} existingTimer @param {WorkspaceRequestSession} session @returns {Promise<TaskTimerTransition>} */
async function transitionTaskToInProgressForTimerStart(task, existingTimer, session) {
  const existingTransition = taskTimerTransitionMetadata(existingTimer);

  if (task.status !== "open" && task.status !== "blocked") {
    return existingTransition.movedTaskToInProgress === true ? existingTransition : {
      movedTaskToInProgress: false,
      movedTaskFromOpen: false,
      movedTaskFromBlocked: false,
      previousBlockedReason: "",
      previousStatus: task.status,
    };
  }

  const previousStatus = task.status;
  const previousBlockedReason = previousStatus === "blocked" ? task.blocked_reason || "" : "";

  const updatedTask = await tasksRepository.update(session.workspace_id, {
    ...task,
    blocked_reason: "",
    status: "in_progress",
    last_worked_at: new Date().toISOString(),
    updated_by_user_id: session.user_id,
    assignee_ids: task.assignee_ids,
  });

  await recordTaskTimerStatusAudit({
    session,
    action: "task_timer_status_started",
    previousTask: task,
    nextTask: updatedTask,
    transition: {
      from: previousStatus,
      to: "in_progress",
    },
  });

  return {
    movedTaskToInProgress: true,
    movedTaskFromOpen: previousStatus === "open",
    movedTaskFromBlocked: previousStatus === "blocked",
    previousBlockedReason,
    previousStatus,
  };
}

/** @param {TaskTimerSourceTask} task @param {TaskTimerRecord | { sourceMetadata?: Record<string, unknown>, source_metadata_json?: string } | null} timer @param {WorkspaceRequestSession} session @param {{ force?: boolean }} [options] */
async function revertTaskTimerStartTransition(task, timer, session, options = {}) {
  const transition = taskTimerTransitionMetadata(timer);

  if (transition.movedTaskToInProgress !== true || task.status !== "in_progress") {
    return null;
  }

  if (options.force !== true) {
    const evidence = await taskWorkEvidenceService.readStartedWorkEvidence(session.workspace_id, task.task_id);
    if (evidence.hasStartedWork) {
      return null;
    }
  }

  const restoredStatus = transition.previousStatus === "blocked" ? "blocked" : "open";

  const updatedTask = await tasksRepository.update(session.workspace_id, {
    ...task,
    blocked_reason: restoredStatus === "blocked" ? transition.previousBlockedReason : "",
    status: restoredStatus,
    last_worked_at: new Date().toISOString(),
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
      to: restoredStatus,
    },
  });

  return updatedTask;
}

/** @param {WorkspaceRequestSession} session @param {string} taskId @param {string} reason */
async function markTaskWorked(session, taskId, reason) {
  await tasksRepository.markWorkedAt(session.workspace_id, taskId, new Date().toISOString(), session.user_id);
  await searchIndexSyncService.reindexRecord({
    workspaceId: session.workspace_id,
    moduleId: TASKS_MODULE_ID,
    recordType: "task",
    recordId: taskId,
    reason,
  });
}

/** @param {TaskTimerRecord | { sourceMetadata?: Record<string, unknown>, source_metadata_json?: string } | null} timer @returns {TaskTimerTransition} */
function taskTimerTransitionMetadata(timer) {
  const metadata = timer?.sourceMetadata || parseTimerSourceMetadata(timer?.source_metadata_json);
  const transition = /** @type {Partial<TaskTimerTransition>} */ (metadata?.taskTimerStatusTransition || {});

  const previousStatus = transition.previousStatus === "blocked" ? "blocked" : transition.previousStatus === "open" ? "open" : "";
  const movedTaskFromOpen = transition.movedTaskFromOpen === true || (
    transition.movedTaskToInProgress === true && previousStatus === "open"
  );
  const movedTaskFromBlocked = transition.movedTaskFromBlocked === true || (
    transition.movedTaskToInProgress === true && previousStatus === "blocked"
  );

  return {
    movedTaskToInProgress: transition.movedTaskToInProgress === true || movedTaskFromOpen || movedTaskFromBlocked,
    movedTaskFromOpen,
    movedTaskFromBlocked,
    previousBlockedReason: movedTaskFromBlocked ? String(transition.previousBlockedReason || "") : "",
    previousStatus: previousStatus || (movedTaskFromOpen ? "open" : movedTaskFromBlocked ? "blocked" : ""),
  };
}

/** @param {unknown} value @returns {Record<string, unknown>} */
function parseTimerSourceMetadata(value) {
  try {
    const parsed = JSON.parse(String(value || "{}"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/** @param {TaskTimerAuditInput} input */
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
      client_name: nextTask?.client_name || previousTask?.client_name || "",
      project_id: nextTask?.project_id || previousTask?.project_id || "",
      project_name: nextTask?.project_name || previousTask?.project_name || "",
      source: "task_timer_lifecycle",
      transition,
    },
  });
}

/** @param {TaskTimerSourceTask} task */
function taskResource(task) {
  return {
    workspace_id: task.workspace_id,
    client_id: task.client_id || "",
    project_id: task.project_id || "",
  };
}

/** @param {TaskTimerSourceTask} task */
function taskTimerSource(task) {
  return {
    source_module_id: TASKS_MODULE_ID,
    source_type: "task",
    source_id: task.task_id,
    source_label: task.title,
    source_url: `tasks.html?task=${encodeURIComponent(task.task_id)}`,
  };
}

/** @param {TaskTimerSourceTask} task @returns {"yes" | "no"} */
function taskTimerBillable(task) {
  return normalizeTimeEntryBillable(task?.billable) || "yes";
}

/**
 * @param {ActiveTimerRecord & { resumeContext: Record<string, unknown>, resume_context: Record<string, unknown> }} timer
 * @param {TaskTimerSourceTask} task
 * @returns {TaskTimerRecord}
 */
function taskTimerFromUnified(timer, task) {
  /** @type {TaskTimerResumeContext} */
  const resumeContext = {
    accumulatedElapsedSeconds: Number(timer.resumeContext.accumulatedElapsedSeconds) || 0,
    clientId: String(timer.resumeContext.clientId || ""),
    clientName: String(timer.resumeContext.clientName || ""),
    lastActiveStartTime: typeof timer.resumeContext.lastActiveStartTime === "string"
      ? timer.resumeContext.lastActiveStartTime
      : null,
    projectId: String(timer.resumeContext.projectId || ""),
    projectName: String(timer.resumeContext.projectName || ""),
    sourceId: String(timer.resumeContext.sourceId || task.task_id),
    sourceLabel: String(timer.resumeContext.sourceLabel || task.title || ""),
    sourceModuleId: String(timer.resumeContext.sourceModuleId || "tasks"),
    sourceType: String(timer.resumeContext.sourceType || "task"),
    sourceUrl: String(timer.resumeContext.sourceUrl || ""),
    timerStatus: timer.resumeContext.timerStatus === "running" ? "running" : "paused",
  };
  return {
    ...timer,
    active_task_timer_id: timer.active_timer_id,
    task_id: task.task_id,
    source_module_id: timer.source_module_id || "tasks",
    source_type: timer.source_type || "task",
    source_id: timer.source_id || task.task_id,
    source_metadata_json: typeof timer.source_metadata_json === "string" ? timer.source_metadata_json : "{}",
    sourceMetadata: timer.sourceMetadata || {},
    resumeContext,
    resume_context: resumeContext,
    created_at: timer.created_at || "",
    updated_at: timer.updated_at || "",
  };
}

/** @type {TaskTimersService} */
export const taskTimersService = {
  finalize,
  hasActiveTaskTimers,
  linkManualTimer,
  list,
  pauseRunningForBlockedTask,
  remove,
  save,
};
