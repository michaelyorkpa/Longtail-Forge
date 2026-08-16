// @ts-check

import { taskRemindersRepository } from "./task-reminders.repo.js";
import { clientsRepository } from "../client-projects/clients.repo.js";
import { projectsRepository } from "../client-projects/projects.repo.js";
import { settingsRepository } from "../../repositories/settings.repo.js";
import { normalizeUtcIso } from "../../utils/timezones.js";
import { registerPersistenceHandler } from "../../core/settings/settings-behavior-registry.js";

/** @typedef {import("../../types/task-workflow-contracts.js").TaskReminderDueKind} TaskReminderDueKind */
/** @typedef {import("../../types/task-workflow-contracts.js").TaskReminderEffectivePolicy} TaskReminderEffectivePolicy */
/** @typedef {import("../../types/task-workflow-contracts.js").TaskReminderOccurrence} TaskReminderOccurrence */
/** @typedef {import("../../types/task-workflow-contracts.js").TaskReminderOffset} TaskReminderOffset */
/** @typedef {import("../../types/task-workflow-contracts.js").TaskReminderPayload} TaskReminderPayload */
/** @typedef {import("../../types/task-workflow-contracts.js").TaskReminderPolicy} TaskReminderPolicy */
/** @typedef {import("../../types/task-workflow-contracts.js").TaskReminderPolicyChainEntry} TaskReminderPolicyChainEntry */
/** @typedef {import("../../types/task-workflow-contracts.js").TaskReminderPolicyInput} TaskReminderPolicyInput */
/** @typedef {import("../../types/task-workflow-contracts.js").TaskReminderRecord} TaskReminderRecord */
/** @typedef {import("../../types/task-workflow-contracts.js").TaskReminderTarget} TaskReminderTarget */
/** @typedef {import("../../types/task-workflow-contracts.js").TaskReminderTargetType} TaskReminderTargetType */

const DEFAULT_DATE_TIME_OFFSETS = [120, 1440];
const DEFAULT_DATE_ONLY_OFFSETS = [4320, 1440];
/** @type {TaskReminderDueKind} */
const DUE_KIND_DATE_ONLY = "date_only";
/** @type {TaskReminderDueKind} */
const DUE_KIND_DATE_TIME = "date_time";
let settingsHandlersRegistered = false;

/** @type {Record<string, { kind: "dateTime" | "dateOnly", index: number, multiplier: number }>} */
const REMINDER_SETTING_SPECS = {
  reminderDateTimeHours1: { kind: "dateTime", index: 0, multiplier: 60 },
  reminderDateTimeHours2: { kind: "dateTime", index: 1, multiplier: 60 },
  reminderDateOnlyDays1: { kind: "dateOnly", index: 0, multiplier: 1440 },
  reminderDateOnlyDays2: { kind: "dateOnly", index: 1, multiplier: 1440 },
};

/** @returns {void} */
function registerSettingsHandlers() {
  if (settingsHandlersRegistered) {
    return;
  }
  settingsHandlersRegistered = true;
  for (const [settingId, spec] of Object.entries(REMINDER_SETTING_SPECS)) {
    registerPersistenceHandler(`tasks.${settingId}`, {
      async read({ workspaceId }) {
        const policy = (await readWorkspaceDefaults(workspaceId)).offsets;
        return Math.max(1, Math.round(policy[spec.kind][spec.index] / spec.multiplier));
      },
      async write({ value, workspaceId }) {
        const policy = (await readWorkspaceDefaults(workspaceId)).offsets;
        policy[spec.kind][spec.index] = Math.max(1, Number.parseInt(String(value), 10)) * spec.multiplier;
        await saveWorkspaceDefaults(workspaceId, policy);
      },
      recordUrl: "tasks-settings.html",
    });
  }
}

/** @param {string} workspaceId */
async function readWorkspaceDefaults(workspaceId) {
  const offsets = await taskRemindersRepository.readOffsets(workspaceId, "workspace", workspaceId);
  return {
    inherited: false,
    source: "workspace",
    offsets: offsetsToPolicy(offsets, defaultPolicy()),
  };
}

/** @param {string} workspaceId @param {TaskReminderPolicy} policy */
async function saveWorkspaceDefaults(workspaceId, policy) {
  await savePolicy(workspaceId, "workspace", workspaceId, policy);
}

/** @param {string} workspaceId @param {TaskReminderTargetType} targetType @param {string} targetId */
async function readTargetPolicy(workspaceId, targetType, targetId) {
  const offsets = await taskRemindersRepository.readOffsets(workspaceId, targetType, targetId);
  return {
    inherited: offsets.length === 0,
    source: targetType,
    offsets: offsetsToPolicy(offsets, { dateTime: [], dateOnly: [] }),
  };
}

// Batched readTargetPolicy: one readOffsetsForTargets query answers every
// target, keyed by taskRemindersRepository.reminderKey(targetType, targetId).
/** @param {string} workspaceId @param {TaskReminderTarget[]} [targets] */
async function readTargetPoliciesForTargets(workspaceId, targets = []) {
  const uniqueTargets = [...new Map(targets
    .filter((target) => target?.targetType && target?.targetId)
    .map((target) => [taskRemindersRepository.reminderKey(target.targetType, target.targetId), target]),
  ).entries()];
  const offsetsByTarget = await taskRemindersRepository.readOffsetsForTargets(
    workspaceId,
    uniqueTargets.map(([, target]) => target),
  );

  return new Map(uniqueTargets.map(([key, target]) => {
    const offsets = offsetsByTarget.get(key) || [];
    return [key, {
      inherited: offsets.length === 0,
      source: target.targetType,
      offsets: offsetsToPolicy(offsets, { dateTime: [], dateOnly: [] }),
    }];
  }));
}

/** @param {unknown} workspaceId @param {TaskReminderTargetType} targetType @param {unknown} targetId @param {TaskReminderPolicy} policy @param {boolean} inherited */
async function saveTargetPolicy(workspaceId, targetType, targetId, policy, inherited) {
  await savePolicy(String(workspaceId ?? ""), targetType, targetId, inherited ? null : policy);
}

/** @param {TaskReminderRecord} task */
async function readEffectivePolicyForTask(task) {
  const chain = await readPolicyChain(task);
  return readEffectivePolicyFromChain(chain);
}

/** @param {TaskReminderRecord} task */
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

/** @param {TaskReminderRecord} task @param {Date} [now] */
async function computePendingReminderOccurrences(task, now = new Date()) {
  const policy = await readEffectivePolicyForTask(task);
  return computeReminderOccurrences(task, policy)
    .filter((occurrence) => occurrence.status === "pending" && new Date(occurrence.reminder_at_utc) >= now);
}

/** @param {string} workspaceId @param {TaskReminderRecord[]} tasks @returns {Promise<Map<string, TaskReminderOccurrence[]>>} */
async function computeReminderOccurrencesForTasks(workspaceId, tasks) {
  /** @type {Map<string, TaskReminderOccurrence[]>} */
  const occurrencesByTaskId = new Map();
  const candidates = (Array.isArray(tasks) ? tasks : [])
    .filter((task) => task?.task_id && task.due_date && task.workspace_id === workspaceId);

  if (candidates.length === 0) {
    return occurrencesByTaskId;
  }

  const settings = await settingsRepository.readWorkspaceSettings(workspaceId);
  const targetsByTaskId = new Map(candidates.map((task) => [
    task.task_id,
    policyChainTargets(task, settings.workspaceType),
  ]));
  const uniqueTargets = [...new Map(
    [...targetsByTaskId.values()]
      .flat()
      .map((target) => [taskRemindersRepository.reminderKey(target.targetType, target.targetId), target]),
  ).values()];
  const offsetsByTarget = await taskRemindersRepository.readOffsetsForTargets(workspaceId, uniqueTargets);

  for (const task of candidates) {
    const chain = policyChainEntries(targetsByTaskId.get(task.task_id) || [], offsetsByTarget);
    occurrencesByTaskId.set(task.task_id, computeReminderOccurrences(task, readEffectivePolicyFromChain(chain)));
  }

  return occurrencesByTaskId;
}

/** @param {TaskReminderPayload | null | undefined} payload */
function normalizeTaskReminderPayload(payload) {
  const overrideEnabled = Boolean(payload?.overrideEnabled || payload?.override_enabled);
  const policy = normalizeReminderPolicy(payload?.policy || payload?.reminderPolicy || payload);

  return {
    overrideEnabled,
    policy,
  };
}

/** @param {TaskReminderPolicyInput | null | undefined} policy @returns {TaskReminderPolicy} */
function normalizeReminderPolicy(policy) {
  return {
    dateTime: normalizeOffsetList(policy?.dateTime || policy?.date_time),
    dateOnly: normalizeOffsetList(policy?.dateOnly || policy?.date_only),
  };
}

/** @returns {TaskReminderPolicy} */
function defaultPolicy() {
  return {
    dateTime: [...DEFAULT_DATE_TIME_OFFSETS],
    dateOnly: [...DEFAULT_DATE_ONLY_OFFSETS],
  };
}

/** @param {TaskReminderRecord} task @param {TaskReminderEffectivePolicy} effectivePolicy @returns {TaskReminderOccurrence[]} */
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

/** @param {TaskReminderRecord} task @returns {Promise<TaskReminderPolicyChainEntry[]>} */
async function readPolicyChain(task) {
  const [settings, project, client] = await Promise.all([
    settingsRepository.readWorkspaceSettings(task.workspace_id),
    task.project_id ? projectsRepository.readById(task.workspace_id, task.project_id) : Promise.resolve(null),
    task.client_id ? clientsRepository.readById(task.workspace_id, task.client_id) : Promise.resolve(null),
  ]);
  /** @type {TaskReminderTarget[]} */
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
  return policyChainEntries(targets, offsetsByTarget);
}

/** @param {TaskReminderRecord} task @param {string} workspaceType @returns {TaskReminderTarget[]} */
function policyChainTargets(task, workspaceType) {
  /** @type {TaskReminderTarget[]} */
  const targets = [
    { targetType: "workspace", targetId: task.workspace_id },
  ];

  if (workspaceType === "business" && task.client_id) {
    targets.push({ targetType: "client", targetId: task.client_id });
  }

  if (task.project_id) {
    targets.push({ targetType: "project", targetId: task.project_id });
  }

  if (task.reminder_override_enabled) {
    targets.push({ targetType: "task", targetId: task.task_id });
  }

  return targets;
}

/** @param {TaskReminderTarget[]} targets @param {Map<string, TaskReminderOffset[]>} offsetsByTarget @returns {TaskReminderPolicyChainEntry[]} */
function policyChainEntries(targets, offsetsByTarget) {
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

/** @param {TaskReminderPolicyChainEntry[]} chain @returns {TaskReminderEffectivePolicy} */
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

/** @param {string} workspaceId @param {TaskReminderTargetType} targetType @param {unknown} targetId @param {TaskReminderPolicy | null} policy */
async function savePolicy(workspaceId, targetType, targetId, policy) {
  const normalizedPolicy = policy ? normalizeReminderPolicy(policy) : { dateTime: [], dateOnly: [] };
  /** @type {import("../../types/task-workflow-contracts.js").TaskReminderOffsetWrite[]} */
  const offsets = [
    ...normalizedPolicy.dateTime.map((offsetMinutes) => ({
      due_kind: DUE_KIND_DATE_TIME,
      offset_minutes: offsetMinutes,
    })),
    ...normalizedPolicy.dateOnly.map((offsetMinutes) => ({
      due_kind: DUE_KIND_DATE_ONLY,
      offset_minutes: offsetMinutes,
    })),
  ];
  await taskRemindersRepository.replaceOffsets(
    workspaceId,
    targetType,
    targetId,
    offsets,
  );
}

/** @param {TaskReminderOffset[]} offsets @param {TaskReminderPolicy} fallback @returns {TaskReminderPolicy} */
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

/** @param {unknown} values @returns {number[]} */
function normalizeOffsetList(values) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map((value) => Number.parseInt(String(value ?? ""), 10))
    .filter((value) => Number.isFinite(value) && value > 0)
    .slice(0, 4))]
    .sort((first, second) => first - second);
}

/** @param {TaskReminderRecord} task @param {TaskReminderDueKind} dueKind */
function readTaskDueUtc(task, dueKind) {
  if (dueKind === DUE_KIND_DATE_TIME) {
    const date = new Date(String(task.due_at_utc || ""));
    return Number.isFinite(date.getTime()) ? date : null;
  }

  const timezone = task.due_timezone || "America/New_York";
  const iso = normalizeUtcIso(`${task.due_date}T23:59:59`, timezone);
  const date = new Date(iso);
  return Number.isFinite(date.getTime()) ? date : null;
}

export const taskRemindersService = {
  computePendingReminderOccurrences,
  computeReminderOccurrencesForTasks,
  defaultPolicy,
  normalizeReminderPolicy,
  normalizeTaskReminderPayload,
  readEffectivePolicyForTask,
  readTargetPolicy,
  readTargetPoliciesForTargets,
  readTaskReminderDetails,
  readWorkspaceDefaults,
  registerSettingsHandlers,
  saveTargetPolicy,
  saveWorkspaceDefaults,
};
