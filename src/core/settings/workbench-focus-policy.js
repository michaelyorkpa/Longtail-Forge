import { registerFrameworkSettingDefinition } from "./framework-settings-registry.js";

const WORKBENCH_FOCUS_SETTING_IDS = Object.freeze({
  candidateGroups: "workbench.focusCandidateGroups",
  priorityOrder: "workbench.focusPriorityOrder",
});

const WORKBENCH_FOCUS_GROUPS = Object.freeze({
  overdueAssignedWork: "overdue_assigned_work",
  dueToday: "due_today",
  staleRecovery: "blocked_or_stale",
  recentlyTouched: "recently_touched",
});

const WORKBENCH_FOCUS_ORDER_PRESETS = Object.freeze({
  balanced: "balanced",
  recentFirst: "recent_first",
  recoveryFirst: "recovery_first",
});

/** @typedef {(typeof WORKBENCH_FOCUS_GROUPS)[keyof typeof WORKBENCH_FOCUS_GROUPS]} WorkbenchFocusGroup */
/** @typedef {(typeof WORKBENCH_FOCUS_ORDER_PRESETS)[keyof typeof WORKBENCH_FOCUS_ORDER_PRESETS]} WorkbenchFocusOrderPreset */
/** @typedef {{ candidateGroups: readonly WorkbenchFocusGroup[], priorityOrder: WorkbenchFocusOrderPreset }} WorkbenchFocusPolicy */

const WORKBENCH_FOCUS_GROUP_OPTIONS = Object.freeze([
  Object.freeze({ value: WORKBENCH_FOCUS_GROUPS.overdueAssignedWork, label: "Overdue assigned work" }),
  Object.freeze({ value: WORKBENCH_FOCUS_GROUPS.dueToday, label: "Due today" }),
  Object.freeze({ value: WORKBENCH_FOCUS_GROUPS.staleRecovery, label: "Stale recovery" }),
  Object.freeze({ value: WORKBENCH_FOCUS_GROUPS.recentlyTouched, label: "Recently touched" }),
]);

const DEFAULT_WORKBENCH_FOCUS_POLICY = Object.freeze({
  candidateGroups: Object.freeze(WORKBENCH_FOCUS_GROUP_OPTIONS.map((option) => option.value)),
  priorityOrder: WORKBENCH_FOCUS_ORDER_PRESETS.balanced,
});

const GROUP_ORDER_BY_PRESET = Object.freeze({
  [WORKBENCH_FOCUS_ORDER_PRESETS.balanced]: Object.freeze([
    WORKBENCH_FOCUS_GROUPS.overdueAssignedWork,
    WORKBENCH_FOCUS_GROUPS.dueToday,
    WORKBENCH_FOCUS_GROUPS.staleRecovery,
    WORKBENCH_FOCUS_GROUPS.recentlyTouched,
  ]),
  [WORKBENCH_FOCUS_ORDER_PRESETS.recentFirst]: Object.freeze([
    WORKBENCH_FOCUS_GROUPS.recentlyTouched,
    WORKBENCH_FOCUS_GROUPS.overdueAssignedWork,
    WORKBENCH_FOCUS_GROUPS.dueToday,
    WORKBENCH_FOCUS_GROUPS.staleRecovery,
  ]),
  [WORKBENCH_FOCUS_ORDER_PRESETS.recoveryFirst]: Object.freeze([
    WORKBENCH_FOCUS_GROUPS.staleRecovery,
    WORKBENCH_FOCUS_GROUPS.overdueAssignedWork,
    WORKBENCH_FOCUS_GROUPS.dueToday,
    WORKBENCH_FOCUS_GROUPS.recentlyTouched,
  ]),
});

registerFrameworkSettingDefinition({
  id: WORKBENCH_FOCUS_SETTING_IDS.candidateGroups,
  label: "Candidate Groups",
  description: "Choose the bounded work groups used by configurable Workbench focus modes. Running and paused timers always remain eligible and first.",
  type: "multi-select",
  default: [...DEFAULT_WORKBENCH_FOCUS_POLICY.candidateGroups],
  options: WORKBENCH_FOCUS_GROUP_OPTIONS.map((option) => ({ ...option })),
  moduleId: "workbench",
  moduleName: "Workbench",
  placement: "module",
  protected: true,
  recordUrl: "workbench-settings.html",
  requiredPermissions: ["workspace_settings.manage"],
});

registerFrameworkSettingDefinition({
  id: WORKBENCH_FOCUS_SETTING_IDS.priorityOrder,
  label: "Candidate Priority",
  description: "Choose a fixed ordering for the selected groups. Running timers remain first, followed by paused timers.",
  type: "select",
  default: DEFAULT_WORKBENCH_FOCUS_POLICY.priorityOrder,
  options: [
    { value: WORKBENCH_FOCUS_ORDER_PRESETS.balanced, label: "Balanced (due, recovery, recent)" },
    { value: WORKBENCH_FOCUS_ORDER_PRESETS.recentFirst, label: "Recently touched first" },
    { value: WORKBENCH_FOCUS_ORDER_PRESETS.recoveryFirst, label: "Stale recovery first" },
  ],
  moduleId: "workbench",
  moduleName: "Workbench",
  placement: "module",
  protected: true,
  recordUrl: "workbench-settings.html",
  requiredPermissions: ["workspace_settings.manage"],
});

/** @param {{ candidateGroups?: unknown, priorityOrder?: unknown }} [value] @returns {WorkbenchFocusPolicy} */
function normalizeWorkbenchFocusPolicy(value = {}) {
  const allowedGroups = new Set(WORKBENCH_FOCUS_GROUP_OPTIONS.map((option) => option.value));
  const candidateGroups = Array.isArray(value.candidateGroups) &&
      value.candidateGroups.every((group) => typeof group === "string" && allowedGroups.has(/** @type {WorkbenchFocusGroup} */ (group)))
    ? [...new Set(/** @type {WorkbenchFocusGroup[]} */ (value.candidateGroups))]
    : [...DEFAULT_WORKBENCH_FOCUS_POLICY.candidateGroups];
  const priorityOrder = typeof value.priorityOrder === "string" && Object.hasOwn(GROUP_ORDER_BY_PRESET, value.priorityOrder)
    ? /** @type {WorkbenchFocusOrderPreset} */ (value.priorityOrder)
    : DEFAULT_WORKBENCH_FOCUS_POLICY.priorityOrder;

  return {
    candidateGroups,
    priorityOrder,
  };
}

/** @param {WorkbenchFocusPolicy} [policy] @returns {WorkbenchFocusGroup[]} */
function orderedWorkbenchFocusGroups(policy = DEFAULT_WORKBENCH_FOCUS_POLICY) {
  const normalized = normalizeWorkbenchFocusPolicy(policy);
  const selectedGroups = new Set(normalized.candidateGroups);
  return GROUP_ORDER_BY_PRESET[normalized.priorityOrder].filter((group) => selectedGroups.has(group));
}

export {
  DEFAULT_WORKBENCH_FOCUS_POLICY,
  WORKBENCH_FOCUS_GROUPS,
  WORKBENCH_FOCUS_ORDER_PRESETS,
  WORKBENCH_FOCUS_SETTING_IDS,
  normalizeWorkbenchFocusPolicy,
  orderedWorkbenchFocusGroups,
};
