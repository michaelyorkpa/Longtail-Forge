// @ts-check
import { createRecordId } from "../../core/identifiers.js";
import { activeTimersRepository } from "./active-timers.repo.js";
import { timeEntriesService } from "./time-entries.service.js";
import { assertModuleWriteEnabled } from "../../core/modules/module-access.js";
import { modulesService } from "../../core/modules/modules.service.js";
import { AppError } from "../../core/errors.js";
import { permissionsService } from "../../core/permissions.js";
import { resolveProjectRecordScope } from "../../core/record-scope.js";
import { normalizeUtcIso } from "../../utils/timezones.js";
import { normalizeTimeEntryBillable } from "../../utils/normalizers.js";
import { workspaceSupportsBillable } from "../../utils/workspaces.js";
import { settingsRepository } from "../../repositories/settings.repo.js";
import {
  ActiveTimerFinalizeSchema,
  ActiveTimerSaveSchema,
  ActiveTimerSourcedSaveSchema,
  ActiveTimerStatusSchema,
  parseTimeTrackingEdgePayload,
} from "./time-tracking.contracts.js";

/** @typedef {import("./active-timers.repo.js").ActiveTimer} ActiveTimer */
/** @typedef {import("../../types/http-contracts.js").RequestSession & { workspace_id: string }} WorkspaceRequestSession */
/** @typedef {import("../../utils/normalizers.js").TimeEntryInput} TimeEntryInput */
/** @typedef {import("zod").infer<typeof ActiveTimerFinalizeSchema>} ActiveTimerFinalizePayload */
/** @typedef {import("zod").infer<typeof ActiveTimerSaveSchema>} ActiveTimerSavePayload */
/** @typedef {import("zod").infer<typeof ActiveTimerSourcedSaveSchema>} SourcedActiveTimerPayload */
/** @typedef {import("zod").infer<typeof ActiveTimerStatusSchema>} ActiveTimerStatusPayload */
/** @typedef {TimeEntryInput & { tagIds?: unknown[], tag_ids?: unknown[] }} FinalizedTimeEntryInput */
/** @typedef {{ source_id?: unknown, sourceId?: unknown, source_label?: unknown, sourceLabel?: unknown, source_module_id?: unknown, sourceModuleId?: unknown, source_type?: unknown, sourceType?: unknown, source_url?: unknown, sourceUrl?: unknown }} ActiveTimerSourceInput */

const MODULE_ID = "time-tracking";

async function list(session) {
  const timers = await activeTimersRepository.readAll(session.workspace_id, session.user_id);
  return {
    timers: await shapeTimerPayloads(session, timers),
  };
}

async function listAll(session) {
  const timers = await activeTimersRepository.readAllWorkTimers(session.workspace_id, session.user_id);
  return {
    timers: await shapeTimerPayloads(session, timers),
  };
}

/** @param {string} timerSlot @param {unknown} rawPayload @param {WorkspaceRequestSession} session */
async function save(timerSlot, rawPayload, session) {
  await assertModuleWriteEnabled(session, MODULE_ID);
  const payload = parseTimeTrackingEdgePayload(ActiveTimerSaveSchema, rawPayload);
  const normalizedTimerSlot = normalizeTimerSlot(timerSlot);
  const timer = normalizeTimerPayload(payload, normalizedTimerSlot, session);
  const [scope, settings] = await Promise.all([
    resolveTimerScope(session.workspace_id, timer),
    settingsRepository.readWorkspaceSettings(session.workspace_id),
  ]);
  const project = /** @type {NonNullable<typeof scope.project>} */ (scope.project);
  timer.client_id = scope.client?.id || "";
  timer.client_name = scope.client?.name || "";
  timer.project_id = project.id;
  timer.project_name = project.name;
  timer.billable = normalizeWorkspaceBillable(
    settings.workspaceType,
    payload?.billable ?? project.billable ?? scope.client?.billable,
  );

  await assertCanUseProjectTimer(session, timer, "save");

  const savedTimer = await activeTimersRepository.upsert(timer);
  const shapedTimer = await shapeTimerPayload(session, savedTimer);
  await emitTimerLifecycleEvent(timerStatusForEvent(shapedTimer), session, shapedTimer);

  return {
    timer: shapedTimer,
  };
}

/** @param {ActiveTimerSourceInput} source @param {unknown} rawPayload @param {WorkspaceRequestSession} session */
async function saveSourced(source, rawPayload, session) {
  await assertModuleWriteEnabled(session, MODULE_ID);
  const payload = parseTimeTrackingEdgePayload(ActiveTimerSourcedSaveSchema, rawPayload);
  const normalizedSource = normalizeSource(source);
  const timer = {
    ...normalizeTimerPayload(payload, `source:${normalizedSource.source_module_id}:${normalizedSource.source_type}:${normalizedSource.source_id}`, session),
    source_module_id: normalizedSource.source_module_id,
    source_type: normalizedSource.source_type,
    source_id: normalizedSource.source_id,
    source_label: normalizedSource.source_label,
    source_url: normalizedSource.source_url,
    sourceMetadata: payload?.sourceMetadata || payload?.source_metadata || {},
  };
  const settings = await settingsRepository.readWorkspaceSettings(session.workspace_id);
  timer.billable = normalizeWorkspaceBillable(settings.workspaceType, timer.billable);

  const savedTimer = await activeTimersRepository.upsert(timer);
  const shapedTimer = await shapeTimerPayload(session, savedTimer);
  await emitTimerLifecycleEvent(timerStatusForEvent(shapedTimer), session, shapedTimer);

  return {
    timer: shapedTimer,
  };
}

async function convertManualToSourced(timerSlot, source, payload, session) {
  await assertModuleWriteEnabled(session, MODULE_ID);
  const normalizedTimerSlot = normalizeTimerSlot(timerSlot);
  const normalizedSource = normalizeSource(source);
  const existingTimer = await activeTimersRepository.readBySlot(
    session.workspace_id,
    session.user_id,
    normalizedTimerSlot,
  );

  if (!existingTimer || existingTimer.source_module_id || existingTimer.source_type !== "manual") {
    throw new AppError("Running manual timer not found.", 404);
  }

  if (existingTimer.timer_status !== "running") {
    throw new AppError("Only a running manual timer can be linked to a task.", 400);
  }

  const settings = await settingsRepository.readWorkspaceSettings(session.workspace_id);

  const convertedTimer = {
    ...existingTimer,
    billable: normalizeWorkspaceBillable(settings.workspaceType, payload?.billable),
    client_id: stringOrEmpty(payload?.client_id),
    client_name: stringOrEmpty(payload?.client_name),
    description: stringOrEmpty(payload?.description),
    project_id: stringOrEmpty(payload?.project_id),
    project_name: stringOrEmpty(payload?.project_name),
    source_id: normalizedSource.source_id,
    source_label: normalizedSource.source_label,
    source_module_id: normalizedSource.source_module_id,
    source_type: normalizedSource.source_type,
    source_url: normalizedSource.source_url,
    sourceMetadata: payload?.sourceMetadata || payload?.source_metadata || {},
    timer_slot: `source:${normalizedSource.source_module_id}:${normalizedSource.source_type}:${normalizedSource.source_id}`,
  };

  if (!convertedTimer.project_id) {
    throw new AppError("Project is required before linking a timer.", 400);
  }

  await assertCanUseProjectTimer(session, convertedTimer, "link_source");
  const converted = await activeTimersRepository.convertManualToSource(
    session.workspace_id,
    session.user_id,
    normalizedTimerSlot,
    convertedTimer,
  );

  if (converted.status === "source_exists") {
    throw new AppError("The selected task already has an active timer.", 409);
  }

  if (converted.status !== "converted" || !converted.timer) {
    throw new AppError("Running manual timer not found.", 404);
  }

  const shapedTimer = await shapeTimerPayload(session, converted.timer);
  const timers = await activeTimersRepository.compactManualTimerSlots(session.workspace_id, session.user_id);
  await emitTimerLifecycleEvent(timerStatusForEvent(shapedTimer), session, shapedTimer);

  return {
    timer: shapedTimer,
    timers: await shapeTimerPayloads(session, timers),
  };
}

async function remove(timerSlot, session) {
  await assertModuleWriteEnabled(session, MODULE_ID);
  const normalizedTimerSlot = normalizeTimerSlot(timerSlot);

  const existingTimer = await activeTimersRepository.readBySlot(session.workspace_id, session.user_id, normalizedTimerSlot);
  const shapedTimer = existingTimer ? await shapeTimerPayload(session, existingTimer) : null;

  await activeTimersRepository.remove(session.workspace_id, session.user_id, normalizedTimerSlot);
  if (shapedTimer) {
    await emitTimerLifecycleEvent("timer.discarded", session, shapedTimer);
  }
  const timers = await activeTimersRepository.compactManualTimerSlots(session.workspace_id, session.user_id);
  return { timer_slot: normalizedTimerSlot, removed: true, timers: await shapeTimerPayloads(session, timers) };
}

async function updateStatus(timerSlot, rawPayload, session) {
  await assertModuleWriteEnabled(session, MODULE_ID);
  const payload = parseTimeTrackingEdgePayload(ActiveTimerStatusSchema, rawPayload);
  const normalizedTimerSlot = normalizeTimerSlot(timerSlot);
  const existingTimer = await activeTimersRepository.readBySlot(session.workspace_id, session.user_id, normalizedTimerSlot);

  if (!existingTimer) {
    throw new AppError("Active timer not found.", 404);
  }

  await assertCanUseProjectTimer(session, existingTimer, "timer_status");
  const timerStatus = payload?.timer_status === "running" ? "running" : "paused";
  const accumulatedElapsedSeconds = Math.max(
    0,
    Number.parseInt(String(payload?.accumulated_elapsed_seconds ?? existingTimer.accumulated_elapsed_seconds), 10) || 0,
  );
  const settings = await settingsRepository.readWorkspaceSettings(session.workspace_id);

  const savedTimer = await activeTimersRepository.upsert({
      ...existingTimer,
      accumulated_elapsed_seconds: accumulatedElapsedSeconds,
      billable: normalizeWorkspaceBillable(settings.workspaceType, existingTimer.billable),
      last_active_start_time: timerStatus === "running"
        ? normalizeIsoDate(payload?.last_active_start_time || new Date().toISOString())
        : null,
      timer_status: timerStatus,
    });
  const shapedTimer = await shapeTimerPayload(session, savedTimer);
  await emitTimerLifecycleEvent(timerStatusForEvent(shapedTimer), session, shapedTimer);

  return {
    timer: shapedTimer,
  };
}

async function pauseRunningSourced(source, session) {
  const normalizedSource = normalizeSource(source);

  await activeTimersRepository.pauseRunningBySource(session.workspace_id, {
    sourceId: normalizedSource.source_id,
    sourceModuleId: normalizedSource.source_module_id,
    sourceType: normalizedSource.source_type,
  });

  return {
    paused: true,
    source_id: normalizedSource.source_id,
    source_module_id: normalizedSource.source_module_id,
    source_type: normalizedSource.source_type,
  };
}

async function removeSourced(source, session) {
  await assertModuleWriteEnabled(session, MODULE_ID);
  const normalizedSource = normalizeSource(source);

  const existingTimer = await activeTimersRepository.readBySource(session.workspace_id, session.user_id, {
    sourceModuleId: normalizedSource.source_module_id,
    sourceType: normalizedSource.source_type,
    sourceId: normalizedSource.source_id,
  });
  const shapedTimer = existingTimer ? await shapeTimerPayload(session, existingTimer) : null;

  await activeTimersRepository.removeBySource(session.workspace_id, session.user_id, {
    sourceModuleId: normalizedSource.source_module_id,
    sourceType: normalizedSource.source_type,
    sourceId: normalizedSource.source_id,
  });
  if (shapedTimer) {
    await emitTimerLifecycleEvent("timer.discarded", session, shapedTimer);
  }

  return {
    source_id: normalizedSource.source_id,
    source_type: normalizedSource.source_type,
    removed: true,
  };
}

/** @param {string} timerSlot @param {unknown} rawPayload @param {WorkspaceRequestSession} session */
async function finalize(timerSlot, rawPayload, session) {
  await assertModuleWriteEnabled(session, MODULE_ID);
  const payload = parseTimeTrackingEdgePayload(ActiveTimerFinalizeSchema, rawPayload);
  const normalizedTimerSlot = normalizeTimerSlot(timerSlot);
  const activeTimer = await activeTimersRepository.readBySlot(
    session.workspace_id,
    session.user_id,
    normalizedTimerSlot,
  );
  const timerFacts = finalizedTimerFacts(activeTimer, payload);
  /** @type {FinalizedTimeEntryInput} */
  const entry = {
    client_id: payload?.client_id ?? activeTimer?.client_id ?? "",
    client_name: payload?.client_name ?? activeTimer?.client_name ?? "",
    project_id: payload?.project_id ?? activeTimer?.project_id ?? "",
    project_name: payload?.project_name ?? activeTimer?.project_name ?? "",
    description: payload?.description ?? activeTimer?.description ?? "",
    start_time: timerFacts.startTime,
    end_time: timerFacts.endTime,
    duration_seconds: timerFacts.durationSeconds,
    duration_hours: timerFacts.durationHours,
    billable: payload?.billable ?? activeTimer?.billable ?? "yes",
    invoice_status: payload?.invoice_status || "unbilled",
    tagIds: payload?.tagIds || payload?.tag_ids || [],
  };
  if (activeTimer?.source_module_id === "tasks" && activeTimer?.source_type === "task" && activeTimer?.source_id) {
    entry.task_id = activeTimer.source_id;
  }

  if (!entry.project_id) {
    throw new AppError("Project is required before saving time.", 400);
  }

  const result = await timeEntriesService.createFromActiveTimer(entry, session);
  const shapedTimer = activeTimer ? await shapeTimerPayload(session, activeTimer) : null;
  await activeTimersRepository.remove(session.workspace_id, session.user_id, normalizedTimerSlot);
  const timers = await activeTimersRepository.compactManualTimerSlots(session.workspace_id, session.user_id);
  if (shapedTimer) {
    await emitTimerLifecycleEvent("timer.finalized", session, shapedTimer, {
      duration_seconds: timerFacts.durationSeconds,
      time_entry_id: result.entry_id,
    });
  }

  return {
    ...result,
    active_timer_removed: true,
    timer_slot: normalizedTimerSlot,
    timers: await shapeTimerPayloads(session, timers),
  };
}

/** @param {ActiveTimerSourceInput} source @param {unknown} rawPayload @param {WorkspaceRequestSession} session @param {Partial<FinalizedTimeEntryInput>} entryOverrides */
async function finalizeSourced(source, rawPayload, session, entryOverrides = {}) {
  await assertModuleWriteEnabled(session, MODULE_ID);
  const payload = parseTimeTrackingEdgePayload(ActiveTimerFinalizeSchema, rawPayload);
  const normalizedSource = normalizeSource(source);
  const sourceLookup = {
    sourceModuleId: normalizedSource.source_module_id,
    sourceType: normalizedSource.source_type,
    sourceId: normalizedSource.source_id,
  };
  const activeTimer = await activeTimersRepository.readBySource(
    session.workspace_id,
    session.user_id,
    sourceLookup,
  );
  const timerFacts = finalizedTimerFacts(activeTimer, payload);
  /** @type {FinalizedTimeEntryInput} */
  const entry = {
    client_id: payload?.client_id ?? activeTimer?.client_id ?? "",
    client_name: payload?.client_name ?? activeTimer?.client_name ?? "",
    project_id: payload?.project_id ?? activeTimer?.project_id ?? "",
    project_name: payload?.project_name ?? activeTimer?.project_name ?? "",
    description: payload?.description ?? activeTimer?.description ?? "",
    start_time: timerFacts.startTime,
    end_time: timerFacts.endTime,
    duration_seconds: timerFacts.durationSeconds,
    duration_hours: timerFacts.durationHours,
    billable: payload?.billable ?? activeTimer?.billable ?? "yes",
    invoice_status: payload?.invoice_status || "unbilled",
    tagIds: payload?.tagIds || payload?.tag_ids || [],
    ...entryOverrides,
  };

  if (!entry.project_id) {
    throw new AppError("Project is required before saving time.", 400);
  }

  const result = await timeEntriesService.createFromActiveTimer(entry, session);
  const shapedTimer = activeTimer ? await shapeTimerPayload(session, activeTimer) : null;
  await activeTimersRepository.removeBySource(session.workspace_id, session.user_id, sourceLookup);
  if (shapedTimer) {
    await emitTimerLifecycleEvent("timer.finalized", session, shapedTimer, {
      duration_seconds: timerFacts.durationSeconds,
      time_entry_id: result.entry_id,
    });
  }

  return {
    ...result,
    active_timer_removed: true,
    source_id: normalizedSource.source_id,
    source_type: normalizedSource.source_type,
    duration_seconds: timerFacts.durationSeconds,
  };
}

async function shapeTimerPayloads(session, timers = []) {
  const settings = await settingsRepository.readWorkspaceSettings(session.workspace_id, session);
  const shaped = [];

  for (const timer of timers) {
    shaped.push(await shapeTimerPayload(session, {
      ...timer,
      billable: normalizeWorkspaceBillable(settings.workspaceType, timer.billable),
    }));
  }

  return shaped;
}

async function shapeTimerPayload(session, timer) {
  const sourceReadable = await canReadTimerSource(session, timer);
  const safeSourceLabel = sourceReadable ? stringOrEmpty(timer.source_label || timer.description) : "";
  const safeSourceUrl = sourceReadable ? safeUrl(timer.source_url) : "";
  const sourceModuleId = stringOrEmpty(timer.source_module_id);
  const sourceType = stringOrEmpty(timer.source_type || "manual");
  const sourceId = stringOrEmpty(timer.source_id);
  const resumeContext = {
    accumulatedElapsedSeconds: Number(timer.accumulated_elapsed_seconds) || 0,
    clientId: stringOrEmpty(timer.client_id),
    clientName: stringOrEmpty(timer.client_name),
    lastActiveStartTime: timer.last_active_start_time || null,
    projectId: stringOrEmpty(timer.project_id),
    projectName: stringOrEmpty(timer.project_name),
    sourceId,
    sourceLabel: safeSourceLabel,
    sourceModuleId,
    sourceType,
    sourceUrl: safeSourceUrl,
    timerStatus: timer.timer_status === "running" ? "running" : "paused",
  };

  return {
    ...timer,
    source_label: safeSourceLabel,
    source_url: safeSourceUrl,
    resumeContext,
    resume_context: resumeContext,
  };
}

async function canReadTimerSource(session, timer) {
  if (!timer?.source_module_id || timer.source_type === "manual") {
    return true;
  }

  if (!(await modulesService.canReadModule(session.workspace_id, timer.source_module_id))) {
    return false;
  }

  if (timer.source_module_id === "tasks" && timer.source_type === "task") {
    return permissionsService.can(session, "tasks.view", {
      workspace_id: session.workspace_id,
      client_id: timer.client_id || "",
      project_id: timer.project_id || "",
      operation: "read",
    });
  }

  return false;
}

function timerStatusForEvent(timer) {
  return timer?.timer_status === "running" ? "timer.started" : "timer.paused";
}

async function emitTimerLifecycleEvent(eventName, session, timer, extraMetadata = {}) {
  const payload = safeTimerLifecyclePayload(timer, extraMetadata);

  return modulesService.emitInternalEvent(eventName, {
    metadata: payload,
    moduleId: MODULE_ID,
    newValue: payload,
    recordId: timer.active_timer_id,
    recordType: "active_work_timer",
    session,
    source: timer.source_type || "manual",
    workspaceId: session.workspace_id,
  });
}

function safeTimerLifecyclePayload(timer, extraMetadata = {}) {
  return {
    accumulated_elapsed_seconds: Number(timer.accumulated_elapsed_seconds) || 0,
    active_timer_id: timer.active_timer_id,
    client_id: timer.client_id || "",
    last_active_start_time: timer.last_active_start_time || null,
    project_id: timer.project_id || "",
    source_id: timer.source_id || "",
    source_label: timer.source_label || "",
    source_module_id: timer.source_module_id || "",
    source_type: timer.source_type || "manual",
    source_url: timer.source_url || "",
    timer_slot: timer.timer_slot,
    timer_status: timer.timer_status,
    ...extraMetadata,
  };
}

function safeUrl(value) {
  const url = stringOrEmpty(value);

  if (!url || /^(?:https?:|javascript:|data:)/i.test(url)) {
    return "";
  }

  return url;
}

/**
 * @param {ActiveTimer | null | undefined} activeTimer
 * @param {ActiveTimerFinalizePayload} payload
 */
function finalizedTimerFacts(activeTimer, payload = {}) {
  if (!activeTimer) {
    const durationSeconds = Math.max(1, Number.parseInt(String(payload?.duration_seconds ?? ""), 10) || 0);
    const endTime = normalizeIsoDate(payload?.end_time || new Date().toISOString());
    const startTime = normalizeIsoDate(payload?.start_time || new Date(new Date(endTime).getTime() - durationSeconds * 1000).toISOString());

    return {
      durationHours: (durationSeconds / 3600).toFixed(4),
      durationSeconds,
      endTime,
      startTime,
    };
  }

  const endTime = normalizeIsoDate(new Date().toISOString());
  const durationSeconds = Math.max(1, activeTimerElapsedSecondsAt(activeTimer, endTime));
  const startTime = normalizeIsoDate(
    activeTimer.created_at ||
    activeTimer.last_active_start_time ||
    new Date(new Date(endTime).getTime() - durationSeconds * 1000).toISOString(),
  );

  return {
    durationHours: (durationSeconds / 3600).toFixed(4),
    durationSeconds,
    endTime,
    startTime,
  };
}

/** @param {ActiveTimer} activeTimer */
function activeTimerElapsedSecondsAt(activeTimer, endTime) {
  const accumulatedSeconds = Math.max(0, Number.parseInt(String(activeTimer.accumulated_elapsed_seconds), 10) || 0);

  if (activeTimer?.timer_status !== "running" || !activeTimer?.last_active_start_time) {
    return accumulatedSeconds;
  }

  const lastActiveStartedAt = new Date(activeTimer.last_active_start_time).getTime();
  const endedAt = new Date(endTime).getTime();
  const runningSeconds = Number.isFinite(lastActiveStartedAt) && Number.isFinite(endedAt)
    ? Math.max(0, Math.floor((endedAt - lastActiveStartedAt) / 1000))
    : 0;

  return accumulatedSeconds + runningSeconds;
}

/**
 * @param {ActiveTimerSavePayload | SourcedActiveTimerPayload} payload
 * @param {string} timerSlot
 * @param {WorkspaceRequestSession} session
 * @returns {ActiveTimer}
 */
function normalizeTimerPayload(payload, timerSlot, session) {
  const timerStatus = payload?.timer_status === "running" ? "running" : "paused";
  const elapsedSeconds = Math.max(0, Number.parseInt(String(payload?.accumulated_elapsed_seconds ?? ""), 10) || 0);

  if (!payload?.project_id) {
    throw new AppError("Project is required before persisting a timer.", 400);
  }

  return {
    active_timer_id: payload?.active_timer_id || createRecordId(),
    workspace_id: session.workspace_id,
    user_id: session.user_id,
    timer_slot: timerSlot,
    source_module_id: null,
    source_type: "manual",
    source_id: null,
    source_label: "Manual",
    source_url: "",
    client_id: stringOrEmpty(payload?.client_id),
    client_name: stringOrEmpty(payload?.client_name),
    project_id: stringOrEmpty(payload?.project_id),
    project_name: stringOrEmpty(payload?.project_name),
    description: stringOrEmpty(payload?.description),
    billable: normalizeTimeEntryBillable(payload?.billable) || "yes",
    accumulated_elapsed_seconds: elapsedSeconds,
    last_active_start_time: timerStatus === "running"
      ? normalizeIsoDate(payload?.last_active_start_time)
      : null,
    timer_status: timerStatus,
  };
}

/** @param {ActiveTimerSourceInput} source */
function normalizeSource(source) {
  const normalized = {
    source_module_id: stringOrEmpty(source?.source_module_id || source?.sourceModuleId),
    source_type: stringOrEmpty(source?.source_type || source?.sourceType),
    source_id: stringOrEmpty(source?.source_id || source?.sourceId),
    source_label: stringOrEmpty(source?.source_label || source?.sourceLabel),
    source_url: stringOrEmpty(source?.source_url || source?.sourceUrl),
  };

  if (!normalized.source_module_id || !normalized.source_type || !normalized.source_id) {
    throw new AppError("Timer source metadata is required.", 400);
  }

  return normalized;
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

/** @param {unknown} workspaceType @param {unknown} value @returns {"yes" | "no"} */
function normalizeWorkspaceBillable(workspaceType, value) {
  if (!workspaceSupportsBillable(workspaceType)) {
    return "no";
  }

  return value === "no" || value === false ? "no" : "yes";
}

export const activeTimersService = {
  convertManualToSourced,
  finalize,
  finalizeSourced,
  list,
  listAll,
  pauseRunningSourced,
  remove,
  removeSourced,
  save,
  saveSourced,
  updateStatus,
};
