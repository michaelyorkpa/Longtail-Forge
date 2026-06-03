import { randomUUID } from "node:crypto";
import { activeTimersRepository } from "./active-timers.repo.js";
import { taskTimersRepository } from "../tasks/task-timers.repo.js";
import { timeEntriesService } from "./time-entries.service.js";
import { assertModuleWriteEnabled } from "../../core/modules/module-access.js";
import { AppError } from "../../core/errors.js";
import { permissionsService } from "../../core/permissions.js";
import { resolveProjectRecordScope } from "../../core/record-scope.js";
import { normalizeUtcIso } from "../../utils/timezones.js";

const MODULE_ID = "time-tracking";

async function list(session) {
  return {
    timers: await activeTimersRepository.readAll(session.workspace_id, session.user_id),
  };
}

async function save(timerSlot, payload, session) {
  await assertModuleWriteEnabled(session, MODULE_ID);
  const normalizedTimerSlot = normalizeTimerSlot(timerSlot);
  const timer = normalizeTimerPayload(payload, normalizedTimerSlot, session);
  const scope = await resolveTimerScope(session.workspace_id, timer);
  timer.client_id = scope.client?.id || "";
  timer.client_name = scope.client?.name || "";
  timer.project_id = scope.project.id;
  timer.project_name = scope.project.name;
  timer.billable = (payload?.billable ?? scope.project.billable ?? scope.client?.billable) === "no" ? "no" : "yes";

  await assertCanUseProjectTimer(session, timer, "save");

  if (timer.timer_status === "running") {
    await taskTimersRepository.pauseRunningForUser(session.workspace_id, session.user_id);
  }

  return {
    timer: await activeTimersRepository.upsert(timer),
  };
}

async function remove(timerSlot, session) {
  await assertModuleWriteEnabled(session, MODULE_ID);
  const normalizedTimerSlot = normalizeTimerSlot(timerSlot);

  await activeTimersRepository.remove(session.workspace_id, session.user_id, normalizedTimerSlot);
  return { timer_slot: normalizedTimerSlot, removed: true };
}

async function finalize(timerSlot, payload, session) {
  await assertModuleWriteEnabled(session, MODULE_ID);
  const normalizedTimerSlot = normalizeTimerSlot(timerSlot);
  const activeTimer = await activeTimersRepository.readBySlot(
    session.workspace_id,
    session.user_id,
    normalizedTimerSlot,
  );
  const entry = {
    client_id: payload?.client_id ?? activeTimer?.client_id ?? "",
    client_name: payload?.client_name ?? activeTimer?.client_name ?? "",
    project_id: payload?.project_id ?? activeTimer?.project_id ?? "",
    project_name: payload?.project_name ?? activeTimer?.project_name ?? "",
    description: payload?.description ?? activeTimer?.description ?? "",
    start_time: payload?.start_time,
    end_time: payload?.end_time,
    duration_seconds: payload?.duration_seconds,
    duration_hours: payload?.duration_hours,
    billable: payload?.billable ?? activeTimer?.billable ?? "yes",
    invoice_status: payload?.invoice_status || "unbilled",
  };

  if (!entry.project_id) {
    throw new AppError("Project is required before saving time.", 400);
  }

  const result = await timeEntriesService.create(entry, session);
  await activeTimersRepository.remove(session.workspace_id, session.user_id, normalizedTimerSlot);

  return {
    ...result,
    active_timer_removed: true,
    timer_slot: normalizedTimerSlot,
  };
}

function normalizeTimerPayload(payload, timerSlot, session) {
  const timerStatus = payload?.timer_status === "running" ? "running" : "paused";
  const elapsedSeconds = Math.max(0, Number.parseInt(payload?.accumulated_elapsed_seconds, 10) || 0);

  if (!payload?.project_id) {
    throw new AppError("Project is required before persisting a timer.", 400);
  }

  return {
    active_timer_id: payload?.active_timer_id || randomUUID(),
    workspace_id: session.workspace_id,
    user_id: session.user_id,
    timer_slot: timerSlot,
    client_id: stringOrEmpty(payload?.client_id),
    client_name: stringOrEmpty(payload?.client_name),
    project_id: stringOrEmpty(payload?.project_id),
    project_name: stringOrEmpty(payload?.project_name),
    description: stringOrEmpty(payload?.description),
    billable: payload?.billable === "no" ? "no" : "yes",
    accumulated_elapsed_seconds: elapsedSeconds,
    last_active_start_time: timerStatus === "running"
      ? normalizeIsoDate(payload?.last_active_start_time)
      : null,
    timer_status: timerStatus,
  };
}

async function assertCanUseProjectTimer(session, timer, operation) {
  await permissionsService.assertCan(session, "time_entries.create", {
    workspace_id: session.workspace_id,
    client_id: timer.client_id,
    project_id: timer.project_id,
    operation,
  });
}

async function resolveTimerScope(workspaceId, timer) {
  return resolveProjectRecordScope(workspaceId, timer, {
    archivedClientMessage: "Archived clients cannot receive active timers.",
    archivedProjectMessage: "Archived projects cannot receive active timers.",
    clientNotFoundMessage: "Client not found",
    projectNotFoundMessage: "Project is required before persisting a timer.",
  });
}

function normalizeTimerSlot(timerSlot) {
  const normalized = String(timerSlot || "").trim();

  if (!normalized) {
    throw new AppError("Timer slot is required.", 400);
  }

  return normalized;
}

function normalizeIsoDate(value) {
  return normalizeUtcIso(value);
}

function stringOrEmpty(value) {
  return String(value || "").trim();
}

export const activeTimersService = {
  finalize,
  list,
  remove,
  save,
};
