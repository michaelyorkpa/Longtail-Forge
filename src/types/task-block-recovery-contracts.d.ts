export type TaskLifecycleStatus = "open" | "in_progress" | "blocked" | "complete" | "archived" | string;

export interface TaskBlockRecoveryRecord {
  blocked_reason?: string | null;
  status?: TaskLifecycleStatus | null;
  task_id?: string | null;
  title?: string | null;
}

export interface TaskBlockRecoveryEffects {
  emitTaskUpdated: boolean;
  pauseRunningTimers: boolean;
  persistTask: boolean;
  reindexSearch: boolean;
}

export interface TaskBlockRecoveryEventMetadata {
  blocking_child_task_id?: string;
  blocking_child_title?: string;
  status_transition_reason: "blocked_by_child" | "unblocked_by_child";
}

export interface TaskBlockRecoveryPatch {
  blocked_reason: string;
  status: "blocked" | "open";
}

export interface TaskBlockRecoveryTransition {
  effects: TaskBlockRecoveryEffects;
  eventMetadata: TaskBlockRecoveryEventMetadata | null;
  kind: "block_parent" | "recover_parent" | "none";
  reason:
    | "blocking_child_incomplete"
    | "blocking_children_cleared"
    | "blocking_children_remain"
    | "child_terminal"
    | "manual_block_preserved"
    | "parent_not_blocked"
    | "parent_terminal";
  searchReason: "task.blocked_by_child" | "task.unblocked_by_child" | "";
  taskPatch: TaskBlockRecoveryPatch | null;
}

export interface ParentBlockTransitionInput {
  blockingChild: TaskBlockRecoveryRecord;
  parentTask: TaskBlockRecoveryRecord;
}

export interface ParentRecoveryTransitionInput {
  incompleteBlockingChildCount: number;
  parentTask: TaskBlockRecoveryRecord;
}

export type ChildStatusRollupEffect = "block_parents" | "recover_parents" | "none";
