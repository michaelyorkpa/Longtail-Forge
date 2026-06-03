import { taskRemindersRepository } from "./task-reminders.repo.js";
import { clientsRepository } from "../client-projects/clients.repo.js";
import { projectsRepository } from "../client-projects/projects.repo.js";
import { settingsRepository } from "../../repositories/settings.repo.js";
import { normalizeUtcIso } from "../../utils/timezones.js";

const DEFAULT_DATE_TIME_OFFSETS = [120, 1440];
const DEFAULT_DATE_ONLY_OFFSETS = [4320, 1440];
const DUE_KIND_DATE_ONLY = "date_only";
const DUE_KIND_DATE_TIME = "date_time";

async function readWorkspaceDefaults(workspaceId) {
  const offsets = await taskRemindersRepository.readOffsets(workspaceId, "workspace", workspaceId);
  return {
    inherited: false,
    source: "workspace",
    offsets: offsetsToPolicy(offsets, defaultPolicy()),
  };
}

async function saveWorkspaceDefaults(workspaceId, policy) {
  await savePolicy(workspaceId, "workspace", workspaceId, policy);
}

async function readTargetPolicy(workspaceId, targetType, targetId) {
  const offsets = await taskRemindersRepository.readOffsets(workspaceId, targetType, targetId);
  return {
    inherited: offsets.length === 0,
    source: targetType,
    offsets: offsetsToPolicy(offsets, { dateTime: [], dateOnly: [] }),
  };
}

async function saveTargetPolicy(workspaceId, targetType, targetId, policy, inherited) {
  await savePolicy(workspaceId, targetType, targetId, inherited ? null : policy);
}

async function readEffectivePolicyForTask(task) {
  const chain = await readPolicyChain(task);
  return readEffectivePolicyFromChain(chain);
}

async function readTaskReminderDetails(task) {
  const chain = await readPolicyChain(task);
  const effectivePolicy = readEffectivePolicyFromChain(chain);
  const taskPolicy = chain.find((entry) => entry.targetType === "task");

  return {
    overrideEnabled: Boolean(task.reminder_override_enabled),
    effectivePolicy,
    taskPolicy: taskPolicy?.policy || { dateTime: [], dateOnly: [] },
    inheritedFrom: effectivePolicy.source,
    computedOccurrences: computeReminderOccurrences(task, effectivePolicy),
  };
}

async function computePendingReminderOccurrences(task, now = new Date()) {
  const policy = await readEffectivePolicyForTask(task);
  return computeReminderOccurrences(task, policy)
    .filter((occurrence) => occurrence.status === "pending" && new Date(occurrence.reminder_at_utc) >= now);
}

function normalizeTaskReminderPayload(payload) {
  const overrideEnabled = Boolean(payload?.overrideEnabled || payload?.override_enabled);
  const policy = normalizeReminderPolicy(payload?.policy || payload?.reminderPolicy || payload);

  return {
    overrideEnabled,
    policy,
  };
}

function normalizeReminderPolicy(policy) {
  return {
    dateTime: normalizeOffsetList(policy?.dateTime || policy?.date_time),
    dateOnly: normalizeOffsetList(policy?.dateOnly || policy?.date_only),
  };
}

function defaultPolicy() {
  return {
    dateTime: [...DEFAULT_DATE_TIME_OFFSETS],
    dateOnly: [...DEFAULT_DATE_ONLY_OFFSETS],
  };
}

function computeReminderOccurrences(task, effectivePolicy) {
  if (!task?.due_date || task.status === "archived") {
    return [];
  }

  const dueKind = task.due_time ? DUE_KIND_DATE_TIME : DUE_KIND_DATE_ONLY;
  const offsets = dueKind === DUE_KIND_DATE_TIME
    ? effectivePolicy.offsets.dateTime
    : effectivePolicy.offsets.dateOnly;
  const dueUtc = readTaskDueUtc(task, dueKind);

  if (!dueUtc) {
    return [];
  }

  return offsets.map((offsetMinutes) => {
    const reminderAt = new Date(dueUtc.getTime() - offsetMinutes * 60 * 1000);
    return {
      task_id: task.task_id,
      workspace_id: task.workspace_id,
      due_kind: dueKind,
      due_at_utc: dueUtc.toISOString(),
      reminder_at_utc: reminderAt.toISOString(),
      offset_minutes: offsetMinutes,
      source: effectivePolicy.source,
      status: "pending",
    };
  });
}

async function readPolicyChain(task) {
  const [settings, project, client] = await Promise.all([
    settingsRepository.readWorkspaceSettings(task.workspace_id),
    task.project_id ? projectsRepository.readById(task.workspace_id, task.project_id) : Promise.resolve(null),
    task.client_id ? clientsRepository.readById(task.workspace_id, task.client_id) : Promise.resolve(null),
  ]);
  const targets = [
    { targetType: "workspace", targetId: task.workspace_id },
  ];

  if (settings.workspaceType === "business" && (client?.id || task.client_id)) {
    targets.push({ targetType: "client", targetId: client?.id || task.client_id });
  }

  if (project?.id || task.project_id) {
    targets.push({ targetType: "project", targetId: project?.id || task.project_id });
  }

  if (task.reminder_override_enabled) {
    targets.push({ targetType: "task", targetId: task.task_id });
  }

  const offsetsByTarget = await taskRemindersRepository.readOffsetsForTargets(task.workspace_id, targets);
  return targets.map((target) => {
    const offsets = offsetsByTarget.get(taskRemindersRepository.reminderKey(target.targetType, target.targetId)) || [];
    const fallback = target.targetType === "workspace" ? defaultPolicy() : { dateTime: [], dateOnly: [] };

    return {
      ...target,
      policy: offsetsToPolicy(offsets, fallback),
      hasOffsets: offsets.length > 0 || target.targetType === "workspace",
    };
  });
}

function readEffectivePolicyFromChain(chain) {
  const selected = [...chain].reverse().find((entry) => entry.hasOffsets) || {
    targetType: "default",
    targetId: "",
    policy: defaultPolicy(),
  };

  return {
    source: selected.targetType,
    targetId: selected.targetId,
    offsets: selected.policy,
  };
}

async function savePolicy(workspaceId, targetType, targetId, policy) {
  const normalizedPolicy = policy ? normalizeReminderPolicy(policy) : { dateTime: [], dateOnly: [] };
  await taskRemindersRepository.replaceOffsets(
    workspaceId,
    targetType,
    targetId,
    [
      ...normalizedPolicy.dateTime.map((offsetMinutes) => ({
        due_kind: DUE_KIND_DATE_TIME,
        offset_minutes: offsetMinutes,
      })),
      ...normalizedPolicy.dateOnly.map((offsetMinutes) => ({
        due_kind: DUE_KIND_DATE_ONLY,
        offset_minutes: offsetMinutes,
      })),
    ],
  );
}

function offsetsToPolicy(offsets, fallback) {
  const dateTime = offsets
    .filter((offset) => offset.due_kind === DUE_KIND_DATE_TIME)
    .map((offset) => offset.offset_minutes);
  const dateOnly = offsets
    .filter((offset) => offset.due_kind === DUE_KIND_DATE_ONLY)
    .map((offset) => offset.offset_minutes);

  return {
    dateTime: dateTime.length > 0 ? dateTime : [...fallback.dateTime],
    dateOnly: dateOnly.length > 0 ? dateOnly : [...fallback.dateOnly],
  };
}

function normalizeOffsetList(values) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map((value) => Number.parseInt(value, 10))
    .filter((value) => Number.isFinite(value) && value > 0)
    .slice(0, 4))]
    .sort((first, second) => first - second);
}

function readTaskDueUtc(task, dueKind) {
  if (dueKind === DUE_KIND_DATE_TIME) {
    const date = new Date(task.due_at_utc);
    return Number.isFinite(date.getTime()) ? date : null;
  }

  const timezone = task.due_timezone || "America/New_York";
  const iso = normalizeUtcIso(`${task.due_date}T23:59:59`, timezone);
  const date = new Date(iso);
  return Number.isFinite(date.getTime()) ? date : null;
}

export const taskRemindersService = {
  computePendingReminderOccurrences,
  defaultPolicy,
  normalizeReminderPolicy,
  normalizeTaskReminderPayload,
  readEffectivePolicyForTask,
  readTargetPolicy,
  readTaskReminderDetails,
  readWorkspaceDefaults,
  saveTargetPolicy,
  saveWorkspaceDefaults,
};
