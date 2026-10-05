import { describe, expect, it } from "vitest";

import {
  AUTO_BLOCKED_REASON_PREFIX,
  automaticBlockedReason,
  childStatusRollupEffect,
  isAutomaticBlockedReason,
  isIncompleteTask,
  isTaskTerminalStatus,
  planParentBlockTransition,
  planParentRecoveryTransition,
  shouldPauseRunningTimersForBlockedTask,
} from "../../src/modules/tasks/task-block-recovery-engine.js";

describe("Tasks block/recover transition engine", () => {
  it.each([
    ["complete", "open", "block_parents"],
    ["open", "in_progress", "block_parents"],
    ["open", "blocked", "block_parents"],
    ["open", "complete", "recover_parents"],
    ["open", "archived", "recover_parents"],
  ])("routes a child transition from %s to %s through the expected parent effect", (previousStatus, nextStatus, expected) => {
    expect(childStatusRollupEffect(previousStatus, nextStatus)).toBe(expected);
  });

  it("does not schedule parent work when the child status did not change", () => {
    expect(childStatusRollupEffect("blocked", "blocked")).toBe("none");
  });

  it("blocks active parents, preserves an existing manual reason, and requests timer pause", () => {
    const transition = planParentBlockTransition({
      parentTask: {
        blocked_reason: " Waiting for legal approval. ",
        status: "in_progress",
        task_id: "parent-1",
      },
      blockingChild: {
        status: "open",
        task_id: "child-1",
        title: "Confirm contract",
      },
    });

    expect(transition).toMatchObject({
      effects: {
        emitTaskUpdated: true,
        pauseRunningTimers: true,
        persistTask: true,
        reindexSearch: true,
      },
      eventMetadata: {
        blocking_child_task_id: "child-1",
        blocking_child_title: "Confirm contract",
        status_transition_reason: "blocked_by_child",
      },
      kind: "block_parent",
      searchReason: "task.blocked_by_child",
      taskPatch: {
        blocked_reason: " Waiting for legal approval. ",
        status: "blocked",
      },
    });
  });

  it("generates the canonical automatic reason when an active parent has no reason", () => {
    const transition = planParentBlockTransition({
      parentTask: { status: "open", task_id: "parent-2" },
      blockingChild: { status: "in_progress", task_id: "child-2", title: "Ship evidence" },
    });

    expect(transition.taskPatch?.blocked_reason).toBe(`${AUTO_BLOCKED_REASON_PREFIX}: Ship evidence`);
    expect(isAutomaticBlockedReason(transition.taskPatch?.blocked_reason)).toBe(true);
    expect(automaticBlockedReason(["First", "Second", "Third"])).toBe(`${AUTO_BLOCKED_REASON_PREFIX}: First, Second`);
  });

  it.each(["complete", "archived"])("does not auto-block a %s parent", (status) => {
    expect(planParentBlockTransition({
      parentTask: { status, task_id: "terminal-parent" },
      blockingChild: { status: "open", task_id: "child" },
    })).toMatchObject({ kind: "none", reason: "parent_terminal" });
  });

  it("does not auto-block from a completed or archived child", () => {
    expect(planParentBlockTransition({
      parentTask: { status: "open", task_id: "parent" },
      blockingChild: { status: "complete", task_id: "child" },
    })).toMatchObject({ kind: "none", reason: "child_terminal" });
  });

  it("recovers an automatically blocked parent only after every blocker clears", () => {
    const parentTask = {
      blocked_reason: `${AUTO_BLOCKED_REASON_PREFIX}: Prepare evidence`,
      status: "blocked",
      task_id: "parent-3",
    };

    expect(planParentRecoveryTransition({ parentTask, incompleteBlockingChildCount: 1 }))
      .toMatchObject({ kind: "none", reason: "blocking_children_remain" });
    expect(planParentRecoveryTransition({ parentTask, incompleteBlockingChildCount: 0 }))
      .toMatchObject({
        effects: {
          emitTaskUpdated: true,
          pauseRunningTimers: false,
          persistTask: true,
          reindexSearch: true,
        },
        eventMetadata: { status_transition_reason: "unblocked_by_child" },
        kind: "recover_parent",
        searchReason: "task.unblocked_by_child",
        taskPatch: { blocked_reason: "", status: "open" },
      });
  });

  it("preserves a manually blocked parent after blockers clear", () => {
    expect(planParentRecoveryTransition({
      parentTask: {
        blocked_reason: "Waiting for a manual decision.",
        status: "blocked",
        task_id: "parent-4",
      },
      incompleteBlockingChildCount: 0,
    })).toMatchObject({ kind: "none", reason: "manual_block_preserved" });
  });

  it("keeps terminal, incomplete, automatic-reason, and timer-pause classifications explicit", () => {
    expect(isTaskTerminalStatus("complete")).toBe(true);
    expect(isTaskTerminalStatus("archived")).toBe(true);
    expect(isIncompleteTask({ status: "blocked" })).toBe(true);
    expect(isIncompleteTask("complete")).toBe(false);
    expect(isAutomaticBlockedReason("Waiting on someone else")).toBe(false);
    expect(shouldPauseRunningTimersForBlockedTask({ status: "blocked" })).toBe(true);
    expect(shouldPauseRunningTimersForBlockedTask({ status: "in_progress" })).toBe(false);
  });
});
