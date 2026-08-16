// @ts-check

/** @typedef {import("../../types/task-block-recovery-contracts.d.ts").TaskBlockRecoveryRecord} TaskBlockRecoveryRecord */
/** @typedef {import("../../types/task-block-recovery-contracts.d.ts").TaskBlockRecoveryTransition} TaskBlockRecoveryTransition */
/** @typedef {import("../../types/task-block-recovery-contracts.d.ts").TaskLifecycleStatus} TaskLifecycleStatus */

export const AUTO_BLOCKED_REASON_PREFIX = "Blocked by incomplete child task";

const TERMINAL_STATUSES = new Set(["complete", "archived"]);
const NO_EFFECTS = Object.freeze({
  emitTaskUpdated: false,
  pauseRunningTimers: false,
  persistTask: false,
  reindexSearch: false,
});

/**
 * Decide the automatic parent transition caused by one incomplete blocking child.
 * Persistence and every external side effect remain with the Tasks orchestrator.
 *
 * @param {import("../../types/task-block-recovery-contracts.d.ts").ParentBlockTransitionInput} input
 * @returns {TaskBlockRecoveryTransition}
 */
export function planParentBlockTransition({ parentTask, blockingChild }) {
  if (isTaskTerminalStatus(parentTask.status)) {
    return noTransition("parent_terminal");
  }

  if (isTaskTerminalStatus(blockingChild.status)) {
    return noTransition("child_terminal");
  }

  const childTitle = rawText(blockingChild.title) || rawText(blockingChild.task_id);
  const blockedReason = rawText(parentTask.blocked_reason) || automaticBlockedReason([childTitle]);

  return {
    effects: {
      emitTaskUpdated: true,
      pauseRunningTimers: true,
      persistTask: true,
      reindexSearch: true,
    },
    eventMetadata: {
      status_transition_reason: "blocked_by_child",
      blocking_child_task_id: rawText(blockingChild.task_id),
      blocking_child_title: rawText(blockingChild.title),
    },
    kind: "block_parent",
    reason: "blocking_child_incomplete",
    searchReason: "task.blocked_by_child",
    taskPatch: {
      blocked_reason: blockedReason,
      status: "blocked",
    },
  };
}

/**
 * Decide whether a blocked parent may recover after its blocking children change.
 * A manual reason is authoritative and never cleared by automatic recovery.
 *
 * @param {import("../../types/task-block-recovery-contracts.d.ts").ParentRecoveryTransitionInput} input
 * @returns {TaskBlockRecoveryTransition}
 */
export function planParentRecoveryTransition({ parentTask, incompleteBlockingChildCount }) {
  if (normalizedStatus(parentTask.status) !== "blocked") {
    return noTransition("parent_not_blocked");
  }

  if (normalizedCount(incompleteBlockingChildCount) > 0) {
    return noTransition("blocking_children_remain");
  }

  const blockedReason = rawText(parentTask.blocked_reason);
  if (blockedReason && !isAutomaticBlockedReason(blockedReason)) {
    return noTransition("manual_block_preserved");
  }

  return {
    effects: {
      emitTaskUpdated: true,
      pauseRunningTimers: false,
      persistTask: true,
      reindexSearch: true,
    },
    eventMetadata: {
      status_transition_reason: "unblocked_by_child",
    },
    kind: "recover_parent",
    reason: "blocking_children_cleared",
    searchReason: "task.unblocked_by_child",
    taskPatch: {
      blocked_reason: "",
      status: "open",
    },
  };
}

/**
 * Select the parent-rollup side effect for a persisted child status change.
 *
 * @param {TaskLifecycleStatus | null | undefined} previousStatus
 * @param {TaskLifecycleStatus | null | undefined} nextStatus
 * @returns {import("../../types/task-block-recovery-contracts.d.ts").ChildStatusRollupEffect}
 */
export function childStatusRollupEffect(previousStatus, nextStatus) {
  const previous = normalizedStatus(previousStatus);
  const next = normalizedStatus(nextStatus);

  if (previous === next) {
    return "none";
  }

  return isTaskTerminalStatus(next) ? "recover_parents" : "block_parents";
}

/** @param {TaskLifecycleStatus | null | undefined} status */
export function isTaskTerminalStatus(status) {
  return TERMINAL_STATUSES.has(normalizedStatus(status));
}

/** @param {TaskBlockRecoveryRecord | TaskLifecycleStatus | null | undefined} taskOrStatus */
export function isIncompleteTask(taskOrStatus) {
  const status = typeof taskOrStatus === "object" && taskOrStatus !== null
    ? taskOrStatus.status
    : taskOrStatus;
  return !isTaskTerminalStatus(status);
}

/** @param {TaskBlockRecoveryRecord | null | undefined} task */
export function shouldPauseRunningTimersForBlockedTask(task) {
  return normalizedStatus(task?.status) === "blocked";
}

/** @param {unknown} reason */
export function isAutomaticBlockedReason(reason) {
  return rawText(reason).startsWith(AUTO_BLOCKED_REASON_PREFIX);
}

/** @param {unknown[]} childTitles */
export function automaticBlockedReason(childTitles) {
  const label = childTitles
    .map(rawText)
    .filter(Boolean)
    .slice(0, 2)
    .join(", ") || "blocking child task";
  return `${AUTO_BLOCKED_REASON_PREFIX}: ${label}`;
}

/**
 * @param {TaskBlockRecoveryTransition["reason"]} reason
 * @returns {TaskBlockRecoveryTransition}
 */
function noTransition(reason) {
  return {
    effects: NO_EFFECTS,
    eventMetadata: null,
    kind: "none",
    reason,
    searchReason: "",
    taskPatch: null,
  };
}

/** @param {unknown} value */
function normalizedStatus(value) {
  return rawText(value);
}

/** @param {unknown} value */
function rawText(value) {
  return String(value ?? "");
}

/** @param {unknown} value */
function normalizedCount(value) {
  const count = Number(value);
  return Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
}
